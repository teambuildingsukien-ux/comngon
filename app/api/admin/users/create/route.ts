import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasStartedWorking } from '@/lib/meal-helpers';
import { checkResourceLimit, isFeatureEnabled } from '@/lib/supabase/tenant-features';
import { getVietnamNow } from '@/lib/utils/date-helpers';

export async function POST(req: NextRequest) {
    try {
        // 1. Check if requester is authorized (must be logged in)
        // In a real app, strict Role Based Access Control (RBAC) should be here.
        // For now, we trust the UI middleware protection, but adding a basic check.
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1.5. Check requester role — must be admin or manager
        // ⚠️ AUDIT-GUARD: Without this check, ANY authenticated user can create users
        const { data: requesterProfile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const requesterRole = requesterProfile?.role?.toLowerCase();
        if (!requesterRole || !['admin', 'manager'].includes(requesterRole)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        // 2. Parse body
        const body = await req.json();
        const { email: rawEmail, password, fullName, role, employeeCode, department, shift, mealGroupId, isCustomDepartment, isCustomShift, isCustomMealGroup, customValues, isActive, metadata, startDate } = body;
        const email = rawEmail?.toLowerCase().trim();

        // 3. Initialize Admin Client
        const supabaseAdmin = createAdminClient();

        // 4. Create Auth User (Auto-confirmed)
        let authData: any;
        let authError: any;

        ({ data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // AUTO CONFIRM EMAIL
            user_metadata: {
                full_name: fullName,
                role: role,
                employee_code: employeeCode,
                phone: metadata?.phone || null,
                address: metadata?.address || null,
                notes: metadata?.notes || null
            }
        }));

        // ⚠️ FIX: Nếu email đã tồn tại trong auth → check xem NV cũ đã nghỉ/không còn trong public.users
        // Nếu đúng → xóa auth record cũ rồi tạo lại (recycle)
        if (authError && authError.message?.toLowerCase().includes('already been registered')) {
            // Check public.users: NV này còn active không?
            const { data: oldAuthUsers } = await supabaseAdmin
                .from('users')
                .select('id, status, email')
                .eq('email', email)
                .is('deleted_at', null);

            const publicUser = oldAuthUsers?.[0];
            const isOrphanOrResigned = !publicUser || publicUser.status === 'resigned';

            if (isOrphanOrResigned) {
                // Tìm auth UUID bằng RPC (query auth.users via SECURITY DEFINER function)
                const { data: authRecords } = await supabaseAdmin.rpc('get_auth_user_by_email', { target_email: email });
                const oldAuthId: string | null = authRecords?.[0]?.id || null;

                if (!oldAuthId) {
                    return NextResponse.json({
                        error: `Email ${email} đã tồn tại trong hệ thống xác thực nhưng không thể tìm thấy. Vui lòng liên hệ admin platform.`
                    }, { status: 400 });
                }

                // Xóa public.users record cũ (nếu có) — hard delete vì sắp tạo lại
                if (publicUser) {
                    await supabaseAdmin.from('users').delete().eq('id', publicUser.id);
                }

                // Xóa auth record cũ
                const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(oldAuthId);
                if (deleteAuthError) {
                    return NextResponse.json({
                        error: `Không thể xóa tài khoản cũ: ${deleteAuthError.message}`
                    }, { status: 400 });
                }

                // Tạo lại auth user
                ({ data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email: email,
                    password: password,
                    email_confirm: true,
                    user_metadata: {
                        full_name: fullName,
                        role: role,
                        employee_code: employeeCode,
                        phone: metadata?.phone || null,
                        address: metadata?.address || null,
                        notes: metadata?.notes || null
                    }
                }));

                if (authError) {
                    return NextResponse.json({ error: authError.message }, { status: 400 });
                }

                console.log(`♻️ Recycled auth account for ${email} (old auth removed, new created)`);
            } else {
                // NV vẫn đang active/paused → thật sự trùng email
                return NextResponse.json({
                    error: `Email ${email} đã được sử dụng bởi nhân viên đang hoạt động (trạng thái: ${publicUser.status})`
                }, { status: 400 });
            }
        } else if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        if (!authData?.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        const userId = authData.user.id;

        // 5. Get admin's tenant_id FIRST (needed for all subsequent inserts)
        const { data: adminProfile } = await supabaseAdmin
            .from('users')
            .select('tenant_id, full_name')
            .eq('id', user.id)
            .single();

        if (!adminProfile || !adminProfile.tenant_id) {
            return NextResponse.json({ error: 'Admin profile not found' }, { status: 400 });
        }

        // ===== MAX USERS ENFORCEMENT =====
        // Check tenant's max_users limit before allowing new user creation
        const [{ count: currentUserCount }, { data: tenantLimits }] = await Promise.all([
            supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', adminProfile.tenant_id)
                .in('status', ['active', 'paused']),
            supabaseAdmin
                .from('tenants')
                .select('max_users, plan, name')
                .eq('id', adminProfile.tenant_id)
                .single(),
        ]);

        if (tenantLimits?.max_users && (currentUserCount ?? 0) >= tenantLimits.max_users) {
            return NextResponse.json({
                error: `Đã đạt giới hạn ${tenantLimits.max_users} nhân viên cho gói ${tenantLimits.plan || 'hiện tại'}. Vui lòng liên hệ admin platform để nâng cấp gói dịch vụ.`,
            }, { status: 403 });
        }
        // ===== END MAX USERS ENFORCEMENT =====

        // 6. Create Database Records (Departments/Shifts/Groups if custom)
        let finalDepartment = department;
        if (department === 'custom' && customValues?.department) {
            // ===== LIMIT CHECK: max_departments =====
            const deptLimit = await checkResourceLimit(adminProfile.tenant_id, 'departments');
            if (!deptLimit.allowed) {
                // Cleanup auth user
                await supabaseAdmin.auth.admin.deleteUser(userId);
                return NextResponse.json({ error: deptLimit.message }, { status: 403 });
            }

            const { error: deptError } = await supabaseAdmin
                .from('departments')
                .insert({ name: customValues.department, tenant_id: adminProfile.tenant_id })
                .single();
            // Ignore duplicate error
            finalDepartment = customValues.department;
        }

        let finalShiftId: string | null = null;
        let finalShiftName = shift;

        // Handle Shift
        if (shift === 'custom' && customValues?.shift) {
            // Check exist
            const { data: existingShift } = await supabaseAdmin
                .from('shifts')
                .select('id, name')
                .ilike('name', customValues.shift)
                .single();

            if (existingShift) {
                finalShiftId = existingShift.id;
                finalShiftName = existingShift.name;
            } else {
                // ===== LIMIT CHECK: max_shifts =====
                const shiftLimit = await checkResourceLimit(adminProfile.tenant_id, 'shifts');
                if (!shiftLimit.allowed) {
                    await supabaseAdmin.auth.admin.deleteUser(userId);
                    return NextResponse.json({ error: shiftLimit.message }, { status: 403 });
                }
                // ===== FEATURE FLAG: multi_shift =====
                const multiShiftEnabled = await isFeatureEnabled(adminProfile.tenant_id, 'multi_shift');
                if (!multiShiftEnabled) {
                    const { count: existingShiftCount } = await supabaseAdmin
                        .from('shifts')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', adminProfile.tenant_id);
                    if ((existingShiftCount ?? 0) >= 1) {
                        await supabaseAdmin.auth.admin.deleteUser(userId);
                        return NextResponse.json({ error: 'Gói dịch vụ không hỗ trợ đa ca ăn. Nâng cấp gói để tạo thêm ca.' }, { status: 403 });
                    }
                }

                const { data: createdShift, error: shiftError } = await supabaseAdmin
                    .from('shifts')
                    .insert({
                        name: customValues.shift,
                        start_time: customValues.shiftStartTime,
                        end_time: customValues.shiftEndTime,
                        tenant_id: adminProfile.tenant_id
                    })
                    .select('id, name')
                    .single();
                if (shiftError) throw shiftError;
                if (createdShift) {
                    finalShiftId = createdShift.id;
                    finalShiftName = createdShift.name;
                }
            }
        } else if (shift) {
            // UI now sends shift ID, fetch the shift details
            const { data: selectedShift } = await supabaseAdmin
                .from('shifts')
                .select('id, name')
                .eq('id', shift)
                .single();

            if (selectedShift) {
                finalShiftId = selectedShift.id;
                finalShiftName = selectedShift.name;
            }
        }

        // adminProfile already fetched above (step 5)

        let finalGroupId = mealGroupId;
        // Handle Group — check existing group first to avoid duplicates
        if (mealGroupId === 'custom' && customValues?.mealGroupName) {
            // Step 1: Check if group with same name + shift + tenant already exists
            let existingGroupQuery = supabaseAdmin
                .from('groups')
                .select('id, name')
                .eq('tenant_id', adminProfile.tenant_id)
                .ilike('name', customValues.mealGroupName);

            // Also match by shift_id if available
            if (finalShiftId) {
                existingGroupQuery = existingGroupQuery.eq('shift_id', finalShiftId);
            }

            const { data: existingGroup } = await existingGroupQuery.limit(1).single();

            if (existingGroup) {
                // Reuse existing group — no duplicate!
                finalGroupId = existingGroup.id;
            } else {
                // Step 2: No match found, create new group
                // ===== LIMIT CHECK: max_groups =====
                const groupLimit = await checkResourceLimit(adminProfile.tenant_id, 'groups');
                if (!groupLimit.allowed) {
                    await supabaseAdmin.auth.admin.deleteUser(userId);
                    return NextResponse.json({ error: groupLimit.message }, { status: 403 });
                }

                const { data: newGroup, error: groupError } = await supabaseAdmin
                    .from('groups')
                    .insert({
                        tenant_id: adminProfile.tenant_id,  // REQUIRED for RLS
                        name: customValues.mealGroupName,
                        table_area: customValues.mealGroupTableArea,
                        department: finalDepartment,
                        shift_id: finalShiftId
                    })
                    .select('id')
                    .single();

                if (groupError) throw groupError;
                finalGroupId = newGroup.id;
            }
        }

        // ⚠️ OPT-IN FIX: Check group registration_mode BEFORE user creation
        // to set correct default_meal_status in the initial upsert
        let isOptInGroup = false;
        const resolvedGroupId = (finalGroupId === 'custom' || !finalGroupId) ? null : finalGroupId;
        if (resolvedGroupId) {
            const { data: groupInfo } = await supabaseAdmin
                .from('groups')
                .select('registration_mode')
                .eq('id', resolvedGroupId)
                .single();
            if (groupInfo?.registration_mode === 'opt_in') {
                isOptInGroup = true;
            }
        }

        // 6. Insert into public.users
        const { error: upsertError } = await supabaseAdmin
            .from('users')
            .upsert({
                id: userId,
                email: email,
                full_name: fullName,
                role: role,
                employee_code: employeeCode,
                shift_id: finalShiftId,
                department: finalDepartment,
                group_id: resolvedGroupId,
                tenant_id: adminProfile.tenant_id,  // REQUIRED for RLS
                is_active: isActive !== undefined ? isActive : true,
                status: 'active',
                metadata: metadata || null,
                // ⚠️ OPT-IN FIX: Nhóm opt-in → mặc định NGHỈ ĂN
                default_meal_status: isOptInGroup ? 'not_eating' : 'eating',
                // ⚠️ START_DATE: Ngày bắt đầu làm việc (default = hôm nay)
                start_date: startDate || new Date().toISOString().split('T')[0],
            });

        if (upsertError) {
            // Cleanup auth user if profile creation fails?
            // await supabaseAdmin.auth.admin.deleteUser(userId);
            return NextResponse.json({ error: upsertError.message }, { status: 400 });
        }

        // 7. Log Activity (reuse adminProfile from above)
        if (adminProfile) {
            await supabaseAdmin.from('activity_logs').insert({
                tenant_id: adminProfile.tenant_id,  // REQUIRED for RLS
                action: 'CREATE_USER',
                performed_by: user.id,
                target_type: 'user',
                target_id: userId,
                details: {
                    email: email,
                    role: role,
                    created_via: 'admin_api'
                }
            });
        }

        // 8. ⚠️ AUDIT-FIX: Auto-create order 'eating' cho NV mới (hôm nay + ngày mai)
        // NV mới mặc định ĐĂng Ký Ăn, không để trống
        if (role !== 'kitchen' && adminProfile?.tenant_id) {
            try {
                const now = new Date();
                const vnNow = getVietnamNow(now);
                const vnTomorrow = new Date(vnNow);
                vnTomorrow.setDate(vnTomorrow.getDate() + 1);

                const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const todayStr = toDateStr(vnNow);
                const tomorrowStr = toDateStr(vnTomorrow);

                // Get cooking days setting
                const { data: cookingDaySetting } = await supabaseAdmin
                    .from('system_settings')
                    .select('value')
                    .eq('tenant_id', adminProfile.tenant_id)
                    .eq('key', 'cooking_days')
                    .single();

                let startDay = 1, endDay = 5;
                if (cookingDaySetting?.value) {
                    try {
                        const parsed = typeof cookingDaySetting.value === 'string'
                            ? JSON.parse(cookingDaySetting.value) : cookingDaySetting.value;
                        startDay = parsed.start_day ?? 1;
                        endDay = parsed.end_day ?? 5;
                    } catch { /* defaults */ }
                }

                // Sakamoto's algorithm — pure math day of week
                const getDOW = (y: number, m: number, d: number): number => {
                    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
                    if (m < 3) y--;
                    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
                };

                const isCookDay = (dateStr: string) => {
                    const [yr, mo, dy] = dateStr.split('-').map(Number);
                    const dow = getDOW(yr, mo, dy);
                    if (startDay <= endDay) return dow >= startDay && dow <= endDay;
                    return dow >= startDay || dow <= endDay;
                };

                // isOptInGroup đã được check ở trên trước user upsert

                // Opt-in group: SKIP order creation — NV tự quản bằng calendar
                if (isOptInGroup) {
                    console.log(`✅ Opt-in group employee ${email} — skipping order creation (self-managed)`);
                } else {
                    // ⚠️ START_DATE: Chỉ tạo order cho ngày >= start_date
                    const resolvedStartDate = startDate || todayStr;
                    const datesToCreate = [todayStr, tomorrowStr]
                        .filter(d => isCookDay(d))
                        .filter(d => d >= resolvedStartDate); // START_DATE guard
                    if (datesToCreate.length > 0) {
                        const ordersToInsert = datesToCreate.map(date => ({
                            tenant_id: adminProfile.tenant_id,
                            user_id: userId,
                            date,
                            status: 'eating' as const,
                            locked: false,
                            created_at: now.toISOString(),
                            updated_at: now.toISOString(),
                            source: 'admin_create_user',
                        }));

                        await supabaseAdmin
                            .from('orders')
                            .upsert(ordersToInsert, { onConflict: 'tenant_id,user_id,date', ignoreDuplicates: true });

                        // ✅ v6.0.0: Ghi log tạo orders cho NV mới
                        await supabaseAdmin.from('activity_logs').insert({
                            tenant_id: adminProfile.tenant_id,
                            action: 'system_auto_create_new_employee_orders',
                            performed_by: user.id,
                            performer_name: adminProfile.full_name || 'Admin',
                            target_type: 'order',
                            target_id: userId,
                            details: {
                                employee_email: email,
                                dates: datesToCreate,
                                status: 'eating',
                                source: 'admin_create_user',
                                count: datesToCreate.length,
                            }
                        });

                        console.log(`✅ Auto-created ${ordersToInsert.length} orders (eating) for new employee ${email}`);
                    }
                }
            } catch (orderErr) {
                // Non-blocking: don't fail user creation if order creation fails
                console.error('⚠️ Failed to auto-create orders for new employee:', orderErr);
            }
        }

        return NextResponse.json({ success: true, userId: userId });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
