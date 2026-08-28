/**
 * KIỂM ĐỊNH THIẾT BỊ
 *
 * Ngày hết hạn tính tự động từ ngày kiểm định cộng chu kỳ của loại kiểm định,
 * người dùng vẫn sửa tay được nếu giấy chứng nhận ghi khác.
 */
const express = require('express');
const db = require('../db');
const { dangNhap, duocGhi, gioiHanPX, duocThaoTacPX } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);

r.get('/', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = `SELECT k.*, l.ten AS ten_loai, l.ma AS ma_loai, l.chu_ky_thang,
                      tb.ma_tb, tb.ten AS ten_tb, px.ten_ngan AS px,
                      CAST(julianday(k.ngay_het_han) - julianday(date('now','localtime')) AS INTEGER) AS con_lai_ngay
               FROM kiem_dinh k
               JOIN loai_kiem_dinh l ON l.id = k.loai_kiem_dinh_id
               JOIN thiet_bi tb      ON tb.id = k.thiet_bi_id
               LEFT JOIN phan_xuong px ON px.id = tb.phan_xuong_id
               WHERE 1=1`;
    const p = [];
    if (gh !== null) { sql += ' AND tb.phan_xuong_id=?'; p.push(gh); }
    if (req.query.thiet_bi_id) { sql += ' AND k.thiet_bi_id=?'; p.push(req.query.thiet_bi_id); }
    if (req.query.loai_id) { sql += ' AND k.loai_kiem_dinh_id=?'; p.push(req.query.loai_id); }
    sql += ' ORDER BY k.ngay_het_han LIMIT 500';
    res.json(db.prepare(sql).all(...p));
});

/** Các loại kiểm định mà một thiết bị bắt buộc phải có, kèm hồ sơ mới nhất */
r.get('/can-lam/:thietBiId', (req, res) => {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.thietBiId);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });

    res.json(db.prepare(`
        SELECT l.id, l.ma, l.ten, l.chu_ky_thang, l.can_cu_phap_ly, l.canh_bao_truoc_ngay,
               k.ngay_kiem_dinh, k.ngay_het_han, k.so_giay_cn, k.ket_qua,
               CAST(julianday(k.ngay_het_han) - julianday(date('now','localtime')) AS INTEGER) AS con_lai_ngay
        FROM ap_dung_kiem_dinh adk
        JOIN loai_kiem_dinh l ON l.id = adk.loai_kiem_dinh_id
        LEFT JOIN v_kiem_dinh_hien_hanh k
               ON k.thiet_bi_id = ? AND k.loai_kiem_dinh_id = l.id
        WHERE adk.nhom_id = ?
        ORDER BY l.ma`).all(tb.id, tb.nhom_id));
});

r.post('/', duocGhi, (req, res) => {
    const b = req.body || {};
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });

    const loai = db.prepare('SELECT * FROM loai_kiem_dinh WHERE id=?').get(b.loai_kiem_dinh_id);
    if (!loai) return res.status(400).json({ loi: 'Chọn loại kiểm định' });
    if (!b.ngay_kiem_dinh) return res.status(400).json({ loi: 'Nhập ngày kiểm định' });

    const hetHan = b.ngay_het_han || db.prepare(`SELECT date(?, '+' || ? || ' months') t`)
        .get(b.ngay_kiem_dinh, loai.chu_ky_thang).t;

    const info = db.prepare(`
        INSERT INTO kiem_dinh (thiet_bi_id, loai_kiem_dinh_id, ngay_kiem_dinh, ngay_het_han,
            don_vi_kiem_dinh, so_giay_cn, ket_qua, ket_luan, chi_phi, nguoi_nhap_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(tb.id, loai.id, b.ngay_kiem_dinh, hetHan, b.don_vi_kiem_dinh || null,
           b.so_giay_cn || null, b.ket_qua || 'dat', b.ket_luan || null,
           b.chi_phi || 0, req.session.nguoiDung.id);

    // Kiểm định không đạt thì dừng thiết bị lại
    if (b.ket_qua === 'khong_dat') {
        db.prepare("UPDATE thiet_bi SET trang_thai='dang_sua', tinh_trang_kt='kem' WHERE id=?").run(tb.id);
    }
    res.json({ id: info.lastInsertRowid, ngay_het_han: hetHan });
});

r.put('/:id', duocGhi, (req, res) => {
    const k = db.prepare('SELECT * FROM kiem_dinh WHERE id=?').get(req.params.id);
    if (!k) return res.status(404).json({ loi: 'Không tìm thấy hồ sơ kiểm định' });
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(k.thiet_bi_id);
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });

    const b = req.body || {};
    db.prepare(`UPDATE kiem_dinh SET ngay_kiem_dinh=?, ngay_het_han=?, don_vi_kiem_dinh=?,
                       so_giay_cn=?, ket_qua=?, ket_luan=?, chi_phi=? WHERE id=?`)
      .run(b.ngay_kiem_dinh ?? k.ngay_kiem_dinh, b.ngay_het_han ?? k.ngay_het_han,
           b.don_vi_kiem_dinh ?? k.don_vi_kiem_dinh, b.so_giay_cn ?? k.so_giay_cn,
           b.ket_qua ?? k.ket_qua, b.ket_luan ?? k.ket_luan, b.chi_phi ?? k.chi_phi, k.id);
    res.json({ ok: true });
});

r.delete('/:id', duocGhi, (req, res) => {
    const k = db.prepare('SELECT * FROM kiem_dinh WHERE id=?').get(req.params.id);
    if (!k) return res.status(404).json({ loi: 'Không tìm thấy hồ sơ kiểm định' });
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(k.thiet_bi_id);
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    db.prepare('DELETE FROM kiem_dinh WHERE id=?').run(k.id);
    res.json({ ok: true });
});

module.exports = r;
