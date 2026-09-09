/**
 * ⏱️ Gemini API Timeout Helper
 * Wrap Promise với timeout — tránh Vercel function treo khi Google API chậm/sập.
 *
 * Dùng: await withTimeout(geminiCall(), 28_000, 'AI đang bận')
 */

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TimeoutError'
    }
}

/**
 * Race giữa promise gốc và timeout.
 * @param promise   Promise cần wrap
 * @param ms        Milliseconds timeout (default: 28s — trước Vercel 30s limit)
 * @param message   Message trả về khi timeout (user-facing)
 */
export function withTimeout<T>(
    promise: Promise<T>,
    ms: number = 28_000,
    message: string = 'AI đang bận, vui lòng thử lại sau 30 giây.'
): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TimeoutError(message)), ms)
    )
    return Promise.race([promise, timeout])
}
