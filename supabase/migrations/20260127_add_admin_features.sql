-- Admin Management System - Database Migration
-- Date: 2026-01-27
-- Purpose: Add support for admin management features

-- 1. Add avatar_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create urgent_notifications table
CREATE TABLE IF NOT EXISTS urgent_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_audience TEXT NOT NULL CHECK (target_audience IN ('all', 'employees', 'kitchen', 'group')),
    target_id UUID, -- group_id if targeting specific group
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. Create activity_logs table (for audit trail)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT CHECK (target_type IN ('user', 'group', 'shift', 'notification')),
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_urgent_notifications_active 
    ON urgent_notifications(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_urgent_notifications_target 
    ON urgent_notifications(target_audience, target_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by 
    ON activity_logs(performed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_target 
    ON activity_logs(target_type, target_id);

-- 5. Add helpful comments
COMMENT ON TABLE urgent_notifications IS 'Stores urgent notifications sent by admins to employees/kitchen/groups';
COMMENT ON TABLE activity_logs IS 'Audit trail for admin actions in the system';
COMMENT ON COLUMN users.avatar_url IS 'URL to user avatar image in Supabase Storage';
