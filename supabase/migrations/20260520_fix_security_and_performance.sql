-- Migration: Fix Security Advisors (RLS on rate_limits, search_path on functions, and RLS Performance optimization)
-- Date: 2026-05-20

-- ============================================================================
-- 1. BẢO MẬT BẢNG RATE_LIMITS
-- ============================================================================

-- Bật Row-Level Security (RLS) cho bảng rate_limits
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Không tạo chính sách (policy) công khai nào cho bảng rate_limits. 
-- Mọi tương tác với bảng này sẽ được thực hiện thông qua hàm check_and_increment_rate_limit với đặc quyền SECURITY DEFINER.

-- ============================================================================
-- 2. CẬP NHẬT CÁC HÀM XỬ LÝ RATE LIMIT SANG SECURITY DEFINER & SET SEARCH_PATH
-- ============================================================================

-- Cập nhật hàm check_and_increment_rate_limit
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(p_key text, p_window_ms integer, p_max integer)
 RETURNS TABLE(current_count integer, retry_after_ms bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_now        TIMESTAMPTZ := NOW();
    v_reset_at   TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
    v_count      INTEGER;
    v_remaining  BIGINT;
BEGIN
    -- Atomic upsert: insert mới hoặc increment trong cùng window
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (p_key, 1, v_reset_at)
    ON CONFLICT (key) DO UPDATE SET
        count    = CASE
                     WHEN rate_limits.reset_at < v_now THEN 1           -- window cũ → reset
                     ELSE rate_limits.count + 1                         -- còn trong window → tăng
                   END,
        reset_at = CASE
                     WHEN rate_limits.reset_at < v_now THEN v_reset_at  -- window mới
                     ELSE rate_limits.reset_at                          -- giữ nguyên window cũ
                   END
    RETURNING rate_limits.count, EXTRACT(EPOCH FROM (rate_limits.reset_at - v_now)) * 1000
    INTO v_count, v_remaining;

    RETURN QUERY SELECT v_count, GREATEST(0, v_remaining)::BIGINT;
END;
$function$;

-- Cập nhật hàm cleanup_expired_rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
    DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '10 minutes';
$function$;

-- ============================================================================
-- 3. THU HỒI QUYỀN THỰC THI TRỰC TIẾP CỦA HÀM DƯỚI DẠNG RPC API
-- ============================================================================

-- Thu hồi quyền execute từ public, authenticated và anon đối với hàm get_auth_user_by_email
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM anon;

-- Thu hồi quyền execute đối với check_and_increment_rate_limit
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM anon;

-- Thu hồi quyền execute đối với cleanup_expired_rate_limits
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() FROM public;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() FROM anon;

-- ============================================================================
-- 4. KHẮC PHỤC CẢNH BÁO SEARCH_PATH CHO CÁC HÀM HỆ THỐNG
-- ============================================================================

ALTER FUNCTION public.update_feature_registry_timestamp() SET search_path = public;
ALTER FUNCTION public.hybrid_search(uuid, vector, text, text[], integer, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.kg_neighbors(uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.vector_search(uuid, vector, text[], integer) SET search_path = public, pg_catalog;

-- ============================================================================
-- 5. TỐI ƯU HÓA HIỆU NĂNG RLS (INITPLAN & TARGET ROLE) CHO CÁC BẢNG AI
-- ============================================================================

-- Bảng ai_document_chunks
DROP POLICY IF EXISTS ai_chunks_service_role ON public.ai_document_chunks;
CREATE POLICY ai_chunks_service_role ON public.ai_document_chunks 
FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS ai_chunks_tenant_isolation ON public.ai_document_chunks;
CREATE POLICY ai_chunks_tenant_isolation ON public.ai_document_chunks 
FOR ALL TO authenticated USING (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = (SELECT auth.uid())));

-- Bảng ai_kg_communities
DROP POLICY IF EXISTS kg_communities_service_role ON public.ai_kg_communities;
CREATE POLICY kg_communities_service_role ON public.ai_kg_communities 
FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS kg_communities_tenant_isolation ON public.ai_kg_communities;
CREATE POLICY kg_communities_tenant_isolation ON public.ai_kg_communities 
FOR ALL TO authenticated USING (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = (SELECT auth.uid())));

-- Bảng ai_kg_entities
DROP POLICY IF EXISTS kg_entities_service_role ON public.ai_kg_entities;
CREATE POLICY kg_entities_service_role ON public.ai_kg_entities 
FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS kg_entities_tenant_isolation ON public.ai_kg_entities;
CREATE POLICY kg_entities_tenant_isolation ON public.ai_kg_entities 
FOR ALL TO authenticated USING (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = (SELECT auth.uid())));

-- Bảng ai_kg_relationships
DROP POLICY IF EXISTS kg_rels_service_role ON public.ai_kg_relationships;
CREATE POLICY kg_rels_service_role ON public.ai_kg_relationships 
FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS kg_rels_tenant_isolation ON public.ai_kg_relationships;
CREATE POLICY kg_rels_tenant_isolation ON public.ai_kg_relationships 
FOR ALL TO authenticated USING (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = (SELECT auth.uid())));
