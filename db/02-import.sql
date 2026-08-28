-- =====================================================================
-- BỔ SUNG: IMPORT FILE TSCĐ/CCDC THEO PHÂN XƯỞNG
-- Mỗi phân xưởng tải lên file Excel danh sách tài sản của mình.
-- Cấu trúc file mỗi nơi mỗi khác -> import qua 3 bước:
--   1) Tải file  -> đọc thô vào bảng tạm
--   2) Ánh xạ cột -> lưu mapping, kiểm tra dữ liệu
--   3) Xác nhận  -> đẩy vào bảng thiet_bi
-- =====================================================================

-- Lô import (mỗi lần tải file = 1 lô, có thể huỷ / import lại)
CREATE TABLE IF NOT EXISTS lo_import (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phan_xuong_id   INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE CASCADE,
    ten_file        TEXT NOT NULL,
    duong_dan       TEXT,
    ten_sheet       TEXT,
    dong_tieu_de    INTEGER,                       -- dòng chứa tiêu đề cột
    mapping_json    TEXT,                          -- {"ma_tb":"Mã TS","ten":"Tên tài sản",...}
    tong_dong       INTEGER DEFAULT 0,
    so_hop_le       INTEGER DEFAULT 0,
    so_loi          INTEGER DEFAULT 0,
    so_da_nhap      INTEGER DEFAULT 0,
    trang_thai      TEXT NOT NULL DEFAULT 'da_tai'
                    CHECK (trang_thai IN ('da_tai','da_anh_xa','cho_duyet','da_nhap','chuyen_lai','huy')),
    ly_do_chuyen_lai TEXT,
    nguoi_tai_id    INTEGER REFERENCES nguoi_dung(id),
    nguoi_duyet_id  INTEGER REFERENCES nguoi_dung(id),
    ngay_tai        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_nhap       TEXT
);
CREATE INDEX IF NOT EXISTS idx_loimport_px ON lo_import(phan_xuong_id, trang_thai);

