-- TASK 17: canonical material issue voucher consuming NCVT reservations.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS material_issue_vouchers(
 id TEXT PRIMARY KEY,voucher_code TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL UNIQUE,don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','POSTED','REVERSED')),
 version INTEGER NOT NULL DEFAULT 1,issue_date TEXT,note TEXT,created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 submitted_by INTEGER REFERENCES nguoi_dung(id),submitted_at TEXT,approved_by INTEGER REFERENCES nguoi_dung(id),approved_at TEXT,posted_by INTEGER REFERENCES nguoi_dung(id),posted_at TEXT,reversed_by INTEGER REFERENCES nguoi_dung(id),reversed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_material_issue_status ON material_issue_vouchers(status,don_vi_id,created_at);
CREATE TABLE IF NOT EXISTS material_issue_lines(
 id TEXT PRIMARY KEY,voucher_id TEXT NOT NULL REFERENCES material_issue_vouchers(id) ON DELETE RESTRICT,reservation_id TEXT NOT NULL REFERENCES material_reservations(id) ON DELETE RESTRICT,
 material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,uom_code TEXT NOT NULL REFERENCES uoms(code),
 quantity REAL NOT NULL CHECK(quantity>0),note TEXT,issue_transaction_id TEXT UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,reversal_transaction_id TEXT UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,
 created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(voucher_id,reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_material_issue_reservation ON material_issue_lines(reservation_id);
CREATE TABLE IF NOT EXISTS material_issue_decisions(
 id TEXT PRIMARY KEY,voucher_id TEXT NOT NULL REFERENCES material_issue_vouchers(id) ON DELETE RESTRICT,voucher_version INTEGER NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN('APPROVE','REJECT')),reason TEXT NOT NULL CHECK(length(trim(reason))>0),snapshot_json TEXT NOT NULL,decided_by INTEGER NOT NULL REFERENCES nguoi_dung(id),decided_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(voucher_id,voucher_version)
);
CREATE TRIGGER IF NOT EXISTS trg_material_issue_decisions_no_update BEFORE UPDATE ON material_issue_decisions BEGIN SELECT RAISE(ABORT,'Material issue decision is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_material_issue_decisions_no_delete BEFORE DELETE ON material_issue_decisions BEGIN SELECT RAISE(ABORT,'Material issue decision is immutable'); END;
CREATE TABLE IF NOT EXISTS material_issue_events(
 id TEXT PRIMARY KEY,voucher_id TEXT NOT NULL REFERENCES material_issue_vouchers(id) ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN('CREATE','LINE_ADD','SUBMIT','APPROVE','REJECT','CANCEL','POST','REVERSE')),
 from_status TEXT,to_status TEXT,actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),reason TEXT,payload_json TEXT,event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS trg_material_issue_events_no_update BEFORE UPDATE ON material_issue_events BEGIN SELECT RAISE(ABORT,'Material issue event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_material_issue_events_no_delete BEFORE DELETE ON material_issue_events BEGIN SELECT RAISE(ABORT,'Material issue event is immutable'); END;
CREATE VIEW IF NOT EXISTS v_ncvt_issue_progress AS
 SELECT p.*,COALESCE(SUM(CASE WHEN v.status='POSTED' THEN l.quantity ELSE 0 END),0) posted_issued_quantity,
 p.requested_quantity-COALESCE(SUM(CASE WHEN v.status='POSTED' THEN l.quantity ELSE 0 END),0) remaining_to_issue
 FROM v_ncvt_reservation_progress p LEFT JOIN material_issue_lines l ON l.reservation_id IN(SELECT id FROM material_reservations r WHERE r.submission_line_id=p.submission_line_id)
 LEFT JOIN material_issue_vouchers v ON v.id=l.voucher_id GROUP BY p.submission_line_id;
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.issue.view','Xem phiếu cấp phát','Xem phiếu xuất/cấp phát canonical','ncvt_issue'),
 ('ncvt.issue.create','Lập phiếu cấp phát','Tạo draft và dòng từ reservation','ncvt_issue'),
 ('ncvt.issue.submit','Trình phiếu cấp phát','Trình phiếu chờ duyệt','ncvt_issue'),
 ('ncvt.issue.approve','Duyệt phiếu cấp phát','Approve/reject có quyết định bất biến','ncvt_issue'),
 ('ncvt.issue.post','Xuất kho phiếu cấp phát','Consume reservation và post ISSUE nguyên tử','ncvt_issue'),
 ('ncvt.issue.reverse','Đảo phiếu cấp phát','Đảo ledger và phục hồi reservation','ncvt_issue');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma IN('admin','cd_cty') AND q.hang_muc='ncvt_issue';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='px' AND q.ma='ncvt.issue.view';
