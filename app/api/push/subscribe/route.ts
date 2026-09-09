import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/push/subscribe — Register push subscription
 * DELETE /api/push/subscribe — Unregister push subscription
 */

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { subscription, deviceInfo } = await request.json();

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
        }

        // Get user tenant + status
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, status')
            .eq('id', user.id)
            .single();

        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        // ✅ Block resigned users from subscribing to push
        if (profile.status === 'resigned') {
            return NextResponse.json({ error: 'Tài khoản đã nghỉ việc' }, { status: 403 });
        }

        // Upsert subscription (update if same user+endpoint exists)
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                user_id: user.id,
                tenant_id: profile.tenant_id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                device_info: deviceInfo || null,
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,endpoint' });

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Đăng ký push thành công' });

    } catch (error: any) {
        console.error('Push subscribe error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { endpoint } = await request.json();

        if (!endpoint) {
            return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', endpoint);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Đã hủy đăng ký push' });

    } catch (error: any) {
        console.error('Push unsubscribe error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
