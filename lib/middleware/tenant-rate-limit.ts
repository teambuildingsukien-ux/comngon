import { NextRequest, NextResponse } from 'next/server';

/**
 * 🚦 Tenant Rate Limiter — Per-tenant per-plan rate limiting
 * 
 * Dùng in-memory Map (phù hợp Vercel serverless — mỗi instance giữ local counter).
 * Cho production scale cần chuyển sang Redis/Upstash.
 * 
 * Headers trả về:
 *   X-RateLimit-Limit: Giới hạn requests/phút
 *   X-RateLimit-Remaining: Số requests còn lại
 *   X-RateLimit-Reset: Timestamp reset (Unix seconds)
 */

// Rate limits per plan (requests per minute)
const PLAN_RATE_LIMITS: Record<string, { rpm: number; rpd: number }> = {
    free:       { rpm: 30,  rpd: 1000 },
    basic:      { rpm: 60,  rpd: 5000 },
    starter:    { rpm: 60,  rpd: 5000 },
    pro:        { rpm: 120, rpd: 20000 },
    professional: { rpm: 120, rpd: 20000 },
    enterprise: { rpm: 300, rpd: 100000 },
};

interface RateLimitBucket {
    count: number;
    resetAt: number; // Unix ms
    dailyCount: number;
    dailyResetAt: number; // Unix ms
}

// In-memory store (per serverless instance)
const buckets = new Map<string, RateLimitBucket>();

/**
 * Clean up expired buckets periodically
 */
function cleanupBuckets() {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (bucket.dailyResetAt < now) {
            buckets.delete(key);
        }
    }
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupBuckets, 5 * 60 * 1000);
}

/**
 * Check rate limit for a tenant.
 * Returns null if allowed, NextResponse if rate limited.
 */
export function checkTenantRateLimit(
    tenantId: string,
    plan: string = 'free'
): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    headers: Record<string, string>;
} {
    const limits = PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.free;
    const now = Date.now();
    const minuteWindow = 60 * 1000; // 1 minute
    const dayWindow = 24 * 60 * 60 * 1000; // 24 hours

    let bucket = buckets.get(tenantId);

    if (!bucket || bucket.resetAt < now) {
        // New or expired minute bucket
        bucket = {
            count: 0,
            resetAt: now + minuteWindow,
            dailyCount: bucket?.dailyResetAt && bucket.dailyResetAt > now ? bucket.dailyCount : 0,
            dailyResetAt: bucket?.dailyResetAt && bucket.dailyResetAt > now 
                ? bucket.dailyResetAt 
                : now + dayWindow,
        };
    }

    // Reset daily if expired
    if (bucket.dailyResetAt < now) {
        bucket.dailyCount = 0;
        bucket.dailyResetAt = now + dayWindow;
    }

    bucket.count++;
    bucket.dailyCount++;
    buckets.set(tenantId, bucket);

    const remaining = Math.max(0, limits.rpm - bucket.count);
    const resetAtSeconds = Math.ceil(bucket.resetAt / 1000);

    const headers: Record<string, string> = {
        'X-RateLimit-Limit': String(limits.rpm),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(resetAtSeconds),
        'X-RateLimit-Plan': plan,
    };

    // Check per-minute limit
    if (bucket.count > limits.rpm) {
        return { allowed: false, limit: limits.rpm, remaining: 0, resetAt: resetAtSeconds, headers };
    }

    // Check daily limit
    if (bucket.dailyCount > limits.rpd) {
        headers['X-RateLimit-Daily-Limit'] = String(limits.rpd);
        headers['X-RateLimit-Daily-Remaining'] = '0';
        return { allowed: false, limit: limits.rpd, remaining: 0, resetAt: resetAtSeconds, headers };
    }

    return { allowed: true, limit: limits.rpm, remaining, resetAt: resetAtSeconds, headers };
}

/**
 * Middleware wrapper — trả 429 nếu vượt giới hạn.
 */
export function withRateLimit(
    request: NextRequest,
    tenantId: string,
    plan: string = 'free'
): NextResponse | null {
    const result = checkTenantRateLimit(tenantId, plan);

    if (!result.allowed) {
        return NextResponse.json(
            {
                code: 'ERR_RATE_LIMIT',
                message: `Đã vượt giới hạn ${result.limit} requests/phút cho gói ${plan}. Vui lòng thử lại sau.`,
                retry_after: result.resetAt - Math.ceil(Date.now() / 1000),
            },
            {
                status: 429,
                headers: {
                    ...result.headers,
                    'Retry-After': String(result.resetAt - Math.ceil(Date.now() / 1000)),
                },
            }
        );
    }

    // Allowed — return null
    return null;
}

/**
 * Add rate limit headers to existing response.
 */
export function addRateLimitHeaders(
    response: NextResponse,
    tenantId: string,
    plan: string = 'free'
): NextResponse {
    const result = checkTenantRateLimit(tenantId, plan);
    for (const [key, value] of Object.entries(result.headers)) {
        response.headers.set(key, value);
    }
    return response;
}
