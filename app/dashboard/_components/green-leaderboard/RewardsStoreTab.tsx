'use client';

import React, { useState } from 'react';
import { Gift, Coffee, Ticket, TreePine, CheckCircle2, AlertCircle, Sparkles, Copy } from 'lucide-react';
import { toast } from 'sonner';

export interface RewardItem {
    id: string;
    title: string;
    description: string;
    points_required: number;
    category: string;
    stock: number;
    image_url?: string;
}

interface RewardsStoreTabProps {
    userPoints: number;
    onPointsUpdated: () => void;
}

const formatPoints = (num: number) => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export function RewardsStoreTab({ userPoints, onPointsUpdated }: RewardsStoreTabProps) {
    const [items, setItems] = useState<RewardItem[]>([
        {
            id: 'item-1',
            title: '☕ Ly Cà Phê Highlands / Phút Thư Giãn',
            description: 'Đổi 1 ly cà phê Highlands hảo hạng hoặc đồ uống ưa thích tại pantry công ty',
            points_required: 500,
            category: 'beverage',
            stock: 100
        },
        {
            id: 'item-2',
            title: '🎟️ Voucher Shopee / Tiki 50,000đ',
            description: 'Mã giảm giá mua sắm trực tuyến trị giá 50.000đ dành cho nhân viên xanh',
            points_required: 1000,
            category: 'voucher',
            stock: 50
        },
        {
            id: 'item-3',
            title: '🌱 Bình Nước Inox Giữ Nhiệt Cơm Ngốn',
            description: 'Bình nước inox cao cấp 500ml khắc tên cá nhân bảo vệ môi trường',
            points_required: 2500,
            category: 'gift',
            stock: 30
        },
        {
            id: 'item-4',
            title: '🏖️ Nửa Ngày Nghỉ Phép Hưởng Lương',
            description: 'Được quy đổi 0.5 ngày nghỉ phép có hưởng lương (cần HR/Quản lý phê duyệt)',
            points_required: 5000,
            category: 'leave',
            stock: 20
        }
    ]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<RewardItem | null>(null);
    const [redeemSuccessCode, setRedeemSuccessCode] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const fetchItems = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/rewards/items');
            const data = await res.json();
            if (data.success && data.items?.length > 0) {
                setItems(data.items);
            }
        } catch {
            // Keep fallback items
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchItems();
    }, []);

    const handleConfirmRedeem = async () => {
        if (!selectedItem) return;
        try {
            setSubmitting(true);
            const res = await fetch('/api/rewards/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reward_id: selectedItem.id })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                toast.error(data.error || 'Đổi quà thất bại. Vui lòng thử lại.');
                return;
            }

            setRedeemSuccessCode(data.redemption?.redemption_code || 'GREEN-GIFT');
            toast.success('Đổi quà thành công!');
            onPointsUpdated();
            fetchItems();
        } catch (err: any) {
            toast.error(err.message || 'Lỗi xử lý đổi quà');
        } finally {
            setSubmitting(false);
        }
    };

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case 'beverage': return <Coffee className="w-5 h-5 text-amber-500" />;
            case 'voucher': return <Ticket className="w-5 h-5 text-emerald-500" />;
            case 'leave': return <TreePine className="w-5 h-5 text-cyan-500" />;
            default: return <Gift className="w-5 h-5 text-purple-500" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Banner ví điểm */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-900/40 dark:via-teal-900/30 dark:to-slate-900/60 border border-emerald-200 dark:border-emerald-500/30 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-inner">
                        <Sparkles className="w-7 h-7 animate-pulse text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            Cửa Hàng Quà Thưởng Đổi Điểm Xanh
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Tích lũy Green Points từ việc ăn đúng giờ & không lãng phí cơm để đổi quà hấp dẫn.
                        </p>
                    </div>
                </div>
                <div className="px-5 py-3 rounded-xl bg-emerald-100/80 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300 font-bold text-lg flex items-center gap-2 shadow-sm">
                    <span>Ví điểm hiện có:</span>
                    <span className="text-2xl text-emerald-700 dark:text-emerald-400 font-black">{formatPoints(userPoints)} 🌿</span>
                </div>
            </div>

            {/* Grid Sản Phẩm */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {items.map((item) => {
                    const canAfford = userPoints >= item.points_required;
                    return (
                        <div
                            key={item.id}
                            className={`group relative p-5 rounded-2xl border backdrop-blur-xl transition-all duration-300 flex flex-col justify-between hover:scale-[1.02] shadow-sm ${
                                canAfford
                                    ? 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700/80 hover:border-emerald-500/50 hover:shadow-lg'
                                    : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/60 opacity-80'
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                                        {getCategoryIcon(item.category)}
                                    </div>
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                                        {formatPoints(item.points_required)} Points 🌿
                                    </span>
                                </div>
                                <h4 className="text-base font-bold text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors line-clamp-1">
                                    {item.title}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                                    {item.description}
                                </p>
                            </div>

                            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Còn lại: <strong className="text-slate-700 dark:text-slate-200">{item.stock}</strong>
                                </span>
                                <button
                                    onClick={() => setSelectedItem(item)}
                                    disabled={!canAfford || item.stock <= 0}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                                        canAfford && item.stock > 0
                                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md'
                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    }`}
                                >
                                    {canAfford ? 'Đổi Quà Ngay' : 'Chưa Đủ Điểm'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal Xử lý Đổi quà */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-emerald-500/30 shadow-2xl space-y-4">
                        {!redeemSuccessCode ? (
                            <>
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                                    <h4 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                        <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        Xác Nhận Đổi Quà Thưởng
                                    </h4>
                                    <button
                                        onClick={() => setSelectedItem(null)}
                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                    <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedItem.title}</p>
                                    <p className="text-slate-500 dark:text-slate-400">{selectedItem.description}</p>
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Số điểm cần trừ:</span>
                                        <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">-{formatPoints(selectedItem.points_required)} Points 🌿</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Số dư còn lại:</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPoints(userPoints - selectedItem.points_required)} Points</span>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setSelectedItem(null)}
                                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                                    >
                                        Hủy Bỏ
                                    </button>
                                    <button
                                        onClick={handleConfirmRedeem}
                                        disabled={submitting}
                                        className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1.5"
                                    >
                                        {submitting ? 'Đang xử lý...' : 'Xác Nhận Đổi'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-4 space-y-4">
                                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-slate-800 dark:text-white">Đổi Quà Thành Công!</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Vui lòng đưa mã nhận quà này cho HR / Quản trị viên để nhận quà:
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center gap-2">
                                    <span className="font-mono text-xl font-black text-emerald-700 dark:text-emerald-400 tracking-wider">
                                        {redeemSuccessCode}
                                    </span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(redeemSuccessCode);
                                            toast.success('Đã sao chép mã nhận quà!');
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>

                                <button
                                    onClick={() => {
                                        setSelectedItem(null);
                                        setRedeemSuccessCode(null);
                                    }}
                                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md hover:bg-emerald-500"
                                >
                                    Đã Hiểu & Đóng
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
