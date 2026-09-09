import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticateApiKey } from '@/lib/middleware/api-key-auth';
import { calculateDateRangeStats } from '@/lib/report-calculator';

// CORS & Charset headers cho mọi client AI Agent bên ngoài
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-tenant-id, mcp-session-id',
    'Content-Type': 'application/json; charset=utf-8',
};

/**
 * Chuẩn hóa chuỗi UTF-8 tiếng Việt theo dạng chuẩn NFC,
 * đồng thời xử lý triệt để ký tự lỗi mojibake / replacement character \uFFFD.
 */
function cleanUtf8(str?: string | null): string {
    if (!str || typeof str !== 'string') return '';
    let cleaned = str.normalize('NFC').trim();
    // Thay thế ký tự lỗi UTF-8 replacement char \uFFFD (thường gặp khi client gửi chuỗi hỏng như "Phng")
    if (cleaned.includes('\uFFFD')) {
        cleaned = cleaned.replace(/Ph\uFFFDng/g, 'Phòng').replace(/\uFFFD/g, '');
    }
    return cleaned.trim();
}

/**
 * Chuẩn hóa chuỗi để so sánh đối chiếu không phân biệt dấu / khoảng trắng / hoa thường.
 */
function normalizeForComparison(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '');
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function GET() {
    return NextResponse.json(
        {
            status: 'ok',
            name: 'com-ngon-mcp-server',
            version: '1.0.0',
            protocol: 'mcp-2024-11-05',
            transport: 'streamable-http',
            mode: 'remote-cloud-vercel',
            endpoint: 'https://comngon.io.vn/api/mcp',
            description: 'Cloud Remote MCP Server cho hệ thống quản lý suất ăn doanh nghiệp Cơm Ngon',
            docs: 'https://comngon.io.vn/docs/mcp',
        },
        { headers: CORS_HEADERS }
    );
}

