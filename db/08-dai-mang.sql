-- =====================================================================
-- KIỂM SOÁT TRUY CẬP THEO DẢI MẠNG
--
-- Khi hệ thống mở ra internet, cả thế giới đều gõ được địa chỉ.
-- Danh sách dải mạng cho phép thu hẹp lại chỉ còn các mạng của Công ty:
-- mạng văn phòng, mạng từng phân xưởng, dải VPN, và mạng 4G của cán bộ
-- đi công trường nếu cần.
--
-- Cơ chế an toàn: danh sách rỗng nghĩa là cho phép tất cả. Địa chỉ nội
-- bộ máy chủ luôn được vào, để không bao giờ tự khóa mình ra ngoài.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dai_mang (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dai             TEXT NOT NULL UNIQUE,          -- 192.168.1.0/24 hoặc 113.161.45.7
    ten             TEXT NOT NULL,                 -- "Mạng văn phòng Công ty"
    loai            TEXT NOT NULL DEFAULT 'noi_bo'
                    CHECK (loai IN ('noi_bo','phan_xuong','vpn','di_dong','khac')),
    phan_xuong_id   INTEGER REFERENCES phan_xuong(id) ON DELETE SET NULL,
    cho_phep        INTEGER NOT NULL DEFAULT 1,    -- 0 = chặn thẳng dù trùng dải khác
    hoat_dong       INTEGER NOT NULL DEFAULT 1,
    ghi_chu         TEXT,
    nguoi_tao_id    INTEGER REFERENCES nguoi_dung(id),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    lan_truy_cap_cuoi TEXT,
    so_lan_truy_cap INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_daimang_hd ON dai_mang(hoat_dong, cho_phep);

-- Nhật ký truy cập bị chặn, để biết có ai đang gõ cửa từ mạng lạ
CREATE TABLE IF NOT EXISTS truy_cap_bi_chan (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dia_chi_ip      TEXT NOT NULL,
    duong_dan       TEXT,
    trinh_duyet     TEXT,
    thoi_gian       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tcbc_ip ON truy_cap_bi_chan(dia_chi_ip, thoi_gian);

INSERT OR IGNORE INTO cau_hinh (khoa, gia_tri, mo_ta) VALUES
('bm_loc_dai_mang', '0', 'Bật lọc truy cập theo dải mạng (1 = bật, 0 = cho phép mọi nơi)');

INSERT OR IGNORE INTO quyen (ma, ten, nhom) VALUES
('MANG_QUAN_LY', 'Quản lý dải mạng truy cập', 'Hệ thống');

INSERT OR IGNORE INTO quyen_vai_tro (vai_tro, ma_quyen) VALUES ('admin', 'MANG_QUAN_LY');
