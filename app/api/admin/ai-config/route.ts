import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/ai-chat/crypto';

/**
 * GET /api/admin/ai-config
 * Lấy cài đặt AI cho tenant hiện tại
 */
export async function GET(request: NextRequest) {
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

        // Fetch AI config
        const { data: config, error } = await supabase
            .from('tenant_ai_config')
            .select('*')
            .eq('tenant_id', userProfile.tenant_id)
            .single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows found → return defaults
            console.error('Database error:', error);
            return NextResponse.json({ error: 'Failed to fetch AI config' }, { status: 500 });
        }

        // Mask API key for security — hiển thị 4 ký tự cuối của key thật
        const safeConfig = config ? {
            ...config,
            gemini_api_key: config.gemini_api_key
                ? (() => {
                    try {
                        const plain = decryptApiKey(config.gemini_api_key);
                        return '****' + plain.slice(-4);
                    } catch { return '****'; }
                  })()
                : null,
            has_gemini_key: !!config.gemini_api_key,
        } : {
            tenant_id: userProfile.tenant_id,
            meal_price: 25000,
            extra_cost_per_meal: 0,
            monthly_fixed_cost: 0,
            vendor_name: '',
            budget_monthly: 0,
            company_size: 'medium',
            industry: 'office',
            special_notes: '',
            custom_fields: {},
            ai_model: 'gemini-3-flash-preview',
            gemini_api_key: null,
            has_gemini_key: false,
            last_indexed_at: null,
            ai_function_confirmation_mode: 'always_confirm',
        };

        return NextResponse.json({ success: true, data: safeConfig });
    } catch (error) {
        console.error('Error in GET /api/admin/ai-config:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/ai-config
 * Cập nhật cài đặt AI cho tenant hiện tại
 */
export async function PUT(request: NextRequest) {
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
        const {
            meal_price,
            extra_cost_per_meal,
            monthly_fixed_cost,
            vendor_name,
            budget_monthly,
            company_size,
            industry,
            special_notes,
            custom_fields,
            ai_model,
            gemini_api_key,
            ai_function_confirmation_mode,
        } = body;

        // Validate
        if (meal_price !== undefined && (typeof meal_price !== 'number' || meal_price < 0)) {
            return NextResponse.json({ error: 'meal_price phải là số >= 0' }, { status: 400 });
        }
        if (extra_cost_per_meal !== undefined && (typeof extra_cost_per_meal !== 'number' || extra_cost_per_meal < 0)) {
            return NextResponse.json({ error: 'extra_cost_per_meal phải là số >= 0' }, { status: 400 });
        }
        if (monthly_fixed_cost !== undefined && (typeof monthly_fixed_cost !== 'number' || monthly_fixed_cost < 0)) {
            return NextResponse.json({ error: 'monthly_fixed_cost phải là số >= 0' }, { status: 400 });
        }

        const validSizes = ['small', 'medium', 'large'];
        if (company_size && !validSizes.includes(company_size)) {
            return NextResponse.json({ error: `company_size phải là: ${validSizes.join(', ')}` }, { status: 400 });
        }

        const validIndustries = ['manufacturing', 'office', 'construction', 'education', 'healthcare', 'other'];
        if (industry && !validIndustries.includes(industry)) {
            return NextResponse.json({ error: `industry phải là: ${validIndustries.join(', ')}` }, { status: 400 });
        }

        // Build update object (only include provided fields)
        const updateData: Record<string, any> = { tenant_id: userProfile.tenant_id };
        if (meal_price !== undefined) updateData.meal_price = meal_price;
        if (extra_cost_per_meal !== undefined) updateData.extra_cost_per_meal = extra_cost_per_meal;
        if (monthly_fixed_cost !== undefined) updateData.monthly_fixed_cost = monthly_fixed_cost;
        if (vendor_name !== undefined) updateData.vendor_name = vendor_name;
        if (budget_monthly !== undefined) updateData.budget_monthly = budget_monthly;
        if (company_size !== undefined) updateData.company_size = company_size;
        if (industry !== undefined) updateData.industry = industry;
        if (special_notes !== undefined) updateData.special_notes = special_notes;
        if (custom_fields !== undefined) updateData.custom_fields = custom_fields;

        // Validate ai_model (Chuẩn 2026)
        const validModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
        if (ai_model !== undefined) {
            if (!validModels.includes(ai_model)) {
                return NextResponse.json({ error: `ai_model phải là: ${validModels.join(', ')}` }, { status: 400 });
            }
            updateData.ai_model = ai_model;
        }

        // Validate ai_function_confirmation_mode
        const validConfirmationModes = ['always_confirm', 'auto_execute'];
        if (ai_function_confirmation_mode !== undefined) {
            if (!validConfirmationModes.includes(ai_function_confirmation_mode)) {
                return NextResponse.json({ error: `ai_function_confirmation_mode phải là: ${validConfirmationModes.join(', ')}` }, { status: 400 });
            }
            updateData.ai_function_confirmation_mode = ai_function_confirmation_mode;
        }

        // Handle Gemini API key — mã hóa AES-256-GCM trước khi lưu
        if (gemini_api_key !== undefined) {
            if (gemini_api_key === null || gemini_api_key === '') {
                updateData.gemini_api_key = null; // Clear key
            } else if (gemini_api_key.startsWith('****')) {
                // ⚠️ GUARD: Key đã bị mask từ GET response → SKIP
                console.warn('[ai-config] Skipping masked key update (starts with ****)');
            } else {
                // ⚠️ S2-B: Mã hóa AES-256-GCM thay vì base64
                updateData.gemini_api_key = encryptApiKey(gemini_api_key);
            }
        }

        // Upsert (insert if not exists, update if exists)
        const { data: config, error } = await supabase
            .from('tenant_ai_config')
            .upsert(updateData, { onConflict: 'tenant_id' })
            .select()
            .single();

        if (error) {
            console.error('Upsert error:', error);
            return NextResponse.json({ error: 'Failed to save AI config' }, { status: 500 });
        }

        // Log activity (exclude API key from logs for security)
        const logData = { ...updateData };
        if (logData.gemini_api_key) logData.gemini_api_key = '****';
        await supabase.from('activity_logs').insert({
            tenant_id: userProfile.tenant_id,
            action: 'ai_config_updated',
            performed_by: user.id,
            target_type: 'settings',
            details: logData,
        });

        // Mask key trong response
        const safeResponse = config ? {
            ...config,
            gemini_api_key: config.gemini_api_key
                ? (() => {
                    try {
                        const plain = decryptApiKey(config.gemini_api_key);
                        return '****' + plain.slice(-4);
                    } catch { return '****'; }
                  })()
                : null,
            has_gemini_key: !!config.gemini_api_key,
        } : config;
        return NextResponse.json({ success: true, data: safeResponse });
    } catch (error) {
        console.error('Error in PUT /api/admin/ai-config:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
