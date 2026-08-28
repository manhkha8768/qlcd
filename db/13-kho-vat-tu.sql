/**
 * Migration 13: Kho Vật Tư (v21)
 *
 * Quản lý kho vật tư:
 * - Nhập kho, xuất kho, điều chuyển
 * - Tồn kho theo vật tư
 * - Liên kết với NCVT Quý
 */

-- Danh mục vật tư
CREATE TABLE IF NOT EXISTS kho_vat_tu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    chi_tieu TEXT,                    -- 10mm, 50mm, kích thước chi tiết
    dvt TEXT NOT NULL,                -- bộ, cái, kg, mét, bộ...
    ton_dau REAL DEFAULT 0,           -- tồn đầu kỳ
    muc_toi_thieu REAL,               -- mức cảnh báo tồn kho
    muc_toi_da REAL,                  -- mức tối đa
    vi_tri_kho TEXT,                  -- vị trí lưu trữ (Kho A, Kho B, ...)
    ghi_chu TEXT,
    hoat_dong INTEGER DEFAULT 1,      -- soft delete
    ngay_tao TEXT DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX idx_kho_vat_tu_ma ON kho_vat_tu(ma);
CREATE INDEX idx_kho_vat_tu_hoat_dong ON kho_vat_tu(hoat_dong);

-- Tồn kho hiện tại
CREATE TABLE IF NOT EXISTS ton_kho (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vat_tu_id INTEGER UNIQUE NOT NULL,
    ton_hien_tai REAL DEFAULT 0,      -- số lượng tồn hiện tại
    ngay_cap_nhat TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vat_tu_id) REFERENCES kho_vat_tu(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_ton_kho_vat_tu ON ton_kho(vat_tu_id);

-- Giao dịch kho (nhập/xuất/điều chuyển)
CREATE TABLE IF NOT EXISTS giao_dich_kho (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    loai TEXT NOT NULL,               -- nhap_kho, xuat_kho, dieu_chuyen_kho
    trang_thai TEXT DEFAULT 'nhap',
    ly_do TEXT,
    nguoi_lap_id INTEGER,
    nguoi_duyet_id INTEGER,
    ngay_tao TEXT DEFAULT CURRENT_TIMESTAMP,
    ngay_duyet TEXT,
    ghi_chu TEXT,
    FOREIGN KEY (nguoi_lap_id) REFERENCES nguoi_dung(id),
    FOREIGN KEY (nguoi_duyet_id) REFERENCES nguoi_dung(id),
    CHECK (loai IN ('nhap_kho', 'xuat_kho', 'dieu_chuyen_kho')),
    CHECK (trang_thai IN ('nhap', 'cho_duyet', 'da_duyet', 'tu_choi'))
) STRICT;
CREATE INDEX idx_giao_dich_kho_loai ON giao_dich_kho(loai);
CREATE INDEX idx_giao_dich_kho_trang_thai ON giao_dich_kho(trang_thai);
CREATE INDEX idx_giao_dich_kho_nguoi_lap ON giao_dich_kho(nguoi_lap_id);

-- Chi tiết giao dịch kho
CREATE TABLE IF NOT EXISTS giao_dich_kho_chi_tiet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giao_dich_kho_id INTEGER NOT NULL,
    vat_tu_id INTEGER NOT NULL,
    so_luong REAL NOT NULL,           -- số lượng
    FOREIGN KEY (giao_dich_kho_id) REFERENCES giao_dich_kho(id) ON DELETE CASCADE,
    FOREIGN KEY (vat_tu_id) REFERENCES kho_vat_tu(id),
    CHECK (so_luong > 0)
) STRICT;
CREATE INDEX idx_giao_dich_chi_tiet_giao_dich ON giao_dich_kho_chi_tiet(giao_dich_kho_id);
CREATE INDEX idx_giao_dich_chi_tiet_vat_tu ON giao_dich_kho_chi_tiet(vat_tu_id);

-- Lịch sử audit kho vật tư
CREATE TABLE IF NOT EXISTS lich_su_kho (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giao_dich_kho_id INTEGER,
    hanh_dong TEXT,                   -- nhap, xuat, duyet, tu_choi, dieu_chuyen
    nguoi_dung_id INTEGER,
    dia_chi_ip TEXT,
    chi_tiet_cu TEXT,                 -- JSON chi tiết cũ
    chi_tiet_moi TEXT,                -- JSON chi tiết mới
    ngay_gio TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (giao_dich_kho_id) REFERENCES giao_dich_kho(id),
    FOREIGN KEY (nguoi_dung_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_lich_su_kho_giao_dich ON lich_su_kho(giao_dich_kho_id);
CREATE INDEX idx_lich_su_kho_nguoi_dung ON lich_su_kho(nguoi_dung_id);

-- Quyền kho vật tư
INSERT OR IGNORE INTO ma_quyen (ma, ten, mo_ta, hang_muc, ngay_tao)
VALUES
    ('kho.xem', 'Xem tồn kho', 'Xem danh sách vật tư và tồn kho hiện tại', 'kho', CURRENT_TIMESTAMP),
    ('kho.nhap', 'Nhập kho', 'Lập phiếu nhập kho vật tư', 'kho', CURRENT_TIMESTAMP),
    ('kho.xuat', 'Xuất kho', 'Lập phiếu xuất kho vật tư', 'kho', CURRENT_TIMESTAMP),
    ('kho.dieu_chuyen', 'Điều chuyển kho', 'Lập phiếu điều chuyển giữa các kho', 'kho', CURRENT_TIMESTAMP),
    ('kho.duyet', 'Duyệt giao dịch kho', 'Duyệt/từ chối phiếu nhập/xuất/điều chuyển', 'kho', CURRENT_TIMESTAMP),
    ('kho.xem_lich_su', 'Xem lịch sử kho', 'Xem audit trail của giao dịch kho', 'kho', CURRENT_TIMESTAMP);

-- Gán quyền kho cho admin
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ten = 'admin'), ma, NULL
FROM ma_quyen WHERE hang_muc = 'kho';

-- Gán quyền kho cho cd_cty
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ten = 'cd_cty'), ma, NULL
FROM ma_quyen WHERE ma IN ('kho.xem', 'kho.duyet', 'kho.xem_lich_su');
