import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveApiKey } from '@/lib/ai-chat/embeddings'
import { withTimeout, TimeoutError } from '@/lib/ai-chat/timeout'

export async function POST(request: Request) {
    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json(
            { error: 'Chưa đăng nhập' },
            { status: 401 }
        )
    }

    // Role check
    const { data: userData } = await supabase
        .from('users')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single()

    if (!userData || !['admin', 'manager', 'hr'].includes(userData.role)) {
        return NextResponse.json(
            { error: 'Cần quyền Admin/Manager' },
            { status: 403 }
        )
    }

    // Resolve API key: tenant key → global env fallback
    const { data: tenantKeyConfig } = await supabase
        .from('tenant_ai_config')
        .select('gemini_api_key')
        .eq('tenant_id', userData.tenant_id)
        .single()

    let resolvedKey: string
    try {
        resolvedKey = resolveApiKey(tenantKeyConfig?.gemini_api_key)
    } catch {
        return NextResponse.json(
            { error: 'GEMINI_API_KEY chưa được cấu hình. Vào Cài đặt AI → nhập API key.' },
            { status: 500 }
        )
    }

    try {
        // ⚠️ Rate limit: 10 req/phút per user
        const rateLimited = await checkRateLimit(`ai_analyze:${user.id}`, 10, 60_000)
        if (rateLimited) {
            return NextResponse.json(
                { error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${rateLimited.retryAfterSeconds} giây.` },
                { status: 429 }
            )
        }

        const { type } = await request.json()

        if (!['waste', 'menu', 'monthly_report'].includes(type)) {
            return NextResponse.json(
                { error: 'type phải là: waste, menu, hoặc monthly_report' },
                { status: 400 }
            )
        }

        // ===== AGGREGATE DATA FROM DATABASE =====
        const tenantId = userData.tenant_id

        // ===== Feature Flag Gate: Check if tenant has AI Reports access =====
        // Logic: feature_flags override (từ platform admin) > plan defaults
        const [{ data: tenantFlags }, { data: aiConfig }] = await Promise.all([
            supabase
                .from('tenants').select('feature_flags, plan')
                .eq('id', tenantId).single(),
            supabase
                .from('tenant_ai_config').select('meal_price, extra_cost_per_meal, monthly_fixed_cost, vendor_name, budget_monthly, ai_model')
                .eq('tenant_id', tenantId).single(),
        ])

        const flags = tenantFlags?.feature_flags as Record<string, any> | null
        // Nếu platform admin đã set ai_reports (true/false) → dùng giá trị đó
        // Nếu chưa set → fallback theo plan (pro/enterprise = true, còn lại = false)
        const hasAiReports = flags?.ai_reports !== undefined
            ? flags.ai_reports === true
            : ['pro', 'enterprise'].includes(tenantFlags?.plan || '')

        if (!hasAiReports) {
            return NextResponse.json({
                error: 'Tính năng AI Báo cáo chưa được kích hoạt cho doanh nghiệp của bạn. Vui lòng liên hệ quản trị viên hoặc nâng cấp gói dịch vụ.',
                upgrade_required: true
            }, { status: 403 })
        }

        // Get total active employees (exclude kitchen)
        // ⚠️ FIX: Dùng VN timezone thay vì UTC — tránh sai ngày lúc 0h-7h sáng
        const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
        const today = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`
        const { count: totalEmployees } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .not('role', 'ilike', 'kitchen')
            .or(`start_date.lte.${today},start_date.is.null`) // ⚠️ START_DATE filter

        // Get orders for last 30 days
        const thirtyDaysAgo = new Date(nowVN)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const startDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`

        // ⚠️ SCALABILITY-FIX: Paginated fetch — 3K NV × 30 days = 66K rows
        const orders = await fetchAll<{ date: string; status: string; user_id: string; created_at: string }>((from, to) =>
            supabase
                .from('orders')
                .select('date, status, user_id, created_at')
                .eq('tenant_id', tenantId)
                .gte('date', startDate)
                .lte('date', today)
                .range(from, to)
        );

        // Aggregate by date
        const dailyStats: Record<string, { eating: number; not_eating: number; dayOfWeek: string }> = {}
        const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

        orders.forEach(order => {
            if (!dailyStats[order.date]) {
                const d = new Date(order.date + 'T00:00:00')
                dailyStats[order.date] = {
                    eating: 0,
                    not_eating: 0,
                    dayOfWeek: dayNames[d.getDay()]
                }
            }
            if (order.status === 'not_eating') {
                dailyStats[order.date].not_eating++
            } else {
                dailyStats[order.date].eating++
            }
        })

        // Aggregate by day of week
        const weekdayStats: Record<string, { total_eating: number; total_not_eating: number; days_count: number }> = {}
        Object.values(dailyStats).forEach(stat => {
            if (!weekdayStats[stat.dayOfWeek]) {
                weekdayStats[stat.dayOfWeek] = { total_eating: 0, total_not_eating: 0, days_count: 0 }
            }
            weekdayStats[stat.dayOfWeek].total_eating += stat.eating
            weekdayStats[stat.dayOfWeek].total_not_eating += stat.not_eating
            weekdayStats[stat.dayOfWeek].days_count++
        })

        // Summary stats
        const totalOrders = orders.length || 0
        const totalNotEating = orders.filter(o => o.status === 'not_eating').length || 0
        const totalEating = totalOrders - totalNotEating
        const cancelRate = totalOrders > 0 ? ((totalNotEating / totalOrders) * 100).toFixed(1) : '0'

        // Get previous month data for comparison
        const sixtyDaysAgo = new Date(nowVN)
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
        const prevStartDate = `${sixtyDaysAgo.getFullYear()}-${String(sixtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sixtyDaysAgo.getDate()).padStart(2, '0')}`

        // ⚠️ SCALABILITY-FIX: Paginated fetch
        const prevOrders = await fetchAll<{ date: string; status: string }>((from, to) =>
            supabase
                .from('orders')
                .select('date, status')
                .eq('tenant_id', tenantId)
                .gte('date', prevStartDate)
                .lt('date', startDate)
                .range(from, to)
        );

        const prevNotEating = prevOrders.filter(o => o.status === 'not_eating').length || 0
        const prevTotal = prevOrders.length || 0
        const prevCancelRate = prevTotal > 0 ? ((prevNotEating / prevTotal) * 100).toFixed(1) : '0'

        // ===== BUILD PROMPT FOR GEMINI =====
        const dataContext = `
## Dữ liệu hệ thống quản lý suất ăn doanh nghiệp

### Thông tin chung
- Tổng nhân viên: ${totalEmployees || 0}
- Khoảng thời gian phân tích: ${startDate} đến ${today} (30 ngày gần nhất)
- Tổng lượt đăng ký ăn: ${totalEating}
- Tổng lượt báo nghỉ (cancel): ${totalNotEating}
- Tỷ lệ hủy trung bình: ${cancelRate}%
- Tỷ lệ hủy tháng trước: ${prevCancelRate}%
- Chi phí mỗi suất: ${((aiConfig?.meal_price || 25000) + (aiConfig?.extra_cost_per_meal || 0)).toLocaleString('vi-VN')} VND (giá suất ${(aiConfig?.meal_price || 25000).toLocaleString('vi-VN')} + phụ phí ${(aiConfig?.extra_cost_per_meal || 0).toLocaleString('vi-VN')})
- Chi phí cố định/tháng: ${(aiConfig?.monthly_fixed_cost || 0).toLocaleString('vi-VN')} VND
${aiConfig?.vendor_name ? `- Nhà cung cấp: ${aiConfig.vendor_name}` : ''}
${(aiConfig?.budget_monthly || 0) > 0 ? `- Ngân sách tháng: ${(aiConfig?.budget_monthly || 0).toLocaleString('vi-VN')} VND` : ''}
- **Tổng chi phí 30 ngày: ${(totalEating * ((aiConfig?.meal_price || 25000) + (aiConfig?.extra_cost_per_meal || 0)) + (aiConfig?.monthly_fixed_cost || 0)).toLocaleString('vi-VN')} VND**

### Thống kê theo ngày trong tuần (trung bình)
${Object.entries(weekdayStats).map(([day, s]) => {
            const avgEating = s.days_count > 0 ? Math.round(s.total_eating / s.days_count) : 0
            const avgNotEating = s.days_count > 0 ? Math.round(s.total_not_eating / s.days_count) : 0
            const rate = (avgEating + avgNotEating) > 0 ? ((avgNotEating / (avgEating + avgNotEating)) * 100).toFixed(1) : '0'
            return `- ${day}: TB ăn ${avgEating}, TB nghỉ ${avgNotEating}, tỷ lệ hủy ${rate}%`
        }).join('\n')}

### Chi tiết theo ngày (5 ngày gần nhất)
${Object.entries(dailyStats)
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 5)
                .map(([date, s]) => `- ${date} (${s.dayOfWeek}): ăn ${s.eating}, nghỉ ${s.not_eating}`)
                .join('\n')}
`

        let prompt = ''

        switch (type) {
            case 'waste':
                prompt = `${dataContext}

## Yêu cầu
Bạn là chuyên gia phân tích dữ liệu suất ăn doanh nghiệp. Hãy phân tích dữ liệu trên và viết báo cáo **phân tích lãng phí suất ăn** bằng tiếng Việt gồm:

1. **Tổng quan tình hình** - Đánh giá tỷ lệ lãng phí hiện tại, so sánh với tháng trước
2. **Pattern theo ngày** - Ngày nào cancel nhiều nhất? Ngày nào ổn định?
3. **Anomaly** - Có bất thường gì đáng chú ý không?
4. **Đề xuất cụ thể** - 3-5 giải pháp giảm lãng phí kèm ước tính tiết kiệm (VND)
5. **Kết luận** - Đánh giá tổng thể và dự báo xu hướng

Viết ngắn gọn, chuyên nghiệp, dùng emoji phù hợp. Dùng markdown.`
                break

            case 'menu':
                prompt = `${dataContext}

## Yêu cầu
Bạn là chuyên gia dinh dưỡng và quản lý bếp ăn doanh nghiệp. Dựa trên dữ liệu đăng ký ăn, hãy viết **gợi ý menu và cải thiện** bằng tiếng Việt gồm:

1. **Phân tích pattern** - Ngày nào ít người ăn? Có thể do menu không hấp dẫn?
2. **Gợi ý menu tuần tới** - Gợi ý thực đơn 5 ngày (T2-T6) với:
   - Món chính (1-2 món)
   - Món phụ (canh, rau)
   - Ước tính nguyên liệu dựa trên số lượng nhân viên
3. **Tips tăng đăng ký ăn** - 3 cách để nhiều người đăng ký hơn
4. **Tiết kiệm nguyên liệu** - Gợi ý giảm lãng phí thực phẩm

Viết ngắn gọn, thực tế, phù hợp văn hóa Việt Nam. Dùng markdown, emoji.`
                break

            case 'monthly_report':
                prompt = `${dataContext}

## Yêu cầu
Bạn là trợ lý AI cho giám đốc doanh nghiệp. Hãy viết **báo cáo suất ăn tháng** chuyên nghiệp bằng tiếng Việt, phù hợp để gửi cho sếp/CEO, gồm:

1. **TÓM TẮT ĐIỀU HÀNH** (Executive Summary)
   - 3-4 bullet points chính quan trọng nhất
   - Con số nổi bật
   
2. **SỐ LIỆU CHI TIẾT**
   - Bảng tổng hợp: tổng suất, tỷ lệ đăng ký, tỷ lệ hủy
   - So sánh vs tháng trước (% tăng/giảm)
   - Chi phí ước tính và tiết kiệm
   
3. **PHÂN TÍCH XU HƯỚNG**
   - Trend theo tuần
   - Ngày cao điểm / thấp điểm
   
4. **RỦI RO & CẢNH BÁO**
   - Có vấn đề nào cần xử lý?
   
5. **ĐỀ XUẤT HÀNH ĐỘNG**
   - 2-3 đề xuất cụ thể, khả thi
   
6. **DỰ BÁO THÁNG TỚI**
   - Ước tính số suất, chi phí

Format: Chuyên nghiệp, có số liệu cụ thể, dùng bảng markdown, emoji phù hợp. Ngắn gọn dưới 500 từ.`
                break
        }

        // ===== CALL GEMINI API =====
        // ⚠️ AUDIT-FIX: Dùng ai_model từ tenant_ai_config, fallback gemini-3-flash-preview
        const selectedModel = aiConfig?.ai_model || 'gemini-3-flash-preview'
        const ai = new GoogleGenAI({ apiKey: resolvedKey })
        
        let text = ''
        try {
            // ⚠️ AUDIT-FIX S1-C: Timeout 28s — trước khi Vercel kill 30s
            const result = await withTimeout(
                ai.models.generateContent({
                    model: selectedModel,
                    contents: prompt
                }),
                28_000,
                'AI đang bận, vui lòng thử lại sau 30 giây.'
            )
            text = result.text || ''
        } catch (error: any) {
            console.error('[AI Analyze] Primary model failed:', error)
            if (error instanceof TimeoutError) {
                return NextResponse.json({ error: error.message }, { status: 504 })
            }
            if (error?.status === 503 || error?.message?.includes('503')) {
                console.log('[AI Analyze] 503 detected, falling back to gemini-2.5-flash')
                const fallbackModelName = 'gemini-2.5-flash'
                const fallbackResult = await withTimeout(
                    ai.models.generateContent({
                        model: fallbackModelName,
                        contents: prompt
                    }),
                    25_000,
                    'Cả 2 mô hình AI đang bận, vui lòng thử lại sau 1 phút.'
                )
                text = fallbackResult.text || ''
                text += `\n\n> ⚠️ **Tự động chuyển đổi mô hình:** Mô hình phân tích chính (${selectedModel}) hiện đang quá tải từ phía Google (Lỗi 503). Cơm Ngon AI đã dùng mô hình dự phòng (${fallbackModelName}) để hoàn tất báo cáo.`
            } else {
                throw error
            }
        }

        // ✅ Log AI usage vào activity_logs
        try {
            await supabase.from('activity_logs').insert({
                tenant_id: tenantId,
                performed_by: user.id,
                action: 'AI_ANALYZE',
                details: { type, date_range: `${startDate} → ${today}`, total_employees: totalEmployees || 0, total_eating: totalEating, cancel_rate: cancelRate },
            })
        } catch (logErr) {
            console.warn('Failed to log AI analyze:', logErr)
        }

        return NextResponse.json({
            content: text,
            type,
            generated_at: new Date().toISOString(),
            data_summary: {
                total_employees: totalEmployees || 0,
                total_eating: totalEating,
                total_not_eating: totalNotEating,
                cancel_rate: cancelRate,
                date_range: `${startDate} → ${today}`
            }
        })

    } catch (error: any) {
        console.error('AI Analyze error:', error)
        return NextResponse.json(
            { error: error.message || 'Lỗi khi phân tích AI' },
            { status: 500 }
        )
    }
}
