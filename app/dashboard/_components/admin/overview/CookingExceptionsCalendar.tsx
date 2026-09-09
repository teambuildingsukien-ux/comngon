'use client';

import { useState, useEffect } from 'react';
import { toLocalDateString } from '@/lib/utils/date-helpers';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface ExceptionDay {
    date: string;
    type: 'no_cook' | 'extra_cook';
    reason: string;
}

interface CookingExceptionsCalendarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CookingExceptionsCalendar({ isOpen, onClose }: CookingExceptionsCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [cookingDays, setCookingDays] = useState({ start_day: 1, end_day: 5 });
    const [exceptions, setExceptions] = useState<ExceptionDay[]>([]);
    const [pendingChanges, setPendingChanges] = useState<Map<string, ExceptionDay | null>>(new Map());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reasonInput, setReasonInput] = useState('');
    const [reasonDate, setReasonDate] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, currentMonth]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const year = currentMonth.getFullYear();
            const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
            const monthStr = `${year}-${month}`;

            const [cookingRes, exceptionsRes] = await Promise.all([
                fetch('/api/admin/settings/cooking-days'),
                fetch(`/api/admin/settings/cooking-exceptions?month=${monthStr}`)
            ]);

            if (cookingRes.ok) {
                const result = await cookingRes.json();
                setCookingDays(result.data);
            }
            if (exceptionsRes.ok) {
                const result = await exceptionsRes.json();
                setExceptions(result.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const isDefaultCookingDay = (dayIndex: number) => {
        if (cookingDays.start_day <= cookingDays.end_day) {
            return dayIndex >= cookingDays.start_day && dayIndex <= cookingDays.end_day;
        }
        return dayIndex >= cookingDays.start_day || dayIndex <= cookingDays.end_day;
    };

    const getEffectiveStatus = (dateStr: string, dayIndex: number): 'cooking' | 'not_cooking' | 'no_cook_exception' | 'extra_cook_exception' => {
        // Check pending changes first
        const pending = pendingChanges.get(dateStr);
        if (pending !== undefined) {
            if (pending === null) {
                // Removed exception → back to default
                return isDefaultCookingDay(dayIndex) ? 'cooking' : 'not_cooking';
            }
            return pending.type === 'no_cook' ? 'no_cook_exception' : 'extra_cook_exception';
        }

        // Check existing exceptions
        const existing = exceptions.find(e => e.date === dateStr);
        if (existing) {
            return existing.type === 'no_cook' ? 'no_cook_exception' : 'extra_cook_exception';
        }

        return isDefaultCookingDay(dayIndex) ? 'cooking' : 'not_cooking';
    };

    const getExceptionReason = (dateStr: string): string => {
        const pending = pendingChanges.get(dateStr);
        if (pending) return pending.reason;
        const existing = exceptions.find(e => e.date === dateStr);
        return existing?.reason || '';
    };

    const toggleDay = (dateStr: string, dayIndex: number) => {
        const status = getEffectiveStatus(dateStr, dayIndex);
        const newChanges = new Map(pendingChanges);

        if (status === 'cooking') {
            // Default cooking day → make no_cook exception
            setReasonDate(dateStr);
            setReasonInput('');
        } else if (status === 'not_cooking') {
            // Default non-cooking day → make extra_cook exception
            newChanges.set(dateStr, { date: dateStr, type: 'extra_cook', reason: 'Nấu bù' });
            setPendingChanges(newChanges);
        } else if (status === 'no_cook_exception' || status === 'extra_cook_exception') {
            // Has exception → remove it (back to default)
            const existing = exceptions.find(e => e.date === dateStr);
            if (existing) {
                newChanges.set(dateStr, null as any); // null = delete
            } else {
                newChanges.delete(dateStr);
            }
            setPendingChanges(newChanges);
        }
    };

    const confirmReason = () => {
        if (!reasonDate) return;
        const newChanges = new Map(pendingChanges);
        newChanges.set(reasonDate, { date: reasonDate, type: 'no_cook', reason: reasonInput || 'Nghỉ bếp' });
        setPendingChanges(newChanges);
        setReasonDate(null);
        setReasonInput('');
    };

    const handleSave = async () => {
        if (pendingChanges.size === 0) return;
        setSaving(true);
        try {
            let successCount = 0;
            let totalCancelled = 0;
            let totalRestored = 0;

            for (const [date, change] of pendingChanges) {
                if (change === null) {
                    // Delete exception — auto-restore orders nếu đây là no_cook
                    const res = await fetch('/api/admin/settings/cooking-exceptions', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, restore_orders: true })
                    });
                    if (res.ok) {
                        successCount++;
                        const result = await res.json();
                        totalRestored += result.restored_count || 0;
                    }
                } else {
                    // Create/update exception
                    const res = await fetch('/api/admin/settings/cooking-exceptions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(change)
                    });
                    if (res.ok) {
                        successCount++;
                        const result = await res.json();
                        totalCancelled += result.cancelled_count || 0;
                        totalRestored += result.restored_count || 0;
                    }
                }
            }

            // Tạo thông báo chi tiết
            let msg = `✅ Đã lưu ${successCount} thay đổi!`;
            if (totalCancelled > 0) {
                msg += `\n⚠️ Đã tự động hủy ${totalCancelled} suất ăn (ngày nghỉ bếp).`;
            }
            if (totalRestored > 0) {
                msg += `\n🔄 Đã khôi phục ${totalRestored} suất ăn (đã nấu lại).`;
            }
            alert(msg);

            setPendingChanges(new Map());
            fetchData();
        } catch (error) {
            console.error('Failed to save:', error);
            alert('Có lỗi xảy ra');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    // Generate calendar days
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const monthName = currentMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

    const calendarDays = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(year, month, d);
        calendarDays.push({
            date: toLocalDateString(date),
            dayOfMonth: d,
            dayIndex: date.getDay(),
            isPast: date < new Date(new Date().setHours(0, 0, 0, 0)),
            isToday: toLocalDateString(date) === toLocalDateString(new Date())
        });
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">
                                🗓️ Quản lý ngày nghỉ/nấu bếp
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Click vào ngày để bật/tắt nấu ăn
                            </p>
                        </div>
                        <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                            <Icon name="close" className="text-2xl text-slate-500" />
                        </button>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-4 text-xs">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-green-100 border-2 border-green-400 rounded"></div>
                            <span className="text-slate-600 dark:text-slate-400">Ngày nấu (mặc định)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-slate-100 border-2 border-slate-300 rounded"></div>
                            <span className="text-slate-600 dark:text-slate-400">Ngày nghỉ (mặc định)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-red-100 border-2 border-red-400 rounded"></div>
                            <span className="text-slate-600 dark:text-slate-400">Nghỉ bếp (ngoại lệ)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-blue-100 border-2 border-blue-400 rounded"></div>
                            <span className="text-slate-600 dark:text-slate-400">Nấu thêm (ngoại lệ)</span>
                        </div>
                    </div>
                </div>

                {/* Month Nav */}
                <div className="flex items-center justify-between px-6 py-3">
                    <button onClick={() => setCurrentMonth(new Date(year, month - 1))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                        <Icon name="chevron_left" className="text-[24px] text-slate-600" />
                    </button>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white capitalize">{monthName}</h3>
                    <button onClick={() => setCurrentMonth(new Date(year, month + 1))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                        <Icon name="chevron_right" className="text-[24px] text-slate-600" />
                    </button>
                </div>

                {/* Calendar */}
                <div className="px-6 pb-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin">
                                <Icon name="refresh" className="text-[40px] text-slate-400" />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Day headers */}
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {dayNames.map(day => (
                                    <div key={day} className="text-center text-xs font-bold text-slate-500 py-1">{day}</div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div className="grid grid-cols-7 gap-1">
                                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                    <div key={`empty-${i}`} className="aspect-square"></div>
                                ))}

                                {calendarDays.map(day => {
                                    const status = getEffectiveStatus(day.date, day.dayIndex);
                                    const reason = getExceptionReason(day.date);
                                    const hasPendingChange = pendingChanges.has(day.date);

                                    let bgColor = '', borderColor = '', textColor = 'text-slate-900 dark:text-white', icon = '', iconColor = '';

                                    switch (status) {
                                        case 'cooking':
                                            bgColor = 'bg-green-50 dark:bg-green-900/20';
                                            borderColor = 'border-green-300 dark:border-green-700';
                                            icon = 'restaurant';
                                            iconColor = 'text-green-500';
                                            break;
                                        case 'not_cooking':
                                            bgColor = 'bg-slate-50 dark:bg-slate-800/50';
                                            borderColor = 'border-slate-200 dark:border-slate-700';
                                            textColor = 'text-slate-400';
                                            break;
                                        case 'no_cook_exception':
                                            bgColor = 'bg-red-50 dark:bg-red-900/20';
                                            borderColor = 'border-red-300 dark:border-red-700';
                                            icon = 'block';
                                            iconColor = 'text-red-500';
                                            break;
                                        case 'extra_cook_exception':
                                            bgColor = 'bg-blue-50 dark:bg-blue-900/20';
                                            borderColor = 'border-blue-300 dark:border-blue-700';
                                            icon = 'add_circle';
                                            iconColor = 'text-blue-500';
                                            break;
                                    }

                                    return (
                                        <button
                                            key={day.date}
                                            onClick={() => toggleDay(day.date, day.dayIndex)}
                                            title={reason ? `${reason}` : undefined}
                                            className={`aspect-square rounded-xl border-2 ${bgColor} ${borderColor} ${textColor} 
                                                ${hasPendingChange ? 'ring-2 ring-amber-400 ring-offset-1' : ''} 
                                                ${day.isToday ? 'border-[#B24700] border-2' : ''} 
                                                cursor-pointer hover:opacity-80 transition-all flex flex-col items-center justify-center p-0.5 relative`}
                                        >
                                            <span className="text-[10px] font-medium">{dayNames[day.dayIndex]}</span>
                                            <span className="text-sm font-bold">{day.dayOfMonth}</span>
                                            {icon && <Icon name={icon} className={`text-[12px] ${iconColor}`} />}
                                            {hasPendingChange && (
                                                <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full"></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Reason Input Modal */}
                {reasonDate && (
                    <div className="mx-6 mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2">
                            📝 Lý do nghỉ bếp ngày {reasonDate}:
                        </p>
                        <input
                            type="text"
                            value={reasonInput}
                            onChange={(e) => setReasonInput(e.target.value)}
                            placeholder="VD: Nghỉ lễ, Tiệc công ty..."
                            className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-amber-300 rounded-lg text-sm"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && confirmReason()}
                        />
                        <div className="flex gap-2 mt-2">
                            <button onClick={confirmReason} className="px-4 py-1.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600">
                                Xác nhận
                            </button>
                            <button onClick={() => setReasonDate(null)} className="px-4 py-1.5 bg-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-300">
                                Hủy
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-slate-500">
                            Thay đổi chưa lưu: <span className="font-bold text-amber-600">{pendingChanges.size}</span>
                        </p>
                        {pendingChanges.size > 0 && (
                            <button onClick={() => setPendingChanges(new Map())} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                                Bỏ tất cả
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white font-bold rounded-xl hover:opacity-80">
                            Đóng
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={pendingChanges.size === 0 || saving}
                            className="flex-1 h-12 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                        >
                            {saving ? 'Đang lưu...' : `Lưu ${pendingChanges.size} thay đổi`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
