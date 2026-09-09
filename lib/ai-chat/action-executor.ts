/**
 * 🛠️ AI Chat Action Executor
 * Quản lý mã hóa token xác nhận và thực thi nghiệp vụ HR & Suất ăn (Human-in-the-loop).
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { encryptApiKey, decryptApiKey } from './crypto'
import { getArchivedEmail } from '@/lib/utils/email-helpers'

export interface ActionTokenPayload {
    action: 
        | 'modify_employee_meal' 
        | 'modify_employee_meal_form'
        | 'create_new_employee'
        | 'change_employee_status'
        | 'change_employee_status_form'
        | 'schedule_employee_resignation'
        | 'schedule_employee_resignation_form'
        | 'send_emergency_announcement'
        | 'set_cooking_exception'
        | 'delete_cooking_exception'
        | 'update_registration_deadline'
        | 'add_guest_meals'
        | 'delete_guest_meals'
        | 'delete_guest_meals_form'
        | 'update_ai_config'
        | 'create_new_shift'
        | 'create_new_group'
        | 'delete_employee'
        | 'delete_employee_form'
    args: {
        // Suất ăn
        employee_id?: string
        employee_name?: string
        date?: string
        register?: boolean
        reason?: string

        // Tạo nhân viên mới
        email?: string
        fullName?: string
        employeeCode?: string
        department?: string
        shift_id?: string
        group_id?: string
        startDate?: string

        // Đổi trạng thái hoạt động
        new_status?: 'active' | 'paused' | 'resigned'

        // Đặt lịch nghỉ việc
        action_type?: 'schedule' | 'cancel'
        resigned_date?: string

        // Thông báo khẩn cấp (Sprint 2)
        content?: string

        // Ngày ngoại lệ (Sprint 2)
        exception_type?: 'no_cook' | 'extra_cook'

        // Hạn chót & Cơm khách (Sprint 3)
        deadline_time?: string
        offset_days?: number
        enabled?: boolean
        allow_late?: boolean
        quantity?: number
        note?: string
        guest_meal_id?: string

        // Cấu hình AI & Chi phí (Sprint 4)
        meal_price?: number
        extra_cost_per_meal?: number
        monthly_fixed_cost?: number
        budget_monthly?: number
        vendor_name?: string
        special_notes?: string
        company_size?: string
        industry?: string

        // Ca ăn & Nhóm ăn (Sprint 5)
        name?: string
        start_time?: string
        end_time?: string
        table_area?: string
    }
    user_id: string
    tenant_id: string
    expires_at: number // timestamp ms
}

/**
 * Mã hóa dữ liệu payload thành Token xác nhận bảo mật
 */
export function generateConfirmationToken(payload: ActionTokenPayload): string {
    const plaintext = JSON.stringify(payload)
    return encryptApiKey(plaintext)
}

/**
 * Giải mã và xác thực Token từ Client gửi lên
 */
export function verifyConfirmationToken(token: string, userId: string, tenantId: string): ActionTokenPayload {
    const plaintext = decryptApiKey(token)
    const payload = JSON.parse(plaintext) as ActionTokenPayload

    // Kiểm tra tính toàn vẹn và hết hạn
    if (payload.user_id !== userId || payload.tenant_id !== tenantId) {
        throw new Error('Mã xác thực không khớp với tài khoản hiện tại.')
    }

    if (Date.now() > payload.expires_at) {
        throw new Error('Yêu cầu xác nhận đã hết hạn (quá 5 phút). Vui lòng thực hiện lại câu lệnh chat.')
    }

    return payload
}

/**
 * Loại bỏ dấu tiếng Việt và chuẩn hóa chuỗi để so khớp mờ
 */
