'use client';

import { useState, useEffect, useCallback } from 'react';
import { toLocalDateString } from '@/lib/utils/date-helpers';

function Icon({ name, className = "" }: { name: string; className?: string }) {
    return <span className={`material-symbols-rounded ${className}`}>{name}</span>;
}

interface GuestMealEntry {
    id: string;
    date: string;
    quantity: number;
    note: string | null;
    created_at: string;
    users?: { full_name: string } | null;
}

interface GuestMealsManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

export default function GuestMealsManager({ isOpen, onClose, onUpdate }: GuestMealsManagerProps) {
    const [entries, setEntries] = useState<GuestMealEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const today = toLocalDateString(new Date());
    const [selectedDate, setSelectedDate] = useState(today);
    const [quantity, setQuantity] = useState('1');
    const [note, setNote] = useState('');
    const [total, setTotal] = useState(0);

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/admin/guest-meals?date=${selectedDate}`);
            const result = await res.json();
            if (result.success) {
                setEntries(result.data);
                setTotal(result.total);
            }
        } catch (err) {
            console.error('Error fetching guest meals:', err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        if (isOpen) {
            fetchEntries();
        }
    }, [isOpen, fetchEntries]);

    const handleAdd = async () => {
        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/guest-meals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    quantity: qty,
                    note: note.trim() || null,
                }),
            });
            const result = await res.json();
            if (result.success) {
                setQuantity('1');
                setNote('');
                await fetchEntries();
                onUpdate?.();
            }
        } catch (err) {
            console.error('Error adding guest meal:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa mục này?')) return;

        try {
            const res = await fetch(`/api/admin/guest-meals?id=${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                await fetchEntries();
                onUpdate?.();
            }
        } catch (err) {
            console.error('Error deleting guest meal:', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white dark:bg-[#1a1816] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center">
                            <Icon name="person_add" className="text-white text-xl" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold dark:text-white">Suất ăn phát sinh</h2>
                            <p className="text-xs text-slate-500">Khách, NV công tác, WFH lên VP</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <Icon name="close" className="text-slate-500" />
                    </button>
                </div>

                {/* Add Form */}
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ngày</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-[#252220] dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            />
                        </div>
                        <div className="w-24">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Số suất</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-[#252220] dark:text-white text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ghi chú (tùy chọn)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="VD: NV SG công tác — Hùng, Lan, Minh"
                            maxLength={500}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-[#252220] dark:text-white text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>

                    <button
                        onClick={handleAdd}
                        disabled={isSaving || parseInt(quantity, 10) < 1}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Icon name="add_circle" className="text-lg" />
                        {isSaving ? 'Đang lưu...' : 'Thêm suất phát sinh'}
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-auto p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Ngày {new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN')}
                        </h3>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            Tổng: +{total} suất
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Icon name="no_meals" className="text-4xl mb-2 block" />
                            <p className="text-sm">Chưa có suất phát sinh</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-[#252220] rounded-lg border border-slate-200 dark:border-slate-700"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center justify-center w-7 h-7 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-bold">
                                                +{entry.quantity}
                                            </span>
                                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                                                {entry.note || 'Không có ghi chú'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-1 ml-9">
                                            {entry.users?.full_name || 'Admin'} • {new Date(entry.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-2 flex-shrink-0"
                                        title="Xóa"
                                    >
                                        <Icon name="delete" className="text-red-400 text-lg" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
