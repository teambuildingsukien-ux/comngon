import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { getTodayDate } from '@/lib/utils/date'
import { fetchAll } from '@/lib/supabase/fetch-all'

export async function GET(request: NextRequest) {
    // Dual auth: session hoặc API key (scope: read)
    const auth = await authenticateDual(request, 'read');
    if (!isAuthSuccess(auth)) return auth;

    const { supabase, userId, tenantId, authType } = auth;

    // Role check - Manager or Admin HR (only for session auth)
    if (authType === 'session' && userId) {
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single()

        if (!userData || !['manager', 'admin', 'hr'].includes(userData.role)) {
            return NextResponse.json(
                { code: 'ERR_FORBIDDEN', message: 'Manager or Admin HR access required' },
                { status: 403 }
            )
        }
    }

    try {
        const searchParams = request.nextUrl.searchParams
        const days = parseInt(searchParams.get('days') || '30')

        const today = getTodayDate()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        // ⚠️ AUDIT-FIX: Use local date components instead of toISOString (timezone-safe)
        const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`

        // Get total active employees count
        // ⚠️ AUDIT-FIX: Count ALL non-kitchen roles, not just 'employee'
        let employeesQuery = supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .not('role', 'ilike', 'kitchen')
            .eq('status', 'active')
            .is('deleted_at', null)
            .or(`start_date.lte.${today},start_date.is.null`) // ⚠️ START_DATE: loại NV chưa bắt đầu + giữ NV cũ (null)

        if (authType === 'api_key') {
            employeesQuery = employeesQuery.eq('tenant_id', tenantId)
        }

        const { count: totalEmployees } = await employeesQuery

        // ⚠️ SCALABILITY-FIX: Paginated fetch — 3K NV × 30 days = 66K rows
        let orders: { date: string; status: string; user_id: string }[];
        try {
            orders = await fetchAll<{ date: string; status: string; user_id: string }>((from, to) => {
                let q = supabase
                    .from('orders')
                    .select('date, status, user_id')
                    .gte('date', startDateStr)
                    .lte('date', today)
                    .range(from, to);
                if (authType === 'api_key') q = q.eq('tenant_id', tenantId);
                return q;
            });
        } catch {
            return NextResponse.json(
                { code: 'ERR_INTERNAL_SERVER', message: 'Failed to fetch orders' },
                { status: 500 }
            )
        }

        // Group orders by date
        const ordersByDate = new Map<string, { date: string; status: string; user_id: string }[]>()
        orders.forEach((order) => {
            if (!ordersByDate.has(order.date)) {
                ordersByDate.set(order.date, [])
            }
            ordersByDate.get(order.date)!.push(order)
        })

        // Calculate KPIs
        let totalOrders = 0
        let totalNotEating = 0

        orders.forEach((order) => {
            totalOrders++
            if (order.status === 'not_eating') {
                totalNotEating++
            }
        })

        const waste_rate = totalOrders > 0
            ? parseFloat(((totalNotEating / totalOrders) * 100).toFixed(1))
            : 0

        const cost_per_meal = 25000
        const cost_savings = totalNotEating * cost_per_meal

        const compliance_rate = totalOrders > 0
            ? parseFloat((((totalOrders) / (totalEmployees || 1) / days) * 100).toFixed(1))
            : 0

        // Trend data
        const trendData: { date: string; total_employees: number; total_orders: number; total_eating: number; total_not_eating: number; waste_rate: number }[] = []
        const dateIterator = new Date(startDate)

        while (dateIterator <= new Date(today)) {
            // ⚠️ AUDIT-FIX: timezone-safe date string
            const dateStr = `${dateIterator.getFullYear()}-${String(dateIterator.getMonth() + 1).padStart(2, '0')}-${String(dateIterator.getDate()).padStart(2, '0')}`
            const dayOrders = ordersByDate.get(dateStr) || []

            const dayTotalEmployees = totalEmployees || 0
            const dayTotalOrders = dayOrders.length
            const dayEating = dayOrders.filter(o => o.status === 'eating').length
            const dayNotEating = dayOrders.filter(o => o.status === 'not_eating').length
            const dayWasteRate = dayTotalOrders > 0
                ? parseFloat(((dayNotEating / dayTotalOrders) * 100).toFixed(1))
                : 0

            trendData.push({
                date: dateStr,
                total_employees: dayTotalEmployees,
                total_orders: dayTotalOrders,
                total_eating: dayEating,
                total_not_eating: dayNotEating,
                waste_rate: dayWasteRate,
            })

            dateIterator.setDate(dateIterator.getDate() + 1)
        }

        return NextResponse.json({
            kpis: {
                waste_rate,
                cost_savings,
                compliance_rate,
                total_employees: totalEmployees || 0,
                total_orders: totalOrders,
                total_not_eating: totalNotEating,
            },
            trend_data: trendData,
            date_range: {
                start: startDateStr,
                end: today,
                days,
            },
            ...(authType === 'api_key' ? { auth_type: 'api_key', tenant_id: tenantId } : {})
        }, { status: 200 })
    } catch (error) {
        console.error('GET /api/v1/dashboard/manager error:', error)
        return NextResponse.json(
            { code: 'ERR_INTERNAL_SERVER', message: 'Internal server error' },
            { status: 500 }
        )
    }
}
