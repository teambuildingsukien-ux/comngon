import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/rewards/items
 * Lấy danh sách quà tặng khả dụng trong Rewards Store
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: items, error } = await adminClient
        .from('reward_items')
        .select('*')
        .eq('is_active', true)
        .order('points_required', { ascending: true });

    if (error) {
        // Nếu bảng chưa có sẵn dữ liệu, trả về danh mục mẫu
        const fallbackItems = [
            {
                id: 'item-1',
                title: '☕ Ly Cà Phê Highlands / Phút Thư Giãn',
                description: 'Đổi 1 ly cà phê Highlands hảo hạng hoặc đồ uống ưa thích tại pantry công ty',
                points_required: 500,
                category: 'beverage',
                stock: 100,
                is_active: true
            },
            {
                id: 'item-2',
                title: '🎟️ Voucher Shopee / Tiki 50,000đ',
                description: 'Mã giảm giá mua sắm trực tuyến trị giá 50.000đ dành cho nhân viên xanh',
                points_required: 1000,
                category: 'voucher',
                stock: 50,
                is_active: true
            },
            {
                id: 'item-3',
                title: '🌱 Bình Nước Inox Giữ Nhiệt Cơm Ngốn',
                description: 'Bình nước inox cao cấp 500ml khắc tên cá nhân bảo vệ môi trường',
                points_required: 2500,
                category: 'gift',
                stock: 30,
                is_active: true
            },
            {
                id: 'item-4',
                title: '🏖️ Nửa Ngày Nghỉ Phép Hưởng Lương',
                description: 'Được quy đổi 0.5 ngày nghỉ phép có hưởng lương (cần HR/Quản lý phê duyệt)',
                points_required: 5000,
                category: 'leave',
                stock: 20,
                is_active: true
            }
        ];
        return NextResponse.json({ success: true, items: fallbackItems });
    }

    return NextResponse.json({ success: true, items: items || [] });
}

/**
 * POST /api/rewards/items
 * Admin thêm món quà mới vào danh mục
 */
export async function POST(request: Request) {
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
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { title, description, points_required, category, stock, image_url } = body;

        if (!title || !points_required) {
            return NextResponse.json({ error: 'Missing title or points_required' }, { status: 400 });
        }

        const adminClient = createAdminClient();
        const { data: newItem, error: insertErr } = await adminClient
            .from('reward_items')
            .insert({
                tenant_id: userData.tenant_id,
                title,
                description,
                points_required: parseInt(points_required, 10),
                category: category || 'gift',
                stock: stock ? parseInt(stock, 10) : 999,
                image_url: image_url || null,
                is_active: true
            })
            .select()
            .single();

        if (insertErr) {
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, item: newItem });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
