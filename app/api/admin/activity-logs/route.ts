import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check role - only admin/manager/hr can view activity logs
        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });
        }

        const role = userProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager', 'hr'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin, manager or hr role' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;

        // Parse query parameters
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const action = searchParams.get('action') || '';
        const userId = searchParams.get('user_id') || '';
        const fromDate = searchParams.get('from_date') || '';
        const toDate = searchParams.get('to_date') || '';

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Build query
        let query = supabase
            .from('activity_logs')
            .select(`
                id,
                action,
                target_type,
                target_id,
                details,
                created_at,
                performer_name,
                performed_by:users (
                    id,
                    full_name,
                    email,
                    avatar_url
                )
            `, { count: 'exact' })
            .order('created_at', { ascending: false });

        // Apply filters
        if (action) {
            query = query.ilike('action', `%${action}%`);
        }

        if (userId) {
            query = query.eq('performed_by', userId);
        }

        if (fromDate) {
            query = query.gte('created_at', fromDate);
        }

        if (toDate) {
            // Add 23:59:59 to include the entire day
            const endOfDay = new Date(toDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endOfDay.toISOString());
        }

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        const { data: logs, count, error } = await query;

        if (error) {
            console.error('Error fetching activity logs:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch activity logs' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                logs: logs || [],
                total: count || 0,
                page,
                limit,
                totalPages: count ? Math.ceil(count / limit) : 0
            }
        });

    } catch (error) {
        console.error('Error in activity logs API:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
