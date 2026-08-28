-- =====================================================================
-- BỔ SUNG: số lượng & đơn vị tính cho thiết bị
-- CCDC thường quản lý theo lô (vd: 50 đèn lò) nên không tách thành
-- 50 bản ghi riêng - giữ số lượng trên một bản ghi.
-- =====================================================================

ALTER TABLE thiet_bi ADD COLUMN so_luong REAL NOT NULL DEFAULT 1;
ALTER TABLE thiet_bi ADD COLUMN dvt TEXT DEFAULT 'Cái';
ALTER TABLE thiet_bi ADD COLUMN lo_import_id INTEGER REFERENCES lo_import(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tb_lo ON thiet_bi(lo_import_id);
