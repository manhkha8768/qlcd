-- =====================================================================
-- GIAI ĐOẠN 4: HỒ SƠ KỸ THUẬT VÀ VÒNG ĐỜI THIẾT BỊ
--
-- Nguyên tắc: mỗi thiết bị có một hồ sơ kỹ thuật xuyên suốt vòng đời.
-- Không tạo bảng thiết bị mới, tiếp tục dùng thiet_bi hiện có.
-- =====================================================================

/* ---------------------------------------------------------------
   1. THÔNG SỐ KỸ THUẬT ĐỘNG
   Mỗi nhóm thiết bị có bộ thông số riêng: băng tải có chiều rộng băng
   và đường kính tang, tời có lực kéo và đường kính cáp. Không nhét
   tất cả thành cột cố định trên bảng thiet_bi.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS dinh_nghia_thong_so (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom_id         INTEGER REFERENCES nhom_thiet_bi(id) ON DELETE CASCADE,
    ma_thong_so     TEXT NOT NULL,
    ten             TEXT NOT NULL,
    kieu_du_lieu    TEXT NOT NULL DEFAULT 'chu'
                    CHECK (kieu_du_lieu IN ('so','chu','logic','ngay','chon')),
    don_vi          TEXT,
    gia_tri_chon    TEXT,                       -- JSON các lựa chọn khi kieu_du_lieu='chon'
    thu_tu          INTEGER NOT NULL DEFAULT 0,
    bat_buoc        INTEGER NOT NULL DEFAULT 0,
    hoat_dong       INTEGER NOT NULL DEFAULT 1,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua        TEXT,
    UNIQUE (nhom_id, ma_thong_so)
);
CREATE INDEX IF NOT EXISTS idx_dnts_nhom ON dinh_nghia_thong_so(nhom_id, thu_tu);

CREATE TABLE IF NOT EXISTS gia_tri_thong_so (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    dinh_nghia_id   INTEGER NOT NULL REFERENCES dinh_nghia_thong_so(id) ON DELETE CASCADE,
    gia_tri_chu     TEXT,
    gia_tri_so      REAL,
    gia_tri_logic   INTEGER,
    ghi_chu         TEXT,
    nguoi_tao_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    nguoi_sua_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_sua        TEXT,
    UNIQUE (thiet_bi_id, dinh_nghia_id)
);
CREATE INDEX IF NOT EXISTS idx_gtts_tb ON gia_tri_thong_so(thiet_bi_id);

/* ---------------------------------------------------------------
   2. CẤU TRÚC THIẾT BỊ DẠNG CÂY
   cha_id trỏ về chính bảng này nên không giới hạn số cấp:
   Băng tải > Cụm tang > Tang chủ động > Gối đỡ > Vòng bi.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS cum_thiet_bi (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    cha_id          INTEGER REFERENCES cum_thiet_bi(id) ON DELETE RESTRICT,
    ma_cum          TEXT NOT NULL,
    ten             TEXT NOT NULL,
    loai_cum        TEXT NOT NULL DEFAULT 'cum'
                    CHECK (loai_cum IN ('cum','chi_tiet','vat_tu')),
    hang_sx         TEXT,
    model           TEXT,
    so_seri         TEXT,
    ma_phu_tung     TEXT,                       -- part number
    so_luong        REAL NOT NULL DEFAULT 1,
    dvt             TEXT DEFAULT 'Cái',
    ngay_lap        TEXT,
    ngay_thao       TEXT,
    trang_thai      TEXT NOT NULL DEFAULT 'dang_lap'
                    CHECK (trang_thai IN ('dang_lap','da_thao','da_thay_the','du_phong')),
    tinh_trang_kt   TEXT NOT NULL DEFAULT 'tot'
                    CHECK (tinh_trang_kt IN ('tot','trung_binh','kem','hong')),
    thu_tu          INTEGER NOT NULL DEFAULT 0,
    ghi_chu         TEXT,
    hoat_dong       INTEGER NOT NULL DEFAULT 1,  -- xóa mềm, không hard delete
    nguoi_tao_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    nguoi_sua_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_sua        TEXT,
    UNIQUE (thiet_bi_id, ma_cum),
    CHECK (so_luong > 0)
);
CREATE INDEX IF NOT EXISTS idx_cum_tb ON cum_thiet_bi(thiet_bi_id, hoat_dong);
CREATE INDEX IF NOT EXISTS idx_cum_cha ON cum_thiet_bi(cha_id);
CREATE INDEX IF NOT EXISTS idx_cum_pn ON cum_thiet_bi(ma_phu_tung);

CREATE TABLE IF NOT EXISTS lich_su_cum (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cum_id          INTEGER NOT NULL REFERENCES cum_thiet_bi(id) ON DELETE CASCADE,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    loai_su_kien    TEXT NOT NULL
                    CHECK (loai_su_kien IN ('lap_dat','thao_ra','thay_the','sua_chua',
                                            'bao_duong','hong','kiem_tra','chuyen_vi_tri')),
    ngay_su_kien    TEXT NOT NULL,
    tinh_trang_truoc TEXT,
    tinh_trang_sau  TEXT,
    cum_cu_id       INTEGER REFERENCES cum_thiet_bi(id) ON DELETE SET NULL,
    cum_moi_id      INTEGER REFERENCES cum_thiet_bi(id) ON DELETE SET NULL,
    phieu_bao_duong_id INTEGER,
    phieu_sua_chua_id  INTEGER REFERENCES phieu_sua_chua(id) ON DELETE SET NULL,
    su_co_id        INTEGER,
    nguoi_thuc_hien_id INTEGER REFERENCES nguoi_dung(id),
    ghi_chu         TEXT,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_lscum_cum ON lich_su_cum(cum_id, ngay_su_kien);
CREATE INDEX IF NOT EXISTS idx_lscum_tb ON lich_su_cum(thiet_bi_id, ngay_su_kien);

/* ---------------------------------------------------------------
   3. SỰ CỐ THIẾT BỊ
   Tách hẳn khỏi phiếu sửa chữa: một sự cố có thể sinh ra nhiều phiếu
   sửa chữa, và có sự cố xử lý xong tại chỗ mà không cần lập phiếu.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS su_co (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_su_co            TEXT NOT NULL UNIQUE,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    cum_id              INTEGER REFERENCES cum_thiet_bi(id) ON DELETE SET NULL,
    phan_xuong_id       INTEGER REFERENCES phan_xuong(id),

    ngay_su_co          TEXT NOT NULL,
    gio_su_co           TEXT,
    nguoi_bao           TEXT,
    nguoi_bao_id        INTEGER REFERENCES nguoi_dung(id),

    muc_do              TEXT NOT NULL DEFAULT 'trung_binh'
                        CHECK (muc_do IN ('nhe','trung_binh','nghiem_trong','khan_cap')),
    hien_tuong          TEXT NOT NULL,
    mo_ta               TEXT,
    nguyen_nhan_nghi_ngo TEXT,
    nguyen_nhan_thuc_te TEXT,

    dung_thiet_bi       INTEGER NOT NULL DEFAULT 0,
    thoi_gian_dung_phut INTEGER DEFAULT 0,

    trang_thai          TEXT NOT NULL DEFAULT 'mo'
                        CHECK (trang_thai IN ('mo','dang_dieu_tra','dang_sua','da_xu_ly','da_dong')),
    bien_phap_xu_ly     TEXT,
    ngay_dong           TEXT,
    nguoi_dong_id       INTEGER REFERENCES nguoi_dung(id),

    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua            TEXT
);
CREATE INDEX IF NOT EXISTS idx_suco_tb ON su_co(thiet_bi_id, ngay_su_co);
CREATE INDEX IF NOT EXISTS idx_suco_tt ON su_co(trang_thai, muc_do);
CREATE INDEX IF NOT EXISTS idx_suco_px ON su_co(phan_xuong_id, ngay_su_co);

/* ---------------------------------------------------------------
   4. NÂNG CẤP PHIẾU SỬA CHỮA
   Bảng phieu_sua_chua đã có từ trước, bổ sung liên kết cụm và sự cố.
   --------------------------------------------------------------- */
