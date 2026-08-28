/**
 * SỰ CỐ THIẾT BỊ
 *
 * Tách riêng khỏi phiếu sửa chữa: một sự cố có thể sinh nhiều phiếu sửa chữa,
 * và có sự cố xử lý tại chỗ không cần lập phiếu nào.
 */
const express = require('express');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { canQuyen, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen-ma');
const KT = require('../lib/ky-thuat');
const G = require('../lib/giao-dich');

const r = express.Router();
r.use(dangNhap);

const SELECT = `
    SELECT s.*, tb.ma_tb, tb.ten AS ten_tb, c.ten AS ten_cum, c.ma_cum,
           px.ten_ngan AS px, nd.ho_ten AS nguoi_bao_ht,
           (SELECT COUNT(*) FROM phieu_sua_chua p WHERE p.su_co_id = s.id) AS so_phieu_sc
    FROM su_co s
    JOIN thiet_bi tb          ON tb.id = s.thiet_bi_id
    LEFT JOIN cum_thiet_bi c  ON c.id = s.cum_id
    LEFT JOIN phan_xuong px   ON px.id = s.phan_xuong_id
    LEFT JOIN nguoi_dung nd   ON nd.id = s.nguoi_bao_id`;

function locDonVi(req) {
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds === null) return { sql: '', p: [] };
    if (!ds.length) return { sql: ' AND 1=0', p: [] };
    return { sql: ` AND s.phan_xuong_id IN (${ds.map(() => '?').join(',')})`, p: ds };
}

r.get('/', (req, res) => {
    const dv = locDonVi(req);
    let sql = SELECT + ' WHERE 1=1' + dv.sql;
    const p = [...dv.p];
    if (req.query.trang_thai) { sql += ' AND s.trang_thai=?'; p.push(req.query.trang_thai); }
    if (req.query.muc_do) { sql += ' AND s.muc_do=?'; p.push(req.query.muc_do); }
    if (req.query.thiet_bi_id) { sql += ' AND s.thiet_bi_id=?'; p.push(req.query.thiet_bi_id); }
    if (req.query.phan_xuong_id) { sql += ' AND s.phan_xuong_id=?'; p.push(req.query.phan_xuong_id); }
    if (req.query.tu_ngay) { sql += ' AND s.ngay_su_co>=?'; p.push(req.query.tu_ngay); }
    if (req.query.den_ngay) { sql += ' AND s.ngay_su_co<=?'; p.push(req.query.den_ngay); }
    if (req.query.dang_mo) sql += " AND s.trang_thai<>'da_dong'";
    if (req.query.q) {
        const k = '%' + req.query.q.trim() + '%';
        sql += ' AND (s.ma_su_co LIKE ? OR s.hien_tuong LIKE ? OR tb.ten LIKE ? OR tb.ma_tb LIKE ?)';
        p.push(k, k, k, k);
    }
    sql += ' ORDER BY s.ngay_su_co DESC, s.id DESC LIMIT 300';
    res.json(db.prepare(sql).all(...p));
});

r.get('/thong-ke', (req, res) => {
    const dv = locDonVi(req);
    const dem = (dk) => db.prepare(`SELECT COUNT(*) n FROM su_co s WHERE ${dk}${dv.sql}`).get(...dv.p).n;
    res.json({
        dang_mo: dem("s.trang_thai<>'da_dong'"),
        nghiem_trong: dem("s.trang_thai<>'da_dong' AND s.muc_do IN ('nghiem_trong','khan_cap')"),
        dang_sua: dem("s.trang_thai='dang_sua'"),
        trong_thang: dem("substr(s.ngay_su_co,1,7)=strftime('%Y-%m','now','localtime')"),
        gan_day: db.prepare(SELECT + ' WHERE 1=1' + dv.sql +
                            ' ORDER BY s.ngay_su_co DESC, s.id DESC LIMIT 8').all(...dv.p)
    });
});

