import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToTenant } from '@/lib/push-helpers';

const ALLOWED_ROLES = ['admin', 'manager', 'kitchen'];

/**
 * POST /api/admin/announcements
 * Gửi thông báo mới vào bảng `notifications` (hiển thị trong NotificationInbox)
 * Body: { content: string }
 * 
 * Kitchen sẽ auto-prefix [🍳 Bếp] ở client-side
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[Announcements API] Auth error:', authError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role, tenant_id, full_name')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('[Announcements API] Profile error:', profileError);
            return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
        }

        if (!ALLOWED_ROLES.includes(profile.role?.toLowerCase())) {
            return NextResponse.json({ error: 'Forbidden - role not allowed' }, { status: 403 });
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { content } = body;
        if (!content || !content.trim()) {
            return NextResponse.json({ error: 'content is required' }, { status: 400 });
        }

        // Sanitize
        const sanitizedContent = String(content).replace(/<[^>]*>/g, '').trim().substring(0, 500);

        // Determine source label
        const isKitchen = profile.role?.toLowerCase() === 'kitchen';
        const title = isKitchen ? '🍳 Thông báo từ Bếp' : '📢 Thông báo từ Admin';
        const type = 'info';

        // Use admin client (service role) to bypass RLS
        const adminSupabase = createAdminClient();

        // INSERT vào bảng notifications (giống admin gửi notification)
        const { data: newNotification, error: insertError } = await adminSupabase
            .from('notifications')
            .insert({
                tenant_id: profile.tenant_id,
                title: title,
                message: sanitizedContent,
                type: type,
                target_audience: 'all',
                created_by: user.id,
                is_active: true,
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Announcements API] Insert error:', insertError);
            return NextResponse.json({ error: `Insert failed: ${insertError.message}` }, { status: 500 });
        }

        // Activity log (best effort)
        try {
            await adminSupabase.from('activity_logs').insert({
                performed_by: user.id,
                action: 'SEND_NOTIFICATION',
                details: `${profile.full_name} (${profile.role}) gửi thông báo: "${sanitizedContent.substring(0, 100)}"`,
                tenant_id: profile.tenant_id,
            });
        } catch { /* best effort */ }

        // 🔔 PUSH NOTIFICATION — Gửi push đến thiết bị đã đăng ký
        // AUDIT-GUARD: Đây là fix cho bug "thông báo không push ra thiết bị"
        try {
            const pushResult = await sendPushToTenant(
                profile.tenant_id,
                title,
                sanitizedContent,
                { target_audience: 'all', url: '/dashboard' }
            );
            console.log(`[Announcements API] Push result: ${pushResult.sent}/${pushResult.total} sent`);
        } catch (pushErr) {
            // Push fail không ảnh hưởng notification đã lưu DB
            console.warn('[Announcements API] Push send failed (non-critical):', pushErr);
        }

        console.log('[Announcements API] Success:', newNotification?.id);
        return NextResponse.json({ success: true, data: newNotification }, { status: 201 });
    } catch (error: unknown) {
        console.error('[Announcements API] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