ALTER TABLE phieu_sua_chua ADD COLUMN cum_id INTEGER REFERENCES cum_thiet_bi(id);
ALTER TABLE phieu_sua_chua ADD COLUMN su_co_id INTEGER REFERENCES su_co(id);
ALTER TABLE phieu_sua_chua ADD COLUMN chan_doan TEXT;
ALTER TABLE phieu_sua_chua ADD COLUMN nguyen_nhan_goc TEXT;
ALTER TABLE phieu_sua_chua ADD COLUMN nguoi_duyet_id INTEGER REFERENCES nguoi_dung(id);
ALTER TABLE phieu_sua_chua ADD COLUMN ngay_duyet TEXT;
CREATE INDEX IF NOT EXISTS idx_psc_suco ON phieu_sua_chua(su_co_id);
CREATE INDEX IF NOT EXISTS idx_psc_cum ON phieu_sua_chua(cum_id);

-- Vật tư sửa chữa: ghi rõ thao tác với cụm nào, số seri cũ và mới
ALTER TABLE vat_tu_sua_chua ADD COLUMN cum_id INTEGER REFERENCES cum_thiet_bi(id);
ALTER TABLE vat_tu_sua_chua ADD COLUMN loai_thao_tac TEXT DEFAULT 'thay_the';
ALTER TABLE vat_tu_sua_chua ADD COLUMN seri_cu TEXT;
ALTER TABLE vat_tu_sua_chua ADD COLUMN seri_moi TEXT;
ALTER TABLE vat_tu_sua_chua ADD COLUMN phu_tung_id INTEGER;

