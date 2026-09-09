const express = require('express');
const db = require('../db');
const { dangNhap, duocGhi, duocDuyet, gioiHanPX, duocThaoTacPX, donViDuocPhep, coMaQuyen, coMaQuyenNay } = require('../middleware/quyen');
const { sinhMa } = require('../lib/ma-thiet-bi');
const { interactionAudit } = require('../lib/interaction-audit');
const ExcelJS = require('exceljs');

const r = express.Router();
r.use(dangNhap);

function docThietBi(id) {
    return db.prepare(`SELECT tb.*,px.ten_ngan AS px,del.deleted_at,del.deleted_by,del.delete_reason
        FROM thiet_bi tb LEFT JOIN phan_xuong px ON px.id=tb.phan_xuong_id
        LEFT JOIN thiet_bi_deletions del ON del.thiet_bi_id=tb.id WHERE tb.id=?`).get(id);
}

function nghiepVuDangMo(thietBiId) {
    const lyDo = [];
    const suaChua = db.prepare(`SELECT COUNT(*) n FROM phieu_sua_chua WHERE thiet_bi_id=?
        AND trang_thai NOT IN ('hoan_thanh','huy')`).get(thietBiId).n;
    if (suaChua) lyDo.push(`${suaChua} phiếu sửa chữa/bảo dưỡng chưa hoàn tất`);
    const giaoDich = db.prepare(`SELECT COUNT(DISTINCT gd.id) n FROM chi_tiet_giao_dich ct
        JOIN giao_dich gd ON gd.id=ct.giao_dich_id
        WHERE (ct.thiet_bi_id=? OR ct.thiet_bi_dich_id=?) AND gd.trang_thai IN ('nhap','cho_duyet')`)
        .get(thietBiId, thietBiId).n;
    if (giaoDich) lyDo.push(`${giaoDich} giao dịch chưa hoàn tất`);
    const dieuChuyen = db.prepare(`SELECT COUNT(*) n FROM dieu_chuyen WHERE thiet_bi_id=?
        AND trang_thai NOT IN ('hoan_thanh','huy')`).get(thietBiId).n;
    if (dieuChuyen) lyDo.push(`${dieuChuyen} phiếu điều chuyển chưa hoàn tất`);
    return lyDo;
}

function xoaMem(req, danhSach, lyDo) {
    const snapshots = danhSach.map(tb => ({ ...tb, blockers: nghiepVuDangMo(tb.id) }));
    const blocked = snapshots.filter(tb => tb.blockers.length);
    if (blocked.length) return { blocked };
    const insert = db.prepare(`INSERT INTO thiet_bi_deletions(thiet_bi_id,deleted_by,delete_reason,before_json)
        VALUES (?,?,?,?)`);
    db.transaction(() => snapshots.forEach(tb =>
        insert.run(tb.id, req.session.nguoiDung.id, lyDo, JSON.stringify(tb))))();
    interactionAudit(req, 'DEVICE_SOFT_DELETE', 'thiet_bi', danhSach.length === 1 ? danhSach[0].id : null,
        { reason: lyDo, device_ids: danhSach.map(tb => tb.id), device_codes: danhSach.map(tb => tb.ma_tb), before: snapshots });
    return { deleted: danhSach.length };
}

