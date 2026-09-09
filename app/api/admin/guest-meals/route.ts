import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin', 'manager'];

/**
 * GET /api/admin/guest-meals?date=YYYY-MM-DD
 * Lấy danh sách suất ăn phát sinh theo ngày (mặc định hôm nay)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
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

        if (!profile || !ADMIN_ROLES.includes(profile.role?.toLowerCase())) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        let query = supabase
            .from('guest_meals')
            .select('id, date, quantity, note, created_by, created_at')
            .eq('tenant_id', profile.tenant_id)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });

        if (date) {
            query = query.eq('date', date);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching guest meals:', error);
            return NextResponse.json({ error: 'Failed to fetch guest meals' }, { status: 500 });
        }

        // Batch lookup requester names
        let userNameMap: Record<string, string> = {};
        const creatorIds = [...new Set((data || []).map((gm: any) => gm.created_by).filter(Boolean))];
        if (creatorIds.length > 0) {
            const { data: usersData } = await supabase
                .from('users')
                .select('id, full_name')
                .in('id', creatorIds);
            (usersData || []).forEach((u: any) => { userNameMap[u.id] = u.full_name; });
        }

        // Map to include requester_name for API consumers
        const enrichedData = (data || []).map((gm: any) => ({
            ...gm,
            requester_name: userNameMap[gm.created_by] || 'Không rõ',
        }));

        // Calculate total for the date
        const total = enrichedData.reduce((sum: number, item: any) => sum + item.quantity, 0);

        return NextResponse.json({
            success: true,
            data: enrichedData,
            total,
        });
    } catch (error: unknown) {
        console.error('Guest meals GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/guest-meals
 * Tạo suất ăn phát sinh mới
 * Body: { date, quantity, note }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id, full_name')
            .eq('id', user.id)
            .single();

        if (!profile || !ADMIN_ROLES.includes(profile.role?.toLowerCase())) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { date, quantity, note } = body;

        // Validation
        if (!date || !quantity) {
            return NextResponse.json({ error: 'date and quantity are required' }, { status: 400 });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 });
        }

        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1 || qty > 100) {
            return NextResponse.json({ error: 'Quantity must be between 1-100' }, { status: 400 });
        }

        // Strip HTML tags from note for XSS protection
        const sanitizedNote = note ? String(note).replace(/<[^>]*>/g, '').trim().substring(0, 500) : null;

        // Insert
        const { data: newEntry, error } = await supabase
            .from('guest_meals')
            .insert({
                date,
                quantity: qty,
                note: sanitizedNote,
                created_by: user.id,
                tenant_id: profile.tenant_id,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating guest meal:', error);
            return NextResponse.json({ error: 'Failed to create guest meal' }, { status: 500 });
        }

        // Activity log (best effort — errors here don't affect response)
        await supabase.from('activity_logs').insert({
            // ⚠️ AUDIT-GUARD: column is performed_by, NOT user_id
            performed_by: user.id,
            action: 'ADD_GUEST_MEALS',
            details: `${profile.full_name} thêm ${qty} suất phát sinh ngày ${date}${sanitizedNote ? ': ' + sanitizedNote : ''}`,
            tenant_id: profile.tenant_id,
        });

        return NextResponse.json({ success: true, data: newEntry }, { status: 201 });
    } catch (error: unknown) {
        console.error('Guest meals POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/guest-meals?id=UUID
 * Xóa suất ăn phát sinh
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role, tenant_id, full_name')
            .eq('id', user.id)
            .single();

        if (!profile || !ADMIN_ROLES.includes(profile.role?.toLowerCase())) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Get entry info for log before deleting
        const { data: entry } = await supabase
            .from('guest_meals')
            .select('date, quantity, note')
            .eq('id', id)
            .eq('tenant_id', profile.tenant_id)
            .single();

        if (!entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('guest_meals')
            .delete()
            .eq('id', id)
            .eq('tenant_id', profile.tenant_id);

        if (error) {
            console.error('Error deleting guest meal:', error);
            return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
        }

        // Activity log (best effort)
        await supabase.from('activity_logs').insert({
            // ⚠️ AUDIT-GUARD: column is performed_by, NOT user_id
            performed_by: user.id,
            action: 'DELETE_GUEST_MEALS',
            details: `${profile.full_name} xóa ${entry.quantity} suất phát sinh ngày ${entry.date}`,
            tenant_id: profile.tenant_id,
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Guest meals DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
