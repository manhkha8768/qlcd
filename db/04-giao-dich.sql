-- =====================================================================
-- GIAI ĐOẠN 3: KIẾN TRÚC GIAO DỊCH THỐNG NHẤT
-- Tăng / Giảm / Điều chuyển / Điều chỉnh dùng chung một cấu trúc.
--
-- NGUYÊN TẮC CỐT LÕI:
--   Dữ liệu hiện hành (thiet_bi) CHỈ thay đổi sau khi giao dịch được duyệt.
--   Form lập phiếu tuyệt đối không ghi thẳng vào thiet_bi.
-- =====================================================================

/* ---------------------------------------------------------------
   1. GIAO DỊCH (TRANSACTIONS)
   Khóa chính dùng UUID dạng text để mã phiếu sinh được ngoại tuyến
   và không lộ số lượng giao dịch của đơn vị.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS giao_dich (
    id                  TEXT PRIMARY KEY,
    ma_giao_dich        TEXT NOT NULL UNIQUE,
    loai_giao_dich      TEXT NOT NULL
                        CHECK (loai_giao_dich IN ('tang','giam','dieu_chuyen','dieu_chinh')),
    ngay_giao_dich      TEXT NOT NULL,

    don_vi_nguon_id     INTEGER REFERENCES phan_xuong(id),
    don_vi_dich_id      INTEGER REFERENCES phan_xuong(id),

    -- Nguồn gốc phiếu: lập tay hay sinh từ đối chiếu / kiểm kê
    nguon_tham_chieu    TEXT CHECK (nguon_tham_chieu IN ('doi_chieu','kiem_ke','lo_import',NULL)),
    ma_tham_chieu       TEXT,

    so_van_ban          TEXT,
    ngay_van_ban        TEXT,
    ma_ly_do            TEXT,
    ly_do               TEXT,

    nguoi_giao          TEXT,
    nguoi_nhan          TEXT,

    trang_thai          TEXT NOT NULL DEFAULT 'nhap'
                        CHECK (trang_thai IN ('nhap','cho_duyet','da_duyet','tu_choi','huy')),

    nguoi_tao_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    nguoi_sua_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_sua            TEXT,
    nguoi_trinh_id      INTEGER REFERENCES nguoi_dung(id),
    ngay_trinh          TEXT,
    nguoi_duyet_id      INTEGER REFERENCES nguoi_dung(id),
    ngay_duyet          TEXT,
    nguoi_tu_choi_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tu_choi        TEXT,
    ly_do_tu_choi       TEXT,
    nguoi_huy_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_huy            TEXT,
    ly_do_huy           TEXT,

    duyet_vuot_quyen    INTEGER NOT NULL DEFAULT 0,   -- admin tự duyệt phiếu mình lập
    ghi_chu             TEXT,

    -- Điều chuyển bắt buộc khác đơn vị
    CHECK (loai_giao_dich <> 'dieu_chuyen'
           OR (don_vi_nguon_id IS NOT NULL AND don_vi_dich_id IS NOT NULL
               AND don_vi_nguon_id <> don_vi_dich_id)),
    -- Từ chối bắt buộc có lý do
    CHECK (trang_thai <> 'tu_choi'
           OR (ly_do_tu_choi IS NOT NULL AND length(trim(ly_do_tu_choi)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_gd_trangthai ON giao_dich(trang_thai, loai_giao_dich);
CREATE INDEX IF NOT EXISTS idx_gd_nguon ON giao_dich(don_vi_nguon_id);
CREATE INDEX IF NOT EXISTS idx_gd_dich ON giao_dich(don_vi_dich_id);
CREATE INDEX IF NOT EXISTS idx_gd_ngay ON giao_dich(ngay_giao_dich);
CREATE INDEX IF NOT EXISTS idx_gd_thamchieu ON giao_dich(nguon_tham_chieu, ma_tham_chieu);

/* ---------------------------------------------------------------
   2. CHI TIẾT GIAO DỊCH (TRANSACTION_DETAILS)
   Snapshot đầy đủ để lịch sử phiếu không phụ thuộc dữ liệu hiện hành:
   sau này thiết bị đổi tên hay bị thanh lý, phiếu cũ vẫn đọc được đúng.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS chi_tiet_giao_dich (
    id                  TEXT PRIMARY KEY,
    giao_dich_id        TEXT NOT NULL REFERENCES giao_dich(id) ON DELETE CASCADE,

    thiet_bi_id         INTEGER REFERENCES thiet_bi(id) ON DELETE SET NULL,
    thiet_bi_dich_id    INTEGER REFERENCES thiet_bi(id) ON DELETE SET NULL,

    -- Snapshot tại thời điểm đưa vào phiếu
    ma_tb_snapshot      TEXT,
    ten_snapshot        TEXT NOT NULL,
    dvt_snapshot        TEXT,
    nhom_id_snapshot    INTEGER REFERENCES nhom_thiet_bi(id),
    ma_tscd_snapshot    TEXT,
    don_gia_snapshot    REAL,

    so_luong            REAL NOT NULL,
    so_luong_truoc      REAL,
    so_luong_sau        REAL,

    vi_tri_nguon_id     INTEGER REFERENCES vi_tri(id),
    vi_tri_dich_id      INTEGER REFERENCES vi_tri(id),
    vi_tri_nguon_text   TEXT,
    vi_tri_dich_text    TEXT,

    tinh_trang_truoc    TEXT,
    tinh_trang_sau      TEXT,

    -- Tài sản mới chưa tồn tại: giữ ở dạng nháp, chỉ tạo thật khi duyệt
    la_tai_san_moi      INTEGER NOT NULL DEFAULT 0,
    du_lieu_moi_json    TEXT,

    ghi_chu             TEXT,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua            TEXT,

    CHECK (so_luong > 0),
    CHECK (la_tai_san_moi = 1 OR thiet_bi_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ctgd_gd ON chi_tiet_giao_dich(giao_dich_id);
CREATE INDEX IF NOT EXISTS idx_ctgd_tb ON chi_tiet_giao_dich(thiet_bi_id);

/* ---------------------------------------------------------------
   3. TÀI LIỆU ĐÍNH KÈM (TRANSACTION_DOCUMENTS)
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS tai_lieu_giao_dich (
    id                  TEXT PRIMARY KEY,
    giao_dich_id        TEXT NOT NULL REFERENCES giao_dich(id) ON DELETE CASCADE,
    ten_file            TEXT NOT NULL,
    duong_dan           TEXT NOT NULL,
    loai_file           TEXT,
    kich_thuoc          INTEGER,
    loai_ho_so          TEXT NOT NULL DEFAULT 'khac'
                        CHECK (loai_ho_so IN ('bien_ban_giao_nhan','bien_ban_dieu_chuyen',
                                              'quyet_dinh','phieu_xuat','phieu_nhap','khac')),
    -- Chỗ dành sẵn cho bước bóc tách nội dung biên bản tự động về sau
    du_lieu_boc_tach    TEXT,
    nguoi_tai_id        INTEGER REFERENCES nguoi_dung(id),
    ngay_tai            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ghi_chu             TEXT
);
CREATE INDEX IF NOT EXISTS idx_tlgd_gd ON tai_lieu_giao_dich(giao_dich_id);

/* ---------------------------------------------------------------
   4. LỊCH SỬ TRẠNG THÁI PHIẾU (TRANSACTION_STATUS_HISTORY)
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS lich_su_trang_thai_gd (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    giao_dich_id        TEXT NOT NULL REFERENCES giao_dich(id) ON DELETE CASCADE,
    trang_thai_cu       TEXT,
    trang_thai_moi      TEXT NOT NULL,
    hanh_dong           TEXT NOT NULL
                        CHECK (hanh_dong IN ('tao','sua','trinh_duyet','duyet','tu_choi',
                                             'huy','trinh_lai','mo_lai')),
    nguoi_id            INTEGER REFERENCES nguoi_dung(id),
    thoi_gian           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ly_do               TEXT,
    ghi_chu             TEXT
);
CREATE INDEX IF NOT EXISTS idx_lsttgd ON lich_su_trang_thai_gd(giao_dich_id, thoi_gian);

/* ---------------------------------------------------------------
   5. LỊCH SỬ BIẾN ĐỘNG TÀI SẢN (ASSET_HISTORY + EQUIPMENT_HISTORY)
   QLCD quản lý tài sản và thiết bị trên cùng bảng thiet_bi, nên gộp
   hai bảng lịch sử của spec thành một, phân biệt bằng loai_su_kien.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS lich_su_tai_san (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    thiet_bi_id         INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE CASCADE,
    giao_dich_id        TEXT REFERENCES giao_dich(id) ON DELETE SET NULL,
    loai_su_kien        TEXT NOT NULL
                        CHECK (loai_su_kien IN ('tang','giam','chuyen_di','chuyen_den',
                                                'dieu_chinh','tao_moi')),
    ngay_su_kien        TEXT NOT NULL,

    don_vi_truoc_id     INTEGER REFERENCES phan_xuong(id),
    don_vi_sau_id       INTEGER REFERENCES phan_xuong(id),
    so_luong_truoc      REAL,
    so_luong_thay_doi   REAL,
    so_luong_sau        REAL,
    vi_tri_truoc        TEXT,
    vi_tri_sau          TEXT,
    trang_thai_truoc    TEXT,
    trang_thai_sau      TEXT,

    nguoi_thuc_hien_id  INTEGER REFERENCES nguoi_dung(id),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ghi_chu             TEXT
);
CREATE INDEX IF NOT EXISTS idx_lsts_tb ON lich_su_tai_san(thiet_bi_id, ngay_su_kien);
CREATE INDEX IF NOT EXISTS idx_lsts_gd ON lich_su_tai_san(giao_dich_id);

/* ---------------------------------------------------------------
   6. THÔNG BÁO (NOTIFICATIONS)
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS thong_bao (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_nhan_id       INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    loai                TEXT NOT NULL,
    tieu_de             TEXT NOT NULL,
    noi_dung            TEXT,
    loai_tham_chieu     TEXT,
    ma_tham_chieu       TEXT,
    da_doc              INTEGER NOT NULL DEFAULT 0,
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_doc            TEXT
);
CREATE INDEX IF NOT EXISTS idx_tb_nguoi ON thong_bao(nguoi_nhan_id, da_doc, ngay_tao);

/* ---------------------------------------------------------------
   7. NHẬT KÝ KIỂM TOÁN (AUDIT_LOGS)
   Bảng nhat_ky_he_thong cũ chỉ ghi văn bản mô tả, bổ sung dữ liệu
   trước/sau để truy vết được giá trị đã thay đổi.
   --------------------------------------------------------------- */
