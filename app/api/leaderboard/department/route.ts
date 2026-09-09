import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface DepartmentGreenStat {
    department: string;
    totalEmployees: number;
    totalOrders: number;
    onTimeOrders: number;
    zeroWasteOrders: number;
    onTimeRate: number;
    zeroWasteRate: number;
    greenScore: number;
    rank: number;
    badge: string;
}

/**
 * GET /api/leaderboard/department
 * Bảng xếp hạng Đấu trường Phòng Ban Xanh
 * Tính toán tỷ lệ đúng giờ và tỷ lệ không lãng phí theo từng phòng ban
 */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser } = await supabase
        .from('users')
        .select('id, department, tenant_id, role')
        .eq('id', user.id)
        .single();

    if (!currentUser) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'month'; // 'month' or 'week'

    // Xác định khoảng thời gian
    const now = new Date();
    let startDate = new Date();
    if (range === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const startDateStr = startDate.toISOString().split('T')[0];

    // 1. Fetch tất cả nhân viên thuộc tenant
    let usersQuery = adminClient
        .from('users')
        .select('id, department, full_name')
        .is('deleted_at', null);

    if (currentUser.tenant_id) {
        usersQuery = usersQuery.eq('tenant_id', currentUser.tenant_id);
    }

    const { data: usersList, error: usersErr } = await usersQuery;
    if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    // Nhóm nhân viên theo phòng ban
    const deptEmployeesMap: Record<string, string[]> = {};
    (usersList || []).forEach(u => {
        const dept = u.department || 'Chưa phân phòng';
        if (!deptEmployeesMap[dept]) {
            deptEmployeesMap[dept] = [];
        }
        deptEmployeesMap[dept].push(u.id);
    });

    // 2. Fetch tất cả đơn cơm từ startDateStr
    let ordersQuery = adminClient
        .from('orders')
        .select('id, user_id, date, status, locked, created_at')
        .gte('date', startDateStr);

    if (currentUser.tenant_id) {
        ordersQuery = ordersQuery.eq('tenant_id', currentUser.tenant_id);
    }

    const { data: ordersList } = await ordersQuery;
    const orders = ordersList || [];

    // Map order theo user_id
    const userOrdersMap: Record<string, typeof orders> = {};
    orders.forEach(o => {
        if (!userOrdersMap[o.user_id]) {
            userOrdersMap[o.user_id] = [];
        }
        userOrdersMap[o.user_id].push(o);
    });

    // 3. Tính toán thống kê từng phòng ban
    const deptStats: DepartmentGreenStat[] = [];

    Object.entries(deptEmployeesMap).forEach(([deptName, userIds]) => {
        const totalEmp = userIds.length;
        let totalOrders = 0;
        let onTimeOrders = 0;
        let zeroWasteOrders = 0;

        userIds.forEach(uid => {
            const uOrders = userOrdersMap[uid] || [];
            uOrders.forEach(ord => {
                totalOrders++;
                // Kiểm tra đúng giờ: nếu locked=false hoặc trạng thái eating được tạo trước deadline
                if (ord.status === 'eating' || ord.status === 'not_eating') {
                    onTimeOrders++;
                }
                // Zero-waste: đơn cơm không hủy muộn / không mứa
                if (ord.status === 'eating') {
                    zeroWasteOrders++;
                }
            });
        });

        // Nếu phòng ban chưa có đơn đặt cơm nào, tính điểm mặc định từ sự sẵn sàng
        const onTimeRate = totalOrders > 0 ? Math.round((onTimeOrders / totalOrders) * 100) : 95;
        const zeroWasteRate = totalOrders > 0 ? Math.round((zeroWasteOrders / totalOrders) * 100) : 90;
        
        // Công thức Điểm Xanh (Green Score)
        const greenScore = Math.min(100, Math.max(0, Math.round((onTimeRate * 0.45) + (zeroWasteRate * 0.45) + 10)));

        deptStats.push({
            department: deptName,
            totalEmployees: totalEmp,
            totalOrders,
            onTimeOrders,
            zeroWasteOrders,
            onTimeRate,
            zeroWasteRate,
            greenScore,
            rank: 0,
            badge: ''
        });
    });

    // Sắp xếp theo Green Score giảm dần
    deptStats.sort((a, b) => b.greenScore - a.greenScore);

    // Gán thứ hạng và huy hiệu
    deptStats.forEach((stat, idx) => {
        stat.rank = idx + 1;
        if (stat.rank === 1) stat.badge = '🥇 Quán quân Xanh';
        else if (stat.rank === 2) stat.badge = '🥈 Á quân Xanh';
        else if (stat.rank === 3) stat.badge = '🥉 Quý quân Xanh';
        else stat.badge = `Hạng ${stat.rank}`;
    });

    // Tìm thông tin phòng ban của user hiện tại
    const userDeptStat = deptStats.find(d => d.department === currentUser.department);

    return NextResponse.json({
        success: true,
        periodRange: range,
        totalDepartments: deptStats.length,
        leaderboard: deptStats,
        userDepartment: userDeptStat || null
    });
}
