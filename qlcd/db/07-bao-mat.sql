-- =====================================================================
-- BẢO MẬT CHO TRIỂN KHAI RA INTERNET
--
-- Hệ thống ban đầu thiết kế cho mạng nội bộ. Khi đưa ra internet,
-- ai cũng có thể gõ địa chỉ và thử mật khẩu, nên cần thêm ba lớp:
--   1. Phiên đăng nhập lưu vào database (không mất khi khởi động lại,
--      và đăng xuất được từ xa khi mất máy)
--   2. Chặn dò mật khẩu
--   3. Bắt đổi mật khẩu mặc định
-- =====================================================================

/* ---------------------------------------------------------------
   1. PHIÊN ĐĂNG NHẬP
   Mặc định express-session giữ phiên trong bộ nhớ: khởi động lại là
   mọi người bị đăng xuất, và bộ nhớ phình dần theo số lượt đăng nhập.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS phien_dang_nhap (
    sid             TEXT PRIMARY KEY,
    du_lieu         TEXT NOT NULL,
    nguoi_dung_id   INTEGER REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    dia_chi_ip      TEXT,
    trinh_duyet     TEXT,
    het_han         INTEGER NOT NULL,
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_phien_hethan ON phien_dang_nhap(het_han);
CREATE INDEX IF NOT EXISTS idx_phien_nguoi ON phien_dang_nhap(nguoi_dung_id);

/* ---------------------------------------------------------------
   2. CHẶN DÒ MẬT KHẨU
   Ghi từng lần đăng nhập sai để khóa tạm tài khoản và địa chỉ IP.
   --------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS dang_nhap_that_bai (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap   TEXT,
    dia_chi_ip      TEXT,
    thoi_gian       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    trinh_duyet     TEXT
);
CREATE INDEX IF NOT EXISTS idx_dntb_ten ON dang_nhap_that_bai(ten_dang_nhap, thoi_gian);
CREATE INDEX IF NOT EXISTS idx_dntb_ip ON dang_nhap_that_bai(dia_chi_ip, thoi_gian);

/* ---------------------------------------------------------------
   3. BẮT ĐỔI MẬT KHẨU MẶC ĐỊNH
   --------------------------------------------------------------- */
ALTER TABLE nguoi_dung ADD COLUMN phai_doi_mat_khau INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nguoi_dung ADD COLUMN ngay_doi_mat_khau TEXT;
ALTER TABLE nguoi_dung ADD COLUMN lan_dang_nhap_ip TEXT;

-- Tài khoản admin đang dùng mật khẩu khởi tạo thì buộc đổi ở lần đăng nhập sau
UPDATE nguoi_dung SET phai_doi_mat_khau = 1
WHERE ten_dang_nhap = 'admin' AND ngay_doi_mat_khau IS NULL;

/* ---------------------------------------------------------------
   4. CẤU HÌNH BẢO MẬT
   --------------------------------------------------------------- */
INSERT OR IGNORE INTO cau_hinh (khoa, gia_tri, mo_ta) VALUES
('bm_so_lan_sai',      '5',   'Số lần đăng nhập sai trước khi khóa tạm'),
('bm_phut_khoa',       '15',  'Thời gian khóa tạm sau khi sai quá số lần (phút)'),
('bm_phien_gio',       '8',   'Thời gian sống của phiên đăng nhập (giờ)'),
('bm_do_dai_mat_khau', '8',   'Độ dài tối thiểu mật khẩu khi chạy trên internet');
