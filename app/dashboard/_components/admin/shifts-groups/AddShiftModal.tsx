'use client';

import { useState } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface AddShiftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddShiftModal({ isOpen, onClose, onSuccess }: AddShiftModalProps) {
    const [formData, setFormData] = useState({
        name: '',
        start_time: '11:30',
        end_time: '12:30'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/admin/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create shift');
            }

            // Reset form
            setFormData({ name: '', start_time: '11:30', end_time: '12:30' });
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                <Icon name="schedule" className="text-2xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold dark:text-white">Tạo ca ăn mới</h2>
                                <p className="text-xs text-[#606e8a] mt-0.5">Thêm khung giờ ăn cho nhân viên</p>
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
                            Tên ca ăn
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                            placeholder="Ví dụ: Ca Sáng (A)"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Giờ bắt đầu
                            </label>
                            <input
                                type="time"
                                value={formData.start_time}
                                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Giờ kết thúc
                            </label>
                            <input
                                type="time"
                                value={formData.end_time}
                                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                                className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                                required
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
                                    Tạo ca ăn
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
