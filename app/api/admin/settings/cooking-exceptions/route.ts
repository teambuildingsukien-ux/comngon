import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin', 'manager', 'kitchen'];

/**
 * GET /api/admin/settings/cooking-exceptions?month=2026-03
 * Lấy danh sách ngày ngoại lệ theo tháng
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single();
        if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

        const url = new URL(req.url);
        const month = url.searchParams.get('month');

        let query = supabase
            .from('cooking_exceptions')
            .select('id, date, type, reason, created_at')
            .eq('tenant_id', profile.tenant_id)
            .order('date', { ascending: true });

        if (month) {
            const [year, m] = month.split('-').map(Number);
            const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
            const lastDay = new Date(year, m, 0).toISOString().split('T')[0];
            query = query.gte('date', firstDay).lte('date', lastDay);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ data: data || [] });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/admin/settings/cooking-exceptions
 * Thêm/cập nhật exception: { date, type, reason }
 * 
 * ⚡ Logic cancel/restore orders được xử lý bởi DB TRIGGERS:
 * - trg_cooking_exception_auto_cancel (AFTER INSERT/UPDATE)
 * - trg_cooking_exception_auto_restore (BEFORE DELETE)
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single();
        if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

        const role = profile.role?.toLowerCase();
        if (!role || !ADMIN_ROLES.includes(role)) {
            return NextResponse.json({ error: 'Requires admin/manager/kitchen role' }, { status: 403 });
        }

        const body = await req.json();
        const { date, type, reason } = body;

        if (!date || !type) {
            return NextResponse.json({ error: 'date and type are required' }, { status: 400 });
        }
        if (!['no_cook', 'extra_cook'].includes(type)) {
            return NextResponse.json({ error: 'type must be no_cook or extra_cook' }, { status: 400 });
        }

        // Upsert exception — DB trigger sẽ auto-cancel orders nếu type=no_cook
        const { data, error } = await supabase
            .from('cooking_exceptions')
            .upsert({
                tenant_id: profile.tenant_id,
                date,
                type,
                reason: reason || '',
                created_by: user.id
            }, { onConflict: 'tenant_id,date' })
            .select('id, date, type, reason')
            .single();

        if (error) throw error;

        // Đọc lại activity_log để lấy cancelled_count (trigger đã insert)
        let cancelled_count = 0;
        let restored_count = 0;

        if (type === 'no_cook') {
            const { data: logs } = await supabase
                .from('activity_logs')
                .select('details')
                .eq('tenant_id', profile.tenant_id)
                .eq('action', 'cooking_exception_auto_cancel')
                .order('created_at', { ascending: false })
                .limit(1);

            const latestLog = logs?.[0];
            if (latestLog && latestLog.details?.date === date) {
                cancelled_count = (latestLog.details as Record<string, number>).cancelled_count || 0;
            }
        }

        return NextResponse.json({
            data,
            cancelled_count,
            restored_count
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/settings/cooking-exceptions
 * Xóa exception: { date }
 * 
 * ⚡ DB TRIGGER trg_cooking_exception_auto_restore tự khôi phục orders
 */
export async function DELETE(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).single();
        if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

        const role = profile.role?.toLowerCase();
        if (!role || !ADMIN_ROLES.includes(role)) {
            return NextResponse.json({ error: 'Requires admin/manager/kitchen role' }, { status: 403 });
        }

        const body = await req.json();
        const { date } = body;

        if (!date) {
            return NextResponse.json({ error: 'date is required' }, { status: 400 });
        }

        // Xóa exception — DB trigger sẽ auto-restore orders nếu type cũ là no_cook
        const { error } = await supabase
            .from('cooking_exceptions')
            .delete()
            .eq('tenant_id', profile.tenant_id)
            .eq('date', date);

        if (error) throw error;

        // Đọc lại activity_log để lấy restored_count (trigger đã insert)
        let restored_count = 0;
        const { data: logs } = await supabase
            .from('activity_logs')
            .select('details')
            .eq('tenant_id', profile.tenant_id)
            .eq('action', 'cooking_exception_restore_orders')
            .order('created_at', { ascending: false })
            .limit(1);

        const latestLog = logs?.[0];
        if (latestLog && latestLog.details?.date === date) {
            restored_count = (latestLog.details as Record<string, number>).restored_count || 0;
        }

        return NextResponse.json({ success: true, restored_count });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
