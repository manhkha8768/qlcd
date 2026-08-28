/**
 * IMPORT DANH SÁCH TSCĐ/CCDC THEO PHÂN XƯỞNG
 *
 * Luồng 4 bước:
 *   1. POST /tai-len          - tải file, hệ thống dò sheet + dòng tiêu đề + gợi ý ánh xạ cột
 *   2. POST /lo/:id/anh-xa    - chốt ánh xạ, đọc dữ liệu vào bảng tạm, kiểm tra từng dòng
 *   3. GET/PUT /lo/:id/dong   - xem và sửa các dòng lỗi trước khi nhập
 *   4. POST /lo/:id/xac-nhan  - đẩy các dòng hợp lệ vào bảng thiet_bi
 *
 * Dữ liệu gốc luôn được giữ trong import_tam để đối chiếu về sau.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { dangNhap, duocGhi, duocDuyet, gioiHanPX, duocThaoTacPX } = require('../middleware/quyen');
const xl = require('../lib/doc-excel');
const { sinhMa, doanNhom } = require('../lib/ma-thiet-bi');

const THU_MUC = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(THU_MUC)) fs.mkdirSync(THU_MUC, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, THU_MUC),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.xlsx';
            cb(null, `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
        }
    }),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /\.(xlsx|xls|xlsm|csv)$/i.test(file.originalname);
        cb(ok ? null : new Error('Chỉ nhận file Excel (.xlsx, .xls, .xlsm) hoặc .csv'), ok);
    }
});

const r = express.Router();
r.use(dangNhap);

/* ---------- Danh sách lô import ---------- */
r.get('/lo', (req, res) => {
    const gh = gioiHanPX(req);
    let sql = `SELECT l.*, px.ten_ngan AS px, px.ten AS ten_px,
                      nd.ho_ten AS nguoi_tai, nd.ten_dang_nhap
               FROM lo_import l
               JOIN phan_xuong px ON px.id = l.phan_xuong_id
               LEFT JOIN nguoi_dung nd ON nd.id = l.nguoi_tai_id
               WHERE 1=1`;
    const p = [];
    if (gh !== null) { sql += ' AND l.phan_xuong_id = ?'; p.push(gh); }
    else if (req.query.phan_xuong_id) { sql += ' AND l.phan_xuong_id = ?'; p.push(req.query.phan_xuong_id); }
    if (req.query.trang_thai) { sql += ' AND l.trang_thai = ?'; p.push(req.query.trang_thai); }
    sql += ' ORDER BY l.ngay_tai DESC LIMIT 100';
    res.json(db.prepare(sql).all(...p));
});

/* ---------- BƯỚC 1: Tải file lên ---------- */
r.post('/tai-len', duocGhi, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ loi: 'Chưa chọn file' });

    const gh = gioiHanPX(req);
    const pxId = gh !== null ? gh : Number(req.body.phan_xuong_id);
    if (!pxId) { fs.unlinkSync(req.file.path); return res.status(400).json({ loi: 'Chưa chọn phân xưởng' }); }
    if (!duocThaoTacPX(req, pxId)) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ loi: 'Không có quyền tải dữ liệu cho phân xưởng này' });
    }

    let pt;
    try {
        pt = xl.phanTich(req.file.path, null, null);
    } catch (e) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ loi: 'Không đọc được file: ' + e.message });
    }

    const info = db.prepare(`
        INSERT INTO lo_import (phan_xuong_id, ten_file, duong_dan, ten_sheet, dong_tieu_de,
                               mapping_json, tong_dong, nguoi_tai_id)
        VALUES (?,?,?,?,?,?,?,?)`)
      .run(pxId, req.file.originalname, req.file.filename, pt.ten_sheet, pt.dong_tieu_de,
           JSON.stringify(pt.anh_xa_goi_y), pt.tong_dong_du_lieu, req.session.nguoiDung.id);

    res.json({ lo_id: info.lastInsertRowid, ...pt });
});

/* ---------- Phân tích lại khi đổi sheet / dòng tiêu đề ---------- */
r.get('/lo/:id/phan-tich', (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    try {
        const pt = xl.phanTich(path.join(THU_MUC, lo.duong_dan),
                               req.query.sheet || lo.ten_sheet,
                               req.query.dong_tieu_de);
        res.json(pt);
    } catch (e) {
        res.status(400).json({ loi: e.message });
    }
});

