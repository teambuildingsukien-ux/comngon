import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface CookingDaysSetting {
    start_day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
    end_day: number;
}

/**
 * GET /api/admin/settings/cooking-days
 * Get cooking days configuration
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's tenant_id
        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        // Get cooking_days setting (RLS filters by tenant)
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'cooking_days')
            .single();

        if (error) {
            // If setting doesn't exist, create it with default (Monday-Friday)
            if (error.code === 'PGRST116') {
                const defaultSetting: CookingDaysSetting = { start_day: 1, end_day: 5 };
                const adminClient = createAdminClient();

                const { data: inserted, error: insertError } = await adminClient
                    .from('system_settings')
                    .insert({
                        key: 'cooking_days',
                        tenant_id: userProfile.tenant_id,
                        value: JSON.stringify(defaultSetting),
                        description: 'Configure which days of the week to cook. 0=Sunday, 1=Monday, ..., 6=Saturday. Default is Monday(1) to Friday(5).'
                    })
                    .select('value')
                    .single();

                if (insertError) throw insertError;
                const parsedValue = typeof inserted.value === 'string'
                    ? JSON.parse(inserted.value)
                    : inserted.value;
                return NextResponse.json({ data: parsedValue });
            }
            throw error;
        }

        // Parse the TEXT value back to JSON object
        const parsedValue = typeof data.value === 'string'
            ? JSON.parse(data.value)
            : data.value;
        return NextResponse.json({ data: parsedValue });
    } catch (error: any) {
        console.error('GET /api/admin/settings/cooking-days error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/admin/settings/cooking-days
 * Update cooking days configuration
 */
export async function PUT(req: Request) {
    try {
        const supabase = await createClient();

        // Check auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's tenant_id and role
        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        // Check role - only admin/manager can change cooking days
        const role = userProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        const body: CookingDaysSetting = await req.json();
        const { start_day, end_day } = body;

        // Validation
        if (start_day < 0 || start_day > 6 || end_day < 0 || end_day > 6) {
            return NextResponse.json(
                { error: 'start_day và end_day phải trong khoảng 0-6' },
                { status: 400 }
            );
        }

        // Update or insert setting with tenant isolation
        const { data, error } = await supabase
            .from('system_settings')
            .upsert({
                key: 'cooking_days',
                tenant_id: userProfile.tenant_id,
                value: JSON.stringify({ start_day, end_day }),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'key,tenant_id'
            })
            .select('value')
            .single();

        if (error) throw error;

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'cooking_days_updated',
            performed_by: user.id,
            target_type: 'settings',
            details: { start_day, end_day }
        });

        // Parse the TEXT value back to JSON object
        const parsedValue = typeof data.value === 'string'
            ? JSON.parse(data.value)
            : data.value;
        return NextResponse.json({ data: parsedValue });
    } catch (error: any) {
        console.error('PUT /api/admin/settings/cooking-days error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
