import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/setup/notifications
 * Check if notifications tables exist
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || !['admin', 'manager'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Check if table exists by trying to query it
        const { error: checkErr } = await supabase.from('notifications').select('id').limit(1);

        if (!checkErr) {
            return NextResponse.json({ message: 'Tables already exist', status: 'ok' });
        }

        return NextResponse.json({
            message: 'Tables need to be created. Run migration SQL.',
            error: checkErr.message,
            status: 'pending'
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
