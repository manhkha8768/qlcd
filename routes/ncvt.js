/**
 * NCVT QUÝ — NHU CẦU VẬT TƯ THEO QUÝ
 *
 * Điểm cốt lõi: số "còn lại" luôn do backend tính, không bao giờ tin
 * số lượng frontend gửi lên. Nghiệp vụ cấp phát chạy trong transaction
 * BEGIN IMMEDIATE, đọc lại số đã cấp ngay trong transaction, và có
 * ràng buộc CHECK ở database làm chốt chặn cuối cùng.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { canQuyen, coQuyen, donViDuocPhep } = require('../middleware/quyen-ma');
const xl = require('../lib/doc-excel');
const { ghiAudit, taoThongBao } = require('../lib/giao-dich');

const THU_MUC = path.join(__dirname, '..', 'uploads', 'ncvt');
if (!fs.existsSync(THU_MUC)) fs.mkdirSync(THU_MUC, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (q, f, cb) => cb(null, THU_MUC),
        filename: (q, f, cb) => cb(null, `ncvt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname)}`)
    }),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (q, f, cb) => {
        const ok = /\.(xlsx|xls|xlsm|csv)$/i.test(f.originalname);
        cb(ok ? null : new Error('Chỉ nhận file Excel (.xlsx, .xls) hoặc .csv'), ok);
    }
});

const r = express.Router();
r.use(dangNhap);

/* ---------- Phạm vi đơn vị người dùng được xem ---------- */
function phamViPX(req) {
    const u = req.session.nguoiDung;
    if (coQuyen(u.id, u.vai_tro, 'NCVT_XEM_HET')) return null;   // toàn công ty
    return donViDuocPhep(u);
}
function duocXemKy(req, ky) {
    const ds = phamViPX(req);
    if (ds === null) return true;
    // Kỳ chung toàn công ty thì ai cũng xem được phần chi tiết của đơn vị mình
    if (ky.phan_xuong_id === null) return true;
    return ds.includes(Number(ky.phan_xuong_id));
}

/* =====================================================================
   1. KỲ NCVT
   ===================================================================== */
r.get('/ky', canQuyen('NCVT_XEM'), (req, res) => {
    let sql = 'SELECT * FROM v_ncvt_ky WHERE 1=1';
    const p = [];
    if (req.query.nam) { sql += ' AND nam=?'; p.push(req.query.nam); }
    if (req.query.quy) { sql += ' AND quy=?'; p.push(req.query.quy); }
    if (req.query.trang_thai) { sql += ' AND trang_thai=?'; p.push(req.query.trang_thai); }

    const ds = phamViPX(req);
    if (ds !== null) {
        sql += ds.length
            ? ` AND (phan_xuong_id IS NULL OR phan_xuong_id IN (${ds.map(() => '?').join(',')}))`
            : ' AND phan_xuong_id IS NULL';
        p.push(...ds);
    }
    sql += ' ORDER BY nam DESC, quy DESC, id DESC';
    res.json(db.prepare(sql).all(...p));
});

