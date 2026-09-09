'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import KitchenDashboard from '../../kitchen/_components/KitchenDashboard';
import EmployeeDashboard from '../EmployeeDashboard';
import { createClient } from '@/lib/supabase/client';
import EmployeeManagement from './employees/EmployeeManagement';
import ShiftGroupManagement from './shifts-groups/ShiftGroupManagement';
import UrgentNotificationModal from './overview/UrgentNotificationModal';
import AnnouncementsHistoryModal from './overview/AnnouncementsHistoryModal';
import DeadlineSettingModal from './overview/DeadlineSettingModal';
import CookingDaysSettingModal from './overview/CookingDaysSettingModal';
import CookingExceptionsCalendar from './overview/CookingExceptionsCalendar';
import GuestMealsManager from './overview/GuestMealsManager';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';
import BrandingSettings from './settings/BrandingSettings';
import ApiKeyManagement from './settings/ApiKeyManagement';
import McpConfigTab from './settings/McpConfigTab';
import AdvancedAnalytics from './analytics/AdvancedAnalytics';
import ActivityHistoryModal from './overview/ActivityHistoryModal';
import ActivityLogsPage from './activitylogs/ActivityLogsPage';
import AutoResetSettingModal from './overview/AutoResetSettingModal';
import LateRegistrationsList from './overview/LateRegistrationsList';
import ForecastCards from './ForecastCards';
import StatsCards from './StatsCards';
import WeeklyComparison from './overview/WeeklyComparison';
import LiveActivityFeed from './overview/LiveActivityFeed';
import AIReportsPage from './ai-reports/AIReportsPage';
import AISettingsTab from './settings/AISettingsTab';
import AIAuditDashboard from './AIAuditDashboard';
import KnowledgeBaseTab from './settings/KnowledgeBaseTab';
import { GreenLeaderboardPage } from '../green-leaderboard/GreenLeaderboardPage';
import { toLocalDateString } from '@/lib/utils/date-helpers';
import { Sheet, SheetContent } from '@/components/ui/sheet';

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

// Types
interface DashboardStats {
    totalRegistered: number;
    notRegistered: number;
    cancelRate: number;
    trend?: number;
}

interface WeeklyData {
    day: string;
    date: string;
    registered: number;
    actual: number;
}

interface RecentActivity {
    id: string;
    user_name: string;
    email: string;
    department?: string;
    shift?: string;
    group_name?: string;
    eating_status: string;        // Trạng thái đăng ký ăn (cho cột HÀNH ĐỘNG)
    employee_status: string;      // Trạng thái nhân viên (cho cột TRẠNG THÁI)
    status: string;               // Legacy field for compatibility
    time: string;
}

/**
 * Admin Manager Dashboard
 * Analytics dashboard với sidebar navigation cho Admin/HR roles
 *
 * Features:
 * - Sidebar navigation (Tổng quan, Nhân viên, Thực đơn, Báo cáo, Chat)
 * - Stats cards (Tổng đăng ký, Chưa đăng ký, Tỷ lệ hủy)
 * - Weekly registration chart
 * - Quick actions (Gửi thông báo nhắc nhở)
 * - Real-time status table
 */