-- Dòng dữ liệu tạm đọc từ file (giữ nguyên bản gốc để đối chiếu)
CREATE TABLE IF NOT EXISTS import_tam (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lo_id           INTEGER NOT NULL REFERENCES lo_import(id) ON DELETE CASCADE,
    dong_goc        INTEGER NOT NULL,
    du_lieu_goc     TEXT NOT NULL,                 -- JSON nguyên bản 1 dòng

    -- các trường sau khi ánh xạ
    ma_tb           TEXT,
    ten             TEXT,
    ma_tscd         TEXT,
    loai_ts         TEXT,
    so_seri         TEXT,
    nam_sx          INTEGER,
    nuoc_sx         TEXT,
    dvt             TEXT,
    so_luong        REAL DEFAULT 1,
    nguyen_gia      REAL,
    gia_tri_con_lai REAL,
    ngay_su_dung    TEXT,
    nhom_ma         TEXT,                          -- mã nhóm đoán được
    nhom_id         INTEGER REFERENCES nhom_thiet_bi(id),
    vi_tri_text     TEXT,
    ghi_chu         TEXT,

    hop_le          INTEGER NOT NULL DEFAULT 0,
    loi             TEXT,                          -- mô tả lỗi nếu không hợp lệ
    canh_bao        TEXT,                          -- trùng mã, thiếu nguyên giá...
    da_nhap         INTEGER NOT NULL DEFAULT 0,
    thiet_bi_id     INTEGER REFERENCES thiet_bi(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_importtam_lo ON import_tam(lo_id);
CREATE INDEX IF NOT EXISTS idx_importtam_hople ON import_tam(lo_id, hop_le);

-- Từ khoá nhận diện nhóm thiết bị từ tên tài sản (admin bổ sung được)
CREATE TABLE IF NOT EXISTS tu_khoa_nhom (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom_id         INTEGER NOT NULL REFERENCES nhom_thiet_bi(id) ON DELETE CASCADE,
    tu_khoa         TEXT NOT NULL,                 -- chữ thường, không dấu
    do_uu_tien      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tukhoa_tk ON tu_khoa_nhom(tu_khoa);

-- Bộ từ khoá mặc định để tự đoán nhóm thiết bị khi import
INSERT INTO tu_khoa_nhom (nhom_id, tu_khoa, do_uu_tien)
SELECT n.id, t.tk, t.uu FROM nhom_thiet_bi n
JOIN (
    SELECT 'VT.01' ma,'mang cao' tk, 3 uu UNION ALL SELECT 'VT.01','sgb',3 UNION ALL SELECT 'VT.01','sgz',3
    UNION ALL SELECT 'VT.02','bang tai',3 UNION ALL SELECT 'VT.02','bang chuyen',2
    UNION ALL SELECT 'VT.03','toi truc',3 UNION ALL SELECT 'VT.03','truc tai',3
    UNION ALL SELECT 'VT.04','toi ho tro',3 UNION ALL SELECT 'VT.04','toi cao',3 UNION ALL SELECT 'VT.04','toi dien',2 UNION ALL SELECT 'VT.04','toi',1
    UNION ALL SELECT 'VT.05','tau dien',3 UNION ALL SELECT 'VT.05','ac quy dau tau',3 UNION ALL SELECT 'VT.05','dau tau',2
    UNION ALL SELECT 'VT.06','goong',3 UNION ALL SELECT 'VT.06','xe goong',3
    UNION ALL SELECT 'VT.07','monorail',3 UNION ALL SELECT 'VT.07','tau dien treo',3
    UNION ALL SELECT 'VT.08','palang',3 UNION ALL SELECT 'VT.08','pa lang',3 UNION ALL SELECT 'VT.08','cau truc',2 UNION ALL SELECT 'VT.08','toi nang',2
    UNION ALL SELECT 'CD.01','tram bien ap',3 UNION ALL SELECT 'CD.01','bien ap',2 UNION ALL SELECT 'CD.01','kbsg',3
    UNION ALL SELECT 'CD.02','khoi dong tu',3 UNION ALL SELECT 'CD.02','qbz',3
    UNION ALL SELECT 'CD.03','aptomat',3 UNION ALL SELECT 'CD.03','tu phan phoi',3 UNION ALL SELECT 'CD.03','tu dien',2
    UNION ALL SELECT 'CD.04','cap dien',3 UNION ALL SELECT 'CD.04','cap cao su',3 UNION ALL SELECT 'CD.04','cap mem',2
    UNION ALL SELECT 'CD.05','ro le ro',3 UNION ALL SELECT 'CD.05','role ro',3 UNION ALL SELECT 'CD.05','bao ve ro',2
    UNION ALL SELECT 'CD.06','nap ac quy',3 UNION ALL SELECT 'CD.06','tram nap',3
    UNION ALL SELECT 'CD.07','may phat dien',3
    UNION ALL SELECT 'CK.01','may nen khi',3 UNION ALL SELECT 'CK.01','nen khi',2
    UNION ALL SELECT 'CK.02','may khoan',3 UNION ALL SELECT 'CK.02','khoan xoay',2 UNION ALL SELECT 'CK.02','khoan dap',2
    UNION ALL SELECT 'CK.03','xuc lat hong',3 UNION ALL SELECT 'CK.03','may xuc',2
    UNION ALL SELECT 'CK.04','combai',3 UNION ALL SELECT 'CK.04','com bai',3 UNION ALL SELECT 'CK.04','ebz',3
    UNION ALL SELECT 'CK.05','may han',3 UNION ALL SELECT 'CK.05','may tien',2 UNION ALL SELECT 'CK.05','may mai',2
    UNION ALL SELECT 'TN.01','quat cuc bo',3 UNION ALL SELECT 'TN.01','quat gio cuc bo',3 UNION ALL SELECT 'TN.01','yby',3 UNION ALL SELECT 'TN.01','quat',1
    UNION ALL SELECT 'TN.02','quat gio chinh',3 UNION ALL SELECT 'TN.02','quat chinh',3
    UNION ALL SELECT 'TN.03','may bom',3 UNION ALL SELECT 'TN.03','bom nuoc',3 UNION ALL SELECT 'TN.03','bom',1
    UNION ALL SELECT 'AT.01','do khi',3 UNION ALL SELECT 'AT.01','may do khi',3 UNION ALL SELECT 'AT.01','ch4',2
    UNION ALL SELECT 'AT.02','den lo',3 UNION ALL SELECT 'AT.02','den ca nhan',3
) t ON t.ma = n.ma
WHERE NOT EXISTS (SELECT 1 FROM tu_khoa_nhom);
