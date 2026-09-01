-- TASK 16: concurrency-safe stock reservation for approved NCVT demand.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS material_reservations(
 id TEXT PRIMARY KEY,reservation_code TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL UNIQUE,
 submission_line_id TEXT NOT NULL REFERENCES ncvt_submission_lines(id) ON DELETE RESTRICT,
 warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
 material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,uom_code TEXT NOT NULL REFERENCES uoms(code),
 reserved_quantity REAL NOT NULL CHECK(reserved_quantity>0),released_quantity REAL NOT NULL DEFAULT 0 CHECK(released_quantity>=0),
 consumed_quantity REAL NOT NULL DEFAULT 0 CHECK(consumed_quantity>=0),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','PARTIALLY_CONSUMED','RELEASED','CONSUMED','CANCELLED')),
 version INTEGER NOT NULL DEFAULT 1,reserve_transaction_id TEXT NOT NULL UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,
 created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 updated_by INTEGER REFERENCES nguoi_dung(id),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 note TEXT,CHECK(released_quantity+consumed_quantity<=reserved_quantity)
);
CREATE INDEX IF NOT EXISTS idx_material_reservation_demand ON material_reservations(submission_line_id,status);
CREATE INDEX IF NOT EXISTS idx_material_reservation_stock ON material_reservations(warehouse_id,material_id,uom_code,status);
CREATE TABLE IF NOT EXISTS material_reservation_events(
 id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL REFERENCES material_reservations(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN('RESERVE','RELEASE','CANCEL','CONSUME')),
 quantity REAL NOT NULL CHECK(quantity>0),from_status TEXT,to_status TEXT NOT NULL,stock_transaction_id TEXT NOT NULL UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL UNIQUE,actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),reason TEXT,payload_json TEXT NOT NULL,event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS trg_material_reservation_events_no_update BEFORE UPDATE ON material_reservation_events BEGIN SELECT RAISE(ABORT,'Material reservation event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_material_reservation_events_no_delete BEFORE DELETE ON material_reservation_events BEGIN SELECT RAISE(ABORT,'Material reservation event is immutable'); END;
CREATE VIEW IF NOT EXISTS v_ncvt_reservation_progress AS
 SELECT l.id submission_line_id,l.submission_id,s.period_id,s.don_vi_id,l.material_id,l.uom_code,l.requested_quantity,
 COALESCE(SUM(r.reserved_quantity-r.released_quantity-r.consumed_quantity),0) active_reserved_quantity,
 COALESCE(SUM(r.consumed_quantity),0) consumed_quantity,
 l.requested_quantity-COALESCE(SUM(r.reserved_quantity-r.released_quantity),0) unallocated_quantity
 FROM ncvt_submission_lines l JOIN ncvt_submissions s ON s.id=l.submission_id
 LEFT JOIN material_reservations r ON r.submission_line_id=l.id
 GROUP BY l.id,l.submission_id,s.period_id,s.don_vi_id,l.material_id,l.uom_code,l.requested_quantity;
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.reservation.view','Xem giữ chỗ NCVT','Xem tiến độ reservation theo nhu cầu đã duyệt','ncvt_reservation'),
 ('ncvt.reservation.manage','Giữ chỗ NCVT','Tạo reservation nguyên tử từ tồn khả dụng','ncvt_reservation'),
 ('ncvt.reservation.release','Giải phóng giữ chỗ NCVT','Release hoặc cancel reservation có audit','ncvt_reservation');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma IN('admin','cd_cty') AND q.hang_muc='ncvt_reservation';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='px' AND q.ma='ncvt.reservation.view';
