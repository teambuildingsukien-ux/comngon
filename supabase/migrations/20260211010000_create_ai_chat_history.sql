-- Migration: Create AI chat history table for persistent memory
-- Supports: Multi-turn conversations per admin user
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_session ON ai_chat_history (user_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant ON ai_chat_history (tenant_id, created_at DESC);
-- RLS: Users can only see their own chat history
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_chat_history_select ON ai_chat_history FOR
SELECT USING (user_id = auth.uid());
CREATE POLICY ai_chat_history_insert ON ai_chat_history FOR
INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ai_chat_history_delete ON ai_chat_history FOR DELETE USING (user_id = auth.uid());
-- Service role bypass
CREATE POLICY ai_chat_history_service ON ai_chat_history FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);