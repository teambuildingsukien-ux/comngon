import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendPushToTenant } from '@/lib/push-helpers';

/**
 * POST /api/push/send — Send push notification to subscribers
 * Admin/Manager only
 * 
 * AUDIT-GUARD: Dùng shared helper sendPushToTenant() từ lib/push-helpers.ts
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.error('[Push Send] Unauthorized - no user from cookie');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[Push Send] User: ${user.email} (${user.id})`);

        // Use admin client for profile lookup (bypass RLS)
        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Verify admin/manager role
        const { data: profile, error: profileError } = await adminClient
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error(`[Push Send] Profile lookup failed for ${user.email}:`, profileError);
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        if (!profile || !['admin', 'manager'].includes(profile.role)) {
            console.error(`[Push Send] Not admin/manager: ${user.email} role=${profile?.role}`);
            return NextResponse.json({ error: 'Chỉ admin/manager mới gửi được push' }, { status: 403 });
        }

        const { title, message, target_audience, target_id } = await request.json();

        if (!title || !message) {
            return NextResponse.json({ error: 'Cần có tiêu đề và nội dung' }, { status: 400 });
        }

        console.log(`[Push Send] Admin ${user.email} sending push: "${title}" to ${target_audience} in tenant ${profile.tenant_id}`);

        // AUDIT-GUARD: Dùng shared helper thay vì duplicate logic
        const result = await sendPushToTenant(
            profile.tenant_id,
            title,
            message,
            {
                target_audience: target_audience || 'all',
                target_id: target_id || undefined,
                url: '/dashboard'
            }
        );

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error: any) {
        console.error('Push send error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

