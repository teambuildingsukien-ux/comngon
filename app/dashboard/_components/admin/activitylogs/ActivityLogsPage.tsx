'use client';

import { useState, useEffect } from 'react';

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

// ===== 27 ACTION TYPES — ĐẦY ĐỦ MỌI HÀNH ĐỘNG TRONG HỆ THỐNG =====
const ACTION_CONFIG: Record<string, { icon: string; label: string; color: string; description: string }> = {
    // === Nhân viên đăng ký ăn ===
    'meal_registration': {
        icon: '🍽️', label: 'Đăng ký ăn', color: 'text-emerald-600 dark:text-emerald-400',
        description: 'Nhân viên đăng ký ăn trưa'
    },
    'meal_cancellation': {
        icon: '🚫', label: 'Hủy suất ăn', color: 'text-red-600 dark:text-red-400',
        description: 'Nhân viên hủy đăng ký ăn trưa'
    },
    'late_meal_registration': {
        icon: '🕐', label: 'ĐK muộn', color: 'text-amber-600 dark:text-amber-400',
        description: 'Nhân viên đăng ký ăn sau hạn chót'
    },
    'late_meal_cancellation': {
        icon: '🕐', label: 'Hủy muộn', color: 'text-orange-600 dark:text-orange-400',
        description: 'Nhân viên hủy ăn sau hạn chót'
    },

    // === Quản lý nhân viên ===
    'CREATE_USER': {
        icon: '👤', label: 'Tạo NV', color: 'text-blue-600 dark:text-blue-400',
        description: 'Admin tạo nhân viên mới'
    },
    'user_created': {
        icon: '👤', label: 'Tạo NV', color: 'text-blue-600 dark:text-blue-400',
        description: 'Admin tạo nhân viên mới'
    },
    'UPDATE_USER': {
        icon: '✏️', label: 'Cập nhật NV', color: 'text-yellow-600 dark:text-yellow-400',
        description: 'Admin sửa thông tin nhân viên'
    },
    'user_updated': {
        icon: '✏️', label: 'Cập nhật NV', color: 'text-yellow-600 dark:text-yellow-400',
        description: 'Admin sửa thông tin nhân viên'
    },
    'DELETE_USER': {
        icon: '🗑️', label: 'Xóa NV', color: 'text-red-600 dark:text-red-400',
        description: 'Admin xóa nhân viên khỏi hệ thống'
    },
    'user_deleted': {
        icon: '🗑️', label: 'Xóa NV', color: 'text-red-600 dark:text-red-400',
        description: 'Admin xóa nhân viên khỏi hệ thống'
    },

    // === Nhóm/Phòng ban ===
    'group_created': {
        icon: '👥', label: 'Tạo nhóm', color: 'text-purple-600 dark:text-purple-400',
        description: 'Tạo nhóm (phòng ban) mới'
    },
    'group_updated': {
        icon: '✏️', label: 'Sửa nhóm', color: 'text-purple-500 dark:text-purple-300',
        description: 'Cập nhật thông tin nhóm'
    },
    'group_deleted': {
        icon: '🗑️', label: 'Xóa nhóm', color: 'text-red-600 dark:text-red-400',
        description: 'Xóa nhóm (phòng ban)'
    },
    'group_member_added': {
        icon: '➕', label: 'Thêm vào nhóm', color: 'text-teal-600 dark:text-teal-400',
        description: 'Thêm nhân viên vào nhóm'
    },
    'group_member_removed': {
        icon: '➖', label: 'Xóa khỏi nhóm', color: 'text-orange-600 dark:text-orange-400',
        description: 'Xóa nhân viên khỏi nhóm'
    },

    // === Ca làm việc ===
    'shift_created': {
        icon: '⏰', label: 'Tạo ca', color: 'text-indigo-600 dark:text-indigo-400',
        description: 'Tạo ca làm việc mới'
    },
    'shift_updated': {
        icon: '✏️', label: 'Sửa ca', color: 'text-indigo-500 dark:text-indigo-300',
        description: 'Cập nhật ca làm việc'
    },
    'shift_deleted': {
        icon: '🗑️', label: 'Xóa ca', color: 'text-red-600 dark:text-red-400',
        description: 'Xóa ca làm việc'
    },

    // === Thông báo ===
    'SEND_NOTIFICATION': {
        icon: '📢', label: 'Gửi thông báo', color: 'text-orange-600 dark:text-orange-400',
        description: 'Admin gửi thông báo khẩn cho nhân viên'
    },
    'notification_sent': {
        icon: '📢', label: 'Gửi thông báo', color: 'text-orange-600 dark:text-orange-400',
        description: 'Admin gửi thông báo khẩn cho nhân viên'
    },

    // === Suất khách ===
    'ADD_GUEST_MEALS': {
        icon: '🧑‍🍳', label: 'Thêm suất khách', color: 'text-cyan-600 dark:text-cyan-400',
        description: 'Thêm suất ăn cho khách/đối tác'
    },
    'DELETE_GUEST_MEALS': {
        icon: '🗑️', label: 'Xóa suất khách', color: 'text-red-600 dark:text-red-400',
        description: 'Xóa suất ăn khách'
    },

    // === Cài đặt hệ thống ===
    'cooking_days_updated': {
        icon: '📅', label: 'Sửa ngày nấu', color: 'text-sky-600 dark:text-sky-400',
        description: 'Thay đổi lịch ngày nấu ăn trong tuần'
    },
    'registration_deadline_updated': {
        icon: '⏰', label: 'Sửa hạn ĐK', color: 'text-amber-600 dark:text-amber-400',
        description: 'Thay đổi giờ hạn chót đăng ký'
    },
    'auto_reset_settings_updated': {
        icon: '🔄', label: 'Sửa auto-reset', color: 'text-violet-600 dark:text-violet-400',
        description: 'Cập nhật cài đặt tự động reset suất ăn'
    },
    'branding_updated': {
        icon: '🎨', label: 'Sửa thương hiệu', color: 'text-pink-600 dark:text-pink-400',
        description: 'Thay đổi logo hoặc tên công ty'
    },

    // === Hệ thống tự động ===
    'cron_auto_reset': {
        icon: '🤖', label: 'Auto Reset', color: 'text-slate-600 dark:text-slate-400',
        description: 'Hệ thống tự động reset suất ăn hàng ngày'
    },
    'admin_manual_reset': {
        icon: '🔧', label: 'Reset thủ công', color: 'text-rose-600 dark:text-rose-400',
        description: 'Admin reset suất ăn bằng tay'
    },
    'cooking_exception_auto_cancel': {
        icon: '❌', label: 'Auto hủy (nghỉ nấu)', color: 'text-red-500 dark:text-red-300',
        description: 'Hệ thống tự hủy suất khi đánh dấu nghỉ nấu'
    },
    'cooking_exception_restore_orders': {
        icon: '✅', label: 'Khôi phục suất', color: 'text-emerald-600 dark:text-emerald-400',
        description: 'Hệ thống khôi phục suất khi gỡ ngày nghỉ nấu'
    },

    // === Tổ chức ===
    'organization_created': {
        icon: '🏢', label: 'Tạo tổ chức', color: 'text-blue-700 dark:text-blue-300',
        description: 'Đăng ký tổ chức mới trên hệ thống'
    },
    // === AI Trợ lý ===
    'admin_override_meal': {
        icon: '🤖', label: 'AI sửa suất ăn', color: 'text-purple-600 dark:text-purple-400',
        description: 'AI thay đổi suất ăn của nhân viên'
    },
    'ai_chat_query': {
        icon: '💬', label: 'Chat AI', color: 'text-indigo-600 dark:text-indigo-400',
        description: 'Tương tác với trợ lý AI'
    },
};

