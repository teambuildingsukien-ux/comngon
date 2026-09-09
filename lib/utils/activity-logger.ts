import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper ghi activity log thống nhất cho toàn bộ app.
 * Dùng cho cả admin actions + employee actions + cron jobs.
 */
export async function logActivity(
    supabase: SupabaseClient,
    params: {
        action: string;
        performedBy: string;
        performerName?: string;
        tenantId: string;
        targetType?: string;
        targetId?: string;
        details?: Record<string, any>;
    }
) {
    try {
        const { error } = await supabase.from('activity_logs').insert({
            action: params.action,
            performed_by: params.performedBy,
            performer_name: params.performerName || null,
            tenant_id: params.tenantId,
            target_type: params.targetType || null,
            target_id: params.targetId || null,
            details: params.details || {},
        });
        if (error) {
            console.error(`[logActivity] Failed to log "${params.action}":`, error.message);
        }
    } catch (err) {
        // Never throw — logging should not break the main flow
        console.error('[logActivity] Exception:', err);
    }
}
