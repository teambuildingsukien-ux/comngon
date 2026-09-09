import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/supabase/tenant-features';
import { hashApiKey } from '@/lib/middleware/api-key-auth';
import { randomBytes } from 'crypto';

/**
 * GET /api/admin/api-keys
 * Liệt kê tất cả API keys (chỉ hiện prefix, không hiện full key)
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        const supabaseAdmin = createAdminClient();
        const { data: keys, error: keysError } = await supabaseAdmin
            .from('tenant_api_keys')
            .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at')
            .eq('tenant_id', profile.tenant_id)
            .order('created_at', { ascending: false });

        if (keysError) {
            console.error('Error fetching API keys:', keysError);
            return NextResponse.json({ error: 'Không thể lấy danh sách API keys' }, { status: 500 });
        }

        return NextResponse.json({ keys: keys || [] });
    } catch (error: any) {
        console.error('GET /api/admin/api-keys error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/api-keys
 * Tạo API key mới — trả về full key 1 LẦN DUY NHẤT
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role, full_name')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin/Manager access required' }, { status: 403 });
        }

        // Feature flag check
        const apiEnabled = await isFeatureEnabled(profile.tenant_id, 'api_access');
        if (!apiEnabled) {
            return NextResponse.json({
                error: 'Tính năng API Access chưa được bật cho gói dịch vụ hiện tại. Liên hệ admin platform để nâng cấp.',
            }, { status: 403 });
        }

        const body = await req.json();
        const { name, scopes = ['read'], expires_at } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Tên API key không được để trống' }, { status: 400 });
        }

        // Generate API key: sk_live_ + 32 random hex bytes
        const rawKey = randomBytes(32).toString('hex');
        const fullKey = `sk_live_${rawKey}`;
        const keyHash = hashApiKey(fullKey);
        const keyPrefix = `sk_live_${rawKey.substring(0, 4)}...`;

        // Save to database
        const supabaseAdmin = createAdminClient();
        const { data: newKey, error: insertError } = await supabaseAdmin
            .from('tenant_api_keys')
            .insert({
                tenant_id: profile.tenant_id,
                name: name.trim(),
                key_hash: keyHash,
                key_prefix: keyPrefix,
                scopes,
                expires_at: expires_at || null,
                created_by: user.id,
            })
            .select('id, name, key_prefix, scopes, created_at')
            .single();

        if (insertError) {
            console.error('Error creating API key:', insertError);
            return NextResponse.json({ error: 'Không thể tạo API key' }, { status: 500 });
        }

        // 🔍 AUDIT LOG: API key creation is security-critical
        try {
            await supabaseAdmin.from('activity_logs').insert({
                tenant_id: profile.tenant_id,
                user_id: user.id,
                performed_by: user.id,
                performer_name: profile.full_name || profile.role,
                action: 'create_api_key',
                target_id: newKey.id,
                details: {
                    key_name: name.trim(),
                    key_prefix: keyPrefix,
                    scopes,
                    expires_at: expires_at || null,
                },
            });
        } catch (logErr) {
            console.error('Audit log for API key creation failed:', logErr);
        }

        // Return full key ONE TIME ONLY
        return NextResponse.json({
            ...newKey,
            full_key: fullKey,
            message: '⚠️ Hãy copy API key ngay! Key sẽ KHÔNG hiển thị lại sau khi đóng dialog.',
        });
    } catch (error: any) {
        console.error('POST /api/admin/api-keys error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