export default function AdminManagerDashboard() {
    const router = useRouter();
    const supabase = createClient();
    const [activeSidebarItem, setActiveSidebarItem] = useState('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const { isEnabled, getFeatureStatus } = useTenantFeatures();

    // Feature-gated sidebar items config
    // featureKey: maps to tenant_features column
    // requiredPlan: which plan is needed to unlock (lowercase matches PayOS plan key)
    const GATED_SIDEBAR_ITEMS = [
        { id: 'ai-reports', icon: 'auto_awesome', label: 'AI Báo cáo', featureKey: 'ai_reports', requiredPlan: 'Pro' },
        { id: 'branding', icon: 'palette', label: 'Thương hiệu', featureKey: 'custom_branding', requiredPlan: 'Pro' },
        { id: 'mcp-config', icon: 'hub', label: 'Cấu hình MCP & API', featureKey: 'api_access', requiredPlan: 'Pro' },
        { id: 'analytics', icon: 'analytics', label: 'Phân tích nâng cao', featureKey: 'advanced_analytics', requiredPlan: 'Pro' },
        { id: 'ai-settings', icon: 'smart_toy', label: 'Cài đặt AI', featureKey: 'ai_settings', requiredPlan: 'Pro' },
        { id: 'ai-logs', icon: 'security', label: 'Nhật ký AI', featureKey: 'ai_settings', requiredPlan: 'Pro' },
        { id: 'knowledge-base', icon: 'menu_book', label: 'Knowledge Base', featureKey: 'knowledge_base', requiredPlan: 'Pro' },
    ];

    /**
     * Render a feature-gated sidebar button.
     * 4 states:
     * 1. Enabled + beta → normal click + Beta badge
     * 2. Enabled + stable → normal click, no badge
     * 3. Disabled + beta/coming_soon → locked, "Sắp ra mắt" badge
     * 4. Disabled + stable → locked, "Nâng cấp [Plan]" badge
     */
    function renderGatedItem(item: typeof GATED_SIDEBAR_ITEMS[0]) {
        const enabled = isEnabled(item.featureKey);
        const status = getFeatureStatus(item.featureKey);
        const isActive = activeSidebarItem === item.id;
        const isBeta = status === 'beta';
        const isComingSoon = status === 'coming_soon' || status === 'alpha';

        const handleClick = () => {
            if (enabled) {
                setActiveSidebarItem(item.id);
            } else {
                // Still navigate so content area shows the upgrade prompt
                setActiveSidebarItem(item.id);
            }
            setShowMobileMenu(false);
        };

        return (
            <button
                key={item.id}
                onClick={handleClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isActive ? 'font-semibold' : 'font-medium'} transition-colors ${
                    isActive
                        ? 'bg-[#c04b00]/10 text-[#c04b00]'
                        : !enabled
                            ? 'text-[#B0B8C5] hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-default'
                            : 'text-[#606e8a] hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
            >
                <Icon name={item.icon} className={`text-[24px] ${!enabled ? 'opacity-50' : ''}`} />
                <span className={!enabled ? 'opacity-70' : ''}>{item.label}</span>
                {/* Badge logic */}
                {enabled && isBeta && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                        Beta
                    </span>
                )}
                {!enabled && (isBeta || isComingSoon) && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 whitespace-nowrap">
                        🔮 Sắp ra mắt
                    </span>
                )}
                {!enabled && !isBeta && !isComingSoon && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        🔒 {item.requiredPlan}
                    </span>
                )}
            </button>
        );
    }

    /**
     * Upgrade prompt component — shown when user clicks a locked feature
     */
    function FeatureLockedPrompt({ featureKey, label, requiredPlan }: { featureKey: string; label: string; requiredPlan: string }) {
        const status = getFeatureStatus(featureKey);
        const isBeta = status === 'beta';
        const isComingSoon = status === 'coming_soon' || status === 'alpha';

        if (isBeta || isComingSoon) {
            return (
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center max-w-md">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
                            <span className="text-3xl">🔮</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{label}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Tính năng đang phát triển</p>
                        <span className="inline-flex items-center px-3 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30">
                            🔮 Sắp ra mắt
                        </span>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Chúng tôi sẽ thông báo khi tính năng sẵn sàng</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                        <span className="text-3xl">🔒</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{label}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Tính năng này yêu cầu gói <strong className="text-[#c04b00]">{requiredPlan}</strong> trở lên
                    </p>
                    <button
                        onClick={() => router.push(`/billing?upgrade=${requiredPlan.toLowerCase()}`)}
                        className="px-6 py-2.5 bg-gradient-to-r from-[#c04b00] to-[#e06000] text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/25 hover:opacity-90 transition-all"
                    >
                        🚀 Nâng cấp gói {requiredPlan}
                    </button>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Thanh toán xong → tính năng tự động mở ngay</p>
                </div>
            </div>
        );
    }
    const [showAnnouncementsHistoryModal, setShowAnnouncementsHistoryModal] = useState(false);
    const [showDeadlineModal, setShowDeadlineModal] = useState(false);
    const [showLateList, setShowLateList] = useState(false);
    const [showCookingDaysModal, setShowCookingDaysModal] = useState(false);
    const [showActivityHistoryModal, setShowActivityHistoryModal] = useState(false);
    const [showAutoResetModal, setShowAutoResetModal] = useState(false);
    const [showCookingExceptions, setShowCookingExceptions] = useState(false);
    const [showGuestMeals, setShowGuestMeals] = useState(false);
    const [cookingDays, setCookingDays] = useState<{ start_day: number; end_day: number }>({ start_day: 1, end_day: 5 });

    // ⭐ v5.8.0: Date range cho export Excel
    const [exportStartDate, setExportStartDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [exportEndDate, setExportEndDate] = useState(() => {
        return toLocalDateString(new Date());
    });

    // View Mode State
    const [viewMode, setViewMode] = useState<'admin' | 'kitchen' | 'employee'>('admin');

    // Stats state
    const [stats, setStats] = useState<DashboardStats>({
        totalRegistered: 0,
        notRegistered: 0,
        cancelRate: 0
    });

    // Weekly chart data
    const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);

    // Recent activities
    const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
    const [totalEmployees, setTotalEmployees] = useState(14);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Filter state
    const [selectedDate, setSelectedDate] = useState<string>(toLocalDateString(new Date()));
    const [statusFilter, setStatusFilter] = useState<'all' | 'eating' | 'not_eating' | 'not_registered'>('all');

    const [currentDate, setCurrentDate] = useState('');
    const [showMobileMenu, setShowMobileMenu] = useState(false);


    // Track previous filter values to reset page when filters change
    const prevFiltersRef = useRef({ selectedDate, statusFilter });

    useEffect(() => {
        // Initial fetch
        fetchCookingDays();
        fetchDashboardData();

        // Set current date for display
        const today = new Date();
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        setCurrentDate(today.toLocaleDateString('vi-VN', options));

        // Force reset selectedDate to today (prevent browser autofill)
        const todayStr = toLocalDateString(today);
        setSelectedDate(todayStr);

        // Setup Realtime subscriptions
        const ordersChannel = supabase
            .channel('orders-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    console.log('Orders table changed, refreshing dashboard...');
                    fetchDashboardData();
                }
            )
            .subscribe();

        const usersChannel = supabase
            .channel('users-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'users' },
                () => {
                    console.log('Users table changed, refreshing dashboard...');
                    fetchDashboardData();
                }
            )
            .subscribe();

        // Cleanup subscriptions on unmount
        return () => {
            supabase.removeChannel(ordersChannel);
            supabase.removeChannel(usersChannel);
        };
    }, []);

    // Re-fetch when page or filters change
    useEffect(() => {
        // Check if filters changed (not just page)
        const filtersChanged =
            prevFiltersRef.current.selectedDate !== selectedDate ||
            prevFiltersRef.current.statusFilter !== statusFilter;

        if (filtersChanged) {
            prevFiltersRef.current = { selectedDate, statusFilter };
            setCurrentPage(1); // Reset to page 1 when filters change
        }

        fetchDashboardData();
    }, [currentPage, selectedDate, statusFilter]);

    const fetchCookingDays = async () => {
        try {
            const response = await fetch('/api/admin/settings/cooking-days');
            if (response.ok) {
                const result = await response.json();
                setCookingDays(result.data);
            } else {
                // If API fails, use default Monday-Friday
                console.log('Using default cooking days: Monday-Friday');
                setCookingDays({ start_day: 1, end_day: 5 });
            }
        } catch (error) {
            console.error('Failed to fetch cooking days, using default:', error);
            // Fallback to default
            setCookingDays({ start_day: 1, end_day: 5 });
        }
    };

    const fetchDashboardData = async () => {
        try {
            setIsLoading(true);
            const today = toLocalDateString(new Date());

            // 1. Fetch today's stats
            // Count "Not Eating" — CHỈ đếm active non-kitchen users
            const { count: notEatingCount } = await supabase
                .from('orders')
                .select('user_id, users!inner(status, role)', { count: 'exact', head: true })
                .eq('date', today)
                .eq('status', 'not_eating')
                .eq('users.status', 'active')
                .not('users.role', 'ilike', 'kitchen');

            // Count "Not Eating" for Yesterday (for Trend)
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = toLocalDateString(yesterdayDate);

            const { count: yesterdayNotEatingCount } = await supabase
                .from('orders')
                .select('user_id, users!inner(status, role)', { count: 'exact', head: true })
                .eq('date', yesterday)
                .eq('status', 'not_eating')
                .eq('users.status', 'active')
                .not('users.role', 'ilike', 'kitchen');

            // Đếm tất cả nhân sự active (admin, manager, employee) — CHỈ TRỪ kitchen
            const { count: totalEmployeesCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen');

            const totalEmployees = totalEmployeesCount || 14;

            // Fetch guest meals for today
            const { data: guestMealsToday } = await supabase
                .from('guest_meals')
                .select('quantity')
                .eq('date', today);
            const guestMealsTotal = guestMealsToday?.reduce((sum, item) => sum + item.quantity, 0) || 0;

            // Registered = (Total NV - Not Eating) + Guest Meals
            const totalRegistered = totalEmployees - (notEatingCount || 0) + guestMealsTotal;

            // Repurpose notRegistered to track "Reported Off" (Not Eating)
            const notRegistered = notEatingCount || 0;

            // Calculate Rates
            const todayRate = totalEmployees > 0 ? ((notRegistered / totalEmployees) * 100) : 0;
            const yesterdayRate = totalEmployees > 0 ? (((yesterdayNotEatingCount || 0) / totalEmployees) * 100) : 0;
            const trend = todayRate - yesterdayRate;

            setStats({
                totalRegistered,
                notRegistered,
                cancelRate: parseFloat(todayRate.toFixed(1)),
                trend: parseFloat(trend.toFixed(1))
            });
            setTotalEmployees(totalEmployees);

            // 2. Fetch weekly data (last 7 days)
            const weekData: WeeklyData[] = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = toLocalDateString(date);
                const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                const dayName = dayNames[date.getDay()];

                const dateDisplay = `${date.getDate()}/${date.getMonth() + 1}`;

                const { count: notEatingCount } = await supabase
                    .from('orders')
                    .select('user_id, users!inner(status, role)', { count: 'exact', head: true })
                    .eq('date', dateStr)
                    .eq('status', 'not_eating')
                    .eq('users.status', 'active')
                    .not('users.role', 'ilike', 'kitchen');

                const registered = (totalEmployees || 14) - (notEatingCount || 0);

                weekData.push({
                    day: dayName,
                    date: dateDisplay,
                    registered: registered,
                    actual: registered
                });
            }
            setWeeklyData(weekData);



            // 3. Fetch user activities with pagination and filters
            // First, get current user's tenant_id for filtering
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) {
                console.error('[AdminManagerDashboard] No authenticated user');
                setRecentActivities([]);
                setTotalPages(1);
                return;
            }

            const { data: currentProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', currentUser.id)
                .single();

            if (!currentProfile?.tenant_id) {
                console.error('[AdminManagerDashboard] Current user has no tenant_id');
                setRecentActivities([]);
                setTotalPages(1);
                return;
            }

            // Get ALL users from SAME TENANT only
            const { data: allUsers } = await supabase
                .from('users')
                .select(`
                    id,
                    full_name,
                    email,
                    department,
                    shift_id,
                    shifts:shift_id(name),
                    is_active,
                    group:groups(name)
                `)
                .eq('tenant_id', currentProfile.tenant_id) // ✅ TENANT FILTERING
                .order('full_name', { ascending: true });

            if (!allUsers) {
                setRecentActivities([]);
                setTotalPages(1);
                return;
            }

            // Then get orders for selected date
            const { data: ordersForDate } = await supabase
                .from('orders')
                .select('user_id, status, created_at')
                .eq('date', selectedDate);

            // Fetch activity logs for this date to get accurate timestamps
            // Filter by details.date to avoid UTC/VN timezone mismatch
            const { data: activityLogs } = await supabase
                .from('activity_logs')
                .select('performed_by, action, created_at, details')
                .in('action', ['meal_registration', 'meal_cancellation'])
                .filter('details->>date', 'eq', selectedDate)
                .order('created_at', { ascending: false });

            // Create maps for fast lookup
            const orderMap = new Map();
            ordersForDate?.forEach((order: any) => {
                orderMap.set(order.user_id, order);
            });

            // Create activity map (most recent activity per user for the date)
            const activityMap = new Map();
            activityLogs?.forEach((log: any) => {
                if (!activityMap.has(log.performed_by)) {
                    activityMap.set(log.performed_by, log);
                }
            });

            // Combine users with their orders and activity logs
            let combinedData = allUsers.map((user: any) => {
                const order = orderMap.get(user.id);
                const activity = activityMap.get(user.id);

                // Eating Status Logic: No record = Eating (Đã đăng ký)
                // Only explicitly 'not_eating' = Not Eating (Không ăn)
                let eatingStatus = 'Đã đăng ký';

                if (order && order.status === 'not_eating') {
                    eatingStatus = 'Không ăn';
                }

                return {
                    id: user.id,
                    user_name: user.full_name,
                    email: user.email,
                    department: user.department || '-',
                    shift: (user as any).shifts?.name || '-',
                    group_name: user.group?.name || '-',
                    is_active: user.is_active !== false, // Default true nếu null/undefined
                    eating_status: eatingStatus, // Status đăng ký ăn (cho cột HÀNH ĐỘNG)
                    order_status: eatingStatus, // Legacy field (giữ để tương thích)
                    // Use activity log timestamp if available, fallback to order created_at
                    created_at: activity?.created_at || order?.created_at || null,
                    raw_status: order?.status || 'eating'
                };
            });

            // Apply status filter
            if (statusFilter === 'eating') {
                // Eating: raw_status is 'eating' OR null/undefined (default - người không báo nghỉ)
                combinedData = combinedData.filter(item => item.raw_status === 'eating' || !item.raw_status);
            } else if (statusFilter === 'not_eating') {
                // Not eating: raw_status is 'not_eating'
                combinedData = combinedData.filter(item => item.raw_status === 'not_eating');
            } else if (statusFilter === 'not_registered') {
                // No one is unregistered now
                combinedData = [];
            }

            // Calculate pagination
            const totalCount = combinedData.length;
            const pages = Math.ceil(totalCount / ITEMS_PER_PAGE);
            setTotalPages(pages);

            // Apply pagination
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const paginatedData = combinedData.slice(startIndex, endIndex);

            // Format activities
            const activities = paginatedData.map((item: any) => {
                // Use the ALREADY MAPPED eating_status from combinedData
                // DON'T re-parse it, it's already been mapped correctly
                const eatingStatus = item.eating_status;

                // Employee status SYNCHRONIZED with eating status
                // Đã đăng ký → Hoạt động
                // Không ăn → Không hoạt động
                const employeeStatus = eatingStatus === 'Đã đăng ký'
                    ? 'Hoạt động'
                    : 'Không hoạt động';

                return {
                    id: item.id,
                    user_name: item.user_name,
                    email: item.email,
                    department: item.department,
                    shift: item.shift,
                    group_name: item.group_name,
                    eating_status: eatingStatus,
                    employee_status: employeeStatus,
                    status: eatingStatus, // Legacy field
                    time: item.created_at
                        ? new Date(item.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Ho_Chi_Minh'  // Force Vietnam timezone
                        })
                        : '-'
                };
            });
            setRecentActivities(activities);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <div className="flex h-screen bg-[#F8F7F5] dark:bg-[#12100E] transition-colors duration-300">
            {/* Sidebar Obsidian tối giản đẳng cấp (Tối trong cả 2 chế độ sáng/tối) */}
            {viewMode === 'admin' && (
                <aside className="w-64 flex flex-col bg-[#161412] border-r border-white/5 hidden md:flex">
                    <div className="p-6 flex flex-col h-full">
                        {/* Header của Sidebar */}
                        <div className="flex items-center gap-3.5 mb-8 select-none">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#b24700] to-[#8d3800] flex items-center justify-center text-white shadow-md shadow-[#b24700]/20">
                                <Icon name="admin_panel_settings" className="text-[20px]" />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-white uppercase tracking-widest leading-none">
                                    Meal Manager
                                </h2>
                                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                    Văn phòng Admin
                                </p>
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="flex flex-col gap-1.5 flex-grow">
                            <button
                                onClick={() => setActiveSidebarItem('dashboard')}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'dashboard'
                                    ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Icon name="dashboard" className="text-[22px]" />
                                <span>Tổng quan</span>
                            </button>

                            <button
                                onClick={() => setActiveSidebarItem('employees')}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'employees'
                                    ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Icon name="group" className="text-[22px]" />
                                <span>Danh sách nhân viên</span>
                            </button>

                            <button
                                onClick={() => setActiveSidebarItem('shifts-groups')}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'shifts-groups'
                                    ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Icon name="schedule" className="text-[22px]" />
                                <span>Quản lý ca nhóm ăn</span>
                            </button>

                            <button
                                onClick={() => setActiveSidebarItem('activity-logs')}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'activity-logs'
                                    ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Icon name="history" className="text-[22px]" />
                                <span>Lịch sử hoạt động</span>
                            </button>

                            <button
                                onClick={() => setActiveSidebarItem('green-leaderboard')}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'green-leaderboard'
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Icon name="military_tech" className="text-[22px]" />
                                <span>Đấu trường Phòng ban 🌿</span>
                            </button>

                            {renderGatedItem(GATED_SIDEBAR_ITEMS[0])}{/* AI Báo cáo */}

                            {/* Divider */}
                            <div className="border-t border-white/5 my-3"></div>
                            <p className="px-4 text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 select-none">Cài đặt nâng cao</p>

                            {GATED_SIDEBAR_ITEMS.slice(1).map(item => renderGatedItem(item))}
                        </nav>

                        {/* Logout Button */}
                        <div className="pt-4 border-t border-white/5">
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center justify-center gap-2 rounded-full h-11 bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 text-slate-300 text-xs font-black uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer"
                            >
                                <Icon name="logout" className="text-[18px]" />
                                <span>Đăng xuất</span>
                            </button>
                        </div>
                    </div>
                </aside>
            )}

            {/* Mobile Sidebar using Sheet */}
            {viewMode === 'admin' && (
                <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
                    <SheetContent side="left" className="p-0 w-64 bg-[#161412] border-r border-white/5 h-full flex flex-col">
                        <div className="p-6 flex flex-col h-full overflow-y-auto">
                            {/* Logo */}
                            <div className="flex items-center gap-3.5 mb-8 select-none">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#b24700] to-[#8d3800] flex items-center justify-center text-white shadow-md shadow-[#b24700]/20">
                                    <Icon name="admin_panel_settings" className="text-[20px]" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-white uppercase tracking-widest leading-none">
                                        Meal Manager
                                    </h2>
                                    <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                        Văn phòng Admin
                                    </p>
                                </div>
                            </div>

                            {/* Navigation */}
                            <nav className="flex flex-col gap-1.5 flex-grow">
                                <button
                                    onClick={() => {
                                        setActiveSidebarItem('dashboard');
                                        setShowMobileMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'dashboard'
                                        ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                        }`}
                                >
                                    <Icon name="dashboard" className="text-[22px]" />
                                    <span>Tổng quan</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setActiveSidebarItem('employees');
                                        setShowMobileMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'employees'
                                        ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                        }`}
                                >
                                    <Icon name="group" className="text-[22px]" />
                                    <span>Danh sách nhân viên</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setActiveSidebarItem('shifts-groups');
                                        setShowMobileMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'shifts-groups'
                                        ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                        }`}
                                >
                                    <Icon name="schedule" className="text-[22px]" />
                                    <span>Quản lý ca nhóm ăn</span>
                                </button>

                                 <button
                                    onClick={() => {
                                        setActiveSidebarItem('activity-logs');
                                        setShowMobileMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'activity-logs'
                                        ? 'bg-[#b24700] text-white shadow-md shadow-[#b24700]/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                        }`}
                                >
                                    <Icon name="history" className="text-[22px]" />
                                    <span>Lịch sử hoạt động</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setActiveSidebarItem('green-leaderboard');
                                        setShowMobileMenu(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:translate-x-1 ${activeSidebarItem === 'green-leaderboard'
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                                        : 'text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.04]'
                                        }`}
                                >
                                    <Icon name="emoji_events" className="text-[22px]" />
                                    <span>Phòng Ban Xanh 🌿</span>
                                </button>

                                {renderGatedItem(GATED_SIDEBAR_ITEMS[0])}{/* AI Báo cáo */}

                                {/* Divider */}
                                <div className="border-t border-white/5 my-3"></div>
                                <p className="px-4 text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 select-none">Cài đặt nâng cao</p>

                                {GATED_SIDEBAR_ITEMS.slice(1).map(item => renderGatedItem(item))}
                            </nav>

                            {/* Logout Button */}
                            <div className="pt-4 border-t border-white/5">
                                <button
                                    onClick={() => {
                                        handleLogout();
                                        setShowMobileMenu(false);
                                    }}
                                    className="flex w-full items-center justify-center gap-2 rounded-full h-11 bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 text-slate-300 text-xs font-black uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer"
                                >
                                    <Icon name="logout" className="text-[18px]" />
                                    <span>Đăng xuất</span>
                                </button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header - Always Visible (or at least for Admin) */}
                <header className="sticky top-0 z-10 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-[#dbdfe6] dark:border-slate-800 px-8 py-4">
                    <div className="flex items-center gap-4">
                        <button
                            className="md:hidden p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            onClick={() => setShowMobileMenu(!showMobileMenu)}
                        >
                            <Icon name="menu" />
                        </button>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white hidden md:block">
                                {viewMode === 'admin' ? 'Bảng điều khiển quản lý' :
                                    viewMode === 'kitchen' ? 'Bảng điều khiển Bếp' : 'Giao diện Nhân viên'}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:block">
                                {currentDate || new Date().toLocaleDateString('vi-VN')}
                            </p>
                        </div>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('admin')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'admin'
                                ? 'bg-white dark:bg-slate-700 text-[#b74b0c] shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                        >
                            Quản trị
                        </button>
                        <button
                            onClick={() => setViewMode('kitchen')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'kitchen'
                                ? 'bg-white dark:bg-slate-700 text-[#b74b0c] shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                        >
                            Bếp
                        </button>
                        <button
                            onClick={() => setViewMode('employee')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'employee'
                                ? 'bg-white dark:bg-slate-700 text-[#b74b0c] shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                        >
                            Cá nhân
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        {viewMode === 'admin' && (
                            <>
                                <button
                                    onClick={() => setShowDeadlineModal(true)}
                                    className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/10 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all shadow-sm hover:shadow"
                                    title="Cài đặt hạn đăng ký"
                                >
                                    <Icon name="timer" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowLateList(true)}
                                    className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all shadow-sm hover:shadow"
                                    title="Danh sách đăng ký muộn"
                                >
                                    <Icon name="schedule_send" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowAnnouncementsHistoryModal(true)}
                                    className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/10 text-[#c04b00] hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all shadow-sm hover:shadow"
                                    title="Quản lý thông báo"
                                >
                                    <Icon name="notifications" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowActivityHistoryModal(true)}
                                    className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/10 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all shadow-sm hover:shadow"
                                    title="Lịch sử hoạt động"
                                >
                                    <Icon name="history" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowCookingDaysModal(true)}
                                    className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all shadow-sm hover:shadow"
                                    title="Cài đặt ngày nấu ăn"
                                >
                                    <Icon name="settings" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowCookingExceptions(true)}
                                    className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all shadow-sm hover:shadow"
                                    title="Quản lý ngày nghỉ/nấu bếp"
                                >
                                    <Icon name="event_note" className="text-[22px]" />
                                </button>
                                <button
                                    onClick={() => setShowAutoResetModal(true)}
                                    className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/10 text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-all shadow-sm hover:shadow"
                                    title="Tự động đăng ký lại"
                                >
                                    <Icon name="autorenew" className="text-[22px]" />
                                </button>
                            </>
                        )}
                        {/* Generic Logout for other modes if sidebar is hidden? 
                            Actually, Kitchen/Employee dashboards might have their own headers OR we rely on this header.
                            KitchenDashboard has its own Header but we enabled hideHeader.
                            So we should provide Logout here if needed, or rely on internal logic.
                            Let's add Logout if NOT in admin mode (since Admin has sidebar logout)
                        */}
                        {viewMode !== 'admin' && (
                            <button
                                onClick={handleLogout}
                                className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-600 hover:bg-gray-200 transition-all"
                                title="Đăng xuất"
                            >
                                <Icon name="logout" className="text-[22px]" />
                            </button>
                        )}
                    </div>
                </header>

                {/* ADMIN VIEW */}
                {viewMode === 'admin' && (
                    <main className="flex-1 overflow-auto bg-[#F8F9FA] dark:bg-[#12100E] p-4 md:p-8">
                        {activeSidebarItem === 'dashboard' && (
                            <div className="space-y-8">
                                {/* Stats Cards — expandable with department breakdown */}
                                <StatsCards />

                                {/* Forecast Cards for Tomorrow */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <ForecastCards />
                                </div>

                                {/* Quick Actions: Guest Meals + Excel Export */}
                                <div className="flex flex-wrap items-center gap-3 -mt-4">
                                    {/* Nút suất phát sinh */}
                                    <button
                                        onClick={() => setShowGuestMeals(true)}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-sm hover:shadow-md"
                                    >
                                        <Icon name="person_add" className="text-lg" />
                                        <span className="text-sm">+ Suất phát sinh</span>
                                    </button>

                                    {/* ⭐ v5.8.0: Date range picker + Export button */}
                                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-[#dbdfe6] dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-sm">
                                        <Icon name="date_range" className="text-base text-gray-400" />
                                        <input
                                            type="date"
                                            value={exportStartDate}
                                            onChange={(e) => setExportStartDate(e.target.value)}
                                            className="text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200 w-[130px]"
                                        />
                                        <span className="text-xs text-gray-400">→</span>
                                        <input
                                            type="date"
                                            value={exportEndDate}
                                            onChange={(e) => setExportEndDate(e.target.value)}
                                            className="text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-200 w-[130px]"
                                        />
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(
                                                    `/api/admin/export/monthly?startDate=${exportStartDate}&endDate=${exportEndDate}&t=${Date.now()}`
                                                );
                                                if (!res.ok) throw new Error('Export failed');
                                                const blob = await res.blob();
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                const cd = res.headers.get('Content-Disposition');
                                                const match = cd?.match(/filename="(.+)"/);
                                                a.download = match?.[1] || `bao-cao-com-trua-${exportStartDate}_${exportEndDate}.xlsx`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            } catch (err) {
                                                console.error('Excel export error:', err);
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all shadow-sm hover:shadow-md"
                                    >
                                        <Icon name="download" className="text-lg" />
                                        <span className="text-sm">📊 Xuất Excel</span>
                                    </button>
                                </div>

                                {/* Chart & Quick Actions */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Weekly Chart */}
                                    <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold dark:text-white">Thống kê suất ăn theo tuần</h3>
                                                <p className="text-sm text-[#606e8a]">Biểu đồ hiển thị theo cài đặt ngày nấu cơm</p>
                                            </div>
                                            <button
                                                onClick={() => setShowCookingDaysModal(true)}
                                                className="flex items-center gap-1 px-3 py-2 bg-[#f5f1ee] dark:bg-slate-800 hover:bg-[#dbdfe6] dark:hover:bg-slate-700 rounded-lg transition-colors"
                                            >
                                                <Icon name="settings" className="text-lg text-[#606e8a]" />
                                                <span className="text-xs font-bold text-[#606e8a]">Cài đặt</span>
                                            </button>
                                            <div className="flex gap-2">
                                                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#c04b00]/10 text-[#c04b00] text-xs font-bold rounded-full">
                                                    Tuần này: {weeklyData.reduce((sum, d) => sum + d.registered, 0)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart Bars */}
                                        <div className="relative h-[280px] w-full">
                                            {/* Grid lines for reference */}
                                            <div className="absolute inset-0 flex flex-col justify-end pb-12">
                                                <div className="border-t border-gray-200 dark:border-gray-700 opacity-30 h-0" style={{ marginBottom: '70px' }}></div>
                                                <div className="border-t border-gray-200 dark:border-gray-700 opacity-30 h-0" style={{ marginBottom: '70px' }}></div>
                                                <div className="border-t border-gray-200 dark:border-gray-700 opacity-30 h-0" style={{ marginBottom: '70px' }}></div>
                                            </div>

                                            {/* Bars container */}
                                            <div className="absolute inset-0 flex items-center justify-around px-2">
                                                {(() => {
                                                    // Filter weeklyData based on cooking_days setting
                                                    const { start_day, end_day } = cookingDays;
                                                    const filteredData = weeklyData.filter((dayData) => {
                                                        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                                                        const dayIndex = dayNames.indexOf(dayData.day);

                                                        // Handle wrap-around week (e.g., Sat to Mon)
                                                        if (start_day <= end_day) {
                                                            return dayIndex >= start_day && dayIndex <= end_day;
                                                        } else {
                                                            return dayIndex >= start_day || dayIndex <= end_day;
                                                        }
                                                    });

                                                    return filteredData.length > 0 ? filteredData.map((dayData, index) => {
                                                        const percentage = totalEmployees > 0 ? Math.round((dayData.registered / totalEmployees) * 100) : 0;
                                                        return (
                                                            <div key={dayData.day} className="flex flex-col items-center gap-2 flex-1 max-w-[60px]">
                                                                {/* Percentage label on top */}
                                                                <span className="text-xs font-bold text-primary mb-1">
                                                                    {percentage}%
                                                                </span>

                                                                {/* Bar with percentage fill */}
                                                                <div className="relative w-8 h-[180px] bg-[#c04b00]/20 rounded-lg overflow-hidden group">
                                                                    {/* Filled portion (from bottom) */}
                                                                    <div
                                                                        className="absolute bottom-0 left-0 right-0 bg-[#c04b00] transition-all rounded-b-lg"
                                                                        style={{ height: `${percentage}%` }}
                                                                    />

                                                                    {/* Hover tooltip */}
                                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                                        {dayData.registered}/{totalEmployees}
                                                                    </div>
                                                                </div>

                                                                {/* Day label */}
                                                                <span className="text-xs font-bold text-[#606e8a] mt-1">{dayData.day}</span>
                                                                {/* Date label */}
                                                                <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-[#606e8a] px-1 rounded">
                                                                    {dayData.date}
                                                                </span>

                                                                {/* Count/Total label */}
                                                                <span className="text-[10px] font-semibold text-primary mt-0.5">
                                                                    {dayData.registered}/{totalEmployees}
                                                                </span>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div className="flex items-center justify-center w-full h-full">
                                                            <p className="text-sm text-[#606e8a]">Không có dữ liệu cho các ngày được chọn</p>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold dark:text-white mb-2">Thao tác nhanh</h3>
                                            <p className="text-sm text-[#606e8a] mb-6">
                                                Gửi thông báo đến toàn bộ nhân viên.
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => {
                                                if (!isEnabled('notifications')) {
                                                    alert('Tính năng thông báo chưa được bật cho gói dịch vụ hiện tại. Liên hệ admin để nâng cấp.');
                                                    return;
                                                }
                                                setIsNotificationModalOpen(true);
                                            }}
                                            className="w-full py-3 bg-[#b24700] hover:bg-[#8d3800] text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                                        >
                                            <Icon name="send" className="text-[20px]" />
                                            Gửi thông báo
                                        </button>
                                    </div>
                                </div>

                                {/* Weekly Comparison + Live Feed — v6.0.0 */}
                                <WeeklyComparison />
                                <LiveActivityFeed onSwitchTab={(tab) => setActiveSidebarItem(tab === 'activity' ? 'activity-logs' : tab)} />
                            </div>
                        )}

                        {activeSidebarItem === 'employees' && (
                            <EmployeeManagement />
                        )}

                        {activeSidebarItem === 'shifts-groups' && (
                            <ShiftGroupManagement />
                        )}

                        {activeSidebarItem === 'activity-logs' && (
                            <ActivityLogsPage />
                        )}

                        {activeSidebarItem === 'green-leaderboard' && (
                            <GreenLeaderboardPage userRole="admin" />
                        )}

                        {activeSidebarItem === 'ai-reports' && (
                            isEnabled('ai_reports') ? <AIReportsPage /> : <FeatureLockedPrompt featureKey="ai_reports" label="AI Báo cáo" requiredPlan="Pro" />
                        )}

                        {activeSidebarItem === 'branding' && (
                            isEnabled('custom_branding') ? <BrandingSettings /> : <FeatureLockedPrompt featureKey="custom_branding" label="Thương hiệu" requiredPlan="Pro" />
                        )}

                        {(activeSidebarItem === 'mcp-config' || activeSidebarItem === 'api-keys') && (
                            <McpConfigTab />
                        )}

                        {activeSidebarItem === 'analytics' && (
                            isEnabled('advanced_analytics') ? <AdvancedAnalytics /> : <FeatureLockedPrompt featureKey="advanced_analytics" label="Phân tích nâng cao" requiredPlan="Pro" />
                        )}

                        {activeSidebarItem === 'ai-settings' && (
                            isEnabled('ai_settings') ? <AISettingsTab /> : <FeatureLockedPrompt featureKey="ai_settings" label="Cài đặt AI" requiredPlan="Pro" />
                        )}

                        {activeSidebarItem === 'ai-logs' && (
                            isEnabled('ai_settings') ? <AIAuditDashboard /> : <FeatureLockedPrompt featureKey="ai_settings" label="Nhật ký AI" requiredPlan="Pro" />
                        )}

                        {activeSidebarItem === 'knowledge-base' && (
                            isEnabled('knowledge_base') ? <KnowledgeBaseTab /> : <FeatureLockedPrompt featureKey="knowledge_base" label="Knowledge Base" requiredPlan="Pro" />
                        )}
                    </main>
                )}

                {/* KITCHEN VIEW */}
                {viewMode === 'kitchen' && (
                    <div className="flex-1 overflow-auto bg-[#FFFBF7] dark:bg-[#12100E]">
                        <KitchenDashboard hideHeader={true} />
                    </div>
                )}

                {/* EMPLOYEE VIEW */}
                {viewMode === 'employee' && (
                    <div className="flex-1 overflow-auto bg-[#FFFBF7] dark:bg-[#12100E]">
                        <EmployeeDashboard hideHeader={true} />
                    </div>
                )}

                <UrgentNotificationModal
                    isOpen={isNotificationModalOpen}
                    onClose={() => setIsNotificationModalOpen(false)}
                    unregisteredCount={stats.notRegistered}
                />

                <AnnouncementsHistoryModal
                    isOpen={showAnnouncementsHistoryModal}
                    onClose={() => setShowAnnouncementsHistoryModal(false)}
                />

                <DeadlineSettingModal
                    isOpen={showDeadlineModal}
                    onClose={() => setShowDeadlineModal(false)}
                    onSuccess={() => {
                        console.log('Deadline settings saved successfully');
                        fetchDashboardData();
                    }}
                />

                <CookingDaysSettingModal
                    isOpen={showCookingDaysModal}
                    onClose={() => setShowCookingDaysModal(false)}
                    onSuccess={() => {
                        fetchCookingDays();
                        fetchDashboardData();
                    }}
                />

                <CookingExceptionsCalendar
                    isOpen={showCookingExceptions}
                    onClose={() => setShowCookingExceptions(false)}
                />

                <GuestMealsManager
                    isOpen={showGuestMeals}
                    onClose={() => setShowGuestMeals(false)}
                    onUpdate={() => fetchDashboardData()}
                />

                <ActivityHistoryModal
                    isOpen={showActivityHistoryModal}
                    onClose={() => setShowActivityHistoryModal(false)}
                />

                <AutoResetSettingModal
                    isOpen={showAutoResetModal}
                    onClose={() => setShowAutoResetModal(false)}
                    onSuccess={() => {
                        // Optional: Refetch dashboard data or show success message
                        console.log('Auto-reset settings saved successfully');
                    }}
                />
                <LateRegistrationsList
                    isOpen={showLateList}
                    onClose={() => setShowLateList(false)}
                />

                <UrgentNotificationModal
                    isOpen={isNotificationModalOpen}
                    onClose={() => setIsNotificationModalOpen(false)}
                    unregisteredCount={stats.notRegistered}
                />
            </div>
        </div>
    );
}
