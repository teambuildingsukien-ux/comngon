import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/rewards/user-points
 * Lấy số dư điểm xanh (Green Points) và lịch sử giao dịch của người dùng
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Lấy thông tin user
    const { data: userData } = await supabase
        .from('users')
        .select('id, tenant_id, full_name, email')
        .eq('id', user.id)
        .single();

    if (!userData) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Fetch ví điểm xanh từ table `user_green_points`
    let { data: pointsRecord } = await adminClient
        .from('user_green_points')
        .select('*')
        .eq('user_id', user.id)
        .single();

    // Nếu chưa có ví điểm, khởi tạo tự động tặng 1,250 điểm chào mừng
    if (!pointsRecord) {
        const initialPoints = 1250;
        const { data: newRecord } = await adminClient
            .from('user_green_points')
            .insert({
                user_id: user.id,
                tenant_id: userData.tenant_id,
                balance_points: initialPoints,
                total_earned: initialPoints,
                total_spent: 0
            })
            .select()
            .single();

        pointsRecord = newRecord || {
            balance_points: initialPoints,
            total_earned: initialPoints,
            total_spent: 0
        };

        // Ghi transaction thưởng khởi tạo
        await adminClient.from('green_point_transactions').insert({
            user_id: user.id,
            tenant_id: userData.tenant_id,
            points: initialPoints,
            transaction_type: 'earn_reward',
            description: 'Thưởng chào mừng Nhân viên Xanh xuất sắc (Welcome Bonus)'
        });
    }

    // Lấy lịch sử giao dịch điểm 20 lượt gần nhất
    const { data: transactions } = await adminClient
        .from('green_point_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    // Lấy danh sách quà đã đổi của user
    const { data: myRedemptions } = await adminClient
        .from('reward_redemptions')
        .select(`
            id,
            points_spent,
            status,
            redemption_code,
            admin_note,
            created_at,
            reward:reward_items (
                title,
                category,
                image_url
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    return NextResponse.json({
        success: true,
        points: pointsRecord,
        transactions: transactions || [],
        myRedemptions: myRedemptions || []
    });
}
