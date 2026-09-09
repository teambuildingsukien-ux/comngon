import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const type = requestUrl.searchParams.get('type')
    const next = requestUrl.searchParams.get('next')

    if (code) {
        const supabase = await createClient()

        // Exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            // Nếu là recovery flow bị lỗi → redirect đến forgot-password với thông báo
            if (type === 'recovery') {
                return NextResponse.redirect(
                    `${requestUrl.origin}/forgot-password?error=link_expired`
                )
            }
            // Login flow bị lỗi → redirect về trang login
            return NextResponse.redirect(
                `${requestUrl.origin}/?error=invalid_token`
            )
        }

        // ============================================================
        // PASSWORD RECOVERY FLOW
        // Supabase gửi type=recovery khi user click link reset password
        // → Redirect đến /reset-password để user nhập mật khẩu mới
        // ============================================================
        if (type === 'recovery') {
            return NextResponse.redirect(
                `${requestUrl.origin}/reset-password`
            )
        }

        // Custom redirect nếu có `next` parameter — validate chống open redirect
        if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://')) {
            return NextResponse.redirect(`${requestUrl.origin}${next}`)
        }

        // ============================================================
        // NORMAL LOGIN FLOW
        // Redirect dựa theo role của user (US-003)
        // ============================================================
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            // Query user role from database
            const { data: userData } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single()

            // Role-based redirect
            if (userData) {
                switch (userData.role) {
                    case 'Kitchen Admin':
                        return NextResponse.redirect(`${requestUrl.origin}/dashboard/kitchen`)
                    case 'Manager':
                        return NextResponse.redirect(`${requestUrl.origin}/dashboard/manager`)
                    default: // Employee
                        return NextResponse.redirect(`${requestUrl.origin}/dashboard/employee`)
                }
            }
        }
    }

    // Default redirect to employee dashboard
    return NextResponse.redirect(`${requestUrl.origin}/dashboard/employee`)
}
