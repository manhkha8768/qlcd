-- =====================================================================
-- HỆ THỐNG QUẢN LÝ THIẾT BỊ CƠ ĐIỆN VẬN TẢI (QLCD)
-- Công ty Xây lắp Mỏ - TKV
-- SQLite 3 (bật WAL mode + foreign_keys)
-- Phiên bản: 1.0
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =====================================================================
-- A. DANH MỤC NỀN
-- =====================================================================

-- A1. Phân xưởng / đơn vị trực thuộc
CREATE TABLE phan_xuong (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,          -- DL1, DL2, KT1, CD, VT...
    ten             TEXT NOT NULL,                 -- Phân xưởng Đào lò 1
    ten_ngan        TEXT,                          -- DL1
    loai            TEXT NOT NULL DEFAULT 'san_xuat'
                    CHECK (loai IN ('san_xuat','phuc_vu','phong_ban','kho')),
    quan_doc        TEXT,
    co_dien_truong  TEXT,
    so_nhan_luc     INTEGER DEFAULT 0,
    thu_tu          INTEGER DEFAULT 0,
    hoat_dong       INTEGER NOT NULL DEFAULT 1,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- A2. Vị trí lắp đặt (cây phân cấp: công trường > mức > đường lò > vị trí)
CREATE TABLE vi_tri (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER REFERENCES vi_tri(id) ON DELETE RESTRICT,
    ma              TEXT NOT NULL UNIQUE,
    ten             TEXT NOT NULL,
    cap             INTEGER NOT NULL DEFAULT 1,    -- 1=công trường, 2=mức, 3=đường lò, 4=điểm
    loai            TEXT DEFAULT 'ham_lo'
                    CHECK (loai IN ('ham_lo','mat_bang','kho','xuong_sua_chua','khac')),
    phan_xuong_id   INTEGER REFERENCES phan_xuong(id) ON DELETE SET NULL,
    ghi_chu         TEXT,
    hoat_dong       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_vitri_parent ON vi_tri(parent_id);
CREATE INDEX idx_vitri_px ON vi_tri(phan_xuong_id);

-- A3. Nhóm thiết bị (2 cấp)
CREATE TABLE nhom_thiet_bi (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER REFERENCES nhom_thiet_bi(id) ON DELETE RESTRICT,
    ma              TEXT NOT NULL UNIQUE,          -- VT / VT.01
    ten             TEXT NOT NULL,
    cap             INTEGER NOT NULL DEFAULT 1,
    -- Quy định nghiệp vụ theo nhóm:
    yeu_cau_kiem_dinh   INTEGER NOT NULL DEFAULT 0,
    theo_doi_gio_chay   INTEGER NOT NULL DEFAULT 0,
    thu_tu          INTEGER DEFAULT 0
);
CREATE INDEX idx_nhomtb_parent ON nhom_thiet_bi(parent_id);

-- A4. Model / chủng loại thiết bị (dùng chung cho nhiều máy cùng loại)
CREATE TABLE model_thiet_bi (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom_id         INTEGER NOT NULL REFERENCES nhom_thiet_bi(id),
    ma_model        TEXT NOT NULL UNIQUE,          -- SGB-620/40T
    ten             TEXT NOT NULL,
    hang_sx         TEXT,
    nuoc_sx         TEXT,
    cong_suat_kw    REAL,
    dien_ap_v       TEXT,                          -- 380/660, 1140
    nang_suat       TEXT,                          -- 250 T/h, 60 m3/ph
    thong_so_json   TEXT,                          -- {"chieu_dai":"120m","toc_do":"1.2 m/s"}
    chu_ky_bd_thang INTEGER,                       -- chu kỳ bảo dưỡng mặc định
    chu_ky_bd_gio   INTEGER,
    ghi_chu         TEXT
);
CREATE INDEX idx_model_nhom ON model_thiet_bi(nhom_id);

-- A5. Người dùng & phân quyền
CREATE TABLE nguoi_dung (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap   TEXT NOT NULL UNIQUE,
    mat_khau_hash   TEXT NOT NULL,
    ho_ten          TEXT,
    chuc_vu         TEXT,
    vai_tro         TEXT NOT NULL DEFAULT 'px'
                    CHECK (vai_tro IN ('admin','cd_cty','px','xem')),
    -- admin: toàn quyền | cd_cty: phòng Cơ điện công ty (duyệt)
    -- px: cơ điện phân xưởng (nhập liệu) | xem: chỉ đọc
    phan_xuong_id   INTEGER REFERENCES phan_xuong(id) ON DELETE SET NULL,
    tam_thoi        INTEGER NOT NULL DEFAULT 0,    -- tài khoản tạm 24h
    het_han         TEXT,
    hoat_dong       INTEGER NOT NULL DEFAULT 1,
    lan_dang_nhap   TEXT,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =====================================================================
-- B. PHÂN HỆ 1: DANH MỤC & HỒ SƠ THIẾT BỊ
-- =====================================================================

CREATE TABLE thiet_bi (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_tb               TEXT NOT NULL UNIQUE,      -- DL1.VT01.003
    ten                 TEXT NOT NULL,
    model_id            INTEGER REFERENCES model_thiet_bi(id),
    nhom_id             INTEGER NOT NULL REFERENCES nhom_thiet_bi(id),
    so_seri             TEXT,
    nam_sx              INTEGER,
    nuoc_sx             TEXT,

    -- Gắn với tài sản / kế toán
    ma_tscd             TEXT,                      -- liên kết hệ TSCĐ-CCDC
    loai_ts             TEXT DEFAULT 'TSCD' CHECK (loai_ts IN ('TSCD','CCDC')),
    nguon_von           TEXT,
    nguyen_gia          REAL DEFAULT 0,
    gia_tri_con_lai     REAL DEFAULT 0,
    ngay_su_dung        TEXT,                      -- ngày đưa vào sử dụng
    thoi_gian_kh_thang  INTEGER,                   -- thời gian khấu hao

    -- Vị trí hiện tại (denormalize để truy vấn nhanh)
    phan_xuong_id       INTEGER REFERENCES phan_xuong(id),
    vi_tri_id           INTEGER REFERENCES vi_tri(id),

    trang_thai          TEXT NOT NULL DEFAULT 'hoat_dong'
                        CHECK (trang_thai IN ('hoat_dong','du_phong','dang_sua',
                                              'dang_dieu_chuyen','cho_thanh_ly','da_thanh_ly')),
    tinh_trang_kt       TEXT DEFAULT 'tot'
                        CHECK (tinh_trang_kt IN ('tot','trung_binh','kem','hong')),
    gio_chay_luy_ke     REAL DEFAULT 0,

    nguoi_tao_id        INTEGER REFERENCES nguoi_dung(id),
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'nhap'
                        CHECK (trang_thai_duyet IN ('nhap','cho_duyet','da_duyet','chuyen_lai')),
    ghi_chu             TEXT,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua            TEXT
);
CREATE INDEX idx_tb_px      ON thiet_bi(phan_xuong_id);
CREATE INDEX idx_tb_nhom    ON thiet_bi(nhom_id);
CREATE INDEX idx_tb_tt      ON thiet_bi(trang_thai);
CREATE INDEX idx_tb_vitri   ON thiet_bi(vi_tri_id);
CREATE INDEX idx_tb_tscd    ON thiet_bi(ma_tscd);

-- Thông số kỹ thuật riêng của từng máy (ngoài thông số model)
CREATE TABLE thong_so_thiet_bi (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    ten_thong_so    TEXT NOT NULL,
    gia_tri         TEXT,
    don_vi          TEXT,
    thu_tu          INTEGER DEFAULT 0
);
CREATE INDEX idx_ts_tb ON thong_so_thiet_bi(thiet_bi_id);

-- Hồ sơ đính kèm: lý lịch máy, biên bản nghiệm thu, ảnh, chứng chỉ
CREATE TABLE ho_so_dinh_kem (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doi_tuong_loai  TEXT NOT NULL
                    CHECK (doi_tuong_loai IN ('thiet_bi','phieu_sc','kiem_dinh','dieu_chuyen')),
    doi_tuong_id    INTEGER NOT NULL,
    loai_ho_so      TEXT,                          -- ly_lich, nghiem_thu, anh, chung_chi
    ten_file        TEXT NOT NULL,
    duong_dan       TEXT NOT NULL,
    kich_thuoc      INTEGER,
    nguoi_tai_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tai        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_hs_dt ON ho_so_dinh_kem(doi_tuong_loai, doi_tuong_id);

-- =====================================================================
-- C. PHÂN HỆ 2: ĐIỀU CHUYỂN - VỊ TRÍ LẮP ĐẶT
-- =====================================================================

CREATE TABLE dieu_chuyen (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    so_phieu            TEXT NOT NULL UNIQUE,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id),
    loai                TEXT NOT NULL DEFAULT 'dieu_chuyen'
                        CHECK (loai IN ('cap_moi','dieu_chuyen','thu_hoi','di_chuyen_vi_tri',
                                        'dua_di_sua','nhan_ve','thanh_ly')),
    tu_phan_xuong_id    INTEGER REFERENCES phan_xuong(id),
    den_phan_xuong_id   INTEGER REFERENCES phan_xuong(id),
    tu_vi_tri_id        INTEGER REFERENCES vi_tri(id),
    den_vi_tri_id       INTEGER REFERENCES vi_tri(id),
    ngay_de_nghi        TEXT NOT NULL,
    ngay_thuc_hien      TEXT,
    so_quyet_dinh       TEXT,
    ly_do               TEXT NOT NULL,
    nguoi_giao          TEXT,
    nguoi_nhan          TEXT,
    tinh_trang_ban_giao TEXT,                      -- mô tả tình trạng khi bàn giao
    nguoi_lap_id        INTEGER REFERENCES nguoi_dung(id),
    trang_thai          TEXT NOT NULL DEFAULT 'nhap'
                        CHECK (trang_thai IN ('nhap','cho_duyet','da_duyet','chuyen_lai','hoan_thanh','huy')),
    ghi_chu             TEXT,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_dc_tb ON dieu_chuyen(thiet_bi_id);
CREATE INDEX idx_dc_tt ON dieu_chuyen(trang_thai);
CREATE INDEX idx_dc_ngay ON dieu_chuyen(ngay_thuc_hien);

-- Lịch sử vị trí (ghi nhận mọi lần thiết bị đổi chỗ - phục vụ truy vết)
CREATE TABLE lich_su_vi_tri (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    phan_xuong_id   INTEGER REFERENCES phan_xuong(id),
    vi_tri_id       INTEGER REFERENCES vi_tri(id),
    tu_ngay         TEXT NOT NULL,
    den_ngay        TEXT,                          -- NULL = đang ở vị trí này
    dieu_chuyen_id  INTEGER REFERENCES dieu_chuyen(id) ON DELETE SET NULL,
    ghi_chu         TEXT
);
CREATE INDEX idx_lsvt_tb ON lich_su_vi_tri(thiet_bi_id, tu_ngay);

-- =====================================================================
-- D. PHÂN HỆ 3: BẢO DƯỠNG - SỬA CHỮA
-- =====================================================================

-- D1. Kế hoạch bảo dưỡng định kỳ
CREATE TABLE ke_hoach_bao_duong (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    cap_bd          TEXT NOT NULL
                    CHECK (cap_bd IN ('ca','ngay','tuan','thang','quy','nam','dai_tu')),
    chu_ky_ngay     INTEGER,                       -- theo lịch
    chu_ky_gio      INTEGER,                       -- theo giờ chạy
    lan_cuoi        TEXT,
    gio_chay_lan_cuoi REAL,
    lan_ke_tiep     TEXT,                          -- tính tự động khi cập nhật
    nguoi_phu_trach TEXT,
    hoat_dong       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_khbd_tb ON ke_hoach_bao_duong(thiet_bi_id);
CREATE INDEX idx_khbd_next ON ke_hoach_bao_duong(lan_ke_tiep);

-- D2. Nội dung công việc bảo dưỡng theo model (checklist mẫu)
CREATE TABLE noi_dung_bao_duong (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id        INTEGER REFERENCES model_thiet_bi(id) ON DELETE CASCADE,
    nhom_id         INTEGER REFERENCES nhom_thiet_bi(id) ON DELETE CASCADE,
    cap_bd          TEXT NOT NULL,
    noi_dung        TEXT NOT NULL,
    tieu_chuan      TEXT,
    thu_tu          INTEGER DEFAULT 0
);

-- D3. Phiếu sửa chữa / bảo dưỡng (chứng từ chính)
CREATE TABLE phieu_sua_chua (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    so_phieu            TEXT NOT NULL UNIQUE,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id),
    phan_xuong_id       INTEGER REFERENCES phan_xuong(id),
    loai                TEXT NOT NULL DEFAULT 'sua_chua'
                        CHECK (loai IN ('bao_duong_dk','sua_chua','su_co','dai_tu','cai_tao')),
    cap_bd              TEXT,                      -- nếu là bảo dưỡng định kỳ
    muc_do              TEXT DEFAULT 'binh_thuong'
                        CHECK (muc_do IN ('binh_thuong','khan','dung_san_xuat')),

    ngay_bao_hong       TEXT,
    mo_ta_hu_hong       TEXT,
    nguyen_nhan         TEXT,
    bien_phap_xu_ly     TEXT,

    ngay_bat_dau        TEXT,
    ngay_hoan_thanh     TEXT,
    thoi_gian_dung_may  REAL,                      -- giờ dừng máy

    don_vi_thuc_hien    TEXT DEFAULT 'noi_bo'
                        CHECK (don_vi_thuc_hien IN ('noi_bo','thue_ngoai')),
    ten_don_vi_ngoai    TEXT,
    so_cong             REAL DEFAULT 0,
    chi_phi_nhan_cong   REAL DEFAULT 0,
    chi_phi_vat_tu      REAL DEFAULT 0,
    chi_phi_khac        REAL DEFAULT 0,
    tong_chi_phi        REAL DEFAULT 0,

    ket_qua             TEXT CHECK (ket_qua IN ('dat','khong_dat','cho_vat_tu',NULL)),
    nguoi_lap_id        INTEGER REFERENCES nguoi_dung(id),
    trang_thai          TEXT NOT NULL DEFAULT 'nhap'
                        CHECK (trang_thai IN ('nhap','cho_duyet','da_duyet','chuyen_lai',
                                              'dang_thuc_hien','hoan_thanh','huy')),
    ghi_chu             TEXT,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_psc_tb ON phieu_sua_chua(thiet_bi_id);
CREATE INDEX idx_psc_tt ON phieu_sua_chua(trang_thai);
CREATE INDEX idx_psc_ngay ON phieu_sua_chua(ngay_bat_dau);

-- D4. Vật tư sử dụng trong phiếu (liên kết bộ mã vật tư 15.693 mã)
CREATE TABLE vat_tu_sua_chua (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        INTEGER NOT NULL REFERENCES phieu_sua_chua(id) ON DELETE CASCADE,
    ma_vthh         TEXT,                          -- XX.NN.NNN
    ten_vthh        TEXT NOT NULL,
    dvt             TEXT,
    so_luong        REAL NOT NULL DEFAULT 0,
    don_gia         REAL DEFAULT 0,
    thanh_tien      REAL DEFAULT 0,
    nguon           TEXT DEFAULT 'kho' CHECK (nguon IN ('kho','mua_moi','tan_dung')),
    ghi_chu         TEXT
);
CREATE INDEX idx_vtsc_phieu ON vat_tu_sua_chua(phieu_id);
CREATE INDEX idx_vtsc_ma ON vat_tu_sua_chua(ma_vthh);

-- D5. Nhật ký vận hành / giờ chạy
CREATE TABLE nhat_ky_van_hanh (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    ngay            TEXT NOT NULL,
    ca              TEXT CHECK (ca IN ('1','2','3',NULL)),
    gio_chay        REAL DEFAULT 0,
    san_luong       REAL,
    tinh_trang      TEXT,
    nguoi_ghi_id    INTEGER REFERENCES nguoi_dung(id),
    UNIQUE (thiet_bi_id, ngay, ca)
);
CREATE INDEX idx_nkvh_tb ON nhat_ky_van_hanh(thiet_bi_id, ngay);

-- =====================================================================
-- E. PHÂN HỆ 4: KIỂM ĐỊNH - CẢNH BÁO HẠN
-- =====================================================================

CREATE TABLE loai_kiem_dinh (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ma                  TEXT NOT NULL UNIQUE,
    ten                 TEXT NOT NULL,
    chu_ky_thang        INTEGER NOT NULL,
    bat_buoc            INTEGER NOT NULL DEFAULT 1,
    can_cu_phap_ly      TEXT,
    canh_bao_truoc_ngay INTEGER NOT NULL DEFAULT 30
);

-- Nhóm thiết bị nào phải làm loại kiểm định nào
CREATE TABLE ap_dung_kiem_dinh (
    nhom_id             INTEGER NOT NULL REFERENCES nhom_thiet_bi(id) ON DELETE CASCADE,
    loai_kiem_dinh_id   INTEGER NOT NULL REFERENCES loai_kiem_dinh(id) ON DELETE CASCADE,
    PRIMARY KEY (nhom_id, loai_kiem_dinh_id)
);

CREATE TABLE kiem_dinh (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    loai_kiem_dinh_id   INTEGER NOT NULL REFERENCES loai_kiem_dinh(id),
    ngay_kiem_dinh      TEXT NOT NULL,
    ngay_het_han        TEXT NOT NULL,
    don_vi_kiem_dinh    TEXT,
    so_giay_cn          TEXT,
    ket_qua             TEXT NOT NULL DEFAULT 'dat'
                        CHECK (ket_qua IN ('dat','khong_dat','dat_co_dieu_kien')),
    ket_luan            TEXT,
    chi_phi             REAL DEFAULT 0,
    nguoi_nhap_id       INTEGER REFERENCES nguoi_dung(id),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_kd_tb ON kiem_dinh(thiet_bi_id);
CREATE INDEX idx_kd_hethan ON kiem_dinh(ngay_het_han);

-- =====================================================================
-- F. PHÊ DUYỆT & NHẬT KÝ HỆ THỐNG
-- =====================================================================

-- Phê duyệt dùng chung: Đồng ý / Chuyển lại (lý do bắt buộc khi chuyển lại)
CREATE TABLE phe_duyet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doi_tuong_loai  TEXT NOT NULL
                    CHECK (doi_tuong_loai IN ('thiet_bi','phieu_sc','dieu_chuyen','kiem_dinh')),
    doi_tuong_id    INTEGER NOT NULL,
    hanh_dong       TEXT NOT NULL CHECK (hanh_dong IN ('gui_duyet','dong_y','chuyen_lai')),
    ly_do           TEXT,
    nguoi_id        INTEGER NOT NULL REFERENCES nguoi_dung(id),
    thoi_gian       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (hanh_dong <> 'chuyen_lai' OR (ly_do IS NOT NULL AND length(trim(ly_do)) > 0))
);
CREATE INDEX idx_pd_dt ON phe_duyet(doi_tuong_loai, doi_tuong_id);

CREATE TABLE nhat_ky_he_thong (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_id        INTEGER REFERENCES nguoi_dung(id),
    hanh_dong       TEXT NOT NULL,
    bang            TEXT,
    ban_ghi_id      INTEGER,
    noi_dung        TEXT,
    thoi_gian       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_nkht_tg ON nhat_ky_he_thong(thoi_gian);

CREATE TABLE cau_hinh (
    khoa            TEXT PRIMARY KEY,
    gia_tri         TEXT,
    mo_ta           TEXT
);

-- =====================================================================
-- G. VIEW PHỤC VỤ TRA CỨU & CẢNH BÁO
-- =====================================================================

-- G1. Danh sách thiết bị đầy đủ thông tin
CREATE VIEW v_thiet_bi AS
SELECT  tb.id, tb.ma_tb, tb.ten, tb.so_seri, tb.nam_sx,
        n1.ten AS nhom_cha, n.ten AS nhom, n.ma AS ma_nhom,
        m.ma_model, m.hang_sx, m.cong_suat_kw,
        px.ma AS ma_px, px.ten AS ten_px, px.ten_ngan AS px_ngan,
        vt.ten AS vi_tri,
        tb.trang_thai, tb.tinh_trang_kt, tb.gio_chay_luy_ke,
        tb.nguyen_gia, tb.gia_tri_con_lai, tb.ngay_su_dung, tb.ma_tscd
FROM thiet_bi tb
LEFT JOIN nhom_thiet_bi n  ON n.id = tb.nhom_id
LEFT JOIN nhom_thiet_bi n1 ON n1.id = n.parent_id
LEFT JOIN model_thiet_bi m ON m.id = tb.model_id
LEFT JOIN phan_xuong px    ON px.id = tb.phan_xuong_id
LEFT JOIN vi_tri vt        ON vt.id = tb.vi_tri_id;

-- G2. Kiểm định mới nhất của từng thiết bị theo từng loại
CREATE VIEW v_kiem_dinh_hien_hanh AS
SELECT k.*
FROM kiem_dinh k
WHERE k.id = (
    SELECT k2.id FROM kiem_dinh k2
    WHERE k2.thiet_bi_id = k.thiet_bi_id
      AND k2.loai_kiem_dinh_id = k.loai_kiem_dinh_id
    ORDER BY k2.ngay_kiem_dinh DESC, k2.id DESC LIMIT 1
);

-- G3. CẢNH BÁO kiểm định sắp hết hạn / quá hạn
CREATE VIEW v_canh_bao_kiem_dinh AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb,
        px.ten_ngan AS px, lkd.ten AS loai_kiem_dinh,
        k.ngay_het_han,
        CAST(julianday(k.ngay_het_han) - julianday(date('now','localtime')) AS INTEGER) AS con_lai_ngay,
        CASE
            WHEN julianday(k.ngay_het_han) < julianday(date('now','localtime')) THEN 'qua_han'
            WHEN julianday(k.ngay_het_han) - julianday(date('now','localtime')) <= lkd.canh_bao_truoc_ngay THEN 'sap_het_han'
            ELSE 'con_han'
        END AS muc_canh_bao
FROM v_kiem_dinh_hien_hanh k
JOIN thiet_bi tb        ON tb.id = k.thiet_bi_id
JOIN loai_kiem_dinh lkd ON lkd.id = k.loai_kiem_dinh_id
LEFT JOIN phan_xuong px ON px.id = tb.phan_xuong_id
WHERE tb.trang_thai NOT IN ('da_thanh_ly','cho_thanh_ly');

-- G4. Thiết bị chưa từng kiểm định nhưng thuộc nhóm bắt buộc
CREATE VIEW v_thieu_kiem_dinh AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb,
        px.ten_ngan AS px, lkd.ten AS loai_kiem_dinh
FROM thiet_bi tb
JOIN ap_dung_kiem_dinh adk ON adk.nhom_id = tb.nhom_id
JOIN loai_kiem_dinh lkd    ON lkd.id = adk.loai_kiem_dinh_id
LEFT JOIN phan_xuong px    ON px.id = tb.phan_xuong_id
WHERE tb.trang_thai NOT IN ('da_thanh_ly','cho_thanh_ly')
  AND NOT EXISTS (
      SELECT 1 FROM kiem_dinh k
      WHERE k.thiet_bi_id = tb.id AND k.loai_kiem_dinh_id = lkd.id);

-- G5. CẢNH BÁO bảo dưỡng đến hạn
CREATE VIEW v_canh_bao_bao_duong AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb,
        px.ten_ngan AS px, kh.cap_bd, kh.lan_cuoi, kh.lan_ke_tiep,
        CAST(julianday(kh.lan_ke_tiep) - julianday(date('now','localtime')) AS INTEGER) AS con_lai_ngay,
        CASE
            WHEN kh.lan_ke_tiep IS NULL THEN 'chua_lap_lich'
            WHEN julianday(kh.lan_ke_tiep) < julianday(date('now','localtime')) THEN 'qua_han'
            WHEN julianday(kh.lan_ke_tiep) - julianday(date('now','localtime')) <= 7 THEN 'den_han'
            ELSE 'con_han'
        END AS muc_canh_bao
FROM ke_hoach_bao_duong kh
JOIN thiet_bi tb        ON tb.id = kh.thiet_bi_id
LEFT JOIN phan_xuong px ON px.id = tb.phan_xuong_id
WHERE kh.hoat_dong = 1
  AND tb.trang_thai NOT IN ('da_thanh_ly','cho_thanh_ly');

-- G6. Tổng hợp chi phí sửa chữa theo thiết bị
CREATE VIEW v_chi_phi_thiet_bi AS
SELECT  tb.id AS thiet_bi_id, tb.ma_tb, tb.ten AS ten_tb,
        px.ten_ngan AS px,
        COUNT(p.id) AS so_lan_sc,
        COALESCE(SUM(p.tong_chi_phi),0) AS tong_chi_phi,
        COALESCE(SUM(p.thoi_gian_dung_may),0) AS tong_gio_dung,
        tb.nguyen_gia,
        CASE WHEN tb.nguyen_gia > 0
             THEN ROUND(COALESCE(SUM(p.tong_chi_phi),0) * 100.0 / tb.nguyen_gia, 2)
             ELSE NULL END AS ty_le_cp_tren_nguyen_gia
FROM thiet_bi tb
LEFT JOIN phieu_sua_chua p ON p.thiet_bi_id = tb.id AND p.trang_thai = 'hoan_thanh'
LEFT JOIN phan_xuong px    ON px.id = tb.phan_xuong_id
GROUP BY tb.id;

-- =====================================================================
-- H. TRIGGER TỰ ĐỘNG
-- =====================================================================

-- H1. Tự tính thành tiền vật tư + cộng dồn chi phí vật tư vào phiếu
CREATE TRIGGER trg_vtsc_insert AFTER INSERT ON vat_tu_sua_chua
BEGIN
    UPDATE vat_tu_sua_chua SET thanh_tien = NEW.so_luong * NEW.don_gia WHERE id = NEW.id;
    UPDATE phieu_sua_chua
       SET chi_phi_vat_tu = (SELECT COALESCE(SUM(so_luong*don_gia),0)
                             FROM vat_tu_sua_chua WHERE phieu_id = NEW.phieu_id)
     WHERE id = NEW.phieu_id;
    UPDATE phieu_sua_chua
       SET tong_chi_phi = COALESCE(chi_phi_nhan_cong,0)+COALESCE(chi_phi_vat_tu,0)+COALESCE(chi_phi_khac,0)
     WHERE id = NEW.phieu_id;
END;

CREATE TRIGGER trg_vtsc_delete AFTER DELETE ON vat_tu_sua_chua
BEGIN
    UPDATE phieu_sua_chua
       SET chi_phi_vat_tu = (SELECT COALESCE(SUM(so_luong*don_gia),0)
                             FROM vat_tu_sua_chua WHERE phieu_id = OLD.phieu_id),
           tong_chi_phi   = COALESCE(chi_phi_nhan_cong,0)
                          + (SELECT COALESCE(SUM(so_luong*don_gia),0)
                             FROM vat_tu_sua_chua WHERE phieu_id = OLD.phieu_id)
                          + COALESCE(chi_phi_khac,0)
     WHERE id = OLD.phieu_id;
END;

-- H2. Điều chuyển được duyệt -> cập nhật vị trí thiết bị + ghi lịch sử
CREATE TRIGGER trg_dc_hoan_thanh AFTER UPDATE OF trang_thai ON dieu_chuyen
WHEN NEW.trang_thai = 'hoan_thanh' AND OLD.trang_thai <> 'hoan_thanh'
BEGIN
    UPDATE lich_su_vi_tri
       SET den_ngay = COALESCE(NEW.ngay_thuc_hien, date('now','localtime'))
     WHERE thiet_bi_id = NEW.thiet_bi_id AND den_ngay IS NULL;

    INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, vi_tri_id, tu_ngay, dieu_chuyen_id)
    VALUES (NEW.thiet_bi_id, NEW.den_phan_xuong_id, NEW.den_vi_tri_id,
            COALESCE(NEW.ngay_thuc_hien, date('now','localtime')), NEW.id);

    UPDATE thiet_bi
       SET phan_xuong_id = COALESCE(NEW.den_phan_xuong_id, phan_xuong_id),
           vi_tri_id     = NEW.den_vi_tri_id,
           ngay_sua      = datetime('now','localtime')
     WHERE id = NEW.thiet_bi_id;
END;

-- H3. Hoàn thành phiếu bảo dưỡng định kỳ -> cập nhật kế hoạch lần kế tiếp
CREATE TRIGGER trg_psc_hoan_thanh AFTER UPDATE OF trang_thai ON phieu_sua_chua
WHEN NEW.trang_thai = 'hoan_thanh' AND OLD.trang_thai <> 'hoan_thanh'
     AND NEW.loai = 'bao_duong_dk'
BEGIN
    UPDATE ke_hoach_bao_duong
       SET lan_cuoi    = COALESCE(NEW.ngay_hoan_thanh, date('now','localtime')),
           lan_ke_tiep = date(COALESCE(NEW.ngay_hoan_thanh, date('now','localtime')),
                              '+' || COALESCE(chu_ky_ngay,30) || ' days')
     WHERE thiet_bi_id = NEW.thiet_bi_id
       AND cap_bd = NEW.cap_bd
       AND hoat_dong = 1;
END;

-- H4. Cộng dồn giờ chạy luỹ kế
CREATE TRIGGER trg_nkvh_insert AFTER INSERT ON nhat_ky_van_hanh
BEGIN
    UPDATE thiet_bi
       SET gio_chay_luy_ke = COALESCE(gio_chay_luy_ke,0) + COALESCE(NEW.gio_chay,0)
     WHERE id = NEW.thiet_bi_id;
END;

-- =====================================================================
-- I. DỮ LIỆU DANH MỤC BAN ĐẦU
-- =====================================================================

-- I1. Nhóm thiết bị cấp 1
INSERT INTO nhom_thiet_bi (ma, ten, cap, yeu_cau_kiem_dinh, theo_doi_gio_chay, thu_tu) VALUES
('VT','Thiết bị vận tải',1,0,1,1),
('CD','Thiết bị điện',1,1,0,2),
('CK','Thiết bị cơ khí - khí nén',1,0,1,3),
('TN','Thiết bị thông gió - thoát nước',1,0,1,4),
('AT','Thiết bị đo lường - an toàn',1,1,0,5);

-- I2. Nhóm cấp 2
INSERT INTO nhom_thiet_bi (parent_id, ma, ten, cap, yeu_cau_kiem_dinh, theo_doi_gio_chay, thu_tu)
SELECT id,'VT.01','Máng cào',2,0,1,1 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.02','Băng tải',2,0,1,2 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.03','Tời trục tải',2,1,1,3 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.04','Tời hỗ trợ - tời cào',2,1,1,4 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.05','Tàu điện ắc quy',2,1,1,5 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.06','Goòng - xe chuyên dùng',2,0,0,6 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.07','Monorail - tàu điện treo',2,1,1,7 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'VT.08','Palăng - thiết bị nâng',2,1,0,8 FROM nhom_thiet_bi WHERE ma='VT'
UNION ALL SELECT id,'CD.01','Trạm biến áp phòng nổ',2,1,0,1 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.02','Khởi động từ phòng nổ',2,1,0,2 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.03','Aptomat - tủ phân phối',2,1,0,3 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.04','Cáp điện',2,1,0,4 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.05','Rơ le rò - thiết bị bảo vệ',2,1,0,5 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.06','Trạm nạp ắc quy',2,1,0,6 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CD.07','Máy phát điện',2,1,1,7 FROM nhom_thiet_bi WHERE ma='CD'
UNION ALL SELECT id,'CK.01','Máy nén khí',2,1,1,1 FROM nhom_thiet_bi WHERE ma='CK'
UNION ALL SELECT id,'CK.02','Máy khoan',2,0,1,2 FROM nhom_thiet_bi WHERE ma='CK'
UNION ALL SELECT id,'CK.03','Máy xúc lật hông',2,0,1,3 FROM nhom_thiet_bi WHERE ma='CK'
UNION ALL SELECT id,'CK.04','Máy combai đào lò',2,0,1,4 FROM nhom_thiet_bi WHERE ma='CK'
UNION ALL SELECT id,'CK.05','Máy hàn - thiết bị gia công',2,0,0,5 FROM nhom_thiet_bi WHERE ma='CK'
UNION ALL SELECT id,'TN.01','Quạt gió cục bộ',2,0,1,1 FROM nhom_thiet_bi WHERE ma='TN'
UNION ALL SELECT id,'TN.02','Quạt gió chính',2,1,1,2 FROM nhom_thiet_bi WHERE ma='TN'
UNION ALL SELECT id,'TN.03','Máy bơm nước',2,0,1,3 FROM nhom_thiet_bi WHERE ma='TN'
UNION ALL SELECT id,'AT.01','Thiết bị đo khí',2,1,0,1 FROM nhom_thiet_bi WHERE ma='AT'
UNION ALL SELECT id,'AT.02','Đèn lò - thiết bị cá nhân',2,0,0,2 FROM nhom_thiet_bi WHERE ma='AT';

-- I3. Loại kiểm định
INSERT INTO loai_kiem_dinh (ma, ten, chu_ky_thang, bat_buoc, can_cu_phap_ly, canh_bao_truoc_ngay) VALUES
('KD.NANG','Kiểm định thiết bị nâng',12,1,'TT 36/2019/TT-BLĐTBXH',30),
('KD.APLUC','Kiểm định thiết bị chịu áp lực',36,1,'TT 36/2019/TT-BLĐTBXH',60),
('KD.PHONGNO','Kiểm định thiết bị điện phòng nổ',12,1,'QCVN 01:2011/BCT',30),
('DO.CACHDIEN','Đo cách điện thiết bị điện',6,1,'QCVN 01:2011/BCT',15),
('DO.NOIDAT','Đo điện trở nối đất',6,1,'QCVN 01:2011/BCT',15),
('HC.DOKHI','Hiệu chuẩn thiết bị đo khí',6,1,'QCVN 01:2011/BCT',15),
('KD.CAPTHEP','Kiểm tra cáp thép - xích tải',3,1,'Quy trình nội bộ',10);

-- I4. Áp dụng kiểm định theo nhóm
INSERT INTO ap_dung_kiem_dinh (nhom_id, loai_kiem_dinh_id)
SELECT n.id, l.id FROM nhom_thiet_bi n, loai_kiem_dinh l
WHERE (n.ma IN ('VT.03','VT.04','VT.07','VT.08') AND l.ma IN ('KD.NANG','KD.CAPTHEP'))
   OR (n.ma IN ('CK.01')                          AND l.ma = 'KD.APLUC')
   OR (n.ma LIKE 'CD.%'                           AND l.ma IN ('KD.PHONGNO','DO.CACHDIEN','DO.NOIDAT'))
   OR (n.ma IN ('VT.05')                          AND l.ma = 'KD.PHONGNO')
   OR (n.ma IN ('TN.02')                          AND l.ma IN ('KD.PHONGNO','DO.CACHDIEN'))
   OR (n.ma IN ('AT.01')                          AND l.ma = 'HC.DOKHI');

-- I5. Cấu hình hệ thống
INSERT INTO cau_hinh (khoa, gia_tri, mo_ta) VALUES
('ten_he_thong','QUẢN LÝ THIẾT BỊ CƠ ĐIỆN VẬN TẢI','Tiêu đề hệ thống (admin sửa)'),
('ten_cong_ty','CÔNG TY XÂY LẮP MỎ - TKV','Tên đơn vị (admin sửa)'),
('quy_tac_ma_tb','{MA_PX}.{MA_NHOM}.{STT:3}','Quy tắc sinh mã thiết bị'),
('canh_bao_mac_dinh','30','Số ngày cảnh báo trước hạn mặc định'),
('tk_tam_gio','24','Thời hạn tài khoản tạm (giờ)');
