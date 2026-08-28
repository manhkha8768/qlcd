/**
 * Migration 12: Đối chiếu TSCĐ/CCDC/Kiểm kê (v20)
 *
 * So sánh dữ liệu từ nhiều nguồn:
 * - QLCD (dữ liệu quản lý)
 * - TSCĐ (tài sản cố định – kế toán)
 * - CCDC (công cụ dụng cụ – kế toán)
 * - Kết quả kiểm kê (thực tế)
 *
 * Phân loại sai lệch rồi tạo giao dịch điều chỉnh
 */

-- Phiên bản đối chiếu
CREATE TABLE IF NOT EXISTS dot_doi_chieu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma TEXT UNIQUE NOT NULL,
    ten TEXT NOT NULL,
    dot_kiem_ke_id INTEGER REFERENCES dot_kiem_ke(id),
    trang_thai TEXT DEFAULT 'dang_tao',
    mo_ta TEXT,
    ngay_upload_tscd TEXT,
    ngay_upload_ccdc TEXT,
    nguoi_tao_id INTEGER,
    ngay_tao TEXT DEFAULT CURRENT_TIMESTAMP,
    ngay_sua TEXT,
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_doi_chieu_trang_thai ON dot_doi_chieu(trang_thai);
CREATE INDEX idx_doi_chieu_dot_kiem_ke ON dot_doi_chieu(dot_kiem_ke_id);

-- Dữ liệu tạm upload từ TSCĐ.xlsx
CREATE TABLE IF NOT EXISTS du_lieu_tscd (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_doi_chieu_id INTEGER NOT NULL,
    ma_tscd TEXT,
    ten_tscd TEXT,
    loai_ts TEXT,
    so_seri_tscd TEXT,
    dvt_tscd TEXT,
    sl_tscd REAL,
    nguyen_gia_tscd REAL,
    gia_tri_tscd REAL,
    ngay_tao_tscd TEXT,
    nhom_tscd TEXT,
    ghi_chu_tscd TEXT,
    FOREIGN KEY (dot_doi_chieu_id) REFERENCES dot_doi_chieu(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_tscd_dot ON du_lieu_tscd(dot_doi_chieu_id);

-- Dữ liệu tạm upload từ CCDC.xlsx
CREATE TABLE IF NOT EXISTS du_lieu_ccdc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_doi_chieu_id INTEGER NOT NULL,
    ma_ccdc TEXT,
    ten_ccdc TEXT,
    chi_tieu TEXT,
    so_seri_ccdc TEXT,
    dvt_ccdc TEXT,
    sl_ccdc REAL,
    gia_tri_ccdc REAL,
    ngay_cap_ccdc TEXT,
    phong_ban_ccdc TEXT,
    ghi_chu_ccdc TEXT,
    FOREIGN KEY (dot_doi_chieu_id) REFERENCES dot_doi_chieu(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_ccdc_dot ON du_lieu_ccdc(dot_doi_chieu_id);

-- Kết quả so sánh chi tiết
CREATE TABLE IF NOT EXISTS chi_tiet_doi_chieu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_doi_chieu_id INTEGER NOT NULL,
    thiet_bi_id INTEGER,
    ma_qlcd TEXT,
    ten_qlcd TEXT,
    ma_tscd TEXT,
    ma_ccdc TEXT,

    -- Phân loại sai lệch
    phan_loai_sai_lech TEXT NOT NULL,
    -- 'khop' (khớp)
    -- 'lech_so_luong' (lệch số lượng)
    -- 'lech_don_vi' (lệch đơn vị tính)
    -- 'lech_ten' (lệch tên)
    -- 'lech_ma' (lệch mã)
    -- 'lech_gia_tri' (lệch giá trị)
    -- 'chi_qlcd' (chỉ có ở QLCD - mới thêm)
    -- 'chi_tscd' (chỉ có ở TSCĐ - mất ở QLCD)
    -- 'chi_ccdc' (chỉ có ở CCDC - bị cấp không ghi)
    -- 'chi_thuc_te' (chỉ có ở kiểm kê - không ghi gì)

    -- Dữ liệu từ các nguồn
    sl_qlcd REAL,
    sl_tscd REAL,
    sl_ccdc REAL,
    sl_thuc_te REAL,

    dvt_qlcd TEXT,
    dvt_tscd TEXT,
    dvt_ccdc TEXT,

    gia_tri_qlcd REAL,
    gia_tri_tscd REAL,
    gia_tri_ccdc REAL,

    so_seri_qlcd TEXT,
    so_seri_tscd TEXT,
    so_seri_ccdc TEXT,

    -- Xác nhận & hành động
    da_xac_nhan INTEGER DEFAULT 0,
    nguoi_xac_nhan_id INTEGER,
    hanh_dong_du_kien TEXT,
    -- 'tao_giao_dich_dieu_chinh' (tạo giao dịch điều chỉnh)
    -- 'sao_chep_tu_tscd' (sao chép từ TSCĐ)
    -- 'bo_qua' (bỏ qua, chấp nhận sai lệch)
    -- 'kiem_tra_them' (cần kiểm tra thêm)

    ghi_chu TEXT,
    ngay_tao TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_doi_chieu_id) REFERENCES dot_doi_chieu(id) ON DELETE CASCADE,
    FOREIGN KEY (thiet_bi_id) REFERENCES thiet_bi(id),
    FOREIGN KEY (nguoi_xac_nhan_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_dt_dot ON chi_tiet_doi_chieu(dot_doi_chieu_id);
CREATE INDEX idx_dt_thiet_bi ON chi_tiet_doi_chieu(thiet_bi_id);
CREATE INDEX idx_dt_sai_lech ON chi_tiet_doi_chieu(phan_loai_sai_lech);
CREATE INDEX idx_dt_xac_nhan ON chi_tiet_doi_chieu(da_xac_nhan);

-- Lịch sử đối chiếu
CREATE TABLE IF NOT EXISTS lich_su_doi_chieu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_doi_chieu_id INTEGER,
    chi_tiet_id INTEGER,
    hanh_dong TEXT NOT NULL,
    -- 'tao_dot', 'upload_tscd', 'upload_ccdc', 'chay_so_sanh',
    -- 'xac_nhan', 'huy_xac_nhan', 'tao_giao_dich', 'hoan_thanh'

    chi_tiet_cu TEXT,
    chi_tiet_moi TEXT,
    nguoi_tao_id INTEGER,
    ip_dia_chi TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dot_doi_chieu_id) REFERENCES dot_doi_chieu(id) ON DELETE SET NULL,
    FOREIGN KEY (chi_tiet_id) REFERENCES chi_tiet_doi_chieu(id) ON DELETE SET NULL,
    FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id)
) STRICT;
CREATE INDEX idx_lich_su_dot ON lich_su_doi_chieu(dot_doi_chieu_id);
CREATE INDEX idx_lich_su_time ON lich_su_doi_chieu(created_at);

