'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';
const PAGE_SIZES = [10, 20, 50, 100] as const;

type ActivityLog = {
    action: string;
    performer_name: string | null;
    performed_by: string;
    target_id: string | null;
    details: Record<string, any>;
    created_at: string;
};

type EnrichedLog = ActivityLog & {
    performerResolved: string;
    targetResolved: string;
    actionLabel: string;
    actionEmoji: string;
    dateAffected: string;
    sourceLabel: string;
    sourceBadgeColor: string;
    detailText: string;
};

// ========== ACTION MAPPING ==========
const ACTION_MAP: Record<string, { label: string; emoji: string }> = {
    'meal_registration': { label: 'Đăng ký ăn', emoji: '🍽️' },
    'meal_cancellation': { label: 'Báo nghỉ ăn', emoji: '❌' },
    'late_meal_registration': { label: 'Đăng ký muộn', emoji: '⏰' },
    'late_meal_cancellation': { label: 'Hủy muộn', emoji: '⏰' },
    'toggle_order': { label: 'Toggle suất ăn', emoji: '🔄' },
    'system_auto_create_order': { label: 'Auto tạo suất', emoji: '🤖' },
    'system_cron_create_order': { label: 'Cron tạo suất', emoji: '⏱️' },
    'system_auto_create_new_employee_orders': { label: 'Tạo suất NV mới', emoji: '👤' },
    'auto_reset_meals': { label: 'Cron reset hàng loạt', emoji: '⏱️' },
    'create_employee': { label: 'Tạo nhân viên', emoji: '👤' },
    'CREATE_USER': { label: 'Tạo nhân viên', emoji: '👤' },
    'update_employee': { label: 'Cập nhật NV', emoji: '✏️' },
    'UPDATE_USER': { label: 'Cập nhật NV', emoji: '✏️' },
    'DELETE_USER': { label: 'Xóa nhân viên', emoji: '🗑️' },
    'CHANGE_EMPLOYEE_STATUS': { label: 'Đổi trạng thái NV', emoji: '🔄' },
    'SCHEDULE_RESIGNATION': { label: 'Lên lịch nghỉ việc', emoji: '📋' },
    'CANCEL_SCHEDULED_RESIGNATION': { label: 'Hủy lịch nghỉ việc', emoji: '↩️' },
    'add_guest_meal': { label: 'Thêm xuất khách', emoji: '🍽️' },
    'delete_guest_meal': { label: 'Xóa xuất khách', emoji: '🗑️' },
    'add_cooking_exception': { label: 'Đánh dấu ngoại lệ', emoji: '📅' },
    'remove_cooking_exception': { label: 'Bỏ ngoại lệ', emoji: '📅' },
    'cooking_exception_auto_cancel': { label: 'Tự hủy suất (nghỉ bếp)', emoji: '🚫' },
    'cooking_exception_restore_orders': { label: 'Khôi phục suất (bỏ nghỉ bếp)', emoji: '♻️' },
    'add_group_member': { label: 'Thêm vào nhóm', emoji: '👥' },
    'remove_group_member': { label: 'Rời nhóm', emoji: '👥' },
    'group_member_removed': { label: 'Rời nhóm', emoji: '👥' },
    'group_updated': { label: 'Cập nhật nhóm', emoji: '👥' },
    'send_announcement': { label: 'Gửi thông báo', emoji: '📢' },
    'SEND_ANNOUNCEMENT': { label: 'Gửi thông báo', emoji: '📢' },
    'SEND_NOTIFICATION': { label: 'Gửi thông báo', emoji: '📢' },
    'SEND_URGENT_NOTIFICATION': { label: 'Thông báo khẩn', emoji: '🚨' },
    'kitchen_announcement': { label: 'TB nhà bếp', emoji: '📢' },
    'opt_out_cancel': { label: 'Opt-out hủy ăn', emoji: '🚫' },
    'update_setting': { label: 'Cập nhật cài đặt', emoji: '⚙️' },
    'create_api_key': { label: 'Tạo API Key', emoji: '🔑' },
    'AUTO_CANCEL_FUTURE_ORDERS': { label: 'Hủy suất ăn tương lai', emoji: '🗓️' },
    'AUTO_CANCEL_SCHEDULED_ORDERS': { label: 'Hủy suất ăn (lịch nghỉ)', emoji: '📋' },
    'AUTO_RESIGN_SCHEDULED': { label: 'Tự động nghỉ việc', emoji: '🔴' },
    'AI_ANALYZE': { label: 'Phân tích AI', emoji: '🤖' },
    'AI_CHAT': { label: 'Chat AI', emoji: '💬' },
    'admin_override_meal': { label: 'AI sửa suất ăn', emoji: '🤖' },
    'ai_chat_query': { label: 'Chat AI', emoji: '💬' },
};

