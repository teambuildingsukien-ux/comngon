import { NextRequest, NextResponse } from 'next/server';
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth';
import { registerWebhook, type WebhookEvent } from '@/lib/webhooks/engine';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const VALID_EVENTS: WebhookEvent[] = [
    'order.created', 'order.canceled', 'daily.summary',
    'employee.created', 'employee.resigned',
    'deadline.passed', 'subscription.changed',
];

/**
 * GET /api/v1/webhooks — List webhooks cho tenant
 */
export async function GET(request: NextRequest) {
    const auth = await authenticateDual(request, 'admin');
    if (!isAuthSuccess(auth)) return auth;

    const supabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
        .from('tenant_webhooks')
        .select('id, url, events, is_active, failure_count, last_triggered_at, created_at')
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, webhooks: data || [] });
}

/**
 * POST /api/v1/webhooks — Register new webhook
 * Body: { url, events }
 */
export async function POST(request: NextRequest) {
    const auth = await authenticateDual(request, 'admin');
    if (!isAuthSuccess(auth)) return auth;

    const body = await request.json();
    const { url, events } = body;

    if (!url || !events?.length) {
        return NextResponse.json(
            { error: 'url và events là bắt buộc' },
            { status: 400 }
        );
    }

    // Validate events
    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEvent));
    if (invalidEvents.length) {
        return NextResponse.json(
            { error: `Events không hợp lệ: ${invalidEvents.join(', ')}`, valid_events: VALID_EVENTS },
            { status: 400 }
        );
    }

    const result = await registerWebhook(auth.tenantId, url, events);

    if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
        success: true,
        webhook_id: result.id,
        secret: result.secret,
        message: 'Webhook đã được tạo. Lưu lại secret — nó sẽ không được hiển thị lại.',
    }, { status: 201 });
}

/**
 * DELETE /api/v1/webhooks?id=xxx — Delete webhook
 */
export async function DELETE(request: NextRequest) {
    const auth = await authenticateDual(request, 'admin');
    if (!isAuthSuccess(auth)) return auth;

    const webhookId = request.nextUrl.searchParams.get('id');
    if (!webhookId) {
        return NextResponse.json({ error: 'webhook id là bắt buộc' }, { status: 400 });
    }

    const supabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('tenant_webhooks')
        .delete()
        .eq('id', webhookId)
        .eq('tenant_id', auth.tenantId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Webhook đã xóa' });
}
