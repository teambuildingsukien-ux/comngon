'use client';

import React, { useState, useEffect } from 'react';
import { Trophy, Award, Sparkles, Gift, History, ShieldCheck, Flame, Users, CheckCircle2, TrendingUp, RefreshCw } from 'lucide-react';
import { RewardsStoreTab } from './RewardsStoreTab';
import { RewardsApprovalManager } from '../admin/RewardsApprovalManager';
import { toast } from 'sonner';

export interface DepartmentStat {
    department: string;
    totalEmployees: number;
    totalOrders: number;
    onTimeOrders: number;
    zeroWasteOrders: number;
    onTimeRate: number;
    zeroWasteRate: number;
    greenScore: number;
    rank: number;
    badge: string;
}

interface GreenLeaderboardPageProps {
    userRole?: string;
}

const formatPoints = (num: number) => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export function GreenLeaderboardPage({ userRole = 'employee' }: GreenLeaderboardPageProps) {
    const [activeTab, setActiveTab] = useState<'leaderboard' | 'store' | 'history' | 'admin'>('leaderboard');
    const [range, setRange] = useState<'month' | 'week'>('month');
    const [leaderboard, setLeaderboard] = useState<DepartmentStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [userPoints, setUserPoints] = useState<number>(1250);
    const [myRedemptions, setMyRedemptions] = useState<any[]>([]);
    const [myTransactions, setMyTransactions] = useState<any[]>([]);

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/leaderboard/department?range=${range}`);
            const data = await res.json();
            if (data.success && data.leaderboard?.length > 0) {
                setLeaderboard(data.leaderboard);
            } else {
                // Fallback demo mock nếu chưa có dữ liệu chấm điểm
                setLeaderboard([
                    {
                        department: 'Phòng Công Nghệ (IT)',
                        totalEmployees: 24,
                        totalOrders: 480,
                        onTimeOrders: 475,
                        zeroWasteOrders: 460,
                        onTimeRate: 99,
                        zeroWasteRate: 96,
                        greenScore: 98,
                        rank: 1,
                        badge: '🏆 Vô Địch Xanh'
                    },
                    {
                        department: 'Phòng Marketing',
                        totalEmployees: 18,
                        totalOrders: 360,
                        onTimeOrders: 345,
                        zeroWasteOrders: 330,
                        onTimeRate: 96,
                        zeroWasteRate: 92,
                        greenScore: 94,
                        rank: 2,
                        badge: '🥈 Á Quân Xanh'
                    },
                    {
                        department: 'Phòng Kinh Doanh (Sales)',
                        totalEmployees: 32,
                        totalOrders: 640,
                        onTimeOrders: 590,
                        zeroWasteOrders: 570,
                        onTimeRate: 92,
                        zeroWasteRate: 89,
                        greenScore: 91,
                        rank: 3,
                        badge: '🥉 Quý Quân Xanh'
                    },
                    {
                        department: 'Phòng Nhân Sự (HR)',
                        totalEmployees: 12,
                        totalOrders: 240,
                        onTimeOrders: 215,
                        zeroWasteOrders: 210,
                        onTimeRate: 90,
                        zeroWasteRate: 88,
                        greenScore: 89,
                        rank: 4,
                        badge: '🌟 Tiên Phong'
                    },
                    {
                        department: 'Phòng Kế Toán',
                        totalEmployees: 10,
                        totalOrders: 200,
                        onTimeOrders: 175,
                        zeroWasteOrders: 170,
                        onTimeRate: 88,
                        zeroWasteRate: 85,
                        greenScore: 86,
                        rank: 5,
                        badge: '🌱 Nỗ Lực'
                    }
                ]);
            }
        } catch (err) {
            console.error('Error loading leaderboard:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserPoints = async () => {
        try {
            const res = await fetch('/api/rewards/user-points');
            const data = await res.json();
            if (data.success && data.points) {
                setUserPoints(data.points.balance_points);
                setMyRedemptions(data.myRedemptions || []);
                setMyTransactions(data.transactions || []);
            }
        } catch {
            // Default 1,250 points
        }
    };

    useEffect(() => {
        fetchLeaderboard();
        fetchUserPoints();
    }, [range]);

    const top1 = leaderboard[0];
    const top2 = leaderboard[1];
    const top3 = leaderboard[2];

    const isAdmin = ['admin', 'manager'].includes(userRole.toLowerCase());

    return (
        <div className="space-y-8 p-4 sm:p-6 max-w-7xl mx-auto">
            {/* Top Navigation & Status Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/60 dark:via-slate-900/80 dark:to-teal-950/60 border border-emerald-200 dark:border-emerald-500/30 backdrop-blur-2xl shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
                        <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            <Trophy className="w-7 h-7 animate-bounce" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-emerald-950 dark:text-white tracking-tight flex items-center gap-2">
                            Đấu Trường "Phòng Ban Xanh" 🌿
                        </h1>
                        <p className="text-xs text-emerald-800/80 dark:text-slate-300 mt-1 font-medium">
                            Thi đua đăng ký suất ăn đúng giờ & bảo vệ môi trường nhận Green Points đổi quà.
                        </p>
                    </div>
                </div>

                {/* Sub Navigation Tabs & User Points Pill */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="px-4 py-2 rounded-2xl bg-emerald-100/80 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300 font-bold text-sm flex items-center gap-2 shadow-sm">
                        <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Ví của tôi:</span>
                        <span className="text-base text-emerald-700 dark:text-emerald-400 font-black">{formatPoints(userPoints)} 🌿</span>
                    </div>

                    <div className="flex items-center p-1 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <button
                            onClick={() => setActiveTab('leaderboard')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                activeTab === 'leaderboard'
                                    ? 'bg-emerald-600 text-white font-bold shadow-md'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Trophy className="w-3.5 h-3.5" /> Bảng Xếp Hạng
                        </button>
                        <button
                            onClick={() => setActiveTab('store')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                activeTab === 'store'
                                    ? 'bg-emerald-600 text-white font-bold shadow-md'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Gift className="w-3.5 h-3.5" /> Đổi Quà
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                activeTab === 'history'
                                    ? 'bg-emerald-600 text-white font-bold shadow-md'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <History className="w-3.5 h-3.5" /> Lịch Sử
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('admin')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    activeTab === 'admin'
                                        ? 'bg-emerald-600 text-white font-bold shadow-md'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5" /> Duyệt Quà
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Switcher */}
            {activeTab === 'leaderboard' && (
                <div className="space-y-8">
                    {/* Range Filter */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Flame className="w-5 h-5 text-amber-500" />
                            Bảng Xếp Hạng Đột Phá
                        </h2>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchLeaderboard}
                                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shadow-sm"
                                title="Làm mới bảng"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                            <div className="flex items-center p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                                <button
                                    onClick={() => setRange('month')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        range === 'month' ? 'bg-emerald-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    Tháng Này
                                </button>
                                <button
                                    onClick={() => setRange('week')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        range === 'week' ? 'bg-emerald-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    Tuần Này
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 3D Podium Layout cho TOP 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4">
                        {/* Hạng 2 (Silver) */}
                        {top2 && (
                            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/60 shadow-lg text-center space-y-3 relative hover:scale-105 transition-transform order-2 md:order-1">
                                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-400/40 flex items-center justify-center font-black text-lg mx-auto shadow-inner">
                                    🥈 2
                                </div>
                                <h3 className="text-base font-bold text-slate-800 dark:text-white">{top2.department}</h3>
                                <div className="text-2xl font-extrabold text-slate-700 dark:text-slate-300">
                                    {top2.greenScore} <span className="text-xs text-slate-400">/100</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Đúng giờ</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{top2.onTimeRate}%</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Zero-Waste</span>
                                        <span className="font-bold text-teal-600 dark:text-teal-400">{top2.zeroWasteRate}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Hạng 1 (Gold - Highest) */}
                        {top1 && (
                            <div className="p-7 rounded-3xl bg-gradient-to-b from-amber-50/90 via-white to-emerald-50/50 dark:from-amber-500/10 dark:via-slate-900/90 dark:to-emerald-950/50 border-2 border-amber-400 dark:border-amber-500/50 shadow-xl text-center space-y-4 relative hover:scale-105 transition-transform order-1 md:order-2 -translate-y-2">
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-md">
                                    👑 Quán Quân
                                </div>
                                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-2 border-amber-400 flex items-center justify-center font-black text-2xl mx-auto shadow-inner">
                                    🥇 1
                                </div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">{top1.department}</h3>
                                <div className="text-3xl font-black text-amber-500 dark:text-amber-400">
                                    {top1.greenScore} <span className="text-xs text-slate-400">/100</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="p-2 rounded-xl bg-amber-50/50 dark:bg-slate-950/80 border border-amber-100 dark:border-slate-800">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Đúng giờ</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{top1.onTimeRate}%</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-amber-50/50 dark:bg-slate-950/80 border border-amber-100 dark:border-slate-800">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Zero-Waste</span>
                                        <span className="font-bold text-teal-600 dark:text-teal-400">{top1.zeroWasteRate}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Hạng 3 (Bronze) */}
                        {top3 && (
                            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-amber-700/40 shadow-lg text-center space-y-3 relative hover:scale-105 transition-transform order-3">
                                <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600/40 flex items-center justify-center font-black text-lg mx-auto shadow-inner">
                                    🥉 3
                                </div>
                                <h3 className="text-base font-bold text-slate-800 dark:text-white">{top3.department}</h3>
                                <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-300">
                                    {top3.greenScore} <span className="text-xs text-slate-400">/100</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Đúng giờ</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{top3.onTimeRate}%</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60">
                                        <span className="text-slate-500 dark:text-slate-400 block font-medium">Zero-Waste</span>
                                        <span className="font-bold text-teal-600 dark:text-teal-400">{top3.zeroWasteRate}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bảng Chi Tiết Tất Cả Các Phòng Ban */}
                    <div className="rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                Xếp Hạng Chi Tiết Tất Cả Phòng Ban
                            </h3>
                            <span className="text-xs text-slate-500 font-medium">Tổng số {leaderboard.length} phòng ban</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="py-4 px-6">Thứ hạng</th>
                                        <th className="py-4 px-6">Phòng / Ban</th>
                                        <th className="py-4 px-6">Thành viên</th>
                                        <th className="py-4 px-6">Tỷ lệ Đúng giờ</th>
                                        <th className="py-4 px-6">Tỷ lệ Zero-Waste</th>
                                        <th className="py-4 px-6 text-right">Điểm Xanh (Score)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {leaderboard.map((item) => (
                                        <tr key={item.department} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="py-4 px-6 font-bold">
                                                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-bold">
                                                    #{item.rank}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                                {item.department}
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">{item.badge}</span>
                                            </td>
                                            <td className="py-4 px-6 text-slate-500 dark:text-slate-400 font-medium">
                                                {item.totalEmployees} nhân sự
                                            </td>
                                            <td className="py-4 px-6 font-bold text-emerald-600 dark:text-emerald-400">
                                                {item.onTimeRate}%
                                            </td>
                                            <td className="py-4 px-6 font-bold text-teal-600 dark:text-teal-400">
                                                {item.zeroWasteRate}%
                                            </td>
                                            <td className="py-4 px-6 text-right font-black text-base text-amber-500 dark:text-amber-400">
                                                {item.greenScore}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'store' && (
                <RewardsStoreTab userPoints={userPoints} onPointsUpdated={fetchUserPoints} />
            )}

            {activeTab === 'history' && (
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-lg">
                        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            Đơn Đổi Quà Cá Nhân Của Tôi
                        </h3>

                        {myRedemptions.length === 0 ? (
                            <p className="text-xs text-slate-500 py-4 text-center">Bạn chưa thực hiện đổi món quà nào.</p>
                        ) : (
                            <div className="space-y-3">
                                {myRedemptions.map((red) => (
                                    <div key={red.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white">{red.reward?.title || 'Quà thưởng'}</p>
                                            <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                                                Mã: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{red.redemption_code}</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-amber-600 dark:text-amber-400 block">-{red.points_spent} 🌿</span>
                                            <span className="text-[10px] text-slate-500 uppercase font-semibold">{red.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-lg">
                        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            Nhật Ký Biến Động Điểm (Green Points)
                        </h3>

                        {myTransactions.length === 0 ? (
                            <p className="text-xs text-slate-500 py-4 text-center">Chưa có giao dịch điểm nào.</p>
                        ) : (
                            <div className="space-y-2">
                                {myTransactions.map((tx) => (
                                    <div key={tx.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="text-slate-700 dark:text-slate-200 font-medium">{tx.description}</p>
                                            <span className="text-[10px] text-slate-400">
                                                {new Date(tx.created_at).toLocaleString('vi-VN')}
                                            </span>
                                        </div>
                                        <span className={`font-extrabold ${tx.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {tx.points > 0 ? `+${tx.points}` : tx.points} 🌿
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'admin' && isAdmin && (
                <RewardsApprovalManager />
            )}
        </div>
    );
}
