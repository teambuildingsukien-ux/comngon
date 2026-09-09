import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from './api-key-auth';

/**
 * Dual Auth Helper cho V1 API Routes
 * 
 * Ưu tiên: Session auth → API key auth (fallback)
 * 
 * Trả về:
 * - userId: ID user (session) hoặc null (API key)
 * - tenantId: tenant ID
 * - authType: 'session' | 'api_key'
 * - scopes: scopes của API key (nếu dùng API key)
 * - supabase: supabase client (session-scoped hoặc admin)
 */

export interface DualAuthResult {
    userId: string | null;
    tenantId: string;
    authType: 'session' | 'api_key';
    scopes: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any;
}

export async function authenticateDual(
    request: NextRequest,
    requiredScope: string = 'read'
): Promise<DualAuthResult | NextResponse> {
    // 1. Try session auth first
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!authError && user) {
        // Session auth thành công
        const { data: userData } = await supabase
            .from('users')
            .select('tenant_id, status, is_active')
            .eq('id', user.id)
            .single();

        if (!userData?.tenant_id) {
            return NextResponse.json(
                { code: 'ERR_FORBIDDEN', message: 'Tenant not found' },
                { status: 403 }
            );
        }

        if (userData.status === 'resigned' || userData.is_active === false) {
            return NextResponse.json(
                { code: 'ERR_FORBIDDEN', message: 'Tài khoản của bạn đã nghỉ việc hoặc bị vô hiệu hóa.' },
                { status: 403 }
            );
        }

        return {
            userId: user.id,
            tenantId: userData.tenant_id,
            authType: 'session',
            scopes: ['read', 'write', 'admin'],
            supabase,
        };
    }

    // 2. Fallback to API key auth
    const apiKeyResult = await authenticateApiKey(request);

    if (!apiKeyResult) {
        return NextResponse.json(
            { code: 'ERR_UNAUTHORIZED', message: 'Authentication required. Provide session cookie or X-API-Key header.' },
            { status: 401 }
        );
    }

    // Check scope
    if (!apiKeyResult.scopes.includes(requiredScope) && !apiKeyResult.scopes.includes('admin')) {
        return NextResponse.json(
            { code: 'ERR_FORBIDDEN', message: `Scope '${requiredScope}' required. Your scopes: ${apiKeyResult.scopes.join(', ')}` },
            { status: 403 }
        );
    }

    // API key auth dùng admin client (không có session user)
    const adminSupabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    return {
        userId: null,
        tenantId: apiKeyResult.tenantId,
        authType: 'api_key',
        scopes: apiKeyResult.scopes,
        supabase: adminSupabase,
    };
}

/**
 * Type guard: check nếu result là auth thành công (không phải NextResponse error)
 */
export function isAuthSuccess(result: DualAuthResult | NextResponse): result is DualAuthResult {
    return !(result instanceof NextResponse);
}
