import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PUT /api/admin/shifts/[id]
 * Update shift
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

        const body = await req.json();
        const { name, start_time, end_time } = body;

        // Get tenant_id for logging
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        // Validation
        if (start_time && end_time && start_time >= end_time) {
            return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 });
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        if (start_time) updateData.start_time = start_time;
        if (end_time) updateData.end_time = end_time;

        const { data, error } = await supabase
            .from('shifts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: profile?.tenant_id,
            action: 'shift_updated',
            performed_by: user.id,
            target_type: 'shift',
            target_id: id,
            details: updateData
        });

        return NextResponse.json({ data });
    } catch (error: any) {
        console.error('PUT /api/admin/shifts/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/shifts/[id]
 * Delete shift (only if no groups assigned)
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

        // Get tenant_id for logging
        const { data: delProfile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        // Check if shift has groups
        const { count } = await supabase
            .from('groups')
            .select('*', { count: 'exact', head: true })
            .eq('shift_id', id);

        if (count && count > 0) {
            return NextResponse.json(
                { error: `Không thể xóa ca ăn này. Có ${count} nhóm đang sử dụng ca này.` },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('shifts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: delProfile?.tenant_id,
            action: 'shift_deleted',
            performed_by: user.id,
            target_type: 'shift',
            target_id: id,
            details: {}
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('DELETE /api/admin/shifts/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
