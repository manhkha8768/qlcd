-- =====================================================================
-- MIGRATION 09: Phân quyền động theo chức năng + đơn vị
-- =====================================================================

PRAGMA foreign_keys = ON;

-- =====================================================================
-- A. BẢNG MÃ QUYỀN (Danh mục quyền có sẵn)
-- =====================================================================

CREATE TABLE IF NOT EXISTS ma_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,      -- 'thietbi.xem', 'giaodich.duyet'
    ten             TEXT NOT NULL,             -- 'Xem thiết bị', 'Duyệt giao dịch'
    mo_ta           TEXT,                      -- Mô tả chi tiết
    hang_muc        TEXT NOT NULL,             -- 'thietbi', 'kiemke', 'kho', 'quantri', ...
    hoat_dong       INTEGER DEFAULT 1,
    ngay_tao        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_ma_quyen_hang_muc ON ma_quyen(hang_muc);

-- Danh sách quyền tích hợp (không xóa được)
INSERT OR IGNORE INTO ma_quyen (ma, ten, mo_ta, hang_muc) VALUES
-- Thiết bị
('thietbi.xem', 'Xem danh sách thiết bị', 'Xem danh sách và chi tiết thiết bị', 'thietbi'),
('thietbi.them', 'Thêm thiết bị', 'Thêm thiết bị mới', 'thietbi'),
('thietbi.sua', 'Sửa thông tin thiết bị', 'Chỉnh sửa tên, model, serial, thông số', 'thietbi'),

-- Kiểm kê
('kiemke.xem', 'Xem kiểm kê', 'Xem danh sách kỳ kiểm kê và chi tiết', 'kiemke'),
('kiemke.lap', 'Lập kỳ kiểm kê', 'Lập kỳ kiểm kê mới', 'kiemke'),
('kiemke.duyet', 'Duyệt kiểm kê', 'Duyệt hoặc từ chối kỳ kiểm kê', 'kiemke'),
('kiemke.xuat', 'Xuất biên bản kiểm kê', 'Xuất biên bản kiểm kê sang Excel/PDF', 'kiemke'),

-- Đối chiếu
('doichieu.xem', 'Xem đối chiếu', 'Xem kết quả đối chiếu', 'doichieu'),
('doichieu.lap', 'Lập đối chiếu', 'Lập phiếu đối chiếu mới', 'doichieu'),
('doichieu.duyet', 'Duyệt đối chiếu', 'Duyệt hoặc từ chối đối chiếu', 'doichieu'),

-- Giao dịch tài sản
('giaodich.xem', 'Xem giao dịch', 'Xem danh sách giao dịch', 'giaodich'),
('giaodich.lap', 'Lập phiếu giao dịch', 'Lập phiếu tăng/giảm/điều chuyển', 'giaodich'),
('giaodich.duyet', 'Duyệt giao dịch', 'Duyệt hoặc từ chối phiếu giao dịch', 'giaodich'),
('giaodich.huy', 'Hủy giao dịch', 'Hủy giao dịch đã duyệt (tạo phiếu đảo chiều)', 'giaodich'),

-- Nhu cầu vật tư
('ncvt.xem', 'Xem NCVT', 'Xem danh sách nhu cầu vật tư', 'ncvt'),
('ncvt.lap', 'Lập NCVT', 'Lập nhu cầu vật tư mới', 'ncvt'),
('ncvt.duyet', 'Duyệt NCVT', 'Duyệt hoặc từ chối NCVT', 'ncvt'),
('ncvt.cap_phat', 'Cấp phát vật tư', 'Cấp phát vật tư cho phân xưởng', 'ncvt'),

-- Kho vật tư
('kho.xem', 'Xem kho', 'Xem tồn kho và lịch sử giao dịch', 'kho'),
('kho.nhap', 'Nhập kho', 'Lập phiếu nhập kho', 'kho'),
('kho.xuat', 'Xuất kho', 'Lập phiếu xuất kho', 'kho'),
('kho.dieu_chuyen', 'Điều chuyển kho', 'Điều chuyển vật tư giữa các kho', 'kho'),
('kho.duyet', 'Duyệt giao dịch kho', 'Duyệt hoặc từ chối giao dịch kho', 'kho'),

-- File mẫu
('bieumau.xem', 'Xem file mẫu', 'Xem danh sách file mẫu', 'bieumau'),
('bieumau.tao', 'Tạo hồ sơ từ mẫu', 'Tạo hồ sơ hành chính từ file mẫu', 'bieumau'),
('bieumau.tai_len', 'Upload file mẫu', 'Upload file mẫu mới (admin)', 'bieumau'),
('bieumau.sua', 'Sửa file mẫu', 'Sửa thông tin, phiên bản mẫu', 'bieumau'),
('bieumau.xuat', 'Xuất file mẫu', 'Tải file mẫu xuống', 'bieumau'),

-- Hồ sơ kỹ thuật
('kythuat.xem', 'Xem hồ sơ kỹ thuật', 'Xem thông số, cây cụm, sự cố', 'kythuat'),
('kythuat.sua', 'Sửa hồ sơ kỹ thuật', 'Sửa thông số, cả cụm, lý lịch', 'kythuat'),

