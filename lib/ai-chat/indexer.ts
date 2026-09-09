/**
 * Document Indexer — Đồng bộ dữ liệu doanh nghiệp vào RAG vector store
 * Chịu trách nhiệm: chunk → embed → upsert vào ai_document_chunks
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateBatchEmbeddings, chunkText } from './embeddings';

type SourceType = 'knowledge_base' | 'daily_summary' | 'employee_profile' | 'announcement' | 'system_config' | 'monthly_stats';

interface IndexResult {
    source_type: SourceType;
    chunks_created: number;
    chunks_deleted: number;
    errors: string[];
}

/**
 * Index tất cả Knowledge Base documents cho tenant
 */
export async function indexKnowledgeBase(
    supabase: SupabaseClient,
    tenantId: string,
    tenantKeyEncoded?: string | null
): Promise<IndexResult> {
    const result: IndexResult = { source_type: 'knowledge_base', chunks_created: 0, chunks_deleted: 0, errors: [] };

    try {
        // Fetch active KB docs
        const { data: docs, error } = await supabase
            .from('tenant_knowledge_base')
            .select('id, title, content, category')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        if (error) { result.errors.push(error.message); return result; }
        if (!docs?.length) return result;

        // Delete old chunks for this source
        const { count: deleted } = await supabase
            .from('ai_document_chunks')
            .delete({ count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('source_type', 'knowledge_base');
        result.chunks_deleted = deleted || 0;

        // Chunk + Embed
        const allChunks: { content: string; source_id: string; metadata: object }[] = [];
        for (const doc of docs) {
            const prefix = `[${doc.category}] ${doc.title}\n`;
            const chunks = chunkText(prefix + doc.content);
            chunks.forEach(chunk => {
                allChunks.push({
                    content: chunk,
                    source_id: doc.id,
                    metadata: { title: doc.title, category: doc.category },
                });
            });
        }

        // Batch embed (max 100 per batch)
        const BATCH_SIZE = 100;
        for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
            const batch = allChunks.slice(i, i + BATCH_SIZE);
            const embeddings = await generateBatchEmbeddings(batch.map(c => c.content), tenantKeyEncoded);

            const rows = batch.map((chunk, idx) => ({
                tenant_id: tenantId,
                source_type: 'knowledge_base' as SourceType,
                source_id: chunk.source_id,
                content: chunk.content,
                metadata: chunk.metadata,
                embedding: JSON.stringify(embeddings[idx]),
            }));

            const { error: insertError } = await supabase
                .from('ai_document_chunks')
                .insert(rows);

            if (insertError) {
                result.errors.push(insertError.message);
            } else {
                result.chunks_created += batch.length;
            }
        }
    } catch (err: unknown) {
        result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    }

    return result;
}

/**
 * Index Employee Profiles cho tenant
 */
export async function indexEmployeeProfiles(
    supabase: SupabaseClient,
    tenantId: string,
    tenantKeyEncoded?: string | null
): Promise<IndexResult> {
    const result: IndexResult = { source_type: 'employee_profile', chunks_created: 0, chunks_deleted: 0, errors: [] };

    try {
        const { data: employees, error } = await supabase
            .from('users')
            .select('id, full_name, department, role, status, default_meal_status, start_date, shift_id, group_id, employee_code')
            .eq('tenant_id', tenantId)
            .neq('role', 'Kitchen')
            .is('deleted_at', null);

        if (error) { result.errors.push(error.message); return result; }
        if (!employees?.length) return result;

        // Fetch shift/group names for enrichment
        const { data: shifts } = await supabase.from('shifts').select('id, name').eq('tenant_id', tenantId);
        const { data: groups } = await supabase.from('groups').select('id, name').eq('tenant_id', tenantId);

        const shiftMap = new Map(shifts?.map(s => [s.id, s.name]) || []);
        const groupMap = new Map(groups?.map(g => [g.id, g.name]) || []);

        // Delete old
        const { count: deleted } = await supabase
            .from('ai_document_chunks')
            .delete({ count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('source_type', 'employee_profile');
        result.chunks_deleted = deleted || 0;

        // Build profile texts
        const profileTexts = employees.map(emp => {
            const parts = [
                `Nhân viên: ${emp.full_name}`,
                emp.employee_code ? `Mã NV: ${emp.employee_code}` : '',
                `Phòng ban: ${emp.department || 'Chưa phân'}`,
                `Vai trò: ${emp.role}`,
                `Trạng thái: ${emp.status || 'active'}`,
                `Mặc định ăn: ${emp.default_meal_status === 'eating' ? 'Ăn' : 'Không ăn'}`,
                emp.shift_id ? `Ca ăn: ${shiftMap.get(emp.shift_id) || 'Unknown'}` : '',
                emp.group_id ? `Nhóm: ${groupMap.get(emp.group_id) || 'Unknown'}` : '',
                emp.start_date ? `Ngày vào: ${emp.start_date}` : '',
            ].filter(Boolean);
            return { text: parts.join(' | '), id: emp.id, name: emp.full_name, dept: emp.department };
        });

        // Batch embed
        const BATCH_SIZE = 100;
        for (let i = 0; i < profileTexts.length; i += BATCH_SIZE) {
            const batch = profileTexts.slice(i, i + BATCH_SIZE);
            const embeddings = await generateBatchEmbeddings(batch.map(p => p.text), tenantKeyEncoded);

            const rows = batch.map((profile, idx) => ({
                tenant_id: tenantId,
                source_type: 'employee_profile' as SourceType,
                source_id: profile.id,
                content: profile.text,
                metadata: { name: profile.name, department: profile.dept },
                embedding: JSON.stringify(embeddings[idx]),
            }));

            const { error: insertError } = await supabase.from('ai_document_chunks').insert(rows);
            if (insertError) result.errors.push(insertError.message);
            else result.chunks_created += batch.length;
        }
    } catch (err: unknown) {
        result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    }

    return result;
}

/**
 * Index Daily Summaries cho tenant (30 ngày gần nhất)
 */
export async function indexDailySummaries(
    supabase: SupabaseClient,
    tenantId: string,
    tenantKeyEncoded?: string | null
): Promise<IndexResult> {
    const result: IndexResult = { source_type: 'daily_summary', chunks_created: 0, chunks_deleted: 0, errors: [] };

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: summaries, error } = await supabase
            .from('daily_summaries')
            .select('id, date, is_cooking_day, total_employees, eating_count, not_eating_count, guest_meals, total_meals, cancel_rate, paused_count, resigned_count')
            .eq('tenant_id', tenantId)
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (error) { result.errors.push(error.message); return result; }
        if (!summaries?.length) return result;

        // Delete old
        const { count: deleted } = await supabase
            .from('ai_document_chunks')
            .delete({ count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('source_type', 'daily_summary');
        result.chunks_deleted = deleted || 0;

        // Build summary texts
        const texts = summaries.map(s => ({
            text: [
                `Ngày ${s.date}: ${s.is_cooking_day ? 'Ngày nấu' : 'Không nấu'}`,
                `Tổng NV: ${s.total_employees}, Ăn: ${s.eating_count}, Không ăn: ${s.not_eating_count}`,
                `Khách: ${s.guest_meals}, Tổng suất: ${s.total_meals}`,
                `Tỷ lệ cancel: ${s.cancel_rate}%`,
                s.paused_count ? `Tạm dừng: ${s.paused_count}` : '',
                s.resigned_count ? `Nghỉ việc: ${s.resigned_count}` : '',
            ].filter(Boolean).join(' | '),
            id: s.id,
            date: s.date,
        }));

        const embeddings = await generateBatchEmbeddings(texts.map(t => t.text), tenantKeyEncoded);

        const rows = texts.map((item, idx) => ({
            tenant_id: tenantId,
            source_type: 'daily_summary' as SourceType,
            source_id: item.id,
            content: item.text,
            metadata: { date: item.date },
            embedding: JSON.stringify(embeddings[idx]),
        }));

        const { error: insertError } = await supabase.from('ai_document_chunks').insert(rows);
        if (insertError) result.errors.push(insertError.message);
        else result.chunks_created = rows.length;
    } catch (err: unknown) {
        result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    }

    return result;
}

/**
 * Index Announcements cho tenant
 */
export async function indexAnnouncements(
    supabase: SupabaseClient,
    tenantId: string,
    tenantKeyEncoded?: string | null
): Promise<IndexResult> {
    const result: IndexResult = { source_type: 'announcement', chunks_created: 0, chunks_deleted: 0, errors: [] };

    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('id, title, content, priority, start_date, end_date')
            .eq('tenant_id', tenantId)
            .eq('active', true);

        if (error) { result.errors.push(error.message); return result; }
        if (!announcements?.length) return result;

        // Delete old
        const { count: deleted } = await supabase
            .from('ai_document_chunks')
            .delete({ count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('source_type', 'announcement');
        result.chunks_deleted = deleted || 0;

        const texts = announcements.map(a => ({
            text: `Thông báo [${a.priority}]: ${a.title || ''}\n${a.content}${a.start_date ? `\nHiệu lực: ${a.start_date} → ${a.end_date || 'vô thời hạn'}` : ''}`,
            id: a.id,
            title: a.title,
        }));

        const embeddings = await generateBatchEmbeddings(texts.map(t => t.text), tenantKeyEncoded);

        const rows = texts.map((item, idx) => ({
            tenant_id: tenantId,
            source_type: 'announcement' as SourceType,
            source_id: item.id,
            content: item.text,
            metadata: { title: item.title },
            embedding: JSON.stringify(embeddings[idx]),
        }));

        const { error: insertError } = await supabase.from('ai_document_chunks').insert(rows);
        if (insertError) result.errors.push(insertError.message);
        else result.chunks_created = rows.length;
    } catch (err: unknown) {
        result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    }

    return result;
}

/**
 * Full Re-index: chạy tất cả indexers cho 1 tenant
 */
export async function fullReindex(
    supabase: SupabaseClient,
    tenantId: string
): Promise<IndexResult[]> {
    // Fetch tenant AI config to get specific API key
    const { data: aiConfig } = await supabase
        .from('tenant_ai_config')
        .select('gemini_api_key')
        .eq('tenant_id', tenantId)
        .single();
    
    const tenantKeyEncoded = aiConfig?.gemini_api_key;

    const results = await Promise.all([
        indexKnowledgeBase(supabase, tenantId, tenantKeyEncoded),
        indexEmployeeProfiles(supabase, tenantId, tenantKeyEncoded),
        indexDailySummaries(supabase, tenantId, tenantKeyEncoded),
        indexAnnouncements(supabase, tenantId, tenantKeyEncoded),
    ]);
    return results;
}
