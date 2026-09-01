const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyenNay, coQuyen, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen');
const { evaluateNotifications, addEvent, deliver } = require('../lib/notification-engine');

const r = express.Router();
r.use(dangNhap);
const ACTIVE = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];

function caseById(id) {
    return db.prepare(`SELECT c.*,r.title rule_title,r.description rule_description,
        u.ho_ten owner_name,u.ten_dang_nhap owner_username,px.ten unit_name
        FROM notification_cases c JOIN notification_rules r ON r.code=c.rule_code
        LEFT JOIN nguoi_dung u ON u.id=c.owner_user_id LEFT JOIN phan_xuong px ON px.id=c.don_vi_id
        WHERE c.id=?`).get(id);
}
function canSee(req, item) {
    const user = req.session.nguoiDung;
    if (user.vai_tro === 'admin' || user.vai_tro === 'cd_cty') return true;
    if (Number(item.owner_user_id) === Number(user.id)) return true;
    if (db.prepare('SELECT 1 FROM notification_deliveries WHERE case_id=? AND recipient_user_id=?')
        .get(item.id, user.id)) return true;
    return item.don_vi_id != null && duocThaoTacDonVi(user, item.don_vi_id);
}
function canTriage(req, item) {
    const user = req.session.nguoiDung;
    return user.vai_tro === 'admin' || user.vai_tro === 'cd_cty'
        || Number(item.owner_user_id) === Number(user.id);
}
function expectedVersion(item, body) {
    if (Number(body?.version) !== Number(item.version)) {
        throw Object.assign(new Error('Thông báo đã thay đổi; vui lòng tải lại'), { status: 409 });
    }
    return item.version + 1;
}
function fail(res, error) {
    res.status(error.status || (/UNIQUE/.test(error.message) ? 409 : 400)).json({ loi: error.message });
}

r.get('/summary', coMaQuyenNay('notification.view'), (req, res) => {
    const all = db.prepare(`SELECT c.* FROM notification_cases c
        WHERE c.status IN('OPEN','ACKNOWLEDGED','IN_PROGRESS') ORDER BY c.last_detected_at DESC`).all()
        .filter(x => canSee(req, x));
    const unread = db.prepare(`SELECT COUNT(*) n FROM notification_deliveries
        WHERE recipient_user_id=? AND read_at IS NULL`).get(req.session.nguoiDung.id).n;
    res.json({ open: all.length, unread, critical: all.filter(x => x.severity === 'CRITICAL').length,
        high: all.filter(x => x.severity === 'HIGH').length,
        data_quality: all.filter(x => x.category === 'DATA_QUALITY').length,
        mine: all.filter(x => Number(x.owner_user_id) === Number(req.session.nguoiDung.id)).length });
});

r.get('/cases', coMaQuyenNay('notification.view'), (req, res) => {
    const where = ['1=1']; const params = [];
    if (req.query.status) { where.push('c.status=?'); params.push(req.query.status); }
    if (req.query.category) { where.push('c.category=?'); params.push(req.query.category); }
    if (req.query.severity) { where.push('c.severity=?'); params.push(req.query.severity); }
    if (req.query.rule_code) { where.push('c.rule_code=?'); params.push(req.query.rule_code); }
    if (req.query.mine === '1') { where.push('c.owner_user_id=?'); params.push(req.session.nguoiDung.id); }
    if (req.query.q?.trim()) {
        const q = `%${req.query.q.trim()}%`;
        where.push('(c.title LIKE ? OR c.details LIKE ? OR c.entity_id LIKE ?)'); params.push(q, q, q);
    }
    const rows = db.prepare(`SELECT c.*,r.title rule_title,u.ho_ten owner_name,px.ma unit_code,px.ten unit_name,
        EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.case_id=c.id
          AND d.recipient_user_id=? AND d.read_at IS NULL) unread
        FROM notification_cases c JOIN notification_rules r ON r.code=c.rule_code
        LEFT JOIN nguoi_dung u ON u.id=c.owner_user_id LEFT JOIN phan_xuong px ON px.id=c.don_vi_id
        WHERE ${where.join(' AND ')} ORDER BY
          CASE c.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END,
          c.last_detected_at DESC LIMIT 500`).all(req.session.nguoiDung.id, ...params);
    res.json(rows.filter(x => canSee(req, x)));
});

r.get('/cases/:id', coMaQuyenNay('notification.view'), (req, res) => {
    const item = caseById(req.params.id);
    if (!item) return res.status(404).json({ loi: 'Không tìm thấy thông báo' });
    if (!canSee(req, item)) return res.status(403).json({ loi: 'Không có quyền' });
    res.json({ case: item,
        events: db.prepare(`SELECT e.*,u.ho_ten actor_name FROM notification_case_events e
            LEFT JOIN nguoi_dung u ON u.id=e.actor_id WHERE e.case_id=? ORDER BY e.id`).all(item.id),
        deliveries: db.prepare(`SELECT d.*,u.ho_ten recipient_name FROM notification_deliveries d
            JOIN nguoi_dung u ON u.id=d.recipient_user_id WHERE d.case_id=? ORDER BY d.created_at,d.id`).all(item.id) });
});

