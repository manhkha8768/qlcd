-- Cấu hình hiển thị chức năng theo vai trò. Quyền nền tảng vẫn là giới hạn tối đa.
CREATE TABLE IF NOT EXISTS function_visibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_code TEXT NOT NULL,
    screen_code TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    updated_by INTEGER REFERENCES nguoi_dung(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(role_code, screen_code)
);

CREATE INDEX IF NOT EXISTS idx_function_visibility_role
ON function_visibility(role_code, enabled);

-- Hồ sơ mặc định gọn cho tài khoản phân xưởng.
INSERT OR IGNORE INTO function_visibility(role_code, screen_code, enabled) VALUES
('px','tong-quan',1),('px','canh-bao',1),('px','notifications',1),
('px','thiet-bi',1),('px','tai-san',1),('px','qr-scan',1),('px','kiem-ke-ledger',1),
('px','nhap-lieu',1),('px','sua-chua',1),('px','kiem-dinh',1),('px','su-co',1),
('px','ho-so-ky-thuat',1),('px','ncvt-canonical',1),('px','work-inbox',1),
('px','reports',1),('px','material-master',0),('px','stock-ledger',0),
('px','phe-duyet',0),('px','quan-tri',0),('px','bao-mat',0);

