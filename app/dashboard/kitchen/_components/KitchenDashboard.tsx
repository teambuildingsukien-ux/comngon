'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { buildUserDefaultMap, getDefaultFromMap } from '@/lib/meal-helpers';
import { useToast } from '@/components/providers/toast-provider';
import DashboardHeader from '@/app/dashboard/_components/DashboardHeader';
import ForecastCards from '@/app/dashboard/_components/admin/ForecastCards';
import { toLocalDateString } from '@/lib/utils/date-helpers';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';
import NotificationInbox from '@/app/dashboard/_components/NotificationInbox';


const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Employee {
    id: string;
    full_name: string;
    email: string;
    role: string;
    department?: string;
    order_status?: 'eating' | 'not_eating' | null;
    order_time?: string;
}

interface DailyStats {
    total: number;
    eating: number;
    not_eating: number;
    pending: number;
}

interface GuestMeal {
    id: string;
    quantity: number;
    note: string;
    requester_name: string;
    created_at: string;
}

interface GroupStat {
    id: string;
    name: string;
    shift_time: string;
    table_area: string;
    employee_count: number;
}

interface KitchenDashboardProps {
    hideHeader?: boolean;
}

// === Cooking Calendar Widget ===
function CookingCalendar() {
    const supabase = createClient();
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear] = useState(new Date().getFullYear());
    const [cookingDays, setCookingDays] = useState({ start_day: 1, end_day: 5 });
    const [exceptions, setExceptions] = useState<Record<string, { type: string; reason?: string }>>({});
    const [calLoading, setCalLoading] = useState(true);

    useEffect(() => {
        fetchCalendarData();
    }, [calMonth, calYear]);

    const fetchCalendarData = async () => {
        setCalLoading(true);
        try {
            // Fetch cooking days settings
            const cdRes = await fetch('/api/admin/settings/cooking-days');
            if (cdRes.ok) {
                const cdResult = await cdRes.json();
                setCookingDays(cdResult.data);
            }

            // Fetch exceptions for this month
            const startDate = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
            const endDate = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${lastDay}`;

            const { data: exceptionsData } = await supabase
                .from('cooking_exceptions')
                .select('date, type, reason')
                .gte('date', startDate)
                .lte('date', endDate);

            const exMap: Record<string, { type: string; reason?: string }> = {};
            (exceptionsData || []).forEach((e: any) => {
                exMap[e.date] = { type: e.type, reason: e.reason };
            });
            setExceptions(exMap);
        } catch { /* ignore */ }
        setCalLoading(false);
    };

    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = toLocalDateString(today);

    const isInCookingRange = (dayIndex: number) => {
        if (cookingDays.start_day <= cookingDays.end_day) {
            return dayIndex >= cookingDays.start_day && dayIndex <= cookingDays.end_day;
        }
        return dayIndex >= cookingDays.start_day || dayIndex <= cookingDays.end_day;
    };

    const getDayStatus = (day: number) => {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayIndex = new Date(calYear, calMonth, day).getDay();
        const exception = exceptions[dateStr];

        if (exception?.type === 'no_cook') return 'no_cook';
        if (exception?.type === 'extra_cook') return 'extra_cook';
        if (isInCookingRange(dayIndex)) return 'cooking';
        return 'off';
    };

    const getDayReason = (day: number) => {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return exceptions[dateStr]?.reason;
    };

    const prevMonth = () => {
        if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
        else setCalMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
        else setCalMonth(m => m + 1);
    };

    if (calLoading) {
        return <div className="animate-pulse space-y-2">
            <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
            <div className="grid grid-cols-7 gap-1">{Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-7 bg-slate-50 dark:bg-slate-800/50 rounded"></div>
            ))}</div>
        </div>;
    }

    return (
        <div>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-2">
                <button onClick={prevMonth} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Icon name="chevron_left" className="text-base text-slate-500" />
                </button>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {monthNames[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Icon name="chevron_right" className="text-base text-slate-500" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
                {dayLabels.map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-7"></div>
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const status = getDayStatus(day);
                    const reason = getDayReason(day);
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isToday = dateStr === todayStr;

                    let dotColor = '';
                    let bgClass = '';
                    let textClass = 'text-slate-600 dark:text-slate-400';

                    if (status === 'cooking') {
                        dotColor = 'bg-emerald-500';
                        textClass = 'text-slate-700 dark:text-slate-200';
                    } else if (status === 'no_cook') {
                        dotColor = 'bg-red-500';
                        bgClass = 'bg-red-50 dark:bg-red-900/20';
                        textClass = 'text-red-600 dark:text-red-400';
                    } else if (status === 'extra_cook') {
                        dotColor = 'bg-blue-500';
                        bgClass = 'bg-blue-50 dark:bg-blue-900/20';
                        textClass = 'text-blue-600 dark:text-blue-400';
                    } else {
                        textClass = 'text-slate-400 dark:text-slate-600';
                    }

                    return (
                        <div
                            key={day}
                            title={reason ? `${status === 'no_cook' ? 'Không nấu' : 'Nấu thêm'}: ${reason}` : (status === 'cooking' ? 'Ngày nấu ăn' : 'Nghỉ')}
                            className={`
                                relative flex flex-col items-center justify-center h-7 rounded-md text-[11px] font-semibold cursor-default transition-all
                                ${bgClass}
                                ${isToday ? 'ring-2 ring-[#b74b0c] ring-offset-1' : ''}
                                ${textClass}
                            `}
                        >
                            {day}
                            {dotColor && (
                                <div className={`absolute bottom-0.5 w-1 h-1 rounded-full ${dotColor}`}></div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-[10px] text-slate-500">Nấu</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-[10px] text-slate-500">K.nấu</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-[10px] text-slate-500">Thêm</span>
                </div>
            </div>
        </div>
    );
}

export default function KitchenDashboard({ hideHeader = false }: KitchenDashboardProps) {
    const router = useRouter();
    const supabase = createClient();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const { isEnabled } = useTenantFeatures();
    const [stats, setStats] = useState<DailyStats>({ total: 0, eating: 0, not_eating: 0, pending: 0 });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [groupStats, setGroupStats] = useState<GroupStat[]>([]);
    const [guestMeals, setGuestMeals] = useState<GuestMeal[]>([]);
    const [guestMealsTotal, setGuestMealsTotal] = useState(0);
    const [showGuestMeals, setShowGuestMeals] = useState(false);
    const [selectedGuestMeal, setSelectedGuestMeal] = useState<GuestMeal | null>(null);
    const [userName, setUserName] = useState('Kitchen');
    const [currentKitchenUserId, setCurrentKitchenUserId] = useState<string | null>(null);
    const [currentKitchenTenantId, setCurrentKitchenTenantId] = useState<string | null>(null);

    // ...

    const [currentGroupPage, setCurrentGroupPage] = useState(0);
    const [selectedDepartment, setSelectedDepartment] = useState('all');
    const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'eating' | 'not_eating'>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    const [departments, setDepartments] = useState<string[]>([]);
    const [isCookingDay, setIsCookingDay] = useState(true);

    // Kitchen announcement states
    const [showKitchenAnnouncement, setShowKitchenAnnouncement] = useState(false);
    const [kitchenAnnouncementText, setKitchenAnnouncementText] = useState('');
    const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);

    // Monthly report states
    const [showMonthlyReport, setShowMonthlyReport] = useState(false);
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
    const [reportData, setReportData] = useState<any>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [reportError, setReportError] = useState('');

    const handleSendKitchenAnnouncement = async () => {
        if (!kitchenAnnouncementText.trim()) return;
        setIsSendingAnnouncement(true);
        try {
            const content = kitchenAnnouncementText.trim();
            console.log('[Kitchen Announcement] Sending via API:', content);

            const res = await fetch('/api/admin/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });

            const result = await res.json();
            console.log('[Kitchen Announcement] API response:', res.status, result);

            if (res.ok && result.success) {
                setKitchenAnnouncementText('');
                setShowKitchenAnnouncement(false);
                showToast('Đã gửi thông báo từ Bếp!', 'success');
            } else {
                console.error('[Kitchen Announcement] API error:', result.error);
                showToast(`Lỗi gửi thông báo: ${result.error || 'Unknown'}`, 'error');
            }
        } catch (err: any) {
            console.error('[Kitchen Announcement] Unexpected error:', err);
            showToast(`Lỗi gửi thông báo: ${err?.message || 'Unknown'}`, 'error');
        }
        setIsSendingAnnouncement(false);
    };

    // Fetch danh sách phòng ban thực tế từ DB
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('users')
                .select('department')
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen')
                .not('department', 'is', null);
            if (data) {
                const uniqueDepts = [...new Set(data.map(u => u.department).filter(Boolean))] as string[];
                uniqueDepts.sort((a, b) => a.localeCompare(b, 'vi'));
                setDepartments(uniqueDepts);
            }
        })();
    }, []);

    useEffect(() => {
        fetchDashboardData();
        // Fetch current user name
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentKitchenUserId(user.id);
                const { data: profile } = await supabase.from('users').select('full_name, tenant_id').eq('id', user.id).single();
                if (profile?.full_name) setUserName(profile.full_name);
                if (profile?.tenant_id) setCurrentKitchenTenantId(profile.tenant_id);
            }
        })();
    }, [selectedDepartment, selectedDate, currentPage, selectedStatus, itemsPerPage]);

    const fetchDashboardData = async () => {
        try {
            setIsLoading(true);

            // ⚠️ BUG-FIX #3: Check if selectedDate is a cooking day
            const checkDate = new Date(selectedDate + 'T00:00:00');
            const dayIndex = checkDate.getDay();

            let cookingDays = { start_day: 1, end_day: 5 };
            try {
                const cdRes = await fetch('/api/admin/settings/cooking-days');
                if (cdRes.ok) {
                    const cdResult = await cdRes.json();
                    cookingDays = cdResult.data;
                }
            } catch { /* use default */ }

            let isInCookingRange = false;
            if (cookingDays.start_day <= cookingDays.end_day) {
                isInCookingRange = dayIndex >= cookingDays.start_day && dayIndex <= cookingDays.end_day;
            } else {
                isInCookingRange = dayIndex >= cookingDays.start_day || dayIndex <= cookingDays.end_day;
            }

            // Check cooking exceptions
            const { data: exceptionsData } = await supabase
                .from('cooking_exceptions')
                .select('type')
                .eq('date', selectedDate)
                .limit(1);
            const exception = exceptionsData?.[0];
            if (exception?.type === 'no_cook') isInCookingRange = false;
            else if (exception?.type === 'extra_cook') isInCookingRange = true;

            setIsCookingDay(isInCookingRange);

            // Count all active users except kitchen staff
            // ⚠️ START_DATE: loại NV chưa bắt đầu làm
            const { count: totalUsers } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen')
                .or(`start_date.lte.${selectedDate},start_date.is.null`);

            // If NOT a cooking day: set stats to 0, empty employees, skip orders
            if (!isInCookingRange) {
                setStats({ total: totalUsers || 0, eating: 0, not_eating: 0, pending: 0 });
                setEmployees([]);
                setTotalPages(1);
                // Still fetch guest meals and group stats
                const { data: guestMealsRaw } = await supabase
                    .from('guest_meals')
                    .select('id, quantity, note, created_by, created_at')
                    .eq('date', selectedDate)
                    .order('created_at', { ascending: false });
                let userNameMapNC: Record<string, string> = {};
                const creatorIdsNC = [...new Set((guestMealsRaw || []).map((gm: any) => gm.created_by).filter(Boolean))];
                if (creatorIdsNC.length > 0) {
                    const { data: usersDataNC } = await supabase.from('users').select('id, full_name').in('id', creatorIdsNC);
                    (usersDataNC || []).forEach((u: any) => { userNameMapNC[u.id] = u.full_name; });
                }
                const guestMealsDataNC: GuestMeal[] = (guestMealsRaw || []).map((gm: any) => ({
                    id: gm.id, quantity: gm.quantity, note: gm.note || '',
                    requester_name: userNameMapNC[gm.created_by] || 'Không rõ', created_at: gm.created_at,
                }));
                setGuestMeals(guestMealsDataNC);
                setGuestMealsTotal(guestMealsDataNC.reduce((sum, item) => sum + item.quantity, 0));

                const { data: groups } = await supabase.from('groups').select('id, name, table_area, shifts(start_time, end_time)');
                if (groups) {
                    const groupsWithCounts = await Promise.all(
                        groups.map(async (group: any) => {
                            const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('group_id', group.id);
                            return {
                                id: group.id, name: group.name,
                                shift_time: group.shifts ? `${group.shifts.start_time.substring(0, 5)} - ${group.shifts.end_time.substring(0, 5)}` : 'N/A',
                                table_area: group.table_area || 'Chưa định nghĩa', employee_count: count || 0
                            };
                        })
                    );
                    setGroupStats(groupsWithCounts);
                }
                setIsLoading(false);
                return;
            }

            const { data: ordersToday } = await supabase
                .from('orders')
                .select('user_id, status')
                .eq('date', selectedDate);

            // ⚠️ AUDIT-FIX: Fetch user default_meal_status for opt-in baseline
            // ⚠️ v6.1.4: PHẢI filter start_date để loại NV chưa đi làm (khớp Admin StatsCards)
            const { data: userDefaultData } = await supabase
                .from('users')
                .select('id, group_id, default_meal_status')
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen')
                .or(`start_date.lte.${selectedDate},start_date.is.null`)
                .is('deleted_at', null);
            const userDefaultMap = buildUserDefaultMap(userDefaultData || []);
            const userGroupMap = new Map<string, string>();
            userDefaultData?.forEach((u: any) => {
                if (u.group_id) userGroupMap.set(u.id, u.group_id);
            });

            // Fetch group metadata (for group names/areas, still needed)
            const { data: groupsMeta } = await supabase
                .from('groups')
                .select('id, registration_mode');
            const groupModeMap = new Map<string, string>();
            groupsMeta?.forEach((g: any) => groupModeMap.set(g.id, g.registration_mode || 'opt_out'));

            // Build orders map for today
            const ordersMap = new Map<string, string>();
            ordersToday?.forEach((o: any) => { if (o.user_id) ordersMap.set(o.user_id, o.status); });

            // ⚠️ AUDIT-FIX: Count with default_meal_status awareness
            let eatingCount = 0;
            let notEatingCountCalc = 0;
            (userDefaultData || []).forEach((u: any) => {
                const defaultStatus = getDefaultFromMap(userDefaultMap, u.id);
                const status = ordersMap.get(u.id) || defaultStatus;
                if (status === 'not_eating') notEatingCountCalc++;
                else eatingCount++;
            });

            // Fetch guest meals (suất phát sinh) for selected date — full details
            const { data: guestMealsRaw } = await supabase
                .from('guest_meals')
                .select('id, quantity, note, created_by, created_at')
                .eq('date', selectedDate)
                .order('created_at', { ascending: false });

            // Fetch requester names for guest meals
            let userNameMap: Record<string, string> = {};
            const creatorIds = [...new Set((guestMealsRaw || []).map((gm: any) => gm.created_by).filter(Boolean))];
            if (creatorIds.length > 0) {
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, full_name')
                    .in('id', creatorIds);
                (usersData || []).forEach((u: any) => { userNameMap[u.id] = u.full_name; });
            }

            // Map to GuestMeal shape
            const guestMealsData: GuestMeal[] = (guestMealsRaw || []).map((gm: any) => ({
                id: gm.id,
                quantity: gm.quantity,
                note: gm.note || '',
                requester_name: userNameMap[gm.created_by] || 'Không rõ',
                created_at: gm.created_at,
            }));
            const gmTotal = guestMealsData.reduce((sum, item) => sum + item.quantity, 0);
            setGuestMeals(guestMealsData);
            setGuestMealsTotal(gmTotal);

            setStats({ total: totalUsers || 0, eating: eatingCount + gmTotal, not_eating: notEatingCountCalc, pending: gmTotal });

            const offset = (currentPage - 1) * itemsPerPage;

            // ⚠️ BUG-FIX: Filter by status BEFORE pagination
            // Old approach: paginate all users → fetch orders → filter client-side → wrong counts
            // New approach: determine matching user_ids FIRST → paginate within that set

            if (selectedStatus !== 'all') {
                // Step 1: Get ALL active non-kitchen user IDs + their order status
                // We need to know who is eating vs not_eating before pagination
                let matchedUserIds: string[] = [];

                if (selectedStatus === 'not_eating') {
                    // Users with explicit 'not_eating' orders
                    const { data: notEatingOrders } = await supabase
                        .from('orders')
                        .select('user_id')
                        .eq('date', selectedDate)
                        .eq('status', 'not_eating');
                    const notEatingIds = new Set((notEatingOrders || []).map(o => o.user_id));

                    // Users with default_meal_status='not_eating' without any order
                    // ⚠️ v6.1.5: PHẢI filter start_date (khớp counting logic)
                    const { data: allUsersDefault } = await supabase
                        .from('users')
                        .select('id, default_meal_status')
                        .eq('status', 'active')
                        .not('role', 'ilike', 'kitchen')
                        .is('deleted_at', null)
                        .or(`start_date.lte.${selectedDate},start_date.is.null`);
                    if (allUsersDefault) {
                        const { data: existingOrders } = await supabase
                            .from('orders')
                            .select('user_id')
                            .eq('date', selectedDate);
                        const hasOrder = new Set((existingOrders || []).map(o => o.user_id));
                        allUsersDefault.forEach((u: any) => {
                            if (getDefaultFromMap(userDefaultMap, u.id) === 'not_eating' && !hasOrder.has(u.id)) {
                                notEatingIds.add(u.id);
                            }
                        });
                    }

                    matchedUserIds = Array.from(notEatingIds);
                } else {
                    // selectedStatus === 'eating'
                    // Users with explicit 'eating' orders
                    const { data: eatingOrders } = await supabase
                        .from('orders')
                        .select('user_id')
                        .eq('date', selectedDate)
                        .eq('status', 'eating');
                    const eatingIds = new Set((eatingOrders || []).map(o => o.user_id));

                    // Opt-out users WITHOUT any order (default = eating)
                    // ⚠️ v6.1.5: PHẢI filter start_date (khớp counting logic)
                    const { data: allUsersForFilter } = await supabase
                        .from('users')
                        .select('id, group_id')
                        .eq('status', 'active')
                        .not('role', 'ilike', 'kitchen')
                        .is('deleted_at', null)
                        .or(`start_date.lte.${selectedDate},start_date.is.null`);
                    const { data: allOrdersForDate } = await supabase
                        .from('orders')
                        .select('user_id')
                        .eq('date', selectedDate);
                    const hasOrder = new Set((allOrdersForDate || []).map(o => o.user_id));

                    (allUsersForFilter || []).forEach((u: any) => {
                        if (!hasOrder.has(u.id)) {
                            // No order — use default_meal_status
                            const defaultStatus = userDefaultMap.get(u.id) || 'eating';
                            if (defaultStatus !== 'not_eating') {
                                eatingIds.add(u.id);
                            }
                        }
                    });

                    matchedUserIds = Array.from(eatingIds);
                }

                // Step 2: Query users with matched IDs + pagination
                const totalFiltered = matchedUserIds.length;
                setTotalPages(Math.ceil(totalFiltered / itemsPerPage));

                if (matchedUserIds.length > 0) {
                    let userQuery = supabase
                        .from('users')
                        .select('id, full_name, email, role, department')
                        .in('id', matchedUserIds)
                        .eq('status', 'active');

                    if (selectedDepartment !== 'all' && selectedDepartment !== 'Tất cả phòng ban') {
                        userQuery = userQuery.eq('department', selectedDepartment);
                    }

                    const { data: usersData } = await userQuery
                        .order('full_name')
                        .range(offset, offset + itemsPerPage - 1);

                    if (usersData) {
                        const employeesWithStatus = await Promise.all(
                            usersData.map(async (user) => {
                                const { data: order } = await supabase
                                    .from('orders')
                                    .select('status, created_at')
                                    .eq('user_id', user.id)
                                    .eq('date', selectedDate)
                                    .single();
                                const defaultStatus = userDefaultMap.get(user.id) || 'eating';
                                return { ...user, order_status: order?.status || defaultStatus, order_time: order?.created_at || null };
                            })
                        );
                        setEmployees(employeesWithStatus);
                    }
                } else {
                    setEmployees([]);
                }
            } else {
                // selectedStatus === 'all' — normal pagination
                let query = supabase
                    .from('users')
                    .select('id, full_name, email, role, department', { count: 'exact' })
                    .eq('status', 'active')
                    .not('role', 'ilike', 'kitchen');

                if (selectedDepartment !== 'all' && selectedDepartment !== 'Tất cả phòng ban') {
                    query = query.eq('department', selectedDepartment);
                }

                const { data: usersData, count } = await query.range(offset, offset + itemsPerPage - 1).order('full_name');

                if (count) {
                    setTotalPages(Math.ceil(count / itemsPerPage));
                }

                if (usersData) {
                    const employeesWithStatus = await Promise.all(
                        usersData.map(async (user) => {
                            const { data: order } = await supabase
                                .from('orders')
                                .select('status, created_at')
                                .eq('user_id', user.id)
                                .eq('date', selectedDate)
                                .single();
                            const defaultStatus = userDefaultMap.get(user.id) || 'eating';
                            return { ...user, order_status: order?.status || defaultStatus, order_time: order?.created_at || null };
                        })
                    );
                    setEmployees(employeesWithStatus);
                }
            }

            const { data: groups } = await supabase.from('groups').select('id, name, table_area, shifts(start_time, end_time)');

            if (groups) {
                const groupsWithCounts = await Promise.all(
                    groups.map(async (group: any) => {
                        const { count } = await supabase
                            .from('users')
                            .select('id', { count: 'exact', head: true })
                            .eq('group_id', group.id);
                        return {
                            id: group.id,
                            name: group.name,
                            shift_time: group.shifts ? `${group.shifts.start_time.substring(0, 5)} - ${group.shifts.end_time.substring(0, 5)}` : 'N/A',
                            table_area: group.table_area || 'Chưa định nghĩa',
                            employee_count: count || 0
                        };
                    })
                );
                setGroupStats(groupsWithCounts);
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('❌ Không thể tải dữ liệu', '⚠️', 4000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const getStatusBadge = (status: string | null | undefined) => {
        if (status === 'eating') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Đã báo ăn
                </span>
            );
        }
        if (status === 'not_eating') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Đã báo nghỉ
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Chưa báo
            </span>
        );
    };

    const formatDateTime = (dateTime: string | null | undefined) => {
        if (!dateTime) return <span className="text-slate-400 dark:text-slate-500 italic">Chưa ghi nhận</span>;
        const date = new Date(dateTime);
        return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    };

    // Format ngày tháng cho header stat cards
    const formatSelectedDate = () => {
        const d = new Date(selectedDate + 'T00:00:00');
        const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        return `${dayNames[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    };

    const getInitials = (name: string) => {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const getAvatarColor = (index: number) => {
        const colors = ['bg-[#b74b0c]/10 text-[#b74b0c]', 'bg-purple-100 text-purple-600', 'bg-amber-100 text-amber-600', 'bg-teal-100 text-teal-600', 'bg-pink-100 text-pink-600', 'bg-blue-100 text-blue-600'];
        return colors[index % colors.length];
    };

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Filter employees by status — now employees are already filtered in fetchDashboardData
    const filteredEmployees = employees;

    // Export Excel handler
    const handleExportExcel = async () => {
        if (!isEnabled('export_excel')) {
            showToast('Tính năng xuất Excel chưa được bật', '⚠️', 4000);
            return;
        }
        try {
            setIsExporting(true);
            const params = new URLSearchParams({
                date: selectedDate,
                department: selectedDepartment,
                status: selectedStatus
            });
            const res = await fetch(`/api/kitchen/export/daily?${params.toString()}&_t=${Date.now()}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Lỗi' }));
                throw new Error(err.error || 'Export thất bại');
            }
            const arrayBuffer = await res.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `BaoCaoBep_${selectedDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showToast('Đã tải báo cáo Excel!', '✅', 3000);
        } catch (err: any) {
            console.error('Export error:', err);
            showToast(err.message || 'Xuất Excel thất bại', '❌', 4000);
        } finally {
            setIsExporting(false);
        }
    };

    // Monthly report handler
    const handleOpenMonthlyReport = async (month?: string) => {
        const m = month || reportMonth;
        setShowMonthlyReport(true);
        setIsLoadingReport(true);
        setReportError('');
        try {
            const res = await fetch(`/api/kitchen/report/monthly?month=${m}&_t=${Date.now()}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Lỗi' }));
                throw new Error(err.error || 'Không thể tải báo cáo');
            }
            const result = await res.json();
            setReportData(result.data);
        } catch (err: any) {
            setReportError(err.message || 'Lỗi tải báo cáo');
        } finally {
            setIsLoadingReport(false);
        }
    };

    const formatVND = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#b74b0c] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Đang tải...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#FFFBF7] dark:bg-[#12100E] text-slate-900 dark:text-slate-100 ${isDarkMode ? 'dark' : ''}`}>
            {!hideHeader && <DashboardHeader userName={userName} userRole="kitchen" />}

            <main className="flex-1 w-full max-w-7xl mx-auto px-6 lg:px-20 py-8">
                {/* Notification bell + Send announcement */}
                <div className="flex items-center justify-end gap-3 mb-4">
                    <div className="relative">
                        <button
                            onClick={() => setShowKitchenAnnouncement(!showKitchenAnnouncement)}
                            className="flex items-center gap-1.5 bg-[#b74b0c] hover:bg-[#9a3e0a] text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md shadow-[#b74b0c]/20 transition-all"
                        >
                            <Icon name="campaign" className="text-[16px]" />
                            Gửi thông báo
                        </button>

                        {showKitchenAnnouncement && (
                            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl z-40 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                        <span className="text-sm">🍳</span>
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Thông báo từ Bếp</h4>
                                </div>
                                <textarea
                                    value={kitchenAnnouncementText}
                                    onChange={(e) => setKitchenAnnouncementText(e.target.value)}
                                    placeholder="VD: Hôm nay bếp phục vụ thêm món tráng miệng..."
                                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#b74b0c]/20 focus:border-[#b74b0c] outline-none resize-none h-20 mb-2"
                                />
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">Sẽ hiện trên marquee NV</span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setShowKitchenAnnouncement(false); setKitchenAnnouncementText(''); }}
                                            className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={handleSendKitchenAnnouncement}
                                            disabled={!kitchenAnnouncementText.trim() || isSendingAnnouncement}
                                            className="px-3 py-1.5 bg-[#b74b0c] text-white text-xs font-bold rounded-lg hover:bg-[#9a3e0a] disabled:opacity-50 transition-colors flex items-center gap-1"
                                        >
                                            <Icon name={isSendingAnnouncement ? 'progress_activity' : 'send'} className={`text-[14px] ${isSendingAnnouncement ? 'animate-spin' : ''}`} />
                                            Gửi
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <NotificationInbox tenantId={currentKitchenTenantId} userId={currentKitchenUserId} />
                </div>

                {/* Date header for stat cards */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Icon name="calendar_today" className="text-[#b74b0c] text-lg" />
                        <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200">
                            {formatSelectedDate()}
                        </h2>
                    </div>
                    {isCookingDay ? (
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full flex items-center gap-1">
                            <span>🍳</span> Ngày nấu ăn
                        </span>
                    ) : (
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                            Nghỉ nấu
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
                    <div className="bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1 sm:gap-2">
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Tổng NV</span>
                            <Icon name="groups" className="text-[#b74b0c] bg-[#b74b0c]/10 p-1.5 sm:p-2 rounded-lg text-base sm:text-[24px]" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-extrabold">{stats.total.toLocaleString()}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">Nhân viên hoạt động</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1 sm:gap-2">
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Báo ăn</span>
                            <Icon name="check_circle" className="text-emerald-500 bg-emerald-500/10 p-1.5 sm:p-2 rounded-lg text-base sm:text-[24px]" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400">{stats.eating.toLocaleString()}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">{stats.total > 0 ? Math.round((stats.eating / stats.total) * 100) : 0}% tổng NV</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1 sm:gap-2">
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Báo nghỉ</span>
                            <Icon name="cancel" className="text-rose-500 bg-rose-500/10 p-1.5 sm:p-2 rounded-lg text-base sm:text-[24px]" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">{stats.not_eating.toLocaleString()}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">{stats.total > 0 ? Math.round((stats.not_eating / stats.total) * 100) : 0}% tổng NV</p>
                    </div>

                    {/* Suất phát sinh card — expandable */}
                    <div className="relative">
                        <button
                            onClick={() => setShowGuestMeals(!showGuestMeals)}
                            className="w-full bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1 sm:gap-2 text-left hover:border-[#b74b0c]/30 transition-all cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Phát sinh</span>
                                <Icon name="room_service" className="text-purple-500 bg-purple-500/10 p-1.5 sm:p-2 rounded-lg text-base sm:text-[24px]" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-extrabold text-purple-700 dark:text-purple-400">{guestMealsTotal}</p>
                            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-purple-600">
                                <Icon name={showGuestMeals ? 'expand_less' : 'expand_more'} className="text-sm font-bold" />
                                <span className="hidden sm:inline">{guestMeals.length} yêu cầu — bấm xem</span>
                                <span className="sm:hidden">{guestMeals.length} yêu cầu</span>
                            </div>
                        </button>

                        {/* Guest meals dropdown */}
                        {showGuestMeals && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl z-30 max-h-[60vh] overflow-y-auto">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                                    <h4 className="font-bold text-sm flex items-center gap-1.5">
                                        <Icon name="room_service" className="text-purple-500 text-lg" />
                                        Danh sách suất phát sinh
                                    </h4>
                                    <button onClick={() => { setShowGuestMeals(false); setSelectedGuestMeal(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                                        <Icon name="close" className="text-xl" />
                                    </button>
                                </div>

                                {selectedGuestMeal ? (
                                    /* Detail view */
                                    <div className="p-4">
                                        <button onClick={() => setSelectedGuestMeal(null)} className="flex items-center gap-1 text-xs text-[#b74b0c] font-bold mb-3 hover:underline">
                                            <Icon name="arrow_back" className="text-sm" /> Quay lại
                                        </button>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                                                    <Icon name="person" className="text-purple-600 text-xl" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm">{selectedGuestMeal.requester_name || 'Không rõ'}</p>
                                                    <p className="text-xs text-slate-500">Người yêu cầu</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                                                    <p className="text-xs text-slate-500 mb-1">Số lượng</p>
                                                    <p className="text-xl font-extrabold text-purple-600">{selectedGuestMeal.quantity} suất</p>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                                                    <p className="text-xs text-slate-500 mb-1">Thời gian</p>
                                                    <p className="text-sm font-bold">{new Date(selectedGuestMeal.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
                                                </div>
                                            </div>
                                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                                                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">Lý do / Ghi chú</p>
                                                <p className="text-sm">{selectedGuestMeal.note || 'Không có ghi chú'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* List view */
                                    <div>
                                        {guestMeals.length === 0 ? (
                                            <div className="p-6 text-center text-slate-400">
                                                <Icon name="no_meals" className="text-3xl mb-2" />
                                                <p className="text-sm">Chưa có suất phát sinh ngày này</p>
                                            </div>
                                        ) : guestMeals.map(gm => (
                                            <button
                                                key={gm.id}
                                                onClick={() => setSelectedGuestMeal(gm)}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 text-left"
                                            >
                                                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <span className="text-sm font-extrabold text-purple-600">{gm.quantity}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm truncate">{gm.requester_name || 'Không rõ'}</p>
                                                    <p className="text-xs text-slate-500 truncate">{gm.note || 'Không ghi chú'}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-xs text-slate-400">{new Date(gm.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                                <Icon name="chevron_right" className="text-slate-300 text-lg flex-shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* NEW: Forecast Cards for Tomorrow */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-4 mb-6 sm:mb-8">
                    <ForecastCards />
                </div>

                {/* Non-cooking day banner */}
                {!isCookingDay && (
                    <div className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 rounded-2xl p-6 shadow-md border border-slate-200 dark:border-slate-700 mb-8">
                        <div className="flex items-center gap-3 mb-2">
                            <Icon name="event_busy" className="text-slate-500 text-[24px]" />
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                                Ngày này không nấu ăn
                            </h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {(() => {
                                const d = new Date(selectedDate + 'T00:00:00');
                                const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                                return `${dayNames[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
                            })()}
                        </p>
                        <p className="text-xs text-slate-500">
                            Ngày được chọn không thuộc lịch nấu ăn. Chọn ngày khác bên dưới để xem dữ liệu.
                        </p>
                        <div className="mt-3">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn ngày khác</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#b74b0c]/20 focus:border-[#b74b0c] outline-none transition-all"
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                    <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                            <Icon name="event" className="text-[#b74b0c] text-lg" />
                            Lịch nấu ăn
                        </h3>
                        <CookingCalendar />
                    </div>

                    <div className="lg:col-span-9 flex flex-col gap-6">

                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold flex items-center gap-2">
                                    <Icon name="pie_chart" className="text-[#b74b0c] text-lg" />
                                    Thống kê Nhóm ăn
                                </h3>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hôm nay</span>
                            </div>

                            {/* Mobile: show ALL groups vertically */}
                            <div className="block md:hidden space-y-3">
                                {groupStats.map(group => (
                                    <div key={group.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold truncate">{group.name}</p>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Icon name="schedule" className="text-xs text-slate-400" />
                                                    {group.shift_time}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Icon name="table_restaurant" className="text-xs text-slate-400" />
                                                    {group.table_area}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right ml-3 flex-shrink-0">
                                            <p className="text-lg font-extrabold text-[#b74b0c]">{group.employee_count}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">NV</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop: grid 2 cols, show all groups */}
                            <div className="hidden md:grid grid-cols-2 gap-4">
                                {groupStats.map(group => (
                                    <div key={group.id} className="flex flex-col justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="text-sm font-bold">{group.name}</p>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Icon name="schedule" className="text-xs text-slate-400" />
                                                    <span className="text-xs text-slate-500 font-medium">{group.shift_time}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-extrabold text-[#b74b0c]">{group.employee_count}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Nhân viên</p>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex items-center gap-1.5">
                                            <Icon name="table_restaurant" className="text-xs text-slate-400" />
                                            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                                {group.table_area}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {isCookingDay && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-8">
                        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                            {/* Row 1: Filters */}
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="w-full sm:w-52">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Phòng ban</label>
                                    <div className="relative">
                                        <select
                                            value={selectedDepartment}
                                            onChange={(e) => { setSelectedDepartment(e.target.value); setCurrentPage(1); }}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-[#b74b0c]/20 focus:border-[#b74b0c] outline-none transition-all"
                                        >
                                            <option value="all">Tất cả phòng ban</option>
                                            {departments.map(dept => (
                                                <option key={dept} value={dept}>{dept}</option>
                                            ))}
                                        </select>
                                        <Icon name="expand_more" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg" />
                                    </div>
                                </div>

                                <div className="w-full sm:w-44">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Ngày xem</label>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={selectedDate}
                                            onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#b74b0c]/20 focus:border-[#b74b0c] outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Status Filter Pills */}
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Trạng thái</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { value: 'all' as const, label: 'Tất cả', icon: 'groups', count: stats.total },
                                            { value: 'eating' as const, label: 'Ăn', icon: 'check_circle', count: stats.eating },
                                            { value: 'not_eating' as const, label: 'Nghỉ', icon: 'cancel', count: stats.not_eating },
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => { setSelectedStatus(opt.value); setCurrentPage(1); }}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedStatus === opt.value
                                                    ? 'bg-[#b74b0c] text-white shadow-md shadow-[#b74b0c]/20'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                    }`}
                                            >
                                                <Icon name={opt.icon} className="text-[14px]" />
                                                {opt.label}
                                                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${selectedStatus === opt.value
                                                    ? 'bg-white/20 text-white'
                                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                                    }`}>{opt.count}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Export + Report Buttons */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleOpenMonthlyReport()}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all whitespace-nowrap"
                                    >
                                        <Icon name="analytics" className="text-lg" />
                                        Báo cáo tháng
                                    </button>
                                    <button
                                        onClick={handleExportExcel}
                                        disabled={isExporting}
                                        className="bg-[#b74b0c] hover:bg-[#9a3e0a] disabled:opacity-60 disabled:cursor-wait text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-[#b74b0c]/20 transition-all whitespace-nowrap"
                                    >
                                        <Icon name={isExporting ? 'progress_activity' : 'download'} className={`text-lg ${isExporting ? 'animate-spin' : ''}`} />
                                        {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nhân viên</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Phòng ban</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Trạng thái</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Thời gian đăng ký</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredEmployees.map((emp, idx) => (
                                        <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(idx)}`}>
                                                        {getInitials(emp.full_name)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm">{emp.full_name}</p>
                                                        <p className="text-xs text-slate-500">{emp.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium">{emp.department || 'N/A'}</td>
                                            <td className="px-6 py-4">{getStatusBadge(emp.order_status)}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(emp.order_time)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-slate-400 hover:text-[#b74b0c] transition-colors">
                                                    <Icon name="more_horiz" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-500">
                                Đang hiển thị {filteredEmployees.length} / {selectedStatus === 'all' ? stats.total : (selectedStatus === 'eating' ? stats.eating : stats.not_eating)} nhân viên {selectedStatus !== 'all' ? `(lọc: ${selectedStatus === 'eating' ? 'ăn' : 'nghỉ'})` : ''}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon name="chevron_left" className="text-sm" />
                                </button>

                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-8 h-8 rounded text-xs font-bold ${currentPage === page ? 'bg-[#b74b0c] text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}

                                {totalPages > 5 && (
                                    <>
                                        <span className="px-1 text-slate-400">...</span>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold"
                                        >
                                            {totalPages}
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon name="chevron_right" className="text-sm" />
                                </button>

                                {/* Per-page selector */}
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                    className="ml-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                >
                                    <option value={10}>10/trang</option>
                                    <option value={20}>20/trang</option>
                                    <option value={50}>50/trang</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </main >

            {/* === MONTHLY REPORT MODAL === */}
            {showMonthlyReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMonthlyReport(false)} />
                    <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                                    <Icon name="analytics" className="text-purple-600 text-xl" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-extrabold">Báo cáo tháng</h2>
                                    <p className="text-xs text-slate-500">Thống kê suất ăn & chi phí</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="month"
                                    value={reportMonth}
                                    onChange={(e) => { setReportMonth(e.target.value); handleOpenMonthlyReport(e.target.value); }}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                                />
                                <button onClick={() => setShowMonthlyReport(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <Icon name="close" className="text-xl" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {isLoadingReport ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="text-center">
                                        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                        <p className="text-sm text-slate-500">Đang tải báo cáo...</p>
                                    </div>
                                </div>
                            ) : reportError ? (
                                <div className="text-center py-20">
                                    <Icon name="error" className="text-4xl text-rose-400 mb-2" />
                                    <p className="text-sm text-rose-600 font-bold">{reportError}</p>
                                </div>
                            ) : reportData ? (
                                <>
                                    {/* Overview Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">Tổng suất ăn</p>
                                            <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{reportData.total_meals.toLocaleString()}</p>
                                            <p className="text-[10px] text-emerald-500 mt-1">~{reportData.avg_daily_meals} suất/ngày</p>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-200 dark:border-rose-800">
                                            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">Tổng nghỉ ăn</p>
                                            <p className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{reportData.total_not_eating.toLocaleString()}</p>
                                            <p className="text-[10px] text-rose-500 mt-1">{reportData.cooking_days} ngày nấu</p>
                                        </div>
                                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                                            <p className="text-xs font-bold text-purple-600 dark:text-purple-400 mb-1">Suất phát sinh</p>
                                            <p className="text-2xl font-extrabold text-purple-700 dark:text-purple-300">{reportData.total_guest.toLocaleString()}</p>
                                            <p className="text-[10px] text-purple-500 mt-1">Khách / ngoài danh sách</p>
                                        </div>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
                                            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">💰 Chi phí suất ăn</p>
                                            <p className="text-xl font-extrabold text-amber-700 dark:text-amber-300">{formatVND(reportData.total_cost)}</p>
                                            <p className="text-[10px] text-amber-500 mt-1">Giá: {formatVND(reportData.meal_price)}/suất</p>
                                        </div>
                                        <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-xl border border-teal-200 dark:border-teal-800">
                                            <p className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-1">💎 Tiết kiệm được</p>
                                            <p className="text-xl font-extrabold text-teal-700 dark:text-teal-300">{formatVND(reportData.total_saved)}</p>
                                            <p className="text-[10px] text-teal-500 mt-1">Từ {reportData.total_not_eating} suất nghỉ</p>
                                        </div>
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">👥 Nhân viên</p>
                                            <p className="text-2xl font-extrabold text-blue-700 dark:text-blue-300">{reportData.total_employees}</p>
                                            <p className="text-[10px] text-blue-500 mt-1">{reportData.cooking_days} ngày nấu trong tháng</p>
                                        </div>
                                    </div>

                                    {/* Peak / Low Days */}
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {reportData.peak_day && (
                                            <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10 p-4 rounded-xl border border-orange-200 dark:border-orange-800">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Icon name="trending_up" className="text-orange-500" />
                                                    <span className="text-xs font-bold text-orange-600">Ngày đông nhất</span>
                                                </div>
                                                <p className="text-lg font-extrabold">{reportData.peak_day.count} suất</p>
                                                <p className="text-xs text-slate-500">{new Date(reportData.peak_day.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                                            </div>
                                        )}
                                        {reportData.low_day && (
                                            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 p-4 rounded-xl border border-cyan-200 dark:border-cyan-800">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Icon name="trending_down" className="text-cyan-500" />
                                                    <span className="text-xs font-bold text-cyan-600">Ngày ít nhất</span>
                                                </div>
                                                <p className="text-lg font-extrabold">{reportData.low_day.count} suất</p>
                                                <p className="text-xs text-slate-500">{new Date(reportData.low_day.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Department Breakdown */}
                                    {reportData.by_department && reportData.by_department.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
                                                <Icon name="apartment" className="text-slate-400" />
                                                Theo phòng ban
                                            </h4>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                                                            <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">Phòng ban</th>
                                                            <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">Ăn</th>
                                                            <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">Nghỉ</th>
                                                            <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 uppercase">TB/ngày</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {reportData.by_department.map((dept: any) => (
                                                            <tr key={dept.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                                <td className="px-3 py-2 font-medium">{dept.name}</td>
                                                                <td className="px-3 py-2 text-right text-emerald-600 font-bold">{dept.total_eating.toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-right text-rose-500 font-bold">{dept.total_not_eating.toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-right text-slate-600 font-bold">{dept.avg_daily}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Daily Trend (mini bar chart) */}
                                    {reportData.daily_trend && reportData.daily_trend.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
                                                <Icon name="bar_chart" className="text-slate-400" />
                                                Xu hướng theo ngày
                                            </h4>
                                            <div className="flex items-end gap-[2px] h-24 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 overflow-x-auto">
                                                {reportData.daily_trend.map((day: any) => {
                                                    const maxVal = Math.max(...reportData.daily_trend.map((d: any) => d.eating + d.guest), 1);
                                                    const height = Math.max(4, ((day.eating + day.guest) / maxVal) * 100);
                                                    const dayNum = new Date(day.date + 'T00:00:00').getDate();
                                                    return (
                                                        <div key={day.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-[14px] group relative">
                                                            <div
                                                                className="w-full bg-emerald-400 dark:bg-emerald-500 rounded-t-sm hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors cursor-pointer"
                                                                style={{ height: `${height}%` }}
                                                                title={`${day.date}: ${day.eating + day.guest} suất (${day.not_eating} nghỉ)`}
                                                            />
                                                            <span className="text-[8px] text-slate-400">{dayNum}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            <footer className="w-full py-8 px-6 lg:px-20 text-center text-slate-400 text-xs">
                <p>© 2026 Cơm Ngon Kitchen Dashboard. Hệ thống quản lý suất ăn doanh nghiệp. • BY Thân Công Hải</p>
            </footer>
        </div >
    );
}
