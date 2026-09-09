'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type WeekStats = {
    avgMeals: number;
    eatingRate: number;
    lateCancel: number;
    lateRegister: number;
    totalEating: number;
    totalOrders: number;
    workDays: number;
};

const EMPTY_STATS: WeekStats = { avgMeals: 0, eatingRate: 0, lateCancel: 0, lateRegister: 0, totalEating: 0, totalOrders: 0, workDays: 0 };

function getWeekRange(weeksAgo: number): { start: string; end: string } {
    const now = new Date();
    // Tính ngày hiện tại theo local timezone
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay(); // 0=CN, 1=T2...

    // Tìm Thứ 2 tuần hiện tại
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    // Shift theo weeksAgo
    monday.setDate(monday.getDate() - weeksAgo * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(monday), end: fmt(friday) };
}

function formatDateRange(start: string, end: string): string {
    const [, sm, sd] = start.split('-');
    const [, em, ed] = end.split('-');
    return `${parseInt(sd)}/${parseInt(sm)} — ${parseInt(ed)}/${parseInt(em)}`;
}

export default function WeeklyComparison() {
    const [thisWeek, setThisWeek] = useState<WeekStats>(EMPTY_STATS);
    const [lastWeek, setLastWeek] = useState<WeekStats>(EMPTY_STATS);
    const [isLoading, setIsLoading] = useState(true);
    const [ranges, setRanges] = useState({ thisWeek: { start: '', end: '' }, lastWeek: { start: '', end: '' } });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', user.id)
                .single();
            if (!profile) return;

            const thisRange = getWeekRange(0);
            const lastRange = getWeekRange(1);
            setRanges({ thisWeek: thisRange, lastWeek: lastRange });

            // Fetch cooking exceptions to exclude no_cook days
            const { data: exceptions } = await supabase
                .from('cooking_exceptions')
                .select('date, type')
                .eq('tenant_id', profile.tenant_id)
                .gte('date', lastRange.start)
                .lte('date', thisRange.end);

            const noCookDays = new Set(
                exceptions?.filter(e => e.type === 'no_cook').map(e => e.date) || []
            );

            // Fetch cooking days setting
            const { data: cookingSetting } = await supabase
                .from('system_settings')
                .select('value')
                .eq('tenant_id', profile.tenant_id)
                .eq('key', 'cooking_days')
                .single();

            let startDay = 1, endDay = 5;
            if (cookingSetting?.value) {
                try {
                    const parsed = typeof cookingSetting.value === 'string' ? JSON.parse(cookingSetting.value) : cookingSetting.value;
                    startDay = parsed.start_day ?? 1;
                    endDay = parsed.end_day ?? 5;
                } catch { /* default */ }
            }

            // Fetch orders for both weeks
            const { data: orders } = await supabase
                .from('orders')
                .select('date, status, is_late')
                .eq('tenant_id', profile.tenant_id)
                .gte('date', lastRange.start)
                .lte('date', thisRange.end);

            // Calculate stats for each week
            const calcStats = (range: { start: string; end: string }): WeekStats => {
                const weekOrders = orders?.filter(o => o.date >= range.start && o.date <= range.end) || [];

                // Count actual cooking days in range
                const dates = new Set(weekOrders.map(o => o.date));
                // Also add dates from range that might have no orders
                const dStart = new Date(range.start + 'T00:00:00');
                const dEnd = new Date(range.end + 'T00:00:00');
                for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
                    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dow = d.getDay();
                    const isCookDay = startDay <= endDay
                        ? dow >= startDay && dow <= endDay
                        : dow >= startDay || dow <= endDay;
                    if (isCookDay && !noCookDays.has(ds)) dates.add(ds);
                }

                let totalEating = 0;
                let totalOrders = 0;
                let lateCancel = 0;
                let lateRegister = 0;

                weekOrders.forEach(o => {
                    totalOrders++;
                    if (o.status === 'eating') totalEating++;
                    if (o.is_late && o.status === 'not_eating') lateCancel++;
                    if (o.is_late && o.status === 'eating') lateRegister++;
                });

                // Only count cooking days that exist in our range
                const cookingDaysInRange: string[] = [];
                for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
                    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dow = d.getDay();
                    const isCookDay = startDay <= endDay
                        ? dow >= startDay && dow <= endDay
                        : dow >= startDay || dow <= endDay;
                    if (isCookDay && !noCookDays.has(ds)) cookingDaysInRange.push(ds);
                }

                const workDays = cookingDaysInRange.length;
                const avgMeals = workDays > 0 ? Math.round(totalEating / workDays) : 0;
                const eatingRate = totalOrders > 0 ? Math.round((totalEating / totalOrders) * 1000) / 10 : 0;

                return { avgMeals, eatingRate, lateCancel, lateRegister, totalEating, totalOrders, workDays };
            };

            setThisWeek(calcStats(thisRange));
            setLastWeek(calcStats(lastRange));
        } catch (err) {
            console.error('WeeklyComparison error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getDiff = (current: number, previous: number) => {
        const diff = current - previous;
        if (diff === 0) return { text: '—', color: 'text-gray-400', arrow: '' };
        if (diff > 0) return { text: `+${diff}`, color: 'text-emerald-600', arrow: '▲' };
        return { text: `${diff}`, color: 'text-red-500', arrow: '▼' };
    };

    const getDiffPercent = (current: number, previous: number) => {
        const diff = +(current - previous).toFixed(1);
        if (diff === 0) return { text: '—', color: 'text-gray-400', arrow: '' };
        if (diff > 0) return { text: `+${diff}%`, color: 'text-emerald-600', arrow: '▲' };
        return { text: `${diff}%`, color: 'text-red-500', arrow: '▼' };
    };

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const cards = [
        {
            label: 'TB suất/ngày',
            value: thisWeek.avgMeals,
            diff: getDiff(thisWeek.avgMeals, lastWeek.avgMeals),
            prev: lastWeek.avgMeals,
            bg: 'bg-orange-50 dark:bg-orange-900/20',
            valueColor: 'text-[#c04b00]',
        },
        {
            label: 'Tỷ lệ ăn',
            value: `${thisWeek.eatingRate}%`,
            diff: getDiffPercent(thisWeek.eatingRate, lastWeek.eatingRate),
            prev: `${lastWeek.eatingRate}%`,
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            valueColor: 'text-emerald-600',
        },
        {
            label: 'Hủy muộn',
            value: thisWeek.lateCancel,
            diff: getDiff(thisWeek.lateCancel, lastWeek.lateCancel),
            prev: lastWeek.lateCancel,
            bg: 'bg-red-50 dark:bg-red-900/20',
            valueColor: 'text-red-600',
            invertColor: true, // Hủy muộn tăng = xấu
        },
        {
            label: 'ĐK muộn',
            value: thisWeek.lateRegister,
            diff: getDiff(thisWeek.lateRegister, lastWeek.lateRegister),
            prev: lastWeek.lateRegister,
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            valueColor: 'text-blue-600',
        },
    ];

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-bold dark:text-white">📊 Tổng quan tuần</h3>
                    <p className="text-sm text-[#606e8a]">
                        {formatDateRange(ranges.thisWeek.start, ranges.thisWeek.end)} vs {formatDateRange(ranges.lastWeek.start, ranges.lastWeek.end)}
                    </p>
                </div>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cards.map((card, i) => (
                    <div key={i} className={`${card.bg} p-4 rounded-xl text-center transition-transform hover:scale-[1.02]`}>
                        <p className="text-xs text-[#606e8a] mb-1.5 font-medium">{card.label}</p>
                        <p className={`text-2xl font-black ${card.valueColor}`}>{card.value}</p>
                        <div className="flex items-center justify-center gap-1 mt-1.5">
                            <span className={`text-xs font-bold ${card.invertColor ? (card.diff.arrow === '▲' ? 'text-red-500' : card.diff.arrow === '▼' ? 'text-emerald-600' : 'text-gray-400') : card.diff.color}`}>
                                {card.diff.arrow} {card.diff.text}
                            </span>
                        </div>
                        <p className="text-[10px] text-[#606e8a] mt-0.5">vs {card.prev}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
