-- TASK 5: two-party transfer handover workflow, timeline and documents.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_transfer_workflows (
    transaction_id TEXT PRIMARY KEY REFERENCES asset_transactions(id) ON DELETE CASCADE,
    trang_thai TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (trang_thai IN ('DRAFT','SUBMITTED','SENDER_CONFIRMED','RECEIVER_CONFIRMED','APPROVED','POSTED','REJECTED','CANCELLED')),
    sender_user_id INTEGER REFERENCES nguoi_dung(id),
    sender_confirmed_at TEXT,
    receiver_user_id INTEGER REFERENCES nguoi_dung(id),
    receiver_confirmed_at TEXT,
    approver_user_id INTEGER REFERENCES nguoi_dung(id),
    approved_at TEXT,
    rejection_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS asset_transfer_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL REFERENCES asset_transactions(id) ON DELETE CASCADE,
    hanh_dong TEXT NOT NULL,
    trang_thai_cu TEXT,
    trang_thai_moi TEXT NOT NULL,
    nguoi_thuc_hien_id INTEGER REFERENCES nguoi_dung(id),
    ly_do TEXT,
    dia_chi_ip TEXT,
    thoi_gian TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_transfer_timeline ON asset_transfer_timeline(transaction_id,thoi_gian,id);

CREATE TABLE IF NOT EXISTS asset_transfer_documents (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES asset_transactions(id) ON DELETE CASCADE,
    loai_chung_tu TEXT NOT NULL DEFAULT 'khac'
        CHECK (loai_chung_tu IN ('bien_ban_giao_nhan','quyet_dinh_dieu_chuyen','anh_hien_trang','khac')),
    ten_file TEXT NOT NULL,
    duong_dan TEXT NOT NULL,
    mime_type TEXT,
    kich_thuoc INTEGER NOT NULL DEFAULT 0,
    nguoi_tai_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tai TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ghi_chu TEXT
);
CREATE INDEX IF NOT EXISTS idx_transfer_docs ON asset_transfer_documents(transaction_id,ngay_tai);

INSERT OR IGNORE INTO asset_transfer_workflows(transaction_id,trang_thai)
SELECT id,CASE trang_thai WHEN 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END
FROM asset_transactions WHERE loai IN ('TRANSFER','RETURN');

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('asset_transfer.submit','Trình điều chuyển','Trình giao dịch điều chuyển','asset_transfer'),
('asset_transfer.sender_confirm','Bên giao xác nhận','Xác nhận bàn giao tài sản','asset_transfer'),
('asset_transfer.receiver_confirm','Bên nhận xác nhận','Xác nhận tiếp nhận tài sản','asset_transfer'),
('asset_transfer.approve','Duyệt điều chuyển','Duyệt và post điều chuyển','asset_transfer'),
('asset_transfer.document','Quản lý chứng từ điều chuyển','Tải chứng từ giao nhận','asset_transfer');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='admin' AND q.hang_muc='asset_transfer';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='cd_cty' AND q.hang_muc='asset_transfer';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN ('asset_transfer.submit','asset_transfer.sender_confirm','asset_transfer.receiver_confirm','asset_transfer.document');
