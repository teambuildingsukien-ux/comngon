import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/rewards/redeem
 * Nhân viên thực hiện đổi quà bằng Green Points
 */
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { reward_id } = body;

        if (!reward_id) {
            return NextResponse.json({ error: 'Missing reward_id' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // 1. Fetch thông tin món quà
        const { data: rewardItem, error: rewardErr } = await adminClient
            .from('reward_items')
            .select('*')
            .eq('id', reward_id)
            .single();

        if (rewardErr || !rewardItem) {
            return NextResponse.json({ error: 'Món quà không tồn tại hoặc đã hết hạn' }, { status: 404 });
        }

        if (rewardItem.stock <= 0) {
            return NextResponse.json({ error: 'Món quà này tạm thời hết tồn kho' }, { status: 400 });
        }

        // 2. Fetch số dư điểm của user
        let { data: pointsRecord } = await adminClient
            .from('user_green_points')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const currentBalance = pointsRecord ? pointsRecord.balance_points : 1250;

        if (currentBalance < rewardItem.points_required) {
            return NextResponse.json({
                error: `Bạn chưa đủ điểm. Cần ${rewardItem.points_required} điểm, hiện có ${currentBalance} điểm.`
            }, { status: 400 });
        }

        // 3. Tạo mã Redemption Code ngẫu nhiên
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const categoryPrefix = rewardItem.category ? rewardItem.category.substring(0, 3).toUpperCase() : 'GFT';
        const redemptionCode = `GREEN-${categoryPrefix}-${randomStr}`;

        // 4. Trừ điểm người dùng
        const newBalance = currentBalance - rewardItem.points_required;
        const newSpent = (pointsRecord ? pointsRecord.total_spent : 0) + rewardItem.points_required;

        if (pointsRecord) {
            await adminClient
                .from('user_green_points')
                .update({
                    balance_points: newBalance,
                    total_spent: newSpent,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id);
        } else {
            await adminClient.from('user_green_points').insert({
                user_id: user.id,
                tenant_id: rewardItem.tenant_id,
                balance_points: newBalance,
                total_earned: 1250,
                total_spent: rewardItem.points_required
            });
        }

        // 5. Ghi transaction trừ điểm
        await adminClient.from('green_point_transactions').insert({
            user_id: user.id,
            tenant_id: rewardItem.tenant_id,
            points: -rewardItem.points_required,
            transaction_type: 'spend_reward',
            description: `Đổi quà: ${rewardItem.title}`
        });

        // 6. Giảm số lượng tồn kho của quà
        await adminClient
            .from('reward_items')
            .update({ stock: Math.max(0, rewardItem.stock - 1) })
            .eq('id', rewardItem.id);

        // 7. Tạo đơn đổi quà
        const { data: redemptionRecord, error: redeemErr } = await adminClient
            .from('reward_redemptions')
            .insert({
                user_id: user.id,
                tenant_id: rewardItem.tenant_id,
                reward_id: rewardItem.id,
                points_spent: rewardItem.points_required,
                status: 'pending',
                redemption_code: redemptionCode
            })
            .select(`
                id,
                points_spent,
                status,
                redemption_code,
                created_at,
                reward:reward_items(title, category)
            `)
            .single();

        if (redeemErr) {
            return NextResponse.json({ error: redeemErr.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Đổi quà thành công! Đang chờ HR/Admin phê duyệt mã quà tặng.',
            redemption: redemptionRecord,
            newBalance
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}

/**
 * GET /api/rewards/redeem
 * Lấy danh sách tất cả yêu cầu đổi quà cho Admin/HR duyệt
 */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
        .from('users')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single();

    if (!userData || !['admin', 'manager'].includes(userData.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'all';

    let query = adminClient
        .from('reward_redemptions')
        .select(`
            id,
            points_spent,
            status,
            redemption_code,
            admin_note,
            created_at,
            resolved_at,
            applicant:users!user_id (
                id,
                full_name,
                email,
                department
            ),
            reward:reward_items (
                title,
                category,
                image_url
            )
        `)
        .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
    }

    const { data: redemptions, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        redemptions: redemptions || []
    });
}

/**
 * PUT /api/rewards/redeem
 * Admin/HR phê duyệt hoặc từ chối đơn đổi quà
 */
export async function PUT(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
        .from('users')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single();

    if (!userData || !['admin', 'manager'].includes(userData.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { redemption_id, status, admin_note } = body;

        if (!redemption_id || !['approved', 'rejected', 'completed'].includes(status)) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // 1. Fetch thông tin đơn đổi quà
        const { data: redemption, error: fetchErr } = await adminClient
            .from('reward_redemptions')
            .select('*')
            .eq('id', redemption_id)
            .single();

        if (fetchErr || !redemption) {
            return NextResponse.json({ error: 'Đơn đổi quà không tồn tại' }, { status: 404 });
        }

        // 2. Nếu từ chối (rejected), hoàn lại điểm cho nhân viên
        if (status === 'rejected' && redemption.status !== 'rejected') {
            const { data: userPoints } = await adminClient
                .from('user_green_points')
                .select('*')
                .eq('user_id', redemption.user_id)
                .single();

            if (userPoints) {
                await adminClient
                    .from('user_green_points')
                    .update({
                        balance_points: userPoints.balance_points + redemption.points_spent,
                        total_spent: Math.max(0, userPoints.total_spent - redemption.points_spent)
                    })
                    .eq('user_id', redemption.user_id);
            }

            // Ghi nhật ký hoàn điểm
            await adminClient.from('green_point_transactions').insert({
                user_id: redemption.user_id,
                tenant_id: redemption.tenant_id,
                points: redemption.points_spent,
                transaction_type: 'earn_reward',
                description: `Hoàn điểm do đơn đổi quà bị từ chối (${admin_note || 'Lý do hành chính'})`
            });
        }

        // 3. Cập nhật trạng thái đơn đổi quà
        const { data: updatedRecord, error: updateErr } = await adminClient
            .from('reward_redemptions')
            .update({
                status,
                admin_note: admin_note || null,
                resolved_at: new Date().toISOString()
            })
            .eq('id', redemption_id)
            .select()
            .single();

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Đã cập nhật trạng thái đơn thành ${status}`,
            redemption: updatedRecord
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
