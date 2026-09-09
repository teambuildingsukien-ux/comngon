'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export type DeptModalMode = 'add' | 'edit' | 'delete' | null;

interface ManageDepartmentModalProps {
    isOpen: boolean;
    mode: DeptModalMode;
    departmentName: string | null;
    employeeCount?: number;
    existingDepartments: string[];
    onClose: () => void;
    onSuccess: (action: 'add' | 'edit' | 'delete', oldName?: string, newName?: string) => void;
}

export default function ManageDepartmentModal({
    isOpen,
    mode,
    departmentName,
    employeeCount = 0,
    existingDepartments,
    onClose,
    onSuccess
}: ManageDepartmentModalProps) {
    const [nameInput, setNameInput] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setError('');
            if (mode === 'edit' && departmentName) {
                setNameInput(departmentName);
            } else {
                setNameInput('');
            }
        }
    }, [isOpen, mode, departmentName]);

    if (!isOpen || !mode) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedName = nameInput.trim();
        if ((mode === 'add' || mode === 'edit') && !trimmedName) {
            setError('Vui lòng nhập tên phòng ban');
            return;
        }

        // Check duplicate name
        if (mode === 'add' && existingDepartments.some(d => d.toLowerCase() === trimmedName.toLowerCase())) {
            setError('Tên phòng ban này đã tồn tại');
            return;
        }

        if (mode === 'edit' && trimmedName.toLowerCase() !== departmentName?.toLowerCase() &&
            existingDepartments.some(d => d.toLowerCase() === trimmedName.toLowerCase())) {
            setError('Tên phòng ban mới đã trùng với phòng ban khác');
            return;
        }

        setIsSubmitting(true);
        try {
            if (mode === 'add') {
                const res = await fetch('/api/admin/departments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: trimmedName })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra khi tạo phòng ban');

                onSuccess('add', undefined, trimmedName);
                onClose();
            } else if (mode === 'edit' && departmentName) {
                if (trimmedName === departmentName) {
                    onClose();
                    return;
                }
                const res = await fetch('/api/admin/departments', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldName: departmentName, newName: trimmedName })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra khi đổi tên phòng ban');

                onSuccess('edit', departmentName, trimmedName);
                onClose();
            } else if (mode === 'delete' && departmentName) {
                const res = await fetch('/api/admin/departments', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: departmentName })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra khi xóa phòng ban');

                onSuccess('delete', departmentName);
                onClose();
            }
        } catch (err: any) {
            console.error('Lỗi quản lý phòng ban:', err);
            setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Container */}
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                            mode === 'delete' 
                                ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                                : 'bg-primary/10 text-primary'
                        }`}>
                            <Icon name={mode === 'add' ? 'corporate_fare' : mode === 'edit' ? 'edit' : 'delete'} className="text-xl" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                                {mode === 'add' && 'Thêm Phòng Ban Mới'}
                                {mode === 'edit' && 'Đổi Tên Phòng Ban'}
                                {mode === 'delete' && 'Xóa Phòng Ban'}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {mode === 'add' && 'Tạo thêm phòng ban trong cấu trúc công ty'}
                                {mode === 'edit' && `Chỉnh sửa tên cho: ${departmentName}`}
                                {mode === 'delete' && 'Xác nhận xóa phòng ban khỏi hệ thống'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <Icon name="close" className="text-lg" />
                    </button>
                </div>

                {/* Content / Form */}
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-200 dark:border-red-800">
                            <Icon name="error" className="text-base flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {mode === 'delete' ? (
                        <div className="space-y-3">
                            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-sm text-amber-800 dark:text-amber-300">
                                <p className="font-bold mb-1">⚠️ Bạn có chắc chắn muốn xóa phòng ban này?</p>
                                <p className="text-xs opacity-90">
                                    Phòng ban <span className="font-extrabold underline">{departmentName}</span> hiện có <span className="font-bold">{employeeCount}</span> nhân viên. Khi xóa, tất cả nhân viên này sẽ được chuyển thành <span className="font-bold">"Chưa có phòng ban"</span>.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                                Tên phòng ban <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                placeholder="VD: Phòng Sales, Phòng Kế Toán..."
                                autoFocus
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-slate-900 transition-all font-medium"
                            />
                            {mode === 'edit' && (
                                <p className="text-[11px] text-slate-500 mt-2">
                                    💡 Đổi tên phòng ban sẽ tự động cập nhật lại cho <span className="font-bold text-primary">{employeeCount}</span> nhân viên đang thuộc phòng ban này.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 ${
                                mode === 'delete'
                                    ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                                    : 'bg-primary hover:bg-primary/90 shadow-primary/20'
                            } disabled:opacity-50`}
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Đang xử lý...</span>
                                </>
                            ) : (
                                <>
                                    <Icon name={mode === 'delete' ? 'delete' : 'check'} className="text-lg" />
                                    <span>
                                        {mode === 'add' && 'Tạo phòng ban'}
                                        {mode === 'edit' && 'Cập nhật'}
                                        {mode === 'delete' && 'Xác nhận xóa'}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
