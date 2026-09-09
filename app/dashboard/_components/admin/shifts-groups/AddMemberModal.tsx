'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Employee {
    id: string;
    full_name: string;
    email: string;
    employee_code: string | null;
    department: string | null;
    avatar_url: string | null;
}

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    groupId: string;
    groupName: string;
}

export default function AddMemberModal({ isOpen, onClose, onSuccess, groupId, groupName }: AddMemberModalProps) {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchUnassignedEmployees();
            setSearchQuery('');
        }
    }, [isOpen]);

    useEffect(() => {
        // Filter employees based on search query
        const query = searchQuery.toLowerCase();
        const filtered = employees.filter(emp =>
            emp.full_name.toLowerCase().includes(query) ||
            emp.email.toLowerCase().includes(query) ||
            (emp.employee_code && emp.employee_code.toLowerCase().includes(query)) ||
            (emp.department && emp.department.toLowerCase().includes(query))
        );
        setFilteredEmployees(filtered);
    }, [searchQuery, employees]);

    const fetchUnassignedEmployees = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/employees/unassigned');
            const result = await response.json();
            if (result.data) {
                setEmployees(result.data);
                setFilteredEmployees(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddMember = async (userId: string) => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch(`/api/admin/groups/${groupId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add member');
            }

            onSuccess();
            fetchUnassignedEmployees(); // Refresh list
        } catch (error: any) {
            setError(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                <Icon name="person_add" className="text-2xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold dark:text-white">Thêm nhân viên vào nhóm</h2>
                                <p className="text-xs text-[#606e8a] mt-0.5">Nhóm: {groupName}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-[#f5f1ee] dark:hover:bg-slate-800 text-[#606e8a]"
                        >
                            <Icon name="close" />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="mt-4 relative">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606e8a]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-[#f5f1ee] dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary dark:text-white"
                            placeholder="Tìm theo tên, email, mã NV, phòng ban..."
                        />
                    </div>
                </div>

                {/* Employee List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="text-center py-8 text-[#606e8a]">Đang tải...</div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="text-center py-8 text-[#606e8a]">
                            <Icon name="person_off" className="text-6xl mb-2" />
                            <p className="text-sm">Không có nhân viên nào chưa được gán nhóm</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredEmployees.map((employee) => (
                                <div
                                    key={employee.id}
                                    className="flex items-center justify-between p-4 bg-[#f5f1ee] dark:bg-slate-800 rounded-lg hover:bg-[#ebe7e3] dark:hover:bg-slate-750 transition-colors"
                                >
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                                            {getInitials(employee.full_name)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm dark:text-white truncate">
                                                {employee.full_name}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-[#606e8a] mt-0.5">
                                                {employee.employee_code && (
                                                    <span className="font-mono">{employee.employee_code}</span>
                                                )}
                                                {employee.employee_code && employee.department && (
                                                    <span>•</span>
                                                )}
                                                {employee.department && <span>{employee.department}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleAddMember(employee.id)}
                                        disabled={isSubmitting}
                                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <Icon name="add" className="text-lg" />
                                        Thêm
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800">
                    <button
                        onClick={onClose}
                        className="w-full h-12 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white rounded-lg font-bold hover:bg-[#ebe7e3] transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
