/**
 * HỒ SƠ KỸ THUẬT THIẾT BỊ (Giai đoạn 4)
 * Thông số động · cây cấu trúc · phụ tùng tương thích · tài liệu · timeline · chi phí
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { canQuyen, coQuyen, donViDuocPhep } = require('../middleware/quyen-ma');
const KT = require('../lib/ky-thuat');
const { ghiAudit } = require('../lib/giao-dich');
const US = require('../lib/upload-security');

const THU_MUC = path.join(process.env.QLCD_UPLOADS || path.join(__dirname, '..', 'uploads'), 'ky-thuat');
if (!fs.existsSync(THU_MUC)) fs.mkdirSync(THU_MUC, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (q, f, cb) => cb(null, THU_MUC),
        filename: (q, f, cb) => cb(null, `kt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname)}`)
    }),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: US.fileFilter('documents')
});

const r = express.Router();
r.use(dangNhap);

/* ---------- Kiểm tra quyền truy cập theo đơn vị của thiết bị ---------- */
function layTB(req, res) {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(req.params.tbId || req.params.id);
    if (!tb) { res.status(404).json({ loi: 'Không tìm thấy thiết bị' }); return null; }
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(tb.phan_xuong_id))) {
        res.status(403).json({ loi: 'Bạn không có quyền xem thiết bị của đơn vị này' });
        return null;
    }
    return tb;
}

/* =====================================================================
   1. THÔNG SỐ KỸ THUẬT ĐỘNG
   ===================================================================== */

r.get('/dinh-nghia-thong-so', (req, res) => {
    let sql = `SELECT d.*, n.ma AS ma_nhom, n.ten AS ten_nhom
               FROM dinh_nghia_thong_so d
               LEFT JOIN nhom_thiet_bi n ON n.id = d.nhom_id WHERE d.hoat_dong=1`;
    const p = [];
    if (req.query.nhom_id) { sql += ' AND d.nhom_id=?'; p.push(req.query.nhom_id); }
    sql += ' ORDER BY n.ma, d.thu_tu, d.ten';
    res.json(db.prepare(sql).all(...p));
});

r.post('/dinh-nghia-thong-so', canQuyen('KT_SUA'), (req, res) => {
    const b = req.body || {};
    if (!b.ma_thong_so || !b.ten || !b.nhom_id) {
        return res.status(400).json({ loi: 'Thiếu mã thông số, tên hoặc nhóm thiết bị' });
    }
    try {
        const info = db.prepare(`INSERT INTO dinh_nghia_thong_so
            (nhom_id, ma_thong_so, ten, kieu_du_lieu, don_vi, gia_tri_chon, thu_tu, bat_buoc)
            VALUES (?,?,?,?,?,?,?,?)`)
          .run(b.nhom_id, b.ma_thong_so.trim().toUpperCase(), b.ten.trim(),
               b.kieu_du_lieu || 'chu', b.don_vi || null,
               b.gia_tri_chon ? JSON.stringify(b.gia_tri_chon) : null,
               Number(b.thu_tu) || 0, b.bat_buoc ? 1 : 0);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Mã thông số đã có trong nhóm này' });
        throw e;
    }
});

