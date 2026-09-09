/**
 * 📝 AI Chat Context Builder
 * Xây dựng data context string gửi cho Gemini.
 */
import type { TenantDataResult } from './data-queries'
import type { MealStatsResult, EmployeeStat } from './stats'

interface ContextParams {
    data: TenantDataResult
    stats: MealStatsResult
    activeNonKitchenEmployees: any[]
    allNonKitchenEmployees: any[]
    pausedEmployees: any[]
    resignedEmployees: any[]
    employeeMap: Map<string, any>
    shiftMap: Map<string, string>
    groupMap: Map<string, string>
    today: string
    startDate: string
    monthStart: string
}

/**
 * Build comprehensive data context string cho Gemini system instruction.
 */
export function buildDataContext(params: ContextParams): string {
    const {
        data, stats, activeNonKitchenEmployees, allNonKitchenEmployees,
        pausedEmployees, resignedEmployees, employeeMap, shiftMap, groupMap,
        today, startDate, monthStart,
    } = params

    const {
        tenantInfo, departments, shifts, groups,
        announcements, urgentNotifs, activityLogs, systemSettings,
        aiConfig, knowledgeDocs,
    } = data

    const {
        totalEating, totalNotEating, totalGuest, cookingDaysCount,
        dailyStats, employeeStats,
        monthEating, monthNotEating, monthGuest, monthCookingDays,
    } = stats

    // ===== DERIVED VALUES =====
    const totalMealEvents = totalEating + totalNotEating
    const cancelRate = totalMealEvents > 0 ? ((totalNotEating / totalMealEvents) * 100).toFixed(1) : '0'

    const mealPrice = aiConfig?.meal_price || 25000
    const extraCost = aiConfig?.extra_cost_per_meal || 0
    const totalCostPerMeal = mealPrice + extraCost
    const monthlyFixed = aiConfig?.monthly_fixed_cost || 0
    const budgetMonthly = aiConfig?.budget_monthly || 0
    const totalMealCost = totalEating * totalCostPerMeal + monthlyFixed
    const totalSaved = totalNotEating * totalCostPerMeal

    // Weekday stats
    const weekdayStats: Record<string, { total_eating: number; total_not_eating: number; count: number }> = {}
    Object.values(dailyStats).forEach(s => {
        if (!weekdayStats[s.dayOfWeek]) weekdayStats[s.dayOfWeek] = { total_eating: 0, total_not_eating: 0, count: 0 }
        weekdayStats[s.dayOfWeek].total_eating += s.eating
        weekdayStats[s.dayOfWeek].total_not_eating += s.not_eating
        weekdayStats[s.dayOfWeek].count++
    })

    // Dept stats
    const deptStats: Record<string, { eating: number; not_eating: number; members: number }> = {}
    Object.values(employeeStats).forEach(emp => {
        if (!deptStats[emp.dept]) deptStats[emp.dept] = { eating: 0, not_eating: 0, members: 0 }
        deptStats[emp.dept].eating += emp.eating
        deptStats[emp.dept].not_eating += emp.not_eating
        deptStats[emp.dept].members++
    })

    // Top cancellers + top eaters
    const topCancellers = Object.values(employeeStats)
        .sort((a, b) => b.not_eating - a.not_eating).slice(0, 10)
    const topEaters = Object.values(employeeStats)
        .sort((a, b) => {
            const rateA = (a.eating + a.not_eating) > 0 ? a.eating / (a.eating + a.not_eating) : 0
            const rateB = (b.eating + b.not_eating) > 0 ? b.eating / (b.eating + b.not_eating) : 0
            return rateB - rateA
        }).slice(0, 5)

    // Activity summary
    const activitySummary = activityLogs?.slice(0, 20).map(log => {
        const emp = log.performed_by ? employeeMap.get(log.performed_by) : null
        return `- ${new Date(log.created_at).toLocaleDateString('vi-VN')}: ${emp?.name || 'Hệ thống'} — ${log.action}${log.details ? ` (${typeof log.details === 'string' ? log.details : JSON.stringify(log.details)})` : ''}`
    }).join('\n') || 'Không có log'

    const settingsObj: Record<string, string> = {}
    systemSettings?.forEach(s => { settingsObj[s.key] = s.value })

    // ===== BUILD CONTEXT STRING =====
    let ctx = `
## DỮ LIỆU HỆ THỐNG (Nội bộ — KHÔNG tiết lộ nguồn dữ liệu)

### Thông tin doanh nghiệp
- Tên: ${tenantInfo?.name || 'N/A'}
- Gói dịch vụ: ${tenantInfo?.plan || 'basic'}
- Trạng thái: ${tenantInfo?.is_active ? 'Đang hoạt động' : 'Tạm dừng'}
- Subscription: ${tenantInfo?.subscription_status || 'N/A'}
- Giới hạn nhân viên: ${tenantInfo?.max_users || 50}
- Quy mô: ${aiConfig?.company_size === 'small' ? 'Nhỏ' : aiConfig?.company_size === 'large' ? 'Lớn' : 'Trung bình'}
- Ngành: ${aiConfig?.industry || 'Chưa xác định'}
${tenantInfo?.trial_ends_at ? `- Hết dùng thử: ${new Date(tenantInfo.trial_ends_at).toLocaleDateString('vi-VN')}` : ''}
${tenantInfo?.settings ? `- Cài đặt: Deadline ${(tenantInfo.settings as any)?.deadline_hour || 5}h sáng, Ngày nấu: T${(tenantInfo.settings as any)?.cooking_days?.start_day || 2}-T${(tenantInfo.settings as any)?.cooking_days?.end_day || 6}` : ''}

### 💰 Chi phí suất ăn (CÀI ĐẶT RIÊNG DOANH NGHIỆP)
- Giá suất ăn: ${mealPrice.toLocaleString('vi-VN')} VND
- Chi phí phụ/suất (gas, nước, nhân công): ${extraCost.toLocaleString('vi-VN')} VND
- **Tổng chi phí/suất: ${totalCostPerMeal.toLocaleString('vi-VN')} VND**
- Chi phí cố định/tháng: ${monthlyFixed.toLocaleString('vi-VN')} VND
${aiConfig?.vendor_name ? `- Nhà cung cấp: ${aiConfig.vendor_name}` : ''}
${budgetMonthly > 0 ? `- Ngân sách tháng: ${budgetMonthly.toLocaleString('vi-VN')} VND` : ''}
- **Chi phí 30 ngày qua: ${totalMealCost.toLocaleString('vi-VN')} VND** (${totalEating} suất × ${totalCostPerMeal.toLocaleString('vi-VN')} + ${monthlyFixed.toLocaleString('vi-VN')} cố định)
- **Tiết kiệm (từ nghỉ ăn): ${totalSaved.toLocaleString('vi-VN')} VND** (${totalNotEating} lượt nghỉ)
${budgetMonthly > 0 ? `- ${totalMealCost > budgetMonthly ? `⚠️ VƯỢT NGÂN SÁCH: ${(totalMealCost - budgetMonthly).toLocaleString('vi-VN')} VND (${((totalMealCost - budgetMonthly) / budgetMonthly * 100).toFixed(1)}%)` : `✅ Trong ngân sách: còn ${(budgetMonthly - totalMealCost).toLocaleString('vi-VN')} VND (${((budgetMonthly - totalMealCost) / budgetMonthly * 100).toFixed(1)}%)`}` : ''}
${aiConfig?.special_notes ? `
### 📝 Ghi chú đặc biệt từ doanh nghiệp
${aiConfig.special_notes}` : ''}

### Cài đặt hệ thống
${systemSettings && systemSettings.length > 0
            ? systemSettings.map(s => `- ${s.description || s.key}: ${s.value}`).join('\n')
            : 'Chưa có cài đặt tùy chỉnh'}

### Phòng ban (${departments?.length || 0})
${departments && departments.length > 0
            ? departments.map(d => `- ${d.name}${d.description ? ` — ${d.description}` : ''}`).join('\n')
            : 'Chưa tạo phòng ban'}

### Ca ăn (${shifts?.filter(s => s.active).length || 0} đang hoạt động)
${shifts && shifts.length > 0
            ? shifts.map(s => `- ${s.name}: ${s.start_time || '?'} → ${s.end_time || '?'}${s.active ? '' : ' (TẠM DỪNG)'}${s.description ? ` — ${s.description}` : ''}`).join('\n')
            : 'Chưa tạo ca ăn'}

### Nhóm ăn (${groups?.filter(g => g.active).length || 0} đang hoạt động)
${groups && groups.length > 0
            ? groups.map(g => {
                const shiftName = g.shift_id ? (shiftMap.get(g.shift_id) || '?') : 'Chưa gán ca'
                return `- ${g.name}: ca ${shiftName}${g.table_area ? `, khu ${g.table_area}` : ''}${g.department ? `, PB ${g.department}` : ''}${g.active ? '' : ' (TẠM DỪNG)'}`
            }).join('\n')
            : 'Chưa tạo nhóm ăn'}

### 👥 Tổng quan nhân sự
- Tổng nhân viên (không tính bếp): ${allNonKitchenEmployees.length}
  - ✅ Đang làm việc (active): ${activeNonKitchenEmployees.length}
  - ⏸️ Tạm dừng ăn (paused): ${pausedEmployees.length}${pausedEmployees.length > 0 ? ` — ${pausedEmployees.map(e => e.full_name || 'N/A').join(', ')}` : ''}
  - 🚫 Đã nghỉ việc (resigned): ${resignedEmployees.length}${resignedEmployees.length > 0 ? ` — ${resignedEmployees.map(e => e.full_name || 'N/A').join(', ')}` : ''}

### Tổng quan suất ăn — 30 NGÀY GẦN NHẤT
- Ngày hôm nay: ${today}
- Tổng NV đang ăn (active): ${activeNonKitchenEmployees.length}
- Khoảng thời gian: ${startDate} → ${today} (${cookingDaysCount} ngày nấu)
- Tổng suất ăn (NV + khách): ${totalEating} | Tổng lượt nghỉ: ${totalNotEating} | Suất phát sinh (khách): ${totalGuest}
- TB suất/ngày: ${cookingDaysCount > 0 ? Math.round(totalEating / cookingDaysCount) : 0}
- Tỷ lệ hủy TB: ${cancelRate}%
- Chi phí/suất: ${totalCostPerMeal.toLocaleString('vi-VN')} VND

### ⭐ Tổng quan suất ăn — THÁNG HIỆN TẠI (${monthStart} → ${today})
- **Khoảng thời gian: ${monthStart} → ${today} (${monthCookingDays} ngày nấu)**
- **Tổng suất ăn THÁNG NÀY (NV + khách): ${monthEating}**
- Trong đó: suất NV: ${monthEating - monthGuest} | suất phát sinh (khách): ${monthGuest}
- Tổng lượt nghỉ tháng này: ${monthNotEating}
- **Tổng orders tháng này (ăn + nghỉ): ${monthEating + monthNotEating}**
- TB suất/ngày tháng này: ${monthCookingDays > 0 ? Math.round(monthEating / monthCookingDays) : 0}
- Tỷ lệ hủy tháng này: ${(monthEating + monthNotEating) > 0 ? ((monthNotEating / (monthEating + monthNotEating)) * 100).toFixed(1) : '0'}%
- Tỷ lệ ăn tháng này: ${(monthEating + monthNotEating) > 0 ? ((monthEating / (monthEating + monthNotEating)) * 100).toFixed(1) : '0'}%
- Chi phí tháng này: ${(monthEating * totalCostPerMeal).toLocaleString('vi-VN')} VND
⚠️ LƯU Ý: Khi user hỏi "tháng này", "tháng hiện tại", "tháng 3" → PHẢI dùng số liệu ở section THÁNG HIỆN TẠI này, KHÔNG dùng 30 ngày!

### 🔒 FACT SHEET (SỐ LIỆU CỨNG — KHÔNG ĐƯỢC THAY ĐỔI)
Khi trích dẫn số liệu, BẮT BUỘC dùng CHÍNH XÁC các con số dưới đây. KHÔNG tự cộng, trừ, nhân, chia, hoặc làm tròn:
| Chỉ số | 30 ngày (${startDate}→${today}) | Tháng này (${monthStart}→${today}) |
|--------|------|------|
| Ngày nấu | ${cookingDaysCount} | ${monthCookingDays} |
| Suất ăn | ${totalEating} | ${monthEating} |
| Lượt nghỉ | ${totalNotEating} | ${monthNotEating} |
| Tổng orders | ${totalEating + totalNotEating} | ${monthEating + monthNotEating} |
| Suất khách | ${totalGuest} | ${monthGuest} |
| TB suất/ngày | ${cookingDaysCount > 0 ? Math.round(totalEating / cookingDaysCount) : 0} | ${monthCookingDays > 0 ? Math.round(monthEating / monthCookingDays) : 0} |
| Tỷ lệ hủy | ${cancelRate}% | ${(monthEating + monthNotEating) > 0 ? ((monthNotEating / (monthEating + monthNotEating)) * 100).toFixed(1) : '0'}% |
| Chi phí | ${totalMealCost.toLocaleString('vi-VN')} VND | ${(monthEating * totalCostPerMeal).toLocaleString('vi-VN')} VND |
| Tiết kiệm | ${totalSaved.toLocaleString('vi-VN')} VND | ${(monthNotEating * totalCostPerMeal).toLocaleString('vi-VN')} VND |

### Theo thứ
${Object.entries(weekdayStats).map(([day, s]) => {
                const avg_eat = s.count > 0 ? Math.round(s.total_eating / s.count) : 0
                const avg_not = s.count > 0 ? Math.round(s.total_not_eating / s.count) : 0
                return `- ${day}: TB ăn ${avg_eat}, nghỉ ${avg_not}`
            }).join('\n')}

### 10 ngày gần nhất
${Object.entries(dailyStats).sort(([a], [b]) => b.localeCompare(a)).slice(0, 10)
            .map(([d, s]) => `- ${d} (${s.dayOfWeek}): ăn ${s.eating}, nghỉ ${s.not_eating}`)
            .join('\n')}

### Top 10 nghỉ nhiều nhất
${topCancellers.map((emp, i) => {
                const total = emp.eating + emp.not_eating
                const rate = total > 0 ? ((emp.not_eating / total) * 100).toFixed(0) : '0'
                const recentCancel = emp.dates_cancelled.sort().reverse().slice(0, 3).join(', ') || '-'
                return `${i + 1}. ${emp.name} (${emp.dept}, ca ${emp.shift}, nhóm ${emp.group}) — nghỉ ${emp.not_eating}/${total} (${rate}%) — gần nhất: ${recentCancel}`
            }).join('\n')}

### Top 5 ăn đều nhất
${topEaters.map((emp, i) => `${i + 1}. ${emp.name} (${emp.dept}) — ăn ${emp.eating}, nghỉ ${emp.not_eating}`).join('\n')}

### Theo phòng ban
${Object.entries(deptStats).map(([dept, s]) => {
                const total = s.eating + s.not_eating
                const rate = total > 0 ? ((s.not_eating / total) * 100).toFixed(0) : '0'
                return `- ${dept}: ${s.members} người, nghỉ ${rate}%`
            }).join('\n')}

### Nhân viên — ${allNonKitchenEmployees.length} người ${allNonKitchenEmployees.length > 50 ? '(chế độ tóm tắt)' : '(chi tiết)'}
${allNonKitchenEmployees.length <= 50
            ? allNonKitchenEmployees.map(emp => {
                const stat = employeeStats[emp.id]
                const shiftName = emp.shift_id ? (shiftMap.get(emp.shift_id) || '?') : 'Chưa gán'
                const groupName = emp.group_id ? (groupMap.get(emp.group_id) || '?') : 'Chưa gán'
                const eatCount = stat?.eating || 0
                const notEat = stat?.not_eating || 0
                const statusLabel = emp.status === 'paused' ? ' | ⏸️ TẠM DỪNG' : emp.status === 'resigned' ? ' | 🚫 ĐÃ NGHỈ VIỆC' : ''
                return `- ${emp.full_name || 'N/A'} | Mã: ${emp.employee_code || 'N/A'} | PB: ${emp.department || '?'} | Ca: ${shiftName} | Nhóm: ${groupName} | Vai trò: ${emp.role} | Trạng thái: ${emp.status || 'active'} | Ăn: ${eatCount}, Nghỉ: ${notEat}${statusLabel}${emp.is_active === false ? ' | ⚠️ VÔ HIỆU' : ''}`
            }).join('\n')
            : buildSummarizedEmployees(allNonKitchenEmployees, pausedEmployees, resignedEmployees, employeeMap, employeeStats)}

### Thông báo nội bộ (${announcements?.length || 0})
${announcements && announcements.length > 0
            ? announcements.map(a => `- [${a.priority?.toUpperCase() || 'NORMAL'}] ${a.title || '(Không tiêu đề)'}: ${(a.content || '').substring(0, 100)}${a.active ? '' : ' (ĐÃ TẮT)'}${a.start_date ? ` (${a.start_date} → ${a.end_date || '∞'})` : ''}`).join('\n')
            : 'Không có thông báo'}

### Thông báo khẩn (${urgentNotifs?.length || 0})
${urgentNotifs && urgentNotifs.length > 0
            ? urgentNotifs.map(n => `- ${n.title}: ${(n.message || '').substring(0, 100)} | Đối tượng: ${n.target_audience || 'all'}${n.is_active ? '' : ' (ĐÃ TẮT)'} | ${new Date(n.created_at).toLocaleDateString('vi-VN')}`).join('\n')
            : 'Không có thông báo khẩn'}

### Hoạt động gần đây (20 gần nhất)
${activitySummary}
${knowledgeDocs && knowledgeDocs.length > 0 ? `
### 📚 Knowledge Base doanh nghiệp (${knowledgeDocs.length} tài liệu)
${knowledgeDocs.map(doc => `
#### [${doc.category?.toUpperCase() || 'OTHER'}] ${doc.title}
${doc.content.substring(0, 3000)}${doc.content.length > 3000 ? '\n... (đã cắt bớt)' : ''}
`).join('\n')}` : ''}
`

    return ctx
}

