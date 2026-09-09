import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { authenticateDual, isAuthSuccess } from '@/lib/middleware/dual-auth'
import { getVietnamDateString } from '@/lib/utils/date-helpers';

export async function GET(request: NextRequest) {
    // Dual auth: session hoặc API key (scope: read)
    const auth = await authenticateDual(request, 'read');
    if (!isAuthSuccess(auth)) return auth;

    const { supabase, userId, tenantId, authType } = auth;

    try {
        const searchParams = request.nextUrl.searchParams
        const days = parseInt(searchParams.get('days') || '30')
        const page = parseInt(searchParams.get('page') || '1')
        const pageSize = parseInt(searchParams.get('page_size') || '50')

        if (days > 90) {
            return NextResponse.json(
                { code: 'ERR_VALIDATION', message: 'Max days is 90' },
                { status: 400 }
            )
        }

        const todayStr = getVietnamDateString();
        const d = new Date(todayStr);
        d.setDate(d.getDate() - days);
        const startDateStr = getVietnamDateString(d);

        let ordersQuery = supabase
            .from('orders')
            .select('*', { count: 'exact' })
            .gte('date', startDateStr)
            .order('date', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1)

        if (authType === 'session' && userId) {
            ordersQuery = ordersQuery.eq('user_id', userId)
        } else {
            ordersQuery = ordersQuery.eq('tenant_id', tenantId)
        }

        const { data: orders, error, count } = await ordersQuery

        if (error) {
            return NextResponse.json(
                { code: 'ERR_INTERNAL_SERVER', message: 'Database error' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            data: orders || [],
            pagination: {
                page,
                page_size: pageSize,
                total: count || 0,
                total_pages: Math.ceil((count || 0) / pageSize),
            },
            ...(authType === 'api_key' ? { auth_type: 'api_key', tenant_id: tenantId } : {})
        }, { status: 200 })
    } catch (error) {
        console.error('GET /api/v1/orders/history error:', error)
        return NextResponse.json(
            { code: 'ERR_INTERNAL_SERVER', message: 'Internal server error' },
            { status: 500 }
        )
    }
}
