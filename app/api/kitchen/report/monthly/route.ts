import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateMonthlyStats } from '@/lib/report-calculator';

/**
 * GET /api/kitchen/report/monthly?month=2026-03
 * Monthly meal report for Kitchen Dashboard
 * Kitchen/Admin/Manager only
 *
 * ⚠️ v6.1.7: Dùng SHARED calculateMonthlyStats() — Single Source of Truth
 * Logic đếm GIỐNG NGUYÊN Admin Sheet 1 → đảm bảo 100% khớp.
 * KHÔNG tự viết logic đếm riêng ở đây.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile || !['admin', 'manager', 'kitchen'].includes(profile.role)) {
            return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
        }

        const tenantId = profile.tenant_id;

        // Parse month param (format: 2026-03)
        const monthParam = request.nextUrl.searchParams.get('month')
            || new Date().toISOString().slice(0, 7);

        const [year, month] = monthParam.split('-').map(Number);

        // ⚠️ AUDIT-FIX: Chỉ đếm đến ngày hiện tại cho tháng hiện tại
        const now = new Date();
        const nowVN = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const isCurrentMonth = year === nowVN.getFullYear() && month === (nowVN.getMonth() + 1);
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const lastDay = isCurrentMonth ? Math.min(nowVN.getDate(), lastDayOfMonth) : lastDayOfMonth;
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // ⚠️ AUDIT-GUARD: Fetch meal price
        const { data: aiConfig } = await supabase
            .from('tenant_ai_config')
            .select('meal_price')
            .eq('tenant_id', tenantId)
            .single();

        const mealPrice = aiConfig?.meal_price || 25000;

        // ═══════════════════════════════════════════════════
        // ⭐ v6.1.7: GỌI SHARED CALCULATOR — GIỐNG ADMIN SHEET 1
        // ═══════════════════════════════════════════════════
        const stats = await calculateMonthlyStats(supabase, tenantId, year, month, endDate);

        // Format response cho Kitchen UI
        const totalCost = stats.totalMeals * mealPrice;
        const totalSaved = stats.totalNotEating * mealPrice;

        const byDepartment = stats.deptStats
            .slice(0, 8)
            .map(d => ({
                name: d.department,
                total_eating: d.eating,
                total_not_eating: d.notEating,
                avg_daily: stats.cookingDays > 0 ? Math.round(d.eating / stats.cookingDays) : 0,
            }));

        const dailyTrend = stats.dailyStats
            .filter(d => d.isCooking)
            .map(d => ({
                date: d.date,
                eating: d.eating,
                not_eating: d.notEating,
                guest: d.guest,
            }));

        const report = {
            month: monthParam,
            meal_price: mealPrice,
            cooking_days: stats.cookingDays,
            total_employees: stats.avgEligible,
            total_meals: stats.totalMeals,
            total_not_eating: stats.totalNotEating,
            total_guest: stats.totalGuest,
            total_cost: totalCost,
            total_saved: totalSaved,
            avg_daily_meals: stats.cookingDays > 0 ? Math.round(stats.totalMeals / stats.cookingDays) : 0,
            peak_day: stats.peakDay.count === 0 ? null : stats.peakDay,
            low_day: stats.lowDay.count === 0 ? null : stats.lowDay,
            by_department: byDepartment,
            daily_trend: dailyTrend,
        };

        return NextResponse.json({ data: report });
    } catch (error: any) {
        console.error('Monthly report error:', error);
        return NextResponse.json({ error: error.message || 'Report failed' }, { status: 500 });
    }
}
