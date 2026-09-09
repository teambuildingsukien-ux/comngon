import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/employees/unassigned
 * Get employees not assigned to any group
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
        const { data, error } = await adminClient
            .from('users')
            .select('id, full_name, email, employee_code, department, avatar_url, role, group_id')
            // Show employees from SAME TENANT only
            .eq('role', 'employee')
            .eq('tenant_id', currentProfile.tenant_id) // ✅ TENANT ISOLATION
            .in('status', ['active', 'paused']) // ✅ Exclude resigned employees
            .is('group_id', null) // ✅ Only unassigned employees
            .order('full_name', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ data: data || [] });
    } catch (error: any) {
        console.error('GET /api/admin/employees/unassigned error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

