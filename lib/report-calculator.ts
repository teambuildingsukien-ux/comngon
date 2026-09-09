/**
 * 📊 Report Calculator — SINGLE SOURCE OF TRUTH
 *
 * Hàm tính toán báo cáo tháng dùng chung cho Admin Sheet 1 + Kitchen Report.
 * Logic trích xuất từ Admin export (source of truth v5.8.0 → v6.1.6).
 *
 * ⚠️ AUDIT-GUARD: Sửa logic ở đây = sửa TOÀN BỘ báo cáo Admin + Kitchen.
 * Không hardcode logic đếm riêng ở bất kỳ file nào khác.
 *
 * Dependencies:
 * - lib/export-helpers.ts (parseCookingDays, createCookingDayChecker)
 * - lib/meal-helpers.ts (getDefaultMealStatus)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCookingDays, createCookingDayChecker } from './export-helpers';
import { getDefaultMealStatus } from './meal-helpers';

// ── Types ──────────────────────────────────────

export interface DayStats {
    date: string;
    /** Là ngày nấu ăn */
    isCooking: boolean;
    /** Tổng NV (bao gồm mọi status + kitchen) */
    totalOnDay: number;
    /** NV tính xuất ăn (eligible = total - resigned - paused - upcoming - kitchen) */
    eligible: number;
    /** NV đã nghỉ việc tại ngày này */
    resigned: number;
    /** NV tạm dừng tại ngày này */
    paused: number;
    /** NV sắp đi làm (đã tạo nhưng start_date > dateStr) */
    upcoming: number;
    /** NV bếp */
    kitchen: number;
    /** Số suất ăn (eating) — chỉ tính ngày nấu */
    eating: number;
    /** Số nghỉ ăn (not_eating regular) — chỉ tính ngày nấu */
    notEating: number;
    /** Hủy muộn */
    lateCancel: number;
    /** Đăng ký muộn */
    lateRegister: number;
    /** Suất khách */
    guest: number;
}

export interface DeptStats {
    department: string;
    eating: number;
    notEating: number;
}

export interface MonthlyReportResult {
    /** Thống kê per-day */
    dailyStats: DayStats[];
    /** Thống kê per-department */
    deptStats: DeptStats[];
    /** Tổng suất ăn (eating + guest) cả tháng */
    totalMeals: number;
    /** Tổng nghỉ ăn thực tế (chỉ tính đơn chủ động báo nghỉ) */
    totalNotEating: number;
    /** Số lượt báo nghỉ hợp lệ (trước giờ chốt) */
    validOptOuts: number;
    /** Số lượt hủy muộn (sau giờ chốt) */
    lateCancellations: number;
    /** Tổng suất khách */
    totalGuest: number;
    /** Số ngày nấu */
    cookingDays: number;
    /** Ngày đông nhất */
    peakDay: { date: string; count: number };
    /** Ngày ít nhất */
    lowDay: { date: string; count: number };
    /** Tổng NV eligible (snapshot trung bình) */
    avgEligible: number;
    /** Đơn giá 1 suất ăn (VNĐ) */
    unitPrice: number;
    /** Tổng số tiền tiết kiệm được từ các đơn báo nghỉ hợp lệ (VNĐ) */
    costSavingsVnd: number;
    /** Tổng số tiền lãng phí do hủy muộn (VNĐ) */
    wastedCostVnd: number;
    /** Tổng chi phí thực tế phải trả nhà bếp (VNĐ) */
    totalCostVnd: number;
    /** Raw data cho Admin Sheet 1 re-use */
    _raw: {
        allEmployees: any[];
        orderMap: Map<string, Map<string, { status: string; is_late: boolean }>>;
        guestByDate: Map<string, number>;
        statusTimeline: Map<string, Array<{ date: string; status: string }>>;
        statusChangeLogs: any[];
        employeeJoinDate: Map<string, string>;
        isCookingDay: (dateStr: string) => boolean;
        kitchenCount: number;
        getStatusOnDate: (userId: string, dateStr: string, currentDbStatus: string, resignedDate?: string | null) => string;
    };
}

// ── Main Calculator ────────────────────────────

/**
 * Tính toàn bộ thống kê suất ăn tháng.
 * Logic GIỐNG NGUYÊN Admin Sheet 1 (v6.1.6).
 *
 * @param supabase - Supabase client (admin hoặc user)
 * @param tenantId - Tenant ID
 * @param year - Năm
 * @param month - Tháng (1-12)
 * @param endDateOverride - Ngày kết thúc (nếu tháng hiện tại, chỉ đến hôm nay)
 */
