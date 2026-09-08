const express = require('express');
const db = require('../db');
const { dangNhap, duocGhi, duocDuyet, gioiHanPX, duocThaoTacPX, donViDuocPhep } = require('../middleware/quyen');
const { sinhMa } = require('../lib/ma-thiet-bi');

const r = express.Router();
r.use(dangNhap);

/* ---------- Danh sách thiết bị ---------- */
r.get('/', (req, res) => {
    const scope = donViDuocPhep(req.session.nguoiDung);
    let sql = `SELECT tb.id, tb.ma_tb, tb.ten, tb.so_seri, tb.nam_sx, tb.ma_tscd, tb.loai_ts,
                      d.id AS device_id, a.id AS asset_id,
                      tb.so_luong, tb.dvt, tb.nguyen_gia, tb.gia_tri_con_lai, tb.ngay_su_dung,
                      tb.trang_thai, tb.tinh_trang_kt, tb.trang_thai_duyet, tb.gio_chay_luy_ke,
                      n.ma AS ma_nhom, n.ten AS ten_nhom,
                      px.id AS px_id, px.ten_ngan AS px, vt.ten AS vi_tri
               FROM thiet_bi tb
               LEFT JOIN nhom_thiet_bi n ON n.id = tb.nhom_id
               LEFT JOIN phan_xuong px   ON px.id = tb.phan_xuong_id
               LEFT JOIN vi_tri vt       ON vt.id = tb.vi_tri_id
               LEFT JOIN devices d       ON d.legacy_thiet_bi_id = tb.id
               LEFT JOIN assets a        ON a.legacy_thiet_bi_id = tb.id
               WHERE 1=1`;
    const p = [];

    if (req.query.phan_xuong_id) {
        const requestedUnit = Number(req.query.phan_xuong_id);
        if (!Number.isInteger(requestedUnit) || requestedUnit <= 0) return res.status(400).json({ loi: 'Phân xưởng không hợp lệ' });
        if (!duocThaoTacPX(req, requestedUnit)) return res.status(403).json({ loi: 'Không có quyền xem dữ liệu của phân xưởng này' });
        sql += ' AND tb.phan_xuong_id = ?'; p.push(requestedUnit);
    } else if (scope !== null) {
        if (!scope.length) sql += ' AND 1=0';
        else { sql += ` AND tb.phan_xuong_id IN (${scope.map(() => '?').join(',')})`; p.push(...scope); }
    }

    if (req.query.nhom_id)    { sql += ' AND tb.nhom_id = ?'; p.push(req.query.nhom_id); }
    if (req.query.trang_thai) { sql += ' AND tb.trang_thai = ?'; p.push(req.query.trang_thai); }
    if (req.query.loai_ts)    { sql += ' AND tb.loai_ts = ?'; p.push(req.query.loai_ts); }
    if (req.query.duyet)      { sql += ' AND tb.trang_thai_duyet = ?'; p.push(req.query.duyet); }
    if (req.query.q) {
        sql += ' AND (tb.ma_tb LIKE ? OR tb.ten LIKE ? OR tb.ma_tscd LIKE ? OR tb.so_seri LIKE ?)';
        const k = '%' + req.query.q.trim() + '%';
        p.push(k, k, k, k);
    }

    const dem = db.prepare(`SELECT COUNT(*) n FROM (${sql})`).get(...p).n;
    const trang = Math.max(1, Number(req.query.trang) || 1);
    const moiTrang = Math.min(500, Number(req.query.moi_trang) || 50);
    sql += ' ORDER BY tb.ma_tb LIMIT ? OFFSET ?';
    p.push(moiTrang, (trang - 1) * moiTrang);

    res.json({ tong: dem, trang, moi_trang: moiTrang, danh_sach: db.prepare(sql).all(...p) });
});

