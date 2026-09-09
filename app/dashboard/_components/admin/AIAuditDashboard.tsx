'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AuditLog {
    id: string;
    tenant_id: string;
    user_id: string;
    session_id: string;
    intent_routed: string;
    model_used: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: string | number;
    latency_ms: number;
    tools_called: {
        permission?: string;
        transaction_status?: string;
        calls?: Array<{
            name: string;
            args: any;
        }>;
        crag?: any;
    };
    error_message: string | null;
    created_at: string;
    user_input: string | null;
    performer?: {
        email: string;
        full_name: string;
        role: string;
    };
}

// Icon Material Symbols Outlined
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined select-none align-middle ${className}`}>{name}</span>
);

export default function AIAuditDashboard() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Pagination & Filter States
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '15',
                search,
                status: statusFilter
            });
            const res = await fetch(`/api/admin/ai-logs?${queryParams.toString()}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Không thể tải nhật ký AI');
            }
            const data = await res.json();
            setLogs(data.logs);
            setTotal(data.total);
            setTotalPages(data.totalPages || 1);
        } catch (err: any) {
            setError(err.message || 'Lỗi kết nối server');
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setStatusFilter(e.target.value);
        setPage(1);
    };

    const getStatusBadge = (log: AuditLog) => {
        const transactionStatus = log.tools_called?.transaction_status;
        const hasError = !!log.error_message;

        if (hasError) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                    <Icon name="cancel" className="text-[14px]" /> Thất bại
                </span>
            );
        }

        if (transactionStatus === 'pending_approval') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                    <Icon name="pending" className="text-[14px]" /> Chờ duyệt
                </span>
            );
        }

        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                <Icon name="check_circle" className="text-[14px]" /> Thành công
            </span>
        );
    };

    const formatCost = (cost: any) => {
        const val = parseFloat(cost?.toString() || '0');
        if (val === 0) return '$0.00000';
        return `$${val.toFixed(5)}`;
    };

    const formatLatency = (ms: number) => {
        if (!ms) return '0ms';
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms}ms`;
    };

    const formatTime = (timeStr: string) => {
        const d = new Date(timeStr);
        // Trả về định dạng Việt Nam múi giờ địa phương
        return d.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#b24700] dark:text-[#f26d21] flex items-center gap-2">
                        <Icon name="security" className="text-[28px]" /> Nhật ký AI & SecOps
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Giám sát các cuộc hội thoại, chi phí token, hiệu năng phản hồi và các hành động được AI đề xuất.
                    </p>
                </div>
                <button
                    onClick={() => fetchLogs()}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1f1a16] border border-gray-200 dark:border-[#2f2720] hover:border-[#b24700] rounded-xl text-sm font-semibold transition-all duration-300 shadow-sm"
                >
                    <Icon name="refresh" className={loading ? "animate-spin" : ""} /> Làm mới
                </button>
            </div>

            {/* Filter Panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-white/70 dark:bg-[#181411]/70 backdrop-blur-md rounded-2xl border border-gray-200/80 dark:border-[#2f2720]/80 shadow-sm">
                <div className="col-span-1 md:col-span-3 relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm kiếm câu lệnh người dùng hoặc intent..."
                        value={search}
                        onChange={handleSearchChange}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 dark:bg-[#12100E] border border-gray-200 dark:border-[#2f2720] focus:border-[#b24700] focus:ring-1 focus:ring-[#b24700] text-sm outline-none transition-all"
                    />
                </div>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={handleStatusFilterChange}
                        className="w-full pl-3 pr-8 py-2 rounded-xl bg-gray-50 dark:bg-[#12100E] border border-gray-200 dark:border-[#2f2720] focus:border-[#b24700] text-sm outline-none transition-all appearance-none"
                    >
                        <option value="all">Tất cả Trạng thái</option>
                        <option value="success">Thành công</option>
                        <option value="failed">Thất bại</option>
                        <option value="pending_approval">Chờ duyệt</option>
                    </select>
                    <Icon name="arrow_drop_down" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white dark:bg-[#1a1512] rounded-2xl border border-gray-200 dark:border-[#2f2720] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-[#2f2720] bg-gray-50/50 dark:bg-[#12100E]/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <th className="p-4">Thời gian</th>
                                <th className="p-4">Người thực hiện</th>
                                <th className="p-4">Câu lệnh / Input</th>
                                <th className="p-4">Intent</th>
                                <th className="p-4">Trạng thái</th>
                                <th className="p-4 text-right">Tokens</th>
                                <th className="p-4 text-right">Chi phí</th>
                                <th className="p-4 text-right">Độ trễ</th>
                                <th className="p-4 text-center">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-[#2f2720] text-sm">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-gray-400">
                                        <div className="flex items-center justify-center gap-2">
                                            <Icon name="progress_activity" className="animate-spin text-[#b24700]" />
                                            Đang tải dữ liệu nhật ký...
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-gray-400">
                                        Không tìm thấy bản ghi nhật ký nào phù hợp.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-[#201b17]/50 transition-colors">
                                        <td className="p-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                            {formatTime(log.created_at)}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                    {log.performer?.full_name || 'Hệ thống'}
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {log.performer?.email || 'system'} • {log.performer?.role?.toUpperCase() || 'SYS'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 max-w-[250px] truncate">
                                            {log.user_input ? (
                                                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">
                                                    {log.user_input}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-600 italic text-xs">
                                                    Không có câu lệnh
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-600 dark:text-gray-400">
                                                {log.intent_routed || 'none'}
                                            </span>
                                        </td>
                                        <td className="p-4 whitespace-nowrap">
                                            {getStatusBadge(log)}
                                        </td>
                                        <td className="p-4 text-right whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-400">
                                            <div>In: {log.input_tokens || 0}</div>
                                            <div>Out: {log.output_tokens || 0}</div>
                                        </td>
                                        <td className="p-4 text-right whitespace-nowrap text-xs font-mono text-gray-700 dark:text-emerald-400">
                                            {formatCost(log.estimated_cost_usd)}
                                        </td>
                                        <td className="p-4 text-right whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-400">
                                            {formatLatency(log.latency_ms)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-[#b24700] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                title="Xem chi tiết kỹ thuật"
                                            >
                                                <Icon name="visibility" className="text-[18px]" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-[#2f2720] bg-gray-50/30 dark:bg-[#12100E]/30 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">
                            Hiển thị từ <span className="font-semibold text-gray-800 dark:text-gray-200">{(page - 1) * 15 + 1}</span> đến{' '}
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                                {Math.min(page * 15, total)}
                            </span>{' '}
                            trong tổng số <span className="font-semibold text-gray-800 dark:text-gray-200">{total}</span> bản ghi
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2f2720] bg-white dark:bg-[#1f1a16] text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-all"
                            >
                                Trước
                            </button>
                            <span className="flex items-center px-3 text-gray-600 dark:text-gray-300 font-semibold">
                                Trang {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2f2720] bg-white dark:bg-[#1f1a16] text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-all"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Detail view */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-3xl bg-white dark:bg-[#1c1815] rounded-3xl border border-gray-200 dark:border-[#382e26] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-200 dark:border-[#2f2720] flex items-center justify-between bg-gray-50/50 dark:bg-[#12100E]/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Icon name="terminal" className="text-[#b24700]" /> Chi tiết Nhật ký AI
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Log ID: {selectedLog.id}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                <Icon name="close" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-700 dark:text-gray-300">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                    <div className="text-xs text-gray-400 mb-1">Mô hình AI</div>
                                    <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">{selectedLog.model_used}</div>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                    <div className="text-xs text-gray-400 mb-1">Độ trễ (Latency)</div>
                                    <div className="font-semibold text-gray-800 dark:text-gray-200">{formatLatency(selectedLog.latency_ms)}</div>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                    <div className="text-xs text-gray-400 mb-1">Tổng Tokens</div>
                                    <div className="font-semibold text-gray-800 dark:text-gray-200">{(selectedLog.input_tokens || 0) + (selectedLog.output_tokens || 0)}</div>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                    <div className="text-xs text-gray-400 mb-1">Chi phí ước tính</div>
                                    <div className="font-semibold text-[#b24700] dark:text-[#f26d21]">{formatCost(selectedLog.estimated_cost_usd)}</div>
                                </div>
                            </div>

                            {/* Prompt / Input */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                                    <Icon name="chat_bubble" className="text-[18px] text-gray-400" /> Câu lệnh của người dùng
                                </h4>
                                <div className="p-4 bg-gray-50 dark:bg-[#12100E] border border-gray-200 dark:border-[#2f2720] rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed">
                                    {selectedLog.user_input || 'Không có câu lệnh'}
                                </div>
                            </div>

                            {/* Error Message if failed */}
                            {selectedLog.error_message && (
                                <div>
                                    <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                                        <Icon name="warning" className="text-[18px]" /> Lỗi xảy ra
                                    </h4>
                                    <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl font-mono text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">
                                        {selectedLog.error_message}
                                    </div>
                                </div>
                            )}

                            {/* Tools Called (JSON payload) */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                                    <Icon name="construction" className="text-[18px] text-gray-400" /> Chi tiết các Tool đã thực thi
                                </h4>
                                <div className="p-4 bg-gray-50 dark:bg-[#12100E] border border-gray-200 dark:border-[#2f2720] rounded-xl overflow-x-auto">
                                    <pre className="font-mono text-xs text-gray-800 dark:text-gray-300 leading-relaxed">
                                        {JSON.stringify(selectedLog.tools_called, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-200 dark:border-[#2f2720] flex justify-end bg-gray-50/30 dark:bg-[#12100E]/30">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold transition-all"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
