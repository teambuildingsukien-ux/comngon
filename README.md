# Cơm Ngon — Hệ Thống Quản Lý Suất Ăn Trưa Nội Bộ

> Hệ thống quản lý đặt cơm trưa doanh nghiệp xây dựng trên **Next.js 16 (App Router)** + **React 19** + **Supabase (PostgreSQL)**.

---

## 1. Nghiệp Vụ & Quy Trình Cốt Lõi (Core Business Logic)

### 📌 Triết lý thiết kế: Mô hình Opt-out (Mặc định ăn)
- Nhân viên trong biên chế mặc định được hệ thống tính là **Ăn trưa** (`eating`).
- Nhân viên **chỉ cần thao tác khi có thay đổi**: Báo nghỉ (`not_eating`), Đăng ký suất khách (`guest_meals`), hoặc Đổi ca ăn.
- Giúp giảm thiểu tối đa tình trạng nhân viên quên đăng ký dẫn đến thiếu suất ăn.

### ⏰ Thời gian chốt cơm & Cơ chế đăng ký muộn (Cut-off Time & Late Toggle)
- **Thời gian chốt cơm**: Mặc định **05:00 sáng** các ngày nấu cơm (Thứ 2 đến Thứ 7).
- **Quyền báo muộn sau 05:00**:
  - Được quản lý linh hoạt thông qua cấu hình Quản trị viên (`allow_late_registration` trong bảng `system_settings`).
  - Khi Quản trị viên **TẮT** (`false`): Sau 05:00 sáng hệ thống khóa cứng, nhân viên không thể tự sửa hoặc báo muộn.
  - Khi Quản trị viên **BẬT** (`true`): Nhân viên được phép gửi báo muộn (ghi nhận trạng thái `is_late = true` để phục vụ thống kê).

### 🍱 Phân chia Ca ăn trưa (Shifts)
Hệ thống hỗ trợ chia theo ca ăn để tránh ùn ứ tại phòng ăn:
- **Ca 1**: `12:00` - `12:30`
- **Ca 2**: `12:30` - `13:00`
- Báo cáo xuất Excel cho Bếp (`/api/kitchen/export/daily`) tự động thống kê tổng hợp số lượng chi tiết theo từng ca ăn.

---

## 2. Cấu Trúc Cơ Sở Dữ Liệu (Database Schemas)

Hệ thống bao gồm **17 bảng cốt lõi** phục vụ vận hành:

| STT | Bảng | Mục đích |
|:---:|:---|:---|
| 1 | `tenants` | Thông tin công ty / tổ chức |
| 2 | `departments` | Danh mục phòng ban |
| 3 | `shifts` | Cấu hình ca ăn trưa (Ca 1, Ca 2) |
| 4 | `groups` | Nhóm nhân viên / nhóm nội bộ |
| 5 | `users` | Hồ sơ nhân viên, vai trò (admin, kitchen, employee), ca ăn mặc định |
| 6 | `orders` | Lịch sử đăng ký suất ăn theo ngày (ăn, nghỉ, hủy, báo muộn) |
| 7 | `guest_meals` | Đăng ký suất ăn phát sinh cho khách / đối tác |
| 8 | `cooking_exceptions` | Ngày nghỉ lễ / ngày đột xuất không nấu cơm |
| 9 | `announcements` | Thông báo nội bộ từ Quản trị viên |
| 10 | `urgent_notifications` | Thông báo khẩn cấp (thông báo tức thì) |
| 11 | `daily_summaries` | Tổng hợp nhanh số lượng suất ăn theo ngày cho Bếp |
| 12 | `system_settings` | Cấu hình giờ chốt, toggle báo muộn, ngày nấu cơm trong tuần |
| 13 | `activity_logs` | Nhật ký kiểm toán thao tác hệ thống (Audit trail) |
| 14 | `push_subscriptions` | Đăng ký nhận thông báo đẩy qua Web Push (PWA) |
| 15 | `notification_logs` | Lịch sử gửi thông báo |
| 16 | `import_logs` | Nhật ký import danh sách nhân viên từ file Excel |
| 17 | `invitations` | Quản lý lời mời nhân viên tham gia hệ thống |

### Các file script DDL đi kèm:
- **`DATABASE-FULL-SCHEMA.sql`**: Cú pháp chuẩn PostgreSQL / Supabase, bao gồm đầy đủ Triggers, Foreign Keys, Indexes và Row Level Security.
- **`MARIADB-FULL-SCHEMA.sql`**: Phiên bản tương thích hoàn chỉnh MariaDB / MySQL (sử dụng `CHAR(36)`, `DATETIME`, `JSON`, `TINYINT(1)`), thuận tiện khi cần tham khảo hoặc tích hợp với các hệ thống PHP/MariaDB.
- **`SEED-DATA.sql`**: Script nạp dữ liệu mẫu ban đầu (Tenant Viet Vision Travel, 6 phòng ban, 2 ca ăn, Quản trị viên, cài đặt hệ thống).

---

## 3. Cài Đặt & Khởi Chạy (Getting Started)

### Yêu cầu môi trường
- Node.js >= 18
- Tài khoản Supabase hoặc máy chủ PostgreSQL

### Các bước cài đặt

1. **Cài đặt thư viện dependencies:**
```bash
npm install
```

2. **Cấu hình biến môi trường (`.env.local`):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. **Khởi tạo dữ liệu cơ sở dữ liệu:**
Chạy file `DATABASE-FULL-SCHEMA.sql` trên SQL Editor của Supabase, sau đó:
```bash
npm run seed
```

4. **Chạy máy chủ phát triển (Dev Server):**
```bash
npm run dev
```
Truy cập ứng dụng tại: `http://localhost:3000`.
