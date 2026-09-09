import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/ai-config/test-key
 * Test xem Gemini API key có hợp lệ không
 * Gọi embedContent endpoint với text nhỏ → nếu 200 OK → key hợp lệ
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        const body = await request.json();
        const apiKey = body.key;

        if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
            return NextResponse.json({
                valid: false,
                error: 'API key không hợp lệ. Key phải bắt đầu bằng "AIza..."',
            });
        }

        // Test bằng cách gọi Gemini embedContent
        const testResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-001',
                    content: { parts: [{ text: 'test connection' }] },
                    outputDimensionality: 768,
                }),
            }
        );

        if (!testResponse.ok) {
            const errText = await testResponse.text();
            let errorMsg = 'API key không hợp lệ';

            if (testResponse.status === 400) {
                errorMsg = 'API key sai định dạng';
            } else if (testResponse.status === 403) {
                errorMsg = 'API key bị vô hiệu hóa hoặc hết quota';
            } else if (testResponse.status === 429) {
                errorMsg = 'Đã vượt giới hạn request. Thử lại sau';
            }

            return NextResponse.json({
                valid: false,
                error: errorMsg,
                status: testResponse.status,
            });
        }

        const data = await testResponse.json();
        const dimensions = data.embedding?.values?.length || 0;

        return NextResponse.json({
            valid: true,
            model: 'gemini-embedding-001',
            dimensions,
            message: `✅ Kết nối thành công! Model: gemini-embedding-001 (${dimensions}d)`,
        });
    } catch (error: any) {
        console.error('Error testing Gemini key:', error);
        return NextResponse.json({
            valid: false,
            error: 'Lỗi kết nối: ' + (error.message || 'Unknown'),
        });
    }
}
