'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Shift {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
}

interface Member {
    id: string;
    full_name: string;
    email: string;
    employee_code: string | null;
    department: string | null;
}

interface UnassignedEmployee {
    id: string;
    full_name: string;
    email: string;
    employee_code: string | null;
    department: string | null;
    group_id: string | null; // To check if already assigned
}

interface EditGroupModalProps {
    groupId: string;
    groupName: string;
    currentShiftId: string | null;
    shifts: Shift[];
    onClose: () => void;
    onSuccess: () => void;
}

export default function EditGroupModal({
    groupId,
    groupName,
    currentShiftId,
    shifts,
    onClose,
    onSuccess
}: EditGroupModalProps) {
    const [name, setName] = useState(groupName);
    const [shiftId, setShiftId] = useState<string>(currentShiftId || '');
    const [members, setMembers] = useState<Member[]>([]);
    const [unassignedEmployees, setUnassignedEmployees] = useState<UnassignedEmployee[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [isLoadingUnassigned, setIsLoadingUnassigned] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch current members
    useEffect(() => {
        fetchMembers();
    }, [groupId]);

    const fetchMembers = async () => {
        setIsLoadingMembers(true);
        try {
            const response = await fetch(`/api/admin/groups/${groupId}/members`);
            if (response.ok) {
                const result = await response.json();
                setMembers(result.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch members:', error);
        } finally {
            setIsLoadingMembers(false);
        }
    };

    const fetchUnassignedEmployees = async () => {
        setIsLoadingUnassigned(true);
        try {
            const response = await fetch('/api/admin/employees/unassigned');
            if (response.ok) {
                const result = await response.json();
                setUnassignedEmployees(result.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch unassigned employees:', error);
        } finally {
            setIsLoadingUnassigned(false);
        }
    };

    const handleAddMemberClick = () => {
        setShowAddMember(true);
        setSelectedEmployeeIds([]);
        setSearchQuery('');
        fetchUnassignedEmployees();
    };

    const handleToggleEmployee = (employeeId: string) => {
        setSelectedEmployeeIds(prev =>
            prev.includes(employeeId)
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    const handleAddMembers = async () => {
        if (selectedEmployeeIds.length === 0) {
            alert('Vui lòng chọn ít nhất một nhân viên');
            return;
        }

        try {
            const errors: string[] = [];
            const successes: string[] = [];

            // Add employees sequentially to avoid race conditions
            for (const userId of selectedEmployeeIds) {
                try {
                    const response = await fetch(`/api/admin/groups/${groupId}/members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: userId })
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        const employee = unassignedEmployees.find(e => e.id === userId);
                        errors.push(`${employee?.full_name}: ${result.error}`);
                    } else {
                        const employee = unassignedEmployees.find(e => e.id === userId);
                        if (employee) successes.push(employee.full_name);
                    }
                } catch (err) {
                    const employee = unassignedEmployees.find(e => e.id === userId);
                    errors.push(`${employee?.full_name}: Lỗi kết nối`);
                }
            }

            // Show results
            let message = '';
            if (successes.length > 0) {
                message += `✅ Đã thêm ${successes.length} nhân viên:\n${successes.join(', ')}\n\n`;
            }
            if (errors.length > 0) {
                message += `❌ Không thể thêm ${errors.length} nhân viên:\n${errors.join('\n')}`;
            }

            if (message) alert(message);

            // Refresh lists
            await fetchMembers();
            await fetchUnassignedEmployees();

            // Close form
            setShowAddMember(false);
            setSelectedEmployeeIds([]);
            setSearchQuery('');
        } catch (error) {
            console.error('Failed to add members:', error);
            alert('Không thể thêm nhân viên');
        }
    };

    const handleRemoveMember = async (userId: string, userName: string) => {
        if (!confirm(`Xác nhận gỡ ${userName} khỏi nhóm?`)) return;

        try {
            const response = await fetch(`/api/admin/groups/${groupId}/members/${userId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể gỡ nhân viên');
                return;
            }

            fetchMembers();
        } catch (error) {
            console.error('Failed to remove member:', error);
            alert('Không thể gỡ nhân viên');
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('Vui lòng nhập tên nhóm');
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch(`/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    shift_id: shiftId || null
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể cập nhật nhóm');
                return;
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to update group:', error);
            alert('Không thể cập nhật nhóm');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black text-[#111318] dark:text-white">
                            Chỉnh sửa nhóm
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
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {/* Group Name */}
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Tên nhóm <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="VD: Marketing 4"
                                className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                            />
                        </div>

                        {/* Shift Selection */}
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Ca ăn
                            </label>
                            <select
                                value={shiftId}
                                onChange={(e) => setShiftId(e.target.value)}
                                className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white focus:ring-2 focus:ring-primary"
                            >
                                <option value="">-- Chưa gán ca --</option>
                                {shifts.map((shift) => (
                                    <option key={shift.id} value={shift.id}>
                                        {shift.name} ({shift.start_time} - {shift.end_time})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Members Section */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-bold text-[#111318] dark:text-white">
                                    Thành viên ({members.length})
                                </label>
                                <button
                                    onClick={handleAddMemberClick}
                                    className="flex items-center gap-1 text-primary text-sm font-bold hover:underline"
                                >
                                    <Icon name="add" className="text-lg" />
                                    Thêm nhân viên
                                </button>
                            </div>

                            {/* Add Member Form */}
                            {showAddMember && (
                                <div className="mb-4 p-4 bg-[#f5f1ee] dark:bg-slate-800 rounded-xl space-y-3">
                                    {/* Search Box */}
                                    <div className="relative">
                                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606e8a] text-lg" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Tìm kiếm theo tên..."
                                            className="w-full h-10 pl-10 pr-4 bg-white dark:bg-slate-900 border-none rounded-lg text-sm text-[#111318] dark:text-white placeholder-[#606e8a]"
                                        />
                                    </div>

                                    {/* Employee List with Checkboxes */}
                                    {isLoadingUnassigned ? (
                                        <div className="text-center py-4 text-[#606e8a] text-sm">Đang tải...</div>
                                    ) : (() => {
                                        // Filter by search query
                                        const filteredEmployees = unassignedEmployees.filter(emp =>
                                            emp.full_name.toLowerCase().includes(searchQuery.toLowerCase())
                                        );

                                        // Separate into available and unavailable
                                        const availableEmployees = filteredEmployees.filter(emp => !emp.group_id);
                                        const unavailableEmployees = filteredEmployees.filter(emp => emp.group_id);

                                        if (filteredEmployees.length === 0) {
                                            return (
                                                <div className="text-center py-4 text-[#606e8a] text-sm">
                                                    {searchQuery ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên nào'}
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="max-h-60 overflow-y-auto space-y-1">
                                                {/* Available employees first */}
                                                {availableEmployees.map((emp) => (
                                                    <label
                                                        key={emp.id}
                                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-900 cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedEmployeeIds.includes(emp.id)}
                                                            onChange={() => handleToggleEmployee(emp.id)}
                                                            className="size-4 rounded border-2 border-[#dbdfe6] dark:border-slate-700 text-primary focus:ring-2 focus:ring-primary cursor-pointer"
                                                        />
                                                        <span className="text-sm font-medium text-[#111318] dark:text-white">
                                                            {emp.full_name}
                                                        </span>
                                                    </label>
                                                ))}

                                                {/* Unavailable employees (disabled) */}
                                                {unavailableEmployees.length > 0 && (
                                                    <>
                                                        {availableEmployees.length > 0 && (
                                                            <div className="border-t border-[#dbdfe6] dark:border-slate-700 my-2 pt-2">
                                                                <p className="text-xs text-[#606e8a] px-2 mb-1">Đã vào nhóm khác:</p>
                                                            </div>
                                                        )}
                                                        {unavailableEmployees.map((emp) => (
                                                            <label
                                                                key={emp.id}
                                                                className="flex items-center gap-3 p-2 rounded-lg opacity-50 cursor-not-allowed"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    disabled
                                                                    className="size-4 rounded border-2 border-[#dbdfe6] dark:border-slate-700 cursor-not-allowed"
                                                                />
                                                                <span className="text-sm font-medium text-[#606e8a]">
                                                                    {emp.full_name}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={handleAddMembers}
                                            disabled={selectedEmployeeIds.length === 0}
                                            className="flex-1 h-10 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Thêm ({selectedEmployeeIds.length})
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowAddMember(false);
                                                setSelectedEmployeeIds([]);
                                                setSearchQuery('');
                                            }}
                                            className="px-4 h-10 bg-white dark:bg-slate-900 text-[#111318] dark:text-white text-sm font-bold rounded-lg hover:bg-[#f5f1ee] dark:hover:bg-slate-800 transition-colors"
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Members List */}
                            {isLoadingMembers ? (
                                <div className="text-center py-8 text-[#606e8a]">Đang tải...</div>
                            ) : members.length === 0 ? (
                                <div className="text-center py-8 text-[#606e8a]">
                                    <Icon name="group_off" className="text-4xl mb-2" />
                                    <p className="text-sm">Chưa có thành viên nào</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {members.map((member) => (
                                        <div
                                            key={member.id}
                                            className="flex items-center justify-between p-3 bg-[#f5f1ee] dark:bg-slate-800 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                    {member.full_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-[#111318] dark:text-white text-sm">
                                                        {member.full_name}
                                                    </p>
                                                    <p className="text-xs text-[#606e8a]">
                                                        {member.email} {member.department && `• ${member.department}`}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveMember(member.id, member.full_name)}
                                                className="size-8 flex items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                                            >
                                                <Icon name="person_remove" className="text-lg" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 h-12 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white font-bold rounded-xl hover:opacity-80 transition-opacity"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-12 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                        {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </div>
    );
}
