'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import AddEmployeeModal from './AddEmployeeModal';
import EditEmployeeModal from './EditEmployeeModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import ImportEmployeeModal from './ImportEmployeeModal';
import StatusChangeModal, { STATUS_CONFIG, type EmployeeStatus } from './StatusChangeModal';
import ManageDepartmentModal, { type DeptModalMode } from './ManageDepartmentModal';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Employee {
    id: string;
    employee_code: string | null;
    email: string;
    full_name: string;
    role: 'employee' | 'manager' | 'admin' | 'kitchen';
    avatar_url: string | null;
    created_at: string;
    is_active?: boolean;
    status?: EmployeeStatus;
    status_reason?: string | null;
    status_changed_at?: string | null;
    resigned_date?: string | null; // ✅ v5.3.0: Ngày nghỉ việc
    start_date?: string | null; // ✅ v5.5.0: Ngày bắt đầu làm việc
    department?: string;
    shift?: string;
    group_id?: string;
    group?: {
        id: string;
        name: string;
    } | null;
}

interface Group {
    id: string;
    name: string;
}

export default function EmployeeManagement() {
    const supabase = createClient();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [mealGroups, setMealGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, resigned: 0, upcoming: 0, leaving: 0, mealEligible: 0, kitchenStaff: 0, groups: 0, departments: 0 });

    // Status filter — includes computed states 'upcoming' (sắp đi làm) and 'leaving' (sắp nghỉ)
    type FilterType = 'all' | EmployeeStatus | 'upcoming' | 'leaving';
    const [statusFilter, setStatusFilter] = useState<FilterType>('all');

    // Department filter & management state
    const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
    const [departments, setDepartments] = useState<string[]>([]);
    const [departmentCounts, setDepartmentCounts] = useState<Record<string, number>>({});
    const [deptModalMode, setDeptModalMode] = useState<DeptModalMode>(null);
    const [targetDeptName, setTargetDeptName] = useState<string | null>(null);

    // Specific sub-filter for selected department
    const [deptSubFilter, setDeptSubFilter] = useState<'all' | 'active' | 'paused' | 'resigned'>('all');
    const [allUsersDeptStatus, setAllUsersDeptStatus] = useState<Array<{ department: string | null; status: string }>>([]);

    // Specific counts for currently selected department
    const currentDeptUsers = useMemo(() => {
        if (!selectedDepartment) return [];
        return allUsersDeptStatus.filter(u => u.department?.trim().toLowerCase() === selectedDepartment.trim().toLowerCase());
    }, [selectedDepartment, allUsersDeptStatus]);

    const deptStatusCounts = useMemo(() => {
        const total = currentDeptUsers.length;
        const active = currentDeptUsers.filter(u => u.status === 'active').length;
        const resigned = currentDeptUsers.filter(u => u.status === 'resigned').length;
        const paused = currentDeptUsers.filter(u => u.status === 'paused').length;
        return { total, active, resigned, paused };
    }, [currentDeptUsers]);

    // Sidebar Department Search & Pagination
    const [deptSearch, setDeptSearch] = useState('');
    const [deptRowsPerPage, setDeptRowsPerPage] = useState<number>(10);
    const [deptPage, setDeptPage] = useState<number>(1);

    const handleDeptSuccess = async (action: 'add' | 'edit' | 'delete', oldName?: string, newName?: string) => {
        if (action === 'add' && newName) {
            if (!departments.includes(newName)) {
                setDepartments(prev => [...prev, newName].sort());
            }
            setSelectedDepartment(newName);
        } else if (action === 'edit' && oldName && newName) {
            if (selectedDepartment === oldName) {
                setSelectedDepartment(newName);
            }
        } else if (action === 'delete' && oldName) {
            if (selectedDepartment === oldName) {
                setSelectedDepartment(null);
            }
        }
        await Promise.all([fetchDepartments(), fetchEmployees(), fetchStats()]);
    };

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        fetchEmployees();
        fetchMealGroups();
        fetchStats();
        fetchDepartments();
    }, [currentPage, selectedDepartment, statusFilter, deptSubFilter]);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            // Get current user's tenant_id for filtering
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;

            const { data: currentProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', currentUser.id)
                .single();

            if (!currentProfile?.tenant_id) return;

            // v5.5.0: Helper — apply filter to Supabase query (handles computed states)
            const todayStr = new Date().toISOString().split('T')[0];
            const applyStatusFilter = (query: any) => {
                // Nếu đang chọn phòng ban cụ thể -> dùng bộ lọc nhỏ của phòng ban đó
                if (selectedDepartment) {
                    if (deptSubFilter === 'active') {
                        return query.eq('status', 'active');
                    } else if (deptSubFilter === 'resigned') {
                        return query.eq('status', 'resigned');
                    } else if (deptSubFilter === 'paused') {
                        return query.eq('status', 'paused');
                    }
                    return query;
                }

                // Nếu không chọn phòng ban (Xem Tất cả) -> giữ nguyên bộ lọc tổng trên đầu trang
                if (statusFilter === 'upcoming') {
                    // Sắp đi làm: active + start_date > today
                    return query.eq('status', 'active').gt('start_date', todayStr);
                } else if (statusFilter === 'leaving') {
                    // Sắp nghỉ: active + resigned_date > today
                    return query.eq('status', 'active').gt('resigned_date', todayStr);
                } else if (statusFilter !== 'all') {
                    return query.eq('status', statusFilter);
                }
                return query;
            };

            // Build query with department filter AND tenant filter
            let countQuery = supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id);

            // Apply status filter
            countQuery = applyStatusFilter(countQuery);

            // Apply department filter for count
            if (selectedDepartment) {
                countQuery = countQuery.eq('department', selectedDepartment.trim());
            }

            const { count: totalCount } = await countQuery;

            // Calculate total pages
            const pages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);
            setTotalPages(pages);

            // Build data query with department filter AND tenant filter
            let dataQuery = supabase
                .from('users')
                .select(`
                    *,
                    group:groups (
                        id,
                        name
                    )
                `)
                .eq('tenant_id', currentProfile.tenant_id)
                .order('created_at', { ascending: false })
                .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);

            // Apply status filter
            dataQuery = applyStatusFilter(dataQuery);

            // Apply department filter for data
            if (selectedDepartment) {
                dataQuery = dataQuery.eq('department', selectedDepartment.trim());
            }

            const { data, error } = await dataQuery;

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }

            setEmployees(data || []);
        } catch (err: any) {
            console.error('Error fetching employees:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMealGroups = async () => {
        // Get current user's tenant for filtering
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) return;

        const { data: currentProfile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', currentUser.id)
            .single();

        if (!currentProfile?.tenant_id) return;

        const { data } = await supabase
            .from('groups')
            .select('id, name')
            .eq('tenant_id', currentProfile.tenant_id)
            .order('name');
        setMealGroups(data || []);
    };

    const fetchStats = async () => {
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;

            const { data: currentProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', currentUser.id)
                .single();

            if (!currentProfile?.tenant_id) return;

            const { count: totalCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id);

            const { count: activeCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'active');

            const { count: pausedCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'paused');

            const { count: resignedCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'resigned');

            const { count: groupsCount } = await supabase
                .from('groups')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id);

            const [deptTableRes, userDeptRes] = await Promise.all([
                supabase.from('departments').select('name').eq('tenant_id', currentProfile.tenant_id),
                supabase.from('users').select('department').eq('tenant_id', currentProfile.tenant_id).not('department', 'is', null)
            ]);

            const uniqueDepartments = new Set<string>();
            deptTableRes.data?.forEach(d => {
                const name = d.name?.trim();
                if (name) uniqueDepartments.add(name);
            });
            userDeptRes.data?.forEach(u => {
                const name = u.department?.trim();
                if (name) uniqueDepartments.add(name);
            });

            // v5.5.0: Count "Sắp đi làm" (active + start_date > today)
            const todayStr = new Date().toISOString().split('T')[0];
            const { count: upcomingCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'active')
                .gt('start_date', todayStr);

            // v5.5.0: Count "Sắp nghỉ" (active + resigned_date > today)
            const { count: leavingCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'active')
                .gt('resigned_date', todayStr);

            // v5.5.1: Count NV được tính xuất ăn (active + started + NOT kitchen)
            const { data: mealEligibleData } = await supabase
                .from('users')
                .select('id', { count: 'exact' })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'active')
                .neq('role', 'kitchen')
                .or(`start_date.is.null,start_date.lte.${todayStr}`);

            // v5.5.1: Count NV nhà bếp (active)
            const { count: kitchenCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', currentProfile.tenant_id)
                .eq('status', 'active')
                .eq('role', 'kitchen');

            setStats({
                total: totalCount || 0,
                active: activeCount || 0,
                paused: pausedCount || 0,
                resigned: resignedCount || 0,
                upcoming: upcomingCount || 0,
                leaving: leavingCount || 0,
                mealEligible: mealEligibleData?.length || 0,
                kitchenStaff: kitchenCount || 0,
                groups: groupsCount || 0,
                departments: uniqueDepartments.size
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    };

    const fetchDepartments = async () => {
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

            // 1. Fetch from departments table
            const { data: deptTableData } = await supabase
                .from('departments')
                .select('name')
                .eq('tenant_id', currentProfile.tenant_id);

            // 2. Fetch all employees with departments (tenant filtered - count all statuses)
            const { data: usersData } = await supabase
                .from('users')
                .select('department, status')
                .eq('tenant_id', currentProfile.tenant_id)
                .not('department', 'is', null);

            setAllUsersDeptStatus(usersData || []);

            // Merge departments from both sources
            const allDeptNames = new Set<string>();
            deptTableData?.forEach(d => {
                const name = d.name?.trim();
                if (name) allDeptNames.add(name);
            });
            usersData?.forEach(u => {
                const name = u.department?.trim();
                if (name) allDeptNames.add(name);
            });

            const uniqueDepts = Array.from(allDeptNames).sort((a, b) => a.localeCompare(b, 'vi'));
            setDepartments(uniqueDepts);

            // Count employees per department
            // LOGIC YÊU CẦU:
            // - Riêng phòng ban "Đã nghỉ việc": hiện TẤT CẢ nhân viên trong phòng ban này (14 người).
            // - Các phòng ban khác: CHỈ hiển thị nhân viên đang hoạt động (active, paused).
            const counts: Record<string, number> = {};
            usersData?.forEach(u => {
                const dept = u.department?.trim();
                if (!dept) return;

                const isResignedDept = dept.toLowerCase() === 'đã nghỉ việc';
                const isActive = u.status === 'active' || u.status === 'paused';

                if (isResignedDept) {
                    counts[dept] = (counts[dept] || 0) + 1;
                } else if (isActive) {
                    counts[dept] = (counts[dept] || 0) + 1;
                }
            });
            setDepartmentCounts(counts);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    // Client-side search filter only (department filter is server-side)
    const filteredEmployees = employees.filter(emp => {
        const matchesSearch =
            emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.id?.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesSearch;
    });

    const getRoleBadge = (role: string) => {
        const badges = {
            admin: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
            manager: 'bg-primary/10 text-primary border-primary/20',
            kitchen: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
            employee: 'bg-gray-100 dark:bg-slate-800 text-[#111318] dark:text-white border-gray-200 dark:border-slate-700'
        };
        return badges[role as keyof typeof badges] || badges.employee;
    };

    const getRoleLabel = (role: string) => {
        const labels = {
            admin: 'Quản trị',
            manager: 'Quản lý',
            kitchen: 'Nhà bếp',
            employee: 'Nhân viên'
        };
        return labels[role as keyof typeof labels] || role;
    };

    return (
        <div className="p-8">
            {/* Stats Cards - Gọn gàng trên 1 hàng ngang */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2 mb-5">
                <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <p className="text-[10px] sm:text-[11px] font-bold text-[#606e8a] uppercase tracking-tight truncate">Tổng nhân sự</p>
                    <p className="text-lg sm:text-xl font-black text-primary mt-1">{stats.total}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-[#606e8a] uppercase tracking-tight truncate">Hoạt động</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-green-600 mt-1">{stats.active}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-[#606e8a] uppercase tracking-tight truncate">Tạm dừng</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-amber-600 mt-1">{stats.paused}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-[#606e8a] uppercase tracking-tight truncate">Đã nghỉ</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-red-600 mt-1">{stats.resigned}</p>
                </div>
                {/* v5.5.0: Sắp đi làm */}
                <div className="bg-blue-50/70 dark:bg-blue-900/20 p-2.5 sm:p-3 rounded-xl border border-blue-200/60 dark:border-blue-800/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="text-xs">🗓️</span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-tight truncate">Sắp đi làm</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-blue-600 mt-1">{stats.upcoming}</p>
                </div>
                {/* v5.5.0: Sắp nghỉ */}
                <div className="bg-amber-50/70 dark:bg-amber-900/20 p-2.5 sm:p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="text-xs">⏳</span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-amber-600 uppercase tracking-tight truncate">Sắp nghỉ</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-amber-600 mt-1">{stats.leaving}</p>
                </div>
                {/* v5.5.1: Tính xuất ăn */}
                <div className="bg-emerald-50/70 dark:bg-emerald-900/20 p-2.5 sm:p-3 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="text-xs">🍚</span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-emerald-600 uppercase tracking-tight truncate">Tính xuất ăn</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-emerald-600 mt-1">{stats.mealEligible}</p>
                </div>
                {/* v5.5.1: Nhà bếp */}
                <div className="bg-violet-50/70 dark:bg-violet-900/20 p-2.5 sm:p-3 rounded-xl border border-violet-200/60 dark:border-violet-800/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <span className="text-xs">👨‍🍳</span>
                        <p className="text-[10px] sm:text-[11px] font-bold text-violet-600 uppercase tracking-tight truncate">Nhà bếp</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-violet-600 mt-1">{stats.kitchenStaff}</p>
                </div>
                {/* Phòng ban */}
                <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-1">
                        <Icon name="corporate_fare" className="text-blue-500 text-[14px]" />
                        <p className="text-[10px] sm:text-[11px] font-bold text-[#606e8a] uppercase tracking-tight truncate">Phòng ban</p>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-blue-600 mt-1">{stats.departments}</p>
                </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {[
                    { key: 'all' as FilterType, label: 'Tất cả', count: stats.total, color: 'bg-gray-100 text-gray-700' },
                    { key: 'active' as FilterType, label: '🟢 Hoạt động', count: stats.active, color: 'bg-green-100 text-green-700' },
                    { key: 'paused' as FilterType, label: '🟡 Tạm dừng', count: stats.paused, color: 'bg-amber-100 text-amber-700' },
                    { key: 'resigned' as FilterType, label: '🔴 Đã nghỉ', count: stats.resigned, color: 'bg-red-100 text-red-700' },
                    ...(stats.upcoming > 0 ? [{ key: 'upcoming' as FilterType, label: '🗓️ Sắp đi làm', count: stats.upcoming, color: 'bg-blue-100 text-blue-700' }] : []),
                    ...(stats.leaving > 0 ? [{ key: 'leaving' as FilterType, label: '⏳ Sắp nghỉ', count: stats.leaving, color: 'bg-orange-100 text-orange-700' }] : []),
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setStatusFilter(tab.key); setCurrentPage(1); }}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${statusFilter === tab.key
                            ? `${tab.color} ring-2 ring-offset-1 ring-current shadow-sm`
                            : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        {tab.label}
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${statusFilter === tab.key ? 'bg-white/40' : 'bg-gray-100'
                            }`}>{tab.count}</span>
                    </button>
                ))}
            </div>

            {/* Main Content: Sidebar + Table */}
            <div className="flex gap-6">
                {/* Department Sidebar */}
                <div className="w-[270px] flex-shrink-0">
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm p-4 sticky top-8">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Icon name="corporate_fare" className="text-primary text-[20px]" />
                                <h3 className="font-bold text-sm text-[#111318] dark:text-white">Phòng ban</h3>
                                <span className="text-xs font-bold text-[#606e8a] bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                    {departments.length}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    setTargetDeptName(null);
                                    setDeptModalMode('add');
                                }}
                                title="Thêm phòng ban mới"
                                className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center transition-all shadow-sm"
                            >
                                <Icon name="add" className="text-base font-bold" />
                            </button>
                        </div>

                        {/* Search Department */}
                        <div className="relative mb-2">
                            <input
                                type="text"
                                value={deptSearch}
                                onChange={(e) => {
                                    setDeptSearch(e.target.value);
                                    setDeptPage(1);
                                }}
                                placeholder="Tìm phòng ban..."
                                className="w-full pl-7 pr-6 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:border-primary transition-all"
                            />
                            <Icon name="search" className="text-[14px] text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            {deptSearch && (
                                <button
                                    onClick={() => setDeptSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <Icon name="close" className="text-[12px]" />
                                </button>
                            )}
                        </div>

                        {/* All Departments Option */}
                        <button
                            onClick={() => {
                                setSelectedDepartment(null);
                                setDeptSubFilter('all');
                                setCurrentPage(1); // Reset to page 1
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all mb-2 ${selectedDepartment === null
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-[#606e8a] dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon name="apps" className="text-[18px]" />
                                <span>Tất cả</span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedDepartment === null
                                ? 'bg-white/20 text-white'
                                : 'bg-gray-100 dark:bg-slate-800 text-[#606e8a]'
                                }`}>
                                {stats.total}
                            </span>
                        </button>

                        {/* Department List */}
                        {(() => {
                            const filteredDepts = departments.filter(d => 
                                d.toLowerCase().includes(deptSearch.toLowerCase().trim())
                            );
                            const totalDeptPages = Math.ceil(filteredDepts.length / deptRowsPerPage) || 1;
                            const paginatedDepts = deptRowsPerPage >= 999 
                                ? filteredDepts 
                                : filteredDepts.slice((deptPage - 1) * deptRowsPerPage, deptPage * deptRowsPerPage);

                            return (
                                <>
                                    <div className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
                                        {paginatedDepts.map((dept) => (
                                            <div
                                                key={dept}
                                                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedDepartment === dept
                                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                                    : 'text-[#606e8a] dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setSelectedDepartment(dept);
                                                        setDeptSubFilter('all');
                                                        setCurrentPage(1);
                                                    }}
                                                    className="flex-1 text-left break-words whitespace-normal text-xs leading-snug mr-1.5 py-0.5 font-medium"
                                                    title={dept}
                                                >
                                                    {dept}
                                                </button>

                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {/* Quick Edit & Delete buttons on hover */}
                                                    <div className="hidden group-hover:flex items-center gap-0.5 mr-0.5">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTargetDeptName(dept);
                                                                setDeptModalMode('edit');
                                                            }}
                                                            title="Sửa tên phòng ban"
                                                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-primary/20 text-slate-500 hover:text-primary transition-colors"
                                                        >
                                                            <Icon name="edit" className="text-[14px]" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTargetDeptName(dept);
                                                                setDeptModalMode('delete');
                                                            }}
                                                            title="Xóa phòng ban"
                                                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 transition-colors"
                                                        >
                                                            <Icon name="delete" className="text-[14px]" />
                                                        </button>
                                                    </div>

                                                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[22px] text-center inline-flex items-center justify-center ${selectedDepartment === dept
                                                        ? 'bg-primary/20 text-primary'
                                                        : 'bg-gray-100 dark:bg-slate-800 text-[#606e8a]'
                                                        }`}>
                                                        {departmentCounts[dept] || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}

                                        {filteredDepts.length === 0 && (
                                            <div className="text-center py-6 text-xs text-slate-400">
                                                {deptSearch ? 'Không tìm thấy phòng ban' : 'Chưa có phòng ban'}
                                            </div>
                                        )}
                                    </div>

                                    {/* Pagination and limit controls */}
                                    <div className="pt-3 mt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px]">Hiện:</span>
                                            <select
                                                value={deptRowsPerPage}
                                                onChange={(e) => {
                                                    setDeptRowsPerPage(Number(e.target.value));
                                                    setDeptPage(1);
                                                }}
                                                className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-1 py-0.5 text-xs font-semibold focus:outline-none text-slate-700 dark:text-slate-300 cursor-pointer"
                                            >
                                                <option value={10}>10</option>
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                                <option value={999}>Tất cả</option>
                                            </select>
                                        </div>

                                        {filteredDepts.length > deptRowsPerPage && deptRowsPerPage < 999 && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    disabled={deptPage <= 1}
                                                    onClick={() => setDeptPage(p => Math.max(1, p - 1))}
                                                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-slate-600 dark:text-slate-400"
                                                >
                                                    <Icon name="chevron_left" className="text-sm" />
                                                </button>
                                                <span className="text-[11px] font-bold">
                                                    {deptPage}/{totalDeptPages}
                                                </span>
                                                <button
                                                    disabled={deptPage >= totalDeptPages}
                                                    onClick={() => setDeptPage(p => Math.min(totalDeptPages, p + 1))}
                                                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-slate-600 dark:text-slate-400"
                                                >
                                                    <Icon name="chevron_right" className="text-sm" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}

                        {/* No Departments Message */}
                        {departments.length === 0 && (
                            <div className="text-center py-8">
                                <Icon name="corporate_fare" className="text-[36px] text-[#606e8a] mb-2" />
                                <p className="text-xs text-[#606e8a]">Chưa có phòng ban</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Table Container */}
                <div className="flex-1 min-w-0">
                    {/* Table Container */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#dbdfe6] dark:border-slate-800 shadow-sm flex flex-col">
                        {/* Selected Department Header & Specific Status Filter */}
                        {selectedDepartment && (
                            <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-[#dbdfe6] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                                        <Icon name="corporate_fare" className="text-lg" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phòng ban:</span>
                                            <h4 className="font-extrabold text-sm text-primary">{selectedDepartment}</h4>
                                            <button
                                                onClick={() => {
                                                    setSelectedDepartment(null);
                                                    setDeptSubFilter('all');
                                                    setCurrentPage(1);
                                                }}
                                                className="text-[11px] text-slate-400 hover:text-red-500 transition-colors ml-1 cursor-pointer"
                                                title="Bỏ chọn phòng ban để xem tất cả"
                                            >
                                                ✕ Đóng
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Mini status filter for this department */}
                                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex-wrap">
                                    <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
                                        <Icon name="filter_list" className="text-[14px]" /> Lọc:
                                    </span>
                                    {[
                                        { key: 'all', label: 'Tất cả', count: deptStatusCounts.total },
                                        { key: 'active', label: '🟢 Hoạt động', count: deptStatusCounts.active },
                                        { key: 'resigned', label: '🔴 Đã nghỉ', count: deptStatusCounts.resigned },
                                        ...(deptStatusCounts.paused > 0 ? [{ key: 'paused', label: '🟡 Tạm dừng', count: deptStatusCounts.paused }] : [])
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => {
                                                setDeptSubFilter(tab.key as any);
                                                setCurrentPage(1);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                                deptSubFilter === tab.key
                                                    ? 'bg-primary text-white shadow-xs'
                                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <span>{tab.label}</span>
                                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                                                deptSubFilter === tab.key ? 'bg-white/30 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                            }`}>
                                                {tab.count}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Search Header */}
                        <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="relative w-full md:w-96">
                                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606e8a] text-[20px]" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-background-light dark:bg-slate-800 border border-[#dbdfe6] dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                                    placeholder="Tìm kiếm tên, mã nhân viên, phòng ban..."
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="cursor-pointer flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all"
                                >
                                    <Icon name="upload_file" className="text-[20px]" />
                                    <span>Import Excel</span>
                                </button>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="cursor-pointer flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
                                >
                                    <Icon name="person_add" className="text-[20px]" />
                                    <span>Thêm nhân viên</span>
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-background-light dark:bg-slate-800/50">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider">Nhân viên</th>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider">Thông tin TK</th>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider">Phòng ban / Nhóm</th>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider">Vai trò</th>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider">Trạng thái</th>
                                        <th className="px-6 py-4 text-xs font-bold text-[#606e8a] uppercase tracking-wider text-right w-48">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#dbdfe6] dark:divide-slate-800">
                                    {isLoading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i}>
                                                <td className="px-6 py-4"><div className="h-10 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" /></td>
                                                <td className="px-6 py-4"><div className="h-10 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" /></td>
                                                <td className="px-6 py-4"><div className="h-10 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" /></td>
                                                <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" /></td>
                                                <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 dark:bg-slate-800 rounded-full animate-pulse" /></td>
                                                <td className="px-6 py-4"><div className="h-8 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" /></td>
                                            </tr>
                                        ))
                                    ) : filteredEmployees.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center">
                                                <Icon name="group_off" className="text-[48px] text-[#606e8a] mb-3" />
                                                <p className="text-sm font-semibold text-[#606e8a]">Không tìm thấy nhân viên</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredEmployees.map((employee) => (
                                            <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                                                {/* Nhân viên */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="size-10 rounded-full bg-slate-200 bg-cover bg-center border border-gray-100"
                                                            style={employee.avatar_url ? { backgroundImage: `url(${employee.avatar_url})` } : {}}
                                                        >
                                                            {!employee.avatar_url && (
                                                                <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                                    <span className="text-sm font-bold text-[#606e8a]">
                                                                        {employee.full_name?.charAt(0).toUpperCase() || 'U'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="text-sm font-bold dark:text-white">{employee.full_name || 'Chưa cập nhật'}</div>
                                                            <div className="text-[11px] text-[#606e8a]">Mã: {employee.id.slice(0, 8)}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Thông tin TK */}
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-[#111318] dark:text-slate-300">{employee.email.split('@')[0]}</div>
                                                    <div className="text-[11px] text-[#606e8a]">Pass: ********</div>
                                                </td>

                                                {/* Phòng ban / Nhóm */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1.5">
                                                        {/* Department */}
                                                        <div className="flex items-center gap-2 text-sm text-[#606e8a] dark:text-slate-400">
                                                            <Icon name="corporate_fare" className="text-[16px] text-primary" />
                                                            <span className="font-medium">{(employee as any).department || 'Chưa có phòng ban'}</span>
                                                        </div>
                                                        {/* Shift */}
                                                        <div className="flex items-center gap-2 text-sm text-[#606e8a] dark:text-slate-400">
                                                            <Icon name="schedule" className="text-[16px] text-orange-500" />
                                                            <span className="font-medium">{(employee as any).shift || 'Chưa có ca'}</span>
                                                        </div>
                                                        {/* Meal Group */}
                                                        {employee.group ? (
                                                            <span className="w-fit px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                                                                {employee.group.name}
                                                            </span>
                                                        ) : (
                                                            <span className="w-fit px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-slate-400 border border-gray-100 dark:border-slate-700">
                                                                Chưa có nhóm
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Vai trò */}
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded text-[11px] font-semibold border uppercase ${getRoleBadge(employee.role)}`}>
                                                        {getRoleLabel(employee.role)}
                                                    </span>
                                                </td>

                                                {/* Trạng thái */}
                                                <td className="px-6 py-4">
                                                    {(() => {
                                                        const empStatus = (employee.status || 'active') as EmployeeStatus;
                                                        const config = STATUS_CONFIG[empStatus];
                                                        const dotColor = empStatus === 'active' ? 'bg-green-500' : empStatus === 'paused' ? 'bg-amber-500' : 'bg-red-500';
                                                        const badgeBg = empStatus === 'active' ? 'bg-green-50 text-green-700' : empStatus === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
                                                        return (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedEmployee(employee);
                                                                    setShowStatusModal(true);
                                                                }}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeBg} hover:ring-2 hover:ring-offset-1 hover:ring-current transition-all cursor-pointer`}
                                                                title="Bấm để đổi trạng thái"
                                                            >
                                                                <span className={`size-1.5 rounded-full ${dotColor}`}></span>
                                                                {config.label}
                                                                <Icon name="expand_more" className="text-[12px] opacity-60" />
                                                            </button>
                                                        );
                                                    })()}
                                                    {employee.status_reason && (
                                                        <p className="text-[10px] text-gray-400 mt-1 max-w-[120px] truncate" title={employee.status_reason}>
                                                            {employee.status_reason}
                                                        </p>
                                                    )}
                                                    {/* ✅ v5.5.0: Badge "Sắp đi làm" cho NV active có start_date tương lai */}
                                                    {employee.status === 'active' && employee.start_date && new Date(employee.start_date) > new Date() && (() => {
                                                        const daysUntilStart = Math.ceil((new Date(employee.start_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                        return (
                                                            <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1 font-medium" title={`Bắt đầu: ${employee.start_date}`}>
                                                                🗓️ Sắp đi làm ({daysUntilStart} ngày)
                                                            </p>
                                                        );
                                                    })()}
                                                    {/* ✅ v5.4.0: Badge "Sắp nghỉ" cho NV active có resigned_date tương lai */}
                                                    {employee.status === 'active' && employee.resigned_date && new Date(employee.resigned_date) > new Date() && (() => {
                                                        const daysLeft = Math.ceil((new Date(employee.resigned_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                        return (
                                                            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1 font-medium" title={`Sắp nghỉ: ${employee.resigned_date}`}>
                                                                ⏳ Sắp nghỉ ({daysLeft} ngày)
                                                            </p>
                                                        );
                                                    })()}
                                                    {/* Hiển thị ngày nghỉ việc cho NV đã resigned */}
                                                    {employee.status === 'resigned' && employee.resigned_date && (
                                                        <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1" title={`Nghỉ: ${employee.resigned_date}`}>
                                                            📅 {new Date(employee.resigned_date).toLocaleDateString('vi-VN')}
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Thao tác */}
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedEmployee(employee);
                                                                setShowEditModal(true);
                                                            }}
                                                            className="p-1.5 text-[#606e8a] hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                                            title="Sửa"
                                                        >
                                                            <Icon name="edit" className="text-[20px]" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedEmployee(employee);
                                                                setShowDeleteModal(true);
                                                            }}
                                                            className="p-1.5 text-[#606e8a] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                            title="Xóa"
                                                        >
                                                            <Icon name="delete" className="text-[20px]" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {!isLoading && filteredEmployees.length > 0 && (
                            <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 rounded-b-xl">
                                <p className="text-sm text-[#606e8a] dark:text-slate-400">
                                    Hiển thị <span className="font-bold">{filteredEmployees.length}</span> trên tổng số <span className="font-bold">{stats.total}</span> nhân viên
                                </p>

                                {/* Pagination Controls */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 text-sm font-medium text-[#606e8a] dark:text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#606e8a]"
                                    >
                                        <Icon name="chevron_left" className="text-[20px]" />
                                    </button>

                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={`min-w-[40px] h-10 px-3 text-sm font-medium rounded-lg transition-colors ${currentPage === page
                                                    ? 'bg-primary text-white'
                                                    : 'text-[#606e8a] dark:text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20'
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 text-sm font-medium text-[#606e8a] dark:text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#606e8a]"
                                    >
                                        <Icon name="chevron_right" className="text-[20px]" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* End Main Table Container */}
            </div>
            {/* End Sidebar + Table Flex */}

            {/* Modals */}
            <AddEmployeeModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={() => {
                    fetchEmployees();
                    fetchStats();
                    fetchMealGroups();
                    fetchDepartments(); // Update sidebar
                }}
                mealGroups={mealGroups}
            />

            {selectedEmployee && (
                <>
                    <EditEmployeeModal
                        isOpen={showEditModal}
                        onClose={() => {
                            setShowEditModal(false);
                            setSelectedEmployee(null);
                        }}
                        onSuccess={() => {
                            fetchEmployees();
                            fetchStats();
                            fetchMealGroups();
                            fetchDepartments();
                        }}
                        employee={selectedEmployee}
                        mealGroups={mealGroups}
                    />

                    <DeleteConfirmModal
                        isOpen={showDeleteModal}
                        onClose={() => {
                            setShowDeleteModal(false);
                            setSelectedEmployee(null);
                        }}
                        onSuccess={() => {
                            fetchEmployees();
                            fetchStats();
                            fetchDepartments();
                        }}
                        employee={selectedEmployee}
                    />

                    <StatusChangeModal
                        isOpen={showStatusModal}
                        onClose={() => {
                            setShowStatusModal(false);
                            setSelectedEmployee(null);
                        }}
                        employee={{
                            id: selectedEmployee.id,
                            full_name: selectedEmployee.full_name,
                            email: selectedEmployee.email,
                            status: (selectedEmployee.status || 'active') as EmployeeStatus,
                            resigned_date: selectedEmployee.resigned_date, // ✅ v5.4.0
                        }}
                        onStatusChanged={() => {
                            fetchEmployees();
                            fetchStats();
                        }}
                    />
                </>
            )}

            <ImportEmployeeModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onSuccess={() => {
                    fetchEmployees();
                    fetchStats();
                    fetchMealGroups();
                    fetchDepartments(); // Update sidebar
                }}
            />

            <ManageDepartmentModal
                isOpen={deptModalMode !== null}
                mode={deptModalMode}
                departmentName={targetDeptName}
                employeeCount={targetDeptName ? (departmentCounts[targetDeptName] || 0) : 0}
                existingDepartments={departments}
                onClose={() => {
                    setDeptModalMode(null);
                    setTargetDeptName(null);
                }}
                onSuccess={handleDeptSuccess}
            />
        </div>
    );
}
