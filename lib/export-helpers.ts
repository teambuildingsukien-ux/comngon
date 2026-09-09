/**
 * 📦 Export Helpers — Shared logic cho Admin Monthly + Kitchen Daily export
 * Single Source of Truth: styles, cooking day check, header format
 */
import ExcelJS from 'exceljs';

// ===== SHARED STYLES =====
export const HEADER_STYLE: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB24700' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
    }
};

export const SUBTOTAL_STYLE = {
    font: { bold: true, size: 10, color: { argb: 'FF6B4C00' } } as Partial<ExcelJS.Font>,
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF0D0' } },
    border: {
        top: { style: 'thin' as const, color: { argb: 'FFB24700' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFB24700' } }
    },
};

export const STATUS_COLORS = {
    eating: 'FF16A34A',     // green
    not_eating: 'FFD12B37', // red
    cancelled: 'FFF59E0B',  // amber
    paused: 'FFFF8C00',     // orange
    resigned: 'FF808080',   // gray
    not_joined: 'FFAAAAAA', // light gray
};

export const HIGHLIGHT_COLORS = {
    highCancelRow: 'FFFFF0F0',  // đỏ nhạt — nghỉ >30%
    perfectRow: 'FFF0FFF0',     // xanh nhạt — ăn 100%
    subtotalRow: 'FFFFF0D0',    // vàng nhạt — subtotal PB
    inactiveRow: 'FFF5F5F5',    // xám nhạt — paused/resigned 
    weekendRow: 'FFF3F3F3',     // xám rất nhạt — cuối tuần
    alternateRow: 'FFFFF8F0',   // cam rất nhạt — dòng chẵn
};

// ===== COOKING DAY HELPERS =====

/** Sakamoto's algorithm: day of week without Date object (timezone-safe) */
export function getDayOfWeek(y: number, m: number, d: number): number {
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    if (m < 3) y--;
    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
}

/** Create a cooking day checker function */
export function createCookingDayChecker(
    cookStartDay: number,
    cookEndDay: number,
    exceptionMap: Map<string, string>,
): (dateStr: string) => boolean {
    return (dateStr: string): boolean => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dayOfWeek = getDayOfWeek(y, m, d);
        let isCook = cookStartDay <= cookEndDay
            ? dayOfWeek >= cookStartDay && dayOfWeek <= cookEndDay
            : dayOfWeek >= cookStartDay || dayOfWeek <= cookEndDay;
        const ex = exceptionMap.get(dateStr);
        if (ex === 'no_cook') isCook = false;
        else if (ex === 'extra_cook') isCook = true;
        return isCook;
    };
}

/** Parse cooking days from system_settings value */
export function parseCookingDays(settingValue: any): { startDay: number; endDay: number } {
    try {
        const parsed = typeof settingValue === 'string' ? JSON.parse(settingValue) : settingValue;
        return { startDay: parsed.start_day ?? 1, endDay: parsed.end_day ?? 5 };
    } catch {
        return { startDay: 1, endDay: 5 };
    }
}

// ===== SHEET HELPERS =====

export const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Apply header style to first row of a worksheet */
export function applyHeaderRow(ws: ExcelJS.Worksheet, height = 28) {
    ws.getRow(1).eachCell(cell => { Object.assign(cell, { style: HEADER_STYLE }); });
    ws.getRow(1).height = height;
}

/** Apply freeze panes to a worksheet */
export function freezePanes(ws: ExcelJS.Worksheet, xSplit = 0, ySplit = 1) {
    ws.views = [{ state: 'frozen', xSplit, ySplit }];
}

/** Highlight row based on eating rate */
export function highlightRowByRate(row: ExcelJS.Row, ratePercent: number, totalMeals: number) {
    if (ratePercent >= 0 && ratePercent < 70 && totalMeals >= 3) {
        // Nghỉ > 30%
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.highCancelRow } };
        });
    } else if (ratePercent === 100 && totalMeals >= 5) {
        // Ăn 100%
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIGHLIGHT_COLORS.perfectRow } };
        });
    }
}

/** Add department subtotal row */
export function addDeptSubtotalRow(
    ws: ExcelJS.Worksheet,
    dept: string,
    members: number,
    totalEat: number,
    totalSkip: number,
    extraCols?: Record<string, any>,
) {
    const rate = (totalEat + totalSkip) > 0 ? `${((totalEat / (totalEat + totalSkip)) * 100).toFixed(0)}%` : '-';
    const rowData: Record<string, any> = {
        name: `📊 ${dept}`,
        dept: `${members} NV`,
        group: '',
        totalEat,
        totalSkip,
        rate,
        ...extraCols,
    };
    const subRow = ws.addRow(rowData);
    subRow.font = SUBTOTAL_STYLE.font;
    subRow.eachCell(cell => {
        cell.fill = SUBTOTAL_STYLE.fill;
        cell.border = SUBTOTAL_STYLE.border;
    });
    return subRow;
}