/* ---------- BƯỚC 2: Chốt ánh xạ & kiểm tra dữ liệu ---------- */
r.post('/lo/:id/anh-xa', duocGhi, (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    if (lo.trang_thai === 'da_nhap') return res.status(400).json({ loi: 'Lô này đã nhập, không sửa được' });

    const { ten_sheet, dong_tieu_de, mapping, nhom_mac_dinh_id } = req.body || {};
    if (!mapping || mapping.ten === undefined || mapping.ten === null || mapping.ten === '') {
        return res.status(400).json({ loi: 'Bắt buộc phải ánh xạ cột "Tên tài sản"' });
    }

    let dong;
    try {
        dong = xl.docDuLieu(path.join(THU_MUC, lo.duong_dan),
                            ten_sheet || lo.ten_sheet,
                            Number(dong_tieu_de ?? lo.dong_tieu_de),
                            mapping);
    } catch (e) {
        return res.status(400).json({ loi: 'Lỗi đọc dữ liệu: ' + e.message });
    }

    const nap = db.transaction(() => {
        db.prepare('DELETE FROM import_tam WHERE lo_id = ?').run(lo.id);

        const them = db.prepare(`
            INSERT INTO import_tam (lo_id, dong_goc, du_lieu_goc, ma_tb, ten, ma_tscd, loai_ts,
                so_seri, nam_sx, nuoc_sx, dvt, so_luong, nguyen_gia, gia_tri_con_lai,
                ngay_su_dung, nhom_ma, nhom_id, vi_tri_text, ghi_chu, hop_le, loi, canh_bao)
            VALUES (@lo_id,@dong_goc,@du_lieu_goc,@ma_tb,@ten,@ma_tscd,@loai_ts,
                @so_seri,@nam_sx,@nuoc_sx,@dvt,@so_luong,@nguyen_gia,@gia_tri_con_lai,
                @ngay_su_dung,@nhom_ma,@nhom_id,@vi_tri_text,@ghi_chu,@hop_le,@loi,@canh_bao)`);

        let hopLe = 0, coLoi = 0;
        const maTscdTrongFile = new Set();

        for (const d of dong) {
            const b = chuanHoaDong(d, nhom_mac_dinh_id);
            if (b.ma_tscd) {
                if (maTscdTrongFile.has(b.ma_tscd)) {
                    b.canh_bao = ghepCanhBao(b.canh_bao, 'Trùng mã tài sản trong cùng file');
                }
                maTscdTrongFile.add(b.ma_tscd);
                const daCo = db.prepare('SELECT ma_tb FROM thiet_bi WHERE ma_tscd = ?').get(b.ma_tscd);
                if (daCo) b.canh_bao = ghepCanhBao(b.canh_bao, `Mã TS đã có trong hệ thống (${daCo.ma_tb})`);
            }
            b.lo_id = lo.id;
            them.run(b);
            if (b.hop_le) hopLe++; else coLoi++;
        }

        db.prepare(`UPDATE lo_import SET ten_sheet=?, dong_tieu_de=?, mapping_json=?,
                           tong_dong=?, so_hop_le=?, so_loi=?, trang_thai='da_anh_xa'
                    WHERE id=?`)
          .run(ten_sheet || lo.ten_sheet, Number(dong_tieu_de ?? lo.dong_tieu_de),
               JSON.stringify(mapping), dong.length, hopLe, coLoi, lo.id);

        return { tong: dong.length, hop_le: hopLe, loi: coLoi };
    });

    const kq = nap();
    res.json({
        ...kq,
        thong_ke_nhom: db.prepare(`
            SELECT COALESCE(n.ma,'(chưa xác định)') AS ma_nhom,
                   COALESCE(n.ten,'Chưa nhận diện được nhóm') AS ten_nhom,
                   COUNT(*) AS so_dong
            FROM import_tam t LEFT JOIN nhom_thiet_bi n ON n.id = t.nhom_id
            WHERE t.lo_id = ? GROUP BY t.nhom_id ORDER BY so_dong DESC`).all(lo.id)
    });
});

/* ---------- BƯỚC 3: Xem & sửa dòng ---------- */
r.get('/lo/:id/dong', (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    let sql = `SELECT t.*, n.ma AS ma_nhom_tb, n.ten AS ten_nhom
               FROM import_tam t LEFT JOIN nhom_thiet_bi n ON n.id = t.nhom_id
               WHERE t.lo_id = ?`;
    const p = [lo.id];
    if (req.query.loc === 'loi')      sql += ' AND t.hop_le = 0';
    if (req.query.loc === 'canh_bao') sql += ' AND t.canh_bao IS NOT NULL';
    if (req.query.loc === 'hop_le')   sql += ' AND t.hop_le = 1';
    sql += ' ORDER BY t.dong_goc LIMIT ' + (Number(req.query.limit) || 500);
    res.json(db.prepare(sql).all(...p));
});

