/**
 * RAG Retriever — Tìm kiếm context thông minh cho AI
 * Thay thế context-stuffing bằng hybrid search (semantic + keyword)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
    id: string;
    content: string;
    source_type: string;
    source_id: string | null;
    metadata: Record<string, unknown>;
    score: number;
}

/**
 * Tìm kiếm hybrid: vector + keyword + RRF fusion
 */
export async function retrieveContext(
    supabase: SupabaseClient,
    tenantId: string,
    query: string,
    options: {
        sourceTypes?: string[];
        limit?: number;
    } = {}
): Promise<RetrievedChunk[]> {
    const { sourceTypes = null, limit = 10 } = options;

    try {
        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);

        // Call hybrid search RPC
        const { data, error } = await supabase.rpc('hybrid_search', {
            p_tenant_id: tenantId,
            p_query_embedding: JSON.stringify(queryEmbedding),
            p_query_text: query,
            p_source_types: sourceTypes,
            p_limit: limit,
            p_rrf_k: 60,
        });

        if (error) {
            console.error('[RAG] Hybrid search error:', error);
            // Fallback to vector-only search
            return await vectorOnlySearch(supabase, tenantId, queryEmbedding, sourceTypes, limit);
        }

        if (!data?.length) {
            // Nếu hybrid search trả về 0 kết quả, thử vector-only
            return await vectorOnlySearch(supabase, tenantId, queryEmbedding, sourceTypes, limit);
        }

        return data.map((row: Record<string, unknown>) => ({
            id: row.chunk_id as string,
            content: row.content as string,
            source_type: row.source_type as string,
            source_id: row.source_id as string | null,
            metadata: (row.metadata || {}) as Record<string, unknown>,
            score: row.rrf_score as number,
        }));
    } catch (err) {
        console.error('[RAG] Retrieval error:', err);
        return [];
    }
}

/**
 * Vector-only search (fallback khi FTS không có kết quả)
 */
async function vectorOnlySearch(
    supabase: SupabaseClient,
    tenantId: string,
    queryEmbedding: number[],
    sourceTypes: string[] | null,
    limit: number
): Promise<RetrievedChunk[]> {
    const { data, error } = await supabase.rpc('vector_search', {
        p_tenant_id: tenantId,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_source_types: sourceTypes,
        p_limit: limit,
    });

    if (error || !data?.length) return [];

    return data.map((row: Record<string, unknown>) => ({
        id: row.chunk_id as string,
        content: row.content as string,
        source_type: row.source_type as string,
        source_id: row.source_id as string | null,
        metadata: (row.metadata || {}) as Record<string, unknown>,
        score: row.similarity as number,
    }));
}

/**
 * Build context string từ retrieved chunks
 * Format cho Gemini system instruction
 */
export function buildRAGContext(chunks: RetrievedChunk[]): string {
    if (!chunks.length) return '';

    const groupedByType: Record<string, string[]> = {};

    for (const chunk of chunks) {
        const type = chunk.source_type;
        if (!groupedByType[type]) groupedByType[type] = [];
        groupedByType[type].push(chunk.content);
    }

    const typeLabels: Record<string, string> = {
        knowledge_base: '📚 Knowledge Base',
        daily_summary: '📊 Thống kê suất ăn',
        employee_profile: '👤 Thông tin nhân viên',
        announcement: '📢 Thông báo',
        system_config: '⚙️ Cài đặt hệ thống',
        monthly_stats: '📈 Thống kê tháng',
    };

    const sections = Object.entries(groupedByType).map(([type, contents]) => {
        const label = typeLabels[type] || type;
        return `=== ${label} ===\n${contents.join('\n---\n')}`;
    });

    return `\n[DỮ LIỆU LIÊN QUAN TỪ RAG SEARCH]\n${sections.join('\n\n')}`;
}

/**
 * Kiểm tra xem tenant đã có indexed chunks chưa
 */
export async function hasIndexedData(
    supabase: SupabaseClient,
    tenantId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from('ai_document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

    if (error) return false;
    return (count || 0) > 0;
}
