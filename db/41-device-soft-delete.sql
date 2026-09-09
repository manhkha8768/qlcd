-- Xóa mềm cho bảng thiết bị nghiệp vụ cũ đang được màn hình #thiet-bi sử dụng.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS thiet_bi_deletions (
    thiet_bi_id INTEGER PRIMARY KEY REFERENCES thiet_bi(id) ON DELETE RESTRICT,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_by INTEGER NOT NULL REFERENCES nguoi_dung(id),
    delete_reason TEXT NOT NULL CHECK(length(trim(delete_reason)) >= 5),
    before_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thiet_bi_deletions_time ON thiet_bi_deletions(deleted_at);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('thietbi.xoa','Xóa mềm thiết bị','Ẩn thiết bị nhập sai nhưng giữ nguyên lịch sử nghiệp vụ','thietbi'),
('thietbi.khoi_phuc','Khôi phục thiết bị','Khôi phục thiết bị đã xóa mềm','thietbi');

-- Không cấp mặc định cho tài khoản Phân xưởng.
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma IN ('thietbi.xoa','thietbi.khoi_phuc');
