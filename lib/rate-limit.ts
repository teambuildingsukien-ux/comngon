/**
 * 🛡️ Distributed Rate Limiter — Supabase Backend
 * Thay thế in-memory Map (không hoạt động trên Vercel serverless multi-instance).
 * Dùng RPC atomic `check_and_increment_rate_limit` để đảm bảo nhất quán.
 */

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Check rate limit cho 1 key (thường là user_id).
 * @returns `null` nếu OK, hoặc object { retryAfterSeconds } nếu bị chặn.
 *
 * ⚠️ BREAKING CHANGE: Hàm này giờ là async — phải dùng await khi gọi.
 */
export async function checkRateLimit(
    key: string,
    maxRequests: number = 10,
    windowMs: number = 60_000
): Promise<{ retryAfterSeconds: number } | null> {
    try {
        const supabase = createAdminClient();

        const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
            p_key: key,
            p_window_ms: windowMs,
            p_max: maxRequests,
        });

        if (error) {
            // Nếu Supabase lỗi → fail open (cho qua) để không block users
            console.warn('[RateLimit] Supabase RPC error, failing open:', error.message);
            return null;
        }

        const result = data?.[0];
        if (!result) return null;

        const { current_count, retry_after_ms } = result;

        if (current_count > maxRequests) {
            const retryAfterSeconds = Math.ceil((retry_after_ms as number) / 1000);
            return { retryAfterSeconds: Math.max(1, retryAfterSeconds) };
        }

        // Cleanup expired entries theo xác suất (10% mỗi request) — không block
        if (Math.random() < 0.1) {
            void (supabase.rpc('cleanup_expired_rate_limits') as unknown as Promise<void>)
                .catch(() => {});
        }

        return null;
    } catch (err) {
        // Fail open — không để rate limit break production
        console.warn('[RateLimit] Unexpected error, failing open:', err);
        return null;
    }
}