-- Thêm quyền đối chiếu vào ma_quyen
INSERT OR IGNORE INTO ma_quyen (ma, ten, hang_muc, mo_ta) VALUES
    ('doichieu.xem', 'Xem đối chiếu', 'doichieu', 'Xem danh sách & chi tiết đối chiếu'),
    ('doichieu.tao', 'Tạo đợt đối chiếu', 'doichieu', 'Tạo đợt đối chiếu mới'),
    ('doichieu.upload', 'Upload dữ liệu', 'doichieu', 'Upload file TSCĐ/CCDC'),
    ('doichieu.so_sanh', 'Chạy so sánh', 'doichieu', 'Chạy logic so sánh dữ liệu'),
    ('doichieu.xac_nhan', 'Xác nhận sai lệch', 'doichieu', 'Xác nhận và chọn hành động'),
    ('doichieu.hoan_thanh', 'Hoàn thành đối chiếu', 'doichieu', 'Duyệt và hoàn thành đợt đối chiếu'),
    ('doichieu.xem_lich_su', 'Xem lịch sử', 'doichieu', 'Xem lịch sử thay đổi đối chiếu');

-- Phân quyền admin
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'admin' AND q.ma LIKE 'doichieu.%';

-- Phân quyền quản lý nhân sự
INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
SELECT v.id, q.ma, NULL
FROM vai_tro v, ma_quyen q
WHERE v.ma = 'quanlynnhan' AND q.ma LIKE 'doichieu.%';
