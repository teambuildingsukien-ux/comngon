-- Migration: Create Green Department Leaderboard and Loyalty Points Tables
-- Date: 2026-08-14

-- 1. User Green Points Table
CREATE TABLE IF NOT EXISTS public.user_green_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    balance_points INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_green_points_user_id ON public.user_green_points(user_id);
CREATE INDEX IF NOT EXISTS idx_user_green_points_tenant_id ON public.user_green_points(tenant_id);

-- 2. Green Point Transactions Table
CREATE TABLE IF NOT EXISTS public.green_point_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'earn_daily', 'earn_reward', 'spend_reward'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_green_point_tx_user_id ON public.green_point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_green_point_tx_tenant_id ON public.green_point_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_green_point_tx_created_at ON public.green_point_transactions(created_at);

-- 3. Reward Items Table (Catalog)
CREATE TABLE IF NOT EXISTS public.reward_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL CHECK (points_required > 0),
    category VARCHAR(50) NOT NULL DEFAULT 'beverage', -- 'beverage', 'voucher', 'leave', 'gift'
    image_url TEXT,
    stock INTEGER DEFAULT 999,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_items_tenant_id ON public.reward_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reward_items_category ON public.reward_items(category);

-- 4. Reward Redemptions Table
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES public.reward_items(id) ON DELETE CASCADE,
    points_spent INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed'
    redemption_code VARCHAR(100) NOT NULL,
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user_id ON public.reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_tenant_id ON public.reward_redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON public.reward_redemptions(status);

-- Seed Default Reward Items if none exist
INSERT INTO public.reward_items (title, description, points_required, category, stock, is_active)
VALUES 
    ('☕ Ly Cà Phê Highlands / Phút Thư Giãn', 'Đổi 1 ly cà phê Highlands hảo hạng hoặc đồ uống ưa thích tại pantry', 500, 'beverage', 100, true),
    ('🎟️ Voucher Shopee / Tiki 50,000đ', 'Mã giảm giá mua sắm trực tuyến trị giá 50.000đ cho nhân viên xanh', 1000, 'voucher', 50, true),
    ('🌱 Bình Nước Inox Giữ Nhiệt Cơm Ngốn', 'Bình nước inox cao cấp khắc tên cá nhân bảo vệ môi trường', 2500, 'gift', 30, true),
    ('🏖️ Nửa Ngày Nghỉ Phép Hưởng Lương', 'Được quy đổi 0.5 ngày nghỉ phép có hưởng lương (cần HR duyệt)', 5000, 'leave', 20, true)
ON CONFLICT DO NOTHING;
