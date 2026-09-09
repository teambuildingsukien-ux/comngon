-- =====================================================================
-- CƠM NGON - DỮ LIỆU KHỞI TẠO MẪU (SAMPLE SEED DATA)
-- Cấu hình đúng chuẩn VietVision Travel: Deadline 05:00, 2 Ca ăn, T2 - T7
-- =====================================================================

-- 1. TẠO CÔNG TY MẪU (TENANT)
INSERT INTO public.tenants (id, name, slug, status, is_active, settings)
VALUES (
    '7821929c-32cd-4af4-9fc4-328e19f201f2',
    'VietVision Travel',
    'vietvision',
    'active',
    true,
    '{"timezone": "Asia/Ho_Chi_Minh", "auto_reset": true, "deadline_hour": 5, "cooking_days": {"start_day": 1, "end_day": 6}}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 2. TẠO 2 CA ĂN (SHIFTS)
INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, description, active)
VALUES 
    ('2ba8c021-a1c3-40fb-92d3-4b3c3dc44591', '7821929c-32cd-4af4-9fc4-328e19f201f2', '12:00 - 12:30', '12:00:00', '12:30:00', 'Ca ăn trưa đợt 1', true),
    ('11afbccf-57c8-42e7-9a10-6e3fe78fec3c', '7821929c-32cd-4af4-9fc4-328e19f201f2', '12:30 - 13:00', '12:30:00', '13:00:00', 'Ca ăn trưa đợt 2', true)
ON CONFLICT (id) DO NOTHING;

-- 3. TẠO CÁC PHÒNG BAN (DEPARTMENTS)
INSERT INTO public.departments (id, tenant_id, name, description)
VALUES 
    ('d1111111-1111-1111-1111-111111111111', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'Ban Giám Đốc', 'Lãnh đạo công ty'),
    ('d2222222-2222-2222-2222-222222222222', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'Hành Chính - Nhân Sự', 'Vận hành văn phòng'),
    ('d3333333-3333-3333-3333-333333333333', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'Kinh Doanh', 'Khối Sales và Tour'),
    ('d4444444-4444-4444-4444-444444444444', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'Kế Toán', 'Tài chính kế toán'),
    ('d5555555-5555-5555-5555-555555555555', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'Kỹ Thuật / IT', 'Hạ tầng và công nghệ')
ON CONFLICT (id) DO NOTHING;

-- 4. CÀI ĐẶT HỆ THỐNG (SYSTEM SETTINGS)
INSERT INTO public.system_settings (tenant_id, key, value, description)
VALUES 
    ('7821929c-32cd-4af4-9fc4-328e19f201f2', 'registration_deadline', '05:00', 'Giờ chốt đăng ký cơm hàng ngày'),
    ('7821929c-32cd-4af4-9fc4-328e19f201f2', 'cooking_days', '{"start_day": 1, "end_day": 6}', 'Ngày nấu ăn từ Thứ 2 đến Thứ 7'),
    ('7821929c-32cd-4af4-9fc4-328e19f201f2', 'allow_late_registration', 'false', 'Chặn tuyệt đối sau 05:00 sáng'),
    ('7821929c-32cd-4af4-9fc4-328e19f201f2', 'auto_reset_time', '13:30', 'Giờ tự động tạo đơn hôm sau'),
    ('7821929c-32cd-4af4-9fc4-328e19f201f2', 'auto_reset_enabled', 'true', 'Bật chế độ tự động chuẩn bị cơm hôm sau')
ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;

-- 5. TẠO TÀI KHOẢN MẪU (USERS)
INSERT INTO public.users (id, tenant_id, email, full_name, department, role, shift_id, default_meal_status, status)
VALUES 
    ('u1111111-1111-1111-1111-111111111111', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'admin@vietvision.vn', 'Quản Trị Viên (Admin)', 'Hành Chính - Nhân Sự', 'Admin', '2ba8c021-a1c3-40fb-92d3-4b3c3dc44591', 'eating', 'active'),
    ('u2222222-2222-2222-2222-222222222222', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'bep@vietvision.vn', 'Nhà Bếp (Kitchen)', 'Hành Chính - Nhân Sự', 'Kitchen', '2ba8c021-a1c3-40fb-92d3-4b3c3dc44591', 'not_eating', 'active'),
    ('u3333333-3333-3333-3333-333333333333', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'nhanvien1@vietvision.vn', 'Nguyễn Văn An', 'Kinh Doanh', 'Employee', '2ba8c021-a1c3-40fb-92d3-4b3c3dc44591', 'eating', 'active'),
    ('u4444444-4444-4444-4444-444444444444', '7821929c-32cd-4af4-9fc4-328e19f201f2', 'nhanvien2@vietvision.vn', 'Trần Thị Bình', 'Kế Toán', 'Employee', '11afbccf-57c8-42e7-9a10-6e3fe78fec3c', 'eating', 'active')
ON CONFLICT (tenant_id, email) DO NOTHING;
