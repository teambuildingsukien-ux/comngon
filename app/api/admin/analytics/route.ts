import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/supabase/tenant-features';
import { fetchAll } from '@/lib/supabase/fetch-all';

/**
 * GET /api/admin/analytics
 * Trả về dữ liệu phân tích nâng cao cho tenant:
 * - Xu hướng đặt cơm 30 ngày gần nhất
 * - Phân tích theo phòng ban
 * - Tỉ lệ huỷ/đăng ký theo thời gian
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        // Feature flag check
        const analyticsEnabled = await isFeatureEnabled(profile.tenant_id, 'advanced_analytics');
        if (!analyticsEnabled) {
            return NextResponse.json({
                error: 'Tính năng Phân tích nâng cao chưa được bật cho gói dịch vụ hiện tại.',
            }, { status: 403 });
        }

        const supabaseAdmin = createAdminClient();
        const tenantId = profile.tenant_id;

        // 1. Xu hướng 30 ngày gần nhất (daily order count)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];

        // ⚠️ SCALABILITY-FIX: Paginated fetch — 3K NV × 22 days = 66K rows
        const dailyOrders = await fetchAll<{ date: string; status: string }>((from, to) =>
            supabaseAdmin
                .from('orders')
                .select('date, status')
                .eq('tenant_id', tenantId)
                .gte('date', startDate)
                .order('date', { ascending: true })
                .range(from, to)
        );

        // Aggregate by date
        const dailyMap: Record<string, { eating: number; not_eating: number; cancelled: number }> = {};
        (dailyOrders).forEach((order: any) => {
            const date = order.date;
            if (!dailyMap[date]) dailyMap[date] = { eating: 0, not_eating: 0, cancelled: 0 };
            if (order.status === 'eating') dailyMap[date].eating++;
            else if (order.status === 'not_eating') dailyMap[date].not_eating++;
            else if (order.status === 'cancelled') dailyMap[date].cancelled++;
        });

        const dailyTrend = Object.entries(dailyMap).map(([date, counts]) => ({
            date,
            ...counts,
            total: counts.eating + counts.not_eating + counts.cancelled,
        }));

        // 2. Phân tích theo phòng ban
        // ⚠️ SCALABILITY-FIX: Paginated fetch
        const deptOrders = await fetchAll<any>((from, to) =>
            supabaseAdmin
                .from('orders')
                .select(`
                    status,
                    users!inner(department, status)
                `)
                .eq('tenant_id', tenantId)
                .eq('users.status', 'active')
                .gte('date', startDate)
                .range(from, to)
        );

        const deptMap: Record<string, { eating: number; not_eating: number; total: number }> = {};
        (deptOrders).forEach((order: any) => {
            const dept = order.users?.department || 'Không rõ';
            if (!deptMap[dept]) deptMap[dept] = { eating: 0, not_eating: 0, total: 0 };
            deptMap[dept].total++;
            if (order.status === 'eating') deptMap[dept].eating++;
            else deptMap[dept].not_eating++;
        });

        const departmentStats = Object.entries(deptMap).map(([name, counts]) => ({
            department: name,
            ...counts,
            rate: counts.total > 0 ? Math.round((counts.eating / counts.total) * 100) : 0,
        })).sort((a, b) => b.total - a.total);

        const today = new Date().toISOString().split('T')[0]

        const { count: totalUsers } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .not('role', 'ilike', 'kitchen')
            .or(`start_date.lte.${today},start_date.is.null`) // ⚠️ START_DATE: loại NV chưa bắt đầu

        const totalEating = dailyTrend.reduce((sum, d) => sum + d.eating, 0);
        const totalAll = dailyTrend.reduce((sum, d) => sum + d.total, 0);
        const avgDailyRegistration = dailyTrend.length > 0 ? Math.round(totalEating / dailyTrend.length) : 0;
        const overallRate = totalAll > 0 ? Math.round((totalEating / totalAll) * 100) : 0;

        return NextResponse.json({
            overview: {
                totalUsers: totalUsers || 0,
                avgDailyRegistration,
                overallRate,
                totalDays: dailyTrend.length,
            },
            dailyTrend,
            departmentStats,
        });
    } catch (error: any) {
        console.error('GET /api/admin/analytics error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
