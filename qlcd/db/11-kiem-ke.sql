/**
 * Migration 11: Kiểm kê & Quản lý snapshot thiết bị (v19)
 *
 * Tạo hệ thống kiểm kê định kỳ với so sánh trước/sau
 * Ghi nhận tình trạng thiết bị, thiếu hụt, cấp phát lại
 */

-- Đợt kiểm kê
CREATE TABLE IF NOT EXISTS dot_kiem_ke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    mo_ta TEXT,
    so_hieu_kiemke TEXT,
    nam INTEGER DEFAULT 2024,
    ky INTEGER,
    ngay_bat_dau TEXT NOT NULL,
    ngay_ket_thuc TEXT,
    trang_thai TEXT DEFAULT 'dang_thuc_hien',
    ghi_chu TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    nguoi_tao_id INTEGER,
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_dot_kiem_ke_trang_thai ON dot_kiem_ke(trang_thai);
CREATE INDEX idx_dot_kiem_ke_nam ON dot_kiem_ke(nam, ky);

-- Giao nhiệm vụ kiểm kê theo phân xưởng
CREATE TABLE IF NOT EXISTS nhiem_vu_kiem_ke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_kiem_ke_id INTEGER NOT NULL,
    phan_xuong_id INTEGER NOT NULL,
    nguoi_phu_trach_id INTEGER,
    so_thiet_bi_du_kien INTEGER DEFAULT 0,
    so_thiet_bi_kiem_ke INTEGER DEFAULT 0,
    trang_thai TEXT DEFAULT 'chua_bat_dau',
    tien_do_phan_tram INTEGER DEFAULT 0,
    ngay_bat_dau TEXT,
    ngay_ket_thuc TEXT,
    ghi_chu TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_kiem_ke_id) REFERENCES dot_kiem_ke(id) ON DELETE CASCADE,
    FOREIGN KEY (phan_xuong_id) REFERENCES phan_xuong(id),
    FOREIGN KEY (nguoi_phu_trach_id) REFERENCES nguoi_dung(id),
    UNIQUE(dot_kiem_ke_id, phan_xuong_id)
) STRICT;
CREATE INDEX idx_nhiem_vu_kiem_ke_dot ON nhiem_vu_kiem_ke(dot_kiem_ke_id);
CREATE INDEX idx_nhiem_vu_kiem_ke_px ON nhiem_vu_kiem_ke(phan_xuong_id);
CREATE INDEX idx_nhiem_vu_kiem_ke_status ON nhiem_vu_kiem_ke(trang_thai);

-- Chi tiết kiểm kê từng thiết bị
CREATE TABLE IF NOT EXISTS chi_tiet_kiem_ke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nhiem_vu_kiem_ke_id INTEGER NOT NULL,
    thiet_bi_id INTEGER NOT NULL,
    trang_thai_cu TEXT,
    trang_thai_moi TEXT,
    vi_tri_cu TEXT,
    vi_tri_moi TEXT,
    so_seri_cu TEXT,
    so_seri_moi TEXT,
    ghi_chu_kiem_ke TEXT,
    ket_luan TEXT,
    da_kiem_ke INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    nguoi_kiem_ke_id INTEGER,
    FOREIGN KEY (nhiem_vu_kiem_ke_id) REFERENCES nhiem_vu_kiem_ke(id) ON DELETE CASCADE,
    FOREIGN KEY (thiet_bi_id) REFERENCES thiet_bi(id),
    FOREIGN KEY (nguoi_kiem_ke_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_chi_tiet_kiem_ke_nhiem_vu ON chi_tiet_kiem_ke(nhiem_vu_kiem_ke_id);
CREATE INDEX idx_chi_tiet_kiem_ke_thiet_bi ON chi_tiet_kiem_ke(thiet_bi_id);
CREATE INDEX idx_chi_tiet_kiem_ke_status ON chi_tiet_kiem_ke(da_kiem_ke);

-- Báo cáo thiếu/mất thiết bị
CREATE TABLE IF NOT EXISTS bao_cao_thieu_mat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_kiem_ke_id INTEGER NOT NULL,
    thiet_bi_id INTEGER,
    so_hieu TEXT,
    ten_thiet_bi TEXT,
    phan_xuong_id INTEGER,
    loai_thieu_mat TEXT,
    gia_tri_sach TEXT,
    ghi_chu TEXT,
    da_xu_ly INTEGER DEFAULT 0,
    ngay_lap TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_kiem_ke_id) REFERENCES dot_kiem_ke(id) ON DELETE CASCADE,
    FOREIGN KEY (thiet_bi_id) REFERENCES thiet_bi(id),
    FOREIGN KEY (phan_xuong_id) REFERENCES phan_xuong(id)
) STRICT;
CREATE INDEX idx_bao_cao_thieu_mat_dot ON bao_cao_thieu_mat(dot_kiem_ke_id);
CREATE INDEX idx_bao_cao_thieu_mat_loai ON bao_cao_thieu_mat(loai_thieu_mat);
CREATE INDEX idx_bao_cao_thieu_mat_status ON bao_cao_thieu_mat(da_xu_ly);

