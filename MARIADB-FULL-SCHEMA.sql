-- =====================================================================
-- CƠM NGON - CẤU TRÚC DATABASE DÀNH RIÊNG CHO MARIADB / MYSQL (VVHCHAT)
-- Đã convert chuẩn syntax MariaDB: CHAR(36) UUID, DATETIME, JSON
-- =====================================================================

-- 1. BẢNG TỔ CHỨC / CÔNG TY (tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active',
    is_active TINYINT(1) DEFAULT 1,
    settings JSON,
    logo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG PHÒNG BAN (departments)
CREATE TABLE IF NOT EXISTS departments (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_departments_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG CA ĂN (shifts)
CREATE TABLE IF NOT EXISTS shifts (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    description TEXT,
    active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_shifts_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG NHÓM ĂN (groups)
CREATE TABLE IF NOT EXISTS `groups` (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    shift_id CHAR(36) NULL,
    table_area VARCHAR(100),
    description TEXT,
    active TINYINT(1) DEFAULT 1,
    registration_mode VARCHAR(50) DEFAULT 'opt_out',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_groups_tenant (tenant_id),
    INDEX idx_groups_shift (shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG NGƯỜI DÙNG / NHÂN VIÊN (users)
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Employee', -- 'Employee', 'Manager', 'Admin', 'Kitchen'
    employee_code VARCHAR(100),
    shift_id CHAR(36) NULL,
    group_id CHAR(36) NULL,
    shift VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'resigned'
    status_changed_at DATETIME NULL,
    status_reason TEXT,
    default_meal_status VARCHAR(50) NOT NULL DEFAULT 'eating', -- 'eating', 'not_eating'
    start_date DATE DEFAULT (CURRENT_DATE),
    resigned_date DATE NULL,
    is_active TINYINT(1) DEFAULT 1,
    avatar_url TEXT,
    telegram_chat_id VARCHAR(100),
    metadata JSON,
    created_by CHAR(36) NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_tenant_email (tenant_id, email),
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG SUẤT ĂN HÀNG NGÀY (orders)
CREATE TABLE IF NOT EXISTS orders (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'eating', -- 'eating', 'not_eating', 'cancelled'
    locked TINYINT(1) NOT NULL DEFAULT 0,
    is_late TINYINT(1) NOT NULL DEFAULT 0,
    dietary_preference VARCHAR(50) DEFAULT 'normal', -- 'normal' (mặn), 'vegetarian' (chay), 'diet'
    note TEXT,
    source VARCHAR(50) DEFAULT 'auto_system', -- 'auto_system', 'user_toggle', 'admin_toggle', 'auto_resigned'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orders_tenant_user_date (tenant_id, user_id, date),
    INDEX idx_orders_date (date),
    INDEX idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. BẢNG SUẤT ĂN KHÁCH VÃNG LAI (guest_meals)
CREATE TABLE IF NOT EXISTS guest_meals (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    date DATE NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    note TEXT,
    created_by CHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_guest_meals_date (tenant_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BẢNG NGOẠI LỆ NẤU ĂN / NGHỈ BẾP (cooking_exceptions)
CREATE TABLE IF NOT EXISTS cooking_exceptions (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'no_cook', 'extra_cook'
    reason TEXT,
    cancelled_count INT DEFAULT 0,
    auto_cancelled_user_ids JSON,
    created_by CHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cooking_exceptions_date (tenant_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. BẢNG BẢNG TIN THÔNG BÁO (announcements)
CREATE TABLE IF NOT EXISTS announcements (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    title VARCHAR(255),
    content TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'normal',
    active TINYINT(1) DEFAULT 1,
    start_date DATE NULL,
    end_date DATE NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. BẢNG CÀI ĐẶT HỆ THỐNG (system_settings)
CREATE TABLE IF NOT EXISTS system_settings (
    tenant_id CHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. BẢNG TỔNG HỢP NGÀY (daily_summaries)
CREATE TABLE IF NOT EXISTS daily_summaries (
    id CHAR(36) PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    date DATE NOT NULL,
    is_cooking_day TINYINT(1) DEFAULT 1,
    total_employees INT DEFAULT 0,
    eating_count INT DEFAULT 0,
    not_eating_count INT DEFAULT 0,
    guest_meals INT DEFAULT 0,
    total_meals INT DEFAULT 0,
    cancel_rate DECIMAL(5,2) DEFAULT 0.00,
    paused_count INT DEFAULT 0,
    resigned_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_daily_summaries_date (tenant_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
