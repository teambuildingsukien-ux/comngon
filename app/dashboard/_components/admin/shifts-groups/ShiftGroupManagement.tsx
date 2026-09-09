'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import AddShiftModal from './AddShiftModal';
import AddGroupModal from './AddGroupModal';
import AddMemberModal from './AddMemberModal';
import EditGroupModal from './EditGroupModal';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Shift {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    created_at: string;
}

interface Group {
    id: string;
    name: string;
    shift_id: string | null;
    table_area: string | null;
    department: string | null;
    created_at: string;
    shift?: Shift | null;
    member_count?: number;
    registration_mode?: string;
}

interface Member {
    id: string;
    full_name: string;
    email: string;
    employee_code: string | null;
    department: string | null;
    avatar_url: string | null;
}

export default function ShiftGroupManagement() {
    const supabase = createClient();

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Edit mode for shifts
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState({ name: '', start_time: '', end_time: '' });
    const [showAddShiftModal, setShowAddShiftModal] = useState(false);
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [showEditGroupModal, setShowEditGroupModal] = useState(false);
    const [isChangingShift, setIsChangingShift] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);

    useEffect(() => {
        fetchShifts();
        fetchGroups();
    }, []);

    useEffect(() => {
        if (selectedGroupId) {
            fetchMembers();
        } else {
            setMembers([]);
        }
    }, [selectedGroupId]);

    const fetchShifts = async () => {
        try {
            const response = await fetch('/api/admin/shifts');
            const result = await response.json();
            console.log('[ShiftGroupManagement] Shifts fetched:', result);
            if (result.data) {
                setShifts(result.data);
                if (result.data.length > 0 && !selectedShiftId) {
                    setSelectedShiftId(result.data[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to fetch shifts:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            // Get current user's tenant for filtering
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;

            const { data: currentProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', currentUser.id)
                .single();

            if (!currentProfile?.tenant_id) return;

            const { data, error } = await supabase
                .from('groups')
                .select(`
                    *,
                    shift:shifts (*)
                `)
                .eq('tenant_id', currentProfile.tenant_id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Get member counts (tenant filtered)
            const groupsWithCounts = await Promise.all(
                (data || []).map(async (group) => {
                    // ✅ AUDIT-FIX: Đếm active + paused (nhất quán với API members)
                    const { count } = await supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', currentProfile.tenant_id)
                        .eq('group_id', group.id)
                        .in('status', ['active', 'paused']);
                    return { ...group, member_count: count || 0 };
                })
            );

            console.log('[ShiftGroupManagement] Groups fetched:', groupsWithCounts);
            setGroups(groupsWithCounts);
            if (groupsWithCounts.length > 0 && !selectedGroupId) {
                setSelectedGroupId(groupsWithCounts[0].id);
            }
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        }
    };

    const fetchMembers = async () => {
        if (!selectedGroupId) return;

        try {
            const response = await fetch(`/api/admin/groups/${selectedGroupId}/members`);
            const result = await response.json();
            if (result.data) {
                setMembers(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch members:', error);
        }
    };

    const handleRemoveMember = async (userId: string, userName: string) => {
        if (!selectedGroupId) return;
        if (!confirm(`Gỡ "${userName}" khỏi nhóm?`)) return;

        try {
            const response = await fetch(`/api/admin/groups/${selectedGroupId}/members/${userId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to remove member');
                return;
            }

            await fetchMembers();
            await fetchGroups(); // Update member count
        } catch (error) {
            console.error('Failed to remove member:', error);
            alert('Failed to remove member');
        }
    };


    const handleEditShift = (shift: Shift) => {
        setEditingShiftId(shift.id);
        setEditFormData({
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time
        });
    };

    const handleUpdateShift = async (shiftId: string) => {
        try {
            const response = await fetch(`/api/admin/shifts/${shiftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể cập nhật ca ăn');
                return;
            }

            await fetchShifts();
            setEditingShiftId(null);
        } catch (error) {
            console.error('Failed to update shift:', error);
            alert('Không thể cập nhật ca ăn');
        }
    };

    const handleDeleteShift = async (shiftId: string, shiftName: string) => {
        if (!confirm(`Xóa ca "${shiftName}"? Chỉ có thể xóa nếu không có nhóm nào đang sử dụng.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/shifts/${shiftId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể xóa ca ăn');
                return;
            }

            // ✅ AUDIT-FIX: Reset selection TRƯỚC khi re-fetch (tránh stale state)
            if (selectedShiftId === shiftId) {
                setSelectedShiftId(null);
            }
            await fetchShifts();
        } catch (error) {
            console.error('Failed to delete shift:', error);
            alert('Failed to delete shift');
        }
    };

    const handleChangeGroupShift = async (groupId: string, newShiftId: string) => {
        try {
            const response = await fetch(`/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shift_id: newShiftId || null })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to change shift');
                return;
            }

            await fetchGroups();
            setIsChangingShift(false);
        } catch (error) {
            console.error('Failed to change shift:', error);
            alert('Failed to change shift');
        }
    };

    // ✅ AUDIT-FIX: Gọi qua API thay vì client trực tiếp → ghi activity_log
    const handleChangeRegistrationMode = async (groupId: string, mode: string) => {
        try {
            const response = await fetch(`/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registration_mode: mode })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Không thể đổi chế độ đăng ký');
                return;
            }

            fetchGroups();
        } catch (error) {
            console.error('Failed to update registration mode:', error);
            alert('Không thể đổi chế độ đăng ký');
        }
    };

    const handleDeleteGroup = async (groupId: string, groupName: string) => {
        if (!confirm(`Xóa nhóm "${groupName}"? Các nhân viên trong nhóm sẽ bị gỡ khỏi nhóm.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/groups/${groupId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to delete group');
                return;
            }

            // ✅ AUDIT-FIX: Reset selection TRƯỚC khi re-fetch (tránh stale state)
            if (selectedGroupId === groupId) {
                setSelectedGroupId(null);
            }
            await fetchGroups();
        } catch (error) {
            console.error('Failed to delete group:', error);
            alert('Failed to delete group');
        }
    };


    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#dbdfe6] dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex justify-between items-end gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-[#111318] dark:text-white text-3xl font-black leading-tight tracking-[-0.033em]">
                            Quản Lý Ca & Nhóm Ăn
                        </p>
                        <p className="text-[#606e8a] text-sm font-normal">
                            Điều chỉnh khung giờ ăn và phân bổ nhân sự vào các nhóm luân phiên.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowAddGroupModal(true)}
                            className="flex items-center gap-2 px-4 h-10 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90"
                        >
                            <Icon name="add" className="text-lg" /> Tạo nhóm mới
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 min-h-0 overflow-hidden gap-6 p-6">
                {/* LEFT SIDEBAR: Shifts */}
                <section className="w-80 flex flex-col gap-4 shrink-0 overflow-y-auto pr-2">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-[#111318] dark:text-white text-lg font-bold flex items-center gap-2">
                            <Icon name="schedule" className="text-primary" /> Ca ăn hiện tại
                        </h2>
                        <button
                            onClick={() => setShowAddShiftModal(true)}
                            className="text-primary text-xs font-bold hover:underline"
                        >
                            Thêm ca
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-8 text-[#606e8a]">Đang tải...</div>
                    ) : shifts.length === 0 ? (
                        <div className="text-center py-8 text-[#606e8a]">Chưa có ca ăn nào</div>
                    ) : (
                        shifts.map((shift) => {
                            const isSelected = shift.id === selectedShiftId;
                            const isEditing = shift.id === editingShiftId;

                            return (
                                <div
                                    key={shift.id}
                                    className={`bg-white dark:bg-slate-900 rounded-xl border p-4 shadow-sm transition-all ${isSelected
                                        ? 'border-primary ring-1 ring-primary/20'
                                        : 'border-[#dbdfe6] dark:border-slate-800 opacity-80 hover:opacity-100'
                                        }`}
                                    onClick={() => !isEditing && setSelectedShiftId(shift.id)}
                                >
                                    {isSelected && (
                                        <div className="absolute top-4 right-4">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase">
                                                Đang chọn
                                            </span>
                                        </div>
                                    )}

                                    <p className="text-base font-bold mb-3 dark:text-white">{shift.name}</p>

                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase text-[#606e8a] font-bold">Tên ca</span>
                                                <input
                                                    type="text"
                                                    value={editFormData.name}
                                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                                    className="w-full bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg text-sm px-3 py-2 focus:ring-1 focus:ring-primary"
                                                    placeholder="VD: Ca Sáng"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase text-[#606e8a] font-bold">Giờ bắt đầu</span>
                                                <input
                                                    type="time"
                                                    value={editFormData.start_time}
                                                    onChange={(e) => setEditFormData({ ...editFormData, start_time: e.target.value })}
                                                    className="w-full bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg text-sm px-3 py-2 focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase text-[#606e8a] font-bold">Giờ kết thúc</span>
                                                <input
                                                    type="time"
                                                    value={editFormData.end_time}
                                                    onChange={(e) => setEditFormData({ ...editFormData, end_time: e.target.value })}
                                                    className="w-full bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-lg text-sm px-3 py-2 focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleUpdateShift(shift.id)}
                                                    className="flex-1 h-8 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90"
                                                >
                                                    Cập nhật
                                                </button>
                                                <button
                                                    onClick={() => setEditingShiftId(null)}
                                                    className="h-8 px-3 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white text-xs font-bold rounded-lg"
                                                >
                                                    Hủy
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex flex-col gap-1 text-[#606e8a]">
                                                <span className="text-[10px] uppercase font-bold">Khung giờ</span>
                                                <p className="text-sm font-medium">
                                                    {shift.start_time} - {shift.end_time}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditShift(shift);
                                                    }}
                                                    className="flex-1 h-8 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white text-xs font-bold rounded-lg"
                                                >
                                                    Chỉnh sửa
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteShift(shift.id, shift.name);
                                                    }}
                                                    className="size-8 bg-[#f5f1ee] dark:bg-slate-800 text-[#111318] dark:text-white flex items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Icon name="delete" className="text-lg" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </section>


                {/* MAIN CONTENT: Group Details */}
                <section className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Group Selector Dropdown */}
                    <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800">
                        <label className="block text-xs font-bold text-[#606e8a] uppercase mb-2">Chọn nhóm để xem chi tiết</label>
                        <select
                            value={selectedGroupId || ''}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            className="w-full h-12 px-4 bg-[#f5f1ee] dark:bg-slate-800 border-none rounded-xl text-[#111318] dark:text-white font-bold focus:ring-2 focus:ring-primary"
                        >
                            <option value="">-- Chọn nhóm --</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name} • {group.shift?.name || 'Chưa gán ca'} • {group.member_count} nhân viên
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedGroup ? (
                        <>
                            <div className="p-6 border-b border-[#f5f1ee] dark:border-slate-800">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-2xl font-black text-[#111318] dark:text-white">
                                            {selectedGroup.name}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="flex items-center gap-1 text-sm text-[#606e8a]">
                                                <Icon name="schedule" className="text-base" />
                                                Thuộc ca: <strong>{selectedGroup.shift?.name || 'Chưa gán'}</strong>
                                            </span>
                                            <span className="size-1 rounded-full bg-[#606e8a]"></span>
                                            <span className="flex items-center gap-1 text-sm text-[#606e8a]">
                                                <Icon name="person" className="text-base" />
                                                <strong>{selectedGroup.member_count}</strong> nhân viên
                                            </span>
                                            <span className="size-1 rounded-full bg-[#606e8a]"></span>
                                            <select
                                                value={selectedGroup.registration_mode || 'opt_out'}
                                                onChange={(e) => handleChangeRegistrationMode(selectedGroup.id, e.target.value)}
                                                className={`px-2 py-1 rounded-lg text-xs font-bold border-none cursor-pointer transition-colors ${(selectedGroup.registration_mode || 'opt_out') === 'opt_in'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                    }`}
                                            >
                                                <option value="opt_out">🟢 Mặc định ăn</option>
                                                <option value="opt_in">🔵 Đăng ký ăn</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {/* Edit Button */}
                                        <button
                                            onClick={() => setShowEditGroupModal(true)}
                                            className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-900 border border-[#dbdfe6] dark:border-slate-800 text-[#111318] dark:text-white rounded-lg text-sm font-bold hover:bg-[#f5f1ee] dark:hover:bg-slate-800"
                                        >
                                            <Icon name="edit" className="text-lg" />
                                            Chỉnh sửa
                                        </button>
                                        {/* Notification Button */}
                                        <button className="flex items-center gap-2 h-10 px-4 bg-primary text-white rounded-lg text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90">
                                            <Icon name="campaign" className="text-lg" />
                                            Thông báo nhóm
                                        </button>
                                        <button
                                            onClick={() => handleDeleteGroup(selectedGroup.id, selectedGroup.name)}
                                            className="h-10 w-10 flex items-center justify-center text-[#606e8a] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                        >
                                            <Icon name="delete_forever" />
                                        </button>
                                    </div>
                                </div>
                            </div>


                            {/* Members Table */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="p-6 border-b border-[#f5f1ee] dark:border-slate-800">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-lg font-bold dark:text-white">
                                            Danh sách thành viên ({members.length})
                                        </h4>
                                        <button
                                            onClick={() => setShowAddMemberModal(true)}
                                            className="flex items-center gap-2 px-4 h-10 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90"
                                        >
                                            <Icon name="person_add" className="text-lg" /> Thêm nhân viên
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    {members.length === 0 ? (
                                        <div className="flex items-center justify-center h-full text-[#606e8a]">
                                            <div className="text-center">
                                                <Icon name="group_off" className="text-6xl mb-4" />
                                                <p className="text-lg font-bold mb-2">Chưa có nhân viên</p>
                                                <p className="text-sm">Nhấn "Thêm nhân viên" để bắt đầu</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <table className="w-full">
                                            <thead className="bg-[#f5f1ee] dark:bg-slate-800 sticky top-0">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-[#606e8a] uppercase tracking-wider">
                                                        Nhân viên
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-[#606e8a] uppercase tracking-wider">
                                                        Mã NV
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-bold text-[#606e8a] uppercase tracking-wider">
                                                        Phòng ban
                                                    </th>
                                                    <th className="px-6 py-3 text-right text-xs font-bold text-[#606e8a] uppercase tracking-wider">
                                                        Hành động
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#dbdfe6] dark:divide-slate-800">
                                                {members.map((member) => (
                                                    <tr key={member.id} className="hover:bg-[#f5f1ee] dark:hover:bg-slate-800/50">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-3">
                                                                <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                                                                    {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium text-sm dark:text-white">
                                                                        {member.full_name}
                                                                    </p>
                                                                    <p className="text-xs text-[#606e8a]">
                                                                        {member.email}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className="text-sm font-mono text-[#606e8a]">
                                                                {member.employee_code || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className="text-sm text-[#606e8a]">
                                                                {member.department || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                                            <button
                                                                onClick={() => handleRemoveMember(member.id, member.full_name)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                            >
                                                                <Icon name="person_remove" className="text-base" />
                                                                Gỡ
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-[#606e8a]">
                            <div className="text-center">
                                <Icon name="group_off" className="text-6xl mb-4" />
                                <p className="text-lg font-bold mb-2">Chưa có nhóm nào</p>
                                <p className="text-sm">Tạo nhóm mới để bắt đầu</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* Modals */}
            <AddShiftModal
                isOpen={showAddShiftModal}
                onClose={() => setShowAddShiftModal(false)}
                onSuccess={() => {
                    fetchShifts();
                    setShowAddShiftModal(false);
                }}
            />
            <AddGroupModal
                isOpen={showAddGroupModal}
                onClose={() => setShowAddGroupModal(false)}
                onSuccess={() => {
                    fetchGroups();
                    setShowAddGroupModal(false);
                }}
            />
            {selectedGroup && showEditGroupModal && (
                <EditGroupModal
                    groupId={selectedGroup.id}
                    groupName={selectedGroup.name}
                    currentShiftId={selectedGroup.shift_id}
                    shifts={shifts}
                    onClose={() => setShowEditGroupModal(false)}
                    onSuccess={() => {
                        fetchShifts();
                        fetchGroups();
                    }}
                />
            )}

            {selectedGroup && (
                <AddMemberModal
                    isOpen={showAddMemberModal}
                    onClose={() => setShowAddMemberModal(false)}
                    onSuccess={() => {
                        fetchMembers();
                        fetchGroups(); // Update member count
                        setShowAddMemberModal(false);
                    }}
                    groupId={selectedGroup.id}
                    groupName={selectedGroup.name}
                />
            )}
        </div>
    );
}
