-- =====================================================================
-- CƠM NGON - TOÀN BỘ CẤU TRÚC DATABASE ĐẦY ĐỦ (PRODUCTION DDL SCHEMA)
-- Bao gồm 17 bảng cốt lõi, khóa ngoại, chỉ mục (Index) và RLS Policies
-- =====================================================================

-- 1. BẢNG TỔ CHỨC / CÔNG TY (tenants)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{"timezone": "Asia/Ho_Chi_Minh", "auto_reset": true, "deadline_hour": 5, "cooking_days": {"start_day": 1, "end_day": 6}}'::jsonb,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. BẢNG PHÒNG BAN (departments)
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON public.departments(tenant_id);

-- 3. BẢNG CA ĂN (shifts)
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_id ON public.shifts(tenant_id);

-- 4. BẢNG NHÓM ĂN (groups)
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    table_area VARCHAR(100),
    description TEXT,
    active BOOLEAN DEFAULT true,
    registration_mode VARCHAR(50) DEFAULT 'opt_out',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_groups_tenant_id ON public.groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_groups_shift_id ON public.groups(shift_id);

-- 5. BẢNG NGƯỜI DÙNG / NHÂN VIÊN (users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Employee', -- 'Employee', 'Manager', 'Admin', 'Kitchen'
    employee_code TEXT,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    shift TEXT,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'resigned'
    status_changed_at TIMESTAMPTZ,
    status_reason TEXT,
    default_meal_status TEXT NOT NULL DEFAULT 'eating', -- 'eating', 'not_eating'
    start_date DATE DEFAULT CURRENT_DATE,
    resigned_date DATE,
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    telegram_chat_id VARCHAR(100),
    metadata JSONB,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_users_tenant_email UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_resigned_date ON public.users(resigned_date);

-- 6. BẢNG SUẤT ĂN HÀNG NGÀY (orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'eating', -- 'eating', 'not_eating', 'cancelled'
    locked BOOLEAN NOT NULL DEFAULT false,
    is_late BOOLEAN NOT NULL DEFAULT false,
    dietary_preference VARCHAR(50) DEFAULT 'normal', -- 'normal' (mặn), 'vegetarian' (chay), 'diet'
    note TEXT,
    source TEXT DEFAULT 'auto_system', -- 'auto_system', 'user_toggle', 'admin_toggle', 'auto_resigned'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_orders_tenant_user_date UNIQUE(tenant_id, user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_dietary ON public.orders(dietary_preference);

-- 7. BẢNG SUẤT ĂN KHÁCH VÃNG LAI / KHÁCH ĐOÀN (guest_meals)
CREATE TABLE IF NOT EXISTS public.guest_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_meals_tenant_date ON public.guest_meals(tenant_id, date);

-- 8. BẢNG NGOẠI LỆ NẤU ĂN (cooking_exceptions)
CREATE TABLE IF NOT EXISTS public.cooking_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'no_cook' (nghỉ bếp), 'extra_cook' (nấu bù)
    reason TEXT DEFAULT '',
    cancelled_count INTEGER DEFAULT 0,
    auto_cancelled_user_ids UUID[] DEFAULT '{}'::UUID[],
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_cooking_exceptions_tenant_date UNIQUE(tenant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_cooking_exceptions_tenant_date ON public.cooking_exceptions(tenant_id, date);

-- 9. BẢNG THÔNG BÁO BẢNG TIN (announcements)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'normal',
    active BOOLEAN DEFAULT true,
    start_date DATE,
    end_date DATE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON public.announcements(tenant_id, active);

-- 10. BẢNG THÔNG BÁO KHẨN (urgent_notifications)
CREATE TABLE IF NOT EXISTS public.urgent_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_audience TEXT,
    target_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. BẢNG TỔNG KẾT NGÀY (daily_summaries)
CREATE TABLE IF NOT EXISTS public.daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_cooking_day BOOLEAN DEFAULT true,
    total_employees INTEGER DEFAULT 0,
    eating_count INTEGER DEFAULT 0,
    not_eating_count INTEGER DEFAULT 0,
    guest_meals INTEGER DEFAULT 0,
    total_meals INTEGER DEFAULT 0,
    cancel_rate NUMERIC DEFAULT 0.00,
    paused_count INTEGER DEFAULT 0,
    resigned_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_daily_summaries_tenant_date UNIQUE(tenant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_tenant_date ON public.daily_summaries(tenant_id, date);

-- 12. BẢNG CÀI ĐẶT HỆ THỐNG (system_settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(tenant_id, key)
);

-- 13. BẢNG NHẬT KÝ HOẠT ĐỘNG (activity_logs)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    performer_name TEXT,
    target_type TEXT,
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created ON public.activity_logs(tenant_id, created_at DESC);

-- 14. BẢNG ĐĂNG KÝ WEBPUSH NOTIFICATION (push_subscriptions)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_info TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 15. BẢNG NHẬT KÝ THÔNG BÁO (notification_logs)
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    content TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. BẢNG LỊCH SỬ IMPORT EXCEL (import_logs)
CREATE TABLE IF NOT EXISTS public.import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imported_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_details JSONB,
    status VARCHAR(50) DEFAULT 'processing',
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- 17. BẢNG LỜI MỜI (invitations)
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Employee',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
