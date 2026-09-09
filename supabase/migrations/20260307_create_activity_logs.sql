-- Migration: create_activity_logs_table
-- Bảng này dùng cho ghi log hoạt động (xóa NV, thay đổi trạng thái ăn, v.v.)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        target_type TEXT,
        target_id TEXT,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created ON public.activity_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);
-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
-- RLS: users can only see their own tenant's logs
CREATE POLICY "Tenant isolation for activity_logs" ON public.activity_logs FOR ALL USING (
    tenant_id IN (
        SELECT tenant_id
        FROM public.users
        WHERE id = auth.uid()
    )
);
-- RLS: insert for authenticated users within their tenant
CREATE POLICY "Insert own tenant logs" ON public.activity_logs FOR
INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id
            FROM public.users
            WHERE id = auth.uid()
        )
    );