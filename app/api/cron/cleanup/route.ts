import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/cleanup
 * 
 * Cron job: Dọn dẹp dữ liệu cũ mỗi quý (90 ngày).
 * Xóa: activity_logs, ai_chat_history quá 90 ngày.
 * Auth: CRON_SECRET header (Vercel cron)
 */
export async function GET(request: NextRequest) {
    // ⚠️ AUDIT-FIX: CRON_SECRET bắt buộc phải được set — nếu không có = lỗi cấu hình
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[Cron/cleanup] CRON_SECRET not configured — rejecting request for safety');
        return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const startTime = Date.now();
        const supabase = createAdminClient();

        const now = new Date();
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffDate = ninetyDaysAgo.toISOString();

        const results = {
            activity_logs_deleted: 0,
            old_chat_messages_deleted: 0,
            timestamp: now.toISOString(),
        };

        // ===== 1. DELETE ACTIVITY LOGS > 90 DAYS =====
        const { count: logsDeleted } = await supabase
            .from('activity_logs')
            .delete({ count: 'exact' })
            .lt('created_at', cutoffDate);

        results.activity_logs_deleted = logsDeleted || 0;

        // ===== 2. DELETE OLD CHAT MESSAGES > 90 DAYS =====
        const { count: chatDeleted } = await supabase
            .from('ai_chat_history')
            .delete({ count: 'exact' })
            .lt('created_at', cutoffDate);

        results.old_chat_messages_deleted = chatDeleted || 0;

        console.log('[CRON] Cleanup completed:', results);

        // Ghi log cron execution
        await supabase.from('activity_logs').insert({
            tenant_id: null,
            action: 'cron_cleanup',
            performed_by: '00000000-0000-0000-0000-000000000000',
            performer_name: 'System (Cron)',
            target_type: 'system',
            details: {
                activity_logs_deleted: results.activity_logs_deleted,
                chat_messages_deleted: results.old_chat_messages_deleted,
                cutoff_date: cutoffDate,
                duration_ms: Date.now() - startTime,
            }
        });

        return NextResponse.json({
            success: true,
            ...results,
            message: `Đã xoá ${results.activity_logs_deleted} logs và ${results.old_chat_messages_deleted} tin nhắn cũ (>90 ngày)`,
        });

    } catch (error: any) {
        console.error('[CRON] Cleanup error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}