const STATUS_MAP: Record<string, string> = {
    'active': 'Đang làm việc',
    'paused': 'Tạm dừng',
    'resigned': 'Nghỉ việc',
    'eating': 'Ăn',
    'not_eating': 'Nghỉ ăn',
};

function formatShortDate(dateStr: string): string {
    if (!dateStr || !dateStr.includes('-')) return dateStr || '';
    const [, m, d] = dateStr.split('-');
    return `${parseInt(d)}/${parseInt(m)}`;
}

function formatDateTime(isoStr: string): { time: string; date: string } {
    const d = new Date(isoStr);
    return {
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    };
}

function getSourceInfo(log: ActivityLog): { label: string; color: string } {
    const source = log.details?.source || '';
    const isSystem = log.performed_by === SYSTEM_UUID;
    const isAIChat = source === 'ai_chat' || log.action === 'ai_chat_query' || log.action === 'admin_override_meal';
    const isCron = source === 'cron_reset' || source === 'ensure_tomorrow' || log.action === 'auto_reset_meals' || log.action === 'system_cron_create_order';
    const isAuto = log.action === 'system_auto_create_order';
    const isAdmin = log.action.includes('CHANGE_EMPLOYEE') || log.action.includes('SCHEDULE_')
        || log.action.includes('CANCEL_SCHEDULED') || log.action === 'create_employee'
        || log.action === 'update_employee' || log.action === 'create_api_key' || source.startsWith('admin_');
    const isCalendar = source === 'calendar_bulk' || source === 'user_calendar';

    if (isAIChat) return { label: 'Cơm Ngon AI 🪄', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold' };
    if (isCron) return { label: 'Cron', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' };
    if (isAuto) return { label: 'Tự động', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    if (isAdmin) return { label: 'Quản lý', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    if (isSystem) return { label: 'Hệ thống', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    if (isCalendar) return { label: 'Lịch', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    return { label: 'Người dùng', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
}

function buildDetail(log: ActivityLog, performerName: string, targetName: string): string {
    const d = log.details || {};
    const date = d.date ? formatFullDate(d.date) : '';
    const who = performerName || 'Hệ thống';
    const target = targetName || '';

    switch (log.action) {
        case 'meal_registration':
            return `${who} đăng ký ăn trưa ngày ${date}`;
        case 'meal_cancellation':
            return `${who} báo nghỉ ăn ngày ${date}`;
        case 'late_meal_registration':
            return `${who} đăng ký muộn ăn trưa ngày ${date}`;
        case 'late_meal_cancellation':
            return `${who} hủy muộn suất ăn ngày ${date}`;
        case 'toggle_order': {
            const status = d.new_status === 'eating' ? 'ăn trưa' : 'nghỉ ăn';
            return `${who} chuyển sang ${status} ngày ${date}`;
        }
        case 'system_auto_create_order': {
            const status = d.status === 'eating' ? 'ăn' : 'nghỉ ăn';
            return `Hệ thống tự tạo suất ${status} cho ${target} ngày ${date}`;
        }
        case 'system_cron_create_order': {
            const status = d.status === 'eating' ? 'ăn' : 'nghỉ ăn';
            return `Cron tạo suất ${status} cho ${target} ngày ${date}`;
        }
        case 'auto_reset_meals': {
            const count = d.created || 0;
            const targetDate = d.target_date ? formatFullDate(d.target_date) : 'ngày mai';
            return `Cron tạo ${count} suất ăn cho ${targetDate}`;
        }
        case 'system_auto_create_new_employee_orders': {
            const count = d.count || 0;
            return `${who} tạo ${count} suất ăn cho nhân viên mới ${target}`;
        }
        case 'create_employee':
            return `${who} tạo nhân viên mới: ${target}`;
        case 'update_employee': {
            const changes: string[] = [];
            if (d.old_department && d.new_department && d.old_department !== d.new_department) {
                changes.push(`phòng ban ${d.old_department} → ${d.new_department}`);
            }
            if (d.old_group !== undefined && d.new_group !== undefined) {
                changes.push(`nhóm ${d.old_group || 'không'} → ${d.new_group || 'không'}`);
            }
            const changeStr = changes.length > 0 ? ` (${changes.join(', ')})` : '';
            return `${who} cập nhật thông tin ${target}${changeStr}`;
        }
        case 'CHANGE_EMPLOYEE_STATUS': {
            const oldS = STATUS_MAP[d.old_status] || d.old_status || '?';
            const newS = STATUS_MAP[d.new_status] || d.new_status || '?';
            return `${who} đổi trạng thái ${target}: ${oldS} → ${newS}`;
        }
        case 'SCHEDULE_RESIGNATION': {
            const resignDate = (d.resigned_date || d.resignation_date) ? formatFullDate(d.resigned_date || d.resignation_date) : '';
            return `${who} lên lịch nghỉ việc cho ${target}${resignDate ? ` vào ngày ${resignDate}` : ''}`;
        }
        case 'CANCEL_SCHEDULED_RESIGNATION': {
            const cancelledDate = d.cancelled_resigned_date ? formatFullDate(d.cancelled_resigned_date) : '';
            return `${who} hủy lịch nghỉ việc của ${target}${cancelledDate ? ` (ngày ${cancelledDate})` : ''}${d.restored_orders ? ' — khôi phục suất ăn' : ''}`;
        }
        case 'AUTO_CANCEL_FUTURE_ORDERS': {
            const count = d.cancelled_count || 0;
            return `${who} hủy ${count} suất ăn tương lai của ${target} (đổi trạng thái)`;
        }
        case 'AUTO_CANCEL_SCHEDULED_ORDERS': {
            const count = d.cancelled_count || 0;
            const resignDate = d.resigned_date ? formatFullDate(d.resigned_date) : '';
            return `Hệ thống hủy ${count} suất ăn của ${target} từ ngày ${resignDate} (lịch nghỉ việc)`;
        }
        case 'AUTO_RESIGN_SCHEDULED': {
            const resignDate = d.resigned_date ? formatFullDate(d.resigned_date) : '';
            const cancelledCount = d.cancelled_orders || 0;
            return `Cron tự động nghỉ việc ${target}${resignDate ? ` (ngày ${resignDate})` : ''}, hủy ${cancelledCount} suất ăn`;
        }
        case 'add_guest_meal':
            return `${who} thêm ${d.quantity || 0} xuất khách ngày ${date}`;
        case 'delete_guest_meal':
            return `${who} xóa xuất khách ngày ${date}`;
        case 'add_cooking_exception': {
            const type = d.type === 'no_cook' ? 'nghỉ nấu' : 'nấu thêm';
            return `${who} đánh dấu ngày ${date} là "${type}"`;
        }
        case 'remove_cooking_exception':
            return `${who} bỏ đánh dấu ngoại lệ ngày ${date}`;
        case 'add_group_member':
            return `${who} thêm ${target} vào nhóm "${d.group_name || ''}"`;
        case 'remove_group_member':
            return `${who} gỡ ${target} khỏi nhóm "${d.group_name || ''}"`;
        case 'send_announcement':
        case 'kitchen_announcement':
            return `${who} gửi thông báo: "${(d.title || d.message || '').slice(0, 40)}"`;
        case 'opt_out_cancel':
            return `${who} opt-out hủy suất ăn ngày ${date}`;
        case 'update_setting': {
            const settingNames: Record<string, string> = {
                'cooking_days': 'ngày nấu ăn', 'registration_deadline': 'deadline đăng ký',
                'allow_late_registration': 'cho phép ĐK muộn', 'auto_reset': 'auto reset',
            };
            return `${who} cập nhật cài đặt: ${settingNames[d.key] || d.key || ''}`;
        }
        case 'create_api_key':
            return `${who} tạo API Key "${d.key_name || ''}" (${d.key_prefix || ''})`;
        // === DB Trigger actions (cooking exception) ===
        case 'cooking_exception_auto_cancel': {
            const count = d.cancelled_count || d.affected_count || 0;
            const reason = d.reason ? ` — Lý do: "${d.reason}"` : '';
            return `${who} đánh dấu nghỉ bếp ngày ${date} → hệ thống tự hủy ${count} suất ăn toàn công ty${reason}`;
        }
        case 'cooking_exception_restore_orders': {
            const count = d.restored_count || d.affected_count || 0;
            const reason = d.reason ? ` (${d.reason})` : '';
            return `${who} bỏ nghỉ bếp ngày ${date} → hệ thống khôi phục ${count} suất ăn toàn công ty${reason}`;
        }
        // === Alias actions (DB stores different action name) ===
        case 'CREATE_USER':
            return `${who} tạo nhân viên mới: ${target || d.email || ''}`;
        case 'UPDATE_USER': {
            const changes: string[] = [];
            if (d.old_department && d.new_department && d.old_department !== d.new_department) {
                changes.push(`phòng ban ${d.old_department} → ${d.new_department}`);
            }
            if (d.old_status && d.new_status) {
                changes.push(`trạng thái ${STATUS_MAP[d.old_status] || d.old_status} → ${STATUS_MAP[d.new_status] || d.new_status}`);
            }
            const changeInfo = changes.length > 0 ? ` (${changes.join(', ')})` : '';
            return `${who} cập nhật thông tin ${target}${changeInfo}`;
        }
        case 'DELETE_USER':
            return `${who} xóa nhân viên ${target || d.full_name || d.email || ''}`;
        case 'group_updated':
            return `${who} cập nhật nhóm "${d.group_name || d.name || ''}"`;
        case 'group_member_removed':
            return `${who} gỡ ${target} khỏi nhóm "${d.group_name || ''}"`;
        case 'SEND_ANNOUNCEMENT':
            return `${who} gửi thông báo: "${(d.title || d.message || '').slice(0, 40)}"`;
        case 'SEND_NOTIFICATION':
            return `${who} gửi thông báo: "${(d.title || d.message || '').slice(0, 40)}"`;
        case 'SEND_URGENT_NOTIFICATION':
            return `${who} gửi thông báo khẩn: "${(d.title || d.message || '').slice(0, 40)}"`;
        // === AI usage actions ===
        case 'AI_ANALYZE': {
            const typeMap: Record<string, string> = { waste: 'Lãng phí', menu: 'Gợi ý menu', monthly_report: 'Báo cáo tháng' };
            return `${who} sử dụng AI phân tích: ${typeMap[d.type] || d.type || 'N/A'}`;
        }
        case 'AI_CHAT':
            return `${who} chat với AI trợ lý`;
        case 'admin_override_meal': {
            const statusStr = d.status === 'eating' ? 'ĐĂNG KÝ ĂN' : 'HỦY ĂN';
            const reasonStr = d.reason ? ` (${d.reason})` : '';
            return `AI thực hiện đổi suất ăn của ${target} thành "${statusStr}" ngày ${date}${reasonStr}`;
        }
        case 'ai_chat_query':
            return `${who} gửi câu hỏi/yêu cầu tới AI trợ lý`;
        default: {
            const action = log.action.replace(/_/g, ' ');
            return target ? `${who} ${action} — ${target}` : `${who} ${action}`;
        }
    }
}

function formatFullDate(dateStr: string): string {
    if (!dateStr || !dateStr.includes('-')) return dateStr || '';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function getTodayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekAgoStr(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LiveActivityFeed({ onSwitchTab }: { onSwitchTab?: (tab: string) => void }) {
    const [logs, setLogs] = useState<EnrichedLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    // Filters
    const [pageSize, setPageSize] = useState<number>(10);
    const [dateFrom, setDateFrom] = useState(getWeekAgoStr());
    const [dateTo, setDateTo] = useState(getTodayStr());

    const fetchLogs = useCallback(async () => {
        try {
            setIsLoading(true);
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', user.id)
                .single();
            if (!profile) return;

            // Count total
            const { count } = await supabase
                .from('activity_logs')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', profile.tenant_id)
                .gte('created_at', dateFrom + 'T00:00:00')
                .lte('created_at', dateTo + 'T23:59:59');
            setTotalCount(count || 0);

            // Fetch logs
            const { data } = await supabase
                .from('activity_logs')
                .select('action, performer_name, performed_by, target_id, details, created_at')
                .eq('tenant_id', profile.tenant_id)
                .gte('created_at', dateFrom + 'T00:00:00')
                .lte('created_at', dateTo + 'T23:59:59')
                .order('created_at', { ascending: false })
                .limit(pageSize);

            if (!data || data.length === 0) { setLogs([]); return; }

            // Batch resolve user names
            const userIds = new Set<string>();
            data.forEach(log => {
                if (log.performed_by && log.performed_by !== SYSTEM_UUID) userIds.add(log.performed_by);
                if (log.target_id) userIds.add(log.target_id);
            });

            const userMap = new Map<string, string>();
            if (userIds.size > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('id, full_name')
                    .in('id', Array.from(userIds));
                users?.forEach(u => userMap.set(u.id, u.full_name));
            }

            // Enrich
            const enriched: EnrichedLog[] = data.map(log => {
                const actionInfo = ACTION_MAP[log.action] || { label: log.action.replace(/_/g, ' '), emoji: '📝' };
                const sourceInfo = getSourceInfo(log);

                const performerResolved = log.performer_name
                    || (log.performed_by !== SYSTEM_UUID ? userMap.get(log.performed_by) || '' : '')
                    || (log.performed_by === SYSTEM_UUID ? 'Hệ thống' : '');

                const targetResolved = log.details?.user_name
                    || log.details?.employee_name
                    || log.details?.full_name
                    || (log.target_id ? userMap.get(log.target_id) || '' : '')
                    || '';

                const dateAffected = log.details?.date ? formatShortDate(log.details.date) : '';

                return {
                    ...log,
                    performerResolved,
                    targetResolved,
                    actionLabel: actionInfo.label,
                    actionEmoji: actionInfo.emoji,
                    dateAffected,
                    sourceLabel: sourceInfo.label,
                    sourceBadgeColor: sourceInfo.color,
                    detailText: buildDetail(log, performerResolved, targetResolved),
                };
            });

            setLogs(enriched);
        } catch (err) {
            console.error('LiveActivityFeed error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [pageSize, dateFrom, dateTo]);

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Header + Filters */}
            <div className="p-5 border-b border-[#dbdfe6] dark:border-slate-800">
                <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                        <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                            🕐 Nhật ký hoạt động
                            <span className="flex items-center gap-1 ml-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                <span className="text-xs text-emerald-600 font-medium">Live</span>
                            </span>
                        </h3>
                        <p className="text-sm text-[#606e8a] mt-0.5">
                            {totalCount.toLocaleString()} hoạt động · Hiển thị {Math.min(pageSize, logs.length)}
                        </p>
                    </div>

                    {/* Filters Row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Date range */}
                        <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-[#606e8a] text-xs font-medium">Từ</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="px-2 py-1 border border-gray-200 dark:border-slate-700 rounded-lg text-xs dark:bg-slate-800 dark:text-white focus:ring-1 focus:ring-[#c04b00] outline-none"
                            />
                            <span className="text-[#606e8a] text-xs font-medium">→</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="px-2 py-1 border border-gray-200 dark:border-slate-700 rounded-lg text-xs dark:bg-slate-800 dark:text-white focus:ring-1 focus:ring-[#c04b00] outline-none"
                            />
                        </div>

                        {/* Page size */}
                        <div className="flex items-center border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {PAGE_SIZES.map(size => (
                                <button
                                    key={size}
                                    onClick={() => setPageSize(size)}
                                    className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                                        pageSize === size
                                            ? 'bg-[#c04b00] text-white'
                                            : 'text-[#606e8a] hover:bg-gray-100 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-slate-800/60 text-left text-[11px] font-bold text-[#606e8a] uppercase tracking-wider">
                            <th className="px-4 py-2.5 w-20">Thời gian</th>
                            <th className="px-4 py-2.5 w-36">Người thực hiện</th>
                            <th className="px-4 py-2.5 w-40">Hành động</th>
                            <th className="px-4 py-2.5 w-36">Đối tượng</th>
                            <th className="px-4 py-2.5 w-16 text-center">Ngày</th>
                            <th className="px-4 py-2.5 w-20 text-center">Nguồn</th>
                            <th className="px-4 py-2.5">Chi tiết</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="px-4 py-3">
                                        <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-[#606e8a]">
                                    Không có hoạt động trong khoảng thời gian này
                                </td>
                            </tr>
                        ) : (
                            logs.map((log, i) => {
                                const dt = formatDateTime(log.created_at);
                                return (
                                    <tr key={`${log.created_at}-${i}`} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                                        {/* Thời gian */}
                                        <td className="px-4 py-2.5">
                                            <div className="font-mono text-xs">
                                                <span className="font-bold text-gray-800 dark:text-white">{dt.time}</span>
                                                <br />
                                                <span className="text-[#606e8a]">{dt.date}</span>
                                            </div>
                                        </td>

                                        {/* Người thực hiện */}
                                        <td className="px-4 py-2.5">
                                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate block max-w-[140px]" title={log.performerResolved}>
                                                {log.performerResolved || '—'}
                                            </span>
                                        </td>

                                        {/* Hành động */}
                                        <td className="px-4 py-2.5">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span>{log.actionEmoji}</span>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium">{log.actionLabel}</span>
                                            </span>
                                        </td>

                                        {/* Đối tượng */}
                                        <td className="px-4 py-2.5">
                                            <span className="text-gray-800 dark:text-gray-200 truncate block max-w-[140px] font-medium" title={log.targetResolved}>
                                                {log.targetResolved || '—'}
                                            </span>
                                        </td>

                                        {/* Ngày áp dụng */}
                                        <td className="px-4 py-2.5 text-center">
                                            {log.dateAffected ? (
                                                <span className="text-xs font-bold text-[#c04b00] bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded">
                                                    {log.dateAffected}
                                                </span>
                                            ) : (
                                                <span className="text-[#606e8a]">—</span>
                                            )}
                                        </td>

                                        {/* Nguồn */}
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${log.sourceBadgeColor}`}>
                                                {log.sourceLabel}
                                            </span>
                                        </td>

                                        {/* Chi tiết */}
                                        <td className="px-4 py-2.5">
                                            <span className="text-xs text-gray-700 dark:text-gray-300" title={log.detailText}>
                                                {log.detailText}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer: overflow notice */}
            {totalCount > 100 && (
                <div className="px-5 py-3 border-t border-[#dbdfe6] dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 flex justify-between items-center">
                    <p className="text-xs text-[#606e8a]">
                        Có tổng <strong>{totalCount.toLocaleString()}</strong> hoạt động — đang hiển thị {Math.min(pageSize, logs.length)} mới nhất
                    </p>
                    {onSwitchTab && (
                        <button
                            onClick={() => onSwitchTab('activity')}
                            className="text-xs font-bold text-[#c04b00] hover:underline flex items-center gap-1"
                        >
                            Xem tất cả lịch sử →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
