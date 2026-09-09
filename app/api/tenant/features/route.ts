import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTenantFeatures } from '@/lib/supabase/tenant-features';

/**
 * GET /api/tenant/features
 * Returns current tenant's feature flags for client-side enforcement.
 * Used by dashboard components to show/hide features based on plan.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's tenant_id
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
        }

        // Get tenant features with plan fallback
        const features = await getTenantFeatures(profile.tenant_id);
        if (!features) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
        }

        // Get feature registry (status badges)
        const { data: registry } = await supabase
            .from('feature_registry')
            .select('key, label, description, icon, status, status_note, changelog, released_at')
            .order('sort_order', { ascending: true });

        return NextResponse.json({
            plan: features.plan,
            features: features.feature_flags,
            registry: registry || [],
        });
    } catch (error: any) {
        console.error('GET /api/tenant/features error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
