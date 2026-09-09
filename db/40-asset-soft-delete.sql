-- Recoverable removal for incorrectly imported Asset Master records.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_deletions (
    asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE RESTRICT,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_by INTEGER NOT NULL REFERENCES nguoi_dung(id),
    delete_reason TEXT NOT NULL CHECK(length(trim(delete_reason)) >= 5),
    before_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_deletions_time ON asset_deletions(deleted_at);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('asset.delete','Xóa mềm tài sản','Ẩn tài sản nhập sai nhưng giữ toàn bộ lịch sử','asset'),
('asset.restore','Khôi phục tài sản','Khôi phục tài sản đã xóa mềm','asset');

-- Không cấp mặc định cho Phân xưởng. Chỉ quản trị viên có quyền nhạy cảm này.
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma IN ('asset.delete','asset.restore');
