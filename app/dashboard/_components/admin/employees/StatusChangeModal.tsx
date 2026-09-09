'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

type EmployeeStatus = 'active' | 'paused' | 'resigned';

interface StatusChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: {
        id: string;
        full_name: string;
        email: string;
        status: EmployeeStatus;
        resigned_date?: string | null; // ✅ v5.4.0: cần để detect scheduled resignation
    };
    onStatusChanged: () => void;
}

const STATUS_CONFIG: Record<EmployeeStatus, {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
    description: string;
}> = {
    active: {
        label: 'Hoạt động',
        color: 'text-green-700',
        bgColor: 'bg-green-50 border-green-200',
        icon: 'check_circle',
        description: 'Nhân viên có thể đăng ký suất ăn và sử dụng hệ thống bình thường.'
    },
    paused: {
        label: 'Tạm dừng',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50 border-amber-200',
        icon: 'pause_circle',
        description: 'Nhân viên không thể đăng ký suất ăn nhưng vẫn đăng nhập xem lịch sử.'
    },
    resigned: {
        label: 'Đã nghỉ',
        color: 'text-red-700',
        bgColor: 'bg-red-50 border-red-200',
        icon: 'cancel',
        description: 'Nhân viên không thể đăng nhập. Dữ liệu lịch sử được giữ lại.'
    }
};

