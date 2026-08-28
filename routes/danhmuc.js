const express = require('express');
const db = require('../db');
const { dangNhap, chiAdmin, gioiHanPX } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);

/* =====================================================================
   PHÂN XƯỞNG - admin toàn quyền thêm/sửa/xoá, người khác chỉ xem
   ===================================================================== */

r.get('/phan-xuong', (req, res) => {
    const chiHoatDong = req.query.tat_ca ? '' : 'WHERE px.hoat_dong = 1';
    res.json(db.prepare(`
        SELECT px.*,
               (SELECT COUNT(*) FROM thiet_bi tb
                 WHERE tb.phan_xuong_id = px.id
                   AND tb.trang_thai <> 'da_thanh_ly') AS so_thiet_bi
        FROM phan_xuong px
        ${chiHoatDong}
        ORDER BY px.thu_tu, px.ma`).all());
});

r.post('/phan-xuong', chiAdmin, (req, res) => {
    const { ma, ten, ten_ngan, loai, quan_doc, co_dien_truong, so_nhan_luc, thu_tu } = req.body || {};
    if (!ma || !ten) return res.status(400).json({ loi: 'Thiếu mã hoặc tên phân xưởng' });

    try {
        const info = db.prepare(`
            INSERT INTO phan_xuong (ma, ten, ten_ngan, loai, quan_doc, co_dien_truong, so_nhan_luc, thu_tu)
            VALUES (?,?,?,?,?,?,?,?)`)
          .run(ma.trim().toUpperCase(), ten.trim(), (ten_ngan || ma).trim(),
               loai || 'san_xuat', quan_doc || null, co_dien_truong || null,
               Number(so_nhan_luc) || 0, Number(thu_tu) || 0);
        ghiNhatKy(req, 'them_phan_xuong', 'phan_xuong', info.lastInsertRowid, `${ma} - ${ten}`);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: `Mã phân xưởng "${ma}" đã tồn tại` });
        throw e;
    }
});

r.put('/phan-xuong/:id', chiAdmin, (req, res) => {
    const px = db.prepare('SELECT * FROM phan_xuong WHERE id = ?').get(req.params.id);
    if (!px) return res.status(404).json({ loi: 'Không tìm thấy phân xưởng' });

    const b = req.body || {};
    db.prepare(`UPDATE phan_xuong SET ma=?, ten=?, ten_ngan=?, loai=?, quan_doc=?,
                       co_dien_truong=?, so_nhan_luc=?, thu_tu=?, hoat_dong=?
                WHERE id=?`)
      .run((b.ma ?? px.ma).toUpperCase(), b.ten ?? px.ten, b.ten_ngan ?? px.ten_ngan,
           b.loai ?? px.loai, b.quan_doc ?? px.quan_doc, b.co_dien_truong ?? px.co_dien_truong,
           b.so_nhan_luc ?? px.so_nhan_luc, b.thu_tu ?? px.thu_tu,
           b.hoat_dong === undefined ? px.hoat_dong : (b.hoat_dong ? 1 : 0), px.id);
    ghiNhatKy(req, 'sua_phan_xuong', 'phan_xuong', px.id, px.ma);
    res.json({ ok: true });
});

/**
 * Xoá phân xưởng. Chặn nếu còn dữ liệu gắn với nó - gợi ý ngừng hoạt động thay vì xoá,
 * để không mất lịch sử thiết bị đã từng thuộc phân xưởng đó.
 */
r.delete('/phan-xuong/:id', chiAdmin, (req, res) => {
    const px = db.prepare('SELECT * FROM phan_xuong WHERE id = ?').get(req.params.id);
    if (!px) return res.status(404).json({ loi: 'Không tìm thấy phân xưởng' });

    const rb = {
        'thiết bị':      db.prepare('SELECT COUNT(*) n FROM thiet_bi WHERE phan_xuong_id=?').get(px.id).n,
        'tài khoản':     db.prepare('SELECT COUNT(*) n FROM nguoi_dung WHERE phan_xuong_id=?').get(px.id).n,
        'lô import':     db.prepare('SELECT COUNT(*) n FROM lo_import WHERE phan_xuong_id=?').get(px.id).n,
        'vị trí':        db.prepare('SELECT COUNT(*) n FROM vi_tri WHERE phan_xuong_id=?').get(px.id).n
    };
    const vuong = Object.entries(rb).filter(([, n]) => n > 0);
    if (vuong.length) {
        return res.status(400).json({
            loi: `Không thể xoá: phân xưởng còn ${vuong.map(([k, n]) => `${n} ${k}`).join(', ')}. ` +
                 `Hãy chuyển dữ liệu sang phân xưởng khác, hoặc đặt phân xưởng về trạng thái ngừng hoạt động.`,
            rang_buoc: rb
        });
    }
    db.prepare('DELETE FROM phan_xuong WHERE id = ?').run(px.id);
    ghiNhatKy(req, 'xoa_phan_xuong', 'phan_xuong', px.id, `${px.ma} - ${px.ten}`);
    res.json({ ok: true });
});

/* =====================================================================
   NHÓM THIẾT BỊ
   ===================================================================== */

r.get('/nhom-thiet-bi', (req, res) => {
    res.json(db.prepare(`
        SELECT n.*, nc.ten AS ten_cha, nc.ma AS ma_cha,
               (SELECT COUNT(*) FROM thiet_bi tb WHERE tb.nhom_id = n.id) AS so_thiet_bi
        FROM nhom_thiet_bi n
        LEFT JOIN nhom_thiet_bi nc ON nc.id = n.parent_id
        ORDER BY COALESCE(nc.thu_tu, n.thu_tu), n.cap, n.thu_tu, n.ma`).all());
});

