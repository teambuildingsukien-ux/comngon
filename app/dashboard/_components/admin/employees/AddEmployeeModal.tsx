'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface AddEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    mealGroups?: Array<{ id: string; name: string }>; // Kept for backward compat but not used
}

export default function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
    const supabase = createClient();

    const [formData, setFormData] = useState({
        email: '',
        fullName: '',
        employeeCode: '',
        password: '',
        role: 'employee' as 'employee' | 'manager' | 'admin' | 'kitchen',
        mealGroupId: '',
        shift: '',
        department: '',
        startDate: new Date().toISOString().split('T')[0], // mặc định = hôm nay
    });

    // State for dynamic options - ALL fetched fresh from DB when popup opens
    const [departments, setDepartments] = useState<string[]>([]);
    const [shifts, setShifts] = useState<Array<{ id: string, name: string }>>([]);
    const [localMealGroups, setLocalMealGroups] = useState<Array<{ id: string, name: string }>>([]);

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

    // Custom values state
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
    const [showPassword, setShowPassword] = useState(false);

    // Fetch ALL dropdown data fresh from DB every time popup opens
    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                // Get current user's tenant_id
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

                // Fetch Shifts
                let shiftQuery = supabase.from('shifts').select('id, name').order('name');
                if (tenantId) shiftQuery = shiftQuery.eq('tenant_id', tenantId);
                const { data: shiftData } = await shiftQuery;
                setShifts(shiftData || []);

                // Fetch Meal Groups (previously from prop, now from DB)
                let groupQuery = supabase.from('groups').select('id, name').order('name');
                if (tenantId) groupQuery = groupQuery.eq('tenant_id', tenantId);
                const { data: groupData } = await groupQuery;
                setLocalMealGroups(groupData || []);
            };
            fetchData();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // ... validation ...
        if (!formData.email || !formData.fullName || !formData.password || !formData.employeeCode) {
            setError('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        // Validate custom inputs
        if (formData.department === 'custom' && !customValues.department.trim()) {
            setError('Vui lòng nhập tên phòng ban mới');
            return;
        }
        if (formData.shift === 'custom' && !customValues.shift.trim()) {
            setError('Vui lòng nhập tên ca ăn mới');
            return;
        }
        if (formData.mealGroupId === 'custom' && !customValues.mealGroupName.trim()) {
            setError('Vui lòng nhập tên nhóm ăn mới');
            return;
        }
        if (formData.mealGroupId === 'custom' && !customValues.mealGroupTableArea.trim()) {
            setError('Vui lòng nhập khu vực bàn ăn cho nhóm mới');
            return;
        }

        setIsSubmitting(true);

        try {
            // Call Admin API to create user
            const response = await fetch('/api/admin/users/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    isCustomDepartment: formData.department === 'custom',
                    isCustomShift: formData.shift === 'custom',
                    isCustomMealGroup: formData.mealGroupId === 'custom',
                    customValues: customValues
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                // Translate common API errors to Vietnamese
                let errorMessage = result.error || 'Có lỗi xảy ra khi tạo nhân viên';

                if (errorMessage.includes('already been registered')) {
                    errorMessage = 'Email này đã được đăng ký. Vui lòng sử dụng email khác.';
                } else if (errorMessage.includes('Invalid email')) {
                    errorMessage = 'Định dạng email không hợp lệ.';
                } else if (errorMessage.includes('Password')) {
                    errorMessage = 'Mật khẩu không hợp lệ. Tối thiểu 6 ký tự.';
                }

                throw new Error(errorMessage);
            }

            // Success
            onSuccess();
            onClose();

            // Reset form
            setFormData({
                email: '',
                fullName: '',
                employeeCode: '',
                password: '',
                role: 'employee',
                mealGroupId: '',
                shift: '',
                department: '',
                startDate: new Date().toISOString().split('T')[0],
            });
            setCustomValues({
                department: '',
                shift: '',
                shiftStartTime: '',
                shiftEndTime: '',
                mealGroupName: '',
                mealGroupTableArea: ''
            });

        } catch (err: any) {
            console.error('Error adding employee:', err);
            setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-[800px] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900">
                    <h2 className="text-[#181410] dark:text-white text-xl font-bold leading-tight">Thêm nhân viên mới</h2>
                    <button
                        onClick={onClose}
                        type="button"
                        className="flex items-center justify-center rounded-lg h-10 w-10 bg-[#f5f2f0] dark:bg-white/10 text-[#181410] dark:text-white hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                    >
                        <Icon name="close" />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Error Alert */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
                            <Icon name="error" className="text-[20px]" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            <div className="bg-gray-200 dark:bg-white/10 rounded-full h-32 w-32 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-sm">
                                <div className="flex items-center justify-center bg-black/10 dark:bg-white/10 rounded-full inset-0 absolute">
                                    <Icon name="add_a_photo" className="text-white text-4xl" />
                                </div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-[#181410] dark:text-white text-lg font-bold">Ảnh đại diện</p>
                            <p className="text-[#8d715e] dark:text-gray-400 text-sm">Tải lên ảnh chân dung định dạng JPG, PNG</p>
                        </div>
                        <button
                            type="button"
                            className="flex min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded-lg h-10 px-6 bg-primary/10 text-primary text-sm font-bold border border-primary/20 hover:bg-primary/20 transition-colors"
                        >
                            <Icon name="upload" className="text-sm" />
                            <span>Tải ảnh lên</span>
                        </button>
                    </div>

                    {/* Section: Thông tin cá nhân */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-primary pl-3">
                            <h3 className="text-[#181410] dark:text-white text-lg font-bold tracking-tight">Thông tin cá nhân</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">
                                    Họ và tên <span className="text-primary">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#8d715e]"
                                    placeholder="VD: Nguyễn Văn A"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">
                                    Mã nhân viên <span className="text-primary">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.employeeCode}
                                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-primary bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#8d715e]"
                                    placeholder="VD: NV001"
                                />
                                <span className="text-primary text-[11px] font-medium">Mã nhân viên không được để trống</span>
                            </div>
                        </div>
                    </section>

                    {/* Section: Thông tin tổ chức */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-primary pl-3">
                            <h3 className="text-[#181410] dark:text-white text-lg font-bold tracking-tight">Thông tin tổ chức</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Department */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">Phòng ban</label>
                                {formData.department === 'custom' ? (
                                    <div className="relative flex items-center gap-2">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={customValues.department}
                                            onChange={(e) => setCustomValues({ ...customValues, department: e.target.value })}
                                            className="flex w-full rounded-lg text-[#181410] dark:text-white border border-primary bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#8d715e]"
                                            placeholder="Nhập tên phòng ban mới..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData({ ...formData, department: '' });
                                                setCustomValues({ ...customValues, department: '' });
                                            }}
                                            className="h-12 w-12 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
                                            title="Quay lại danh sách"
                                        >
                                            <Icon name="close" />
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
                                            className="w-full h-12 px-4 rounded-lg bg-white dark:bg-white/5 border border-[#e7dfda] dark:border-white/20 hover:border-primary/50 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary text-[#181410] dark:text-white flex items-center justify-between text-left transition-all"
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
                                                {/* Search input */}
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                                                    <div className="relative flex items-center">
                                                        <Icon name="search" className="absolute left-2.5 text-slate-400 text-sm pointer-events-none" />
                                                        <input
                                                            type="text"
                                                            value={deptSearch}
                                                            onChange={(e) => setDeptSearch(e.target.value)}
                                                            placeholder="Tìm phòng ban..."
                                                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
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

                                                {/* Scrollable list */}
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

                                                {/* Add button */}
                                                <div className="p-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, department: 'custom' });
                                                            setIsDeptDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1.5 transition-colors"
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

                            <div className="grid grid-cols-2 gap-4">
                                {/* Meal Group */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[#181410] dark:text-white text-sm font-semibold">Nhóm ăn</label>
                                    {formData.mealGroupId === 'custom' ? (
                                        <div className="flex flex-col gap-2 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Tên nhóm</label>
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={customValues.mealGroupName}
                                                    onChange={(e) => setCustomValues({ ...customValues, mealGroupName: e.target.value })}
                                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-primary bg-white dark:bg-white/5 h-10 px-3 text-sm focus:ring-1 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                                    placeholder="Nhập tên nhóm..."
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Khu vực bàn</label>
                                                <input
                                                    type="text"
                                                    value={customValues.mealGroupTableArea}
                                                    onChange={(e) => setCustomValues({ ...customValues, mealGroupTableArea: e.target.value })}
                                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-primary bg-white dark:bg-white/5 h-10 px-3 text-sm focus:ring-1 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                                    placeholder="VD: Bàn 12 - Tầng 2"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, mealGroupId: '' });
                                                    setCustomValues({ ...customValues, mealGroupName: '', mealGroupTableArea: '' });
                                                }}
                                                className="self-end text-xs text-red-500 font-semibold hover:underline"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <select
                                                value={formData.mealGroupId}
                                                onChange={(e) => setFormData({ ...formData, mealGroupId: e.target.value })}
                                                className="appearance-none flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                            >
                                                <option value="">Chọn nhóm</option>
                                                {localMealGroups.map(group => (
                                                    <option key={group.id} value={group.id}>{group.name}</option>
                                                ))}
                                                <option className="font-bold text-primary" value="custom">+ Thêm nhóm & bàn ăn mới...</option>
                                            </select>
                                            <Icon name="groups" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                        </div>
                                    )}
                                </div>

                                {/* Shift */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[#181410] dark:text-white text-sm font-semibold">Ca ăn</label>
                                        <div className="flex items-center gap-1 text-primary">
                                            <Icon name="auto_fix_high" className="text-[14px]" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Linked</span>
                                        </div>
                                    </div>
                                    {formData.shift === 'custom' ? (
                                        <div className="flex flex-col gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                                            {/* Shift Name */}
                                            <div>
                                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">
                                                    Tên ca ăn
                                                </label>
                                                <input
                                                    type="text"
                                                    value={customValues.shift}
                                                    onChange={(e) => setCustomValues({ ...customValues, shift: e.target.value })}
                                                    className="w-full rounded-lg text-[#181410] dark:text-white border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 h-10 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                                    placeholder="VD: Ca trưa 1"
                                                    required
                                                />
                                            </div>

                                            {/* Time Range */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                                                        Giờ bắt đầu
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={customValues.shiftStartTime}
                                                        onChange={(e) => setCustomValues({ ...customValues, shiftStartTime: e.target.value })}
                                                        placeholder="VD: 12:30"
                                                        pattern="[0-2][0-9]:[0-5][0-9]"
                                                        className="w-full rounded-lg text-[#181410] dark:text-white border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 h-14 px-4 text-base font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                                        required
                                                    />
                                                    <span className="text-xs text-gray-500 mt-1">Format: HH:MM (24h)</span>
                                                </div>
                                                <div>
                                                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                                                        Giờ kết thúc
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={customValues.shiftEndTime}
                                                        onChange={(e) => setCustomValues({ ...customValues, shiftEndTime: e.target.value })}
                                                        placeholder="VD: 13:00"
                                                        pattern="[0-2][0-9]:[0-5][0-9]"
                                                        className="w-full rounded-lg text-[#181410] dark:text-white border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 h-14 px-4 text-base font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                                        required
                                                    />
                                                    <span className="text-xs text-gray-500 mt-1">Format: HH:MM (24h)</span>
                                                </div>
                                            </div>

                                            {/* Cancel Button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, shift: '' });
                                                    setCustomValues({ ...customValues, shift: '', shiftStartTime: '', shiftEndTime: '' });
                                                }}
                                                className="text-xs text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 font-semibold"
                                            >
                                                ✕ Hủy tạo ca mới
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <select
                                                value={formData.shift}
                                                onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                                                className="appearance-none flex w-full rounded-lg text-[#181410] dark:text-white border border-primary/40 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                            >
                                                <option value="">Chọn ca</option>
                                                {shifts.map(shift => (
                                                    <option key={shift.id} value={shift.id}>{shift.name}</option>
                                                ))}
                                                <option className="font-bold text-primary" value="custom">+ Thêm ca mới...</option>
                                            </select>
                                            <Icon name="restaurant" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary" />
                                        </div>
                                    )}
                                    {formData.mealGroupId && (
                                        <div className="flex items-center gap-1 text-primary text-[11px] font-medium mt-1">
                                            <Icon name="info" className="text-[12px]" />
                                            <span>Tự động theo nhóm</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">Vai trò</label>
                                <div className="relative">
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                                        className="appearance-none flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    >
                                        <option value="employee">Nhân viên</option>
                                        <option value="manager">Quản lý</option>
                                        <option value="admin">Quản trị</option>
                                        <option value="kitchen">Nhà bếp</option>
                                    </select>
                                    <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Section: Ngày bắt đầu làm */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-emerald-500 pl-3">
                            <h3 className="text-[#181410] dark:text-white text-lg font-bold tracking-tight">📅 Ngày bắt đầu làm</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">
                                    Ngày bắt đầu
                                </label>
                                <input
                                    type="date"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                                <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                                    {formData.startDate > new Date().toISOString().split('T')[0]
                                        ? '🔜 NV sẽ được tính ăn từ ngày này (chưa tính hôm nay)'
                                        : '✅ NV được tính ăn ngay từ hôm nay'
                                    }
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Section: Bảo mật tài khoản */}
                    <section>
                        <div className="flex items-center gap-2 mb-4 border-l-4 border-primary pl-3">
                            <h3 className="text-[#181410] dark:text-white text-lg font-bold tracking-tight">Bảo mật tài khoản</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">
                                    Email/Username <span className="text-primary">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 px-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#8d715e]"
                                    placeholder="example@company.vn"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[#181410] dark:text-white text-sm font-semibold">
                                    Mật khẩu <span className="text-primary">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="flex w-full rounded-lg text-[#181410] dark:text-white border border-[#e7dfda] dark:border-white/20 bg-white dark:bg-white/5 h-12 pl-4 pr-12 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#8d715e]"
                                        placeholder="Nhập mật khẩu"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                                    >
                                        <Icon name={showPassword ? 'visibility' : 'visibility_off'} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </form >

                {/* Footer */}
                < div className="p-6 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3" >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex min-w-[100px] cursor-pointer items-center justify-center rounded-lg h-11 px-6 bg-[#f5f2f0] dark:bg-white/5 text-[#181410] dark:text-white text-sm font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        onClick={handleSubmit}
                        className="flex min-w-[140px] cursor-pointer items-center justify-center rounded-lg h-11 px-8 bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? 'Đang xử lý...' : 'Lưu thông tin'}
                    </button>
                </div >
            </div >
        </div >
    );
}
