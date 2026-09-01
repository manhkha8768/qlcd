const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyenNay, duocThaoTacDonVi } = require('../middleware/quyen');

const router = express.Router();
const allowedStatuses = new Set(['DRAFT','SUBMITTED','RETURNED','REJECTED','APPROVED','CANCELLED']);
const allowedAlerts = new Set(['REVIEW_PENDING','RETURNED','UNALLOCATED','PENDING_RECEIPT','DISCREPANCY','CARRY_AVAILABLE']);
const scoped = (req, unitId) => duocThaoTacDonVi(req.session.nguoiDung, unitId);
const number = value => Number(value || 0);

router.use(dangNhap);

function alerts(row) {
    const result = [];
    if (row.submission_status === 'SUBMITTED') result.push('REVIEW_PENDING');
    if (row.submission_status === 'RETURNED') result.push('RETURNED');
    if (number(row.unallocated_quantity) > 0) result.push('UNALLOCATED');
    if (number(row.pending_confirmation_quantity) > 0) result.push('PENDING_RECEIPT');
    if (number(row.damaged_quantity) + number(row.wrong_quantity) + number(row.refused_quantity) > 0) result.push('DISCREPANCY');
    if (number(row.carry_eligible_quantity) > 0) result.push('CARRY_AVAILABLE');
    return result;
}

function dashboardRows(periodId) {
    return db.prepare(`SELECT d.*,p.period_code,p.status period_status,s.submission_code,
        m.material_code,m.name material_name,px.ma unit_code,px.ten unit_name
        FROM v_ncvt_dashboard_lines d
        JOIN ncvt_periods p ON p.id=d.period_id
        JOIN ncvt_submissions s ON s.id=d.submission_id
        JOIN materials m ON m.id=d.material_id
        JOIN phan_xuong px ON px.id=d.don_vi_id
        WHERE d.period_id=? ORDER BY px.ma,m.material_code,d.uom_code,d.submission_line_id`).all(periodId)
        .map(row => ({ ...row, alerts: alerts(row) }));
}

function addKpi(target, row) {
    const kpi = target[row.uom_code] || (target[row.uom_code] = {
        uom_code: row.uom_code, approved: 0, active_reserved: 0, issued: 0, received: 0, accepted: 0,
        discrepancy: 0, pending_confirmation: 0, remaining_to_issue: 0, unallocated: 0,
        carried_out: 0, carried_in: 0, carry_eligible: 0
    });
    kpi.approved += number(row.approved_quantity);
    kpi.active_reserved += number(row.active_reserved_quantity);
    kpi.issued += number(row.posted_issued_quantity);
    kpi.accepted += number(row.accepted_quantity);
    kpi.received += number(row.accepted_quantity);
    kpi.discrepancy += number(row.damaged_quantity) + number(row.wrong_quantity) + number(row.refused_quantity);
    kpi.pending_confirmation += number(row.pending_confirmation_quantity);
    kpi.remaining_to_issue += number(row.remaining_to_issue_quantity);
    kpi.unallocated += number(row.unallocated_quantity);
    kpi.carried_out += number(row.carried_out_quantity);
    kpi.carried_in += number(row.carried_in_quantity);
    kpi.carry_eligible += number(row.carry_eligible_quantity);
}

