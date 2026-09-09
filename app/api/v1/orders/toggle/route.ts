import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVietnamDateString, VN_OFFSET } from '@/lib/utils/date-helpers';
import { getDefaultMealStatus } from '@/lib/meal-helpers';

// W-1 fix: Timezone constant from centralized date-helpers
const DEFAULT_TIMEZONE = VN_OFFSET;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/v1/orders/toggle
 * Toggle meal order with server-side deadline validation
 * 
 * Body: { date?: string, reason?: string }
 * - date: YYYY-MM-DD (default: today)
 * - reason: required if past deadline (late registration)
 * 
 * Returns:
 * - 200: { status, is_late, deadline }
 * - 403: { error, code } if past deadline without reason
 * - 401: { error } if unauthorized
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse body safely (BUG-1 fix)
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            // Empty body → use defaults
        }
        // ⚠️ AUDIT-GUARD: PHẢI dùng getVietnamDateString — Vercel = UTC!
        const date = body.date || getVietnamDateString(new Date());
        // SEC-W2 fix: Sanitize XSS — strip HTML tags from user input
        const reason = body.reason?.trim()?.replace(/<[^>]*>/g, '') || null;

        // W-2 fix: Validate date format
        if (body.date && !DATE_REGEX.test(body.date)) {
            return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.', code: 'ERR_INVALID_DATE' }, { status: 400 });
        }

        // Query profile first (need tenant_id for settings filter)
        const { data: profile } = await supabase.from('users')
            .select('id, tenant_id, full_name, email, department, status, default_meal_status')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        // SEC: Block paused/resigned users from toggling meals
        if (profile.status === 'paused') {
            return NextResponse.json({
                error: 'Tài khoản đang tạm dừng. Liên hệ admin để kích hoạt lại.',
                code: 'ERR_ACCOUNT_PAUSED'
            }, { status: 403 });
        }
        if (profile.status === 'resigned') {
            return NextResponse.json({
                error: 'Tài khoản đã nghỉ việc.',
                code: 'ERR_ACCOUNT_RESIGNED'
            }, { status: 403 });
        }

        // SEC-W3 fix: Query settings with tenant isolation
        const { data: settings } = await supabase.from('system_settings')
            .select('key, value')
            .eq('tenant_id', profile.tenant_id)
            .in('key', ['registration_deadline', 'registration_deadline_enabled', 'allow_late_registration']);

        const deadlineTime = settings?.find(s => s.key === 'registration_deadline')?.value || '08:00';
        const deadlineEnabled = settings?.find(s => s.key === 'registration_deadline_enabled')?.value === 'true';
        const allowLate = settings?.find(s => s.key === 'allow_late_registration')?.value !== 'false'; // default true

        const now = new Date();
        const deadlineDateTime = new Date(date + 'T' + deadlineTime + ':00' + DEFAULT_TIMEZONE);
        const isLate = deadlineEnabled && now > deadlineDateTime;
        const lateMinutes = isLate ? Math.floor((now.getTime() - deadlineDateTime.getTime()) / 60000) : 0;

        // ⭐ v5.9.0: Nếu admin TẮT late registration → chặn hoàn toàn
        if (isLate && !allowLate) {
            return NextResponse.json({
                error: `Đã quá hạn chót (${deadlineTime}). Chức năng đăng ký muộn đã bị tắt bởi quản trị viên.`,
                code: 'ERR_LATE_DISABLED',
                deadline: deadlineTime
            }, { status: 403 });
        }

        // If past deadline and no reason provided → reject
        if (isLate && !reason) {
            return NextResponse.json({
                error: `Đã quá hạn chót (${deadlineTime}). Vui lòng cung cấp lý do để đăng ký/hủy muộn.`,
                code: 'ERR_DEADLINE_PASSED',
                deadline: deadlineTime
            }, { status: 403 });
        }

        // If past deadline and reason too short
        if (isLate && reason && reason.length < 5) {
            return NextResponse.json({
                error: 'Lý do phải có ít nhất 5 ký tự.',
                code: 'ERR_REASON_TOO_SHORT'
            }, { status: 400 });
        }

        // Check cooking exception — reject toggle on no_cook days
        const { data: cookingException } = await supabase
            .from('cooking_exceptions')
            .select('type, reason')
            .eq('tenant_id', profile.tenant_id)
            .eq('date', date)
            .single();

        if (cookingException?.type === 'no_cook') {
            return NextResponse.json({
                error: `Ngày ${date} đã được đánh dấu nghỉ bếp${cookingException.reason ? ` (${cookingException.reason})` : ''}. Không thể đăng ký/hủy.`,
                code: 'ERR_NO_COOK_DAY'
            }, { status: 403 });
        }

        // Get current order status
        const { data: currentOrder } = await supabase
            .from('orders')
            .select('status, locked')
            .eq('user_id', profile.id)
            .eq('date', date)
            .single();

        const defaultStatus = getDefaultMealStatus(profile);

        const currentStatus = currentOrder?.status || defaultStatus;
        const newStatus = currentStatus === 'eating' ? 'not_eating' : 'eating';

        // S-4 fix: Check if order is locked by kitchen/admin
        if (currentOrder?.status && currentOrder?.locked) {
            return NextResponse.json({
                error: 'Suất ăn đã bị khóa bởi quản trị viên.',
                code: 'ERR_ORDER_LOCKED'
            }, { status: 403 });
        }

        // Upsert order — ⚠️ v5.6.0: lưu is_late trực tiếp cho báo cáo HR
        const { error: upsertError } = await supabase
            .from('orders')
            .upsert({
                tenant_id: profile.tenant_id,
                user_id: profile.id,
                date: date,
                status: newStatus,
                is_late: isLate,
                updated_at: now.toISOString(),
                source: 'user_toggle',
            }, { onConflict: 'tenant_id,user_id,date' });

        if (upsertError) {
            console.error('[Toggle API] Upsert failed:', upsertError);
            return NextResponse.json({ error: 'Không thể cập nhật.' }, { status: 500 });
        }

        // Log activity with full audit trail
        const { error: logError } = await supabase.from('activity_logs').insert({
            tenant_id: profile.tenant_id,
            action: isLate
                ? (newStatus === 'eating' ? 'late_meal_registration' : 'late_meal_cancellation')
                : (newStatus === 'eating' ? 'meal_registration' : 'meal_cancellation'),
            performed_by: profile.id,
            target_type: 'order',
            target_id: profile.id,
            details: {
                date: date,
                status: newStatus,
                previous_status: currentStatus,
                action_timestamp: now.toISOString(),
                deadline: deadlineTime,
                is_late: isLate,
                late_minutes: lateMinutes,
                reason: reason,
                // SEC-W1 fix: Mask PII — partial email for audit trail
                user_name: profile.full_name,
                user_email: (() => {
                    const email = profile.email || user.email || '';
                    const [local, domain] = email.split('@');
                    return local ? `${local.slice(0, 3)}***@${domain}` : 'N/A';
                })(),
                department: profile.department,
                source: isLate ? 'late_toggle' : 'daily_toggle',
                user_agent: req.headers.get('user-agent') || 'unknown'
            }
        });

        if (logError) {
            console.error('[Toggle API] Activity log failed (non-blocking):', logError);
        }

        return NextResponse.json({
            status: newStatus,
            previous_status: currentStatus,
            is_late: isLate,
            late_minutes: lateMinutes,
            reason: reason,
            deadline: deadlineTime,
            message: isLate
                ? `Đã ${newStatus === 'eating' ? 'đăng ký ăn' : 'hủy suất ăn'} muộn (trễ ${lateMinutes} phút)`
                : `Đã ${newStatus === 'eating' ? 'đăng ký ăn' : 'hủy suất ăn'} thành công`
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('POST /api/v1/orders/toggle error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
