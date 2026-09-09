import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fullReindex } from '@/lib/ai-chat/indexer';
import { buildKnowledgeGraph } from '@/lib/ai-chat/graph-builder';

/**
 * POST /api/admin/ai-index
 * Trigger full re-index cho RAG vector store
 * Chỉ admin/manager mới được gọi
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        const role = userProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // Parse request body for type
        const body = await request.json().catch(() => ({}));
        const indexType = body.type || 'all'; // 'rag' | 'graph' | 'all'

        let ragResults = null;
        let graphResult = null;

        // Run RAG re-index
        if (indexType === 'rag' || indexType === 'all') {
            ragResults = await fullReindex(supabase, userProfile.tenant_id);
        }

        // Run Knowledge Graph build
        if (indexType === 'graph' || indexType === 'all') {
            graphResult = await buildKnowledgeGraph(supabase, userProfile.tenant_id);
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'ai_rag_reindex',
            performed_by: user.id,
            target_type: 'settings',
            details: {
                type: indexType,
                rag: ragResults ? ragResults.map(r => ({
                    source: r.source_type,
                    created: r.chunks_created,
                    deleted: r.chunks_deleted,
                    errors: r.errors.length,
                })) : null,
                graph: graphResult ? {
                    entities: graphResult.entities_created,
                    relationships: graphResult.relationships_created,
                    communities: graphResult.communities_created,
                    errors: graphResult.errors.length,
                } : null,
            },
        });

        const totalRagChunks = ragResults?.reduce((sum, r) => sum + r.chunks_created, 0) || 0;
        const totalRagErrors = ragResults?.reduce((sum, r) => sum + r.errors.length, 0) || 0;

        return NextResponse.json({
            success: true,
            data: {
                type: indexType,
                rag: ragResults ? { total_chunks: totalRagChunks, total_errors: totalRagErrors, details: ragResults } : null,
                graph: graphResult || null,
            },
        });
    } catch (error) {
        console.error('Error in POST /api/admin/ai-index:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/admin/ai-index
 * Lấy thông tin trạng thái index hiện tại
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        // Count RAG chunks by source type
        const { data: ragStats } = await supabase
            .from('ai_document_chunks')
            .select('source_type')
            .eq('tenant_id', userProfile.tenant_id);

        const ragBreakdown: Record<string, number> = {};
        (ragStats || []).forEach((row: { source_type: string }) => {
            ragBreakdown[row.source_type] = (ragBreakdown[row.source_type] || 0) + 1;
        });

        // Count KG stats
        const { count: entityCount } = await supabase
            .from('ai_kg_entities')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', userProfile.tenant_id);

        const { count: relCount } = await supabase
            .from('ai_kg_relationships')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', userProfile.tenant_id);

        const { count: commCount } = await supabase
            .from('ai_kg_communities')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', userProfile.tenant_id);

        return NextResponse.json({
            success: true,
            data: {
                rag: {
                    total_chunks: ragStats?.length || 0,
                    breakdown: ragBreakdown,
                },
                graph: {
                    entities: entityCount || 0,
                    relationships: relCount || 0,
                    communities: commCount || 0,
                },
            },
        });
    } catch (error) {
        console.error('Error in GET /api/admin/ai-index:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
