import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * PUT /api/admin/employees/[id]
 * Update employee information (admin/manager only)
 * 
 * IMPORTANT: Next.js 15 Breaking Change
 * params is now a Promise and must be awaited
 */
export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    // Next.js 15: Await params first
    const params = await context.params;



    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();


        if (authError || !currentUser) {

            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get current user's profile with role and tenant_id
        const { data: currentProfile, error: profileError } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', currentUser.id)
            .single();

        if (profileError || !currentProfile) {
            console.error('[UPDATE_EMPLOYEE] Profile fetch error:', profileError);
            return NextResponse.json(
                { error: 'User profile not found' },
                { status: 404 }
            );
        }

        // Check if user is admin or manager
        const role = currentProfile.role?.toLowerCase();
        if (role !== 'admin' && role !== 'manager') {
            return NextResponse.json(
                { error: 'Insufficient permissions. Admin or Manager role required.' },
                { status: 403 }
            );
        }

        // Parse request body
        const body = await request.json();
        const {
            full_name,
            role: newRole,
            employee_code,
            shift_id,
            department,
            group_id
        } = body;

        // Validate required fields
        if (!full_name?.trim()) {
            return NextResponse.json(
                { error: 'Full name is required' },
                { status: 400 }
            );
        }

        if (!newRole) {
            return NextResponse.json(
                { error: 'Role is required' },
                { status: 400 }
            );
        }

        // Validate role value
        const validRoles = ['employee', 'manager', 'admin', 'kitchen'];
        if (!validRoles.includes(newRole.toLowerCase())) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            );
        }

        // Get employee to verify they're in the same tenant


        const { data: employee, error: employeeError } = await supabase
            .from('users')
            .select('id, tenant_id, email, full_name, role')
            .eq('id', params.id)
            .single();



        if (employeeError || !employee) {

            return NextResponse.json(
                { error: 'Employee not found' },
                { status: 404 }
            );
        }



        // Verify same tenant
        if (employee.tenant_id !== currentProfile.tenant_id) {
            console.warn('[UPDATE_EMPLOYEE] Cross-tenant update attempt:', {
                admin: currentUser.id,
                employee: params.id,
                adminTenant: currentProfile.tenant_id,
                employeeTenant: employee.tenant_id
            });
            return NextResponse.json(
                { error: 'Cannot update employees from other tenants' },
                { status: 403 }
            );
        }

        // Prepare update data
        const updateData: any = {
            full_name: full_name.trim(),
            role: newRole.toLowerCase(), // Normalize to lowercase
            updated_at: new Date().toISOString()
        };

        // Optional fields
        if (employee_code !== undefined) updateData.employee_code = employee_code?.trim() || null;
        if (shift_id !== undefined) updateData.shift_id = shift_id || null;
        if (department !== undefined) updateData.department = department?.trim() || null;
        if (group_id !== undefined) {
            updateData.group_id = group_id || null;
            // ⚠️ OPT-IN FIX: Update default_meal_status when changing groups
            if (group_id) {
                // Moving to a group — check if opt-in
                const { data: destGroup } = await supabase
                    .from('groups')
                    .select('registration_mode')
                    .eq('id', group_id)
                    .single();
                // Nhóm opt-in → LUÔN mặc định NGHỈ ĂN, NV phải tự đăng ký
                // Nhóm opt-out → mặc định ĂN (cron tạo order eating)
                updateData.default_meal_status = destGroup?.registration_mode === 'opt_in' ? 'not_eating' : 'eating';
            } else {
                // Removing from group — reset to default (ăn)
                updateData.default_meal_status = 'eating';
            }
        }

        console.log('[UPDATE_EMPLOYEE] Updating employee:', {
            id: params.id,
            changes: updateData,
            performedBy: currentUser.id
        });

        // Update employee
        const { data: updatedEmployee, error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', params.id)
            .eq('tenant_id', currentProfile.tenant_id) // Double-check tenant isolation
            .select()
            .single();

        if (updateError) {
            console.error('[UPDATE_EMPLOYEE] Update error:', updateError);
            return NextResponse.json(
                { error: `Failed to update employee: ${updateError.message}` },
                { status: 500 }
            );
        }

        // Log activity
        const { error: logError } = await supabase
            .from('activity_logs')
            .insert({
                tenant_id: currentProfile.tenant_id,
                action: 'UPDATE_USER',
                performed_by: currentUser.id,
                target_type: 'user',
                target_id: params.id,
                details: {
                    before: {
                        full_name: employee.full_name,
                        role: employee.role
                    },
                    after: {
                        full_name: updateData.full_name,
                        role: updateData.role,
                        employee_code: updateData.employee_code,
                        department: updateData.department,
                        shift_id: updateData.shift_id,
                        group_id: updateData.group_id
                    }
                }
            });

        if (logError) {
            console.error('[UPDATE_EMPLOYEE] Activity log error:', logError);
            // Don't fail the request if logging fails
        }

        console.log('[UPDATE_EMPLOYEE] ✅ Employee updated successfully:', params.id);

        return NextResponse.json({
            success: true,
            employee: updatedEmployee
        });

    } catch (error: any) {
        console.error('[UPDATE_EMPLOYEE] Unexpected error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/employees/[id]
 * Delete employee (admin only) — server-side to bypass PostgREST cache
 */
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;

    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get admin profile
        const { data: adminProfile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', currentUser.id)
            .single();

        if (!adminProfile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        // Must be admin
        if (adminProfile.role?.toLowerCase() !== 'admin') {
            return NextResponse.json({ error: 'Chỉ Admin mới được xóa nhân viên' }, { status: 403 });
        }

        // Get employee info for logging
        const { data: employee, error: empError } = await supabase
            .from('users')
            .select('id, email, full_name, role, tenant_id')
            .eq('id', params.id)
            .single();

        if (empError || !employee) {
            return NextResponse.json({ error: 'Nhân viên không tồn tại' }, { status: 404 });
        }

        // Tenant isolation
        if (employee.tenant_id !== adminProfile.tenant_id) {
            return NextResponse.json({ error: 'Không thể xóa nhân viên của tổ chức khác' }, { status: 403 });
        }

        // Use admin client (service_role) to bypass PostgREST cache
        const adminClient = createAdminClient();

        // 1. Log activity BEFORE delete (bắt buộc)
        const { error: logError } = await adminClient.from('activity_logs').insert({
            tenant_id: adminProfile.tenant_id,
            action: 'DELETE_USER',
            performed_by: currentUser.id,
            target_type: 'user',
            target_id: employee.id,
            details: {
                email: employee.email,
                full_name: employee.full_name,
                role: employee.role
            }
        });

        if (logError) {
            console.error('[DELETE_EMPLOYEE] Activity log failed:', logError);
            return NextResponse.json(
                { error: `Không thể ghi log: ${logError.message}` },
                { status: 500 }
            );
        }

        // 2. Delete from user_meal_groups (if table exists)
        await adminClient.from('user_meal_groups').delete().eq('user_id', employee.id);

        // 3. Delete user (with tenant isolation)
        const { error: deleteError } = await adminClient
            .from('users')
            .delete()
            .eq('id', employee.id)
            .eq('tenant_id', adminProfile.tenant_id);

        if (deleteError) {
            console.error('[DELETE_EMPLOYEE] Delete failed:', deleteError);
            return NextResponse.json(
                { error: `Xóa thất bại: ${deleteError.message}` },
                { status: 500 }
            );
        }

        console.log('[DELETE_EMPLOYEE] ✅ Deleted:', employee.full_name, employee.id);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[DELETE_EMPLOYEE] Unexpected error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
