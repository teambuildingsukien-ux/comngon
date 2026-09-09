-- Migration 003: Create notification_logs table
CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for notification_logs table
CREATE INDEX idx_notification_logs_recipient_id ON notification_logs(recipient_id);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_sent_at ON notification_logs(sent_at);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at);

-- Comments
COMMENT ON TABLE notification_logs IS 'History of notifications sent (Telegram/Email)';
COMMENT ON COLUMN notification_logs.notification_type IS 'reminder, daily_report, welcome_email';
COMMENT ON COLUMN notification_logs.channel IS 'telegram or email';
COMMENT ON COLUMN notification_logs.status IS 'pending, sent, or failed';
