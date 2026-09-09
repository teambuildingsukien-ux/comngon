-- ============================================
-- Migration: tenant_api_keys + branding storage
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================
-- 1. Bảng tenant_api_keys
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    scopes TEXT [] DEFAULT '{"read"}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON tenant_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON tenant_api_keys(tenant_id);
-- RLS
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tenant api keys" ON tenant_api_keys FOR
SELECT USING (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
    );
CREATE POLICY "Admins can insert own tenant api keys" ON tenant_api_keys FOR
INSERT WITH CHECK (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
                AND role IN ('admin', 'manager')
        )
    );
CREATE POLICY "Admins can update own tenant api keys" ON tenant_api_keys FOR
UPDATE USING (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM users
            WHERE id = auth.uid()
                AND role IN ('admin', 'manager')
        )
    );
CREATE POLICY "Admins can delete own tenant api keys" ON tenant_api_keys FOR DELETE USING (
    tenant_id = (
        SELECT tenant_id
        FROM users
        WHERE id = auth.uid()
    )
    AND EXISTS (
        SELECT 1
        FROM users
        WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
    )
);
-- 2. Storage bucket cho branding logos
INSERT INTO storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'branding',
        'branding',
        true,
        5242880,
        '{"image/png","image/jpeg","image/svg+xml","image/webp"}'
    ) ON CONFLICT (id) DO NOTHING;
-- Storage RLS: cho phép authenticated users upload vào tenant folder
CREATE POLICY "Authenticated users can upload branding" ON storage.objects FOR
INSERT WITH CHECK (
        bucket_id = 'branding'
        AND auth.role() = 'authenticated'
    );
CREATE POLICY "Public can view branding files" ON storage.objects FOR
SELECT USING (bucket_id = 'branding');
CREATE POLICY "Authenticated users can update own branding" ON storage.objects FOR
UPDATE USING (
        bucket_id = 'branding'
        AND auth.role() = 'authenticated'
    );
CREATE POLICY "Authenticated users can delete own branding" ON storage.objects FOR DELETE USING (
    bucket_id = 'branding'
    AND auth.role() = 'authenticated'
);