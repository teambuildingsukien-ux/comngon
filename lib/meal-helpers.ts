/**
 * 🍚 Meal Status Helpers — SINGLE SOURCE OF TRUTH
 * 
 * Tất cả logic liên quan tới trạng thái ăn/không ăn mặc định
 * đều PHẢI đi qua file này. Không hardcode ở bất kỳ file nào khác.
 * 
 * ⚠️ AUDIT-GUARD: Sửa logic ở đây = sửa TOÀN BỘ hệ thống.
 */

// ── Types ──────────────────────────────────────
export type MealStatus = 'eating' | 'not_eating';

export interface UserWithDefault {
    id?: string;
    default_meal_status?: string | null;
    [key: string]: any;
}

// ── Core Logic ─────────────────────────────────

/**
 * Lấy trạng thái ăn mặc định từ user record.
 * 
 * Quy tắc:
 * - Nếu user.default_meal_status = 'not_eating' → 'not_eating'
 * - Mọi trường hợp khác (null, undefined, 'eating') → 'eating'
 * 
 * Dùng cho: NV chưa có order cho ngày đang xét.
 */
export function getDefaultMealStatus(user: UserWithDefault): MealStatus {
    return user.default_meal_status === 'not_eating' ? 'not_eating' : 'eating';
}

/**
 * Lấy trạng thái ăn hiệu lực cho NV vào 1 ngày cụ thể.
 * 
 * Ưu tiên: order status > default_meal_status > 'eating'
 * 
 * @param orderStatus - status từ orders table (có thể null nếu chưa có order)  
 * @param user - user record có chứa default_meal_status
 */
export function getEffectiveMealStatus(
    orderStatus: string | null | undefined,
    user: UserWithDefault
): MealStatus {
    if (orderStatus === 'eating' || orderStatus === 'not_eating') {
        return orderStatus;
    }
    return getDefaultMealStatus(user);
}

/**
 * Build map user_id → default_meal_status từ array users.
 * Dùng cho bulk operations (dashboard, counting, export).
 */
export function buildUserDefaultMap(users: UserWithDefault[]): Map<string, MealStatus> {
    const map = new Map<string, MealStatus>();
    users.forEach(u => {
        if (u.id) map.set(u.id, getDefaultMealStatus(u));
    });
    return map;
}

/**
 * Lấy default status từ map, fallback 'eating' nếu không tìm thấy.
 */
export function getDefaultFromMap(map: Map<string, MealStatus>, userId: string): MealStatus {
    return map.get(userId) || 'eating';
}

// ── Start Date Logic ────────────────────────────

/**
 * Kiểm tra NV đã bắt đầu làm chưa.
 * 
 * Quy tắc:
 * - start_date <= todayStr → đã bắt đầu → tính ăn bình thường
 * - start_date > todayStr → chưa bắt đầu → BỎ QUA (không đếm, không tạo order)
 * - start_date = null/undefined → backward compat → coi như đã bắt đầu
 * 
 * ⚠️ AUDIT-GUARD: Dùng cho 8+ API routes. Sửa ở đây = sửa toàn hệ thống.
 * 
 * @param user - user record có chứa start_date
 * @param todayStr - ngày hiện tại format 'YYYY-MM-DD' (phải dùng VN timezone)
 */
export function hasStartedWorking(
    user: { start_date?: string | null },
    todayStr: string
): boolean {
    if (!user.start_date) return true; // backward compat — NV cũ không có start_date
    return user.start_date <= todayStr;
}
