-- Migration: Add tenant_id to all tables for multi-tenant architecture
-- Author: Antigravity AI
-- Date: 2026-01-31
-- Description: Add tenant isolation columns and update constraints

BEGIN;

-- Add tenant_id column to users table
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id column to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id column to groups table
ALTER TABLE public.groups 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id column to activity_logs table
ALTER TABLE public.activity_logs 
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id column to notification_logs table (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'notification_logs'
  ) THEN
    ALTER TABLE public.notification_logs 
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Populate tenant_id with default tenant for ALL existing data
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- Get default tenant ID (VietVision Travel)
  SELECT id INTO default_tenant_id 
  FROM public.tenants 
  WHERE slug = 'vietvision' 
  LIMIT 1;
  
  IF default_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Default tenant not found! Run 20260131200000_create_tenants_table.sql first.';
  END IF;
  
  -- Update existing records
  RAISE NOTICE 'Populating tenant_id with default tenant: %', default_tenant_id;
  
  UPDATE public.users SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.orders SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.groups SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.activity_logs SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  
  -- Update notification_logs if exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_logs') THEN
    UPDATE public.notification_logs SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
  
  RAISE NOTICE 'Tenant ID population complete';
END $$;

-- Make tenant_id NOT NULL after populating (data integrity)
ALTER TABLE public.users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.groups ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.activity_logs ALTER COLUMN tenant_id SET NOT NULL;

-- Create indexes for tenant-based queries (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_users_tenant_id 
  ON public.users(tenant_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_email 
  ON public.users(tenant_id, email) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id 
  ON public.orders(tenant_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_date 
  ON public.orders(tenant_id, date);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_user_date 
  ON public.orders(tenant_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_groups_tenant_id 
  ON public.groups(tenant_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_id 
  ON public.activity_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_date 
  ON public.activity_logs(tenant_id, created_at DESC);

-- Update unique constraints to include tenant_id (prevent cross-tenant conflicts)

-- Drop old constraints
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_date_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

-- Add new multi-tenant constraints
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_tenant_user_date_unique 
  UNIQUE (tenant_id, user_id, date);

ALTER TABLE public.users 
  ADD CONSTRAINT users_tenant_email_unique 
  UNIQUE (tenant_id, email);

-- Add comments
COMMENT ON COLUMN public.users.tenant_id IS 'Foreign key to tenants table - isolates user data by organization';
COMMENT ON COLUMN public.orders.tenant_id IS 'Foreign key to tenants table - isolates order data by organization';
COMMENT ON COLUMN public.groups.tenant_id IS 'Foreign key to tenants table - isolates group data by organization';

COMMIT;
