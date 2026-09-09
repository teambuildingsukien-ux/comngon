import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface DeadlineSetting {
    deadline_time: string;  // "17:00" format HH:mm
    offset_days: number;    // 1 = deadline áp dụng cho ngày mai
    enabled: boolean;       // true = bật chặn, false = tắt
    allow_late: boolean;     // true = cho phép đăng ký muộn, false = chặn hoàn toàn
}

const DEFAULT_SETTING: DeadlineSetting = {
    deadline_time: '17:00',
    offset_days: 1,
    enabled: true,
    allow_late: true
};

/**
 * GET /api/admin/settings/registration-deadline
 * Lấy cài đặt deadline đăng ký suất ăn
 * Ai cũng call được (NV cần biết deadline để hiển thị)
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get deadline settings from system_settings
        const { data: settings } = await supabase
            .from('system_settings')
            .select('key, value')
            .in('key', ['registration_deadline', 'registration_deadline_offset', 'registration_deadline_enabled', 'allow_late_registration']);

        if (!settings || settings.length === 0) {
            // Return defaults if no settings exist
            return NextResponse.json({ data: DEFAULT_SETTING });
        }

        const deadlineTime = settings.find(s => s.key === 'registration_deadline')?.value || DEFAULT_SETTING.deadline_time;
        const offsetDays = parseInt(settings.find(s => s.key === 'registration_deadline_offset')?.value || String(DEFAULT_SETTING.offset_days));
        const enabled = settings.find(s => s.key === 'registration_deadline_enabled')?.value !== 'false';
        const allowLate = settings.find(s => s.key === 'allow_late_registration')?.value !== 'false';

        return NextResponse.json({
            data: {
                deadline_time: deadlineTime,
                offset_days: offsetDays,
                enabled: enabled,
                allow_late: allowLate
            }
        }, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
        });
    } catch (error: any) {
        console.error('GET /api/admin/settings/registration-deadline error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/admin/settings/registration-deadline
 * Cập nhật cài đặt deadline - chỉ admin/manager
 */
export async function PUT(req: Request) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check role
        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!userProfile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        const role = userProfile.role?.toLowerCase();
        if (!role || !['admin', 'manager'].includes(role)) {
            return NextResponse.json({ error: 'Requires admin or manager role' }, { status: 403 });
        }

        const body: DeadlineSetting = await req.json();
        const { deadline_time, offset_days, enabled, allow_late } = body;

        // Validate
        if (!deadline_time || !/^\d{2}:\d{2}$/.test(deadline_time)) {
            return NextResponse.json({ error: 'deadline_time phải có format HH:mm' }, { status: 400 });
        }

        const [hours, minutes] = deadline_time.split(':').map(Number);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return NextResponse.json({ error: 'Giờ không hợp lệ' }, { status: 400 });
        }

        if (offset_days < 0 || offset_days > 7) {
            return NextResponse.json({ error: 'offset_days phải trong khoảng 0-7' }, { status: 400 });
        }

        const adminClient = createAdminClient();
        const tenantId = userProfile.tenant_id;

        // Upsert all 3 settings
        const settingsToUpsert = [
            { key: 'registration_deadline', tenant_id: tenantId, value: deadline_time, updated_at: new Date().toISOString() },
            { key: 'registration_deadline_offset', tenant_id: tenantId, value: String(offset_days), updated_at: new Date().toISOString() },
            { key: 'registration_deadline_enabled', tenant_id: tenantId, value: String(enabled), updated_at: new Date().toISOString() },
            { key: 'allow_late_registration', tenant_id: tenantId, value: String(allow_late ?? true), updated_at: new Date().toISOString() }
        ];

        for (const setting of settingsToUpsert) {
            const { error } = await adminClient
                .from('system_settings')
                .upsert(setting, { onConflict: 'key,tenant_id' });

            if (error) throw error;
        }

        // Log activity
        await supabase.from('activity_logs').insert({
            tenant_id: tenantId,
            action: 'registration_deadline_updated',
            performed_by: user.id,
            target_type: 'settings',
            details: { deadline_time, offset_days, enabled, allow_late }
        });

        return NextResponse.json({
            data: { deadline_time, offset_days, enabled, allow_late },
            message: 'Cập nhật deadline thành công'
        });
    } catch (error: any) {
        console.error('PUT /api/admin/settings/registration-deadline error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
