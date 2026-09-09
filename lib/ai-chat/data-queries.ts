/**
 * 📊 AI Chat Data Queries
 * Parallel Supabase queries cho AI Chat context.
 * 
 * ⚠️ AUDIT-FIX (2026-05-13):
 * - Xóa fetch `orders`, `cookingExceptions`, `guestMeals` — đã được `calculateDateRangeStats` handle (SSOT).
 * - Thêm `default_meal_status`, `resigned_date` vào employees select để employeeMap đồng bộ với _raw.allEmployees.
 */
import { SupabaseClient } from '@supabase/supabase-js'

export interface TenantDataResult {
    tenantInfo: any
    employees: any[]
    departments: any[]
    shifts: any[]
    groups: any[]
    announcements: any[]
    urgentNotifs: any[]
    activityLogs: any[]
    systemSettings: any[]
    aiConfig: any
    knowledgeDocs: any[]
    // ⚠️ AUDIT-FIX: orders, cookingExceptions, guestMeals đã bị xóa
    // calculateDateRangeStats (qua getSSOTMealStats) fetch chúng rồi
}

/**
 * Fetch dữ liệu tenant cho AI Chat context.
 * Chỉ fetch metadata + employee list. Meal stats do calculateDateRangeStats xử lý.
 */
export async function fetchAllTenantData(
    supabase: SupabaseClient,
    tenantId: string,
    _startDate: string,   // Giữ signature tương thích, không dùng nữa
    _today: string,
): Promise<TenantDataResult> {
    const [
        { data: tenantInfo },
        { data: employees },
        { data: departments },
        { data: shifts },
        { data: groups },
        { data: announcements },
        { data: urgentNotifs },
        { data: activityLogs },
        { data: systemSettings },
        { data: aiConfig },
        { data: knowledgeDocs },
    ] = await Promise.all([
        // 1. Tenant info
        supabase.from('tenants')
            .select('name, slug, status, plan, max_users, settings, is_active, trial_ends_at, subscription_status')
            .eq('id', tenantId).single(),
        // 2. ALL Employees (active + paused + resigned) — AUDIT-FIX: thêm default_meal_status, resigned_date
        supabase.from('users')
            .select('id, full_name, email, department, role, is_active, status, employee_code, shift_id, group_id, created_at, start_date, default_meal_status, resigned_date')
            .eq('tenant_id', tenantId).is('deleted_at', null),
        // 3. Departments
        supabase.from('departments')
            .select('id, name, description').eq('tenant_id', tenantId),
        // 4. Shifts
        supabase.from('shifts')
            .select('id, name, start_time, end_time, description, active').eq('tenant_id', tenantId),
        // 5. Groups
        supabase.from('groups')
            .select('id, name, department, shift_id, table_area, description, active').eq('tenant_id', tenantId),
        // 6. Announcements
        supabase.from('announcements')
            .select('title, content, priority, active, start_date, end_date, created_at')
            .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
        // 7. Urgent notifications
        supabase.from('urgent_notifications')
            .select('title, message, target_audience, is_active, created_at')
            .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
        // 8. Activity logs
        supabase.from('activity_logs')
            .select('action, details, created_at, performed_by')
            .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
        // 9. System settings
        supabase.from('system_settings')
            .select('key, value, description').eq('tenant_id', tenantId),
        // 10. Tenant AI Config
        supabase.from('tenant_ai_config')
            .select('*').eq('tenant_id', tenantId).single(),
        // 11. Knowledge Base
        supabase.from('tenant_knowledge_base')
            .select('title, content, category').eq('tenant_id', tenantId)
            .eq('is_active', true).order('created_at', { ascending: false }).limit(20),
    ])

    return {
        tenantInfo,
        employees: employees || [],
        departments: departments || [],
        shifts: shifts || [],
        groups: groups || [],
        announcements: announcements || [],
        urgentNotifs: urgentNotifs || [],
        activityLogs: activityLogs || [],
        systemSettings: systemSettings || [],
        aiConfig,
        knowledgeDocs: knowledgeDocs || [],
    }
}

