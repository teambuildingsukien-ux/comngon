import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkResourceLimit } from '@/lib/supabase/tenant-features';

/**
 * GET /api/admin/departments
 * Lấy danh sách phòng ban của tenant
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // 1. Kiểm tra xác thực
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'Không tìm thấy thông tin công ty' }, { status: 403 });
        }

        const adminClient = createAdminClient();

        // Lấy danh sách departments từ bảng departments
        const { data: departments, error } = await adminClient
            .from('departments')
            .select('*')
            .eq('tenant_id', profile.tenant_id)
            .order('name');

        if (error) throw error;

        return NextResponse.json({ data: departments });
    } catch (error: any) {
        console.error('GET /api/admin/departments error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/departments
 * Tạo phòng ban mới
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Kiểm tra xác thực
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
        }

        // 2. Kiểm tra quyền (admin / manager)
        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();

        const role = profile?.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Yêu cầu quyền Admin hoặc Quản lý' }, { status: 403 });
        }

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'Không tìm thấy thông tin công ty' }, { status: 403 });
        }

        const body = await req.json();
        const trimmedName = body?.name?.trim();

        if (!trimmedName) {
            return NextResponse.json({ error: 'Vui lòng nhập tên phòng ban' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // 3. Kiểm tra giới hạn gói SaaS (Resource limit)
        const limitCheck = await checkResourceLimit(profile.tenant_id, 'departments');
        if (!limitCheck.allowed) {
            return NextResponse.json({ error: limitCheck.message }, { status: 403 });
        }

        // 4. Kiểm tra trùng tên trong cùng tenant (không phân biệt hoa thường và khoảng trắng)
        const { data: existing } = await adminClient
            .from('departments')
            .select('id, name')
            .eq('tenant_id', profile.tenant_id)
            .ilike('name', trimmedName)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: 'Tên phòng ban này đã tồn tại' }, { status: 400 });
        }

        // 5. Thêm phòng ban mới
        const { data: newDept, error: insertError } = await adminClient
            .from('departments')
            .insert({
                name: trimmedName,
                tenant_id: profile.tenant_id
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 6. Ghi nhật ký hoạt động (activity_logs)
        await adminClient.from('activity_logs').insert({
            tenant_id: profile.tenant_id,
            action: 'department_created',
            performed_by: user.id,
            target_type: 'department',
            target_id: newDept.id,
            details: { name: trimmedName }
        });

        return NextResponse.json({ success: true, data: newDept }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/departments error:', error);
        return NextResponse.json({ error: error.message || 'Lỗi khi tạo phòng ban' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/departments
 * Đổi tên phòng ban và đồng bộ cập nhật lại cho tất cả nhân viên thuộc phòng ban đó
 */
export async function PUT(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Kiểm tra xác thực
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
        }

        // 2. Kiểm tra quyền
        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();

        const role = profile?.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Yêu cầu quyền Admin hoặc Quản lý' }, { status: 403 });
        }

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'Không tìm thấy thông tin công ty' }, { status: 403 });
        }

        const body = await req.json();
        const oldName = body?.oldName?.trim();
        const newName = body?.newName?.trim();

        if (!oldName || !newName) {
            return NextResponse.json({ error: 'Tên phòng ban cũ và mới không được để trống' }, { status: 400 });
        }

        if (oldName.toLowerCase() === newName.toLowerCase()) {
            return NextResponse.json({ success: true, message: 'Tên không thay đổi' });
        }

        const adminClient = createAdminClient();

        // Kiểm tra tên mới có bị trùng với phòng ban khác không
        const { data: existingNew } = await adminClient
            .from('departments')
            .select('id, name')
            .eq('tenant_id', profile.tenant_id)
            .ilike('name', newName)
            .maybeSingle();

        if (existingNew) {
            return NextResponse.json({ error: 'Tên phòng ban mới đã tồn tại' }, { status: 400 });
        }

        // Cập nhật bảng departments (xử lý cả case-insensitive / khoảng trắng)
        await adminClient
            .from('departments')
            .update({ name: newName })
            .eq('tenant_id', profile.tenant_id)
            .ilike('name', oldName);

        // Cập nhật bảng users cho tất cả nhân viên thuộc phòng ban cũ
        const { data: updatedUsers, error: updateUsersErr } = await adminClient
            .from('users')
            .update({ department: newName })
            .eq('tenant_id', profile.tenant_id)
            .ilike('department', oldName)
            .select('id');

        if (updateUsersErr) throw updateUsersErr;

        // Ghi nhật ký hoạt động
        await adminClient.from('activity_logs').insert({
            tenant_id: profile.tenant_id,
            action: 'department_updated',
            performed_by: user.id,
            target_type: 'department',
            details: { oldName, newName, updatedUsersCount: updatedUsers?.length || 0 }
        });

        return NextResponse.json({
            success: true,
            oldName,
            newName,
            updatedUsersCount: updatedUsers?.length || 0
        });
    } catch (error: any) {
        console.error('PUT /api/admin/departments error:', error);
        return NextResponse.json({ error: error.message || 'Lỗi khi cập nhật phòng ban' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/departments
 * Xóa phòng ban và chuyển nhân viên của phòng ban này thành "Chưa có phòng ban" (department = null)
 */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Kiểm tra xác thực
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
        }

        // 2. Kiểm tra quyền
        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();

        const role = profile?.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Yêu cầu quyền Admin hoặc Quản lý' }, { status: 403 });
        }

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'Không tìm thấy thông tin công ty' }, { status: 403 });
        }

        // Lấy name từ body hoặc url query
        let nameToDelete = '';
        try {
            const body = await req.json();
            nameToDelete = body?.name;
        } catch {
            const { searchParams } = new URL(req.url);
            nameToDelete = searchParams.get('name') || '';
        }

        const trimmedName = nameToDelete?.trim();
        if (!trimmedName) {
            return NextResponse.json({ error: 'Vui lòng cung cấp tên phòng ban cần xóa' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // 3. Cập nhật nhân viên thuộc phòng ban này thành NULL (xử lý triệt để bằng ilike)
        const { data: affectedUsers, error: usersErr } = await adminClient
            .from('users')
            .update({ department: null })
            .eq('tenant_id', profile.tenant_id)
            .ilike('department', trimmedName)
            .select('id');

        if (usersErr) throw usersErr;

        // 4. Xóa khỏi bảng departments (xử lý linh hoạt cả trường hợp trailing space hoặc hoa thường)
        const { error: deptErr } = await adminClient
            .from('departments')
            .delete()
            .eq('tenant_id', profile.tenant_id)
            .ilike('name', trimmedName);

        if (deptErr) throw deptErr;

        // 5. Ghi nhật ký hoạt động
        await adminClient.from('activity_logs').insert({
            tenant_id: profile.tenant_id,
            action: 'department_deleted',
            performed_by: user.id,
            target_type: 'department',
            details: {
                name: trimmedName,
                cleared_employees: affectedUsers?.length || 0
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Đã xóa phòng ban thành công',
            clearedEmployees: affectedUsers?.length || 0
        });
    } catch (error: any) {
        console.error('DELETE /api/admin/departments error:', error);
        return NextResponse.json({ error: error.message || 'Lỗi khi xóa phòng ban' }, { status: 500 });
    }
}
