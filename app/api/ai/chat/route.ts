/* AI_NAVIGATION_MAP_START */
/**
 * 🗺️ BẢN ĐỒ ĐỊNH VỊ CHO AI (AI NAVIGATION MAP)
 * 💡 Hướng dẫn định vị: AI Agent đọc bản đồ này để hiểu cấu trúc router và xử lý của chat API.
 * 
 * Tầng 1: Cổng vào, Xác thực & Phân quyền (Auth & Session Layer)
 *   - Hàm POST handler chính (Router & Auth Gate) -> Dòng 51
 *   - Xử lý các hành động quản lý Chat Session -> Dòng 175
 * 
 * Tầng 2: Xác nhận & Hủy bỏ Hành động (Human-in-the-loop Gate)
 *   - Xử lý xác nhận thực thi Hành động (confirm_action) -> Dòng 183
 *   - Xử lý hủy bỏ Hành động (cancel_action) -> Dòng 554
 * 
 * Tầng 3: Xử lý Hội thoại chính & Tích hợp LLM (Orchestrator & Gemini Flow)
 *   - Xử lý yêu cầu Chat chính (action: chat) -> Dòng 642
 *   - Khai báo các Gemini Tool Declarations (14 AI Tools) -> Dòng 929
 *   - Khởi tạo Gemini Chat Instance & System Instruction -> Dòng 1309
 * 
 * Tầng 4: Xử lý Tool Calling (Action Worker Dispatcher)
 *   - Xử lý Tool Calling (Function Calling) & RBAC Phân quyền -> Dòng 1388
 *   - Chi tiết các tool cases:
 *     + Tool case: modify_employee_meal (Đăng ký/Hủy cơm NV) -> Dòng 206
 *     + Tool case: create_new_employee (Tạo nhân viên mới) -> Dòng 240
 *     + Tool case: change_employee_status (Đổi trạng thái NV) -> Dòng 257
 *     + Tool case: schedule_employee_resignation (Lịch nghỉ việc NV) -> Dòng 287
 *     + Tool case: send_emergency_announcement (Gửi thông báo khân) -> Dòng 324
 *     + Tool case: set_cooking_exception (Thiết lập ngoại lệ bếp) -> Dòng 334
 *     + Tool case: delete_cooking_exception (Xóa ngoại lệ bếp) -> Dòng 349
 *     + Tool case: update_registration_deadline (Hạn chốt cơm) -> Dòng 359
 *     + Tool case: add_guest_meals (Thêm suất cơm khách) -> Dòng 378
 *     + Tool case: delete_guest_meals (Xóa suất cơm khách) -> Dòng 392
 *     + Tool case: update_ai_config (Cấu hình AI & chi phí) -> Dòng 412
 *     + Tool case: create_new_shift (Tạo ca ăn mới) -> Dòng 421
 *     + Tool case: create_new_group (Tạo nhóm ăn mới) -> Dòng 434
 *     + Tool case: delete_employee (Xóa nhân viên) -> Dòng 449
 * 
 * Tầng 5: Kiểm định Chất lượng & Chống Ảo giác (CRAG Quality Gate)
 *   - CRAG Validation (Đánh giá chống ảo giác & Cảnh báo) -> Dòng 3376
 * 
 * 🚨 BẮT BUỘC: Khi chỉnh sửa logic hoặc cấu trúc file route.ts làm xê dịch dòng,
 * bạn phải chạy lại công cụ cập nhật bản đồ này để đồng bộ hóa tọa độ dòng chính xác!
 */
/* AI_NAVIGATION_MAP_END */






import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { checkRateLimit } from '@/lib/rate-limit'

// ===== REFACTORED: Helpers tách ra module riêng =====
import { SYSTEM_PROMPT, SUMMARIZE_PROMPT, MAX_MESSAGES_BEFORE_SUMMARY, RECENT_MESSAGES_TO_KEEP } from '@/lib/ai-chat/prompts'
import { handleListSessions, handleCreateSession, handleDeleteSession, handleRenameSession, handleLoadHistory, handleClearHistory } from '@/lib/ai-chat/sessions'
import { fetchAllTenantData } from '@/lib/ai-chat/data-queries'
import { getSSOTMealStats } from '@/lib/ai-chat/stats'
import { calculateDateRangeStats } from '@/lib/report-calculator'
import { buildDataContext } from '@/lib/ai-chat/context-builder'
// ===== RAG: Hybrid Search =====
import { retrieveContext, buildRAGContext, hasIndexedData } from '@/lib/ai-chat/rag-retriever'
// ===== GraphRAG: Knowledge Graph Search =====
import { classifyQuery } from '@/lib/ai-chat/query-classifier'
import { graphSearch, buildGraphContext, hasKnowledgeGraph } from '@/lib/ai-chat/graph-search'
// ===== CRAG: Corrective RAG Validator =====
import { validateResponse, getCRAGWarning } from '@/lib/ai-chat/crag-validator'
import { resolveApiKey } from '@/lib/ai-chat/embeddings'
import { withTimeout, TimeoutError } from '@/lib/ai-chat/timeout'
import { chatLogger, ChildLogger } from '@/lib/logger'
import { 
    generateConfirmationToken, 
    verifyConfirmationToken, 
    resolveEmployee, 
    executeModifyMeal,
    executeCreateEmployee,
    executeChangeEmployeeStatus,
    executeScheduleResignation,
    executeSendAnnouncement,
    executeSetCookingException,
    executeDeleteCookingException,
    executeUpdateDeadline,
    executeAddGuestMeals,
    executeDeleteGuestMeals,
    executeUpdateAiConfig,
    executeCreateShift,
    executeCreateGroup,
    executeDeleteEmployee
} from '@/lib/ai-chat/action-executor'

function parseGeminiError(error: any): string {
    const errMsg = String(error?.message || error || '').toLowerCase();
    const status = error?.status;

    if (status === 429 || errMsg.includes('resource_exhausted') || errMsg.includes('quota exceeded') || errMsg.includes('rate limit')) {
        return '✕ **Giới hạn cuộc gọi vượt quá mức cho phép:** Tài khoản AI hiện tại đã hết lượt gọi giới hạn (Rate Limit/Quota) từ Google. Anh vui lòng liên hệ Admin để nâng cấp hạn mức API Key hoặc thử lại sau ít phút nhé.';
    }
    if (status === 503 || errMsg.includes('unavailable') || errMsg.includes('currently experiencing high demand') || errMsg.includes('overloaded')) {
        return '⏳ **Dịch vụ AI đang tạm thời quá tải:** Google Gemini đang có lượng truy cập cao bất thường. Đây là tình trạng tạm thời, anh vui lòng thử lại sau 30 giây - 1 phút nhé.';
    }
    if (status === 400 && (errMsg.includes('key_invalid') || errMsg.includes('key not valid') || errMsg.includes('api key'))) {
        return '✕ **Mã khóa kết nối không hợp lệ:** Khóa API Key của Google Gemini được cấu hình trong hệ thống hiện không chính xác hoặc đã bị vô hiệu hóa. Anh vui lòng kiểm tra lại cấu hình API Key trong mục Cài đặt AI.';
    }
    if (status === 403) {
        return '✕ **Truy cập bị từ chối:** Dịch vụ AI của Google từ chối quyền truy cập của API Key hiện tại. Vui lòng kiểm tra lại quyền hạn của khóa trong Google Cloud Console.';
    }
    return '';
}

