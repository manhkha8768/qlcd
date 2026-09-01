-- TASK 20: canonical NCVT dashboard projection; every quantity remains keyed by Material ID/UOM.
PRAGMA foreign_keys=ON;

CREATE VIEW IF NOT EXISTS v_ncvt_dashboard_lines AS
SELECT
 l.id submission_line_id,l.submission_id,s.period_id,s.don_vi_id,s.status submission_status,
 l.material_id,l.uom_code,l.requested_quantity,l.project_name,
 CASE WHEN s.status='APPROVED' THEN l.requested_quantity ELSE 0 END approved_quantity,
 COALESCE((SELECT SUM(r.reserved_quantity-r.released_quantity-r.consumed_quantity)
   FROM material_reservations r WHERE r.submission_line_id=l.id),0) active_reserved_quantity,
 COALESCE((SELECT SUM(il.quantity)
   FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
   JOIN material_reservations r ON r.id=il.reservation_id
   WHERE r.submission_line_id=l.id AND iv.status='POSTED'),0) posted_issued_quantity,
 COALESCE((SELECT SUM(rl.accepted_quantity)
   FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
   JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
   JOIN material_reservations r ON r.id=il.reservation_id
   WHERE r.submission_line_id=l.id AND iv.status='POSTED' AND rr.status IN('RECEIVED','DISCREPANCY','REFUSED')),0) accepted_quantity,
 COALESCE((SELECT SUM(rl.damaged_quantity)
   FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
   JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
   JOIN material_reservations r ON r.id=il.reservation_id
   WHERE r.submission_line_id=l.id AND iv.status='POSTED' AND rr.status IN('RECEIVED','DISCREPANCY','REFUSED')),0) damaged_quantity,
 COALESCE((SELECT SUM(rl.wrong_quantity)
   FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
   JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
   JOIN material_reservations r ON r.id=il.reservation_id
   WHERE r.submission_line_id=l.id AND iv.status='POSTED' AND rr.status IN('RECEIVED','DISCREPANCY','REFUSED')),0) wrong_quantity,
 COALESCE((SELECT SUM(rl.refused_quantity)
   FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
   JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
   JOIN material_reservations r ON r.id=il.reservation_id
   WHERE r.submission_line_id=l.id AND iv.status='POSTED' AND rr.status IN('RECEIVED','DISCREPANCY','REFUSED')),0) refused_quantity,
 COALESCE((SELECT SUM(cf.carried_quantity) FROM ncvt_carry_forward_lines cf
   JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id
   WHERE cf.source_line_id=l.id AND cb.status='POSTED'),0) carried_out_quantity,
 COALESCE((SELECT SUM(cf.carried_quantity) FROM ncvt_carry_forward_lines cf
   JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id
   WHERE cf.target_line_id=l.id AND cb.status='POSTED'),0) carried_in_quantity,
 CASE WHEN s.status='APPROVED' THEN MAX(0,l.requested_quantity
   -COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations r ON r.id=il.reservation_id WHERE r.submission_line_id=l.id AND iv.status='POSTED'),0)
   -COALESCE((SELECT SUM(r.reserved_quantity-r.released_quantity-r.consumed_quantity) FROM material_reservations r WHERE r.submission_line_id=l.id),0)) ELSE 0 END unallocated_quantity,
 CASE WHEN s.status='APPROVED' THEN MAX(0,l.requested_quantity
   -COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations r ON r.id=il.reservation_id WHERE r.submission_line_id=l.id AND iv.status='POSTED'),0)) ELSE 0 END remaining_to_issue_quantity,
 MAX(0,COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations r ON r.id=il.reservation_id WHERE r.submission_line_id=l.id AND iv.status='POSTED'),0)
   -COALESCE((SELECT SUM(rl.accepted_quantity+rl.damaged_quantity+rl.wrong_quantity+rl.refused_quantity)
     FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
     JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
     JOIN material_reservations r ON r.id=il.reservation_id
     WHERE r.submission_line_id=l.id AND iv.status='POSTED' AND rr.status IN('RECEIVED','DISCREPANCY','REFUSED')),0)) pending_confirmation_quantity,
 CASE WHEN s.status='APPROVED' AND p.status='LOCKED' THEN MAX(0,l.requested_quantity
   -COALESCE((SELECT SUM(il.quantity) FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id JOIN material_reservations r ON r.id=il.reservation_id WHERE r.submission_line_id=l.id AND iv.status='POSTED'),0)
   -COALESCE((SELECT SUM(r.reserved_quantity-r.released_quantity-r.consumed_quantity) FROM material_reservations r WHERE r.submission_line_id=l.id),0)
   -COALESCE((SELECT SUM(cf.carried_quantity) FROM ncvt_carry_forward_lines cf JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id WHERE cf.source_line_id=l.id AND cb.status='POSTED'),0)) ELSE 0 END carry_eligible_quantity
FROM ncvt_submission_lines l
JOIN ncvt_submissions s ON s.id=l.submission_id
JOIN ncvt_periods p ON p.id=s.period_id;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.dashboard.view','Xem dashboard NCVT','Xem KPI, cảnh báo và drill-down NCVT canonical theo scope','ncvt_dashboard');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
 SELECT id,'ncvt.dashboard.view',NULL FROM vai_tro WHERE ma IN('admin','cd_cty','px','xem');