r.delete('/dinh-nghia-thong-so/:id', canQuyen('KT_SUA'), (req, res) => {
    db.prepare('UPDATE dinh_nghia_thong_so SET hoat_dong=0 WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

/** Thông số của một thiết bị: gộp định nghĩa của nhóm với giá trị đã nhập */
r.get('/thiet-bi/:tbId/thong-so', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    res.json(db.prepare(`
        SELECT d.id AS dinh_nghia_id, d.ma_thong_so, d.ten, d.kieu_du_lieu, d.don_vi,
               d.gia_tri_chon, d.thu_tu, d.bat_buoc,
               g.id AS gia_tri_id, g.gia_tri_chu, g.gia_tri_so, g.gia_tri_logic, g.ghi_chu
        FROM dinh_nghia_thong_so d
        LEFT JOIN gia_tri_thong_so g ON g.dinh_nghia_id = d.id AND g.thiet_bi_id = ?
        WHERE d.nhom_id = ? AND d.hoat_dong = 1
        ORDER BY d.thu_tu, d.ten`).all(tb.id, tb.nhom_id));
});

r.put('/thiet-bi/:tbId/thong-so', canQuyen('KT_SUA'), (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    const ds = Array.isArray(req.body) ? req.body : [req.body];

    const luu = db.prepare(`INSERT INTO gia_tri_thong_so
        (thiet_bi_id, dinh_nghia_id, gia_tri_chu, gia_tri_so, gia_tri_logic, ghi_chu, nguoi_tao_id)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(thiet_bi_id, dinh_nghia_id) DO UPDATE SET
            gia_tri_chu=excluded.gia_tri_chu, gia_tri_so=excluded.gia_tri_so,
            gia_tri_logic=excluded.gia_tri_logic, ghi_chu=excluded.ghi_chu,
            nguoi_sua_id=excluded.nguoi_tao_id, ngay_sua=datetime('now','localtime')`);

    db.transaction(() => {
        for (const x of ds) {
            if (!x.dinh_nghia_id) continue;
            const dn = db.prepare('SELECT kieu_du_lieu FROM dinh_nghia_thong_so WHERE id=?')
                .get(x.dinh_nghia_id);
            if (!dn) continue;
            let chu = null, so = null, logic = null;
            if (dn.kieu_du_lieu === 'so') so = x.gia_tri === '' || x.gia_tri == null ? null : Number(x.gia_tri);
            else if (dn.kieu_du_lieu === 'logic') logic = x.gia_tri ? 1 : 0;
            else chu = x.gia_tri == null ? null : String(x.gia_tri);
            luu.run(tb.id, x.dinh_nghia_id, chu, so, logic, x.ghi_chu || null, req.session.nguoiDung.id);
        }
    })();
    ghiAudit(req, 'THONG_SO_CAP_NHAT', 'thiet_bi', tb.id, `Cập nhật thông số ${tb.ma_tb}`);
    res.json({ ok: true });
});

/* =====================================================================
   2. CÂY CẤU TRÚC THIẾT BỊ
   ===================================================================== */

r.get('/thiet-bi/:tbId/cay', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    const ds = db.prepare(`
        SELECT c.*,
               (SELECT COUNT(*) FROM cum_thiet_bi x WHERE x.cha_id=c.id AND x.hoat_dong=1) AS so_con,
               (SELECT COUNT(*) FROM phu_tung_thiet_bi p WHERE p.cum_id=c.id) AS so_phu_tung,
               (SELECT COUNT(*) FROM tai_lieu_ky_thuat t WHERE t.cum_id=c.id AND t.hoat_dong=1) AS so_tai_lieu
        FROM cum_thiet_bi c
        WHERE c.thiet_bi_id=? AND c.hoat_dong=1`).all(tb.id);
    res.json({ thiet_bi: { id: tb.id, ma_tb: tb.ma_tb, ten: tb.ten }, cay: KT.dungCay(ds) });
});

r.get('/cum/:id', (req, res) => {
    const c = db.prepare(`SELECT c.*, tb.ma_tb, tb.ten AS ten_tb, tb.phan_xuong_id,
                                 cha.ten AS ten_cha
                          FROM cum_thiet_bi c
                          JOIN thiet_bi tb ON tb.id = c.thiet_bi_id
                          LEFT JOIN cum_thiet_bi cha ON cha.id = c.cha_id
                          WHERE c.id=?`).get(req.params.id);
    if (!c) return res.status(404).json({ loi: 'Không tìm thấy cụm' });
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(c.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Bạn không có quyền xem thiết bị của đơn vị này' });
    }

    res.json({
        cum: { ...c, duong_dan: KT.duongDanCum(c.id) },
        phu_tung: db.prepare(`SELECT ptb.*, pt.ma_phu_tung, pt.ten, pt.part_number, pt.dvt,
                                     pt.gia_chuan, pt.hang_sx, pt.quy_cach
                              FROM phu_tung_thiet_bi ptb
                              JOIN phu_tung pt ON pt.id = ptb.phu_tung_id
                              WHERE ptb.cum_id=? ORDER BY ptb.la_chinh DESC, pt.ten`).all(c.id),
        sua_chua: db.prepare(`SELECT id, so_phieu, loai, ngay_bat_dau, mo_ta_hu_hong,
                                     tong_chi_phi, trang_thai
                              FROM phieu_sua_chua WHERE cum_id=?
                              ORDER BY COALESCE(ngay_bat_dau, ngay_tao) DESC`).all(c.id),
        tai_lieu: db.prepare(`SELECT * FROM tai_lieu_ky_thuat WHERE cum_id=? AND hoat_dong=1
                              ORDER BY loai_tai_lieu, ten_tai_lieu`).all(c.id),
        lich_su: db.prepare(`SELECT lc.*, nd.ho_ten FROM lich_su_cum lc
                             LEFT JOIN nguoi_dung nd ON nd.id = lc.nguoi_thuc_hien_id
                             WHERE lc.cum_id=? ORDER BY lc.ngay_su_kien DESC, lc.id DESC`).all(c.id)
    });
});

r.post('/thiet-bi/:tbId/cum', canQuyen('CUM_TAO'), (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    const b = req.body || {};
    if (!b.ten) return res.status(400).json({ loi: 'Nhập tên cụm hoặc chi tiết' });

    if (b.cha_id) {
        const cha = db.prepare('SELECT thiet_bi_id FROM cum_thiet_bi WHERE id=?').get(b.cha_id);
        if (!cha) return res.status(400).json({ loi: 'Không tìm thấy cụm cha' });
        if (Number(cha.thiet_bi_id) !== Number(tb.id)) {
            return res.status(400).json({ loi: 'Cụm cha không thuộc thiết bị này' });
        }
    }

    const ma = (b.ma_cum || '').trim() || sinhMaCum(tb.id, b.cha_id);
    try {
        const info = db.prepare(`INSERT INTO cum_thiet_bi (thiet_bi_id, cha_id, ma_cum, ten,
            loai_cum, hang_sx, model, so_seri, ma_phu_tung, so_luong, dvt, ngay_lap,
            tinh_trang_kt, thu_tu, ghi_chu, nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(tb.id, b.cha_id || null, ma, b.ten.trim(), b.loai_cum || 'cum',
               b.hang_sx || null, b.model || null, b.so_seri || null, b.ma_phu_tung || null,
               Number(b.so_luong) || 1, b.dvt || 'Cái', b.ngay_lap || null,
               b.tinh_trang_kt || 'tot', Number(b.thu_tu) || 0, b.ghi_chu || null,
               req.session.nguoiDung.id);

        KT.ghiLichSuCum({ cum_id: info.lastInsertRowid, thiet_bi_id: tb.id,
            loai_su_kien: 'lap_dat', ngay_su_kien: b.ngay_lap || new Date().toISOString().slice(0, 10),
            tinh_trang_sau: b.tinh_trang_kt || 'tot', nguoi_thuc_hien_id: req.session.nguoiDung.id,
            ghi_chu: 'Thêm vào cấu trúc thiết bị' });

        ghiAudit(req, 'CUM_THEM', 'cum_thiet_bi', info.lastInsertRowid,
                 `${tb.ma_tb}: thêm cụm ${ma} - ${b.ten}`);
        res.json({ id: info.lastInsertRowid, ma_cum: ma });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: `Mã cụm "${ma}" đã có trong thiết bị này` });
        throw e;
    }
});

function sinhMaCum(tbId, chaId) {
    const tien = chaId
        ? (db.prepare('SELECT ma_cum FROM cum_thiet_bi WHERE id=?').get(chaId)?.ma_cum || 'C') + '.'
        : 'C';
    const ds = db.prepare('SELECT ma_cum FROM cum_thiet_bi WHERE thiet_bi_id=? AND ma_cum LIKE ?')
        .all(tbId, tien + '%');
    let n = 1;
    const co = new Set(ds.map(x => x.ma_cum));
    while (co.has(tien + String(n).padStart(2, '0'))) n++;
    return tien + String(n).padStart(2, '0');
}

r.put('/cum/:id', canQuyen('CUM_SUA'), (req, res) => {
    const c = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ loi: 'Không tìm thấy cụm' });
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(c.thiet_bi_id);
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(tb.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Không có quyền' });
    }

    const b = req.body || {};

    // Đổi cụm cha: chặn tạo vòng lặp trong cây
    if (b.cha_id !== undefined && Number(b.cha_id) !== Number(c.cha_id)) {
        if (Number(b.cha_id) === Number(c.id)) {
            return res.status(400).json({ loi: 'Không thể đặt cụm làm cha của chính nó' });
        }
        if (b.cha_id && KT.hauDue(c.id).includes(Number(b.cha_id))) {
            return res.status(400).json({ loi: 'Không thể chuyển cụm vào bên trong cụm con của nó' });
        }
        KT.ghiLichSuCum({ cum_id: c.id, thiet_bi_id: c.thiet_bi_id, loai_su_kien: 'chuyen_vi_tri',
            ngay_su_kien: new Date().toISOString().slice(0, 10),
            nguoi_thuc_hien_id: req.session.nguoiDung.id,
            ghi_chu: `Chuyển vị trí trong cây: ${KT.duongDanCum(c.id)}` });
    }

    const cot = ['cha_id', 'ten', 'loai_cum', 'hang_sx', 'model', 'so_seri', 'ma_phu_tung',
                 'so_luong', 'dvt', 'ngay_lap', 'tinh_trang_kt', 'thu_tu', 'ghi_chu'];
    const gt = cot.map(k => b[k] !== undefined ? b[k] : c[k]);
    db.prepare(`UPDATE cum_thiet_bi SET ${cot.map(k => k + '=?').join(',')},
                nguoi_sua_id=?, ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(...gt, req.session.nguoiDung.id, c.id);

    if (b.tinh_trang_kt && b.tinh_trang_kt !== c.tinh_trang_kt) {
        KT.ghiLichSuCum({ cum_id: c.id, thiet_bi_id: c.thiet_bi_id,
            loai_su_kien: b.tinh_trang_kt === 'hong' ? 'hong' : 'kiem_tra',
            ngay_su_kien: new Date().toISOString().slice(0, 10),
            tinh_trang_truoc: c.tinh_trang_kt, tinh_trang_sau: b.tinh_trang_kt,
            nguoi_thuc_hien_id: req.session.nguoiDung.id });
    }
    ghiAudit(req, 'CUM_SUA', 'cum_thiet_bi', c.id, `Sửa cụm ${c.ma_cum}`, c, b);
    res.json({ ok: true });
});

/** Thay thế một cụm bằng cụm mới: cụm cũ giữ nguyên lịch sử, chỉ ngừng hoạt động */
r.post('/cum/:id/thay-the', canQuyen('CUM_SUA'), (req, res) => {
    const cu = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(req.params.id);
    if (!cu) return res.status(404).json({ loi: 'Không tìm thấy cụm' });
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(cu.thiet_bi_id);
    const dsdv = donViDuocPhep(req.session.nguoiDung);
    if (dsdv !== null && !dsdv.includes(Number(tb.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Không có quyền' });
    }

    const b = req.body || {};
    const ngay = b.ngay || new Date().toISOString().slice(0, 10);

    const kq = db.transaction(() => {
        const maMoi = (b.ma_cum || '').trim() || sinhMaCum(cu.thiet_bi_id, cu.cha_id);
        const info = db.prepare(`INSERT INTO cum_thiet_bi (thiet_bi_id, cha_id, ma_cum, ten,
            loai_cum, hang_sx, model, so_seri, ma_phu_tung, so_luong, dvt, ngay_lap,
            tinh_trang_kt, thu_tu, ghi_chu, nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'tot',?,?,?)`)
          .run(cu.thiet_bi_id, cu.cha_id, maMoi, b.ten || cu.ten, cu.loai_cum,
               b.hang_sx || cu.hang_sx, b.model || cu.model, b.so_seri || null,
               b.ma_phu_tung || cu.ma_phu_tung, b.so_luong || cu.so_luong, cu.dvt, ngay,
               cu.thu_tu, b.ghi_chu || `Thay thế cho ${cu.ma_cum}`, req.session.nguoiDung.id);
        const moiId = info.lastInsertRowid;

        // Cụm con chuyển sang cụm mới để cây không bị đứt
        db.prepare('UPDATE cum_thiet_bi SET cha_id=? WHERE cha_id=?').run(moiId, cu.id);

        db.prepare(`UPDATE cum_thiet_bi SET trang_thai='da_thay_the', hoat_dong=0,
                    ngay_thao=?, ngay_sua=datetime('now','localtime') WHERE id=?`).run(ngay, cu.id);

        const chung = { thiet_bi_id: cu.thiet_bi_id, ngay_su_kien: ngay,
            cum_cu_id: cu.id, cum_moi_id: moiId, phieu_sua_chua_id: b.phieu_sua_chua_id || null,
            nguoi_thuc_hien_id: req.session.nguoiDung.id,
            ghi_chu: b.ly_do || `Thay ${cu.ma_cum} bằng ${maMoi}` };
        KT.ghiLichSuCum({ ...chung, cum_id: cu.id, loai_su_kien: 'thao_ra',
            tinh_trang_truoc: cu.tinh_trang_kt, tinh_trang_sau: 'hong' });
        KT.ghiLichSuCum({ ...chung, cum_id: moiId, loai_su_kien: 'thay_the', tinh_trang_sau: 'tot' });

        return { cum_moi_id: moiId, ma_cum_moi: maMoi };
    })();

    ghiAudit(req, 'CUM_THAY_THE', 'cum_thiet_bi', cu.id,
             `${tb.ma_tb}: thay ${cu.ma_cum} bằng ${kq.ma_cum_moi}`);
    res.json(kq);
});

/** Xóa mềm: cụm đã có lịch sử không bao giờ bị xóa cứng */
r.delete('/cum/:id', canQuyen('CUM_XOA'), (req, res) => {
    const c = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ loi: 'Không tìm thấy cụm' });

    const con = db.prepare('SELECT COUNT(*) n FROM cum_thiet_bi WHERE cha_id=? AND hoat_dong=1').get(c.id).n;
    if (con) return res.status(400).json({ loi: `Cụm còn ${con} cụm con, xử lý cụm con trước.` });

    db.prepare(`UPDATE cum_thiet_bi SET hoat_dong=0, trang_thai='da_thao',
                ngay_thao=date('now','localtime') WHERE id=?`).run(c.id);
    KT.ghiLichSuCum({ cum_id: c.id, thiet_bi_id: c.thiet_bi_id, loai_su_kien: 'thao_ra',
        ngay_su_kien: new Date().toISOString().slice(0, 10),
        nguoi_thuc_hien_id: req.session.nguoiDung.id, ghi_chu: req.body?.ly_do || 'Tháo khỏi thiết bị' });
    ghiAudit(req, 'CUM_XOA_MEM', 'cum_thiet_bi', c.id, `Tháo cụm ${c.ma_cum}`);
    res.json({ ok: true });
});

/* =====================================================================
   3. PHỤ TÙNG
   ===================================================================== */

r.get('/phu-tung', (req, res) => {
    let sql = 'SELECT * FROM phu_tung WHERE hoat_dong=1';
    const p = [];
    if (req.query.nhom) { sql += ' AND nhom=?'; p.push(req.query.nhom); }
    if (req.query.q) {
        const k = '%' + req.query.q.trim() + '%';
        sql += ' AND (ma_phu_tung LIKE ? OR ten LIKE ? OR part_number LIKE ? OR hang_sx LIKE ? OR quy_cach LIKE ?)';
        p.push(k, k, k, k, k);
    }
    sql += ' ORDER BY ten LIMIT 300';
    res.json(db.prepare(sql).all(...p));
});

r.post('/phu-tung', canQuyen('PHU_TUNG_SUA'), (req, res) => {
    const b = req.body || {};
    if (!b.ten) return res.status(400).json({ loi: 'Nhập tên phụ tùng' });
    const ma = (b.ma_phu_tung || '').trim() || 'PT' + String(
        (db.prepare('SELECT COUNT(*) n FROM phu_tung').get().n + 1)).padStart(5, '0');
    try {
        const info = db.prepare(`INSERT INTO phu_tung (ma_phu_tung, ten, part_number, nhom,
            hang_sx, quy_cach, dvt, ton_toi_thieu, gia_chuan, ma_vach, ghi_chu, nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(ma, b.ten.trim(), b.part_number || null, b.nhom || null, b.hang_sx || null,
               b.quy_cach || null, b.dvt || 'Cái', Number(b.ton_toi_thieu) || 0,
               Number(b.gia_chuan) || 0, b.ma_vach || null, b.ghi_chu || null,
               req.session.nguoiDung.id);
        ghiAudit(req, 'PHU_TUNG_TAO', 'phu_tung', info.lastInsertRowid, `Thêm phụ tùng ${ma} - ${b.ten}`);
        res.json({ id: info.lastInsertRowid, ma_phu_tung: ma });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Mã phụ tùng đã tồn tại' });
        throw e;
    }
});

r.put('/phu-tung/:id', canQuyen('PHU_TUNG_SUA'), (req, res) => {
    const pt = db.prepare('SELECT * FROM phu_tung WHERE id=?').get(req.params.id);
    if (!pt) return res.status(404).json({ loi: 'Không tìm thấy phụ tùng' });
    const b = req.body || {};
    const c = ['ten', 'part_number', 'nhom', 'hang_sx', 'quy_cach', 'dvt', 'ton_toi_thieu',
               'gia_chuan', 'ma_vach', 'trang_thai', 'ghi_chu'];
    db.prepare(`UPDATE phu_tung SET ${c.map(k => k + '=?').join(',')},
                ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(...c.map(k => b[k] !== undefined ? b[k] : pt[k]), pt.id);
    res.json({ ok: true });
});

r.delete('/phu-tung/:id', canQuyen('PHU_TUNG_SUA'), (req, res) => {
    const dung = db.prepare('SELECT COUNT(*) n FROM phu_tung_thiet_bi WHERE phu_tung_id=?')
        .get(req.params.id).n;
    db.prepare('UPDATE phu_tung SET hoat_dong=0 WHERE id=?').run(req.params.id);
    res.json({ ok: true, dang_gan: dung });
});

/** Gắn phụ tùng tương thích với thiết bị, cụm hoặc cả nhóm thiết bị */
r.post('/phu-tung-tuong-thich', canQuyen('PHU_TUNG_SUA'), (req, res) => {
    const b = req.body || {};
    if (!b.phu_tung_id) return res.status(400).json({ loi: 'Chọn phụ tùng' });
    if (!b.thiet_bi_id && !b.cum_id && !b.nhom_id) {
        return res.status(400).json({ loi: 'Phải gắn với thiết bị, cụm hoặc nhóm thiết bị' });
    }
    const info = db.prepare(`INSERT INTO phu_tung_thiet_bi
        (thiet_bi_id, nhom_id, cum_id, phu_tung_id, so_luong_khuyen_nghi, la_chinh, ghi_chu)
        VALUES (?,?,?,?,?,?,?)`)
      .run(b.thiet_bi_id || null, b.nhom_id || null, b.cum_id || null, b.phu_tung_id,
           Number(b.so_luong_khuyen_nghi) || 1, b.la_chinh ? 1 : 0, b.ghi_chu || null);
    res.json({ id: info.lastInsertRowid });
});

r.delete('/phu-tung-tuong-thich/:id', canQuyen('PHU_TUNG_SUA'), (req, res) => {
    db.prepare('DELETE FROM phu_tung_thiet_bi WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

/**
 * Phụ tùng tương thích của một thiết bị: gộp cả gắn theo nhóm, theo thiết bị
 * và theo từng cụm, để khi lập phiếu sửa chữa gợi ý được đúng thứ cần dùng.
 */
r.get('/thiet-bi/:tbId/phu-tung', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    res.json(db.prepare(`
        SELECT ptb.id, ptb.so_luong_khuyen_nghi, ptb.la_chinh, ptb.ghi_chu,
               pt.id AS phu_tung_id, pt.ma_phu_tung, pt.ten, pt.part_number, pt.dvt,
               pt.hang_sx, pt.quy_cach, pt.gia_chuan,
               c.id AS cum_id, c.ten AS ten_cum, c.ma_cum,
               CASE WHEN ptb.cum_id IS NOT NULL THEN 'cum'
                    WHEN ptb.thiet_bi_id IS NOT NULL THEN 'thiet_bi'
                    ELSE 'nhom' END AS pham_vi
        FROM phu_tung_thiet_bi ptb
        JOIN phu_tung pt ON pt.id = ptb.phu_tung_id AND pt.hoat_dong=1
        LEFT JOIN cum_thiet_bi c ON c.id = ptb.cum_id
        WHERE ptb.thiet_bi_id = ?
           OR ptb.nhom_id = ?
           OR ptb.cum_id IN (SELECT id FROM cum_thiet_bi WHERE thiet_bi_id = ?)
        ORDER BY ptb.la_chinh DESC, pt.ten`).all(tb.id, tb.nhom_id, tb.id));
});

/* =====================================================================
   4. TÀI LIỆU KỸ THUẬT
   ===================================================================== */

r.get('/thiet-bi/:tbId/tai-lieu', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    const ds = db.prepare(`SELECT t.*, nd.ho_ten AS nguoi_tai, c.ten AS ten_cum
                           FROM tai_lieu_ky_thuat t
                           LEFT JOIN nguoi_dung nd ON nd.id = t.nguoi_tai_id
                           LEFT JOIN cum_thiet_bi c ON c.id = t.cum_id
                           WHERE (t.thiet_bi_id=? OR t.cum_id IN
                                  (SELECT id FROM cum_thiet_bi WHERE thiet_bi_id=?))
                             AND t.hoat_dong=1
                           ORDER BY t.loai_tai_lieu, t.ten_tai_lieu`).all(tb.id, tb.id);

    // Nhóm theo loại để hiển thị dạng cây tài liệu
    const nhom = {};
    ds.forEach(x => { (nhom[x.loai_tai_lieu] = nhom[x.loai_tai_lieu] || []).push(x); });
    res.json({ danh_sach: ds, theo_loai: nhom });
});

r.post('/thiet-bi/:tbId/tai-lieu', canQuyen('TAI_LIEU_TAI_LEN'), upload.single('file'), US.validateDisk('documents'), (req, res) => {
    const tb = layTB(req, res);
    if (!tb) { if (req.file) fs.unlinkSync(req.file.path); return; }
    const b = req.body || {};
    if (!b.ten_tai_lieu && !req.file) return res.status(400).json({ loi: 'Nhập tên tài liệu hoặc chọn tệp' });

    const info = db.prepare(`INSERT INTO tai_lieu_ky_thuat (thiet_bi_id, cum_id, loai_tai_lieu,
        so_van_ban, ten_tai_lieu, ten_file, duong_dan, loai_file, kich_thuoc,
        ngay_ban_hanh, ngay_het_hieu_luc, phien_ban, nguoi_tai_id, ghi_chu)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.cum_id ? null : tb.id, b.cum_id || null, b.loai_tai_lieu || 'khac',
           b.so_van_ban || null, b.ten_tai_lieu || req.file?.originalname,
           req.file?.originalname || null, req.file?.filename || null,
           req.file ? path.extname(req.file.originalname).slice(1).toLowerCase() : null,
           req.file?.size || null, b.ngay_ban_hanh || null, b.ngay_het_hieu_luc || null,
           b.phien_ban || null, req.session.nguoiDung.id, b.ghi_chu || null);

    ghiAudit(req, 'TAI_LIEU_KT_TAI_LEN', 'tai_lieu_ky_thuat', info.lastInsertRowid,
             `${tb.ma_tb}: tài liệu ${b.ten_tai_lieu || req.file?.originalname}`);
    res.json({ id: info.lastInsertRowid });
});

r.get('/tai-lieu/:id/tai-ve', (req, res) => {
    const t = db.prepare(`SELECT t.*,COALESCE(tb.phan_xuong_id,ctb.phan_xuong_id) AS don_vi_id
        FROM tai_lieu_ky_thuat t LEFT JOIN thiet_bi tb ON tb.id=t.thiet_bi_id
        LEFT JOIN cum_thiet_bi c ON c.id=t.cum_id LEFT JOIN thiet_bi ctb ON ctb.id=c.thiet_bi_id
        WHERE t.id=? AND t.hoat_dong=1`).get(req.params.id);
    if (!t || !t.duong_dan) return res.status(404).json({ loi: 'Không tìm thấy tệp' });
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds !== null && !ds.includes(Number(t.don_vi_id))) return res.status(403).json({ loi: 'Không có quyền tải tài liệu' });
    res.download(path.join(THU_MUC, t.duong_dan), t.ten_file || 'tai-lieu');
});

r.delete('/tai-lieu/:id', canQuyen('TAI_LIEU_XOA'), (req, res) => {
    db.prepare('UPDATE tai_lieu_ky_thuat SET hoat_dong=0 WHERE id=?').run(req.params.id);
    ghiAudit(req, 'TAI_LIEU_KT_XOA', 'tai_lieu_ky_thuat', req.params.id, 'Xóa mềm tài liệu');
    res.json({ ok: true });
});

/* =====================================================================
   5. TIMELINE & CHI PHÍ VÒNG ĐỜI
   ===================================================================== */

r.get('/thiet-bi/:tbId/timeline', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    res.json(KT.timeline(tb.id, req.query.loc || null, Number(req.query.gioi_han) || 200));
});

r.get('/thiet-bi/:tbId/chi-phi', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;

    const theoThang = db.prepare(`
        SELECT thang, SUM(sua_chua) sua_chua, SUM(bao_duong) bao_duong, SUM(vat_tu) vat_tu FROM (
            SELECT substr(COALESCE(ngay_hoan_thanh, ngay_bat_dau),1,7) thang,
                   COALESCE(tong_chi_phi,0) sua_chua, 0 bao_duong, COALESCE(chi_phi_vat_tu,0) vat_tu
            FROM phieu_sua_chua WHERE thiet_bi_id=? AND trang_thai='hoan_thanh'
            UNION ALL
            SELECT substr(COALESCE(ngay_thuc_hien, ngay_ke_hoach),1,7),
                   0, COALESCE(tong_chi_phi,0), COALESCE(chi_phi_vat_tu,0)
            FROM phieu_bao_duong WHERE thiet_bi_id=? AND trang_thai='hoan_thanh')
        WHERE thang IS NOT NULL GROUP BY thang ORDER BY thang`).all(tb.id, tb.id);

    res.json({
        tong_hop: db.prepare('SELECT * FROM v_chi_phi_vong_doi WHERE thiet_bi_id=?').get(tb.id),
        theo_thang: theoThang,
        suc_khoe: db.prepare('SELECT * FROM v_suc_khoe_thiet_bi WHERE thiet_bi_id=?').get(tb.id)
    });
});

/** Hồ sơ tổng quan: KPI của tab Tổng quan */
r.get('/thiet-bi/:tbId/tong-quan', (req, res) => {
    const tb = layTB(req, res); if (!tb) return;
    const q = (sql, ...p) => db.prepare(sql).get(...p);

    res.json({
        so_lan_sua_chua: q(`SELECT COUNT(*) n FROM phieu_sua_chua
                            WHERE thiet_bi_id=? AND trang_thai='hoan_thanh'`, tb.id).n,
        so_lan_bao_duong: q(`SELECT COUNT(*) n FROM phieu_bao_duong
                             WHERE thiet_bi_id=? AND trang_thai='hoan_thanh'`, tb.id).n,
        so_su_co: q('SELECT COUNT(*) n FROM su_co WHERE thiet_bi_id=?', tb.id).n,
        su_co_dang_mo: q(`SELECT COUNT(*) n FROM su_co WHERE thiet_bi_id=? AND trang_thai<>'da_dong'`, tb.id).n,
        so_cum: q('SELECT COUNT(*) n FROM cum_thiet_bi WHERE thiet_bi_id=? AND hoat_dong=1', tb.id).n,
        chi_phi: q('SELECT * FROM v_chi_phi_vong_doi WHERE thiet_bi_id=?', tb.id),
        suc_khoe: q('SELECT * FROM v_suc_khoe_thiet_bi WHERE thiet_bi_id=?', tb.id),
        bao_duong_gan_nhat: q(`SELECT ngay_thuc_hien, cap_bd FROM phieu_bao_duong
                               WHERE thiet_bi_id=? AND trang_thai='hoan_thanh'
                               ORDER BY ngay_thuc_hien DESC LIMIT 1`, tb.id),
        bao_duong_ke_tiep: q(`SELECT lan_ke_tiep, ten_ke_hoach, muc_canh_bao, con_lai_ngay
                              FROM v_canh_bao_bao_duong WHERE thiet_bi_id=?
                              ORDER BY lan_ke_tiep LIMIT 1`, tb.id)
    });
});


/**
 * Di chuyển một cụm sang vị trí khác trong cây.
 * Chặn chuyển cụm vào chính cây con của nó, nếu không cây sẽ tự tham chiếu
 * và mọi truy vấn đệ quy sẽ lặp vô hạn.
 */
r.post('/cum/:id/di-chuyen', canQuyen('CUM_SUA'), (req, res) => {
    const c = db.prepare(`SELECT c.*, tb.phan_xuong_id FROM cum_thiet_bi c
                          JOIN thiet_bi tb ON tb.id = c.thiet_bi_id WHERE c.id=?`).get(req.params.id);
    if (!c) return res.status(404).json({ loi: 'Không tìm thấy cụm' });
    const dsdv = donViDuocPhep(req.session.nguoiDung);
    if (dsdv !== null && !dsdv.includes(Number(c.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Bạn không có quyền thao tác trên đơn vị này' });
    }

    const chaMoi = req.body?.cha_id ? Number(req.body.cha_id) : null;
    if (chaMoi === Number(c.id)) {
        return res.status(400).json({ loi: 'Không thể đặt một cụm làm cụm cha của chính nó' });
    }

    if (chaMoi) {
        const cha = db.prepare('SELECT thiet_bi_id FROM cum_thiet_bi WHERE id=?').get(chaMoi);
        if (!cha) return res.status(400).json({ loi: 'Không tìm thấy cụm cha mới' });
        if (Number(cha.thiet_bi_id) !== Number(c.thiet_bi_id)) {
            return res.status(400).json({ loi: 'Không chuyển cụm sang thiết bị khác' });
        }
        // Toàn bộ cây con của cụm đang di chuyển
        const conChau = db.prepare(`
            WITH RECURSIVE cay(id) AS (
                SELECT id FROM cum_thiet_bi WHERE cha_id = ?
                UNION ALL
                SELECT c.id FROM cum_thiet_bi c JOIN cay ON c.cha_id = cay.id)
            SELECT id FROM cay`).all(c.id).map(x => x.id);
        if (conChau.includes(chaMoi)) {
            return res.status(400).json({ loi: 'Không thể chuyển một cụm vào chính cây con của nó' });
        }
    }

    db.prepare(`UPDATE cum_thiet_bi SET cha_id=?, nguoi_sua_id=?,
                ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(chaMoi, req.session.nguoiDung.id, c.id);

    KT.ghiLichSuCum({ cum_id: c.id, thiet_bi_id: c.thiet_bi_id, loai_su_kien: 'chuyen_vi_tri',
        ngay_su_kien: new Date().toISOString().slice(0, 10),
        nguoi_thuc_hien_id: req.session.nguoiDung.id,
        ghi_chu: req.body?.ly_do || 'Đổi vị trí trong cấu trúc thiết bị' });
    ghiAudit(req, 'CUM_DI_CHUYEN', 'cum_thiet_bi', c.id, `Di chuyển cụm ${c.ma_cum}`);
    res.json({ ok: true, cha_id: chaMoi });
});

module.exports = r;