ALTER TABLE nhat_ky_he_thong ADD COLUMN du_lieu_cu TEXT;
ALTER TABLE nhat_ky_he_thong ADD COLUMN du_lieu_moi TEXT;
ALTER TABLE nhat_ky_he_thong ADD COLUMN dia_chi_ip TEXT;
ALTER TABLE nhat_ky_he_thong ADD COLUMN trinh_duyet TEXT;
CREATE INDEX IF NOT EXISTS idx_nkht_dt ON nhat_ky_he_thong(bang, ban_ghi_id);

/* ---------------------------------------------------------------
   8. PHÂN QUYỀN THEO MÃ QUYỀN
   Vai trò vẫn giữ nguyên, nhưng quyền thao tác tra theo mã quyền
   để sau này cấp quyền duyệt cho một quản đốc cụ thể mà không phải
   nâng người đó lên vai trò cơ điện công ty.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS quyen (
    ma                  TEXT PRIMARY KEY,
    ten                 TEXT NOT NULL,
    nhom                TEXT
);

CREATE TABLE IF NOT EXISTS quyen_vai_tro (
    vai_tro             TEXT NOT NULL,
    ma_quyen            TEXT NOT NULL REFERENCES quyen(ma) ON DELETE CASCADE,
    PRIMARY KEY (vai_tro, ma_quyen)
);

-- Quyền cấp riêng cho từng tài khoản, ghi đè quyền của vai trò
CREATE TABLE IF NOT EXISTS quyen_nguoi_dung (
    nguoi_dung_id       INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    ma_quyen            TEXT NOT NULL REFERENCES quyen(ma) ON DELETE CASCADE,
    duoc_phep           INTEGER NOT NULL DEFAULT 1,   -- 0 = cấm dù vai trò có quyền
    PRIMARY KEY (nguoi_dung_id, ma_quyen)
);

INSERT OR IGNORE INTO quyen (ma, ten, nhom) VALUES
('GD_TAO',        'Lập giao dịch',                    'Giao dịch'),
('GD_SUA',        'Sửa giao dịch nháp',               'Giao dịch'),
('GD_TRINH',      'Trình duyệt giao dịch',            'Giao dịch'),
('GD_DUYET',      'Duyệt giao dịch',                  'Giao dịch'),
('GD_TU_CHOI',    'Từ chối giao dịch',                'Giao dịch'),
('GD_HUY',        'Hủy giao dịch',                    'Giao dịch'),
('GD_TU_DUYET',   'Tự duyệt phiếu mình lập',          'Giao dịch'),
('TS_TANG',       'Lập phiếu tăng tài sản',           'Tài sản'),
('TS_GIAM',       'Lập phiếu giảm tài sản',           'Tài sản'),
('TS_DIEU_CHUYEN','Lập phiếu điều chuyển',            'Tài sản'),
('XEM_MOI_DON_VI','Xem dữ liệu toàn công ty',         'Hệ thống'),
('QT_HE_THONG',   'Quản trị hệ thống',                'Hệ thống');

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen)
SELECT 'admin', ma FROM quyen;

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen) VALUES
('cd_cty','GD_TAO'), ('cd_cty','GD_SUA'), ('cd_cty','GD_TRINH'),
('cd_cty','GD_DUYET'), ('cd_cty','GD_TU_CHOI'), ('cd_cty','GD_HUY'),
('cd_cty','TS_TANG'), ('cd_cty','TS_GIAM'), ('cd_cty','TS_DIEU_CHUYEN'),
('cd_cty','XEM_MOI_DON_VI'),
('px','GD_TAO'), ('px','GD_SUA'), ('px','GD_TRINH'), ('px','GD_HUY'),
('px','TS_TANG'), ('px','TS_GIAM'), ('px','TS_DIEU_CHUYEN');
-- Vai trò 'xem' không có quyền thao tác nào

/* ---------------------------------------------------------------
   9. BỘ ĐẾM SỐ PHIẾU
   Tách riêng để sinh mã không phải quét bảng giao dịch, và không bị
   trùng khi hai người lập phiếu cùng lúc.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS bo_dem_ma (
    khoa                TEXT PRIMARY KEY,
    gia_tri             INTEGER NOT NULL DEFAULT 0
);

/* ---------------------------------------------------------------
   10. VIEW TỔNG HỢP GIAO DỊCH
   --------------------------------------------------------------- */
