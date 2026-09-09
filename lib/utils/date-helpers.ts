// ⚠️ AUDIT-GUARD: SINGLE SOURCE OF TRUTH cho VN timezone
// Tất cả server-side PHẢI dùng helpers này — KHÔNG hardcode timezone!

/** Vietnam timezone IANA identifier */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Vietnam UTC offset string (dùng cho Date constructor) */
export const VN_OFFSET = '+07:00';

/**
 * Returns YYYY-MM-DD dùng LOCAL timezone (browser).
 * ⚠️ CHỈ dùng cho CLIENT-SIDE UI (calendar, selectedDate).
 * Server-side PHẢI dùng getVietnamDateString() thay thế!
 */
export function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM-DD in Vietnam Timezone (GMT+7).
 * ✅ An toàn cho cả server-side (Vercel UTC) và client-side.
 */
export function getVietnamDateString(date: Date = new Date()): string {
    return date.toLocaleDateString('en-CA', { timeZone: VN_TIMEZONE });
}

/**
 * Returns Date object representing current time in VN timezone.
 * ✅ Thay thế pattern: new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
 */
export function getVietnamNow(date: Date = new Date()): Date {
    return new Date(date.toLocaleString('en-US', { timeZone: VN_TIMEZONE }));
}
