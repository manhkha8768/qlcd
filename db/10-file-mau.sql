/**
 * Migration 10: File mẫu & sinh tài liệu (v18)
 *
 * Tạo hệ thống quản lý file mẫu (template) cho sinh tài liệu
 * Hỗ trợ: DOCX (Word), XLSX (Excel), PDF
 */

-- Loại file mẫu
CREATE TABLE IF NOT EXISTS loai_file_mau (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    mo_ta TEXT,
    duoi_file TEXT NOT NULL DEFAULT '.docx'
) STRICT;
INSERT OR IGNORE INTO loai_file_mau (ma, ten, mo_ta, duoi_file) VALUES
    ('phieu_ktt', 'Phiếu kiểm tra thiết bị', 'Biểu mẫu kiểm tra định kỳ', '.docx'),
    ('bao_cao_bao_duong', 'Báo cáo bảo dưỡng', 'Tài liệu bảo dưỡng thiết bị', '.docx'),
    ('phieu_su_co', 'Phiếu sự cố', 'Biểu mẫu báo cáo sự cố', '.docx'),
    ('bang_ke', 'Bảng kê thiết bị', 'Danh sách thiết bị theo phân xưởng', '.xlsx'),
    ('bao_cao_kiemke', 'Báo cáo kiểm kê', 'Tài liệu kết quả kiểm kê tài sản', '.xlsx'),
    ('hop_dong', 'Hợp đồng', 'Mẫu hợp đồng', '.docx'),
    ('chung_chi_bao_duong', 'Chứng chỉ bảo dưỡng', 'Chứng chỉ kỹ năng bảo dưỡng', '.pdf');

-- File mẫu (template)
CREATE TABLE IF NOT EXISTS file_mau (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    mo_ta TEXT,
    loai_id INTEGER NOT NULL,
    tap_tin BLOB NOT NULL,
    kich_thuoc INTEGER NOT NULL,
    ma_hash TEXT UNIQUE,
    tro_cap TEXT,
    ghi_chu TEXT,
    da_xoa INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    nguoi_tao_id INTEGER,
    FOREIGN KEY (loai_id) REFERENCES loai_file_mau(id),
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_file_mau_ma ON file_mau(ma);
CREATE INDEX idx_file_mau_loai ON file_mau(loai_id);
CREATE INDEX idx_file_mau_xoa ON file_mau(da_xoa);

-- File mẫu được ghim (nổi bật)
CREATE TABLE IF NOT EXISTS file_mau_ban_ghim (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_mau_id INTEGER NOT NULL UNIQUE,
    tro_cap TEXT,
    thu_tu INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_mau_id) REFERENCES file_mau(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_file_mau_ban_ghim_thu_tu ON file_mau_ban_ghim(thu_tu);

-- Lịch sử file mẫu (audit)
CREATE TABLE IF NOT EXISTS file_mau_lich_su (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_mau_id INTEGER,
    hanh_dong TEXT NOT NULL,
    chi_tiet_cu TEXT,
    chi_tiet_moi TEXT,
    nguoi_tao_id INTEGER,
    ip_dia_chi TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_mau_id) REFERENCES file_mau(id) ON DELETE SET NULL,
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_file_mau_lich_su_file ON file_mau_lich_su(file_mau_id);
CREATE INDEX idx_file_mau_lich_su_thoi_gian ON file_mau_lich_su(created_at);

-- Quyền download file mẫu theo vai trò
CREATE TABLE IF NOT EXISTS file_mau_quyen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_mau_id INTEGER NOT NULL,
    vai_tro_id INTEGER,
    donvi_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_mau_id) REFERENCES file_mau(id) ON DELETE CASCADE,
    FOREIGN KEY (vai_tro_id) REFERENCES vai_tro(id) ON DELETE CASCADE,
    FOREIGN KEY (donvi_id) REFERENCES phan_xuong(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_file_mau_quyen_file ON file_mau_quyen(file_mau_id);
CREATE INDEX idx_file_mau_quyen_vaitro ON file_mau_quyen(vai_tro_id);
CREATE INDEX idx_file_mau_quyen_donvi ON file_mau_quyen(donvi_id);

-- Cấp truy cập file mẫu
CREATE TABLE IF NOT EXISTS cap_truy_cap_file_mau (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    mo_ta TEXT
) STRICT;
INSERT OR IGNORE INTO cap_truy_cap_file_mau (ma, ten, mo_ta) VALUES
    ('cong_khai', 'Công khai', 'Tất cả người dùng có thể truy cập'),
    ('noi_bo', 'Nội bộ', 'Chỉ nhân viên nội bộ'),
    ('chi_tieu', 'Chỉ tiêu', 'Chỉ lãnh đạo/chỉ tiêu'),
    ('dac_biet', 'Đặc biệt', 'Phân quyền tùy chỉnh'),
    ('can_duyet', 'Cần duyệt', 'Chờ phê duyệt từ quản lý');

-- Biến mẫu (placeholder) sẵn sàng cho sinh tài liệu
CREATE TABLE IF NOT EXISTS file_mau_bien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_mau_id INTEGER NOT NULL,
    ma_bien TEXT NOT NULL,
    kieu_du_lieu TEXT DEFAULT 'text',
    bat_buoc INTEGER DEFAULT 1,
    mo_ta TEXT,
    gia_tri_mac_dinh TEXT,
    FOREIGN KEY (file_mau_id) REFERENCES file_mau(id) ON DELETE CASCADE,
    UNIQUE(file_mau_id, ma_bien)
) STRICT;
CREATE INDEX idx_file_mau_bien_file ON file_mau_bien(file_mau_id);

-- Cấp nhật tính năng: thêm quyền quản lý file mẫu vào ma_quyen
INSERT OR IGNORE INTO ma_quyen (ma, ten, hang_muc, mo_ta) VALUES
    ('filemau.xem', 'Xem file mẫu', 'filemau', 'Xem danh sách file mẫu'),
    ('filemau.download', 'Download file mẫu', 'filemau', 'Tải file mẫu về máy'),
    ('filemau.tao', 'Tạo file mẫu', 'filemau', 'Tạo file mẫu mới'),
    ('filemau.sua', 'Sửa file mẫu', 'filemau', 'Cập nhật thông tin file mẫu'),
    ('filemau.xoa', 'Xóa file mẫu', 'filemau', 'Xóa file mẫu khỏi hệ thống'),
    ('filemau.phanquyen', 'Phân quyền file mẫu', 'filemau', 'Phân quyền truy cập file mẫu');

-- Phân quyền cho vai trò admin
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'admin' AND q.ma LIKE 'filemau.%';

-- Phân quyền download cho NV (nhân viên)
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'nhanvien' AND q.ma IN ('filemau.xem', 'filemau.download');

-- Phân quyền quản lý cho QLN (quản lý nhân sự)
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'quanlynnhan' AND q.ma LIKE 'filemau.%';
