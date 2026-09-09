-- Metadata kiểm kê theo mẫu Công ty và trạng thái ẩn khỏi giao diện.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS thiet_bi_kiem_ke (
    thiet_bi_id INTEGER PRIMARY KEY REFERENCES thiet_bi(id) ON DELETE RESTRICT,
    so_kiem_ke TEXT,
    so_quan_ly TEXT,
    so_luong_quan_ly REAL,
    so_luong_kiem_ke REAL,
    so_luong_doi_chieu REAL,
    danh_gia_ky_thuat REAL,
    ghi_chu_kiem_ke TEXT,
    quan_ly_theo_quyet_dinh TEXT,
    hidden_from_web INTEGER NOT NULL DEFAULT 0 CHECK(hidden_from_web IN (0,1)),
    hidden_reason TEXT,
    hidden_source TEXT,
    hidden_at TEXT,
    hidden_by INTEGER REFERENCES nguoi_dung(id),
    source_row INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tbkk_hidden ON thiet_bi_kiem_ke(hidden_from_web);
CREATE INDEX IF NOT EXISTS idx_tbkk_sokk ON thiet_bi_kiem_ke(so_kiem_ke);
CREATE INDEX IF NOT EXISTS idx_tbkk_soql ON thiet_bi_kiem_ke(so_quan_ly);

CREATE TABLE IF NOT EXISTS import_kiem_ke_tam (
    import_tam_id INTEGER PRIMARY KEY REFERENCES import_tam(id) ON DELETE CASCADE,
    so_kiem_ke TEXT, so_quan_ly TEXT,
    so_luong_quan_ly REAL, so_luong_kiem_ke REAL, so_luong_doi_chieu REAL,
    danh_gia_ky_thuat REAL, ghi_chu_kiem_ke TEXT, quan_ly_theo_quyet_dinh TEXT,
    hidden_from_web INTEGER NOT NULL DEFAULT 0 CHECK(hidden_from_web IN (0,1)),
    highlight_color TEXT, source_row INTEGER
);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('thietbi.hide','Ẩn thiết bị','Ẩn thiết bị khỏi giao diện nhưng vẫn giữ trong biên bản kiểm kê','thietbi'),
('thietbi.unhide','Hiện lại thiết bị','Hiện lại thiết bị đã được đánh dấu ẩn','thietbi'),
('thietbi.export','Xuất danh sách thiết bị','Xuất danh sách theo bộ lọc hiện tại','thietbi'),
('thietbi.export.official','Xuất biên bản kiểm kê đầy đủ','Xuất đầy đủ thiết bị kể cả dòng ẩn','thietbi');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma IN ('thietbi.hide','thietbi.unhide','thietbi.export','thietbi.export.official');