r.post('/ky', canQuyen('NCVT_IMPORT'), (req, res) => {
    const b = req.body || {};
    const nam = Number(b.nam), quy = Number(b.quy);
    if (!nam || !(quy >= 1 && quy <= 4)) {
        return res.status(400).json({ loi: 'Chọn năm và quý hợp lệ' });
    }
    const pxId = b.phan_xuong_id ? Number(b.phan_xuong_id) : null;
    if (pxId) {
        const ds = donViDuocPhep(req.session.nguoiDung);
        if (ds !== null && !ds.includes(pxId)) {
            return res.status(403).json({ loi: 'Bạn không có quyền lập kỳ cho đơn vị này' });
        }
    }
    try {
        const i = db.prepare(`INSERT INTO ncvt_ky (nam, quy, ten_ky, phan_xuong_id, nguoi_tao_id, ghi_chu)
                              VALUES (?,?,?,?,?,?)`)
          .run(nam, quy, b.ten_ky || `NCVT Q${quy}/${nam}`, pxId,
               req.session.nguoiDung.id, b.ghi_chu || null);
        ghiAudit(req, 'NCVT_TAO_KY', 'ncvt_ky', i.lastInsertRowid, `Lập kỳ NCVT Q${quy}/${nam}`);
        res.json({ id: i.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) {
            return res.status(400).json({ loi: `Kỳ NCVT Q${quy}/${nam} của đơn vị này đã tồn tại` });
        }
        throw e;
    }
});

r.get('/ky/:id', canQuyen('NCVT_XEM'), (req, res) => {
    const ky = layKy(req, res); if (!ky) return;
    res.json({
        ky,
        lo_import: db.prepare(`SELECT l.*, nd.ho_ten AS nguoi_tai FROM ncvt_lo_import l
                               LEFT JOIN nguoi_dung nd ON nd.id = l.nguoi_tai_id
                               WHERE l.ky_id=? ORDER BY l.ngay_tai DESC`).all(ky.id),
        thong_ke: thongKeKy(req, ky.id)
    });
});

/** Kích hoạt kỳ: chỉ khi đã kích hoạt mới cho lấy vật tư */
r.post('/ky/:id/kich-hoat', canQuyen('NCVT_QUAN_LY'), (req, res) => {
    const ky = layKy(req, res); if (!ky) return;
    if (ky.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Kỳ đã đóng' });
    if (ky.trang_thai === 'dang_ap_dung') return res.status(400).json({ loi: 'Kỳ đang áp dụng rồi' });

    const soMH = db.prepare('SELECT COUNT(*) n FROM ncvt_chi_tiet WHERE ky_id=? AND hoat_dong=1').get(ky.id).n;
    if (!soMH) return res.status(400).json({ loi: 'Kỳ chưa có mặt hàng nào, nhập dữ liệu trước khi kích hoạt' });

    db.prepare(`UPDATE ncvt_ky SET trang_thai='dang_ap_dung',
                ngay_kich_hoat=datetime('now','localtime') WHERE id=?`).run(ky.id);
    ghiAudit(req, 'NCVT_KICH_HOAT', 'ncvt_ky', ky.id,
             `Kích hoạt kỳ Q${ky.quy}/${ky.nam} với ${soMH} mặt hàng`,
             { trang_thai: ky.trang_thai }, { trang_thai: 'dang_ap_dung' });
    res.json({ ok: true, so_mat_hang: soMH });
});

r.post('/ky/:id/dong', canQuyen('NCVT_QUAN_LY'), (req, res) => {
    const ky = layKy(req, res); if (!ky) return;
    if (ky.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Kỳ đã đóng trước đó' });

    db.prepare(`UPDATE ncvt_ky SET trang_thai='da_dong', nguoi_dong_id=?,
                ngay_dong=datetime('now','localtime'), ly_do_dong=? WHERE id=?`)
      .run(req.session.nguoiDung.id, req.body?.ly_do || null, ky.id);
    ghiAudit(req, 'NCVT_DONG_KY', 'ncvt_ky', ky.id, `Đóng kỳ Q${ky.quy}/${ky.nam}`,
             { trang_thai: ky.trang_thai }, { trang_thai: 'da_dong' });
    res.json({ ok: true });
});

/* =====================================================================
   2. IMPORT FILE NCVT
   ===================================================================== */
const TU_DIEN = {
    ma_vat_tu:   ['ma vat tu', 'ma vt', 'ma vthh', 'ma hang', 'ma so', 'ma'],
    ten_vat_tu:  ['ten vat tu', 'ten vt', 'ten vthh', 'ten hang', 'ten', 'noi dung',
                  'dien giai', 'ten vat tu hang hoa'],
    quy_cach:    ['quy cach', 'thong so', 'quy cach ky thuat', 'dac tinh', 'ma hieu'],
    dvt:         ['dvt', 'don vi tinh', 'dv tinh'],
    so_luong_kh: ['so luong', 'sl', 'nhu cau', 'so luong ncvt', 'ncvt', 'so luong quy',
                  'khoi luong', 'so luong ke hoach'],
    don_gia:     ['don gia', 'gia', 'don gia du toan'],
    cong_trinh:  ['cong trinh', 'ten cong trinh', 'hang muc', 'duong lo'],
    ghi_chu:     ['ghi chu', 'note']
};

r.post('/ky/:id/tai-len', canQuyen('NCVT_IMPORT'), upload.single('file'), (req, res) => {
    const ky = layKy(req, res, true);
    if (!ky) { if (req.file) fs.unlinkSync(req.file.path); return; }
    if (!req.file) return res.status(400).json({ loi: 'Chưa chọn file' });
    if (ky.trang_thai === 'da_dong') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ loi: 'Kỳ đã đóng, không nhập thêm dữ liệu được' });
    }

    let pt;
    try {
        pt = xl.phanTich(req.file.path, null, null);
        pt.anh_xa_goi_y = goiYAnhXa(pt.cot);
    } catch (e) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ loi: 'Không đọc được file: ' + e.message });
    }

    const i = db.prepare(`INSERT INTO ncvt_lo_import (ky_id, ten_file, duong_dan, ten_sheet,
            dong_tieu_de, mapping_json, tong_dong, nguoi_tai_id) VALUES (?,?,?,?,?,?,?,?)`)
      .run(ky.id, req.file.originalname, req.file.filename, pt.ten_sheet, pt.dong_tieu_de,
           JSON.stringify(pt.anh_xa_goi_y), pt.tong_dong_du_lieu, req.session.nguoiDung.id);

    ghiAudit(req, 'NCVT_TAI_FILE', 'ncvt_lo_import', i.lastInsertRowid,
             `Tải ${req.file.originalname} cho kỳ Q${ky.quy}/${ky.nam}`);
    res.json({ lo_id: i.lastInsertRowid, ...pt });
});

