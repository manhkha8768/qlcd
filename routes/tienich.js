const express = require('express');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { quyenCuaToi, donViDuocPhep } = require('../middleware/quyen-ma');

const r = express.Router();
r.use(dangNhap);

/* ==================== THÔNG BÁO ==================== */
r.get('/thong-bao', (req, res) => {
    const id = req.session.nguoiDung.id;
    res.json({
        chua_doc: db.prepare('SELECT COUNT(*) n FROM thong_bao WHERE nguoi_nhan_id=? AND da_doc=0').get(id).n,
        danh_sach: db.prepare(`SELECT * FROM thong_bao WHERE nguoi_nhan_id=?
                               ORDER BY da_doc, ngay_tao DESC LIMIT 30`).all(id)
    });
});

r.post('/thong-bao/:id/da-doc', (req, res) => {
    db.prepare(`UPDATE thong_bao SET da_doc=1, ngay_doc=datetime('now','localtime')
                WHERE id=? AND nguoi_nhan_id=?`).run(req.params.id, req.session.nguoiDung.id);
    res.json({ ok: true });
});

r.post('/thong-bao/doc-het', (req, res) => {
    db.prepare(`UPDATE thong_bao SET da_doc=1, ngay_doc=datetime('now','localtime')
                WHERE nguoi_nhan_id=? AND da_doc=0`).run(req.session.nguoiDung.id);
    res.json({ ok: true });
});

/* ==================== QUYỀN CỦA TÔI ==================== */
r.get('/quyen-cua-toi', (req, res) => {
    res.json({ quyen: quyenCuaToi(req.session.nguoiDung),
               don_vi: donViDuocPhep(req.session.nguoiDung) });
});

/* ==================== LỊCH SỬ BIẾN ĐỘNG TÀI SẢN ==================== */
r.get('/lich-su-tai-san/:thietBiId', (req, res) => {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.thietBiId);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });

    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(tb.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Bạn không có quyền xem tài sản của đơn vị này' });
    }

    res.json(db.prepare(`
        SELECT ls.*, gd.ma_giao_dich, gd.loai_giao_dich, gd.ly_do AS ly_do_gd,
               pxt.ten_ngan AS don_vi_truoc, pxs.ten_ngan AS don_vi_sau,
               nd.ho_ten AS nguoi_thuc_hien
        FROM lich_su_tai_san ls
        LEFT JOIN giao_dich gd  ON gd.id = ls.giao_dich_id
        LEFT JOIN phan_xuong pxt ON pxt.id = ls.don_vi_truoc_id
        LEFT JOIN phan_xuong pxs ON pxs.id = ls.don_vi_sau_id
        LEFT JOIN nguoi_dung nd  ON nd.id = ls.nguoi_thuc_hien_id
        WHERE ls.thiet_bi_id=?
        ORDER BY ls.ngay_su_kien DESC, ls.id DESC`).all(tb.id));
});

/* ==================== GIAO DỊCH CỦA MỘT ĐƠN VỊ ==================== */
r.get('/giao-dich-don-vi/:donViId', (req, res) => {
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(req.params.donViId))) {
        return res.status(403).json({ loi: 'Bạn không có quyền xem đơn vị này' });
    }
    const id = req.params.donViId;
    res.json({
        tang: db.prepare(`SELECT * FROM v_giao_dich WHERE loai_giao_dich='tang'
                          AND don_vi_dich_id=? ORDER BY ngay_giao_dich DESC LIMIT 50`).all(id),
        giam: db.prepare(`SELECT * FROM v_giao_dich WHERE loai_giao_dich='giam'
                          AND don_vi_nguon_id=? ORDER BY ngay_giao_dich DESC LIMIT 50`).all(id),
        chuyen_di: db.prepare(`SELECT * FROM v_giao_dich WHERE loai_giao_dich='dieu_chuyen'
                               AND don_vi_nguon_id=? ORDER BY ngay_giao_dich DESC LIMIT 50`).all(id),
        chuyen_den: db.prepare(`SELECT * FROM v_giao_dich WHERE loai_giao_dich='dieu_chuyen'
                                AND don_vi_dich_id=? ORDER BY ngay_giao_dich DESC LIMIT 50`).all(id)
    });
});

module.exports = r;
