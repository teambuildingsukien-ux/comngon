import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// 🔔 PUSH NOTIFICATION HELPERS
// Single Source of Truth cho gửi push notification
// ============================================

// Configure web-push with VAPID keys (singleton)
let vapidConfigured = false;
function ensureVapidConfigured() {
    if (vapidConfigured) return;
    webpush.setVapidDetails(
        `mailto:${process.env.VAPID_EMAIL || 'admin@comngon.io.vn'}`,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
    );
    vapidConfigured = true;
}

export interface PushResult {
    sent: number;
    failed: number;
    total: number;
    expired_cleaned: number;
}

/**
 * sendPushToTenant — Gửi push notification đến tất cả thiết bị đã đăng ký trong tenant
 * 
 * @param tenantId - Tenant ID
 * @param title - Tiêu đề thông báo
 * @param body - Nội dung thông báo
 * @param options - { target_audience, target_id, url, tag }
 * 
 * AUDIT-GUARD: Hàm này là Single Source of Truth cho gửi push.
 * Mọi nơi muốn gửi push notification phải gọi hàm này.
 */
export async function sendPushToTenant(
    tenantId: string,
    title: string,
    body: string,
    options?: {
        target_audience?: 'all' | 'employees' | 'kitchen' | 'group';
        target_id?: string;
        url?: string;
        tag?: string;
    }
): Promise<PushResult> {
    ensureVapidConfigured();
    const adminClient = createAdminClient();

    // Build query for subscriptions
    let query = adminClient
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

    // Filter by target audience if needed
    const audience = options?.target_audience || 'all';
    if (audience === 'group' && options?.target_id) {
        const { data: groupUsers } = await adminClient
            .from('users')
            .select('id')
            .eq('group_id', options.target_id)
            .eq('tenant_id', tenantId)
            .in('status', ['active', 'paused']);

        if (groupUsers && groupUsers.length > 0) {
            query = query.in('user_id', groupUsers.map(u => u.id));
        }
    } else if (audience === 'employees') {
        const { data: employees } = await adminClient
            .from('users')
            .select('id')
            .eq('role', 'employee')
            .eq('tenant_id', tenantId)
            .in('status', ['active', 'paused']);

        if (employees && employees.length > 0) {
            query = query.in('user_id', employees.map(u => u.id));
        }
    } else if (audience === 'kitchen') {
        const { data: kitchenStaff } = await adminClient
            .from('users')
            .select('id')
            .eq('role', 'kitchen')
            .eq('tenant_id', tenantId)
            .in('status', ['active', 'paused']);

        if (kitchenStaff && kitchenStaff.length > 0) {
            query = query.in('user_id', kitchenStaff.map(u => u.id));
        }
    }

    const { data: subscriptions, error } = await query;

    if (error) {
        console.error('[Push Helper] Query error:', error);
        throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
        console.log('[Push Helper] No active subscriptions found');
        return { sent: 0, failed: 0, total: 0, expired_cleaned: 0 };
    }

    // Build push payload
    const payload = JSON.stringify({
        title,
        body,
        icon: '/logo.png',
        tag: options?.tag || `comngon-${Date.now()}`,
        url: options?.url || '/dashboard'
    });

    // Send push to all subscriptions
    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    const pushPromises = subscriptions.map(async (sub) => {
        try {
            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                },
                payload
            );
            sent++;
        } catch (err: any) {
            failed++;
            // If subscription expired (410 Gone or 404), mark as inactive
            if (err.statusCode === 410 || err.statusCode === 404) {
                expiredEndpoints.push(sub.endpoint);
            }
            console.error(`[Push Helper] Failed for endpoint ${sub.endpoint.substring(0, 50)}...:`, err.statusCode || err.message);
        }
    });

    await Promise.allSettled(pushPromises);

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
        await adminClient
            .from('push_subscriptions')
            .update({ is_active: false })
            .in('endpoint', expiredEndpoints);
        console.log(`[Push Helper] Cleaned ${expiredEndpoints.length} expired subscriptions`);
    }

    console.log(`[Push Helper] Push result: ${sent}/${subscriptions.length} sent, ${failed} failed, ${expiredEndpoints.length} expired`);

    return {
        sent,
        failed,
        total: subscriptions.length,
        expired_cleaned: expiredEndpoints.length
    };
}