/* ---------------------------------------------------------------
   5. BẢO DƯỠNG: KẾ HOẠCH VÀ PHIẾU THỰC HIỆN
   Phiếu bảo dưỡng tách riêng khỏi phiếu sửa chữa. Trước đây bảo dưỡng
   định kỳ được ghi nhờ trong phieu_sua_chua với loai='bao_duong_dk',
   dữ liệu cũ được chuyển sang bảng mới ở cuối file này.
   --------------------------------------------------------------- */
ALTER TABLE ke_hoach_bao_duong ADD COLUMN ma_ke_hoach TEXT;
ALTER TABLE ke_hoach_bao_duong ADD COLUMN cum_id INTEGER REFERENCES cum_thiet_bi(id);
ALTER TABLE ke_hoach_bao_duong ADD COLUMN ten_ke_hoach TEXT;
ALTER TABLE ke_hoach_bao_duong ADD COLUMN loai_chu_ky TEXT NOT NULL DEFAULT 'thang';
ALTER TABLE ke_hoach_bao_duong ADD COLUMN gia_tri_chu_ky INTEGER;
ALTER TABLE ke_hoach_bao_duong ADD COLUMN so_ngay_canh_bao INTEGER NOT NULL DEFAULT 7;
ALTER TABLE ke_hoach_bao_duong ADD COLUMN huong_dan TEXT;
CREATE INDEX IF NOT EXISTS idx_khbd_cum ON ke_hoach_bao_duong(cum_id);

CREATE TABLE IF NOT EXISTS phieu_bao_duong (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_phieu            TEXT NOT NULL UNIQUE,
    ke_hoach_id         INTEGER REFERENCES ke_hoach_bao_duong(id) ON DELETE SET NULL,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    cum_id              INTEGER REFERENCES cum_thiet_bi(id) ON DELETE SET NULL,
    phan_xuong_id       INTEGER REFERENCES phan_xuong(id),

    ngay_ke_hoach       TEXT,
    ngay_thuc_hien      TEXT,
    cap_bd              TEXT,

    trang_thai          TEXT NOT NULL DEFAULT 'da_len_lich'
                        CHECK (trang_thai IN ('da_len_lich','den_han','qua_han','dang_thuc_hien',
                                              'hoan_thanh','bo_qua','huy')),
    nguoi_thuc_hien     TEXT,
    noi_dung_cong_viec  TEXT,
    ket_qua_kiem_tra    TEXT,

    chi_phi_vat_tu      REAL DEFAULT 0,
    chi_phi_nhan_cong   REAL DEFAULT 0,
    chi_phi_khac        REAL DEFAULT 0,
    tong_chi_phi        REAL DEFAULT 0,

    ngay_han_ke_tiep    TEXT,
    ly_do_bo_qua        TEXT,
    nguoi_tao_id        INTEGER REFERENCES nguoi_dung(id),
    ghi_chu             TEXT,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua            TEXT
);
CREATE INDEX IF NOT EXISTS idx_pbd_tb ON phieu_bao_duong(thiet_bi_id, ngay_thuc_hien);
CREATE INDEX IF NOT EXISTS idx_pbd_tt ON phieu_bao_duong(trang_thai, ngay_ke_hoach);
CREATE INDEX IF NOT EXISTS idx_pbd_kh ON phieu_bao_duong(ke_hoach_id);

CREATE TABLE IF NOT EXISTS vat_tu_bao_duong (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        INTEGER NOT NULL REFERENCES phieu_bao_duong(id) ON DELETE CASCADE,
    cum_id          INTEGER REFERENCES cum_thiet_bi(id) ON DELETE SET NULL,
    phu_tung_id     INTEGER,
    ma_vthh         TEXT,
    ten_vthh        TEXT NOT NULL,
    dvt             TEXT,
    so_luong        REAL NOT NULL DEFAULT 0,
    don_gia         REAL DEFAULT 0,
    thanh_tien      REAL DEFAULT 0,
    ghi_chu         TEXT
);
CREATE INDEX IF NOT EXISTS idx_vtbd_phieu ON vat_tu_bao_duong(phieu_id);

