/**
 * 🔗 Knowledge Graph Builder
 * Trích xuất entities & relationships từ DB → build Knowledge Graph
 * Không cần LLM — dùng luật cứng từ schema DB
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateBatchEmbeddings } from './embeddings';

interface BuildResult {
    entities_created: number;
    relationships_created: number;
    communities_created: number;
    errors: string[];
}

// ===== ENTITY EXTRACTION (từ DB trực tiếp, không cần LLM) =====

async function extractAndStoreEntities(
    supabase: SupabaseClient,
    tenantId: string,
    tenantKeyEncoded?: string | null
): Promise<{ entityMap: Map<string, string>; errors: string[] }> {
    const entityMap = new Map<string, string>(); // sourceId → kg_entity_id
    const errors: string[] = [];

    // --- Departments ---
    const { data: depts } = await supabase
        .from('departments').select('id, name, description')
        .eq('tenant_id', tenantId);

    if (depts?.length) {
        const texts = depts.map(d => `Phòng ban: ${d.name}${d.description ? ` - ${d.description}` : ''}`);
        const embeddings = await generateBatchEmbeddings(texts, tenantKeyEncoded);

        for (let i = 0; i < depts.length; i++) {
            const { data: entity, error } = await supabase.from('ai_kg_entities').insert({
                tenant_id: tenantId,
                entity_type: 'department',
                name: depts[i].name,
                description: depts[i].description,
                properties: { source_id: depts[i].id },
                embedding: JSON.stringify(embeddings[i]),
            }).select('id').single();

            if (entity) entityMap.set(`dept:${depts[i].id}`, entity.id);
            if (error) errors.push(`Dept ${depts[i].name}: ${error.message}`);
        }
    }

    // --- Shifts ---
    const { data: shifts } = await supabase
        .from('shifts').select('id, name, start_time, end_time, description')
        .eq('tenant_id', tenantId).eq('active', true);

    if (shifts?.length) {
        const texts = shifts.map(s =>
            `Ca ăn: ${s.name} (${s.start_time || '?'} - ${s.end_time || '?'})${s.description ? ` - ${s.description}` : ''}`
        );
        const embeddings = await generateBatchEmbeddings(texts, tenantKeyEncoded);

        for (let i = 0; i < shifts.length; i++) {
            const { data: entity, error } = await supabase.from('ai_kg_entities').insert({
                tenant_id: tenantId,
                entity_type: 'shift',
                name: shifts[i].name,
                description: `${shifts[i].start_time} - ${shifts[i].end_time}`,
                properties: { source_id: shifts[i].id, start_time: shifts[i].start_time, end_time: shifts[i].end_time },
                embedding: JSON.stringify(embeddings[i]),
            }).select('id').single();

            if (entity) entityMap.set(`shift:${shifts[i].id}`, entity.id);
            if (error) errors.push(`Shift ${shifts[i].name}: ${error.message}`);
        }
    }

    // --- Groups ---
    const { data: groups } = await supabase
        .from('groups').select('id, name, department, shift_id, registration_mode, table_area, description')
        .eq('tenant_id', tenantId).eq('active', true);

    if (groups?.length) {
        const texts = groups.map(g =>
            `Nhóm ăn: ${g.name} | Phòng: ${g.department || 'N/A'} | Mode: ${g.registration_mode} | Khu vực: ${g.table_area || 'N/A'}`
        );
        const embeddings = await generateBatchEmbeddings(texts, tenantKeyEncoded);

        for (let i = 0; i < groups.length; i++) {
            const { data: entity, error } = await supabase.from('ai_kg_entities').insert({
                tenant_id: tenantId,
                entity_type: 'group',
                name: groups[i].name,
                description: groups[i].description,
                properties: {
                    source_id: groups[i].id,
                    department: groups[i].department,
                    shift_id: groups[i].shift_id,
                    registration_mode: groups[i].registration_mode,
                    table_area: groups[i].table_area,
                },
                embedding: JSON.stringify(embeddings[i]),
            }).select('id').single();

            if (entity) entityMap.set(`group:${groups[i].id}`, entity.id);
            if (error) errors.push(`Group ${groups[i].name}: ${error.message}`);
        }
    }

    // --- Employees (non-kitchen, non-deleted) ---
    const { data: employees } = await supabase
        .from('users')
        .select('id, full_name, department, role, status, default_meal_status, start_date, shift_id, group_id, employee_code')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

    const nonKitchen = employees?.filter(e => !e.role?.toLowerCase().includes('kitchen')) || [];

    if (nonKitchen.length) {
        // Batch embed in groups of 100
        const BATCH = 100;
        for (let b = 0; b < nonKitchen.length; b += BATCH) {
            const batch = nonKitchen.slice(b, b + BATCH);
            const texts = batch.map(e =>
                `NV: ${e.full_name} | Mã: ${e.employee_code || 'N/A'} | Phòng: ${e.department || 'N/A'} | Trạng thái: ${e.status || 'active'} | Mặc định: ${e.default_meal_status}`
            );
            const embeddings = await generateBatchEmbeddings(texts, tenantKeyEncoded);

            for (let i = 0; i < batch.length; i++) {
                const emp = batch[i];
                const { data: entity, error } = await supabase.from('ai_kg_entities').insert({
                    tenant_id: tenantId,
                    entity_type: 'employee',
                    name: emp.full_name || 'Unknown',
                    description: `${emp.role} - ${emp.department || 'Chưa phân phòng'}`,
                    properties: {
                        source_id: emp.id,
                        employee_code: emp.employee_code,
                        department: emp.department,
                        role: emp.role,
                        status: emp.status || 'active',
                        default_meal_status: emp.default_meal_status,
                        start_date: emp.start_date,
                        shift_id: emp.shift_id,
                        group_id: emp.group_id,
                    },
                    embedding: JSON.stringify(embeddings[i]),
                }).select('id').single();

                if (entity) entityMap.set(`emp:${emp.id}`, entity.id);
                if (error) errors.push(`Emp ${emp.full_name}: ${error.message}`);
            }
        }
    }

    // --- Knowledge Base Policies ---
    const { data: kbDocs } = await supabase
        .from('tenant_knowledge_base')
        .select('id, title, content, category')
        .eq('tenant_id', tenantId).eq('is_active', true);

    if (kbDocs?.length) {
        const texts = kbDocs.map(d => `[${d.category}] ${d.title}: ${d.content.slice(0, 500)}`);
        const embeddings = await generateBatchEmbeddings(texts, tenantKeyEncoded);

        for (let i = 0; i < kbDocs.length; i++) {
            const { data: entity, error } = await supabase.from('ai_kg_entities').insert({
                tenant_id: tenantId,
                entity_type: 'policy',
                name: kbDocs[i].title,
                description: kbDocs[i].content.slice(0, 200),
                properties: { source_id: kbDocs[i].id, category: kbDocs[i].category },
                embedding: JSON.stringify(embeddings[i]),
            }).select('id').single();

            if (entity) entityMap.set(`kb:${kbDocs[i].id}`, entity.id);
            if (error) errors.push(`KB ${kbDocs[i].title}: ${error.message}`);
        }
    }

    return { entityMap, errors };
}

// ===== RELATIONSHIP MAPPING (luật cứng từ FK schema) =====

async function buildRelationships(
    supabase: SupabaseClient,
    tenantId: string,
    entityMap: Map<string, string>
): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    const rels: {
        tenant_id: string;
        source_entity_id: string;
        target_entity_id: string;
        relationship_type: string;
        weight: number;
        properties: object;
    }[] = [];

    // Fetch employees for relationship building
    const { data: employees } = await supabase
        .from('users')
        .select('id, department, shift_id, group_id, role')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

    const { data: depts } = await supabase
        .from('departments').select('id, name')
        .eq('tenant_id', tenantId);

    // Build dept name → id map
    const deptNameToId = new Map<string, string>();
    depts?.forEach(d => deptNameToId.set(d.name, d.id));

    const nonKitchen = employees?.filter(e => !e.role?.toLowerCase().includes('kitchen')) || [];

    for (const emp of nonKitchen) {
        const empEntityId = entityMap.get(`emp:${emp.id}`);
        if (!empEntityId) continue;

        // Employee → belongs_to → Department
        if (emp.department) {
            const deptDbId = deptNameToId.get(emp.department);
            const deptEntityId = deptDbId ? entityMap.get(`dept:${deptDbId}`) : null;
            if (deptEntityId) {
                rels.push({
                    tenant_id: tenantId,
                    source_entity_id: empEntityId,
                    target_entity_id: deptEntityId,
                    relationship_type: 'belongs_to',
                    weight: 1.0,
                    properties: {},
                });
            }
        }

        // Employee → member_of → Group
        if (emp.group_id) {
            const groupEntityId = entityMap.get(`group:${emp.group_id}`);
            if (groupEntityId) {
                rels.push({
                    tenant_id: tenantId,
                    source_entity_id: empEntityId,
                    target_entity_id: groupEntityId,
                    relationship_type: 'member_of',
                    weight: 1.0,
                    properties: {},
                });
            }
        }

        // Employee → uses_shift → Shift (via group or direct)
        if (emp.shift_id) {
            const shiftEntityId = entityMap.get(`shift:${emp.shift_id}`);
            if (shiftEntityId) {
                rels.push({
                    tenant_id: tenantId,
                    source_entity_id: empEntityId,
                    target_entity_id: shiftEntityId,
                    relationship_type: 'uses_shift',
                    weight: 1.0,
                    properties: {},
                });
            }
        }
    }

    // Group → uses_shift → Shift
    const { data: groups } = await supabase
        .from('groups').select('id, shift_id')
        .eq('tenant_id', tenantId).eq('active', true);

    groups?.forEach(g => {
        if (g.shift_id) {
            const groupEntityId = entityMap.get(`group:${g.id}`);
            const shiftEntityId = entityMap.get(`shift:${g.shift_id}`);
            if (groupEntityId && shiftEntityId) {
                rels.push({
                    tenant_id: tenantId,
                    source_entity_id: groupEntityId,
                    target_entity_id: shiftEntityId,
                    relationship_type: 'uses_shift',
                    weight: 1.0,
                    properties: {},
                });
            }
        }
    });

    // Batch insert relationships
    if (rels.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < rels.length; i += BATCH) {
            const batch = rels.slice(i, i + BATCH);
            const { error } = await supabase.from('ai_kg_relationships').insert(batch);
            if (error) errors.push(`Rels batch ${i}: ${error.message}`);
        }
    }

    return { count: rels.length, errors };
}

// ===== COMMUNITY DETECTION (simplified Leiden-style clustering) =====

async function buildCommunities(
    supabase: SupabaseClient,
    tenantId: string,
    entityMap: Map<string, string>,
    tenantKeyEncoded?: string | null
): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    const communities: { title: string; summary: string; entityIds: string[]; level: number }[] = [];

    // Level 0: Per-Department communities
    const { data: depts } = await supabase
        .from('departments').select('id, name').eq('tenant_id', tenantId);

    const { data: employees } = await supabase
        .from('users')
        .select('id, full_name, department, status, default_meal_status, role')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

    const nonKitchen = employees?.filter(e => !e.role?.toLowerCase().includes('kitchen')) || [];

    if (depts?.length) {
        for (const dept of depts) {
            const deptEmployees = nonKitchen.filter(e => e.department === dept.name);
            if (!deptEmployees.length) continue;

            const activeCount = deptEmployees.filter(e => (e.status || 'active') === 'active').length;
            const eatingDefault = deptEmployees.filter(e => e.default_meal_status === 'eating').length;
            const entityIds = [
                entityMap.get(`dept:${dept.id}`),
                ...deptEmployees.map(e => entityMap.get(`emp:${e.id}`)),
            ].filter(Boolean) as string[];

            communities.push({
                title: `Cộng đồng: ${dept.name}`,
                summary: `Phòng ${dept.name} có ${deptEmployees.length} NV (${activeCount} active). ${eatingDefault}/${deptEmployees.length} mặc định ăn. NV: ${deptEmployees.map(e => e.full_name).join(', ')}.`,
                entityIds,
                level: 0,
            });
        }
    }

    // Level 1: Per-Shift communities
    const { data: shifts } = await supabase
        .from('shifts').select('id, name').eq('tenant_id', tenantId).eq('active', true);

    if (shifts?.length) {
        for (const shift of shifts) {
            const shiftEmployees = nonKitchen.filter(e =>
                e.id && entityMap.has(`emp:${e.id}`)
            );
            // Get employees using this shift
            const { data: shiftUsers } = await supabase
                .from('users')
                .select('id, full_name')
                .eq('tenant_id', tenantId)
                .eq('shift_id', shift.id)
                .is('deleted_at', null);

            const shiftNK = shiftUsers?.filter(u => {
                const emp = nonKitchen.find(e => e.id === u.id);
                return !!emp;
            }) || [];

            if (!shiftNK.length) continue;

            const entityIds = [
                entityMap.get(`shift:${shift.id}`),
                ...shiftNK.map(u => entityMap.get(`emp:${u.id}`)),
            ].filter(Boolean) as string[];

            communities.push({
                title: `Ca ăn: ${shift.name}`,
                summary: `Ca ${shift.name} có ${shiftNK.length} NV: ${shiftNK.map(u => u.full_name).join(', ')}.`,
                entityIds,
                level: 1,
            });
        }
    }

    // Embed + Insert communities
    if (communities.length > 0) {
        const embeddings = await generateBatchEmbeddings(
            communities.map(c => `${c.title}\n${c.summary}`),
            tenantKeyEncoded
        );

        for (let i = 0; i < communities.length; i++) {
            const { error } = await supabase.from('ai_kg_communities').insert({
                tenant_id: tenantId,
                level: communities[i].level,
                title: communities[i].title,
                summary: communities[i].summary,
                entity_ids: communities[i].entityIds,
                embedding: JSON.stringify(embeddings[i]),
            });
            if (error) errors.push(`Community ${communities[i].title}: ${error.message}`);
        }
    }

    return { count: communities.length, errors };
}

// ===== MAIN: Full Graph Build =====

export async function buildKnowledgeGraph(
    supabase: SupabaseClient,
    tenantId: string
): Promise<BuildResult> {
    const result: BuildResult = {
        entities_created: 0, relationships_created: 0,
        communities_created: 0, errors: [],
    };

    try {
        // Fetch tenant AI config to get specific API key
        const { data: aiConfig } = await supabase
            .from('tenant_ai_config')
            .select('gemini_api_key')
            .eq('tenant_id', tenantId)
            .single();
        const tenantKeyEncoded = aiConfig?.gemini_api_key;

        // 1. Clear existing graph for this tenant
        await supabase.from('ai_kg_communities').delete().eq('tenant_id', tenantId);
        await supabase.from('ai_kg_relationships').delete().eq('tenant_id', tenantId);
        await supabase.from('ai_kg_entities').delete().eq('tenant_id', tenantId);

        // 2. Extract entities
        const { entityMap, errors: entityErrors } = await extractAndStoreEntities(supabase, tenantId, tenantKeyEncoded);
        result.entities_created = entityMap.size;
        result.errors.push(...entityErrors);

        // 3. Build relationships
        const { count: relCount, errors: relErrors } = await buildRelationships(supabase, tenantId, entityMap);
        result.relationships_created = relCount;
        result.errors.push(...relErrors);

        // 4. Build communities
        const { count: commCount, errors: commErrors } = await buildCommunities(supabase, tenantId, entityMap, tenantKeyEncoded);
        result.communities_created = commCount;
        result.errors.push(...commErrors);

    } catch (err: unknown) {
        result.errors.push(err instanceof Error ? err.message : 'Unknown error in graph build');
    }

    return result;
}