function goiYAnhXa(cot) {
    const ungVien = [];
    for (const truong of Object.keys(TU_DIEN)) {
        for (const c of cot) {
            const t = xl.khongDau(c.ten);
            let d = 0;
            for (const tk of TU_DIEN[truong]) {
                if (t === tk) d = Math.max(d, 100);
                else if (t.startsWith(tk) || tk.startsWith(t)) d = Math.max(d, 80);
                else if (t.includes(tk)) d = Math.max(d, 65);
            }
            if (d >= 65) ungVien.push({ truong, chi_so: c.chi_so, diem: d });
        }
    }
    ungVien.sort((a, b) => b.diem - a.diem);
    const ax = {}, daDung = new Set();
    for (const u of ungVien) {
        if (ax[u.truong] !== undefined || daDung.has(u.chi_so)) continue;
        ax[u.truong] = u.chi_so;
        daDung.add(u.chi_so);
    }
    return ax;
}

r.get('/lo/:loId/phan-tich', canQuyen('NCVT_IMPORT'), (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    try {
        const pt = xl.phanTich(path.join(THU_MUC, lo.duong_dan),
                               req.query.sheet || lo.ten_sheet, req.query.dong_tieu_de);
        pt.anh_xa_goi_y = goiYAnhXa(pt.cot);
        res.json(pt);
    } catch (e) { res.status(400).json({ loi: e.message }); }
});

