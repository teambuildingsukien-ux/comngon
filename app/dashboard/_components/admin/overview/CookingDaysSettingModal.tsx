'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface CookingDaysSettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DAYS_OF_WEEK = [
    { value: 1, label: 'Thứ 2' },
    { value: 2, label: 'Thứ 3' },
    { value: 3, label: 'Thứ 4' },
    { value: 4, label: 'Thứ 5' },
    { value: 5, label: 'Thứ 6' },
    { value: 6, label: 'Thứ 7' },
];

export default function CookingDaysSettingModal({
    isOpen,
    onClose,
    onSuccess
}: CookingDaysSettingModalProps) {
    const [startDay, setStartDay] = useState(1); // Monday
    const [endDay, setEndDay] = useState(5); // Friday
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
            const response = await fetch('/api/admin/settings/cooking-days');
            if (response.ok) {
                const result = await response.json();
                setStartDay(result.data.start_day);
                setEndDay(result.data.end_day);
            }
        } catch (error) {
            console.error('Failed to fetch cooking days setting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (startDay === endDay) {
            alert('Vui lòng chọn ít nhất 2 ngày');
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/admin/settings/cooking-days', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_day: startDay,
                    end_day: endDay
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
            console.error('Failed to save cooking days setting:', error);
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
                            ⚙️ Cài đặt ngày nấu cơm
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
                        <div className="space-y-6">
                            <p className="text-sm text-[#606e8a]">
                                Chọn các ngày trong tuần mà công ty nấu cơm. Biểu đồ sẽ chỉ hiển thị các ngày được chọn.
                            </p>

                            {/* Start Day */}
                            <div>
                                <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                    Từ ngày <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={startDay}
                                    onChange={(e) => setStartDay(Number(e.target.value))}
                                    className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                                >
                                    {DAYS_OF_WEEK.map((day) => (
                                        <option key={day.value} value={day.value}>
                                            {day.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* End Day */}
                            <div>
                                <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                    Đến ngày <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={endDay}
                                    onChange={(e) => setEndDay(Number(e.target.value))}
                                    className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                                >
                                    {DAYS_OF_WEEK.map((day) => (
                                        <option key={day.value} value={day.value}>
                                            {day.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Preview */}
                            <div className="p-4 bg-[#f5f1ee] dark:bg-slate-800 rounded-xl">
                                <p className="text-xs font-bold text-[#606e8a] uppercase mb-2">Xem trước:</p>
                                <p className="text-sm text-[#111318] dark:text-white">
                                    Biểu đồ sẽ hiển thị <strong>
                                        {DAYS_OF_WEEK.find(d => d.value === startDay)?.label}
                                    </strong> đến <strong>
                                        {DAYS_OF_WEEK.find(d => d.value === endDay)?.label}
                                    </strong>
                                </p>
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
