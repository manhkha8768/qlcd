-- TASK 18: PX receipt confirmation, discrepancy and refusal for posted NCVT issues.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS material_issue_receipts(
 id TEXT PRIMARY KEY,receipt_code TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL UNIQUE,issue_voucher_id TEXT NOT NULL REFERENCES material_issue_vouchers(id) ON DELETE RESTRICT,
 don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE RESTRICT,status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','RECEIVED','DISCREPANCY','REFUSED','CANCELLED')),
 version INTEGER NOT NULL DEFAULT 1,receiver_name TEXT,received_at TEXT,note TEXT,created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),confirmed_by INTEGER REFERENCES nguoi_dung(id),confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_issue_receipt_voucher ON material_issue_receipts(issue_voucher_id,status,created_at);
CREATE TABLE IF NOT EXISTS material_issue_receipt_lines(
 id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES material_issue_receipts(id) ON DELETE RESTRICT,issue_line_id TEXT NOT NULL REFERENCES material_issue_lines(id) ON DELETE RESTRICT,
 accepted_quantity REAL NOT NULL DEFAULT 0 CHECK(accepted_quantity>=0),damaged_quantity REAL NOT NULL DEFAULT 0 CHECK(damaged_quantity>=0),
 wrong_quantity REAL NOT NULL DEFAULT 0 CHECK(wrong_quantity>=0),refused_quantity REAL NOT NULL DEFAULT 0 CHECK(refused_quantity>=0),note TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(receipt_id,issue_line_id),
 CHECK(accepted_quantity+damaged_quantity+wrong_quantity+refused_quantity>0)
);
CREATE INDEX IF NOT EXISTS idx_issue_receipt_line_issue ON material_issue_receipt_lines(issue_line_id);
CREATE TABLE IF NOT EXISTS material_issue_receipt_events(
 id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES material_issue_receipts(id) ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN('CREATE','LINE_ADD','CONFIRM','CANCEL')),
 from_status TEXT,to_status TEXT,actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),reason TEXT,payload_json TEXT,event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS trg_issue_receipt_events_no_update BEFORE UPDATE ON material_issue_receipt_events BEGIN SELECT RAISE(ABORT,'Material issue receipt event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_issue_receipt_events_no_delete BEFORE DELETE ON material_issue_receipt_events BEGIN SELECT RAISE(ABORT,'Material issue receipt event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_issue_receipt_lines_lock_update BEFORE UPDATE ON material_issue_receipt_lines WHEN (SELECT status FROM material_issue_receipts WHERE id=OLD.receipt_id)<>'DRAFT' BEGIN SELECT RAISE(ABORT,'Confirmed receipt line is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_issue_receipt_lines_lock_delete BEFORE DELETE ON material_issue_receipt_lines WHEN (SELECT status FROM material_issue_receipts WHERE id=OLD.receipt_id)<>'DRAFT' BEGIN SELECT RAISE(ABORT,'Confirmed receipt line is immutable'); END;
CREATE VIEW IF NOT EXISTS v_ncvt_receipt_progress AS
 SELECT l.id issue_line_id,l.voucher_id,l.reservation_id,v.don_vi_id,l.material_id,l.warehouse_id,l.uom_code,l.quantity issued_quantity,
 COALESCE(SUM(CASE WHEN r.status IN('RECEIVED','DISCREPANCY','REFUSED') THEN rl.accepted_quantity ELSE 0 END),0) accepted_quantity,
 COALESCE(SUM(CASE WHEN r.status IN('RECEIVED','DISCREPANCY','REFUSED') THEN rl.damaged_quantity ELSE 0 END),0) damaged_quantity,
 COALESCE(SUM(CASE WHEN r.status IN('RECEIVED','DISCREPANCY','REFUSED') THEN rl.wrong_quantity ELSE 0 END),0) wrong_quantity,
 COALESCE(SUM(CASE WHEN r.status IN('RECEIVED','DISCREPANCY','REFUSED') THEN rl.refused_quantity ELSE 0 END),0) refused_quantity,
 l.quantity-COALESCE(SUM(CASE WHEN r.status IN('RECEIVED','DISCREPANCY','REFUSED') THEN rl.accepted_quantity+rl.damaged_quantity+rl.wrong_quantity+rl.refused_quantity ELSE 0 END),0) pending_confirmation_quantity
 FROM material_issue_lines l JOIN material_issue_vouchers v ON v.id=l.voucher_id
 LEFT JOIN material_issue_receipt_lines rl ON rl.issue_line_id=l.id LEFT JOIN material_issue_receipts r ON r.id=rl.receipt_id
 WHERE v.status='POSTED' GROUP BY l.id;
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.receipt.view','Xem xác nhận nhận NCVT','Xem tiến độ nhận và discrepancy theo phiếu cấp phát','ncvt_receipt'),
 ('ncvt.receipt.create','Lập xác nhận nhận NCVT','PX lập draft xác nhận nhận','ncvt_receipt'),
 ('ncvt.receipt.confirm','Xác nhận nhận NCVT','PX xác nhận received/discrepancy/refusal','ncvt_receipt');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='cd_cty' AND q.ma='ncvt.receipt.view';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='px' AND q.hang_muc='ncvt_receipt';
