const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyenNay, duocThaoTacDonVi } = require('../middleware/quyen');
const r = express.Router();
r.use(dangNhap);

r.get('/', coMaQuyenNay('quantri.nhatky'), (req, res) => {
    const type = String(req.query.entity_type || '').toUpperCase();
    const id = Number(req.query.entity_id);
    if (!['ASSET','DEVICE'].includes(type) || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ loi: 'Đối tượng audit không hợp lệ' });
    }
    const entity = type === 'ASSET'
        ? db.prepare('SELECT id,don_vi_id FROM assets WHERE id=?').get(id)
        : db.prepare('SELECT id,don_vi_id FROM devices WHERE id=?').get(id);
    if (!entity) return res.status(404).json({ loi: 'Không tìm thấy đối tượng' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, entity.don_vi_id)) {
        return res.status(403).json({ loi: 'Không có quyền xem audit ngoài phạm vi' });
    }
    const table = type === 'ASSET' ? 'assets' : 'devices';
    const actions = type === 'ASSET'
        ? ['ASSET_PROFILE_VIEW','ASSET_QR_RESOLVE'] : ['DEVICE_PROFILE_VIEW'];
    const marks = actions.map(() => '?').join(',');
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 30));
    const args = [table, id, ...actions];
    const sqlBase = `FROM nhat_ky_he_thong nav
        JOIN nguoi_dung u ON u.id=nav.nguoi_id
        WHERE nav.bang=? AND nav.ban_ghi_id=? AND nav.hanh_dong IN (${marks})`;
    const tong = db.prepare(`SELECT COUNT(*) n ${sqlBase}`).get(...args).n;
    const items = db.prepare(`SELECT nav.id,nav.hanh_dong,nav.noi_dung,nav.thoi_gian,
        u.ho_ten,u.ten_dang_nhap ${sqlBase} ORDER BY nav.id DESC LIMIT ? OFFSET ?`)
        .all(...args, size, (page - 1) * size).map(x => {
            try { return { ...x, chi_tiet: JSON.parse(x.noi_dung || '{}'), noi_dung: undefined }; }
            catch (_) { return { ...x, chi_tiet: {}, noi_dung: undefined }; }
        });
    res.json({ tong, page, size, items });
});
module.exports = r;
