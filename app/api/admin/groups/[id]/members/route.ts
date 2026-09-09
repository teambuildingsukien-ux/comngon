import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/groups/[id]/members
 * Get all members of a group
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id } = await params;

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current user's tenant_id for filtering
        const { data: currentProfile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!currentProfile?.tenant_id) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });
        }

        // Use admin client but with tenant filtering
        const adminClient = createAdminClient();
        const { data, error } = await adminClient
            .from('users')
            .select('id, full_name, email, employee_code, department, avatar_url')
            .eq('group_id', id)
            .eq('tenant_id', currentProfile.tenant_id) // ✅ TENANT ISOLATION
            .in('status', ['active', 'paused'])  // ✅ Exclude resigned
            .order('full_name', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ data: data || [] });
    } catch (error: any) {
        console.error('GET /api/admin/groups/[id]/members error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/groups/[id]/members
 * Add employee to group
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id: groupId } = await params;

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get caller's tenant_id and role
        const { data: callerProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!callerProfile?.tenant_id) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });
        }

        const role = callerProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        const body = await req.json();
        const { user_id } = body;

        if (!user_id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Use admin client to bypass RLS
        const adminClient = createAdminClient();

        // Check if user belongs to same tenant and is already in a group
        const { data: existingUser } = await adminClient
            .from('users')
            .select('group_id, full_name, tenant_id, status')
            .eq('id', user_id)
            .single();

        if (!existingUser || existingUser.tenant_id !== callerProfile.tenant_id) {
            return NextResponse.json({ error: 'User not found in your tenant' }, { status: 404 });
        }

        // ✅ Block resigned users from being added to groups
        if (existingUser.status === 'resigned') {
            return NextResponse.json(
                { error: `Nhân viên "${existingUser.full_name}" đã nghỉ việc, không thể thêm vào nhóm` },
                { status: 400 }
            );
        }

        if (existingUser?.group_id) {
            return NextResponse.json(
                { error: `Nhân viên "${existingUser.full_name}" đã thuộc nhóm khác` },
                { status: 400 }
            );
        }

        // ⚠️ AUDIT-FIX: Check group registration_mode → set default_meal_status
        const { data: groupInfo } = await adminClient
            .from('groups')
            .select('registration_mode')
            .eq('id', groupId)
            .single();

        // ⚠️ OPT-IN FIX: Nhóm tự đăng ký → LUÔN mặc định NGHỈ ĂN
        // NV phải tự bấm nút hoặc dùng lịch để đăng ký ăn
        // Không lấy trạng thái hiện tại — bất kể trước đó ăn hay nghỉ
        const defaultMealStatus = groupInfo?.registration_mode === 'opt_in' ? 'not_eating' : 'eating';

        // Add user to group + set default_meal_status
        const { error } = await adminClient
            .from('users')
            .update({ group_id: groupId, default_meal_status: defaultMealStatus })
            .eq('id', user_id);

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: callerProfile.tenant_id,
            action: 'group_member_added',
            performed_by: user.id,
            target_type: 'user',
            target_id: user_id,
            details: { group_id: groupId, member_name: existingUser.full_name }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('POST /api/admin/groups/[id]/members error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