/* ---------- Danh sách thiết bị ---------- */
r.get('/', (req, res) => {
    const scope = donViDuocPhep(req.session.nguoiDung);
    let sql = `SELECT tb.id, tb.ma_tb, tb.ten, tb.so_seri, tb.nam_sx, tb.ma_tscd, tb.loai_ts,
                      d.id AS device_id, a.id AS asset_id,
                      tb.so_luong, tb.dvt, tb.nguyen_gia, tb.gia_tri_con_lai, tb.ngay_su_dung,
                      tb.trang_thai, tb.tinh_trang_kt, tb.trang_thai_duyet, tb.gio_chay_luy_ke,
                      kk.so_kiem_ke,COALESCE(kk.so_quan_ly,tb.ma_tscd) AS so_quan_ly,
                      kk.so_luong_quan_ly,kk.so_luong_kiem_ke,kk.so_luong_doi_chieu,
                      kk.danh_gia_ky_thuat,kk.ghi_chu_kiem_ke,kk.quan_ly_theo_quyet_dinh,
                      COALESCE(kk.hidden_from_web,0) AS hidden_from_web,kk.hidden_reason,
                      n.ma AS ma_nhom, n.ten AS ten_nhom,
                      px.id AS px_id, px.ten_ngan AS px, vt.ten AS vi_tri
               FROM thiet_bi tb
               LEFT JOIN nhom_thiet_bi n ON n.id = tb.nhom_id
               LEFT JOIN phan_xuong px   ON px.id = tb.phan_xuong_id
               LEFT JOIN vi_tri vt       ON vt.id = tb.vi_tri_id
               LEFT JOIN devices d       ON d.legacy_thiet_bi_id = tb.id
               LEFT JOIN assets a        ON a.legacy_thiet_bi_id = tb.id AND a.hoat_dong=1
               LEFT JOIN thiet_bi_kiem_ke kk ON kk.thiet_bi_id=tb.id
               WHERE NOT EXISTS (SELECT 1 FROM thiet_bi_deletions del WHERE del.thiet_bi_id=tb.id)`;
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
    const hidden = req.query.hidden_status || 'visible';
    if (hidden !== 'visible' && !coMaQuyen(req,'thietbi.unhide')) return res.status(403).json({ loi:'Không có quyền xem thiết bị ẩn' });
    if (hidden === 'visible') sql += ' AND COALESCE(kk.hidden_from_web,0)=0';
    else if (hidden === 'hidden') sql += ' AND COALESCE(kk.hidden_from_web,0)=1';
    else if (hidden !== 'all') return res.status(400).json({ loi:'Bộ lọc trạng thái ẩn không hợp lệ' });
    if (req.query.co_so_kiem_ke === '1') sql += " AND COALESCE(kk.so_kiem_ke,'')<>''";
    if (req.query.co_so_kiem_ke === '0') sql += " AND COALESCE(kk.so_kiem_ke,'')=''";
    if (req.query.co_so_quan_ly === '1') sql += " AND COALESCE(kk.so_quan_ly,tb.ma_tscd,'')<>''";
    if (req.query.co_so_quan_ly === '0') sql += " AND COALESCE(kk.so_quan_ly,tb.ma_tscd,'')=''";
    if (req.query.ky_thuat_tu !== undefined && req.query.ky_thuat_tu !== '') { sql += ' AND kk.danh_gia_ky_thuat>=?'; p.push(Number(req.query.ky_thuat_tu)); }
    if (req.query.ky_thuat_den !== undefined && req.query.ky_thuat_den !== '') { sql += ' AND kk.danh_gia_ky_thuat<=?'; p.push(Number(req.query.ky_thuat_den)); }
    if (req.query.q) {
        sql += ' AND (tb.ma_tb LIKE ? OR tb.ten LIKE ? OR tb.ma_tscd LIKE ? OR tb.so_seri LIKE ? OR kk.so_kiem_ke LIKE ? OR kk.so_quan_ly LIKE ?)';
        const k = '%' + req.query.q.trim() + '%';
        p.push(k, k, k, k, k, k);
    }

    const dem = db.prepare(`SELECT COUNT(*) n FROM (${sql})`).get(...p).n;
    const trang = Math.max(1, Number(req.query.trang) || 1);
    const moiTrang = Math.min(500, Number(req.query.moi_trang) || 50);
    sql += ' ORDER BY tb.ma_tb LIMIT ? OFFSET ?';
    p.push(moiTrang, (trang - 1) * moiTrang);

    res.json({ tong: dem, trang, moi_trang: moiTrang, danh_sach: db.prepare(sql).all(...p) });
});

r.post('/bulk-hide', coMaQuyenNay('thietbi.hide'), (req,res) => {
    const ids=[...new Set((req.body?.ids||[]).map(Number))].filter(Number.isInteger);
    const reason=String(req.body?.reason||'').trim();
    if (!ids.length || reason.length<5) return res.status(400).json({loi:'Phải chọn thiết bị và nhập lý do ít nhất 5 ký tự'});
    const rows=ids.map(docThietBi);
    if(rows.some(x=>!x)) return res.status(404).json({loi:'Có thiết bị không tồn tại'});
    if(rows.some(x=>!duocThaoTacPX(req,x.phan_xuong_id))) return res.status(403).json({loi:'Có thiết bị ngoài phạm vi dữ liệu'});
    const q=db.prepare(`INSERT INTO thiet_bi_kiem_ke(thiet_bi_id,hidden_from_web,hidden_reason,hidden_source,hidden_at,hidden_by)
        VALUES (?,1,?,'manual',datetime('now','localtime'),?) ON CONFLICT(thiet_bi_id) DO UPDATE SET
        hidden_from_web=1,hidden_reason=excluded.hidden_reason,hidden_source='manual',hidden_at=excluded.hidden_at,hidden_by=excluded.hidden_by`);
    db.transaction(()=>ids.forEach(id=>q.run(id,reason,req.session.nguoiDung.id)))();
    interactionAudit(req,'DEVICE_HIDE','thiet_bi',ids.length===1?ids[0]:null,{reason,device_ids:ids});
    res.json({ok:true,da_an:ids.length});
});