function transition(action, from, to, requireReason = false) {
    r.post(`/cases/:id/${action}`, coMaQuyenNay('notification.triage'), (req, res) => {
        const item = caseById(req.params.id); const body = req.body || {};
        if (!item) return res.status(404).json({ loi: 'Không tìm thấy thông báo' });
        if (!canSee(req, item) || !canTriage(req, item)) return res.status(403).json({ loi: 'Không phải người chịu trách nhiệm' });
        if (!from.includes(item.status)) return res.status(409).json({ loi: 'Trạng thái thông báo không hợp lệ' });
        if (requireReason && !body.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập kết quả hoặc lý do xử lý' });
        try {
            const version = expectedVersion(item, body); const userId = req.session.nguoiDung.id;
            const acknowledged = to === 'ACKNOWLEDGED'; const resolved = to === 'RESOLVED';
            const changed = db.prepare(`UPDATE notification_cases SET status=?,version=?,
                acknowledged_by=CASE WHEN ? THEN ? ELSE acknowledged_by END,
                acknowledged_at=CASE WHEN ? THEN datetime('now','localtime') ELSE acknowledged_at END,
                resolved_by=CASE WHEN ? THEN ? ELSE resolved_by END,
                resolved_at=CASE WHEN ? THEN datetime('now','localtime') ELSE resolved_at END,
                resolution_note=CASE WHEN ? THEN ? ELSE resolution_note END WHERE id=? AND version=?`)
                .run(to, version, acknowledged ? 1 : 0, userId, acknowledged ? 1 : 0,
                    resolved ? 1 : 0, userId, resolved ? 1 : 0, resolved ? 1 : 0,
                    body.reason?.trim() || null, item.id, item.version);
            if (!changed.changes) throw Object.assign(new Error('Thông báo đã thay đổi; vui lòng tải lại'), { status: 409 });
            const event = action === 'acknowledge' ? 'ACKNOWLEDGED' : action === 'start' ? 'STARTED' : 'RESOLVED';
            addEvent(item.id, event, item.status, to, version, userId, body.reason, null);
            if (resolved) deliver(item.id, item.owner_user_id, 'RESOLVED', item.escalation_level);
            res.json({ ok: true, status: to, version });
        } catch (error) { fail(res, error); }
    });
}
transition('acknowledge', ['OPEN'], 'ACKNOWLEDGED');
transition('start', ['OPEN', 'ACKNOWLEDGED'], 'IN_PROGRESS');
transition('resolve', ACTIVE, 'RESOLVED', true);

r.post('/cases/:id/dismiss', coMaQuyenNay('notification.assign'), (req, res) => {
    const item = caseById(req.params.id); const body = req.body || {};
    if (!item) return res.status(404).json({ loi: 'Không tìm thấy thông báo' });
    if (!canSee(req, item)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!ACTIVE.includes(item.status)) return res.status(409).json({ loi: 'Thông báo đã kết thúc' });
    if (!body.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập lý do bỏ qua' });
    try {
        const version = expectedVersion(item, body);
        db.prepare(`UPDATE notification_cases SET status='DISMISSED',resolution_note=?,resolved_by=?,
            resolved_at=datetime('now','localtime'),version=? WHERE id=? AND version=?`)
            .run(body.reason.trim(), req.session.nguoiDung.id, version, item.id, item.version);
        addEvent(item.id, 'DISMISSED', item.status, 'DISMISSED', version,
            req.session.nguoiDung.id, body.reason.trim(), null);
        res.json({ ok: true, status: 'DISMISSED', version });
    } catch (error) { fail(res, error); }
});

r.post('/cases/:id/reassign', coMaQuyenNay('notification.assign'), (req, res) => {
    const item = caseById(req.params.id); const body = req.body || {};
    if (!item) return res.status(404).json({ loi: 'Không tìm thấy thông báo' });
    if (!canSee(req, item)) return res.status(403).json({ loi: 'Không có quyền' });
    const owner = db.prepare('SELECT * FROM nguoi_dung WHERE id=? AND hoat_dong=1').get(body.owner_user_id);
    if (!owner || !coQuyen(owner.id, owner.vai_tro, 'notification.triage')) {
        return res.status(422).json({ loi: 'Người nhận không có quyền xử lý thông báo' });
    }
    if (item.don_vi_id != null && owner.vai_tro !== 'admin' && owner.vai_tro !== 'cd_cty'
        && !duocThaoTacDonVi(owner, item.don_vi_id)) {
        return res.status(422).json({ loi: 'Người nhận ngoài phạm vi đơn vị' });
    }
    if (!body.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập lý do phân công' });
    try {
        const version = expectedVersion(item, body);
        db.prepare('UPDATE notification_cases SET owner_user_id=?,version=? WHERE id=? AND version=?')
            .run(owner.id, version, item.id, item.version);
        addEvent(item.id, 'REASSIGNED', item.status, item.status, version, req.session.nguoiDung.id,
            body.reason.trim(), { from_owner_user_id: item.owner_user_id, to_owner_user_id: owner.id });
        deliver(item.id, owner.id, 'REASSIGNED', item.escalation_level);
        res.json({ ok: true, owner_user_id: owner.id, version });
    } catch (error) { fail(res, error); }
});

r.post('/cases/:id/escalate', coMaQuyenNay('notification.assign'), (req, res) => {
    const item = caseById(req.params.id); const body = req.body || {};
    if (!item) return res.status(404).json({ loi: 'Không tìm thấy thông báo' });
    if (!canSee(req, item)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!ACTIVE.includes(item.status)) return res.status(409).json({ loi: 'Thông báo đã kết thúc' });
    if (!body.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập lý do escalation' });
    try {
        const version = expectedVersion(item, body); const level = item.escalation_level + 1;
        const severity = item.severity === 'INFO' ? 'WARNING' : item.severity === 'WARNING' ? 'HIGH' : 'CRITICAL';
        db.prepare(`UPDATE notification_cases SET escalation_level=?,severity=?,version=? WHERE id=? AND version=?`)
            .run(level, severity, version, item.id, item.version);
        addEvent(item.id, 'ESCALATED', item.status, item.status, version, req.session.nguoiDung.id,
            body.reason.trim(), { escalation_level: level });
        deliver(item.id, item.owner_user_id, 'ESCALATED', level);
        const admins = db.prepare("SELECT id FROM nguoi_dung WHERE hoat_dong=1 AND vai_tro='admin'").all();
        admins.forEach(x => deliver(item.id, x.id, 'ESCALATED', level));
        res.json({ ok: true, escalation_level: level, severity, version });
    } catch (error) { fail(res, error); }
});

r.post('/deliveries/:id/read', coMaQuyenNay('notification.view'), (req, res) => {
    const result = db.prepare(`UPDATE notification_deliveries SET read_at=COALESCE(read_at,datetime('now','localtime'))
        WHERE id=? AND recipient_user_id=?`).run(req.params.id, req.session.nguoiDung.id);
    if (!result.changes) return res.status(404).json({ loi: 'Không tìm thấy thông báo cá nhân' });
    res.json({ ok: true });
});

r.get('/rules', coMaQuyenNay('notification.manage'), (req, res) => {
    res.json(db.prepare('SELECT * FROM notification_rules ORDER BY category,code').all());
});
r.put('/rules/:code', coMaQuyenNay('notification.manage'), (req, res) => {
    const rule = db.prepare('SELECT * FROM notification_rules WHERE code=?').get(req.params.code);
    const body = req.body || {};
    if (!rule) return res.status(404).json({ loi: 'Không tìm thấy rule' });
    if (Number(body.version) !== Number(rule.version)) return res.status(409).json({ loi: 'Rule đã thay đổi; vui lòng tải lại' });
    if (!body.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập lý do thay đổi rule' });
    const lead = Number(body.lead_days); const escalation = Number(body.escalation_hours);
    if (!Number.isInteger(lead) || lead < 0 || !Number.isInteger(escalation) || escalation < 1) {
        return res.status(422).json({ loi: 'Số ngày cảnh báo hoặc giờ escalation không hợp lệ' });
    }
    db.transaction(() => {
        db.prepare(`UPDATE notification_rules SET enabled=?,lead_days=?,escalation_hours=?,version=version+1,
            updated_at=datetime('now','localtime') WHERE code=? AND version=?`).run(body.enabled ? 1 : 0,
            lead, escalation, rule.code, rule.version);
        const after = { ...rule, enabled: body.enabled ? 1 : 0, lead_days: lead,
            escalation_hours: escalation, version: rule.version + 1 };
        db.prepare(`INSERT INTO notification_rule_events
            (rule_code,from_version,to_version,before_json,after_json,actor_id,reason)
            VALUES (?,?,?,?,?,?,?)`).run(rule.code, rule.version, rule.version + 1,
            JSON.stringify(rule), JSON.stringify(after), req.session.nguoiDung.id, body.reason.trim());
    })();
    res.json({ ok: true, version: rule.version + 1 });
});
r.post('/evaluate', coMaQuyenNay('notification.manage'), (req, res) => {
    try { res.json(evaluateNotifications({ triggerType: 'MANUAL', actorId: req.session.nguoiDung.id })); }
    catch (error) { fail(res, error); }
});
r.get('/job-runs', coMaQuyenNay('notification.manage'), (req, res) => {
    res.json(db.prepare('SELECT * FROM notification_job_runs ORDER BY started_at DESC LIMIT 100').all());
});
r.get('/assignees', coMaQuyenNay('notification.assign'), (req, res) => {
    res.json(db.prepare('SELECT id,ten_dang_nhap,ho_ten,vai_tro,phan_xuong_id FROM nguoi_dung WHERE hoat_dong=1 ORDER BY ho_ten')
        .all().filter(x => coQuyen(x.id, x.vai_tro, 'notification.triage')));
});

module.exports = r;
