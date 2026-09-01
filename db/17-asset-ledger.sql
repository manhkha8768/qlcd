-- TASK 4: append-only Asset Transaction Ledger and rebuildable projection.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_transactions (
    id TEXT PRIMARY KEY,
    ma_giao_dich TEXT NOT NULL UNIQUE,
    loai TEXT NOT NULL CHECK (loai IN ('OPENING','RECEIPT','TRANSFER','RETURN','DISPOSAL','ADJUSTMENT','REVERSAL')),
    trang_thai TEXT NOT NULL DEFAULT 'DRAFT' CHECK (trang_thai IN ('DRAFT','POSTED','REVERSED','CANCELLED')),
    idempotency_key TEXT NOT NULL UNIQUE,
    ngay_hieu_luc TEXT NOT NULL,
    ly_do TEXT,
    so_chung_tu TEXT,
    source_system TEXT NOT NULL DEFAULT 'qlcd',
    source_id TEXT,
    reversal_of_transaction_id TEXT REFERENCES asset_transactions(id),
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_post_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_post TEXT
);

CREATE TABLE IF NOT EXISTS asset_transaction_lines (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES asset_transactions(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    device_id INTEGER REFERENCES devices(id),
    so_luong REAL NOT NULL CHECK (so_luong > 0),
    dvt TEXT NOT NULL,
    don_vi_nguon_id INTEGER REFERENCES phan_xuong(id),
    vi_tri_nguon_id INTEGER REFERENCES vi_tri(id),
    don_vi_dich_id INTEGER REFERENCES phan_xuong(id),
    vi_tri_dich_id INTEGER REFERENCES vi_tri(id),
    ghi_chu TEXT
);

CREATE TABLE IF NOT EXISTS asset_ledger_entries (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES asset_transactions(id) ON DELETE RESTRICT,
    line_id TEXT REFERENCES asset_transaction_lines(id) ON DELETE RESTRICT,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    device_id INTEGER REFERENCES devices(id),
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_id INTEGER REFERENCES vi_tri(id),
    so_luong_thay_doi REAL NOT NULL CHECK (so_luong_thay_doi <> 0),
    dvt TEXT NOT NULL,
    loai_entry TEXT NOT NULL CHECK (loai_entry IN ('OPENING','IN','OUT','ADJUSTMENT','REVERSAL')),
    event_time TEXT NOT NULL,
    posted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    posted_by INTEGER REFERENCES nguoi_dung(id),
    reversal_of_entry_id TEXT UNIQUE REFERENCES asset_ledger_entries(id),
    source_document TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_tx_status ON asset_transactions(trang_thai,ngay_hieu_luc);
CREATE INDEX IF NOT EXISTS idx_asset_ledger_asset ON asset_ledger_entries(asset_id,event_time);
CREATE INDEX IF NOT EXISTS idx_asset_ledger_unit ON asset_ledger_entries(don_vi_id,event_time);

CREATE TABLE IF NOT EXISTS asset_balance_projection (
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_key INTEGER NOT NULL DEFAULT 0,
    so_luong REAL NOT NULL DEFAULT 0,
    dvt TEXT NOT NULL,
    last_entry_id TEXT REFERENCES asset_ledger_entries(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (asset_id,don_vi_id,vi_tri_key)
);

CREATE TRIGGER IF NOT EXISTS trg_asset_ledger_no_update
BEFORE UPDATE ON asset_ledger_entries BEGIN
    SELECT RAISE(ABORT,'POSTED ledger entries are immutable');
END;
CREATE TRIGGER IF NOT EXISTS trg_asset_ledger_no_delete
BEFORE DELETE ON asset_ledger_entries BEGIN
    SELECT RAISE(ABORT,'POSTED ledger entries are immutable');
END;

INSERT OR IGNORE INTO asset_transactions
(id,ma_giao_dich,loai,trang_thai,idempotency_key,ngay_hieu_luc,ly_do,source_system,source_id,ngay_post)
VALUES ('migration-17-opening','OPENING-MIGRATION-17','OPENING','POSTED','migration:17:opening',
        date('now','localtime'),'Opening balance từ Asset Master','migration','assets',datetime('now','localtime'));

INSERT OR IGNORE INTO asset_ledger_entries
(id,transaction_id,asset_id,don_vi_id,vi_tri_id,so_luong_thay_doi,dvt,loai_entry,event_time,source_document)
SELECT 'opening-'||a.id,'migration-17-opening',a.id,a.don_vi_id,a.vi_tri_id,a.so_luong,a.dvt,'OPENING',
       COALESCE(a.ngay_dua_vao_su_dung,date('now','localtime')),'migration:assets:'||a.id
FROM assets a WHERE a.so_luong > 0 AND a.hoat_dong=1;

INSERT OR REPLACE INTO asset_balance_projection(asset_id,don_vi_id,vi_tri_key,so_luong,dvt,last_entry_id,updated_at)
SELECT asset_id,don_vi_id,COALESCE(vi_tri_id,0),SUM(so_luong_thay_doi),dvt,MAX(id),datetime('now','localtime')
FROM asset_ledger_entries GROUP BY asset_id,don_vi_id,COALESCE(vi_tri_id,0),dvt;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('asset_ledger.view','Xem sổ tài sản','Xem transaction, ledger và projection','asset_ledger'),
('asset_ledger.create','Lập giao dịch tài sản','Tạo transaction nháp','asset_ledger'),
('asset_ledger.post','Ghi sổ tài sản','Post transaction vào ledger','asset_ledger'),
('asset_ledger.reverse','Đảo giao dịch tài sản','Tạo reversal cho transaction đã post','asset_ledger'),
('asset_ledger.reconcile','Đối chiếu sổ tài sản','Rebuild và đối chiếu projection','asset_ledger');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='admin' AND q.hang_muc='asset_ledger';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='cd_cty' AND q.ma IN ('asset_ledger.view','asset_ledger.create','asset_ledger.post','asset_ledger.reverse','asset_ledger.reconcile');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN ('asset_ledger.view','asset_ledger.create');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='asset_ledger.view';
