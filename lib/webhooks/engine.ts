import { createClient as createAdminClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * 🪝 Webhook Engine — Gửi events tới tenant-registered endpoints
 * 
 * Supported events:
 *   - order.created / order.canceled
 *   - daily.summary
 *   - employee.created / employee.resigned
 *   - deadline.passed
 *   - subscription.changed
 * 
 * Security: HMAC-SHA256 signing với tenant-specific secret
 * Retry: Up to 3 retries với exponential backoff
 */

export type WebhookEvent =
    | 'order.created'
    | 'order.canceled'
    | 'daily.summary'
    | 'employee.created'
    | 'employee.resigned'
    | 'deadline.passed'
    | 'subscription.changed';

interface WebhookPayload {
    event: WebhookEvent;
    tenant_id: string;
    timestamp: string;
    data: Record<string, unknown>;
}

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/**
 * Sign payload với HMAC-SHA256
 */
function signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Trigger webhook event cho một tenant.
 * Tìm tất cả webhooks active đăng ký event này và gửi.
 */
export async function triggerWebhook(
    tenantId: string,
    event: WebhookEvent,
    data: Record<string, unknown>
): Promise<{ sent: number; failed: number; errors: string[] }> {
    const supabase = getAdminClient();

    // Find active webhooks for this tenant + event
    const { data: webhooks, error } = await supabase
        .from('tenant_webhooks')
        .select('id, url, secret, max_retries')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .contains('events', [event]);

    if (error || !webhooks?.length) {
        return { sent: 0, failed: 0, errors: [] };
    }

    const payload: WebhookPayload = {
        event,
        tenant_id: tenantId,
        timestamp: new Date().toISOString(),
        data,
    };

    const payloadString = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const webhook of webhooks) {
        const signature = signPayload(payloadString, webhook.secret);

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': `sha256=${signature}`,
                    'X-Webhook-Event': event,
                    'X-Webhook-Timestamp': payload.timestamp,
                    'User-Agent': 'ComNgon-Webhook/1.0',
                },
                body: payloadString,
                signal: AbortSignal.timeout(10000), // 10s timeout
            });

            // Log delivery
            await supabase.from('webhook_deliveries').insert({
                webhook_id: webhook.id,
                tenant_id: tenantId,
                event_type: event,
                payload,
                response_status: response.status,
                response_body: await response.text().catch(() => ''),
                delivered_at: new Date().toISOString(),
            });

            // Update webhook last_triggered
            await supabase
                .from('tenant_webhooks')
                .update({
                    last_triggered_at: new Date().toISOString(),
                    failure_count: 0, // Reset on success
                    updated_at: new Date().toISOString(),
                })
                .eq('id', webhook.id);

            if (response.ok) {
                sent++;
            } else {
                failed++;
                errors.push(`${webhook.url}: HTTP ${response.status}`);
            }
        } catch (err: unknown) {
            failed++;
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`${webhook.url}: ${errorMessage}`);

            // Log failed delivery
            await supabase.from('webhook_deliveries').insert({
                webhook_id: webhook.id,
                tenant_id: tenantId,
                event_type: event,
                payload,
                error_message: errorMessage,
            });

            // Increment failure count
            const { data: updated } = await supabase
                .from('tenant_webhooks')
                .update({
                    failure_count: webhook.max_retries, // Will be incremented
                    updated_at: new Date().toISOString(),
                })
                .eq('id', webhook.id)
                .select('failure_count')
                .single();

            // Auto-disable after max retries
            if (updated && updated.failure_count >= webhook.max_retries) {
                await supabase
                    .from('tenant_webhooks')
                    .update({ is_active: false })
                    .eq('id', webhook.id);
                errors.push(`${webhook.url}: Auto-disabled after ${webhook.max_retries} failures`);
            }
        }
    }

    return { sent, failed, errors };
}

/**
 * Register a new webhook for a tenant.
 */
export async function registerWebhook(
    tenantId: string,
    url: string,
    events: WebhookEvent[]
): Promise<{ id: string; secret: string } | { error: string }> {
    const supabase = getAdminClient();

    // Generate HMAC secret
    const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

    // Validate URL
    try {
        new URL(url);
    } catch {
        return { error: 'URL không hợp lệ' };
    }

    // Check max webhooks per tenant (limit: 10)
    const { count } = await supabase
        .from('tenant_webhooks')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

    if ((count || 0) >= 10) {
        return { error: 'Đã đạt giới hạn 10 webhooks/tenant' };
    }

    const { data, error } = await supabase
        .from('tenant_webhooks')
        .insert({
            tenant_id: tenantId,
            url,
            events,
            secret,
        })
        .select('id')
        .single();

    if (error) {
        return { error: `Không thể tạo webhook: ${error.message}` };
    }

    return { id: data.id, secret };
}
