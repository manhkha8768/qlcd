-- Google Sheets exchange with mandatory review before Asset Master changes.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sheet_sync_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK(direction IN ('EXPORT','IMPORT')),
    spreadsheet_id TEXT NOT NULL,
    spreadsheet_url TEXT,
    sheet_name TEXT NOT NULL DEFAULT 'Asset Master',
    status TEXT NOT NULL CHECK(status IN ('EXPORTED','PENDING_REVIEW','APPROVED','REJECTED','FAILED')),
    row_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,
    error_message TEXT,
    created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),
    reviewed_by INTEGER REFERENCES nguoi_dung(id),
    review_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS sheet_sync_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES sheet_sync_batches(id) ON DELETE CASCADE,
    sheet_row INTEGER NOT NULL,
    asset_id INTEGER REFERENCES assets(id),
    asset_version INTEGER,
    asset_code TEXT,
    action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','UNCHANGED','ERROR')),
    source_json TEXT NOT NULL,
    before_json TEXT,
    changes_json TEXT,
    validation_errors TEXT,
    applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sheet_sync_batches_status ON sheet_sync_batches(status,created_at);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_rows_batch ON sheet_sync_rows(batch_id,action);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('asset.sheet.export','Xuất tài sản ra Google Sheets','Xuất Asset Master trong phạm vi dữ liệu được phép','asset'),
('asset.sheet.import','Nhập dữ liệu từ Google Sheets','Đọc Google Sheet thành lô chờ kiểm duyệt','asset'),
('asset.sheet.approve','Kiểm duyệt đồng bộ Google Sheets','Phê duyệt hoặc từ chối lô thay đổi trước khi ghi Asset Master','asset');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma LIKE 'asset.sheet.%';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='cd_cty' AND q.ma IN ('asset.sheet.export','asset.sheet.import','asset.sheet.approve');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='px' AND q.ma IN ('asset.sheet.export','asset.sheet.import');
