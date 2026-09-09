import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkResourceLimit } from '@/lib/supabase/tenant-features';

/**
 * GET /api/admin/groups
 * List all groups with shift details and member count
 */
export async function GET() {
    try {
        const supabase = await createClient();

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

        // Use admin client with tenant filtering
        const adminClient = createAdminClient();

        // Fetch groups with shift relation, filtered by tenant
        const { data: groups, error } = await adminClient
            .from('groups')
            .select(`
                *,
                shift:shifts (*)
            `)
            .eq('tenant_id', currentProfile.tenant_id) // ✅ TENANT ISOLATION
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get member counts for each group (tenant already filtered from groups)
        const groupsWithCounts = await Promise.all(
            (groups || []).map(async (group) => {
                const { count } = await adminClient
                    .from('users')
                    .select('*', { count: 'exact', head: true })
                    .eq('group_id', group.id)
                    .eq('tenant_id', currentProfile.tenant_id) // ✅ DOUBLE-CHECK TENANT
                    .in('status', ['active', 'paused']); // ✅ AUDIT-FIX: Exclude resigned

                return {
                    ...group,
                    member_count: count || 0
                };
            })
        );

        return NextResponse.json({ data: groupsWithCounts });
    } catch (error: any) {
        console.error('GET /api/admin/groups error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/groups
 * Create new group
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current user's tenant_id and role
        const { data: currentProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!currentProfile?.tenant_id) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });
        }

        // Check role
        const role = currentProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        const body = await req.json();
        const { name, shift_id, table_area, department } = body;

        // Validation
        if (!name) {
            return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
        }

        // ===== LIMIT CHECK: max_groups =====
        const limitCheck = await checkResourceLimit(currentProfile.tenant_id, 'groups');
        if (!limitCheck.allowed) {
            return NextResponse.json({ error: limitCheck.message }, { status: 403 });
        }

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

        const { data, error } = await supabase
            .from('groups')
            .insert({
                tenant_id: currentProfile.tenant_id,  // REQUIRED for RLS
                name,
                shift_id: shift_id || null,
                table_area: table_area || null,
                department: department || null
            })
            .select(`
                *,
                shift:shifts (*)
            `)
            .single();

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: currentProfile.tenant_id,
            action: 'group_created',
            performed_by: user.id,
            target_type: 'group',
            target_id: data.id,
            details: { name, shift_id: shift_id || null, table_area: table_area || null, department: department || null }
        });

        return NextResponse.json({ data }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/groups error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
