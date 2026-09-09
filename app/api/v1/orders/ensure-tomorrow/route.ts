import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVietnamDateString, getVietnamNow, VN_OFFSET } from '@/lib/utils/date-helpers';
import { hasStartedWorking } from '@/lib/meal-helpers';

/**
 * POST /api/v1/orders/ensure-tomorrow
 * ⚠️ AUDIT-GUARD: Lazy cron — bất kỳ NV nào gọi được.
 * Khi dashboard detect quá giờ reset → fire-and-forget gọi endpoint này.
 * Nếu orders ngày mai chưa được tạo → tạo bulk cho toàn bộ tenant.
 * Race condition safe: upsert + ignoreDuplicates + check last_run.
 */
export async function POST() {
    try {
        const supabase = await createClient();

        // Auth: bất kỳ user nào đăng nhập
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('id, tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'No tenant' }, { status: 403 });
        }

        const tenantId = profile.tenant_id;
        const adminSupabase = createAdminClient();

        // ── Step 1: Check auto_reset settings ──
        const { data: settings } = await adminSupabase
            .from('system_settings')
            .select('key, value')
            .eq('tenant_id', tenantId)
            .in('key', ['auto_reset_enabled', 'auto_reset_time', 'auto_reset_last_run']);

        const settingsMap: Record<string, string> = {};
        settings?.forEach(s => { settingsMap[s.key] = s.value; });

        if (settingsMap.auto_reset_enabled !== 'true') {
            return NextResponse.json({ skipped: true, reason: 'disabled' });
        }

        // ── Step 2: Check if already ran today ──
        const now = new Date();
        // ⚠️ AUDIT-GUARD: PHẢI dùng getVietnamDateString — Vercel server là UTC!
        const todayStr = getVietnamDateString(now);
        const lastRun = settingsMap.auto_reset_last_run || '';

        if (lastRun.startsWith(todayStr)) {
            return NextResponse.json({ skipped: true, reason: 'already_ran_today' });
        }

        // ── Step 3: Check if past reset time (VN) ──
        const resetTime = settingsMap.auto_reset_time || '13:30';
        const resetDateTime = new Date(todayStr + 'T' + resetTime + ':00' + VN_OFFSET);

        if (now.getTime() < resetDateTime.getTime()) {
            return NextResponse.json({ skipped: true, reason: 'not_yet_reset_time' });
        }

        // ── Step 4: Lock — Update last_run FIRST to prevent race condition ──
        await adminSupabase
            .from('system_settings')
            .upsert({
                key: 'auto_reset_last_run',
                tenant_id: tenantId,
                value: now.toISOString(),
                updated_at: now.toISOString(),
            }, { onConflict: 'key,tenant_id' });

        // ── Step 5: Calculate tomorrow ──
        const vnNow = getVietnamNow(now);
        const vnTomorrow = new Date(vnNow);
        vnTomorrow.setDate(vnTomorrow.getDate() + 1);
        const tomorrowStr = `${vnTomorrow.getFullYear()}-${String(vnTomorrow.getMonth() + 1).padStart(2, '0')}-${String(vnTomorrow.getDate()).padStart(2, '0')}`;
        const tomorrowDayIndex = vnTomorrow.getDay();

        // ── Step 5.5 (v6.1.2): Auto-resign scheduled employees ──
        // ⚠️ CRITICAL: ensure-tomorrow là cron CHÍNH (UI trigger)
        // Auto-resign PHẢI chạy ở đây, KHÔNG phụ thuộc Vercel cron
        const { data: scheduledResignees } = await adminSupabase
            .from('users')
            .select('id, full_name, email, resigned_date')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .not('resigned_date', 'is', null)
            .lte('resigned_date', tomorrowStr);

        let autoResignedCount = 0;
        if (scheduledResignees?.length) {
            for (const emp of scheduledResignees) {
                try {
                    // 1. Update status → resigned
                    await adminSupabase
                        .from('users')
                        .update({
                            status: 'resigned',
                            is_active: false,
                            status_changed_at: now.toISOString(),
                            updated_at: now.toISOString(),
                        })
                        .eq('id', emp.id);

                    // 2. Cancel eating orders from resigned_date onward
                    const { data: cancelledOrders } = await adminSupabase
                        .from('orders')
                        .update({
                            status: 'not_eating',
                            updated_at: now.toISOString(),
                            source: 'admin_status_change',
                        })
                        .eq('user_id', emp.id)
                        .eq('status', 'eating')
                        .gte('date', emp.resigned_date)
                        .select('id');

                    // 3. Remove from group
                    await adminSupabase
                        .from('users')
                        .update({ group_id: null })
                        .eq('id', emp.id);

                    // 4. Deactivate push subscriptions
                    await adminSupabase
                        .from('push_subscriptions')
                        .update({ is_active: false })
                        .eq('user_id', emp.id);

                    // 5. Log
                    await adminSupabase.from('activity_logs').insert({
                        tenant_id: tenantId,
                        action: 'AUTO_RESIGN_SCHEDULED',
                        performed_by: '00000000-0000-0000-0000-000000000000',
                        performer_name: 'System (Lazy Cron)',
                        target_type: 'user',
                        target_id: emp.id,
                        details: {
                            employee_name: emp.full_name,
                            employee_email: emp.email,
                            resigned_date: emp.resigned_date,
                            cancelled_orders: cancelledOrders?.length || 0,
                            reason: `Scheduled resignation reached (${emp.resigned_date})`,
                        }
                    });

                    autoResignedCount++;
                    console.log(`🔴 [ensure-tomorrow] Auto-resigned: ${emp.full_name} (${emp.resigned_date})`);
                } catch (empErr) {
                    console.error(`❌ [ensure-tomorrow] Failed to auto-resign ${emp.full_name}:`, empErr);
                }
            }
        }

        // ── Step 6: Check cooking days ──
        const { data: cookingDaySetting } = await adminSupabase
            .from('system_settings')
            .select('value')
            .eq('tenant_id', tenantId)
            .eq('key', 'cooking_days')
            .single();

        let startDay = 1, endDay = 5;
        if (cookingDaySetting?.value) {
            try {
                const parsed = typeof cookingDaySetting.value === 'string'
                    ? JSON.parse(cookingDaySetting.value)
                    : cookingDaySetting.value;
                startDay = parsed.start_day ?? 1;
                endDay = parsed.end_day ?? 5;
            } catch { /* keep defaults */ }
        }

        let isCookingDay = false;
        if (startDay <= endDay) {
            isCookingDay = tomorrowDayIndex >= startDay && tomorrowDayIndex <= endDay;
        } else {
            isCookingDay = tomorrowDayIndex >= startDay || tomorrowDayIndex <= endDay;
        }

        // Cooking exceptions
        const { data: exceptions } = await adminSupabase
            .from('cooking_exceptions')
            .select('type')
            .eq('tenant_id', tenantId)
            .eq('date', tomorrowStr);

        const exception = exceptions?.[0];
        if (exception?.type === 'no_cook') isCookingDay = false;
        else if (exception?.type === 'extra_cook') isCookingDay = true;

        if (!isCookingDay) {
            return NextResponse.json({ skipped: true, reason: 'not_cooking_day', tomorrow: tomorrowStr });
        }

        // ── Step 7: Get active employees ──
        const { data: employees } = await adminSupabase
            .from('users')
            .select('id, group_id, start_date, resigned_date')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .not('role', 'ilike', 'kitchen');

        if (!employees?.length) {
            return NextResponse.json({ skipped: true, reason: 'no_employees' });
        }

        // Existing orders for tomorrow
        const { data: existingOrders } = await adminSupabase
            .from('orders')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .eq('date', tomorrowStr)
            .limit(5000);

        const existingUserIds = new Set(existingOrders?.map(o => o.user_id) || []);

        // Opt-in groups (skip — they self-manage)
        const { data: optInGroups } = await adminSupabase
            .from('groups')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('registration_mode', 'opt_in');

        const optInGroupIds = new Set(optInGroups?.map(g => g.id) || []);

        // ── Step 8: Create orders ──
        const newOrders = employees
            .filter(emp => {
                if (existingUserIds.has(emp.id)) return false;
                if (emp.group_id && optInGroupIds.has(emp.group_id)) return false;
                // ⚠️ START_DATE: NV chưa bắt đầu làm → không tạo order
                if (!hasStartedWorking(emp, tomorrowStr)) return false;
                // ✅ v6.1.2: NV có resigned_date <= ngày mai → không tạo order
                if (emp.resigned_date && emp.resigned_date <= tomorrowStr) return false;
                return true;
            })
            .map(emp => ({
                tenant_id: tenantId,
                user_id: emp.id,
                date: tomorrowStr,
                status: 'eating' as const,
                locked: false,
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
                source: 'ensure_tomorrow',
            }));

        let createdCount = 0;
        if (newOrders.length > 0) {
            for (let i = 0; i < newOrders.length; i += 50) {
                const chunk = newOrders.slice(i, i + 50);
                const { data: inserted, error: insertError } = await adminSupabase
                    .from('orders')
                    .upsert(chunk, {
                        onConflict: 'tenant_id,user_id,date',
                        ignoreDuplicates: true,
                    })
                    .select();

                if (insertError) {
                    console.error(`❌ [ensure-tomorrow] Upsert error:`, insertError);
                } else {
                    createdCount += inserted?.length || 0;
                }
            }
        }

        // ── Step 9: Unlock orders for tomorrow ──
        const { data: unlocked } = await adminSupabase
            .from('orders')
            .update({ locked: false, updated_at: now.toISOString() })
            .eq('tenant_id', tenantId)
            .eq('date', tomorrowStr)
            .eq('locked', true)
            .select();

        const unlockedCount = unlocked?.length || 0;

        // ── Step 10: Log activity ──
        // ✅ v6.0.0: Per-user logs
        if (createdCount > 0) {
            const perUserLogs = newOrders
                .filter(o => !existingUserIds.has(o.user_id))
                .map(o => ({
                    tenant_id: tenantId,
                    action: 'system_cron_create_order',
                    performed_by: '00000000-0000-0000-0000-000000000000',
                    performer_name: 'System (Lazy Cron)',
                    target_type: 'order',
                    target_id: o.user_id,
                    details: {
                        date: tomorrowStr,
                        status: 'eating',
                        source: 'ensure_tomorrow',
                    }
                }));

            for (let i = 0; i < perUserLogs.length; i += 50) {
                await adminSupabase.from('activity_logs').insert(perUserLogs.slice(i, i + 50));
            }
        }

        // Summary log (backward compatibility)
        await adminSupabase.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'cron_auto_reset',
            performed_by: '00000000-0000-0000-0000-000000000000',
            performer_name: 'System (Lazy Cron)',
            target_type: 'orders',
            details: {
                date: tomorrowStr,
                created: createdCount,
                skipped_existing: existingUserIds.size,
                unlocked: unlockedCount,
                source: 'lazy_cron',
                triggered_by: user.id,
            }
        });

        console.log(`✅ [ensure-tomorrow] Created ${createdCount} | Existing ${existingUserIds.size} | Unlocked ${unlockedCount}`);

        return NextResponse.json({
            success: true,
            created: createdCount,
            skipped_existing: existingUserIds.size,
            unlocked: unlockedCount,
            tomorrow: tomorrowStr,
        });

    } catch (error) {
        console.error('[ensure-tomorrow] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
