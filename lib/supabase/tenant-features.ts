import { createClient as createAdminClient } from '@supabase/supabase-js';

// ============================================
// Tenant Features & Resource Limits
// Backend logic for enforcing feature flags
// and plan-based resource limits
// ============================================

// Plan-based default feature flags
const PLAN_DEFAULTS: Record<string, Record<string, any>> = {
    free: {
        ai_chat: false,
        ai_reports: false,
        ai_settings: false,
        knowledge_base: false,
        bulk_registration: false,
        export_excel: false,
        custom_branding: false,
        api_access: true,
        advanced_analytics: false,
        multi_shift: false,
        notifications: true,
        max_departments: 2,
        max_shifts: 1,
        max_groups: 2,
    },
    starter: {
        ai_chat: false,
        ai_reports: false,
        ai_settings: false,
        knowledge_base: false,
        bulk_registration: true,
        export_excel: true,
        custom_branding: false,
        api_access: true,
        advanced_analytics: false,
        multi_shift: true,
        notifications: true,
        max_departments: 5,
        max_shifts: 3,
        max_groups: 5,
    },
    pro: {
        ai_chat: true,
        ai_reports: true,
        ai_settings: true,
        knowledge_base: true,
        bulk_registration: true,
        export_excel: true,
        custom_branding: true,
        api_access: true,
        advanced_analytics: true,
        multi_shift: true,
        notifications: true,
        max_departments: 20,
        max_shifts: 10,
        max_groups: 20,
    },
    enterprise: {
        ai_chat: true,
        ai_reports: true,
        ai_settings: true,
        knowledge_base: true,
        bulk_registration: true,
        export_excel: true,
        custom_branding: true,
        api_access: true,
        advanced_analytics: true,
        multi_shift: true,
        notifications: true,
        max_departments: 999,
        max_shifts: 999,
        max_groups: 999,
    },
    // Legacy alias: "basic" → falls back to "starter"
    basic: {
        ai_chat: false,
        ai_reports: false,
        ai_settings: false,
        knowledge_base: false,
        bulk_registration: true,
        export_excel: true,
        custom_branding: false,
        api_access: false,
        advanced_analytics: false,
        multi_shift: true,
        notifications: true,
        max_departments: 5,
        max_shifts: 3,
        max_groups: 5,
    },
};

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/**
 * Get full tenant features with plan-based fallback.
 * Returns merged features: plan defaults + any overrides stored in tenants table.
 */
export async function getTenantFeatures(tenantId: string) {
    const supabase = getAdminClient();

    const { data: tenant, error } = await supabase
        .from('tenants')
        .select('plan, feature_flags')
        .eq('id', tenantId)
        .single();

    if (error || !tenant) return null;

    const plan = tenant.plan || 'free';
    const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;

    // Merge: plan defaults + any custom overrides in feature_flags JSONB
    const featureFlags = {
        ...defaults,
        ...(tenant.feature_flags || {}),
    };

    return {
        plan,
        feature_flags: featureFlags,
    };
}

/**
 * Check if a specific feature is enabled for a tenant.
 * Uses getTenantFeatures with plan fallback.
 */
export async function isFeatureEnabled(tenantId: string, featureName: string): Promise<boolean> {
    const features = await getTenantFeatures(tenantId);
    if (!features) return false;
    return !!features.feature_flags[featureName];
}

// Resource type → table name + limit key mapping
const RESOURCE_MAP: Record<string, { table: string; limitKey: string; label: string }> = {
    departments: { table: 'users', limitKey: 'max_departments', label: 'phòng ban' },
    shifts: { table: 'shifts', limitKey: 'max_shifts', label: 'ca làm việc' },
    groups: { table: 'groups', limitKey: 'max_groups', label: 'nhóm' },
};

/**
 * Check if creating a new resource would exceed the plan limit.
 * Returns { allowed: boolean, message: string }
 */
export async function checkResourceLimit(
    tenantId: string,
    resourceType: string
): Promise<{ allowed: boolean; message: string; current?: number; limit?: number }> {
    const resource = RESOURCE_MAP[resourceType];
    if (!resource) {
        return { allowed: true, message: '' };
    }

    const features = await getTenantFeatures(tenantId);
    if (!features) {
        return { allowed: false, message: 'Không tìm thấy thông tin tenant.' };
    }

    const limit = features.feature_flags[resource.limitKey];
    if (limit === undefined || limit === null || limit >= 999) {
        return { allowed: true, message: '' };
    }

    const supabase = getAdminClient();

    let countQuery;
    if (resourceType === 'departments') {
        // Count distinct departments
        const { data, error } = await supabase
            .from('users')
            .select('department')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .not('department', 'is', null);

        if (error) {
            return { allowed: false, message: 'Lỗi kiểm tra giới hạn.' };
        }

        const uniqueDepts = new Set(data?.map(u => u.department).filter(Boolean));
        const current = uniqueDepts.size;

        if (current >= limit) {
            return {
                allowed: false,
                current,
                limit,
                message: `Đã đạt giới hạn ${limit} ${resource.label}. Nâng cấp gói để mở rộng.`,
            };
        }

        return { allowed: true, message: '', current, limit };
    } else {
        // Count rows in table
        const { count, error } = await supabase
            .from(resource.table)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if (error) {
            return { allowed: false, message: 'Lỗi kiểm tra giới hạn.' };
        }

        const current = count || 0;

        if (current >= limit) {
            return {
                allowed: false,
                current,
                limit,
                message: `Đã đạt giới hạn ${limit} ${resource.label}. Nâng cấp gói để mở rộng.`,
            };
        }

        return { allowed: true, message: '', current, limit };
    }
}
