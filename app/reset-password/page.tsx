'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Reset Password Page
 * Route: /reset-password
 * Người dùng click link trong email → Supabase tự động set session
 * → Trang này cho phép nhập mật khẩu mới
 */
export default function ResetPasswordPage() {
    const router = useRouter();
    const supabase = createClient();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [sessionReady, setSessionReady] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    // PKCE Flow: Session đã được exchange trong /auth/callback/route.ts
    // trước khi redirect đến trang này → kiểm tra session ngay lập tức
    // Implicit Flow fallback: lắng nghe onAuthStateChange cho PASSWORD_RECOVERY event
    useEffect(() => {
        // Kiểm tra session ngay lập tức (PKCE flow - session đã sẵn sàng)
        const checkExistingSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setSessionReady(true);
                setCheckingSession(false);
                return;
            }
        };
        checkExistingSession();

        // Fallback: lắng nghe auth state change (Implicit flow hoặc delayed session)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event) => {
                if (event === 'PASSWORD_RECOVERY') {
                    setSessionReady(true);
                    setCheckingSession(false);
                } else if (event === 'SIGNED_IN') {
                    setSessionReady(true);
                    setCheckingSession(false);
                }
            }
        );

        // Timeout: nếu sau 5s vẫn không có session → link hết hạn/không hợp lệ
        const timer = setTimeout(() => {
            setCheckingSession(false);
        }, 5000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    const validatePassword = (): string | null => {
        if (password.length < 6) {
            return 'Mật khẩu phải có ít nhất 6 ký tự';
        }
        if (password !== confirmPassword) {
            return 'Mật khẩu xác nhận không khớp';
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const validationError = validatePassword();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) {
                if (updateError.message.includes('same_password')) {
                    setError('Mật khẩu mới phải khác mật khẩu cũ.');
                } else {
                    setError('Không thể cập nhật mật khẩu. Vui lòng thử lại.');
                    console.error('Update password error:', updateError);
                }
            } else {
                setSuccess(true);
                // Sign out toàn bộ sessions (bảo mật: invalidate session cũ nếu bị chiếm)
                await supabase.auth.signOut({ scope: 'global' });
                // Auto redirect sau 3s
                setTimeout(() => {
                    router.push('/login');
                }, 3000);
            }
        } catch (err) {
            console.error('Reset password error:', err);
            setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
        } finally {
            setIsLoading(false);
        }
    };

    // Password strength indicator
    const getPasswordStrength = (): { level: number; label: string; color: string } => {
        if (!password) return { level: 0, label: '', color: '' };
        if (password.length < 6) return { level: 1, label: 'Yếu', color: 'bg-red-500' };
        if (password.length < 8) return { level: 2, label: 'Trung bình', color: 'bg-yellow-500' };
        if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            return { level: 4, label: 'Rất mạnh', color: 'bg-green-500' };
        }
        return { level: 3, label: 'Khá mạnh', color: 'bg-blue-500' };
    };

    const strength = getPasswordStrength();

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

                    {checkingSession ? (
                        /* Loading state - checking session */
                        <div className="text-center py-8">
                            <div className="w-12 h-12 border-3 border-[#b24700]/20 border-t-[#b24700] rounded-full animate-spin mx-auto mb-5" />
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm">
                                Đang xác thực...
                            </p>
                        </div>
                    ) : !sessionReady ? (
                        /* No session - invalid/expired link */
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 mb-6">
                                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-[#181410] dark:text-white mb-3">
                                Link đã hết hạn
                            </h2>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed mb-6">
                                Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
                                Vui lòng yêu cầu gửi lại.
                            </p>
                            <button
                                onClick={() => router.push('/forgot-password')}
                                className="inline-flex items-center justify-center gap-2 rounded-xl h-12 px-8 bg-[#b24700] hover:bg-[#9a3d00] text-white font-bold transition-all"
                            >
                                Gửi lại link mới
                            </button>
                        </div>
                    ) : success ? (
                        /* Success state */
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 mb-6">
                                <ShieldCheck className="w-10 h-10 text-green-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-[#181410] dark:text-white mb-3">
                                Đổi mật khẩu thành công!
                            </h2>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed mb-6">
                                Mật khẩu đã được cập nhật. Bạn sẽ được chuyển về trang đăng nhập trong giây lát...
                            </p>
                            <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                                <div className="w-4 h-4 border-2 border-green-600/20 border-t-green-600 rounded-full animate-spin" />
                                <span className="text-sm font-medium">Đang chuyển hướng...</span>
                            </div>
                        </div>
                    ) : (
                        /* Reset form */
                        <>
                            {/* Header */}
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#b24700]/10 to-[#d35400]/5 border border-[#b24700]/15 mb-5">
                                    <Lock className="w-7 h-7 text-[#b24700]" />
                                </div>
                                <h1 className="text-2xl font-bold text-[#181410] dark:text-white mb-2">
                                    Đặt lại mật khẩu
                                </h1>
                                <p className="text-[#8d715e] dark:text-gray-400 text-sm leading-relaxed">
                                    Nhập mật khẩu mới cho tài khoản của bạn
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
                                {/* New Password */}
                                <div className="flex flex-col gap-2">
                                    <label
                                        htmlFor="password"
                                        className="text-[#181410] dark:text-white text-sm font-bold"
                                    >
                                        Mật khẩu mới
                                    </label>
                                    <div className="relative flex items-center">
                                        <Lock className="absolute left-4 text-[#b24700] w-5 h-5" />
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="flex w-full h-14 pl-12 pr-12 bg-white dark:bg-[#23170f] border border-[#e7dfda] dark:border-gray-700 rounded-xl text-[#181410] dark:text-white focus:ring-2 focus:ring-[#b24700]/20 focus:border-[#b24700] placeholder:text-[#8d715e]/50 text-base transition-all outline-none"
                                            placeholder="Nhập mật khẩu mới"
                                            required
                                            minLength={6}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 text-[#8d715e] hover:text-[#b24700] transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>

                                    {/* Password strength */}
                                    {password && (
                                        <div className="space-y-1.5">
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4].map((level) => (
                                                    <div
                                                        key={level}
                                                        className={`h-1.5 flex-1 rounded-full transition-all ${level <= strength.level
                                                            ? strength.color
                                                            : 'bg-gray-200 dark:bg-gray-700'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                            <p className={`text-xs font-medium ${strength.level <= 1 ? 'text-red-500' :
                                                strength.level === 2 ? 'text-yellow-500' :
                                                    strength.level === 3 ? 'text-blue-500' : 'text-green-500'
                                                }`}>
                                                {strength.label}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div className="flex flex-col gap-2">
                                    <label
                                        htmlFor="confirmPassword"
                                        className="text-[#181410] dark:text-white text-sm font-bold"
                                    >
                                        Xác nhận mật khẩu
                                    </label>
                                    <div className="relative flex items-center">
                                        <Lock className="absolute left-4 text-[#b24700] w-5 h-5" />
                                        <input
                                            id="confirmPassword"
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className={`flex w-full h-14 pl-12 pr-12 bg-white dark:bg-[#23170f] border rounded-xl text-[#181410] dark:text-white focus:ring-2 focus:ring-[#b24700]/20 focus:border-[#b24700] placeholder:text-[#8d715e]/50 text-base transition-all outline-none ${confirmPassword && confirmPassword !== password
                                                ? 'border-red-400 dark:border-red-600'
                                                : confirmPassword && confirmPassword === password
                                                    ? 'border-green-400 dark:border-green-600'
                                                    : 'border-[#e7dfda] dark:border-gray-700'
                                                }`}
                                            placeholder="Nhập lại mật khẩu"
                                            required
                                            minLength={6}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-4 text-[#8d715e] hover:text-[#b24700] transition-colors"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    {confirmPassword && confirmPassword !== password && (
                                        <p className="text-red-500 text-xs font-medium">Mật khẩu không khớp</p>
                                    )}
                                    {confirmPassword && confirmPassword === password && (
                                        <p className="text-green-500 text-xs font-medium">✓ Mật khẩu khớp</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !password || !confirmPassword}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl h-14 bg-[#b24700] hover:bg-[#9a3d00] transition-all text-white text-base font-bold shadow-lg shadow-[#b24700]/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#b24700]"
                                >
                                    {isLoading ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            <span>Đang cập nhật...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <ShieldCheck className="w-5 h-5" />
                                            <span>Đặt lại mật khẩu</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </>
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
