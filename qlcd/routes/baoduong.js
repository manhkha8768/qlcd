/**
 * BẢO DƯỠNG - SỬA CHỮA
 *
 * Gồm: kế hoạch bảo dưỡng định kỳ, phiếu sửa chữa kèm vật tư thay thế,
 * và nhật ký vận hành để cộng dồn giờ chạy.
 *
 * Chi phí vật tư và tổng chi phí do trigger trong database tự tính,
 * nên số liệu báo cáo luôn khớp dù sửa vật tư từ bất kỳ đâu.
 */
const express = require('express');
const db = require('../db');
const { dangNhap, duocGhi, duocDuyet, gioiHanPX, duocThaoTacPX } = require('../middleware/quyen');
const { sinhSoPhieu, ghiPheDuyet } = require('../lib/so-phieu');

const r = express.Router();
r.use(dangNhap);

/* ==================== KẾ HOẠCH BẢO DƯỠNG ==================== */

r.get('/ke-hoach', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = `SELECT kh.*, tb.ma_tb, tb.ten AS ten_tb, tb.gio_chay_luy_ke,
                      px.ten_ngan AS px, n.ma AS ma_nhom
               FROM ke_hoach_bao_duong kh
               JOIN thiet_bi tb ON tb.id = kh.thiet_bi_id
               LEFT JOIN phan_xuong px ON px.id = tb.phan_xuong_id
               LEFT JOIN nhom_thiet_bi n ON n.id = tb.nhom_id
               WHERE kh.hoat_dong = 1`;
    const p = [];
    if (gh !== null) { sql += ' AND tb.phan_xuong_id = ?'; p.push(gh); }
    if (req.query.thiet_bi_id) { sql += ' AND kh.thiet_bi_id = ?'; p.push(req.query.thiet_bi_id); }
    sql += ' ORDER BY kh.lan_ke_tiep IS NULL, kh.lan_ke_tiep, tb.ma_tb';
    res.json(db.prepare(sql).all(...p));
});

r.post('/ke-hoach', duocGhi, (req, res) => {
    const b = req.body || {};
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!b.cap_bd) return res.status(400).json({ loi: 'Chọn cấp bảo dưỡng' });
    if (!b.chu_ky_ngay && !b.chu_ky_gio) {
        return res.status(400).json({ loi: 'Nhập chu kỳ theo ngày hoặc theo giờ chạy' });
    }

    const daCo = db.prepare(`SELECT id FROM ke_hoach_bao_duong
        WHERE thiet_bi_id=? AND cap_bd=? AND hoat_dong=1`).get(tb.id, b.cap_bd);
    if (daCo) return res.status(400).json({ loi: 'Thiết bị đã có kế hoạch bảo dưỡng cấp này' });

    const lanCuoi = b.lan_cuoi || null;
    const lanKeTiep = b.chu_ky_ngay && lanCuoi
        ? db.prepare(`SELECT date(?, '+' || ? || ' days') t`).get(lanCuoi, b.chu_ky_ngay).t
        : (b.lan_ke_tiep || null);

    const info = db.prepare(`
        INSERT INTO ke_hoach_bao_duong (thiet_bi_id, cap_bd, chu_ky_ngay, chu_ky_gio,
            lan_cuoi, gio_chay_lan_cuoi, lan_ke_tiep, nguoi_phu_trach)
        VALUES (?,?,?,?,?,?,?,?)`)
      .run(tb.id, b.cap_bd, b.chu_ky_ngay || null, b.chu_ky_gio || null,
           lanCuoi, tb.gio_chay_luy_ke || 0, lanKeTiep, b.nguoi_phu_trach || null);
    res.json({ id: info.lastInsertRowid, lan_ke_tiep: lanKeTiep });
});

