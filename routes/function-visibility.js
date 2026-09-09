const express = require('express');
const db = require('../db');
const { dangNhap, chiAdmin, quyenCuaToi } = require('../middleware/quyen');
const { effectiveScreens } = require('../lib/function-visibility');
const r = express.Router();
r.use(dangNhap);

r.get('/mine', (req, res) => res.json({
    screens: effectiveScreens(req.session.nguoiDung, quyenCuaToi(req.session.nguoiDung))
}));

r.get('/', chiAdmin, (req, res) => {
    res.json(db.prepare(`SELECT role_code, screen_code, enabled, updated_at
        FROM function_visibility ORDER BY role_code, screen_code`).all());
});

r.put('/:role/:screen', chiAdmin, (req, res) => {
    const role = String(req.params.role || '').trim();
    const screen = String(req.params.screen || '').trim();
    if (!/^[a-z0-9_-]{1,50}$/.test(role) || !/^[a-z0-9_-]{1,60}$/.test(screen)) {
        return res.status(400).json({ loi: 'Mã vai trò hoặc chức năng không hợp lệ' });
    }
    const enabled = req.body?.enabled ? 1 : 0;
    const old = db.prepare('SELECT * FROM function_visibility WHERE role_code=? AND screen_code=?').get(role, screen);
    db.prepare(`INSERT INTO function_visibility(role_code,screen_code,enabled,updated_by)
        VALUES (?,?,?,?) ON CONFLICT(role_code,screen_code) DO UPDATE SET
        enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=datetime('now','localtime')`)
      .run(role, screen, enabled, req.session.nguoiDung.id);
    db.prepare(`INSERT INTO nhat_ky_he_thong(nguoi_id,hanh_dong,bang,ban_ghi_id,noi_dung)
        VALUES (?,?,?,?,?)`).run(req.session.nguoiDung.id, 'function_visibility', 'function_visibility',
        `${role}:${screen}`, JSON.stringify({ old: old?.enabled ?? null, enabled }));
    res.json({ ok: true, role_code: role, screen_code: screen, enabled: !!enabled });
});

module.exports = r;
