'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Employee {
    id: string;
    email: string;
    full_name: string;
    role: 'employee' | 'manager' | 'admin' | 'kitchen';
    avatar_url: string | null;
    user_meal_groups?: Array<{
        meal_group: {
            id: string;
            name: string;
        };
    }> | null;
}

interface EditEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    employee: Employee;
    mealGroups: Array<{ id: string; name: string }>;
}

export default function EditEmployeeModal({ isOpen, onClose, onSuccess, employee, mealGroups }: EditEmployeeModalProps) {
    const supabase = createClient();

    const [formData, setFormData] = useState({
        fullName: employee.full_name || '',
        role: employee.role,
        groupId: employee.user_meal_groups?.[0]?.meal_group?.id || '',
        employeeCode: (employee as any).employee_code || '',
        shiftId: (employee as any).shift_id || '',
        department: (employee as any).department || ''
    });

    const [customValues, setCustomValues] = useState({
        department: '',
        shift: '',
        shiftStartTime: '',
        shiftEndTime: '',
        mealGroupName: '',
        mealGroupTableArea: ''
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Standard values lists
    const StandardDepartments = ['hr', 'it', 'sales', 'production', 'accounting'];
    const StandardShifts = ['shift0', 'shift1', 'shift2', 'shift3'];

    // Custom Department Dropdown state
    const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
    const [deptSearch, setDeptSearch] = useState('');
    const deptDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
                setIsDeptDropdownOpen(false);
            }
        };
        if (isDeptDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDeptDropdownOpen]);

    useEffect(() => {
        if (isOpen && employee) {
            const currentDept = (employee as any).department || '';
            const currentShiftId = (employee as any).shift_id || ''; // Load shift ID from database
            const currentGroup = (employee as any).group_id || '';

            setFormData({
                fullName: employee.full_name || '',
                role: employee.role,
                groupId: currentGroup,
                employeeCode: (employee as any).employee_code || '',
                shiftId: currentShiftId, // Set to shift UUID
                department: currentDept
            });

            setCustomValues({
                department: '',
                shift: '',
                shiftStartTime: '',
                shiftEndTime: '',
                mealGroupName: '',
                mealGroupTableArea: ''
            });

            setIsDeptDropdownOpen(false);
            setDeptSearch('');
        }
    }, [isOpen, employee]);

    // State for dynamic options
    const [departments, setDepartments] = useState<string[]>([]);
    const [shifts, setShifts] = useState<Array<{ id: string, name: string }>>([]);

    // Fetch dynamic options (filtered by tenant_id - Bug #34 fix)
    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                // Get current user's tenant_id for filtering
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabase
                    .from('users')
                    .select('tenant_id')
                    .eq('id', user.id)
                    .single();

                const tenantId = profile?.tenant_id;

                // Fetch Departments from both departments table and users table (tenant-filtered)
                const [deptRes, usersDeptRes] = await Promise.all([
                    tenantId 
                        ? supabase.from('departments').select('name').eq('tenant_id', tenantId).order('name')
                        : supabase.from('departments').select('name').order('name'),
                    tenantId
                        ? supabase.from('users').select('department').eq('tenant_id', tenantId).not('department', 'is', null)
                        : Promise.resolve({ data: [] })
                ]);

                const allDepts = new Set<string>();
                deptRes.data?.forEach((d: any) => {
                    const name = d.name?.trim();
                    if (name) allDepts.add(name);
                });
                usersDeptRes.data?.forEach((u: any) => {
                    const name = u.department?.trim();
                    if (name) allDepts.add(name);
                });

                const sortedDepts = Array.from(allDepts).sort((a, b) => a.localeCompare(b, 'vi'));
                setDepartments(sortedDepts);

                // Fetch Shifts (tenant-filtered)
                let shiftQuery = supabase.from('shifts').select('id, name').order('name');
                if (tenantId) shiftQuery = shiftQuery.eq('tenant_id', tenantId);
                const { data: shiftData } = await shiftQuery;
                setShifts(shiftData || []);
            };
            fetchData();
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.fullName.trim()) {
            setError('Vui lòng nhập họ tên');
            return;
        }

        // Validate custom inputs
        if (formData.department === 'custom' && !customValues.department.trim()) {
            setError('Vui lòng nhập tên phòng ban mới');
            return;
        }
        if (formData.shiftId === 'custom' && !customValues.shift.trim()) {
            setError('Vui lòng nhập tên ca ăn mới');
            return;
        }
        if (formData.groupId === 'custom' && !customValues.mealGroupName.trim()) {
            setError('Vui lòng nhập tên nhóm ăn mới');
            return;
        }

        setIsSubmitting(true);

        try {
            let finalGroupId = formData.groupId;
            let finalDepartment = formData.department === 'custom' ? customValues.department : formData.department;
            let finalShiftId: string | null = formData.shiftId || null;

            // Fetch tenant_id early (needed for departments, shifts, and groups inserts)
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) throw new Error('Not authenticated');

            const { data: currentProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', currentUser.id)
                .single();

            if (!currentProfile?.tenant_id) throw new Error('Không tìm thấy thông tin tổ chức');

            // Handle custom department creation
            if (formData.department === 'custom') {
                const { error: deptError } = await supabase
                    .from('departments')
                    .insert({ name: customValues.department, tenant_id: currentProfile.tenant_id })
                    .single();

                if (deptError && deptError.code !== '23505') { // Ignore unique constraint violation
                    throw new Error(`Không thể tạo phòng ban mới: ${deptError.message}`);
                }
                // ⚠️ v6.1.5 AUDIT: Log tạo phòng ban mới
                await supabase.from('activity_logs').insert({
                    tenant_id: currentProfile.tenant_id,
                    user_id: currentUser.id,
                    action: 'create_department_inline',
                    details: JSON.stringify({ name: customValues.department, from: 'edit_employee', employee_id: employee.id }),
                });
            }

            // Handle Custom Shift Creation
            if (formData.shiftId === 'custom') {
                // Validate shift name first
                if (!customValues.shift.trim()) {
                    throw new Error('Vui lòng nhập tên ca ăn');
                }
                // Validate time inputs ONLY if creating custom shift
                if (!customValues.shiftStartTime || !customValues.shiftEndTime) {
                    throw new Error('Vui lòng nhập đầy đủ khung giờ cho ca ăn');
                }

                // Check if shift name already exists
                const { data: existingShift } = await supabase
                    .from('shifts')
                    .select('id, name')
                    .ilike('name', customValues.shift)
                    .single();

                if (existingShift) {
                    finalShiftId = existingShift.id;
                } else {
                    const { data: createdShift, error: shiftError } = await supabase
                        .from('shifts')
                        .insert({
                            name: customValues.shift,
                            start_time: customValues.shiftStartTime,
                            end_time: customValues.shiftEndTime,
                            tenant_id: currentProfile.tenant_id
                        })
                        .select('id')
                        .single();

                    if (shiftError) {
                        console.error('Error creating custom shift:', shiftError);
                        throw new Error(`Không thể tạo ca ăn mới: ${shiftError.message}`);
                    }
                    if (createdShift) {
                        finalShiftId = createdShift.id;
                        // ⚠️ v6.1.5 AUDIT: Log tạo ca ăn mới
                        await supabase.from('activity_logs').insert({
                            tenant_id: currentProfile.tenant_id,
                            user_id: currentUser.id,
                            action: 'create_shift_inline',
                            details: JSON.stringify({ name: customValues.shift, from: 'edit_employee', employee_id: employee.id }),
                        });
                    }
                }
            }

            // Handle custom meal group creation
            if (formData.groupId === 'custom') {
                // currentProfile already fetched above

                const { data: newGroup, error: groupError } = await supabase
                    .from('groups') // Use existing 'groups' table
                    .insert({
                        tenant_id: currentProfile.tenant_id,  // REQUIRED for RLS
                        name: customValues.mealGroupName,
                        table_area: customValues.mealGroupTableArea,
                        department: finalDepartment,
                        shift_id: finalShiftId
                    })
                    .select('id')
                    .single();

                if (groupError) throw groupError;
                finalGroupId = newGroup.id;
                // ⚠️ v6.1.5 AUDIT: Log tạo nhóm ăn mới
                await supabase.from('activity_logs').insert({
                    tenant_id: currentProfile.tenant_id,
                    user_id: currentUser.id,
                    action: 'create_group_inline',
                    details: JSON.stringify({ name: customValues.mealGroupName, from: 'edit_employee', employee_id: employee.id }),
                });
            }

            // Step 1: Update user data via API endpoint
            console.log('[EDIT_EMPLOYEE] Sending update request:', {
                employeeId: employee.id,
                changes: {
                    full_name: formData.fullName,
                    role: formData.role,
                    employee_code: formData.employeeCode,
                    shift_id: finalShiftId,
                    department: finalDepartment,
                    group_id: finalGroupId
                }
            });

            const response = await fetch(`/api/admin/employees/${employee.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    full_name: formData.fullName,
                    role: formData.role,
                    employee_code: formData.employeeCode,
                    shift_id: finalShiftId,
                    department: finalDepartment,
                    group_id: finalGroupId
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('[EDIT_EMPLOYEE] API error:', result);
                throw new Error(result.error || 'Failed to update employee');
            }

            console.log('[EDIT_EMPLOYEE] ✅ Update successful:', result);

            // Success!
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error updating employee:', err);
            setError(err.message || 'Không thể cập nhật nhân viên. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Icon name="edit" className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold dark:text-white">Chỉnh Sửa Nhân Viên</h2>
                            <p className="text-sm text-[#606e8a]">{employee.email}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="close" className="text-[#606e8a]" />
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                        <Icon name="error" className="text-red-600 dark:text-red-400" />
                        <span className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Full Name & Employee Code */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Họ và tên *
                            </label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                placeholder="Nguyễn Văn A"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Mã nhân viên
                            </label>
                            <input
                                type="text"
                                value={formData.employeeCode}
                                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                                className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                placeholder="NV001"
                            />
                        </div>
                    </div>

                    {/* Department & Role */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Phòng ban
                            </label>
                            {formData.department === 'custom' ? (
                                <div className="relative flex items-center gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={customValues.department}
                                        onChange={(e) => setCustomValues({ ...customValues, department: e.target.value })}
                                        className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                        placeholder="Nhập tên phòng ban..."
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData({ ...formData, department: '' });
                                        }}
                                        className="size-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg dark:bg-slate-700"
                                    >
                                        <Icon name="close" className="text-sm" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative" ref={deptDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsDeptDropdownOpen(!isDeptDropdownOpen);
                                            setDeptSearch('');
                                        }}
                                        className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white flex items-center justify-between text-left transition-all"
                                    >
                                        <span className={`truncate ${formData.department ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
                                            {formData.department || 'Chọn phòng ban'}
                                        </span>
                                        <Icon 
                                            name={isDeptDropdownOpen ? "expand_less" : "expand_more"} 
                                            className="text-slate-400 text-lg flex-shrink-0 ml-1 transition-transform" 
                                        />
                                    </button>

                                    {isDeptDropdownOpen && (
                                        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            {/* Search input inside dropdown */}
                                            <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                                                <div className="relative flex items-center">
                                                    <Icon name="search" className="absolute left-2.5 text-slate-400 text-sm pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        value={deptSearch}
                                                        onChange={(e) => setDeptSearch(e.target.value)}
                                                        placeholder="Tìm phòng ban..."
                                                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c04b00]"
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    {deptSearch && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeptSearch('')}
                                                            className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                                        >
                                                            <Icon name="close" className="text-xs" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Scrollable list of departments */}
                                            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, department: '' });
                                                        setIsDeptDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                                                        !formData.department ? 'text-primary font-bold bg-primary/5 dark:bg-primary/10' : 'text-slate-500'
                                                    }`}
                                                >
                                                    <span>(Chưa có phòng ban)</span>
                                                    {!formData.department && <Icon name="check" className="text-primary text-base" />}
                                                </button>

                                                {departments
                                                    .filter(d => !deptSearch.trim() || d.toLowerCase().includes(deptSearch.trim().toLowerCase()))
                                                    .map(dept => {
                                                        const isSelected = formData.department === dept;
                                                        return (
                                                            <button
                                                                key={dept}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, department: dept });
                                                                    setCustomValues({ ...customValues, department: '' });
                                                                    setIsDeptDropdownOpen(false);
                                                                }}
                                                                className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                                                                    isSelected ? 'text-primary font-bold bg-primary/5 dark:bg-primary/10' : 'text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span className="truncate">{dept}</span>
                                                                {isSelected && <Icon name="check" className="text-primary text-base" />}
                                                            </button>
                                                        );
                                                    })}

                                                {departments.filter(d => !deptSearch.trim() || d.toLowerCase().includes(deptSearch.trim().toLowerCase())).length === 0 && (
                                                    <div className="px-4 py-3 text-center text-xs text-slate-400">
                                                        Không tìm thấy phòng ban
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action: Add custom department */}
                                            <div className="p-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, department: 'custom' });
                                                        setCustomValues({ ...customValues, department: '' });
                                                        setIsDeptDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Icon name="add_circle" className="text-base" />
                                                    <span>+ Thêm phòng ban mới...</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Vai trò *
                            </label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                                className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                            >
                                <option value="employee">Nhân Viên</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Quản Trị</option>
                                <option value="kitchen">Nhà Bếp</option>
                            </select>
                        </div>
                    </div>

                    {/* Meal Group & Shift */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Nhóm ăn
                            </label>
                            {formData.groupId === 'custom' ? (
                                <div className="relative flex items-center gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={customValues.mealGroupName}
                                        onChange={(e) => setCustomValues({ ...customValues, mealGroupName: e.target.value })}
                                        className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                        placeholder="Nhập tên nhóm..."
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData({ ...formData, groupId: '' });
                                        }}
                                        className="size-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg dark:bg-slate-700"
                                    >
                                        <Icon name="close" className="text-sm" />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    value={formData.groupId}
                                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                                    className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                >
                                    <option value="">-- Không thuộc nhóm nào --</option>
                                    {mealGroups.map(group => (
                                        <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                                    <option className="font-bold text-orange-600" value="custom">+ Thêm nhóm mới...</option>
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Ca ăn
                            </label>
                            {formData.shiftId === 'custom' ? (
                                <div className="relative flex items-center gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={customValues.shift}
                                        onChange={(e) => setCustomValues({ ...customValues, shift: e.target.value })}
                                        className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                        placeholder="Nhập ca ăn..."
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData({ ...formData, shiftId: '' });
                                        }}
                                        className="size-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg dark:bg-slate-700"
                                    >
                                        <Icon name="close" className="text-sm" />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    value={formData.shiftId}
                                    onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                            setFormData({ ...formData, shiftId: 'custom' });
                                            setCustomValues({ ...customValues, shift: '' });
                                        } else {
                                            setFormData({ ...formData, shiftId: e.target.value });
                                            setCustomValues({ ...customValues, shift: '' });
                                        }
                                    }}
                                    className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                                >
                                    <option value="">Chọn ca ăn</option>
                                    {shifts.map(shift => (
                                        <option key={shift.id} value={shift.id}>{shift.name}</option>
                                    ))}
                                    <option className="font-bold text-orange-600" value="custom">+ Thêm ca mới...</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Info note */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                            <Icon name="info" className="text-[16px] inline mr-1" />
                            Email không thể thay đổi. Để đổi avatar, sử dụng chức năng upload avatar riêng.
                        </p>
                    </div>
                </form>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 py-3 px-4 rounded-lg border-2 border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] font-semibold text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 py-3 px-4 rounded-lg bg-[#c04b00] text-white font-bold text-sm shadow-lg shadow-[#c04b00]/25 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Icon name="progress_activity" className="text-[20px] animate-spin" />
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Icon name="save" className="text-[20px]" />
                                Lưu thay đổi
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
