'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, User, Lock, Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/providers/toast-provider';

/**
 * LoginScreen Component
 * Màn hình đăng nhập Cơm Ngon với thiết kế hiện đại
 * Tích hợp Supabase Auth, Dark Mode, Form validation, và UX animations
 */
export default function LoginScreen() {
    const router = useRouter();
    const { showToast } = useToast();
    const supabase = createClient();

    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // 1. Authenticate with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password,
            });

            if (authError) {
                // Handle authentication errors
                if (authError.message.includes('Invalid login credentials')) {
                    showToast('❌ Email hoặc mật khẩu không đúng!', '🔒', 4000);
                } else if (authError.message.includes('Email not confirmed')) {
                    showToast('📧 Vui lòng kiểm tra email để xác nhận tài khoản! (Check cả mục Spam)', '⚠️', 6000);
                } else {
                    showToast(`❌ Đăng nhập thất bại: ${authError.message}`, '⚠️', 4000);
                }
                setIsLoading(false);
                return;
            }

            if (!authData.user) {
                showToast('❌ Không tìm thấy thông tin người dùng!', '⚠️', 4000);
                setIsLoading(false);
                return;
            }

            // 2. Check platform_owners FIRST (before users table, to avoid RLS issues)
            const { data: platformOwner } = await supabase
                .from('platform_owners')
                .select('id, full_name, is_active')
                .eq('user_id', authData.user.id)
                .eq('is_active', true)
                .single();

            if (platformOwner) {
                // ✅ Là Platform Owner → redirect thẳng về /platform
                showToast(`✅ Chào mừng ${platformOwner.full_name}! (Platform Admin)`, '👑', 3000);
                router.push('/platform');
                router.refresh();
                return;
            }

            // 3. Fetch user profile from database to get role
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('id, email, full_name, role, department, tenant_id, status')
                .ilike('email', authData.user.email || '')
                .single();

            if (userError || !userData) {
                // Không phải platform owner VÀ không có trong users → báo lỗi
                showToast('❌ Không tìm thấy thông tin nhân viên trong hệ thống!', '⚠️', 4000);
                await supabase.auth.signOut();
                setIsLoading(false);
                return;
            }

            // Check employee status
            if (userData.status === 'resigned') {
                showToast('🚫 Tài khoản đã nghỉ việc. Liên hệ admin nếu cần hỗ trợ.', '❌', 6000);
                await supabase.auth.signOut();
                setIsLoading(false);
                return;
            }

            // 4. Check tenant approval_status (phải approved mới cho vào)
            const { data: tenantData } = await supabase
                .from('tenants')
                .select('id, name, approval_status')
                .eq('id', userData.tenant_id)
                .single();

            if (!tenantData || tenantData.approval_status !== 'approved') {
                const statusMsg = tenantData?.approval_status === 'rejected'
                    ? '❌ Tài khoản doanh nghiệp của bạn đã bị từ chối.'
                    : '⏳ Thông tin doanh nghiệp của bạn đã được gửi và đang chờ xác nhận. Vui lòng đợi admin phê duyệt.';
                showToast(statusMsg, '🔒', 6000);
                await supabase.auth.signOut();
                setIsLoading(false);
                return;
            }

            // 5. Show success toast with user info
            if (userData.status === 'paused') {
                showToast(`⚠️ Chào ${userData.full_name}! Tài khoản đang tạm dừng — không thể đăng ký suất ăn.`, '⏸️', 5000);
            } else {
                showToast(`✅ Chào mừng ${userData.full_name}!`, '👋', 3000);
            }

            // 6. Redirect to dashboard (middleware will handle role-based routing)
            router.push('/dashboard');
            router.refresh();

        } catch (error) {
            console.error('Login error:', error);
            showToast('❌ Đã có lỗi xảy ra, vui lòng thử lại!', '⚠️', 4000);
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full overflow-hidden bg-[#faf9f6] dark:bg-[#0b0908] font-[family-name:var(--font-family-display)]">
            {/* Left Side: Visual Panel - Hidden on mobile, visible on lg screens */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
                {/* Background Image with zoom */}
                <div
                    className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-10000 ease-out"
                    style={{
                        backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAXppsyDblsTqOQYlsk1Aqjit9XS1uDYPs7BkMAAjx9onfLPDUJFp5mb2q0JOogC2XNMUSEtkjNapiI1xZaA4PtagyxKOzBU87hIepOq83JbAgotR_j5NtsqHpiU2Wfv40z1pcrt-nvvCcwORuMHxhQZF_Y1jyMy9Xng1Vdm2xCIQ3QF1hf2UPgr1paCV0jbFxsOUsYQfV5xqTneuEbn7qXn-vROW5LgwK4MNmkpL0K1gIphcOUnxPaJPEMXhC5vorlN_Ki-PdYdj0")'
                    }}
                    aria-label="Background image of a healthy office meal"
                />

                {/* Dark Obsidian & Brand Orange Glow Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0b0908]/90 via-[#b24700]/25 to-[#0b0908]/95" />

                {/* Floating Particles */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[15%] left-[15%] w-2 h-2 bg-white/20 rounded-full animate-float-slow" />
                    <div className="absolute top-[55%] left-[25%] w-3 h-3 bg-white/15 rounded-full animate-float-medium" />
                    <div className="absolute top-[35%] right-[15%] w-2 h-2 bg-white/20 rounded-full animate-float-fast" />
                    <div className="absolute bottom-[25%] right-[25%] w-4 h-4 bg-white/10 rounded-full animate-float-slow" />
                </div>

                {/* Main Content - Centered */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-16">
                    <div className="flex flex-col items-center text-center animate-fade-in-up">
                        {/* Logo - Large with brand border */}
                        <div className="mb-6 relative">
                            <div className="w-36 h-36 rounded-full bg-white dark:bg-[#161412] shadow-2xl shadow-black/40 flex items-center justify-center p-3 border border-white/20 animate-pulse-slow">
                                <img src="/logo.png" alt="Cơm Ngon Logo" className="w-full h-full object-contain rounded-full" />
                            </div>
                            {/* Glow ring */}
                            <div className="absolute -inset-3 rounded-full border border-[#b24700]/30 animate-ping" style={{ animationDuration: '4s' }} />
                        </div>

                        {/* Heading */}
                        <h1 className="text-white text-5xl font-extrabold leading-tight tracking-tight mb-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] animate-slide-in-left">
                            Cơm Ngon
                        </h1>

                        {/* Subtitle */}
                        <p className="text-white/80 text-base font-normal leading-relaxed mb-10 max-w-sm drop-shadow-md animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
                            Hệ thống quản lý suất ăn thông minh dành cho doanh nghiệp Việt Nam
                        </p>

                        {/* Stats Row - Glassmorphic pills */}
                        <div className="flex items-center gap-4 animate-slide-in-left" style={{ animationDelay: '0.2s' }}>
                            <div className="bg-white/5 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center min-w-[100px] shadow-lg">
                                <p className="text-white text-xl font-bold">100+</p>
                                <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Suất ăn/ngày</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center min-w-[100px] shadow-lg">
                                <p className="text-white text-xl font-bold">50+</p>
                                <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Doanh nghiệp</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center min-w-[100px] shadow-lg">
                                <p className="text-white text-xl font-bold">99.9%</p>
                                <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Uptime</p>
                            </div>
                        </div>

                        {/* Active badge */}
                        <div className="mt-8 inline-flex items-center gap-2 bg-green-500/10 backdrop-blur-sm px-4 py-2 rounded-full border border-green-400/20 animate-slide-in-left" style={{ animationDelay: '0.3s' }}>
                            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping" />
                            <span className="text-green-300 text-xs font-semibold tracking-wide uppercase">Hệ thống đang hoạt động</span>
                        </div>
                    </div>
                </div>

                {/* Ambient lights */}
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#b24700]/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-amber-600/10 rounded-full blur-[100px] pointer-events-none" />
            </div>

            {/* Right Side: Login Panel */}
            <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-12 lg:p-16 bg-[#faf9f6] dark:bg-[#0b0908] relative">
                {/* Background decorative glow on mobile */}
                <div className="lg:hidden absolute top-[10%] left-[10%] w-72 h-72 bg-[#b24700]/10 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-[420px] flex flex-col z-10">
                    {/* Brand Mobile Logo - Only shown on mobile */}
                    <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
                        <div className="w-20 h-20 rounded-full bg-white dark:bg-[#161412] shadow-xl flex items-center justify-center p-2 border border-[#b24700]/20">
                            <img src="/logo.png" alt="Cơm Ngon Logo" className="w-full h-full object-contain rounded-full" />
                        </div>
                        <span className="text-xl font-bold text-[#b24700] tracking-tight">Cơm Ngon</span>
                    </div>

                    {/* Form Container with Glassmorphism */}
                    <div className="bg-white/80 dark:bg-[#161412]/80 backdrop-blur-md border border-stone-200/40 dark:border-stone-800/40 rounded-3xl p-6 md:p-8 shadow-2xl shadow-stone-200/50 dark:shadow-black/60">
                        {/* Welcome Text */}
                        <div className="mb-8">
                            <h2 className="text-[#181410] dark:text-white text-2xl font-bold tracking-tight mb-2">
                                Chào mừng quay trở lại
                            </h2>
                            <p className="text-[#8d715e]/80 dark:text-stone-400 text-sm">
                                Đăng nhập vào hệ thống quản lý suất ăn thông minh.
                            </p>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            {/* Email Field */}
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="email"
                                    className="text-[#181410] dark:text-stone-200 text-xs font-bold uppercase tracking-wider"
                                >
                                    Email tài khoản
                                </label>
                                <div className="relative flex items-center">
                                    <User className="absolute left-4 text-[#b24700]/70 w-5 h-5" />
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="flex w-full h-12 pl-12 pr-4 bg-stone-50 dark:bg-[#0b0908] border border-stone-200 dark:border-stone-800 rounded-xl text-[#181410] dark:text-white focus:shadow-[0_0_12px_rgba(178,71,0,0.12)] focus:border-[#b24700] placeholder:text-[#8d715e]/40 text-sm transition-all duration-300 outline-none"
                                        placeholder="Ví dụ: ten@company.vn"
                                        required
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="password"
                                    className="text-[#181410] dark:text-stone-200 text-xs font-bold uppercase tracking-wider"
                                >
                                    Mật khẩu
                                </label>
                                <div className="relative flex items-center">
                                    <Lock className="absolute left-4 text-[#b24700]/70 w-5 h-5" />
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="flex w-full h-12 pl-12 pr-12 bg-stone-50 dark:bg-[#0b0908] border border-stone-200 dark:border-stone-800 rounded-xl text-[#181410] dark:text-white focus:shadow-[0_0_12px_rgba(178,71,0,0.12)] focus:border-[#b24700] placeholder:text-[#8d715e]/40 text-sm transition-all duration-300 outline-none"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 text-[#8d715e]/60 hover:text-[#b24700] transition-colors"
                                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Remember Me & Forgot Password */}
                            <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        id="remember"
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 rounded border-stone-300 dark:border-stone-700 text-[#b24700] focus:ring-[#b24700] cursor-pointer transition-all"
                                    />
                                    <label
                                        htmlFor="remember"
                                        className="text-xs text-[#8d715e] dark:text-stone-400 cursor-pointer select-none"
                                    >
                                        Ghi nhớ đăng nhập
                                    </label>
                                </div>
                                <a
                                    href="/forgot-password"
                                    className="text-xs text-[#b24700] font-bold hover:underline transition-all"
                                >
                                    Quên mật khẩu?
                                </a>
                            </div>

                            {/* Login Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex w-full items-center justify-center rounded-xl h-12 brand-primary-btn text-white text-sm font-bold mt-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        <span>Đang xác thực...</span>
                                    </div>
                                ) : (
                                    <span className="truncate">Đăng nhập ngay</span>
                                )}
                            </button>
                        </form>

                        {/* Footer Links */}
                        <div className="mt-8 pt-6 border-t border-stone-200/50 dark:border-stone-800/50 text-center space-y-2.5">
                            <p className="text-xs text-[#8d715e] dark:text-stone-400">
                                Gặp sự cố đăng nhập?{' '}
                                <a className="text-[#b24700] font-bold hover:underline ml-0.5 transition-all" href="#">
                                    Hỗ trợ nhân sự
                                </a>
                            </p>
                            <p className="text-xs text-[#8d715e] dark:text-stone-400">
                                Chưa có tài khoản doanh nghiệp?{' '}
                                <a className="text-[#b24700] font-bold hover:underline ml-0.5 transition-all" href="/signup">
                                    Đăng ký thử nghiệm
                                </a>
                            </p>
                        </div>
                    </div>

                    {/* Bottom Bar Footer */}
                    <div className="mt-12 flex items-center justify-center gap-3">
                        <div className="text-[#8d715e]/70 dark:text-stone-500 text-[10px] font-semibold tracking-wide uppercase">
                            © 2026 Cơm Ngon • BY Thân Công Hải
                        </div>
                        <div className="w-1 h-1 bg-[#8d715e]/30 rounded-full" />
                        <button className="flex items-center gap-1 cursor-pointer hover:text-[#b24700] transition-colors text-[10px] font-bold uppercase tracking-wider text-[#8d715e]/70">
                            <Globe className="w-3 h-3" />
                            Tiếng Việt
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