r.get('/:id', (req, res) => {
    const s = db.prepare(SELECT + ' WHERE s.id=?').get(req.params.id);
    if (!s) return res.status(404).json({ loi: 'Không tìm thấy sự cố' });
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(s.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Không có quyền xem sự cố của đơn vị này' });
    }
    res.json({
        su_co: s,
        phieu_sua_chua: db.prepare(`SELECT id, so_phieu, loai, ngay_bat_dau, ngay_hoan_thanh,
                                           mo_ta_hu_hong, tong_chi_phi, trang_thai
                                    FROM phieu_sua_chua WHERE su_co_id=?
                                    ORDER BY ngay_tao`).all(s.id)
    });
});

r.post('/', canQuyen('SU_CO_TAO'), (req, res) => {
    const b = req.body || {};
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, tb.phan_xuong_id)) {
        return res.status(403).json({ loi: 'Bạn không có quyền báo sự cố cho thiết bị của đơn vị này' });
    }
    if (!b.hien_tuong || !b.hien_tuong.trim()) {
        return res.status(400).json({ loi: 'Mô tả hiện tượng gặp phải' });
    }
    if (b.cum_id) {
        const c = db.prepare('SELECT thiet_bi_id FROM cum_thiet_bi WHERE id=?').get(b.cum_id);
        if (!c || Number(c.thiet_bi_id) !== Number(tb.id)) {
            return res.status(400).json({ loi: 'Cụm không thuộc thiết bị này' });
        }
    }

    const ma = KT.maSuCo();
    const info = db.prepare(`INSERT INTO su_co (ma_su_co, thiet_bi_id, cum_id, phan_xuong_id,
        ngay_su_co, gio_su_co, nguoi_bao, nguoi_bao_id, muc_do, hien_tuong, mo_ta,
        nguyen_nhan_nghi_ngo, dung_thiet_bi, thoi_gian_dung_phut, trang_thai)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'mo')`)
      .run(ma, tb.id, b.cum_id || null, tb.phan_xuong_id,
           b.ngay_su_co || new Date().toISOString().slice(0, 10), b.gio_su_co || null,
           b.nguoi_bao || req.session.nguoiDung.ho_ten, req.session.nguoiDung.id,
           b.muc_do || 'trung_binh', b.hien_tuong.trim(), b.mo_ta || null,
           b.nguyen_nhan_nghi_ngo || null, b.dung_thiet_bi ? 1 : 0,
           Number(b.thoi_gian_dung_phut) || 0);

    // Sự cố nghiêm trọng hoặc có dừng máy thì đánh dấu thiết bị ngay
    if (b.dung_thiet_bi || ['nghiem_trong', 'khan_cap'].includes(b.muc_do)) {
        db.prepare("UPDATE thiet_bi SET trang_thai='dang_sua', tinh_trang_kt='kem' WHERE id=?")
          .run(tb.id);
    }
    if (b.cum_id) {
        KT.ghiLichSuCum({ cum_id: b.cum_id, thiet_bi_id: tb.id, loai_su_kien: 'hong',
            ngay_su_kien: b.ngay_su_co || new Date().toISOString().slice(0, 10),
            su_co_id: info.lastInsertRowid, nguoi_thuc_hien_id: req.session.nguoiDung.id,
            ghi_chu: b.hien_tuong });
    }

    G.ghiAudit(req, 'SU_CO_TAO', 'su_co', info.lastInsertRowid,
               `${tb.ma_tb}: ${ma} - ${b.hien_tuong}`);

    // Sự cố nặng báo cho người có quyền duyệt biết ngay
    if (['nghiem_trong', 'khan_cap'].includes(b.muc_do)) {
        G.baoNguoiDuyet({ id: String(info.lastInsertRowid) }, 'Sự cố nghiêm trọng',
            `${tb.ma_tb} - ${tb.ten}: ${b.hien_tuong}`);
    }
    res.json({ id: info.lastInsertRowid, ma_su_co: ma });
});

