'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Forgot Password Page
 * Route: /forgot-password
 * Cho phép người dùng nhập email để nhận link đặt lại mật khẩu
 */
function ForgotPasswordContent() {
    const router = useRouter();
    const supabase = createClient();

    const searchParams = useSearchParams();

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0); // Rate limiting: cooldown 60s

    // Xử lý redirect từ auth/callback khi link recovery hết hạn
    useEffect(() => {
        const urlError = searchParams.get('error');
        if (urlError === 'link_expired') {
            setError('Link đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại.');
        }
    }, [searchParams]);

    // Rate limiting: đếm ngược cooldown
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Rate limiting: chặn nếu đang cooldown
        if (cooldown > 0) {
            setError(`Vui lòng đợi ${cooldown}s trước khi gửi lại.`);
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                email.trim(),
                {
                    // PKCE flow: redirect qua auth/callback để exchange code
                    // Callback sẽ kiểm tra type=recovery → redirect đến /reset-password
                    redirectTo: `${window.location.origin}/auth/callback`,
                }
            );

            if (resetError) {
                setError('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
                console.error('Reset password error:', resetError);
            } else {
                setSent(true);
                // Bắt đầu cooldown 60s sau khi gửi thành công
                setCooldown(60);
            }
        } catch (err) {
            console.error('Reset password error:', err);
            setError('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#f8f7f5] dark:bg-[#23170f] p-6">
            <div className="w-full max-w-[460px]">
                {/* Card */}
                <div className="bg-white dark:bg-[#2a1a0f] rounded-2xl shadow-xl border border-[#e7dfda] dark:border-gray-700/50 p-8 md:p-10">
                    {/* Back button */}
                    <button
                        onClick={() => router.push('/login')}
                        className="flex items-center gap-2 text-[#8d715e] dark:text-gray-400 hover:text-[#b24700] transition-colors mb-8 group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">Quay lại đăng nhập</span>
                    </button>

                    {!sent ? (
                        <>
                            {/* Header with icon */}
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#b24700]/10 to-[#d35400]/5 border border-[#b24700]/15 mb-5">
                                    <Mail className="w-7 h-7 text-[#b24700]" />
                                </div>
                                <h1 className="text-2xl font-bold text-[#181410] dark:text-white mb-2">
                                    Quên mật khẩu?
                                </h1>
                                <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed">
                                    Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu cho bạn.
                                </p>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30">
                                    <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                                        ❌ {error}
                                    </p>
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="flex flex-col gap-2">
                                    <label
                                        htmlFor="email"
                                        className="text-[#181410] dark:text-white text-sm font-bold"
                                    >
                                        Email
                                    </label>
                                    <div className="relative flex items-center">
                                        <Mail className="absolute left-4 text-[#b24700] w-5 h-5" />
                                        <input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="flex w-full h-14 pl-12 pr-4 bg-white dark:bg-[#23170f] border border-[#e7dfda] dark:border-gray-700 rounded-xl text-[#181410] dark:text-white focus:ring-2 focus:ring-[#b24700]/20 focus:border-[#b24700] placeholder:text-[#8d715e]/50 text-base transition-all outline-none"
                                            placeholder="ten@company.vn"
                                            required
                                            autoComplete="email"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !email.trim() || cooldown > 0}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl h-14 bg-[#b24700] hover:bg-[#9a3d00] transition-all text-white text-base font-bold shadow-lg shadow-[#b24700]/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#b24700]"
                                >
                                    {isLoading ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            <span>Đang gửi...</span>
                                        </div>
                                    ) : cooldown > 0 ? (
                                        <span>Gửi lại sau {cooldown}s</span>
                                    ) : (
                                        <>
                                            <Send className="w-5 h-5" />
                                            <span>Gửi link đặt lại mật khẩu</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </>
                    ) : (
                        /* Success state */
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 mb-6">
                                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-[#181410] dark:text-white mb-3">
                                Email đã được gửi!
                            </h2>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed mb-2">
                                Chúng tôi đã gửi link đặt lại mật khẩu đến:
                            </p>
                            <p className="text-[#b24700] font-bold text-base mb-6">
                                {email}
                            </p>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-4 mb-6">
                                <p className="text-amber-700 dark:text-amber-400 text-sm">
                                    📧 <strong>Lưu ý:</strong> Kiểm tra cả <strong>mục Spam/Thư rác</strong> nếu không thấy email trong hộp thư chính. Link có hiệu lực trong 1 giờ.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (cooldown > 0) return;
                                    setSent(false);
                                    setEmail('');
                                }}
                                disabled={cooldown > 0}
                                className="text-[#b24700] font-bold text-sm hover:underline transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại email'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center mt-8 text-[#8d715e] dark:text-gray-500 text-xs">
                    © 2026 Cơm Ngon • BY Thân Công Hải
                </p>
            </div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen w-full items-center justify-center bg-[#f8f7f5] dark:bg-[#23170f]">
                <div className="w-8 h-8 border-3 border-[#b24700]/20 border-t-[#b24700] rounded-full animate-spin" />
            </div>
        }>
            <ForgotPasswordContent />
        </Suspense>
    );
}
