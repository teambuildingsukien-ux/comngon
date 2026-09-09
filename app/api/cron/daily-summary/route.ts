import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';

/**
 * POST /api/cron/daily-summary
 * 
 * Cron job: Snapshot thống kê suất ăn hàng ngày vào bảng daily_summaries.
 * Chạy cuối ngày 23:30 VN (16:30 UTC).
 * Hỗ trợ:
 *   ?date=2026-03-08 → snapshot ngày cụ thể
 *   ?backfill=true&from=2026-01-01&to=2026-03-08 → backfill range
 * 
 * Auth: CRON_SECRET header (Vercel cron) HOẶC admin session (browser call)
 * Ghi cho TẤT CẢ tenants. Cả ngày nấu và không nấu đều ghi.
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    try {
        // Auth: CRON_SECRET hoặc admin session
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        let isAuthorized = false;

        // Check 1: CRON_SECRET (Vercel cron)
        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
            isAuthorized = true;
        }

        // Check 2: Admin session (browser call)
        if (!isAuthorized) {
            try {
                const userSupabase = await createClient();
                const { data: { user } } = await userSupabase.auth.getUser();
                if (user) {
                    const { data: profile } = await userSupabase
                        .from('users')
                        .select('role')
                        .eq('id', user.id)
                        .single();
                    if (profile && ['admin', 'manager'].includes(profile.role?.toLowerCase())) {
                        isAuthorized = true;
                    }
                }
            } catch { /* not logged in */ }
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createAdminClient();
        const url = new URL(request.url);
        const isBackfill = url.searchParams.get('backfill') === 'true';

        // Determine dates to process
        let datesToProcess: string[] = [];

        if (isBackfill) {
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (!from || !to) {
                return NextResponse.json({ error: 'backfill requires from and to params' }, { status: 400 });
            }
            const startDate = new Date(from);
            const endDate = new Date(to);

            // ⚠️ AUDIT-FIX S1-B: Giới hạn backfill tối đa 90 ngày để tránh timeout
            const MAX_BACKFILL_DAYS = 90;
            const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > MAX_BACKFILL_DAYS) {
                return NextResponse.json({
                    error: `Backfill tối đa ${MAX_BACKFILL_DAYS} ngày mỗi lần. Yêu cầu của bạn là ${diffDays} ngày. Hãy chia nhỏ thành nhiều lần.`,
                    hint: `Ví dụ: backfill từng tháng một`,
                }, { status: 400 });
            }
            if (diffDays > 30) {
                console.warn(`⚠️ [daily-summary] Large backfill request: ${diffDays} days (${from} → ${to}). Consider splitting.`);
            }

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                datesToProcess.push(d.toISOString().split('T')[0]);
            }
            console.log(`📊 Daily summary BACKFILL: ${datesToProcess.length} days (${from} → ${to})`);

        } else {
            // Single date — default today (VN timezone)
            const dateParam = url.searchParams.get('date');
            if (dateParam) {
                datesToProcess = [dateParam];
            } else {
                // Today in VN timezone
                const now = new Date();
                const vnStr = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
                const vnDate = new Date(vnStr);
                const today = vnDate.toISOString().split('T')[0];
                datesToProcess = [today];
            }
            console.log(`📊 Daily summary for: ${datesToProcess[0]}`);
        }

        // Get all tenants
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id')
            .eq('is_active', true);

        if (!tenants || tenants.length === 0) {
            return NextResponse.json({ message: 'No active tenants' }, { status: 200 });
        }

        let totalInserted = 0;
        let totalErrors = 0;
        const results: { tenant_id: string; dates_processed: number; errors: string[] }[] = [];

        for (const tenant of tenants) {
            const tenantErrors: string[] = [];
            let datesProcessed = 0;

            // Get cooking days setting for this tenant
            const { data: settingsRow } = await supabase
                .from('system_settings')
                .select('value')
                .eq('tenant_id', tenant.id)
                .eq('key', 'cooking_days')
                .maybeSingle();

            let cookingDays = { start_day: 1, end_day: 5 }; // Default Mon-Fri
            if (settingsRow?.value) {
                try {
                    const parsed = typeof settingsRow.value === 'string'
                        ? JSON.parse(settingsRow.value)
                        : settingsRow.value;
                    if (parsed.start_day !== undefined) cookingDays = parsed;
                } catch { /* use default */ }
            }

            // Get ALL cooking exceptions for this tenant in date range
            const minDate = datesToProcess[0];
            const maxDate = datesToProcess[datesToProcess.length - 1];
            const { data: exceptions } = await supabase
                .from('cooking_exceptions')
                .select('date, type')
                .eq('tenant_id', tenant.id)
                .gte('date', minDate)
                .lte('date', maxDate);

            const exceptionMap = new Map<string, string>();
            exceptions?.forEach(e => exceptionMap.set(e.date, e.type));

            // Get all users for this tenant (snapshot at time of query)
            // ⚠️ SCALABILITY-FIX: 3K+ NV per tenant
            const allUsers = await fetchAll<any>((from, to) =>
                supabase
                    .from('users')
                    .select('id, status, role, start_date')
                    .eq('tenant_id', tenant.id)
                    .not('role', 'ilike', 'kitchen')
                    .range(from, to)
            );

            const activeUsers = allUsers.filter(u => u.status === 'active') || [];
            const pausedCount = allUsers.filter(u => u.status === 'paused').length || 0;
            const resignedCount = allUsers.filter(u => u.status === 'resigned').length || 0;
            const activeIds = activeUsers.map(u => u.id);

            // Batch fetch orders for all dates
            // ⚠️ SCALABILITY-FIX: Backfill 30 days × 3K NV = 66K+ rows
            const allOrders = await fetchAll<{ date: string; user_id: string; status: string }>((from, to) =>
                supabase
                    .from('orders')
                    .select('date, user_id, status')
                    .in('user_id', activeIds.length > 0 ? activeIds : ['__none__'])
                    .gte('date', minDate)
                    .lte('date', maxDate)
                    .range(from, to)
            );

            // Batch fetch guest meals
            const { data: allGuestMeals } = await supabase
                .from('guest_meals')
                .select('date, quantity')
                .eq('tenant_id', tenant.id)
                .gte('date', minDate)
                .lte('date', maxDate);

            // Build lookup maps
            const ordersByDate = new Map<string, Map<string, string>>();
            allOrders.forEach(o => {
                if (!ordersByDate.has(o.date)) ordersByDate.set(o.date, new Map());
                ordersByDate.get(o.date)!.set(o.user_id, o.status);
            });

            const guestByDate = new Map<string, number>();
            allGuestMeals?.forEach(g => {
                guestByDate.set(g.date, (guestByDate.get(g.date) || 0) + g.quantity);
            });

            // Process each date
            const upsertRows = [];

            for (const dateStr of datesToProcess) {
                try {
                    const d = new Date(dateStr + 'T00:00:00');
                    const dayIndex = d.getDay(); // 0=Sun, 1=Mon, ...

                    // Check cooking day
                    let isCooking = false;
                    if (cookingDays.start_day <= cookingDays.end_day) {
                        isCooking = dayIndex >= cookingDays.start_day && dayIndex <= cookingDays.end_day;
                    } else {
                        isCooking = dayIndex >= cookingDays.start_day || dayIndex <= cookingDays.end_day;
                    }

                    // Check exceptions
                    const exception = exceptionMap.get(dateStr);
                    if (exception === 'no_cook') isCooking = false;
                    else if (exception === 'extra_cook') isCooking = true;

                    // Calculate stats
                    // ⚠️ BUG-FIX: Chỉ tính NV đã bắt đầu làm vào ngày này (respect start_date)
                    const eligibleUsers = activeUsers.filter(u => !u.start_date || u.start_date <= dateStr);
                    const totalEmployees = eligibleUsers.length;
                    const eligibleIds = new Set(eligibleUsers.map(u => u.id));
                    let eatingCount = 0;
                    let notEatingCount = 0;
                    const guestMeals = guestByDate.get(dateStr) || 0;

                    if (isCooking) {
                        const dateOrders = ordersByDate.get(dateStr) || new Map();
                        notEatingCount = 0;
                        for (const [userId, status] of dateOrders) {
                            // ⚠️ BUG-FIX: Chỉ đếm order của NV đủ điều kiện
                            if (!eligibleIds.has(userId)) continue;
                            if (status === 'not_eating') notEatingCount++;
                        }
                        eatingCount = totalEmployees - notEatingCount;
                        // Safety: không bao giờ âm
                        if (eatingCount < 0) eatingCount = 0;
                    }
                    // If not cooking: eating=0, notEating=0

                    const totalMeals = eatingCount + guestMeals;
                    const cancelRate = totalEmployees > 0 && isCooking
                        ? parseFloat(((notEatingCount / totalEmployees) * 100).toFixed(2))
                        : 0;

                    upsertRows.push({
                        tenant_id: tenant.id,
                        date: dateStr,
                        is_cooking_day: isCooking,
                        total_employees: totalEmployees,
                        eating_count: eatingCount,
                        not_eating_count: notEatingCount,
                        guest_meals: guestMeals,
                        total_meals: totalMeals,
                        cancel_rate: cancelRate,
                        paused_count: pausedCount,
                        resigned_count: resignedCount,
                    });

                    datesProcessed++;
                } catch (err: any) {
                    tenantErrors.push(`${dateStr}: ${err.message}`);
                }
            }

            // Batch upsert (chunk by 100)
            for (let i = 0; i < upsertRows.length; i += 100) {
                const chunk = upsertRows.slice(i, i + 100);
                const { error } = await supabase
                    .from('daily_summaries')
                    .upsert(chunk, { onConflict: 'tenant_id,date' });

                if (error) {
                    tenantErrors.push(`Upsert error chunk ${i}: ${error.message}`);
                    totalErrors++;
                } else {
                    totalInserted += chunk.length;
                }
            }

            results.push({
                tenant_id: tenant.id,
                dates_processed: datesProcessed,
                errors: tenantErrors,
            });
        }

        console.log(`📊 Daily summary complete: ${totalInserted} rows, ${totalErrors} errors`);

        // Ghi log cron execution vào activity_logs
        await supabase.from('activity_logs').insert({
            tenant_id: tenants[0]?.id || null,
            action: 'cron_daily_summary',
            performed_by: '00000000-0000-0000-0000-000000000000',
            performer_name: 'System (Cron)',
            target_type: 'system',
            details: {
                tenants_processed: tenants.length,
                total_inserted: totalInserted,
                total_errors: totalErrors,
                duration_ms: Date.now() - startTime,
                is_backfill: isBackfill,
            }
        });

        return NextResponse.json({
            success: true,
            total_inserted: totalInserted,
            total_errors: totalErrors,
            tenants_processed: tenants.length,
            results,
        });
    } catch (error: any) {
        console.error('❌ Daily summary cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Vercel Cron Jobs gọi GET → proxy sang POST handler
export async function GET(request: NextRequest) {
    return POST(request);
}
