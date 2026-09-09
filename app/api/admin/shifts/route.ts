import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkResourceLimit, isFeatureEnabled } from '@/lib/supabase/tenant-features';

/**
 * GET /api/admin/shifts
 * List all shifts ordered by start_time
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // RLS auto-filters by tenant_id
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .order('start_time', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error: any) {
        console.error('GET /api/admin/shifts error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/shifts
 * Create new shift
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, start_time, end_time } = body;

        // Validation
        if (!name || !start_time || !end_time) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (start_time >= end_time) {
            return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 });
        }

        // Get user's tenant_id AND role
        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        // Check role — only admin/manager can create shifts
        const role = userProfile.role?.toLowerCase();
        if (role !== 'admin' && role !== 'manager') {
            return NextResponse.json(
                { error: 'Chỉ Admin hoặc Manager mới có thể tạo ca làm việc.' },
                { status: 403 }
            );
        }

        // ===== FEATURE FLAG: multi_shift =====
        const multiShiftEnabled = await isFeatureEnabled(userProfile.tenant_id, 'multi_shift');
        if (!multiShiftEnabled) {
            // Check if any shift already exists — free plan only allows 1
            const { count } = await supabase
                .from('shifts')
                .select('*', { count: 'exact', head: true });
            if ((count ?? 0) >= 1) {
                return NextResponse.json(
                    { error: 'Gói dịch vụ hiện tại không hỗ trợ đa ca ăn. Vui lòng nâng cấp gói để tạo thêm ca.' },
                    { status: 403 }
                );
            }
        }

        // ===== LIMIT CHECK: max_shifts =====
        const limitCheck = await checkResourceLimit(userProfile.tenant_id, 'shifts');
        if (!limitCheck.allowed) {
            return NextResponse.json({ error: limitCheck.message }, { status: 403 });
        }

        // Check duplicate name within same tenant
        const { data: existing } = await supabase
            .from('shifts')
            .select('id')
            .eq('name', name)
            .single();

        if (existing) {
            return NextResponse.json({ error: 'Shift name already exists' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('shifts')
            .insert({ name, start_time, end_time, tenant_id: userProfile.tenant_id })
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'shift_created',
            performed_by: user.id,
            target_type: 'shift',
            target_id: data.id,
            details: { name, start_time, end_time }
        });

        return NextResponse.json({ data }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/shifts error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
