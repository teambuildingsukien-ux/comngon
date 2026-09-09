-- Fix activity_logs target_type constraint to support meal orders
-- Date: 2026-01-30
-- Purpose: Allow logging of meal registration/cancellation actions

-- Drop old constraint
ALTER TABLE activity_logs 
DROP CONSTRAINT IF EXISTS activity_logs_target_type_check;

-- Add new constraint with 'order' included
ALTER TABLE activity_logs
ADD CONSTRAINT activity_logs_target_type_check 
CHECK (target_type IN ('user', 'group', 'shift', 'notification', 'order'));

-- Add helpful comment
COMMENT ON CONSTRAINT activity_logs_target_type_check ON activity_logs IS 
'Allowed target types: user (employee actions), group (team management), shift (schedule changes), notification (announcements), order (meal registration/cancellation)';
