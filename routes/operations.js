const express = require('express');
const db = require('../db');
const OBS = require('../lib/observability');
const { dangNhap, coMaQuyenNay } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);

r.get('/metrics', coMaQuyenNay('operations.view'), (req, res) => res.json(OBS.snapshot()));
r.get('/errors', coMaQuyenNay('operations.view'), (req, res) => {
    const status = String(req.query.status || 'OPEN').toUpperCase();
    if (!['OPEN', 'RESOLVED', 'ALL'].includes(status)) return res.status(400).json({ loi: 'Trạng thái không hợp lệ' });
    const where = status === 'ALL' ? '' : 'WHERE e.status=?';
    const params = status === 'ALL' ? [] : [status];
    res.json(db.prepare(`SELECT e.*,u.ho_ten actor_name,r.ho_ten resolver_name
        FROM operational_error_events e LEFT JOIN nguoi_dung u ON u.id=e.actor_id
        LEFT JOIN nguoi_dung r ON r.id=e.resolved_by ${where}
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT 200`).all(...params));
});
r.post('/errors/:id/resolve', coMaQuyenNay('operations.manage'), (req, res) => {
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ loi: 'Cần ghi chú cách xử lý' });
    const result = db.prepare(`UPDATE operational_error_events SET status='RESOLVED',resolved_by=?,
        resolved_at=datetime('now','localtime'),resolution_note=? WHERE id=? AND status='OPEN'`)
      .run(req.session.nguoiDung.id, note.slice(0, 1000), req.params.id);
    if (!result.changes) return res.status(409).json({ loi: 'Lỗi không tồn tại hoặc đã được xử lý' });
    res.json({ ok: true });
});

module.exports = r;
