import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/ai-logs
 * Lấy danh sách nhật ký hoạt động AI (ai_audit_logs) cho tenant hiện tại.
 * Hỗ trợ phân trang, tìm kiếm theo câu lệnh/intent và lọc theo trạng thái.
 */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy thông tin user hiện tại để xác định tenant_id và phân quyền
    const { data: userData } = await supabase
        .from('users')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single();

    if (!userData || !['admin', 'manager'].includes(userData.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all'; // all, success, failed, pending_approval

    const offset = (page - 1) * limit;
    const adminClient = createAdminClient();

    // Xây dựng query cơ bản
    let query = adminClient
        .from('ai_audit_logs')
        .select(`
            id,
            tenant_id,
            user_id,
            session_id,
            intent_routed,
            model_used,
            input_tokens,
            output_tokens,
            estimated_cost_usd,
            latency_ms,
            tools_called,
            error_message,
            created_at,
            user_input,
            performer:users!user_id (
                email,
                full_name,
                role
            )
        `, { count: 'exact' })
        .eq('tenant_id', userData.tenant_id);

    // Lọc theo search (tìm kiếm trong user_input hoặc intent_routed)
    if (search) {
        query = query.or(`user_input.ilike.%${search}%,intent_routed.ilike.%${search}%`);
    }

    // Lọc theo status
    if (status === 'failed') {
        // Có lỗi hoặc trạng thái giao dịch thất bại
        query = query.or('error_message.not.is.null,tools_called->>transaction_status.eq.failed');
    } else if (status === 'pending_approval') {
        // Chờ duyệt
        query = query.filter('tools_called->>transaction_status', 'eq', 'pending_approval');
    } else if (status === 'success') {
        // Không có lỗi, trạng thái giao dịch thành công (và không phải pending)
        query = query
            .is('error_message', null)
            .filter('tools_called->>transaction_status', 'eq', 'success');
    }

    // Sắp xếp và phân trang
    const { data: logs, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        logs: logs || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
    });
}
