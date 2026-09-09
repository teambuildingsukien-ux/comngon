'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toLocalDateString } from '@/lib/utils/date-helpers';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

// Module-level singleton (PERF-2 fix)
const supabase = createClient();

interface LateLog {
    id: string;
    action: string;
    created_at: string;
    details: {
        user_name?: string;
        user_email?: string;
        department?: string;
        date?: string;
        status?: string;
        reason?: string;
        late_minutes?: number;
        deadline?: string;
        action_timestamp?: string;
    };
}

interface LateRegistrationsListProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LateRegistrationsList({ isOpen, onClose }: LateRegistrationsListProps) {
    const [logs, setLogs] = useState<LateLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));
    const [dateFrom, setDateFrom] = useState(toLocalDateString(new Date()));
    const [dateTo, setDateTo] = useState(toLocalDateString(new Date()));
    const [filterMode, setFilterMode] = useState<'day' | 'range'>('day');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, selectedDate, dateFrom, dateTo, filterMode]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const from = filterMode === 'day' ? selectedDate : dateFrom;
            const to = filterMode === 'day' ? selectedDate : dateTo;

            const { data, error } = await supabase
                .from('activity_logs')
                .select('id, action, created_at, details')
                .in('action', ['late_meal_registration', 'late_meal_cancellation'])
                .gte('created_at', from + 'T00:00:00+07:00')
                .lte('created_at', to + 'T23:59:59+07:00')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setLogs((data || []) as LateLog[]);
        } catch (error) {
            console.error('Error fetching late logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const from = filterMode === 'day' ? selectedDate : dateFrom;
            const to = filterMode === 'day' ? selectedDate : dateTo;

            const res = await fetch(`/api/admin/export/late-registrations?from=${from}&to=${to}`);
            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dang-ky-muon_${from}${to !== from ? '_den_' + to : ''}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const formatTime = (timestamp: string) => {
        try {
            return new Date(timestamp).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
            });
        } catch { return 'N/A'; }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-[#dbdfe6] dark:border-slate-800 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-[#111318] dark:text-white flex items-center gap-2">
                            <Icon name="schedule_send" className="text-amber-500" />
                            Đăng ký muộn
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">{logs.length} bản ghi</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-9 flex items-center justify-center rounded-full hover:bg-[#f5f1ee] dark:hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="close" className="text-xl text-[#606e8a]" />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 border-b border-[#dbdfe6] dark:border-slate-800 shrink-0">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Filter mode toggle */}
                        <div className="flex bg-[#f5f1ee] dark:bg-slate-800 rounded-lg p-0.5">
                            <button
                                onClick={() => setFilterMode('day')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterMode === 'day' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'
                                    }`}
                            >
                                Theo ngày
                            </button>
                            <button
                                onClick={() => setFilterMode('range')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterMode === 'range' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'
                                    }`}
                            >
                                Khoảng ngày
                            </button>
                        </div>

                        {filterMode === 'day' ? (
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="px-3 py-1.5 text-sm bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="px-3 py-1.5 text-sm bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg"
                                />
                                <span className="text-slate-400 text-xs">→</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="px-3 py-1.5 text-sm bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg"
                                />
                            </div>
                        )}

                        <button
                            onClick={handleExportExcel}
                            disabled={isExporting || logs.length === 0}
                            className="ml-auto px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all"
                        >
                            <Icon name="download" className="text-[16px]" />
                            {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-auto flex-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B24700]"></div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <Icon name="event_available" className="text-[48px] mb-3" />
                            <p className="font-bold">Không có đăng ký muộn</p>
                            <p className="text-xs mt-1">Tất cả nhân viên đều gửi đúng hạn 🎉</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-[#f5f1ee] dark:bg-slate-800 sticky top-0">
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">#</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Nhân viên</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Phòng ban</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Loại</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Lý do</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Trễ</th>
                                    <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase">Thời gian</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {logs.map((log, index) => {
                                    const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                                    const isRegistration = log.action === 'late_meal_registration';
                                    return (
                                        <tr key={log.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="py-3 px-4 text-slate-400 font-mono text-xs">{index + 1}</td>
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-[#111318] dark:text-white text-xs">{d.user_name || 'N/A'}</div>
                                                <div className="text-[10px] text-slate-400">{d.user_email || ''}</div>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{d.department || 'N/A'}</td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isRegistration
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    }`}>
                                                    {isRegistration ? '🍚 Đăng ký' : '❌ Hủy ăn'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title={d.reason || ''}>
                                                {d.reason || <span className="text-slate-300 italic">—</span>}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-xs font-bold text-amber-600">{d.late_minutes || 0}p</span>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-500">
                                                {d.action_timestamp ? formatTime(d.action_timestamp) : formatTime(log.created_at)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
