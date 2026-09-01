-- TASK 19: idempotent carry-forward lineage and database-enforced locked period immutability.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ncvt_carry_forward_batches(
 id TEXT PRIMARY KEY,batch_code TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL UNIQUE,source_period_id TEXT NOT NULL REFERENCES ncvt_periods(id) ON DELETE RESTRICT,target_period_id TEXT NOT NULL REFERENCES ncvt_periods(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status='POSTED'),created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),reason TEXT NOT NULL CHECK(length(trim(reason))>0),payload_json TEXT NOT NULL,
 CHECK(source_period_id<>target_period_id)
);
CREATE INDEX IF NOT EXISTS idx_ncvt_carry_periods ON ncvt_carry_forward_batches(source_period_id,target_period_id);
CREATE TABLE IF NOT EXISTS ncvt_carry_forward_lines(
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES ncvt_carry_forward_batches(id) ON DELETE RESTRICT,source_line_id TEXT NOT NULL REFERENCES ncvt_submission_lines(id) ON DELETE RESTRICT,target_line_id TEXT NOT NULL UNIQUE REFERENCES ncvt_submission_lines(id) ON DELETE RESTRICT,
 material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,uom_code TEXT NOT NULL REFERENCES uoms(code),carried_quantity REAL NOT NULL CHECK(carried_quantity>0),source_snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ncvt_carry_source_line ON ncvt_carry_forward_lines(source_line_id);
CREATE TABLE IF NOT EXISTS ncvt_carry_forward_events(
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES ncvt_carry_forward_batches(id) ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type='POST'),actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),payload_json TEXT NOT NULL,event_time TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 UNIQUE(batch_id,event_type)
);
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_batches_no_update BEFORE UPDATE ON ncvt_carry_forward_batches BEGIN SELECT RAISE(ABORT,'NCVT carry-forward batch is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_batches_no_delete BEFORE DELETE ON ncvt_carry_forward_batches BEGIN SELECT RAISE(ABORT,'NCVT carry-forward batch is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_lines_no_update BEFORE UPDATE ON ncvt_carry_forward_lines BEGIN SELECT RAISE(ABORT,'NCVT carry-forward line is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_lines_no_delete BEFORE DELETE ON ncvt_carry_forward_lines BEGIN SELECT RAISE(ABORT,'NCVT carry-forward line is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_lines_no_insert_after_post BEFORE INSERT ON ncvt_carry_forward_lines WHEN EXISTS(SELECT 1 FROM ncvt_carry_forward_events WHERE batch_id=NEW.batch_id AND event_type='POST') BEGIN SELECT RAISE(ABORT,'NCVT carry-forward batch is sealed'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_events_no_update BEFORE UPDATE ON ncvt_carry_forward_events BEGIN SELECT RAISE(ABORT,'NCVT carry-forward event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_carry_events_no_delete BEFORE DELETE ON ncvt_carry_forward_events BEGIN SELECT RAISE(ABORT,'NCVT carry-forward event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_period_no_update BEFORE UPDATE ON ncvt_periods WHEN OLD.status='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_period_no_delete BEFORE DELETE ON ncvt_periods WHEN OLD.status='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_submission_no_insert BEFORE INSERT ON ncvt_submissions WHEN (SELECT status FROM ncvt_periods WHERE id=NEW.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_submission_no_update BEFORE UPDATE ON ncvt_submissions WHEN (SELECT status FROM ncvt_periods WHERE id=OLD.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_submission_no_delete BEFORE DELETE ON ncvt_submissions WHEN (SELECT status FROM ncvt_periods WHERE id=OLD.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_line_no_insert BEFORE INSERT ON ncvt_submission_lines WHEN (SELECT p.status FROM ncvt_submissions s JOIN ncvt_periods p ON p.id=s.period_id WHERE s.id=NEW.submission_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_line_no_update BEFORE UPDATE ON ncvt_submission_lines WHEN (SELECT p.status FROM ncvt_submissions s JOIN ncvt_periods p ON p.id=s.period_id WHERE s.id=OLD.submission_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_line_no_delete BEFORE DELETE ON ncvt_submission_lines WHEN (SELECT p.status FROM ncvt_submissions s JOIN ncvt_periods p ON p.id=s.period_id WHERE s.id=OLD.submission_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_event_no_insert BEFORE INSERT ON ncvt_submission_events WHEN (SELECT p.status FROM ncvt_submissions s JOIN ncvt_periods p ON p.id=s.period_id WHERE s.id=NEW.submission_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_assignment_no_insert BEFORE INSERT ON ncvt_review_assignments WHEN (SELECT status FROM ncvt_periods WHERE id=NEW.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_assignment_no_update BEFORE UPDATE ON ncvt_review_assignments WHEN (SELECT status FROM ncvt_periods WHERE id=OLD.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_assignment_no_delete BEFORE DELETE ON ncvt_review_assignments WHEN (SELECT status FROM ncvt_periods WHERE id=OLD.period_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ncvt_locked_decision_no_insert BEFORE INSERT ON ncvt_review_decisions WHEN (SELECT p.status FROM ncvt_submissions s JOIN ncvt_periods p ON p.id=s.period_id WHERE s.id=NEW.submission_id)='LOCKED' BEGIN SELECT RAISE(ABORT,'Locked NCVT period is immutable'); END;
CREATE VIEW IF NOT EXISTS v_ncvt_carry_forward_eligible AS
 SELECT l.id source_line_id,l.submission_id,s.period_id,s.don_vi_id,l.material_id,l.uom_code,l.requested_quantity,l.project_name,l.justification,l.note,
 COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations mr ON mr.id=il.reservation_id WHERE mr.submission_line_id=l.id AND iv.status='POSTED'),0) posted_issued_quantity,
 COALESCE((SELECT SUM(mr.reserved_quantity-mr.released_quantity-mr.consumed_quantity) FROM material_reservations mr WHERE mr.submission_line_id=l.id),0) active_reserved_quantity,
 COALESCE((SELECT SUM(cf.carried_quantity) FROM ncvt_carry_forward_lines cf JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id WHERE cf.source_line_id=l.id AND cb.status='POSTED'),0) carried_quantity,
 l.requested_quantity-COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations mr ON mr.id=il.reservation_id WHERE mr.submission_line_id=l.id AND iv.status='POSTED'),0)-COALESCE((SELECT SUM(mr.reserved_quantity-mr.released_quantity-mr.consumed_quantity) FROM material_reservations mr WHERE mr.submission_line_id=l.id),0)-COALESCE((SELECT SUM(cf.carried_quantity) FROM ncvt_carry_forward_lines cf JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id WHERE cf.source_line_id=l.id AND cb.status='POSTED'),0) eligible_quantity
 FROM ncvt_submission_lines l JOIN ncvt_submissions s ON s.id=l.submission_id JOIN ncvt_periods p ON p.id=s.period_id WHERE s.status='APPROVED' AND p.status='LOCKED';
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.carry.view','Xem carry-forward NCVT','Xem số hợp lệ và lineage chuyển kỳ','ncvt_carry'),
 ('ncvt.carry.manage','Carry-forward NCVT','Chuyển phần nhu cầu hợp lệ sang kỳ kế tiếp','ncvt_carry');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma IN('admin','cd_cty') AND q.hang_muc='ncvt_carry';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='px' AND q.ma='ncvt.carry.view';
