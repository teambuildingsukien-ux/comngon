import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Manually confirm user email (for testing/admin purposes)
 * POST /api/admin/confirm-email
 * RESTRICTED: Only platform owners can use this
 */
export async function POST(request: NextRequest) {
    try {
        // Authentication check — platform owners only
        const authSupabase = await createClient();
        const { data: { user: caller }, error: authError } = await authSupabase.auth.getUser();
        if (authError || !caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if caller is a platform owner
        const { data: platformOwner } = await authSupabase
            .from('platform_owners')
            .select('id')
            .eq('user_id', caller.id)
            .eq('is_active', true)
            .single();

        if (!platformOwner) {
            return NextResponse.json({ error: 'Only platform owners can confirm emails' }, { status: 403 });
        }

        const { email } = await request.json();

        if (!email) {
            return NextResponse.json(
                { error: 'Email is required' },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Get user by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) {
            console.error('Error listing users:', listError);
            return NextResponse.json(
                { error: 'Failed to find user' },
                { status: 500 }
            );
        }

        const user = users.find(u => u.email === email);

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // Update user to confirm email
        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { email_confirm: true }
        );

        if (updateError) {
            console.error('Error confirming email:', updateError);
            return NextResponse.json(
                { error: 'Failed to confirm email' },
                { status: 500 }
            );
        }

        // Update tenant_signup_requests
        const { error: signupUpdateError } = await supabase
            .from('tenant_signup_requests')
            .update({
                email_verified: true,
                email_verified_at: new Date().toISOString(),
                status: 'email_verified'
            })
            .eq('contact_email', email);

        if (signupUpdateError) {
            console.error('Error updating signup request:', signupUpdateError);
        }

        // Update tenant
        const tenantId = user.user_metadata?.tenant_id;
        if (tenantId) {
            await supabase
                .from('tenants')
                .update({
                    email_verified: true,
                    email_verified_at: new Date().toISOString()
                })
                .eq('id', tenantId);
        }

        // ⚠️ v6.1.5 AUDIT: Log xác nhận email (security event)
        try {
            const adminClient = createAdminClient();
            await adminClient.from('activity_logs').insert({
                tenant_id: tenantId || null,
                user_id: caller.id,
                action: 'platform_confirm_email',
                details: JSON.stringify({ target_email: email, target_user_id: user.id }),
            });
        } catch (logErr) {
            console.warn('Failed to log confirm email:', logErr);
        }

        return NextResponse.json({
            success: true,
            message: 'Email confirmed successfully',
            user: {
                id: user.id,
                email: user.email,
                email_confirmed_at: data.user.email_confirmed_at
            }
        });
    } catch (error) {
        console.error('Confirm email error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