r.post('/nhom-thiet-bi', chiAdmin, (req, res) => {
    const { parent_id, ma, ten, yeu_cau_kiem_dinh, theo_doi_gio_chay, thu_tu } = req.body || {};
    if (!ma || !ten) return res.status(400).json({ loi: 'Thiếu mã hoặc tên nhóm' });
    try {
        const info = db.prepare(`
            INSERT INTO nhom_thiet_bi (parent_id, ma, ten, cap, yeu_cau_kiem_dinh, theo_doi_gio_chay, thu_tu)
            VALUES (?,?,?,?,?,?,?)`)
          .run(parent_id || null, ma.trim().toUpperCase(), ten.trim(), parent_id ? 2 : 1,
               yeu_cau_kiem_dinh ? 1 : 0, theo_doi_gio_chay ? 1 : 0, Number(thu_tu) || 0);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Mã nhóm đã tồn tại' });
        throw e;
    }
});

/* =====================================================================
   VỊ TRÍ LẮP ĐẶT
   ===================================================================== */

r.get('/vi-tri', (req, res) => {
    const gh = gioiHanPX(req);
    const px = req.query.phan_xuong_id || gh;
    let sql = `SELECT vt.*, vc.ten AS ten_cha, px.ten_ngan AS px
               FROM vi_tri vt
               LEFT JOIN vi_tri vc ON vc.id = vt.parent_id
               LEFT JOIN phan_xuong px ON px.id = vt.phan_xuong_id
               WHERE vt.hoat_dong = 1`;
    const p = [];
    if (px) { sql += ' AND (vt.phan_xuong_id = ? OR vt.phan_xuong_id IS NULL)'; p.push(px); }
    sql += ' ORDER BY vt.cap, vt.ma';
    res.json(db.prepare(sql).all(...p));
});

r.post('/vi-tri', (req, res) => {
    const { parent_id, ma, ten, cap, loai, phan_xuong_id, ghi_chu } = req.body || {};
    if (!ma || !ten) return res.status(400).json({ loi: 'Thiếu mã hoặc tên vị trí' });
    const gh = gioiHanPX(req);
    const pxId = gh !== null ? gh : (phan_xuong_id || null);
    try {
        const info = db.prepare(`
            INSERT INTO vi_tri (parent_id, ma, ten, cap, loai, phan_xuong_id, ghi_chu)
            VALUES (?,?,?,?,?,?,?)`)
          .run(parent_id || null, ma.trim().toUpperCase(), ten.trim(),
               Number(cap) || 1, loai || 'ham_lo', pxId, ghi_chu || null);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Mã vị trí đã tồn tại' });
        throw e;
    }
});

/* =====================================================================
   MODEL THIẾT BỊ
   ===================================================================== */

r.get('/model', (req, res) => {
    let sql = `SELECT m.*, n.ten AS ten_nhom, n.ma AS ma_nhom
               FROM model_thiet_bi m JOIN nhom_thiet_bi n ON n.id = m.nhom_id`;
    const p = [];
    if (req.query.nhom_id) { sql += ' WHERE m.nhom_id = ?'; p.push(req.query.nhom_id); }
    sql += ' ORDER BY n.ma, m.ma_model';
    res.json(db.prepare(sql).all(...p));
});

r.post('/model', (req, res) => {
    const b = req.body || {};
    if (!b.ma_model || !b.ten || !b.nhom_id) return res.status(400).json({ loi: 'Thiếu mã model, tên hoặc nhóm' });
    try {
        const info = db.prepare(`
            INSERT INTO model_thiet_bi (nhom_id, ma_model, ten, hang_sx, nuoc_sx, cong_suat_kw,
                                        dien_ap_v, nang_suat, chu_ky_bd_thang, ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(b.nhom_id, b.ma_model.trim(), b.ten.trim(), b.hang_sx || null, b.nuoc_sx || null,
               b.cong_suat_kw || null, b.dien_ap_v || null, b.nang_suat || null,
               b.chu_ky_bd_thang || null, b.ghi_chu || null);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Mã model đã tồn tại' });
        throw e;
    }
});

/* =====================================================================
   LOẠI KIỂM ĐỊNH & CẤU HÌNH
   ===================================================================== */

r.get('/loai-kiem-dinh', (req, res) => {
    res.json(db.prepare('SELECT * FROM loai_kiem_dinh ORDER BY ma').all());
});

r.get('/cau-hinh', (req, res) => {
    res.json(db.prepare('SELECT * FROM cau_hinh ORDER BY khoa').all());
});

r.put('/cau-hinh/:khoa', chiAdmin, (req, res) => {
    db.prepare(`INSERT INTO cau_hinh (khoa, gia_tri) VALUES (?,?)
                ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri`)
      .run(req.params.khoa, String(req.body.gia_tri ?? ''));
    res.json({ ok: true });
});

/* --------------------------------------------------------------- */
function ghiNhatKy(req, hanhDong, bang, id, noiDung) {
    db.prepare(`INSERT INTO nhat_ky_he_thong (nguoi_id, hanh_dong, bang, ban_ghi_id, noi_dung)
                VALUES (?,?,?,?,?)`)
      .run(req.session.nguoiDung.id, hanhDong, bang, id, noiDung);
}

module.exports = r;
module.exports.ghiNhatKy = ghiNhatKy;
