import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { fetchAll } from '@/lib/supabase/fetch-all'

export async function GET(request: NextRequest) {
    // Dual auth: session hoặc API key
    const auth = await authenticateDual(request, 'read');
    if (!isAuthSuccess(auth)) return auth;

    try {
        const { supabase, userId, tenantId, authType } = auth;

        // Get current month start and end dates (GMT+7)
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth()
        const monthStart = new Date(year, month, 1)
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

        const startDate = monthStart.toISOString().split('T')[0]
        const endDate = monthEnd.toISOString().split('T')[0]

        // ⚠️ AUDIT-FIX: Fetch orders + tenant meal price song song
        let orders: any[];
        let mealCost = 30000; // fallback mặc định nếu chưa config

        const [ordersResult, { data: aiConfig }] = await Promise.all([
            // Fetch orders (giữ logic cũ)
            authType === 'api_key'
                ? fetchAll<any>((from, to) =>
                    supabase
                        .from('orders')
                        .select('*')
                        .gte('date', startDate)
                        .lte('date', endDate)
                        .eq('tenant_id', tenantId)
                        .order('date', { ascending: true })
                        .range(from, to)
                  ).then(data => ({ data, error: null }))
                : supabase
                    .from('orders')
                    .select('*')
                    .gte('date', startDate)
                    .lte('date', endDate)
                    .eq('user_id', userId)
                    .order('date', { ascending: true }),
            // Fetch giá suất ăn từ cấu hình tenant
            supabase
                .from('tenant_ai_config')
                .select('meal_price, extra_cost_per_meal')
                .eq('tenant_id', tenantId)
                .single(),
        ]);

        if ('error' in ordersResult && ordersResult.error) {
            console.error('Error fetching monthly orders:', ordersResult.error)
            return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
        }
        orders = (ordersResult as any).data || [];

        // Dùng giá từ config tenant, fallback 30000 nếu chưa đặt
        if (aiConfig?.meal_price && aiConfig.meal_price > 0) {
            mealCost = aiConfig.meal_price + (aiConfig.extra_cost_per_meal || 0);
        }

        // Calculate statistics
        const totalDays = orders.length
        const eatingDays = orders.filter((o: { status: string }) => o.status === 'eating').length
        const skippedDays = orders.filter((o: { status: string }) => o.status === 'not_eating').length

        // Calculate compliance rate
        const compliantOrders = orders.filter((order: { updated_at: string | null }) => {
            if (!order.updated_at) return true
            const updateTime = new Date(order.updated_at)
            const vnHour = parseInt(updateTime.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }))
            return vnHour < 6
        }).length
        const complianceRate = totalDays > 0 ? Math.round((compliantOrders / totalDays) * 100) : 100

        const mealCostPerDay = mealCost // đã resolve ở trên
        const costSaved = skippedDays * mealCostPerDay
        const co2PerMeal = 0.8
        const co2Saved = Math.round(skippedDays * co2PerMeal * 10) / 10

        let topStreak = 0
        let currentStreak = 0
        orders.forEach((order: { status: string }) => {
            if (order.status === 'eating') {
                currentStreak++
                topStreak = Math.max(topStreak, currentStreak)
            } else {
                currentStreak = 0
            }
        })

        const stats = {
            totalDays,
            eatingDays,
            skippedDays,
            complianceRate,
            costSaved,
            mealCost,          // trả về để frontend biết giá đang dùng
            co2Saved,
            topStreak,
            ...(authType === 'api_key' ? { tenant_id: tenantId, auth_type: 'api_key' } : {})
        }

        return NextResponse.json(stats)
    } catch (error) {
        console.error('Error in monthly stats API:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