-- Bảo dưỡng & Kiểm định
('baoduong.xem', 'Xem bảo dưỡng', 'Xem lịch bảo dưỡng', 'baoduong'),
('baoduong.lap', 'Lập phiếu bảo dưỡng', 'Lập phiếu bảo dưỡng', 'baoduong'),
('baoduong.duyet', 'Duyệt bảo dưỡng', 'Duyệt phiếu bảo dưỡng', 'baoduong'),

('kiemdinh.xem', 'Xem kiểm định', 'Xem lịch kiểm định', 'kiemdinh'),
('kiemdinh.lap', 'Lập phiếu kiểm định', 'Lập phiếu kiểm định', 'kiemdinh'),
('kiemdinh.duyet', 'Duyệt kiểm định', 'Duyệt phiếu kiểm định', 'kiemdinh'),

-- Sự cố
('suco.xem', 'Xem sự cố', 'Xem danh sách sự cố', 'suco'),
('suco.lap', 'Ghi nhận sự cố', 'Ghi nhận sự cố mới', 'suco'),
('suco.sua', 'Cập nhật sự cố', 'Cập nhật trạng thái, chi phí sửa', 'suco'),

-- Báo cáo
('baocao.xem', 'Xem báo cáo', 'Xem các báo cáo thống kê', 'baocao'),
('baocao.xuat_excel', 'Xuất báo cáo Excel', 'Xuất báo cáo sang Excel', 'baocao'),
('baocao.xuat_pdf', 'Xuất báo cáo PDF', 'Xuất báo cáo sang PDF', 'baocao'),

-- Quản trị hệ thống
('quantri.taikhoan', 'Quản lý tài khoản', 'Thêm/sửa/khóa/reset tài khoản', 'quantri'),
('quantri.vai_tro', 'Quản lý vai trò', 'Tạo/sửa/xóa vai trò', 'quantri'),
('quantri.phanquyen', 'Phân quyền', 'Gán quyền cho vai trò hoặc tài khoản', 'quantri'),
('quantri.donvi', 'Quản lý đơn vị', 'Thêm/sửa/khóa đơn vị', 'quantri'),
('quantri.filemau', 'Quản lý file mẫu', 'Upload/khóa/xóa file mẫu', 'quantri'),
('quantri.danhmuc', 'Quản lý danh mục', 'Quản lý nhóm thiết bị, model, loại kiểm định', 'quantri'),
('quantri.nhatky', 'Xem nhật ký audit', 'Xem lịch sử đăng nhập, thao tác, phân quyền', 'quantri'),
('quantri.phien', 'Quản lý phiên đăng nhập', 'Xem danh sách phiên, cắt phiên', 'quantri'),
('quantri.daimang', 'Quản lý dải mạng', 'Cấu hình dải mạng cho phép truy cập', 'quantri'),
('quantri.saoluu', 'Sao lưu dữ liệu', 'Tạo và quản lý bản sao lưu', 'quantri');

-- =====================================================================
-- B. BẢNG VAI TRÒ ĐỘNG (Thay thế 4 vai trò cứng trong nguoi_dung)
-- =====================================================================

CREATE TABLE IF NOT EXISTS vai_tro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,      -- 'admin', 'cd_cty', 'px', 'xem'
    ten             TEXT NOT NULL,             -- 'Quản trị viên', 'Phòng Cơ điện', ...
    mo_ta           TEXT,
    mac_dinh        INTEGER DEFAULT 0,         -- 1 = vai trò tích hợp, không xóa được
    hoat_dong       INTEGER DEFAULT 1,
    ngay_tao        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vai_tro_ma ON vai_tro(ma);

-- Danh sách vai trò tích hợp mặc định
INSERT OR IGNORE INTO vai_tro (ma, ten, mo_ta, mac_dinh) VALUES
('admin', 'Quản trị viên hệ thống', 'Toàn quyền, quản lý danh mục và tài khoản', 1),
('cd_cty', 'Phòng Cơ điện công ty', 'Xem toàn công ty, duyệt phiếu', 1),
('px', 'Cơ điện phân xưởng', 'Nhập liệu dữ liệu phân xưởng, lập phiếu', 1),
('xem', 'Chỉ xem', 'Quyền chỉ đọc', 1);

-- =====================================================================
-- C. BẢNG GÁN QUYỀN CHO VAI TRÒ (vai_tro_quyen)
-- =====================================================================

CREATE TABLE IF NOT EXISTS vai_tro_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vai_tro_id      INTEGER NOT NULL REFERENCES vai_tro(id) ON DELETE CASCADE,
    ma_quyen        TEXT NOT NULL,             -- Tham chiếu đến ma_quyen.ma
    donvi_id        INTEGER,                   -- NULL = áp dụng toàn công ty, khác NULL = chỉ áp dụng cho đơn vị này
    UNIQUE(vai_tro_id, ma_quyen, donvi_id),
    FOREIGN KEY (donvi_id) REFERENCES phan_xuong(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vai_tro_quyen_vt ON vai_tro_quyen(vai_tro_id);
CREATE INDEX IF NOT EXISTS idx_vai_tro_quyen_donvi ON vai_tro_quyen(donvi_id);

-- Gán quyền mặc định cho vai trò tích hợp

-- Admin: toàn quyền
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ma='admin'), ma, NULL FROM ma_quyen WHERE hoat_dong=1;