/** Helper: delay ms */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
    const reqId = ChildLogger.genReqId()
    const t0 = Date.now()
    const supabase = await createClient()
    
    let user: any = null
    let userData: any = null
    let userPromptText = ''

    // Hỗ trợ bypass auth trong môi trường development để chạy integration test
    const bypassUserId = request.headers.get('x-bypass-auth')
    if (process.env.NODE_ENV === 'development' && bypassUserId) {
        const { data: mockUser } = await supabase.from('users')
            .select('id, role, tenant_id, full_name, email, employee_code, status, is_active')
            .eq('id', bypassUserId)
            .single()
        if (mockUser) {
            user = { id: bypassUserId, email: mockUser.email }
            userData = mockUser
        }
    }

    if (!user || !userData) {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !authUser) {
            return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
        }
        user = authUser
        const { data: dbUser } = await supabase
            .from('users')
            .select('id, role, tenant_id, full_name, email, employee_code, status, is_active')
            .eq('id', user.id)
            .single()
        userData = dbUser
    }

    if (!userData || !['admin', 'manager', 'hr'].includes(userData.role)) {
        return NextResponse.json({ error: 'Cần quyền Admin/Manager' }, { status: 403 })
    }

    if (userData.status === 'resigned' || userData.is_active === false) {
        return NextResponse.json({ error: 'Tài khoản của bạn đã bị vô hiệu hóa hoặc đã nghỉ việc.' }, { status: 403 })
    }

    const tenantId = userData.tenant_id
    const log = chatLogger.child({ reqId, tenantId, userId: user.id })

    const logAudit = async (params: {
        session_id: string
        intent: string
        model: string
        tokensIn: number
        tokensOut: number
        permission: 'authorized' | 'denied'
        status: 'success' | 'failed' | 'pending_approval'
        errorMsg?: string
        calls?: any[]
        crag?: any
    }) => {
        try {
            let cost = 0.0
            if (params.model.includes('pro')) {
                cost = (params.tokensIn * 1.25 + params.tokensOut * 5.00) / 1_000_000
            } else {
                cost = (params.tokensIn * 0.075 + params.tokensOut * 0.30) / 1_000_000
            }
            const latency = Date.now() - t0
            const { createAdminClient: createAdm } = await import('@/lib/supabase/admin')
            const adminDb = createAdm()
            
            const toolsCalledPayload: any = {
                permission: params.permission,
                transaction_status: params.status,
                calls: params.calls || []
            }
            if (params.crag) {
                toolsCalledPayload.crag = params.crag
            }

            const { error: insertErr } = await adminDb.from('ai_audit_logs').insert({
                tenant_id: tenantId,
                user_id: user.id,
                session_id: params.session_id,
                intent_routed: params.intent,
                model_used: params.model,
                input_tokens: params.tokensIn,
                output_tokens: params.tokensOut,
                estimated_cost_usd: cost,
                latency_ms: latency,
                error_message: params.errorMsg || null,
                tools_called: toolsCalledPayload,
                user_input: userPromptText || null
            })
            if (insertErr) {
                log.error('Supabase audit log insert error', { error: insertErr })
            }
        } catch (auditErr) {
            log.warn('Failed to insert audit log helper', { error: String(auditErr) })
        }
    }

    // ===== Feature Flag Gate =====
    const { data: tenantFlags } = await supabase
        .from('tenants').select('feature_flags, plan')
        .eq('id', tenantId).single()

    const flags = tenantFlags?.feature_flags as Record<string, any> | null
    const hasAiChat = flags?.ai_chat !== undefined
        ? flags.ai_chat === true
        : ['pro', 'enterprise'].includes(tenantFlags?.plan || '')

    if (!hasAiChat) {
        return NextResponse.json({
            error: 'Tính năng AI Chat chưa được kích hoạt cho doanh nghiệp của bạn. Vui lòng liên hệ quản trị viên hoặc nâng cấp gói dịch vụ.',
            upgrade_required: true
        }, { status: 403 })
    }

    let cragInfo: any = null
    try {
        const body = await request.json()
        const { action } = body
        log.info('Chat request received', { action })
        const t1 = Date.now()

        // Thiết lập câu lệnh người dùng để log audit
        if (body.message) {
            userPromptText = body.message
        } else if (action === 'confirm_action') {
            userPromptText = '[Duyệt] Xác nhận hành động'
        } else if (action === 'cancel_action') {
            userPromptText = '[Hủy] Hủy bỏ hành động'
        } else if (action) {
            userPromptText = `[Hành động: ${action}]`
        }

        // ===== SESSION ACTIONS (delegated to sessions.ts) =====
        if (action === 'list_sessions') return handleListSessions(supabase, user.id, tenantId)
        if (action === 'create_session') return handleCreateSession(supabase, user.id, tenantId, body.title)
        if (action === 'delete_session') return handleDeleteSession(supabase, user.id, body.session_id)
        if (action === 'rename_session') return handleRenameSession(supabase, user.id, body.session_id, body.title)
        if (action === 'load_history') return handleLoadHistory(supabase, user.id, body.session_id || 'default')
        if (action === 'clear_history') return handleClearHistory(supabase, user.id, body.session_id || 'default')

        // ===== ACTION: CONFIRM/CANCEL ACTION =====
        if (action === 'confirm_action') {
            const { confirmation_token, form_values, session_id } = body
            const sessId = session_id || 'default'
            
            try {
                const payload = verifyConfirmationToken(confirmation_token, user.id, tenantId)
                
                // Chống double submit: kiểm tra xem token đã được xử lý hay chưa
                const { data: existingChat } = await supabase
                    .from('ai_chat_history')
                    .select('action_resolved')
                    .eq('user_id', user.id)
                    .eq('confirmation_token', confirmation_token)
                    .maybeSingle()

                if (existingChat && existingChat.action_resolved) {
                    return NextResponse.json({ error: 'Yêu cầu này đã được thực hiện hoặc hủy bỏ trước đó.' }, { status: 400 })
                }
                
                let execResult: any
                let replyText = ''

                switch (payload.action) {
                    case 'modify_employee_meal':
                    case 'modify_employee_meal_form': {
                        let employeeId = payload.args.employee_id || ''
                        let dateStr = payload.args.date || ''
                        let register = payload.args.register
                        const reason = payload.args.reason || ''
                        
                        if (payload.action === 'modify_employee_meal_form' || form_values) {
                            if (form_values?.employee_id) {
                                employeeId = form_values.employee_id
                            } else if (payload.action === 'modify_employee_meal_form') {
                                return NextResponse.json({ error: 'Vui lòng chọn nhân viên.' }, { status: 400 })
                            }
                            if (form_values?.date) dateStr = form_values.date
                            if (form_values?.register !== undefined) {
                                register = form_values.register === 'true' || form_values.register === true
                            }
                        }
                        
                        if (!employeeId) {
                            return NextResponse.json({ error: 'Thiếu thông tin ID nhân viên thực hiện.' }, { status: 400 })
                        }
                        
                        execResult = await executeModifyMeal(
                            supabase,
                            tenantId,
                            employeeId,
                            dateStr,
                            register ?? false,
                            reason,
                            userData
                        )
                        replyText = `✅ **Đã thực hiện thành công:** Suất ăn của nhân viên **${execResult.employeeName}** vào ngày **${execResult.formattedDates}** đã được chuyển sang trạng thái **${execResult.statusStr}**.\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'create_new_employee': {
                        execResult = await executeCreateEmployee(
                            tenantId,
                            {
                                email: payload.args.email || '',
                                fullName: payload.args.fullName || '',
                                employeeCode: payload.args.employeeCode,
                                department: payload.args.department,
                                shift_id: payload.args.shift_id,
                                group_id: payload.args.group_id,
                                startDate: payload.args.startDate
                            },
                            userData
                        )
                        replyText = `✅ **Đã tạo nhân viên mới thành công:**\n- **Họ tên:** ${execResult.fullName}\n- **Email:** ${execResult.email}\n- **Mã nhân viên:** ${execResult.employeeCode}\n- **Mật khẩu mặc định:** \`${execResult.defaultPassword}\`\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'change_employee_status':
                    case 'change_employee_status_form': {
                        let employeeId = payload.args.employee_id || ''
                        let newStatus = payload.args.new_status as any
                        let reason = payload.args.reason || ''

                        if (payload.action === 'change_employee_status_form') {
                            if (!form_values?.employee_id) {
                                return NextResponse.json({ error: 'Vui lòng chọn nhân viên.' }, { status: 400 })
                            }
                            employeeId = form_values.employee_id
                            if (form_values.new_status) newStatus = form_values.new_status
                            if (form_values.reason) reason = form_values.reason
                        }

                        if (!employeeId) {
                            return NextResponse.json({ error: 'Thiếu thông tin ID nhân viên.' }, { status: 400 })
                        }

                        execResult = await executeChangeEmployeeStatus(
                            tenantId,
                            employeeId,
                            newStatus,
                            reason,
                            userData
                        )
                        const statusMap: Record<string, string> = { active: 'Hoạt động', paused: 'Tạm dừng', resigned: 'Đã nghỉ việc' }
                        replyText = `✅ **Đã thay đổi trạng thái nhân viên thành công:**\n- **Nhân viên:** ${execResult.employeeName}\n- **Trạng thái cũ:** ${statusMap[execResult.oldStatus] || execResult.oldStatus}\n- **Trạng thái mới:** ${statusMap[execResult.newStatus] || execResult.newStatus}\n- **Số suất ăn tương lai bị hủy:** ${execResult.cancelledOrdersCount}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'schedule_employee_resignation':
                    case 'schedule_employee_resignation_form': {
                        let employeeId = payload.args.employee_id || ''
                        let actionType = payload.args.action_type as any
                        let resignedDate = payload.args.resigned_date
                        let reason = payload.args.reason || ''

                        if (payload.action === 'schedule_employee_resignation_form') {
                            if (!form_values?.employee_id) {
                                return NextResponse.json({ error: 'Vui lòng chọn nhân viên.' }, { status: 400 })
                            }
                            employeeId = form_values.employee_id
                            if (form_values.action_type) actionType = form_values.action_type
                            if (form_values.resigned_date) resignedDate = form_values.resigned_date
                            if (form_values.reason) reason = form_values.reason
                        }

                        if (!employeeId) {
                            return NextResponse.json({ error: 'Thiếu thông tin ID nhân viên.' }, { status: 400 })
                        }

                        execResult = await executeScheduleResignation(
                            tenantId,
                            employeeId,
                            actionType,
                            resignedDate || null,
                            reason,
                            userData
                        )

                        if (execResult.actionType === 'schedule') {
                            replyText = `✅ **Đã lên lịch nghỉ việc thành công:**\n- **Nhân viên:** ${execResult.employeeName}\n- **Ngày áp dụng nghỉ việc:** ${execResult.resignedDate}\n- **Số suất ăn bị hủy tự động:** ${execResult.cancelledOrdersCount}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        } else {
                            replyText = `✅ **Đã hủy lịch nghỉ việc thành công:**\n- **Nhân viên:** ${execResult.employeeName}\n- **Ngày nghỉ việc cũ đã hủy:** ${execResult.oldResignedDate}\n- **Số suất ăn đã khôi phục:** ${execResult.restoredOrdersCount}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        }
                        break
                    }
                    case 'send_emergency_announcement': {
                        const content = payload.args.content || ''
                        execResult = await executeSendAnnouncement(
                            tenantId,
                            content,
                            userData
                        )
                        replyText = `✅ **Đã gửi thông báo khẩn cấp thành công:**\n- **Tiêu đề:** ${execResult.title}\n- **Nội dung:** "${execResult.content}"\n- **Đã gửi qua Web Push:** ${execResult.pushSentCount}/${execResult.pushTotalCount} thiết bị.\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'set_cooking_exception': {
                        const date = payload.args.date || ''
                        const exceptionType = payload.args.exception_type as any
                        const reason = payload.args.reason || ''
                        execResult = await executeSetCookingException(
                            tenantId,
                            date,
                            exceptionType,
                            reason,
                            userData
                        )
                        const typeStr = execResult.exceptionType === 'no_cook' ? 'Nghỉ bếp (không nấu cơm)' : 'Nấu bù/Nấu thêm'
                        replyText = `✅ **Đã thiết lập ngày ngoại lệ nấu ăn thành công:**\n- **Ngày:** ${execResult.date}\n- **Loại ngoại lệ:** ${typeStr}\n- **Lý do:** ${execResult.reason}\n- **Số suất ăn bị hủy tự động:** ${execResult.cancelledCount}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'delete_cooking_exception': {
                        const date = payload.args.date || ''
                        execResult = await executeDeleteCookingException(
                            tenantId,
                            date,
                            userData
                        )
                        replyText = `✅ **Đã xóa ngày ngoại lệ nấu ăn thành công:**\n- **Ngày:** ${execResult.date}\n- **Số suất ăn được tự động khôi phục:** ${execResult.restoredCount}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'update_registration_deadline': {
                        execResult = await executeUpdateDeadline(
                            tenantId,
                            {
                                deadline_time: payload.args.deadline_time,
                                offset_days: payload.args.offset_days,
                                enabled: payload.args.enabled,
                                allow_late: payload.args.allow_late
                            },
                            userData
                        )
                        const details = []
                        if (execResult.updatedSettings.deadline_time !== undefined) details.push(`Giờ chốt: ${execResult.updatedSettings.deadline_time}`)
                        if (execResult.updatedSettings.offset_days !== undefined) details.push(`Lệch ngày: ${execResult.updatedSettings.offset_days} ngày`)
                        if (execResult.updatedSettings.enabled !== undefined) details.push(`Trạng thái hạn chót: ${execResult.updatedSettings.enabled ? 'Bật' : 'Tắt'}`)
                        if (execResult.updatedSettings.allow_late !== undefined) details.push(`Cho phép đăng ký muộn: ${execResult.updatedSettings.allow_late ? 'Có' : 'Không'}`)
                        replyText = `✅ **Đã cập nhật cấu hình hạn chốt cơm thành công:**\n- **Chi tiết:** ${details.join(', ')}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'add_guest_meals': {
                        let date = payload.args.date || ''
                        let quantity = payload.args.quantity || 0
                        let note = payload.args.note || ''
                        if (form_values) {
                            if (form_values.date) date = form_values.date
                            if (form_values.quantity !== undefined) quantity = parseInt(form_values.quantity, 10) || 0
                            if (form_values.note !== undefined) note = form_values.note
                        }
                        execResult = await executeAddGuestMeals(
                            tenantId,
                            date,
                            quantity,
                            note,
                            userData
                        )
                        replyText = `✅ **Đã đăng ký thêm suất cơm khách phát sinh thành công:**\n- **Ngày:** ${execResult.guestMeal.date}\n- **Số lượng:** ${execResult.guestMeal.quantity} suất\n- **Ghi chú:** ${execResult.guestMeal.note || 'Không có'}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'delete_guest_meals':
                    case 'delete_guest_meals_form': {
                        let guestMealId = payload.args.guest_meal_id || ''
                        if (payload.action === 'delete_guest_meals_form') {
                            if (!form_values?.guest_meal_id) {
                                return NextResponse.json({ error: 'Vui lòng chọn suất cơm khách cần hủy.' }, { status: 400 })
                            }
                            guestMealId = form_values.guest_meal_id
                        }
                        if (!guestMealId) {
                            return NextResponse.json({ error: 'Thiếu thông tin ID suất cơm khách.' }, { status: 400 })
                        }
                        execResult = await executeDeleteGuestMeals(
                            tenantId,
                            guestMealId,
                            userData
                        )
                        replyText = `✅ **Đã hủy/xóa suất cơm khách phát sinh thành công:**\n- **Ngày:** ${execResult.date}\n- **Số lượng đã hủy:** ${execResult.quantity} suất\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'update_ai_config': {
                        execResult = await executeUpdateAiConfig(
                            tenantId,
                            payload.args,
                            userData
                        )
                        replyText = `✅ **Cập nhật cấu hình AI & chi phí thành công:** ${execResult.message}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'create_new_shift': {
                        execResult = await executeCreateShift(
                            tenantId,
                            {
                                name: payload.args.name || '',
                                start_time: payload.args.start_time || '',
                                end_time: payload.args.end_time || ''
                            },
                            userData
                        )
                        replyText = `✅ **Đã tạo ca ăn mới thành công:**\n- **Tên ca:** ${execResult.shift.name}\n- **Thời gian:** ${execResult.shift.start_time} - ${execResult.shift.end_time}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'create_new_group': {
                        execResult = await executeCreateGroup(
                            tenantId,
                            {
                                name: payload.args.name || '',
                                shift_id: payload.args.shift_id,
                                table_area: payload.args.table_area,
                                department: payload.args.department
                            },
                            userData
                        )
                        const shiftInfo = execResult.group.shift ? ` (Ca ăn: ${execResult.group.shift.name})` : ''
                        replyText = `✅ **Đã tạo nhóm ăn mới thành công:**\n- **Tên nhóm:** ${execResult.group.name}${shiftInfo}\n- **Khu vực bàn:** ${execResult.group.table_area || 'Không có'}\n- **Phòng ban:** ${execResult.group.department || 'Không có'}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    case 'delete_employee':
                    case 'delete_employee_form': {
                        let employeeId = payload.args.employee_id || ''
                        if (payload.action === 'delete_employee_form') {
                            if (!form_values?.employee_id) {
                                return NextResponse.json({ error: 'Vui lòng chọn nhân viên cần xóa.' }, { status: 400 })
                            }
                            employeeId = form_values.employee_id
                        }
                        if (!employeeId) {
                            return NextResponse.json({ error: 'Thiếu thông tin ID nhân viên.' }, { status: 400 })
                        }
                        execResult = await executeDeleteEmployee(
                            tenantId,
                            employeeId,
                            userData
                        )
                        replyText = `✅ **Đã xóa hoàn toàn nhân viên khỏi hệ thống thành công:**\n- **Nhân viên:** ${execResult.employeeName}\n- **Email:** ${execResult.employeeEmail}\n\n*(Hành động đã được ghi nhận vào Lịch sử hoạt động của hệ thống)*`
                        break
                    }
                    default:
                        throw new Error(`Hành động "${payload.action}" không được hỗ trợ hoặc chưa cấu hình điều phối.`)
                }
                
                // Đánh dấu bản ghi cũ đã giải quyết để mất nút/form trong DB
                await supabase.from('ai_chat_history')
                    .update({ action_resolved: true, action_pending: false, form_pending: false })
                    .eq('user_id', user.id)
                    .eq('confirmation_token', confirmation_token)

                // Tạo userConfirmMsg động để ghi nhận lịch sử chat của user
                let userConfirmMsg = `[Xác nhận] Đồng ý thực hiện hành động`
                if (payload.action === 'modify_employee_meal_form') {
                    userConfirmMsg = `[Form] Chọn nhân viên ${execResult.employeeName} và xác nhận`
                } else if (payload.action === 'modify_employee_meal') {
                    userConfirmMsg = `[Xác nhận] Thay đổi suất ăn cho ${execResult.employeeName}`
                } else if (payload.action === 'create_new_employee') {
                    userConfirmMsg = `[Xác nhận] Tạo nhân viên mới ${execResult.fullName}`
                } else if (payload.action === 'change_employee_status' || payload.action === 'change_employee_status_form') {
                    userConfirmMsg = `[Xác nhận] Thay đổi trạng thái nhân viên ${execResult.employeeName}`
                } else if (payload.action === 'schedule_employee_resignation' || payload.action === 'schedule_employee_resignation_form') {
                    userConfirmMsg = `[Xác nhận] Lên/Hủy lịch nghỉ việc cho ${execResult.employeeName}`
                } else if (payload.action === 'send_emergency_announcement') {
                    userConfirmMsg = `[Xác nhận] Gửi thông báo khẩn cấp`
                } else if (payload.action === 'set_cooking_exception') {
                    userConfirmMsg = `[Xác nhận] Thiết lập ngày ngoại lệ nấu ăn`
                } else if (payload.action === 'delete_cooking_exception') {
                    userConfirmMsg = `[Xác nhận] Xóa ngày ngoại lệ nấu ăn`
                } else if (payload.action === 'update_registration_deadline') {
                    userConfirmMsg = `[Xác nhận] Cập nhật hạn chốt cơm`
                } else if (payload.action === 'add_guest_meals') {
                    userConfirmMsg = `[Xác nhận] Đăng ký thêm suất cơm khách`
                } else if (payload.action === 'delete_guest_meals' || payload.action === 'delete_guest_meals_form') {
                    userConfirmMsg = `[Xác nhận] Hủy/Xóa suất cơm khách`
                } else if (payload.action === 'update_ai_config') {
                    userConfirmMsg = `[Xác nhận] Cập nhật cấu hình AI & chi phí`
                } else if (payload.action === 'create_new_shift') {
                    userConfirmMsg = `[Xác nhận] Tạo ca ăn mới ${execResult.shift.name}`
                } else if (payload.action === 'create_new_group') {
                    userConfirmMsg = `[Xác nhận] Tạo nhóm ăn mới ${execResult.group.name}`
                } else if (payload.action === 'delete_employee' || payload.action === 'delete_employee_form') {
                    userConfirmMsg = `[Xác nhận] Xóa nhân viên ${execResult.employeeName}`
                }

                // Lưu lịch sử chat
                await supabase.from('ai_chat_history').insert([
                    { tenant_id: tenantId, user_id: user.id, session_id: sessId, role: 'user', content: userConfirmMsg },
                    { tenant_id: tenantId, user_id: user.id, session_id: sessId, role: 'assistant', content: replyText }
                ])
                
                await logAudit({
                    session_id: sessId,
                    intent: `confirm:${payload.action}`,
                    model: 'human_confirmation',
                    tokensIn: 0,
                    tokensOut: 0,
                    permission: 'authorized',
                    status: 'success',
                    calls: [{ name: payload.action, args: payload.args }]
                })

                return NextResponse.json({
                    reply: replyText,
                    timestamp: new Date().toISOString()
                })
            } catch (err: any) {
                let actionName = 'unknown'
                try {
                    const payload = verifyConfirmationToken(confirmation_token, user.id, tenantId)
                    actionName = payload.action
                } catch {}
                await logAudit({
                    session_id: sessId,
                    intent: `confirm:${actionName}`,
                    model: 'human_confirmation',
                    tokensIn: 0,
                    tokensOut: 0,
                    permission: 'authorized',
                    status: 'failed',
                    errorMsg: err.message || 'Lỗi khi thực hiện hành động'
                })
                return NextResponse.json({ error: err.message || 'Lỗi khi thực hiện hành động' }, { status: 400 })
            }
        }

        if (action === 'cancel_action') {
            const { confirmation_token, session_id } = body
            const sessId = session_id || 'default'
            
            try {
                const payload = verifyConfirmationToken(confirmation_token, user.id, tenantId)
                
                // Chống double submit: kiểm tra xem token đã được xử lý hay chưa
                const { data: existingChat } = await supabase
                    .from('ai_chat_history')
                    .select('action_resolved')
                    .eq('user_id', user.id)
                    .eq('confirmation_token', confirmation_token)
                    .maybeSingle()

                if (existingChat && existingChat.action_resolved) {
                    return NextResponse.json({ error: 'Yêu cầu này đã được thực hiện hoặc hủy bỏ trước đó.' }, { status: 400 })
                }

                const replyText = `✕ **Đã hủy yêu cầu:** Hành động thay đổi suất ăn đã được hủy bỏ và không có dữ liệu nào bị chỉnh sửa.`
                
                // Đánh dấu bản ghi cũ đã giải quyết để mất nút/form trong DB
                await supabase.from('ai_chat_history')
                    .update({ action_resolved: true, action_pending: false, form_pending: false })
                    .eq('user_id', user.id)
                    .eq('confirmation_token', confirmation_token)

                await supabase.from('ai_chat_history').insert([
                    { tenant_id: tenantId, user_id: user.id, session_id: sessId, role: 'user', content: `[Hủy bỏ] Hủy yêu cầu thay đổi suất ăn` },
                    { tenant_id: tenantId, user_id: user.id, session_id: sessId, role: 'assistant', content: replyText }
                ])

                try {
                    const { createAdminClient: createAdm } = await import('@/lib/supabase/admin');
                    const adminDb = createAdm();
                    await adminDb.from('activity_logs').insert({
                        tenant_id: tenantId,
                        action: 'CANCEL_AI_ACTION',
                        performed_by: user.id,
                        performer_name: user.email?.split('@')[0] || 'User',
                        target_type: 'ai',
                        details: {
                            action_name: payload.action,
                            reason: 'Quản trị viên hủy bỏ đề xuất của AI',
                            args: payload.args,
                            message: `Hủy yêu cầu: ${payload.action}`
                        }
                    })
                } catch (logErr) {
                    console.warn('Failed to insert activity log for cancel_action:', logErr)
                }
                
                await logAudit({
                    session_id: sessId,
                    intent: `cancel:${payload.action}`,
                    model: 'human_confirmation',
                    tokensIn: 0,
                    tokensOut: 0,
                    permission: 'authorized',
                    status: 'success',
                    calls: [{ name: payload.action, args: payload.args }]
                })

                return NextResponse.json({
                    reply: replyText,
                    timestamp: new Date().toISOString()
                })
            } catch (err: any) {
                let actionName = 'unknown'
                try {
                    const payload = verifyConfirmationToken(confirmation_token, user.id, tenantId)
                    actionName = payload.action
                } catch {}
                await logAudit({
                    session_id: sessId,
                    intent: `cancel:${actionName}`,
                    model: 'human_confirmation',
                    tokensIn: 0,
                    tokensOut: 0,
                    permission: 'authorized',
                    status: 'failed',
                    errorMsg: err.message || 'Lỗi khi hủy hành động'
                })
                return NextResponse.json({ error: err.message || 'Lỗi khi hủy hành động' }, { status: 400 })
            }
        }

        // ===== ACTION: CHAT =====
        const { message: messageInput, history, audio, mimeType } = body
        const sessionId = body.session_id || 'default'

        // ⚠️ Rate limit: 20 req/phút per user (chat tương tác nhiều hơn analyze)
        const rateLimited = await checkRateLimit(`ai_chat:${user.id}`, 20, 60_000)
        if (rateLimited) {
            log.warn('Rate limit exceeded', { retryAfterSeconds: rateLimited.retryAfterSeconds })
            await logAudit({
                session_id: sessionId,
                intent: 'text_query',
                model: 'none',
                tokensIn: 0,
                tokensOut: 0,
                permission: 'denied',
                status: 'failed',
                errorMsg: `Rate limit exceeded. Retry after ${rateLimited.retryAfterSeconds}s`
            })
            return NextResponse.json(
                { error: `Quá nhiều tin nhắn. Vui lòng thử lại sau ${rateLimited.retryAfterSeconds} giây.` },
                { status: 429 }
            )
        }

        // Resolve API key: tenant key (from DB) → fallback global env
        const { data: aiConfig } = await supabase
            .from('tenant_ai_config')
            .select('gemini_api_key')
            .eq('tenant_id', tenantId)
            .single()

        let resolvedKey: string
        try {
            resolvedKey = resolveApiKey(aiConfig?.gemini_api_key)
        } catch {
            await logAudit({
                session_id: sessionId,
                intent: 'text_query',
                model: 'none',
                tokensIn: 0,
                tokensOut: 0,
                permission: 'authorized',
                status: 'failed',
                errorMsg: 'GEMINI_API_KEY chưa được cấu hình'
            })
            return NextResponse.json({ error: 'GEMINI_API_KEY chưa được cấu hình. Vào Cài đặt AI → nhập API key.' }, { status: 500 })
        }

        const ai = new GoogleGenAI({ apiKey: resolvedKey })
        let message = messageInput || ''
        let transcribedText = ''

        if (audio && mimeType) {
            try {
                let base64Data = audio
                if (audio.includes(',')) {
                    base64Data = audio.split(',')[1]
                }
                
                const transcribeResult = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        },
                        'Hãy chuyển đoạn âm thanh trên thành văn bản tiếng Việt. Chỉ trả về văn bản nhận diện được, không thêm bất kỳ bình luận hay giải thích nào. Nếu không nghe rõ hoặc không có âm thanh, hãy trả về rỗng.'
                    ]
                })
                
                transcribedText = transcribeResult.text?.trim() || ''
                message = transcribedText
                userPromptText = transcribedText
                log.info('Audio transcribed successfully', { length: transcribedText.length, text: transcribedText })
            } catch (transcribeErr: any) {
                log.error('Failed to transcribe audio', transcribeErr)
                return NextResponse.json({ error: 'Không thể nhận diện giọng nói. Vui lòng thử lại hoặc gõ tin nhắn.' }, { status: 400 })
            }
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            const errorDetail = audio ? `Tin nhắn trống (Audio length: ${audio.length}, mimeType: ${mimeType}, transcribed: "${transcribedText}")` : 'Tin nhắn trống';
            await logAudit({
                session_id: sessionId,
                intent: 'text_query',
                model: 'none',
                tokensIn: 0,
                tokensOut: 0,
                permission: 'authorized',
                status: 'failed',
                errorMsg: errorDetail
            })
            return NextResponse.json({ error: 'Tin nhắn không được để trống' }, { status: 400 })
        }
        if (message.length > 2000) {
            await logAudit({
                session_id: sessionId,
                intent: 'text_query',
                model: 'none',
                tokensIn: 0,
                tokensOut: 0,
                permission: 'authorized',
                status: 'failed',
                errorMsg: 'Tin nhắn quá dài (tối đa 2000 ký tự)'
            })
            return NextResponse.json({ error: 'Tin nhắn quá dài (tối đa 2000 ký tự)' }, { status: 400 })
        }

        const safeHistory = Array.isArray(history) ? history : []

        // ===== COMPUTE DATES (cần trước fetch + summarize) =====
        const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
        const today = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`
        const thirtyDaysAgo = new Date(nowVN)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const startDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`
        const monthStart = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-01`

        // ===== RESOLVE MODEL + FETCH DATA (cần trước auto-summarize) =====
        const data = await fetchAllTenantData(supabase, tenantId, startDate, today)
        log.info('SSOT data fetched', { durationMs: Date.now() - t1, employeeCount: data.employees?.length })
        const selectedModel = data.aiConfig?.ai_model || 'gemini-2.5-flash'
        // Đã khởi tạo 'ai' ở phía trên

        // ===== AUTO-SUMMARIZE =====
        let contextSummary = ''
        if (sessionId !== 'default') {
            const { data: session } = await supabase
                .from('ai_chat_sessions').select('summary')
                .eq('id', sessionId).eq('user_id', user.id).single()
            contextSummary = session?.summary || ''
        }

        if (safeHistory.length > MAX_MESSAGES_BEFORE_SUMMARY) {
            const olderMessages = safeHistory.slice(0, safeHistory.length - RECENT_MESSAGES_TO_KEEP)
            try {
                // ⚠️ AUDIT-FIX #4: Dùng selectedModel thay vì hardcode, có fallback 503 và timeout như main chat
                let summaryText = ''
                try {
                    const conversationText = olderMessages.map((m: { role: string; content: string }) =>
                        `${m.role === 'user' ? 'Admin' : 'AI'}: ${m.content}`
                    ).join('\n')
                    const summaryResult = await withTimeout(
                        ai.models.generateContent({
                            model: selectedModel,
                            contents: SUMMARIZE_PROMPT + '\n\n---\n' + conversationText
                        }),
                        selectedModel === 'gemini-2.5-flash' ? 10_000 : 6_000,
                        'Timeout'
                    )
                    summaryText = summaryResult.text || ''
                } catch (summaryModelErr: any) {
                    const isTimeout = summaryModelErr instanceof TimeoutError || summaryModelErr?.message?.includes('timeout')
                    const is503 = summaryModelErr?.status === 503 || summaryModelErr?.message?.includes('503')

                    if (selectedModel !== 'gemini-2.5-flash' && (isTimeout || is503)) {
                        console.warn('[Auto-summarize] Primary failed or timed out, falling back to gemini-2.5-flash')
                        const conversationText = olderMessages.map((m: { role: string; content: string }) =>
                            `${m.role === 'user' ? 'Admin' : 'AI'}: ${m.content}`
                        ).join('\n')
                        try {
                            const summaryResult = await withTimeout(
                                ai.models.generateContent({
                                    model: 'gemini-2.5-flash',
                                    contents: SUMMARIZE_PROMPT + '\n\n---\n' + conversationText
                                }),
                                8_000,
                                'Timeout fallback'
                            )
                            summaryText = summaryResult.text || ''
                        } catch (fallbackSummaryErr) {
                            console.warn('[Auto-summarize] Fallback model also failed:', fallbackSummaryErr)
                            summaryText = ''
                        }
                    } else {
                        throw summaryModelErr
                    }
                }

                contextSummary = contextSummary
                    ? `${contextSummary}\n\n[Cập nhật mới]\n${summaryText}`
                    : summaryText

                if (sessionId !== 'default') {
                    await supabase.from('ai_chat_sessions')
                        .update({ summary: contextSummary })
                        .eq('id', sessionId).eq('user_id', user.id)
                }

                const { data: oldMessages } = await supabase
                    .from('ai_chat_history').select('id, created_at')
                    .eq('user_id', user.id).eq('session_id', sessionId)
                    .order('created_at', { ascending: true }).limit(olderMessages.length)

                if (oldMessages && oldMessages.length > 0) {
                    await supabase.from('ai_chat_history').delete()
                        .in('id', oldMessages.map(m => m.id))
                }
            } catch (e) {
                console.warn('Auto-summarize failed:', e)
            }
        }

        const recentHistory = safeHistory.slice(-RECENT_MESSAGES_TO_KEEP)

        // ===== BUILD MAPS FROM FETCHED DATA =====
        const shiftMap = new Map<string, string>()
        data.shifts.forEach(s => shiftMap.set(s.id, s.name))
        const groupMap = new Map<string, string>()
        data.groups.forEach(g => groupMap.set(g.id, g.name))
        const employeeMap = new Map<string, { name: string; dept: string; role: string; shift: string; group: string; active: boolean; joinDate?: string }>()
        data.employees.forEach(emp => {
            employeeMap.set(emp.id, {
                name: emp.full_name || 'Chưa có tên',
                dept: emp.department || 'Chưa phân phòng',
                role: emp.role,
                shift: emp.shift_id ? (shiftMap.get(emp.shift_id) || 'Chưa gán') : 'Chưa gán',
                group: emp.group_id ? (groupMap.get(emp.group_id) || 'Chưa gán') : 'Chưa gán',
                active: (emp.status || 'active') === 'active',
                joinDate: emp.created_at?.slice(0, 10),  // ⭐ NV join giữa tháng
            })
        })

        // 3. Filter employees
        // ⚠️ AUDIT-FIX: filter phải khớp với popup monthly report: loại TẤT CẢ role chứa 'kitchen' (case-insensitive)
        const allNonKitchenEmployees = data.employees.filter(e => !e.role?.toLowerCase().includes('kitchen'))
        // ⚠️ START_DATE: loại NV chưa bắt đầu làm
        const activeNonKitchenEmployees = allNonKitchenEmployees.filter(e => (e.status || 'active') === 'active' && (!e.start_date || e.start_date <= today))
        const pausedEmployees = allNonKitchenEmployees.filter(e => e.status === 'paused')
        const resignedEmployees = allNonKitchenEmployees.filter(e => e.status === 'resigned')

        // 4. Calculate stats (SSOT via calculateDateRangeStats)
        const mealStats = await getSSOTMealStats({
            supabase,
            tenantId,
            startDate, today, monthStart,
            employeeMap
        })

        // 5. Build context (FACT SHEET — luôn có)
        let dataContext = buildDataContext({
            data, stats: mealStats,
            activeNonKitchenEmployees, allNonKitchenEmployees,
            pausedEmployees, resignedEmployees,
            employeeMap, shiftMap, groupMap,
            today, startDate, monthStart,
        })

        // 6. Adaptive RAG: chọn pipeline theo độ phức tạp câu hỏi
        try {
            const classification = classifyQuery(message)
            console.log(`[Adaptive RAG] Query: "${message.slice(0, 50)}..." → ${classification.complexity} (${classification.reason})`)

            if (classification.complexity !== 'simple') {
                // Medium + Complex: Hybrid RAG
                const hasRAG = await hasIndexedData(supabase, tenantId)
                if (hasRAG) {
                    const ragChunks = await retrieveContext(supabase, tenantId, message, {
                        limit: classification.complexity === 'complex' ? 12 : 8,
                        sourceTypes: classification.suggestedSourceTypes,
                    })
                    if (ragChunks.length > 0) {
                        dataContext += '\n' + buildRAGContext(ragChunks)
                    }
                }

                // Complex only: GraphRAG (multi-hop)
                if (classification.complexity === 'complex') {
                    const hasGraph = await hasKnowledgeGraph(supabase, tenantId)
                    if (hasGraph) {
                        const graphResult = await graphSearch(supabase, tenantId, message, {
                            maxEntities: 8,
                            maxCommunities: 4,
                        })
                        const graphContext = buildGraphContext(graphResult)
                        if (graphContext) {
                            dataContext += '\n' + graphContext
                        }
                    }
                }
            }
        } catch (ragErr) {
            console.warn('[RAG] Search failed, using FACT SHEET only:', ragErr)
        }

        if (contextSummary) {
            dataContext += `\n### Tóm tắt cuộc trò chuyện trước\n${contextSummary}\n`
        }

        // ===== CALL GEMINI (selectedModel + genAI khai báo phía trên cùng) =====
        
        let chatHistory = recentHistory.map((msg: { role: string; content: string }) => ({
            role: msg.role === 'user' ? 'user' as const : 'model' as const,
            parts: [{ text: msg.content }],
        }))

        // Fix: Gemini yêu cầu message đầu tiên PHẢI là 'user'
        while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
            chatHistory = chatHistory.slice(1)
        }

        // ===== CONFIG TOOLS CHO GEMINI =====
        const queryHistoricalMealStatsDeclaration = {
            name: 'query_historical_meal_stats',
            description: 'Tra cứu số liệu thống kê suất ăn tổng hợp (tổng suất ăn, lượt nghỉ, khách, chi phí, tỷ lệ hủy, số ngày nấu) cho cả năm (ví dụ: cả năm 2026), một tháng cụ thể hoặc khoảng thời gian bất kỳ trong quá khứ/lịch sử.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    month: {
                        type: Type.INTEGER,
                        description: 'Tháng cần tra cứu (từ 1 đến 12). Ví dụ: 8 cho tháng 8.'
                    },
                    year: {
                        type: Type.INTEGER,
                        description: 'Năm cần tra cứu. Ví dụ: 2026.'
                    },
                    start_date: {
                        type: Type.STRING,
                        description: 'Ngày bắt đầu định dạng YYYY-MM-DD nếu tra cứu theo khoảng ngày cụ thể.'
                    },
                    end_date: {
                        type: Type.STRING,
                        description: 'Ngày kết thúc định dạng YYYY-MM-DD nếu tra cứu theo khoảng ngày cụ thể.'
                    }
                }
            }
        }

        const modifyEmployeeMealDeclaration = {
            name: 'modify_employee_meal',
            description: 'Chỉnh sửa đăng ký suất ăn của nhân viên vào các ngày cụ thể (đăng ký ăn hoặc hủy đăng ký ăn). Hỗ trợ đăng ký/hủy cho nhiều ngày đồng thời.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    employee_name: {
                        type: Type.STRING,
                        description: 'Tên nhân viên hoặc mã nhân viên hoặc email cần chỉnh sửa suất ăn.'
                    },
                    date: {
                        type: Type.STRING,
                        description: 'Ngày hoặc danh sách ngày thực hiện thay đổi, định dạng YYYY-MM-DD. Nếu người dùng yêu cầu nhiều ngày (ví dụ: ngày 25 và 26/5/2026, hoặc cả tuần sau), hãy gộp các ngày thành chuỗi phân tách bằng dấu phẩy và khoảng trắng (ví dụ: "2026-05-25, 2026-05-26").'
                    },
                    register: {
                        type: Type.BOOLEAN,
                        description: 'true là đăng ký ăn cơm, false là hủy đăng ký ăn cơm.'
                    },
                    reason: {
                        type: Type.STRING,
                        description: 'Lý do thay đổi (ví dụ: đi công tác, nghỉ ốm, v.v.).'
                    }
                },
                required: ['employee_name', 'date', 'register']
            }
        }

        const createNewEmployeeDeclaration = {
            name: 'create_new_employee',
            description: 'Tạo mới một nhân viên trong hệ thống (tạo tài khoản đăng nhập, hồ sơ và ca/nhóm ăn).',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    email: {
                        type: Type.STRING,
                        description: 'Email đăng nhập của nhân viên mới (bắt buộc).'
                    },
                    fullName: {
                        type: Type.STRING,
                        description: 'Họ tên đầy đủ của nhân viên mới (bắt buộc).'
                    },
                    employeeCode: {
                        type: Type.STRING,
                        description: 'Mã nhân viên.'
                    },
                    department: {
                        type: Type.STRING,
                        description: 'Tên phòng ban.'
                    },
                    shift_id: {
                        type: Type.STRING,
                        description: 'ID của ca ăn. Tìm kiếm trong danh sách ca ăn của doanh nghiệp.'
                    },
                    group_id: {
                        type: Type.STRING,
                        description: 'ID của nhóm ăn. Tìm kiếm trong danh sách nhóm ăn của doanh nghiệp.'
                    },
                    startDate: {
                        type: Type.STRING,
                        description: 'Ngày bắt đầu làm việc, định dạng YYYY-MM-DD. Mặc định là ngày hôm nay.'
                    }
                },
                required: ['email', 'fullName']
            }
        }

        const changeEmployeeStatusDeclaration = {
            name: 'change_employee_status',
            description: 'Thay đổi ngay lập tức trạng thái hoạt động của nhân viên (Hoạt động = active, Tạm dừng = paused, Đã nghỉ việc = resigned).',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    employee_name: {
                        type: Type.STRING,
                        description: 'Tên nhân viên hoặc mã nhân viên hoặc email cần chuyển trạng thái.'
                    },
                    new_status: {
                        type: Type.STRING,
                        description: 'Trạng thái mới.',
                        enum: ['active', 'paused', 'resigned']
                    },
                    reason: {
                        type: Type.STRING,
                        description: 'Lý do thay đổi trạng thái.'
                    }
                },
                required: ['employee_name', 'new_status']
            }
        }

        const scheduleEmployeeResignationDeclaration = {
            name: 'schedule_employee_resignation',
            description: 'Đặt lịch nghỉ việc cho nhân viên ở ngày trong tương lai hoặc Hủy lịch nghỉ việc đã đặt trước đó.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    employee_name: {
                        type: Type.STRING,
                        description: 'Tên nhân viên hoặc mã nhân viên hoặc email cần lên lịch nghỉ hoặc hủy lịch.'
                    },
                    action_type: {
                        type: Type.STRING,
                        description: 'Hành động: "schedule" (lên lịch nghỉ tương lai) hoặc "cancel" (hủy lịch nghỉ).',
                        enum: ['schedule', 'cancel']
                    },
                    resigned_date: {
                        type: Type.STRING,
                        description: 'Ngày áp dụng nghỉ việc (YYYY-MM-DD). Bắt buộc nếu hành động là schedule.'
                    },
                    reason: {
                        type: Type.STRING,
                        description: 'Lý do.'
                    }
                },
                required: ['employee_name', 'action_type']
            }
        }

        const sendEmergencyAnnouncementDeclaration = {
            name: 'send_emergency_announcement',
            description: 'Gửi thông báo khẩn cấp (qua Web Push và bảng tin) tới toàn bộ nhân viên trong hệ thống.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    content: {
                        type: Type.STRING,
                        description: 'Nội dung thông báo khẩn cấp cần gửi.'
                    }
                },
                required: ['content']
            }
        }

        const setCookingExceptionDeclaration = {
            name: 'set_cooking_exception',
            description: 'Thiết lập ngày ngoại lệ nấu ăn của bếp (ví dụ: ngày nghỉ bếp không nấu, hoặc ngày nấu bù/nấu thêm).',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    date: {
                        type: Type.STRING,
                        description: 'Ngày áp dụng ngoại lệ (YYYY-MM-DD).'
                    },
                    exception_type: {
                        type: Type.STRING,
                        description: 'Loại ngoại lệ: "no_cook" (nghỉ bếp không nấu cơm), "extra_cook" (nấu thêm/nấu bù ngày cuối tuần).',
                        enum: ['no_cook', 'extra_cook']
                    },
                    reason: {
                        type: Type.STRING,
                        description: 'Lý do thiết lập ngày ngoại lệ.'
                    }
                },
                required: ['date', 'exception_type', 'reason']
            }
        }

        const deleteCookingExceptionDeclaration = {
            name: 'delete_cooking_exception',
            description: 'Xóa thiết lập ngày ngoại lệ nấu ăn của một ngày cụ thể để khôi phục lịch nấu bình thường.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    date: {
                        type: Type.STRING,
                        description: 'Ngày cần xóa ngoại lệ (YYYY-MM-DD).'
                    }
                },
                required: ['date']
            }
        }

        const updateRegistrationDeadlineDeclaration = {
            name: 'update_registration_deadline',
            description: 'Cập nhật cấu hình thời gian hạn chót chốt cơm/đăng ký suất ăn của nhân viên.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    deadline_time: {
                        type: Type.STRING,
                        description: 'Giờ chốt cơm hàng ngày (ví dụ: "08:30" hoặc "09:00").'
                    },
                    offset_days: {
                        type: Type.INTEGER,
                        description: 'Số ngày lệch chốt cơm (0 là chốt trong ngày, 1 là chốt trước 1 ngày, v.v.).'
                    },
                    enabled: {
                        type: Type.BOOLEAN,
                        description: 'Bật hoặc tắt tính năng hạn chốt đăng ký ăn cơm.'
                    },
                    allow_late: {
                        type: Type.BOOLEAN,
                        description: 'Cho phép nhân viên đăng ký ăn cơm trễ sau giờ chốt.'
                    }
                }
            }
        }

        const addGuestMealsDeclaration = {
            name: 'add_guest_meals',
            description: 'Đăng ký thêm suất cơm khách phát sinh cho doanh nghiệp vào một ngày cụ thể.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    date: {
                        type: Type.STRING,
                        description: 'Ngày đăng ký suất cơm khách (YYYY-MM-DD).'
                    },
                    quantity: {
                        type: Type.INTEGER,
                        description: 'Số lượng suất cơm khách (từ 1 đến 100).'
                    },
                    note: {
                        type: Type.STRING,
                        description: 'Ghi chú suất ăn khách (ví dụ: khách đối tác làm việc, v.v.).'
                    }
                },
                required: ['date', 'quantity']
            }
        }

        const deleteGuestMealsDeclaration = {
            name: 'delete_guest_meals',
            description: 'Hủy/Xóa suất cơm khách phát sinh đã đăng ký trong hệ thống.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    date: {
                        type: Type.STRING,
                        description: 'Ngày của suất cơm khách cần hủy (YYYY-MM-DD).'
                    },
                    guest_meal_id: {
                        type: Type.STRING,
                        description: 'ID của bản ghi cơm khách cần xóa (nếu biết).'
                    }
                },
                required: ['date']
            }
        }

        const updateAiConfigDeclaration = {
            name: 'update_ai_config',
            description: 'Cập nhật cấu hình AI, giá suất ăn, phụ phí, ngân sách và thông tin doanh nghiệp.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    meal_price: {
                        type: Type.NUMBER,
                        description: 'Đơn giá mỗi suất ăn (VND, tối đa 200.000đ).'
                    },
                    extra_cost_per_meal: {
                        type: Type.NUMBER,
                        description: 'Phụ phí phát sinh trên mỗi suất ăn (VND, tối đa 200.000đ).'
                    },
                    monthly_fixed_cost: {
                        type: Type.NUMBER,
                        description: 'Chi phí cố định hàng tháng (VND, tối đa 1 tỷ).'
                    },
                    budget_monthly: {
                        type: Type.NUMBER,
                        description: 'Ngân sách chi tiêu suất ăn hàng tháng (VND, tối đa 1 tỷ).'
                    },
                    vendor_name: {
                        type: Type.STRING,
                        description: 'Tên nhà cung cấp suất ăn.'
                    },
                    special_notes: {
                        type: Type.STRING,
                        description: 'Ghi chú đặc biệt cho cấu hình AI.'
                    },
                    company_size: {
                        type: Type.STRING,
                        description: 'Quy mô công ty.'
                    },
                    industry: {
                        type: Type.STRING,
                        description: 'Ngành nghề hoạt động của công ty.'
                    }
                }
            }
        }

        const createNewShiftDeclaration = {
            name: 'create_new_shift',
            description: 'Tạo ca làm việc/ca ăn mới cho doanh nghiệp.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: {
                        type: Type.STRING,
                        description: 'Tên ca ăn mới (ví dụ: Ca Đêm, Ca Trưa).'
                    },
                    start_time: {
                        type: Type.STRING,
                        description: 'Giờ bắt đầu ca ăn, định dạng HH:MM:SS (ví dụ "11:30:00").'
                    },
                    end_time: {
                        type: Type.STRING,
                        description: 'Giờ kết thúc ca ăn, định dạng HH:MM:SS (ví dụ "13:00:00").'
                    }
                },
                required: ['name', 'start_time', 'end_time']
            }
        }

        const createNewGroupDeclaration = {
            name: 'create_new_group',
            description: 'Tạo một nhóm ăn mới cho doanh nghiệp.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: {
                        type: Type.STRING,
                        description: 'Tên nhóm ăn mới (ví dụ: Khối Văn Phòng, Tổ Sản Xuất).'
                    },
                    shift_id: {
                        type: Type.STRING,
                        description: 'ID ca ăn liên kết với nhóm này (nếu có).'
                    },
                    table_area: {
                        type: Type.STRING,
                        description: 'Khu vực bàn ăn được gán cho nhóm (ví dụ: Khu A, Khu B).'
                    },
                    department: {
                        type: Type.STRING,
                        description: 'Tên phòng ban liên kết.'
                    }
                },
                required: ['name']
            }
        }

        const deleteEmployeeDeclaration = {
            name: 'delete_employee',
            description: 'Xóa hoàn toàn tài khoản nhân viên khỏi hệ thống (xóa hồ sơ database và tài khoản login). Hành động này có tính cảnh báo cao vì sẽ làm mất dữ liệu đơn hàng quá khứ.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    employee_name: {
                        type: Type.STRING,
                        description: 'Họ tên, mã nhân viên hoặc email của nhân viên cần xóa hoàn toàn.'
                    }
                },
                required: ['employee_name']
            }
        }

        const toolsConfig = [{
            functionDeclarations: [
                queryHistoricalMealStatsDeclaration,
                modifyEmployeeMealDeclaration,
                createNewEmployeeDeclaration,
                changeEmployeeStatusDeclaration,
                scheduleEmployeeResignationDeclaration,
                sendEmergencyAnnouncementDeclaration,
                setCookingExceptionDeclaration,
                deleteCookingExceptionDeclaration,
                updateRegistrationDeadlineDeclaration,
                addGuestMealsDeclaration,
                deleteGuestMealsDeclaration,
                updateAiConfigDeclaration,
                createNewShiftDeclaration,
                createNewGroupDeclaration,
                deleteEmployeeDeclaration
            ]
        }]

        const currentUserContext = `### THÔNG TIN CỦA BẠN (QUẢN TRỊ VIÊN ĐANG ĐĂNG NHẬP VÀ TRÒ CHUYỆN):
- Tên: ${userData?.full_name || 'Chưa đặt tên'}
- Email: ${userData?.email || 'N/A'}
- Mã nhân viên: ${userData?.employee_code || 'N/A'}
- Vai trò: ${userData?.role || 'admin'}
- Nếu người dùng xưng "tôi", "anh", "chị", "mình", "em", "admin" yêu cầu thay đổi suất ăn của chính họ (ví dụ: "hủy ăn cho anh", "đăng ký cơm cho tôi"), hãy dùng Tên "${userData?.full_name || ''}" để truyền vào tham số \`employee_name\` của tool \`modify_employee_meal\`.
`

        const isHistoricalStatsQuery = /(?:tổng|bao nhiêu|bn|thống kê|báo cáo|số lượng|lượt nghỉ|suất nghỉ|xuất nghỉ|tiết kiệm|vẫn sai|tính sai|đúng ko).*(?:năm|tháng|quý|202\d|toàn bộ|cả năm|hôm nay|thực tế)?/i.test(message) ||
            /(?:năm 202\d|cả năm|suốt năm|từ ngày|đến ngày)/i.test(message) ||
            /(?:xuất nghỉ|suất nghỉ|lượt nghỉ)/i.test(message);

        let precomputedStatsContext = '';
        if (isHistoricalStatsQuery) {
            let pStart = `${nowVN.getFullYear()}-01-01`;
            let pEnd = today;
            const yearMatch = message.match(/202\d/);
            if (yearMatch) {
                const targetYear = parseInt(yearMatch[0]);
                pStart = `${targetYear}-01-01`;
                pEnd = targetYear === nowVN.getFullYear() ? today : `${targetYear}-12-31`;
            }
            const monthMatch = message.match(/tháng\s*(\d{1,2})/i);
            if (monthMatch) {
                const m = parseInt(monthMatch[1]);
                const targetYear = yearMatch ? parseInt(yearMatch[0]) : nowVN.getFullYear();
                pStart = `${targetYear}-${String(m).padStart(2, '0')}-01`;
                const lastDay = new Date(targetYear, m, 0).getDate();
                pEnd = `${targetYear}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            }

            try {
                const preStats = await calculateDateRangeStats(supabase, tenantId, pStart, pEnd);
                const empMeals = Math.max(0, preStats.totalMeals - preStats.totalGuest);
                const empTotalOrders = empMeals + preStats.totalNotEating;
                const cancelRate = empTotalOrders > 0 ? ((preStats.totalNotEating / empTotalOrders) * 100).toFixed(1) : '0';
                const eatRate = empTotalOrders > 0 ? ((empMeals / empTotalOrders) * 100).toFixed(1) : '0';

                precomputedStatsContext = `\n\n══════════════════════════════════════════════════════════════════
📊 BÁO CÁO SUẤT ĂN CHÍNH THỨC TỪ DATABASE (CHUẨN EXCEL SHEET 1 - BẮT BUỘC TRÍCH DẪN ĐÚNG 100%):
- Khoảng thời gian: Từ ${pStart} đến ${pEnd} (${preStats.cookingDays} ngày nấu)
- Tổng suất ăn thực tế (NV + Khách): ${preStats.totalMeals.toLocaleString('vi-VN')} suất
  - Suất nhân viên ăn: ${empMeals.toLocaleString('vi-VN')} suất
  - Suất khách (phát sinh): ${preStats.totalGuest.toLocaleString('vi-VN')} suất
- Lượt nhân viên nghỉ ăn (Hợp lệ trước deadline): ${preStats.validOptOuts.toLocaleString('vi-VN')} lượt
- Lượt hủy muộn (Sau deadline): ${preStats.lateCancellations.toLocaleString('vi-VN')} lượt
- Tổng lượt không ăn (Nghỉ hợp lệ + Hủy muộn): ${preStats.totalNotEating.toLocaleString('vi-VN')} lượt
- Tổng đơn đăng ký của nhân viên: ${empTotalOrders.toLocaleString('vi-VN')} lượt
- Tỷ lệ ăn nhân viên: ${eatRate}%
- Tỷ lệ hủy/nghỉ nhân viên: ${cancelRate}%
- Trung bình mỗi ngày nấu: ${(preStats.cookingDays > 0 ? Math.round(preStats.totalMeals / preStats.cookingDays) : 0).toLocaleString('vi-VN')} suất/ngày
- Đơn giá suất ăn: ${preStats.unitPrice.toLocaleString('vi-VN')} đ/suất
- Tổng chi phí suất ăn: ${preStats.totalCostVnd.toLocaleString('vi-VN')} VND
- Tiền tiết kiệm từ các lượt báo nghỉ hợp lệ: ${preStats.costSavingsVnd.toLocaleString('vi-VN')} VND
══════════════════════════════════════════════════════════════════
🚨 YÊU CẦU BẮT BUỘC: Trả lời người dùng bằng các con số CHÍNH XÁC trên đây. Nếu trong lịch sử chat cũ có số liệu khác (như 980, 1060 hay 2185), ĐÓ LÀ DỮ LIỆU CŨ ĐÃ HẾT HẠN, BẠN PHẢI BÁO LẠI RẰNG: Tổng số lượt nghỉ ăn hợp lệ là ${preStats.validOptOuts.toLocaleString('vi-VN')} lượt (kèm ${preStats.lateCancellations} lượt hủy muộn), tổng suất ăn thực tế là ${preStats.totalMeals.toLocaleString('vi-VN')} suất, tiết kiệm được ${preStats.costSavingsVnd.toLocaleString('vi-VN')} VND.`;
            } catch (preErr) {
                console.warn('[AI Precompute] Error:', preErr);
            }
        }

        const dynamicInstruction = SYSTEM_PROMPT + '\n\n' + currentUserContext + '\n\n' + dataContext + precomputedStatsContext +
            (isHistoricalStatsQuery
                ? `\n\n🚨 [LỆNH BẮT BUỘC]: Người dùng đang hỏi về số liệu thống kê/lịch sử suất ăn ("${message}"). Bạn hãy sử dụng bảng BÁO CÁO SUẤT ĂN CHÍNH THỨC TỪ DATABASE ở trên hoặc gọi tool \`query_historical_meal_stats\` để trả lời chính xác 100%. TUYỆT ĐỐI KHÔNG tự bịa hoặc lặp lại con số 980 trong lịch sử chat cũ!`
                : '');

        let text = ''
        let result: any = null
        let chatInstance: any = null
        let modelUsed = selectedModel

        // Danh sách mô hình dự phòng tân tiến theo thứ tự ưu tiên chuẩn 2026 (Multi-tier Failover)
        const candidateModels = Array.from(new Set([
            selectedModel,
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-3-flash-preview',
            'gemini-2.0-flash'
        ]))

        let lastError: any = null

        for (let i = 0; i < candidateModels.length; i++) {
            const currentModel = candidateModels[i]
            const isInitial = i === 0
            const timeoutMs = isInitial ? 35_000 : 25_000

            try {
                if (!isInitial) {
                    log.warn(`[AI Failover] Chuyển đổi sang mô hình dự phòng: ${currentModel} (Lần thử ${i + 1}/${candidateModels.length})`)
                    await delay(1000)
                }

                chatInstance = ai.chats.create({
                    model: currentModel,
                    history: chatHistory,
                    config: {
                        systemInstruction: dynamicInstruction,
                        tools: toolsConfig
                    }
                })

                result = await withTimeout(
                    chatInstance.sendMessage({ message }),
                    timeoutMs,
                    `AI phản hồi chậm (${currentModel}).`
                )

                let extractedText = result.text || ''
                if (!extractedText && result?.candidates?.[0]?.content?.parts) {
                    extractedText = result.candidates[0].content.parts
                        .map((p: any) => p.text || '')
                        .filter(Boolean)
                        .join('\n')
                        .trim()
                }

                const hasFunctionCalls = result?.functionCalls && result.functionCalls.length > 0

                if (!extractedText && !hasFunctionCalls) {
                    log.warn(`[AI Chat] Mô hình ${currentModel} trả về rỗng không có text và function call, thử mô hình tiếp theo...`)
                    if (i < candidateModels.length - 1) {
                        continue
                    }
                }

                text = extractedText
                modelUsed = currentModel

                if (!isInitial && text) {
                    text += `\n\n> 💡 *Hệ thống đã tự động kích hoạt mô hình dự phòng (${currentModel}) do mô hình chính đang có lượng truy cập cao.*`
                }
                
                lastError = null
                break // Thành công, thoát vòng lặp fallback!
            } catch (err: any) {
                lastError = err
                log.error(`[AI Chat] Thử mô hình ${currentModel} thất bại:`, err)
                const isTimeout = err instanceof TimeoutError || err?.message?.includes('timeout')
                const is503 = err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE') || err?.message?.includes('overloaded')
                const is429 = err?.status === 429 || err?.message?.includes('resource_exhausted') || err?.message?.includes('quota')

                // Nếu lỗi do cú pháp hoặc API key hỏng thì không thử tiếp
                if (!isTimeout && !is503 && !is429) {
                    break
                }
            }
        }

        if (lastError && !result) {
            await logAudit({
                session_id: sessionId,
                intent: 'text_query',
                model: modelUsed,
                tokensIn: 0,
                tokensOut: 0,
                permission: 'authorized',
                status: 'failed',
                errorMsg: 'Tất cả các mô hình dự phòng đều thất bại: ' + (lastError.message || '')
            })

            const friendlyMessage = parseGeminiError(lastError)
            return NextResponse.json(
                { error: friendlyMessage || '⏳ Dịch vụ AI đang tạm thời quá tải trên toàn bộ cụm máy chủ Google. Vui lòng thử lại sau 30 giây.' },
                { status: 503 }
            )
        }

        // ===== XỬ LÝ FUNCTION CALLING NẾU CÓ =====
        const functionCalls = result?.functionCalls
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0]
            // Phân quyền cho từng tool (RBAC)
            const toolRequiredRoles: Record<string, string[]> = {
                modify_employee_meal: ['admin'],
                create_new_employee: ['admin', 'manager'],
                change_employee_status: ['admin', 'manager'],
                schedule_employee_resignation: ['admin', 'manager'],
                update_registration_deadline: ['admin', 'manager'],
                update_ai_config: ['admin', 'manager'],
                send_emergency_announcement: ['admin', 'manager', 'kitchen'],
                set_cooking_exception: ['admin', 'manager', 'kitchen'],
                delete_cooking_exception: ['admin', 'manager', 'kitchen'],
                add_guest_meals: ['admin', 'manager', 'kitchen'],
                delete_guest_meals: ['admin', 'manager', 'kitchen'],
            }

            const allowedRoles = toolRequiredRoles[call.name] || []
            if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
                const roleLabels: Record<string, string> = { admin: 'Quản trị viên tối cao (Admin)', manager: 'Quản lý (Manager)', kitchen: 'Nhân viên Bếp (Kitchen)', hr: 'Nhân sự (HR)' }
                const allowedLabels = allowedRoles.map(r => roleLabels[r] || r).join(', ')
                const replyText = `✕ **Từ chối hành động:** Bạn hiện đang đăng nhập với vai trò **${roleLabels[userData.role] || userData.role}**. Tác vụ này yêu cầu quyền thuộc nhóm: **${allowedLabels}**.`
                
                await supabase.from('ai_chat_history').insert([
                    { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                    { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                ])
                await logAudit({
                    session_id: sessionId,
                    intent: call.name,
                    model: modelUsed,
                    tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                    tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                    permission: 'denied',
                    status: 'failed',
                    errorMsg: `Quyền hạn không đủ: Cần vai trò thuộc [${allowedRoles.join(', ')}]`,
                    calls: [{ name: call.name, args: call.args }]
                })
                return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
            }

            const confirmationMode = data.aiConfig?.ai_function_confirmation_mode || 'always_confirm'

            // Xử lý từng tool
            switch (call.name) {
                case 'query_historical_meal_stats': {
                    const args = (call.args || {}) as { month?: number | string; year?: number | string; start_date?: string; end_date?: string }
                    let queryStart = args.start_date
                    let queryEnd = args.end_date

                    const currentYear = nowVN.getFullYear()
                    const targetYear = args.year ? Number(args.year) : currentYear

                    if (args.month && !queryStart) {
                        const m = Number(args.month)
                        const monthStr = String(m).padStart(2, '0')
                        queryStart = `${targetYear}-${monthStr}-01`
                        const lastDay = new Date(targetYear, m, 0).getDate()
                        queryEnd = `${targetYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`
                    } else if (args.year && !queryStart) {
                        queryStart = `${targetYear}-01-01`
                        queryEnd = `${targetYear}-12-31`
                    }

                    if (!queryStart) {
                        queryStart = monthStart
                        queryEnd = today
                    }
                    if (!queryEnd) {
                        queryEnd = queryStart
                    }

                    const mealPrice = data.aiConfig?.meal_price || 25000
                    const extraCost = data.aiConfig?.extra_cost_per_meal || 0
                    const totalCostPerMeal = mealPrice + extraCost

                    // Truy vấn SSOT
                    const histStats = await calculateDateRangeStats(supabase, tenantId, queryStart, queryEnd)
                    const histTotalMeals = histStats.totalMeals
                    const histNotEating = histStats.totalNotEating
                    const histGuest = histStats.totalGuest
                    const histCookingDays = histStats.cookingDays
                    const employeeMeals = Math.max(0, histTotalMeals - histGuest)
                    const employeeTotalOrders = employeeMeals + histNotEating
                    const histCancelRate = employeeTotalOrders > 0 ? ((histNotEating / employeeTotalOrders) * 100).toFixed(1) : '0'
                    const histEatRate = employeeTotalOrders > 0 ? ((employeeMeals / employeeTotalOrders) * 100).toFixed(1) : '0'
                    const unitPrice = histStats.unitPrice || data.aiConfig?.meal_price || 40000
                    const histValidOptOuts = histStats.validOptOuts
                    const histLateCancels = histStats.lateCancellations
                    const histSavings = histStats.costSavingsVnd
                    const histTotalCost = histStats.totalCostVnd
                    const histAvgMealsPerDay = histCookingDays > 0 ? Math.round(histTotalMeals / histCookingDays) : 0

                    const summaryDataText = `📊 **BÁO CÁO SUẤT ĂN THỰC TẾ (${queryStart} → ${queryEnd})**
- **Khoảng thời gian:** Từ ${queryStart} đến ${queryEnd} (${histCookingDays} ngày nấu)
- **Tổng suất ăn thực tế (NV + Khách):** ${histTotalMeals.toLocaleString('vi-VN')} suất
  - Suất nhân viên ăn: ${employeeMeals.toLocaleString('vi-VN')} suất
  - Suất khách (phát sinh): ${histGuest.toLocaleString('vi-VN')} suất
- **Lượt nhân viên nghỉ ăn (Hợp lệ trước deadline):** ${histValidOptOuts.toLocaleString('vi-VN')} lượt
- **Lượt hủy muộn (Sau deadline):** ${histLateCancels.toLocaleString('vi-VN')} lượt
- **Tổng lượt không ăn (Nghỉ hợp lệ + Hủy muộn):** ${histNotEating.toLocaleString('vi-VN')} lượt
- **Tổng đơn đăng ký của nhân viên:** ${employeeTotalOrders.toLocaleString('vi-VN')} lượt
- **Tỷ lệ ăn nhân viên:** ${histEatRate}%
- **Tỷ lệ hủy/nghỉ nhân viên:** ${histCancelRate}%
- **Trung bình mỗi ngày nấu:** ${histAvgMealsPerDay.toLocaleString('vi-VN')} suất/ngày
- **Đơn giá suất ăn:** ${unitPrice.toLocaleString('vi-VN')} đ/suất
- **Tổng chi phí suất ăn:** ${histTotalCost.toLocaleString('vi-VN')} VND
- **Tiền tiết kiệm từ các lượt báo nghỉ hợp lệ:** ${histSavings.toLocaleString('vi-VN')} VND`

                    let replyText = summaryDataText

                    try {
                        const synthesisPrompt = `Bạn là Lili - Trợ lý AI Cơm Ngon.
Người dùng hỏi: "${message}".

Dưới đây là SỐ LIỆU CHUẨN XÁC VỪA ĐƯỢC TRUY VẤN TỪ CƠ SỞ DỮ LIỆU (chuẩn SSOT):
${summaryDataText}

Yêu cầu trả lời:
1. Trả lời một cách tự nhiên, lịch sự, chuyên nghiệp bằng tiếng Việt.
2. Trích dẫn ĐẦY ĐỦ, CHÍNH XÁC các con số trên theo đúng luật Fact Sheet.
3. Định dạng Markdown rõ ràng, dễ đọc.`

                        let synthText = ''
                        for (const synthModel of [selectedModel, 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']) {
                            try {
                                const synthResult = await ai.models.generateContent({
                                    model: synthModel,
                                    contents: synthesisPrompt
                                })
                                if (synthResult?.text) {
                                    synthText = synthResult.text
                                    break
                                }
                            } catch (err) {
                                console.warn(`[AI Query Tool] Synthesis with ${synthModel} failed, trying fallback:`, err)
                            }
                        }
                        if (synthText) {
                            replyText = synthText
                        }
                    } catch (synthErr) {
                        console.warn('[AI Query Tool] Synthesis error, using summary text fallback:', synthErr)
                    }

                    await supabase.from('ai_chat_history').insert([
                        { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                        { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                    ])

                    await logAudit({
                        session_id: sessionId,
                        intent: 'query_historical_meal_stats',
                        model: modelUsed,
                        tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                        tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                        permission: 'authorized',
                        status: 'success',
                        calls: [{ name: 'query_historical_meal_stats', args: { queryStart, queryEnd } }]
                    })

                    return NextResponse.json({
                        reply: replyText,
                        timestamp: new Date().toISOString()
                    })
                }

                case 'modify_employee_meal': {
                    const args = call.args as { employee_name: string; date: string; register: boolean; reason?: string }
                    const matches = resolveEmployee(data.employees, args.employee_name)

                    if (matches.length > 1) {
                        const tokenPayload = {
                            action: 'modify_employee_meal_form' as const,
                            args: { date: args.date, register: args.register, reason: args.reason },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Hệ thống tìm thấy **${matches.length}** nhân viên khớp với từ khóa **"${args.employee_name}"**. Vui lòng chọn nhân viên chính xác bên dưới để cập nhật:`
                        
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                form_pending: true,
                                form_fields: [
                                    {
                                        name: 'employee_id',
                                        type: 'select',
                                        label: 'Chọn nhân viên',
                                        options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                    },
                                    {
                                        name: 'date',
                                        type: 'date',
                                        label: 'Ngày áp dụng',
                                        defaultValue: args.date
                                    },
                                    {
                                        name: 'register',
                                        type: 'select',
                                        label: 'Trạng thái suất ăn',
                                        options: [
                                            { label: 'Đăng ký ăn cơm', value: 'true' },
                                            { label: 'Hủy đăng ký cơm', value: 'false' }
                                        ],
                                        defaultValue: args.register ? 'true' : 'false'
                                    }
                                ],
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'modify_employee_meal',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'modify_employee_meal_form', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            form_pending: true,
                            form_fields: [
                                {
                                    name: 'employee_id',
                                    type: 'select',
                                    label: 'Chọn nhân viên',
                                    options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                },
                                {
                                    name: 'date',
                                    type: 'date',
                                    label: 'Ngày áp dụng',
                                    defaultValue: args.date
                                },
                                {
                                    name: 'register',
                                    type: 'select',
                                    label: 'Trạng thái suất ăn',
                                    options: [
                                        { label: 'Đăng ký ăn cơm', value: 'true' },
                                        { label: 'Hủy đăng ký cơm', value: 'false' }
                                    ],
                                    defaultValue: args.register ? 'true' : 'false'
                                }
                            ],
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    }

                    if (matches.length === 0) {
                        const replyText = `✕ Không tìm thấy nhân viên nào khớp với tên **"${args.employee_name}"** trong hệ thống. Anh vui lòng kiểm tra lại họ tên đầy đủ hoặc mã nhân viên xem sao nhé.`
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                        ])
                        await logAudit({
                            session_id: sessionId,
                            intent: 'modify_employee_meal',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'failed',
                            errorMsg: `Không tìm thấy nhân viên khớp với: ${args.employee_name}`,
                            calls: [{ name: 'modify_employee_meal', args }]
                        })
                        return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
                    }

                    const targetEmp = matches[0]

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'modify_employee_meal' as const,
                            args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                date: args.date,
                                register: args.register,
                                reason: args.reason || ''
                            },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const statusText = args.register ? 'ĐĂNG KÝ ĂN' : 'HỦY ĐĂNG KÝ ĂN'
                        const dateFormatted = args.date.split(',').map(d => {
                            const parts = d.trim().split('-')
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d.trim()
                        }).join(', ')
                        const replyText = `Yêu cầu chỉnh sửa suất ăn của nhân viên **${targetEmp.full_name}** vào ngày **${dateFormatted}** thành **${statusText}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'modify_employee_meal',
                                action_args: {
                                    employee_id: targetEmp.id,
                                    employee_name: targetEmp.full_name,
                                    date: args.date,
                                    register: args.register,
                                    reason: args.reason || ''
                                },
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'modify_employee_meal',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'modify_employee_meal', args: { ...args, employee_id: targetEmp.id } }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'modify_employee_meal',
                            action_args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                date: args.date,
                                register: args.register,
                                reason: args.reason || ''
                            },
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeModifyMeal(
                                supabase,
                                tenantId,
                                targetEmp.id,
                                args.date,
                                args.register,
                                args.reason || '',
                                userData
                            )
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'modify_employee_meal',
                                            response: { result: 'success', message: `Đã thay đổi suất ăn cho ${execResult.employeeName} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'modify_employee_meal',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'modify_employee_meal', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'modify_employee_meal',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'modify_employee_meal', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        }
                    }
                    break
                }

                case 'create_new_employee': {
                    const args = call.args as { email: string; fullName: string; employeeCode?: string; department?: string; shift_id?: string; group_id?: string; startDate?: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'create_new_employee' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu tạo nhân viên mới **${args.fullName}** (Email: **${args.email}**) đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'create_new_employee',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'create_new_employee',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'create_new_employee', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'create_new_employee',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeCreateEmployee(tenantId, args, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'create_new_employee',
                                            response: { result: 'success', message: `Đã tạo nhân viên ${execResult.fullName} thành công với mật khẩu mặc định là ${execResult.defaultPassword}.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_employee',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'create_new_employee', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_employee',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'create_new_employee', args }]
                            })
                        }
                    }
                    break
                }

                case 'change_employee_status': {
                    const args = call.args as { employee_name: string; new_status: 'active' | 'paused' | 'resigned'; reason?: string }
                    const matches = resolveEmployee(data.employees, args.employee_name)

                    if (matches.length > 1) {
                        const tokenPayload = {
                            action: 'change_employee_status_form' as const,
                            args: { new_status: args.new_status, reason: args.reason || '' },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Hệ thống tìm thấy **${matches.length}** nhân viên khớp với từ khóa **"${args.employee_name}"**. Vui lòng chọn nhân viên chính xác bên dưới để chuyển trạng thái:`
                        
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                form_pending: true,
                                form_fields: [
                                    {
                                        name: 'employee_id',
                                        type: 'select',
                                        label: 'Chọn nhân viên',
                                        options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                    },
                                    {
                                        name: 'new_status',
                                        type: 'select',
                                        label: 'Trạng thái mới',
                                        options: [
                                            { label: 'Hoạt động (active)', value: 'active' },
                                            { label: 'Tạm dừng (paused)', value: 'paused' },
                                            { label: 'Đã nghỉ việc (resigned)', value: 'resigned' }
                                        ],
                                        defaultValue: args.new_status
                                    },
                                    {
                                        name: 'reason',
                                        type: 'text',
                                        label: 'Lý do thay đổi',
                                        defaultValue: args.reason || ''
                                    }
                                ],
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'change_employee_status',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'change_employee_status_form', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            form_pending: true,
                            form_fields: [
                                {
                                    name: 'employee_id',
                                    type: 'select',
                                    label: 'Chọn nhân viên',
                                    options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                },
                                {
                                    name: 'new_status',
                                    type: 'select',
                                    label: 'Trạng thái mới',
                                    options: [
                                        { label: 'Hoạt động (active)', value: 'active' },
                                        { label: 'Tạm dừng (paused)', value: 'paused' },
                                        { label: 'Đã nghỉ việc (resigned)', value: 'resigned' }
                                    ],
                                    defaultValue: args.new_status
                                },
                                {
                                    name: 'reason',
                                    type: 'text',
                                    label: 'Lý do thay đổi',
                                    defaultValue: args.reason || ''
                                }
                            ],
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    }

                    if (matches.length === 0) {
                        const replyText = `✕ Không tìm thấy nhân viên nào khớp với tên **"${args.employee_name}"** trong hệ thống. Anh vui lòng kiểm tra lại họ tên đầy đủ hoặc mã nhân viên.`
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                        ])
                        await logAudit({
                            session_id: sessionId,
                            intent: 'change_employee_status',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'failed',
                            errorMsg: `Không tìm thấy nhân viên khớp với: ${args.employee_name}`,
                            calls: [{ name: 'change_employee_status', args }]
                        })
                        return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
                    }

                    const targetEmp = matches[0]

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'change_employee_status' as const,
                            args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                new_status: args.new_status,
                                reason: args.reason || ''
                            },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const statusMap: Record<string, string> = { active: 'HOẠT ĐỘNG', paused: 'TẠM DỪNG', resigned: 'ĐÃ NGHỈ VIỆC' }
                        const replyText = `Yêu cầu chuyển trạng thái của nhân viên **${targetEmp.full_name}** thành **${statusMap[args.new_status] || args.new_status}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'change_employee_status',
                                action_args: {
                                    employee_id: targetEmp.id,
                                    employee_name: targetEmp.full_name,
                                    new_status: args.new_status,
                                    reason: args.reason || ''
                                },
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'change_employee_status',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'change_employee_status', args: { ...args, employee_id: targetEmp.id } }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'change_employee_status',
                            action_args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                new_status: args.new_status,
                                reason: args.reason || ''
                            },
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeChangeEmployeeStatus(tenantId, targetEmp.id, args.new_status, args.reason || '', userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'change_employee_status',
                                            response: { result: 'success', message: `Đã chuyển trạng thái nhân viên ${execResult.employeeName} thành ${execResult.newStatus} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'change_employee_status',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'change_employee_status', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'change_employee_status',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'change_employee_status', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        }
                    }
                    break
                }

                case 'schedule_employee_resignation': {
                    const args = call.args as { employee_name: string; action_type: 'schedule' | 'cancel'; resigned_date?: string; reason?: string }
                    const matches = resolveEmployee(data.employees, args.employee_name)

                    if (matches.length > 1) {
                        const tokenPayload = {
                            action: 'schedule_employee_resignation_form' as const,
                            args: { action_type: args.action_type, resigned_date: args.resigned_date || '', reason: args.reason || '' },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Hệ thống tìm thấy **${matches.length}** nhân viên khớp với từ khóa **"${args.employee_name}"**. Vui lòng chọn nhân viên chính xác bên dưới để đặt lịch:`
                        
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                form_pending: true,
                                form_fields: [
                                    {
                                        name: 'employee_id',
                                        type: 'select',
                                        label: 'Chọn nhân viên',
                                        options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                    },
                                    {
                                        name: 'action_type',
                                        type: 'select',
                                        label: 'Hành động',
                                        options: [
                                            { label: 'Lên lịch nghỉ việc (schedule)', value: 'schedule' },
                                            { label: 'Hủy lịch nghỉ việc (cancel)', value: 'cancel' }
                                        ],
                                        defaultValue: args.action_type
                                    },
                                    {
                                        name: 'resigned_date',
                                        type: 'date',
                                        label: 'Ngày áp dụng nghỉ việc',
                                        defaultValue: args.resigned_date || ''
                                    },
                                    {
                                        name: 'reason',
                                        type: 'text',
                                        label: 'Lý do nghỉ',
                                        defaultValue: args.reason || ''
                                    }
                                ],
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'schedule_employee_resignation',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'schedule_employee_resignation_form', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            form_pending: true,
                            form_fields: [
                                {
                                    name: 'employee_id',
                                    type: 'select',
                                    label: 'Chọn nhân viên',
                                    options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                },
                                {
                                    name: 'action_type',
                                    type: 'select',
                                    label: 'Hành động',
                                    options: [
                                        { label: 'Lên lịch nghỉ việc (schedule)', value: 'schedule' },
                                        { label: 'Hủy lịch nghỉ việc (cancel)', value: 'cancel' }
                                    ],
                                    defaultValue: args.action_type
                                },
                                {
                                    name: 'resigned_date',
                                    type: 'date',
                                    label: 'Ngày áp dụng nghỉ việc',
                                    defaultValue: args.resigned_date || ''
                                },
                                {
                                    name: 'reason',
                                    type: 'text',
                                    label: 'Lý do nghỉ',
                                    defaultValue: args.reason || ''
                                }
                            ],
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    }

                    if (matches.length === 0) {
                        const replyText = `✕ Không tìm thấy nhân viên nào khớp với tên **"${args.employee_name}"** trong hệ thống. Anh vui lòng kiểm tra lại.`
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                        ])
                        await logAudit({
                            session_id: sessionId,
                            intent: 'schedule_employee_resignation',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'failed',
                            errorMsg: `Không tìm thấy nhân viên khớp với: ${args.employee_name}`,
                            calls: [{ name: 'schedule_employee_resignation', args }]
                        })
                        return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
                    }

                    const targetEmp = matches[0]

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'schedule_employee_resignation' as const,
                            args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                action_type: args.action_type,
                                resigned_date: args.resigned_date,
                                reason: args.reason || ''
                            },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const actionText = args.action_type === 'schedule' ? `LÊN LỊCH NGHỈ VIỆC vào ngày ${args.resigned_date}` : 'HỦY LỊCH NGHỈ VIỆC'
                        const replyText = `Yêu cầu **${actionText}** cho nhân viên **${targetEmp.full_name}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'schedule_employee_resignation',
                                action_args: {
                                    employee_id: targetEmp.id,
                                    employee_name: targetEmp.full_name,
                                    action_type: args.action_type,
                                    resigned_date: args.resigned_date,
                                    reason: args.reason || ''
                                },
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'schedule_employee_resignation',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'schedule_employee_resignation', args: { ...args, employee_id: targetEmp.id } }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'schedule_employee_resignation',
                            action_args: {
                                employee_id: targetEmp.id,
                                employee_name: targetEmp.full_name,
                                action_type: args.action_type,
                                resigned_date: args.resigned_date,
                                reason: args.reason || ''
                            },
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeScheduleResignation(tenantId, targetEmp.id, args.action_type, args.resigned_date || null, args.reason || '', userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'schedule_employee_resignation',
                                            response: { result: 'success', message: `Đã lên/hủy lịch nghỉ việc cho ${execResult.employeeName} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'schedule_employee_resignation',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'schedule_employee_resignation', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'schedule_employee_resignation',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'schedule_employee_resignation', args: { ...args, employee_id: targetEmp.id } }]
                            })
                        }
                    }
                    break
                }

                case 'send_emergency_announcement': {
                    const args = call.args as { content: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'send_emergency_announcement' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu gửi thông báo khẩn cấp tới toàn thể nhân viên đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'send_emergency_announcement',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'send_emergency_announcement',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'send_emergency_announcement', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'send_emergency_announcement',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeSendAnnouncement(tenantId, args.content, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'send_emergency_announcement',
                                            response: { result: 'success', message: `Đã gửi thông báo khẩn cấp thành công. Số lượng đẩy: ${execResult.pushSentCount}/${execResult.pushTotalCount}.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'send_emergency_announcement',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'send_emergency_announcement', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'send_emergency_announcement',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'send_emergency_announcement', args }]
                            })
                        }
                    }
                    break
                }

                case 'set_cooking_exception': {
                    const args = call.args as { date: string; exception_type: 'no_cook' | 'extra_cook'; reason: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'set_cooking_exception' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const typeStr = args.exception_type === 'no_cook' ? 'Nghỉ bếp (không nấu cơm)' : 'Nấu bù/Nấu thêm'
                        const replyText = `Yêu cầu thiết lập ngày ngoại lệ nấu ăn vào ngày **${args.date}** với loại **${typeStr}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'set_cooking_exception',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'set_cooking_exception',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'set_cooking_exception', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'set_cooking_exception',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeSetCookingException(tenantId, args.date, args.exception_type, args.reason, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'set_cooking_exception',
                                            response: { result: 'success', message: `Đã thiết lập ngày ngoại lệ nấu ăn ngày ${execResult.date} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'set_cooking_exception',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'set_cooking_exception', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'set_cooking_exception',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'set_cooking_exception', args }]
                            })
                        }
                    }
                    break
                }

                case 'delete_cooking_exception': {
                    const args = call.args as { date: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'delete_cooking_exception' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu xóa thiết lập ngày ngoại lệ nấu ăn ngày **${args.date}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'delete_cooking_exception',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_cooking_exception',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'delete_cooking_exception', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'delete_cooking_exception',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeDeleteCookingException(tenantId, args.date, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'delete_cooking_exception',
                                            response: { result: 'success', message: `Đã xóa ngày ngoại lệ nấu ăn ngày ${execResult.date} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_cooking_exception',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'delete_cooking_exception', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_cooking_exception',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'delete_cooking_exception', args }]
                            })
                        }
                    }
                    break
                }

                case 'update_registration_deadline': {
                    const args = call.args as { deadline_time?: string; offset_days?: number; enabled?: boolean; allow_late?: boolean }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'update_registration_deadline' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const details = []
                        if (args.deadline_time !== undefined) details.push(`Giờ chốt: ${args.deadline_time}`)
                        if (args.offset_days !== undefined) details.push(`Lệch ngày: ${args.offset_days} ngày`)
                        if (args.enabled !== undefined) details.push(`Tính năng chốt: ${args.enabled ? 'Bật' : 'Tắt'}`)
                        if (args.allow_late !== undefined) details.push(`Đăng ký muộn: ${args.allow_late ? 'Có' : 'Không'}`)
                        const replyText = `Yêu cầu cập nhật cấu hình hạn chốt cơm (${details.join(', ')}) đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'update_registration_deadline',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'update_registration_deadline',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'update_registration_deadline', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'update_registration_deadline',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeUpdateDeadline(tenantId, args, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'update_registration_deadline',
                                            response: { result: 'success', message: `Đã cập nhật cài đặt hạn chót thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'update_registration_deadline',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'update_registration_deadline', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'update_registration_deadline',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'update_registration_deadline', args }]
                            })
                        }
                    }
                    break
                }

                case 'add_guest_meals': {
                    const args = call.args as { date: string; quantity: number; note?: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'add_guest_meals' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu đăng ký thêm **${args.quantity}** suất cơm khách vào ngày **${args.date}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'add_guest_meals',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'add_guest_meals',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'add_guest_meals', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'add_guest_meals',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeAddGuestMeals(tenantId, args.date, args.quantity, args.note || '', userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'add_guest_meals',
                                            response: { result: 'success', message: `Đã đăng ký thêm ${execResult.guestMeal.quantity} suất cơm khách ngày ${execResult.guestMeal.date} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'add_guest_meals',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'add_guest_meals', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'add_guest_meals',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'add_guest_meals', args }]
                            })
                        }
                    }
                    break
                }

                case 'delete_guest_meals': {
                    const args = call.args as { date: string; guest_meal_id?: string }
                    let guestMealId = args.guest_meal_id || ''
                    let guestMeals: any[] = []

                    if (!guestMealId) {
                        const { data: dbMeals, error: dbErr } = await supabase
                            .from('guest_meals')
                            .select('id, quantity, note')
                            .eq('tenant_id', tenantId)
                            .eq('date', args.date)
                        if (!dbErr && dbMeals) {
                            guestMeals = dbMeals
                        }
                    }

                    if (!guestMealId && guestMeals.length === 0) {
                        const replyText = `✕ Không tìm thấy suất cơm khách phát sinh nào được đăng ký trong ngày **${args.date}** để hủy.`
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                        ])
                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_guest_meals',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'failed',
                            errorMsg: `Không tìm thấy cơm khách ngày ${args.date}`,
                            calls: [{ name: 'delete_guest_meals', args }]
                        })
                        return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
                    }

                    if (!guestMealId && guestMeals.length > 1) {
                        const tokenPayload = {
                            action: 'delete_guest_meals_form' as const,
                            args: { date: args.date },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Hệ thống tìm thấy **${guestMeals.length}** bản ghi cơm khách ngày **${args.date}**. Vui lòng chọn bản ghi chính xác bên dưới để hủy:`
                        
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                form_pending: true,
                                form_fields: [
                                    {
                                        name: 'guest_meal_id',
                                        type: 'select',
                                        label: 'Chọn suất cơm khách cần hủy',
                                        options: guestMeals.map(m => ({ label: `${m.quantity} suất (${m.note || 'Không có ghi chú'})`, value: m.id }))
                                    }
                                ],
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_guest_meals',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'delete_guest_meals_form', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            form_pending: true,
                            form_fields: [
                                {
                                    name: 'guest_meal_id',
                                    type: 'select',
                                    label: 'Chọn suất cơm khách cần hủy',
                                    options: guestMeals.map(m => ({ label: `${m.quantity} suất (${m.note || 'Không có ghi chú'})`, value: m.id }))
                                }
                            ],
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    }

                    const finalGuestMealId = guestMealId || guestMeals[0].id

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'delete_guest_meals' as const,
                            args: {
                                guest_meal_id: finalGuestMealId,
                                date: args.date
                            },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu hủy suất cơm khách ngày **${args.date}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'delete_guest_meals',
                                action_args: {
                                    guest_meal_id: finalGuestMealId,
                                    date: args.date
                                },
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_guest_meals',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'delete_guest_meals', args: { ...args, guest_meal_id: finalGuestMealId } }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'delete_guest_meals',
                            action_args: {
                                guest_meal_id: finalGuestMealId,
                                date: args.date
                            },
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeDeleteGuestMeals(tenantId, finalGuestMealId, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'delete_guest_meals',
                                            response: { result: 'success', message: `Đã hủy suất cơm khách ngày ${execResult.date} thành công.` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_guest_meals',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'delete_guest_meals', args: { ...args, guest_meal_id: finalGuestMealId } }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_guest_meals',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'delete_guest_meals', args: { ...args, guest_meal_id: finalGuestMealId } }]
                            })
                        }
                    }
                    break
                }

                case 'update_ai_config': {
                    const args = call.args as {
                        meal_price?: number
                        extra_cost_per_meal?: number
                        monthly_fixed_cost?: number
                        budget_monthly?: number
                        vendor_name?: string
                        special_notes?: string
                        company_size?: string
                        industry?: string
                    }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'update_ai_config' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu cập nhật cấu hình AI & chi phí đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'update_ai_config',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'update_ai_config',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'update_ai_config', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'update_ai_config',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeUpdateAiConfig(tenantId, args, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'update_ai_config',
                                            response: { result: 'success', message: `Đã cập nhật cấu hình AI thành công: ${execResult.message}` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'update_ai_config',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'update_ai_config', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'update_ai_config',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'update_ai_config', args }]
                            })
                        }
                    }
                    break;
                }

                case 'create_new_shift': {
                    const args = call.args as { name: string; start_time: string; end_time: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'create_new_shift' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu tạo ca ăn mới **${args.name}** (Thời gian: **${args.start_time} - ${args.end_time}**) đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'create_new_shift',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'create_new_shift',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'create_new_shift', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'create_new_shift',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeCreateShift(tenantId, args, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'create_new_shift',
                                            response: { result: 'success', message: `Đã tạo ca ăn thành công: ${execResult.shift.name}` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_shift',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'create_new_shift', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_shift',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'create_new_shift', args }]
                            })
                        }
                    }
                    break
                }

                case 'create_new_group': {
                    const args = call.args as { name: string; shift_id?: string; table_area?: string; department?: string }

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'create_new_group' as const,
                            args: args,
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Yêu cầu tạo nhóm ăn mới **${args.name}** đang chờ anh duyệt.`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'create_new_group',
                                action_args: args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'create_new_group',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'create_new_group', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'create_new_group',
                            action_args: args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeCreateGroup(tenantId, args, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'create_new_group',
                                            response: { result: 'success', message: `Đã tạo nhóm ăn thành công: ${execResult.group.name}` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_group',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'create_new_group', args }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'create_new_group',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'create_new_group', args }]
                            })
                        }
                    }
                    break
                }

                case 'delete_employee': {
                    const args = call.args as { employee_name: string }
                    const matches = resolveEmployee(data.employees, args.employee_name)

                    if (matches.length > 1) {
                        const tokenPayload = {
                            action: 'delete_employee_form' as const,
                            args: {},
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `Hệ thống tìm thấy **${matches.length}** nhân viên khớp với từ khóa **"${args.employee_name}"**. Vui lòng chọn nhân viên chính xác bên dưới để xóa:`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                form_pending: true,
                                form_fields: [
                                    {
                                        name: 'employee_id',
                                        type: 'select',
                                        label: 'Chọn nhân viên cần xóa',
                                        options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                    }
                                ],
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_employee',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'delete_employee_form', args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            form_pending: true,
                            form_fields: [
                                {
                                    name: 'employee_id',
                                    type: 'select',
                                    label: 'Chọn nhân viên cần xóa',
                                    options: matches.map(m => ({ label: `${m.full_name} (${m.email || 'Không có email'})`, value: m.id }))
                                }
                            ],
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    }

                    if (matches.length === 0) {
                        const replyText = `✕ Không tìm thấy nhân viên nào khớp với tên **"${args.employee_name}"** trong hệ thống. Anh vui lòng kiểm tra lại họ tên đầy đủ hoặc mã nhân viên.`
                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: replyText }
                        ])
                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_employee',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'failed',
                            errorMsg: `Không tìm thấy nhân viên khớp với: ${args.employee_name}`,
                            calls: [{ name: 'delete_employee', args }]
                        })
                        return NextResponse.json({ reply: replyText, timestamp: new Date().toISOString() })
                    }

                    const resolvedEmp = matches[0]

                    if (confirmationMode === 'always_confirm') {
                        const tokenPayload = {
                            action: 'delete_employee' as const,
                            args: { employee_id: resolvedEmp.id, employee_name: resolvedEmp.full_name },
                            user_id: user.id,
                            tenant_id: tenantId,
                            expires_at: Date.now() + 5 * 60 * 1000
                        }
                        const token = generateConfirmationToken(tokenPayload)
                        const replyText = `⚠️ **CẢNH BÁO BẢO MẬT**: Yêu cầu xóa hoàn toàn nhân viên **${resolvedEmp.full_name}** (Mã: **${resolvedEmp.employee_code || 'N/A'}**, Email: **${resolvedEmp.email}**) khỏi hệ thống đang chờ anh duyệt.\n\n*Chú ý: Hành động xóa cứng này sẽ làm mất toàn bộ lịch sử đơn đặt cơm trong quá khứ của người này. Khuyên dùng: Đổi trạng thái nhân viên sang resigned để bảo toàn dữ liệu lịch sử.*`

                        await supabase.from('ai_chat_history').insert([
                            { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                            { 
                                tenant_id: tenantId, 
                                user_id: user.id, 
                                session_id: sessionId, 
                                role: 'assistant', 
                                content: replyText,
                                action_pending: true,
                                action_type: 'delete_employee',
                                action_args: tokenPayload.args,
                                confirmation_token: token
                            }
                        ])

                        await logAudit({
                            session_id: sessionId,
                            intent: 'delete_employee',
                            model: modelUsed,
                            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                            permission: 'authorized',
                            status: 'pending_approval',
                            calls: [{ name: 'delete_employee', args: tokenPayload.args }]
                        })

                        return NextResponse.json({
                            reply: replyText,
                            action_pending: true,
                            action_type: 'delete_employee',
                            action_args: tokenPayload.args,
                            confirmation_token: token,
                            timestamp: new Date().toISOString()
                        })
                    } else {
                        try {
                            const execResult = await executeDeleteEmployee(tenantId, resolvedEmp.id, userData)
                            
                            const response2 = await chatInstance.sendMessage({
                                message: [
                                    {
                                        functionResponse: {
                                            name: 'delete_employee',
                                            response: { result: 'success', message: `Đã xóa nhân viên thành công: ${execResult.employeeName}` }
                                        }
                                    }
                                ]
                            })
                            text = response2.text || ''
                            if (modelUsed !== selectedModel) {
                                text += `\n\n> ⚠️ **Hệ thống tự động chuyển đổi mô hình:** Mô hình cao cấp (${selectedModel}) hiện đang quá tải. Cơm Ngon AI đã tự động sử dụng mô hình dự phòng để câu trả lời của anh không bị gián đoạn.`
                            }
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_employee',
                                model: modelUsed,
                                tokensIn: (result?.usageMetadata?.promptTokenCount || 0) + (response2?.usageMetadata?.promptTokenCount || 0),
                                tokensOut: (result?.usageMetadata?.candidatesTokenCount || 0) + (response2?.usageMetadata?.candidatesTokenCount || 0),
                                permission: 'authorized',
                                status: 'success',
                                calls: [{ name: 'delete_employee', args: { employee_id: resolvedEmp.id } }]
                            })
                        } catch (err: any) {
                            text = `✕ **Lỗi thực thi tự động:** ${err.message}`
                            await logAudit({
                                session_id: sessionId,
                                intent: 'delete_employee',
                                model: modelUsed,
                                tokensIn: result?.usageMetadata?.promptTokenCount || 0,
                                tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
                                permission: 'authorized',
                                status: 'failed',
                                errorMsg: err.message || 'Lỗi thực thi tự động',
                                calls: [{ name: 'delete_employee', args: { employee_id: resolvedEmp.id } }]
                            })
                        }
                    }
                    break
                }

                default:
                    break;
            }
        } else if (isHistoricalStatsQuery) {
            // Tự động kích hoạt truy vấn SSOT nếu model không gọi tool cho câu hỏi thống kê
            try {
                const yearMatch = message.match(/202\d/);
                const monthMatch = message.match(/tháng\s*(\d{1,2})/i);
                const isWholeYear = /cả năm|toàn bộ năm|suốt năm|tổng.*năm|năm 202\d/i.test(message);

                const targetYear = yearMatch ? Number(yearMatch[0]) : nowVN.getFullYear();
                let queryStart = `${targetYear}-01-01`;
                let queryEnd = `${targetYear}-12-31`;

                if (monthMatch && !isWholeYear) {
                    const m = Number(monthMatch[1]);
                    const monthStr = String(m).padStart(2, '0');
                    queryStart = `${targetYear}-${monthStr}-01`;
                    const lastDay = new Date(targetYear, m, 0).getDate();
                    queryEnd = `${targetYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
                }

                const mealPrice = data.aiConfig?.meal_price || 37000;
                const extraCost = data.aiConfig?.extra_cost_per_meal || 3000;
                const totalCostPerMeal = mealPrice + extraCost;

                const histStats = await calculateDateRangeStats(supabase, tenantId, queryStart, queryEnd);
                const histTotalMeals = histStats.totalMeals;
                const histNotEating = histStats.totalNotEating;
                const histGuest = histStats.totalGuest;
                const histCookingDays = histStats.cookingDays;
                const employeeMeals = Math.max(0, histTotalMeals - histGuest);
                const employeeTotalOrders = employeeMeals + histNotEating;
                const histCancelRate = employeeTotalOrders > 0 ? ((histNotEating / employeeTotalOrders) * 100).toFixed(1) : '0';
                const histEatRate = employeeTotalOrders > 0 ? ((employeeMeals / employeeTotalOrders) * 100).toFixed(1) : '0';
                const histTotalCost = histTotalMeals * totalCostPerMeal;
                const histTotalSaved = histStats.costSavingsVnd;
                const histAvgMealsPerDay = histCookingDays > 0 ? Math.round(histTotalMeals / histCookingDays) : 0;

                const summaryDataText = `📊 **BÁO CÁO SUẤT ĂN THỰC TẾ (${queryStart} → ${queryEnd})**
- **Khoảng thời gian:** Từ ${queryStart} đến ${queryEnd} (${histCookingDays} ngày nấu)
- **Tổng suất ăn (NV + Khách):** ${histTotalMeals.toLocaleString('vi-VN')} suất
  - Suất nhân viên: ${employeeMeals.toLocaleString('vi-VN')} suất
  - Suất khách (phát sinh): ${histGuest.toLocaleString('vi-VN')} suất
- **Tổng lượt nghỉ ăn:** ${histNotEating.toLocaleString('vi-VN')} lượt (trong đó **${histStats.validOptOuts.toLocaleString('vi-VN')} lượt** báo nghỉ hợp lệ, **${histStats.lateCancellations.toLocaleString('vi-VN')} lượt** báo muộn)
- **Tổng đơn đăng ký của nhân viên:** ${employeeTotalOrders.toLocaleString('vi-VN')} lượt
- **Tỷ lệ ăn nhân viên:** ${histEatRate}%
- **Tỷ lệ hủy/nghỉ nhân viên:** ${histCancelRate}%
- **Trung bình mỗi ngày nấu:** ${histAvgMealsPerDay.toLocaleString('vi-VN')} suất/ngày
- **Chi phí suất ăn:** ${histTotalCost.toLocaleString('vi-VN')} VND (đơn giá ${totalCostPerMeal.toLocaleString('vi-VN')} đ/suất)
- **Tiết kiệm từ các đơn báo nghỉ:** ${histTotalSaved.toLocaleString('vi-VN')} VND`;

                const synthesisPrompt = `Bạn là Lili - Trợ lý AI Cơm Ngon.
Người dùng hỏi: "${message}".

Dưới đây là SỐ LIỆU CHUẨN XÁC VỪA ĐƯỢC TRUY VẤN TỪ CƠ SỞ DỮ LIỆU (chuẩn SSOT):
${summaryDataText}

Yêu cầu trả lời:
1. Trả lời một cách tự nhiên, lịch sự, chuyên nghiệp bằng tiếng Việt.
2. Trích dẫn ĐẦY ĐỦ, CHÍNH XÁC các con số trên theo đúng luật Fact Sheet.
3. Định dạng Markdown rõ ràng, dễ đọc.`;

                let synthText = '';
                try {
                    const synthResult = await ai.models.generateContent({
                        model: modelUsed || 'gemini-2.5-flash',
                        contents: synthesisPrompt
                    });
                    synthText = synthResult?.text || '';
                } catch {}

                text = synthText || summaryDataText;
            } catch (autoStatsErr) {
                console.warn('[AI Chat] Auto SSOT stats fallback error:', autoStatsErr);
            }
        }

        // ===== CRAG: Validate response quality =====
        try {
            const cragResult = validateResponse(
                message,
                dataContext.split('\n').filter(l => l.trim().length > 10),
                text
            )
            log.info('CRAG verdict', { verdict: cragResult.verdict, confidence: cragResult.confidence.toFixed(2) })

            cragInfo = {
                verdict: cragResult.verdict,
                confidence: cragResult.confidence,
                reasons: cragResult.reasons
            }

            const warning = getCRAGWarning(cragResult)
            if (warning) {
                text += warning
            }
        } catch (cragErr) {
            log.warn('CRAG validation failed', { error: String(cragErr) })
        }

        if (!text || text.trim().length === 0) {
            text = 'Dạ em chào anh, hệ thống AI vừa nhận được câu hỏi nhưng chưa tạo được văn bản phản hồi hoàn chỉnh do kết nối tạm thời từ máy chủ ngôn ngữ. Anh vui lòng bấm gửi lại câu hỏi giúp em một lần nữa nhé!'
        }

        // ===== SAVE MESSAGES =====
        try {
            await supabase.from('ai_chat_history').insert([
                { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'user', content: message },
                { tenant_id: tenantId, user_id: user.id, session_id: sessionId, role: 'assistant', content: text },
            ])

            if (sessionId !== 'default') {
                const { data: currentSession } = await supabase
                    .from('ai_chat_sessions').select('message_count')
                    .eq('id', sessionId).single()

                await supabase.from('ai_chat_sessions')
                    .update({
                        message_count: (currentSession?.message_count || 0) + 2,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', sessionId).eq('user_id', user.id)
            }
        } catch (saveError) {
            console.warn('Failed to save chat history:', saveError)
        }

        // ===== LOG AI USAGE (lightweight, no content for privacy) =====
        try {
            const { createAdminClient: createAdm } = await import('@/lib/supabase/admin');
            const adminDb = createAdm();
            await adminDb.from('activity_logs').insert({
                tenant_id: tenantId,
                action: 'ai_chat_query',
                performed_by: user.id,
                performer_name: user.email?.split('@')[0] || 'User',
                target_type: 'ai',
                details: {
                    model: selectedModel,
                    session_id: sessionId,
                }
            });
        } catch { /* non-blocking */ }

        await logAudit({
            session_id: sessionId,
            intent: 'text_query',
            model: modelUsed,
            tokensIn: result?.usageMetadata?.promptTokenCount || 0,
            tokensOut: result?.usageMetadata?.candidatesTokenCount || 0,
            permission: 'authorized',
            status: 'success',
            crag: cragInfo
        })

        return NextResponse.json({
            reply: text,
            transcribed_text: transcribedText || undefined,
            timestamp: new Date().toISOString(),
        })

    } catch (error: any) {
        console.error('AI Chat error:', error)
        const friendlyMessage = parseGeminiError(error)
        return NextResponse.json({ error: friendlyMessage || error.message || 'Lỗi khi chat với AI' }, { status: error?.status || 500 })
    }
}