export function removeAccents(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[đĐ]/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tìm kiếm nhân viên mờ theo tên
 */
export function resolveEmployee(employees: any[], employeeName: string) {
    const cleanQuery = removeAccents(employeeName)
    if (!cleanQuery) return []

    // Tìm kiếm tương đối: tên chứa chuỗi truy vấn
    return employees.filter(emp => {
        const cleanFullName = removeAccents(emp.full_name || '')
        const cleanEmail = removeAccents(emp.email || '')
        const cleanCode = removeAccents(emp.employee_code || '')
        return cleanFullName.includes(cleanQuery) || cleanEmail.includes(cleanQuery) || cleanCode.includes(cleanQuery)
    })
}

/**
 * Thực thi cập nhật suất ăn trong DB
 */
export async function executeModifyMeal(
    supabase: SupabaseClient,
    tenantId: string,
    employeeId: string,
    dateStr: string,
    register: boolean,
    reason: string,
    adminUser: any
) {
    // 1. Phân quyền: Chỉ cho phép admin
    if (adminUser.role !== 'admin') {
        throw new Error('Bạn không có quyền thực hiện hành động này. Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa suất ăn của nhân viên.')
    }

    // Tách chuỗi ngày bằng dấu phẩy
    const dates = dateStr.split(',').map(d => d.trim()).filter(Boolean)
    if (dates.length === 0) {
        throw new Error('Không xác định được ngày áp dụng thay đổi suất ăn.')
    }

    // 2. Chặn chỉnh sửa ngày trong quá khứ
    const now = new Date()
    const tzOffset = 7 * 60 * 60 * 1000 // UTC+7
    const todayStr = new Date(now.getTime() + tzOffset).toISOString().split('T')[0]

    for (const d of dates) {
        if (d < todayStr) {
            throw new Error(`Bạn không thể chỉnh sửa suất ăn cho các ngày trong quá khứ (${d}). AI chỉ hỗ trợ đăng ký/hủy cơm cho ngày hiện tại và tương lai.`)
        }
    }

    // Sử dụng adminDb (Service Role) để bypass RLS tránh lỗi vi phạm policy khi Admin chỉnh sửa cho nhân viên khác
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 3. Tìm kiếm nhân viên để lấy tên đầy đủ phục vụ hiển thị kết quả
    const { data: employee, error: empErr } = await adminDb
        .from('users')
        .select('full_name, status')
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .single()

    if (empErr || !employee) {
        throw new Error('Không tìm thấy nhân viên trong hệ thống.')
    }

    if (employee.status === 'resigned') {
        throw new Error(`Nhân viên ${employee.full_name} đã nghỉ việc, không thể thay đổi suất ăn.`)
    }

    // 4. Thực hiện Bulk Upsert suất ăn bằng adminDb
    const status = register ? 'eating' : 'not_eating'
    const ordersToUpsert = dates.map(d => ({
        tenant_id: tenantId,
        user_id: employeeId,
        date: d,
        status: status,
        source: 'ai_chat',
        updated_at: new Date().toISOString()
    }))

    const { error: upsertErr } = await adminDb
        .from('orders')
        .upsert(ordersToUpsert, {
            onConflict: 'tenant_id,user_id,date'
        })

    if (upsertErr) {
        console.error('[ActionExecutor] Bulk upsert orders failed:', upsertErr)
        throw new Error(`Lỗi cập nhật suất ăn trong database: ${upsertErr.message}`)
    }

    // 5. Ghi log hoạt động (Activity Logs)
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'admin_override_meal',
            performed_by: adminUser.id,
            performer_name: adminUser.email?.split('@')[0] || 'Admin',
            target_type: 'order',
            details: {
                employee_id: employeeId,
                employee_name: employee.full_name,
                dates: dates,
                status: status,
                reason: reason || 'Chỉnh sửa qua AI Chatbot',
                source: 'ai_chat'
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write activity log:', logErr)
    }

    // Định dạng danh sách ngày hiển thị, ví dụ: 25/05/2026, 26/05/2026
    const formattedDates = dates.map(d => {
        const parts = d.split('-')
        if (parts.length === 3) {
            const [year, month, day] = parts
            return `${day}/${month}/${year}`
        }
        return d
    }).join(', ')

    return {
        success: true,
        employeeName: employee.full_name,
        date: dateStr,
        dates: dates,
        formattedDates: formattedDates,
        statusStr: register ? 'Đăng ký ăn' : 'Hủy đăng ký ăn'
    }
}

/**
 * Thực thi tạo nhân viên mới qua AI
 */
export async function executeCreateEmployee(
    tenantId: string,
    args: {
        email: string
        fullName: string
        employeeCode?: string
        department?: string
        shift_id?: string
        group_id?: string
        startDate?: string
    },
    adminUser: any
) {
    args.email = args.email.toLowerCase().trim();
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền tạo nhân viên. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Sinh mật khẩu mặc định an toàn cho nhân viên
    const defaultPassword = `ComNgon@2026!${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // 2. Kiểm tra giới hạn nhân viên (max_users) của tenant
    const [{ count: currentUserCount }, { data: tenantLimits }] = await Promise.all([
        adminDb
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['active', 'paused']),
        adminDb
            .from('tenants')
            .select('max_users, plan')
            .eq('id', tenantId)
            .single(),
    ])

    if (tenantLimits?.max_users && (currentUserCount ?? 0) >= tenantLimits.max_users) {
        throw new Error(`Đã đạt giới hạn ${tenantLimits.max_users} nhân viên cho gói dịch vụ hiện tại. Vui lòng liên hệ Admin để nâng cấp gói.`)
    }

    // 3. Tạo Auth User (tự động recycle nếu email cũ đã nghỉ/không có trong public.users)
    let authData: any
    let authError: any

    // Tạo user trước
    ({ data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: args.email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
            full_name: args.fullName,
            role: 'employee',
            employee_code: args.employeeCode || null,
        }
    }))

    if (authError && authError.message?.toLowerCase().includes('already been registered')) {
        // Check trùng email trong public.users
        const { data: oldAuthUsers } = await adminDb
            .from('users')
            .select('id, status, email, employee_code')
            .eq('email', args.email)
            .is('deleted_at', null)

        const publicUser = oldAuthUsers?.[0]
        const isOrphanOrResigned = !publicUser || publicUser.status === 'resigned'

        if (isOrphanOrResigned) {
            // Recycle email cũ
            const { data: authRecords } = await adminDb.rpc('get_auth_user_by_email', { target_email: args.email })
            const oldAuthId: string | null = authRecords?.[0]?.id || null

            if (oldAuthId) {
                if (publicUser) {
                    const timestamp = Date.now()
                    const archivedEmail = `email_resigned_${timestamp}@resigned.com`
                    const archivedCode = publicUser.employee_code ? `code_resigned_${timestamp}_${publicUser.employee_code}` : null
                    
                    await adminDb
                        .from('users')
                        .update({
                            email: archivedEmail,
                            employee_code: archivedCode,
                            is_active: false,
                            status: 'resigned',
                            status_reason: 'Recycled email for new employee',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', publicUser.id)
                }
                // Giải phóng tài khoản auth cũ
                await adminDb.auth.admin.deleteUser(oldAuthId)
            }

            // Tạo lại user mới
            ({ data: authData, error: authError } = await adminDb.auth.admin.createUser({
                email: args.email,
                password: defaultPassword,
                email_confirm: true,
                user_metadata: {
                    full_name: args.fullName,
                    role: 'employee',
                    employee_code: args.employeeCode || null,
                }
            }))
        }
    }

    if (authError) {
        throw new Error(`Lỗi tạo tài khoản Auth: ${authError.message}`)
    }

    const newUserId = authData.user.id

    // 4. Kiểm tra ca ăn & nhóm ăn có thuộc tenant không
    let resolvedShiftId = args.shift_id || null
    let resolvedGroupId = args.group_id || null

    if (resolvedShiftId) {
        const { data: shiftObj } = await adminDb.from('shifts').select('id').eq('id', resolvedShiftId).eq('tenant_id', tenantId).single()
        if (!shiftObj) resolvedShiftId = null
    }
    if (resolvedGroupId) {
        const { data: groupObj } = await adminDb.from('groups').select('id, registration_mode').eq('id', resolvedGroupId).eq('tenant_id', tenantId).single()
        if (!groupObj) resolvedGroupId = null
    }

    // Xác định default_meal_status dựa trên nhóm (opt_in hay opt_out)
    let isOptInGroup = false
    if (resolvedGroupId) {
        const { data: groupInfo } = await adminDb.from('groups').select('registration_mode').eq('id', resolvedGroupId).single()
        if (groupInfo?.registration_mode === 'opt_in') {
            isOptInGroup = true
        }
    }

    const defaultMealStatus = isOptInGroup ? 'not_eating' : 'eating'
    const todayStr = new Date().toISOString().split('T')[0]
    const resolvedStartDate = args.startDate || todayStr

    // 5. Ghi vào public.users
    const { error: insertError } = await adminDb
        .from('users')
        .upsert({
            id: newUserId,
            email: args.email,
            full_name: args.fullName,
            role: 'employee',
            employee_code: args.employeeCode || null,
            shift_id: resolvedShiftId,
            department: args.department || null,
            group_id: resolvedGroupId,
            tenant_id: tenantId,
            is_active: true,
            status: 'active',
            default_meal_status: defaultMealStatus,
            start_date: resolvedStartDate
        })

    if (insertError) {
        // Hủy auth user đã tạo nếu ghi profile thất bại
        await adminDb.auth.admin.deleteUser(newUserId)
        throw new Error(`Lỗi lưu thông tin nhân sự: ${insertError.message}`)
    }

    // 6. Ghi log hoạt động
    await adminDb.from('activity_logs').insert({
        tenant_id: tenantId,
        action: 'CREATE_USER',
        performed_by: adminUser.id,
        performer_name: adminUser.email?.split('@')[0] || 'Admin',
        target_type: 'user',
        target_id: newUserId,
        details: {
            email: args.email,
            full_name: args.fullName,
            role: 'employee',
            created_via: 'ai_chat',
            default_password: defaultPassword
        }
    })

    // 7. Tạo order ăn tự động hôm nay + ngày mai (nếu không phải nhóm opt_in)
    if (!isOptInGroup) {
        try {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            const tomorrowStr = tomorrow.toISOString().split('T')[0]

            const datesToCreate = [todayStr, tomorrowStr].filter(d => d >= resolvedStartDate)

            if (datesToCreate.length > 0) {
                const ordersToInsert = datesToCreate.map(d => ({
                    tenant_id: tenantId,
                    user_id: newUserId,
                    date: d,
                    status: 'eating' as const,
                    locked: false,
                    source: 'admin_create_user'
                }))

                await adminDb.from('orders').upsert(ordersToInsert, { onConflict: 'tenant_id,user_id,date', ignoreDuplicates: true })

                await adminDb.from('activity_logs').insert({
                    tenant_id: tenantId,
                    action: 'system_auto_create_new_employee_orders',
                    performed_by: adminUser.id,
                    performer_name: adminUser.email?.split('@')[0] || 'Admin',
                    target_type: 'order',
                    target_id: newUserId,
                    details: {
                        employee_email: args.email,
                        dates: datesToCreate,
                        status: 'eating',
                        source: 'ai_chat_create_user'
                    }
                })
            }
        } catch (orderErr) {
            console.error('Failed to create initial orders via AI create user:', orderErr)
        }
    }

    return {
        success: true,
        fullName: args.fullName,
        email: args.email,
        employeeCode: args.employeeCode || 'N/A',
        defaultPassword: defaultPassword
    }
}

/**
 * Thực thi thay đổi trạng thái nhân viên qua AI (Hoạt động / Tạm dừng / Nghỉ việc)
 */
export async function executeChangeEmployeeStatus(
    tenantId: string,
    employeeId: string,
    newStatus: 'active' | 'paused' | 'resigned',
    reason: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền thay đổi trạng thái nhân viên. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Lấy thông tin nhân viên cũ
    const { data: employee, error: empErr } = await adminDb
        .from('users')
        .select('id, full_name, email, status, resigned_date')
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .single()

    if (empErr || !employee) {
        throw new Error('Không tìm thấy nhân viên trong hệ thống.')
    }

    if (employee.status === newStatus) {
        throw new Error(`Nhân viên đã ở trạng thái ${newStatus === 'active' ? 'Hoạt động' : newStatus === 'paused' ? 'Tạm dừng' : 'Đã nghỉ'} rồi.`)
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const isResigning = newStatus === 'resigned'
    let archivedEmail = employee.email

    // A. Nếu đổi trạng thái thành nghỉ việc -> Cập nhật Supabase Auth
    if (isResigning) {
        archivedEmail = getArchivedEmail(employee.email)
        const { error: authUpdateError } = await adminDb.auth.admin.updateUserById(
            employeeId,
            { email: archivedEmail }
        )
        if (authUpdateError) {
            console.error('[AI_STATUS_CHANGE] Supabase Auth update failed:', authUpdateError)
            throw new Error(`Không thể đổi email xác thực: ${authUpdateError.message}`)
        }
        console.log(`[AI_STATUS_CHANGE] Archived Auth email: ${employee.email} -> ${archivedEmail}`)
    }

    // 2. Chuẩn bị dữ liệu cập nhật
    const updateData: Record<string, any> = {
        status: newStatus,
        is_active: newStatus === 'active',
        status_changed_at: new Date().toISOString(),
        status_reason: reason.trim() || null,
        updated_at: new Date().toISOString(),
        resigned_date: isResigning ? todayStr : null,
        email: archivedEmail
    }

    // 3. Cập nhật DB
    const { error: updateErr } = await adminDb
        .from('users')
        .update(updateData)
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)

    if (updateErr) {
        throw new Error(`Lỗi cập nhật trạng thái nhân sự: ${updateErr.message}`)
    }

    // 4. Side-effects: Hủy suất ăn tương lai nếu Tạm dừng / Nghỉ việc
    let cancelledCount = 0
    if (newStatus === 'resigned' || newStatus === 'paused') {
        const { data: cancelledOrders } = await adminDb
            .from('orders')
            .update({
                status: 'not_eating',
                updated_at: new Date().toISOString(),
                source: 'admin_status_change'
            })
            .eq('user_id', employeeId)
            .eq('status', 'eating')
            .gte('date', todayStr)
            .select('id')

        cancelledCount = cancelledOrders?.length || 0

        if (newStatus === 'resigned') {
            // Tẩy nhóm ăn và tắt notifications
            await adminDb.from('users').update({ group_id: null }).eq('id', employeeId)
            await adminDb.from('push_subscriptions').update({ is_active: false }).eq('user_id', employeeId)
        }

        if (cancelledCount > 0) {
            await adminDb.from('activity_logs').insert({
                tenant_id: tenantId,
                action: 'AUTO_CANCEL_FUTURE_ORDERS',
                performed_by: adminUser.id,
                performer_name: adminUser.email?.split('@')[0] || 'Admin',
                target_type: 'user',
                target_id: employeeId,
                details: {
                    employee_name: employee.full_name,
                    cancelled_count: cancelledCount,
                    reason: `Đổi trạng thái thành ${newStatus} qua AI`,
                    from_date: todayStr
                }
            })
        }
    }

    // 5. Ghi log hoạt động đổi trạng thái
    await adminDb.from('activity_logs').insert({
        tenant_id: tenantId,
        action: 'CHANGE_EMPLOYEE_STATUS',
        performed_by: adminUser.id,
        performer_name: adminUser.email?.split('@')[0] || 'Admin',
        target_type: 'user',
        target_id: employeeId,
        details: {
            employee_name: employee.full_name,
            employee_email: employee.email,
            from_status: employee.status,
            to_status: newStatus,
            reason: reason.trim() || 'Cập nhật qua AI Chatbot',
            cancelled_orders_count: cancelledCount
        }
    })

    return {
        success: true,
        employeeName: employee.full_name,
        oldStatus: employee.status,
        newStatus: newStatus,
        cancelledOrdersCount: cancelledCount
    }
}

/**
 * Thực thi đặt lịch hoặc hủy lịch nghỉ việc cho nhân viên qua AI
 */
export async function executeScheduleResignation(
    tenantId: string,
    employeeId: string,
    actionType: 'schedule' | 'cancel',
    resignedDate: string | null,
    reason: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền lên lịch nghỉ việc cho nhân viên. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Lấy thông tin nhân viên cũ
    const { data: employee, error: empErr } = await adminDb
        .from('users')
        .select('id, full_name, email, status, resigned_date')
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .single()

    if (empErr || !employee) {
        throw new Error('Không tìm thấy nhân viên trong hệ thống.')
    }

    const todayStr = new Date().toISOString().split('T')[0]

    if (actionType === 'schedule') {
        if (!resignedDate) {
            throw new Error('Thiếu ngày áp dụng nghỉ việc để lên lịch.')
        }

        if (resignedDate <= todayStr) {
            throw new Error('Ngày đặt lịch nghỉ việc phải ở tương lai. Nếu nghỉ ngay hôm nay, hãy dùng lệnh Đổi trạng thái trực tiếp.')
        }

        // Cập nhật ngày nghỉ việc
        const { error: updateErr } = await adminDb
            .from('users')
            .update({
                resigned_date: resignedDate,
                status_reason: reason.trim() || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', employeeId)
            .eq('tenant_id', tenantId)

        if (updateErr) {
            throw new Error(`Lỗi khi cập nhật ngày nghỉ việc: ${updateErr.message}`)
        }

        // Hủy các suất ăn đăng ký từ ngày nghỉ việc trở đi
        const { data: cancelledOrders } = await adminDb
            .from('orders')
            .update({
                status: 'not_eating',
                updated_at: new Date().toISOString(),
                source: 'admin_status_change'
            })
            .eq('user_id', employeeId)
            .eq('status', 'eating')
            .gte('date', resignedDate)
            .select('id')

        const cancelledCount = cancelledOrders?.length || 0

        if (cancelledCount > 0) {
            await adminDb.from('activity_logs').insert({
                tenant_id: tenantId,
                action: 'AUTO_CANCEL_SCHEDULED_ORDERS',
                performed_by: adminUser.id,
                performer_name: adminUser.email?.split('@')[0] || 'Admin',
                target_type: 'user',
                target_id: employeeId,
                details: {
                    employee_name: employee.full_name,
                    cancelled_count: cancelledCount,
                    resigned_date: resignedDate,
                    reason: `Lên lịch nghỉ việc qua AI từ ngày ${resignedDate}`
                }
            })
        }

        // Ghi log hoạt động SCHEDULE_RESIGNATION
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'SCHEDULE_RESIGNATION',
            performed_by: adminUser.id,
            performer_name: adminUser.email?.split('@')[0] || 'Admin',
            target_type: 'user',
            target_id: employeeId,
            details: {
                employee_name: employee.full_name,
                employee_email: employee.email,
                to_status: 'scheduled_resignation',
                resigned_date: resignedDate,
                reason: reason.trim() || 'Lên lịch nghỉ việc qua AI',
                cancelled_orders_count: cancelledCount
            }
        })

        return {
            success: true,
            actionType: 'schedule',
            employeeName: employee.full_name,
            resignedDate: resignedDate,
            cancelledOrdersCount: cancelledCount
        }

    } else {
        // actionType === 'cancel' (Hủy lịch nghỉ việc)
        if (!employee.resigned_date) {
            throw new Error('Nhân viên này hiện chưa được đặt lịch nghỉ việc trước đó.')
        }

        const oldResignedDate = employee.resigned_date

        // Xóa ngày nghỉ việc
        const { error: updateErr } = await adminDb
            .from('users')
            .update({
                resigned_date: null,
                status_reason: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', employeeId)
            .eq('tenant_id', tenantId)

        if (updateErr) {
            throw new Error(`Lỗi khi hủy lịch nghỉ việc: ${updateErr.message}`)
        }

        // Khôi phục các suất ăn bị tự động hủy từ resigned_date trở đi
        const { data: restoredOrders } = await adminDb
            .from('orders')
            .update({
                status: 'eating',
                updated_at: new Date().toISOString(),
                source: 'admin_status_change'
            })
            .eq('user_id', employeeId)
            .eq('status', 'not_eating')
            .eq('source', 'admin_status_change') // Chỉ khôi phục những suất bị tự động hủy do đổi trạng thái
            .gte('date', oldResignedDate)
            .select('id')

        const restoredCount = restoredOrders?.length || 0

        // Ghi log hoạt động CANCEL_SCHEDULED_RESIGNATION
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'CANCEL_SCHEDULED_RESIGNATION',
            performed_by: adminUser.id,
            performer_name: adminUser.email?.split('@')[0] || 'Admin',
            target_type: 'user',
            target_id: employeeId,
            details: {
                employee_name: employee.full_name,
                cancelled_resigned_date: oldResignedDate,
                restored_orders_count: restoredCount
            }
        })

        return {
            success: true,
            actionType: 'cancel',
            employeeName: employee.full_name,
            oldResignedDate: oldResignedDate,
            restoredOrdersCount: restoredCount
        }
    }
}

/**
 * Thực thi gửi thông báo khẩn cấp tới toàn bộ nhân viên qua AI
 */
export async function executeSendAnnouncement(
    tenantId: string,
    content: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager' && adminUser.role !== 'kitchen') {
        throw new Error('Bạn không có quyền gửi thông báo khẩn cấp. Chỉ Admin, Manager hoặc Bếp mới có quyền này.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // Lọc bỏ thẻ HTML và cắt ngắn
    const sanitizedContent = String(content).replace(/<[^>]*>/g, '').trim().substring(0, 500)

    if (!sanitizedContent) {
        throw new Error('Nội dung thông báo không được để trống.')
    }

    const isKitchen = adminUser.role?.toLowerCase() === 'kitchen'
    const title = isKitchen ? '🍳 Thông báo từ Bếp' : '📢 Thông báo từ Admin'

    // 1. Insert vào bảng notifications
    const { data: newNotification, error: insertError } = await adminDb
        .from('notifications')
        .insert({
            tenant_id: tenantId,
            title: title,
            message: sanitizedContent,
            type: 'info',
            target_audience: 'all',
            created_by: adminUser.id,
            is_active: true
        })
        .select()
        .single()

    if (insertError) {
        throw new Error(`Lỗi lưu thông báo vào database: ${insertError.message}`)
    }

    // 2. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'SEND_NOTIFICATION',
            target_type: 'notification',
            details: {
                performer_name: adminUser.full_name || adminUser.email?.split('@')[0] || 'Admin',
                title: title,
                content: sanitizedContent,
                message: `${adminUser.full_name || adminUser.email?.split('@')[0] || 'Admin'} gửi thông báo qua AI: "${sanitizedContent.substring(0, 100)}"`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write announcement log:', logErr)
    }

    // 3. Gửi Web Push Notification
    let pushSentCount = 0
    let pushTotalCount = 0
    try {
        const { sendPushToTenant } = await import('@/lib/push-helpers')
        const pushResult = await sendPushToTenant(
            tenantId,
            title,
            sanitizedContent,
            { target_audience: 'all', url: '/dashboard' }
        )
        pushSentCount = pushResult.sent
        pushTotalCount = pushResult.total
    } catch (pushErr) {
        console.warn('[ActionExecutor] Send push failed (non-critical):', pushErr)
    }

    return {
        success: true,
        notificationId: newNotification.id,
        title,
        content: sanitizedContent,
        pushSentCount,
        pushTotalCount
    }
}

/**
 * Thực thi thiết lập ngày ngoại lệ nấu ăn qua AI
 */
export async function executeSetCookingException(
    tenantId: string,
    dateStr: string,
    exceptionType: 'no_cook' | 'extra_cook',
    reason: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager' && adminUser.role !== 'kitchen') {
        throw new Error('Bạn không có quyền thiết lập ngày ngoại lệ nấu ăn. Yêu cầu quyền Admin, Manager hoặc Bếp.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Upsert ngày ngoại lệ vào bảng cooking_exceptions
    const { data: exception, error: upsertErr } = await adminDb
        .from('cooking_exceptions')
        .upsert({
            tenant_id: tenantId,
            date: dateStr,
            type: exceptionType,
            reason: reason.trim() || '',
            created_by: adminUser.id
        }, { onConflict: 'tenant_id,date' })
        .select('cancelled_count')
        .single()

    if (upsertErr) {
        throw new Error(`Lỗi ghi ngày ngoại lệ: ${upsertErr.message}`)
    }

    const cancelledCount = exception?.cancelled_count || 0

    // 2. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'SET_COOKING_EXCEPTION',
            target_type: 'cooking_exception',
            details: {
                date: dateStr,
                type: exceptionType,
                reason: reason.trim(),
                cancelled_count: cancelledCount,
                message: `Đặt ngày ngoại lệ ${dateStr} (${exceptionType === 'no_cook' ? 'nghỉ bếp' : 'nấu bù'}): "${reason.trim()}"`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write exception log:', logErr)
    }

    return {
        success: true,
        date: dateStr,
        exceptionType,
        reason: reason.trim(),
        cancelledCount
    }
}

/**
 * Thực thi xóa ngày ngoại lệ nấu ăn qua AI (để khôi phục lịch nấu bình thường)
 */
export async function executeDeleteCookingException(
    tenantId: string,
    dateStr: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager' && adminUser.role !== 'kitchen') {
        throw new Error('Bạn không có quyền xóa ngày ngoại lệ nấu ăn. Yêu cầu quyền Admin, Manager hoặc Bếp.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Kiểm tra ngày ngoại lệ có tồn tại không và lấy cancelled_count đã lưu từ trước
    const { data: existing, error: findErr } = await adminDb
        .from('cooking_exceptions')
        .select('id, type, cancelled_count')
        .eq('tenant_id', tenantId)
        .eq('date', dateStr)
        .single()

    if (findErr || !existing) {
        throw new Error(`Không tìm thấy ngày ngoại lệ nào được thiết lập cho ngày ${dateStr}.`)
    }

    const restoredCount = existing.cancelled_count || 0

    // 2. Xóa ngày ngoại lệ (trigger BEFORE DELETE sẽ tự động khôi phục suất ăn)
    const { error: deleteErr } = await adminDb
        .from('cooking_exceptions')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('date', dateStr)

    if (deleteErr) {
        throw new Error(`Lỗi xóa ngày ngoại lệ: ${deleteErr.message}`)
    }

    // 3. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'DELETE_COOKING_EXCEPTION',
            target_type: 'cooking_exception',
            details: {
                date: dateStr,
                restored_count: restoredCount,
                message: `Xóa ngày ngoại lệ ${dateStr}`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write delete exception log:', logErr)
    }

    return {
        success: true,
        date: dateStr,
        restoredCount
    }
}

/**
 * Thực thi cập nhật cài đặt hạn chót đăng ký ăn qua AI (Sprint 3)
 */
export async function executeUpdateDeadline(
    tenantId: string,
    params: {
        deadline_time?: string
        offset_days?: number
        enabled?: boolean
        allow_late?: boolean
    },
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền thay đổi cấu hình hạn chót. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    const settingsToUpsert = []
    
    if (params.deadline_time !== undefined) {
        settingsToUpsert.push({ key: 'registration_deadline', tenant_id: tenantId, value: params.deadline_time, updated_at: new Date().toISOString() })
    }
    if (params.offset_days !== undefined) {
        settingsToUpsert.push({ key: 'registration_deadline_offset', tenant_id: tenantId, value: String(params.offset_days), updated_at: new Date().toISOString() })
    }
    if (params.enabled !== undefined) {
        settingsToUpsert.push({ key: 'registration_deadline_enabled', tenant_id: tenantId, value: String(params.enabled), updated_at: new Date().toISOString() })
    }
    if (params.allow_late !== undefined) {
        settingsToUpsert.push({ key: 'allow_late_registration', tenant_id: tenantId, value: String(params.allow_late), updated_at: new Date().toISOString() })
    }

    if (settingsToUpsert.length === 0) {
        throw new Error('Không có cấu hình nào cần cập nhật.')
    }

    for (const setting of settingsToUpsert) {
        const { error } = await adminDb
            .from('system_settings')
            .upsert(setting, { onConflict: 'key,tenant_id' })

        if (error) throw new Error(`Lỗi cập nhật cấu hình ${setting.key}: ${error.message}`)
    }

    // Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'registration_deadline_updated',
            target_type: 'settings',
            details: params
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write deadline update log:', logErr)
    }

    return {
        success: true,
        updatedSettings: params
    }
}

/**
 * Thực thi đăng ký thêm suất cơm khách phát sinh qua AI (Sprint 3)
 */
export async function executeAddGuestMeals(
    tenantId: string,
    dateStr: string,
    quantity: number,
    note: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager' && adminUser.role !== 'kitchen') {
        throw new Error('Bạn không có quyền đăng ký suất ăn khách. Yêu cầu quyền Admin, Manager hoặc Bếp.')
    }

    const now = new Date()
    const tzOffset = 7 * 60 * 60 * 1000 // UTC+7
    const todayStr = new Date(now.getTime() + tzOffset).toISOString().split('T')[0]
    if (dateStr < todayStr) {
        throw new Error(`Bạn không thể đăng ký suất ăn khách cho các ngày trong quá khứ (${dateStr}). AI chỉ hỗ trợ đăng ký cho ngày hiện tại và tương lai.`)
    }

    if (quantity < 1 || quantity > 100) {
        throw new Error('Số lượng suất ăn khách phải nằm trong khoảng từ 1 đến 100.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // Clean note
    const sanitizedNote = note ? String(note).replace(/<[^>]*>/g, '').trim().substring(0, 500) : null

    const { data: newEntry, error } = await adminDb
        .from('guest_meals')
        .insert({
            date: dateStr,
            quantity,
            note: sanitizedNote,
            created_by: adminUser.id,
            tenant_id: tenantId
        })
        .select()
        .single()

    if (error) {
        throw new Error(`Lỗi tạo suất ăn khách: ${error.message}`)
    }

    // Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'ADD_GUEST_MEALS',
            target_type: 'guest_meal',
            details: {
                performer_name: adminUser.full_name || adminUser.email?.split('@')[0] || 'Admin',
                quantity: quantity,
                date: dateStr,
                note: sanitizedNote,
                message: `${adminUser.full_name || 'Admin'} thêm ${quantity} suất phát sinh ngày ${dateStr}${sanitizedNote ? ': ' + sanitizedNote : ''}`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write add guest meals log:', logErr)
    }

    return {
        success: true,
        guestMeal: newEntry
    }
}

/**
 * Thực thi xóa/hủy suất cơm khách phát sinh qua AI (Sprint 3)
 */
export async function executeDeleteGuestMeals(
    tenantId: string,
    guestMealId: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager' && adminUser.role !== 'kitchen') {
        throw new Error('Bạn không có quyền hủy suất ăn khách. Yêu cầu quyền Admin, Manager hoặc Bếp.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Kiểm tra bản ghi có tồn tại không
    const { data: existing, error: findErr } = await adminDb
        .from('guest_meals')
        .select('date, quantity, note')
        .eq('id', guestMealId)
        .eq('tenant_id', tenantId)
        .single()

    if (findErr || !existing) {
        throw new Error('Không tìm thấy suất cơm khách cần xóa hoặc bạn không có quyền trên tài nguyên này.')
    }

    // Chặn xóa cơm khách trong quá khứ
    const now = new Date()
    const tzOffset = 7 * 60 * 60 * 1000 // UTC+7
    const todayStr = new Date(now.getTime() + tzOffset).toISOString().split('T')[0]
    if (existing.date < todayStr) {
        throw new Error(`Bạn không thể hủy suất cơm khách trong quá khứ (${existing.date}). AI chỉ hỗ trợ chỉnh sửa/hủy suất ăn khách từ ngày hiện tại trở đi.`)
    }

    // 2. Xóa bản ghi
    const { error: deleteErr } = await adminDb
        .from('guest_meals')
        .delete()
        .eq('id', guestMealId)
        .eq('tenant_id', tenantId)

    if (deleteErr) {
        throw new Error(`Lỗi xóa suất cơm khách: ${deleteErr.message}`)
    }

    // 3. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'DELETE_GUEST_MEALS',
            target_type: 'guest_meal',
            details: {
                performer_name: adminUser.full_name || adminUser.email?.split('@')[0] || 'Admin',
                date: existing.date,
                quantity: existing.quantity,
                message: `${adminUser.full_name || 'Admin'} xóa ${existing.quantity} suất cơm khách ngày ${existing.date}`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write delete guest meals log:', logErr)
    }

    return {
        success: true,
        date: existing.date,
        quantity: existing.quantity
    }
}

/**
 * Thực thi cập nhật cấu hình chi phí, ngân sách và AI của Tenant (Sprint 4)
 */
export async function executeUpdateAiConfig(
    tenantId: string,
    params: {
        meal_price?: number
        extra_cost_per_meal?: number
        monthly_fixed_cost?: number
        budget_monthly?: number
        vendor_name?: string
        special_notes?: string
        company_size?: string
        industry?: string
    },
    adminUser: any
) {
    // 1. Phân quyền RBAC: Chỉ cho phép admin hoặc manager
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền cập nhật cấu hình AI & chi phí. Hành động này yêu cầu quyền Admin hoặc Manager.')
    }

    // 2. Kiểm tra dữ liệu đầu vào và ràng buộc giới hạn (Trần chi phí bảo vệ hệ thống)
    if (params.meal_price !== undefined) {
        if (params.meal_price < 0 || params.meal_price > 200000) {
            throw new Error('Giá suất ăn (meal_price) phải là số dương và không vượt quá 200.000đ.')
        }
    }
    if (params.extra_cost_per_meal !== undefined) {
        if (params.extra_cost_per_meal < 0 || params.extra_cost_per_meal > 200000) {
            throw new Error('Phụ phí suất ăn (extra_cost_per_meal) phải là số dương và không vượt quá 200.000đ.')
        }
    }
    if (params.monthly_fixed_cost !== undefined) {
        if (params.monthly_fixed_cost < 0 || params.monthly_fixed_cost > 1000000000) {
            throw new Error('Chi phí cố định tháng (monthly_fixed_cost) phải là số dương và không vượt quá 1 tỷđ.')
        }
    }
    if (params.budget_monthly !== undefined) {
        if (params.budget_monthly < 0 || params.budget_monthly > 1000000000) {
            throw new Error('Ngân sách tháng (budget_monthly) phải là số dương và không vượt quá 1 tỷđ.')
        }
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 3. Lấy dữ liệu cấu hình hiện tại để so sánh và ghi log chi tiết
    const { data: existing, error: getErr } = await adminDb
        .from('tenant_ai_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle()

    // 4. Chuẩn bị dữ liệu cập nhật
    const updateData: any = {
        updated_at: new Date().toISOString()
    }
    
    const changes: string[] = []

    if (params.meal_price !== undefined) {
        updateData.meal_price = params.meal_price
        if (!existing || existing.meal_price !== params.meal_price) {
            changes.push(`Giá suất ăn: ${params.meal_price.toLocaleString('vi-VN')}đ (cũ: ${existing ? existing.meal_price.toLocaleString('vi-VN') + 'đ' : 'chưa cấu hình'})`)
        }
    }
    if (params.extra_cost_per_meal !== undefined) {
        updateData.extra_cost_per_meal = params.extra_cost_per_meal
        if (!existing || existing.extra_cost_per_meal !== params.extra_cost_per_meal) {
            changes.push(`Phụ phí: ${params.extra_cost_per_meal.toLocaleString('vi-VN')}đ (cũ: ${existing ? existing.extra_cost_per_meal.toLocaleString('vi-VN') + 'đ' : 'chưa cấu hình'})`)
        }
    }
    if (params.monthly_fixed_cost !== undefined) {
        updateData.monthly_fixed_cost = params.monthly_fixed_cost
        if (!existing || existing.monthly_fixed_cost !== params.monthly_fixed_cost) {
            changes.push(`Chi phí cố định: ${params.monthly_fixed_cost.toLocaleString('vi-VN')}đ (cũ: ${existing ? existing.monthly_fixed_cost.toLocaleString('vi-VN') + 'đ' : 'chưa cấu hình'})`)
        }
    }
    if (params.budget_monthly !== undefined) {
        updateData.budget_monthly = params.budget_monthly
        if (!existing || existing.budget_monthly !== params.budget_monthly) {
            changes.push(`Ngân sách tháng: ${params.budget_monthly.toLocaleString('vi-VN')}đ (cũ: ${existing ? (existing.budget_monthly ? existing.budget_monthly.toLocaleString('vi-VN') + 'đ' : 'chưa cấu hình') : 'chưa cấu hình'})`)
        }
    }
    if (params.vendor_name !== undefined) {
        const cleanVendor = params.vendor_name ? String(params.vendor_name).replace(/<[^>]*>/g, '').trim().substring(0, 100) : null
        updateData.vendor_name = cleanVendor
        if (!existing || existing.vendor_name !== cleanVendor) {
            changes.push(`Nhà cung cấp: "${cleanVendor || 'không có'}" (cũ: "${existing ? existing.vendor_name || 'chưa cấu hình' : 'chưa cấu hình'}")`)
        }
    }
    if (params.special_notes !== undefined) {
        const cleanNotes = params.special_notes ? String(params.special_notes).replace(/<[^>]*>/g, '').trim().substring(0, 1000) : null
        updateData.special_notes = cleanNotes
        if (!existing || existing.special_notes !== cleanNotes) {
            changes.push(`Ghi chú đặc biệt: "${cleanNotes ? cleanNotes.substring(0, 50) + (cleanNotes.length > 50 ? '...' : '') : 'không có'}"`)
        }
    }
    if (params.company_size !== undefined) {
        updateData.company_size = params.company_size
        if (!existing || existing.company_size !== params.company_size) {
            changes.push(`Quy mô công ty: "${params.company_size}"`)
        }
    }
    if (params.industry !== undefined) {
        const cleanIndustry = params.industry ? String(params.industry).trim().substring(0, 100) : null
        updateData.industry = cleanIndustry
        if (!existing || existing.industry !== cleanIndustry) {
            changes.push(`Ngành nghề: "${cleanIndustry}"`)
        }
    }

    if (changes.length === 0) {
        return {
            success: true,
            message: 'Không có thay đổi nào được thực hiện do dữ liệu trùng khớp với cấu hình hiện tại.',
            updatedConfig: existing
        }
    }

    // 5. Thực thi Update hoặc Insert (Upsert)
    let queryResult;
    if (existing) {
        queryResult = await adminDb
            .from('tenant_ai_config')
            .update(updateData)
            .eq('tenant_id', tenantId)
            .select()
            .single()
    } else {
        queryResult = await adminDb
            .from('tenant_ai_config')
            .insert({
                tenant_id: tenantId,
                meal_price: 25000, // giá trị mặc định nếu chèn mới
                extra_cost_per_meal: 0,
                monthly_fixed_cost: 0,
                ...updateData
            })
            .select()
            .single()
    }

    if (queryResult.error) {
        throw new Error(`Lỗi cập nhật cấu hình AI & chi phí: ${queryResult.error.message}`)
    }

    // 6. Ghi Activity Log chi tiết các thay đổi
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'UPDATE_AI_CONFIG',
            details: `${adminUser.full_name || 'Admin'} cập nhật cấu hình AI: ${changes.join(', ')}`
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write update AI config log:', logErr)
    }

    return {
        success: true,
        message: 'Cập nhật cấu hình AI & chi phí thành công.',
        updatedConfig: queryResult.data
    }
}

/**
 * Thực thi tạo ca ăn mới qua AI
 */
export async function executeCreateShift(
    tenantId: string,
    args: {
        name: string
        start_time: string
        end_time: string
    },
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền tạo ca ăn. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Kiểm tra giới hạn ca ăn (multi_shift và max_shifts)
    const { isFeatureEnabled, checkResourceLimit } = await import('@/lib/supabase/tenant-features')
    const multiShiftEnabled = await isFeatureEnabled(tenantId, 'multi_shift')
    if (!multiShiftEnabled) {
        const { count } = await adminDb
            .from('shifts')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
        if ((count ?? 0) >= 1) {
            throw new Error('Gói dịch vụ hiện tại không hỗ trợ đa ca ăn. Vui lòng nâng cấp gói để tạo thêm ca.')
        }
    }

    const limitCheck = await checkResourceLimit(tenantId, 'shifts')
    if (!limitCheck.allowed) {
        throw new Error(limitCheck.message)
    }

    // 2. Kiểm tra trùng tên ca làm việc trong cùng tenant
    const { data: existing } = await adminDb
        .from('shifts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', args.name.trim())
        .maybeSingle()

    if (existing) {
        throw new Error(`Tên ca ăn "${args.name.trim()}" đã tồn tại trong hệ thống.`)
    }

    // 3. Thực hiện insert
    const { data, error } = await adminDb
        .from('shifts')
        .insert({
            tenant_id: tenantId,
            name: args.name.trim(),
            start_time: args.start_time,
            end_time: args.end_time
        })
        .select()
        .single()

    if (error) {
        throw new Error(`Lỗi tạo ca ăn: ${error.message}`)
    }

    // 4. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'shift_created',
            target_type: 'shift',
            target_id: data.id,
            details: {
                name: args.name.trim(),
                start_time: args.start_time,
                end_time: args.end_time,
                message: `${adminUser.full_name || 'Admin'} tạo ca ăn mới: "${args.name.trim()}" (${args.start_time} - ${args.end_time})`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write shift create log:', logErr)
    }

    return {
        success: true,
        shift: data
    }
}

/**
 * Thực thi tạo nhóm ăn mới qua AI
 */
export async function executeCreateGroup(
    tenantId: string,
    args: {
        name: string
        shift_id?: string
        table_area?: string
        department?: string
    },
    adminUser: any
) {
    if (adminUser.role !== 'admin' && adminUser.role !== 'manager') {
        throw new Error('Bạn không có quyền tạo nhóm ăn. Yêu cầu quyền Admin hoặc Manager.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Kiểm tra giới hạn nhóm ăn
    const { checkResourceLimit } = await import('@/lib/supabase/tenant-features')
    const limitCheck = await checkResourceLimit(tenantId, 'groups')
    if (!limitCheck.allowed) {
        throw new Error(limitCheck.message)
    }

    // 2. Xác thực shift_id nếu có
    if (args.shift_id) {
        const { data: shift } = await adminDb
            .from('shifts')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('id', args.shift_id)
            .maybeSingle()

        if (!shift) {
            throw new Error('Không tìm thấy ca ăn liên kết trong hệ thống.')
        }
    }

    // 3. Thực hiện insert
    const { data, error } = await adminDb
        .from('groups')
        .insert({
            tenant_id: tenantId,
            name: args.name.trim(),
            shift_id: args.shift_id || null,
            table_area: args.table_area?.trim() || null,
            department: args.department?.trim() || null
        })
        .select(`
            *,
            shift:shifts (*)
        `)
        .single()

    if (error) {
        throw new Error(`Lỗi tạo nhóm ăn: ${error.message}`)
    }

    // 4. Ghi activity log
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            performed_by: adminUser.id,
            action: 'group_created',
            target_type: 'group',
            target_id: data.id,
            details: {
                name: args.name.trim(),
                shift_id: args.shift_id || null,
                table_area: args.table_area || null,
                department: args.department || null,
                message: `${adminUser.full_name || 'Admin'} tạo nhóm ăn mới: "${args.name.trim()}"`
            }
        })
    } catch (logErr) {
        console.warn('[ActionExecutor] Failed to write group create log:', logErr)
    }

    return {
        success: true,
        group: data
    }
}

/**
 * Thực thi xóa hoàn toàn nhân viên qua AI (Xóa profile và auth account)
 */
export async function executeDeleteEmployee(
    tenantId: string,
    employeeId: string,
    adminUser: any
) {
    if (adminUser.role !== 'admin') {
        throw new Error('Chỉ Quản trị viên (Admin) mới có quyền xóa hoàn toàn nhân viên khỏi hệ thống.')
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // 1. Kiểm tra nhân viên có thuộc Tenant không
    const { data: employee, error: empError } = await adminDb
        .from('users')
        .select('id, email, full_name, role, tenant_id')
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (empError || !employee) {
        throw new Error('Nhân viên không tồn tại hoặc bạn không có quyền xóa nhân viên của tổ chức khác.')
    }

    // 2. Ghi activity log TRƯỚC KHI XÓA
    try {
        await adminDb.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'DELETE_USER',
            performed_by: adminUser.id,
            target_type: 'user',
            target_id: employee.id,
            details: {
                email: employee.email,
                full_name: employee.full_name,
                role: employee.role,
                message: `${adminUser.full_name || 'Admin'} xóa hoàn toàn tài khoản nhân viên ${employee.full_name} (${employee.email})`
            }
        })
    } catch (logErr) {
        console.error('[ActionExecutor] Failed to write DELETE_USER log:', logErr)
    }

    // 3. Xóa liên kết ca/nhóm nếu có
    await adminDb.from('user_meal_groups').delete().eq('user_id', employee.id)

    // 4. Xóa record user trong DB (ràng buộc CASCADE tự động xóa orders)
    const { error: deleteDbErr } = await adminDb
        .from('users')
        .delete()
        .eq('id', employee.id)
        .eq('tenant_id', tenantId)

    if (deleteDbErr) {
        throw new Error(`Lỗi xóa dữ liệu profile nhân viên: ${deleteDbErr.message}`)
    }

    // 5. Xóa tài khoản trên Supabase Auth
    try {
        const { data: authRecords } = await adminDb.rpc('get_auth_user_by_email', { target_email: employee.email })
        const authId = authRecords?.[0]?.id || employee.id
        await adminDb.auth.admin.deleteUser(authId)
    } catch (authDelErr) {
        console.warn('[ActionExecutor] Auth account delete warning (non-blocking):', authDelErr)
    }

    return {
        success: true,
        employeeName: employee.full_name,
        employeeEmail: employee.email
    }
}
