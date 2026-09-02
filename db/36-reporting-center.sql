-- TASK 23: canonical report catalog, export audit and read-path indexes.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS report_definitions (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN('ASSET','WAREHOUSE','NCVT','TECHNICAL','CONTROL')),
    description TEXT NOT NULL,
    default_page_size INTEGER NOT NULL DEFAULT 25 CHECK(default_page_size BETWEEN 1 AND 100),
    max_export_rows INTEGER NOT NULL DEFAULT 10000 CHECK(max_export_rows BETWEEN 1 AND 50000),
    orientation TEXT NOT NULL DEFAULT 'LANDSCAPE' CHECK(orientation IN('PORTRAIT','LANDSCAPE')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
INSERT OR IGNORE INTO report_definitions(code,title,category,description,orientation) VALUES
('ASSET_REGISTER','Sổ đăng ký tài sản','ASSET','TSCĐ/CCDC canonical theo đơn vị và trạng thái','LANDSCAPE'),
('DEVICE_REGISTER','Danh sách thiết bị kỹ thuật','ASSET','Device Master canonical và tình trạng kỹ thuật','LANDSCAPE'),
('ASSET_LEDGER','Sổ biến động tài sản','ASSET','Asset Ledger append-only theo thời gian và đơn vị','LANDSCAPE'),
('STOCK_BALANCE','Tồn kho vật tư','WAREHOUSE','ON_HAND/RESERVED/AVAILABLE/INCOMING theo Material ID/UOM','LANDSCAPE'),
('NCVT_FULFILLMENT','Tiến độ thực hiện NCVT','NCVT','Approved/reserved/issued/received/discrepancy theo PX và UOM','LANDSCAPE'),
('TECHNICAL_OPERATIONS','Sửa chữa, bảo dưỡng, kiểm định','TECHNICAL','Work order canonical theo Device và lifecycle','LANDSCAPE'),
('DATA_QUALITY','Chất lượng dữ liệu','CONTROL','Case chất lượng dữ liệu, owner, mức độ và trạng thái xử lý','LANDSCAPE');

CREATE TABLE IF NOT EXISTS report_export_runs (
    id TEXT PRIMARY KEY,
    report_code TEXT NOT NULL REFERENCES report_definitions(code) ON DELETE RESTRICT,
    format TEXT NOT NULL CHECK(format IN('XLSX','PDF','PRINT')),
    status TEXT NOT NULL CHECK(status IN('RUNNING','SUCCEEDED','FAILED')),
    filters_json TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
    duration_ms INTEGER,
    content_sha256 TEXT,
    error_message TEXT,
    requested_by INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE RESTRICT,
    started_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    finished_at TEXT,
    CHECK(content_sha256 IS NULL OR length(content_sha256)=64)
);
CREATE INDEX IF NOT EXISTS idx_report_export_runs_user
    ON report_export_runs(requested_by,started_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_report_export_runs_no_delete
BEFORE DELETE ON report_export_runs BEGIN SELECT RAISE(ABORT,'Report export audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_report_export_runs_terminal_no_update
BEFORE UPDATE ON report_export_runs WHEN OLD.status<>'RUNNING'
BEGIN SELECT RAISE(ABORT,'Completed report export audit is immutable'); END;

-- Read paths used by pagination and bounded exports.
CREATE INDEX IF NOT EXISTS idx_assets_report ON assets(don_vi_id,trang_thai,ma_tai_san);
CREATE INDEX IF NOT EXISTS idx_devices_report ON devices(don_vi_id,trang_thai,ma_thiet_bi);
CREATE INDEX IF NOT EXISTS idx_asset_ledger_report ON asset_ledger_entries(don_vi_id,event_time,loai_entry);
CREATE INDEX IF NOT EXISTS idx_stock_balance_report ON stock_balance_projection(warehouse_id,material_id,uom_code);
CREATE INDEX IF NOT EXISTS idx_ncvt_submission_report ON ncvt_submissions(period_id,don_vi_id,status);
CREATE INDEX IF NOT EXISTS idx_technical_work_order_report ON technical_work_orders(status,operation_type,created_at);
CREATE INDEX IF NOT EXISTS idx_notification_case_report ON notification_cases(category,status,don_vi_id,severity);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('report.view','Xem Report Center','Xem báo cáo canonical theo data scope','report'),
('report.export.excel','Xuất Excel','Xuất báo cáo canonical có audit','report'),
('report.export.pdf','Xuất PDF','Xuất báo cáo canonical có audit','report'),
('report.print','In báo cáo','Mở bản in HTML canonical có audit','report'),
('report.audit','Xem lịch sử xuất','Xem export audit trong phạm vi quản trị','report');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma IN('admin','cd_cty') AND q.hang_muc='report';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN('report.view','report.export.excel','report.export.pdf','report.print');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='report.view';
