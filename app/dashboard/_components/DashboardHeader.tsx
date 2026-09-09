'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SettingsModal from './SettingsModal';

const Icon = ({ name, className = "", style }: { name: string; className?: string; style?: React.CSSProperties }) => (
    <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
);

// Default branding (fallback khi chưa có custom branding)
const DEFAULT_BRAND = {
    logo_url: '/logo.png',
    primary_color: '#B24700',
    secondary_color: '#D65D0E',
    brand_name: 'Cơm Ngon',
};

// Cache branding data (shared across component instances)
let brandingCache: { data: typeof DEFAULT_BRAND; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 phút

interface DashboardHeaderProps {
    userName?: string;
    userRole?: string;
    activeTab?: 'employee' | 'manager';
    onTabChange?: (tab: 'employee' | 'manager') => void;
}

/**
 * Shared Dashboard Header Component
 * Used by all dashboards: Employee, Kitchen, Admin
 * 
 * Supports custom branding:
 * - Custom logo (từ tenant branding)
 * - Custom primary/secondary color
 * - Custom brand name
 * Falls back to defaults nếu không có custom branding
 */
export default function DashboardHeader({
    userName = 'User',
    userRole = 'employee',
    activeTab = 'employee',
    onTabChange
}: DashboardHeaderProps) {

    const router = useRouter();
    const supabase = createClient();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [userId, setUserId] = useState<string>('');

    // Branding state
    const [brand, setBrand] = useState(DEFAULT_BRAND);

    // Fetch branding data with caching
    const fetchBranding = useCallback(async () => {
        // Check cache first
        if (brandingCache && (Date.now() - brandingCache.timestamp) < CACHE_TTL) {
            setBrand(brandingCache.data);
            return;
        }

        try {
            const res = await fetch('/api/admin/branding');
            if (res.ok) {
                const data = await res.json();
                const brandData = {
                    logo_url: data.custom_logo_url || DEFAULT_BRAND.logo_url,
                    primary_color: data.custom_primary_color || DEFAULT_BRAND.primary_color,
                    secondary_color: data.custom_secondary_color || DEFAULT_BRAND.secondary_color,
                    brand_name: data.brand_name || DEFAULT_BRAND.brand_name,
                };
                brandingCache = { data: brandData, timestamp: Date.now() };
                setBrand(brandData);
            }
        } catch {
            // Fallback to defaults silently
        }
    }, []);

    useEffect(() => {
        getUserId();
        fetchBranding();
    }, [fetchBranding]);

    const getUserId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('users')
                .select('id')
                .eq('id', user.id)
                .single();
            if (data) setUserId(data.id);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const getInitials = (name: string) => {
        return name.substring(0, 2).toUpperCase();
    };

    // Derived colors for hover/shadow states
    const pc = brand.primary_color; // primary color shorthand

    return (
        <>
            <header className="w-full px-4 py-3 sm:px-6 sm:py-3.5 flex items-center justify-between border-b border-orange-200/30 dark:border-white/5 bg-white/75 dark:bg-[#161412]/75 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
                <div className="flex items-center gap-3 sm:gap-6">
                    {/* Logo — uses custom branding */}
                    <div className="flex items-center gap-3 select-none">
                        <div
                            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl shadow-md sm:shadow-lg p-1.5 transition-transform duration-300 hover:scale-105"
                            style={{ backgroundColor: pc }}
                        >
                            <img src={brand.logo_url} alt={`${brand.brand_name} Logo`} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-lg sm:text-xl font-extrabold tracking-tight hidden xs:inline" style={{ color: pc }}>
                            {brand.brand_name}
                        </span>
                    </div>

                    {/* Tabs cho Admin/HR dạng Capsule sang trọng */}
                    {(userRole === 'admin' || userRole === 'hr') && (
                        <div className="flex items-center gap-1 bg-orange-100/30 dark:bg-white/5 p-1 rounded-full border border-orange-200/20 dark:border-white/5 ml-1 sm:ml-3">
                            <button
                                onClick={() => onTabChange?.('employee')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all duration-300 font-semibold text-xs sm:text-sm ${activeTab === 'employee'
                                    ? 'text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-orange-700 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-white/5'
                                    }`}
                                style={activeTab === 'employee' ? { backgroundColor: pc } : undefined}
                            >
                                <Icon name="restaurant" className="text-[16px] sm:text-[18px]" />
                                <span>Báo cơm</span>
                            </button>
                            <button
                                onClick={() => onTabChange?.('manager')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all duration-300 font-semibold text-xs sm:text-sm ${activeTab === 'manager'
                                    ? 'text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-orange-700 dark:hover:text-orange-400 hover:bg-orange-50/50 dark:hover:bg-white/5'
                                    }`}
                                style={activeTab === 'manager' ? { backgroundColor: pc } : undefined}
                            >
                                <Icon name="dashboard" className="text-[16px] sm:text-[18px]" />
                                <span>Quản trị</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => {
                            setIsDarkMode(!isDarkMode);
                            document.documentElement.classList.toggle('dark');
                        }}
                        className="p-2 sm:p-2.5 rounded-full hover:opacity-80 transition-all duration-300 active:scale-95 border border-transparent dark:hover:border-white/10"
                        style={{ backgroundColor: `${pc}12`, color: pc }}
                        title={isDarkMode ? "Chế độ sáng" : "Chế độ tối"}
                    >
                        <Icon name={isDarkMode ? "light_mode" : "dark_mode"} className="block text-[20px] sm:text-[22px]" />
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 sm:p-2.5 rounded-full hover:opacity-80 transition-all duration-300 active:scale-95 border border-transparent dark:hover:border-white/10"
                        style={{ backgroundColor: `${pc}12`, color: pc }}
                        title="Cài đặt"
                    >
                        <Icon name="settings" className="block text-[20px] sm:text-[22px]" />
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Upgrade/Billing Button - Only for Admin/HR */}
                        {(userRole === 'admin' || userRole === 'hr') && (
                            <button
                                onClick={() => router.push('/billing')}
                                className="flex items-center gap-1.5 p-2 sm:px-4 sm:py-2.5 rounded-full text-white font-bold transition-all duration-300 shadow-sm hover:shadow-md hover:opacity-90 active:scale-95 group text-xs sm:text-sm"
                                style={{ background: `linear-gradient(135deg, ${pc} 0%, ${brand.secondary_color} 100%)` }}
                                title="Quản lý gói dịch vụ"
                            >
                                <Icon name="workspace_premium" className="text-[18px] sm:text-[20px] group-hover:scale-110 transition-transform duration-300" />
                                <span className="hidden sm:inline">Nâng cấp</span>
                            </button>
                        )}
                    </div>

                    <div className="relative hidden md:block">
                        <div
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-full border hover:bg-orange-50/50 dark:hover:bg-white/5 transition-all duration-300 cursor-pointer group select-none"
                            style={{ borderColor: `${pc}33` }}
                        >
                            <div
                                className="w-7 h-7 rounded-full overflow-hidden border border-white shadow-sm flex items-center justify-center text-white font-bold text-xs"
                                style={{ backgroundColor: pc }}
                            >
                                {getInitials(userName)}
                            </div>
                            <span className="font-bold text-sm" style={{ color: pc }}>{userName}</span>
                            <Icon name="keyboard_arrow_down" className={`text-[18px] transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: pc }} />
                        </div>

                        {showUserMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white/90 dark:bg-[#161412]/90 backdrop-blur-md rounded-2xl shadow-xl border border-orange-100/50 dark:border-white/5 py-1.5 z-50 animate-fade-in-up">
                                <button
                                    onClick={handleLogout}
                                    className="w-full px-4 py-2.5 text-left hover:bg-orange-50 dark:hover:bg-[#B24700]/10 transition-colors flex items-center gap-3 text-slate-700 dark:text-slate-200 text-sm font-semibold"
                                >
                                    <Icon name="logout" className="text-[20px]" style={{ color: pc }} />
                                    <span>Đăng xuất</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                userId={userId}
                userRole={userRole}
                userName={userName}
                onLogout={handleLogout}
            />
        </>
    );
}
