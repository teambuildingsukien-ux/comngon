'use client';

import { useState, useMemo } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface LateRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => Promise<void>;
    actionType: 'eating' | 'not_eating'; // target status
    deadline: string; // e.g. "08:00"
}

const QUICK_REASONS = [
    'Công tác về muộn',
    'Quên đăng ký',
    'Thay đổi lịch họp',
    'Có việc đột xuất',
    'Khách hàng đến thăm',
    'Đi khám bệnh',
];

export default function LateRegistrationModal({
    isOpen,
    onClose,
    onSubmit,
    actionType,
    deadline
}: LateRegistrationModalProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const { isCancel, title, description } = useMemo(() => {
        const isCancel = actionType === 'not_eating';
        return {
            isCancel,
            title: isCancel ? '⚡ Hủy ăn muộn' : '⚡ Đăng ký ăn muộn',
            description: isCancel
                ? 'Bạn đang hủy suất ăn sau hạn chót. Vui lòng cho biết lý do.'
                : 'Bạn đang đăng ký ăn sau hạn chót. Vui lòng cho biết lý do.'
        };
    }, [actionType]);

    const handleSubmit = async () => {
        if (reason.trim().length < 5) {
            setError('Lý do phải có ít nhất 5 ký tự');
            return;
        }
        setError('');
        setIsSubmitting(true);
        try {
            await onSubmit(reason.trim());
            setReason('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Có lỗi xảy ra');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickReason = (quickReason: string) => {
        setReason(quickReason);
        setError('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-[#111318] dark:text-white">
                            {title}
                        </h2>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="size-9 flex items-center justify-center rounded-full hover:bg-[#f5f1ee] dark:hover:bg-slate-800 transition-colors"
                        >
                            <Icon name="close" className="text-xl text-[#606e8a]" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {/* Warning banner */}
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <Icon name="schedule" className="text-amber-600 text-xl mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm text-amber-800 dark:text-amber-200 font-semibold">
                                Đã quá hạn chót ({deadline})
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                                {description}
                            </p>
                        </div>
                    </div>

                    {/* Quick reason chips */}
                    <div>
                        <p className="text-xs font-bold text-[#606e8a] uppercase tracking-wider mb-2">
                            Chọn nhanh:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {QUICK_REASONS.map((qr) => (
                                <button
                                    key={qr}
                                    onClick={() => handleQuickReason(qr)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${reason === qr
                                        ? 'bg-[#B24700] text-white border-[#B24700]'
                                        : 'bg-[#f5f1ee] dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#B24700] hover:text-[#B24700]'
                                        }`}
                                >
                                    {qr}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reason textarea */}
                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Lý do <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setError(''); }}
                            placeholder="Nhập lý do chi tiết..."
                            rows={3}
                            className="w-full px-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-[#B24700] resize-none text-sm"
                        />
                        <div className="flex justify-between mt-1">
                            {error ? (
                                <p className="text-xs text-red-500">{error}</p>
                            ) : (
                                <p className="text-xs text-slate-400">Tối thiểu 5 ký tự</p>
                            )}
                            <p className={`text-xs ${reason.length >= 5 ? 'text-green-500' : 'text-slate-400'}`}>
                                {reason.length} ký tự
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 h-11 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white font-bold rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50 text-sm"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || reason.trim().length < 5}
                        className={`flex-1 h-11 font-bold rounded-xl transition-all disabled:opacity-50 text-sm ${isCancel
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                    >
                        {isSubmitting ? 'Đang gửi...' : (isCancel ? '❌ Xác nhận hủy muộn' : '✅ Xác nhận đăng ký muộn')}
                    </button>
                </div>
            </div>
        </div>
    );
}
