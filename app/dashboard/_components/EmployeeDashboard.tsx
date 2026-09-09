'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/providers/toast-provider';
import DashboardHeader from './DashboardHeader';
import BulkRegistrationCalendar from './BulkRegistrationCalendar';
import LateRegistrationModal from './LateRegistrationModal';
import NotificationInbox from './NotificationInbox';
import PushNotificationPrompt from './PushNotificationPrompt';
import PushStatusIndicator from './PushStatusIndicator';
import { toLocalDateString, getVietnamDateString } from '@/lib/utils/date-helpers';
import { getDefaultMealStatus } from '@/lib/meal-helpers';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';

// Material Symbol Icon component
const Icon = ({ name, className = "", style }: { name: string; className?: string; style?: React.CSSProperties }) => (
    <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
);

// Types
interface GroupMember {
    id: string;
    full_name: string;
    email: string;
    role: string;
    order_status?: 'eating' | 'not_eating' | null;
    avatar_url?: string;
}

interface GroupInfo {
    id: string;
    name: string;
    department: string;
    table_area: string;
    shift?: {
        name: string;
        start_time: string;
        end_time: string;
    };
}

interface Announcement {
    id: string;
    content: string;
}

interface EmployeeDashboardProps {
    hideHeader?: boolean;
}

export default function EmployeeDashboard({ hideHeader = false }: EmployeeDashboardProps) {
    const router = useRouter();
    const supabase = createClient();
    const { showToast } = useToast();

    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [orderStatus, setOrderStatus] = useState<'eating' | 'not_eating'>('not_eating');
    const [userName, setUserName] = useState('Đăng Rice');
    const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
    const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([
        { id: '1', content: '🎉 Thực đơn tuần mới đã được cập nhật! Vui lòng đăng ký trước 16:00 mỗi ngày.' },
        { id: '2', content: '📢 Lưu ý: Ngày 30/06 công ty có tiệc buffet trưa tại sảnh chính.' },
        { id: '3', content: '⚠️ Hệ thống sẽ bảo trì vào lúc 22:00 tối nay.' },
    ]);
    const [monthlyEatingDays, setMonthlyEatingDays] = useState(0);
    const [monthlyNotEatingDays, setMonthlyNotEatingDays] = useState(0);
    const [registrationDeadline, setRegistrationDeadline] = useState('05:00');
    const [deadlineOffset, setDeadlineOffset] = useState(0);
    const [deadlineEnabled, setDeadlineEnabled] = useState(false);
    const [totalGroupMembers, setTotalGroupMembers] = useState(0);
    const [memberPage, setMemberPage] = useState(1);
    const MEMBERS_PER_PAGE = 4;
    const [showCalendar, setShowCalendar] = useState(false);
    const { isEnabled } = useTenantFeatures();
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [cookingDaysSetting, setCookingDaysSetting] = useState({ start_day: 1, end_day: 5 });
    const [userStatus, setUserStatus] = useState<'active' | 'paused' | 'resigned'>('active');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [userStartDate, setUserStartDate] = useState<string | null>(null);
    const [isPastDeadline, setIsPastDeadline] = useState(false);
    const [countdownText, setCountdownText] = useState('');
    const [showLateModal, setShowLateModal] = useState(false);
    const [allowLateRegistration, setAllowLateRegistration] = useState(true);
    const [registrationMode, setRegistrationMode] = useState<'opt_out' | 'opt_in'>('opt_out');
    // ⚠️ AUDIT-GUARD: targetDate = ngày mà NV đang đăng ký (hôm nay hoặc ngày mai sau cron reset)
    const [targetDate, setTargetDate] = useState<string>(toLocalDateString(new Date()));
    const [isAfterReset, setIsAfterReset] = useState(false);
    const [isTomorrowCookingDay, setIsTomorrowCookingDay] = useState(true);
    const [tomorrowDateStr, setTomorrowDateStr] = useState('');
    // Stats popup states
    const [showStatsPopup, setShowStatsPopup] = useState(false);
    const [mealPrice, setMealPrice] = useState(0);
    const [notEatingDates, setNotEatingDates] = useState<string[]>([]);
    const [totalCookingDays, setTotalCookingDays] = useState(0);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Countdown timer - update every 30 seconds
    useEffect(() => {
        if (!deadlineEnabled || !registrationDeadline) return;

        const updateCountdown = () => {
            const now = new Date();
            const today = toLocalDateString(now);
            const deadline = new Date(today + 'T' + registrationDeadline + ':00+07:00');
            const diff = deadline.getTime() - now.getTime();

            if (diff <= 0) {
                setIsPastDeadline(true);
                setCountdownText('');
            } else {
                setIsPastDeadline(false);
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                if (hours > 0) {
                    setCountdownText(`⏳ Còn ${hours}h${minutes > 0 ? minutes + 'p' : ''} để thay đổi`);
                } else {
                    setCountdownText(`⏳ Còn ${minutes} phút để thay đổi`);
                }
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 30000); // 30s
        return () => clearInterval(interval);
    }, [deadlineEnabled, registrationDeadline]);

    const fetchDashboardData = async () => {
        try {
            setIsLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            const { data: profile } = await supabase
                .from('users')
                .select(`*, groups(*, shifts(*))`)
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserName(profile.full_name || 'Đăng Rice');
                setUserStatus(profile.status || 'active');


                // Set default group info first based on user profile
                let currentGroupInfo: GroupInfo = {
                    id: profile.group_id || 'default',
                    name: '-',
                    department: profile.department || 'Chưa cập nhật',
                    table_area: '-',
                };

                // ⚠️ AUDIT-FIX: Declare BEFORE if block — used later for default status
                let currentRegMode: 'opt_out' | 'opt_in' = 'opt_out';

                // If user belongs to a group, fetch group details including shift
                if (profile.groups) {
                    const groupData = Array.isArray(profile.groups) ? profile.groups[0] : profile.groups;
                    if (groupData) {
                        currentGroupInfo = {
                            ...currentGroupInfo,
                            id: groupData.id,
                            name: groupData.name,
                            table_area: groupData.table_area || 'Khu vực chung',
                        };
                        // ⚠️ AUDIT-GUARD: Set registration mode from group
                        if (groupData.registration_mode === 'opt_in') {
                            currentRegMode = 'opt_in';
                            setRegistrationMode('opt_in');
                        }

                        // Use shift from group's assigned shift (groups → shifts relationship)
                        const shiftData = groupData.shifts;
                        if (shiftData) {
                            const shift = Array.isArray(shiftData) ? shiftData[0] : shiftData;
                            if (shift) {
                                currentGroupInfo.shift = {
                                    name: shift.name || '-',
                                    start_time: shift.start_time || '12:00',
                                    end_time: shift.end_time || '13:00',
                                };
                            }
                        }
                    }
                }

                setGroupInfo(currentGroupInfo);


                const today = toLocalDateString(new Date());
                const { data: orderData } = await supabase
                    .from('orders')
                    .select('status')
                    .eq('user_id', profile.id)
                    .eq('date', today)
                    .single();

                // ⚠️ AUDIT-FIX: Use default_meal_status from user profile
                const defaultStatus = getDefaultMealStatus(profile);
                setOrderStatus(orderData?.status || defaultStatus);

                if (profile.group_id) {
                    // First, get total count of members in group
                    const { count } = await supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                        .eq('group_id', profile.group_id)
                        .eq('status', 'active');

                    setTotalGroupMembers(count || 0);

                    // Then fetch first page of members (0-3 = first 4)
                    const { data: members } = await supabase
                        .from('users')
                        .select('id, full_name, email, role')
                        .eq('group_id', profile.group_id)
                        .eq('status', 'active')
                        .range(0, MEMBERS_PER_PAGE - 1);

                    if (members) {
                        // Don't fetch individual order status - RLS prevents employees from seeing others' orders
                        // This is a security feature, not a bug
                        setGroupMembers(members as GroupMember[]);
                    }
                }

                const { data: announcementsData } = await supabase
                    .from('announcements')
                    .select('id, content')
                    .eq('active', true)
                    .order('created_at', { ascending: false })
                    .limit(5);
                setAnnouncements(announcementsData || []);

                // Fetch cooking days setting
                const cookingResponse = await fetch('/api/admin/settings/cooking-days');
                let cookingDays = { start_day: 1, end_day: 5 };
                if (cookingResponse.ok) {
                    const cookingResult = await cookingResponse.json();
                    cookingDays = cookingResult.data;
                }
                setCookingDaysSetting(cookingDays);

                // Store user ID and start_date for month filter
                setCurrentUserId(profile.id);
                setCurrentTenantId(profile.tenant_id);
                setUserStartDate(profile.start_date || null);

                // ⚠️ AUDIT-FIX: Calculate monthly eating days with start_date filter
                await fetchMonthlyEatingDays(profile.id, cookingDays, new Date().getMonth(), new Date().getFullYear(), profile.start_date || null);

                // Fetch meal price for stats popup
                const { data: aiConfigData } = await supabase
                    .from('tenant_ai_config')
                    .select('meal_price')
                    .eq('tenant_id', profile.tenant_id)
                    .single();
                if (aiConfigData?.meal_price) setMealPrice(aiConfigData.meal_price);

                // Fetch deadline, offset, and enabled status
                const { data: settingsData } = await supabase
                    .from('system_settings')
                    .select('key, value')
                    .in('key', ['registration_deadline', 'registration_deadline_offset', 'registration_deadline_enabled', 'allow_late_registration']);

                if (settingsData) {
                    const time = settingsData.find(s => s.key === 'registration_deadline')?.value;
                    const offset = settingsData.find(s => s.key === 'registration_deadline_offset')?.value;
                    const enabled = settingsData.find(s => s.key === 'registration_deadline_enabled')?.value;
                    const allowLate = settingsData.find(s => s.key === 'allow_late_registration')?.value;
                    if (time) setRegistrationDeadline(time);
                    if (offset) setDeadlineOffset(parseInt(offset));
                    setDeadlineEnabled(enabled === 'true');
                    setAllowLateRegistration(allowLate !== 'false'); // default true
                }

                // ⚠️ AUDIT-GUARD: Check giờ VN real-time vs auto_reset_time
                // Không phụ thuộc cron — dashboard tự switch khi đến giờ
                const { data: resetSettings } = await supabase
                    .from('system_settings')
                    .select('key, value')
                    .eq('tenant_id', profile.tenant_id)
                    .in('key', ['auto_reset_time', 'auto_reset_enabled']);

                const autoResetTime = resetSettings?.find(s => s.key === 'auto_reset_time')?.value || '13:30';
                const autoResetEnabled = resetSettings?.find(s => s.key === 'auto_reset_enabled')?.value === 'true';

                // ⚠️ AUDIT-GUARD: Dùng getVietnamDateString — đúng VN timezone kể cả browser sai TZ
                const todayForReset = getVietnamDateString(new Date());
                const now = new Date();
                const resetDateTime = new Date(todayForReset + 'T' + autoResetTime + ':00+07:00');
                const isPastResetTime = autoResetEnabled && now.getTime() >= resetDateTime.getTime();

                if (isPastResetTime) {
                    setIsAfterReset(true);

                    // ⚠️ AUDIT-GUARD: Lazy cron — fire-and-forget
                    // Nếu orders ngày mai chưa tạo → API tạo. Đã tạo → skip ngay.
                    fetch('/api/v1/orders/ensure-tomorrow', { method: 'POST' })
                        .catch(err => console.warn('[ensure-tomorrow] Fire-and-forget failed:', err));
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const tomorrowStr = toLocalDateString(tomorrow);
                    setTomorrowDateStr(tomorrowStr);
                    const tomorrowDayIndex = tomorrow.getDay();

                    // Check if tomorrow is a cooking day
                    let tomorrowCooks = false;
                    if (cookingDays.start_day <= cookingDays.end_day) {
                        tomorrowCooks = tomorrowDayIndex >= cookingDays.start_day && tomorrowDayIndex <= cookingDays.end_day;
                    } else {
                        tomorrowCooks = tomorrowDayIndex >= cookingDays.start_day || tomorrowDayIndex <= cookingDays.end_day;
                    }

                    // Check cooking exceptions for tomorrow
                    const { data: tomorrowException } = await supabase
                        .from('cooking_exceptions')
                        .select('type')
                        .eq('tenant_id', profile.tenant_id)
                        .eq('date', tomorrowStr)
                        .single();

                    if (tomorrowException?.type === 'no_cook') tomorrowCooks = false;
                    if (tomorrowException?.type === 'extra_cook') tomorrowCooks = true;

                    setIsTomorrowCookingDay(tomorrowCooks);

                    if (tomorrowCooks) {
                        // Switch target to tomorrow
                        setTargetDate(tomorrowStr);

                        // Fetch tomorrow's order for this user
                        const { data: tomorrowOrder } = await supabase
                            .from('orders')
                            .select('status')
                            .eq('user_id', profile.id)
                            .eq('date', tomorrowStr)
                            .single();

                        const tomorrowDefault = getDefaultMealStatus(profile);
                        setOrderStatus(tomorrowOrder?.status || tomorrowDefault);
                    }
                    // If !tomorrowCooks → keep today's status, button will be locked
                } else {
                    setTargetDate(todayForReset);
                    setIsAfterReset(false);
                }
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Hàm tính số ngày ăn theo logic "implicit eating":
    // Ngày ăn = Tổng cooking days trong tháng - Số ngày báo nghỉ (not_eating)
    const fetchMonthlyEatingDays = async (
        userId: string,
        cookingDays: { start_day: number; end_day: number },
        month: number, // 0-11
        year: number,
        startDate?: string | null  // ⚠️ AUDIT-FIX: start_date của NV
    ) => {
        try {
            const startOfMonth = toLocalDateString(new Date(year, month, 1));
            const endOfMonth = toLocalDateString(new Date(year, month + 1, 0));

            // Count cooking days in this month
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            let cookingDaysCount = 0;
            const today = new Date();
            today.setHours(23, 59, 59, 999); // Include today

            // ⚠️ AUDIT-FIX: Nếu NV có start_date, chỉ đếm cooking days từ start_date trở đi
            let effectiveFirstDay = new Date(firstDay);
            if (startDate) {
                const sd = new Date(startDate + 'T00:00:00');
                if (sd > effectiveFirstDay) {
                    effectiveFirstDay = sd;
                }
            }

            // ⚠️ AUDIT-FIX: Fetch cooking_exceptions for this month
            const { data: exceptions } = await supabase
                .from('cooking_exceptions')
                .select('date, type')
                .gte('date', startOfMonth)
                .lte('date', endOfMonth);

            const exceptionMap = new Map<string, string>();
            exceptions?.forEach((ex: { date: string; type: string }) => exceptionMap.set(ex.date, ex.type));

            for (let d = new Date(effectiveFirstDay); d <= lastDay && d <= today; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                let isCookingDay = false;
                if (cookingDays.start_day <= cookingDays.end_day) {
                    isCookingDay = dayOfWeek >= cookingDays.start_day && dayOfWeek <= cookingDays.end_day;
                } else {
                    isCookingDay = dayOfWeek >= cookingDays.start_day || dayOfWeek <= cookingDays.end_day;
                }

                // Check exceptions (admin đăng ký không nấu / nấu thêm)
                const dateStr = toLocalDateString(d);
                const ex = exceptionMap.get(dateStr);
                if (ex === 'no_cook') isCookingDay = false;
                else if (ex === 'extra_cook') isCookingDay = true;

                if (isCookingDay) cookingDaysCount++;
            }

            // ⚠️ AUDIT-FIX: Count days user reported NOT eating (chỉ từ start_date trở đi)
            const effectiveStartDate = startDate && startDate > startOfMonth ? startDate : startOfMonth;
            const { data: notEatingOrders, error } = await supabase
                .from('orders')
                .select('date')
                .eq('user_id', userId)
                .eq('status', 'not_eating')
                .gte('date', effectiveStartDate)
                .lte('date', endOfMonth);

            if (error) {
                console.error('Error fetching not_eating orders:', error);
                setMonthlyEatingDays(cookingDaysCount);
                return;
            }

            const notEatingCount = notEatingOrders?.length || 0;
            const eatingDays = Math.max(0, cookingDaysCount - notEatingCount);
            setMonthlyEatingDays(eatingDays);
            setMonthlyNotEatingDays(notEatingCount);
            setTotalCookingDays(cookingDaysCount);
            setNotEatingDates((notEatingOrders || []).map((o: { date: string }) => o.date).sort());
        } catch (error) {
            console.error('Error calculating monthly eating days:', error);
        }
    };

    // Handle month filter change
    const handleMonthChange = async (month: number, year: number) => {
        setSelectedMonth(month);
        setSelectedYear(year);
        if (currentUserId) {
            await fetchMonthlyEatingDays(currentUserId, cookingDaysSetting, month, year, userStartDate);
        }
    };

    const handleSliderClick = async () => {
        // Block paused/resigned users
        if (userStatus !== 'active') {
            showToast(
                '⚠️ Tài khoản đang tạm dừng. Liên hệ admin để kích hoạt lại.',
                '🚫',
                5000
            );
            return;
        }

        // ⚠️ AUDIT-GUARD: Sau cron reset + ngày mai không nấu → khóa hẳn
        if (isAfterReset && !isTomorrowCookingDay) {
            showToast(
                '🚫 Ngày mai không nấu ăn. Không thể đăng ký.',
                '📅',
                4000
            );
            return;
        }

        // Sau cron reset + ngày mai có nấu → toggle cho ngày mai (không cần lý do muộn)
        if (isAfterReset && isTomorrowCookingDay) {
            try {
                const res = await fetch('/api/v1/orders/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: targetDate })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Không thể cập nhật');

                setOrderStatus(data.status);
                const tomorrowLabel = tomorrowDateStr.split('-').reverse().join('/');
                showToast(
                    `📅 Đã ${data.status === 'eating' ? 'đăng ký ăn' : 'hủy suất ăn'} cho ngày ${tomorrowLabel}!`,
                    data.status === 'eating' ? '🍚' : '❌',
                    3000
                );
                fetchDashboardData();
            } catch (error: any) {
                console.error('[Toggle Tomorrow] Error:', error);
                showToast('❌ ' + (error.message || 'Không thể cập nhật!'), '⚠️', 4000);
            }
            return;
        }

        // Nếu quá deadline:
        if (deadlineEnabled && isPastDeadline) {
            // ⭐ v5.9.0: Kiểm tra allowLateRegistration
            if (!allowLateRegistration) {
                // Admin TẮT late → chặn hoàn toàn
                showToast(
                    `🔒 Đã quá hạn chót (${registrationDeadline}). Chức năng đăng ký muộn đã bị tắt.`,
                    '🚫',
                    5000
                );
                return;
            }
            // Admin BẬT late → mở modal nhập lý do
            setShowLateModal(true);
            return;
        }

        // Trước deadline → gọi API toggle bình thường
        try {
            const res = await fetch('/api/v1/orders/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: targetDate })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.code === 'ERR_DEADLINE_PASSED') {
                    setIsPastDeadline(true);
                    if (allowLateRegistration) {
                        setShowLateModal(true);
                    } else {
                        showToast(`🔒 ${data.error}`, '🚫', 5000);
                    }
                    return;
                }
                if (data.code === 'ERR_LATE_DISABLED') {
                    setIsPastDeadline(true);
                    showToast(`🔒 ${data.error}`, '🚫', 5000);
                    return;
                }
                throw new Error(data.error || 'Không thể cập nhật');
            }

            setOrderStatus(data.status);
            showToast(
                `✅ Đã ${data.status === 'eating' ? 'đăng ký ăn' : 'hủy suất ăn'}!`,
                data.status === 'eating' ? '🍚' : '❌',
                3000
            );
            fetchDashboardData();
        } catch (error: any) {
            console.error('[DailyToggle] Error:', error);
            showToast('❌ ' + (error.message || 'Không thể cập nhật!'), '⚠️', 4000);
        }
    };

    // Handle late registration/cancellation with reason
    const handleLateSubmit = async (reason: string) => {
        const res = await fetch('/api/v1/orders/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: targetDate, reason })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Không thể cập nhật');
        }

        setOrderStatus(data.status);
        showToast(
            `⚡ Đã ${data.status === 'eating' ? 'đăng ký ăn' : 'hủy suất ăn'} muộn!`,
            data.status === 'eating' ? '🍚' : '❌',
            3000
        );
        fetchDashboardData();
    };

    const formatTime = (time: string) => time?.substring(0, 5) || '';

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const loadMemberPage = async (page: number) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('users')
                .select('group_id')
                .eq('id', user.id)
                .single();

            if (!profile?.group_id) return;

            const from = (page - 1) * MEMBERS_PER_PAGE;
            const to = from + MEMBERS_PER_PAGE - 1;

            const { data: members } = await supabase
                .from('users')
                .select('id, full_name, email, role')
                .eq('group_id', profile.group_id)
                .eq('status', 'active')
                .range(from, to);

            if (members) {
                // Don't fetch individual order status - RLS prevents employees from seeing others' orders
                setGroupMembers(members as GroupMember[]);
                setMemberPage(page);
            }
        } catch (error) {
            console.error('Error loading member page:', error);
        }
    };

    const getStatusIcon = (status: string | null | undefined) => {
        if (status === 'eating') return <Icon name="check_circle" className="text-green-500 text-[20px]" />;
        if (status === 'not_eating') return <Icon name="cancel" className="text-red-400 text-[20px]" />;
        return <Icon name="radio_button_unchecked" className="text-slate-300 text-[20px]" />;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#FFFBF7] dark:bg-[#12100E] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#B24700] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Đang tải...</p>
                </div>
            </div>
        );
    }

    // If showing calendar view, render calendar component
    if (showCalendar) {
        if (!isEnabled('bulk_registration')) {
            return (
                <div className="min-h-screen bg-[#FFFBF7] dark:bg-[#12100E] flex items-center justify-center p-4">
                    <div className="text-center bg-white dark:bg-[#1E1A17] rounded-3xl p-8 shadow-lg max-w-md">
                        <div className="text-5xl mb-4">🔒</div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Tính năng chưa được bật</h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">Đăng ký hàng loạt chưa khả dụng cho gói dịch vụ hiện tại. Liên hệ admin để nâng cấp.</p>
                        <button onClick={() => setShowCalendar(false)} className="px-6 py-2 bg-[#B24700] text-white rounded-xl font-semibold hover:bg-[#8a3700] transition-colors">Quay lại</button>
                    </div>
                </div>
            );
        }
        return <BulkRegistrationCalendar onClose={() => setShowCalendar(false)} />;
    }

    return (
        <div className={`min-h-screen bg-[#FFFBF7] dark:bg-[#12100E] text-slate-900 dark:text-slate-100 ${isDarkMode ? 'dark' : ''}`}>
            {/* Header - Hide khi được render bởi Admin Dashboard */}
            {!hideHeader && (
                <DashboardHeader userName={userName} userRole="employee" />
            )}


            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
                {/* Push Notification Prompt */}
                <PushNotificationPrompt />

                {/* Announcement Marquee */}
                {announcements.length > 0 && (
                    <div className="mb-6 md:mb-8 overflow-hidden rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-[#B24700]/20 flex items-center shadow-sm">
                        <div className="bg-[#B24700] px-3 md:px-4 py-2.5 md:py-3 text-white flex items-center gap-1.5 md:gap-2 z-10 shadow-lg">
                            <Icon name="campaign" className="text-[18px] md:text-[20px]" />
                            <span className="font-extrabold whitespace-nowrap text-xs md:text-sm uppercase tracking-wider">Thông Báo</span>
                        </div>
                        <div className="flex-1 overflow-hidden relative h-full flex items-center">
                            <p className="animate-marquee text-[#8F3900] dark:text-orange-300 font-bold text-xs md:text-sm px-3 md:px-4">
                                {announcements.map((a, i) => `${a.content}${i < announcements.length - 1 ? ' | ' : ''}`).join('')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Registration mode banner — hiển thị cho tất cả NV active */}
                {userStatus === 'active' && (
                    <div className={`mb-4 md:mb-6 flex items-center gap-3 p-3 md:p-4 rounded-2xl ${registrationMode === 'opt_in'
                        ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                        : 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700'
                        }`}>
                        <span className="text-2xl">{registrationMode === 'opt_in' ? '🔵' : '🟢'}</span>
                        <div>
                            <p className={`font-bold text-sm md:text-base ${registrationMode === 'opt_in'
                                ? 'text-blue-800 dark:text-blue-200'
                                : 'text-emerald-800 dark:text-emerald-200'
                                }`}>
                                {registrationMode === 'opt_in' ? 'Nhóm tự đăng ký ăn' : 'Nhóm Auto đăng ký ăn'}
                            </p>
                            <p className={`text-xs md:text-sm ${registrationMode === 'opt_in'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                {registrationMode === 'opt_in'
                                    ? 'Bạn đang trong nhóm tự đăng ký ăn, bạn phải tự bấm nút để đăng ký ăn hoặc hủy ăn — có thể dùng lịch để đăng ký trước.'
                                    : 'Bạn đang trong nhóm Auto đăng ký ăn, sẽ tự đăng ký theo giờ của admin đặt.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Welcome */}
                <div className="mb-4 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1 md:mb-2">
                            <h1 className="text-xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">Chào buổi trưa!</h1>
                            <NotificationInbox tenantId={currentTenantId} userId={currentUserId} />
                            <PushStatusIndicator />
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 text-sm md:text-lg font-medium mb-2 md:mb-4">
                            {userStatus === 'paused' ? (
                                <span className="font-bold text-amber-600">⏸️ Tài khoản tạm dừng — không thể đăng ký suất ăn</span>
                            ) : (
                                <>Trạng thái: <span className={`font-bold ${orderStatus === 'eating' ? 'text-green-600' : 'text-[#D12B37]'}`}>
                                    {orderStatus === 'eating'
                                        ? 'Đã đăng ký ăn'
                                        : registrationMode === 'opt_in' ? 'Chưa đăng ký ăn' : 'Đã báo nghỉ'}
                                </span></>
                            )}
                        </p>
                    </div>

                    {/* Calendar Toggle Button — hidden for paused users */}
                    {userStatus === 'active' && (
                        <button
                            onClick={() => setShowCalendar(true)}
                            className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-[#B24700] hover:bg-[#8F3900] text-white rounded-xl md:rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl transition-all w-full md:w-auto justify-center"
                        >
                            <Icon name="calendar_month" className="text-[18px] md:text-[20px]" />
                            Đăng ký theo lịch
                        </button>
                    )}
                </div>

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-10">
                    {/* Main Status Card - Giao diện VIP Pass sang trọng */}
                    <div className={`md:col-span-1 bg-gradient-to-br from-[#23170f] via-[#1a0f08] to-[#120a05] rounded-3xl p-5 md:p-6 text-white flex flex-col justify-between items-center text-center shadow-lg border border-[#b24700]/30 hover:border-[#b24700]/60 transition-all duration-300 min-h-[220px] md:min-h-[320px] relative overflow-hidden group`}>
                        {/* Họa tiết trang trí dạng chìm */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#b24700]/40 to-transparent"></div>
                        <div className="absolute -top-12 -left-12 w-28 h-28 bg-[#b24700]/5 rounded-full blur-2xl group-hover:bg-[#b24700]/10 transition-all duration-500"></div>
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#b24700]/5 rounded-full blur-2xl"></div>

                        {/* Thẻ VIP Pass Header */}
                        <div className="z-10 w-full flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b24700] drop-shadow-sm">
                                {isAfterReset ? 'SUẤT ĂN NGÀY MAI' : 'SUẤT ĂN HÔM NAY'}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-[#b24700]/10 border border-[#b24700]/30 text-[#b24700] rounded-full uppercase tracking-wider scale-90">
                                VIP Pass
                            </span>
                        </div>

                        {/* Status Content */}
                        <div className="z-10 my-auto flex flex-col items-center">
                            {/* Icon chỉ báo trạng thái chính */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-transform duration-500 group-hover:scale-110 ${isAfterReset && !isTomorrowCookingDay ? 'bg-slate-700/55' : orderStatus === 'eating' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                <Icon name={isAfterReset && !isTomorrowCookingDay ? 'event_busy' : orderStatus === 'eating' ? 'restaurant' : 'block_flipped'} className="text-[26px]" />
                            </div>

                            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white drop-shadow-md">
                                {isAfterReset && !isTomorrowCookingDay
                                    ? 'Mai không nấu ăn'
                                    : orderStatus === 'eating'
                                        ? 'Đăng ký ăn'
                                        : registrationMode === 'opt_in' ? 'Chưa đăng ký' : 'Báo nghỉ'}
                            </h2>
                            
                            {/* Date Badge */}
                            <div className="mt-2.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] md:text-xs font-semibold text-slate-300">
                                    {isAfterReset ? (
                                        <>
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                            {`Ngày ${tomorrowDateStr.split('-').reverse().join('/')}`}
                                        </>
                                    ) : (
                                        <>
                                            <span className={`w-1.5 h-1.5 rounded-full ${orderStatus === 'eating' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                            {`Hôm nay (${targetDate.split('-').reverse().join('/')})`}
                                        </>
                                    )}
                                </span>
                            </div>

                            {/* Countdown / Status badge */}
                            {!isAfterReset && deadlineEnabled && (
                                <div className="mt-2">
                                    {isPastDeadline ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                            {allowLateRegistration ? '🔒 Quá hạn (bấm gửi muộn)' : '🔒 Đã đóng đăng ký'}
                                        </span>
                                    ) : countdownText ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-orange-400 font-semibold animate-pulse">
                                            {countdownText}
                                        </span>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        {/* Button Action */}
                        <div className="w-full relative z-10 mt-4">
                            <button
                                onClick={handleSliderClick}
                                disabled={(isAfterReset && !isTomorrowCookingDay) || (!isAfterReset && isPastDeadline && deadlineEnabled && !allowLateRegistration)}
                                className={`w-full py-3 px-4 rounded-full flex items-center justify-center gap-2 border transition-all duration-300 cursor-pointer text-xs font-extrabold uppercase tracking-widest active:scale-95 ${isAfterReset && !isTomorrowCookingDay
                                    ? 'bg-white/5 border-white/5 text-slate-500 cursor-not-allowed opacity-40'
                                    : (!isAfterReset && isPastDeadline && deadlineEnabled && !allowLateRegistration)
                                        ? 'bg-red-950/20 border-red-900/30 text-rose-400/50 cursor-not-allowed opacity-50'
                                        : isAfterReset
                                            ? 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-300'
                                            : isPastDeadline && deadlineEnabled
                                                ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                                                : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
                                    }`}
                            >
                                <Icon name={
                                    isAfterReset && !isTomorrowCookingDay ? 'lock'
                                        : isAfterReset ? 'event_available'
                                            : isPastDeadline && deadlineEnabled ? 'schedule_send' : 'swap_horiz'
                                } className="text-[18px]" />
                                <span>
                                    {isAfterReset && !isTomorrowCookingDay
                                        ? 'ĐÃ KHÓA'
                                        : isAfterReset
                                            ? (orderStatus === 'eating' ? 'Hủy ăn ngày mai' : 'Đăng ký ngày mai')
                                            : isPastDeadline && deadlineEnabled
                                                ? (allowLateRegistration
                                                    ? (orderStatus === 'eating' ? 'Yêu cầu hủy muộn' : 'Yêu cầu ăn muộn')
                                                    : 'ĐÃ KHÓA')
                                                : (orderStatus === 'eating' ? 'Bấm để hủy suất' : 'Bấm để đăng ký')}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Info Cards - Glassmorphism, Căn đối bố cục */}
                    <div className="col-span-1 md:col-span-3 grid grid-cols-3 gap-3 md:gap-6">
                        {/* CẬP NHẬT CARD */}
                        <div className="bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-3 md:p-6 flex flex-col items-center justify-center text-center border border-orange-100/50 dark:border-white/5 luxury-hover-card group">
                            <div className="w-10 h-10 md:w-14 md:h-14 bg-orange-50 dark:bg-[#b24700]/10 rounded-2xl flex items-center justify-center mb-2.5 md:mb-4 group-hover:scale-105 transition-transform duration-300">
                                <Icon name="restaurant_menu" className="text-[20px] md:text-[26px]" style={{ color: '#b24700' }} />
                            </div>
                            <h3 className="text-[9px] md:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">TRẠNG THÁI</h3>
                            <p className="text-xs md:text-lg font-extrabold text-slate-800 dark:text-slate-100">
                                {orderStatus === 'eating' ? 'Ăn trưa' : 'Nghỉ ăn'}
                            </p>
                        </div>

                        {/* HẠN ĐĂNG KÝ CARD */}
                        <div className="bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-3 md:p-6 flex flex-col items-center justify-center text-center border border-orange-100/50 dark:border-white/5 luxury-hover-card group">
                            <div className="w-10 h-10 md:w-14 md:h-14 bg-orange-50 dark:bg-[#b24700]/10 rounded-2xl flex items-center justify-center mb-2.5 md:mb-4 group-hover:scale-105 transition-transform duration-300">
                                <Icon name="hourglass_top" className="text-[20px] md:text-[26px]" style={{ color: '#b24700' }} />
                            </div>
                            <h3 className="text-[9px] md:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">HẠN ĐĂNG KÝ</h3>
                            <div className="text-xs md:text-lg font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
                                <div>{registrationDeadline}</div>
                                <span className="text-[9px] md:text-[10px] font-bold text-slate-400 block mt-0.5">
                                    {(() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() + deadlineOffset);
                                        return `Ngày ${d.getDate()}/${d.getMonth() + 1}`;
                                    })()}
                                </span>
                            </div>
                        </div>

                        {/* THỐNG KÊ THÁNG CARD */}
                        <div
                            onClick={() => setShowStatsPopup(true)}
                            className="bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-3 md:p-6 flex flex-col items-center justify-center text-center border border-orange-100/50 dark:border-white/5 luxury-hover-card group cursor-pointer"
                        >
                            <div className="w-10 h-10 md:w-14 md:h-14 bg-orange-50 dark:bg-[#b24700]/10 rounded-2xl flex items-center justify-center mb-2 md:mb-3 group-hover:scale-105 transition-transform duration-300">
                                <Icon name="query_stats" className="text-[20px] md:text-[26px]" style={{ color: '#b24700' }} />
                            </div>
                            
                            {/* Bộ điều hướng tháng */}
                            <div className="flex items-center gap-1 mb-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
                                        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
                                        handleMonthChange(prevMonth, prevYear);
                                    }}
                                    className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded-full hover:bg-orange-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    <Icon name="chevron_left" className="text-[12px] md:text-[14px] text-slate-400" />
                                </button>
                                <h3 className="text-[9px] md:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    Tháng {selectedMonth + 1}
                                </h3>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const now = new Date();
                                        if (selectedMonth === now.getMonth() && selectedYear === now.getFullYear()) return;
                                        const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
                                        const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                                        handleMonthChange(nextMonth, nextYear);
                                    }}
                                    className={`w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded-full hover:bg-orange-100 dark:hover:bg-white/10 transition-colors ${selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear()
                                        ? 'opacity-30 pointer-events-none' : ''
                                        }`}
                                >
                                    <Icon name="chevron_right" className="text-[12px] md:text-[14px] text-slate-400" />
                                </button>
                            </div>

                            {/* Ăn / Nghỉ stats */}
                            <div className="flex items-center gap-1.5 md:gap-3 mt-0.5">
                                <div className="flex items-center gap-0.5 md:gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    <span className="text-xs md:text-base font-extrabold text-emerald-600 dark:text-emerald-400">{monthlyEatingDays}</span>
                                </div>
                                <span className="text-slate-200 dark:text-slate-800">/</span>
                                <div className="flex items-center gap-0.5 md:gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    <span className="text-xs md:text-base font-extrabold text-rose-500 dark:text-rose-400">{monthlyNotEatingDays}</span>
                                </div>
                            </div>
                            <p className="text-[8px] md:text-[10px] text-slate-400 font-bold mt-1">bấm xem chi tiết</p>
                        </div>
                    </div>
                </div>

                {/* Group Schedule */}
                {
                    groupInfo && (
                        <div className="mb-10 animate-fade-in-up">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2 bg-[#B24700] rounded-xl text-white shadow-md">
                                    <Icon name="groups" className="block text-[20px]" />
                                </div>
                                <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">Lịch ăn theo nhóm</h2>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
                                {/* Group Info Card */}
                                <div className="lg:col-span-1 bg-white/75 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-orange-100/50 dark:border-white/5 relative overflow-hidden flex flex-col justify-between">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                        <Icon name="badge" className="text-[140px]" />
                                    </div>

                                    <div className="relative z-10 w-full">
                                        <div className="mb-6">
                                            <p className="text-[10px] font-black text-[#B24700] uppercase tracking-widest mb-1.5">Thông tin định danh</p>
                                            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">Nhóm: {groupInfo.name}</h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">{groupInfo.department}</p>
                                        </div>

                                        <div className="space-y-3.5">
                                            {groupInfo.shift && (
                                                <div className="flex items-center gap-3.5 bg-orange-50/60 dark:bg-[#B24700]/10 p-3.5 rounded-2xl border border-[#B24700]/10">
                                                    <div className="w-10 h-10 rounded-xl bg-[#B24700] text-white flex items-center justify-center shadow-sm">
                                                        <Icon name="schedule" className="text-[20px]" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-bold text-[#B24700]/80 uppercase tracking-wider">Ca ăn của bạn</p>
                                                        <p className="text-base font-black text-[#B24700]">
                                                            {formatTime(groupInfo.shift.start_time)} - {formatTime(groupInfo.shift.end_time)}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3.5 bg-slate-50/50 dark:bg-white/5 p-3.5 rounded-2xl border border-slate-100 dark:border-white/5">
                                                <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center">
                                                    <Icon name="location_on" className="text-[20px]" />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Khu vực bàn</p>
                                                    <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">{groupInfo.table_area}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Group Members Card */}
                                <div className="lg:col-span-2 bg-white/75 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-orange-100/50 dark:border-white/5 flex flex-col">
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">Thành viên nhóm ({totalGroupMembers})</h3>

                                        {/* Pagination Controls */}
                                        {totalGroupMembers > MEMBERS_PER_PAGE && (
                                            <div className="flex items-center gap-1 bg-orange-50/30 dark:bg-white/5 p-1 rounded-full border border-orange-100/30 dark:border-white/5">
                                                <button
                                                    onClick={() => loadMemberPage(memberPage - 1)}
                                                    disabled={memberPage === 1}
                                                    className="w-8 h-8 rounded-full hover:bg-orange-100/50 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
                                                    aria-label="Trang trước"
                                                >
                                                    <Icon name="chevron_left" className="text-[#B24700] text-[18px]" />
                                                </button>
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 min-w-[70px] text-center">
                                                    Trang {memberPage}/{Math.ceil(totalGroupMembers / MEMBERS_PER_PAGE)}
                                                </span>
                                                <button
                                                    onClick={() => loadMemberPage(memberPage + 1)}
                                                    disabled={memberPage >= Math.ceil(totalGroupMembers / MEMBERS_PER_PAGE)}
                                                    className="w-8 h-8 rounded-full hover:bg-orange-100/50 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
                                                    aria-label="Trang sau"
                                                >
                                                    <Icon name="chevron_right" className="text-[#B24700] text-[18px]" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                                        {groupMembers.map((member) => (
                                            <div key={member.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/40 dark:bg-white/[0.02] border border-orange-100/20 dark:border-white/5 hover:border-[#B24700]/25 transition-all duration-300 hover:translate-x-1.5 hover:bg-orange-50/30 dark:hover:bg-[#B24700]/5 group">
                                                <div className="w-10 h-10 rounded-full bg-[#B24700]/10 border border-[#B24700]/20 flex items-center justify-center shadow-inner">
                                                    <span className="text-xs font-bold text-[#B24700]">
                                                        {member.full_name.substring(0, 2).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{member.full_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">{member.role}</p>
                                                </div>
                                                <div className="shrink-0 flex items-center justify-center">
                                                    {getStatusIcon(member.order_status)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Instructions - Hướng dẫn sử dụng */}
                <div className="bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-6 md:p-8 shadow-sm border border-orange-100/50 dark:border-white/5 animate-fade-in-up">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Icon name="info" className="text-[#B24700] text-[20px]" />
                        <span>Hướng dẫn sử dụng</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex gap-3 items-start">
                            <div className="w-10 h-10 shrink-0 bg-orange-50 dark:bg-[#B24700]/10 rounded-2xl flex items-center justify-center text-[#B24700] shadow-sm border border-orange-100/30 dark:border-white/5">
                                <Icon name="touch_app" className="font-bold text-[20px]" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1">Đăng ký / Báo nghỉ</h4>
                                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                                    Bấm nút tại thẻ "Trạng thái" để đăng ký hoặc báo nghỉ suất ăn trong ngày.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 items-start">
                            <div className="w-10 h-10 shrink-0 bg-orange-50 dark:bg-[#B24700]/10 rounded-2xl flex items-center justify-center text-[#B24700] shadow-sm border border-orange-100/30 dark:border-white/5">
                                <Icon name="timer" className="font-bold text-[20px]" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1">Theo dõi hạn chót</h4>
                                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                                    Quan sát Deadline trên màn hình để không bỏ lỡ thời gian đăng ký hoặc hủy suất.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 items-start">
                            <div className="w-10 h-10 shrink-0 bg-orange-50 dark:bg-[#B24700]/10 rounded-2xl flex items-center justify-center text-[#B24700] shadow-sm border border-orange-100/30 dark:border-white/5">
                                <Icon name="restaurant_menu" className="font-bold text-[20px]" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1">Kiểm tra ca ăn</h4>
                                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                                    Xem lịch ăn nhóm và ca ăn của bạn để phân phối thời gian hợp lý khi dùng bữa.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main >

            {/* Footer */}
            <footer className="mt-auto py-6 md:py-12 text-center border-t border-orange-100 dark:border-white/5 bg-white/50 dark:bg-black/20">
                <p className="text-slate-500 dark:text-slate-500 text-xs md:text-sm font-bold px-4">
                    Hệ thống Cơm Ngon - Quản lý suất ăn doanh nghiệp{' '}
                    <a className="text-[#B24700] font-black hover:underline underline-offset-4 ml-1" href="#">Chính sách bảo mật</a>
                </p>
            </footer>
            {/* Employee Monthly Stats Popup */}
            {showStatsPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowStatsPopup(false)}>
                    <div className="bg-white/95 dark:bg-[#1E1A17]/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border border-orange-200/50 dark:border-white/10" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="sticky top-0 bg-gradient-to-r from-[#B24700] to-[#D4610A] text-white p-5 rounded-t-3xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                        <Icon name="bar_chart" className="text-[24px]" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black">Thống kê tháng {selectedMonth + 1}/{selectedYear}</h2>
                                        <p className="text-white/70 text-xs font-medium">{userName}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowStatsPopup(false)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
                                    <Icon name="close" className="text-[18px]" />
                                </button>
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                {/* Ngày ăn */}
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 text-center border border-green-200/50 dark:border-green-700/30">
                                    <div className="w-10 h-10 bg-green-100 dark:bg-green-800/30 rounded-xl flex items-center justify-center mx-auto mb-2">
                                        <Icon name="restaurant" className="text-[22px] text-green-600" />
                                    </div>
                                    <p className="text-2xl font-black text-green-700 dark:text-green-400">{monthlyEatingDays}</p>
                                    <p className="text-[10px] font-bold text-green-600/70 dark:text-green-400/60 uppercase tracking-wider">Ngày ăn</p>
                                </div>
                                {/* Ngày nghỉ */}
                                <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center border border-red-200/50 dark:border-red-700/30">
                                    <div className="w-10 h-10 bg-red-100 dark:bg-red-800/30 rounded-xl flex items-center justify-center mx-auto mb-2">
                                        <Icon name="event_busy" className="text-[22px] text-red-500" />
                                    </div>
                                    <p className="text-2xl font-black text-red-600 dark:text-red-400">{monthlyNotEatingDays}</p>
                                    <p className="text-[10px] font-bold text-red-500/70 dark:text-red-400/60 uppercase tracking-wider">Ngày nghỉ</p>
                                </div>
                                {/* Chi phí */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-center border border-blue-200/50 dark:border-blue-700/30">
                                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800/30 rounded-xl flex items-center justify-center mx-auto mb-2">
                                        <Icon name="payments" className="text-[22px] text-blue-600" />
                                    </div>
                                    <p className="text-lg font-black text-blue-700 dark:text-blue-400">
                                        {mealPrice > 0 ? `${(monthlyEatingDays * mealPrice).toLocaleString('vi-VN')}` : '—'}
                                    </p>
                                    <p className="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/60 uppercase tracking-wider">
                                        {mealPrice > 0 ? `${mealPrice.toLocaleString('vi-VN')}đ/suất` : 'Chi phí'}
                                    </p>
                                </div>
                                {/* Tỷ lệ ăn */}
                                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-4 text-center border border-purple-200/50 dark:border-purple-700/30">
                                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-800/30 rounded-xl flex items-center justify-center mx-auto mb-2">
                                        <Icon name="percent" className="text-[22px] text-purple-600" />
                                    </div>
                                    <p className="text-2xl font-black text-purple-700 dark:text-purple-400">
                                        {totalCookingDays > 0 ? Math.round((monthlyEatingDays / totalCookingDays) * 100) : 0}%
                                    </p>
                                    <p className="text-[10px] font-bold text-purple-600/70 dark:text-purple-400/60 uppercase tracking-wider">Tỷ lệ ăn</p>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/30">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Tiến độ tháng</span>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-500">{monthlyEatingDays + monthlyNotEatingDays}/{totalCookingDays} ngày nấu</span>
                                </div>
                                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full flex">
                                        <div className="bg-green-500 transition-all duration-500" style={{ width: `${totalCookingDays > 0 ? (monthlyEatingDays / totalCookingDays) * 100 : 0}%` }}></div>
                                        <div className="bg-red-400 transition-all duration-500" style={{ width: `${totalCookingDays > 0 ? (monthlyNotEatingDays / totalCookingDays) * 100 : 0}%` }}></div>
                                    </div>
                                </div>
                                <div className="flex gap-4 mt-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Ăn ({monthlyEatingDays})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Nghỉ ({monthlyNotEatingDays})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Còn lại ({Math.max(0, totalCookingDays - monthlyEatingDays - monthlyNotEatingDays)})</span>
                                    </div>
                                </div>
                            </div>

                            {/* Danh sách ngày nghỉ */}
                            {notEatingDates.length > 0 && (
                                <div className="bg-red-50/50 dark:bg-red-900/10 rounded-2xl p-4 border border-red-200/30 dark:border-red-700/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Icon name="event_busy" className="text-[18px] text-red-500" />
                                        <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Ngày đã nghỉ ăn ({notEatingDates.length})</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                        {notEatingDates.map(date => {
                                            const d = new Date(date + 'T00:00:00');
                                            const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                                            return (
                                                <span key={date} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-700/30 shadow-sm">
                                                    <span className="text-red-400 dark:text-red-500 text-[10px]">{dayNames[d.getDay()]}</span>
                                                    {date.split('-').reverse().join('/')}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {notEatingDates.length === 0 && (
                                <div className="bg-green-50/50 dark:bg-green-900/10 rounded-2xl p-4 text-center border border-green-200/30 dark:border-green-700/20">
                                    <span className="text-3xl">🎉</span>
                                    <p className="text-sm font-bold text-green-700 dark:text-green-400 mt-1">Ăn đầy đủ!</p>
                                    <p className="text-xs text-green-600/60 dark:text-green-400/50">Bạn chưa nghỉ ăn ngày nào trong tháng này</p>
                                </div>
                            )}

                            {/* Tóm tắt chi phí */}
                            {mealPrice > 0 && (
                                <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-200/30 dark:border-amber-700/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon name="receipt_long" className="text-[18px] text-amber-600" />
                                        <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Chi phí suất ăn</h3>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-600 dark:text-slate-400">Đơn giá:</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{mealPrice.toLocaleString('vi-VN')} VNĐ</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-600 dark:text-slate-400">Số suất ăn:</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{monthlyEatingDays} suất</span>
                                        </div>
                                        <div className="border-t border-amber-200/50 dark:border-amber-700/30 pt-1.5 flex justify-between text-sm">
                                            <span className="font-bold text-amber-700 dark:text-amber-400">Tổng chi phí:</span>
                                            <span className="font-black text-amber-700 dark:text-amber-400">{(monthlyEatingDays * mealPrice).toLocaleString('vi-VN')} VNĐ</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-green-600 dark:text-green-400">Tiết kiệm (nghỉ ăn):</span>
                                            <span className="font-bold text-green-600 dark:text-green-400">-{(monthlyNotEatingDays * mealPrice).toLocaleString('vi-VN')} VNĐ</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Late Registration Modal */}
            <LateRegistrationModal
                isOpen={showLateModal}
                onClose={() => setShowLateModal(false)}
                onSubmit={handleLateSubmit}
                actionType={orderStatus === 'eating' ? 'not_eating' : 'eating'}
                deadline={registrationDeadline}
            />
        </div >
    );
}