r.put('/lo/:id/dong/:dongId', duocGhi, (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    const d = db.prepare('SELECT * FROM import_tam WHERE id = ? AND lo_id = ?').get(req.params.dongId, lo.id);
    if (!d) return res.status(404).json({ loi: 'Không tìm thấy dòng' });

    const b = req.body || {};
    const moi = {
        ...d,
        ten: b.ten ?? d.ten,
        nhom_id: b.nhom_id ?? d.nhom_id,
        ma_tscd: b.ma_tscd ?? d.ma_tscd,
        so_seri: b.so_seri ?? d.so_seri,
        nam_sx: b.nam_sx ?? d.nam_sx,
        so_luong: b.so_luong ?? d.so_luong,
        nguyen_gia: b.nguyen_gia ?? d.nguyen_gia,
        ngay_su_dung: b.ngay_su_dung ?? d.ngay_su_dung,
        loai_ts: b.loai_ts ?? d.loai_ts,
        vi_tri_text: b.vi_tri_text ?? d.vi_tri_text,
        ghi_chu: b.ghi_chu ?? d.ghi_chu
    };
    const kt = kiemTra(moi);

    db.prepare(`UPDATE import_tam SET ten=?, nhom_id=?, ma_tscd=?, so_seri=?, nam_sx=?,
                       so_luong=?, nguyen_gia=?, ngay_su_dung=?, loai_ts=?, vi_tri_text=?,
                       ghi_chu=?, hop_le=?, loi=? WHERE id=?`)
      .run(moi.ten, moi.nhom_id, moi.ma_tscd, moi.so_seri, moi.nam_sx, moi.so_luong,
           moi.nguyen_gia, moi.ngay_su_dung, moi.loai_ts, moi.vi_tri_text, moi.ghi_chu,
           kt.hop_le, kt.loi, d.id);

    capNhatDemLo(lo.id);
    res.json({ hop_le: kt.hop_le, loi: kt.loi });
});

/** Gán nhóm hàng loạt cho các dòng chưa nhận diện được nhóm */
r.post('/lo/:id/gan-nhom', duocGhi, (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    const { nhom_id, ids } = req.body || {};
    if (!nhom_id) return res.status(400).json({ loi: 'Chưa chọn nhóm' });

    const gan = db.transaction(() => {
        if (Array.isArray(ids) && ids.length) {
            const q = db.prepare('UPDATE import_tam SET nhom_id=? WHERE id=? AND lo_id=?');
            ids.forEach(i => q.run(nhom_id, i, lo.id));
        } else {
            db.prepare('UPDATE import_tam SET nhom_id=? WHERE lo_id=? AND nhom_id IS NULL').run(nhom_id, lo.id);
        }
        // kiểm tra lại toàn bộ
        const ds = db.prepare('SELECT * FROM import_tam WHERE lo_id=?').all(lo.id);
        const q2 = db.prepare('UPDATE import_tam SET hop_le=?, loi=? WHERE id=?');
        ds.forEach(d => { const kt = kiemTra(d); q2.run(kt.hop_le, kt.loi, d.id); });
    });
    gan();
    capNhatDemLo(lo.id);
    res.json(db.prepare('SELECT so_hop_le, so_loi, tong_dong FROM lo_import WHERE id=?').get(lo.id));
});

