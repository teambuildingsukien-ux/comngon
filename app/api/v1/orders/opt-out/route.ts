import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { getTodayDate } from '@/lib/utils/date'
import { VN_OFFSET } from '@/lib/utils/date-helpers'

// W-1 fix: Timezone constant from centralized date-helpers
const DEFAULT_TIMEZONE = VN_OFFSET;

export async function POST(request: NextRequest) {
    // Dual auth: session hoặc API key (scope: write)
    const auth = await authenticateDual(request, 'write');
    if (!isAuthSuccess(auth)) return auth;

    const { supabase, userId, authType } = auth;

    // Opt-out chỉ hỗ trợ session auth (cần biết user cụ thể)
    if (authType === 'api_key') {
        return NextResponse.json(
            { code: 'ERR_FORBIDDEN', message: 'Opt-out requires session authentication. API key not supported for this endpoint.' },
            { status: 403 }
        )
    }

    try {
        const today = getTodayDate()

        // ✅ Check user status — block paused/resigned
        const { data: userProfile } = await supabase
            .from('users')
            .select('status, tenant_id')
            .eq('id', userId)
            .single();

        if (userProfile?.status === 'paused' || userProfile?.status === 'resigned') {
            return NextResponse.json(
                { code: 'ERR_FORBIDDEN', message: 'Tài khoản tạm dừng hoặc đã nghỉ — không thể thay đổi đăng ký.' },
                { status: 403 }
            )
        }

        // ⚠️ AUDIT-FIX: Use tenant registration_deadline setting (same logic as toggle route)
        // Previously used hardcoded isBeforeDeadline() which was PERMANENTLY DISABLED (return true)
        if (userProfile?.tenant_id) {
            const { data: settings } = await supabase.from('system_settings')
                .select('key, value')
                .eq('tenant_id', userProfile.tenant_id)
                .in('key', ['registration_deadline', 'registration_deadline_enabled', 'allow_late_registration']);

            const deadlineTime = settings?.find((s: { key: string; value: string }) => s.key === 'registration_deadline')?.value || '08:00';
            const deadlineEnabled = settings?.find((s: { key: string; value: string }) => s.key === 'registration_deadline_enabled')?.value === 'true';
            const allowLate = settings?.find((s: { key: string; value: string }) => s.key === 'allow_late_registration')?.value !== 'false';

            const now = new Date();
            const deadlineDateTime = new Date(today + 'T' + deadlineTime + ':00' + DEFAULT_TIMEZONE);
            const isLate = deadlineEnabled && now > deadlineDateTime;

            if (isLate) {
                return NextResponse.json(
                    {
                        code: allowLate ? 'ERR_DEADLINE_PASSED' : 'ERR_LATE_DISABLED',
                        message: allowLate
                            ? `Đã quá hạn chót (${deadlineTime}). Sử dụng nút đăng ký/hủy muộn với lý do.`
                            : `Đã quá hạn chót (${deadlineTime}). Chức năng đăng ký muộn đã bị tắt.`,
                        deadline: deadlineTime
                    },
                    { status: 403 }
                )
            }
        }

        // Get current order
        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single()

        if (fetchError) {
            return NextResponse.json(
                { code: 'ERR_NOT_FOUND', message: 'Order not found for today' },
                { status: 404 }
            )
        }

        if (currentOrder.locked) {
            return NextResponse.json(
                { code: 'ERR_ORDER_LOCKED', message: 'Order already locked' },
                { status: 403 }
            )
        }

        const newStatus = currentOrder.status === 'eating' ? 'not_eating' : 'eating'

        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
                source: 'user_opt_out',
            })
            .eq('id', currentOrder.id)
            .select()
            .single()

        if (updateError) {
            return NextResponse.json(
                { code: 'ERR_INTERNAL_SERVER', message: 'Failed to update order' },
                { status: 500 }
            )
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: newStatus === 'eating' ? 'meal_registration' : 'meal_cancellation',
            performed_by: userId,
            target_type: 'order',
            target_id: userId,
            details: {
                date: today,
                status: newStatus,
                previous_status: currentOrder.status,
                source: 'daily_toggle_v1',
            }
        });

        return NextResponse.json(updatedOrder, { status: 200 })
    } catch (error) {
        console.error('POST /api/v1/orders/opt-out error:', error)
        return NextResponse.json(
            { code: 'ERR_INTERNAL_SERVER', message: 'Internal server error' },
            { status: 500 }
        )
    }
}