/* ---------------------------------------------------------------
   6. DANH MỤC PHỤ TÙNG VÀ QUAN HỆ TƯƠNG THÍCH
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS phu_tung (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_phu_tung         TEXT NOT NULL UNIQUE,
    ten                 TEXT NOT NULL,
    part_number         TEXT,
    nhom                TEXT,
    hang_sx             TEXT,
    quy_cach            TEXT,
    dvt                 TEXT DEFAULT 'Cái',
    ton_toi_thieu       REAL DEFAULT 0,
    gia_chuan           REAL DEFAULT 0,
    ma_vach             TEXT,
    trang_thai          TEXT NOT NULL DEFAULT 'dang_dung'
                        CHECK (trang_thai IN ('dang_dung','ngung_dung')),
    anh_url             TEXT,
    ghi_chu             TEXT,
    hoat_dong           INTEGER NOT NULL DEFAULT 1,
    nguoi_tao_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua            TEXT
);
CREATE INDEX IF NOT EXISTS idx_pt_pn ON phu_tung(part_number);
CREATE INDEX IF NOT EXISTS idx_pt_nhom ON phu_tung(nhom);

CREATE TABLE IF NOT EXISTS phu_tung_thiet_bi (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id         INTEGER REFERENCES thiet_bi(id) ON DELETE CASCADE,
    nhom_id             INTEGER REFERENCES nhom_thiet_bi(id) ON DELETE CASCADE,
    cum_id              INTEGER REFERENCES cum_thiet_bi(id) ON DELETE CASCADE,
    phu_tung_id         INTEGER NOT NULL REFERENCES phu_tung(id) ON DELETE CASCADE,
    so_luong_khuyen_nghi REAL DEFAULT 1,
    la_chinh            INTEGER NOT NULL DEFAULT 0,
    ghi_chu             TEXT,
    -- Gắn tương thích theo thiết bị cụ thể, theo cụm, hoặc theo cả nhóm thiết bị
    CHECK (thiet_bi_id IS NOT NULL OR nhom_id IS NOT NULL OR cum_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ptb_tb ON phu_tung_thiet_bi(thiet_bi_id);
CREATE INDEX IF NOT EXISTS idx_ptb_cum ON phu_tung_thiet_bi(cum_id);
CREATE INDEX IF NOT EXISTS idx_ptb_nhom ON phu_tung_thiet_bi(nhom_id);
CREATE INDEX IF NOT EXISTS idx_ptb_pt ON phu_tung_thiet_bi(phu_tung_id);

/* ---------------------------------------------------------------
   7. TÀI LIỆU KỸ THUẬT
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS tai_lieu_ky_thuat (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id         INTEGER REFERENCES thiet_bi(id) ON DELETE CASCADE,
    cum_id              INTEGER REFERENCES cum_thiet_bi(id) ON DELETE CASCADE,
    loai_tai_lieu       TEXT NOT NULL DEFAULT 'khac'
                        CHECK (loai_tai_lieu IN ('catalog','huong_dan','so_do_dien','so_do_thuy_luc',
                                                 'ban_ve','bien_phap_ktat','bien_ban_nghiem_thu',
                                                 'bien_ban_ban_giao','phieu_sua_chua','phieu_bao_duong',
                                                 'chung_nhan_kiem_dinh','khac')),
    so_van_ban          TEXT,
    ten_tai_lieu        TEXT NOT NULL,
    ten_file            TEXT,
    duong_dan           TEXT,
    loai_file           TEXT,
    kich_thuoc          INTEGER,
    ngay_ban_hanh       TEXT,
    ngay_het_hieu_luc   TEXT,
    phien_ban           TEXT,
    nguoi_tai_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_tai            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ghi_chu             TEXT,
    hoat_dong           INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tlkt_tb ON tai_lieu_ky_thuat(thiet_bi_id, loai_tai_lieu);
CREATE INDEX IF NOT EXISTS idx_tlkt_cum ON tai_lieu_ky_thuat(cum_id);

/* ---------------------------------------------------------------
   8. QUYỀN MỚI
   --------------------------------------------------------------- */