router.get('/', coMaQuyenNay('ncvt.dashboard.view'), (req, res) => {
    const period = db.prepare('SELECT * FROM ncvt_periods WHERE id=?').get(req.query.period_id);
    if (!period) return res.status(404).json({ loi: 'Không tìm thấy kỳ NCVT' });
    const unitId = req.query.don_vi_id ? Number(req.query.don_vi_id) : null;
    const materialId = req.query.material_id ? Number(req.query.material_id) : null;
    const status = req.query.submission_status || '';
    const alert = req.query.alert || '';
    const search = String(req.query.q || '').trim().toLowerCase();
    if (unitId && !scoped(req, unitId)) return res.status(403).json({ loi: 'Ngoài phạm vi đơn vị' });
    if (status && !allowedStatuses.has(status)) return res.status(422).json({ loi: 'Trạng thái submission không hợp lệ' });
    if (alert && !allowedAlerts.has(alert)) return res.status(422).json({ loi: 'Mã cảnh báo không hợp lệ' });

    const scopedRows = dashboardRows(period.id).filter(row => scoped(req, row.don_vi_id));
    const availableFilters = {
        units: [...new Map(scopedRows.map(row => [row.don_vi_id, { id: row.don_vi_id, code: row.unit_code, name: row.unit_name }])).values()],
        materials: [...new Map(scopedRows.map(row => [row.material_id, { id: row.material_id, code: row.material_code, name: row.material_name, uom_code: row.uom_code }])).values()],
        statuses: [...new Set(scopedRows.map(row => row.submission_status))]
    };
    const items = scopedRows.filter(row => (!unitId || row.don_vi_id === unitId)
        && (!materialId || row.material_id === materialId)
        && (!status || row.submission_status === status)
        && (!alert || row.alerts.includes(alert))
        && (!search || `${row.material_code} ${row.material_name} ${row.project_name || ''} ${row.unit_code} ${row.unit_name}`.toLowerCase().includes(search)));
    const kpis = {};
    const alertCounts = Object.fromEntries([...allowedAlerts].map(code => [code, 0]));
    const submissionIds = new Set();
    items.forEach(row => {
        addKpi(kpis, row);
        submissionIds.add(row.submission_id);
        row.alerts.forEach(code => { alertCounts[code]++; });
    });
    return res.json({
        period,
        scope: unitId ? { type: 'UNIT', don_vi_id: unitId } : { type: 'ASSIGNED_UNITS' },
        counts: { submissions: submissionIds.size, lines: items.length, alerts: Object.values(alertCounts).reduce((a, b) => a + b, 0) },
        kpis_by_uom: Object.values(kpis).sort((a, b) => a.uom_code.localeCompare(b.uom_code)),
        alert_counts: alertCounts,
        available_filters: availableFilters,
        items
    });
});

router.get('/lines/:id', coMaQuyenNay('ncvt.dashboard.view'), (req, res) => {
    const line = db.prepare(`SELECT d.*,p.period_code,p.status period_status,s.submission_code,
        m.material_code,m.name material_name,px.ma unit_code,px.ten unit_name
        FROM v_ncvt_dashboard_lines d JOIN ncvt_periods p ON p.id=d.period_id
        JOIN ncvt_submissions s ON s.id=d.submission_id JOIN materials m ON m.id=d.material_id
        JOIN phan_xuong px ON px.id=d.don_vi_id WHERE d.submission_line_id=?`).get(req.params.id);
    if (!line) return res.status(404).json({ loi: 'Không tìm thấy dòng NCVT dashboard' });
    if (!scoped(req, line.don_vi_id)) return res.status(403).json({ loi: 'Ngoài phạm vi đơn vị' });
    line.alerts = alerts(line);
    const reservations = db.prepare(`SELECT r.*,w.warehouse_code,w.name warehouse_name,
        r.reserved_quantity-r.released_quantity-r.consumed_quantity remaining_quantity
        FROM material_reservations r JOIN warehouses w ON w.id=r.warehouse_id
        WHERE r.submission_line_id=? ORDER BY r.created_at,r.id`).all(line.submission_line_id);
    const issues = db.prepare(`SELECT il.*,iv.voucher_code,iv.status voucher_status,iv.posted_at,w.warehouse_code
        FROM material_issue_lines il JOIN material_issue_vouchers iv ON iv.id=il.voucher_id
        JOIN material_reservations r ON r.id=il.reservation_id JOIN warehouses w ON w.id=il.warehouse_id
        WHERE r.submission_line_id=? ORDER BY iv.created_at,il.id`).all(line.submission_line_id);
    const receipts = db.prepare(`SELECT rr.receipt_code,rr.status receipt_status,rr.confirmed_at,rl.*
        FROM material_issue_receipt_lines rl JOIN material_issue_receipts rr ON rr.id=rl.receipt_id
        JOIN material_issue_lines il ON il.id=rl.issue_line_id JOIN material_reservations r ON r.id=il.reservation_id
        WHERE r.submission_line_id=? ORDER BY rr.created_at,rl.id`).all(line.submission_line_id);
    const carry = db.prepare(`SELECT cf.*,cb.batch_code,cb.source_period_id,cb.target_period_id,cb.reason,cb.created_at,
        CASE WHEN cf.source_line_id=? THEN 'OUT' ELSE 'IN' END direction
        FROM ncvt_carry_forward_lines cf JOIN ncvt_carry_forward_batches cb ON cb.id=cf.batch_id
        WHERE cf.source_line_id=? OR cf.target_line_id=? ORDER BY cb.created_at,cf.id`).all(line.submission_line_id, line.submission_line_id, line.submission_line_id);
    return res.json({ line, reservations, issues, receipts, carry });
});

module.exports = router;
