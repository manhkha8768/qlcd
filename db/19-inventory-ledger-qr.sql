-- TASK 6: canonical inventory snapshot, QR observations and reviewed adjustments.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_qr_codes (
    asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    qr_value TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO asset_qr_codes(asset_id,qr_value)
SELECT id,'QLCD:ASSET:'||ma_tai_san FROM assets;

CREATE TABLE IF NOT EXISTS inventory_sessions (
    id TEXT PRIMARY KEY,
    ma_dot TEXT NOT NULL UNIQUE,
    ten TEXT NOT NULL,
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    trang_thai TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (trang_thai IN ('OPEN','SUBMITTED','APPROVED','POSTED','REJECTED','CANCELLED')),
    snapshot_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    adjustment_transaction_id TEXT UNIQUE REFERENCES asset_transactions(id),
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_duyet_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_duyet TEXT,
    ghi_chu TEXT
);

CREATE TABLE IF NOT EXISTS inventory_snapshot_lines (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_id INTEGER,
    so_luong_so REAL NOT NULL CHECK (so_luong_so >= 0),
    dvt TEXT NOT NULL,
    last_entry_id TEXT REFERENCES asset_ledger_entries(id),
    UNIQUE(session_id,asset_id,don_vi_id,vi_tri_id)
);

CREATE TABLE IF NOT EXISTS inventory_sync_batches (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    client_batch_id TEXT NOT NULL,
    device_ref TEXT,
    nguoi_gui_id INTEGER REFERENCES nguoi_dung(id),
    payload_hash TEXT NOT NULL,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(session_id,client_batch_id)
);

CREATE TABLE IF NOT EXISTS inventory_observations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    qr_value TEXT NOT NULL,
    so_luong_thuc_te REAL NOT NULL CHECK (so_luong_thuc_te >= 0),
    don_vi_thuc_te_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_thuc_te_id INTEGER,
    tinh_trang TEXT CHECK (tinh_trang IN ('tot','trung_binh','kem','hong','khong_tim_thay')),
    ghi_chu TEXT,
    client_updated_at TEXT,
    nguoi_kiem_ke_id INTEGER REFERENCES nguoi_dung(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(session_id,asset_id)
);

CREATE TABLE IF NOT EXISTS inventory_discrepancies (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    loai TEXT NOT NULL CHECK (loai IN ('MISSING','EXCESS','QUANTITY','LOCATION','CONDITION')),
    so_luong_so REAL NOT NULL,
    so_luong_thuc_te REAL NOT NULL,
    don_vi_so_id INTEGER REFERENCES phan_xuong(id),
    don_vi_thuc_te_id INTEGER REFERENCES phan_xuong(id),
    vi_tri_so_id INTEGER,
    vi_tri_thuc_te_id INTEGER,
    review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','APPROVED','REJECTED')),
    review_reason TEXT,
    reviewer_id INTEGER REFERENCES nguoi_dung(id),
    reviewed_at TEXT,
    UNIQUE(session_id,asset_id,loai)
);

CREATE TABLE IF NOT EXISTS inventory_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    hanh_dong TEXT NOT NULL,
    nguoi_id INTEGER REFERENCES nguoi_dung(id),
    chi_tiet TEXT,
    thoi_gian TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TRIGGER IF NOT EXISTS trg_inventory_snapshot_no_update
BEFORE UPDATE ON inventory_snapshot_lines BEGIN SELECT RAISE(ABORT,'Inventory snapshot is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_inventory_snapshot_no_delete
BEFORE DELETE ON inventory_snapshot_lines BEGIN SELECT RAISE(ABORT,'Inventory snapshot is immutable'); END;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('inventory.view','Xem kiểm kê ledger','Xem kỳ và snapshot kiểm kê','inventory'),
('inventory.create','Mở kỳ kiểm kê ledger','Tạo snapshot từ Asset Ledger','inventory'),
('inventory.scan','Quét QR kiểm kê','Gửi quan sát online/offline','inventory'),
('inventory.submit','Trình kết quả kiểm kê','Khóa draft và tạo sai lệch','inventory'),
('inventory.review','Review sai lệch kiểm kê','Duyệt/từ chối từng sai lệch','inventory'),
('inventory.approve','Phê duyệt kiểm kê','Tạo adjustment và post ledger','inventory');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='admin' AND q.hang_muc='inventory';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='cd_cty' AND q.hang_muc='inventory';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='px' AND q.ma IN ('inventory.view','inventory.scan','inventory.submit');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='xem' AND q.ma='inventory.view';
