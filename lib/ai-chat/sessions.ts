/**
 * 🗂️ AI Chat Sessions — CRUD Operations
 * List, create, delete, rename, load, clear chat sessions.
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function handleListSessions(supabase: SupabaseClient, userId: string, tenantId: string) {
    const { data: sessions } = await supabase
        .from('ai_chat_sessions')
        .select('id, title, summary, message_count, updated_at')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(20)

    return NextResponse.json({ sessions: sessions || [] })
}

export async function handleCreateSession(supabase: SupabaseClient, userId: string, tenantId: string, title?: string) {
    const sessionTitle = title || `Chat ${new Date().toLocaleDateString('vi-VN')}`

    const { data: session, error } = await supabase
        .from('ai_chat_sessions')
        .insert({ tenant_id: tenantId, user_id: userId, title: sessionTitle })
        .select('id, title, summary, message_count, updated_at')
        .single()

    if (error) throw error
    return NextResponse.json({ session })
}

export async function handleDeleteSession(supabase: SupabaseClient, userId: string, sessionId: string) {
    if (!sessionId) return NextResponse.json({ error: 'Thiếu session_id' }, { status: 400 })

    try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const adminDb = createAdminClient();

        // Delete messages first using adminDb
        await adminDb.from('ai_chat_history').delete()
            .eq('session_id', sessionId).eq('user_id', userId);

        // Delete session
        await adminDb.from('ai_chat_sessions').delete()
            .eq('id', sessionId).eq('user_id', userId);
    } catch (e) {
        // Fallback to user client
        await supabase.from('ai_chat_history').delete()
            .eq('session_id', sessionId).eq('user_id', userId);
        await supabase.from('ai_chat_sessions').delete()
            .eq('id', sessionId).eq('user_id', userId);
    }

    return NextResponse.json({ success: true })
}

export async function handleRenameSession(supabase: SupabaseClient, userId: string, sessionId: string, title: string) {
    if (!sessionId || !title) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })

    await supabase.from('ai_chat_sessions').update({ title })
        .eq('id', sessionId).eq('user_id', userId)

    return NextResponse.json({ success: true })
}

export async function handleLoadHistory(supabase: SupabaseClient, userId: string, sessionId: string) {
    let sessionSummary = null
    if (sessionId !== 'default') {
        const { data: session } = await supabase
            .from('ai_chat_sessions')
            .select('summary')
            .eq('id', sessionId).eq('user_id', userId)
            .single()
        sessionSummary = session?.summary
    }

    let chatQuery = supabase
        .from('ai_chat_history')
        .select('role, content, created_at, action_pending, action_resolved, action_type, action_args, confirmation_token, form_pending, form_fields')
        .eq('user_id', userId);

    if (sessionId === 'default') {
        chatQuery = chatQuery.or(`session_id.eq.default,session_id.is.null`);
    } else {
        chatQuery = chatQuery.eq('session_id', sessionId);
    }

    const { data: chatHistory } = await chatQuery
        .order('created_at', { ascending: true })
        .limit(50)

    const rawHistory = chatHistory || []
    
    // Đảm bảo sắp xếp ổn định: Nếu trùng hoặc rất sát timestamp (created_at), tin nhắn của 'user' luôn đi trước 'assistant'
    const sortedHistory = [...rawHistory].sort((a, b) => {
        const timeA = new Date(a.created_at).getTime()
        const timeB = new Date(b.created_at).getTime()
        if (timeA !== timeB) {
            return timeA - timeB
        }
        if (a.role === 'user' && b.role !== 'user') return -1
        if (a.role !== 'user' && b.role === 'user') return 1
        return 0
    })

    return NextResponse.json({
        history: sortedHistory.map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
            timestamp: h.created_at,
            action_pending: h.action_pending,
            action_resolved: h.action_resolved,
            action_type: h.action_type,
            action_args: h.action_args,
            confirmation_token: h.confirmation_token,
            form_pending: h.form_pending,
            form_fields: h.form_fields,
        })),
        summary: sessionSummary,
    })
}

export async function handleClearHistory(supabase: SupabaseClient, userId: string, sessionId: string) {
    try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const adminDb = createAdminClient();

        if (sessionId === 'default') {
            await adminDb.from('ai_chat_history').delete()
                .eq('user_id', userId)
                .or(`session_id.eq.default,session_id.is.null`);
        } else {
            await adminDb.from('ai_chat_history').delete()
                .eq('user_id', userId)
                .eq('session_id', sessionId);
        }

        if (sessionId !== 'default') {
            await adminDb.from('ai_chat_sessions')
                .update({ summary: null, message_count: 0 })
                .eq('id', sessionId).eq('user_id', userId);
        }
    } catch (e) {
        // Fallback
        if (sessionId === 'default') {
            await supabase.from('ai_chat_history').delete()
                .eq('user_id', userId)
                .or(`session_id.eq.default,session_id.is.null`);
        } else {
            await supabase.from('ai_chat_history').delete()
                .eq('user_id', userId)
                .eq('session_id', sessionId);
        }

        if (sessionId !== 'default') {
            await supabase.from('ai_chat_sessions')
                .update({ summary: null, message_count: 0 })
                .eq('id', sessionId).eq('user_id', userId);
        }
    }

    return NextResponse.json({ success: true })
}
