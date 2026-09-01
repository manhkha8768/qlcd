-- TASK 1: multi-unit assignments. Additive and safe for existing data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cong_trinh (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT NOT NULL UNIQUE,
    ten TEXT NOT NULL,
    dia_diem TEXT,
    tu_ngay TEXT,
    den_ngay TEXT,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (den_ngay IS NULL OR tu_ngay IS NULL OR den_ngay >= tu_ngay)
);

CREATE TABLE IF NOT EXISTS don_vi_cong_trinh (
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE CASCADE,
    cong_trinh_id INTEGER NOT NULL REFERENCES cong_trinh(id) ON DELETE CASCADE,
    tu_ngay TEXT,
    den_ngay TEXT,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    PRIMARY KEY (don_vi_id, cong_trinh_id, tu_ngay),
    CHECK (den_ngay IS NULL OR tu_ngay IS NULL OR den_ngay >= tu_ngay)
);
CREATE INDEX IF NOT EXISTS idx_dvct_congtrinh ON don_vi_cong_trinh(cong_trinh_id, hoat_dong);

CREATE TABLE IF NOT EXISTS nguoi_dung_don_vi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE CASCADE,
    loai_phan_cong TEXT NOT NULL DEFAULT 'thanh_vien'
        CHECK (loai_phan_cong IN ('thanh_vien','chu_nhiem','giam_sat','thu_kho')),
    tu_ngay TEXT,
    den_ngay TEXT,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    nguoi_gan_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (den_ngay IS NULL OR tu_ngay IS NULL OR den_ngay >= tu_ngay),
    UNIQUE (nguoi_dung_id, don_vi_id, loai_phan_cong, tu_ngay)
);
CREATE INDEX IF NOT EXISTS idx_nddv_nguoi_hieuluc
    ON nguoi_dung_don_vi(nguoi_dung_id, hoat_dong, tu_ngay, den_ngay);
CREATE INDEX IF NOT EXISTS idx_nddv_donvi ON nguoi_dung_don_vi(don_vi_id, hoat_dong);

CREATE TABLE IF NOT EXISTS quyen_nguoi_dung_dong (
    nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    ma_quyen TEXT NOT NULL REFERENCES ma_quyen(ma) ON DELETE CASCADE,
    duoc_phep INTEGER NOT NULL CHECK (duoc_phep IN (0,1)),
    PRIMARY KEY (nguoi_dung_id, ma_quyen)
);

INSERT OR IGNORE INTO nguoi_dung_don_vi (nguoi_dung_id, don_vi_id, loai_phan_cong)
SELECT id, phan_xuong_id, 'thanh_vien' FROM nguoi_dung WHERE phan_xuong_id IS NOT NULL;
