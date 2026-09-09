'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ActivityLog {
    id: string;
    action: string;
    target_type: string;
    target_id: string;
    details: any;
    created_at: string;
    performer_name?: string;
    performed_by: {
        id: string;
        full_name: string;
        email: string;
        avatar_url?: string;
    } | null;
}

interface ActivityHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ACTION_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    'meal_registration': { icon: '🍽️', label: 'Đăng ký ăn', color: 'text-green-600' },
    'meal_cancellation': { icon: '🚫', label: 'Hủy suất ăn', color: 'text-red-600' },
    'user_created': { icon: '👤', label: 'Tạo nhân viên', color: 'text-blue-600' },
    'user_updated': { icon: '✏️', label: 'Cập nhật NV', color: 'text-yellow-600' },
    'user_deleted': { icon: '🗑️', label: 'Xóa nhân viên', color: 'text-red-600' },
    'group_created': { icon: '👥', label: 'Tạo nhóm', color: 'text-purple-600' },
    'shift_created': { icon: '⏰', label: 'Tạo ca làm', color: 'text-indigo-600' },
    'notification_sent': { icon: '📢', label: 'Gửi thông báo', color: 'text-orange-600' },
};

export default function ActivityHistoryModal({ isOpen, onClose }: ActivityHistoryModalProps) {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const supabase = createClient();

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen, page, actionFilter, fromDate, toDate]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '15',
            });

            if (actionFilter) params.append('action', actionFilter);
            if (fromDate) params.append('from_date', fromDate);
            if (toDate) params.append('to_date', toDate);

            const response = await fetch(`/api/admin/activity-logs?${params}`);
            const result = await response.json();

            if (result.success) {
                setLogs(result.data.logs);
                setTotal(result.data.total);
                setTotalPages(result.data.totalPages);
            }
        } catch (error) {
            console.error('Error fetching activity logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        });
    };

    const getActionConfig = (action: string) => {
        return ACTION_CONFIG[action] || {
            icon: '📝',
            label: action,
            color: 'text-gray-600'
        };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            📜 Lịch sử hoạt động
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Tổng {total} hoạt động
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-3xl">close</span>
                    </button>
                </div>

                {/* Filters */}
                <div className="p-6 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Loại hoạt động
                            </label>
                            <select
                                value={actionFilter}
                                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            >
                                <option value="">Tất cả</option>
                                <option value="meal_registration">Đăng ký ăn</option>
                                <option value="meal_cancellation">Hủy suất ăn</option>
                                <option value="user_created">Tạo nhân viên</option>
                                <option value="user_updated">Cập nhật NV</option>
                                <option value="notification_sent">Gửi thông báo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Từ ngày
                            </label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Đến ngày
                            </label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                                <p className="mt-4 text-gray-500 dark:text-gray-400">Đang tải...</p>
                            </div>
                        </div>
                    ) : logs.length > 0 ? (
                        <div className="space-y-4">
                            {logs.map((log) => {
                                const config = getActionConfig(log.action);
                                return (
                                    <div key={log.id} className="flex gap-4 group">
                                        {/* Timeline Icon */}
                                        <div className="flex flex-col items-center">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xl border-2 border-primary/30">
                                                {config.icon}
                                            </div>
                                            <div className="w-0.5 flex-1 bg-gray-200 dark:bg-slate-700 mt-2"></div>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 pb-8">
                                            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${log.performed_by ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                                                            {(log.performed_by?.full_name || log.performer_name || '??').split(' ').slice(-2).map(n => n[0]).join('').toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                                                {log.performed_by?.full_name || log.performer_name || 'Unknown User'}
                                                                {!log.performed_by && log.performer_name && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">Đã xóa</span>}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                {log.performed_by?.email || ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatTime(log.created_at)}
                                                    </span>
                                                </div>

                                                <div className={`text-sm font-medium ${config.color} mb-2`}>
                                                    {config.label}
                                                </div>

                                                {log.details && Object.keys(log.details).length > 0 && (
                                                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/50 rounded p-2">
                                                        {log.details.date && <span className="mr-3">📅 {log.details.date}</span>}
                                                        {log.details.status && <span className="mr-3">📊 {log.details.status}</span>}
                                                        {log.details.previous_status && <span>← {log.details.previous_status}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-center">
                                <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600">history</span>
                                <p className="mt-4 text-gray-500 dark:text-gray-400">Không có hoạt động nào</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Trang {page} / {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                ← Trước
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                            >
                                Sau →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
