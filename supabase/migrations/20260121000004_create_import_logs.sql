-- Migration 004: Create import_logs table
CREATE TABLE import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imported_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    error_details JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for import_logs table
CREATE INDEX idx_import_logs_imported_by ON import_logs(imported_by);
CREATE INDEX idx_import_logs_status ON import_logs(status);
CREATE INDEX idx_import_logs_created_at ON import_logs(created_at);

-- Comments
COMMENT ON TABLE import_logs IS 'History of CSV bulk imports';
COMMENT ON COLUMN import_logs.status IS 'processing, completed, or failed';
COMMENT ON COLUMN import_logs.error_details IS 'JSON array of row-level errors';
