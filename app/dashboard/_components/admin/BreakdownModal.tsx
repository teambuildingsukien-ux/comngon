'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildUserDefaultMap, getDefaultFromMap } from '@/lib/meal-helpers';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface DepartmentBreakdown {
    department: string;
    total: number;
    registered: number;
    percentage: number;
}

interface UserData {
    id: string;
    full_name: string;
    department: string;
    shift: string;
    email: string;
}

interface ShiftBreakdown {
    shift: string;
    time: string;
    count: number;
}

interface BreakdownModalProps {
    date: string;
    dayName: string;
    onClose: () => void;
}

export default function BreakdownModal({ date, dayName, onClose }: BreakdownModalProps) {
    const [departments, setDepartments] = useState<DepartmentBreakdown[]>([]);
    const [shifts, setShifts] = useState<ShiftBreakdown[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDept, setExpandedDept] = useState<string | null>(null);
    const [allUsersData, setAllUsersData] = useState<UserData[]>([]);
    const [notEatingSet, setNotEatingSet] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchBreakdown();
    }, []);

    const fetchBreakdown = async () => {
        try {
            const supabase = createClient();

            // Convert DD/MM/YYYY back to YYYY-MM-DD
            const [day, month, year] = date.split('/');
            const isoDate = `${year}-${month}-${day}`;

            // Get all active users grouped by department
            // ⚠️ AUDIT-FIX: filter deleted_at IS NULL + include group_id for opt-in logic
            // ⚠️ START_DATE: loại NV chưa bắt đầu làm
            const { data: allUsers } = await supabase
                .from('users')
                .select('id, full_name, email, department, shift, group_id, start_date')
                .eq('status', 'active')
                .is('deleted_at', null)
                .or(`start_date.lte.${isoDate},start_date.is.null`);

            if (!allUsers) return;

            // Save raw data for employee expandable lists
            setAllUsersData(allUsers.map(u => ({
                id: u.id,
                full_name: u.full_name || 'N/A',
                department: u.department || 'Chưa phân loại',
                shift: u.shift || 'Chưa có ca',
                email: u.email || ''
            })));

            // Get all orders for tomorrow (specifically who said NOT EATING)
            const { data: orders } = await supabase
                .from('orders')
                .select('user_id, status')
                .eq('date', isoDate)
                .eq('status', 'not_eating');

            const notEatingUserIds = new Set(orders?.map(o => o.user_id) || []);

            // ⚠️ AUDIT-FIX: Use user default_meal_status for opt-in baseline
            const { data: userDefaultData } = await supabase
                .from('users')
                .select('id, default_meal_status')
                .eq('status', 'active');
            const userDefaultMap = buildUserDefaultMap(userDefaultData || []);

            // Get eating orders to check who explicitly registered
            const { data: eatingOrders } = await supabase
                .from('orders')
                .select('user_id')
                .eq('date', isoDate)
                .eq('status', 'eating');
            const eatingUserIds = new Set(eatingOrders?.map(o => o.user_id) || []);

            // Build full not-eating set: explicit not_eating + users with default_meal_status='not_eating' without eating order
            const fullNotEatingSet = new Set(notEatingUserIds);
            allUsers.forEach(user => {
                const defaultStatus = getDefaultFromMap(userDefaultMap, user.id);
                if (defaultStatus === 'not_eating' && !eatingUserIds.has(user.id) && !notEatingUserIds.has(user.id)) {
                    fullNotEatingSet.add(user.id);
                }
            });
            setNotEatingSet(fullNotEatingSet);

            // Group by department
            const deptMap = new Map<string, { total: number; registered: number }>();

            allUsers.forEach(user => {
                const dept = user.department || 'Chưa phân loại';
                if (!deptMap.has(dept)) {
                    deptMap.set(dept, { total: 0, registered: 0 });
                }
                const deptData = deptMap.get(dept)!;
                deptData.total++;
                // ⚠️ AUDIT-FIX: Use fullNotEatingSet which includes opt-in defaults
                if (!fullNotEatingSet.has(user.id)) {
                    deptData.registered++;
                }
            });

            const deptBreakdown: DepartmentBreakdown[] = Array.from(deptMap.entries())
                .map(([department, data]) => ({
                    department,
                    total: data.total,
                    registered: data.registered,
                    percentage: data.total > 0 ? (data.registered / data.total) * 100 : 0
                }))
                .sort((a, b) => b.registered - a.registered);

            setDepartments(deptBreakdown);

            // Group by shift
            const shiftMap = new Map<string, number>();

            allUsers.forEach(user => {
                if (!notEatingUserIds.has(user.id)) {
                    const shift = user.shift || 'Chưa có ca';
                    shiftMap.set(shift, (shiftMap.get(shift) || 0) + 1);
                }
            });

            // Get shift details
            const { data: shiftData } = await supabase
                .from('shifts')
                .select('name, start_time, end_time')
                .order('start_time');

            const shiftBreakdown: ShiftBreakdown[] = Array.from(shiftMap.entries())
                .map(([shiftName, count]) => {
                    const shiftInfo = shiftData?.find(s => s.name === shiftName);
                    const time = shiftInfo
                        ? `${shiftInfo.start_time.slice(0, 5)} - ${shiftInfo.end_time.slice(0, 5)}`
                        : 'Chưa rõ';
                    return {
                        shift: shiftName,
                        time,
                        count
                    };
                })
                .sort((a, b) => b.count - a.count);

            setShifts(shiftBreakdown);
        } catch (error) {
            console.error('Error fetching breakdown:', error);
        } finally {
            setLoading(false);
        }
    };

    const { isEnabled } = useTenantFeatures();

    const handleExportExcel = () => {
        if (!isEnabled('export_excel')) {
            alert('Tính năng xuất Excel chưa được bật cho gói dịch vụ hiện tại. Liên hệ admin để nâng cấp.');
            return;
        }
        // TODO: Implement Excel export
        alert('Tính năng xuất Excel sẽ được triển khai trong phiên bản tiếp theo');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                            Chi tiết đăng ký
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {dayName}, {date}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"
                    >
                        <Icon name="close" className="text-slate-600 dark:text-slate-400 text-[24px]" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin">
                            <Icon name="refresh" className="text-[40px] text-slate-400" />
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Department Breakdown */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <Icon name="corporate_fare" className="text-[24px] text-[#B24700]" />
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Theo Phòng Ban
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {departments.length === 0 ? (
                                    <p className="text-center text-slate-500 py-6">Chưa có dữ liệu</p>
                                ) : (
                                    departments.map((dept) => (
                                        <div key={dept.department}>
                                            <div
                                                onClick={() => setExpandedDept(expandedDept === dept.department ? null : dept.department)}
                                                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer select-none"
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Icon name={expandedDept === dept.department ? "expand_less" : "expand_more"} className="text-[18px] text-slate-400" />
                                                        <p className="font-bold text-slate-900 dark:text-white">
                                                            {dept.department}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 ml-7">
                                                        <div className="flex-1 bg-slate-200 dark:bg-slate-600 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${dept.percentage >= 70
                                                                    ? 'bg-green-500'
                                                                    : dept.percentage >= 50
                                                                        ? 'bg-yellow-500'
                                                                        : 'bg-red-500'
                                                                    }`}
                                                                style={{ width: `${dept.percentage}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 ml-4">
                                                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                                        {dept.registered}/{dept.total}
                                                    </span>
                                                    <span
                                                        className={`font-bold text-lg min-w-[60px] text-right ${dept.percentage >= 70
                                                            ? 'text-green-600 dark:text-green-400'
                                                            : dept.percentage >= 50
                                                                ? 'text-yellow-600 dark:text-yellow-400'
                                                                : 'text-red-600 dark:text-red-400'
                                                            }`}
                                                    >
                                                        {dept.percentage.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Expanded employee list */}
                                            {expandedDept === dept.department && (
                                                <div className="mt-1 ml-4 mr-2 mb-2 border-l-2 border-slate-200 dark:border-slate-600 pl-4 space-y-1 animate-in slide-in-from-top-2">
                                                    {allUsersData
                                                        .filter(u => u.department === dept.department)
                                                        .sort((a, b) => {
                                                            const aEating = !notEatingSet.has(a.id);
                                                            const bEating = !notEatingSet.has(b.id);
                                                            if (aEating !== bEating) return aEating ? -1 : 1;
                                                            return a.full_name.localeCompare(b.full_name, 'vi');
                                                        })
                                                        .map(user => {
                                                            const isEating = !notEatingSet.has(user.id);
                                                            return (
                                                                <div
                                                                    key={user.id}
                                                                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isEating
                                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                                            }`}>
                                                                            {user.full_name.split(' ').pop()?.[0]?.toUpperCase() || '?'}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                                                {user.full_name}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${isEating
                                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                                        }`}>
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${isEating ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                                        {isEating ? 'Ăn' : 'Nghỉ'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })
                                                    }
                                                    {allUsersData.filter(u => u.department === dept.department).length === 0 && (
                                                        <p className="text-xs text-slate-400 py-2 italic">Không có nhân viên</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Shift Breakdown */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <Icon name="schedule" className="text-[24px] text-[#B24700]" />
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Theo Ca Ăn
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {shifts.length === 0 ? (
                                    <p className="text-center text-slate-500 py-6">Chưa có dữ liệu</p>
                                ) : (
                                    shifts.map((shift) => (
                                        <div
                                            key={shift.shift}
                                            className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                                        >
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white">
                                                    {shift.shift}
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                                                    <Icon name="access_time" className="text-[14px]" />
                                                    {shift.time}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Icon name="restaurant" className="text-[20px] text-[#B24700]" />
                                                <span className="text-2xl font-black text-[#B24700]">
                                                    {shift.count}
                                                </span>
                                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                                    suất
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
                            <button
                                onClick={handleExportExcel}
                                className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-xl font-bold transition-all"
                            >
                                <Icon name="description" className="text-[20px]" />
                                Xuất Excel
                            </button>
                            <button
                                onClick={handlePrint}
                                className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-xl font-bold transition-all"
                            >
                                <Icon name="print" className="text-[20px]" />
                                In báo cáo
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 flex items-center justify-center gap-2 bg-slate-300 hover:bg-slate-400 text-slate-700 py-3 px-4 rounded-xl font-bold transition-all"
                            >
                                <Icon name="close" className="text-[20px]" />
                                Đóng
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
