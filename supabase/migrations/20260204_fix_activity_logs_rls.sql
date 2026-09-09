-- Migration: Fix Activity Logs RLS Policy for proper logging
-- Author: Antigravity AI
-- Date: 2026-02-04
-- Description: Relax INSERT policy to allow self-logging while maintaining tenant isolation

BEGIN;

-- Drop the overly restrictive INSERT policy
DROP POLICY IF EXISTS activity_logs_tenant_isolation_insert ON public.activity_logs;

-- Create a relaxed INSERT policy that allows:
-- 1. User logging their own actions (performed_by = auth.uid())
-- 2. System/Service role logging on behalf of users
-- 3. Logging for any user within the same tenant (for admin actions)
-- 4. System operations with NULL tenant_id (when using service role)
CREATE POLICY activity_logs_tenant_isolation_insert ON public.activity_logs
  FOR INSERT
  WITH CHECK (
    -- Allow service role to log anything (including NULL tenant_id for system ops)
    public.is_service_role()
    OR (
      -- For regular users: tenant_id must match
      tenant_id = public.get_user_tenant_id()
      AND (
        performed_by = auth.uid()        -- User logs own action
        OR performed_by IN (              -- Allow logging for users in same tenant
          SELECT id FROM public.users 
          WHERE tenant_id = public.get_user_tenant_id()
        )
      )
    )
  );

COMMIT;

-- Verification query (run manually to test)
-- Try inserting a test log as current user
/*
INSERT INTO activity_logs (
  performed_by,
  tenant_id,
  action,
  target_type,
  target_id,
  details
) VALUES (
  auth.uid(),
  (SELECT tenant_id FROM users WHERE id = auth.uid()),
  'test',
  'user',
  auth.uid(),
  'Testing activity log insertion'
);
*/
