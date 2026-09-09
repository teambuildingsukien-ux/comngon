import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/admin/groups/[id]/members/[userId]
 * Remove employee from group
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; userId: string }> }
) {
    try {
        const supabase = await createClient();
        const { id: groupId, userId } = await params;

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check role
        const { data: callerProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        const role = callerProfile?.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // Use admin client to bypass RLS
        const adminClient = createAdminClient();

        // Verify target user belongs to same tenant
        const { data: targetUser } = await adminClient
            .from('users')
            .select('tenant_id')
            .eq('id', userId)
            .eq('group_id', groupId)
            .single();

        if (!targetUser || targetUser.tenant_id !== callerProfile?.tenant_id) {
            return NextResponse.json({ error: 'User not found in your tenant' }, { status: 404 });
        }

        // Remove user from group (set group_id to null + reset default_meal_status)
        // ⚠️ AUDIT-FIX: Reset default_meal_status to 'eating' when leaving opt-in group
        const { error } = await adminClient
            .from('users')
            .update({ group_id: null, default_meal_status: 'eating' })
            .eq('id', userId)
            .eq('group_id', groupId); // Double check user is in this group

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: callerProfile?.tenant_id,
            action: 'group_member_removed',
            performed_by: user.id,
            target_type: 'user',
            target_id: userId,
            details: { group_id: groupId }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('DELETE /api/admin/groups/[id]/members/[userId] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
