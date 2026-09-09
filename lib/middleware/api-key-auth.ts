import { createAdminClient } from '@/lib/supabase/admin';
import { createHash } from 'crypto';
import { type NextRequest } from 'next/server';

/**
 * SHA-256 hash an API key
 */
export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

/**
 * Authenticate a request using API key from x-api-key header
 * Returns tenant info if valid, null otherwise
 */
export async function authenticateApiKey(request: NextRequest): Promise<{
    tenantId: string;
    scopes: string[];
    keyId: string;
} | null> {
    let apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.toLowerCase().startsWith('bearer sk_live_')) {
            apiKey = authHeader.substring(7).trim();
        }
    }
    if (!apiKey) return null;

    // Must start with sk_live_ prefix
    if (!apiKey.startsWith('sk_live_')) return null;

    const keyHash = hashApiKey(apiKey);
    const supabase = createAdminClient();

    const { data: keyData, error } = await supabase
        .from('tenant_api_keys')
        .select('id, tenant_id, scopes, is_active, expires_at')
        .eq('key_hash', keyHash)
        .single();

    if (error || !keyData) return null;

    // Check if key is active
    if (!keyData.is_active) return null;

    // Check expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) return null;

    // Update last_used_at
    await supabase
        .from('tenant_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id);

    return {
        tenantId: keyData.tenant_id,
        scopes: keyData.scopes || ['read'],
        keyId: keyData.id,
    };
}
