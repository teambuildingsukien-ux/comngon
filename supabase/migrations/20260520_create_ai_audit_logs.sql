-- Migration: Create AI Audit Logs table for SaaS analytics and cost tracking
-- Date: 2026-05-20
-- Purpose: Monitor AI token usage, latency, intent, and estimation cost per tenant/user

CREATE TABLE IF NOT EXISTS ai_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL DEFAULT 'default',
    intent_routed TEXT,
    model_used TEXT NOT NULL,
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
    latency_ms INT DEFAULT 0,
    tools_called JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup indexes for administrative and billing reports
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_tenant ON ai_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_user ON ai_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_session ON ai_audit_logs (session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- Select policy: users can only see audit logs of their own tenant
CREATE POLICY ai_audit_logs_select ON ai_audit_logs FOR
SELECT USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);

-- Insert policy: authenticated users can insert audit logs associated with their own tenant
CREATE POLICY ai_audit_logs_insert ON ai_audit_logs FOR
INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);

-- Service role bypass policy for admin side-effects
CREATE POLICY ai_audit_logs_service ON ai_audit_logs FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);