r.post('/:id/unhide', coMaQuyenNay('thietbi.unhide'), (req,res) => {
    const tb=docThietBi(req.params.id);
    if(!tb) return res.status(404).json({loi:'Không tìm thấy thiết bị'});
    if(!duocThaoTacPX(req,tb.phan_xuong_id)) return res.status(403).json({loi:'Không có quyền'});
    db.prepare(`UPDATE thiet_bi_kiem_ke SET hidden_from_web=0,hidden_reason=NULL,hidden_source=NULL,hidden_at=NULL,hidden_by=NULL WHERE thiet_bi_id=?`).run(tb.id);
    interactionAudit(req,'DEVICE_UNHIDE','thiet_bi',tb.id,{device_code:tb.ma_tb,reason:String(req.body?.reason||'').trim()||null});
    res.json({ok:true});
});

async function xuatKiemKe(req,res,dayDu) {
    const scope=donViDuocPhep(req.session.nguoiDung), p=[];
    let where=`WHERE NOT EXISTS(SELECT 1 FROM thiet_bi_deletions d WHERE d.thiet_bi_id=tb.id)`;
    if(scope!==null){ if(!scope.length) where+=' AND 1=0'; else {where+=` AND tb.phan_xuong_id IN (${scope.map(()=>'?').join(',')})`;p.push(...scope);} }
    if(!dayDu) where+=' AND COALESCE(kk.hidden_from_web,0)=0';
    const rows=db.prepare(`SELECT tb.*,px.ten_ngan px,kk.* FROM thiet_bi tb LEFT JOIN phan_xuong px ON px.id=tb.phan_xuong_id LEFT JOIN thiet_bi_kiem_ke kk ON kk.thiet_bi_id=tb.id ${where} ORDER BY px.ten_ngan,tb.ma_tb`).all(...p);
    const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('Sheet1');
    ws.mergeCells('A1:P1'); ws.getCell('A1').value='BIÊN BẢN KIỂM KÊ THIẾT BỊ, TSCĐ, CCDC'; ws.getCell('A1').font={bold:true,size:15}; ws.getCell('A1').alignment={horizontal:'center'};
    const headers=['STT','Tên thiết bị TSCĐ, CCDC','ĐVT','Số kiểm kê','SL quản lý','SL kiểm kê','Đối chiếu','Số chế tạo','Số quản lý','Phân xưởng','Trạng thái','Đánh giá % kỹ thuật','Ghi chú','QL theo lệnh/QĐ','Mã thiết bị','Ẩn trên web'];
    ws.addRow([]); ws.addRow(headers); ws.getRow(3).font={bold:true}; ws.getRow(3).alignment={horizontal:'center',vertical:'middle',wrapText:true};
    rows.forEach((x,i)=>{ const row=ws.addRow([i+1,x.ten,x.dvt,x.so_kiem_ke,x.so_luong_quan_ly??x.so_luong,x.so_luong_kiem_ke,x.so_luong_doi_chieu,x.so_seri,x.so_quan_ly??x.ma_tscd,x.px,x.trang_thai,x.danh_gia_ky_thuat,x.ghi_chu_kiem_ke??x.ghi_chu,x.quan_ly_theo_quyet_dinh,x.ma_tb,x.hidden_from_web?'Có':'Không']); if(x.hidden_from_web) row.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}}); });
    ws.addRow([]); ws.addRow(['','NGƯỜI LẬP BIỂU','','','','ĐẠI DIỆN PHÂN XƯỞNG','','','','','','PHÒNG CƠ ĐIỆN','','','','']);
    ws.columns=[8,36,10,15,12,12,12,18,18,14,15,18,30,24,18,12].map(width=>({width})); ws.views=[{state:'frozen',ySplit:3}]; ws.autoFilter='A3:P3';
    interactionAudit(req,dayDu?'DEVICE_EXPORT_OFFICIAL':'DEVICE_EXPORT_FILTERED','thiet_bi',null,{count:rows.length});
    const buf=await wb.xlsx.writeBuffer(); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition',`attachment; filename="${dayDu?'bien-ban-kiem-ke-day-du':'danh-sach-thiet-bi'}.xlsx"`); res.send(Buffer.from(buf));
}
r.get('/export/filtered',coMaQuyenNay('thietbi.export'),(req,res,next)=>xuatKiemKe(req,res,false).catch(next));
r.get('/export/official',coMaQuyenNay('thietbi.export.official'),(req,res,next)=>xuatKiemKe(req,res,true).catch(next));