export default function StatusChangeModal({
    isOpen,
    onClose,
    employee,
    onStatusChanged
}: StatusChangeModalProps) {
    const supabase = createClient();
    const [newStatus, setNewStatus] = useState<EmployeeStatus>(employee.status);
    const [reason, setReason] = useState('');
    const [resignedDate, setResignedDate] = useState(
        new Date().toISOString().split('T')[0] // Default = hôm nay (YYYY-MM-DD)
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const currentConfig = STATUS_CONFIG[employee.status];
    const newConfig = STATUS_CONFIG[newStatus];
    const hasChanged = newStatus !== employee.status;
    const needsReason = hasChanged && newStatus !== 'active';
    const isResigning = newStatus === 'resigned';

    // ✅ v5.4.0: Check if resigned_date is in the future
    const todayStr = new Date().toISOString().split('T')[0];
    const isFutureResignation = isResigning && resignedDate > todayStr;

    // ✅ v5.4.0: NV đang active nhưng có resigned_date tương lai = đang scheduled
    const hasScheduledResignation = employee.status === 'active'
        && employee.resigned_date
        && employee.resigned_date > todayStr;

    // ✅ v5.4.0: Hủy lịch nghỉ đã đặt
    const handleCancelSchedule = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`/api/admin/employees/${employee.id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel_resignation' }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Không thể hủy lịch nghỉ');
            }

            setSuccess(true);
            setTimeout(() => {
                onStatusChanged();
                handleClose();
            }, 1500);
        } catch (err: any) {
            setError(err.message || 'Không thể hủy lịch nghỉ');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        if (!hasChanged) return;
        if (needsReason && !reason.trim()) {
            setError('Vui lòng nhập lý do');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch(`/api/admin/employees/${employee.id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'change_status',
                    newStatus,
                    reason,
                    resignedDate,
                    isFutureResignation,
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Lỗi cập nhật trạng thái');
            }

            setSuccess(true);
            setTimeout(() => {
                onStatusChanged();
                handleClose();
            }, 1500);

        } catch (err: any) {
            setError(err.message || 'Không thể cập nhật trạng thái');
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleClose = () => {
        setNewStatus(employee.status);
        setReason('');
        setResignedDate(new Date().toISOString().split('T')[0]);
        setError(null);
        setSuccess(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="size-10 bg-orange-100 rounded-xl flex items-center justify-center">
                            <Icon name="swap_horiz" className="text-[20px] text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Đổi trạng thái</h2>
                            <p className="text-xs text-gray-500">{employee.full_name}</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                        <Icon name="close" className="text-[18px] text-gray-400" />
                    </button>
                </div>

                {success ? (
                    <div className="p-8 text-center">
                        <div className="size-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check_circle" className="text-[32px] text-green-600" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">Đã cập nhật!</h3>
                        <p className="text-sm text-gray-500">
                            {employee.full_name}: {STATUS_CONFIG[employee.status].label} → {newConfig.label}
                        </p>
                    </div>
                ) : (
                    <div className="p-5 space-y-5">
                        {/* ✅ v5.4.0: Banner hủy lịch nghỉ */}
                        {hasScheduledResignation && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <div className="flex items-start gap-2">
                                    <Icon name="schedule" className="text-[18px] text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-amber-800">
                                            ⏳ Đã đặt lịch nghỉ ngày {new Date(employee.resigned_date!).toLocaleDateString('vi-VN')}
                                        </p>
                                        <p className="text-xs text-amber-600 mt-0.5">
                                            NV sẽ tự động nghỉ khi đến ngày. Bấm nút bên dưới để hủy.
                                        </p>
                                        <button
                                            onClick={handleCancelSchedule}
                                            disabled={isSubmitting}
                                            className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                            {isSubmitting ? (
                                                <Icon name="progress_activity" className="text-[14px] animate-spin" />
                                            ) : (
                                                <Icon name="event_busy" className="text-[14px]" />
                                            )}
                                            {isSubmitting ? 'Đang hủy...' : 'Hủy lịch nghỉ'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Current status */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                Trạng thái hiện tại
                            </label>
                            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${currentConfig.bgColor}`}>
                                <Icon name={currentConfig.icon} className={`text-[18px] ${currentConfig.color}`} />
                                <span className={`text-sm font-semibold ${currentConfig.color}`}>{currentConfig.label}</span>
                            </div>
                        </div>

                        {/* New status selection */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                Chuyển sang
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                                {(Object.entries(STATUS_CONFIG) as [EmployeeStatus, typeof STATUS_CONFIG[EmployeeStatus]][]).map(([status, config]) => (
                                    <button
                                        key={status}
                                        onClick={() => { setNewStatus(status); setError(null); }}
                                        disabled={status === employee.status}
                                        className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all text-left
                                            ${newStatus === status && status !== employee.status
                                                ? `${config.bgColor} border-current ring-2 ring-offset-1 ${config.color.replace('text-', 'ring-')}`
                                                : status === employee.status
                                                    ? 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
                                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                            }`}
                                    >
                                        <Icon name={config.icon} className={`text-[20px] ${status === employee.status ? 'text-gray-300' : config.color}`} />
                                        <div>
                                            <span className={`text-sm font-semibold ${status === employee.status ? 'text-gray-400' : 'text-gray-900'}`}>
                                                {config.label}
                                                {status === employee.status && ' (hiện tại)'}
                                            </span>
                                            <p className="text-xs text-gray-400 mt-0.5">{config.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Reason input */}
                        {hasChanged && (
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                    Lý do {needsReason ? '*' : '(không bắt buộc)'}
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder={
                                        newStatus === 'paused' ? 'VD: Nghỉ thai sản, nghỉ phép dài ngày...'
                                            : newStatus === 'resigned' ? 'VD: Nghỉ việc từ 01/03/2026...'
                                                : 'VD: Quay lại làm việc...'
                                    }
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                    rows={2}
                                />
                            </div>
                        )}

                        {/* ✅ v5.4.0: Date picker cho ngày nghỉ việc (cho phép tương lai) */}
                        {isResigning && hasChanged && (
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                    📅 Ngày nghỉ việc *
                                </label>
                                <input
                                    type="date"
                                    value={resignedDate}
                                    onChange={e => setResignedDate(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    {isFutureResignation
                                        ? '⏳ Ngày tương lai — NV vẫn hoạt động cho đến ngày này, hệ thống sẽ tự cắt cơm'
                                        : 'Chọn ngày nghỉ việc chính thức của nhân viên'
                                    }
                                </p>
                            </div>
                        )}

                        {/* Warning for resigned */}
                        {isResigning && hasChanged && (
                            <div className={`${isFutureResignation ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'} border rounded-xl p-3`}>
                                <div className="flex items-start gap-2">
                                    <Icon name={isFutureResignation ? 'schedule' : 'warning'} className={`text-[18px] ${isFutureResignation ? 'text-amber-600' : 'text-red-600'} flex-shrink-0 mt-0.5`} />
                                    <div>
                                        {isFutureResignation ? (
                                            <>
                                                <p className="text-xs font-semibold text-amber-800">📅 Đặt lịch nghỉ việc</p>
                                                <p className="text-xs text-amber-600 mt-0.5">
                                                    NV sẽ tiếp tục hoạt động bình thường. Đến ngày <strong>{new Date(resignedDate).toLocaleDateString('vi-VN')}</strong>, hệ thống tự động chuyển sang &quot;Đã nghỉ&quot; và cắt suất ăn.
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xs font-semibold text-red-800">Lưu ý quan trọng</p>
                                                <p className="text-xs text-red-600 mt-0.5">
                                                    Nhân viên sẽ không thể đăng nhập vào hệ thống. Bạn có thể khôi phục lại sau nếu cần.
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                                <Icon name="error" className="text-[14px]" />
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={handleClose}
                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!hasChanged || isSubmitting}
                                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2
                                    ${!hasChanged || isSubmitting
                                        ? 'bg-gray-300 cursor-not-allowed'
                                        : isFutureResignation
                                            ? 'bg-amber-600 hover:bg-amber-700'
                                            : isResigning
                                                ? 'bg-red-600 hover:bg-red-700'
                                                : 'bg-orange-600 hover:bg-orange-700'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <Icon name="progress_activity" className="text-[16px] animate-spin" />
                                ) : (
                                    <Icon name="swap_horiz" className="text-[16px]" />
                                )}
                                {isSubmitting ? 'Đang xử lý...' : isFutureResignation ? `Đặt lịch nghỉ ${new Date(resignedDate).toLocaleDateString('vi-VN')}` : isResigning ? 'Xác nhận cho nghỉ' : 'Xác nhận'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export { STATUS_CONFIG };
export type { EmployeeStatus };
