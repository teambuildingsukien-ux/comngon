-- Migration: Create notifications system (in-app)
-- Tables: notifications, notification_reads
-- 1. Main notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'general',
    target_audience VARCHAR(20) NOT NULL DEFAULT 'all',
    target_id UUID,
    created_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 2. Read tracking table
CREATE TABLE IF NOT EXISTS notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(notification_id, user_id)
);
-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications(tenant_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id, notification_id);
-- 4. RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
-- notifications: same tenant can read
CREATE POLICY "notifications_select" ON notifications FOR
SELECT USING (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
    );
-- notifications: admin/manager can insert
CREATE POLICY "notifications_insert" ON notifications FOR
INSERT WITH CHECK (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
        AND created_by = auth.uid()
    );
-- notifications: admin can update (deactivate)
CREATE POLICY "notifications_update" ON notifications FOR
UPDATE USING (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
    ) WITH CHECK (
        tenant_id = (
            SELECT tenant_id
            FROM users
            WHERE id = auth.uid()
        )
    );
-- notification_reads: user can read own
CREATE POLICY "notification_reads_select" ON notification_reads FOR
SELECT USING (user_id = auth.uid());
-- notification_reads: user can insert own
CREATE POLICY "notification_reads_insert" ON notification_reads FOR
INSERT WITH CHECK (user_id = auth.uid());
-- 5. Comments
COMMENT ON TABLE notifications IS 'In-app notifications sent by admin to employees';
COMMENT ON TABLE notification_reads IS 'Tracks which users have read which notifications';
COMMENT ON COLUMN notifications.type IS 'urgent, reminder, info, general';
COMMENT ON COLUMN notifications.target_audience IS 'all, employees, kitchen, group';
COMMENT ON COLUMN notifications.target_id IS 'meal_group_id when target_audience = group';