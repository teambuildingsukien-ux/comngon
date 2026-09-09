'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface DeadlineSettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Generate time options every 30 minutes
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const hour = String(Math.floor(i / 2)).padStart(2, '0');
    const minute = i % 2 === 0 ? '00' : '30';
    return { value: `${hour}:${minute}`, label: `${hour}:${minute}` };
});

export default function DeadlineSettingModal({
    isOpen,
    onClose,
    onSuccess
}: DeadlineSettingModalProps) {
    const [deadlineTime, setDeadlineTime] = useState('17:00');
    const [offsetDays, setOffsetDays] = useState(1);
    const [enabled, setEnabled] = useState(true);
    const [allowLate, setAllowLate] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchCurrentSetting();
        }
    }, [isOpen]);

    const fetchCurrentSetting = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/settings/registration-deadline');
            if (response.ok) {
                const result = await response.json();
                setDeadlineTime(result.data.deadline_time || '17:00');
                setOffsetDays(result.data.offset_days ?? 1);
                setEnabled(result.data.enabled ?? true);
                setAllowLate(result.data.allow_late ?? true);
            }
        } catch (error) {
            console.error('Failed to fetch deadline setting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/admin/settings/registration-deadline', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deadline_time: deadlineTime,
                    offset_days: offsetDays,
                    enabled: enabled,
                    allow_late: allowLate
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể lưu cài đặt');
                return;
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to save deadline setting:', error);
            alert('Không thể lưu cài đặt');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black text-[#111318] dark:text-white">
                            ⏰ Hạn chót đăng ký
                        </h2>
                        <button
                            onClick={onClose}
                            className="size-10 flex items-center justify-center rounded-full hover:bg-[#f5f1ee] dark:hover:bg-slate-800 transition-colors"
                        >
                            <Icon name="close" className="text-2xl text-[#606e8a]" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {isLoading ? (
                        <div className="text-center py-8 text-[#606e8a]">Đang tải...</div>
                    ) : (
                        <div className="space-y-5">
                            <p className="text-sm text-[#606e8a]">
                                Cài đặt thời hạn cuối cùng để nhân viên đăng ký hoặc hủy suất ăn.
                                Sau giờ này, nút đăng ký/hủy sẽ bị khóa tự động.
                            </p>

                            {/* Toggle Enable */}
                            <div className="flex items-center justify-between p-4 bg-[#f5f1ee] dark:bg-slate-800 rounded-xl">
                                <div>
                                    <p className="text-sm font-bold text-[#111318] dark:text-white">
                                        Bật khóa deadline
                                    </p>
                                    <p className="text-xs text-[#606e8a] mt-0.5">
                                        {enabled ? '🟢 Đang bật — NV bị chặn sau deadline' : '⚪ Đang tắt — NV tự do đăng ký'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEnabled(!enabled)}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : ''
                                        }`} />
                                </button>
                            </div>

                            {/* ⭐ v5.9.0: Toggle Allow Late Registration — chỉ hiện khi deadline BẬT */}
                            {enabled && (
                                <div className="flex items-center justify-between p-4 bg-[#f5f1ee] dark:bg-slate-800 rounded-xl">
                                    <div>
                                        <p className="text-sm font-bold text-[#111318] dark:text-white">
                                            Cho phép đăng ký muộn
                                        </p>
                                        <p className="text-xs text-[#606e8a] mt-0.5">
                                            {allowLate
                                                ? '🟡 NV quá hạn nhập lý do → vẫn được đăng ký/hủy'
                                                : '🔴 NV quá hạn → CHẶN hoàn toàn, không có ngoại lệ'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setAllowLate(!allowLate)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${allowLate ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                                            }`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${allowLate ? 'translate-x-6' : ''
                                            }`} />
                                    </button>
                                </div>
                            )}

                            {/* Deadline Time */}
                            <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
                                <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                    Giờ hạn chót <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={deadlineTime}
                                    onChange={(e) => setDeadlineTime(e.target.value)}
                                    className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                                >
                                    {TIME_OPTIONS.map((time) => (
                                        <option key={time.value} value={time.value}>
                                            {time.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Offset Days */}
                            <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
                                <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                    Áp dụng trước mấy ngày <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={offsetDays}
                                    onChange={(e) => setOffsetDays(Number(e.target.value))}
                                    className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                                >
                                    <option value={0}>Cùng ngày (VD: deadline 8h sáng cho hôm nay)</option>
                                    <option value={1}>Trước 1 ngày (VD: deadline 17h hôm trước cho ngày mai)</option>
                                    <option value={2}>Trước 2 ngày</option>
                                </select>
                            </div>

                            {/* Preview */}
                            <div className={`p-4 rounded-xl ${enabled ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-[#f5f1ee] dark:bg-slate-800'}`}>
                                <p className="text-xs font-bold text-[#606e8a] uppercase mb-2">
                                    <Icon name="info" className="text-[14px] align-text-bottom" /> Xem trước:
                                </p>
                                {enabled ? (
                                    <p className="text-sm text-[#111318] dark:text-white">
                                        Nhân viên phải đăng ký/hủy suất ăn <strong>trước {deadlineTime}</strong>
                                        {offsetDays === 0 && ' của ngày ăn'}
                                        {offsetDays === 1 && ' ngày hôm trước'}
                                        {offsetDays === 2 && ' trước 2 ngày'}
                                        . Sau giờ này, nút sẽ bị <strong className="text-red-500">khóa 🔒</strong>.
                                    </p>
                                ) : (
                                    <p className="text-sm text-[#111318] dark:text-white">
                                        Tính năng <strong>đang tắt</strong>. Nhân viên có thể đăng ký/hủy bất cứ lúc nào.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="flex-1 h-12 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white font-bold rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex-1 h-12 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                        {isSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
                    </button>
                </div>
            </div>
        </div>
    );
}