INSERT OR IGNORE INTO quyen (ma, ten, nhom) VALUES
('KT_XEM',           'Xem hồ sơ kỹ thuật',           'Kỹ thuật'),
('KT_SUA',           'Sửa hồ sơ kỹ thuật',           'Kỹ thuật'),
('CUM_TAO',          'Thêm cụm - chi tiết',          'Kỹ thuật'),
('CUM_SUA',          'Sửa cụm - chi tiết',           'Kỹ thuật'),
('CUM_XOA',          'Xóa cụm - chi tiết',           'Kỹ thuật'),
('SU_CO_TAO',        'Báo sự cố',                    'Kỹ thuật'),
('SU_CO_SUA',        'Sửa thông tin sự cố',          'Kỹ thuật'),
('SU_CO_DONG',       'Đóng sự cố',                   'Kỹ thuật'),
('SC_TAO',           'Lập phiếu sửa chữa',           'Kỹ thuật'),
('SC_DUYET',         'Duyệt phiếu sửa chữa',         'Kỹ thuật'),
('SC_HOAN_THANH',    'Hoàn thành phiếu sửa chữa',    'Kỹ thuật'),
('BD_TAO',           'Lập kế hoạch bảo dưỡng',       'Kỹ thuật'),
('BD_SUA',           'Sửa kế hoạch bảo dưỡng',       'Kỹ thuật'),
('BD_HOAN_THANH',    'Hoàn thành bảo dưỡng',         'Kỹ thuật'),
('TAI_LIEU_TAI_LEN', 'Tải tài liệu kỹ thuật',        'Kỹ thuật'),
('TAI_LIEU_XOA',     'Xóa tài liệu kỹ thuật',        'Kỹ thuật'),
('PHU_TUNG_XEM',     'Xem danh mục phụ tùng',        'Kỹ thuật'),
('PHU_TUNG_SUA',     'Sửa danh mục phụ tùng',        'Kỹ thuật');

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen)
SELECT 'admin', ma FROM quyen;

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen) VALUES
('cd_cty','KT_XEM'), ('cd_cty','KT_SUA'), ('cd_cty','CUM_TAO'), ('cd_cty','CUM_SUA'),
('cd_cty','CUM_XOA'), ('cd_cty','SU_CO_TAO'), ('cd_cty','SU_CO_SUA'), ('cd_cty','SU_CO_DONG'),
('cd_cty','SC_TAO'), ('cd_cty','SC_DUYET'), ('cd_cty','SC_HOAN_THANH'),
('cd_cty','BD_TAO'), ('cd_cty','BD_SUA'), ('cd_cty','BD_HOAN_THANH'),
('cd_cty','TAI_LIEU_TAI_LEN'), ('cd_cty','TAI_LIEU_XOA'),
('cd_cty','PHU_TUNG_XEM'), ('cd_cty','PHU_TUNG_SUA'),

('px','KT_XEM'), ('px','KT_SUA'), ('px','CUM_TAO'), ('px','CUM_SUA'),
('px','SU_CO_TAO'), ('px','SU_CO_SUA'),
('px','SC_TAO'), ('px','SC_HOAN_THANH'),
('px','BD_TAO'), ('px','BD_SUA'), ('px','BD_HOAN_THANH'),
('px','TAI_LIEU_TAI_LEN'), ('px','PHU_TUNG_XEM'),

('xem','KT_XEM'), ('xem','PHU_TUNG_XEM');

/* ---------------------------------------------------------------
   9. VIEW TỔNG HỢP
   --------------------------------------------------------------- */

-- Chi phí vòng đời: gộp sửa chữa và bảo dưỡng, không nhập tay ở thiết bị
DROP VIEW IF EXISTS v_chi_phi_vong_doi;
CREATE VIEW v_chi_phi_vong_doi AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb, tb.nguyen_gia,
        COALESCE(sc.so_lan, 0)      AS so_lan_sua_chua,
        COALESCE(sc.cp_vat_tu, 0)   AS cp_vat_tu_sc,
        COALESCE(sc.cp_nhan_cong, 0) AS cp_nhan_cong_sc,
        COALESCE(sc.tong, 0)        AS chi_phi_sua_chua,
        COALESCE(bd.so_lan, 0)      AS so_lan_bao_duong,
        COALESCE(bd.tong, 0)        AS chi_phi_bao_duong,
        COALESCE(kd.tong, 0)        AS chi_phi_kiem_dinh,
        COALESCE(sc.tong, 0) + COALESCE(bd.tong, 0) + COALESCE(kd.tong, 0) AS tong_chi_phi,
        COALESCE(sc.gio_dung, 0)    AS tong_gio_dung_may,
        CASE WHEN tb.nguyen_gia > 0
             THEN ROUND((COALESCE(sc.tong,0)+COALESCE(bd.tong,0)+COALESCE(kd.tong,0))
                        * 100.0 / tb.nguyen_gia, 2) ELSE NULL END AS ty_le_tren_nguyen_gia
FROM thiet_bi tb
LEFT JOIN (SELECT thiet_bi_id, COUNT(*) so_lan, SUM(tong_chi_phi) tong,
                  SUM(chi_phi_vat_tu) cp_vat_tu, SUM(chi_phi_nhan_cong) cp_nhan_cong,
                  SUM(COALESCE(thoi_gian_dung_may,0)) gio_dung
           FROM phieu_sua_chua WHERE trang_thai='hoan_thanh' GROUP BY thiet_bi_id) sc
       ON sc.thiet_bi_id = tb.id
LEFT JOIN (SELECT thiet_bi_id, COUNT(*) so_lan, SUM(tong_chi_phi) tong
           FROM phieu_bao_duong WHERE trang_thai='hoan_thanh' GROUP BY thiet_bi_id) bd
       ON bd.thiet_bi_id = tb.id
