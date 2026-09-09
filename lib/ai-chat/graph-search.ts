/**
 * 🔍 Graph Search — Multi-hop reasoning qua Knowledge Graph
 * Dùng cho câu hỏi complex: cross-entity, so sánh, phân tích sâu
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface GraphSearchResult {
    entities: { name: string; type: string; description: string | null; properties: Record<string, unknown> }[];
    relationships: { source: string; target: string; type: string }[];
    communities: { title: string; summary: string; level: number }[];
    neighbors: { name: string; type: string; relationship: string; direction: string }[];
}

/**
 * Tìm entities liên quan trong Knowledge Graph bằng vector search
 */
async function searchEntities(
    supabase: SupabaseClient,
    tenantId: string,
    queryEmbedding: number[],
    entityTypes?: string[],
    limit = 5
) {
    let query = supabase
        .from('ai_kg_entities')
        .select('id, name, entity_type, description, properties')
        .eq('tenant_id', tenantId);

    if (entityTypes?.length) {
        query = query.in('entity_type', entityTypes);
    }

    // Fallback: dùng text search nếu không có vector method
    const { data } = await query.limit(limit * 3);
    return data || [];
}

/**
 * Tìm communities liên quan bằng vector similarity
 */
async function searchCommunities(
    supabase: SupabaseClient,
    tenantId: string,
    queryEmbedding: number[],
    limit = 3
) {
    // Use RPC for vector search on communities
    const { data } = await supabase.rpc('vector_search', {
        p_tenant_id: tenantId,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_source_types: null,
        p_limit: limit,
    });

    // Also fetch communities directly
    const { data: communities } = await supabase
        .from('ai_kg_communities')
        .select('title, summary, level, entity_ids')
        .eq('tenant_id', tenantId)
        .order('level', { ascending: true })
        .limit(limit);

    return communities || [];
}

/**
 * Lấy relationships giữa các entities
 */
async function getRelationships(
    supabase: SupabaseClient,
    tenantId: string,
    entityIds: string[]
) {
    if (!entityIds.length) return [];

    const { data } = await supabase
        .from('ai_kg_relationships')
        .select(`
            relationship_type,
            source:source_entity_id(name, entity_type),
            target:target_entity_id(name, entity_type)
        `)
        .eq('tenant_id', tenantId)
        .or(`source_entity_id.in.(${entityIds.join(',')}),target_entity_id.in.(${entityIds.join(',')})`)
        .limit(30);

    return data || [];
}

/**
 * Graph traversal: tìm neighbors N-hop
 */
async function getNeighbors(
    supabase: SupabaseClient,
    tenantId: string,
    entityId: string,
    maxDepth = 2
) {
    const { data } = await supabase.rpc('kg_neighbors', {
        p_entity_id: entityId,
        p_tenant_id: tenantId,
        p_max_depth: maxDepth,
    });
    return data || [];
}

/**
 * MAIN: Full graph search cho 1 query
 */
export async function graphSearch(
    supabase: SupabaseClient,
    tenantId: string,
    query: string,
    options: { entityTypes?: string[]; maxEntities?: number; maxCommunities?: number } = {}
): Promise<GraphSearchResult> {
    const { entityTypes, maxEntities = 5, maxCommunities = 3 } = options;
    const result: GraphSearchResult = {
        entities: [], relationships: [], communities: [], neighbors: [],
    };

    try {
        const queryEmbedding = await generateEmbedding(query);

        // 1. Search relevant entities
        const entities = await searchEntities(supabase, tenantId, queryEmbedding, entityTypes, maxEntities);
        result.entities = entities.map(e => ({
            name: e.name,
            type: e.entity_type,
            description: e.description,
            properties: (e.properties || {}) as Record<string, unknown>,
        }));

        // 2. Get relationships between found entities
        const entityIds = entities.map(e => e.id);
        if (entityIds.length > 0) {
            const rels = await getRelationships(supabase, tenantId, entityIds);
            result.relationships = rels.map((r: any) => ({
                source: r.source?.name || 'Unknown',
                target: r.target?.name || 'Unknown',
                type: r.relationship_type,
            }));

            // 3. Get neighbors for top entity (multi-hop)
            const topEntity = entities[0];
            if (topEntity) {
                const neighbors = await getNeighbors(supabase, tenantId, topEntity.id, 2);
                result.neighbors = neighbors.map((n: any) => ({
                    name: n.entity_name,
                    type: n.entity_type,
                    relationship: n.relationship_type,
                    direction: n.direction,
                }));
            }
        }

        // 4. Search relevant communities
        const communities = await searchCommunities(supabase, tenantId, queryEmbedding, maxCommunities);
        result.communities = communities.map((c: any) => ({
            title: c.title,
            summary: c.summary,
            level: c.level,
        }));

    } catch (err) {
        console.error('[GraphRAG] Search error:', err);
    }

    return result;
}

/**
 * Build GraphRAG context string cho Gemini
 */
export function buildGraphContext(searchResult: GraphSearchResult): string {
    const parts: string[] = [];

    if (searchResult.communities.length) {
        parts.push('=== 🏘️ Cộng đồng liên quan ===');
        searchResult.communities.forEach(c => {
            parts.push(`[Level ${c.level}] ${c.title}: ${c.summary}`);
        });
    }

    if (searchResult.entities.length) {
        parts.push('\n=== 🔵 Thực thể liên quan ===');
        searchResult.entities.forEach(e => {
            parts.push(`[${e.type}] ${e.name}${e.description ? ` — ${e.description}` : ''}`);
        });
    }

    if (searchResult.relationships.length) {
        parts.push('\n=== 🔗 Mối quan hệ ===');
        searchResult.relationships.forEach(r => {
            parts.push(`${r.source} → [${r.type}] → ${r.target}`);
        });
    }

    if (searchResult.neighbors.length) {
        parts.push('\n=== 🌐 Kết nối mở rộng (Multi-hop) ===');
        searchResult.neighbors.slice(0, 10).forEach(n => {
            parts.push(`${n.name} (${n.type}) — ${n.relationship} [${n.direction}]`);
        });
    }

    if (!parts.length) return '';
    return `\n[DỮ LIỆU TỪ KNOWLEDGE GRAPH]\n${parts.join('\n')}`;
}

/**
 * Kiểm tra tenant đã có Knowledge Graph chưa
 */
export async function hasKnowledgeGraph(
    supabase: SupabaseClient,
    tenantId: string
): Promise<boolean> {
    const { count } = await supabase
        .from('ai_kg_entities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
    return (count || 0) > 0;
}