export async function calculateMonthlyStats(
    supabase: SupabaseClient,
    tenantId: string,
    year: number,
    month: number,
    endDateOverride?: string,
): Promise<MonthlyReportResult> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const naturalEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const endDate = endDateOverride && endDateOverride < naturalEnd ? endDateOverride : naturalEnd;
    return calculateDateRangeStats(supabase, tenantId, startDate, endDate);
}

/**
 * Tính toán thống kê theo khoảng thời gian bất kỳ.
 * Đây là CORE LOGIC đếm suất ăn chuẩn SSOT.
 */
export async function calculateDateRangeStats(
    supabase: SupabaseClient,
    tenantId: string,
    startDate: string,
    endDate: string,
): Promise<MonthlyReportResult> {
    // ── Parallel Queries (giống Admin export + AI config) ──
    const [
        { data: employees },
        { data: cookingDaySetting },
        { data: exceptions },
        { data: guestMeals },
        { data: statusChangeLogs },
        { count: kitchenCount },
        { data: aiConfig },
    ] = await Promise.all([
        // 1. ALL employees (mọi status, KHÔNG filter) — QUAN TRỌNG: phải ALL để detect resigned/paused per-day
        supabase.from('users')
            .select('id, full_name, department, role, status, default_meal_status, created_at, start_date, resigned_date')
            .eq('tenant_id', tenantId)
            .not('role', 'ilike', '%kitchen%'),
        // 2. Cooking days
        supabase.from('system_settings')
            .select('value').eq('tenant_id', tenantId).eq('key', 'cooking_days').single(),
        // 3. Exceptions
        supabase.from('cooking_exceptions')
            .select('date, type').eq('tenant_id', tenantId)
            .gte('date', startDate).lte('date', endDate),
        // 4. Guest meals
        supabase.from('guest_meals')
            .select('date, quantity').eq('tenant_id', tenantId)
            .gte('date', startDate).lte('date', endDate),
        // 5. Activity logs for status timeline
        supabase.from('activity_logs')
            .select('action, details, target_id, created_at')
            .eq('tenant_id', tenantId)
            .in('action', [
                'CHANGE_EMPLOYEE_STATUS',
                'SCHEDULE_RESIGNATION',
                'CANCEL_SCHEDULED_RESIGNATION',
                'AUTO_RESIGN_SCHEDULED',
            ])
            .gte('created_at', startDate + 'T00:00:00')
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true }),
        // 6. Kitchen staff count (snapshot)
        supabase.from('users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .ilike('role', '%kitchen%')
            .eq('status', 'active'),
        // 7. Cấu hình đơn giá suất ăn
        supabase.from('tenant_ai_config')
            .select('meal_price, extra_cost_per_meal')
            .eq('tenant_id', tenantId)
            .maybeSingle(),
    ]);

    // ── Paginated orders fetch (GIỐNG Admin) ──
    const allOrders: { user_id: string; date: string; status: string; is_late: boolean }[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;
    while (hasMore) {
        const { data: batch } = await supabase.from('orders')
            .select('user_id, date, status, is_late')
            .eq('tenant_id', tenantId)
            .gte('date', startDate).lte('date', endDate)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (batch && batch.length > 0) {
            allOrders.push(...batch);
            hasMore = batch.length === PAGE_SIZE;
            page++;
        } else {
            hasMore = false;
        }
    }

    // ── Cooking day checker ──
    const { startDay: cookStartDay, endDay: cookEndDay } = parseCookingDays(cookingDaySetting?.value);
    const exceptionMap = new Map<string, string>();
    exceptions?.forEach(e => exceptionMap.set(e.date, e.type));
    const isCookingDay = createCookingDayChecker(cookStartDay, cookEndDay, exceptionMap);

    // ── Build lookup maps ──
    const orderMap = new Map<string, Map<string, { status: string; is_late: boolean }>>();
    allOrders.forEach(o => {
        if (!orderMap.has(o.date)) orderMap.set(o.date, new Map());
        orderMap.get(o.date)!.set(o.user_id, { status: o.status, is_late: o.is_late || false });
    });

    const guestByDate = new Map<string, number>();
    guestMeals?.forEach(g => {
        guestByDate.set(g.date, (guestByDate.get(g.date) || 0) + g.quantity);
    });

    // ── Build STATUS TIMELINE (GIỐNG Admin v5.8.0) ──
    const statusTimeline = new Map<string, Array<{ date: string; status: string }>>();
    const rawStatusChangeLogs = statusChangeLogs || [];

    rawStatusChangeLogs.forEach((log: any) => {
        const userId = log.target_id;
        if (!userId) return;

        const details = log.details as any;
        const changeDate = log.created_at.slice(0, 10);

        let newStatus: string | null = null;

        if (log.action === 'CHANGE_EMPLOYEE_STATUS') {
            newStatus = details?.to_status;
        } else if (log.action === 'AUTO_RESIGN_SCHEDULED') {
            newStatus = 'resigned';
        } else if (log.action === 'SCHEDULE_RESIGNATION' || log.action === 'CANCEL_SCHEDULED_RESIGNATION') {
            return; // Scheduled/cancel = bỏ qua
        }

        if (!newStatus) return;

        if (!statusTimeline.has(userId)) {
            statusTimeline.set(userId, []);
        }
        statusTimeline.get(userId)!.push({ date: changeDate, status: newStatus });
    });

    // ── getStatusOnDate — GIỐNG NGUYÊN Admin v6.1.3 ──
    const getStatusOnDate = (userId: string, dateStr: string, currentDbStatus: string, resignedDate?: string | null): string => {
        const timeline = statusTimeline.get(userId);

        // Nếu có resigned_date → dùng nó làm mốc phân chia
        if (resignedDate) {
            if (dateStr >= resignedDate) {
                return 'resigned';
            }
            if (!timeline || timeline.length === 0) {
                return currentDbStatus === 'resigned' ? 'active' : currentDbStatus;
            }
        }

        if (!timeline || timeline.length === 0) {
            return currentDbStatus;
        }

        // Trước entry đầu tiên → lấy from_status
        if (dateStr < timeline[0].date) {
            const firstLog = rawStatusChangeLogs.find(
                (l: any) => l.target_id === userId && (
                    l.action === 'CHANGE_EMPLOYEE_STATUS' || l.action === 'AUTO_RESIGN_SCHEDULED'
                )
            );
            const fromStatus = (firstLog?.details as any)?.from_status;
            if (!fromStatus && currentDbStatus === 'resigned' && resignedDate) {
                return 'active';
            }
            return fromStatus || currentDbStatus;
        }

        // Tìm entry cuối cùng có date <= dateStr
        let result = currentDbStatus;
        for (const entry of timeline) {
            if (entry.date <= dateStr) {
                result = entry.status;
            } else {
                break;
            }
        }
        return result;
    };

    // ── Build join date map ──
    const employeeJoinDate = new Map<string, string>();
    employees?.forEach((emp: any) => {
        const joinDate = emp.start_date || (emp.created_at ? emp.created_at.slice(0, 10) : null);
        if (joinDate && joinDate >= startDate && joinDate <= endDate) {
            employeeJoinDate.set(emp.id, joinDate);
        }
    });

    // ── Đơn giá 1 suất ăn thực tế (Cấu hình hoặc mặc định 40.000đ) ──
    const unitMealPrice = (aiConfig?.meal_price || 37000) + (aiConfig?.extra_cost_per_meal || 3000);

    // ── Per-day counting loop — CHUẨN SINGLE SOURCE OF TRUTH ──
    const allEmployeesForCount = employees || [];
    const kitchenOnDay = kitchenCount ?? 0;
    const dailyStats: DayStats[] = [];
    const deptStatsMap = new Map<string, { eating: number; notEating: number }>();
    let totalMeals = 0;
    let totalValidOptOuts = 0;
    let totalLateCancellations = 0;
    let totalGuest = 0;
    let cookingDaysCount = 0;
    let peakDay = { date: '', count: 0 };
    let lowDay = { date: '', count: Infinity };
    let eligibleSum = 0;

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const cooking = isCookingDay(dateStr);
        if (cooking) cookingDaysCount++;

        let totalOnDay = 0, resignedOnDay = 0, pausedOnDay = 0;
        let upcomingOnDay = 0;
        let notEating = 0, lateCancel = 0, lateRegister = 0;

        for (const emp of allEmployeesForCount) {
            const joinDate = employeeJoinDate.get(emp.id) || (emp as any).start_date || (emp.created_at ? emp.created_at.slice(0, 10) : null);

            const hasJoined = !joinDate || joinDate <= dateStr;
            if (!hasJoined && joinDate && joinDate > startDate) {
                upcomingOnDay++;
                totalOnDay++;
                continue;
            }
            if (!hasJoined) {
                continue;
            }

            totalOnDay++;

            // Status per-day (GIỐNG Admin getStatusOnDate)
            const statusOnDay = getStatusOnDate(emp.id, dateStr, (emp as any).status || 'active', (emp as any).resigned_date);
            if (statusOnDay === 'resigned') {
                resignedOnDay++;
                continue;
            }
            if (statusOnDay === 'paused') {
                pausedOnDay++;
                continue;
            }

            // NV eligible — đếm order status nếu ngày nấu (Khớp 100% Admin Excel Sheet 1)
            if (cooking) {
                const orderData = orderMap.get(dateStr)?.get(emp.id);
                const mealStatus = orderData?.status || getDefaultMealStatus(emp);
                const isLate = orderData?.is_late || false;
                const dept = (emp as any).department || 'Khác';
                if (!deptStatsMap.has(dept)) deptStatsMap.set(dept, { eating: 0, notEating: 0 });

                if (mealStatus === 'not_eating') {
                    if (isLate) {
                        lateCancel++;
                    } else {
                        notEating++;
                    }
                    deptStatsMap.get(dept)!.notEating++;
                } else {
                    deptStatsMap.get(dept)!.eating++;
                    if (mealStatus === 'eating' && isLate) {
                        lateRegister++;
                    }
                }
            }
        }

        // Cộng kitchen vào totalOnDay
        totalOnDay += kitchenOnDay;
        const eligibleOnDay = totalOnDay - resignedOnDay - pausedOnDay - upcomingOnDay - kitchenOnDay;
        const guest = guestByDate.get(dateStr) || 0;

        // CÔNG THỨC v5.7.1 chuẩn:
        const eatingComputed = cooking ? (eligibleOnDay - notEating - lateCancel + lateRegister + guest) : 0;

        const dayTotal = eatingComputed;
        if (cooking) {
            if (dayTotal > peakDay.count) peakDay = { date: dateStr, count: dayTotal };
            if (dayTotal < lowDay.count) lowDay = { date: dateStr, count: dayTotal };
            totalMeals += eatingComputed;
            totalValidOptOuts += notEating;
            totalLateCancellations += lateCancel;
            totalGuest += guest;
            eligibleSum += eligibleOnDay;
        }

        dailyStats.push({
            date: dateStr,
            isCooking: cooking,
            totalOnDay,
            eligible: eligibleOnDay,
            resigned: resignedOnDay,
            paused: pausedOnDay,
            upcoming: upcomingOnDay,
            kitchen: kitchenOnDay,
            eating: cooking ? eatingComputed : 0,
            notEating: cooking ? notEating : 0,
            lateCancel: cooking ? lateCancel : 0,
            lateRegister: cooking ? lateRegister : 0,
            guest: cooking ? guest : 0,
        });
    }

    if (lowDay.count === Infinity) lowDay = { date: '', count: 0 };

    // ── Department stats ──
    const deptStats: DeptStats[] = Array.from(deptStatsMap.entries())
        .map(([department, stats]) => ({ department, ...stats }))
        .sort((a, b) => b.eating - a.eating);

    // Tính toán tài chính chuẩn xác
    const costSavingsVnd = totalValidOptOuts * unitMealPrice;
    const wastedCostVnd = totalLateCancellations * unitMealPrice;
    const totalCostVnd = totalMeals * unitMealPrice;

    return {
        dailyStats,
        deptStats,
        totalMeals,
        totalNotEating: totalValidOptOuts + totalLateCancellations,
        validOptOuts: totalValidOptOuts,
        lateCancellations: totalLateCancellations,
        totalGuest,
        cookingDays: cookingDaysCount,
        peakDay,
        lowDay,
        avgEligible: cookingDaysCount > 0 ? Math.round(eligibleSum / cookingDaysCount) : 0,
        unitPrice: unitMealPrice,
        costSavingsVnd,
        wastedCostVnd,
        totalCostVnd,
        _raw: {
            allEmployees: allEmployeesForCount,
            orderMap,
            guestByDate,
            statusTimeline,
            statusChangeLogs: rawStatusChangeLogs,
            employeeJoinDate,
            isCookingDay,
            kitchenCount: kitchenOnDay,
            getStatusOnDate,
        },
    };
}
