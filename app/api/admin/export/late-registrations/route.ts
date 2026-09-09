import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

const ADMIN_ROLES = ['admin', 'manager', 'kitchen'] as const;

/**
 * GET /api/admin/export/late-registrations?date=2026-03-03&from=2026-03-01&to=2026-03-31
 * Export late registrations as Excel file
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(req.url);

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Role check
        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
        }

        const role = profile.role?.toLowerCase();
        if (!role || !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
            return NextResponse.json({ error: 'Requires admin/manager role' }, { status: 403 });
        }

        // Date range params
        const fromDate = searchParams.get('from') || searchParams.get('date');
        const toDate = searchParams.get('to') || searchParams.get('date');

        if (!fromDate) {
            return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
        }

        // Query late registrations from activity_logs (W-3 fix: tenant isolation)
        const { data: lateLogs, error } = await supabase
            .from('activity_logs')
            .select('id, action, created_at, details')
            .eq('tenant_id', profile.tenant_id)
            .in('action', ['late_meal_registration', 'late_meal_cancellation'])
            .gte('created_at', fromDate + 'T00:00:00+07:00')
            .lte('created_at', (toDate || fromDate) + 'T23:59:59+07:00')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform data for Excel
        const rows = (lateLogs || []).map((log, index) => {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
            return {
                'STT': index + 1,
                'Tên nhân viên': details.user_name || 'N/A',
                'Email': details.user_email || 'N/A',
                'Phòng ban': details.department || 'N/A',
                'Loại': log.action === 'late_meal_registration' ? 'Đăng ký muộn' : 'Hủy ăn muộn',
                'Ngày ăn': details.date || 'N/A',
                'Lý do': details.reason || 'Không có',
                'Thời gian thao tác': details.action_timestamp
                    ? new Date(details.action_timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                    : 'N/A',
                'Hạn chót': details.deadline || 'N/A',
                'Trễ (phút)': details.late_minutes || 0,
                'Trạng thái': details.status === 'eating' ? 'Ăn' : 'Nghỉ',
            };
        });

        // Create Excel workbook
        const ws = XLSX.utils.json_to_sheet(rows);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },   // STT
            { wch: 25 },  // Tên
            { wch: 30 },  // Email
            { wch: 20 },  // Phòng ban
            { wch: 18 },  // Loại
            { wch: 12 },  // Ngày ăn
            { wch: 40 },  // Lý do
            { wch: 22 },  // Thời gian
            { wch: 10 },  // Hạn chót
            { wch: 12 },  // Trễ
            { wch: 10 },  // Trạng thái
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đăng ký muộn');

        // Generate buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const fileName = `dang-ky-muon_${fromDate}${toDate && toDate !== fromDate ? '_den_' + toDate : ''}.xlsx`;

        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('GET /api/admin/export/late-registrations error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
