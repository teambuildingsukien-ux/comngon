/**
 * 📈 AI Chat Stats Calculator (SSOT Wrapper)
 * Wrap `calculateDateRangeStats` từ `lib/report-calculator.ts` để đảm bảo 
 * AI báo cáo số liệu KHỚP 100% với Admin Sheet 1.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateDateRangeStats } from '@/lib/report-calculator'

export interface EmployeeStat {
    name: string
    dept: string
    shift: string
    group: string
    eating: number
    not_eating: number
    dates_cancelled: string[]
}

export interface DailyStat {
    eating: number
    not_eating: number
    guest: number
    dayOfWeek: string
}

export interface MealStatsResult {
    totalEating: number
    totalNotEating: number
    totalGuest: number
    cookingDaysCount: number
    dailyStats: Record<string, DailyStat>
    employeeStats: Record<string, EmployeeStat>
    // Monthly stats
    monthEating: number
    monthNotEating: number
    monthGuest: number
    monthCookingDays: number
}

interface EmployeeMapEntry {
    name: string
    dept: string
    role: string
    shift: string
    group: string
    active: boolean
    joinDate?: string
}

/**
 * Lấy toàn bộ stats suất ăn cho AI Chat context bằng chuẩn SSOT.
 */
export async function getSSOTMealStats(params: {
    supabase: SupabaseClient
    tenantId: string
    startDate: string
    today: string
    monthStart: string
    employeeMap: Map<string, EmployeeMapEntry>
}): Promise<MealStatsResult> {
    const { supabase, tenantId, startDate, today, monthStart, employeeMap } = params

    // 1. Lấy SSOT stats cho 30 ngày qua (dùng cho list dailyStats, tổng 30 ngày)
    const stats30 = await calculateDateRangeStats(supabase, tenantId, startDate, today)

    // 2. Lấy SSOT stats riêng cho tháng này (dùng cho section "Tháng này" của AI)
    let statsMonth = stats30
    if (monthStart !== startDate) {
        // Tránh call dư nếu user chat vào ngày mùng 1
        statsMonth = await calculateDateRangeStats(supabase, tenantId, monthStart, today)
    }

    // 3. Build AI-specific structures
    const dailyStatsRecord: Record<string, DailyStat> = {}
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
    
    stats30.dailyStats.forEach(d => {
        if (d.isCooking) {
            const [sy, sm, sd] = d.date.split('-').map(Number)
            const dow = new Date(sy, sm - 1, sd).getDay()
            dailyStatsRecord[d.date] = {
                // Trong SSOT, eating (dayTotal) = NV_ăn + Guest
                // AI dailyStats.eating thường chỉ hiện số NV, ta trừ guest ra
                eating: d.eating - d.guest,
                not_eating: d.notEating + d.lateCancel,
                guest: d.guest,
                dayOfWeek: dayNames[dow]
            }
        }
    })

    // 4. Build employeeStats (Top cancellers/eaters) từ raw data của 30 ngày
    const employeeStats: Record<string, EmployeeStat> = {}
    const raw = stats30._raw

    raw.allEmployees.forEach((emp: any) => {
        const info = employeeMap.get(emp.id)
        if (!info) return

        employeeStats[emp.id] = {
            name: info.name,
            dept: info.dept,
            shift: info.shift,
            group: info.group,
            eating: 0,
            not_eating: 0,
            dates_cancelled: []
        }
    })

    // Lặp qua từng ngày để đếm ai ăn ai nghỉ (để tìm Top Cancellers/Eaters)
    stats30.dailyStats.forEach(d => {
        if (!d.isCooking) return
        const dateStr = d.date
        
        raw.allEmployees.forEach((emp: any) => {
            const statusOnDay = raw.getStatusOnDate(emp.id, dateStr, emp.status || 'active', emp.resigned_date)
            if (statusOnDay === 'resigned' || statusOnDay === 'paused') return
            
            const joinDate = raw.employeeJoinDate.get(emp.id) || emp.start_date || (emp.created_at ? emp.created_at.slice(0, 10) : null)
            if (joinDate && joinDate > dateStr) return

            const orderData = raw.orderMap.get(dateStr)?.get(emp.id)
            const mealStatus = orderData?.status || emp.default_meal_status || 'eating'
            
            if (mealStatus === 'not_eating') {
                employeeStats[emp.id].not_eating++
                employeeStats[emp.id].dates_cancelled.push(dateStr)
            } else {
                employeeStats[emp.id].eating++
            }
        })
    })

    return {
        totalEating: stats30.totalMeals, // đã gồm guest trong SSOT
        totalNotEating: stats30.totalNotEating,
        totalGuest: stats30.totalGuest,
        cookingDaysCount: stats30.cookingDays,
        dailyStats: dailyStatsRecord,
        employeeStats,
        monthEating: statsMonth.totalMeals,
        monthNotEating: statsMonth.totalNotEating,
        monthGuest: statsMonth.totalGuest,
        monthCookingDays: statsMonth.cookingDays,
    }
}
