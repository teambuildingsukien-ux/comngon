import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fullReindex } from '@/lib/ai-chat/indexer';
import { buildKnowledgeGraph } from '@/lib/ai-chat/graph-builder';

/**
 * POST /api/cron/ai-sync
 * Trigger RAG re-index và Knowledge Graph build cho các tenant có tính năng AI
 * Auth: CRON_SECRET header (Vercel cron)
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // ⚠️ AUDIT-FIX: CRON_SECRET bắt buộc phải được set
    if (!cronSecret) {
        console.error('[Cron/ai-sync] CRON_SECRET not configured — rejecting request for safety');
        return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const startTime = Date.now();
        const supabaseAdmin = createAdminClient();
        
        // ✅ FIX #5: Chỉ fetch tenant active, bỏ qua deleted/churned
        const { data: tenants, error } = await supabaseAdmin
            .from('tenants')
            .select('id, name, feature_flags, plan')
            .eq('is_active', true);
            
        if (error || !tenants) {
            return NextResponse.json({ success: true, count: 0 });
        }

        let count = 0;
        const errors: string[] = [];
        
        for (const tenant of tenants) {
            // Kiểm tra xem tenant có bật AI Chat không
            const flags = tenant.feature_flags as Record<string, any> | null;
            const hasAiChat = flags?.ai_chat !== undefined 
                ? flags.ai_chat === true 
                : ['pro', 'enterprise'].includes(tenant.plan || '');
                
            if (!hasAiChat) continue;

            try {
                // 1. Re-index RAG
                await fullReindex(supabaseAdmin, tenant.id);
                // 2. Build Knowledge Graph
                await buildKnowledgeGraph(supabaseAdmin, tenant.id);
                
                // 3. Update last_indexed_at trong tenant_ai_config
                await supabaseAdmin.from('tenant_ai_config').upsert({
                    tenant_id: tenant.id,
                    last_indexed_at: new Date().toISOString()
                }, { onConflict: 'tenant_id' });

                // 4. Log per-tenant sync
                await supabaseAdmin.from('activity_logs').insert({
                    tenant_id: tenant.id,
                    action: 'cron_ai_sync',
                    performed_by: '00000000-0000-0000-0000-000000000000',
                    performer_name: 'System (Cron)',
                    target_type: 'ai',
                    details: { status: 'success', tenant_name: tenant.name }
                });
                
                count++;
            } catch (err: any) {
                console.error(`AI Sync Error for tenant ${tenant.id}:`, err);
                errors.push(`${tenant.id}: ${err.message}`);
                // Log error per-tenant (non-blocking)
                try {
                    await supabaseAdmin.from('activity_logs').insert({
                        tenant_id: tenant.id,
                        action: 'cron_ai_sync',
                        performed_by: '00000000-0000-0000-0000-000000000000',
                        performer_name: 'System (Cron)',
                        target_type: 'ai',
                        details: { status: 'error', error: err.message, tenant_name: tenant.name }
                    });
                } catch { /* non-blocking */ }
            }
        }

        // Tổng kết log
        await supabaseAdmin.from('activity_logs').insert({
            tenant_id: null,
            action: 'cron_ai_sync_summary',
            performed_by: '00000000-0000-0000-0000-000000000000',
            performer_name: 'System (Cron)',
            target_type: 'system',
            details: {
                tenants_synced: count,
                total_errors: errors.length,
                duration_ms: Date.now() - startTime,
                errors: errors.length > 0 ? errors : undefined,
            }
        });
        
        return NextResponse.json({ success: true, count, errors: errors.length > 0 ? errors : undefined });
    } catch (error: any) {
        console.error('Fatal error in AI sync cron:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Vercel Cron Jobs gọi GET → proxy sang POST handler
export async function GET(request: NextRequest) {
    return POST(request);
}
