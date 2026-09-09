-- Phase 3.1: Create invitations table for team member invites

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'admin', 'kitchen')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_invitations_tenant_id ON public.invitations(tenant_id);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_expires_at ON public.invitations(expires_at) WHERE accepted_at IS NULL;

-- RLS Policies for invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage invitations for their tenant
CREATE POLICY invitations_tenant_admin_all ON public.invitations
  FOR ALL
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Policy: Service role can do anything (for API routes)
CREATE POLICY invitations_service_role_all ON public.invitations
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

-- Comments
COMMENT ON TABLE public.invitations IS 'Team member invitation tokens for onboarding new users to tenants';
COMMENT ON COLUMN public.invitations.token IS 'Unique invitation token sent via email (UUID format)';
COMMENT ON COLUMN public.invitations.expires_at IS 'Invitation expiry (typically 7 days from creation)';
