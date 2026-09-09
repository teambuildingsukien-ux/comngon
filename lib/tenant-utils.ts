import { createClient } from './supabase/client';

/**
 * Get current authenticated user's tenant_id
 * Used for enforcing tenant isolation in frontend queries
 * 
 * @returns Promise<string | null> - tenant_id or null if user not found
 */
export async function getCurrentUserTenantId(): Promise<string | null> {
    const supabase = createClient();

    try {
        // Get current authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[getCurrentUserTenantId] Auth error:', authError);
            return null;
        }

        // Get user's tenant_id from users table
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('[getCurrentUserTenantId] Profile error:', profileError);
            return null;
        }

        return profile.tenant_id;
    } catch (error) {
        console.error('[getCurrentUserTenantId] Unexpected error:', error);
        return null;
    }
}

/**
 * Get current authenticated user's full profile including tenant_id
 * 
 * @returns Promise<{ id: string, tenant_id: string, role: string } | null>
 */
export async function getCurrentUserProfile() {
    const supabase = createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[getCurrentUserProfile] Auth error:', authError);
            return null;
        }

        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id, tenant_id, role, full_name, email')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('[getCurrentUserProfile] Profile error:', profileError);
            return null;
        }

        return profile;
    } catch (error) {
        console.error('[getCurrentUserProfile] Unexpected error:', error);
        return null;
    }
}