-- Snapshot tình trạng thiết bị trước kiểm kê
CREATE TABLE IF NOT EXISTS snapshot_truoc_kiem_ke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_kiem_ke_id INTEGER NOT NULL,
    thiet_bi_id INTEGER NOT NULL,
    trang_thai TEXT,
    vi_tri_phieu TEXT,
    so_seri TEXT,
    nam_phat_hanh TEXT,
    gia_tri_sach TEXT,
    ghi_chu TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_kiem_ke_id) REFERENCES dot_kiem_ke(id) ON DELETE CASCADE,
    FOREIGN KEY (thiet_bi_id) REFERENCES thiet_bi(id)
) STRICT;
CREATE INDEX idx_snapshot_truoc_dot ON snapshot_truoc_kiem_ke(dot_kiem_ke_id);
CREATE INDEX idx_snapshot_truoc_thiet_bi ON snapshot_truoc_kiem_ke(thiet_bi_id);

-- Lịch sử kiểm kê
CREATE TABLE IF NOT EXISTS lich_su_kiem_ke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_kiem_ke_id INTEGER,
    nhiem_vu_kiem_ke_id INTEGER,
    hanh_dong TEXT NOT NULL,
    chi_tiet_cu TEXT,
    chi_tiet_moi TEXT,
    nguoi_tao_id INTEGER,
    ip_dia_chi TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_kiem_ke_id) REFERENCES dot_kiem_ke(id) ON DELETE SET NULL,
    FOREIGN KEY (nhiem_vu_kiem_ke_id) REFERENCES nhiem_vu_kiem_ke(id) ON DELETE SET NULL,
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_lich_su_kiem_ke_dot ON lich_su_kiem_ke(dot_kiem_ke_id);
CREATE INDEX idx_lich_su_kiem_ke_time ON lich_su_kiem_ke(created_at);

-- Thêm quyền kiểm kê vào ma_quyen
INSERT OR IGNORE INTO ma_quyen (ma, ten, hang_muc, mo_ta) VALUES
    ('kiemke.xem', 'Xem kiểm kê', 'kiemke', 'Xem danh sách đợt kiểm kê'),
    ('kiemke.tao', 'Tạo đợt kiểm kê', 'kiemke', 'Tạo đợt kiểm kê mới'),
    ('kiemke.sua', 'Sửa kiểm kê', 'kiemke', 'Cập nhật thông tin kiểm kê'),
    ('kiemke.giao-nhiem-vu', 'Giao nhiệm vụ kiểm kê', 'kiemke', 'Phân công kiểm kê cho phân xưởng'),
    ('kiemke.kiem-tra-chi-tiet', 'Kiểm tra chi tiết thiết bị', 'kiemke', 'Ghi nhận tình trạng thiết bị'),
    ('kiemke.hoan-thanh', 'Hoàn thành kiểm kê', 'kiemke', 'Xác nhận hoàn thành đợt kiểm kê'),
    ('kiemke.xem-bao-cao', 'Xem báo cáo kiểm kê', 'kiemke', 'Xem báo cáo thiếu/mất thiết bị');

-- Phân quyền cho vai trò admin
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'admin' AND q.ma LIKE 'kiemke.%';

-- Phân quyền xem cho nhân viên
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'nhanvien' AND q.ma IN ('kiemke.xem', 'kiemke.kiem-tra-chi-tiet');

-- Phân quyền quản lý cho quản lý nhân sự
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'quanlynnhan' AND q.ma LIKE 'kiemke.%';