r.put('/:id', canQuyen('SU_CO_SUA'), (req, res) => {
    const s = laySuCo(req, res); if (!s) return;
    if (s.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Sự cố đã đóng, không sửa được' });

    const b = req.body || {};
    const c = ['cum_id', 'ngay_su_co', 'gio_su_co', 'nguoi_bao', 'muc_do', 'hien_tuong',
               'mo_ta', 'nguyen_nhan_nghi_ngo', 'nguyen_nhan_thuc_te', 'dung_thiet_bi',
               'thoi_gian_dung_phut', 'trang_thai', 'bien_phap_xu_ly'];
    if (b.trang_thai === 'da_dong') {
        return res.status(400).json({ loi: 'Dùng chức năng Đóng sự cố để kết thúc' });
    }
    db.prepare(`UPDATE su_co SET ${c.map(k => k + '=?').join(',')},
                ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(...c.map(k => b[k] !== undefined ? b[k] : s[k]), s.id);
    G.ghiAudit(req, 'SU_CO_SUA', 'su_co', s.id, `Sửa ${s.ma_su_co}`, s, b);
    res.json({ ok: true });
});

/** Đóng sự cố: bắt buộc có nguyên nhân thực tế và biện pháp xử lý */
r.post('/:id/dong', canQuyen('SU_CO_DONG'), (req, res) => {
    const s = laySuCo(req, res); if (!s) return;
    if (s.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Sự cố đã đóng trước đó' });

    const b = req.body || {};
    const nguyenNhan = (b.nguyen_nhan_thuc_te || s.nguyen_nhan_thuc_te || '').trim();
    const bienPhap = (b.bien_phap_xu_ly || s.bien_phap_xu_ly || '').trim();
    if (!nguyenNhan) return res.status(400).json({ loi: 'Phải ghi nguyên nhân thực tế trước khi đóng' });
    if (!bienPhap) return res.status(400).json({ loi: 'Phải ghi biện pháp đã xử lý trước khi đóng' });

    const chuaXong = db.prepare(`SELECT COUNT(*) n FROM phieu_sua_chua
        WHERE su_co_id=? AND trang_thai NOT IN ('hoan_thanh','huy')`).get(s.id).n;
    if (chuaXong) {
        return res.status(400).json({
            loi: `Còn ${chuaXong} phiếu sửa chữa chưa hoàn thành, xử lý xong mới đóng được sự cố.` });
    }

    db.prepare(`UPDATE su_co SET trang_thai='da_dong', nguyen_nhan_thuc_te=?, bien_phap_xu_ly=?,
                thoi_gian_dung_phut=?, ngay_dong=?, nguoi_dong_id=?,
                ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(nguyenNhan, bienPhap,
           b.thoi_gian_dung_phut !== undefined ? Number(b.thoi_gian_dung_phut) : s.thoi_gian_dung_phut,
           b.ngay_dong || new Date().toISOString().slice(0, 10), req.session.nguoiDung.id, s.id);

    // Không còn sự cố mở nào thì trả thiết bị về hoạt động
    const conMo = db.prepare(`SELECT COUNT(*) n FROM su_co
        WHERE thiet_bi_id=? AND trang_thai<>'da_dong'`).get(s.thiet_bi_id).n;
    if (!conMo) {
        db.prepare(`UPDATE thiet_bi SET trang_thai='hoat_dong', tinh_trang_kt=?
                    WHERE id=? AND trang_thai='dang_sua'`)
          .run(b.tinh_trang_kt || 'tot', s.thiet_bi_id);
    }

    G.ghiAudit(req, 'SU_CO_DONG', 'su_co', s.id, `Đóng ${s.ma_su_co}: ${bienPhap}`);
    res.json({ ok: true, thiet_bi_hoat_dong_lai: !conMo });
});

r.delete('/:id', canQuyen('SU_CO_SUA'), (req, res) => {
    const s = laySuCo(req, res); if (!s) return;
    if (s.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Sự cố đã đóng, không xóa được' });
    const sc = db.prepare('SELECT COUNT(*) n FROM phieu_sua_chua WHERE su_co_id=?').get(s.id).n;
    if (sc) return res.status(400).json({ loi: 'Sự cố đã có phiếu sửa chữa, không xóa được' });
    db.prepare('DELETE FROM su_co WHERE id=?').run(s.id);
    res.json({ ok: true });
});

function laySuCo(req, res) {
    const s = db.prepare('SELECT * FROM su_co WHERE id=?').get(req.params.id);
    if (!s) { res.status(404).json({ loi: 'Không tìm thấy sự cố' }); return null; }
    if (!duocThaoTacDonVi(req.session.nguoiDung, s.phan_xuong_id)) {
        res.status(403).json({ loi: 'Không có quyền với sự cố của đơn vị này' }); return null;
    }
    return s;
}

module.exports = r;
