import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { getTodayDate } from '@/lib/utils/date'
import { getDefaultMealStatus } from '@/lib/meal-helpers'

export async function GET(request: NextRequest) {
    // Dual auth: session hoặc API key (scope: read)
    const auth = await authenticateDual(request, 'read');
    if (!isAuthSuccess(auth)) return auth;

    const { supabase, userId, tenantId, authType } = auth;

    try {
        const today = getTodayDate()

        if (authType === 'session' && userId) {
            // Session: lấy order cho user cụ thể
            const { data: order, error } = await supabase
                .from('orders')
                .select('*')
                .eq('user_id', userId)
                .eq('date', today)
                .single()

            if (error) {
                if (error.code === 'PGRST116') {
                    // Auto-create order
                    const { data: userProfile } = await supabase
                        .from('users')
                        .select('tenant_id, status, group_id, default_meal_status, resigned_date')
                        .eq('id', userId)
                        .single()

                    if (!userProfile?.tenant_id) {
                        return NextResponse.json(
                            { code: 'ERR_FORBIDDEN', message: 'Tenant not found' },
                            { status: 403 }
                        )
                    }

                    // ✅ Don't auto-create orders for paused/resigned users
                    if (userProfile.status === 'paused' || userProfile.status === 'resigned') {
                        return NextResponse.json({
                            user_id: userId,
                            date: today,
                            status: 'not_eating',
                            locked: true,
                            _virtual: true  // Indicates this is not a real DB record
                        }, { status: 200 })
                    }

                    // ✅ v6.1.2: NV active nhưng resigned_date ≤ hôm nay → coi như đã nghỉ
                    // (Safety net khi cron chưa kịp chạy Step 0)
                    if (userProfile.resigned_date && userProfile.resigned_date <= today) {
                        return NextResponse.json({
                            user_id: userId,
                            date: today,
                            status: 'not_eating',
                            locked: true,
                            _virtual: true
                        }, { status: 200 })
                    }

                    const defaultStatus = getDefaultMealStatus(userProfile);

                    const { data: newOrder, error: createError } = await supabase
                        .from('orders')
                        .insert({
                            tenant_id: userProfile.tenant_id,
                            user_id: userId,
                            date: today,
                            status: defaultStatus,
                            locked: false,
                            source: 'system_auto',
                        })
                        .select()
                        .single()

                    if (createError) {
                        return NextResponse.json(
                            { code: 'ERR_INTERNAL_SERVER', message: 'Failed to create order' },
                            { status: 500 }
                        )
                    }

                    // ✅ v6.0.0: Ghi system audit log khi auto-create order
                    try {
                        await supabase.from('activity_logs').insert({
                            tenant_id: userProfile.tenant_id,
                            action: 'system_auto_create_order',
                            performed_by: '00000000-0000-0000-0000-000000000000',
                            performer_name: 'System (Auto)',
                            target_type: 'order',
                            target_id: userId,
                            details: {
                                date: today,
                                status: defaultStatus,
                                source: 'auto_daily_open',
                                user_id: userId,
                            }
                        });
                    } catch (logErr) {
                        // Non-blocking: không fail order creation nếu log lỗi
                        console.error('⚠️ Failed to log auto-create:', logErr);
                    }

                    return NextResponse.json(newOrder, { status: 200 })
                }

                return NextResponse.json(
                    { code: 'ERR_INTERNAL_SERVER', message: 'Database error' },
                    { status: 500 }
                )
            }

            return NextResponse.json(order, { status: 200 })
        } else {
            // API key: lấy tất cả orders hôm nay cho tenant
            const { data: orders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('date', today)

            if (error) {
                return NextResponse.json(
                    { code: 'ERR_INTERNAL_SERVER', message: 'Database error' },
                    { status: 500 }
                )
            }

            return NextResponse.json({
                data: orders || [],
                date: today,
                tenant_id: tenantId,
                auth_type: 'api_key'
            }, { status: 200 })
        }
    } catch (error) {
        console.error('GET /api/v1/orders/today error:', error)
        return NextResponse.json(
            { code: 'ERR_INTERNAL_SERVER', message: 'Internal server error' },
            { status: 500 }
        )
    }
}
