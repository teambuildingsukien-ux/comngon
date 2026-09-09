'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDefaultMealStatus } from '@/lib/meal-helpers';
import BreakdownModal from './BreakdownModal';
import { toLocalDateString } from '@/lib/utils/date-helpers';

interface ForecastData {
    registered: number;   // NV sẽ ăn (trừ phát sinh)
    notRegistered: number; // NV báo nghỉ
    total: number;         // Tổng NV active
    guestMeals: number;    // Tổng suất phát sinh
    date: string;
    dayName: string;
}

interface GuestMealItem {
    id: string;
    quantity: number;
    note: string;
    requester_name: string;
    created_at: string;
}

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export default function ForecastCards() {
    const [forecast, setForecast] = useState<ForecastData>({
        registered: 0,
        notRegistered: 0,
        total: 0,
        guestMeals: 0,
        date: '',
        dayName: ''
    });
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isCookingDay, setIsCookingDay] = useState(true);
    const [guestMealsList, setGuestMealsList] = useState<GuestMealItem[]>([]);
    const [showGuestMeals, setShowGuestMeals] = useState(false);
    const [selectedGuestMeal, setSelectedGuestMeal] = useState<GuestMealItem | null>(null);

    useEffect(() => {
        fetchForecast();
    }, []);

    const fetchForecast = async () => {
        try {
            const supabase = createClient();

            // Calculate tomorrow's date
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowDate = toLocalDateString(tomorrow);

            // Get Vietnamese day name
            const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            const dayName = dayNames[tomorrow.getDay()];

            // Format date as DD/MM/YYYY
            const formattedDate = tomorrow.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // Check if tomorrow is a cooking day
            const response = await fetch('/api/admin/settings/cooking-days');
            let cookingDays = { start_day: 1, end_day: 5 }; // Default Monday-Friday

            if (response.ok) {
                const result = await response.json();
                cookingDays = result.data;
            }

            const tomorrowDayIndex = tomorrow.getDay();
            let isInCookingRange = false;

            if (cookingDays.start_day <= cookingDays.end_day) {
                isInCookingRange = tomorrowDayIndex >= cookingDays.start_day && tomorrowDayIndex <= cookingDays.end_day;
            } else {
                isInCookingRange = tomorrowDayIndex >= cookingDays.start_day || tomorrowDayIndex <= cookingDays.end_day;
            }

            // ⚠️ AUDIT-FIX: Check cooking_exceptions (admin đăng ký không nấu / nấu thêm)
            const { data: exceptions } = await supabase
                .from('cooking_exceptions')
                .select('type')
                .eq('date', tomorrowDate)
                .limit(1);

            const exception = exceptions?.[0];
            if (exception?.type === 'no_cook') isInCookingRange = false;
            else if (exception?.type === 'extra_cook') isInCookingRange = true;

            setIsCookingDay(isInCookingRange);

            if (!isInCookingRange) {
                setForecast({
                    registered: 0,
                    notRegistered: 0,
                    total: 0,
                    guestMeals: 0,
                    date: formattedDate,
                    dayName
                });
                setLoading(false);
                return;
            }

            // Đếm tất cả nhân sự active (admin, manager, employee) — CHỈ TRỪ kitchen
            // ⚠️ START_DATE: loại NV chưa bắt đầu làm
            const { count: totalEmployees } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen')
                .is('deleted_at', null)
                .or(`start_date.lte.${tomorrowDate},start_date.is.null`);

            // Get employees who reported 'not_eating' for tomorrow (only active, non-kitchen)
            const { count: notEatingCount } = await supabase
                .from('orders')
                .select('user_id, users!inner(status, role)', { count: 'exact', head: true })
                .eq('date', tomorrowDate)
                .eq('status', 'not_eating')
                .eq('users.status', 'active')
                .not('users.role', 'ilike', 'kitchen');

            const total = totalEmployees || 0;
            const notRegistered = notEatingCount || 0;

            // Opt-in group users: dùng default_meal_status từ DB via meal-helpers
            const { data: allUsersForDefault } = await supabase
                .from('users')
                .select('id, default_meal_status')
                .eq('status', 'active')
                .not('role', 'ilike', 'kitchen')
                .is('deleted_at', null);

            const { data: allOrdersTomorrow } = await supabase
                .from('orders')
                .select('user_id, status')
                .eq('date', tomorrowDate);
            const orderMap = new Map((allOrdersTomorrow || []).map((o: any) => [o.user_id, o.status]));

            // Count using centralized helper logic
            let optInNotEating = 0;
            (allUsersForDefault || []).forEach((user: any) => {
                const defaultStatus = getDefaultMealStatus(user);
                if (defaultStatus === 'not_eating') {
                    // This user defaults to not_eating — check if they have an eating order
                    const orderStatus = orderMap.get(user.id);
                    if (orderStatus !== 'eating') optInNotEating++;
                }
            });

            const employeeEating = total > 0 ? total - notRegistered - optInNotEating : 0;

            // Fetch guest meals (suất phát sinh) for tomorrow — full details
            const { data: guestMealsRaw } = await supabase
                .from('guest_meals')
                .select('id, quantity, note, created_by, created_at')
                .eq('date', tomorrowDate)
                .order('created_at', { ascending: false });

            // Fetch requester names
            let userNameMap: Record<string, string> = {};
            const creatorIds = [...new Set((guestMealsRaw || []).map((gm: any) => gm.created_by).filter(Boolean))];
            if (creatorIds.length > 0) {
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, full_name')
                    .in('id', creatorIds);
                (usersData || []).forEach((u: any) => { userNameMap[u.id] = u.full_name; });
            }

            const guestMealsItems: GuestMealItem[] = (guestMealsRaw || []).map((gm: any) => ({
                id: gm.id,
                quantity: gm.quantity,
                note: gm.note || '',
                requester_name: userNameMap[gm.created_by] || 'Không rõ',
                created_at: gm.created_at,
            }));
            const guestMealsTotal = guestMealsItems.reduce((sum, item) => sum + item.quantity, 0);
            setGuestMealsList(guestMealsItems);

            // registered = NV sẽ ăn (CHƯA cộng guest), registered card hiện tổng ăn bao gồm cả guest
            const registered = employeeEating + guestMealsTotal;

            setForecast({
                registered,
                notRegistered,
                total,
                guestMeals: guestMealsTotal,
                date: formattedDate,
                dayName
            });
        } catch (error) {
            console.error('Error fetching forecast:', error);
        } finally {
            setLoading(false);
        }
    };

    const openBreakdown = () => {
        setShowModal(true);
    };

    if (loading) {
        return (
            <>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 animate-pulse">
                    <div className="h-12 sm:h-16 bg-green-200 dark:bg-green-800 rounded"></div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 animate-pulse">
                    <div className="h-12 sm:h-16 bg-orange-200 dark:bg-orange-800 rounded"></div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 animate-pulse">
                    <div className="h-12 sm:h-16 bg-purple-200 dark:bg-purple-800 rounded"></div>
                </div>
            </>
        );
    }

    const registeredPercentage = forecast.total > 0
        ? ((forecast.registered / forecast.total) * 100).toFixed(1)
        : '0.0';

    const notRegisteredPercentage = forecast.total > 0
        ? ((forecast.notRegistered / forecast.total) * 100).toFixed(1)
        : '0.0';

    // If tomorrow is not a cooking day, show a message
    if (!isCookingDay) {
        return (
            <>
                <div className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 rounded-xl sm:rounded-3xl p-3 sm:p-6 shadow-md border border-slate-200 dark:border-slate-700 col-span-3">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                        <Icon name="event_busy" className="text-slate-500 text-[18px] sm:text-[24px]" />
                        <h3 className="text-sm sm:text-lg font-bold text-slate-700 dark:text-slate-300">
                            Nghỉ nấu ngày mai
                        </h3>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-1 sm:mb-2">
                        {forecast.dayName}, {forecast.date}
                    </p>

                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 hidden sm:block">
                        Ngày mai không thuộc lịch nấu ăn. Dự báo sẽ hiển thị khi có ngày nấu ăn tiếp theo.
                    </p>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Registered Card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-sm border border-green-100 dark:border-green-800/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                    <Icon name="restaurant" className="text-green-600 text-[14px] sm:text-[18px]" />
                    <h3 className="text-[10px] sm:text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">
                        <span className="hidden sm:inline">Suất ăn ngày mai</span>
                        <span className="sm:hidden">Ăn mai</span>
                    </h3>
                </div>

                <div className="mb-1 sm:mb-2">
                    <p className="text-xl sm:text-2xl font-black text-green-600 dark:text-green-400">
                        {forecast.registered}
                        <span className="text-xs sm:text-base text-green-500 font-bold"> / {forecast.total}</span>
                    </p>
                    <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-500 font-semibold">
                        <span className="hidden sm:inline">({registeredPercentage}%) • {forecast.dayName}, {forecast.date}</span>
                        <span className="sm:hidden">({registeredPercentage}%)</span>
                    </p>
                </div>

                <button
                    onClick={openBreakdown}
                    className="w-full flex items-center justify-center gap-1 sm:gap-1.5 text-green-700 dark:text-green-400 font-bold text-[10px] sm:text-xs hover:bg-green-100 dark:hover:bg-green-900/30 py-1 sm:py-1.5 px-1 sm:px-2 rounded-lg transition-all border-t border-green-200 dark:border-green-800"
                >
                    <Icon name="visibility" className="text-[14px] sm:text-[16px]" />
                    <span className="hidden sm:inline">Xem chi tiết</span>
                    <span className="sm:hidden">Xem</span>
                </button>
            </div>

            {/* Not Registered Card */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-sm border border-orange-100 dark:border-orange-800/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                    <Icon name="notification_important" className="text-orange-600 text-[14px] sm:text-[18px]" />
                    <h3 className="text-[10px] sm:text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                        <span className="hidden sm:inline">Báo nghỉ ngày mai</span>
                        <span className="sm:hidden">Nghỉ mai</span>
                    </h3>
                </div>

                <div className="mb-1 sm:mb-2">
                    <p className="text-xl sm:text-2xl font-black text-orange-600 dark:text-orange-400">
                        {forecast.notRegistered}
                        <span className="text-xs sm:text-base text-orange-500 font-bold"> / {forecast.total}</span>
                    </p>
                    <p className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-500 font-semibold">
                        <span className="hidden sm:inline">({notRegisteredPercentage}%) • {forecast.dayName}, {forecast.date}</span>
                        <span className="sm:hidden">({notRegisteredPercentage}%)</span>
                    </p>
                </div>

                <button
                    onClick={openBreakdown}
                    className="w-full flex items-center justify-center gap-1 sm:gap-1.5 text-orange-700 dark:text-orange-400 font-bold text-[10px] sm:text-xs hover:bg-orange-100 dark:hover:bg-orange-900/30 py-1 sm:py-1.5 px-1 sm:px-2 rounded-lg transition-all border-t border-orange-200 dark:border-orange-800"
                >
                    <Icon name="visibility" className="text-[14px] sm:text-[16px]" />
                    <span className="hidden sm:inline">Xem chi tiết</span>
                    <span className="sm:hidden">Xem</span>
                </button>
            </div>

            {/* Guest Meals (Suất phát sinh) Card */}
            <div className="relative bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-sm border border-purple-100 dark:border-purple-800/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                    <Icon name="room_service" className="text-purple-600 text-[14px] sm:text-[18px]" />
                    <h3 className="text-[10px] sm:text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide">
                        <span className="hidden sm:inline">Suất phát sinh</span>
                        <span className="sm:hidden">Phát sinh</span>
                    </h3>
                </div>

                <div className="mb-1 sm:mb-2">
                    <p className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400">
                        {forecast.guestMeals}
                    </p>
                    <p className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-500 font-semibold">
                        <span className="hidden sm:inline">{guestMealsList.length} yêu cầu • {forecast.dayName}, {forecast.date}</span>
                        <span className="sm:hidden">{guestMealsList.length} yêu cầu</span>
                    </p>
                </div>

                <button
                    onClick={() => setShowGuestMeals(!showGuestMeals)}
                    className="w-full flex items-center justify-center gap-1 sm:gap-1.5 text-purple-700 dark:text-purple-400 font-bold text-[10px] sm:text-xs hover:bg-purple-100 dark:hover:bg-purple-900/30 py-1 sm:py-1.5 px-1 sm:px-2 rounded-lg transition-all border-t border-purple-200 dark:border-purple-800"
                >
                    <Icon name={showGuestMeals ? 'expand_less' : 'expand_more'} className="text-[14px] sm:text-[16px]" />
                    {showGuestMeals ? 'Ẩn' : 'Chi tiết'}
                </button>

                {/* Guest Meals Dropdown */}
                {showGuestMeals && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-purple-200 dark:border-purple-800 z-50 overflow-hidden max-h-80 overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-slate-900 px-4 py-3 border-b border-purple-100 dark:border-purple-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Icon name="room_service" className="text-purple-600 text-lg" />
                                <span className="font-bold text-sm text-purple-700 dark:text-purple-400">
                                    {selectedGuestMeal ? 'Chi tiết' : 'Danh sách suất phát sinh'}
                                </span>
                            </div>
                            <button onClick={() => { setShowGuestMeals(false); setSelectedGuestMeal(null); }} className="text-slate-400 hover:text-slate-600">
                                <Icon name="close" className="text-lg" />
                            </button>
                        </div>

                        {selectedGuestMeal ? (
                            <div className="p-4">
                                <button onClick={() => setSelectedGuestMeal(null)} className="flex items-center gap-1 text-purple-600 text-sm font-bold mb-3 hover:underline">
                                    <Icon name="arrow_back" className="text-sm" /> Quay lại
                                </button>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                                            <Icon name="person" className="text-purple-600 text-xl" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">{selectedGuestMeal.requester_name}</p>
                                            <p className="text-xs text-slate-500">Người yêu cầu</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                                            <p className="text-xs text-slate-500 mb-1">Số lượng</p>
                                            <p className="text-xl font-extrabold text-purple-600">{selectedGuestMeal.quantity} suất</p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                                            <p className="text-xs text-slate-500 mb-1">Thời gian</p>
                                            <p className="text-sm font-bold">{new Date(selectedGuestMeal.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">Lý do / Ghi chú</p>
                                        <p className="text-sm">{selectedGuestMeal.note || 'Không có ghi chú'}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                {guestMealsList.length === 0 ? (
                                    <div className="p-6 text-center text-slate-400">
                                        <Icon name="no_meals" className="text-3xl mb-2" />
                                        <p className="text-sm">Chưa có suất phát sinh ngày mai</p>
                                    </div>
                                ) : guestMealsList.map(gm => (
                                    <button
                                        key={gm.id}
                                        onClick={() => setSelectedGuestMeal(gm)}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 text-left"
                                    >
                                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                                            <span className="text-sm font-extrabold text-purple-600">{gm.quantity}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{gm.requester_name}</p>
                                            <p className="text-xs text-slate-500 truncate">{gm.note || 'Không ghi chú'}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs text-slate-400">{new Date(gm.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                        <Icon name="chevron_right" className="text-slate-300 text-lg flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Breakdown Modal */}
            {showModal && (
                <BreakdownModal
                    date={forecast.date}
                    dayName={forecast.dayName}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
}
