const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { dangNhap, coMaQuyenNay, duocThaoTacDonVi } = require('../middleware/quyen');

const router = express.Router();
const uuid = () => crypto.randomUUID();
const scoped = (req, unitId) => duocThaoTacDonVi(req.session.nguoiDung, unitId);
const isNextPeriod = (source, target) => source && target && (source.quarter === 4
    ? target.year === source.year + 1 && target.quarter === 1
    : target.year === source.year && target.quarter === source.quarter + 1);

router.use(dangNhap);

function batchLines(batchId) {
    return db.prepare(`SELECT cf.*,s.don_vi_id,m.material_code,m.name material_name,
        px.ma unit_code,px.ten unit_name
        FROM ncvt_carry_forward_lines cf
        JOIN ncvt_submission_lines l ON l.id=cf.source_line_id
        JOIN ncvt_submissions s ON s.id=l.submission_id
        JOIN materials m ON m.id=cf.material_id
        JOIN phan_xuong px ON px.id=s.don_vi_id
        WHERE cf.batch_id=? ORDER BY px.ma,m.material_code`).all(batchId);
}

router.get('/eligible', coMaQuyenNay('ncvt.carry.view'), (req, res) => {
    const period = db.prepare("SELECT * FROM ncvt_periods WHERE id=? AND status='LOCKED'").get(req.query.source_period_id);
    if (!period) return res.status(404).json({ loi: 'Không tìm thấy kỳ nguồn LOCKED' });
    const rows = db.prepare(`SELECT e.*,m.material_code,m.name material_name,px.ma unit_code,px.ten unit_name
        FROM v_ncvt_carry_forward_eligible e
        JOIN materials m ON m.id=e.material_id
        JOIN phan_xuong px ON px.id=e.don_vi_id
        WHERE e.period_id=? AND e.eligible_quantity>0 ORDER BY px.ma,m.material_code`).all(period.id)
        .filter(x => scoped(req, x.don_vi_id));
    return res.json({ period, items: rows });
});

router.get('/batches', coMaQuyenNay('ncvt.carry.view'), (req, res) => {
    const rows = db.prepare(`SELECT b.*,sp.period_code source_period_code,tp.period_code target_period_code,
        (SELECT COUNT(*) FROM ncvt_carry_forward_lines l WHERE l.batch_id=b.id) line_count,
        (SELECT COALESCE(SUM(carried_quantity),0) FROM ncvt_carry_forward_lines l WHERE l.batch_id=b.id) total_quantity
        FROM ncvt_carry_forward_batches b
        JOIN ncvt_periods sp ON sp.id=b.source_period_id
        JOIN ncvt_periods tp ON tp.id=b.target_period_id
        ORDER BY b.created_at DESC`).all();
    return res.json(rows.filter(batch => {
        const lines = batchLines(batch.id);
        return lines.length > 0 && lines.every(line => scoped(req, line.don_vi_id));
    }));
});

router.get('/batches/:id', coMaQuyenNay('ncvt.carry.view'), (req, res) => {
    const batch = db.prepare(`SELECT b.*,sp.period_code source_period_code,tp.period_code target_period_code
        FROM ncvt_carry_forward_batches b
        JOIN ncvt_periods sp ON sp.id=b.source_period_id
        JOIN ncvt_periods tp ON tp.id=b.target_period_id WHERE b.id=?`).get(req.params.id);
    if (!batch) return res.status(404).json({ loi: 'Không tìm thấy batch carry-forward' });
    const lines = batchLines(batch.id);
    if (lines.some(line => !scoped(req, line.don_vi_id))) return res.status(403).json({ loi: 'Ngoài phạm vi đơn vị' });
    return res.json({
        batch,
        lines,
        events: db.prepare('SELECT * FROM ncvt_carry_forward_events WHERE batch_id=? ORDER BY event_time,id').all(batch.id)
    });
});

