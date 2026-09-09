import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { getTodayDate } from '@/lib/utils/date'
import { buildUserDefaultMap, getDefaultFromMap, hasStartedWorking } from '@/lib/meal-helpers'

export async function GET(request: NextRequest) {
    // Dual auth: session hoặc API key (scope: read)
    const auth = await authenticateDual(request, 'read');
    if (!isAuthSuccess(auth)) return auth;

    const { supabase, userId, tenantId, authType } = auth;

    // Role check - Kitchen or Admin HR (only for session auth)
    if (authType === 'session' && userId) {
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single()

        if (!userData || !['kitchen', 'admin', 'hr', 'manager'].includes(userData.role)) {
            return NextResponse.json(
                { code: 'ERR_FORBIDDEN', message: 'Kitchen or Admin HR access required' },
                { status: 403 }
            )
        }
    }

    try {
        const today = getTodayDate()
        const searchParams = request.nextUrl.searchParams
        const statusFilter = searchParams.get('status')
        const searchQuery = searchParams.get('search') || ''

        // Get all active staff who eat (everyone except kitchen)
        let usersQuery = supabase
            .from('users')
            .select('id, email, full_name, department, role, start_date, default_meal_status')
            .not('role', 'ilike', 'kitchen')
            .eq('status', 'active')
            .is('deleted_at', null)

        // API key: filter by tenant
        if (authType === 'api_key') {
            usersQuery = usersQuery.eq('tenant_id', tenantId)
        }

        if (searchQuery) {
            usersQuery = usersQuery.or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,department.ilike.%${searchQuery}%`)
        }

        const { data: employees, error: usersError } = await usersQuery

        if (usersError) {
            return NextResponse.json(
                { code: 'ERR_INTERNAL_SERVER', message: 'Failed to fetch employees' },
                { status: 500 }
            )
        }

        // Get today's orders
        // ⚠️ SCALABILITY-FIX: .limit(5000) for 3K NV
        let ordersQuery = supabase
            .from('orders')
            .select('id, user_id, date, status, locked, created_at, updated_at, note, is_late')
            .eq('date', today)
            .limit(5000)

        if (authType === 'api_key') {
            ordersQuery = ordersQuery.eq('tenant_id', tenantId)
        }

        const { data: orders, error: ordersError } = await ordersQuery

        if (ordersError) {
            return NextResponse.json(
                { code: 'ERR_INTERNAL_SERVER', message: 'Failed to fetch orders' },
                { status: 500 }
            )
        }

        const ordersMap = new Map(orders?.map((order: { user_id: string }) => [order.user_id, order]) || [])

        // ⚠️ AUDIT-FIX (W-3): Merged duplicate user query — reuse employees data
        const userDefaultMap = buildUserDefaultMap(employees || []);

        const employeesWithOrders = employees?.map((emp: { id: string }) => {
            const order = ordersMap.get(emp.id)
            const defaultStatus = getDefaultFromMap(userDefaultMap, emp.id);

            return {
                ...emp,
                order: order || {
                    id: null,
                    user_id: emp.id,
                    date: today,
                    status: defaultStatus,
                    locked: false,
                    created_at: null,
                    updated_at: null,
                }
            }
        }) || []

        // ⚠️ START_DATE: Filter NV chưa bắt đầu làm
        const activeEmployees = employeesWithOrders.filter((emp: any) => hasStartedWorking(emp, today))

        let filteredEmployees = activeEmployees
        if (statusFilter && statusFilter !== 'all') {
            filteredEmployees = activeEmployees.filter((emp: { order: { status: string } }) =>
                emp.order.status === statusFilter
            )
        }

        const total_employees = activeEmployees.length
        const total_eating_employees = activeEmployees.filter((emp: { order: { status: string } }) => emp.order.status === 'eating').length
        const total_not_eating = activeEmployees.filter((emp: { order: { status: string } }) => emp.order.status === 'not_eating').length

        // Include guest meals in total
        const { data: guestMealsData } = await supabase
            .from('guest_meals')
            .select('quantity')
            .eq('date', today);
        const guestMealsTotal = guestMealsData?.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0) || 0;

        const total_eating = total_eating_employees + guestMealsTotal;

        return NextResponse.json({
            summary: {
                total_employees,
                total_eating,
                total_not_eating,
                guest_meals: guestMealsTotal,
                date: today,
            },
            employees: filteredEmployees,
            ...(authType === 'api_key' ? { auth_type: 'api_key', tenant_id: tenantId } : {})
        }, { status: 200 })
    } catch (error) {
        console.error('GET /api/v1/dashboard/kitchen error:', error)
        return NextResponse.json(
            { code: 'ERR_INTERNAL_SERVER', message: 'Internal server error' },
            { status: 500 }
        )
    }
}