// Helper: lấy unique action options cho dropdown
const ACTION_OPTIONS = Object.entries(ACTION_CONFIG)
    .reduce((acc, [key, val]) => {
        // De-dupe: chỉ giữ 1 entry cho mỗi label
        if (!acc.find(a => a.label === val.label)) {
            acc.push({ value: key, label: `${val.icon} ${val.label}` });
        }
        return acc;
    }, [] as { value: string; label: string }[])
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

const getActionConfig = (action: string) => {
    return ACTION_CONFIG[action] || {
        icon: '📝', label: action, color: 'text-gray-600 dark:text-gray-400',
        description: action
    };
};

// Helper: tạo mô tả chi tiết từ details JSON
const buildDetailDescription = (log: ActivityLog): string => {
    const parts: string[] = [];
    const d = log.details;
    if (!d || typeof d !== 'object') return '';

    if (d.date) parts.push(`Ngày: ${d.date}`);
    if (d.full_name || d.employee_name) parts.push(`NV: ${d.full_name || d.employee_name}`);
    if (d.email) parts.push(`Email: ${d.email}`);
    if (d.status) parts.push(`→ ${d.status === 'eating' ? 'Ăn' : d.status === 'not_eating' ? 'Không ăn' : d.status}`);
    if (d.previous_status) parts.push(`(từ: ${d.previous_status === 'eating' ? 'Ăn' : d.previous_status === 'not_eating' ? 'Không ăn' : d.previous_status})`);
    if (d.group_name) parts.push(`Nhóm: ${d.group_name}`);
    if (d.shift_name) parts.push(`Ca: ${d.shift_name}`);
    if (d.reason) parts.push(`Lý do: ${d.reason}`);
    if (d.cancelled_count) parts.push(`Đã hủy: ${d.cancelled_count} suất`);
    if (d.restored_count) parts.push(`Đã khôi phục: ${d.restored_count} suất`);
    if (d.guest_count) parts.push(`Số khách: ${d.guest_count}`);
    if (d.total_reset) parts.push(`Reset: ${d.total_reset} NV`);
    if (d.message) parts.push(`Nội dung: ${d.message.substring(0, 50)}${d.message.length > 50 ? '...' : ''}`);

    return parts.join(' • ');
};