// ===== HELPER: Build summarized employees (>50 NV) =====
function buildSummarizedEmployees(
    allEmployees: any[],
    pausedEmployees: any[],
    resignedEmployees: any[],
    employeeMap: Map<string, any>,
    employeeStats: Record<string, EmployeeStat>,
): string {
    const deptDetail: Record<string, { active: number; paused: number; resigned: number }> = {}
    allEmployees.forEach(emp => {
        const dept = emp.department || 'Chưa phân phòng'
        if (!deptDetail[dept]) deptDetail[dept] = { active: 0, paused: 0, resigned: 0 }
        if (emp.status === 'paused') deptDetail[dept].paused++
        else if (emp.status === 'resigned') deptDetail[dept].resigned++
        else deptDetail[dept].active++
    })
    const deptLines = Object.entries(deptDetail)
        .sort(([, a], [, b]) => (b.active + b.paused + b.resigned) - (a.active + a.paused + a.resigned))
        .map(([dept, d]) => `- ${dept}: ${d.active} active, ${d.paused} paused, ${d.resigned} resigned (tổng ${d.active + d.paused + d.resigned})`)
        .join('\n')

    const notable: { name: string; reason: string }[] = []
    pausedEmployees.forEach(e => notable.push({ name: e.full_name || 'N/A', reason: `⏸️ Tạm dừng | PB: ${e.department || '?'}` }))
    resignedEmployees.forEach(e => notable.push({ name: e.full_name || 'N/A', reason: `🚫 Nghỉ việc | PB: ${e.department || '?'}` }))

    const remaining = 20 - notable.length
    if (remaining > 0) {
        const topCancelIds = Object.entries(employeeStats)
            .sort(([, a], [, b]) => b.not_eating - a.not_eating)
            .slice(0, remaining)
        topCancelIds.forEach(([uid, stat]) => {
            const emp = employeeMap.get(uid)
            if (emp && !notable.find(n => n.name === emp.name)) {
                const total = stat.eating + stat.not_eating
                const rate = total > 0 ? ((stat.not_eating / total) * 100).toFixed(0) : '0'
                notable.push({ name: emp.name, reason: `📊 Nghỉ ${stat.not_eating}/${total} (${rate}%) | PB: ${emp.dept}` })
            }
        })
    }
    const notableLines = notable.slice(0, 20).map((n, i) => `${i + 1}. ${n.name} — ${n.reason}`).join('\n')

    return `#### Theo phòng ban\n${deptLines}\n\n#### Top ${Math.min(notable.length, 20)} NV cần lưu ý\n${notableLines || 'Không có NV đặc biệt'}`
}
