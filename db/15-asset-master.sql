-- TASK 2: Master Asset / TSCĐ / CCDC. Additive migration with legacy mapping.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_tai_san TEXT NOT NULL UNIQUE,
    loai_tai_san TEXT NOT NULL CHECK (loai_tai_san IN ('TSCD','CCDC')),
    ten TEXT NOT NULL,
    nhom_tai_san TEXT,
    dvt TEXT NOT NULL DEFAULT 'Cái',
    so_luong REAL NOT NULL DEFAULT 1 CHECK (so_luong >= 0),
    nguyen_gia REAL NOT NULL DEFAULT 0 CHECK (nguyen_gia >= 0),
    gia_tri_con_lai REAL NOT NULL DEFAULT 0 CHECK (gia_tri_con_lai >= 0),
    ngay_dua_vao_su_dung TEXT,
    nguon_hinh_thanh TEXT,
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_id INTEGER REFERENCES vi_tri(id),
    nguoi_quan_ly TEXT,
    trang_thai TEXT NOT NULL DEFAULT 'dang_su_dung'
        CHECK (trang_thai IN ('cho_duyet','dang_su_dung','tam_ngung','cho_thanh_ly','da_thanh_ly')),
    ghi_chu TEXT,
    legacy_thiet_bi_id INTEGER UNIQUE REFERENCES thiet_bi(id),
    version INTEGER NOT NULL DEFAULT 1,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_sua_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (gia_tri_con_lai <= nguyen_gia OR nguyen_gia = 0)
);

CREATE INDEX IF NOT EXISTS idx_assets_donvi ON assets(don_vi_id, hoat_dong);
CREATE INDEX IF NOT EXISTS idx_assets_loai ON assets(loai_tai_san, trang_thai);
CREATE INDEX IF NOT EXISTS idx_assets_ten ON assets(ten);
CREATE INDEX IF NOT EXISTS idx_assets_legacy ON assets(legacy_thiet_bi_id);

CREATE TABLE IF NOT EXISTS asset_legacy_map (
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    legacy_table TEXT NOT NULL,
    legacy_id INTEGER NOT NULL,
    checksum TEXT,
    ngay_map TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (legacy_table, legacy_id),
    UNIQUE (asset_id, legacy_table)
);

INSERT OR IGNORE INTO assets (
    ma_tai_san, loai_tai_san, ten, nhom_tai_san, dvt, so_luong,
    nguyen_gia, gia_tri_con_lai, ngay_dua_vao_su_dung, don_vi_id,
    vi_tri_id, trang_thai, ghi_chu, legacy_thiet_bi_id, hoat_dong
)
SELECT
    CASE
      WHEN tb.ma_tscd IS NOT NULL AND trim(tb.ma_tscd) <> ''
       AND (SELECT COUNT(*) FROM thiet_bi x WHERE trim(x.ma_tscd)=trim(tb.ma_tscd)) = 1
      THEN trim(tb.ma_tscd)
      ELSE 'QLCD-LEGACY-' || tb.id
    END,
    COALESCE(tb.loai_ts, 'TSCD'), tb.ten, n.ten, COALESCE(tb.dvt, 'Cái'),
    COALESCE(tb.so_luong, 1), COALESCE(tb.nguyen_gia, 0),
    COALESCE(tb.gia_tri_con_lai, 0), tb.ngay_su_dung, tb.phan_xuong_id,
    tb.vi_tri_id,
    CASE tb.trang_thai
      WHEN 'da_thanh_ly' THEN 'da_thanh_ly'
      WHEN 'cho_thanh_ly' THEN 'cho_thanh_ly'
      ELSE 'dang_su_dung'
    END,
    tb.ghi_chu, tb.id, CASE WHEN tb.trang_thai='da_thanh_ly' THEN 0 ELSE 1 END
FROM thiet_bi tb
LEFT JOIN nhom_thiet_bi n ON n.id=tb.nhom_id
WHERE tb.phan_xuong_id IS NOT NULL;

INSERT OR IGNORE INTO asset_legacy_map(asset_id, legacy_table, legacy_id)
SELECT a.id, 'thiet_bi', a.legacy_thiet_bi_id
FROM assets a WHERE a.legacy_thiet_bi_id IS NOT NULL;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('asset.view','Xem tài sản','Xem danh sách và chi tiết TSCĐ/CCDC','asset'),
('asset.create','Thêm tài sản','Tạo TSCĐ/CCDC mới','asset'),
('asset.edit','Sửa tài sản','Sửa thông tin Asset Master','asset'),
('asset.archive','Ngừng tài sản','Ngừng sử dụng bản ghi tài sản','asset'),
('asset.import','Import tài sản','Import Asset Master từ Excel','asset'),
('asset.export','Export tài sản','Xuất Asset Master ra Excel','asset');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id, q.ma, NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='admin' AND q.hang_muc='asset';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id, q.ma, NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='cd_cty' AND q.ma IN
('asset.view','asset.create','asset.edit','asset.archive','asset.import','asset.export');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id, q.ma, NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN
('asset.view','asset.create','asset.edit','asset.import','asset.export');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id, q.ma, NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='asset.view';