/* ---------- Hồ sơ chi tiết ---------- */
r.get('/:id', (req, res) => {
    const tb = db.prepare(`
        SELECT tb.*, d.id AS device_id, a.id AS asset_id,
               n.ma AS ma_nhom, n.ten AS ten_nhom, nc.ten AS ten_nhom_cha,
               m.ma_model, m.hang_sx AS model_hang, m.cong_suat_kw,
               px.ten AS ten_px, px.ten_ngan AS px, vt.ten AS ten_vi_tri
        FROM thiet_bi tb
        LEFT JOIN nhom_thiet_bi n  ON n.id = tb.nhom_id
        LEFT JOIN nhom_thiet_bi nc ON nc.id = n.parent_id
        LEFT JOIN model_thiet_bi m ON m.id = tb.model_id
        LEFT JOIN phan_xuong px    ON px.id = tb.phan_xuong_id
        LEFT JOIN vi_tri vt        ON vt.id = tb.vi_tri_id
        LEFT JOIN devices d        ON d.legacy_thiet_bi_id = tb.id
        LEFT JOIN assets a         ON a.legacy_thiet_bi_id = tb.id
        WHERE tb.id = ?`).get(req.params.id);

    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id) && gioiHanPX(req) !== null) {
        return res.status(403).json({ loi: 'Không có quyền xem thiết bị của phân xưởng khác' });
    }

    res.json({
        thiet_bi: tb,
        thong_so: db.prepare('SELECT * FROM thong_so_thiet_bi WHERE thiet_bi_id=? ORDER BY thu_tu').all(tb.id),
        lich_su_vi_tri: db.prepare(`
            SELECT l.*, px.ten_ngan AS px, vt.ten AS vi_tri
            FROM lich_su_vi_tri l
            LEFT JOIN phan_xuong px ON px.id = l.phan_xuong_id
            LEFT JOIN vi_tri vt ON vt.id = l.vi_tri_id
            WHERE l.thiet_bi_id=? ORDER BY l.tu_ngay DESC`).all(tb.id),
        sua_chua: db.prepare(`SELECT id, so_phieu, loai, ngay_bat_dau, ngay_hoan_thanh,
                                     mo_ta_hu_hong, tong_chi_phi, trang_thai
                              FROM phieu_sua_chua WHERE thiet_bi_id=?
                              ORDER BY COALESCE(ngay_bat_dau, ngay_tao) DESC`).all(tb.id),
        kiem_dinh: db.prepare(`SELECT k.*, l.ten AS ten_loai
                               FROM kiem_dinh k JOIN loai_kiem_dinh l ON l.id=k.loai_kiem_dinh_id
                               WHERE k.thiet_bi_id=? ORDER BY k.ngay_kiem_dinh DESC`).all(tb.id),
        ho_so: db.prepare(`SELECT * FROM ho_so_dinh_kem
                           WHERE doi_tuong_loai='thiet_bi' AND doi_tuong_id=?
                           ORDER BY ngay_tai DESC`).all(tb.id)
    });
});

/* ---------- Thêm mới ---------- */
r.post('/', duocGhi, (req, res) => {
    const b = req.body || {};
    const gh = gioiHanPX(req);
    const pxId = gh !== null ? gh : b.phan_xuong_id;
    if (!b.ten || !b.nhom_id || !pxId) {
        return res.status(400).json({ loi: 'Thiếu tên, nhóm thiết bị hoặc phân xưởng' });
    }
    if (!duocThaoTacPX(req, pxId)) return res.status(403).json({ loi: 'Không có quyền' });

    const ma = (b.ma_tb || '').trim() || sinhMa(pxId, b.nhom_id);
    try {
        const info = db.prepare(`
            INSERT INTO thiet_bi (ma_tb, ten, model_id, nhom_id, so_seri, nam_sx, nuoc_sx,
                ma_tscd, loai_ts, nguyen_gia, gia_tri_con_lai, ngay_su_dung, phan_xuong_id,
                vi_tri_id, so_luong, dvt, trang_thai, tinh_trang_kt, nguoi_tao_id,
                trang_thai_duyet, ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'cho_duyet',?)`)
          .run(ma, b.ten.trim(), b.model_id || null, b.nhom_id, b.so_seri || null,
               b.nam_sx || null, b.nuoc_sx || null, b.ma_tscd || null, b.loai_ts || 'TSCD',
               b.nguyen_gia || 0, b.gia_tri_con_lai || 0, b.ngay_su_dung || null,
               pxId, b.vi_tri_id || null, b.so_luong || 1, b.dvt || 'Cái',
               b.trang_thai || 'hoat_dong', b.tinh_trang_kt || 'tot',
               req.session.nguoiDung.id, b.ghi_chu || null);

        db.prepare(`INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, vi_tri_id, tu_ngay)
                    VALUES (?,?,?,COALESCE(?, date('now','localtime')))`)
          .run(info.lastInsertRowid, pxId, b.vi_tri_id || null, b.ngay_su_dung || null);

        res.json({ id: info.lastInsertRowid, ma_tb: ma });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: `Mã thiết bị "${ma}" đã tồn tại` });
        throw e;
    }
});

