-- Fix trigger functions that reference tables without search_path
-- Date: 2026-03-07
-- Root cause: BEFORE DELETE triggers on users table failed because
-- SECURITY DEFINER functions didn't have SET search_path = public,
-- causing "relation does not exist" errors during DELETE operations
-- Status: APPLIED via Supabase MCP on 2026-03-07
-- 1. Fix preserve_user_name_in_logs - add search_path
CREATE OR REPLACE FUNCTION public.preserve_user_name_in_logs() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ BEGIN
UPDATE public.activity_logs
SET performer_name = OLD.full_name || ' (đã xóa)',
    performed_by = NULL
WHERE performed_by = OLD.id;
UPDATE public.import_logs
SET imported_by = NULL
WHERE imported_by = OLD.id;
UPDATE public.urgent_notifications
SET created_by = NULL
WHERE created_by = OLD.id;
UPDATE public.users
SET created_by = NULL
WHERE created_by = OLD.id;
RETURN OLD;
END;
$$;
-- 2. Fix protect_platform_owner_deletion - handle missing table
CREATE OR REPLACE FUNCTION public.protect_platform_owner_deletion() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ BEGIN IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
            AND table_name = 'platform_owners'
    ) THEN IF EXISTS (
        SELECT 1
        FROM public.platform_owners
        WHERE user_id = OLD.id
            AND is_active = true
    ) THEN RAISE EXCEPTION 'PROTECTED: Không thể xóa tài khoản Platform Owner.';
END IF;
END IF;
RETURN OLD;
END;
$$;