/* ---------- BƯỚC 4: Xác nhận nhập vào hệ thống ---------- */
r.post('/lo/:id/xac-nhan', duocGhi, (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    if (lo.trang_thai === 'da_nhap') return res.status(400).json({ loi: 'Lô này đã được nhập rồi' });

    const boQuaTrung = !!req.body?.bo_qua_trung;
    const ds = db.prepare(`SELECT * FROM import_tam WHERE lo_id=? AND hop_le=1 AND da_nhap=0`).all(lo.id);
    if (!ds.length) return res.status(400).json({ loi: 'Không có dòng hợp lệ nào để nhập' });

    const themTB = db.prepare(`
        INSERT INTO thiet_bi (ma_tb, ten, nhom_id, so_seri, nam_sx, nuoc_sx, ma_tscd, loai_ts,
            nguyen_gia, gia_tri_con_lai, ngay_su_dung, phan_xuong_id, so_luong, dvt,
            lo_import_id, nguoi_tao_id, trang_thai_duyet, ghi_chu)
        VALUES (@ma_tb,@ten,@nhom_id,@so_seri,@nam_sx,@nuoc_sx,@ma_tscd,@loai_ts,
            @nguyen_gia,@gia_tri_con_lai,@ngay_su_dung,@phan_xuong_id,@so_luong,@dvt,
            @lo_import_id,@nguoi_tao_id,'cho_duyet',@ghi_chu)`);

    let nhap = 0, boQua = 0;
    const loiChiTiet = [];

    const chay = db.transaction(() => {
        for (const d of ds) {
            if (boQuaTrung && d.ma_tscd &&
                db.prepare('SELECT 1 FROM thiet_bi WHERE ma_tscd=?').get(d.ma_tscd)) {
                boQua++; continue;
            }
            try {
                const ma = d.ma_tb || sinhMa(lo.phan_xuong_id, d.nhom_id);
                const info = themTB.run({
                    ma_tb: ma, ten: d.ten, nhom_id: d.nhom_id, so_seri: d.so_seri,
                    nam_sx: d.nam_sx, nuoc_sx: d.nuoc_sx, ma_tscd: d.ma_tscd,
                    loai_ts: d.loai_ts || 'TSCD', nguyen_gia: d.nguyen_gia || 0,
                    gia_tri_con_lai: d.gia_tri_con_lai || 0, ngay_su_dung: d.ngay_su_dung,
                    phan_xuong_id: lo.phan_xuong_id, so_luong: d.so_luong || 1,
                    dvt: d.dvt || 'Cái', lo_import_id: lo.id,
                    nguoi_tao_id: req.session.nguoiDung.id,
                    ghi_chu: [d.vi_tri_text ? 'Vị trí theo file: ' + d.vi_tri_text : null, d.ghi_chu]
                             .filter(Boolean).join(' | ') || null
                });
                db.prepare('UPDATE import_tam SET da_nhap=1, thiet_bi_id=? WHERE id=?')
                  .run(info.lastInsertRowid, d.id);
                db.prepare(`INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, tu_ngay)
                            VALUES (?,?,COALESCE(?, date('now','localtime')))`)
                  .run(info.lastInsertRowid, lo.phan_xuong_id, d.ngay_su_dung);
                nhap++;
            } catch (e) {
                boQua++;
                loiChiTiet.push({ dong: d.dong_goc, ten: d.ten, loi: e.message });
                db.prepare('UPDATE import_tam SET loi=? WHERE id=?').run('Lỗi khi nhập: ' + e.message, d.id);
            }
        }

        db.prepare(`UPDATE lo_import SET so_da_nhap=?, trang_thai='da_nhap',
                           ngay_nhap=datetime('now','localtime') WHERE id=?`).run(nhap, lo.id);
    });
    chay();

    db.prepare(`INSERT INTO nhat_ky_he_thong (nguoi_id, hanh_dong, bang, ban_ghi_id, noi_dung)
                VALUES (?,?,?,?,?)`)
      .run(req.session.nguoiDung.id, 'import_tscd', 'lo_import', lo.id,
           `${lo.ten_file}: nhập ${nhap} thiết bị, bỏ qua ${boQua}`);

    res.json({ da_nhap: nhap, bo_qua: boQua, loi_chi_tiet: loiChiTiet.slice(0, 20) });
});

/* ---------- Huỷ lô ---------- */
r.delete('/lo/:id', duocGhi, (req, res) => {
    const lo = layLo(req, res); if (!lo) return;
    if (lo.trang_thai === 'da_nhap' && req.session.nguoiDung.vai_tro !== 'admin') {
        return res.status(400).json({ loi: 'Lô đã nhập - chỉ admin mới xoá được' });
    }
    try { fs.unlinkSync(path.join(THU_MUC, lo.duong_dan)); } catch (e) { /* file có thể đã bị xoá */ }
    db.prepare('DELETE FROM lo_import WHERE id = ?').run(lo.id);
    res.json({ ok: true });
});

/* ---------- Chuyển lại lô cho phân xưởng làm lại ---------- */
r.post('/lo/:id/chuyen-lai', duocDuyet, (req, res) => {
    const lo = layLo(req, res, true); if (!lo) return;
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do khi chuyển lại' });
    db.prepare(`UPDATE lo_import SET trang_thai='chuyen_lai', ly_do_chuyen_lai=?, nguoi_duyet_id=?
                WHERE id=?`).run(lyDo, req.session.nguoiDung.id, lo.id);
    res.json({ ok: true });
});

