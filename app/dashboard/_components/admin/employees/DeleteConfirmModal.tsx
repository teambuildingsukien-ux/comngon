'use client';

import { useState } from 'react';

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Employee {
    id: string;
    email: string;
    full_name: string;
    role: string;
}

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    employee: Employee;
}

export default function DeleteConfirmModal({ isOpen, onClose, onSuccess, employee }: DeleteConfirmModalProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setError(null);
        setIsDeleting(true);

        try {
            const res = await fetch(`/api/admin/employees/${employee.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Không thể xóa nhân viên');
            }

            // Success!
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error deleting employee:', err);
            setError(err.message || 'Không thể xóa nhân viên. Vui lòng thử lại.');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <Icon name="warning" className="text-red-600 dark:text-red-400 text-[28px]" />
                        </div>
                        <h2 className="text-xl font-bold dark:text-white">Xác Nhận Xóa</h2>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                            <Icon name="error" className="text-red-600 dark:text-red-400" />
                            <span className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</span>
                        </div>
                    )}

                    <p className="text-sm text-[#606e8a]">
                        Bạn có chắc chắn muốn xóa nhân viên này không?
                    </p>

                    {/* Employee info */}
                    <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex items-center gap-3 mb-2">
                            <Icon name="person" className="text-[#606e8a]" />
                            <span className="font-bold dark:text-white">{employee.full_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-[#606e8a]">
                            <Icon name="email" className="text-[16px]" />
                            <span>{employee.email}</span>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-500 dark:border-red-800 rounded-lg">
                        <p className="text-xs text-red-700 dark:text-red-400 font-semibold">
                            <Icon name="warning" className="text-[16px] inline mr-1" />
                            ⚠️ Thao tác này sẽ XÓA VĨNH VIỄN tài khoản khỏi hệ thống. Không thể hoàn tác!
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="flex-1 py-3 px-4 rounded-lg border-2 border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] font-semibold text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 py-3 px-4 rounded-lg bg-red-600 text-white font-bold text-sm shadow-lg shadow-red-600/25 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isDeleting ? (
                            <>
                                <Icon name="progress_activity" className="text-[20px] animate-spin" />
                                Đang xóa...
                            </>
                        ) : (
                            <>
                                <Icon name="delete" className="text-[20px]" />
                                Xóa nhân viên
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