export default function ActivityLogsPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter, fromDate, toDate]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '30',
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
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        });
    };

    const getPerformerName = (log: ActivityLog) => {
        return log.performed_by?.full_name || log.performer_name || 'Hệ thống';
    };

    const getPerformerEmail = (log: ActivityLog) => {
        return log.performed_by?.email || '';
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-slate-900">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-5">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-white text-[22px]">history</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                            Lịch sử hoạt động
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Toàn bộ hoạt động trong công ty • <span className="font-semibold text-primary">{total.toLocaleString('vi-VN')}</span> bản ghi
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Loại hoạt động
                        </label>
                        <select
                            value={actionFilter}
                            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        >
                            <option value="">Tất cả ({total})</option>
                            {ACTION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Từ ngày
                        </label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Đến ngày
                        </label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Đang tải...</p>
                        </div>
                    </div>
                ) : logs.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-slate-800/80 sticky top-0 z-10">
                            <tr className="border-b border-gray-200 dark:border-slate-700">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">#</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Thời gian</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Người thực hiện</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hành động</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mô tả</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Chi tiết</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                            {logs.map((log, index) => {
                                const config = getActionConfig(log.action);
                                const rowNum = (page - 1) * 30 + index + 1;
                                const detailText = buildDetailDescription(log);
                                const isExpanded = expandedRow === log.id;
                                const isSystem = !log.performed_by && (log.action.startsWith('cron') || log.action.startsWith('cooking_exception'));

                                return (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                    >
                                        {/* # */}
                                        <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums">
                                            {rowNum}
                                        </td>

                                        {/* Thời gian */}
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            <span className="text-xs text-gray-600 dark:text-gray-300 font-mono tabular-nums">
                                                {formatTime(log.created_at)}
                                            </span>
                                        </td>

                                        {/* Người thực hiện */}
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${isSystem
                                                        ? 'bg-gradient-to-br from-slate-400 to-slate-500'
                                                        : 'bg-gradient-to-br from-blue-400 to-blue-600'
                                                    }`}>
                                                    {isSystem ? '🤖' : getPerformerName(log).split(' ').slice(-2).map(n => n[0]).join('').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[150px]">
                                                        {isSystem ? 'Hệ thống' : getPerformerName(log)}
                                                    </p>
                                                    {getPerformerEmail(log) && (
                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[150px]">
                                                            {getPerformerEmail(log)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Hành động */}
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${config.color}`}>
                                                <span className="text-sm">{config.icon}</span>
                                                {config.label}
                                            </span>
                                        </td>

                                        {/* Mô tả tiếng Việt */}
                                        <td className="px-4 py-2.5">
                                            <span className="text-xs text-gray-600 dark:text-gray-300">
                                                {config.description}
                                            </span>
                                        </td>

                                        {/* Chi tiết */}
                                        <td className="px-4 py-2.5">
                                            {detailText ? (
                                                <div className="max-w-[300px]">
                                                    <p className={`text-[11px] text-gray-500 dark:text-gray-400 ${isExpanded ? '' : 'truncate'}`}>
                                                        {detailText}
                                                    </p>
                                                    {detailText.length > 50 && (
                                                        <button className="text-[10px] text-primary hover:underline mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-gray-300 dark:text-gray-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600">history</span>
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 font-medium">Không có hoạt động nào</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Thử thay đổi bộ lọc để xem kết quả khác</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Trang <span className="font-semibold text-gray-700 dark:text-gray-200">{page}</span> / {totalPages}
                            <span className="ml-2 text-gray-400">({total.toLocaleString('vi-VN')} bản ghi)</span>
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium"
                            >
                                ← Trước
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors font-medium"
                            >
                                Sau →
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
