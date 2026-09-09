import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/knowledge-base
 * Lấy danh sách tài liệu Knowledge Base cho tenant
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

        const role = userProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // Optional filter by category
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');

        let query = supabase
            .from('tenant_knowledge_base')
            .select('id, title, content, category, is_active, created_at, updated_at')
            .eq('tenant_id', userProfile.tenant_id)
            .order('created_at', { ascending: false });

        if (category) {
            query = query.eq('category', category);
        }

        const { data: documents, error } = await query;

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: documents || [] });
    } catch (error) {
        console.error('Error in GET /api/admin/knowledge-base:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/knowledge-base
 * Thêm tài liệu mới vào Knowledge Base
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

        const body = await request.json();
        const { title, content, category } = body;

        // Validate
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return NextResponse.json({ error: 'Tiêu đề tài liệu là bắt buộc' }, { status: 400 });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: 'Nội dung tài liệu là bắt buộc' }, { status: 400 });
        }

        const validCategories = ['menu', 'policy', 'recipe', 'budget', 'operations', 'other'];
        if (category && !validCategories.includes(category)) {
            return NextResponse.json({ error: `Category phải là: ${validCategories.join(', ')}` }, { status: 400 });
        }

        // Check limit (max 50 documents per tenant)
        const { count } = await supabase
            .from('tenant_knowledge_base')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', userProfile.tenant_id);

        if ((count || 0) >= 50) {
            return NextResponse.json({
                error: 'Đã đạt giới hạn 50 tài liệu. Vui lòng xóa tài liệu cũ trước khi thêm mới.',
            }, { status: 400 });
        }

        // Content size limit: 50KB per document
        if (content.length > 50000) {
            return NextResponse.json({
                error: 'Nội dung tài liệu quá dài (tối đa 50,000 ký tự)',
            }, { status: 400 });
        }

        const { data: doc, error } = await supabase
            .from('tenant_knowledge_base')
            .insert({
                tenant_id: userProfile.tenant_id,
                title: title.trim(),
                content: content.trim(),
                category: category || 'other',
            })
            .select()
            .single();

        if (error) {
            console.error('Insert error:', error);
            return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'knowledge_base_doc_created',
            performed_by: user.id,
            target_type: 'knowledge_base',
            details: { title: title.trim(), category: category || 'other' },
        });

        return NextResponse.json({ success: true, data: doc });
    } catch (error) {
        console.error('Error in POST /api/admin/knowledge-base:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/knowledge-base
 * Xóa tài liệu khỏi Knowledge Base
 */
export async function DELETE(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const docId = searchParams.get('id');

        if (!docId) {
            return NextResponse.json({ error: 'Thiếu document ID' }, { status: 400 });
        }

        // Get doc title before delete (for logging)
        const { data: existingDoc } = await supabase
            .from('tenant_knowledge_base')
            .select('title')
            .eq('id', docId)
            .eq('tenant_id', userProfile.tenant_id)
            .single();

        if (!existingDoc) {
            return NextResponse.json({ error: 'Tài liệu không tồn tại' }, { status: 404 });
        }

        const { error } = await supabase
            .from('tenant_knowledge_base')
            .delete()
            .eq('id', docId)
            .eq('tenant_id', userProfile.tenant_id);

        if (error) {
            console.error('Delete error:', error);
            return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'knowledge_base_doc_deleted',
            performed_by: user.id,
            target_type: 'knowledge_base',
            details: { title: existingDoc.title, doc_id: docId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/admin/knowledge-base:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