r.get('/deleted', coMaQuyenNay('thietbi.khoi_phuc'), (req, res) => {
    const scope = donViDuocPhep(req.session.nguoiDung);
    let where = '';
    const params = [];
    if (scope !== null) {
        if (!scope.length) where = ' AND 1=0';
        else { where = ` AND tb.phan_xuong_id IN (${scope.map(() => '?').join(',')})`; params.push(...scope); }
    }
    res.json(db.prepare(`SELECT tb.id,tb.ma_tb,tb.ten,tb.phan_xuong_id,px.ten_ngan AS px,
        del.deleted_at,del.delete_reason,u.ho_ten AS deleted_by_name
        FROM thiet_bi tb JOIN thiet_bi_deletions del ON del.thiet_bi_id=tb.id
        LEFT JOIN phan_xuong px ON px.id=tb.phan_xuong_id LEFT JOIN nguoi_dung u ON u.id=del.deleted_by
        WHERE 1=1${where} ORDER BY del.deleted_at DESC LIMIT 500`).all(...params));
});

r.post('/bulk-delete', coMaQuyenNay('thietbi.xoa'), (req, res) => {
    const ids = [...new Set((req.body?.ids || []).map(Number))].filter(Number.isInteger);
    const reason = String(req.body?.reason || '').trim();
    if (!ids.length || ids.length > 200) return res.status(400).json({ loi: 'Chọn từ 1 đến 200 thiết bị' });
    if (reason.length < 5) return res.status(400).json({ loi: 'Lý do xóa phải có ít nhất 5 ký tự' });
    if (ids.length > 1 && String(req.body?.confirmation || '').trim() !== `XOA ${ids.length}`)
        return res.status(400).json({ loi: `Hãy nhập chính xác XOA ${ids.length} để xác nhận` });
    const devices = ids.map(docThietBi);
    if (devices.some(x => !x || x.deleted_at)) return res.status(404).json({ loi: 'Có thiết bị không tồn tại hoặc đã bị xóa' });
    if (devices.some(x => !duocThaoTacPX(req, x.phan_xuong_id))) return res.status(403).json({ loi: 'Có thiết bị ngoài phạm vi dữ liệu' });
    const result = xoaMem(req, devices, reason);
    if (result.blocked) return res.status(409).json({ loi: 'Không thể xóa thiết bị đang có nghiệp vụ chưa hoàn tất',
        chi_tiet: result.blocked.map(x => ({ id:x.id, ma_tb:x.ma_tb, blockers:x.blockers })) });
    res.json({ ok:true, da_xoa:result.deleted });
});

r.post('/:id/restore', coMaQuyenNay('thietbi.khoi_phuc'), (req, res) => {
    const tb = docThietBi(req.params.id);
    if (!tb || !tb.deleted_at) return res.status(404).json({ loi: 'Không tìm thấy thiết bị đã xóa' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    db.prepare('DELETE FROM thiet_bi_deletions WHERE thiet_bi_id=?').run(tb.id);
    interactionAudit(req, 'DEVICE_RESTORE', 'thiet_bi', tb.id,
        { reason: String(req.body?.reason || '').trim() || null, device_code:tb.ma_tb, before:tb });
    res.json({ ok:true });
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
        LEFT JOIN assets a         ON a.legacy_thiet_bi_id = tb.id AND a.hoat_dong=1
        WHERE tb.id = ? AND NOT EXISTS
          (SELECT 1 FROM thiet_bi_deletions del WHERE del.thiet_bi_id=tb.id)`).get(req.params.id);

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

r.delete('/:id', coMaQuyenNay('thietbi.xoa'), (req, res) => {
    const tb = docThietBi(req.params.id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacPX(req, tb.phan_xuong_id)) return res.status(403).json({ loi: 'Không có quyền' });
    if (tb.deleted_at) return res.status(404).json({ loi: 'Thiết bị đã bị xóa' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ loi: 'Lý do xóa phải có ít nhất 5 ký tự' });
    const result = xoaMem(req, [tb], reason);
    if (result.blocked) return res.status(409).json({ loi: 'Không thể xóa thiết bị đang có nghiệp vụ chưa hoàn tất', chi_tiet:result.blocked[0].blockers });
    res.json({ ok:true, da_xoa:1 });
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