// Danh mục các công cụ (Tools) cung cấp cho AI Agent
// Danh mục 19 công cụ (Tools) cung cấp cho AI Agent
const TOOLS_DEFINITIONS = [
    // ── NHÓM 1: TRA CỨU & BÁO CÁO (READ-ONLY) ──
    {
        name: 'get_meal_statistics',
        description: 'Tra cứu số liệu thống kê suất ăn doanh nghiệp (tổng suất ăn, lượt nghỉ, khách, tỷ lệ ăn, chi phí, tiền tiết kiệm) cho một khoảng thời gian hoặc một tháng bất kỳ chuẩn SSOT.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: { type: 'string', description: 'Ngày bắt đầu định dạng YYYY-MM-DD (VD: 2026-08-01)' },
                end_date: { type: 'string', description: 'Ngày kết thúc định dạng YYYY-MM-DD (VD: 2026-08-31)' },
                month: { type: 'number', description: 'Tháng (1-12) cần thống kê nếu không truyền start_date' },
                year: { type: 'number', description: 'Năm cần thống kê (VD: 2026)' },
                tenant_id: { type: 'string', description: 'ID doanh nghiệp' }
            }
        }
    },
    {
        name: 'get_today_summary',
        description: 'Lấy dữ liệu tổng quan số lượng suất ăn hôm nay theo thời gian thực (số người ăn, nghỉ ăn, suất khách, trạng thái bếp nấu).',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_employees_list',
        description: 'Lấy danh sách nhân viên trong doanh nghiệp. Hỗ trợ tìm kiếm theo tên, email, mã nhân viên, lọc theo phòng ban và trạng thái.',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Từ khóa tìm kiếm theo họ tên, email hoặc mã nhân viên' },
                name: { type: 'string', description: 'Tên nhân viên cần tìm (tương đương search)' },
                status: { type: 'string', enum: ['all', 'active', 'paused', 'resigned'], description: 'Lọc theo trạng thái nhân viên (mặc định all)' },
                department: { type: 'string', description: 'Lọc theo phòng ban cụ thể' },
                limit: { type: 'number', description: 'Số lượng tối đa cần lấy (mặc định 50)' }
            }
        }
    },
    {
        name: 'get_employee_detail',
        description: 'Xem thông tin chi tiết một nhân viên (họ tên, email, mã NV, phòng ban, chức vụ, trạng thái làm việc) và lịch sử đăng ký cơm 7 ngày gần nhất.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Họ tên, email hoặc mã nhân viên cần tra cứu chi tiết' }
            },
            required: ['query']
        }
    },
    {
        name: 'get_kitchen_overview',
        description: 'Tra cứu tổng quan vận hành bếp: số suất cần nấu hôm nay hoặc một ngày cụ thể, chi tiết suất ăn chính và suất khách.',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày cần kiểm tra YYYY-MM-DD (mặc định hôm nay)' }
            }
        }
    },
    {
        name: 'get_daily_order_details',
        description: 'Xem danh sách chi tiết ai đăng ký ăn cơm và ai báo nghỉ ăn vào một ngày cụ thể, kèm theo lý do báo nghỉ.',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày cần xem định dạng YYYY-MM-DD (mặc định hôm nay)' }
            }
        }
    },
    {
        name: 'get_guest_meals_list',
        description: 'Tra cứu danh sách các đoàn khách đăng ký ăn cơm theo ngày hoặc theo tháng (số lượng suất khách, ghi chú đoàn khách).',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày cụ thể YYYY-MM-DD (tùy chọn)' },
                month: { type: 'number', description: 'Tháng (1-12) cần lọc' },
                year: { type: 'number', description: 'Năm cần lọc (VD: 2026)' }
            }
        }
    },
    {
        name: 'get_cooking_schedule',
        description: 'Tra cứu lịch hoạt động của bếp ăn trong tháng (những ngày nào bếp nấu ăn, ngày nào bếp nghỉ, ngày lễ và ngày ngoại lệ nấu thêm).',
        inputSchema: {
            type: 'object',
            properties: {
                month: { type: 'number', description: 'Tháng (1-12) cần tra cứu (mặc định tháng hiện tại)' },
                year: { type: 'number', description: 'Năm cần tra cứu (mặc định năm hiện tại)' }
            }
        }
    },
    {
        name: 'get_departments_list',
        description: 'Tra cứu danh sách tất cả các phòng ban trong công ty và số lượng nhân sự trực thuộc từng phòng ban.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_announcements',
        description: 'Xem danh sách các thông báo mới nhất từ Ban quản lý hoặc Bếp gửi tới toàn thể công ty.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Số lượng thông báo cần lấy (mặc định 5)' }
            }
        }
    },

    // ── NHÓM 2: VẬN HÀNH & THAO TÁC (WRITE / FULL ACCESS) ──
    {
        name: 'update_meal_registration',
        description: 'Cập nhật trạng thái suất ăn của nhân viên vào một ngày cụ thể (đăng ký ăn = eating hoặc hủy ăn = not_eating).',
        inputSchema: {
            type: 'object',
            properties: {
                employee_email_or_code: { type: 'string', description: 'Email hoặc mã nhân viên hoặc họ tên của người cần cập nhật' },
                date: { type: 'string', description: 'Ngày áp dụng định dạng YYYY-MM-DD (VD: 2026-09-04)' },
                status: { type: 'string', enum: ['eating', 'not_eating'], description: 'Trạng thái: "eating" (ăn cơm) hoặc "not_eating" (nghỉ ăn)' },
                reason: { type: 'string', description: 'Lý do thay đổi' }
            },
            required: ['employee_email_or_code', 'date', 'status']
        }
    },
    {
        name: 'batch_update_meal_registration',
        description: 'Đăng ký ăn hoặc báo nghỉ cơm cho NHIỀU nhân viên cùng lúc vào một ngày cụ thể.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_list: { type: 'array', items: { type: 'string' }, description: 'Danh sách tên hoặc email hoặc mã nhân viên' },
                date: { type: 'string', description: 'Ngày áp dụng YYYY-MM-DD' },
                status: { type: 'string', enum: ['eating', 'not_eating'], description: '"eating" (ăn cơm) hoặc "not_eating" (nghỉ ăn)' },
                reason: { type: 'string', description: 'Lý do' }
            },
            required: ['employee_list', 'date', 'status']
        }
    },
    {
        name: 'add_guest_meals',
        description: 'Báo thêm số lượng suất ăn cho khách đoàn phát sinh vào một ngày cụ thể.',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày áp dụng YYYY-MM-DD' },
                quantity: { type: 'number', description: 'Số lượng suất ăn cần thêm' },
                note: { type: 'string', description: 'Ghi chú đoàn khách' }
            },
            required: ['date', 'quantity']
        }
    },
    {
        name: 'delete_guest_meals',
        description: 'Hủy/xóa một đơn suất ăn khách đoàn đã đăng ký trước đó theo mã ID đơn.',
        inputSchema: {
            type: 'object',
            properties: {
                guest_meal_id: { type: 'string', description: 'Mã UUID của đơn khách đoàn cần xóa' }
            },
            required: ['guest_meal_id']
        }
    },
    {
        name: 'create_employee',
        description: 'Thêm mới một nhân viên vào hệ thống công ty.',
        inputSchema: {
            type: 'object',
            properties: {
                full_name: { type: 'string', description: 'Họ và tên đầy đủ' },
                email: { type: 'string', description: 'Email đăng nhập' },
                employee_code: { type: 'string', description: 'Mã nhân viên' },
                department: { type: 'string', description: 'Phòng ban' }
            },
            required: ['full_name', 'email']
        }
    },
    {
        name: 'update_employee_status',
        description: 'Cập nhật trạng thái làm việc của nhân viên (active = đang làm việc, paused = tạm nghỉ, resigned = đã nghỉ việc).',
        inputSchema: {
            type: 'object',
            properties: {
                employee_query: { type: 'string', description: 'Họ tên, email hoặc mã nhân viên cần cập nhật' },
                status: { type: 'string', enum: ['active', 'paused', 'resigned'], description: 'Trạng thái mới' }
            },
            required: ['employee_query', 'status']
        }
    },
    {
        name: 'set_cooking_exception',
        description: 'Cài đặt ngày ngoại lệ nấu ăn cho bếp (no_cook = bếp nghỉ đột xuất/lễ, extra_cook = nấu thêm vào ngày nghỉ).',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày áp dụng YYYY-MM-DD' },
                exception_type: { type: 'string', enum: ['no_cook', 'extra_cook'], description: '"no_cook" hoặc "extra_cook"' },
                reason: { type: 'string', description: 'Lý do ngoại lệ' }
            },
            required: ['date', 'exception_type']
        }
    },
    {
        name: 'delete_cooking_exception',
        description: 'Xóa một ngày ngoại lệ nấu ăn của bếp để khôi phục lại lịch nấu ăn mặc định.',
        inputSchema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'Ngày ngoại lệ cần xóa YYYY-MM-DD' }
            },
            required: ['date']
        }
    },
    {
        name: 'send_announcement',
        description: 'Đăng thông báo mới từ Quản trị viên hoặc Bếp gửi đến toàn thể nhân viên trong công ty.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Tiêu đề thông báo' },
                content: { type: 'string', description: 'Nội dung chi tiết thông báo' },
                priority: { type: 'string', enum: ['normal', 'urgent', 'info'], description: 'Mức độ ưu tiên (mặc định normal)' }
            },
            required: ['title', 'content']
        }
    },
    {
        name: 'update_employee_profile',
        description: 'Chỉnh sửa toàn diện hồ sơ nhân sự: đổi tên, phòng ban, mã NV, chức vụ (role), chế độ ăn mặc định (eating/not_eating) và ghi chú.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_query: { type: 'string', description: 'Email, mã NV hoặc họ tên của nhân viên cần cập nhật' },
                full_name: { type: 'string', description: 'Họ và tên mới (tùy chọn)' },
                department: { type: 'string', description: 'Phòng ban mới (tùy chọn)' },
                employee_code: { type: 'string', description: 'Mã nhân viên mới (tùy chọn)' },
                default_meal_status: { type: 'string', enum: ['eating', 'not_eating'], description: 'Trạng thái ăn mặc định (eating/not_eating)' },
                role: { type: 'string', enum: ['employee', 'kitchen_admin', 'manager'], description: 'Vai trò phân quyền' },
                notes: { type: 'string', description: 'Ghi chú thêm về nhân viên' }
            },
            required: ['employee_query']
        }
    },
    {
        name: 'delete_employee',
        description: 'Xóa nhân viên khỏi công ty hoặc đánh dấu đã nghỉ việc (resigned).',
        inputSchema: {
            type: 'object',
            properties: {
                employee_query: { type: 'string', description: 'Email, mã NV hoặc họ tên nhân viên' },
                permanent: { type: 'boolean', description: 'true: Xóa hoàn toàn bản ghi khỏi hệ thống; false: Đánh dấu nghỉ việc (mặc định false)' }
            },
            required: ['employee_query']
        }
    },
    {
        name: 'batch_create_employees',
        description: 'Thêm hàng loạt nhân viên mới vào hệ thống công ty cùng lúc từ danh sách.',
        inputSchema: {
            type: 'object',
            properties: {
                employees: {
                    type: 'array',
                    description: 'Danh sách nhân viên cần tạo mới',
                    items: {
                        type: 'object',
                        properties: {
                            full_name: { type: 'string', description: 'Họ và tên đầy đủ' },
                            email: { type: 'string', description: 'Email duy nhất' },
                            employee_code: { type: 'string', description: 'Mã nhân viên' },
                            department: { type: 'string', description: 'Phòng ban' }
                        },
                        required: ['full_name', 'email']
                    }
                }
            },
            required: ['employees']
        }
    },
    {
        name: 'delete_announcement',
        description: 'Gỡ bỏ hoặc hủy kích hoạt một thông báo đã gửi trước đó theo mã ID thông báo.',
        inputSchema: {
            type: 'object',
            properties: {
                announcement_id: { type: 'string', description: 'Mã UUID của thông báo cần xóa/gỡ' }
            },
            required: ['announcement_id']
        }
    },
    {
        name: 'update_company_settings',
        description: 'Cập nhật cấu hình vận hành công ty: giờ chốt đăng ký cơm (registration_deadline), giờ tự động reset cơm hôm sau (auto_reset_time), ngày nấu trong tuần (cooking_days).',
        inputSchema: {
            type: 'object',
            properties: {
                registration_deadline: { type: 'string', description: 'Giờ chốt đăng ký cơm hàng ngày (định dạng HH:MM, VD: 09:00)' },
                auto_reset_time: { type: 'string', description: 'Giờ tự động reset cơm ngày mai (định dạng HH:MM, VD: 13:30)' },
                start_cooking_day: { type: 'number', description: 'Thứ bắt đầu nấu trong tuần (1=Thứ 2, ..., 6=Thứ 7)' },
                end_cooking_day: { type: 'number', description: 'Thứ kết thúc nấu trong tuần (5=Thứ 6, 6=Thứ 7)' }
            }
        }
    },
    {
        name: 'trigger_daily_meal_reset',
        description: 'Kích hoạt lệnh tự động tạo / reset trạng thái đăng ký cơm cho ngày mai (hoặc một ngày bất kỳ) cho toàn bộ nhân viên theo lịch làm việc.',
        inputSchema: {
            type: 'object',
            properties: {
                target_date: { type: 'string', description: 'Ngày cần reset định dạng YYYY-MM-DD (mặc định là ngày làm việc tiếp theo)' }
            }
        }
    }
];

