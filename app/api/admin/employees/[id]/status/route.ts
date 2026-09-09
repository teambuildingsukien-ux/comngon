import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getArchivedEmail } from '@/lib/utils/email-helpers';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    const employeeId = params.id;

    try {
        const supabase = await createClient();

        // 1. Get current user & profile to check permissions
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: currentProfile, error: profileError } = await supabase
            .from('users')
            .select('role, tenant_id, full_name')
            .eq('id', currentUser.id)
            .single();

        if (profileError || !currentProfile) {
            return NextResponse.json({ error: 'Admin profile not found' }, { status: 404 });
        }

        const role = currentProfile.role?.toLowerCase();
        if (role !== 'admin' && role !== 'manager') {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // 2. Fetch employee profile and check tenant isolation
        const { data: employee, error: employeeError } = await supabase
            .from('users')
            .select('id, email, full_name, role, tenant_id, status, resigned_date')
            .eq('id', employeeId)
            .single();

        if (employeeError || !employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        if (employee.tenant_id !== currentProfile.tenant_id) {
            return NextResponse.json({ error: 'Cannot update employees from other tenants' }, { status: 403 });
        }

        // 3. Parse request body
        const body = await request.json();
        const { action, newStatus, reason, resignedDate, isFutureResignation } = body;

        const supabaseAdmin = createAdminClient();
        const nowStr = new Date().toISOString();
        const todayStr = nowStr.split('T')[0];

        if (action === 'cancel_resignation') {
            if (!employee.resigned_date) {
                return NextResponse.json({ error: 'Nhân viên này không có lịch nghỉ việc nào được lên lịch.' }, { status: 400 });
            }

            const oldResignedDate = employee.resigned_date;

            // Update user status
            const { error: updateErr } = await supabase
                .from('users')
                .update({
                    resigned_date: null,
                    status_reason: null,
                    updated_at: nowStr,
                })
                .eq('id', employeeId);

            if (updateErr) throw updateErr;

            // Restore future orders from resigned_date onwards
            const { data: restoredOrders, error: restoreErr } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'eating',
                    updated_at: nowStr,
                    source: 'admin_status_change',
                })
                .eq('user_id', employeeId)
                .eq('status', 'not_eating')
                .gte('date', oldResignedDate)
                .select('id');

            if (restoreErr) throw restoreErr;

            // Log activity
            await supabase.from('activity_logs').insert({
                tenant_id: currentProfile.tenant_id,
                action: 'CANCEL_SCHEDULED_RESIGNATION',
                performed_by: currentUser.id,
                performer_name: currentProfile.full_name,
                target_type: 'user',
                target_id: employeeId,
                details: {
                    employee_name: employee.full_name,
                    cancelled_resigned_date: oldResignedDate,
                    restored_orders_count: restoredOrders?.length || 0,
                }
            });

            return NextResponse.json({ success: true });
        } else if (action === 'change_status') {
            if (isFutureResignation) {
                // SCHEDULED: Giữ active, chỉ set resigned_date
                const { error: updateErr } = await supabase
                    .from('users')
                    .update({
                        resigned_date: resignedDate,
                        status_reason: reason?.trim() || null,
                        updated_at: nowStr,
                    })
                    .eq('id', employeeId);

                if (updateErr) throw updateErr;

                // Cancel future orders starting from resignedDate
                const { data: cancelledOrders, error: cancelErr } = await supabaseAdmin
                    .from('orders')
                    .update({
                        status: 'not_eating',
                        updated_at: nowStr,
                        source: 'admin_status_change',
                    })
                    .eq('user_id', employeeId)
                    .eq('status', 'eating')
                    .gte('date', resignedDate)
                    .select('id');

                if (cancelErr) throw cancelErr;

                // Log activity
                await supabase.from('activity_logs').insert({
                    tenant_id: currentProfile.tenant_id,
                    action: 'SCHEDULE_RESIGNATION',
                    performed_by: currentUser.id,
                    performer_name: currentProfile.full_name,
                    target_type: 'user',
                    target_id: employeeId,
                    details: {
                        employee_name: employee.full_name,
                        employee_email: employee.email,
                        to_status: 'scheduled_resignation',
                        resigned_date: resignedDate,
                        reason: reason?.trim() || 'Đặt lịch nghỉ việc',
                        cancelled_orders_count: cancelledOrders?.length || 0
                    }
                });

                return NextResponse.json({ success: true });
            } else {
                // IMMEDIATE: Thực hiện chuyển đổi trạng thái lập tức
                const isResigning = newStatus === 'resigned';
                let archivedEmail = employee.email;

                // A. Nếu là ĐÃ NGHỈ VIỆC -> Tiến hành lưu trữ email
                if (isResigning) {
                    archivedEmail = getArchivedEmail(employee.email);

                    // 1. Cập nhật email trong Supabase Auth
                    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
                        employeeId,
                        { email: archivedEmail }
                    );

                    if (authUpdateError) {
                        console.error('[STATUS_API] Supabase Auth update failed:', authUpdateError);
                        return NextResponse.json({
                            error: `Không thể đổi email xác thực: ${authUpdateError.message}`
                        }, { status: 400 });
                    }

                    console.log(`[STATUS_API] Archived Auth email: ${employee.email} -> ${archivedEmail}`);
                }

                // B. Cập nhật bản ghi cơ sở dữ liệu public.users
                const updateData: Record<string, any> = {
                    status: newStatus,
                    is_active: newStatus === 'active',
                    status_changed_at: nowStr,
                    status_reason: reason?.trim() || null,
                    updated_at: nowStr,
                    resigned_date: isResigning ? (resignedDate || todayStr) : null,
                    email: archivedEmail // Cập nhật email lưu trữ nếu có
                };

                const { error: updateErr } = await supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', employeeId);

                if (updateErr) {
                    console.error('[STATUS_API] public.users update failed:', updateErr);
                    throw updateErr;
                }

                // C. Tác vụ phụ trợ cho nghỉ việc / tạm dừng
                let cancelledCount = 0;
                if (newStatus === 'resigned' || newStatus === 'paused') {
                    // Hủy các suất ăn ngày hôm nay và tương lai
                    const { data: cancelledOrders, error: cancelErr } = await supabaseAdmin
                        .from('orders')
                        .update({
                            status: 'not_eating',
                            updated_at: nowStr,
                            source: 'admin_status_change',
                        })
                        .eq('user_id', employeeId)
                        .eq('status', 'eating')
                        .gte('date', todayStr)
                        .select('id');

                    if (cancelErr) throw cancelErr;
                    cancelledCount = cancelledOrders?.length || 0;

                    // Nếu nghỉ việc hẳn: xóa khỏi nhóm ăn và tắt notifications
                    if (newStatus === 'resigned') {
                        await supabaseAdmin.from('users').update({ group_id: null }).eq('id', employeeId);
                        await supabaseAdmin.from('push_subscriptions').update({ is_active: false }).eq('user_id', employeeId);
                    }
                }

                // D. Ghi log hoạt động đổi trạng thái
                await supabase.from('activity_logs').insert({
                    tenant_id: currentProfile.tenant_id,
                    action: 'CHANGE_EMPLOYEE_STATUS',
                    performed_by: currentUser.id,
                    performer_name: currentProfile.full_name,
                    target_type: 'user',
                    target_id: employeeId,
                    details: {
                        employee_name: employee.full_name,
                        before: employee.status,
                        after: newStatus,
                        reason: reason?.trim() || `Đổi trạng thái thành ${newStatus}`,
                        cancelled_orders_count: cancelledCount,
                        email_archived: isResigning ? { before: employee.email, after: archivedEmail } : null
                    }
                });

                return NextResponse.json({ success: true });
            }
        }

        return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 });

    } catch (error: any) {
        console.error('[STATUS_API] Unexpected error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
