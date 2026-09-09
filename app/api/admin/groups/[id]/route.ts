import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PUT /api/admin/groups/[id]
 * Update group details
 */
export async function PUT(
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

        // Check role
        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();
        const putRole = profile?.role?.toLowerCase();
        if (!putRole || !['admin', 'manager'].includes(putRole)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        const body = await req.json();
        const { name, shift_id, table_area, department, registration_mode } = body;

        // Check shift exists if provided
        if (shift_id) {
            const { data: shift } = await supabase
                .from('shifts')
                .select('id')
                .eq('id', shift_id)
                .single();

            if (!shift) {
                return NextResponse.json({ error: 'Shift not found' }, { status: 400 });
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (shift_id !== undefined) updateData.shift_id = shift_id;
        if (table_area !== undefined) updateData.table_area = table_area;
        if (department !== undefined) updateData.department = department;
        if (registration_mode !== undefined) updateData.registration_mode = registration_mode;

        const { data, error } = await supabase
            .from('groups')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                shift:shifts (*)
            `)
            .single();

        if (error) throw error;

        // ⚠️ OPT-IN FIX: Khi admin đổi chế độ nhóm → bulk update default_meal_status
        // cho TẤT CẢ NV trong nhóm để đồng bộ
        if (registration_mode !== undefined) {
            const newDefaultStatus = registration_mode === 'opt_in' ? 'not_eating' : 'eating';
            const { error: bulkError, count } = await supabase
                .from('users')
                .update({ default_meal_status: newDefaultStatus })
                .eq('group_id', id);

            if (bulkError) {
                console.error(`[GROUP_MODE_CHANGE] Bulk update default_meal_status failed:`, bulkError);
            } else {
                console.log(`[GROUP_MODE_CHANGE] Updated ${count} members to default_meal_status=${newDefaultStatus}`);
            }
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: profile?.tenant_id,
            action: 'group_updated',
            performed_by: user.id,
            target_type: 'group',
            target_id: id,
            details: { ...updateData, members_status_synced: registration_mode !== undefined }
        });

        return NextResponse.json({ data });
    } catch (error: any) {
        console.error('PUT /api/admin/groups/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/groups/[id]
 * Delete group (warning if has members)
 */
export async function DELETE(
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

        // Check role
        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();
        const role = profile?.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // Check if group has members
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', id)
            .in('status', ['active', 'paused']); // ✅ Exclude resigned from count

        if (count && count > 0) {
            // Set all members' group_id to null + reset default_meal_status before deleting
            // ⚠️ AUDIT-FIX: Reset default_meal_status when group is deleted
            await supabase
                .from('users')
                .update({ group_id: null, default_meal_status: 'eating' })
                .eq('group_id', id);
        }

        const { error } = await supabase
            .from('groups')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: profile?.tenant_id,
            action: 'group_deleted',
            performed_by: user.id,
            target_type: 'group',
            target_id: id,
            details: { removed_members: count || 0 }
        });

        return NextResponse.json({ success: true, removedMembers: count || 0 });
    } catch (error: any) {
        console.error('DELETE /api/admin/groups/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