export async function POST(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: Invalid JSON' } },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const { id, method, params } = body || {};

    // 1. MCP Lifecycle: initialize
    if (method === 'initialize') {
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: 'com-ngon-mcp-cloud',
                        version: '1.0.0'
                    }
                }
            },
            { headers: CORS_HEADERS }
        );
    }

    // 2. MCP Lifecycle: notifications/initialized & ping
    if (method === 'notifications/initialized') {
        return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    if (method === 'ping') {
        return NextResponse.json({ jsonrpc: '2.0', id, result: {} }, { headers: CORS_HEADERS });
    }

    // 3. Tools Discovery: tools/list
    if (method === 'tools/list') {
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: TOOLS_DEFINITIONS
                }
            },
            { headers: CORS_HEADERS }
        );
    }

    // 4. Tools Execution: tools/call
    if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        // 1. Xác thực người gọi (Authentication)
        let tenantId: string | null = null;
        let scopes: string[] = [];

        // Ưu tiên 1: Xác thực qua API Key (Bắt buộc cho mọi AI Agent bên ngoài)
        const authResult = await authenticateApiKey(request);
        if (authResult?.tenantId) {
            tenantId = authResult.tenantId;
            scopes = authResult.scopes || ['read'];
        } else {
            // Ưu tiên 2: Xác thực qua Session Cookie (Dành cho Admin đăng nhập trên dashboard thử nghiệm)
            try {
                const supabaseServer = await createClient();
                const { data: { user } } = await supabaseServer.auth.getUser();
                if (user) {
                    const { data: profile } = await supabaseServer
                        .from('users')
                        .select('tenant_id, role')
                        .eq('id', user.id)
                        .single();
                    if (profile?.tenant_id) {
                        tenantId = profile.tenant_id;
                        scopes = ['read', 'write']; // Admin trên web có toàn quyền
                    }
                }
            } catch {
                // Bỏ qua lỗi cookie nếu gọi từ client ngoài không có cookie
            }
        }

        // BẢO MẬT: Bắt buộc phải có danh tính đã xác thực (Token hoặc Session)
        if (!tenantId) {
            const hasAuthHeader = request.headers.has('x-api-key') || request.headers.has('authorization');
            const errorMessage = hasAuthHeader
                ? '🔒 Lỗi xác thực: Token API không hợp lệ, đã bị vô hiệu hóa hoặc hết hạn. Vui lòng kiểm tra lại trong màn hình Cài đặt > Cấu hình MCP & API.'
                : '🔒 Lỗi xác thực (401 Unauthorized): Yêu cầu cung cấp Token API qua header "x-api-key" hoặc "Authorization: Bearer sk_live_...". Vào comngon.io.vn > Cấu hình MCP & API để tạo Token.';

            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        isError: true,
                        content: [{ type: 'text', text: errorMessage }]
                    }
                },
                { headers: CORS_HEADERS }
            );
        }

        // KIỂM TRA PHÂN QUYỀN SCOPE: Nếu là công cụ GHI (WRITE), yêu cầu token phải có quyền 'write'
        const WRITE_TOOLS = [
            'update_meal_registration',
            'batch_update_meal_registration',
            'add_guest_meals',
            'delete_guest_meals',
            'create_employee',
            'update_employee_status',
            'update_employee_profile',
            'delete_employee',
            'batch_create_employees',
            'set_cooking_exception',
            'delete_cooking_exception',
            'send_announcement',
            'delete_announcement',
            'update_company_settings',
            'trigger_daily_meal_reset',
        ];
        if (WRITE_TOOLS.includes(toolName) && !scopes.includes('write') && !scopes.includes('*')) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        isError: true,
                        content: [{ type: 'text', text: '🔒 Quyền hạn không đủ: Token API này chỉ được cấp quyền ĐỌC (read). Để thực hiện thao tác cập nhật dữ liệu, vui lòng tạo Token mới có quyền write trong Cấu hình MCP & API.' }]
                    }
                },
                { headers: CORS_HEADERS }
            );
        }

        const supabase = createAdminClient();

        try {
            let outputText = '';

            switch (toolName) {
                // ── 1. THỐNG KÊ THÁNG / KHOẢNG NGÀY (SSOT) ──
                case 'get_meal_statistics': {
                    const year = toolArgs.year || new Date().getFullYear();
                    let qStart = toolArgs.start_date;
                    let qEnd = toolArgs.end_date;

                    if (toolArgs.month && !qStart) {
                        const mStr = String(toolArgs.month).padStart(2, '0');
                        qStart = `${year}-${mStr}-01`;
                        const lastDay = new Date(year, toolArgs.month, 0).getDate();
                        qEnd = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
                    }
                    if (!qStart) {
                        const now = new Date();
                        const mStr = String(now.getMonth() + 1).padStart(2, '0');
                        qStart = `${now.getFullYear()}-${mStr}-01`;
                        qEnd = `${now.getFullYear()}-${mStr}-${String(now.getDate()).padStart(2, '0')}`;
                    }
                    if (!qEnd) qEnd = qStart;

                    const stats = await calculateDateRangeStats(supabase, tenantId, qStart, qEnd);
                    outputText = `📊 BÁO CÁO SUẤT ĂN CƠM NGON (${qStart} → ${qEnd}):
- Tổng suất ăn thực tế (NV + Khách): ${stats.totalMeals.toLocaleString('vi-VN')} suất
- Suất khách đoàn: ${stats.totalGuest.toLocaleString('vi-VN')} suất
- Số lượt nhân viên báo nghỉ đúng hạn: ${stats.validOptOuts.toLocaleString('vi-VN')} lượt
- Số lượt hủy muộn sau giờ chốt (lãng phí): ${stats.lateCancellations.toLocaleString('vi-VN')} lượt
- Đơn giá mỗi suất ăn: ${stats.unitPrice.toLocaleString('vi-VN')} VNĐ/suất
- 💰 TỔNG TIỀN TIẾT KIỆM ĐƯỢC (từ đơn báo nghỉ đúng hạn): ${stats.costSavingsVnd.toLocaleString('vi-VN')} VNĐ
- ⚠️ Chi phí lãng phí do hủy muộn: ${stats.wastedCostVnd.toLocaleString('vi-VN')} VNĐ
- 💳 Tổng chi phí suất ăn thực tế: ${stats.totalCostVnd.toLocaleString('vi-VN')} VNĐ
- Số ngày bếp nấu: ${stats.cookingDays} ngày
- Tỷ lệ nghỉ/hủy ăn: ${stats.totalMeals + stats.totalNotEating > 0 ? ((stats.totalNotEating / (stats.totalMeals + stats.totalNotEating)) * 100).toFixed(1) : 0}%`;
                    break;
                }

                // ── 2. TỔNG QUAN HÔM NAY (REALTIME) ──
                case 'get_today_summary': {
                    const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
                    const todayStr = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;
                    const stats = await calculateDateRangeStats(supabase, tenantId, todayStr, todayStr);
                    outputText = `☀️ THỐNG KÊ HÔM NAY (${todayStr}):
- Trạng thái bếp: ${stats.cookingDays > 0 ? 'Bếp đang nấu ăn 🍳' : 'Hôm nay bếp nghỉ nấu 🏖️'}
- Tổng suất ăn dự kiến: ${stats.totalMeals} suất
- Số người báo nghỉ: ${stats.totalNotEating} người
- Suất khách đăng ký: ${stats.totalGuest} suất`;
                    break;
                }

                // ── 3. DANH SÁCH NHÂN VIÊN (TÌM KIẾM THEO TÊN, EMAIL, MÃ NV) ──
                case 'get_employees_list': {
                    let query = supabase.from('users').select('id, full_name, email, employee_code, department, status').eq('tenant_id', tenantId);
                    const rawSearch = toolArgs.search || toolArgs.name || toolArgs.query;
                    const searchTerm = rawSearch ? cleanUtf8(rawSearch) : null;
                    if (searchTerm) {
                        query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%`);
                    }
                    if (toolArgs.status && toolArgs.status !== 'all') {
                        query = query.eq('status', toolArgs.status);
                    }
                    if (toolArgs.department) {
                        const cleanDept = cleanUtf8(toolArgs.department);
                        query = query.ilike('department', `%${cleanDept}%`);
                    }
                    const limit = toolArgs.limit || 50;
                    const { data: employees, error } = await query.limit(limit);
                    if (error) throw error;
                    if (!employees || employees.length === 0) {
                        outputText = searchTerm ? `Không tìm thấy nhân viên nào khớp với từ khóa "${searchTerm}".` : 'Không có nhân viên nào.';
                    } else {
                        outputText = `Tìm thấy ${employees.length} nhân sự:\n` +
                            employees.map((e: any, i: number) => `${i + 1}. ${e.full_name} (${e.email || 'không email'}) - Mã: ${e.employee_code || 'Chưa có'} - Phòng: ${e.department || 'Chưa gán'} [${e.status}]`).join('\n');
                    }
                    break;
                }

                // ── 4. XEM CHI TIẾT HỒ SƠ 1 NHÂN VIÊN ──
                case 'get_employee_detail': {
                    const rawQ = toolArgs.query || toolArgs.name || toolArgs.email;
                    const q = rawQ ? cleanUtf8(rawQ) : '';
                    const { data: users, error } = await supabase
                        .from('users')
                        .select('id, full_name, email, employee_code, department, status, status_reason, default_meal_status, role, created_at')
                        .eq('tenant_id', tenantId)
                        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,employee_code.eq.${q}`)
                        .limit(1);

                    if (error) throw error;
                    if (!users || users.length === 0) {
                        outputText = `❌ Không tìm thấy thông tin nhân viên khớp với "${q}".`;
                    } else {
                        const user = users[0];
                        const { data: recentOrders } = await supabase
                            .from('orders')
                            .select('date, status, is_late')
                            .eq('tenant_id', tenantId)
                            .eq('user_id', user.id)
                            .order('date', { ascending: false })
                            .limit(7);

                        outputText = `👤 THÔNG TIN CHI TIẾT NHÂN VIÊN:
- Họ và tên: ${user.full_name}
- Email: ${user.email || 'Chưa có'}
- Mã nhân viên: ${user.employee_code || 'Chưa có'}
- Phòng ban: ${user.department || 'Chưa gán'}
- Chức vụ: ${user.role}
- Trạng thái: ${user.status === 'active' ? 'Đang làm việc 🟢' : user.status === 'paused' ? `Tạm nghỉ 🟡 (${user.status_reason || 'Không rõ lý do'})` : 'Đã nghỉ việc 🔴'}
- Mặc định suất ăn: ${user.default_meal_status === 'eating' ? 'Tự động ăn cơm' : 'Mặc định không ăn cơm'}
- Ngày tham gia: ${new Date(user.created_at).toLocaleDateString('vi-VN')}

📅 LỊCH SỬ ĐĂNG KÝ CƠM GẦN ĐÂY (7 ngày gần nhất có ghi nhận):
${(recentOrders && recentOrders.length > 0)
    ? recentOrders.map((o: any) => `  • ${o.date}: ${o.status === 'eating' ? '✅ ĂN CƠM' : '❌ BÁO NGHỈ'}${o.is_late ? ' (Thao tác muộn)' : ''}`).join('\n')
    : '  Chưa có dữ liệu đặt cơm riêng lẻ (áp dụng theo mặc định của tài khoản).'}`;
                    }
                    break;
                }

                // ── 5. TỔNG QUAN VẬN HÀNH BẾP ──
                case 'get_kitchen_overview': {
                    const date = toolArgs.date || new Date().toISOString().split('T')[0];
                    const stats = await calculateDateRangeStats(supabase, tenantId, date, date);
                    outputText = `🍳 TỔNG QUAN BẾP ĂN NGÀY ${date}:
- Trạng thái bếp: ${stats.cookingDays > 0 ? 'Đang nấu ăn' : 'Nghỉ nấu'}
- Số suất ăn chính thức: ${stats.totalMeals - stats.totalGuest} suất
- Suất khách đặc biệt: ${stats.totalGuest} suất
- TỔNG CẦN NẤU: ${stats.totalMeals} suất`;
                    break;
                }

                // ── 6. CHI TIẾT DANH SÁCH AI ĂN CƠM / AI BÁO NGHỈ NGÀY ĐÓ (SSOT ENGINE) ──
                case 'get_daily_order_details': {
                    const date = toolArgs.date || new Date().toISOString().split('T')[0];

                    // 1. Lấy số liệu SSOT chuẩn từ calculateDateRangeStats
                    const stats = await calculateDateRangeStats(supabase, tenantId, date, date);
                    const ssot = stats.dailyStats[0] || {
                        eligible: 0,
                        eating: 0,
                        notEating: 0,
                        guest: 0,
                        paused: 0,
                        resigned: 0
                    };

                    // 2. Lấy danh sách nhân sự (loại trừ role kitchen)
                    const { data: allUsers, error: userError } = await supabase
                        .from('users')
                        .select('id, full_name, email, department, employee_code, role, status, status_reason, default_meal_status, start_date, resigned_date, created_at')
                        .eq('tenant_id', tenantId)
                        .not('role', 'ilike', '%kitchen%')
                        .order('full_name', { ascending: true });

                    if (userError) throw userError;

                    // 3. Lấy orders của ngày đó
                    const { data: orders, error: orderError } = await supabase
                        .from('orders')
                        .select('user_id, status, is_late')
                        .eq('tenant_id', tenantId)
                        .eq('date', date);

                    if (orderError) throw orderError;

                    const orderMap = new Map<string, { status: string; is_late: boolean }>();
                    (orders || []).forEach(o => {
                        orderMap.set(o.user_id, { status: o.status, is_late: o.is_late });
                    });

                    // 4. Phân loại nhân sự theo chuẩn SSOT
                    const eatingList: Array<{ name: string; dept: string; code: string; email: string; isLate: boolean }> = [];
                    const notEatingList: Array<{ name: string; dept: string; code: string; email: string; reason: string }> = [];
                    const pausedList: Array<{ name: string; dept: string; code: string; email: string; reason: string }> = [];

                    (allUsers || []).forEach((u: any) => {
                        // Loại trừ nhân viên đã nghỉ việc hoặc chưa đi làm tại ngày này
                        if (u.resigned_date && date >= u.resigned_date) return;
                        if (u.status === 'resigned') return;
                        const joinDate = u.start_date || (u.created_at ? u.created_at.slice(0, 10) : null);
                        if (joinDate && joinDate > date) return;

                        // Nhân sự tạm dừng dài hạn (thai sản/đồ ăn riêng)
                        if (u.status === 'paused') {
                            pausedList.push({
                                name: u.full_name,
                                dept: u.department || 'Chưa gán phòng',
                                code: u.employee_code || '',
                                email: u.email || '',
                                reason: u.status_reason || 'Tạm dừng ăn cơm dài hạn'
                            });
                            return;
                        }

                        // Nhân sự active eligible
                        const userOrder = orderMap.get(u.id);
                        const effectiveStatus = userOrder?.status || u.default_meal_status || 'eating';

                        if (effectiveStatus === 'not_eating') {
                            const reason = userOrder?.status === 'not_eating'
                                ? 'Chủ động hủy ăn trên App'
                                : (u.status_reason || 'Cài đặt mặc định không ăn');
                            notEatingList.push({
                                name: u.full_name,
                                dept: u.department || 'Chưa gán phòng',
                                code: u.employee_code || '',
                                email: u.email || '',
                                reason: reason
                            });
                        } else {
                            eatingList.push({
                                name: u.full_name,
                                dept: u.department || 'Chưa gán phòng',
                                code: u.employee_code || '',
                                email: u.email || '',
                                isLate: userOrder?.is_late || false
                            });
                        }
                    });

                    outputText = `📋 DANH SÁCH CHI TIẾT SUẤT ĂN NGÀY ${date} (SSOT Chuẩn):
- Nhân sự đủ điều kiện ăn: ${ssot.eligible} người
- Số người ĂN CƠM: ${ssot.eating} người
- Số người BÁO NGHỈ / MẶC ĐỊNH NGHỈ: ${ssot.notEating} người
- Suất khách: ${ssot.guest} suất
- TỔNG BẾP NẤU: ${stats.totalMeals} suất
- Nhân sự tạm dừng dài hạn (thai sản/chế độ riêng): ${pausedList.length} người

🔴 DANH SÁCH ${notEatingList.length} NGƯỜI NGHỈ ĂN / KHÔNG ĂN:
${notEatingList.length > 0
    ? notEatingList.map((item, idx) => `  ${idx + 1}. ${item.name} (${item.email || item.code || 'NV'}) [${item.dept}] — ${item.reason}`).join('\n')
    : '  (Hôm nay 100% nhân sự đều ăn cơm)'}

🟡 DANH SÁCH ${pausedList.length} NHÂN SỰ TẠM DỪNG CƠM DÀI HẠN (Không tính vào suất ăn):
${pausedList.length > 0
    ? pausedList.map((item, idx) => `  • ${item.name} [${item.dept}] — Lý do: ${item.reason}`).join('\n')
    : '  (Không có)'}

🟢 DANH SÁCH ĂN CƠM TIÊU BIỂU (${eatingList.length} người):
${eatingList.slice(0, 15).map((item, idx) => `  ${idx + 1}. ${item.name} [${item.dept}]${item.isLate ? ' (Đăng ký muộn)' : ''}`).join('\n')}
${eatingList.length > 15 ? `  ... và còn ${eatingList.length - 15} người khác đang ăn cơm.` : ''}`;
                    break;
                }

                // ── 7. DANH SÁCH SUẤT ĂN KHÁCH ĐOÀN ──
                case 'get_guest_meals_list': {
                    let query = supabase.from('guest_meals').select('id, date, quantity, note, created_at').eq('tenant_id', tenantId);
                    if (toolArgs.date) {
                        query = query.eq('date', toolArgs.date);
                    } else if (toolArgs.month && toolArgs.year) {
                        const mStr = String(toolArgs.month).padStart(2, '0');
                        const lastDay = new Date(Number(toolArgs.year), Number(toolArgs.month), 0).getDate();
                        const endDate = `${toolArgs.year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
                        query = query.gte('date', `${toolArgs.year}-${mStr}-01`).lte('date', endDate);
                    }
                    const { data: guestList, error } = await query.order('date', { ascending: false }).limit(20);
                    if (error) throw error;
                    if (!guestList || guestList.length === 0) {
                        outputText = 'Không có suất ăn khách đoàn nào được ghi nhận trong thời gian này.';
                    } else {
                        const totalGuest = guestList.reduce((sum: number, g: any) => sum + (g.quantity || 0), 0);
                        outputText = `🍽️ DANH SÁCH SUẤT ĂN KHÁCH ĐOÀN (${guestList.length} lượt - Tổng: ${totalGuest} suất):\n` +
                            guestList.map((g: any, i: number) => `${i + 1}. [ID: ${g.id}] Ngày ${g.date}: ${g.quantity} suất - Ghi chú: "${g.note || 'Không có'}"`).join('\n');
                    }
                    break;
                }

                // ── 8. LỊCH HOẠT ĐỘNG CỦA BẾP TRONG THÁNG ──
                case 'get_cooking_schedule': {
                    const year = toolArgs.year || new Date().getFullYear();
                    const month = toolArgs.month || (new Date().getMonth() + 1);
                    const mStr = String(month).padStart(2, '0');
                    const startDate = `${year}-${mStr}-01`;
                    const lastDay = new Date(year, month, 0).getDate();
                    const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

                    const { data: exceptions, error } = await supabase
                        .from('cooking_exceptions')
                        .select('date, type, reason')
                        .eq('tenant_id', tenantId)
                        .gte('date', startDate)
                        .lte('date', endDate);

                    if (error) throw error;
                    outputText = `📅 LỊCH VẬN HÀNH BẾP THÁNG ${month}/${year}:
- Thời gian: ${startDate} đến ${endDate} (${lastDay} ngày)
- Lịch nấu mặc định: Thứ 2 đến Thứ 6 hàng tuần. Thứ 7 và Chủ nhật nghỉ.

⚠️ CÁC NGÀY NGOẠI LỆ TRONG THÁNG (${exceptions?.length || 0} ngày):
${(exceptions && exceptions.length > 0)
    ? exceptions.map((e: any) => `  • ${e.date}: ${e.type === 'no_cook' ? '🏖️ BẾP NGHỈ ĐỘT XUẤT/LỄ' : '🍳 NẤU THÊM (NẤU BÙ)'}${e.reason ? ` - Lý do: ${e.reason}` : ''}`).join('\n')
    : '  Không có ngày ngoại lệ nào trong tháng này.'}`;
                    break;
                }

                // ── 9. DANH SÁCH PHÒNG BAN VÀ SỐ LƯỢNG NHÂN SỰ ──
                case 'get_departments_list': {
                    const { data: users, error } = await supabase
                        .from('users')
                        .select('department')
                        .eq('tenant_id', tenantId);

                    if (error) throw error;
                    const deptCounts: Record<string, number> = {};
                    (users || []).forEach((u: any) => {
                        const dept = u.department || 'Chưa phân phòng ban';
                        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
                    });

                    const sortedDepts = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);
                    outputText = `🏢 DANH SÁCH PHÒNG BAN (${sortedDepts.length} phòng - Tổng ${users?.length || 0} nhân sự):\n` +
                        sortedDepts.map(([dept, count], idx) => `${idx + 1}. ${dept}: ${count} nhân sự`).join('\n');
                    break;
                }

                // ── 10. DANH SÁCH THÔNG BÁO GẦN NHẤT ──
                case 'get_announcements': {
                    const { data: annList, error } = await supabase
                        .from('announcements')
                        .select('title, content, priority, start_date, end_date, created_at')
                        .eq('tenant_id', tenantId)
                        .order('created_at', { ascending: false })
                        .limit(toolArgs.limit || 5);

                    if (error) throw error;
                    outputText = `📢 THÔNG BÁO MỚI NHẤT (${annList?.length || 0} thông báo):\n` +
                        (annList && annList.length > 0
                            ? annList.map((a: any, i: number) => {
                                const titleStr = a.title ? `[${a.title}] ` : '';
                                return `${i + 1}. [${a.priority?.toUpperCase() || 'NORMAL'}] ${titleStr}(${new Date(a.created_at).toLocaleDateString('vi-VN')}):\n   ${a.content}`;
                            }).join('\n\n')
                            : 'Chưa có thông báo nào.');
                    break;
                }

                // ── 11. CẬP NHẬT ĐĂNG KÝ CƠM CHO 1 NHÂN VIÊN ──
                case 'update_meal_registration': {
                    const { employee_email_or_code, date, status } = toolArgs;
                    const { data: users, error: findUserError } = await supabase
                        .from('users')
                        .select('id, full_name')
                        .eq('tenant_id', tenantId)
                        .or(`email.eq.${employee_email_or_code},employee_code.eq.${employee_email_or_code},full_name.ilike.%${employee_email_or_code}%`)
                        .limit(1);

                    if (findUserError) throw findUserError;
                    if (!users || users.length === 0) {
                        outputText = `❌ Không tìm thấy nhân viên khớp với "${employee_email_or_code}".`;
                        break;
                    }

                    const user = users[0];
                    const { data: existing } = await supabase
                        .from('orders')
                        .select('id')
                        .eq('tenant_id', tenantId)
                        .eq('user_id', user.id)
                        .eq('date', date)
                        .maybeSingle();

                    if (existing) {
                        await supabase.from('orders').update({ status }).eq('id', existing.id);
                    } else {
                        await supabase.from('orders').insert([{ tenant_id: tenantId, user_id: user.id, date, status }]);
                    }
                    outputText = `✅ Đã cập nhật suất ăn ngày ${date} cho ${user.full_name}: ${status === 'eating' ? 'ĂN CƠM' : 'NGHỈ ĂN'}.`;
                    break;
                }

                // ── 12. CẬP NHẬT ĐĂNG KÝ CƠM HÀNG LOẠT ──
                case 'batch_update_meal_registration': {
                    const { employee_list, date, status } = toolArgs;
                    const results: string[] = [];
                    for (const empQuery of employee_list || []) {
                        const { data: users } = await supabase
                            .from('users')
                            .select('id, full_name')
                            .eq('tenant_id', tenantId)
                            .or(`email.eq.${empQuery},employee_code.eq.${empQuery},full_name.ilike.%${empQuery}%`)
                            .limit(1);

                        if (!users || users.length === 0) {
                            results.push(`❌ Không tìm thấy: "${empQuery}"`);
                            continue;
                        }
                        const u = users[0];
                        const { data: existing } = await supabase
                            .from('orders')
                            .select('id')
                            .eq('tenant_id', tenantId)
                            .eq('user_id', u.id)
                            .eq('date', date)
                            .maybeSingle();

                        if (existing) {
                            await supabase.from('orders').update({ status }).eq('id', existing.id);
                        } else {
                            await supabase.from('orders').insert([{ tenant_id: tenantId, user_id: u.id, date, status }]);
                        }
                        results.push(`✅ ${u.full_name}: ${status === 'eating' ? 'Ăn cơm' : 'Nghỉ ăn'}`);
                    }
                    outputText = `📋 KẾT QUẢ CẬP NHẬT HÀNG LOẠT NGÀY ${date}:\n` + results.join('\n');
                    break;
                }

                // ── 13. BỔ SUNG SUẤT ĂN KHÁCH ĐOÀN ──
                case 'add_guest_meals': {
                    const { date, quantity, note } = toolArgs;
                    const cleanNote = cleanUtf8(note) || 'Bổ sung qua MCP';
                    const { data: inserted, error } = await supabase.from('guest_meals').insert([{
                        tenant_id: tenantId,
                        date,
                        quantity: Number(quantity),
                        note: cleanNote
                    }]).select('id, date, quantity').single();

                    if (error) throw error;
                    outputText = `✅ Đã ghi nhận thêm ${quantity} suất khách cho ngày ${date} [Mã đơn: ${inserted.id}].`;
                    break;
                }

                // ── 14. HỦY / XÓA SUẤT ĂN KHÁCH ĐOÀN ──
                case 'delete_guest_meals': {
                    const { guest_meal_id } = toolArgs;
                    const { error } = await supabase
                        .from('guest_meals')
                        .delete()
                        .eq('tenant_id', tenantId)
                        .eq('id', guest_meal_id);

                    if (error) throw error;
                    outputText = `✅ Đã hủy/xóa thành công đơn suất ăn khách đoàn [ID: ${guest_meal_id}].`;
                    break;
                }

                // ── 15. THÊM MỚI NHÂN VIÊN ──
                case 'create_employee': {
                    const { full_name, email, employee_code, department } = toolArgs;
                    const cleanEmail = String(email || '').trim().toLowerCase();
                    const cleanName = cleanUtf8(full_name);
                    const cleanCode = employee_code ? cleanUtf8(employee_code) : null;
                    let cleanDept = department ? cleanUtf8(department) : null;

                    if (!cleanName || !cleanEmail) {
                        outputText = `❌ Vui lòng cung cấp đầy đủ họ tên và email hợp lệ.`;
                        break;
                    }

                    // Tự động đối chiếu phòng ban với danh sách phòng ban hiện hữu của công ty để đồng bộ chuẩn chính tả & UTF-8
                    if (cleanDept) {
                        const { data: deptRows } = await supabase
                            .from('users')
                            .select('department')
                            .eq('tenant_id', tenantId)
                            .not('department', 'is', null);

                        if (deptRows && deptRows.length > 0) {
                            const uniqueDepts = Array.from(new Set(deptRows.map((r: any) => r.department).filter(Boolean))) as string[];
                            const searchNormalized = normalizeForComparison(cleanDept);
                            const matched = uniqueDepts.find(d => normalizeForComparison(d) === searchNormalized);
                            if (matched) {
                                cleanDept = matched; // Khớp với phòng ban gốc (VD: 'Phòng HCNS & CN')
                            }
                        }
                    }

                    const { data: existingUser } = await supabase
                        .from('users')
                        .select('id')
                        .eq('tenant_id', tenantId)
                        .eq('email', cleanEmail)
                        .maybeSingle();

                    if (existingUser) {
                        outputText = `❌ Nhân viên với email "${cleanEmail}" đã tồn tại trong công ty.`;
                        break;
                    }

                    const { data: newUser, error } = await supabase.from('users').insert([{
                        tenant_id: tenantId,
                        full_name: cleanName,
                        email: cleanEmail,
                        employee_code: cleanCode,
                        department: cleanDept,
                        status: 'active',
                        role: 'employee'
                    }]).select('id, full_name, email, department').single();

                    if (error) throw error;
                    outputText = `✅ Đã thêm mới nhân viên thành công: ${newUser.full_name} (${newUser.email}) - Phòng: ${newUser.department || 'Chưa gán'}.`;
                    break;
                }

                // ── 16. CẬP NHẬT TRẠNG THÁI NHÂN VIÊN ──
                case 'update_employee_status': {
                    const { employee_query, status } = toolArgs;
                    const cleanQuery = cleanUtf8(employee_query);
                    const { data: users, error: findError } = await supabase
                        .from('users')
                        .select('id, full_name, status')
                        .eq('tenant_id', tenantId)
                        .or(`email.eq.${cleanQuery},employee_code.eq.${cleanQuery},full_name.ilike.%${cleanQuery}%`)
                        .limit(1);

                    if (findError) throw findError;
                    if (!users || users.length === 0) {
                        outputText = `❌ Không tìm thấy nhân viên "${employee_query}".`;
                    } else {
                        const u = users[0];
                        await supabase.from('users').update({ status }).eq('id', u.id);
                        outputText = `✅ Đã cập nhật trạng thái nhân viên ${u.full_name} thành: [${status}].`;
                    }
                    break;
                }

                // ── 17. CÀI ĐẶT NGÀY NGOẠI LỆ BẾP ──
                case 'set_cooking_exception': {
                    const { date, exception_type, reason } = toolArgs;
                    const cleanReason = cleanUtf8(reason) || 'Ngoại lệ qua MCP';
                    const { error } = await supabase.from('cooking_exceptions').upsert([{
                        tenant_id: tenantId,
                        date,
                        type: exception_type,
                        reason: cleanReason
                    }]);

                    if (error) throw error;
                    outputText = `✅ Đã cập nhật ngoại lệ nấu ăn ngày ${date}: ${exception_type === 'no_cook' ? '🏖️ BẾP NGHỈ' : '🍳 NẤU THÊM'}.`;
                    break;
                }

                // ── 18. XÓA NGÀY NGOẠI LỆ BẾP ──
                case 'delete_cooking_exception': {
                    const { date } = toolArgs;
                    const { error } = await supabase
                        .from('cooking_exceptions')
                        .delete()
                        .eq('tenant_id', tenantId)
                        .eq('date', date);

                    if (error) throw error;
                    outputText = `✅ Đã xóa ngày ngoại lệ ${date}. Lịch nấu của bếp trở lại bình thường.`;
                    break;
                }

                // ── 19. ĐĂNG THÔNG BÁO MỚI ──
                case 'send_announcement': {
                    const { title, content, priority = 'normal' } = toolArgs;
                    const cleanTitle = cleanUtf8(title);
                    const cleanContent = cleanUtf8(content);
                    const { data: newAnn, error } = await supabase
                        .from('announcements')
                        .insert([{
                            tenant_id: tenantId,
                            title: cleanTitle,
                            content: cleanContent,
                            priority: priority,
                            active: true
                        }])
                        .select('id, title, created_at')
                        .single();

                    if (error) throw error;
                    outputText = `📢 Đã gửi thông báo mới thành công!\n- Tiêu đề: ${cleanTitle}\n- Mức độ ưu tiên: ${priority}\n- Mã thông báo: ${newAnn.id}`;
                    break;
                }

                // ── 20. CHỈNH SỬA TOÀN DIỆN HỒ SƠ NHÂN SỰ ──
                case 'update_employee_profile': {
                    const { employee_query, full_name, department, employee_code, default_meal_status, role, notes } = toolArgs;
                    const cleanQuery = cleanUtf8(employee_query);
                    const { data: users, error: findError } = await supabase
                        .from('users')
                        .select('id, full_name, email, department, employee_code, default_meal_status, role')
                        .eq('tenant_id', tenantId)
                        .or(`email.eq.${cleanQuery},employee_code.eq.${cleanQuery},full_name.ilike.%${cleanQuery}%`)
                        .limit(1);

                    if (findError) throw findError;
                    if (!users || users.length === 0) {
                        outputText = `❌ Không tìm thấy nhân viên khớp với "${employee_query}".`;
                        break;
                    }

                    const targetUser = users[0];
                    const updates: Record<string, any> = {};

                    if (full_name !== undefined) updates.full_name = cleanUtf8(full_name);
                    if (employee_code !== undefined) updates.employee_code = cleanUtf8(employee_code);
                    if (default_meal_status !== undefined) updates.default_meal_status = default_meal_status;
                    if (role !== undefined) updates.role = role;
                    if (notes !== undefined) updates.notes = cleanUtf8(notes);

                    if (department !== undefined) {
                        let cleanDept = cleanUtf8(department);
                        // Auto-match phòng ban với danh sách đang có
                        const { data: deptRows } = await supabase
                            .from('users')
                            .select('department')
                            .eq('tenant_id', tenantId)
                            .not('department', 'is', null);

                        if (deptRows && deptRows.length > 0) {
                            const uniqueDepts = Array.from(new Set(deptRows.map((r: any) => r.department).filter(Boolean))) as string[];
                            const searchNorm = normalizeForComparison(cleanDept);
                            const matched = uniqueDepts.find(d => normalizeForComparison(d) === searchNorm);
                            if (matched) cleanDept = matched;
                        }
                        updates.department = cleanDept;
                    }

                    if (Object.keys(updates).length === 0) {
                        outputText = `⚠️ Không có trường thông tin nào được yêu cầu thay đổi cho nhân viên ${targetUser.full_name}.`;
                        break;
                    }

                    const { data: updated, error: updateError } = await supabase
                        .from('users')
                        .update(updates)
                        .eq('id', targetUser.id)
                        .select('id, full_name, email, department, employee_code, default_meal_status, role')
                        .single();

                    if (updateError) throw updateError;
                    outputText = `✅ Đã cập nhật hồ sơ nhân sự thành công:\n- Họ tên: ${updated.full_name}\n- Email: ${updated.email}\n- Phòng ban: ${updated.department || 'Chưa gán'}\n- Mã NV: ${updated.employee_code || 'Chưa có'}\n- Ăn mặc định: ${updated.default_meal_status}\n- Quyền: ${updated.role}`;
                    break;
                }

                // ── 21. XÓA / CHO NGHỈ VIỆC NHÂN VIÊN ──
                case 'delete_employee': {
                    const { employee_query, permanent = false } = toolArgs;
                    const cleanQuery = cleanUtf8(employee_query);
                    const { data: users, error: findError } = await supabase
                        .from('users')
                        .select('id, full_name, email')
                        .eq('tenant_id', tenantId)
                        .or(`email.eq.${cleanQuery},employee_code.eq.${cleanQuery},full_name.ilike.%${cleanQuery}%`)
                        .limit(1);

                    if (findError) throw findError;
                    if (!users || users.length === 0) {
                        outputText = `❌ Không tìm thấy nhân viên "${employee_query}".`;
                        break;
                    }

                    const targetUser = users[0];

                    if (permanent) {
                        // Xóa hoàn toàn bản ghi
                        const { error: delError } = await supabase
                            .from('users')
                            .delete()
                            .eq('id', targetUser.id)
                            .eq('tenant_id', tenantId);

                        if (delError) throw delError;
                        outputText = `🗑️ Đã xóa hoàn toàn nhân viên ${targetUser.full_name} (${targetUser.email}) khỏi hệ thống.`;
                    } else {
                        // Đánh dấu nghỉ việc (resigned)
                        await supabase
                            .from('users')
                            .update({ status: 'resigned', default_meal_status: 'not_eating' })
                            .eq('id', targetUser.id);

                        outputText = `👋 Đã đánh dấu nhân viên ${targetUser.full_name} (${targetUser.email}) là ĐÃ NGHỈ VIỆC [resigned].`;
                    }
                    break;
                }

                // ── 22. THÊM NHÂN VIÊN HÀNG LOẠT ──
                case 'batch_create_employees': {
                    const { employees } = toolArgs;
                    if (!Array.isArray(employees) || employees.length === 0) {
                        outputText = `❌ Danh sách nhân viên trống. Vui lòng cung cấp mảng thông tin nhân viên.`;
                        break;
                    }

                    // Lấy danh sách phòng ban hiện hữu để auto-match
                    const { data: deptRows } = await supabase
                        .from('users')
                        .select('department')
                        .eq('tenant_id', tenantId)
                        .not('department', 'is', null);
                    const uniqueDepts = deptRows ? Array.from(new Set(deptRows.map((r: any) => r.department).filter(Boolean))) as string[] : [];

                    const results: string[] = [];
                    let successCount = 0;

                    for (const emp of employees) {
                        const cleanEmail = String(emp.email || '').trim().toLowerCase();
                        const cleanName = cleanUtf8(emp.full_name);
                        const cleanCode = emp.employee_code ? cleanUtf8(emp.employee_code) : null;
                        let cleanDept = emp.department ? cleanUtf8(emp.department) : null;

                        if (!cleanName || !cleanEmail) {
                            results.push(`❌ Lỗi: Thiếu họ tên hoặc email cho bản ghi (${JSON.stringify(emp)})`);
                            continue;
                        }

                        if (cleanDept && uniqueDepts.length > 0) {
                            const searchNorm = normalizeForComparison(cleanDept);
                            const matched = uniqueDepts.find(d => normalizeForComparison(d) === searchNorm);
                            if (matched) cleanDept = matched;
                        }

                        const { data: existing } = await supabase
                            .from('users')
                            .select('id')
                            .eq('tenant_id', tenantId)
                            .eq('email', cleanEmail)
                            .maybeSingle();

                        if (existing) {
                            results.push(`⚠️ Đã bỏ qua (Email đã tồn tại): ${cleanName} (${cleanEmail})`);
                            continue;
                        }

                        const { error: insertError } = await supabase.from('users').insert([{
                            tenant_id: tenantId,
                            full_name: cleanName,
                            email: cleanEmail,
                            employee_code: cleanCode,
                            department: cleanDept,
                            status: 'active',
                            role: 'employee',
                            default_meal_status: 'eating'
                        }]);

                        if (insertError) {
                            results.push(`❌ Lỗi tạo ${cleanName}: ${insertError.message}`);
                        } else {
                            successCount++;
                            results.push(`✅ Thêm thành công: ${cleanName} (${cleanEmail}) - Phòng: ${cleanDept || 'Chưa gán'}`);
                        }
                    }

                    outputText = `👥 KẾT QUẢ THÊM NHÂN SỰ HÀNG LOẠT (${successCount}/${employees.length} thành công):\n` + results.join('\n');
                    break;
                }

                // ── 23. XÓA / HỦY THÔNG BÁO ──
                case 'delete_announcement': {
                    const { announcement_id } = toolArgs;
                    const { error } = await supabase
                        .from('announcements')
                        .delete()
                        .eq('id', announcement_id)
                        .eq('tenant_id', tenantId);

                    if (error) throw error;
                    outputText = `🗑️ Đã xóa thành công thông báo [ID: ${announcement_id}].`;
                    break;
                }

                // ── 24. CẬP NHẬT CẤU HÌNH DOANH NGHIỆP ──
                case 'update_company_settings': {
                    const { registration_deadline, auto_reset_time, start_cooking_day, end_cooking_day } = toolArgs;
                    const updatesApplied: string[] = [];

                    if (registration_deadline) {
                        await supabase.from('system_settings').upsert({
                            tenant_id: tenantId,
                            key: 'registration_deadline',
                            value: String(registration_deadline).trim(),
                            description: 'Giờ hết hạn đăng ký cơm hàng ngày (HH:MM)'
                        }, { onConflict: 'tenant_id,key' });
                        updatesApplied.push(`- Giờ chốt cơm: ${registration_deadline}`);
                    }

                    if (auto_reset_time) {
                        await supabase.from('system_settings').upsert({
                            tenant_id: tenantId,
                            key: 'auto_reset_time',
                            value: String(auto_reset_time).trim(),
                            description: 'Giờ tự động reset cơm ngày mai (HH:MM)'
                        }, { onConflict: 'tenant_id,key' });
                        updatesApplied.push(`- Giờ tự động reset: ${auto_reset_time}`);
                    }

                    if (start_cooking_day !== undefined || end_cooking_day !== undefined) {
                        const start = start_cooking_day ?? 1;
                        const end = end_cooking_day ?? 5;
                        const cookingDaysVal = JSON.stringify({ start_day: start, end_day: end });
                        await supabase.from('system_settings').upsert({
                            tenant_id: tenantId,
                            key: 'cooking_days',
                            value: cookingDaysVal,
                            description: 'Ngày nấu ăn trong tuần'
                        }, { onConflict: 'tenant_id,key' });
                        updatesApplied.push(`- Ngày nấu trong tuần: Thứ ${start + 1} đến Thứ ${end + 1}`);
                    }

                    if (updatesApplied.length === 0) {
                        outputText = `⚠️ Chưa có cấu hình nào được chỉ định để cập nhật.`;
                    } else {
                        outputText = `⚙️ ĐÃ CẬP NHẬT CẤU HÌNH VẬN HÀNH THÀNH CÔNG:\n` + updatesApplied.join('\n');
                    }
                    break;
                }

                // ── 25. KÍCH HOẠT LỆNH RESET CƠM TỰ ĐỘNG ──
                case 'trigger_daily_meal_reset': {
                    let targetDate = toolArgs.target_date;
                    if (!targetDate) {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        targetDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
                    }

                    // Lấy toàn bộ nhân viên active
                    const { data: activeUsers, error: fetchErr } = await supabase
                        .from('users')
                        .select('id, full_name, default_meal_status')
                        .eq('tenant_id', tenantId)
                        .eq('status', 'active');

                    if (fetchErr) throw fetchErr;
                    if (!activeUsers || activeUsers.length === 0) {
                        outputText = `⚠️ Không tìm thấy nhân viên đang hoạt động nào trong công ty.`;
                        break;
                    }

                    let syncedCount = 0;
                    for (const u of activeUsers) {
                        const defaultStatus = u.default_meal_status || 'eating';
                        const { data: existing } = await supabase
                            .from('orders')
                            .select('id')
                            .eq('tenant_id', tenantId)
                            .eq('user_id', u.id)
                            .eq('date', targetDate)
                            .maybeSingle();

                        if (!existing) {
                            await supabase.from('orders').insert([{
                                tenant_id: tenantId,
                                user_id: u.id,
                                date: targetDate,
                                status: defaultStatus
                            }]);
                            syncedCount++;
                        }
                    }

                    outputText = `🔄 ĐÃ ĐỒNG BỘ ĐƠN CƠM CHO NGÀY ${targetDate}:\n- Tổng nhân sự active: ${activeUsers.length} người\n- Số suất cơm mới được khởi tạo mặc định: ${syncedCount} đơn\n- Trạng thái: Hoàn tất theo lịch trình SSOT.`;
                    break;
                }

                default:
                    return NextResponse.json(
                        {
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32601, message: `Tool not found: ${toolName}` }
                        },
                        { status: 404, headers: CORS_HEADERS }
                    );
            }

            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: outputText }]
                    }
                },
                { headers: CORS_HEADERS }
            );
        } catch (err: any) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        isError: true,
                        content: [{ type: 'text', text: `❌ Lỗi thực thi công cụ: ${err.message || String(err)}` }]
                    }
                },
                { headers: CORS_HEADERS }
            );
        }
    }

    return NextResponse.json(
        { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not supported: ${method}` } },
        { status: 400, headers: CORS_HEADERS }
    );
}
