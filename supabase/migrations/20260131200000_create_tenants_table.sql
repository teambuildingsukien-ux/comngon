-- Migration: Create tenants table for multi-tenant architecture
-- Author: Antigravity AI
-- Date: 2026-01-31
-- Description: Base table to manage multiple companies/organizations

BEGIN;

-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,  -- for subdomain/URL (e.g., vietvision, company1)
  
  -- Status
  status VARCHAR(50) DEFAULT 'trial',  -- trial, active, suspended, cancelled
  is_active BOOLEAN DEFAULT true,
  
  -- Settings (JSONB for flexibility - can add new settings without schema changes)
  settings JSONB DEFAULT '{
    "deadline_hour": 5,
    "cooking_days": {"start_day": 1, "end_day": 5},
    "auto_reset": false,
    "timezone": "Asia/Ho_Chi_Minh"
  }'::jsonb,
  
  -- Branding (for white-label support in future)
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#c04b00',
  custom_domain TEXT,
  
  -- Subscription & Limits
  plan VARCHAR(50) DEFAULT 'basic',  -- basic, pro, enterprise
  max_users INTEGER DEFAULT 50,
  max_storage_mb INTEGER DEFAULT 1000,
  
  -- Billing
  billing_email VARCHAR(255),
  billing_cycle VARCHAR(20) DEFAULT 'monthly',  -- monthly, yearly
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,  -- soft delete
  
  -- Contact info
  admin_name VARCHAR(255),
  admin_email VARCHAR(255),
  admin_phone VARCHAR(50)
);

-- Indexes for performance
CREATE INDEX idx_tenants_slug ON public.tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON public.tenants(status) WHERE is_active = true;
CREATE INDEX idx_tenants_active ON public.tenants(is_active) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE public.tenants IS 'Manages multiple organizations/companies in multi-tenant architecture';
COMMENT ON COLUMN public.tenants.slug IS 'URL-friendly identifier for tenant (used in subdomains)';
COMMENT ON COLUMN public.tenants.settings IS 'Tenant-specific settings stored as JSON (deadline, cooking days, etc)';
COMMENT ON COLUMN public.tenants.plan IS 'Subscription plan: basic, pro, enterprise';

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default tenant for existing VietVision Travel data
INSERT INTO public.tenants (
  name, 
  slug, 
  status, 
  plan, 
  admin_email,
  admin_name,
  max_users,
  settings
)
VALUES (
  'VietVision Travel',
  'vietvision',
  'active',
  'enterprise',
  'hr@vietvisiontravel.com',
  'HR Admin',
  500,  -- Allow up to 500 users for enterprise
  '{
    "deadline_hour": 5,
    "cooking_days": {"start_day": 1, "end_day": 5},
    "auto_reset": false,
    "timezone": "Asia/Ho_Chi_Minh"
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
