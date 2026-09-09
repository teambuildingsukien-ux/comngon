-- Migration 002: Create orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'eating',
    locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Indexes for orders table
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_date ON orders(date);
CREATE INDEX idx_orders_user_id_date ON orders(user_id, date);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);

-- Comments
COMMENT ON TABLE orders IS 'Daily meal orders - opt-in/opt-out tracking';
COMMENT ON COLUMN orders.status IS 'eating or not_eating';
COMMENT ON COLUMN orders.locked IS 'Locked after 5:00 AM deadline';
COMMENT ON CONSTRAINT orders_user_id_date_key ON orders IS '1 user can only have 1 order per day';