/* ---------- Cập nhật ---------- */
r.put('/:id', duocGhi, (req, res) => {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });

    const b = req.body || {};
    const truong = ['ten', 'model_id', 'nhom_id', 'so_seri', 'nam_sx', 'nuoc_sx', 'ma_tscd',
                    'loai_ts', 'nguyen_gia', 'gia_tri_con_lai', 'ngay_su_dung', 'vi_tri_id',
                    'so_luong', 'dvt', 'trang_thai', 'tinh_trang_kt', 'ghi_chu'];
    const gt = truong.map(t => b[t] !== undefined ? b[t] : tb[t]);
    db.prepare(`UPDATE thiet_bi SET ${truong.map(t => t + '=?').join(', ')},
                       ngay_sua = datetime('now','localtime') WHERE id=?`).run(...gt, tb.id);
    res.json({ ok: true });
});

r.delete('/:id', duocGhi, (req, res) => {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    if (tb.trang_thai_duyet === 'da_duyet' && req.session.nguoiDung.vai_tro !== 'admin') {
        return res.status(400).json({ loi: 'Thiết bị đã duyệt - chỉ admin mới xoá được' });
    }
    db.prepare('DELETE FROM thiet_bi WHERE id=?').run(tb.id);
    res.json({ ok: true });
});

/* ---------- Phê duyệt: Đồng ý / Chuyển lại ---------- */
r.post('/:id/dong-y', duocDuyet, (req, res) => {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    db.prepare("UPDATE thiet_bi SET trang_thai_duyet='da_duyet' WHERE id=?").run(tb.id);
    db.prepare(`INSERT INTO phe_duyet (doi_tuong_loai, doi_tuong_id, hanh_dong, nguoi_id)
                VALUES ('thiet_bi',?,'dong_y',?)`).run(tb.id, req.session.nguoiDung.id);
    res.json({ ok: true });
});

r.post('/:id/chuyen-lai', duocDuyet, (req, res) => {
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do khi chuyển lại' });
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    db.prepare("UPDATE thiet_bi SET trang_thai_duyet='chuyen_lai' WHERE id=?").run(tb.id);
    db.prepare(`INSERT INTO phe_duyet (doi_tuong_loai, doi_tuong_id, hanh_dong, ly_do, nguoi_id)
                VALUES ('thiet_bi',?,'chuyen_lai',?,?)`).run(tb.id, lyDo, req.session.nguoiDung.id);
    res.json({ ok: true });
});

/** Duyệt hàng loạt theo lô import */
r.post('/duyet-lo/:loId', duocDuyet, (req, res) => {
    const n = db.prepare(`UPDATE thiet_bi SET trang_thai_duyet='da_duyet'
                          WHERE lo_import_id=? AND trang_thai_duyet='cho_duyet'`).run(req.params.loId);
    res.json({ da_duyet: n.changes });
});

module.exports = r;
