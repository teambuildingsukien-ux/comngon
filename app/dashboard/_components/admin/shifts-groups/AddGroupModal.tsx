'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Shift {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
}

interface AddGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddGroupModal({ isOpen, onClose, onSuccess }: AddGroupModalProps) {
    const supabase = createClient();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        shift_id: '',
        table_area: '',
        department: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchShifts();
        }
    }, [isOpen]);

    const fetchShifts = async () => {
        try {
            const response = await fetch('/api/admin/shifts');
            const result = await response.json();
            if (result.data) {
                setShifts(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch shifts:', error);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    shift_id: formData.shift_id || null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create group');
            }

            // Reset form
            setFormData({ name: '', shift_id: '', table_area: '', department: '' });
            onSuccess();
            onClose();
        } catch (error: any) {
            setError(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                <Icon name="group_add" className="text-2xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold dark:text-white">Tạo nhóm ăn mới</h2>
                                <p className="text-xs text-[#606e8a] mt-0.5">Thêm nhóm và phân công ca ăn</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-[#f5f1ee] dark:hover:bg-slate-800 text-[#606e8a]"
                        >
                            <Icon name="close" />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Tên nhóm <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                            placeholder="Ví dụ: Nhóm Sản Xuất 1"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Ca ăn
                        </label>
                        <select
                            value={formData.shift_id}
                            onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                            className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                        >
                            <option value="">-- Chọn ca ăn --</option>
                            {shifts.map((shift) => (
                                <option key={shift.id} value={shift.id}>
                                    {shift.name} ({shift.start_time} - {shift.end_time})
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-[#606e8a] mt-1">Có thể gán ca sau</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Khu vực bàn
                            </label>
                            <input
                                type="text"
                                value={formData.table_area}
                                onChange={(e) => setFormData({ ...formData, table_area: e.target.value })}
                                className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                                placeholder="Ví dụ: Khu A"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Phòng ban
                            </label>
                            <input
                                type="text"
                                value={formData.department}
                                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                                placeholder="Ví dụ: Sản xuất"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-12 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white rounded-lg font-bold hover:bg-[#ebe7e3] transition-colors"
                            disabled={isSubmitting}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className="flex-1 h-12 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Đang tạo...
                                </>
                            ) : (
                                <>
                                    <Icon name="add_circle" />
                                    Tạo nhóm
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
