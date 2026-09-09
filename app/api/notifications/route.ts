import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/notifications — Fetch notifications for current user
 * POST /api/notifications — Mark notification as read
 */

export async function GET(request: NextRequest) {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get user profile (tenant_id + group_id)
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, group_id, role')
            .eq('id', user.id)
            .single();

        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        // Use service role to bypass RLS for complex query
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Fetch all active notifications for this tenant
        const { data: notifications, error } = await adminClient
            .from('notifications')
            .select(`
                id, title, message, type, target_audience, target_id,
                created_by, is_active, created_at
            `)
            .eq('tenant_id', profile.tenant_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Filter by target audience
        const filteredNotifications = (notifications || []).filter(n => {
            if (n.target_audience === 'all') return true;
            if (n.target_audience === 'employees' && profile.role === 'employee') return true;
            if (n.target_audience === 'kitchen' && profile.role === 'kitchen') return true;
            if (n.target_audience === 'group' && n.target_id === profile.group_id) return true;
            // Admin/manager always sees all
            if (['admin', 'manager'].includes(profile.role)) return true;
            return false;
        });

        // Get read status for current user
        const { data: reads } = await adminClient
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', user.id);

        const readSet = new Set((reads || []).map(r => r.notification_id));

        // Merge read status
        const result = filteredNotifications.map(n => ({
            ...n,
            is_read: readSet.has(n.id)
        }));

        const unreadCount = result.filter(n => !n.is_read).length;

        return NextResponse.json({
            data: result,
            unread_count: unreadCount
        });

    } catch (error: any) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { notification_id, action } = body;

        if (action === 'mark_read' && notification_id) {
            // Mark single notification as read
            const { error } = await supabase
                .from('notification_reads')
                .upsert({
                    notification_id,
                    user_id: user.id,
                    read_at: new Date().toISOString()
                }, { onConflict: 'notification_id,user_id' });

            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === 'mark_all_read') {
            // Get user tenant
            const { data: profile } = await supabase
                .from('users')
                .select('tenant_id, group_id, role')
                .eq('id', user.id)
                .single();

            if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

            const adminClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Get all unread notifications for this user
            const { data: allNotifs } = await adminClient
                .from('notifications')
                .select('id')
                .eq('tenant_id', profile.tenant_id)
                .eq('is_active', true);

            const { data: existingReads } = await adminClient
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id);

            const readSet = new Set((existingReads || []).map(r => r.notification_id));
            const unreadIds = (allNotifs || []).filter(n => !readSet.has(n.id)).map(n => n.id);

            if (unreadIds.length > 0) {
                const inserts = unreadIds.map(nid => ({
                    notification_id: nid,
                    user_id: user.id,
                    read_at: new Date().toISOString()
                }));

                const { error } = await adminClient
                    .from('notification_reads')
                    .upsert(inserts, { onConflict: 'notification_id,user_id' });

                if (error) throw error;
            }

            return NextResponse.json({ success: true, marked: unreadIds.length });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Error handling notification action:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
