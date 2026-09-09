import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { buildUserDefaultMap, getDefaultFromMap } from '@/lib/meal-helpers';
import {
    HEADER_STYLE, STATUS_COLORS, HIGHLIGHT_COLORS,
    applyHeaderRow, freezePanes, addDeptSubtotalRow,
} from '@/lib/export-helpers';

/**
 * GET /api/kitchen/export/daily?date=2026-03-07&department=all&status=all
 * Export daily meal report as Excel file for Kitchen Dashboard
 * Kitchen/Admin/Manager only
 * 
 * ⚠️ v5.1.0: Nâng cấp — freeze panes, highlight NV bất thường, subtotal PB
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

        if (!profile || !['admin', 'manager', 'kitchen'].includes(profile.role)) {
            return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
        }

        const tenantId = profile.tenant_id;

        // Parse params
        const dateParam = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const departmentParam = request.nextUrl.searchParams.get('department') || 'all';
        const statusParam = request.nextUrl.searchParams.get('status') || 'all';

        // ===== PARALLEL QUERIES =====
        let empQuery = supabase
            .from('users')
            .select('id, full_name, email, department, role, status, default_meal_status, shift_id, shift')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .not('role', 'ilike', '%kitchen%')
            .order('department').order('full_name');

        if (departmentParam !== 'all') {
            empQuery = empQuery.eq('department', departmentParam);
        }

        const [
            { data: employees },
            { data: ordersRaw },
            { data: guestMealsRaw },
            { data: shiftsRaw },
        ] = await Promise.all([
            empQuery,
            supabase.from('orders')
                .select('user_id, status, created_at, note')
                .eq('date', dateParam)
                .eq('tenant_id', tenantId)
                .limit(5000),
            supabase.from('guest_meals')
                .select('id, quantity, note, created_by, created_at')
                .eq('date', dateParam)
                .eq('tenant_id', tenantId),
            supabase.from('shifts')
                .select('id, name, start_time, end_time')
                .eq('tenant_id', tenantId)
                .eq('active', true),
        ]);

        if (!employees || employees.length === 0) {
            return NextResponse.json({ error: 'Không có nhân viên' }, { status: 404 });
        }

        // Build default meal status map
        const userDefaultMap = buildUserDefaultMap(employees);

        // Filter orders to only include our employees
        const empIds = new Set(employees.map(e => e.id));
        const orders = (ordersRaw || []).filter(o => empIds.has(o.user_id));

        // Batch lookup guest meal creators
        let gmUserMap: Record<string, string> = {};
        const gmCreatorIds = [...new Set((guestMealsRaw || []).map((gm: any) => gm.created_by).filter(Boolean))];
        if (gmCreatorIds.length > 0) {
            const { data: gmUsers } = await supabase
                .from('users').select('id, full_name').in('id', gmCreatorIds);
            (gmUsers || []).forEach((u: any) => { gmUserMap[u.id] = u.full_name; });
        }

        const guestMeals = (guestMealsRaw || []).map((gm: any) => ({
            quantity: gm.quantity,
            note: gm.note || '',
            requester_name: gmUserMap[gm.created_by] || 'Không rõ',
            created_at: gm.created_at,
        }));
        const guestMealsTotal = guestMeals.reduce((sum: number, item: any) => sum + item.quantity, 0);

        // Build order map
        const orderMap = new Map<string, { status: string; created_at: string; note?: string }>();
        orders.forEach(o => {
            orderMap.set(o.user_id, { status: o.status, created_at: o.created_at, note: o.note });
        });

        // Map shift lookup
        const shiftMap = new Map<string, string>();
        (shiftsRaw || []).forEach((s: any) => {
            shiftMap.set(s.id, `${s.name} (${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)})`);
        });

        // Build employee rows with effective status
        interface EmployeeRow {
            full_name: string;
            email: string;
            department: string;
            shift_name: string;
            shift_id?: string;
            status: string;
            statusLabel: string;
            order_time: string;
            note: string;
        }

        const rows: EmployeeRow[] = [];

        for (const emp of employees) {
            const order = orderMap.get(emp.id);
            const defaultStatus = getDefaultFromMap(userDefaultMap, emp.id);
            const effectiveStatus = order?.status || defaultStatus;
            let statusLabel = 'Đã báo ăn';
            if (effectiveStatus === 'not_eating') statusLabel = 'Đã báo nghỉ';
            else if (effectiveStatus === 'cancelled') statusLabel = 'Đã hủy';

            if (statusParam !== 'all' && effectiveStatus !== statusParam) continue;

            const shiftDisplayName = (emp.shift_id && shiftMap.get(emp.shift_id))
                || emp.shift
                || 'Ca 1 (12:00 - 12:30)';

            rows.push({
                full_name: emp.full_name,
                email: emp.email,
                department: emp.department || 'N/A',
                shift_name: shiftDisplayName,
                shift_id: emp.shift_id,
                status: effectiveStatus,
                statusLabel,
                order_time: order?.created_at
                    ? new Date(order.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                    : (defaultStatus === 'not_eating' ? 'Mặc định nghỉ' : 'Mặc định ăn'),
                note: order?.note || ''
            });
        }

        // Stats
        const allStatuses = employees.map(emp => {
            const order = orderMap.get(emp.id);
            return order?.status || getDefaultFromMap(userDefaultMap, emp.id);
        });
        const totalEmployees = employees.length;
        const eatingCount = allStatuses.filter(s => s === 'eating').length;
        const notEatingCount = allStatuses.filter(s => s === 'not_eating').length;
        const cancelledCount = allStatuses.filter(s => s === 'cancelled').length;

        // Format date
        const displayDate = new Date(dateParam + 'T00:00:00').toLocaleDateString('vi-VN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // ===== BUILD EXCEL =====
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Cơm Ngon - Hệ thống quản lý suất ăn';
        wb.created = new Date();

        // ══════════════════════════════════
        // ── Sheet 1: Tổng hợp theo PB ──
        // ══════════════════════════════════
        const ws1 = wb.addWorksheet('Tổng hợp');

        // Title
        ws1.mergeCells('A1:G1');
        const titleCell = ws1.getCell('A1');
        titleCell.value = `BÁO CÁO SUẤT ĂN NGÀY ${displayDate.toUpperCase()}`;
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFB74B0C' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws1.getRow(1).height = 40;

        // Stats row
        ws1.mergeCells('A2:G2');
        const statsCell = ws1.getCell('A2');
        const eatingRate = totalEmployees > 0 ? ((eatingCount / totalEmployees) * 100).toFixed(0) : '0';
        statsCell.value = `Tổng NV: ${totalEmployees} | ✅ Ăn: ${eatingCount} (${eatingRate}%) | ❌ Nghỉ: ${notEatingCount} | ⛔ Hủy: ${cancelledCount} | 🍽️ Khách: ${guestMealsTotal} | 📦 TỔNG SUẤT: ${eatingCount + guestMealsTotal}`;
        statsCell.font = { name: 'Arial', size: 11, bold: true };
        statsCell.alignment = { horizontal: 'center' };
        ws1.getRow(2).height = 25;

        // Filter info
        ws1.mergeCells('A3:G3');
        const filterCell = ws1.getCell('A3');
        const deptLabel = departmentParam === 'all' ? 'Tất cả phòng ban' : departmentParam;
        const statusLabel = statusParam === 'all' ? 'Tất cả' : statusParam === 'eating' ? 'Đã báo ăn' : statusParam === 'not_eating' ? 'Đã báo nghỉ' : 'Đã hủy';
        filterCell.value = `Bộ lọc — Phòng ban: ${deptLabel} | Trạng thái: ${statusLabel}`;
        filterCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF888888' } };
        filterCell.alignment = { horizontal: 'center' };

        // ⭐ Sheet 1: Bảng tổng hợp theo phòng ban
        ws1.addRow([]);
        const deptHeaderRow = ws1.addRow(['Phòng ban', 'Tổng NV', 'Ăn', 'Nghỉ', 'Hủy', 'Tỷ lệ ăn %', 'Ghi chú']);
        deptHeaderRow.eachCell(cell => { Object.assign(cell, { style: HEADER_STYLE }); });
        deptHeaderRow.height = 28;

        // Group by department
        const deptGroups = new Map<string, { total: number; eating: number; notEating: number; cancelled: number }>();
        employees.forEach(emp => {
            const dept = emp.department || 'Khác';
            if (!deptGroups.has(dept)) deptGroups.set(dept, { total: 0, eating: 0, notEating: 0, cancelled: 0 });
            const g = deptGroups.get(dept)!;
            g.total++;
            const order = orderMap.get(emp.id);
            const status = order?.status || getDefaultFromMap(userDefaultMap, emp.id);
            if (status === 'eating') g.eating++;
            else if (status === 'not_eating') g.notEating++;
            else if (status === 'cancelled') g.cancelled++;
        });

        deptGroups.forEach((stats, dept) => {
            const rate = stats.total > 0 ? ((stats.eating / stats.total) * 100).toFixed(0) : '0';
            const rateNum = parseFloat(rate);
            const row = ws1.addRow([dept, stats.total, stats.eating, stats.notEating, stats.cancelled, `${rate}%`, '']);

            // ⭐ Highlight: PB nghỉ nhiều → đỏ, PB ăn đều → xanh
            if (rateNum < 70 && stats.total >= 3) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.highCancelRow } };
                });
                row.getCell(6).font = { bold: true, color: { argb: STATUS_COLORS.not_eating } };
            } else if (rateNum === 100 && stats.total >= 3) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.perfectRow } };
                });
                row.getCell(6).font = { bold: true, color: { argb: STATUS_COLORS.eating } };
            }

            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                };
            });
        });

        // TỔNG row
        const grandTotalRow = ws1.addRow([
            'TỔNG', totalEmployees, eatingCount, notEatingCount, cancelledCount,
            `${eatingRate}%`, `+ ${guestMealsTotal} khách = ${eatingCount + guestMealsTotal} suất`
        ]);
        grandTotalRow.font = { bold: true, size: 12 };
        grandTotalRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0D0' } };
            cell.border = { top: { style: 'medium', color: { argb: 'FFB24700' } }, bottom: { style: 'medium', color: { argb: 'FFB24700' } } };
        });

        // ⭐ Sheet 1: Bảng tổng hợp theo Ca ăn (Shifts breakdown)
        ws1.addRow([]);
        ws1.addRow([]);
        const shiftTitleRow = ws1.addRow(['BẢNG PHÂN BỔ SUẤT ĂN THEO CA ĂN TRƯA']);
        shiftTitleRow.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFB74B0C' } };

        const shiftHeaderRow = ws1.addRow(['Ca ăn', 'Khoảng thời gian', 'Số người ăn', 'Tỷ lệ %', '', '', '']);
        shiftHeaderRow.eachCell((cell, colNumber) => {
            if (colNumber <= 4) Object.assign(cell, { style: HEADER_STYLE });
        });
        shiftHeaderRow.height = 25;

        // Group orders by shift for users who are 'eating'
        const shiftGroups = new Map<string, { name: string; time: string; count: number }>();
        (shiftsRaw || []).forEach((s: any) => {
            shiftGroups.set(s.id, {
                name: s.name,
                time: `${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)}`,
                count: 0
            });
        });
        const defaultShiftKey = 'default';
        shiftGroups.set(defaultShiftKey, { name: 'Chưa phân ca / Khác', time: '12:00 - 13:00', count: 0 });

        employees.forEach(emp => {
            const order = orderMap.get(emp.id);
            const status = order?.status || getDefaultFromMap(userDefaultMap, emp.id);
            if (status === 'eating') {
                const key = emp.shift_id && shiftGroups.has(emp.shift_id) ? emp.shift_id : defaultShiftKey;
                shiftGroups.get(key)!.count++;
            }
        });

        shiftGroups.forEach(sg => {
            if (sg.count > 0 || sg.name !== 'Chưa phân ca / Khác') {
                const shiftRate = eatingCount > 0 ? ((sg.count / eatingCount) * 100).toFixed(0) : '0';
                const sRow = ws1.addRow([sg.name, sg.time, sg.count, `${shiftRate}%`]);
                sRow.eachCell((cell, colNumber) => {
                    if (colNumber <= 4) {
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        };
                    }
                });
            }
        });

        ws1.columns = [
            { width: 22 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 30 }
        ];
        // ⭐ Freeze panes
        freezePanes(ws1, 0, 5);

        // ══════════════════════════════════
        // ── Sheet 2: Chi tiết NV ──
        // ══════════════════════════════════
        const ws2 = wb.addWorksheet('Chi tiết NV');

        const headerRow2 = ws2.addRow(['STT', 'Họ tên', 'Phòng ban', 'Ca ăn', 'Trạng thái', 'Thời gian ĐK', 'Ghi chú']);
        headerRow2.eachCell(cell => { Object.assign(cell, { style: HEADER_STYLE }); });
        headerRow2.height = 28;
        // ⭐ Freeze panes
        freezePanes(ws2, 0, 1);

        // ⭐ Sort by department → tên để gom nhóm
        const sortedRows = [...rows].sort((a, b) => {
            if (a.department !== b.department) return a.department.localeCompare(b.department, 'vi');
            return a.full_name.localeCompare(b.full_name, 'vi');
        });

        let currentDept = '';
        let deptEat = 0, deptSkip = 0, deptMembers = 0;
        let sttCounter = 0;

        sortedRows.forEach((row, idx) => {
            // ⭐ #6: Subtotal khi đổi phòng ban
            if (currentDept && currentDept !== row.department) {
                const subRow = ws2.addRow([
                    '', `📊 ${currentDept}`, `${deptMembers} NV`, '',
                    `Ăn: ${deptEat}`, `Nghỉ: ${deptSkip}`,
                    `Tỷ lệ: ${(deptEat + deptSkip) > 0 ? ((deptEat / (deptEat + deptSkip)) * 100).toFixed(0) : 0}%`
                ]);
                subRow.font = { bold: true, size: 10, color: { argb: 'FF6B4C00' } };
                subRow.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.subtotalRow } };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFB24700' } },
                        bottom: { style: 'thin', color: { argb: 'FFB24700' } },
                    };
                });
                deptEat = 0; deptSkip = 0; deptMembers = 0;
            }
            currentDept = row.department;
            deptMembers++;
            if (row.status === 'eating') deptEat++;
            else deptSkip++;

            sttCounter++;
            const dataRow = ws2.addRow([
                sttCounter, row.full_name, row.department, row.shift_name,
                row.statusLabel, row.order_time, row.note
            ]);

            dataRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Arial', size: 10 };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
                if (idx % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                }
                // Status column coloring
                if (colNumber === 5) {
                    const color = row.status === 'eating' ? STATUS_COLORS.eating
                        : row.status === 'not_eating' ? STATUS_COLORS.not_eating
                            : STATUS_COLORS.cancelled;
                    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: color } };
                }
            });
        });

        // ⭐ Final department subtotal
        if (currentDept && deptMembers > 0) {
            const subRow = ws2.addRow([
                '', `📊 ${currentDept}`, `${deptMembers} NV`, '',
                `Ăn: ${deptEat}`, `Nghỉ: ${deptSkip}`,
                `Tỷ lệ: ${(deptEat + deptSkip) > 0 ? ((deptEat / (deptEat + deptSkip)) * 100).toFixed(0) : 0}%`
            ]);
            subRow.font = { bold: true, size: 10, color: { argb: 'FF6B4C00' } };
            subRow.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.subtotalRow } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFB24700' } },
                    bottom: { style: 'thin', color: { argb: 'FFB24700' } },
                };
            });
        }

        ws2.columns = [
            { width: 6 }, { width: 25 }, { width: 20 }, { width: 25 }, { width: 15 }, { width: 22 }, { width: 25 }
        ];

        // ══════════════════════════════════
        // ── Sheet 3: Suất phát sinh ──
        // ══════════════════════════════════
        if (guestMeals && guestMeals.length > 0) {
            const ws3 = wb.addWorksheet('Suất phát sinh');
            ws3.columns = [
                { header: 'STT', key: 'stt', width: 6 },
                { header: 'Người yêu cầu', key: 'requester', width: 25 },
                { header: 'Số lượng', key: 'quantity', width: 12 },
                { header: 'Lý do', key: 'note', width: 40 },
                { header: 'Thời gian', key: 'time', width: 22 },
            ];
            applyHeaderRow(ws3);
            freezePanes(ws3);

            guestMeals.forEach((gm, idx) => {
                ws3.addRow({
                    stt: idx + 1,
                    requester: gm.requester_name || 'N/A',
                    quantity: gm.quantity,
                    note: gm.note || '',
                    time: new Date(gm.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
                });
            });

            // Total row
            const totalGuestRow = ws3.addRow({
                stt: '', requester: 'TỔNG', quantity: guestMealsTotal, note: '', time: ''
            });
            totalGuestRow.font = { bold: true, size: 12 };
        }

        // Generate buffer
        const buffer = await wb.xlsx.writeBuffer();
        const fileName = `BaoCaoBep_${dateParam}.xlsx`;

        return new NextResponse(buffer as ArrayBuffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });
    } catch (error: any) {
        console.error('Kitchen export error:', error);
        return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
    }
}
