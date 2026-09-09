'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

export interface RedemptionRecord {
    id: string;
    points_spent: number;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    redemption_code: string;
    admin_note?: string;
    created_at: string;
    applicant: {
        id: string;
        full_name: string;
        email: string;
        department: string;
    };
    reward: {
        title: string;
        category: string;
    };
}

export function RewardsApprovalManager() {
    const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchRedemptions = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/rewards/redeem?status=${statusFilter}`);
            const data = await res.json();
            if (data.success) {
                setRedemptions(data.redemptions || []);
            }
        } catch {
            toast.error('Không thể tải danh sách đơn đổi quà.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRedemptions();
    }, [statusFilter]);

    const handleUpdateStatus = async (redemptionId: string, newStatus: 'approved' | 'rejected', defaultNote?: string) => {
        try {
            setProcessingId(redemptionId);
            const res = await fetch('/api/rewards/redeem', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    redemption_id: redemptionId,
                    status: newStatus,
                    admin_note: defaultNote || (newStatus === 'approved' ? 'Đã trao quà/duyệt mã' : 'Không đáp ứng điều kiện')
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success(newStatus === 'approved' ? 'Đã phê duyệt đơn đổi quà!' : 'Đã từ chối & hoàn lại điểm!');
                fetchRedemptions();
            } else {
                toast.error(data.error || 'Thao tác thất bại.');
            }
        } catch {
            toast.error('Lỗi kết nối máy chủ.');
        } finally {
            setProcessingId(null);
        }
    };

    const filteredList = redemptions.filter(r => {
        const nameMatch = r.applicant?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const codeMatch = r.redemption_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const rewardMatch = r.reward?.title?.toLowerCase().includes(searchTerm.toLowerCase());
        return nameMatch || codeMatch || rewardMatch;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        Quản Lý Phê Duyệt Quà Thưởng (HR / Admin)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Duyệt mã trao quà hoặc từ chối hoàn điểm lại cho nhân viên.
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Tìm nhân viên, mã đổi quà..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
                    >
                        <option value="pending">Chờ duyệt (Pending)</option>
                        <option value="approved">Đã duyệt (Approved)</option>
                        <option value="rejected">Đã từ chối (Rejected)</option>
                        <option value="all">Tất cả trạng thái</option>
                    </select>
                </div>
            </div>

            {/* List Table */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-400 text-xs animate-pulse">
                        Đang tải danh sách đơn đổi quà...
                    </div>
                ) : filteredList.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs">
                        Không có đơn đổi quà nào phù hợp.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                            <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="py-3.5 px-4">Nhân viên</th>
                                    <th className="py-3.5 px-4">Phòng ban</th>
                                    <th className="py-3.5 px-4">Quà tặng</th>
                                    <th className="py-3.5 px-4">Điểm trừ</th>
                                    <th className="py-3.5 px-4">Mã quà tặng</th>
                                    <th className="py-3.5 px-4">Trạng thái</th>
                                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {filteredList.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-3.5 px-4">
                                            <p className="font-bold text-slate-800 dark:text-white">{r.applicant?.full_name || 'Nhân viên'}</p>
                                            <p className="text-[10px] text-slate-400">{r.applicant?.email}</p>
                                        </td>
                                        <td className="py-3.5 px-4 font-medium text-slate-600 dark:text-slate-300">
                                            {r.applicant?.department || '-'}
                                        </td>
                                        <td className="py-3.5 px-4 font-bold text-emerald-700 dark:text-emerald-300">
                                            {r.reward?.title}
                                        </td>
                                        <td className="py-3.5 px-4 font-extrabold text-amber-600 dark:text-amber-400">
                                            -{r.points_spent} 🌿
                                        </td>
                                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {r.redemption_code}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                r.status === 'pending'
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                                    : r.status === 'approved'
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                            }`}>
                                                {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 text-right">
                                            {r.status === 'pending' ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleUpdateStatus(r.id, 'approved')}
                                                        disabled={processingId === r.id}
                                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(r.id, 'rejected')}
                                                        disabled={processingId === r.id}
                                                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center gap-1"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" /> Hủy
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">Đã hoàn tất</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
