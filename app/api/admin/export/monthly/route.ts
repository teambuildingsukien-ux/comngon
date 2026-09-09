import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultMealStatus } from '@/lib/meal-helpers';
import ExcelJS from 'exceljs';
import {
    HEADER_STYLE, HIGHLIGHT_COLORS,
    getDayOfWeek, parseCookingDays, createCookingDayChecker,
    freezePanes, applyHeaderRow, DAY_NAMES,
} from '@/lib/export-helpers';

/**
 * GET /api/admin/export/monthly?month=2026-03
 * Export monthly meal report as Excel file — v5.1.0 Smart Export
 * Admin/Manager only
 * 
 * ⚠️ v5.1.0 SMART FEATURES:
 * 1. Detect ngày nghỉ việc/tạm dừng từ activity_logs
 * 2. Detect ngày nhận việc từ created_at  
 * 3. Cột % tỷ lệ ăn
 * 4. Freeze panes (đóng băng header + tên NV)
 * 5. Highlight NV bất thường (nghỉ >30% đỏ, 100% xanh)
 * 6. Subtotal theo phòng ban
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Chỉ admin/manager' }, { status: 403 });
        }

        const tenantId = profile.tenant_id;

        // ⭐ v5.8.0: Parse date range params (backward compatible with month param)
        const searchParams = request.nextUrl.searchParams;
        const now = new Date();

        let startDate: string;
        let endDate: string;

        if (searchParams.get('startDate') && searchParams.get('endDate')) {
            // Mode mới: date range
            startDate = searchParams.get('startDate')!;
            endDate = searchParams.get('endDate')!;
        } else {
            // Mode cũ: month (backward compatible)
            const monthParam = searchParams.get('month');
            const year = monthParam ? parseInt(monthParam.split('-')[0]) : now.getFullYear();
            const month = monthParam ? parseInt(monthParam.split('-')[1]) : now.getMonth() + 1;
            startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }

        // Build danh sách ngày trong range
        const dateList: string[] = [];
        {
            const dStart = new Date(startDate + 'T00:00:00');
            const dEnd = new Date(endDate + 'T00:00:00');
            for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const day = d.getDate();
                dateList.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
            }
        }
        const numDays = dateList.length;

        // ===== PARALLEL QUERIES =====
        // ⚠️ v5.8.0: Xóa RPC (BUG 1), fix activity_logs query (BUG 2)
        const [
            { data: employees },
            { data: cookingDaySetting },
            { data: exceptions },
            { data: guestMeals },
            { data: statusChangeLogs },
            { count: totalEmpCount },
            { count: kitchenCount },
            { count: resignedCount },
            { count: pausedCount },
            { count: upcomingCount },
        ] = await Promise.all([
            // 1. ALL employees (exclude kitchen for Sheet 2 detail)
            // ⚠️ v6.1.3: Thêm resigned_date để detect NV nghỉ giữa tháng
            supabase.from('users')
                .select('id, full_name, department, role, status, group_id, default_meal_status, created_at, start_date, resigned_date, groups(name, registration_mode)')
                .eq('tenant_id', tenantId)
                .not('role', 'ilike', '%kitchen%')
                .order('department').order('full_name'),
            // 2. Cooking days setting
            supabase.from('system_settings')
                .select('value').eq('tenant_id', tenantId).eq('key', 'cooking_days').single(),
            // 3. Cooking exceptions
            supabase.from('cooking_exceptions')
                .select('date, type').eq('tenant_id', tenantId)
                .gte('date', startDate).lte('date', endDate),
            // 4. Guest meals
            supabase.from('guest_meals')
                .select('date, quantity, note, created_by').eq('tenant_id', tenantId)
                .gte('date', startDate).lte('date', endDate).order('date'),
            // 5. ⚠️ v5.8.0 BUG 2 FIX: Status change logs
            // - UPPERCASE action names (khớp StatusChangeModal)
            // - select target_id (userId nằm ở cột riêng, KHÔNG trong details)
            // - order by created_at ASC để build timeline đúng thứ tự
            supabase.from('activity_logs')
                .select('action, details, target_id, created_at')
                .eq('tenant_id', tenantId)
                .in('action', [
                    'CHANGE_EMPLOYEE_STATUS',
                    'SCHEDULE_RESIGNATION',
                    'CANCEL_SCHEDULED_RESIGNATION',
                    'AUTO_RESIGN_SCHEDULED',
                ])
                .gte('created_at', startDate + 'T00:00:00')
                .lte('created_at', endDate + 'T23:59:59')
                .order('created_at', { ascending: true }),
            // SNAPSHOT: Tổng NV toàn công ty (mọi role, mọi status)
            supabase.from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId),
            // Kitchen staff count
            supabase.from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .ilike('role', '%kitchen%')
                .eq('status', 'active'),
            // Resigned count
            supabase.from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('status', 'resigned'),
            // Paused count
            supabase.from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('status', 'paused'),
            // Upcoming (active + start_date in future)
            supabase.from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('status', 'active')
                .gt('start_date', endDate.slice(0, 10) || new Date().toISOString().slice(0, 10)),
        ]);

        // ⚠️ v5.7.0: PAGINATED FETCH cho Sheet 2 (cần chi tiết per-employee)
        const allOrders: any[] = [];
        const PAGE_SIZE = 1000;
        let page = 0;
        let hasMore = true;
        while (hasMore) {
            const { data: batch } = await supabase.from('orders')
                .select('user_id, date, status, is_late')
                .eq('tenant_id', tenantId)
                .gte('date', startDate).lte('date', endDate)
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (batch && batch.length > 0) {
                allOrders.push(...batch);
                hasMore = batch.length === PAGE_SIZE;
                page++;
            } else {
                hasMore = false;
            }
        }

        // ===== COOKING DAYS SETUP =====
        // ⚠️ v5.7.2 FIX: Dùng shared helpers từ export-helpers.ts (SSoT) thay vì inline copy
        const { startDay: cookStartDay, endDay: cookEndDay } = parseCookingDays(cookingDaySetting?.value);

        const exceptionMap = new Map<string, string>();
        exceptions?.forEach(ex => exceptionMap.set(ex.date, ex.type));

        // ⚠️ DEBUG: Log cooking days config để dễ trace lỗi
        console.log(`📅 Export cooking config: start_day=${cookStartDay}, end_day=${cookEndDay}, exceptions=${exceptionMap.size}, raw_setting=${JSON.stringify(cookingDaySetting?.value || 'NULL')}`);

        const isCookingDay = createCookingDayChecker(cookStartDay, cookEndDay, exceptionMap);

        // ===== BUILD LOOKUP MAPS =====
        // ⚠️ v5.8.0: Xóa orderStatsMap (BUG 1 — RPC đã xóa)

        // orderMap from paginated fetch — dùng cho cả Sheet 1 + Sheet 2
        const orderMap = new Map<string, Map<string, { status: string; is_late: boolean }>>();
        allOrders.forEach(o => {
            if (!orderMap.has(o.date)) orderMap.set(o.date, new Map());
            orderMap.get(o.date)!.set(o.user_id, { status: o.status, is_late: o.is_late || false });
        });

        const guestByDate = new Map<string, number>();
        guestMeals?.forEach(g => {
            guestByDate.set(g.date, (guestByDate.get(g.date) || 0) + g.quantity);
        });

        // ⭐ v5.8.0 BUG 2 FIX: Build STATUS TIMELINE thay vì single date
        // userId → [{date, status}] sorted by date ASC
        const statusTimeline = new Map<string, Array<{date: string, status: string}>>();

        statusChangeLogs?.forEach(log => {
            const userId = (log as any).target_id; // ← cột riêng, KHÔNG phải trong details
            if (!userId) return;

            const details = log.details as any;
            const changeDate = log.created_at.slice(0, 10); // YYYY-MM-DD

            let newStatus: string | null = null;

            if (log.action === 'CHANGE_EMPLOYEE_STATUS') {
                newStatus = details?.to_status; // ← key đúng từ StatusChangeModal
            } else if (log.action === 'AUTO_RESIGN_SCHEDULED') {
                // ✅ v6.1.2: Cron tự resign → track trong timeline
                newStatus = 'resigned';
            } else if (log.action === 'SCHEDULE_RESIGNATION' || log.action === 'CANCEL_SCHEDULED_RESIGNATION') {
                return; // Scheduled/cancel = bỏ qua (chưa thực sự resign)
            }

            if (!newStatus) return;

            if (!statusTimeline.has(userId)) {
                statusTimeline.set(userId, []);
            }
            statusTimeline.get(userId)!.push({ date: changeDate, status: newStatus });
        });

        // Helper: Lấy status tại 1 ngày cụ thể từ timeline
        // ⚠️ v6.1.3 FIX: Thêm resigned_date param để xử lý NV nghỉ giữa tháng
        const getStatusOnDate = (userId: string, dateStr: string, currentDbStatus: string, resignedDate?: string | null): string => {
            const timeline = statusTimeline.get(userId);

            // ⭐ v6.1.3: Nếu có resigned_date → dùng nó làm mốc phân chia
            // Trường hợp: HR set resigned_date=16/4, cron auto-resign → DB status='resigned'
            // Ngày 1-15/4 phải trả 'active', ngày 16-30/4 phải trả 'resigned'
            if (resignedDate) {
                if (dateStr >= resignedDate) {
                    return 'resigned';
                }
                // Trước resigned_date: kiểm tra timeline xem có thay đổi status khác không
                // (ví dụ: paused → active → resigned giữa tháng)
                if (!timeline || timeline.length === 0) {
                    // Không có log khác → NV active trước ngày nghỉ
                    return currentDbStatus === 'resigned' ? 'active' : currentDbStatus;
                }
            }

            if (!timeline || timeline.length === 0) {
                // Không có log trong tháng → dùng status hiện tại từ DB
                return currentDbStatus;
            }

            // Trước entry đầu tiên → lấy from_status
            if (dateStr < timeline[0].date) {
                const firstLog = statusChangeLogs?.find(
                    (l: any) => l.target_id === userId && (
                        l.action === 'CHANGE_EMPLOYEE_STATUS' || l.action === 'AUTO_RESIGN_SCHEDULED'
                    )
                );
                const fromStatus = (firstLog?.details as any)?.from_status;
                // ⚠️ v6.1.3: Nếu NV đã resigned trong DB nhưng có resigned_date,
                // trước ngày resign hẳn phải là 'active'
                if (!fromStatus && currentDbStatus === 'resigned' && resignedDate) {
                    return 'active';
                }
                return fromStatus || currentDbStatus;
            }

            // Tìm entry cuối cùng có date <= dateStr
            let result = currentDbStatus;
            for (const entry of timeline) {
                if (entry.date <= dateStr) {
                    result = entry.status;
                } else {
                    break;
                }
            }
            return result;
        };

        console.log(`📊 Status timeline: ${statusTimeline.size} employees with status changes`);

        // ⭐ #2: Build join date map: NV nhận việc giữa tháng
        // ⚠️ START_DATE FIX: Ưu tiên start_date (ngày BĐ làm thực tế) > created_at (ngày tạo trên hệ thống)
        const employeeJoinDate = new Map<string, string>();
        employees?.forEach(emp => {
            const joinDate = (emp as any).start_date || (emp.created_at ? emp.created_at.slice(0, 10) : null);
            if (joinDate) {
                if (joinDate >= startDate && joinDate <= endDate) {
                    employeeJoinDate.set(emp.id, joinDate);
                }
            }
        });

        // ===== SMART getEffectiveStatus =====
        // ⚠️ v6.1.3 FIX: Truyền resigned_date vào getStatusOnDate để xử lý nghỉ giữa tháng
        // ⚠️ v6.1.6 FIX: Fallback emp.start_date cho NV có start_date NGOÀI tháng báo cáo
        const getEffectiveStatus = (emp: any, dateStr: string): 'eating' | 'not_eating' | 'paused' | 'resigned' | 'no_cook' | 'not_joined' => {
            if (!isCookingDay(dateStr)) return 'no_cook';

            // NV chưa nhận việc → hiện "—"
            // ⚠️ v6.1.6: PHẢI fallback emp.start_date khi NV start_date ngoài tháng (không có trong employeeJoinDate map)
            const joinDate = employeeJoinDate.get(emp.id) || emp.start_date;
            if (joinDate && dateStr < joinDate) return 'not_joined';

            // ⭐ v6.1.3: Truyền resigned_date để timeline biết mốc nghỉ chính xác
            const statusOnDate = getStatusOnDate(emp.id, dateStr, emp.status || 'active', emp.resigned_date);
            if (statusOnDate === 'paused') return 'paused';
            if (statusOnDate === 'resigned') return 'resigned';

            // Check DB order
            const dayOrders = orderMap.get(dateStr);
            const orderData = dayOrders?.get(emp.id);
            if (orderData) return orderData.status as 'eating' | 'not_eating';

            return getDefaultMealStatus(emp);
        };

        // Active employees for Sheet 1 — ⚠️ v5.5.1 FIX: dùng ALL employees để tính resigned/paused
        // Vẫn giữ biến activeEmployees cho backward compat nhưng Sheet 1 dùng allReportEmployees
        const activeEmployees = employees?.filter((e: any) => e.status === 'active') || [];
        const allReportEmployees = employees || [];

        // ===== SHARED STYLES =====
        const headerStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB24700' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };
        // Sub-header style cho nhóm cột
        const subHeaderStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B6914' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        };

        // ⚠️ v5.7.1: KHÔNG dùng snapshot cố định nữa — tính per-day bên dưới
        // Lọc danh sách NV để loop (tất cả NV, kể cả resigned/paused, để tính lịch sử)
        const allEmployeesForCount = employees || [];

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cơm Ngon';
        workbook.created = new Date();

        // ══════════════════════════════════════════════
        // ── Sheet 1: Thống kê ngày — v5.6.0 HR Report ──
        // ══════════════════════════════════════════════
        const sheet1 = workbook.addWorksheet('Thống kê ngày');
        sheet1.columns = [
            { header: 'Ngày', key: 'date', width: 14 },
            { header: 'Thứ', key: 'dayName', width: 8 },
            // ── Nhóm Nhân sự (Snapshot) ──
            { header: 'Tổng NV', key: 'totalEmp', width: 10 },
            { header: 'Tính xuất ăn', key: 'mealEligible', width: 12 },
            { header: 'NV nghỉ', key: 'resigned', width: 10 },
            { header: 'NV tạm dừng', key: 'paused', width: 11 },
            { header: 'Sắp đi làm', key: 'upcoming', width: 11 },
            { header: 'NV bếp', key: 'kitchen', width: 10 },
            // ── Nhóm Suất ăn (Daily) ──
            { header: 'NV ăn', key: 'eating', width: 10 },
            { header: 'NV nghỉ ăn', key: 'notEating', width: 11 },
            { header: 'Hủy muộn', key: 'lateCancel', width: 10 },
            { header: 'ĐK muộn', key: 'lateRegister', width: 10 },
            { header: 'Xuất khách', key: 'guest', width: 10 },
            // ── Nhóm Tổng hợp ──
            { header: 'Suất hợp lệ', key: 'validMeals', width: 12 },
            { header: 'Suất thực tế', key: 'actualMeals', width: 12 },
        ];

        // Style header
        const headerRow = sheet1.getRow(1);
        headerRow.height = 32;
        headerRow.eachCell((cell, colNumber) => {
            if (colNumber <= 2) {
                Object.assign(cell, { style: headerStyle });
            } else if (colNumber <= 8) {
                // Nhóm Nhân sự — màu khác
                Object.assign(cell, { style: subHeaderStyle });
            } else if (colNumber <= 13) {
                // Nhóm Suất ăn — màu chính
                Object.assign(cell, { style: headerStyle });
            } else {
                // Nhóm Tổng hợp — bold đặc biệt
                cell.style = {
                    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
                    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } },
                    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
                    border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
                };
            }
        });

        // Freeze panes
        sheet1.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

        const dayNames = DAY_NAMES;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (let i = 0; i < numDays; i++) {
            const dateStr = dateList[i];
            const [y, m, d] = dateStr.split('-').map(Number);
            const dayOfWeek = getDayOfWeek(y, m, d);
            const cooking = isCookingDay(dateStr);

            // ⚠️ v5.8.0: TÍNH PER-DAY — mỗi ngày đếm NV eligible riêng
            let totalOnDay = 0, resignedOnDay = 0, pausedOnDay = 0;
            let upcomingOnDay = 0;
            const kitchenOnDay = kitchenCount ?? 0; // ⭐ BUG 3 FIX: dùng snapshot
            let notEating = 0, lateCancel = 0, lateRegister = 0;

            for (const emp of allEmployeesForCount) {
                // ⚠️ BUG 3: Kitchen đã bị loại khỏi query employees → không cần check ở đây
                const joinDate = employeeJoinDate.get(emp.id) || emp.start_date || (emp.created_at ? emp.created_at.slice(0, 10) : null);

                // NV đã tồn tại tính đến ngày này? (nếu có joinDate, phải <= dateStr)
                const hasJoined = !joinDate || joinDate <= dateStr;
                if (!hasJoined && joinDate && joinDate > startDate) {
                    // NV sắp đi làm (đã tạo nhưng chưa bắt đầu)
                    upcomingOnDay++;
                    totalOnDay++;
                    continue;
                }
                if (!hasJoined) {
                    continue; // NV chưa tồn tại vào ngày này
                }

                totalOnDay++;

                // ⭐ v5.8.0 BUG 2 FIX: Dùng timeline thay vì single date
                // ⭐ v6.1.3: Truyền resigned_date cho Sheet 1 per-day count
                const statusOnDay = getStatusOnDate(emp.id, dateStr, emp.status || 'active', (emp as any).resigned_date);
                const isResignedOnDay = statusOnDay === 'resigned';
                const isPausedOnDay = statusOnDay === 'paused';

                if (isResignedOnDay) {
                    resignedOnDay++;
                    continue;
                }
                if (isPausedOnDay) {
                    pausedOnDay++;
                    continue;
                }

                // NV eligible — đếm order status nếu ngày nấu ăn
                if (cooking) {
                    const orderData = orderMap.get(dateStr)?.get(emp.id);
                    const mealStatus = orderData?.status || getDefaultMealStatus(emp);
                    const isLate = orderData?.is_late || false;

                    if (mealStatus === 'not_eating') {
                        if (isLate) {
                            lateCancel++;
                        } else {
                            notEating++;
                        }
                    } else if (mealStatus === 'eating' && isLate) {
                        lateRegister++;
                    }
                }
            }

            // ⭐ BUG 3 FIX: Cộng kitchen vào totalOnDay (vì query employees đã loại kitchen)
            totalOnDay += kitchenOnDay;
            // Eligible = tổng NV ngày đó - nghỉ - tạm dừng - sắp đi làm - bếp
            const eligibleOnDay = totalOnDay - resignedOnDay - pausedOnDay - upcomingOnDay - kitchenOnDay;
            const guest = guestByDate.get(dateStr) || 0;

            // CÔNG THỨC v5.7.1 (per-day eligible):
            const eatingComputed = cooking ? (eligibleOnDay - notEating - lateCancel + lateRegister + guest) : 0;
            const validMeals = cooking ? (eligibleOnDay - notEating + guest) : 0;
            const actualMeals = cooking ? (validMeals + lateRegister - lateCancel) : 0;

            const row = sheet1.addRow({
                date: dateStr,
                dayName: dayNames[dayOfWeek],
                // Per-day counts
                totalEmp: totalOnDay,
                mealEligible: eligibleOnDay,
                resigned: resignedOnDay,
                paused: pausedOnDay,
                upcoming: upcomingOnDay,
                kitchen: kitchenOnDay,
                // Daily — computed
                eating: cooking ? eatingComputed : '',
                notEating: cooking ? notEating : '',
                lateCancel: cooking ? lateCancel : '',
                lateRegister: cooking ? lateRegister : '',
                guest: cooking ? guest : '',
                validMeals: cooking ? validMeals : '',
                actualMeals: cooking ? actualMeals : '',
            });

            // Styling
            if (!cooking) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
                    cell.font = { color: { argb: 'FF999999' } };
                });
            } else if (d % 2 === 0) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F0' } };
                });
            }

            // Highlight late changes
            if (cooking && (lateCancel > 0 || lateRegister > 0)) {
                const lcCell = row.getCell(11); // Hủy muộn
                const lrCell = row.getCell(12); // ĐK muộn
                if (lateCancel > 0) lcCell.font = { color: { argb: 'FFD12B37' }, bold: true };
                if (lateRegister > 0) lrCell.font = { color: { argb: 'FF2E7D32' }, bold: true };
            }
        }

        // TỔNG row
        const lastDataRow = numDays + 1;
        const totalRow = sheet1.addRow({
            date: 'TỔNG', dayName: '',
            totalEmp: '', mealEligible: '', resigned: '', paused: '', upcoming: '', kitchen: '',
            eating: { formula: `SUM(I2:I${lastDataRow})` },
            notEating: { formula: `SUM(J2:J${lastDataRow})` },
            lateCancel: { formula: `SUM(K2:K${lastDataRow})` },
            lateRegister: { formula: `SUM(L2:L${lastDataRow})` },
            guest: { formula: `SUM(M2:M${lastDataRow})` },
            validMeals: { formula: `SUM(N2:N${lastDataRow})` },
            actualMeals: { formula: `SUM(O2:O${lastDataRow})` },
        });
        totalRow.font = { bold: true, size: 12 };
        totalRow.eachCell(cell => {
            cell.border = { top: { style: 'double', color: { argb: 'FFB24700' } } };
        });

        // ══════════════════════════════════════════════
        // ── Sheet 2: Chi tiết NV (SMART v5.1.0) ──
        // ══════════════════════════════════════════════
        const sheet2 = workbook.addWorksheet('Chi tiết NV');

        const s2Cols: Partial<ExcelJS.Column>[] = [
            { header: 'Tên NV', key: 'name', width: 22 },
            { header: 'Phòng ban', key: 'dept', width: 16 },
            { header: 'Nhóm', key: 'group', width: 16 },
        ];
        for (let i = 0; i < numDays; i++) {
            const [, m, d] = dateList[i].split('-').map(Number);
            s2Cols.push({ header: `${d}/${m}`, key: `d${i}`, width: 6 });
        }
        // ⭐ #3: Thêm cột % tỷ lệ ăn
        s2Cols.push({ header: 'Tổng ăn', key: 'totalEat', width: 10 });
        s2Cols.push({ header: 'Tổng nghỉ', key: 'totalSkip', width: 10 });
        s2Cols.push({ header: 'Tỷ lệ %', key: 'rate', width: 10 });

        sheet2.columns = s2Cols;
        sheet2.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        sheet2.getRow(1).height = 28;

        // ⭐ #4: Freeze panes — đóng băng 3 cột đầu (A-C) + header row
        sheet2.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

        // ⭐ #6: Sort employees by department for subtotal grouping
        const sortedEmployees = [...(employees || [])].sort((a, b) => {
            const deptA = a.department || 'Zzz_Khác';
            const deptB = b.department || 'Zzz_Khác';
            if (deptA !== deptB) return deptA.localeCompare(deptB, 'vi');
            return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
        });

        let currentDept = '';
        const deptSubtotals: { dept: string; totalEat: number; totalSkip: number; members: number; startRow: number }[] = [];
        let deptEat = 0, deptSkip = 0, deptMembers = 0, deptStartRow = 2;

        sortedEmployees.forEach((emp: any) => {
            const dept = emp.department || 'Khác';

            // ⭐ #6: Insert subtotal row when department changes
            if (currentDept && currentDept !== dept) {
                const subtotalRowNum = sheet2.rowCount + 1;
                deptSubtotals.push({ dept: currentDept, totalEat: deptEat, totalSkip: deptSkip, members: deptMembers, startRow: deptStartRow });
                const subRow = sheet2.addRow({
                    name: `📊 ${currentDept}`,
                    dept: `${deptMembers} NV`,
                    group: '',
                    totalEat: deptEat,
                    totalSkip: deptSkip,
                    rate: (deptEat + deptSkip) > 0 ? `${((deptEat / (deptEat + deptSkip)) * 100).toFixed(0)}%` : '-',
                });
                subRow.font = { bold: true, size: 10, color: { argb: 'FF6B4C00' } };
                subRow.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0D0' } };
                    cell.border = { top: { style: 'thin', color: { argb: 'FFB24700' } }, bottom: { style: 'thin', color: { argb: 'FFB24700' } } };
                });

                deptEat = 0; deptSkip = 0; deptMembers = 0;
                deptStartRow = subtotalRowNum + 1;
            }
            currentDept = dept;
            deptMembers++;

            const groupData = emp.groups ? (Array.isArray(emp.groups) ? emp.groups[0] : emp.groups) : null;

            // ⭐ #1/#2: Add status suffix to name
            let displayName = emp.full_name || 'N/A';
            if (emp.status === 'resigned') displayName += ' (Nghỉ việc)';
            else if (emp.status === 'paused') displayName += ' (Tạm dừng)';
            const joinDate = employeeJoinDate.get(emp.id);
            if (joinDate) displayName += ` (vào ${joinDate.slice(5)})`;

            const rowData: Record<string, any> = {
                name: displayName,
                dept: dept,
                group: groupData?.name || '-',
            };

            let totalEat = 0, totalSkip = 0;

            for (let i = 0; i < numDays; i++) {
                const dateStr = dateList[i];
                const status = getEffectiveStatus(emp, dateStr);

                if (status === 'eating') {
                    rowData[`d${i}`] = '✓'; totalEat++;
                } else if (status === 'not_eating') {
                    rowData[`d${i}`] = '✗'; totalSkip++;
                } else if (status === 'paused') {
                    rowData[`d${i}`] = 'P';
                } else if (status === 'resigned') {
                    rowData[`d${i}`] = 'R';
                } else if (status === 'not_joined') {
                    rowData[`d${i}`] = '—'; // ⭐ #2: chưa nhận việc
                } else {
                    rowData[`d${i}`] = ''; // no_cook day
                }
            }

            // ⭐ #3: Tỷ lệ %
            const total = totalEat + totalSkip;
            const rateNum = total > 0 ? (totalEat / total) * 100 : -1;
            rowData.totalEat = totalEat;
            rowData.totalSkip = totalSkip;
            rowData.rate = rateNum >= 0 ? `${rateNum.toFixed(0)}%` : '-';

            deptEat += totalEat;
            deptSkip += totalSkip;

            const row = sheet2.addRow(rowData);

            // Color cells
            for (let i = 0; i < numDays; i++) {
                const cellIdx = i + 4; // cột 1=name, 2=dept, 3=group, 4+=ngày (1-based)
                const cell = row.getCell(cellIdx);
                if (cell.value === '✓') {
                    cell.font = { color: { argb: 'FF16A34A' }, bold: true };
                } else if (cell.value === '✗') {
                    cell.font = { color: { argb: 'FFD12B37' }, bold: true };
                } else if (cell.value === 'P') {
                    cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                } else if (cell.value === 'R') {
                    cell.font = { color: { argb: 'FF808080' } };
                } else if (cell.value === '—') {
                    cell.font = { color: { argb: 'FFAAAAAA' } }; // ⭐ #2: gray dash
                }
                cell.alignment = { horizontal: 'center' };
            }

            // ⭐ #5: Highlight NV bất thường
            if (rateNum >= 0 && rateNum < 70 && total >= 3) {
                // Nghỉ > 30% → tô đỏ nhạt
                row.eachCell(cell => {
                    if (!cell.fill || (cell.fill as any).fgColor?.argb !== 'FFFFF0D0') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } };
                    }
                });
                // Bold đỏ cho cột tỷ lệ
                const rateCell = row.getCell(numDays + 6);
                rateCell.font = { bold: true, color: { argb: 'FFD12B37' } };
            } else if (rateNum === 100 && total >= 5) {
                // Ăn 100% → tô xanh nhạt
                row.eachCell(cell => {
                    if (!cell.fill || (cell.fill as any).fgColor?.argb !== 'FFFFF0D0') {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FFF0' } };
                    }
                });
                const rateCell = row.getCell(numDays + 6);
                rateCell.font = { bold: true, color: { argb: 'FF16A34A' } };
            }

            // Paused/resigned employee highlighting
            if (emp.status === 'paused' || emp.status === 'resigned') {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                });
            }
        });

        // ⭐ #6: Final department subtotal
        if (currentDept && deptMembers > 0) {
            deptSubtotals.push({ dept: currentDept, totalEat: deptEat, totalSkip: deptSkip, members: deptMembers, startRow: deptStartRow });
            const subRow = sheet2.addRow({
                name: `📊 ${currentDept}`,
                dept: `${deptMembers} NV`,
                group: '',
                totalEat: deptEat,
                totalSkip: deptSkip,
                rate: (deptEat + deptSkip) > 0 ? `${((deptEat / (deptEat + deptSkip)) * 100).toFixed(0)}%` : '-',
            });
            subRow.font = { bold: true, size: 10, color: { argb: 'FF6B4C00' } };
            subRow.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0D0' } };
                cell.border = { top: { style: 'thin', color: { argb: 'FFB24700' } }, bottom: { style: 'thin', color: { argb: 'FFB24700' } } };
            });
        }

        // ══════════════════════════════════════════════
        // ── Sheet 3: Guest Meals ──
        // ══════════════════════════════════════════════
        const sheet3 = workbook.addWorksheet('Suất phát sinh');
        sheet3.columns = [
            { header: 'Ngày', key: 'date', width: 14 },
            { header: 'Số lượng', key: 'quantity', width: 12 },
            { header: 'Ghi chú', key: 'note', width: 40 },
            { header: 'Người tạo', key: 'createdBy', width: 20 },
        ];
        sheet3.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        sheet3.getRow(1).height = 28;
        sheet3.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

        guestMeals?.forEach(g => {
            sheet3.addRow({ date: g.date, quantity: g.quantity, note: g.note || '', createdBy: g.created_by || '-' });
        });

        // ══════════════════════════════════════════════
        // ── Sheet 4: Chú thích ──
        // ══════════════════════════════════════════════
        const sheet4 = workbook.addWorksheet('Chú thích');
        sheet4.columns = [
            { header: 'Ký hiệu', key: 'symbol', width: 12 },
            { header: 'Ý nghĩa', key: 'meaning', width: 50 },
        ];
        sheet4.getRow(1).eachCell(cell => { Object.assign(cell, { style: headerStyle }); });
        sheet4.addRow({ symbol: '✓', meaning: 'Đăng ký ăn' });
        sheet4.addRow({ symbol: '✗', meaning: 'Hủy ăn / Báo nghỉ' });
        sheet4.addRow({ symbol: 'P', meaning: 'Tạm dừng hoạt động (Paused) — NV bị tạm dừng, không tính ăn/nghỉ' });
        sheet4.addRow({ symbol: 'R', meaning: 'Đã nghỉ việc (Resigned) — NV đã nghỉ, không tính ăn/nghỉ' });
        sheet4.addRow({ symbol: '—', meaning: 'Chưa nhận việc — NV vào giữa tháng, ngày trước khi vào không tính' });
        sheet4.addRow({ symbol: '(trống)', meaning: 'Ngày nghỉ / Không nấu bếp' });
        sheet4.addRow({ symbol: '', meaning: '' });
        sheet4.addRow({ symbol: '📊', meaning: '── Sheet 1: Giải thích cột ──' });
        sheet4.addRow({ symbol: 'Tổng NV', meaning: 'Tổng nhân viên toàn công ty (mọi status, mọi role) — snapshot cuối tháng' });
        sheet4.addRow({ symbol: 'Tính xuất ăn', meaning: 'Tổng NV - NV nghỉ - NV tạm dừng - NV sắp đi làm - NV bếp' });
        sheet4.addRow({ symbol: 'Hủy muộn', meaning: 'NV đã ĐK ăn nhưng hủy SAU deadline (5:00 sáng) — bếp đã mua đồ' });
        sheet4.addRow({ symbol: 'ĐK muộn', meaning: 'NV đăng ký ăn SAU deadline (5:00 sáng) — bếp chưa tính' });
        sheet4.addRow({ symbol: 'Suất hợp lệ', meaning: 'Tính xuất ăn - NV nghỉ ăn + Xuất khách = suất bếp phải chuẩn bị tại deadline (chưa tính ĐK muộn/Hủy muộn)' });
        sheet4.addRow({ symbol: 'Suất thực tế', meaning: 'Suất hợp lệ + ĐK muộn - Hủy muộn = tổng suất ăn thực sự cuối ngày (đã tính mọi thay đổi muộn)' });
        sheet4.addRow({ symbol: '', meaning: '' });
        sheet4.addRow({ symbol: '🎨', meaning: 'Màu nền:' });
        sheet4.addRow({ symbol: '🔴', meaning: 'Đỏ nhạt = NV nghỉ > 30% (cần lưu ý)' });
        sheet4.addRow({ symbol: '🟢', meaning: 'Xanh nhạt = NV ăn đều 100%' });
        sheet4.addRow({ symbol: '🟡', meaning: 'Vàng nhạt = Dòng subtotal phòng ban' });
        sheet4.addRow({ symbol: '⬜', meaning: 'Xám nhạt = NV đã nghỉ việc / tạm dừng' });

        // ⚠️ v6.1.5 AUDIT: Log xuất Excel (ai xuất, tháng nào, bao nhiêu NV)
        try {
            await supabase.from('activity_logs').insert({
                tenant_id: tenantId,
                user_id: user.id,
                action: 'admin_export_monthly',
                details: JSON.stringify({
                    start_date: startDate,
                    end_date: endDate,
                    total_employees: employees?.length || 0,
                    cooking_days: numDays,
                }),
            });
        } catch (logErr) {
            console.warn('Failed to log export action:', logErr);
        }

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer as ArrayBuffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="bao-cao-com-trua-${startDate}_to_${endDate}.xlsx"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
            },
        });

    } catch (error: any) {
        console.error('Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