LEFT JOIN (SELECT thiet_bi_id, SUM(COALESCE(chi_phi,0)) tong
           FROM kiem_dinh GROUP BY thiet_bi_id) kd
       ON kd.thiet_bi_id = tb.id;

-- Cảnh báo bảo dưỡng: ngưỡng cảnh báo lấy theo từng kế hoạch, không cố định
DROP VIEW IF EXISTS v_canh_bao_bao_duong;
CREATE VIEW v_canh_bao_bao_duong AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb,
        px.ten_ngan AS px, kh.id AS ke_hoach_id, kh.cap_bd,
        COALESCE(kh.ten_ke_hoach, 'Bảo dưỡng ' || kh.cap_bd) AS ten_ke_hoach,
        kh.lan_cuoi, kh.lan_ke_tiep, kh.so_ngay_canh_bao,
        CAST(julianday(kh.lan_ke_tiep) - julianday(date('now','localtime')) AS INTEGER) AS con_lai_ngay,
        CASE
            WHEN kh.lan_ke_tiep IS NULL THEN 'chua_lap_lich'
            WHEN julianday(kh.lan_ke_tiep) < julianday(date('now','localtime')) THEN 'qua_han'
            WHEN julianday(kh.lan_ke_tiep) - julianday(date('now','localtime'))
                 <= COALESCE(kh.so_ngay_canh_bao,7) THEN 'den_han'
            ELSE 'con_han'
        END AS muc_canh_bao
FROM ke_hoach_bao_duong kh
JOIN thiet_bi tb        ON tb.id = kh.thiet_bi_id
LEFT JOIN phan_xuong px ON px.id = tb.phan_xuong_id
WHERE kh.hoat_dong = 1
  AND tb.trang_thai NOT IN ('da_thanh_ly','cho_thanh_ly');

-- Tình trạng sức khỏe thiết bị: quy tắc rõ ràng, không chấm điểm mơ hồ
DROP VIEW IF EXISTS v_suc_khoe_thiet_bi;
CREATE VIEW v_suc_khoe_thiet_bi AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb, tb.phan_xuong_id,
        (SELECT COUNT(*) FROM su_co s WHERE s.thiet_bi_id=tb.id
          AND s.trang_thai NOT IN ('da_dong')
          AND s.muc_do IN ('nghiem_trong','khan_cap')) AS su_co_nang_dang_mo,
        (SELECT COUNT(*) FROM su_co s WHERE s.thiet_bi_id=tb.id
          AND s.trang_thai NOT IN ('da_dong')) AS su_co_dang_mo,
        (SELECT COUNT(*) FROM v_canh_bao_bao_duong c
          WHERE c.thiet_bi_id=tb.id AND c.muc_canh_bao='qua_han') AS bd_qua_han,
        (SELECT COUNT(*) FROM v_canh_bao_bao_duong c
          WHERE c.thiet_bi_id=tb.id AND c.muc_canh_bao='den_han') AS bd_den_han,
        (SELECT COUNT(*) FROM v_canh_bao_kiem_dinh k
          WHERE k.thiet_bi_id=tb.id AND k.muc_canh_bao='qua_han') AS kd_qua_han,
        CASE
            WHEN (SELECT COUNT(*) FROM su_co s WHERE s.thiet_bi_id=tb.id
                   AND s.trang_thai NOT IN ('da_dong')
                   AND s.muc_do IN ('nghiem_trong','khan_cap')) > 0
              OR (SELECT COUNT(*) FROM v_canh_bao_bao_duong c
                   WHERE c.thiet_bi_id=tb.id AND c.muc_canh_bao='qua_han') > 0
              OR (SELECT COUNT(*) FROM v_canh_bao_kiem_dinh k
                   WHERE k.thiet_bi_id=tb.id AND k.muc_canh_bao='qua_han') > 0
              OR tb.tinh_trang_kt = 'hong'
            THEN 'xau'
            WHEN (SELECT COUNT(*) FROM su_co s WHERE s.thiet_bi_id=tb.id
                   AND s.trang_thai NOT IN ('da_dong')) > 0
              OR (SELECT COUNT(*) FROM v_canh_bao_bao_duong c
                   WHERE c.thiet_bi_id=tb.id AND c.muc_canh_bao='den_han') > 0
              OR tb.tinh_trang_kt = 'kem'
            THEN 'canh_bao'
            ELSE 'tot'
        END AS suc_khoe
FROM thiet_bi tb
WHERE tb.trang_thai <> 'da_thanh_ly';

/* ---------------------------------------------------------------
   10. TRIGGER TỰ TÍNH CHI PHÍ BẢO DƯỠNG
   --------------------------------------------------------------- */
