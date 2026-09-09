-- =============================================
-- Migration: Tenant Feature Flags + API Keys
-- Date: 2026-02-11
-- Purpose: Add feature control, API key, admin notes per tenant
-- =============================================
-- 1. Feature flags (controls which features tenant can access)
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{
  "ai_chat": false,
  "ai_reports": false,
  "bulk_registration": true,
  "export_excel": false,
  "custom_branding": false,
  "api_access": false,
  "advanced_analytics": false,
  "multi_shift": false,
  "notifications": true,
  "max_departments": 5,
  "max_shifts": 3,
  "max_groups": 5
}'::jsonb;
-- 2. API key for external integrations
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS api_key_created_at TIMESTAMPTZ;
-- 3. Platform admin notes
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS admin_notes TEXT;
-- 4. Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key)
WHERE api_key IS NOT NULL;