DROP VIEW IF EXISTS v_giao_dich;
CREATE VIEW v_giao_dich AS
SELECT  gd.*,
        pxn.ten_ngan AS don_vi_nguon, pxn.ten AS ten_don_vi_nguon,
        pxd.ten_ngan AS don_vi_dich,  pxd.ten AS ten_don_vi_dich,
        nt.ho_ten AS nguoi_tao, nt.ten_dang_nhap AS tk_nguoi_tao,
        nd.ho_ten AS nguoi_duyet,
        (SELECT COUNT(*) FROM chi_tiet_giao_dich ct WHERE ct.giao_dich_id = gd.id) AS so_dong,
        (SELECT COALESCE(SUM(ct.so_luong),0) FROM chi_tiet_giao_dich ct
          WHERE ct.giao_dich_id = gd.id) AS tong_so_luong,
        (SELECT COUNT(*) FROM tai_lieu_giao_dich tl WHERE tl.giao_dich_id = gd.id) AS so_tai_lieu
FROM giao_dich gd
LEFT JOIN phan_xuong pxn ON pxn.id = gd.don_vi_nguon_id
LEFT JOIN phan_xuong pxd ON pxd.id = gd.don_vi_dich_id
LEFT JOIN nguoi_dung nt  ON nt.id = gd.nguoi_tao_id
LEFT JOIN nguoi_dung nd  ON nd.id = gd.nguoi_duyet_id;