router.post('/batches', coMaQuyenNay('ncvt.carry.manage'), (req, res) => {
    const body = req.body || {};
    const source = db.prepare("SELECT * FROM ncvt_periods WHERE id=? AND status='LOCKED'").get(body.source_period_id);
    const target = db.prepare("SELECT * FROM ncvt_periods WHERE id=? AND status='OPEN'").get(body.target_period_id);
    const key = String(body.idempotency_key || '').trim();
    const reason = String(body.reason || '').trim();
    const requested = Array.isArray(body.lines) ? body.lines : [];
    const normalized = requested.map(x => ({
        source_line_id: String(x.source_line_id || '').trim(),
        quantity: Number(x.quantity)
    })).sort((a, b) => a.source_line_id.localeCompare(b.source_line_id));
    const hasDuplicate = new Set(normalized.map(x => x.source_line_id)).size !== normalized.length;
    if (!source || !target || !isNextPeriod(source, target) || !key || !reason || !normalized.length || hasDuplicate || normalized.some(x => !x.source_line_id || !(x.quantity > 0))) {
        return res.status(422).json({ loi: 'Kỳ nguồn LOCKED, kỳ kế tiếp OPEN, idempotency key, lý do và các dòng carry hợp lệ là bắt buộc' });
    }
    const payload = JSON.stringify({ source_period_id: source.id, target_period_id: target.id, reason, lines: normalized });
    const old = db.prepare('SELECT * FROM ncvt_carry_forward_batches WHERE idempotency_key=?').get(key);
    if (old) return old.payload_json === payload
        ? res.json({ id: old.id, idempotent: true })
        : res.status(409).json({ loi: 'Idempotency key đã dùng cho payload khác' });

    try {
        let batchId;
        db.transaction(() => {
            batchId = uuid();
            db.prepare(`INSERT INTO ncvt_carry_forward_batches
                (id,batch_code,idempotency_key,source_period_id,target_period_id,created_by,reason,payload_json)
                VALUES(?,?,?,?,?,?,?,?)`).run(
                batchId,
                body.batch_code || `CF-${source.period_code}-${target.period_code}-${Date.now()}`,
                key, source.id, target.id, req.session.nguoiDung.id, reason, payload
            );
            const carried = [];
            for (const item of normalized) {
                const eligible = db.prepare('SELECT * FROM v_ncvt_carry_forward_eligible WHERE source_line_id=? AND period_id=?')
                    .get(item.source_line_id, source.id);
                if (!eligible || item.quantity > eligible.eligible_quantity) {
                    throw Object.assign(new Error('Dòng hoặc số lượng carry vượt phần hợp lệ còn lại'), { status: 409 });
                }
                let submission = db.prepare('SELECT * FROM ncvt_submissions WHERE period_id=? AND don_vi_id=?')
                    .get(target.id, eligible.don_vi_id);
                if (submission && submission.status !== 'DRAFT') {
                    throw Object.assign(new Error('Submission kỳ đích đã khóa nội dung, không thể carry'), { status: 409 });
                }
                if (!submission) {
                    const submissionId = uuid();
                    db.prepare(`INSERT INTO ncvt_submissions
                        (id,submission_code,period_id,don_vi_id,idempotency_key,note,created_by)
                        VALUES(?,?,?,?,?,?,?)`).run(
                        submissionId, `${target.period_code}-PX-${eligible.don_vi_id}`, target.id, eligible.don_vi_id,
                        `carry-sub:${target.id}:${eligible.don_vi_id}`, `Carry-forward từ ${source.period_code}`, req.session.nguoiDung.id
                    );
                    db.prepare(`INSERT INTO ncvt_submission_events
                        (id,submission_id,event_type,from_status,to_status,actor_id,reason,payload_json)
                        VALUES(?,?,'CREATE',NULL,'DRAFT',?,?,?)`).run(
                        uuid(), submissionId, req.session.nguoiDung.id, reason,
                        JSON.stringify({ carry_batch_id: batchId, source_period_id: source.id })
                    );
                    submission = db.prepare('SELECT * FROM ncvt_submissions WHERE id=?').get(submissionId);
                }
                const targetLineId = uuid();
                const snapshot = {
                    source_line_id: eligible.source_line_id,
                    submission_id: eligible.submission_id,
                    material_id: eligible.material_id,
                    uom_code: eligible.uom_code,
                    requested_quantity: eligible.requested_quantity,
                    posted_issued_quantity: eligible.posted_issued_quantity,
                    active_reserved_quantity: eligible.active_reserved_quantity,
                    carried_before: eligible.carried_quantity,
                    eligible_before: eligible.eligible_quantity
                };
                db.prepare(`INSERT INTO ncvt_submission_lines
                    (id,submission_id,material_id,uom_code,requested_quantity,project_name,justification,note,created_by)
                    VALUES(?,?,?,?,?,?,?,?,?)`).run(
                    targetLineId, submission.id, eligible.material_id, eligible.uom_code, item.quantity,
                    eligible.project_name, `Carry-forward từ ${source.period_code}: ${reason}`, eligible.note,
                    req.session.nguoiDung.id
                );
                db.prepare(`INSERT INTO ncvt_carry_forward_lines
                    (id,batch_id,source_line_id,target_line_id,material_id,uom_code,carried_quantity,source_snapshot_json)
                    VALUES(?,?,?,?,?,?,?,?)`).run(
                    uuid(), batchId, eligible.source_line_id, targetLineId, eligible.material_id,
                    eligible.uom_code, item.quantity, JSON.stringify(snapshot)
                );
                carried.push({ source_line_id: eligible.source_line_id, target_line_id: targetLineId, quantity: item.quantity });
            }
            db.prepare(`INSERT INTO ncvt_carry_forward_events
                (id,batch_id,event_type,actor_id,payload_json) VALUES(?,?,'POST',?,?)`).run(
                uuid(), batchId, req.session.nguoiDung.id, JSON.stringify({ reason, lines: carried })
            );
        })();
        return res.status(201).json({ id: batchId });
    } catch (error) {
        return res.status(error.status || (/UNIQUE|immutable/.test(error.message) ? 409 : 500)).json({ loi: error.message });
    }
});

module.exports = router;
