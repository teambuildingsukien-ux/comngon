'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildUserDefaultMap, getDefaultFromMap } from '@/lib/meal-helpers';
import { toLocalDateString } from '@/lib/utils/date-helpers';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface DeptBreakdown {
    department: string;
    eating: { id: string; full_name: string }[];
    not_eating: { id: string; full_name: string }[];
    total: number;
}

interface StatsData {
    totalEmployees: number;
    eatingCount: number;
    notEatingCount: number;
    guestMeals: number;
    pausedCount: number;
    resignedCount: number;
    departments: DeptBreakdown[];
}

export default function StatsCards() {
    const supabase = createClient();
    const [data, setData] = useState<StatsData>({
        totalEmployees: 0, eatingCount: 0, notEatingCount: 0,
        guestMeals: 0, pausedCount: 0, resignedCount: 0, departments: []
    });
    const [loading, setLoading] = useState(true);
    const [expandedCard, setExpandedCard] = useState<string | null>(null);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);
    const [isCookingDay, setIsCookingDay] = useState(true);
    const [todayLabel, setTodayLabel] = useState('');

    useEffect(() => { fetchStats(); }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const now = new Date();
            const today = toLocalDateString(now);

            // ⚠️ AUDIT-GUARD: Check if today is a cooking day
            const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            const formattedDate = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            setTodayLabel(`${dayNames[now.getDay()]}, ${formattedDate}`);

            let cookingDays = { start_day: 1, end_day: 5 }; // Default Mon-Fri
            try {
                const response = await fetch('/api/admin/settings/cooking-days');
                if (response.ok) {
                    const result = await response.json();
                    cookingDays = result.data;
                }
            } catch { /* use default */ }

            const todayDayIndex = now.getDay();
            let isInCookingRange = false;
            if (cookingDays.start_day <= cookingDays.end_day) {
                isInCookingRange = todayDayIndex >= cookingDays.start_day && todayDayIndex <= cookingDays.end_day;
            } else {
                isInCookingRange = todayDayIndex >= cookingDays.start_day || todayDayIndex <= cookingDays.end_day;
            }

            // Check cooking_exceptions
            const { data: exceptions } = await supabase
                .from('cooking_exceptions')
                .select('type')
                .eq('date', today)
                .limit(1);
            const exception = exceptions?.[0];
            if (exception?.type === 'no_cook') isInCookingRange = false;
            else if (exception?.type === 'extra_cook') isInCookingRange = true;

            setIsCookingDay(isInCookingRange);

            // If not a cooking day, still fetch totalEmployees for the badge but skip order-based stats
            if (!isInCookingRange) {
                const { data: allUsers } = await supabase
                    .from('users')
                    .select('id, status, role, start_date')
                    .not('role', 'ilike', 'kitchen')
                    .is('deleted_at', null);
                const activeCount = allUsers?.filter(u => u.status === 'active' && (!u.start_date || u.start_date <= today)).length || 0;
                const pausedCount = allUsers?.filter(u => u.status === 'paused').length || 0;
                const resignedCount = allUsers?.filter(u => u.status === 'resigned').length || 0;
                setData(prev => ({ ...prev, totalEmployees: activeCount, pausedCount, resignedCount }));
                setLoading(false);
                return;
            }

            // 1. All non-kitchen users (active + paused + resigned)
            const { data: allUsers } = await supabase
                .from('users')
                .select('id, full_name, department, status, role, start_date')
                .not('role', 'ilike', 'kitchen')
                .is('deleted_at', null);

            // ⚠️ START_DATE: chỉ tính NV đã bắt đầu làm
            const activeUsers = allUsers?.filter(u => u.status === 'active' && (!u.start_date || u.start_date <= today)) || [];
            const pausedCount = allUsers?.filter(u => u.status === 'paused').length || 0;
            const resignedCount = allUsers?.filter(u => u.status === 'resigned').length || 0;

            // 2. Today's orders for active users
            const activeIds = activeUsers.map(u => u.id);
            const { data: orders } = await supabase
                .from('orders')
                .select('user_id, status')
                .eq('date', today)
                .in('user_id', activeIds.length > 0 ? activeIds : ['__none__']);

            const orderMap = new Map<string, string>();
            orders?.forEach(o => orderMap.set(o.user_id, o.status));

            // ⚠️ AUDIT-FIX: Fetch user default_meal_status for opt-in baseline
            const { data: userDefaultData } = await supabase
                .from('users')
                .select('id, default_meal_status')
                .eq('status', 'active');
            const userDefaultMap = buildUserDefaultMap(userDefaultData || []);

            // 3. Build department breakdown
            const deptMap = new Map<string, DeptBreakdown>();
            activeUsers.forEach(user => {
                const dept = user.department || 'Chưa phân phòng';
                if (!deptMap.has(dept)) {
                    deptMap.set(dept, { department: dept, eating: [], not_eating: [], total: 0 });
                }
                const d = deptMap.get(dept)!;
                // ⚠️ AUDIT-FIX: Use default_meal_status from user record
                const defaultStatus = getDefaultFromMap(userDefaultMap, user.id);
                const status = orderMap.get(user.id) || defaultStatus;
                if (status === 'not_eating') {
                    d.not_eating.push({ id: user.id, full_name: user.full_name });
                } else {
                    d.eating.push({ id: user.id, full_name: user.full_name });
                }
                d.total++;
            });

            const departments = Array.from(deptMap.values()).sort((a, b) => b.total - a.total);

            // 4. Guest meals
            const { data: guestMealsData } = await supabase
                .from('guest_meals')
                .select('quantity')
                .eq('date', today);
            const guestMeals = guestMealsData?.reduce((sum, item) => sum + item.quantity, 0) || 0;

            // 5. Counts
            const notEatingCount = departments.reduce((sum, d) => sum + d.not_eating.length, 0);
            const eatingCount = activeUsers.length - notEatingCount;

            setData({
                totalEmployees: activeUsers.length,
                eatingCount,
                notEatingCount,
                guestMeals,
                pausedCount,
                resignedCount,
                departments,
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleCard = (card: string) => {
        setExpandedCard(expandedCard === card ? null : card);
        setExpandedDept(null);
    };

    const toggleDept = (dept: string) => {
        setExpandedDept(expandedDept === dept ? null : dept);
    };

    const cancelRate = data.totalEmployees > 0
        ? ((data.notEatingCount / data.totalEmployees) * 100).toFixed(1)
        : '0';

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 animate-pulse">
                        <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    </div>
                ))}
            </div>
        );
    }

    // ⚠️ AUDIT-GUARD: Non-cooking day → show banner, NOT misleading stats
    if (!isCookingDay) {
        return (
            <>
                {/* Summary bar: total + paused + resigned */}
                <div className="flex flex-wrap items-center gap-3 mb-1 text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-400">
                        <Icon name="groups" className="text-[16px] align-middle mr-1" />
                        Tổng NV: <span className="text-slate-900 dark:text-white font-extrabold">{data.totalEmployees}</span>
                    </span>
                    {data.pausedCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/20 rounded-full text-amber-700 dark:text-amber-400 font-bold">
                            <Icon name="pause_circle" className="text-[14px]" />
                            Tạm dừng: {data.pausedCount}
                        </span>
                    )}
                    {data.resignedCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-full text-slate-600 dark:text-slate-400 font-bold">
                            <Icon name="person_off" className="text-[14px]" />
                            Đã nghỉ: {data.resignedCount}
                        </span>
                    )}
                </div>

                <div className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 rounded-2xl p-6 shadow-md border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                        <Icon name="event_busy" className="text-slate-500 text-[24px]" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                            Hôm nay không nấu ăn
                        </h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        {todayLabel}
                    </p>
                    <p className="text-xs text-slate-500">
                        Ngày hôm nay không thuộc lịch nấu ăn. Số liệu thống kê sẽ hiển thị vào ngày nấu ăn tiếp theo.
                    </p>
                </div>
            </>
        );
    }

    const renderDeptList = (filterType: 'eating' | 'not_eating' | 'all') => (
        <div className="mt-3 space-y-1 max-h-[400px] overflow-y-auto">
            {data.departments.map(dept => {
                const items = filterType === 'eating' ? dept.eating
                    : filterType === 'not_eating' ? dept.not_eating
                        : [...dept.eating, ...dept.not_eating];
                if (items.length === 0) return null;
                const isOpen = expandedDept === `${filterType}-${dept.department}`;

                return (
                    <div key={dept.department} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-hidden">
                        <button
                            onClick={() => toggleDept(`${filterType}-${dept.department}`)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all"
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="apartment" className="text-[16px] text-slate-400" />
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{dept.department}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                    {items.length}
                                </span>
                                <Icon name={isOpen ? "expand_less" : "expand_more"} className="text-[18px] text-slate-400" />
                            </div>
                        </button>
                        {isOpen && (
                            <div className="px-3 pb-2 space-y-1">
                                {items.map(person => (
                                    <div key={person.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300">
                                                {person.full_name.substring(0, 1)}
                                            </span>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{person.full_name}</span>
                                        {filterType === 'all' && (
                                            <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dept.eating.find(e => e.id === person.id)
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                }`}>
                                                {dept.eating.find(e => e.id === person.id) ? 'Ăn' : 'Nghỉ'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <>
            {/* Summary bar: total + paused + resigned */}
            <div className="flex flex-wrap items-center gap-3 mb-1 text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">
                    <Icon name="groups" className="text-[16px] align-middle mr-1" />
                    Tổng NV: <span className="text-slate-900 dark:text-white font-extrabold">{data.totalEmployees}</span>
                </span>
                {data.pausedCount > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/20 rounded-full text-amber-700 dark:text-amber-400 font-bold">
                        <Icon name="pause_circle" className="text-[14px]" />
                        Tạm dừng: {data.pausedCount}
                    </span>
                )}
                {data.resignedCount > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-full text-slate-600 dark:text-slate-400 font-bold">
                        <Icon name="person_off" className="text-[14px]" />
                        Đã nghỉ: {data.resignedCount}
                    </span>
                )}
            </div>

            {/* Stats Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
                {/* Card 1: NV ăn */}
                <div className="col-span-1">
                    <button
                        onClick={() => toggleCard('eating')}
                        className={`w-full text-left bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 md:p-5 rounded-2xl border-2 transition-all hover:shadow-md ${expandedCard === 'eating' ? 'border-green-400 shadow-md' : 'border-green-100 dark:border-green-800/30'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-500 text-xs font-semibold">NV ăn trưa</p>
                            <Icon name="restaurant" className="text-green-500 text-[20px]" />
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-green-700 dark:text-green-400">{data.eatingCount}</p>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Icon name="unfold_more" className="text-[12px]" /> Bấm xem theo phòng ban
                        </p>
                    </button>
                    {expandedCard === 'eating' && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl mt-2 p-3 border border-green-200 dark:border-green-800/30 shadow-lg">
                            <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-1">
                                <Icon name="restaurant" className="text-[14px] align-middle mr-1" />
                                Danh sách NV ăn theo phòng ban
                            </p>
                            {renderDeptList('eating')}
                        </div>
                    )}
                </div>

                {/* Card 2: NV báo nghỉ */}
                <div className="col-span-1">
                    <button
                        onClick={() => toggleCard('not_eating')}
                        className={`w-full text-left bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 p-4 md:p-5 rounded-2xl border-2 transition-all hover:shadow-md ${expandedCard === 'not_eating' ? 'border-red-400 shadow-md' : 'border-red-100 dark:border-red-800/30'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-500 text-xs font-semibold">NV hủy ăn</p>
                            <Icon name="cancel" className="text-red-500 text-[20px]" />
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-red-700 dark:text-red-400">{data.notEatingCount}</p>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Icon name="unfold_more" className="text-[12px]" /> Bấm xem theo phòng ban
                        </p>
                    </button>
                    {expandedCard === 'not_eating' && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl mt-2 p-3 border border-red-200 dark:border-red-800/30 shadow-lg">
                            <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">
                                <Icon name="cancel" className="text-[14px] align-middle mr-1" />
                                Danh sách NV hủy ăn theo phòng ban
                            </p>
                            {renderDeptList('not_eating')}
                        </div>
                    )}
                </div>

                {/* Card 3: Suất phát sinh */}
                <div className="col-span-1">
                    <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 p-4 md:p-5 rounded-2xl border-2 border-purple-100 dark:border-purple-800/30">
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-500 text-xs font-semibold">Suất phát sinh</p>
                            <Icon name="person_add" className="text-purple-500 text-[20px]" />
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-purple-700 dark:text-purple-400">{data.guestMeals}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Khách / thêm suất</p>
                    </div>
                </div>

                {/* Card 4: TỔNG suất bếp cần nấu */}
                <div className="col-span-1">
                    <button
                        onClick={() => toggleCard('total')}
                        className={`w-full text-left bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 md:p-5 rounded-2xl border-2 transition-all hover:shadow-md ${expandedCard === 'total' ? 'border-blue-400 shadow-md' : 'border-blue-100 dark:border-blue-800/30'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-500 text-xs font-semibold">Tổng suất nấu</p>
                            <Icon name="cooking" className="text-blue-500 text-[20px]" />
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-blue-700 dark:text-blue-400">
                            {data.eatingCount + data.guestMeals}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                            {data.eatingCount} NV + {data.guestMeals} phát sinh
                        </p>
                    </button>
                    {expandedCard === 'total' && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl mt-2 p-3 border border-blue-200 dark:border-blue-800/30 shadow-lg">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">
                                <Icon name="groups" className="text-[14px] align-middle mr-1" />
                                Tất cả NV theo phòng ban
                            </p>
                            {renderDeptList('all')}
                        </div>
                    )}
                </div>

                {/* Card 5: Tỷ lệ hủy */}
                <div className="col-span-1">
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 md:p-5 rounded-2xl border-2 border-amber-100 dark:border-amber-800/30">
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-slate-500 text-xs font-semibold">Tỷ lệ hủy</p>
                            <Icon name="percent" className="text-amber-500 text-[20px]" />
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-amber-700 dark:text-amber-400">{cancelRate}%</p>
                        <p className="text-[10px] text-slate-400 mt-1">{data.notEatingCount}/{data.totalEmployees} NV</p>
                    </div>
                </div>
            </div>
        </>
    );
}
