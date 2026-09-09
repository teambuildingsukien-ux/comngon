import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/supabase/tenant-features';

/**
 * GET /api/admin/branding
 * Lấy branding data của tenant hiện tại
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user profile with tenant_id
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
        }

        // Get branding data from tenants table
        const supabaseAdmin = createAdminClient();
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('custom_logo_url, custom_primary_color, custom_secondary_color, custom_fonts, name')
            .eq('id', profile.tenant_id)
            .single();

        if (tenantError) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
        }

        return NextResponse.json({
            name: tenant.name,
            logo_url: tenant.custom_logo_url || null,
            primary_color: tenant.custom_primary_color || '#B24700',
            secondary_color: tenant.custom_secondary_color || '#FF6B00',
            fonts: tenant.custom_fonts || { heading: 'Inter', body: 'Inter' },
        });
    } catch (error: any) {
        console.error('GET /api/admin/branding error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/branding
 * Cập nhật branding — chỉ admin/manager + feature flag check
 */
export async function PUT(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Role check
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        // ===== FEATURE FLAG CHECK =====
        const brandingEnabled = await isFeatureEnabled(profile.tenant_id, 'custom_branding');
        if (!brandingEnabled) {
            return NextResponse.json({
                error: 'Tính năng tuỳ chỉnh thương hiệu chưa được bật cho gói dịch vụ hiện tại. Liên hệ admin platform để nâng cấp.',
            }, { status: 403 });
        }

        const body = await req.json();
        const { logo_url, primary_color, secondary_color, fonts } = body;

        // Validate colors (hex format)
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        if (primary_color && !hexRegex.test(primary_color)) {
            return NextResponse.json({ error: 'Primary color phải là mã hex hợp lệ (VD: #B24700)' }, { status: 400 });
        }
        if (secondary_color && !hexRegex.test(secondary_color)) {
            return NextResponse.json({ error: 'Secondary color phải là mã hex hợp lệ' }, { status: 400 });
        }

        // Update tenant branding
        const supabaseAdmin = createAdminClient();
        const updateData: Record<string, any> = {};

        if (logo_url !== undefined) updateData.custom_logo_url = logo_url;
        if (primary_color) updateData.custom_primary_color = primary_color;
        if (secondary_color) updateData.custom_secondary_color = secondary_color;
        if (fonts) updateData.custom_fonts = fonts;

        const { error: updateError } = await supabaseAdmin
            .from('tenants')
            .update(updateData)
            .eq('id', profile.tenant_id);

        if (updateError) {
            console.error('Branding update error:', updateError);
            return NextResponse.json({ error: 'Không thể cập nhật branding' }, { status: 500 });
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: profile.tenant_id,
            action: 'branding_updated',
            performed_by: user.id,
            target_type: 'tenant',
            details: { logo_url: !!logo_url, primary_color, secondary_color, fonts: !!fonts }
        });

        return NextResponse.json({ success: true, message: 'Branding đã được cập nhật thành công!' });
    } catch (error: any) {
        console.error('PUT /api/admin/branding error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
