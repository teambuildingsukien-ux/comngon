-- Migration: Enable Row-Level Security (RLS) for multi-tenant data isolation
-- Author: Antigravity AI
-- Date: 2026-01-31
-- Description: Implement RLS policies to prevent cross-tenant data access

BEGIN;

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on notification_logs if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_logs') THEN
    EXECUTE 'ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Helper function: Get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id 
  FROM public.users 
  WHERE id = auth.uid() 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_tenant_id() IS 'Returns the tenant_id of the currently authenticated user';

-- Helper function: Check if current user is service role (for admin operations)
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'role' = 'service_role',
    false
  );
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION public.is_service_role() IS 'Returns true if current role is service_role (bypasses RLS)';

-----------------------------------
-- RLS POLICIES FOR TENANTS TABLE
-----------------------------------

-- Tenants: Users can only see their own tenant
CREATE POLICY tenants_select_own ON public.tenants
  FOR SELECT
  USING (
    id = public.get_user_tenant_id()
    OR public.is_service_role()
  );

-- Tenants: Only Admin/Manager can update tenant settings
CREATE POLICY tenants_update_own ON public.tenants
  FOR UPDATE
  USING (
    id = public.get_user_tenant_id()
    AND (
      SELECT role FROM public.users WHERE id = auth.uid()
    ) IN ('Admin', 'Manager')
  );

-- Tenants: No insert/delete via RLS (use admin API)
-- Service role can still do everything

-----------------------------------
-- RLS POLICIES FOR USERS TABLE
-----------------------------------

-- Users: Can only see users in same tenant
CREATE POLICY users_tenant_isolation_select ON public.users
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_service_role()
  );

-- Users: Can insert users in same tenant (for signup)
CREATE POLICY users_tenant_isolation_insert ON public.users
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    OR public.is_service_role()
  );

-- Users: Can update users in same tenant (Admin/Manager only)
CREATE POLICY users_tenant_isolation_update ON public.users
  FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      id = auth.uid()  -- Can update self
      OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Manager')
    )
  );

-- Users: Can delete users in same tenant (Admin only)
CREATE POLICY users_tenant_isolation_delete ON public.users
  FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'Admin'
  );

-----------------------------------
-- RLS POLICIES FOR ORDERS TABLE
-----------------------------------

-- Orders: Employees see only their own, Admin/Kitchen/Manager see all in tenant
CREATE POLICY orders_tenant_isolation_select ON public.orders
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      user_id = auth.uid()  -- Employee sees own orders
      OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Kitchen Admin', 'Manager')
    )
    OR public.is_service_role()
  );

-- Orders: Users can insert their own orders
CREATE POLICY orders_tenant_isolation_insert ON public.orders
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND user_id = auth.uid()
  );

-- Orders: Users can update their own orders (before deadline), Admin can update all
CREATE POLICY orders_tenant_isolation_update ON public.orders
  FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      (user_id = auth.uid() AND locked = false)  -- Employee can update own unlocked orders
      OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Kitchen Admin')
    )
  );

-- Orders: Admin can delete orders
CREATE POLICY orders_tenant_isolation_delete ON public.orders
  FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'Admin'
  );

-----------------------------------
-- RLS POLICIES FOR GROUPS TABLE
-----------------------------------

-- Groups: All users in tenant can see groups
CREATE POLICY groups_tenant_isolation_select ON public.groups
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_service_role()
  );

-- Groups: Only Admin/Manager can modify groups
CREATE POLICY groups_tenant_isolation_insert ON public.groups
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Manager')
  );

CREATE POLICY groups_tenant_isolation_update ON public.groups
  FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Manager')
  );

CREATE POLICY groups_tenant_isolation_delete ON public.groups
  FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'Admin'
  );

-----------------------------------
-- RLS POLICIES FOR ACTIVITY_LOGS TABLE
-----------------------------------

-- Activity Logs: Admin/Manager can see all logs in tenant, others see own
CREATE POLICY activity_logs_tenant_isolation_select ON public.activity_logs
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      performed_by = auth.uid()  -- See own logs
      OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('Admin', 'Manager')
    )
    OR public.is_service_role()
  );

-- Activity Logs: Anyone can insert (logging actions)
CREATE POLICY activity_logs_tenant_isolation_insert ON public.activity_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

-- Activity Logs: No update/delete (audit trail integrity)

-----------------------------------
-- NOTIFICATION_LOGS (if exists)
-----------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_logs') THEN
    EXECUTE '
      CREATE POLICY notification_logs_tenant_isolation ON public.notification_logs
        FOR ALL
        USING (
          tenant_id = public.get_user_tenant_id()
          OR public.is_service_role()
        )
    ';
  END IF;
END $$;

COMMIT;

-- Verification query (run manually to test)
-- Should only return current user's tenant data
/*
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'groups', COUNT(*) FROM groups
UNION ALL
SELECT 'activity_logs', COUNT(*) FROM activity_logs;
*/