-- cd_cty: Xem, duyệt
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ma='cd_cty'), ma, NULL FROM ma_quyen
WHERE ma IN ('thietbi.xem', 'kiemke.xem', 'kiemke.duyet', 'doichieu.xem', 'doichieu.duyet',
             'giaodich.xem', 'giaodich.duyet', 'ncvt.xem', 'ncvt.duyet', 'kho.xem', 'kho.duyet',
             'bieumau.xem', 'kythuat.xem', 'baoduong.xem', 'baoduong.duyet',
             'kiemdinh.xem', 'kiemdinh.duyet', 'suco.xem', 'baocao.xem', 'baocao.xuat_excel')
AND hoat_dong=1;

-- px: Lập phiếu, xem trong phạm vi phân xưởng (sẽ lọc ở tầng middleware)
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ma='px'), ma, NULL FROM ma_quyen
WHERE ma IN ('thietbi.xem', 'thietbi.them', 'thietbi.sua',
             'kiemke.xem', 'kiemke.lap',
             'doichieu.xem', 'doichieu.lap',
             'giaodich.xem', 'giaodich.lap',
             'ncvt.xem', 'ncvt.lap',
             'kho.xem', 'kho.nhap', 'kho.xuat', 'kho.dieu_chuyen',
             'bieumau.xem', 'bieumau.tao',
             'kythuat.xem', 'kythuat.sua',
             'baoduong.xem', 'baoduong.lap',
             'kiemdinh.xem', 'kiemdinh.lap',
             'suco.xem', 'suco.lap', 'suco.sua',
             'baocao.xem', 'baocao.xuat_excel')
AND hoat_dong=1;

-- xem: Chỉ xem
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT (SELECT id FROM vai_tro WHERE ma='xem'), ma, NULL FROM ma_quyen
WHERE ma LIKE '%.xem'
AND hoat_dong=1;

-- =====================================================================
-- D. BẢNG GÁN VAI TRÒ CHO TÀI KHOẢN (1 tài khoản có thể có nhiều vai trò)
-- =====================================================================

CREATE TABLE IF NOT EXISTS nguoi_dung_vai_tro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung_id   INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    vai_tro_id      INTEGER NOT NULL REFERENCES vai_tro(id) ON DELETE CASCADE,
    UNIQUE(nguoi_dung_id, vai_tro_id)
);

CREATE INDEX IF NOT EXISTS idx_nd_vt_nd ON nguoi_dung_vai_tro(nguoi_dung_id);
CREATE INDEX IF NOT EXISTS idx_nd_vt_vt ON nguoi_dung_vai_tro(vai_tro_id);

-- Gán vai trò admin cho tài khoản admin hiện có (nếu tồn tại)
INSERT OR IGNORE INTO nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id)
SELECT id, (SELECT id FROM vai_tro WHERE ma='admin') FROM nguoi_dung WHERE vai_tro='admin';

-- =====================================================================
-- E. NHẬT KÝ AUDIT PHÂN QUYỀN
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung_id   INTEGER REFERENCES nguoi_dung(id),
    hanh_dong       TEXT NOT NULL,             -- 'them_vai_tro', 'ghi_quyen', 'xoa_vai_tro'
    chi_tiet_cu     TEXT,                      -- JSON: {vai_tro, quyen, donvi}
    chi_tiet_moi    TEXT,                      -- JSON: {vai_tro, quyen, donvi}
    dia_chi_ip      TEXT,
    user_agent      TEXT,
    ngay_gio        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_audit_quyen_user ON audit_quyen(nguoi_dung_id);
CREATE INDEX IF NOT EXISTS idx_audit_quyen_ngay ON audit_quyen(ngay_gio);

-- =====================================================================
-- F. CẬP NHẬT BẢNG nguoi_dung: THÊM TRƯỜNG (NẾU CHƯA CÓ)
-- =====================================================================

-- SQLite < 3.35 không hỗ trợ IF NOT EXISTS cho ALTER TABLE ADD COLUMN.
-- Chạy lại migration sẽ báo "duplicate column name" → bỏ qua ở init.js
-- Không thêm cột nếu chạy lại, schema không đổi.

-- =====================================================================
-- GIAI ĐOẠN CHUYỂN ĐỔI: GỬI LỚP QUYỀN CỠ CŨ VÀO BẢNG MỚI
-- =====================================================================
-- Khi chạy migration này trên database cũ, hệ thống vẫn dùng cột vai_tro
-- Ở tầng middleware, sẽ dùng `nguoi_dung_vai_tro` để kiểm tra quyền,
-- nếu không có sẽ fallback sang vai_tro cũ (tạo bản ghi tạm thời).

-- Sau quá trình chuyển đổi, có thể xóa cột vai_tro (nếu cần).
-- Tạm thời giữ lại để không phá lệch logic cũ.