DROP TRIGGER IF EXISTS trg_vtbd_insert;
CREATE TRIGGER trg_vtbd_insert AFTER INSERT ON vat_tu_bao_duong
BEGIN
    UPDATE vat_tu_bao_duong SET thanh_tien = NEW.so_luong * NEW.don_gia WHERE id = NEW.id;
    UPDATE phieu_bao_duong
       SET chi_phi_vat_tu = (SELECT COALESCE(SUM(so_luong*don_gia),0)
                             FROM vat_tu_bao_duong WHERE phieu_id = NEW.phieu_id),
           tong_chi_phi = COALESCE(chi_phi_nhan_cong,0) + COALESCE(chi_phi_khac,0)
                        + (SELECT COALESCE(SUM(so_luong*don_gia),0)
                           FROM vat_tu_bao_duong WHERE phieu_id = NEW.phieu_id)
     WHERE id = NEW.phieu_id;
END;

DROP TRIGGER IF EXISTS trg_vtbd_delete;
CREATE TRIGGER trg_vtbd_delete AFTER DELETE ON vat_tu_bao_duong
BEGIN
    UPDATE phieu_bao_duong
       SET chi_phi_vat_tu = (SELECT COALESCE(SUM(so_luong*don_gia),0)
                             FROM vat_tu_bao_duong WHERE phieu_id = OLD.phieu_id),
           tong_chi_phi = COALESCE(chi_phi_nhan_cong,0) + COALESCE(chi_phi_khac,0)
                        + (SELECT COALESCE(SUM(so_luong*don_gia),0)
                           FROM vat_tu_bao_duong WHERE phieu_id = OLD.phieu_id)
     WHERE id = OLD.phieu_id;
END;

-- Trigger cũ tính hạn bảo dưỡng từ phieu_sua_chua không còn dùng,
-- việc này nay do phieu_bao_duong đảm nhiệm ở tầng ứng dụng.
DROP TRIGGER IF EXISTS trg_psc_hoan_thanh;

/* ---------------------------------------------------------------
   11. CHUYỂN DỮ LIỆU BẢO DƯỠNG CŨ SANG BẢNG MỚI
   --------------------------------------------------------------- */
INSERT INTO phieu_bao_duong (ma_phieu, thiet_bi_id, phan_xuong_id, cap_bd, ngay_ke_hoach,
        ngay_thuc_hien, trang_thai, noi_dung_cong_viec, ket_qua_kiem_tra,
        chi_phi_vat_tu, chi_phi_nhan_cong, chi_phi_khac, tong_chi_phi,
        nguoi_tao_id, ghi_chu, ngay_tao)
SELECT  'BD-' || substr(p.so_phieu, 4), p.thiet_bi_id, p.phan_xuong_id, p.cap_bd,
        p.ngay_bat_dau, p.ngay_hoan_thanh,
        CASE p.trang_thai WHEN 'hoan_thanh' THEN 'hoan_thanh'
                          WHEN 'huy' THEN 'huy'
                          WHEN 'dang_thuc_hien' THEN 'dang_thuc_hien'
                          ELSE 'da_len_lich' END,
        p.mo_ta_hu_hong, p.ket_qua,
        p.chi_phi_vat_tu, p.chi_phi_nhan_cong, p.chi_phi_khac, p.tong_chi_phi,
        p.nguoi_lap_id, p.ghi_chu, p.ngay_tao
FROM phieu_sua_chua p
WHERE p.loai = 'bao_duong_dk'
  AND NOT EXISTS (SELECT 1 FROM phieu_bao_duong b WHERE b.ma_phieu = 'BD-' || substr(p.so_phieu, 4));

DELETE FROM phieu_sua_chua WHERE loai = 'bao_duong_dk';

/* ---------------------------------------------------------------
   12. CHUYỂN THÔNG SỐ KỸ THUẬT TỰ DO SANG HỆ THỐNG THÔNG SỐ ĐỘNG
   --------------------------------------------------------------- */
INSERT INTO dinh_nghia_thong_so (nhom_id, ma_thong_so, ten, kieu_du_lieu, don_vi, thu_tu)
SELECT DISTINCT tb.nhom_id,
       upper(replace(replace(ts.ten_thong_so,' ','_'),'-','_')),
       ts.ten_thong_so, 'chu', ts.don_vi, ts.thu_tu
FROM thong_so_thiet_bi ts
JOIN thiet_bi tb ON tb.id = ts.thiet_bi_id
WHERE NOT EXISTS (
    SELECT 1 FROM dinh_nghia_thong_so d
    WHERE d.nhom_id = tb.nhom_id
      AND d.ma_thong_so = upper(replace(replace(ts.ten_thong_so,' ','_'),'-','_')));

