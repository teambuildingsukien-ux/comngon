-- Migration: Khắc phục lỗi cơ chế trigger ngoại lệ bếp ăn
-- Thêm cột lưu danh sách user bị tự động hủy và số lượng để bỏ phụ thuộc vào activity_logs và race condition setTimeout

-- 1. Thêm cột vào bảng cooking_exceptions
ALTER TABLE cooking_exceptions 
ADD COLUMN IF NOT EXISTS auto_cancelled_user_ids UUID[] DEFAULT '{}'::UUID[],
ADD COLUMN IF NOT EXISTS cancelled_count INT DEFAULT 0;

-- 2. Cập nhật hàm trigger tự động hủy suất ăn (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION fn_cooking_exception_auto_cancel()
RETURNS TRIGGER AS $$
DECLARE
  cancelled_ids uuid[];
  c_count int := 0;
BEGIN
  IF NEW.type = 'no_cook' THEN
    -- Lấy danh sách ID user đang có suất ăn đăng ký ngày đó
    SELECT COALESCE(array_agg(user_id), '{}'::uuid[]) INTO cancelled_ids
    FROM orders
    WHERE tenant_id = NEW.tenant_id
      AND date = NEW.date
      AND status = 'eating';

    c_count := COALESCE(array_length(cancelled_ids, 1), 0);

    IF c_count > 0 THEN
      -- Cập nhật trạng thái orders sang not_eating
      UPDATE orders
      SET status = 'not_eating', 
          updated_at = NOW(),
          source = 'admin_status_change' -- Đánh dấu do hệ thống tự động đổi trạng thái để khôi phục sau này
      WHERE tenant_id = NEW.tenant_id
        AND date = NEW.date
        AND status = 'eating';

      -- Ghi nhận dữ liệu trực tiếp vào bản ghi cooking_exceptions để lưu trữ lâu dài
      NEW.auto_cancelled_user_ids := cancelled_ids;
      NEW.cancelled_count := c_count;

      -- Ghi activity log
      INSERT INTO activity_logs (tenant_id, action, performed_by, target_type, details)
      VALUES (
        NEW.tenant_id,
        'cooking_exception_auto_cancel',
        NEW.created_by,
        'order',
        jsonb_build_object(
          'date', NEW.date::text,
          'reason', COALESCE(NEW.reason, 'Nghỉ bếp ngoại lệ'),
          'cancelled_count', c_count,
          'auto_cancelled_user_ids', to_jsonb(cancelled_ids),
          'source', 'db_trigger'
        )
      );
    ELSE
      NEW.auto_cancelled_user_ids := '{}'::uuid[];
      NEW.cancelled_count := 0;
    END IF;
  ELSE
    NEW.auto_cancelled_user_ids := '{}'::uuid[];
    NEW.cancelled_count := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Tạo lại trigger tự động hủy suất ăn (chuyển từ AFTER sang BEFORE)
DROP TRIGGER IF EXISTS trg_cooking_exception_auto_cancel ON cooking_exceptions;

CREATE TRIGGER trg_cooking_exception_auto_cancel
BEFORE INSERT OR UPDATE ON cooking_exceptions
FOR EACH ROW
EXECUTE FUNCTION fn_cooking_exception_auto_cancel();

-- 4. Cập nhật hàm trigger tự động khôi phục suất ăn (BEFORE DELETE)
CREATE OR REPLACE FUNCTION fn_cooking_exception_auto_restore()
RETURNS TRIGGER AS $$
DECLARE
  restored_count int := 0;
BEGIN
  IF OLD.type = 'no_cook' AND OLD.auto_cancelled_user_ids IS NOT NULL AND array_length(OLD.auto_cancelled_user_ids, 1) > 0 THEN
    -- Khôi phục các orders của các nhân viên bị ảnh hưởng về lại eating
    -- Chỉ khôi phục những ngày có trạng thái 'not_eating' và có source là 'admin_status_change' để không khôi phục đè lên ngày nhân viên tự chủ động hủy cơm
    UPDATE orders
    SET status = 'eating', 
        updated_at = NOW(),
        source = 'admin_status_change'
    WHERE tenant_id = OLD.tenant_id
      AND date = OLD.date
      AND status = 'not_eating'
      AND user_id = ANY(OLD.auto_cancelled_user_ids)
      AND source = 'admin_status_change';

    GET DIAGNOSTICS restored_count = ROW_COUNT;

    IF restored_count > 0 THEN
      -- Ghi activity log
      INSERT INTO activity_logs (tenant_id, action, performed_by, target_type, details)
      VALUES (
        OLD.tenant_id,
        'cooking_exception_restore_orders',
        OLD.created_by,
        'order',
        jsonb_build_object(
          'date', OLD.date::text,
          'restored_count', restored_count,
          'source', 'db_trigger'
        )
      );
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
