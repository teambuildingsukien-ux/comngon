-- ============================================
-- FIX: Supabase Dashboard Warnings
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================
-- =============================================
-- 1. Fix "Function Search Path Mutable" warnings
-- Set search_path = public cho 3 functions
-- =============================================
-- Fix 1: protect_platform_owner_deletion
ALTER FUNCTION public.protect_platform_owner_deletion()
SET search_path = public;
-- Fix 2: sync_email_verified
ALTER FUNCTION public.sync_email_verified()
SET search_path = public;
-- Fix 3: preserve_user_name_in_logs
ALTER FUNCTION public.preserve_user_name_in_logs()
SET search_path = public;
-- =============================================
-- 2. Fix "Leaked Password Protection Disabled"
-- Bật trong: Authentication > Settings > Security
-- Hoặc chạy SQL dưới đây
-- =============================================
-- Cách 1 (UI): Vào Authentication > Attack Protection > Enable Leaked Password Protection
-- Cách 2 (SQL): Uncomment và chạy dòng dưới nếu hỗ trợ:
-- ALTER ROLE authenticator SET pgrst.jwt_secret TO current_setting('pgrst.jwt_secret');
-- GHI CHÚ: "Leaked Password Protection" chỉ bật được qua UI:
-- Supabase Dashboard > Authentication > Providers > Email > Enable "Leaked password protection"
-- HOẶC: Authentication > Settings (tùy phiên bản Dashboard)