INSERT OR IGNORE INTO gia_tri_thong_so (thiet_bi_id, dinh_nghia_id, gia_tri_chu, ghi_chu)
SELECT ts.thiet_bi_id, d.id, ts.gia_tri, 'Chuyển từ dữ liệu cũ'
FROM thong_so_thiet_bi ts
JOIN thiet_bi tb ON tb.id = ts.thiet_bi_id
JOIN dinh_nghia_thong_so d ON d.nhom_id = tb.nhom_id
     AND d.ma_thong_so = upper(replace(replace(ts.ten_thong_so,' ','_'),'-','_'));

/* ---------------------------------------------------------------
   13. BỘ THÔNG SỐ MẪU CHO CÁC NHÓM CHÍNH
   --------------------------------------------------------------- */
INSERT OR IGNORE INTO dinh_nghia_thong_so (nhom_id, ma_thong_so, ten, kieu_du_lieu, don_vi, thu_tu)
SELECT n.id, t.ma, t.ten, t.kieu, t.dv, t.tt FROM nhom_thiet_bi n
JOIN (
    -- Băng tải
    SELECT 'VT.02' nhom,'CHIEU_RONG_BANG' ma,'Chiều rộng băng' ten,'so' kieu,'mm' dv,1 tt
    UNION ALL SELECT 'VT.02','TOC_DO_BANG','Tốc độ băng','so','m/s',2
    UNION ALL SELECT 'VT.02','CHIEU_DAI','Chiều dài băng','so','m',3
    UNION ALL SELECT 'VT.02','CONG_SUAT_DC','Công suất động cơ','so','kW',4
    UNION ALL SELECT 'VT.02','DIEN_AP','Điện áp','chu','V',5
    UNION ALL SELECT 'VT.02','DUONG_KINH_TANG','Đường kính tang','so','mm',6
    UNION ALL SELECT 'VT.02','HOP_GIAM_TOC','Loại hộp giảm tốc','chu',NULL,7
    -- Tời trục
    UNION ALL SELECT 'VT.03','LUC_KEO','Lực kéo','so','kN',1
    UNION ALL SELECT 'VT.03','TOC_DO_CAP','Tốc độ cáp','so','m/s',2
    UNION ALL SELECT 'VT.03','DUONG_KINH_CAP','Đường kính cáp','so','mm',3
    UNION ALL SELECT 'VT.03','CONG_SUAT','Công suất','so','kW',4
    UNION ALL SELECT 'VT.03','DIEN_AP','Điện áp','chu','V',5
    UNION ALL SELECT 'VT.03','SO_TANG','Số tang','so',NULL,6
    UNION ALL SELECT 'VT.03','DUNG_LUONG_CAP','Dung lượng cáp','so','m',7
    -- Máy bơm
    UNION ALL SELECT 'TN.03','LUU_LUONG','Lưu lượng','so','m3/h',1
    UNION ALL SELECT 'TN.03','COT_AP','Cột áp','so','m',2
    UNION ALL SELECT 'TN.03','CONG_SUAT','Công suất','so','kW',3
    UNION ALL SELECT 'TN.03','DIEN_AP','Điện áp','chu','V',4
    UNION ALL SELECT 'TN.03','DK_HUT','Đường kính hút','so','mm',5
    UNION ALL SELECT 'TN.03','DK_DAY','Đường kính đẩy','so','mm',6
    -- Máng cào
    UNION ALL SELECT 'VT.01','NANG_SUAT','Năng suất','so','T/h',1
    UNION ALL SELECT 'VT.01','CHIEU_DAI','Chiều dài','so','m',2
    UNION ALL SELECT 'VT.01','CONG_SUAT','Công suất','so','kW',3
    UNION ALL SELECT 'VT.01','BUOC_XICH','Bước xích','chu','mm',4
    -- Quạt cục bộ
    UNION ALL SELECT 'TN.01','LUU_LUONG_GIO','Lưu lượng gió','so','m3/ph',1
    UNION ALL SELECT 'TN.01','AP_SUAT','Áp suất','so','Pa',2
    UNION ALL SELECT 'TN.01','CONG_SUAT','Công suất','so','kW',3
    UNION ALL SELECT 'TN.01','DUONG_KINH','Đường kính','so','mm',4
    -- Trạm biến áp
    UNION ALL SELECT 'CD.01','CONG_SUAT_BA','Công suất','so','kVA',1
    UNION ALL SELECT 'CD.01','DIEN_AP_VAO','Điện áp vào','chu','V',2
    UNION ALL SELECT 'CD.01','DIEN_AP_RA','Điện áp ra','chu','V',3
    UNION ALL SELECT 'CD.01','TO_DAU_DAY','Tổ đấu dây','chu',NULL,4
) t ON t.nhom = n.ma;
