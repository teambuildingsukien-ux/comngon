import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasStartedWorking } from '@/lib/meal-helpers';
import { getVietnamNow } from '@/lib/utils/date-helpers';
import { getArchivedEmail } from '@/lib/utils/email-helpers';
import { cronLogger, ChildLogger } from '@/lib/logger';

/**
 * POST /api/cron/auto-reset-meals
 * 
 * Cron job: Tạo orders cho NGÀY MAI + unlock nút cho NV.
 * Chạy lúc 13:30 VN (6:30 UTC) — khi ca ăn cuối kết thúc.
 * Có thể gọi thủ công với ?force=true để bỏ qua already_ran check.
 * 
 * Logic ưu tiên:
 * 1️⃣ Calendar (đăng ký lịch) → GIỮ NGUYÊN, không ghi đè
 * 2️⃣ Toggle (NV bấm nút) → GIỮ NGUYÊN, không ghi đè
 * 3️⃣ Auto-create → CHỈ tạo mới nếu CHƯA CÓ order
 * 
 * Edge cases:
 * - Ngày mai không nấu ăn → skip
 * - Cooking exceptions (no_cook/extra_cook) → respect
 * - Opt-in group → default not_eating
 * - Paused/resigned NV → skip
 */
export async function POST(request: NextRequest) {
    try {
        // Allow manual force-run from admin trigger
        const url = new URL(request.url);
        const isForceRun = url.searchParams.get('force') === 'true';
        // Security: Verify Vercel Cron Secret
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // ⚠️ AUDIT-FIX: CRON_SECRET bắt buộc phải được set
        if (!cronSecret) {
            console.error('[Cron/auto-reset] CRON_SECRET not configured — rejecting request for safety');
            return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
        }
        if (authHeader !== `Bearer ${cronSecret}`) {
            console.warn('[Cron/auto-reset] Unauthorized access attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createAdminClient();
        const reqId = ChildLogger.genReqId();
        const log = cronLogger.child({ reqId });
        log.info('Auto-reset cron started', { force: isForceRun });

        // Vietnam timezone
        const now = new Date();
        const vnNow = getVietnamNow(now);

        // Calculate TOMORROW (VN time)
        const vnTomorrow = new Date(vnNow);
        vnTomorrow.setDate(vnTomorrow.getDate() + 1);
        const tomorrowStr = `${vnTomorrow.getFullYear()}-${String(vnTomorrow.getMonth() + 1).padStart(2, '0')}-${String(vnTomorrow.getDate()).padStart(2, '0')}`;
        const tomorrowDayIndex = vnTomorrow.getDay(); // 0=CN, 1=T2, ..., 6=T7

        // Today string for already_ran check
        const todayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-${String(vnNow.getDate()).padStart(2, '0')}`;

        console.log(`📅 Tomorrow: ${tomorrowStr} (day ${tomorrowDayIndex})`);

        // Get all active tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('is_active', true);

        if (tenantsError || !tenants?.length) {
            console.error('Failed to fetch tenants:', tenantsError);
            return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
        }

        const results: Array<{
            tenant: string;
            created: number;
            skipped_existing: number;
            unlocked: number;
            skipped?: boolean;
            reason?: string;
            auto_resigned?: number;
        }> = [];

        for (const tenant of tenants) {
            try {
                // ── Settings ──
                const { data: settings } = await supabase
                    .from('system_settings')
                    .select('key, value')
                    .eq('tenant_id', tenant.id)
                    .in('key', ['auto_reset_enabled', 'auto_reset_last_run']);

                const settingsMap: Record<string, string> = {};
                settings?.forEach((s) => { settingsMap[s.key] = s.value; });

                const isEnabled = settingsMap.auto_reset_enabled === 'true';
                const lastRun = settingsMap.auto_reset_last_run || '';

                if (!isEnabled) {
                    console.log(`❌ [${tenant.name}] Auto-reset disabled`);
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'disabled' });
                    continue;
                }

                // Already ran today? (skip if force-run from admin)
                if (!isForceRun && lastRun.startsWith(todayStr)) {
                    console.log(`✅ [${tenant.name}] Already ran today`);
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'already_ran' });
                    continue;
                }

                // ── Step 0 (v5.4.0): Auto-resign scheduled employees ──
                // ⚠️ AUDIT-FIX: PHẢI chạy TRƯỚC cooking day check!
                // Auto-resign KHÔNG phụ thuộc cooking day — NV nghỉ đúng ngày kể cả cuối tuần
                const { data: scheduledResignees } = await supabase
                    .from('users')
                    .select('id, full_name, email, resigned_date')
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'active')
                    .not('resigned_date', 'is', null)
                    .lte('resigned_date', tomorrowStr);

                let autoResignedCount = 0;
                if (scheduledResignees?.length) {
                    for (const emp of scheduledResignees) {
                        try {
                            // 0.5. Archive email trong Supabase Auth (giải phóng email gốc cho NV mới)
                            const archivedEmail = getArchivedEmail(emp.email);
                            const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
                                emp.id,
                                { email: archivedEmail }
                            );
                            if (authUpdateError) {
                                log.error(`Failed to archive Auth email`, authUpdateError, { employee: emp.full_name, email: emp.email, tenantId: tenant.id });
                                continue; // Skip employee — không đổi status nếu email Auth chưa đổi
                            }
                            log.info('Archived Auth email', { employee: emp.full_name, from: emp.email, to: archivedEmail });

                            // 1. Update status → resigned + sync email lưu trữ vào public DB
                            const { error: resignErr } = await supabase
                                .from('users')
                                .update({
                                    status: 'resigned',
                                    is_active: false,
                                    email: archivedEmail,
                                    status_changed_at: now.toISOString(),
                                    updated_at: now.toISOString(),
                                })
                                .eq('id', emp.id);

                            // ⚠️ BUG-FIX #4: Nếu resign fail → skip các bước sau tránh inconsistent state
                            if (resignErr) {
                                log.error(`Failed to resign employee`, resignErr, { employee: emp.full_name, tenantId: tenant.id });
                                continue;
                            }

                            // 2. Cancel future orders from resigned_date onward
                            const { data: cancelledOrders } = await supabase
                                .from('orders')
                                .update({
                                    status: 'not_eating',
                                    updated_at: now.toISOString()
                                })
                                .eq('user_id', emp.id)
                                .eq('status', 'eating')
                                .gte('date', emp.resigned_date)
                                .select('id');

                            // 3. Remove from group
                            await supabase
                                .from('users')
                                .update({ group_id: null })
                                .eq('id', emp.id);

                            // 4. Deactivate push subscriptions
                            await supabase
                                .from('push_subscriptions')
                                .update({ is_active: false })
                                .eq('user_id', emp.id);

                            // 5. Log auto-resign
                            await supabase.from('activity_logs').insert({
                                tenant_id: tenant.id,
                                action: 'AUTO_RESIGN_SCHEDULED',
                                performed_by: '00000000-0000-0000-0000-000000000000',
                                performer_name: 'System (Cron)',
                                target_type: 'user',
                                target_id: emp.id,
                                details: {
                                    employee_name: emp.full_name,
                                    original_email: emp.email,
                                    archived_email: archivedEmail,
                                    resigned_date: emp.resigned_date,
                                    cancelled_orders: cancelledOrders?.length || 0,
                                    reason: `Scheduled resignation reached (${emp.resigned_date})`,
                                }
                            });

                            autoResignedCount++;
                            log.info('Auto-resigned employee', { employee: emp.full_name, resigned_date: emp.resigned_date, cancelledOrders: cancelledOrders?.length || 0, tenantId: tenant.id });
                        } catch (empErr) {
                            log.error(`Failed to auto-resign employee`, empErr, { employee: emp.full_name, tenantId: tenant.id });
                        }
                    }
                }

                if (autoResignedCount > 0) {
                    console.log(`📋 [${tenant.name}] Auto-resigned ${autoResignedCount} employees`);
                }

                // ── Edge Case #1+2: Cooking Days + Exceptions ──
                // Get cooking days setting — stored as JSON under key 'cooking_days'
                const { data: cookingDaySetting } = await supabase
                    .from('system_settings')
                    .select('value')
                    .eq('tenant_id', tenant.id)
                    .eq('key', 'cooking_days')
                    .single();

                let startDay = 1, endDay = 5; // Default Mon-Fri
                if (cookingDaySetting?.value) {
                    try {
                        const parsed = typeof cookingDaySetting.value === 'string'
                            ? JSON.parse(cookingDaySetting.value)
                            : cookingDaySetting.value;
                        startDay = parsed.start_day ?? 1;
                        endDay = parsed.end_day ?? 5;
                    } catch { /* keep defaults */ }
                }

                // Check if tomorrow is a cooking day
                let isCookingDay = false;
                if (startDay <= endDay) {
                    isCookingDay = tomorrowDayIndex >= startDay && tomorrowDayIndex <= endDay;
                } else {
                    isCookingDay = tomorrowDayIndex >= startDay || tomorrowDayIndex <= endDay;
                }

                // Check cooking exceptions for tomorrow
                const { data: exceptions } = await supabase
                    .from('cooking_exceptions')
                    .select('type')
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr);

                const exception = exceptions?.[0];
                if (exception?.type === 'no_cook') {
                    isCookingDay = false;
                } else if (exception?.type === 'extra_cook') {
                    isCookingDay = true;
                }

                if (!isCookingDay) {
                    console.log(`🚫 [${tenant.name}] Tomorrow ${tomorrowStr} is NOT a cooking day — skip`);
                    // Still update last_run to prevent re-check
                    await updateLastRun(supabase, tenant.id, now);
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'not_cooking_day', auto_resigned: autoResignedCount });
                    continue;
                }

                // ── Step 1: Get active employees (Edge Case #4: exclude paused/resigned + kitchen) ──
                // ⚠️ AUDIT-GUARD: Step 0 resigned NV trước → Step 1 chỉ lấy active còn lại
                const { data: employees } = await supabase
                    .from('users')
                    .select('id, group_id, start_date, resigned_date')
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'active')
                    .not('role', 'ilike', '%kitchen%'); // ⚠️ AUDIT-FIX #9: phải dùng wildcard

                if (!employees?.length) {
                    console.log(`⚠️ [${tenant.name}] No active employees`);
                    await updateLastRun(supabase, tenant.id, now);
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'no_employees' });
                    continue;
                }

                // ── Step 2: Get EXISTING orders for tomorrow ──
                const { data: existingOrders } = await supabase
                    .from('orders')
                    .select('user_id')
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr)
                    .limit(5000);

                const existingUserIds = new Set(existingOrders?.map(o => o.user_id) || []);

                // ── Edge Case #3: Get opt_in groups ──
                const { data: optInGroups } = await supabase
                    .from('groups')
                    .select('id')
                    .eq('tenant_id', tenant.id)
                    .eq('registration_mode', 'opt_in');

                const optInGroupIds = new Set(optInGroups?.map(g => g.id) || []);

                // ── Step 3: Create orders for employees WITHOUT existing orders ──
                // ⚠️ OPT-IN SKIP: opt_in group users tự quản bằng calendar → KHÔNG tạo order
                const newOrders = employees
                    .filter(emp => {
                        if (existingUserIds.has(emp.id)) return false;
                        // Skip opt-in group users — they manage their own schedule
                        if (emp.group_id && optInGroupIds.has(emp.group_id)) return false;
                        // ⚠️ START_DATE: NV chưa bắt đầu làm → không tạo order
                        if (!hasStartedWorking(emp, tomorrowStr)) return false;
                        // ✅ v6.1.2 SAFETY NET: Nếu Step 0 fail, không tạo order cho NV sắp nghỉ
                        if (emp.resigned_date && emp.resigned_date <= tomorrowStr) return false;
                        return true;
                    })
                    .map(emp => ({
                        tenant_id: tenant.id,
                        user_id: emp.id,
                        date: tomorrowStr,
                        status: 'eating' as const,
                        locked: false,
                        created_at: now.toISOString(),
                        updated_at: now.toISOString(),
                        source: 'cron_reset',
                    }));

                let createdCount = 0;
                if (newOrders.length > 0) {
                    // Batch upsert in chunks of 50
                    // ⚠️ AUDIT-FIX: Use upsert + ignoreDuplicates to prevent race condition
                    // If NV toggles at the same time as cron, duplicate is silently skipped
                    for (let i = 0; i < newOrders.length; i += 50) {
                        const chunk = newOrders.slice(i, i + 50);
                        const { data: inserted, error: insertError } = await supabase
                            .from('orders')
                            .upsert(chunk, {
                                onConflict: 'tenant_id,user_id,date',
                                ignoreDuplicates: true, // Skip if already exists, DO NOT overwrite
                            })
                            .select();

                        if (insertError) {
                            console.error(`❌ [${tenant.name}] Upsert error (chunk ${i}):`, insertError);
                        } else {
                            createdCount += inserted?.length || 0;
                        }
                    }
                }

                // ── Step 4: Unlock ALL orders for tomorrow ──
                const { data: unlocked } = await supabase
                    .from('orders')
                    .update({ locked: false, updated_at: now.toISOString() })
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr)
                    .eq('locked', true)
                    .select();

                const unlockedCount = unlocked?.length || 0;

                // ── Step 5: Update last_run ──
                await updateLastRun(supabase, tenant.id, now);

                const skippedExisting = existingUserIds.size;
                console.log(`✅ [${tenant.name}] Created ${createdCount} | Existing ${skippedExisting} (kept) | Unlocked ${unlockedCount}`);

                // ✅ v6.0.0: Log per-user khi cron tạo orders
                if (createdCount > 0) {
                    // ⚠️ BUG-FIX #2: newOrders đã filter sẵn, không cần filter lại
                    const perUserLogs = newOrders.map(o => ({
                        tenant_id: tenant.id,
                        action: 'system_cron_create_order',
                        performed_by: '00000000-0000-0000-0000-000000000000',
                        performer_name: 'System (Cron)',
                        target_type: 'order',
                        target_id: o.user_id,
                        details: {
                            date: tomorrowStr,
                            status: 'eating',
                            source: 'cron_auto_reset',
                        }
                    }));

                    // Batch insert in chunks of 50
                    for (let i = 0; i < perUserLogs.length; i += 50) {
                        await supabase.from('activity_logs').insert(perUserLogs.slice(i, i + 50));
                    }
                }

                // Log cron summary per tenant (giữ lại cho backward compatibility)
                await supabase.from('activity_logs').insert({
                    tenant_id: tenant.id,
                    action: 'cron_auto_reset',
                    performed_by: '00000000-0000-0000-0000-000000000000',
                    performer_name: 'System (Cron)',
                    target_type: 'orders',
                    details: {
                        date: tomorrowStr,
                        created: createdCount,
                        skipped_existing: skippedExisting,
                        unlocked: unlockedCount,
                        auto_resigned: autoResignedCount,
                        source: isForceRun ? 'admin_trigger' : 'cron_scheduled'
                    }
                });

                results.push({
                    tenant: tenant.name,
                    created: createdCount,
                    skipped_existing: skippedExisting,
                    unlocked: unlockedCount,
                    auto_resigned: autoResignedCount,
                });

            } catch (err) {
                console.error(`❌ [${tenant.name}] Error:`, err);
                results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'exception' });
            }
        }

        console.log('🎉 Auto-reset completed for all tenants');

        return NextResponse.json({
            success: true,
            message: 'Auto-reset completed',
            data: {
                tenants_processed: tenants.length,
                tomorrow: tomorrowStr,
                results,
                executed_at: now.toISOString(),
            },
        });

    } catch (error) {
        console.error('Error in auto-reset cron:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Helper: update last_run timestamp
async function updateLastRun(supabase: any, tenantId: string, now: Date) {
    await supabase
        .from('system_settings')
        .upsert({
            key: 'auto_reset_last_run',
            tenant_id: tenantId,
            value: now.toISOString(),
            updated_at: now.toISOString(),
        }, { onConflict: 'key,tenant_id' });
}

// Vercel Cron Jobs gọi GET → proxy sang POST handler
export async function GET(request: NextRequest) {
    return POST(request);
}
