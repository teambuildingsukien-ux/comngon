import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVietnamNow } from '@/lib/utils/date-helpers';
import { hasStartedWorking } from '@/lib/meal-helpers';

/**
 * POST /api/admin/trigger-reset
 * Admin manually triggers the auto-reset cron logic.
 * Runs the cron logic INLINE (not via HTTP fetch) to avoid serverless self-call issues.
 */
export async function POST() {
    try {
        // Auth check — only admin/manager
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile || !['admin', 'manager', 'hr'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden — Admin/Manager only' }, { status: 403 });
        }

        // ⚠️ AUDIT-FIX: Run cron logic INLINE instead of HTTP self-call
        // Serverless functions calling themselves via fetch is unreliable on Vercel
        const adminSupabase = createAdminClient();
        const now = new Date();
        const vnNow = getVietnamNow(now);

        // Calculate TOMORROW (VN time)
        const vnTomorrow = new Date(vnNow);
        vnTomorrow.setDate(vnTomorrow.getDate() + 1);
        const tomorrowStr = `${vnTomorrow.getFullYear()}-${String(vnTomorrow.getMonth() + 1).padStart(2, '0')}-${String(vnTomorrow.getDate()).padStart(2, '0')}`;
        const tomorrowDayIndex = vnTomorrow.getDay();

        console.log(`🔧 Manual trigger by admin ${user.email} — Tomorrow: ${tomorrowStr}`);

        // Get all active tenants
        const { data: tenants, error: tenantsError } = await adminSupabase
            .from('tenants')
            .select('id, name')
            .eq('is_active', true);

        if (tenantsError || !tenants?.length) {
            return NextResponse.json({ error: 'No active tenants found' }, { status: 500 });
        }

        const results: Array<{
            tenant: string;
            created: number;
            skipped_existing: number;
            unlocked: number;
            skipped?: boolean;
            reason?: string;
        }> = [];

        for (const tenant of tenants) {
            try {
                // Settings
                const { data: settings } = await adminSupabase
                    .from('system_settings')
                    .select('key, value')
                    .eq('tenant_id', tenant.id)
                    .in('key', ['auto_reset_enabled']);

                const settingsMap: Record<string, string> = {};
                settings?.forEach((s) => { settingsMap[s.key] = s.value; });

                if (settingsMap.auto_reset_enabled !== 'true') {
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'disabled' });
                    continue;
                }

                // ── Step 0 (v6.1.2): Auto-resign scheduled employees ──
                // ⚠️ PHẢI chạy TRƯỚC cooking day check — NV nghỉ đúng ngày kể cả cuối tuần
                const { data: scheduledResignees } = await adminSupabase
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
                            await adminSupabase.from('users').update({
                                status: 'resigned', is_active: false,
                                status_changed_at: now.toISOString(), updated_at: now.toISOString(),
                            }).eq('id', emp.id);

                            const { data: cancelledOrders } = await adminSupabase
                                .from('orders')
                                .update({ status: 'not_eating', updated_at: now.toISOString(), source: 'admin_status_change' })
                                .eq('user_id', emp.id).eq('status', 'eating')
                                .gte('date', emp.resigned_date).select('id');

                            await adminSupabase.from('users').update({ group_id: null }).eq('id', emp.id);
                            await adminSupabase.from('push_subscriptions').update({ is_active: false }).eq('user_id', emp.id);

                            await adminSupabase.from('activity_logs').insert({
                                tenant_id: tenant.id,
                                action: 'AUTO_RESIGN_SCHEDULED',
                                performed_by: '00000000-0000-0000-0000-000000000000',
                                performer_name: 'System (Admin Trigger)',
                                target_type: 'user', target_id: emp.id,
                                details: {
                                    employee_name: emp.full_name, employee_email: emp.email,
                                    resigned_date: emp.resigned_date,
                                    cancelled_orders: cancelledOrders?.length || 0,
                                    reason: `Scheduled resignation reached (${emp.resigned_date})`,
                                }
                            });
                            autoResignedCount++;
                            console.log(`🔴 [trigger-reset] Auto-resigned: ${emp.full_name} (${emp.resigned_date})`);
                        } catch (empErr) {
                            console.error(`❌ [trigger-reset] Failed to auto-resign ${emp.full_name}:`, empErr);
                        }
                    }
                }

                // Cooking days check
                const { data: cookingDaySetting } = await adminSupabase
                    .from('system_settings')
                    .select('value')
                    .eq('tenant_id', tenant.id)
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
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr);

                const exception = exceptions?.[0];
                if (exception?.type === 'no_cook') isCookingDay = false;
                else if (exception?.type === 'extra_cook') isCookingDay = true;

                if (!isCookingDay) {
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'not_cooking_day' });
                    continue;
                }

                // Get active employees (exclude paused/resigned + kitchen)
                const { data: employees } = await adminSupabase
                    .from('users')
                    .select('id, group_id, start_date, resigned_date')
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'active')
                    .not('role', 'ilike', 'kitchen');

                if (!employees?.length) {
                    results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'no_employees' });
                    continue;
                }

                // Existing orders for tomorrow
                const { data: existingOrders } = await adminSupabase
                    .from('orders')
                    .select('user_id')
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr)
                    .limit(5000);

                const existingUserIds = new Set(existingOrders?.map(o => o.user_id) || []);

                // Opt-in groups
                const { data: optInGroups } = await adminSupabase
                    .from('groups')
                    .select('id')
                    .eq('tenant_id', tenant.id)
                    .eq('registration_mode', 'opt_in');

                const optInGroupIds = new Set(optInGroups?.map(g => g.id) || []);

                // Create orders for employees WITHOUT existing orders
                // ⚠️ OPT-IN SKIP: opt_in group users tự quản → KHÔNG tạo order
                const newOrders = employees
                    .filter(emp => {
                        if (existingUserIds.has(emp.id)) return false;
                        // Skip opt-in group users
                        if (emp.group_id && optInGroupIds.has(emp.group_id)) return false;
                        // ⚠️ START_DATE: NV chưa bắt đầu làm → không tạo order
                        if (!hasStartedWorking(emp, tomorrowStr)) return false;
                        // ✅ v6.1.2: NV có resigned_date <= ngày mai → không tạo order
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
                        source: 'admin_trigger_reset',
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
                            console.error(`❌ [${tenant.name}] Upsert error:`, insertError);
                        } else {
                            createdCount += inserted?.length || 0;
                        }
                    }
                }

                // Unlock ALL orders for tomorrow
                const { data: unlocked } = await adminSupabase
                    .from('orders')
                    .update({ locked: false, updated_at: now.toISOString() })
                    .eq('tenant_id', tenant.id)
                    .eq('date', tomorrowStr)
                    .eq('locked', true)
                    .select();

                const unlockedCount = unlocked?.length || 0;

                // Update last_run
                await adminSupabase
                    .from('system_settings')
                    .upsert({
                        key: 'auto_reset_last_run',
                        tenant_id: tenant.id,
                        value: now.toISOString(),
                        updated_at: now.toISOString(),
                    }, { onConflict: 'key,tenant_id' });

                results.push({
                    tenant: tenant.name,
                    created: createdCount,
                    skipped_existing: existingUserIds.size,
                    unlocked: unlockedCount,
                });

            } catch (err) {
                console.error(`❌ [${tenant.name}] Error:`, err);
                results.push({ tenant: tenant.name, created: 0, skipped_existing: 0, unlocked: 0, skipped: true, reason: 'exception' });
            }
        }

        // Log admin trigger action
        if (profile?.tenant_id) {
            await adminSupabase.from('activity_logs').insert({
                tenant_id: profile.tenant_id,
                action: 'admin_manual_reset',
                performed_by: user.id,
                performer_name: user.email,
                target_type: 'orders',
                details: {
                    date: tomorrowStr,
                    tenants_processed: tenants.length,
                    results_summary: results.map(r => ({ tenant: r.tenant, created: r.created, skipped: r.skipped }))
                }
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Manual reset triggered successfully',
            data: {
                tenants_processed: tenants.length,
                tomorrow: tomorrowStr,
                results,
                triggered_by: user.email,
                executed_at: now.toISOString(),
            },
        });
    } catch (error) {
        console.error('Error in manual trigger-reset:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
