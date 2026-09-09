import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * PATCH /api/admin/api-keys/[id]
 * Cập nhật API key (tên, active, scopes)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        const body = await req.json();
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) updateData.name = body.name;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;
        if (body.scopes !== undefined) updateData.scopes = body.scopes;

        const supabaseAdmin = createAdminClient();
        const { error: updateError } = await supabaseAdmin
            .from('tenant_api_keys')
            .update(updateData)
            .eq('id', id)
            .eq('tenant_id', profile.tenant_id);

        if (updateError) {
            return NextResponse.json({ error: 'Không thể cập nhật API key' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('PATCH /api/admin/api-keys/[id] error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/api-keys/[id]
 * Xoá API key
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        const supabaseAdmin = createAdminClient();
        const { error: deleteError } = await supabaseAdmin
            .from('tenant_api_keys')
            .delete()
            .eq('id', id)
            .eq('tenant_id', profile.tenant_id);

        if (deleteError) {
            return NextResponse.json({ error: 'Không thể xoá API key' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('DELETE /api/admin/api-keys/[id] error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
