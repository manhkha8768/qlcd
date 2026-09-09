const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyen, donViDuocPhep } = require('../middleware/quyen');
const { interactionAudit } = require('../lib/interaction-audit');

const r = express.Router();
r.use(dangNhap);

function scopeSql(user, column, params) {
    const scope = donViDuocPhep(user);
    if (scope === null) return '1=1';
    if (!scope.length) return '1=0';
    params.push(...scope);
    return `${column} IN (${scope.map(() => '?').join(',')})`;
}

r.get('/', (req, res) => {
    const raw = String(req.query.q || '').trim();
    if (raw.length < 2) return res.json({ query: raw, groups: [], total: 0 });
    if (raw.length > 120) return res.status(400).json({ loi: 'Từ khóa tìm kiếm quá dài' });
    const like = `%${raw.replace(/[\\%_]/g, '\\$&')}%`;
    const user = req.session.nguoiDung;
    const groups = [];

    if (coMaQuyen(req, 'asset.view')) {
        const params = [];
        const scope = scopeSql(user, 'a.don_vi_id', params);
        params.push(like, like, like, like);
        const items = db.prepare(`SELECT a.id,a.ma_tai_san code,a.ten title,px.ten_ngan subtitle,
            'tai-san' screen,'asset_id' param_name
            FROM assets a JOIN phan_xuong px ON px.id=a.don_vi_id
            WHERE a.hoat_dong=1 AND NOT EXISTS (SELECT 1 FROM thiet_bi_deletions td
              WHERE td.thiet_bi_id=a.legacy_thiet_bi_id)
              AND ${scope} AND (a.ma_tai_san LIKE ? ESCAPE '\\' OR a.ten LIKE ? ESCAPE '\\'
              OR EXISTS (SELECT 1 FROM asset_device_links l JOIN devices d ON d.id=l.device_id
                WHERE l.asset_id=a.id AND l.den_ngay IS NULL AND (d.ma_thiet_bi LIKE ? ESCAPE '\\' OR d.so_seri LIKE ? ESCAPE '\\')))
            ORDER BY a.ma_tai_san LIMIT 8`).all(...params);
        if (items.length) groups.push({ type: 'ASSET', label: 'Thiết bị', items });
    }

    if (coMaQuyen(req, 'technical_operation.view')) {
        const params = [];
        const scope = scopeSql(user, 'd.don_vi_id', params);
        params.push(like, like, like);
        const items = db.prepare(`SELECT w.id,w.work_order_code code,w.description title,d.ma_thiet_bi subtitle,
            'sua-chua' screen,'work_order_id' param_name
            FROM technical_work_orders w JOIN devices d ON d.id=w.device_id
            WHERE ${scope} AND (w.work_order_code LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR d.ma_thiet_bi LIKE ? ESCAPE '\\')
            ORDER BY w.created_at DESC LIMIT 6`).all(...params);
        if (items.length) groups.push({ type: 'WORK_ORDER', label: 'Work Order', items });
    }

    if (coMaQuyen(req, 'material.view')) {
        const items = db.prepare(`SELECT id,material_code code,name title,base_uom_code subtitle,
            'material-master' screen,'material_id' param_name FROM materials
            WHERE status='ACTIVE' AND (material_code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
            ORDER BY material_code LIMIT 6`).all(like, like);
        if (items.length) groups.push({ type: 'MATERIAL', label: 'Vật tư', items });
    }

    const total = groups.reduce((n, group) => n + group.items.length, 0);
    interactionAudit(req, 'GLOBAL_SEARCH', 'search', null, { query: raw, total,
        result_types: groups.map(group => ({ type: group.type, count: group.items.length })) });
    res.json({ query: raw, groups, total });
});

module.exports = r;
