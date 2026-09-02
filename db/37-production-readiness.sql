-- TASK 25: production observability and read-path indexes.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS operational_error_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    method TEXT NOT NULL,
    route TEXT NOT NULL,
    http_status INTEGER NOT NULL CHECK(http_status BETWEEN 500 AND 599),
    error_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_sha256 TEXT NOT NULL CHECK(length(stack_sha256)=64),
    actor_id INTEGER REFERENCES nguoi_dung(id) ON DELETE SET NULL,
    ip_address TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','RESOLVED')),
    occurred_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    resolved_by INTEGER REFERENCES nguoi_dung(id) ON DELETE SET NULL,
    resolved_at TEXT,
    resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_operational_errors_queue
    ON operational_error_events(status,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_errors_fingerprint
    ON operational_error_events(stack_sha256,occurred_at DESC);

-- Indexes backed by TASK 25 EXPLAIN QUERY PLAN checks.
CREATE INDEX IF NOT EXISTS idx_asset_lines_source_tx
    ON asset_transaction_lines(don_vi_nguon_id,transaction_id);
CREATE INDEX IF NOT EXISTS idx_asset_lines_destination_tx
    ON asset_transaction_lines(don_vi_dich_id,transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_lines_transaction
    ON stock_transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_transaction
    ON stock_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_status_created
    ON stock_transactions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status_created
    ON documents(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_exports_status_started
    ON report_export_runs(status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_started
    ON notification_job_runs(status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active_role
    ON nguoi_dung(hoat_dong,vai_tro);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('operations.view','Xem tình trạng vận hành','Xem metrics, readiness và lỗi hệ thống','operations'),
('operations.manage','Xử lý lỗi vận hành','Đánh dấu lỗi đã xử lý và ghi chú','operations');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='admin' AND q.hang_muc='operations';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='cd_cty' AND q.ma='operations.view';
