-- =====================================================================
-- MODULE NCVT QUÝ — NHU CẦU VẬT TƯ THEO QUÝ
--
-- NGUYÊN TẮC:
--   File Excel NCVT là dữ liệu nguồn, không bao giờ bị sửa.
--   Số "đã lấy" và "còn lại" là kết quả của các giao dịch cấp phát,
--   không phải số do người dùng gõ vào.
--   Mọi thay đổi số lượng chỉ xảy ra trong transaction ở backend.
-- =====================================================================

/* ---------------------------------------------------------------
   1. KỲ NCVT
   Mỗi năm + quý + đơn vị là một kỳ riêng. Kỳ toàn công ty để
   phan_xuong_id = NULL.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS ncvt_ky (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nam             INTEGER NOT NULL,
    quy             INTEGER NOT NULL CHECK (quy BETWEEN 1 AND 4),
    ten_ky          TEXT,
    phan_xuong_id   INTEGER REFERENCES phan_xuong(id) ON DELETE RESTRICT,

    trang_thai      TEXT NOT NULL DEFAULT 'nhap'
                    CHECK (trang_thai IN ('nhap','da_nhap','dang_ap_dung','da_dong','huy')),

    nguoi_tao_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_kich_hoat  TEXT,
    nguoi_dong_id   INTEGER REFERENCES nguoi_dung(id),
    ngay_dong       TEXT,
    ly_do_dong      TEXT,
    ghi_chu         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ncvtky_duy_nhat
    ON ncvt_ky(nam, quy, COALESCE(phan_xuong_id, 0));
CREATE INDEX IF NOT EXISTS idx_ncvtky_tt ON ncvt_ky(trang_thai, nam, quy);

/* ---------------------------------------------------------------
   2. LÔ IMPORT — giữ nguyên vết file nguồn để đối chiếu cuối quý
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS ncvt_lo_import (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ky_id           INTEGER NOT NULL REFERENCES ncvt_ky(id) ON DELETE CASCADE,
    ten_file        TEXT NOT NULL,
    duong_dan       TEXT NOT NULL,
    ten_sheet       TEXT,
    dong_tieu_de    INTEGER,
    mapping_json    TEXT,
    tong_dong       INTEGER DEFAULT 0,
    so_hop_le       INTEGER DEFAULT 0,
    so_loi          INTEGER DEFAULT 0,
    so_da_nhap      INTEGER DEFAULT 0,
    trang_thai      TEXT NOT NULL DEFAULT 'da_tai'
                    CHECK (trang_thai IN ('da_tai','da_anh_xa','da_nhap','huy')),
    nguoi_tai_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tai        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_nhap       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ncvtlo_ky ON ncvt_lo_import(ky_id);

/* Bảng tạm để xem trước và sửa lỗi trước khi ghi chính thức */
CREATE TABLE IF NOT EXISTS ncvt_tam (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lo_id           INTEGER NOT NULL REFERENCES ncvt_lo_import(id) ON DELETE CASCADE,
    dong_goc        INTEGER NOT NULL,
    du_lieu_goc     TEXT NOT NULL,

    ma_vat_tu       TEXT,
    ten_vat_tu      TEXT,
    quy_cach        TEXT,
    dvt             TEXT,
    so_luong_kh     REAL,
    don_gia         REAL,
    cong_trinh      TEXT,
    ghi_chu         TEXT,

    hop_le          INTEGER NOT NULL DEFAULT 0,
    loi             TEXT,
    canh_bao        TEXT,
    da_nhap         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ncvttam_lo ON ncvt_tam(lo_id, hop_le);

/* ---------------------------------------------------------------
   3. CHI TIẾT NCVT
   so_luong_da_cap là số cộng dồn từ bảng cấp phát, chỉ được cập nhật
   bên trong transaction cấp phát. Ràng buộc CHECK là chốt chặn cuối
   cùng: kể cả code có lỗi thì database vẫn không cho cấp vượt.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS ncvt_chi_tiet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ky_id           INTEGER NOT NULL REFERENCES ncvt_ky(id) ON DELETE CASCADE,
    lo_import_id    INTEGER REFERENCES ncvt_lo_import(id) ON DELETE SET NULL,

    ma_vat_tu       TEXT,
    ten_vat_tu      TEXT NOT NULL,
    quy_cach        TEXT,
    dvt             TEXT NOT NULL DEFAULT 'Cái',
    don_gia         REAL DEFAULT 0,

    so_luong_kh     REAL NOT NULL DEFAULT 0,
    so_luong_da_cap REAL NOT NULL DEFAULT 0,

    phan_xuong_id   INTEGER REFERENCES phan_xuong(id),
    cong_trinh      TEXT,
    phu_tung_id     INTEGER REFERENCES phu_tung(id) ON DELETE SET NULL,

    dong_goc        INTEGER,
    ghi_chu         TEXT,
    hoat_dong       INTEGER NOT NULL DEFAULT 1,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua        TEXT,

    CHECK (so_luong_kh >= 0),
    CHECK (so_luong_da_cap >= 0),
    CHECK (so_luong_da_cap <= so_luong_kh)
);
CREATE INDEX IF NOT EXISTS idx_ncvtct_ky ON ncvt_chi_tiet(ky_id, hoat_dong);
CREATE INDEX IF NOT EXISTS idx_ncvtct_px ON ncvt_chi_tiet(phan_xuong_id);
CREATE INDEX IF NOT EXISTS idx_ncvtct_ma ON ncvt_chi_tiet(ma_vat_tu);
CREATE INDEX IF NOT EXISTS idx_ncvtct_ct ON ncvt_chi_tiet(cong_trinh);

/* ---------------------------------------------------------------
   4. GIAO DỊCH CẤP PHÁT
   Không sửa số lượng của giao dịch cũ. Sai thì hủy giao dịch, hệ thống
   hoàn lại số lượng và giữ nguyên bản ghi để truy vết.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS ncvt_cap_phat (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_phieu        TEXT NOT NULL UNIQUE,
    ky_id           INTEGER NOT NULL REFERENCES ncvt_ky(id) ON DELETE RESTRICT,
    chi_tiet_id     INTEGER NOT NULL REFERENCES ncvt_chi_tiet(id) ON DELETE RESTRICT,

    -- Chụp lại thông tin vật tư lúc cấp, phòng khi chi tiết bị sửa sau này
    ma_vat_tu       TEXT,
    ten_vat_tu      TEXT NOT NULL,
    dvt             TEXT,
    don_gia         REAL DEFAULT 0,

    so_luong        REAL NOT NULL,
    so_luong_truoc  REAL,
    so_luong_sau    REAL,

    phan_xuong_id   INTEGER REFERENCES phan_xuong(id),
    cong_trinh      TEXT,
    chu_nhiem       TEXT,
    nguoi_nhan      TEXT,
    noi_dung_su_dung TEXT,
    ghi_chu         TEXT,

    ngay_cap        TEXT NOT NULL,
    nguoi_cap_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),

    trang_thai      TEXT NOT NULL DEFAULT 'hieu_luc'
                    CHECK (trang_thai IN ('hieu_luc','da_huy')),
    ly_do_huy       TEXT,
    nguoi_huy_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_huy        TEXT,

    CHECK (so_luong > 0),
    CHECK (trang_thai <> 'da_huy' OR (ly_do_huy IS NOT NULL AND length(trim(ly_do_huy)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_ncvtcp_ct ON ncvt_cap_phat(chi_tiet_id, trang_thai);
CREATE INDEX IF NOT EXISTS idx_ncvtcp_ky ON ncvt_cap_phat(ky_id, ngay_cap);
CREATE INDEX IF NOT EXISTS idx_ncvtcp_px ON ncvt_cap_phat(phan_xuong_id, ngay_cap);
CREATE INDEX IF NOT EXISTS idx_ncvtcp_ctr ON ncvt_cap_phat(cong_trinh);

/* ---------------------------------------------------------------
   5. VIEW — số còn lại luôn được tính, không lưu cứng
   --------------------------------------------------------------- */
DROP VIEW IF EXISTS v_ncvt_chi_tiet;
CREATE VIEW v_ncvt_chi_tiet AS
SELECT  ct.*,
        (ct.so_luong_kh - ct.so_luong_da_cap) AS so_luong_con_lai,
        CASE
            WHEN ct.so_luong_kh <= 0 THEN 'khong_co_ke_hoach'
            WHEN ct.so_luong_da_cap >= ct.so_luong_kh THEN 'da_cap_het'
            WHEN ct.so_luong_da_cap = 0 THEN 'chua_cap'
            WHEN (ct.so_luong_kh - ct.so_luong_da_cap) * 10 <= ct.so_luong_kh THEN 'sap_het'
            ELSE 'con_hang'
        END AS trang_thai_cap,
        ROUND(CASE WHEN ct.so_luong_kh > 0
              THEN ct.so_luong_da_cap * 100.0 / ct.so_luong_kh ELSE 0 END, 1) AS ty_le_da_cap,
        ky.nam, ky.quy, ky.trang_thai AS trang_thai_ky,
        px.ten_ngan AS px, px.ten AS ten_px,
        (SELECT COUNT(*) FROM ncvt_cap_phat cp
          WHERE cp.chi_tiet_id = ct.id AND cp.trang_thai = 'hieu_luc') AS so_lan_cap,
        -- Đối chiếu: tổng cấp phát thực tế từ bảng giao dịch
        (SELECT COALESCE(SUM(cp.so_luong), 0) FROM ncvt_cap_phat cp
          WHERE cp.chi_tiet_id = ct.id AND cp.trang_thai = 'hieu_luc') AS tong_cap_thuc_te
FROM ncvt_chi_tiet ct
JOIN ncvt_ky ky         ON ky.id = ct.ky_id
LEFT JOIN phan_xuong px ON px.id = ct.phan_xuong_id
WHERE ct.hoat_dong = 1;

DROP VIEW IF EXISTS v_ncvt_ky;
CREATE VIEW v_ncvt_ky AS
SELECT  ky.*,
        px.ten_ngan AS px, px.ten AS ten_px,
        nd.ho_ten AS nguoi_tao,
        (SELECT COUNT(*) FROM ncvt_chi_tiet ct
          WHERE ct.ky_id = ky.id AND ct.hoat_dong = 1) AS so_mat_hang,
        (SELECT COALESCE(SUM(ct.so_luong_kh), 0) FROM ncvt_chi_tiet ct
          WHERE ct.ky_id = ky.id AND ct.hoat_dong = 1) AS tong_ke_hoach,
        (SELECT COALESCE(SUM(ct.so_luong_da_cap), 0) FROM ncvt_chi_tiet ct
          WHERE ct.ky_id = ky.id AND ct.hoat_dong = 1) AS tong_da_cap
FROM ncvt_ky ky
LEFT JOIN phan_xuong px ON px.id = ky.phan_xuong_id
LEFT JOIN nguoi_dung nd ON nd.id = ky.nguoi_tao_id;

/* ---------------------------------------------------------------
   6. QUYỀN
   --------------------------------------------------------------- */
INSERT OR IGNORE INTO quyen (ma, ten, nhom) VALUES
('NCVT_XEM',      'Xem NCVT quý',                  'NCVT'),
('NCVT_IMPORT',   'Tải và nhập file NCVT quý',     'NCVT'),
('NCVT_QUAN_LY',  'Kích hoạt và đóng kỳ NCVT',     'NCVT'),
('NCVT_CAP',      'Lấy vật tư theo NCVT',          'NCVT'),
('NCVT_HUY_CAP',  'Hủy giao dịch cấp phát',        'NCVT'),
('NCVT_XEM_HET',  'Xem NCVT toàn công ty',         'NCVT');

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen)
SELECT 'admin', ma FROM quyen WHERE nhom = 'NCVT';

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen) VALUES
('cd_cty','NCVT_XEM'), ('cd_cty','NCVT_IMPORT'), ('cd_cty','NCVT_QUAN_LY'),
('cd_cty','NCVT_CAP'), ('cd_cty','NCVT_HUY_CAP'), ('cd_cty','NCVT_XEM_HET'),
-- Chủ nhiệm công trình ở phân xưởng: xem và lấy vật tư trong phạm vi đơn vị mình
('px','NCVT_XEM'), ('px','NCVT_CAP'),
('xem','NCVT_XEM');
