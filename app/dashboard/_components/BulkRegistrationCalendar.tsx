'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toLocalDateString } from '@/lib/utils/date-helpers';


// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface DayData {
    date: string; // YYYY-MM-DD
    dayOfMonth: number;
    dayName: string;
    isToday: boolean;
    isPast: boolean;
    isCookingDay: boolean;
    isRegistered: boolean;
    isOptedOut: boolean;
    isLockedToday: boolean; // true = hôm nay + quá deadline → KHÔNG cho chọn
}

interface BulkRegistrationCalendarProps {
    onClose: () => void;
}

export default function BulkRegistrationCalendar({ onClose }: BulkRegistrationCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
    const [calendarDays, setCalendarDays] = useState<DayData[]>([]);
    const [loading, setLoading] = useState(true);
    const [cookingDays, setCookingDays] = useState({ start_day: 1, end_day: 5 });
    const [processing, setProcessing] = useState(false);
    const [deadlineTime, setDeadlineTime] = useState('08:00');
    const [deadlineEnabled, setDeadlineEnabled] = useState(false);
    const [exceptions, setExceptions] = useState<Map<string, { type: string; reason: string }>>(new Map());

    useEffect(() => {
        fetchCookingDays();
        fetchDeadlineSettings();
    }, []);

    useEffect(() => {
        if (cookingDays) {
            loadCalendar();
        }
    }, [currentMonth, cookingDays]);

    const fetchCookingDays = async () => {
        try {
            const response = await fetch('/api/admin/settings/cooking-days');
            if (response.ok) {
                const result = await response.json();
                setCookingDays(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch cooking days:', error);
        }
    };

    const fetchDeadlineSettings = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
            if (!profile?.tenant_id) return;
            const { data: settings } = await supabase.from('system_settings')
                .select('key, value')
                .eq('tenant_id', profile.tenant_id)
                .in('key', ['registration_deadline', 'registration_deadline_enabled']);
            const dl = settings?.find(s => s.key === 'registration_deadline')?.value || '08:00';
            const dlEnabled = settings?.find(s => s.key === 'registration_deadline_enabled')?.value === 'true';
            setDeadlineTime(dl);
            setDeadlineEnabled(dlEnabled);
        } catch (error) {
            console.error('Failed to fetch deadline settings:', error);
        }
    };

    const loadCalendar = async () => {
        setLoading(true);
        try {
            const supabase = createClient();

            // Get user session
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('No user found');
                return;
            }

            // Get first and last day of current month
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            // Get all user's orders for this month
            const firstDateStr = toLocalDateString(firstDay);
            const lastDateStr = toLocalDateString(lastDay);

            const { data: orders } = await supabase
                .from('orders')
                .select('date, status')
                .eq('user_id', user.id)
                .gte('date', firstDateStr)
                .lte('date', lastDateStr);

            // Fetch cooking exceptions for this month
            const monthParam = `${year}-${String(month + 1).padStart(2, '0')}`;
            const exMap = new Map<string, { type: string; reason: string }>();
            try {
                const exRes = await fetch(`/api/admin/settings/cooking-exceptions?month=${monthParam}`);
                if (exRes.ok) {
                    const exResult = await exRes.json();
                    (exResult.data || []).forEach((ex: { date: string; type: string; reason: string }) => {
                        exMap.set(ex.date, { type: ex.type, reason: ex.reason });
                    });
                    setExceptions(exMap);
                }
            } catch { /* ignore */ }

            const orderMap = new Map<string, string>();
            orders?.forEach(order => {
                orderMap.set(order.date, order.status);
            });

            // Generate calendar days
            const days: DayData[] = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Check if today is past deadline
            const todayStr = toLocalDateString(new Date());
            const now = new Date();
            const deadlineDT = new Date(todayStr + 'T' + deadlineTime + ':00+07:00');
            const isTodayPastDeadline = deadlineEnabled && now > deadlineDT;

            const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

            for (let d = 1; d <= lastDay.getDate(); d++) {
                const date = new Date(year, month, d);
                const dateStr = toLocalDateString(date);
                const dayIndex = date.getDay();

                // Check if it's a cooking day (base setting)
                let isCookingDay = false;
                if (cookingDays.start_day <= cookingDays.end_day) {
                    isCookingDay = dayIndex >= cookingDays.start_day && dayIndex <= cookingDays.end_day;
                } else {
                    isCookingDay = dayIndex >= cookingDays.start_day || dayIndex <= cookingDays.end_day;
                }

                // Apply cooking exceptions (use local exMap, NOT state — setState is async!)
                const exception = exMap.get(dateStr);
                if (exception) {
                    if (exception.type === 'no_cook') isCookingDay = false;
                    if (exception.type === 'extra_cook') isCookingDay = true;
                }

                const orderStatus = orderMap.get(dateStr);
                const isToday = date.getTime() === today.getTime();

                days.push({
                    date: dateStr,
                    dayOfMonth: d,
                    dayName: dayNames[dayIndex],
                    isToday,
                    isPast: date < today,
                    isCookingDay,
                    isRegistered: orderStatus === 'eating',
                    isOptedOut: orderStatus === 'not_eating',
                    isLockedToday: isToday && isTodayPastDeadline
                });
            }

            setCalendarDays(days);
        } catch (error) {
            console.error('Error loading calendar:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleDateSelection = (dateStr: string, day: DayData) => {
        if (day.isPast || !day.isCookingDay || day.isLockedToday) return;

        const newSelected = new Set(selectedDates);
        if (newSelected.has(dateStr)) {
            newSelected.delete(dateStr);
        } else {
            newSelected.add(dateStr);
        }
        setSelectedDates(newSelected);
    };

    const handleBulkRegister = async () => {
        if (selectedDates.size === 0) {
            alert('Vui lòng chọn ít nhất 1 ngày');
            return;
        }

        setProcessing(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get user's tenant_id
            const { data: profile } = await supabase
                .from('users')
                .select('id, tenant_id, full_name, status')
                .eq('id', user.id)
                .single();

            if (!profile || !profile.tenant_id) return;

            // ✅ Block paused/resigned users from bulk operations
            if (profile.status === 'paused' || profile.status === 'resigned') {
                alert('Tài khoản đang tạm dừng hoặc đã nghỉ — không thể đăng ký/báo nghỉ.');
                return;
            }

            const dates = Array.from(selectedDates);
            let successCount = 0;
            let failCount = 0;

            // Register for all selected dates using atomic upsert
            const now = new Date();
            const todayStr = toLocalDateString(new Date());
            const deadlineDT = new Date(todayStr + 'T' + deadlineTime + ':00+07:00');

            for (const date of dates) {
                // ⚠️ v5.6.0: Tính is_late cho từng ngày
                const isLate = deadlineEnabled && date === todayStr && now > deadlineDT;

                // Atomic upsert - handles both insert and update in one operation
                const { error: upsertError } = await supabase
                    .from('orders')
                    .upsert({
                        tenant_id: profile.tenant_id,
                        user_id: profile.id,
                        date: date,
                        status: 'eating',
                        is_late: isLate,
                        updated_at: now.toISOString(),
                        source: 'user_calendar',
                    }, { onConflict: 'tenant_id,user_id,date' });

                if (upsertError) {
                    console.error(`[BulkRegister] Failed to upsert order for ${date}:`, upsertError);
                    failCount++;
                    continue;
                }

                successCount++;

                // Log activity — ⚠️ v5.6.0: phân biệt late vs on-time
                const { error: logError } = await supabase.from('activity_logs').insert({
                    tenant_id: profile.tenant_id,
                    action: isLate ? 'late_meal_registration' : 'meal_registration',
                    performed_by: profile.id,
                    target_type: 'order',
                    target_id: profile.id,
                    details: {
                        date,
                        status: 'eating',
                        is_late: isLate,
                        source: 'calendar_bulk',
                        user_name: profile.full_name,
                        user_email: user.email
                    }
                });

                if (logError) {
                    console.error(`[BulkRegister] Failed to log activity for ${date}:`, logError);
                }
            }

            if (failCount > 0) {
                alert(`Đăng ký: ${successCount} thành công, ${failCount} thất bại. Vui lòng thử lại.`);
            } else {
                alert(`Đã đăng ký thành công ${successCount} ngày!`);
            }
            setSelectedDates(new Set());
            loadCalendar();
        } catch (error) {
            console.error('[BulkRegister] Error:', error);
            alert('Có lỗi xảy ra khi đăng ký');
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkOptOut = async () => {
        if (selectedDates.size === 0) {
            alert('Vui lòng chọn ít nhất 1 ngày');
            return;
        }

        setProcessing(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get user's tenant_id
            const { data: profile } = await supabase
                .from('users')
                .select('id, tenant_id, full_name, status')
                .eq('id', user.id)
                .single();

            if (!profile || !profile.tenant_id) return;

            // ✅ Block paused/resigned users from bulk operations
            if (profile.status === 'paused' || profile.status === 'resigned') {
                alert('Tài khoản đang tạm dừng hoặc đã nghỉ — không thể đăng ký/báo nghỉ.');
                return;
            }

            const dates = Array.from(selectedDates);
            let successCount = 0;
            let failCount = 0;

            const now = new Date();
            const todayStr = toLocalDateString(new Date());
            const deadlineDT = new Date(todayStr + 'T' + deadlineTime + ':00+07:00');

            for (const date of dates) {
                // ⚠️ v5.6.0: Tính is_late cho từng ngày
                const isLate = deadlineEnabled && date === todayStr && now > deadlineDT;

                // Atomic upsert - handles both insert and update in one operation
                const { error: upsertError } = await supabase
                    .from('orders')
                    .upsert({
                        tenant_id: profile.tenant_id,
                        user_id: profile.id,
                        date: date,
                        status: 'not_eating',
                        is_late: isLate,
                        updated_at: now.toISOString(),
                        source: 'user_calendar',
                    }, { onConflict: 'tenant_id,user_id,date' });

                if (upsertError) {
                    console.error(`[BulkOptOut] Failed to upsert order for ${date}:`, upsertError);
                    failCount++;
                    continue;
                }

                successCount++;

                // Log activity — ⚠️ v5.6.0: phân biệt late vs on-time
                const { error: logError } = await supabase.from('activity_logs').insert({
                    tenant_id: profile.tenant_id,
                    action: isLate ? 'late_meal_cancellation' : 'meal_cancellation',
                    performed_by: profile.id,
                    target_type: 'order',
                    target_id: profile.id,
                    details: {
                        date,
                        status: 'not_eating',
                        is_late: isLate,
                        source: 'calendar_bulk',
                        user_name: profile.full_name,
                        user_email: user.email
                    }
                });

                if (logError) {
                    console.error(`[BulkOptOut] Failed to log activity for ${date}:`, logError);
                }
            }

            if (failCount > 0) {
                alert(`Báo nghỉ: ${successCount} thành công, ${failCount} thất bại. Vui lòng thử lại.`);
            } else {
                alert(`Đã báo nghỉ thành công ${successCount} ngày!`);
            }
            setSelectedDates(new Set());
            loadCalendar();
        } catch (error) {
            console.error('[BulkOptOut] Error:', error);
            alert('Có lỗi xảy ra khi báo nghỉ');
        } finally {
            setProcessing(false);
        }
    };

    const previousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    const monthName = currentMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-[#FFFBF7] dark:bg-[#12100E] p-4 md:p-8 text-slate-900 dark:text-slate-100 transition-colors duration-300">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                            Đăng ký theo lịch
                        </h1>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                            Chọn nhiều ngày để đăng ký hoặc báo nghỉ hàng loạt
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-full font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-all duration-300 active:scale-95 text-xs sm:text-sm border border-slate-200/50 dark:border-white/5"
                    >
                        <Icon name="arrow_back" className="text-[18px]" />
                        Quay lại
                    </button>
                </div>

                {/* Legend - Chú giải các loại ngày */}
                <div className="flex flex-wrap gap-3 md:gap-4 text-[10px] md:text-xs bg-white/40 dark:bg-white/[0.02] border border-orange-100/20 dark:border-white/5 p-3 rounded-2xl">
                    <div className="flex items-center gap-1.5 font-semibold">
                        <div className="w-3.5 h-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg"></div>
                        <span className="text-slate-600 dark:text-slate-400">Đã đăng ký</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        <div className="w-3.5 h-3.5 bg-rose-500/20 border border-rose-500/40 rounded-lg"></div>
                        <span className="text-slate-600 dark:text-slate-400">Đã báo nghỉ</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        <div className="w-3.5 h-3.5 bg-gradient-to-br from-[#b24700] to-[#d65d0e] rounded-lg"></div>
                        <span className="text-slate-600 dark:text-slate-400">Đang chọn</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        <div className="w-3.5 h-3.5 bg-slate-100 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/30 rounded-lg"></div>
                        <span className="text-slate-600 dark:text-slate-400">Không nấu ăn</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        <div className="w-3.5 h-3.5 bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 rounded-lg flex items-center justify-center">
                            <Icon name="lock" className="text-[10px] text-amber-600 dark:text-amber-500" />
                        </div>
                        <span className="text-slate-600 dark:text-slate-400">Đã khóa</span>
                    </div>
                </div>
            </div>

            {/* Calendar Card */}
            <div className="max-w-4xl mx-auto bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-5 md:p-6 shadow-sm border border-orange-100/50 dark:border-white/5 transition-all duration-300">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-5">
                    <button
                        onClick={previousMonth}
                        className="w-9 h-9 rounded-full bg-slate-100/50 dark:bg-white/5 flex items-center justify-center hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all duration-300 active:scale-90"
                    >
                        <Icon name="chevron_left" className="text-[20px] text-slate-600 dark:text-slate-400" />
                    </button>
                    <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-white capitalize tracking-tight">
                        {monthName}
                    </h2>
                    <button
                        onClick={nextMonth}
                        className="w-9 h-9 rounded-full bg-slate-100/50 dark:bg-white/5 flex items-center justify-center hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all duration-300 active:scale-90"
                    >
                        <Icon name="chevron_right" className="text-[20px] text-slate-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Calendar Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-10 h-10 border-4 border-[#B24700] border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className="text-xs font-semibold text-slate-500">Đang tải lịch...</p>
                    </div>
                ) : (
                    <>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day, idx) => (
                                <div key={day} className={`text-center text-xs font-bold py-1.5 ${idx === 0 || idx === 6 ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar days */}
                        <div className="grid grid-cols-7 gap-2">
                            {/* Empty cells for days before month starts */}
                            {Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square opacity-0"></div>
                            ))}

                            {/* Actual days */}
                            {calendarDays.map(day => {
                                const isSelected = selectedDates.has(day.date);

                                let bgColor = 'bg-white/50 dark:bg-white/[0.02]';
                                let textColor = 'text-slate-800 dark:text-slate-200';
                                let borderColor = 'border-slate-100 dark:border-white/5';
                                let cursor = 'cursor-pointer hover:bg-orange-50/30 dark:hover:bg-white/5 hover:scale-[1.03]';

                                if (!day.isCookingDay) {
                                    bgColor = 'bg-slate-100/50 dark:bg-slate-900/40';
                                    textColor = 'text-slate-400 dark:text-slate-600';
                                    borderColor = 'border-transparent';
                                    cursor = 'cursor-not-allowed opacity-60';
                                }

                                if (day.isPast) {
                                    bgColor = 'bg-slate-50/30 dark:bg-slate-950/20';
                                    textColor = 'text-slate-300 dark:text-slate-700';
                                    borderColor = 'border-transparent';
                                    cursor = 'cursor-not-allowed opacity-50';
                                }

                                if (day.isRegistered && !isSelected) {
                                    bgColor = 'bg-emerald-500/10 dark:bg-[#10b981]/15';
                                    borderColor = 'border-emerald-500/20 dark:border-emerald-500/10';
                                    textColor = 'text-emerald-700 dark:text-emerald-400';
                                }

                                if (day.isOptedOut && !isSelected) {
                                    bgColor = 'bg-rose-500/10 dark:bg-[#f43f5e]/15';
                                    borderColor = 'border-rose-500/20 dark:border-rose-500/10';
                                    textColor = 'text-rose-700 dark:text-rose-400';
                                }

                                if (isSelected) {
                                    bgColor = 'bg-gradient-to-br from-[#b24700] to-[#d65d0e]';
                                    textColor = 'text-white font-extrabold';
                                    borderColor = 'border-[#b24700]/50';
                                    cursor = 'cursor-pointer hover:opacity-95';
                                }

                                if (day.isLockedToday) {
                                    bgColor = 'bg-amber-500/10 dark:bg-[#f59e0b]/15';
                                    textColor = 'text-amber-700 dark:text-amber-400';
                                    borderColor = 'border-amber-500/30 dark:border-amber-500/20';
                                    cursor = 'cursor-not-allowed opacity-80';
                                } else if (day.isToday && !isSelected) {
                                    borderColor = 'border-[#B24700] dark:border-[#B24700] border-[1.5px]';
                                }

                                return (
                                    <button
                                        key={day.date}
                                        onClick={() => toggleDateSelection(day.date, day)}
                                        disabled={day.isPast || !day.isCookingDay || day.isLockedToday}
                                        className={`aspect-square rounded-2xl border ${bgColor} ${textColor} ${borderColor} ${cursor} transition-all duration-300 flex flex-col items-center justify-between p-1.5 md:p-2.5 relative select-none`}
                                    >
                                        <span className="text-[9px] md:text-[10px] font-bold opacity-60 self-start">{day.dayOfMonth}</span>
                                        
                                        {/* Status Dot / Icon Indicator */}
                                        <div className="absolute bottom-1.5 right-1.5 flex items-center justify-center">
                                            {day.isRegistered && !isSelected && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                            )}
                                            {day.isOptedOut && !isSelected && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                            )}
                                            {day.isLockedToday && (
                                                <Icon name="lock" className="text-[12px] text-amber-600 dark:text-amber-500" />
                                            )}
                                        </div>

                                        {/* Hiển thị khi đang chọn */}
                                        {isSelected && (
                                            <Icon name="check" className="text-[14px] md:text-[16px] text-white absolute bottom-1 right-1" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Action Buttons */}
            <div className="max-w-4xl mx-auto mt-6">
                <div className="bg-white/70 dark:bg-[#161412]/60 backdrop-blur-md rounded-3xl p-5 md:p-6 shadow-sm border border-orange-100/50 dark:border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-semibold">
                            Đã chọn: <span className="font-extrabold text-slate-800 dark:text-white text-sm md:text-base">{selectedDates.size}</span> ngày
                        </p>
                        {selectedDates.size > 0 && (
                            <button
                                onClick={() => setSelectedDates(new Set())}
                                className="text-xs text-orange-700 dark:text-orange-400 hover:underline font-bold transition-all"
                            >
                                Bỏ chọn tất cả
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={handleBulkRegister}
                            disabled={selectedDates.size === 0 || processing}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#B24700] hover:bg-[#8d3800] text-white py-3 px-6 rounded-full font-black text-xs md:text-sm uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 shadow-md hover:shadow-lg active:scale-98"
                        >
                            <Icon name="restaurant" className="text-[18px] md:text-[20px]" />
                            Đăng ký ăn ({selectedDates.size} ngày)
                        </button>
                        <button
                            onClick={handleBulkOptOut}
                            disabled={selectedDates.size === 0 || processing}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 py-3 px-6 rounded-full font-black text-xs md:text-sm uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 shadow-sm hover:shadow active:scale-98 border border-slate-200/50 dark:border-white/5"
                        >
                            <Icon name="event_busy" className="text-[18px] md:text-[20px]" />
                            Báo nghỉ ({selectedDates.size} ngày)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