/** Đọc dữ liệu vào bảng tạm và kiểm tra từng dòng */
r.post('/lo/:loId/anh-xa', canQuyen('NCVT_IMPORT'), (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    if (lo.trang_thai === 'da_nhap') return res.status(400).json({ loi: 'Lô này đã nhập rồi' });

    const { ten_sheet, dong_tieu_de, mapping } = req.body || {};
    if (!mapping || mapping.ten_vat_tu === undefined) {
        return res.status(400).json({ loi: 'Bắt buộc ánh xạ cột Tên vật tư' });
    }
    if (mapping.so_luong_kh === undefined) {
        return res.status(400).json({ loi: 'Bắt buộc ánh xạ cột Số lượng NCVT' });
    }

    let dong;
    try {
        dong = xl.docDuLieu(path.join(THU_MUC, lo.duong_dan), ten_sheet || lo.ten_sheet,
                            Number(dong_tieu_de ?? lo.dong_tieu_de), mapping);
    } catch (e) { return res.status(400).json({ loi: 'Lỗi đọc dữ liệu: ' + e.message }); }

    const kq = db.transaction(() => {
        db.prepare('DELETE FROM ncvt_tam WHERE lo_id=?').run(lo.id);
        const them = db.prepare(`INSERT INTO ncvt_tam (lo_id, dong_goc, du_lieu_goc, ma_vat_tu,
                ten_vat_tu, quy_cach, dvt, so_luong_kh, don_gia, cong_trinh, ghi_chu,
                hop_le, loi, canh_bao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

        let hl = 0, l = 0;
        const maTrongFile = new Map();

        for (const d of dong) {
            const ten = d.ten_vat_tu ? String(d.ten_vat_tu).trim() : null;
            const ma = d.ma_vat_tu ? String(d.ma_vat_tu).trim() : null;
            const sl = xl.veSo(d.so_luong_kh);

            const loi = [];
            if (!ten || ten.length < 2) loi.push('Thiếu tên vật tư');
            if (sl === null) loi.push('Thiếu số lượng NCVT');
            else if (sl < 0) loi.push('Số lượng âm');
            else if (sl === 0) loi.push('Số lượng bằng 0');

            const cb = [];
            if (!d.dvt) cb.push('Thiếu đơn vị tính');
            if (ma) {
                if (maTrongFile.has(ma)) cb.push(`Trùng mã với dòng ${maTrongFile.get(ma)}`);
                else maTrongFile.set(ma, d.dong_goc);
                const daCo = db.prepare(`SELECT id FROM ncvt_chi_tiet
                    WHERE ky_id=? AND ma_vat_tu=? AND hoat_dong=1`).get(lo.ky_id, ma);
                if (daCo) cb.push('Mã này đã có trong kỳ, nhập tiếp sẽ tạo dòng thứ hai');
            }

            them.run(lo.id, d.dong_goc, JSON.stringify(d.du_lieu_goc), ma, ten,
                d.quy_cach ? String(d.quy_cach).trim() : null,
                d.dvt ? String(d.dvt).trim() : null, sl, xl.veSo(d.don_gia),
                d.cong_trinh ? String(d.cong_trinh).trim() : null,
                d.ghi_chu ? String(d.ghi_chu).trim() : null,
                loi.length ? 0 : 1, loi.length ? loi.join('; ') : null,
                cb.length ? cb.join('; ') : null);
            loi.length ? l++ : hl++;
        }

        db.prepare(`UPDATE ncvt_lo_import SET ten_sheet=?, dong_tieu_de=?, mapping_json=?,
                    tong_dong=?, so_hop_le=?, so_loi=?, trang_thai='da_anh_xa' WHERE id=?`)
          .run(ten_sheet || lo.ten_sheet, Number(dong_tieu_de ?? lo.dong_tieu_de),
               JSON.stringify(mapping), dong.length, hl, l, lo.id);

        return { tong: dong.length, hop_le: hl, loi: l };
    })();

    res.json(kq);
});

r.get('/lo/:loId/dong', canQuyen('NCVT_XEM'), (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    let sql = 'SELECT * FROM ncvt_tam WHERE lo_id=?';
    if (req.query.loc === 'loi') sql += ' AND hop_le=0';
    if (req.query.loc === 'canh_bao') sql += ' AND canh_bao IS NOT NULL';
    if (req.query.loc === 'hop_le') sql += ' AND hop_le=1';
    sql += ' ORDER BY dong_goc LIMIT 1000';
    res.json(db.prepare(sql).all(lo.id));
});

r.put('/lo/:loId/dong/:dongId', canQuyen('NCVT_IMPORT'), (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    const d = db.prepare('SELECT * FROM ncvt_tam WHERE id=? AND lo_id=?').get(req.params.dongId, lo.id);
    if (!d) return res.status(404).json({ loi: 'Không tìm thấy dòng' });

    const b = req.body || {};
    const ten = b.ten_vat_tu !== undefined ? b.ten_vat_tu : d.ten_vat_tu;
    const sl = b.so_luong_kh !== undefined ? Number(b.so_luong_kh) : d.so_luong_kh;
    const loi = [];
    if (!ten || String(ten).trim().length < 2) loi.push('Thiếu tên vật tư');
    if (!(sl > 0)) loi.push('Số lượng phải lớn hơn 0');

    db.prepare(`UPDATE ncvt_tam SET ma_vat_tu=?, ten_vat_tu=?, quy_cach=?, dvt=?,
                so_luong_kh=?, don_gia=?, cong_trinh=?, ghi_chu=?, hop_le=?, loi=? WHERE id=?`)
      .run(b.ma_vat_tu ?? d.ma_vat_tu, ten, b.quy_cach ?? d.quy_cach, b.dvt ?? d.dvt,
           sl, b.don_gia ?? d.don_gia, b.cong_trinh ?? d.cong_trinh, b.ghi_chu ?? d.ghi_chu,
           loi.length ? 0 : 1, loi.length ? loi.join('; ') : null, d.id);

    const t = db.prepare(`SELECT COUNT(*) tong, SUM(hop_le) hl FROM ncvt_tam WHERE lo_id=?`).get(lo.id);
    db.prepare('UPDATE ncvt_lo_import SET so_hop_le=?, so_loi=? WHERE id=?')
      .run(t.hl || 0, t.tong - (t.hl || 0), lo.id);
    res.json({ hop_le: loi.length ? 0 : 1, loi: loi.join('; ') || null });
});

/** Xác nhận nhập chính thức — chạy trong một transaction */
r.post('/lo/:loId/xac-nhan', canQuyen('NCVT_IMPORT'), (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    if (lo.trang_thai === 'da_nhap') return res.status(400).json({ loi: 'Lô này đã nhập rồi' });

    const ky = db.prepare('SELECT * FROM ncvt_ky WHERE id=?').get(lo.ky_id);
    if (ky.trang_thai === 'da_dong') return res.status(400).json({ loi: 'Kỳ đã đóng' });

    const ds = db.prepare('SELECT * FROM ncvt_tam WHERE lo_id=? AND hop_le=1 AND da_nhap=0').all(lo.id);
    if (!ds.length) return res.status(400).json({ loi: 'Không có dòng hợp lệ nào để nhập' });

    const pxMacDinh = req.body?.phan_xuong_id ? Number(req.body.phan_xuong_id) : ky.phan_xuong_id;

    let nhap = 0;
    // Toàn bộ lô nhập trong một transaction: lỗi giữa chừng thì hủy sạch,
    // không để kỳ NCVT chỉ có một nửa dữ liệu.
    db.transaction(() => {
        const them = db.prepare(`INSERT INTO ncvt_chi_tiet (ky_id, lo_import_id, ma_vat_tu,
                ten_vat_tu, quy_cach, dvt, don_gia, so_luong_kh, phan_xuong_id, cong_trinh,
                dong_goc, ghi_chu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const d of ds) {
            const i = them.run(lo.ky_id, lo.id, d.ma_vat_tu, d.ten_vat_tu, d.quy_cach,
                d.dvt || 'Cái', d.don_gia || 0, d.so_luong_kh, pxMacDinh,
                d.cong_trinh, d.dong_goc, d.ghi_chu);
            db.prepare('UPDATE ncvt_tam SET da_nhap=1 WHERE id=?').run(d.id);
            nhap++;
        }
        db.prepare(`UPDATE ncvt_lo_import SET so_da_nhap=?, trang_thai='da_nhap',
                    ngay_nhap=datetime('now','localtime') WHERE id=?`).run(nhap, lo.id);
        if (ky.trang_thai === 'nhap') {
            db.prepare("UPDATE ncvt_ky SET trang_thai='da_nhap' WHERE id=?").run(ky.id);
        }
    })();

    ghiAudit(req, 'NCVT_IMPORT', 'ncvt_lo_import', lo.id,
             `${lo.ten_file}: nhập ${nhap} mặt hàng vào kỳ Q${ky.quy}/${ky.nam}`);
    res.json({ da_nhap: nhap });
});

/* =====================================================================
   3. DANH SÁCH VẬT TƯ NCVT
   ===================================================================== */
r.get('/vat-tu', canQuyen('NCVT_XEM'), (req, res) => {
    let sql = 'SELECT * FROM v_ncvt_chi_tiet WHERE 1=1';
    const p = [];
    if (req.query.ky_id) { sql += ' AND ky_id=?'; p.push(req.query.ky_id); }
    if (req.query.nam) { sql += ' AND nam=?'; p.push(req.query.nam); }
    if (req.query.quy) { sql += ' AND quy=?'; p.push(req.query.quy); }
    if (req.query.phan_xuong_id) { sql += ' AND phan_xuong_id=?'; p.push(req.query.phan_xuong_id); }
    if (req.query.cong_trinh) { sql += ' AND cong_trinh=?'; p.push(req.query.cong_trinh); }
    if (req.query.trang_thai_cap) { sql += ' AND trang_thai_cap=?'; p.push(req.query.trang_thai_cap); }
    if (req.query.q) {
        const k = '%' + req.query.q.trim() + '%';
        sql += ' AND (ma_vat_tu LIKE ? OR ten_vat_tu LIKE ? OR quy_cach LIKE ?)';
        p.push(k, k, k);
    }

    const ds = phamViPX(req);
    if (ds !== null) {
        sql += ds.length
            ? ` AND (phan_xuong_id IS NULL OR phan_xuong_id IN (${ds.map(() => '?').join(',')}))`
            : ' AND phan_xuong_id IS NULL';
        p.push(...ds);
    }
    sql += ' ORDER BY ma_vat_tu, ten_vat_tu LIMIT ?';
    p.push(Math.min(2000, Number(req.query.gioi_han) || 500));
    res.json(db.prepare(sql).all(...p));
});

r.get('/vat-tu/:id', canQuyen('NCVT_XEM'), (req, res) => {
    const ct = db.prepare('SELECT * FROM v_ncvt_chi_tiet WHERE id=?').get(req.params.id);
    if (!ct) return res.status(404).json({ loi: 'Không tìm thấy vật tư trong NCVT' });
    const ds = phamViPX(req);
    if (ds !== null && ct.phan_xuong_id && !ds.includes(Number(ct.phan_xuong_id))) {
        return res.status(403).json({ loi: 'Bạn không có quyền xem vật tư của đơn vị này' });
    }

    const lich_su = db.prepare(`
        SELECT cp.*, px.ten_ngan AS px, nd.ho_ten AS nguoi_cap, nh.ho_ten AS nguoi_huy
        FROM ncvt_cap_phat cp
        LEFT JOIN phan_xuong px ON px.id = cp.phan_xuong_id
        LEFT JOIN nguoi_dung nd ON nd.id = cp.nguoi_cap_id
        LEFT JOIN nguoi_dung nh ON nh.id = cp.nguoi_huy_id
        WHERE cp.chi_tiet_id=? ORDER BY cp.ngay_cap DESC, cp.id DESC`).all(ct.id);

    // Đối chiếu với file gốc: dòng Excel nguồn
    let dong_goc = null;
    if (ct.lo_import_id && ct.dong_goc) {
        const t = db.prepare('SELECT du_lieu_goc FROM ncvt_tam WHERE lo_id=? AND dong_goc=?')
            .get(ct.lo_import_id, ct.dong_goc);
        if (t) { try { dong_goc = JSON.parse(t.du_lieu_goc); } catch (e) {} }
    }

    res.json({
        chi_tiet: ct, lich_su, dong_goc,
        file_nguon: ct.lo_import_id
            ? db.prepare('SELECT id, ten_file, ngay_tai FROM ncvt_lo_import WHERE id=?').get(ct.lo_import_id)
            : null,
        khop_so_lieu: Math.abs((ct.tong_cap_thuc_te || 0) - (ct.so_luong_da_cap || 0)) < 1e-9
    });
});

/* =====================================================================
   4. LẤY VẬT TƯ — nghiệp vụ quan trọng nhất
   ===================================================================== */
r.post('/vat-tu/:id/lay', canQuyen('NCVT_CAP'), (req, res) => {
    const u = req.session.nguoiDung;
    const b = req.body || {};
    const soLuong = Number(b.so_luong);

    if (!(soLuong > 0)) return res.status(400).json({ loi: 'Số lượng lấy phải lớn hơn 0' });

    try {
        const kq = db.transaction(() => {
            // Đọc lại ngay trong transaction, không tin số liệu frontend gửi lên
            const ct = db.prepare('SELECT * FROM ncvt_chi_tiet WHERE id=? AND hoat_dong=1')
                .get(req.params.id);
            if (!ct) throw loiNV('Không tìm thấy vật tư trong NCVT', 404);

            const ky = db.prepare('SELECT * FROM ncvt_ky WHERE id=?').get(ct.ky_id);
            if (ky.trang_thai === 'da_dong') throw loiNV('Kỳ NCVT đã đóng, không lấy vật tư được', 400);
            if (ky.trang_thai === 'huy') throw loiNV('Kỳ NCVT đã hủy', 400);
            if (ky.trang_thai !== 'dang_ap_dung') {
                throw loiNV('Kỳ NCVT chưa được kích hoạt, chưa lấy vật tư được', 400);
            }

            // Quyền theo đơn vị
            const ds = donViDuocPhep(u);
            const pxNhan = b.phan_xuong_id ? Number(b.phan_xuong_id)
                         : (ct.phan_xuong_id || (ds && ds.length ? ds[0] : null));
            if (!pxNhan) throw loiNV('Chưa xác định phân xưởng nhận vật tư', 400);
            if (ds !== null && !ds.includes(pxNhan)) {
                throw loiNV('Bạn không có quyền lấy vật tư cho đơn vị này', 403);
            }
            if (ds !== null && ct.phan_xuong_id && !ds.includes(Number(ct.phan_xuong_id))) {
                throw loiNV('Vật tư này thuộc đơn vị khác', 403);
            }

            const daCap = ct.so_luong_da_cap;
            const conLai = ct.so_luong_kh - daCap;
            if (soLuong > conLai + 1e-9) {
                throw loiNV(`Số lượng lấy vượt quá số lượng NCVT còn lại. ` +
                            `Kế hoạch ${ct.so_luong_kh}, đã lấy ${daCap}, còn ${conLai} ${ct.dvt || ''}.`, 409);
            }

            const moi = daCap + soLuong;
            const maPhieu = sinhMaPhieu(ky);

            const i = db.prepare(`INSERT INTO ncvt_cap_phat (ma_phieu, ky_id, chi_tiet_id,
                    ma_vat_tu, ten_vat_tu, dvt, don_gia, so_luong, so_luong_truoc, so_luong_sau,
                    phan_xuong_id, cong_trinh, chu_nhiem, nguoi_nhan, noi_dung_su_dung,
                    ghi_chu, ngay_cap, nguoi_cap_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(maPhieu, ky.id, ct.id, ct.ma_vat_tu, ct.ten_vat_tu, ct.dvt, ct.don_gia,
                   soLuong, daCap, moi, pxNhan, b.cong_trinh || ct.cong_trinh || null,
                   b.chu_nhiem || u.ho_ten || u.ten_dang_nhap, b.nguoi_nhan || null,
                   b.noi_dung_su_dung || null, b.ghi_chu || null,
                   b.ngay_cap || new Date().toISOString().slice(0, 10), u.id);

            // Ràng buộc CHECK so_luong_da_cap <= so_luong_kh là chốt chặn cuối cùng
            db.prepare(`UPDATE ncvt_chi_tiet SET so_luong_da_cap=?,
                        ngay_sua=datetime('now','localtime') WHERE id=?`).run(moi, ct.id);

            return { id: i.lastInsertRowid, ma_phieu: maPhieu, ten_vat_tu: ct.ten_vat_tu,
                     dvt: ct.dvt, so_luong_kh: ct.so_luong_kh,
                     da_lay: moi, con_lai: ct.so_luong_kh - moi };
        }).immediate();

        ghiAudit(req, 'NCVT_LAY_VAT_TU', 'ncvt_cap_phat', kq.id,
                 `${kq.ma_phieu}: lấy ${soLuong} ${kq.dvt || ''} ${kq.ten_vat_tu}`,
                 { con_lai: kq.con_lai + soLuong }, { con_lai: kq.con_lai });

        if (kq.con_lai <= 0) {
            baoQuanLy(req, 'Vật tư đã cấp hết NCVT',
                `${kq.ten_vat_tu} đã cấp hết ${kq.so_luong_kh} ${kq.dvt || ''} theo NCVT quý.`, kq.id);
        }
        res.json(kq);
    } catch (e) {
        if (e.nghiepVu) return res.status(e.maHttp).json({ loi: e.message });
        if (/CHECK constraint/.test(e.message)) {
            return res.status(409).json({ loi: 'Số lượng lấy vượt quá số lượng NCVT còn lại.' });
        }
        throw e;
    }
});

function sinhMaPhieu(ky) {
    const tien = `CP-Q${ky.quy}${ky.nam}-`;
    const row = db.prepare(`SELECT ma_phieu FROM ncvt_cap_phat WHERE ma_phieu LIKE ?
                            ORDER BY ma_phieu DESC LIMIT 1`).get(tien + '%');
    let stt = row ? (parseInt(row.ma_phieu.slice(tien.length), 10) || 0) + 1 : 1;
    let ma;
    do { ma = tien + String(stt).padStart(4, '0'); stt++; }
    while (db.prepare('SELECT 1 FROM ncvt_cap_phat WHERE ma_phieu=?').get(ma));
    return ma;
}

/* ---------- Hủy giao dịch: hoàn lại số lượng, giữ nguyên bản ghi ---------- */
r.post('/cap-phat/:id/huy', canQuyen('NCVT_HUY_CAP'), (req, res) => {
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do hủy' });

    try {
        const kq = db.transaction(() => {
            const cp = db.prepare('SELECT * FROM ncvt_cap_phat WHERE id=?').get(req.params.id);
            if (!cp) throw loiNV('Không tìm thấy giao dịch', 404);
            if (cp.trang_thai === 'da_huy') throw loiNV('Giao dịch đã hủy trước đó', 400);

            const ky = db.prepare('SELECT * FROM ncvt_ky WHERE id=?').get(cp.ky_id);
            if (ky.trang_thai === 'da_dong') throw loiNV('Kỳ đã đóng, không hủy giao dịch được', 400);

            const ct = db.prepare('SELECT * FROM ncvt_chi_tiet WHERE id=?').get(cp.chi_tiet_id);
            const moi = Math.max(0, ct.so_luong_da_cap - cp.so_luong);

            db.prepare(`UPDATE ncvt_cap_phat SET trang_thai='da_huy', ly_do_huy=?,
                        nguoi_huy_id=?, ngay_huy=datetime('now','localtime') WHERE id=?`)
              .run(lyDo, req.session.nguoiDung.id, cp.id);
            db.prepare('UPDATE ncvt_chi_tiet SET so_luong_da_cap=? WHERE id=?').run(moi, ct.id);

            return { cp, da_lay: moi, con_lai: ct.so_luong_kh - moi };
        }).immediate();

        ghiAudit(req, 'NCVT_HUY_CAP_PHAT', 'ncvt_cap_phat', kq.cp.id,
                 `Hủy ${kq.cp.ma_phieu}: hoàn lại ${kq.cp.so_luong} ${kq.cp.dvt || ''}. Lý do: ${lyDo}`,
                 { trang_thai: 'hieu_luc' }, { trang_thai: 'da_huy', con_lai: kq.con_lai });
        res.json({ ok: true, da_lay: kq.da_lay, con_lai: kq.con_lai });
    } catch (e) {
        if (e.nghiepVu) return res.status(e.maHttp).json({ loi: e.message });
        throw e;
    }
});

/* ---------- Lịch sử cấp phát ---------- */
r.get('/cap-phat', canQuyen('NCVT_XEM'), (req, res) => {
    let sql = `SELECT cp.*, px.ten_ngan AS px, nd.ho_ten AS nguoi_cap, ky.nam, ky.quy
               FROM ncvt_cap_phat cp
               LEFT JOIN phan_xuong px ON px.id = cp.phan_xuong_id
               LEFT JOIN nguoi_dung nd ON nd.id = cp.nguoi_cap_id
               JOIN ncvt_ky ky ON ky.id = cp.ky_id
               WHERE 1=1`;
    const p = [];
    if (req.query.ky_id) { sql += ' AND cp.ky_id=?'; p.push(req.query.ky_id); }
    if (req.query.chi_tiet_id) { sql += ' AND cp.chi_tiet_id=?'; p.push(req.query.chi_tiet_id); }
    if (req.query.cong_trinh) { sql += ' AND cp.cong_trinh=?'; p.push(req.query.cong_trinh); }
    if (req.query.tu_ngay) { sql += ' AND cp.ngay_cap >= ?'; p.push(req.query.tu_ngay); }
    if (req.query.den_ngay) { sql += ' AND cp.ngay_cap <= ?'; p.push(req.query.den_ngay); }

    const ds = phamViPX(req);
    if (ds !== null) {
        sql += ds.length ? ` AND cp.phan_xuong_id IN (${ds.map(() => '?').join(',')})` : ' AND 1=0';
        p.push(...ds);
    }
    sql += ' ORDER BY cp.ngay_cap DESC, cp.id DESC LIMIT 500';
    res.json(db.prepare(sql).all(...p));
});

/* =====================================================================
   5. DASHBOARD NCVT
   ===================================================================== */
r.get('/thong-ke', canQuyen('NCVT_XEM'), (req, res) => {
    res.json(thongKeKy(req, req.query.ky_id || null, req.query));
});

function thongKeKy(req, kyId, q = {}) {
    let dk = ' WHERE 1=1';
    const p = [];
    if (kyId) { dk += ' AND ky_id=?'; p.push(kyId); }
    if (q.nam) { dk += ' AND nam=?'; p.push(q.nam); }
    if (q.quy) { dk += ' AND quy=?'; p.push(q.quy); }
    if (q.phan_xuong_id) { dk += ' AND phan_xuong_id=?'; p.push(q.phan_xuong_id); }
    if (q.cong_trinh) { dk += ' AND cong_trinh=?'; p.push(q.cong_trinh); }

    const ds = phamViPX(req);
    if (ds !== null) {
        dk += ds.length
            ? ` AND (phan_xuong_id IS NULL OR phan_xuong_id IN (${ds.map(() => '?').join(',')}))`
            : ' AND phan_xuong_id IS NULL';
        p.push(...ds);
    }

    const tong = db.prepare(`SELECT
        COUNT(*) so_mat_hang,
        COALESCE(SUM(so_luong_kh),0) tong_nhu_cau,
        COALESCE(SUM(so_luong_da_cap),0) tong_da_cap,
        COALESCE(SUM(so_luong_con_lai),0) tong_con_lai,
        SUM(CASE WHEN trang_thai_cap='da_cap_het' THEN 1 ELSE 0 END) da_cap_het,
        SUM(CASE WHEN trang_thai_cap='chua_cap' THEN 1 ELSE 0 END) chua_cap,
        SUM(CASE WHEN trang_thai_cap='sap_het' THEN 1 ELSE 0 END) sap_het,
        COALESCE(SUM(so_luong_da_cap * don_gia),0) gia_tri_da_cap
        FROM v_ncvt_chi_tiet${dk}`).get(...p);

    return {
        tong,
        theo_phan_xuong: db.prepare(`SELECT COALESCE(px,'(chưa gán)') px,
            COUNT(*) so_mat_hang, COALESCE(SUM(so_luong_kh),0) nhu_cau,
            COALESCE(SUM(so_luong_da_cap),0) da_cap, COALESCE(SUM(so_luong_con_lai),0) con_lai
            FROM v_ncvt_chi_tiet${dk} GROUP BY px ORDER BY px`).all(...p),
        theo_cong_trinh: db.prepare(`SELECT COALESCE(cong_trinh,'(không ghi)') cong_trinh,
            COUNT(*) so_mat_hang, COALESCE(SUM(so_luong_kh),0) nhu_cau,
            COALESCE(SUM(so_luong_da_cap),0) da_cap, COALESCE(SUM(so_luong_con_lai),0) con_lai
            FROM v_ncvt_chi_tiet${dk} GROUP BY cong_trinh ORDER BY da_cap DESC LIMIT 30`).all(...p)
    };
}

/* --------------------------------------------------------------- */
function layKy(req, res, canGhi = false) {
    const ky = db.prepare('SELECT * FROM v_ncvt_ky WHERE id=?').get(req.params.id);
    if (!ky) { res.status(404).json({ loi: 'Không tìm thấy kỳ NCVT' }); return null; }
    if (!duocXemKy(req, ky)) { res.status(403).json({ loi: 'Không có quyền với kỳ NCVT này' }); return null; }
    if (canGhi && ky.phan_xuong_id) {
        const ds = donViDuocPhep(req.session.nguoiDung);
        if (ds !== null && !ds.includes(Number(ky.phan_xuong_id))) {
            res.status(403).json({ loi: 'Không có quyền chỉnh sửa kỳ của đơn vị khác' }); return null;
        }
    }
    return ky;
}

function layLo(req, res) {
    const lo = db.prepare('SELECT * FROM ncvt_lo_import WHERE id=?').get(req.params.loId);
    if (!lo) { res.status(404).json({ loi: 'Không tìm thấy lô import' }); return null; }
    const ky = db.prepare('SELECT * FROM ncvt_ky WHERE id=?').get(lo.ky_id);
    if (!duocXemKy(req, ky)) { res.status(403).json({ loi: 'Không có quyền' }); return null; }
    return lo;
}

function loiNV(thongDiep, ma = 400) {
    const e = new Error(thongDiep);
    e.maHttp = ma; e.nghiepVu = true;
    return e;
}

function baoQuanLy(req, tieuDe, noiDung, id) {
    db.prepare(`SELECT id FROM nguoi_dung WHERE hoat_dong=1 AND vai_tro IN ('admin','cd_cty')`)
      .all().forEach(u => taoThongBao(u.id, 'ncvt', tieuDe, noiDung, String(id)));
}

module.exports = r;
