import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

/**
 * Verify email token
 * GET /api/auth/verify-email?token=...
 * 
 * Flow:
 * 1. Nhận token từ query param
 * 2. Hash token (SHA-256) → tìm trong DB
 * 3. Check: tồn tại, chưa dùng, chưa hết hạn
 * 4. Set email_verified = true
 * 5. Redirect về /verify-email?status=success
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');
    const redirectBase = new URL('/verify-email', 'https://comngon.io.vn');

    if (!token) {
        redirectBase.searchParams.set('status', 'invalid');
        redirectBase.searchParams.set('message', 'Token không hợp lệ');
        return NextResponse.redirect(redirectBase);
    }

    try {
        const supabase = createAdminClient();

        // Hash token để so sánh với DB
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Tìm token trong DB
        const { data: tokenRecord, error: findError } = await supabase
            .from('email_verification_tokens')
            .select('*')
            .eq('token_hash', tokenHash)
            .eq('type', 'verify_email')
            .single();

        if (findError || !tokenRecord) {
            console.warn('[VERIFY] Token not found:', tokenHash.substring(0, 8));
            redirectBase.searchParams.set('status', 'invalid');
            redirectBase.searchParams.set('message', 'Link xác nhận không hợp lệ');
            return NextResponse.redirect(redirectBase);
        }

        // Check đã dùng chưa
        if (tokenRecord.used_at) {
            redirectBase.searchParams.set('status', 'used');
            redirectBase.searchParams.set('message', 'Link đã được sử dụng trước đó');
            return NextResponse.redirect(redirectBase);
        }

        // Check hết hạn chưa
        if (new Date(tokenRecord.expires_at) < new Date()) {
            redirectBase.searchParams.set('status', 'expired');
            redirectBase.searchParams.set('message', 'Link đã hết hạn. Vui lòng đăng ký lại.');
            return NextResponse.redirect(redirectBase);
        }

        // ✅ Token hợp lệ → update email_verified
        const userId = tokenRecord.user_id;

        // 1. Mark token as used
        await supabase
            .from('email_verification_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('id', tokenRecord.id);

        // 2. Update tenant_signup_requests email_verified
        const { data: userData } = await supabase
            .from('users')
            .select('tenant_id, email')
            .eq('id', userId)
            .single();

        if (userData?.tenant_id) {
            // Update tenants table
            await supabase
                .from('tenants')
                .update({ email_verified: true })
                .eq('id', userData.tenant_id);

            // Update signup request
            await supabase
                .from('tenant_signup_requests')
                .update({ email_verified: true })
                .eq('contact_email', userData.email)
                .eq('status', 'pending');
        }

        // 3. Confirm email trong Supabase Auth (backup)
        await supabase.auth.admin.updateUserById(userId, {
            email_confirm: true,
        });

        console.log('[VERIFY] Email verified for user:', userId);

        redirectBase.searchParams.set('status', 'success');
        return NextResponse.redirect(redirectBase);

    } catch (error) {
        console.error('[VERIFY] Error:', error);
        redirectBase.searchParams.set('status', 'error');
        redirectBase.searchParams.set('message', 'Lỗi hệ thống');
        return NextResponse.redirect(redirectBase);
    }
}
