'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

/**
 * Auth Confirm Page
 * Route: /auth/confirm
 * 
 * Xử lý verify token_hash từ email link (recovery, signup, etc.)
 * Thay thế cho {{ .ConfirmationURL }} mặc định của Supabase
 * 
 * Flow:
 * 1. User click link trong email: /auth/confirm?token_hash=xxx&type=recovery
 * 2. Trang này gọi supabase.auth.verifyOtp({ token_hash, type })
 * 3. Nếu thành công → redirect đến trang phù hợp (reset-password, dashboard, etc.)
 * 4. Nếu thất bại → hiển thị thông báo lỗi
 */
function AuthConfirmContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(true);

    // Whitelist các type hợp lệ — validate runtime thay vì chỉ TypeScript cast
    const ALLOWED_TYPES = ['recovery', 'email', 'signup', 'magiclink', 'email_change'] as const;
    type OtpType = typeof ALLOWED_TYPES[number];

    useEffect(() => {
        const verifyToken = async () => {
            const tokenHash = searchParams.get('token_hash');
            const rawType = searchParams.get('type');

            // Validate: token_hash phải có + type phải nằm trong whitelist
            if (!tokenHash || !rawType || !ALLOWED_TYPES.includes(rawType as OtpType)) {
                setError('Link không hợp lệ. Vui lòng thử lại.');
                setIsVerifying(false);
                return;
            }

            const type = rawType as OtpType;

            try {
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: type,
                });

                if (verifyError) {
                    // Log chi tiết phía console (dev), KHÔNG lộ cho user
                    console.error('[AUTH_CONFIRM] verifyOtp failed:', verifyError.message);
                    setError('Link đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại.');
                    setIsVerifying(false);
                    return;
                }

                // Verify thành công! Redirect theo type
                switch (type) {
                    case 'recovery':
                        // Password recovery → redirect đến trang đặt lại mật khẩu
                        router.replace('/reset-password');
                        break;
                    case 'signup':
                    case 'email':
                        // Email verification → redirect đến dashboard
                        router.replace('/dashboard');
                        break;
                    case 'magiclink':
                        // Magic link → redirect đến dashboard
                        router.replace('/dashboard');
                        break;
                    default:
                        router.replace('/dashboard');
                        break;
                }
            } catch (err) {
                console.error('Auth confirm error:', err);
                setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
                setIsVerifying(false);
            }
        };

        verifyToken();
    }, [searchParams, router, supabase.auth]);

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#f8f7f5] dark:bg-[#23170f] p-6">
            <div className="w-full max-w-[420px]">
                <div className="bg-white dark:bg-[#2a1a0f] rounded-2xl shadow-xl border border-[#e7dfda] dark:border-gray-700/50 p-8 md:p-10">
                    {isVerifying ? (
                        <div className="text-center py-8">
                            <div className="w-12 h-12 border-3 border-[#b24700]/20 border-t-[#b24700] rounded-full animate-spin mx-auto mb-5" />
                            <h2 className="text-lg font-bold text-[#181410] dark:text-white mb-2">
                                Đang xác thực...
                            </h2>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm">
                                Vui lòng đợi trong giây lát
                            </p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 mb-6">
                                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-[#181410] dark:text-white mb-3">
                                Xác thực thất bại
                            </h2>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed mb-6">
                                {error}
                            </p>
                            <button
                                onClick={() => router.push('/forgot-password')}
                                className="inline-flex items-center justify-center gap-2 rounded-xl h-12 px-8 bg-[#b24700] hover:bg-[#9a3d00] text-white font-bold transition-all"
                            >
                                Gửi lại link mới
                            </button>
                        </div>
                    ) : null}
                </div>

                <p className="text-center mt-8 text-[#8d715e] dark:text-gray-500 text-xs">
                    © 2026 Cơm Ngon • BY Thân Công Hải
                </p>
            </div>
        </div>
    );
}

export default function AuthConfirmPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen w-full items-center justify-center bg-[#f8f7f5] dark:bg-[#23170f]">
                <div className="w-8 h-8 border-3 border-[#b24700]/20 border-t-[#b24700] rounded-full animate-spin" />
            </div>
        }>
            <AuthConfirmContent />
        </Suspense>
    );
}