/* --------------------------------------------------------------- */
function layLo(req, res, boQuaGioiHan = false) {
    const lo = db.prepare('SELECT * FROM lo_import WHERE id = ?').get(req.params.id);
    if (!lo) { res.status(404).json({ loi: 'Không tìm thấy lô import' }); return null; }
    if (!boQuaGioiHan && !duocThaoTacPX(req, lo.phan_xuong_id)) {
        res.status(403).json({ loi: 'Không có quyền với dữ liệu phân xưởng này' }); return null;
    }
    return lo;
}

function ghepCanhBao(cu, moi) {
    return cu ? cu + '; ' + moi : moi;
}

function kiemTra(b) {
    const loi = [];
    if (!b.ten || String(b.ten).trim().length < 2) loi.push('Thiếu tên tài sản');
    if (!b.nhom_id) loi.push('Chưa xác định được nhóm thiết bị');
    if (b.so_luong !== null && b.so_luong !== undefined && Number(b.so_luong) <= 0) loi.push('Số lượng không hợp lệ');
    return { hop_le: loi.length ? 0 : 1, loi: loi.length ? loi.join('; ') : null };
}

function chuanHoaDong(d, nhomMacDinhId) {
    const ten = d.ten ? String(d.ten).trim() : null;
    let nhomId = null, nhomMa = null;

    if (ten) {
        const doan = doanNhom(ten);
        if (doan) { nhomId = doan.nhom_id; nhomMa = doan.ma; }
    }
    if (!nhomId && nhomMacDinhId) nhomId = Number(nhomMacDinhId);

    const loaiTsRaw = xl.khongDau(d.loai_ts || '');
    const loaiTs = /ccdc|cong cu|dung cu/.test(loaiTsRaw) ? 'CCDC'
                 : /tscd|tai san co dinh/.test(loaiTsRaw) ? 'TSCD'
                 : null;

    const b = {
        dong_goc: d.dong_goc,
        du_lieu_goc: JSON.stringify(d.du_lieu_goc),
        ma_tb: d.ma_tb ? String(d.ma_tb).trim() : null,
        ten,
        ma_tscd: d.ma_tscd ? String(d.ma_tscd).trim() : null,
        loai_ts: loaiTs,
        so_seri: d.so_seri ? String(d.so_seri).trim() : null,
        nam_sx: xl.veNam(d.nam_sx),
        nuoc_sx: d.nuoc_sx ? String(d.nuoc_sx).trim() : null,
        dvt: d.dvt ? String(d.dvt).trim() : null,
        so_luong: xl.veSo(d.so_luong) ?? 1,
        nguyen_gia: xl.veSo(d.nguyen_gia),
        gia_tri_con_lai: xl.veSo(d.gia_tri_con_lai),
        ngay_su_dung: xl.veNgay(d.ngay_su_dung),
        nhom_ma: nhomMa,
        nhom_id: nhomId,
        vi_tri_text: d.vi_tri_text ? String(d.vi_tri_text).trim() : null,
        ghi_chu: d.ghi_chu ? String(d.ghi_chu).trim() : null,
        canh_bao: null
    };

    if (!b.nguyen_gia) b.canh_bao = ghepCanhBao(b.canh_bao, 'Thiếu nguyên giá');
    if (!b.ngay_su_dung) b.canh_bao = ghepCanhBao(b.canh_bao, 'Thiếu ngày sử dụng');
    if (!nhomMa && nhomId) b.canh_bao = ghepCanhBao(b.canh_bao, 'Nhóm gán mặc định, cần kiểm tra lại');

    const kt = kiemTra(b);
    b.hop_le = kt.hop_le;
    b.loi = kt.loi;
    return b;
}

function capNhatDemLo(loId) {
    const t = db.prepare(`SELECT COUNT(*) tong,
                                 SUM(CASE WHEN hop_le=1 THEN 1 ELSE 0 END) hl,
                                 SUM(CASE WHEN hop_le=0 THEN 1 ELSE 0 END) l
                          FROM import_tam WHERE lo_id=?`).get(loId);
    db.prepare('UPDATE lo_import SET tong_dong=?, so_hop_le=?, so_loi=? WHERE id=?')
      .run(t.tong, t.hl || 0, t.l || 0, loId);
}

module.exports = r;