r.delete('/ke-hoach/:id', duocGhi, (req, res) => {
    db.prepare('UPDATE ke_hoach_bao_duong SET hoat_dong=0 WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

/* ==================== PHIẾU SỬA CHỮA ==================== */

const SELECT_PHIEU = `
    SELECT p.*, tb.ma_tb, tb.ten AS ten_tb, n.ma AS ma_nhom, n.ten AS ten_nhom,
           px.ten_ngan AS px, nl.ho_ten AS nguoi_lap
    FROM phieu_sua_chua p
    JOIN thiet_bi tb          ON tb.id = p.thiet_bi_id
    LEFT JOIN nhom_thiet_bi n ON n.id = tb.nhom_id
    LEFT JOIN phan_xuong px   ON px.id = p.phan_xuong_id
    LEFT JOIN nguoi_dung nl   ON nl.id = p.nguoi_lap_id`;

r.get('/phieu', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = SELECT_PHIEU + ' WHERE 1=1';
    const p = [];
    if (gh !== null) { sql += ' AND p.phan_xuong_id = ?'; p.push(gh); }
    else if (req.query.phan_xuong_id) { sql += ' AND p.phan_xuong_id = ?'; p.push(req.query.phan_xuong_id); }
    if (req.query.trang_thai) { sql += ' AND p.trang_thai = ?'; p.push(req.query.trang_thai); }
    if (req.query.loai) { sql += ' AND p.loai = ?'; p.push(req.query.loai); }
    if (req.query.thiet_bi_id) { sql += ' AND p.thiet_bi_id = ?'; p.push(req.query.thiet_bi_id); }
    if (req.query.tu_ngay) { sql += ' AND date(COALESCE(p.ngay_bat_dau,p.ngay_tao)) >= ?'; p.push(req.query.tu_ngay); }
    if (req.query.den_ngay) { sql += ' AND date(COALESCE(p.ngay_bat_dau,p.ngay_tao)) <= ?'; p.push(req.query.den_ngay); }
    sql += ' ORDER BY COALESCE(p.ngay_bat_dau, p.ngay_tao) DESC, p.id DESC LIMIT 300';
    res.json(db.prepare(sql).all(...p));
});

r.get('/phieu/:id', (req, res) => {
    const p = db.prepare(SELECT_PHIEU + ' WHERE p.id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ loi: 'Không tìm thấy phiếu' });
    p.vat_tu = db.prepare('SELECT * FROM vat_tu_sua_chua WHERE phieu_id=? ORDER BY id').all(p.id);
    p.lich_su_duyet = db.prepare(`
        SELECT pd.*, nd.ho_ten FROM phe_duyet pd
        LEFT JOIN nguoi_dung nd ON nd.id = pd.nguoi_id
        WHERE pd.doi_tuong_loai='phieu_sc' AND pd.doi_tuong_id=? ORDER BY pd.thoi_gian`).all(p.id);
    res.json(p);
});

r.post('/phieu', duocGhi, (req, res) => {
    const b = req.body || {};
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!b.mo_ta_hu_hong || !b.mo_ta_hu_hong.trim()) {
        return res.status(400).json({ loi: 'Mô tả nội dung hư hỏng hoặc công việc bảo dưỡng' });
    }

    const soPhieu = sinhSoPhieu('phieu_sua_chua', 'so_phieu', 'SC');
    const info = db.prepare(`
        INSERT INTO phieu_sua_chua (so_phieu, thiet_bi_id, phan_xuong_id, loai, cap_bd, muc_do,
            ngay_bao_hong, mo_ta_hu_hong, nguyen_nhan, bien_phap_xu_ly, ngay_bat_dau,
            don_vi_thuc_hien, ten_don_vi_ngoai, so_cong, chi_phi_nhan_cong, chi_phi_khac,
            nguoi_lap_id, trang_thai, ghi_chu)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nhap',?)`)
      .run(soPhieu, tb.id, tb.phan_xuong_id, b.loai || 'sua_chua', b.cap_bd || null,
           b.muc_do || 'binh_thuong', b.ngay_bao_hong || null, b.mo_ta_hu_hong.trim(),
           b.nguyen_nhan || null, b.bien_phap_xu_ly || null,
           b.ngay_bat_dau || new Date().toISOString().slice(0, 10),
           b.don_vi_thuc_hien || 'noi_bo', b.ten_don_vi_ngoai || null,
           b.so_cong || 0, b.chi_phi_nhan_cong || 0, b.chi_phi_khac || 0,
           req.session.nguoiDung.id, b.ghi_chu || null);

    capNhatTongChiPhi(info.lastInsertRowid);

    // Sự cố dừng máy thì đánh dấu thiết bị đang sửa ngay
    if (b.muc_do === 'dung_san_xuat' || b.loai === 'su_co') {
        db.prepare("UPDATE thiet_bi SET trang_thai='dang_sua' WHERE id=?").run(tb.id);
    }
    res.json({ id: info.lastInsertRowid, so_phieu: soPhieu });
});

r.put('/phieu/:id', duocGhi, (req, res) => {
    const p = layPhieu(req, res); if (!p) return;
    if (p.trang_thai === 'hoan_thanh' && req.session.nguoiDung.vai_tro !== 'admin') {
        return res.status(400).json({ loi: 'Phiếu đã hoàn thành, không sửa được' });
    }
    const b = req.body || {};
    const c = ['loai', 'cap_bd', 'muc_do', 'ngay_bao_hong', 'mo_ta_hu_hong', 'nguyen_nhan',
               'bien_phap_xu_ly', 'ngay_bat_dau', 'ngay_hoan_thanh', 'thoi_gian_dung_may',
               'don_vi_thuc_hien', 'ten_don_vi_ngoai', 'so_cong', 'chi_phi_nhan_cong',
               'chi_phi_khac', 'ket_qua', 'ghi_chu'];
    const gt = c.map(k => b[k] !== undefined ? b[k] : p[k]);
    db.prepare(`UPDATE phieu_sua_chua SET ${c.map(k => k + '=?').join(', ')} WHERE id=?`).run(...gt, p.id);
    capNhatTongChiPhi(p.id);
    res.json({ ok: true });
});

/* ---------- Vật tư thay thế ---------- */
r.post('/phieu/:id/vat-tu', duocGhi, (req, res) => {
    const p = layPhieu(req, res); if (!p) return;
    if (p.trang_thai === 'hoan_thanh') return res.status(400).json({ loi: 'Phiếu đã hoàn thành' });

    const ds = Array.isArray(req.body) ? req.body : [req.body];
    const them = db.prepare(`INSERT INTO vat_tu_sua_chua (phieu_id, ma_vthh, ten_vthh, dvt,
        so_luong, don_gia, nguon, ghi_chu) VALUES (?,?,?,?,?,?,?,?)`);
    const ids = [];
    db.transaction(() => {
        for (const v of ds) {
            if (!v.ten_vthh) continue;
            const i = them.run(p.id, v.ma_vthh || null, v.ten_vthh.trim(), v.dvt || null,
                Number(v.so_luong) || 0, Number(v.don_gia) || 0, v.nguon || 'kho', v.ghi_chu || null);
            ids.push(i.lastInsertRowid);
        }
    })();
    if (!ids.length) return res.status(400).json({ loi: 'Chưa nhập tên vật tư' });

    // Trigger đã cộng chi phí vật tư, cập nhật lại tổng cho chắc
    capNhatTongChiPhi(p.id);
    res.json({ ids, phieu: db.prepare(`SELECT chi_phi_vat_tu, chi_phi_nhan_cong, chi_phi_khac,
        tong_chi_phi FROM phieu_sua_chua WHERE id=?`).get(p.id) });
});

r.delete('/vat-tu/:id', duocGhi, (req, res) => {
    const v = db.prepare('SELECT * FROM vat_tu_sua_chua WHERE id=?').get(req.params.id);
    if (!v) return res.status(404).json({ loi: 'Không tìm thấy dòng vật tư' });
    db.prepare('DELETE FROM vat_tu_sua_chua WHERE id=?').run(v.id);
    capNhatTongChiPhi(v.phieu_id);
    res.json({ ok: true });
});

/* ---------- Luồng duyệt & hoàn thành ---------- */
r.post('/phieu/:id/gui-duyet', duocGhi, (req, res) => {
    const p = layPhieu(req, res); if (!p) return;
    if (!['nhap', 'chuyen_lai'].includes(p.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu không ở trạng thái gửi duyệt được' });
    }
    db.prepare("UPDATE phieu_sua_chua SET trang_thai='cho_duyet' WHERE id=?").run(p.id);
    ghiPheDuyet('phieu_sc', p.id, 'gui_duyet', req.session.nguoiDung.id);
    res.json({ ok: true });
});

r.post('/phieu/:id/dong-y', duocDuyet, (req, res) => {
    const p = db.prepare('SELECT * FROM phieu_sua_chua WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ loi: 'Không tìm thấy phiếu' });
    if (p.trang_thai !== 'cho_duyet') return res.status(400).json({ loi: 'Phiếu không ở trạng thái chờ duyệt' });

    db.prepare("UPDATE phieu_sua_chua SET trang_thai='dang_thuc_hien' WHERE id=?").run(p.id);
    db.prepare("UPDATE thiet_bi SET trang_thai='dang_sua' WHERE id=? AND trang_thai='hoat_dong'")
      .run(p.thiet_bi_id);
    ghiPheDuyet('phieu_sc', p.id, 'dong_y', req.session.nguoiDung.id);
    res.json({ ok: true });
});

r.post('/phieu/:id/chuyen-lai', duocDuyet, (req, res) => {
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do khi chuyển lại' });
    const p = db.prepare('SELECT * FROM phieu_sua_chua WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ loi: 'Không tìm thấy phiếu' });

    db.prepare("UPDATE phieu_sua_chua SET trang_thai='chuyen_lai' WHERE id=?").run(p.id);
    ghiPheDuyet('phieu_sc', p.id, 'chuyen_lai', req.session.nguoiDung.id, lyDo);
    res.json({ ok: true });
});

/** Hoàn thành: trigger tự tính hạn bảo dưỡng kế tiếp nếu là bảo dưỡng định kỳ */
r.post('/phieu/:id/hoan-thanh', duocGhi, (req, res) => {
    const p = layPhieu(req, res); if (!p) return;
    if (!['da_duyet', 'dang_thuc_hien'].includes(p.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu phải được duyệt trước khi hoàn thành' });
    }
    const b = req.body || {};
    db.transaction(() => {
        db.prepare(`UPDATE phieu_sua_chua SET ngay_hoan_thanh=?, thoi_gian_dung_may=?,
                           ket_qua=?, bien_phap_xu_ly=COALESCE(?, bien_phap_xu_ly) WHERE id=?`)
          .run(b.ngay_hoan_thanh || new Date().toISOString().slice(0, 10),
               b.thoi_gian_dung_may || p.thoi_gian_dung_may, b.ket_qua || 'dat',
               b.bien_phap_xu_ly || null, p.id);
        db.prepare("UPDATE phieu_sua_chua SET trang_thai='hoan_thanh' WHERE id=?").run(p.id);

        const ttMoi = (b.ket_qua === 'khong_dat') ? 'cho_thanh_ly' : 'hoat_dong';
        db.prepare('UPDATE thiet_bi SET trang_thai=?, tinh_trang_kt=? WHERE id=?')
          .run(ttMoi, b.tinh_trang_kt || 'tot', p.thiet_bi_id);

        // Bảo dưỡng định kỳ: ghi bản ghi bảo dưỡng và dời hạn kế tiếp.
        // Trước đây việc này do trigger trong database lo, nhưng từ khi tách
        // bảo dưỡng ra bảng riêng thì phải xử lý tường minh ở đây.
        if (p.loai === 'bao_duong_dk' && p.cap_bd) {
            const ngayXong = b.ngay_hoan_thanh || new Date().toISOString().slice(0, 10);
            capNhatHanBaoDuong(p, ngayXong);
        }
    })();

    res.json({
        ok: true,
        ke_hoach: db.prepare(`SELECT cap_bd, lan_cuoi, lan_ke_tiep FROM ke_hoach_bao_duong
                              WHERE thiet_bi_id=? AND hoat_dong=1`).all(p.thiet_bi_id)
    });
});

r.delete('/phieu/:id', duocGhi, (req, res) => {
    const p = layPhieu(req, res); if (!p) return;
    if (p.trang_thai === 'hoan_thanh' && req.session.nguoiDung.vai_tro !== 'admin') {
        return res.status(400).json({ loi: 'Phiếu đã hoàn thành, chỉ admin xoá được' });
    }
    db.prepare('DELETE FROM phieu_sua_chua WHERE id=?').run(p.id);
    res.json({ ok: true });
});

/* ==================== NHẬT KÝ VẬN HÀNH ==================== */

r.post('/nhat-ky', duocGhi, (req, res) => {
    const b = req.body || {};
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        db.prepare(`INSERT INTO nhat_ky_van_hanh (thiet_bi_id, ngay, ca, gio_chay, san_luong,
                    tinh_trang, nguoi_ghi_id) VALUES (?,?,?,?,?,?,?)`)
          .run(tb.id, b.ngay || new Date().toISOString().slice(0, 10), b.ca || null,
               Number(b.gio_chay) || 0, b.san_luong || null, b.tinh_trang || null,
               req.session.nguoiDung.id);
    } catch (e) {
        if (/UNIQUE/.test(e.message)) {
            return res.status(400).json({ loi: 'Đã ghi nhật ký cho thiết bị này trong ca đó rồi' });
        }
        throw e;
    }
    res.json({ gio_chay_luy_ke: db.prepare('SELECT gio_chay_luy_ke g FROM thiet_bi WHERE id=?').get(tb.id).g });
});

r.get('/nhat-ky', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = `SELECT nk.*, tb.ma_tb, tb.ten AS ten_tb FROM nhat_ky_van_hanh nk
               JOIN thiet_bi tb ON tb.id = nk.thiet_bi_id WHERE 1=1`;
    const p = [];
    if (gh !== null) { sql += ' AND tb.phan_xuong_id=?'; p.push(gh); }
    if (req.query.thiet_bi_id) { sql += ' AND nk.thiet_bi_id=?'; p.push(req.query.thiet_bi_id); }
    sql += ' ORDER BY nk.ngay DESC, nk.ca DESC LIMIT 200';
    res.json(db.prepare(sql).all(...p));
});

/* ==================== BÁO CÁO CHI PHÍ ==================== */

r.get('/bao-cao-chi-phi', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = `SELECT cp.* FROM v_chi_phi_thiet_bi cp
               JOIN thiet_bi tb ON tb.id = cp.thiet_bi_id
               WHERE cp.so_lan_sc > 0`;
    const p = [];
    if (gh !== null) { sql += ' AND tb.phan_xuong_id=?'; p.push(gh); }
    sql += ' ORDER BY cp.tong_chi_phi DESC LIMIT 100';
    res.json(db.prepare(sql).all(...p));
});

/* --------------------------------------------------------------- */
function layPhieu(req, res) {
    const p = db.prepare('SELECT * FROM phieu_sua_chua WHERE id=?').get(req.params.id);
    if (!p) { res.status(404).json({ loi: 'Không tìm thấy phiếu' }); return null; }
    if (!duocThaoTacPX(req, p.phan_xuong_id)) {
        res.status(403).json({ loi: 'Không có quyền với phiếu này' }); return null;
    }
    return p;
}

/**
 * Ghi bản ghi bảo dưỡng và dời hạn kế tiếp theo chu kỳ của kế hoạch.
 * Chạy bên trong transaction của hàm gọi.
 */
function capNhatHanBaoDuong(p, ngayXong) {
    const kh = db.prepare(`SELECT * FROM ke_hoach_bao_duong
        WHERE thiet_bi_id=? AND cap_bd=? AND hoat_dong=1`).get(p.thiet_bi_id, p.cap_bd);

    const maBanGhi = sinhSoPhieu('phieu_bao_duong', 'ma_phieu', 'BD');
    db.prepare(`INSERT INTO phieu_bao_duong (ma_phieu, ke_hoach_id, thiet_bi_id, cum_id,
            phan_xuong_id, cap_bd, ngay_ke_hoach, ngay_thuc_hien, trang_thai,
            noi_dung_cong_viec, ket_qua_kiem_tra, chi_phi_vat_tu, chi_phi_nhan_cong,
            chi_phi_khac, tong_chi_phi, nguoi_tao_id, ghi_chu)
        VALUES (?,?,?,?,?,?,?,?, 'hoan_thanh',?,?,?,?,?,?,?,?)`)
      .run(maBanGhi, kh ? kh.id : null, p.thiet_bi_id, p.cum_id || null, p.phan_xuong_id,
           p.cap_bd, kh ? kh.lan_ke_tiep : null, ngayXong, p.mo_ta_hu_hong,
           p.ket_qua || 'dat', p.chi_phi_vat_tu || 0, p.chi_phi_nhan_cong || 0,
           p.chi_phi_khac || 0, p.tong_chi_phi || 0, p.nguoi_lap_id,
           'Sinh từ phiếu ' + p.so_phieu);

    if (!kh) return;

    // Hạn kế tiếp tính từ ngày thực hiện, ưu tiên chu kỳ theo ngày
    let keTiep = null;
    if (kh.chu_ky_ngay) {
        keTiep = db.prepare(`SELECT date(?, '+' || ? || ' days') t`).get(ngayXong, kh.chu_ky_ngay).t;
    }
    const gioChay = db.prepare('SELECT gio_chay_luy_ke g FROM thiet_bi WHERE id=?')
        .get(p.thiet_bi_id)?.g || 0;

    db.prepare(`UPDATE ke_hoach_bao_duong SET lan_cuoi=?, gio_chay_lan_cuoi=?, lan_ke_tiep=?
                WHERE id=?`).run(ngayXong, gioChay, keTiep, kh.id);

    db.prepare('UPDATE phieu_bao_duong SET ngay_han_ke_tiep=? WHERE ma_phieu=?')
      .run(keTiep, maBanGhi);
}

function capNhatTongChiPhi(id) {
    db.prepare(`UPDATE phieu_sua_chua SET
        chi_phi_vat_tu = (SELECT COALESCE(SUM(so_luong*don_gia),0) FROM vat_tu_sua_chua WHERE phieu_id=?),
        tong_chi_phi = COALESCE(chi_phi_nhan_cong,0)
                     + (SELECT COALESCE(SUM(so_luong*don_gia),0) FROM vat_tu_sua_chua WHERE phieu_id=?)
                     + COALESCE(chi_phi_khac,0)
        WHERE id=?`).run(id, id, id);
}

module.exports = r;
