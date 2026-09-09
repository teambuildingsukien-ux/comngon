'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface AutoResetSettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function AutoResetSettingModal({ isOpen, onClose, onSuccess }: AutoResetSettingModalProps) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [resetTime, setResetTime] = useState('13:30');
    const [isSaving, setIsSaving] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [runResult, setRunResult] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [isPastCron, setIsPastCron] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            checkCronTime();
        }
    }, [isOpen]);

    // Check if current VN time is past 13:30
    const checkCronTime = () => {
        const now = new Date();
        const vnHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false }));
        const vnMin = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', minute: 'numeric' }));
        setIsPastCron(vnHour > 13 || (vnHour === 13 && vnMin >= 30));
    };

    const fetchSettings = async () => {
        try {
            setIsLoading(true);
            setError('');
            const response = await fetch('/api/admin/settings/auto-reset');
            if (!response.ok) throw new Error('Failed to fetch settings');
            const result = await response.json();
            setIsEnabled(result.data.enabled);
            setResetTime(result.data.reset_time || '13:30');
            setLastRun(result.data.last_run || null);
        } catch (err) {
            console.error('Error fetching auto-reset settings:', err);
            setError('Không thể tải cài đặt.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setError('');
            const response = await fetch('/api/admin/settings/auto-reset', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: isEnabled, reset_time: resetTime }),
            });
            if (!response.ok) throw new Error('Failed to save');
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            setError('Không thể lưu cài đặt.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRunNow = async () => {
        try {
            setIsRunning(true);
            setError('');
            setRunResult(null);
            const response = await fetch('/api/admin/trigger-reset', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed');
            const results = data.data?.results || [];
            const created = results.reduce((sum: number, r: any) => sum + (r.created || 0), 0);
            const unlocked = results.reduce((sum: number, r: any) => sum + (r.unlocked || 0), 0);
            setRunResult(`✅ Tạo ${created} orders, mở khóa ${unlocked} orders cho ngày mai`);
            setLastRun(new Date().toISOString());
        } catch (err: any) {
            setError(err.message || 'Không thể chạy reset.');
        } finally {
            setIsRunning(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                <Icon name="autorenew" className="text-green-600 text-[24px]" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Tự động đăng ký lại
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Cron chạy tự động lúc <strong>{resetTime} VN</strong> mỗi ngày
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <Icon name="close" className="text-gray-500 text-[20px]" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {isLoading ? (
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p className="mt-2 text-sm text-gray-500">Đang tải...</p>
                        </div>
                    ) : (
                        <>
                            {/* Toggle bật/tắt */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                                <div className="flex-1">
                                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Bật tự động reset
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Tạo orders ngày mai + mở khóa nút cho NV
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsEnabled(!isEnabled)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Giờ reset — Admin cấu hình */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                                <div className="flex-1">
                                    <label className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Giờ chuyển ngày mai
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Sau giờ này, NV sẽ đăng ký cho ngày mai
                                    </p>
                                </div>
                                <input
                                    type="time"
                                    value={resetTime}
                                    onChange={(e) => setResetTime(e.target.value)}
                                    className="px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-mono font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            {/* Schedule info */}
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Icon name="schedule" className="text-blue-600 text-[20px] mt-0.5" />
                                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                                        <p><strong>{resetTime} VN</strong> — Cron tự động tạo orders cho ngày mai</p>
                                        <p>Sau {resetTime}, đăng ký hôm nay bị khóa. NV chỉ có thể đăng ký cho ngày mai.</p>
                                        <p>Admin có thể bấm nút bên dưới để chạy thủ công bất cứ lúc nào.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Manual trigger button */}
                            <button
                                onClick={handleRunNow}
                                disabled={isRunning}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${isPastCron
                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20'
                                    }`}
                            >
                                {isRunning ? (
                                    <>
                                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Đang chạy...
                                    </>
                                ) : isPastCron ? (
                                    <>
                                        <Icon name="lock_open" className="text-[18px]" />
                                        Mở đăng ký ngày mai
                                    </>
                                ) : (
                                    <>
                                        <Icon name="play_arrow" className="text-[18px]" />
                                        Chạy reset ngay
                                    </>
                                )}
                            </button>

                            {/* Last run */}
                            {lastRun && (
                                <p className="text-[11px] text-center text-gray-400">
                                    Lần chạy cuối: {new Date(lastRun).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                                </p>
                            )}

                            {/* Run result */}
                            {runResult && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">{runResult}</p>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Đóng
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Icon name="save" className="text-[18px]" />
                                Lưu cài đặt
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
