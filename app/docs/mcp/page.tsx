'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function McpDocsPage() {
    const [activeTab, setActiveTab] = useState<'claude' | 'cursor' | 'python' | 'terminal'>('claude');
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
    const [selectedToolFilter, setSelectedToolFilter] = useState<'all' | 'query' | 'action'>('all');

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSnippet(id);
        setTimeout(() => setCopiedSnippet(null), 2000);
    };

    const claudeConfig = `{
  "mcpServers": {
    "com-ngon": {
      "url": "https://comngon.io.vn/api/mcp",
      "headers": {
        "x-api-key": "sk_live_YOUR_API_KEY"
      }
    }
  }
}`;

    const cursorConfig = `{
  "mcpServers": {
    "com-ngon": {
      "url": "https://comngon.io.vn/api/mcp",
      "headers": {
        "x-api-key": "sk_live_YOUR_API_KEY"
      }
    }
  }
}`;

    const pythonExample = `import httpx

# Kết nối trực tiếp đến Remote Cloud MCP Server của Cơm Ngon trên Vercel
API_URL = "https://comngon.io.vn/api/mcp"
API_KEY = "sk_live_YOUR_API_KEY"

# 1. Khởi tạo phiên kết nối (Initialize)
init_res = httpx.post(
    API_URL,
    headers={"x-api-key": API_KEY},
    json={"jsonrpc": "2.0", "id": 1, "method": "initialize"}
)
print("Server Info:", init_res.json())

# 2. Gọi công cụ tra cứu số liệu suất ăn (SSOT)
stats_res = httpx.post(
    API_URL,
    headers={"x-api-key": API_KEY},
    json={
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "get_meal_statistics",
            "arguments": {"month": 8, "year": 2026}
        }
    }
)
print(stats_res.json()["result"]["content"][0]["text"])`;

    const terminalCommand = `# Tra cứu số liệu suất ăn trực tiếp từ máy chủ Vercel qua cURL:
curl -X POST https://comngon.io.vn/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: sk_live_YOUR_API_KEY" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_meal_statistics",
      "arguments": { "month": 8, "year": 2026 }
    }
  }'`;

    const tools = [
        // ── NHÓM 1: TRA CỨU & BÁO CÁO (QUERY / READ-ONLY) ──
        {
            name: 'get_meal_statistics',
            type: 'query',
            badge: 'Tra cứu SSOT',
            description: 'Tra cứu số liệu thống kê suất ăn tổng hợp chuẩn Single Source of Truth (tổng suất ăn, lượt nghỉ, khách, tỷ lệ hủy, chi phí, tiền tiết kiệm) cho một tháng cụ thể hoặc khoảng ngày bất kỳ.',
            params: [
                { name: 'start_date', type: 'string (optional)', desc: 'Ngày bắt đầu YYYY-MM-DD (VD: 2026-08-01)' },
                { name: 'end_date', type: 'string (optional)', desc: 'Ngày kết thúc YYYY-MM-DD (VD: 2026-08-31)' },
                { name: 'month', type: 'number (optional)', desc: 'Tháng cần tra cứu (1 - 12)' },
                { name: 'year', type: 'number (optional)', desc: 'Năm cần tra cứu (VD: 2026)' }
            ],
            exampleCall: 'get_meal_statistics({ month: 8, year: 2026 })',
            exampleOutput: `BÁO CÁO SUẤT ĂN CƠM NGON (2026-08-01 → 2026-08-31):
- Tổng suất ăn: 1.391 suất
- Suất khách: 0 suất
- Tổng lượt nghỉ ăn: 345 lượt
- Số ngày bếp nấu: 23 ngày
- Tỷ lệ hủy/nghỉ: 19.9%`
        },
        {
            name: 'get_today_summary',
            type: 'query',
            badge: 'Hôm nay Realtime',
            description: 'Lấy dữ liệu tổng quan số lượng suất ăn hôm nay theo thời gian thực (số người ăn, nghỉ ăn, suất khách, trạng thái bếp nấu).',
            params: [],
            exampleCall: 'get_today_summary({})',
            exampleOutput: `☀️ THỐNG KÊ HÔM NAY (2026-09-03):
- Trạng thái bếp: Bếp đang nấu ăn 🍳
- Tổng suất ăn dự kiến: 73 suất
- Số người báo nghỉ: 9 người
- Suất khách đăng ký: 0 suất`
        },
        {
            name: 'get_employees_list',
            type: 'query',
            badge: 'Nhân sự',
            description: 'Lấy danh sách nhân viên trong doanh nghiệp. Hỗ trợ tìm kiếm theo tên, email, mã nhân viên, lọc theo phòng ban và trạng thái.',
            params: [
                { name: 'search', type: 'string (optional)', desc: 'Từ khóa tìm kiếm theo họ tên, email hoặc mã nhân viên' },
                { name: 'department', type: 'string (optional)', desc: 'Lọc theo phòng ban (VD: Marketing)' },
                { name: 'status', type: 'enum (optional)', desc: '"active" | "paused" | "resigned" | "all"' },
                { name: 'limit', type: 'number (optional)', desc: 'Số lượng tối đa cần lấy (mặc định 50)' }
            ],
            exampleCall: 'get_employees_list({ search: "Hải", department: "Ban Giám Đốc" })',
            exampleOutput: `Tìm thấy 1 nhân sự:
1. Thân Công Hải (haibn@vietvisiontravel.com) - Mã: NV001 - Phòng: Ban Giám Đốc [active]`
        },
        {
            name: 'get_employee_detail',
            type: 'query',
            badge: 'Hồ sơ nhân sự',
            description: 'Xem thông tin chi tiết một nhân viên (họ tên, email, mã NV, phòng ban, chức vụ, trạng thái làm việc) và lịch sử đăng ký cơm 7 ngày gần nhất.',
            params: [
                { name: 'query', type: 'string (required)', desc: 'Họ tên, email hoặc mã nhân viên cần tra cứu chi tiết' }
            ],
            exampleCall: 'get_employee_detail({ query: "Thân Công Hải" })',
            exampleOutput: `👤 THÔNG TIN CHI TIẾT NHÂN VIÊN:
- Họ và tên: Thân Công Hải
- Email: haibn@vietvisiontravel.com
- Mã nhân viên: NV001
- Phòng ban: Ban Giám Đốc
- Chức vụ: admin
- Trạng thái: Đang làm việc 🟢
📅 LỊCH SỬ ĐĂNG KÝ CƠM GẦN ĐÂY:
  • 2026-09-03: ✅ ĂN CƠM
  • 2026-09-02: ❌ BÁO NGHỈ (Lý do: Đi gặp đối tác)`
        },
        {
            name: 'get_kitchen_overview',
            type: 'query',
            badge: 'Vận hành bếp',
            description: 'Tra cứu tổng quan vận hành bếp: số suất cần nấu hôm nay hoặc một ngày cụ thể, chi tiết suất ăn chính và suất khách.',
            params: [
                { name: 'date', type: 'string (optional)', desc: 'Ngày cần kiểm tra YYYY-MM-DD (mặc định hôm nay)' }
            ],
            exampleCall: 'get_kitchen_overview({ date: "2026-09-03" })',
            exampleOutput: `🍳 TỔNG QUAN BẾP ĂN NGÀY 2026-09-03:
- Trạng thái bếp: Đang nấu ăn
- Số suất ăn chính thức: 73 suất
- Suất khách đặc biệt: 0 suất
- TỔNG CẦN NẤU: 73 suất`
        },
        {
            name: 'get_daily_order_details',
            type: 'query',
            badge: 'Chi tiết suất ăn',
            description: 'Xem danh sách chi tiết ai đăng ký ăn cơm và ai báo nghỉ ăn vào một ngày cụ thể, kèm theo lý do báo nghỉ.',
            params: [
                { name: 'date', type: 'string (optional)', desc: 'Ngày cần xem định dạng YYYY-MM-DD' }
            ],
            exampleCall: 'get_daily_order_details({ date: "2026-09-03" })',
            exampleOutput: `📋 DANH SÁCH CHI TIẾT SUẤT ĂN NGÀY 2026-09-03:
- Ăn cơm: 73 người
- Báo nghỉ: 9 người
🔴 DANH SÁCH BÁO NGHỈ:
  1. Nguyễn Văn A [Sale] - Lý do: Đi tour Hạ Long
  2. Trần Thị B [Kế toán] - Lý do: Làm việc tại nhà`
        },
        {
            name: 'get_guest_meals_list',
            type: 'query',
            badge: 'Suất khách',
            description: 'Tra cứu danh sách các đoàn khách đăng ký ăn cơm theo ngày hoặc theo tháng (số lượng suất khách, ghi chú đoàn khách).',
            params: [
                { name: 'date', type: 'string (optional)', desc: 'Ngày cụ thể YYYY-MM-DD' },
                { name: 'month', type: 'number (optional)', desc: 'Tháng cần lọc' },
                { name: 'year', type: 'number (optional)', desc: 'Năm cần lọc' }
            ],
            exampleCall: 'get_guest_meals_list({ month: 9, year: 2026 })',
            exampleOutput: `🍽️ DANH SÁCH SUẤT ĂN KHÁCH ĐOÀN (1 lượt - Tổng: 5 suất):
1. [ID: abc-123] Ngày 2026-09-05: 5 suất - Ghi chú: "Đoàn đối tác Nhật Bản"`
        },
        {
            name: 'get_cooking_schedule',
            type: 'query',
            badge: 'Lịch nấu bếp',
            description: 'Tra cứu lịch hoạt động của bếp ăn trong tháng (những ngày nào bếp nấu ăn, ngày nào bếp nghỉ, ngày lễ và ngày ngoại lệ nấu thêm).',
            params: [
                { name: 'month', type: 'number (optional)', desc: 'Tháng cần tra cứu (1 - 12)' },
                { name: 'year', type: 'number (optional)', desc: 'Năm cần tra cứu' }
            ],
            exampleCall: 'get_cooking_schedule({ month: 9, year: 2026 })',
            exampleOutput: `📅 LỊCH VẬN HÀNH BẾP THÁNG 9/2026:
- Lịch nấu mặc định: Thứ 2 đến Thứ 6 hàng tuần.
⚠️ CÁC NGÀY NGOẠI LỆ:
  • 2026-09-02: 🏖️ BẾP NGHỈ ĐỘT XUẤT/LỄ - Lý do: Quốc Khánh 2/9`
        },
        {
            name: 'get_departments_list',
            type: 'query',
            badge: 'Phòng ban',
            description: 'Tra cứu danh sách tất cả các phòng ban trong công ty và số lượng nhân sự trực thuộc từng phòng ban.',
            params: [],
            exampleCall: 'get_departments_list({})',
            exampleOutput: `🏢 DANH SÁCH PHÒNG BAN (6 phòng - Tổng 102 nhân sự):
1. Khối Kinh Doanh: 45 nhân sự
2. Khối Điều Hành Tour: 28 nhân sự
3. Kế Toán & Tài Chính: 12 nhân sự`
        },
        {
            name: 'get_announcements',
            type: 'query',
            badge: 'Thông báo',
            description: 'Xem danh sách các thông báo mới nhất từ Ban quản lý hoặc Bếp gửi tới toàn thể công ty.',
            params: [
                { name: 'limit', type: 'number (optional)', desc: 'Số lượng thông báo cần lấy (mặc định 5)' }
            ],
            exampleCall: 'get_announcements({ limit: 3 })',
            exampleOutput: `📢 THÔNG BÁO MỚI NHẤT:
1. [URGENT] Thông báo thực đơn đặc biệt Thứ 6 tuần này: Bếp phục vụ bún chả Hà Nội.`
        },

        // ── NHÓM 2: VẬN HÀNH & THAO TÁC (ACTION / WRITE) ──
        {
            name: 'update_meal_registration',
            type: 'action',
            badge: 'Nghiệp vụ ăn',
            description: 'Cập nhật trực tiếp trạng thái suất ăn của một nhân viên vào một ngày nhất định (đăng ký ăn hoặc hủy cơm).',
            params: [
                { name: 'employee_email_or_code', type: 'string (required)', desc: 'Email, mã nhân viên hoặc họ tên' },
                { name: 'date', type: 'string (required)', desc: 'Ngày áp dụng YYYY-MM-DD' },
                { name: 'status', type: 'enum (required)', desc: '"eating" (ăn cơm) hoặc "not_eating" (hủy cơm)' },
                { name: 'reason', type: 'string (optional)', desc: 'Lý do thay đổi' }
            ],
            exampleCall: 'update_meal_registration({ employee_email_or_code: "Thân Công Hải", date: "2026-09-04", status: "not_eating", reason: "Đi công tác" })',
            exampleOutput: `"✅ Đã cập nhật suất ăn ngày 2026-09-04 cho Thân Công Hải: NGHỈ ĂN."`
        },
        {
            name: 'batch_update_meal_registration',
            type: 'action',
            badge: 'Nghiệp vụ ăn',
            description: 'Đăng ký ăn hoặc báo nghỉ cơm cho NHIỀU nhân viên cùng lúc vào một ngày cụ thể.',
            params: [
                { name: 'employee_list', type: 'array (required)', desc: 'Danh sách họ tên, email hoặc mã nhân viên' },
                { name: 'date', type: 'string (required)', desc: 'Ngày áp dụng YYYY-MM-DD' },
                { name: 'status', type: 'enum (required)', desc: '"eating" hoặc "not_eating"' },
                { name: 'reason', type: 'string (optional)', desc: 'Lý do' }
            ],
            exampleCall: 'batch_update_meal_registration({ employee_list: ["NV001", "NV002"], date: "2026-09-04", status: "not_eating" })',
            exampleOutput: `"📋 KẾT QUẢ CẬP NHẬT HÀNG LOẠT NGÀY 2026-09-04:
✅ Thân Công Hải: Nghỉ ăn
✅ Nguyễn Văn B: Nghỉ ăn"`
        },
        {
            name: 'add_guest_meals',
            type: 'action',
            badge: 'Nghiệp vụ bếp',
            description: 'Thêm suất ăn cho khách hoặc đối tác phát sinh vào một ngày cụ thể kèm ghi chú.',
            params: [
                { name: 'date', type: 'string (required)', desc: 'Ngày phục vụ khách YYYY-MM-DD' },
                { name: 'quantity', type: 'number (required)', desc: 'Số lượng suất ăn cần thêm' },
                { name: 'note', type: 'string (optional)', desc: 'Ghi chú đoàn khách' }
            ],
            exampleCall: 'add_guest_meals({ date: "2026-09-05", quantity: 5, note: "Đoàn đối tác Nhật Bản" })',
            exampleOutput: `"✅ Đã ghi nhận thêm 5 suất khách cho ngày 2026-09-05 [Mã đơn: d123-456]."`
        },
        {
            name: 'delete_guest_meals',
            type: 'action',
            badge: 'Nghiệp vụ bếp',
            description: 'Hủy/xóa một đơn suất ăn khách đoàn đã đăng ký trước đó theo mã ID đơn.',
            params: [
                { name: 'guest_meal_id', type: 'string (required)', desc: 'Mã UUID của đơn khách đoàn' }
            ],
            exampleCall: 'delete_guest_meals({ guest_meal_id: "d123-456" })',
            exampleOutput: `"✅ Đã hủy/xóa thành công đơn suất ăn khách đoàn [ID: d123-456]."`
        },
        {
            name: 'create_employee',
            type: 'action',
            badge: 'Nhân sự',
            description: 'Thêm mới một nhân viên vào hệ thống công ty.',
            params: [
                { name: 'full_name', type: 'string (required)', desc: 'Họ và tên đầy đủ' },
                { name: 'email', type: 'string (required)', desc: 'Email đăng nhập' },
                { name: 'employee_code', type: 'string (optional)', desc: 'Mã nhân viên' },
                { name: 'department', type: 'string (optional)', desc: 'Phòng ban' }
            ],
            exampleCall: 'create_employee({ full_name: "Lê Văn C", email: "c@company.com", department: "Kinh Doanh" })',
            exampleOutput: `"✅ Đã thêm mới nhân viên thành công: Lê Văn C (c@company.com)."`
        },
        {
            name: 'update_employee_status',
            type: 'action',
            badge: 'Nhân sự',
            description: 'Thay đổi trạng thái hoạt động nhân viên (active = đang làm việc, paused = tạm dừng cơm, resigned = đã nghỉ việc).',
            params: [
                { name: 'employee_query', type: 'string (required)', desc: 'Họ tên, email hoặc mã nhân viên' },
                { name: 'status', type: 'enum (required)', desc: '"active" | "paused" | "resigned"' }
            ],
            exampleCall: 'update_employee_status({ employee_query: "Lê Văn C", status: "paused" })',
            exampleOutput: `"✅ Đã cập nhật trạng thái nhân viên Lê Văn C thành: [paused]."`
        },
        {
            name: 'set_cooking_exception',
            type: 'action',
            badge: 'Lịch bếp',
            description: 'Cài đặt ngày ngoại lệ nấu ăn cho bếp (no_cook = bếp nghỉ đột xuất/nghỉ lễ, extra_cook = nấu thêm vào ngày nghỉ cuối tuần).',
            params: [
                { name: 'date', type: 'string (required)', desc: 'Ngày áp dụng YYYY-MM-DD' },
                { name: 'exception_type', type: 'enum (required)', desc: '"no_cook" | "extra_cook"' },
                { name: 'reason', type: 'string (optional)', desc: 'Lý do ngoại lệ' }
            ],
            exampleCall: 'set_cooking_exception({ date: "2026-09-02", exception_type: "no_cook", reason: "Nghỉ lễ Quốc Khánh 2/9" })',
            exampleOutput: `"✅ Đã cập nhật ngoại lệ nấu ăn ngày 2026-09-02: BẾP NGHỈ."`
        },
        {
            name: 'delete_cooking_exception',
            type: 'action',
            badge: 'Lịch bếp',
            description: 'Xóa một ngày ngoại lệ nấu ăn của bếp để khôi phục lại lịch nấu ăn mặc định.',
            params: [
                { name: 'date', type: 'string (required)', desc: 'Ngày ngoại lệ cần xóa YYYY-MM-DD' }
            ],
            exampleCall: 'delete_cooking_exception({ date: "2026-09-02" })',
            exampleOutput: `"✅ Đã xóa ngày ngoại lệ 2026-09-02. Lịch nấu của bếp trở lại bình thường."`
        },
        {
            name: 'send_announcement',
            type: 'action',
            badge: 'Thông báo',
            description: 'Đăng thông báo mới từ Quản trị viên hoặc Bếp gửi đến toàn thể nhân viên trong công ty.',
            params: [
                { name: 'title', type: 'string (required)', desc: 'Tiêu đề thông báo' },
                { name: 'content', type: 'string (required)', desc: 'Nội dung chi tiết thông báo' },
                { name: 'priority', type: 'enum (optional)', desc: '"normal" | "urgent" | "info"' }
            ],
            exampleCall: 'send_announcement({ title: "Đổi giờ ăn trưa", content: "Hôm nay giờ ăn bắt đầu lúc 11h45", priority: "urgent" })',
            exampleOutput: `"📢 Đã gửi thông báo mới thành công! - Tiêu đề: Đổi giờ ăn trưa"`
        },
        {
            name: 'update_employee_profile',
            type: 'action',
            badge: 'Nhân sự',
            description: 'Chỉnh sửa toàn diện hồ sơ nhân sự: họ tên, phòng ban, mã NV, chức vụ (role), chế độ ăn mặc định (eating/not_eating), ghi chú.',
            params: [
                { name: 'employee_query', type: 'string (required)', desc: 'Email, mã NV hoặc họ tên' },
                { name: 'full_name', type: 'string (optional)', desc: 'Họ và tên mới' },
                { name: 'department', type: 'string (optional)', desc: 'Phòng ban mới' },
                { name: 'employee_code', type: 'string (optional)', desc: 'Mã nhân viên' },
                { name: 'default_meal_status', type: 'enum (optional)', desc: '"eating" | "not_eating"' },
                { name: 'role', type: 'enum (optional)', desc: '"employee" | "kitchen_admin" | "manager"' }
            ],
            exampleCall: 'update_employee_profile({ employee_query: "c@company.com", department: "Phòng Marketing", role: "manager" })',
            exampleOutput: `"✅ Đã cập nhật hồ sơ nhân sự thành công: Lê Văn C - Phòng Marketing - Quyền: manager"`
        },
        {
            name: 'delete_employee',
            type: 'action',
            badge: 'Nhân sự',
            description: 'Xóa nhân viên khỏi hệ thống hoặc đánh dấu nghỉ việc (resigned).',
            params: [
                { name: 'employee_query', type: 'string (required)', desc: 'Email, mã NV hoặc họ tên' },
                { name: 'permanent', type: 'boolean (optional)', desc: 'true: Xóa hẳn, false: Đánh dấu nghỉ việc (mặc định false)' }
            ],
            exampleCall: 'delete_employee({ employee_query: "c@company.com", permanent: false })',
            exampleOutput: `"👋 Đã đánh dấu nhân viên Lê Văn C là ĐÃ NGHỈ VIỆC [resigned]."`
        },
        {
            name: 'batch_create_employees',
            type: 'action',
            badge: 'Nhân sự',
            description: 'Thêm danh sách nhiều nhân viên mới vào hệ thống công ty cùng lúc.',
            params: [
                { name: 'employees', type: 'array (required)', desc: 'Mảng các đối tượng [{ full_name, email, department, employee_code }]' }
            ],
            exampleCall: 'batch_create_employees({ employees: [{ full_name: "Nguyễn A", email: "a@co.com" }, { full_name: "Trần B", email: "b@co.com" }] })',
            exampleOutput: `"👥 KẾT QUẢ THÊM NHÂN SỰ HÀNG LOẠT (2/2 thành công)..."`
        },
        {
            name: 'delete_announcement',
            type: 'action',
            badge: 'Thông báo',
            description: 'Gỡ bỏ hoặc hủy một thông báo đã đăng trước đó theo mã ID.',
            params: [
                { name: 'announcement_id', type: 'string (required)', desc: 'Mã UUID của thông báo' }
            ],
            exampleCall: 'delete_announcement({ announcement_id: "8c35b5a2-..." })',
            exampleOutput: `"🗑️ Đã xóa thành công thông báo [ID: 8c35b5a2-...]."`
        },
        {
            name: 'update_company_settings',
            type: 'action',
            badge: 'Hệ thống',
            description: 'Cập nhật cấu hình công ty: giờ chốt đăng ký cơm (HH:MM), giờ tự động reset và ngày nấu trong tuần.',
            params: [
                { name: 'registration_deadline', type: 'string (optional)', desc: 'Giờ chốt cơm (HH:MM)' },
                { name: 'auto_reset_time', type: 'string (optional)', desc: 'Giờ tự động reset cơm ngày mai (HH:MM)' },
                { name: 'start_cooking_day', type: 'number (optional)', desc: 'Thứ bắt đầu nấu (1=Thứ 2, ..., 6=Thứ 7)' },
                { name: 'end_cooking_day', type: 'number (optional)', desc: 'Thứ kết thúc nấu (5=Thứ 6, 6=Thứ 7)' }
            ],
            exampleCall: 'update_company_settings({ registration_deadline: "09:00", auto_reset_time: "13:30" })',
            exampleOutput: `"⚙️ ĐÃ CẬP NHẬT CẤU HÌNH VẬN HÀNH THÀNH CÔNG..."`
        },
        {
            name: 'trigger_daily_meal_reset',
            type: 'action',
            badge: 'Hệ thống',
            description: 'Kích hoạt lệnh tự động khởi tạo / reset đơn cơm cho ngày mai theo chế độ mặc định của nhân sự.',
            params: [
                { name: 'target_date', type: 'string (optional)', desc: 'Ngày cần reset YYYY-MM-DD (mặc định ngày mai)' }
            ],
            exampleCall: 'trigger_daily_meal_reset({ target_date: "2026-09-05" })',
            exampleOutput: `"🔄 ĐÃ ĐỒNG BỘ ĐƠN CƠM CHO NGÀY 2026-09-05: 102 người, 95 đơn..."`
        }
    ];

    const filteredTools = tools.filter(t => selectedToolFilter === 'all' || t.type === selectedToolFilter);

    return (
        <div className="min-h-screen bg-[#0d0d0f] text-slate-200 selection:bg-amber-500/30 selection:text-amber-200">
            {/* Header Navigation */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0d0d0f]/80 border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <img src="/logo.png" alt="Cơm Ngon" className="w-8 h-8 rounded-lg shadow-md group-hover:scale-105 transition-transform" />
                        <span className="font-bold text-white text-lg tracking-tight">Cơm Ngon <span className="text-amber-500 text-sm font-semibold ml-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">MCP Protocol</span></span>
                    </Link>

                    <nav className="flex items-center gap-4 text-sm font-medium">
                        <Link href="/" className="text-slate-400 hover:text-white transition-colors">Trang chủ</Link>
                        <a href="#quickstart" className="text-slate-400 hover:text-white transition-colors hidden sm:inline-block">Cài đặt nhanh</a>
                        <a href="#tools" className="text-slate-400 hover:text-white transition-colors hidden sm:inline-block">Danh mục Tools</a>
                        <Link href="/login" className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all shadow-md shadow-amber-600/20">
                            Vào App
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden pt-16 pb-20 border-b border-white/5 bg-gradient-to-b from-amber-950/10 via-[#0d0d0f] to-[#0d0d0f]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-amber-600/10 blur-[120px] pointer-events-none rounded-full" />
                
                <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-6">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Chuẩn Model Context Protocol (MCP) chính thức 2026
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                        Tích hợp AI Agent với <br className="hidden sm:inline" />
                        <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">Cơm Ngon MCP Server</span>
                    </h1>

                    <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
                        Kết nối trực tiếp các AI Agent bên ngoài (<strong className="text-slate-200">Claude Desktop, Cursor IDE, n8n, AI Agent độc lập</strong>) với hệ sinh thái Cơm Ngon để tự động tra cứu báo cáo, đặt cơm, và quản lý nhân sự qua giao thức chuẩn hóa.
                    </p>

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                        <a href="#quickstart" className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-600/25 hover:brightness-110 transition-all">
                            ⚡ Bắt đầu kết nối ngay
                        </a>
                        <a href="#tools" className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10 transition-all">
                            📖 Xem tài liệu 19 công cụ
                        </a>
                    </div>
                </div>
            </section>

            {/* Architecture Overview */}
            <section className="py-16 border-b border-white/5 bg-[#121115]/50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-xs uppercase tracking-widest text-amber-500 font-bold">Kiến trúc kết nối</h2>
                        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">Cách AI Agent giao tiếp với Cơm Ngon</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-all">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-black text-xl mb-4">
                                1
                            </div>
                            <h3 className="text-lg font-bold text-white">AI Agent của bạn</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Claude Desktop, Cursor IDE, hệ thống n8n hoặc AI Agent tự phát triển gửi lệnh hội thoại tự nhiên của người dùng.
                            </p>
                        </div>

                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-amber-500/20 bg-amber-500/[0.02] transition-all relative">
                            <div className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                Cốt lõi
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-xl mb-4">
                                2
                            </div>
                            <h3 className="text-lg font-bold text-white">Cơm Ngon Cloud MCP (Vercel)</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Vận hành trực tiếp trên máy chủ đám mây Vercel qua endpoint <strong>https://comngon.io.vn/api/mcp</strong>, xác thực đa tổ chức (Multi-tenant) qua API Key và gọi hàm SSOT.
                            </p>
                        </div>

                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-all">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xl mb-4">
                                3
                            </div>
                            <h3 className="text-lg font-bold text-white">Supabase Database</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Đọc/ghi dữ liệu suất ăn, lịch làm việc, danh sách phòng ban và bảo vệ an toàn bằng Row-Level Security (RLS).
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quickstart Section */}
            <section id="quickstart" className="py-20 border-b border-white/5">
                <div className="max-w-5xl mx-auto px-4 sm:px-6">
                    <div className="text-center mb-12">
                        <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">Hướng dẫn cài đặt</span>
                        <h2 className="text-3xl font-extrabold text-white mt-1">Kết nối trong vòng 3 phút</h2>
                        <p className="text-slate-400 text-sm mt-2">Chọn nền tảng AI bạn đang sử dụng để xem cấu hình mẫu</p>
                    </div>

                    {/* Platform Selector Tabs */}
                    <div className="flex justify-center mb-8">
                        <div className="inline-flex p-1.5 rounded-2xl bg-white/[0.04] border border-white/5 gap-1">
                            <button
                                onClick={() => setActiveTab('claude')}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                    activeTab === 'claude'
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                🤖 Claude Desktop
                            </button>
                            <button
                                onClick={() => setActiveTab('cursor')}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                    activeTab === 'cursor'
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                ⚡ Cursor IDE
                            </button>
                            <button
                                onClick={() => setActiveTab('python')}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                    activeTab === 'python'
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                🐍 Python / LangChain
                            </button>
                            <button
                                onClick={() => setActiveTab('terminal')}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                    activeTab === 'terminal'
                                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                💻 Terminal / Node
                            </button>
                        </div>
                    </div>

                    {/* Code Snippet Box */}
                    <div className="relative rounded-2xl bg-[#141318] border border-white/10 overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.02] border-b border-white/5 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <span className="w-3 h-3 rounded-full bg-green-500/80" />
                                <span className="ml-2 font-mono text-slate-400">
                                    {activeTab === 'claude' && 'claude_desktop_config.json'}
                                    {activeTab === 'cursor' && 'cursor_mcp.json'}
                                    {activeTab === 'python' && 'client_example.py'}
                                    {activeTab === 'terminal' && 'build_and_run.sh'}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    const text = activeTab === 'claude' ? claudeConfig
                                        : activeTab === 'cursor' ? cursorConfig
                                        : activeTab === 'python' ? pythonExample
                                        : terminalCommand;
                                    copyToClipboard(text, activeTab);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                            >
                                {copiedSnippet === activeTab ? (
                                    <>
                                        <span className="text-emerald-400">✓</span> Đã sao chép
                                    </>
                                ) : (
                                    <>
                                        <span>📋</span> Sao chép
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="p-5 font-mono text-sm overflow-x-auto text-amber-100/90 leading-relaxed">
                            <pre>
                                {activeTab === 'claude' && claudeConfig}
                                {activeTab === 'cursor' && cursorConfig}
                                {activeTab === 'python' && pythonExample}
                                {activeTab === 'terminal' && terminalCommand}
                            </pre>
                        </div>
                    </div>

                    <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/80 leading-relaxed space-y-2">
                        <div>
                            ☁️ <strong>Kết nối đám mây (Cloud Remote MCP Server):</strong> AI Agent kết nối trực tiếp đến máy chủ Vercel qua endpoint <code>https://comngon.io.vn/api/mcp</code> mà KHÔNG cần tải mã nguồn hay cài đặt Node.js trên máy tính của bạn.
                        </div>
                        <div>
                            🔑 <strong>Lấy mã API Key:</strong> Quản trị viên đăng nhập vào Cơm Ngon &gt; Cài đặt &gt; API Keys để lấy mã bí mật có tiền tố <code>sk_live_...</code> gắn vào header <code>x-api-key</code>.
                        </div>
                    </div>
                </div>
            </section>

            {/* Tools Catalog */}
            <section id="tools" className="py-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-10 gap-4">
                        <div>
                            <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">API Reference</span>
                            <h2 className="text-3xl font-extrabold text-white mt-1">Danh mục 8 Công cụ (Tools)</h2>
                            <p className="text-slate-400 text-sm mt-1">Tất cả các công cụ đều có tham số được xác thực nghiêm ngặt bằng Zod schema</p>
                        </div>

                        {/* Tool Type Filter */}
                        <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/5 gap-1">
                            <button
                                onClick={() => setSelectedToolFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    selectedToolFilter === 'all' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Tất cả ({tools.length})
                            </button>
                            <button
                                onClick={() => setSelectedToolFilter('query')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    selectedToolFilter === 'query' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Tra cứu (4)
                            </button>
                            <button
                                onClick={() => setSelectedToolFilter('action')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    selectedToolFilter === 'action' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Thao tác (4)
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {filteredTools.map((tool) => (
                            <div key={tool.name} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3">
                                        <code className="text-base font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20 font-mono">
                                            {tool.name}
                                        </code>
                                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                            tool.type === 'query'
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        }`}>
                                            {tool.badge}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(tool.name, tool.name)}
                                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                                    >
                                        {copiedSnippet === tool.name ? '✓ Đã chép tên tool' : 'Sao chép tên tool'}
                                    </button>
                                </div>

                                <p className="text-slate-300 text-sm leading-relaxed mb-4">
                                    {tool.description}
                                </p>

                                {/* Parameters Table */}
                                <div className="mb-4">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tham số đầu vào:</div>
                                    <div className="overflow-x-auto rounded-xl border border-white/5">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/[0.03] text-slate-400 font-semibold border-b border-white/5">
                                                <tr>
                                                    <th className="py-2.5 px-3 font-mono">Tên tham số</th>
                                                    <th className="py-2.5 px-3">Kiểu dữ liệu</th>
                                                    <th className="py-2.5 px-3">Mô tả & Chú thích</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-slate-300">
                                                {tool.params.map((p, pIdx) => (
                                                    <tr key={pIdx} className="hover:bg-white/[0.01]">
                                                        <td className="py-2.5 px-3 font-mono text-amber-300/90 font-medium">{p.name}</td>
                                                        <td className="py-2.5 px-3 text-slate-400 font-mono">{p.type}</td>
                                                        <td className="py-2.5 px-3">{p.desc}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Example Call & Output */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="rounded-xl bg-[#09090b] p-3 border border-white/5">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                            <span>Mẫu gọi tool</span>
                                        </div>
                                        <pre className="font-mono text-xs text-amber-200/90 overflow-x-auto whitespace-pre-wrap">
                                            {tool.exampleCall}
                                        </pre>
                                    </div>

                                    <div className="rounded-xl bg-[#09090b] p-3 border border-white/5">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                            <span>Kết quả trả về mẫu (JSON)</span>
                                        </div>
                                        <pre className="font-mono text-xs text-slate-400 overflow-x-auto max-h-32 overflow-y-auto">
                                            {tool.exampleOutput}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-white/5 bg-[#0a0a0c] text-slate-400 text-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="Cơm Ngon" className="w-5 h-5 rounded" />
                        <span className="font-bold text-white text-sm">Cơm Ngon SaaS</span>
                        <span className="text-slate-600">|</span>
                        <span>Model Context Protocol v1.6.0</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link href="/" className="hover:text-white transition-colors">Trang chủ</Link>
                        <Link href="/login" className="hover:text-white transition-colors">Đăng nhập</Link>
                        <Link href="/signup" className="hover:text-white transition-colors">Đăng ký doanh nghiệp</Link>
                        <a href="mailto:hello@comngon.io.vn" className="hover:text-white transition-colors">Hỗ trợ kỹ thuật</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
