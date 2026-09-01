const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyenNay, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);

function docDevice(id) {
    return db.prepare(`SELECT d.*,n.ma AS ma_nhom,n.ten AS ten_nhom,m.ma_model,
        px.ma AS ma_don_vi,px.ten AS ten_don_vi,vt.ten AS ten_vi_tri
        FROM devices d JOIN nhom_thiet_bi n ON n.id=d.nhom_id
        JOIN phan_xuong px ON px.id=d.don_vi_id
        LEFT JOIN model_thiet_bi m ON m.id=d.model_id
        LEFT JOIN vi_tri vt ON vt.id=d.vi_tri_id WHERE d.id=?`).get(id);
}

function validate(body) {
    const errors = [];
    const statuses = ['hoat_dong','du_phong','dang_sua','dang_dieu_chuyen','cho_thanh_ly','da_thanh_ly'];
    const conditions = ['tot','trung_binh','kem','hong'];
    if (!body.ma_thiet_bi?.trim()) errors.push('Thiếu mã thiết bị');
    if (!body.ten?.trim()) errors.push('Thiếu tên thiết bị');
    if (!body.nhom_id) errors.push('Thiếu nhóm thiết bị');
    if (!body.don_vi_id) errors.push('Thiếu đơn vị quản lý');
    if (Number(body.gio_chay_luy_ke || 0) < 0) errors.push('Giờ chạy không được âm');
    if (body.trang_thai && !statuses.includes(body.trang_thai)) errors.push('Trạng thái thiết bị không hợp lệ');
    if (body.tinh_trang_ky_thuat && !conditions.includes(body.tinh_trang_ky_thuat)) errors.push('Tình trạng kỹ thuật không hợp lệ');
    const year = body.nam_san_xuat === null || body.nam_san_xuat === undefined || body.nam_san_xuat === ''
        ? null : Number(body.nam_san_xuat);
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200)) errors.push('Năm sản xuất không hợp lệ');
    return errors;
}

function whereDevice(req) {
    const where = ['d.hoat_dong=1']; const params = [];
    const scope = donViDuocPhep(req.session.nguoiDung);
    if (scope !== null) {
        if (!scope.length) where.push('1=0');
        else { where.push(`d.don_vi_id IN (${scope.map(() => '?').join(',')})`); params.push(...scope); }
    } else if (req.query.don_vi_id) { where.push('d.don_vi_id=?'); params.push(req.query.don_vi_id); }
    if (req.query.nhom_id) { where.push('d.nhom_id=?'); params.push(req.query.nhom_id); }
    if (req.query.trang_thai) { where.push('d.trang_thai=?'); params.push(req.query.trang_thai); }
    if (req.query.q?.trim()) {
        const q = `%${req.query.q.trim()}%`;
        where.push('(d.ma_thiet_bi LIKE ? OR d.ten LIKE ? OR d.so_seri LIKE ?)'); params.push(q,q,q);
    }
    return { sql: where.join(' AND '), params };
}

r.get('/', coMaQuyenNay('device.view'), (req,res) => {
    const f = whereDevice(req);
    const page = Math.max(1,Number(req.query.trang)||1);
    const size = Math.min(200,Math.max(1,Number(req.query.moi_trang)||50));
    const total = db.prepare(`SELECT COUNT(*) n FROM devices d WHERE ${f.sql}`).get(...f.params).n;
    const rows = db.prepare(`SELECT d.*,n.ma AS ma_nhom,n.ten AS ten_nhom,px.ten_ngan AS don_vi,
        (SELECT COUNT(*) FROM asset_device_links l WHERE l.device_id=d.id AND l.den_ngay IS NULL) AS so_tai_san_lien_ket
        FROM devices d JOIN nhom_thiet_bi n ON n.id=d.nhom_id JOIN phan_xuong px ON px.id=d.don_vi_id
        WHERE ${f.sql} ORDER BY d.ma_thiet_bi LIMIT ? OFFSET ?`)
        .all(...f.params,size,(page-1)*size);
    res.json({ tong: total,trang: page,moi_trang: size,danh_sach: rows });
});

r.get('/:id', coMaQuyenNay('device.view'), (req,res) => {
    const device = docDevice(req.params.id);
    if (!device || !device.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacDonVi(req.session.nguoiDung,device.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    const assets = db.prepare(`SELECT l.*,a.ma_tai_san,a.ten,a.loai_tai_san,a.don_vi_id
        FROM asset_device_links l JOIN assets a ON a.id=l.asset_id
        WHERE l.device_id=? ORDER BY (l.den_ngay IS NULL) DESC,l.tu_ngay DESC`).all(device.id);
    res.json({ thiet_bi: device,tai_san_lien_ket: assets,
        legacy: device.legacy_thiet_bi_id ? { bang: 'thiet_bi',id: device.legacy_thiet_bi_id } : null });
});

r.post('/', coMaQuyenNay('device.create'), (req,res) => {
    const b = req.body || {}; const errors = validate(b);
    if (errors.length) return res.status(400).json({ loi: errors.join('; ') });
    if (!duocThaoTacDonVi(req.session.nguoiDung,b.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    try {
        const info = db.prepare(`INSERT INTO devices
            (ma_thiet_bi,ten,nhom_id,model_id,so_seri,nam_san_xuat,nuoc_san_xuat,don_vi_id,
             vi_tri_id,trang_thai,tinh_trang_ky_thuat,gio_chay_luy_ke,ghi_chu,nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.ma_thiet_bi.trim(),b.ten.trim(),b.nhom_id,
                b.model_id||null,b.so_seri||null,b.nam_san_xuat||null,b.nuoc_san_xuat||null,b.don_vi_id,
                b.vi_tri_id||null,b.trang_thai||'hoat_dong',b.tinh_trang_ky_thuat||'tot',
                Number(b.gio_chay_luy_ke||0),b.ghi_chu||null,req.session.nguoiDung.id);
        res.status(201).json({ id: info.lastInsertRowid,ma_thiet_bi: b.ma_thiet_bi.trim() });
    } catch (e) {
        if (/UNIQUE/i.test(e.message)) return res.status(409).json({ loi: 'Mã thiết bị đã tồn tại' });
        throw e;
    }
});

r.put('/:id', coMaQuyenNay('device.edit'), (req,res) => {
    const old = docDevice(req.params.id);
    if (!old || !old.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacDonVi(req.session.nguoiDung,old.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    const b = { ...old,...(req.body||{}) }; const errors = validate(b);
    if (errors.length) return res.status(400).json({ loi: errors.join('; ') });
    if (Number(b.don_vi_id)!==Number(old.don_vi_id)) return res.status(400).json({ loi: 'Không đổi đơn vị trực tiếp; dùng Asset Ledger/điều chuyển' });
    const expected = Number(req.body?.version ?? old.version);
    const result = db.prepare(`UPDATE devices SET ten=?,nhom_id=?,model_id=?,so_seri=?,nam_san_xuat=?,
        nuoc_san_xuat=?,vi_tri_id=?,trang_thai=?,tinh_trang_ky_thuat=?,gio_chay_luy_ke=?,ghi_chu=?,
        nguoi_sua_id=?,version=version+1,ngay_sua=datetime('now','localtime') WHERE id=? AND version=?`)
        .run(b.ten.trim(),b.nhom_id,b.model_id||null,b.so_seri||null,b.nam_san_xuat||null,
            b.nuoc_san_xuat||null,b.vi_tri_id||null,b.trang_thai,b.tinh_trang_ky_thuat,
            Number(b.gio_chay_luy_ke||0),b.ghi_chu||null,req.session.nguoiDung.id,old.id,expected);
    if (!result.changes) return res.status(409).json({ loi: 'Dữ liệu đã thay đổi; vui lòng tải lại' });
    res.json({ ok: true,version: expected+1 });
});

r.post('/:id/lien-ket-tai-san', coMaQuyenNay('device.link_asset'), (req,res) => {
    const device = docDevice(req.params.id); const b = req.body || {};
    const relationTypes = ['gan_voi','bo_phan','thay_the','tham_chieu'];
    if (!device || !device.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    const asset = db.prepare('SELECT * FROM assets WHERE id=? AND hoat_dong=1').get(b.asset_id);
    if (!asset) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });
    if (b.loai_quan_he && !relationTypes.includes(b.loai_quan_he)) return res.status(400).json({ loi: 'Loại quan hệ không hợp lệ' });
    if (!duocThaoTacDonVi(req.session.nguoiDung,device.don_vi_id) ||
        !duocThaoTacDonVi(req.session.nguoiDung,asset.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    if (Number(device.don_vi_id)!==Number(asset.don_vi_id)) return res.status(400).json({ loi: 'Thiết bị và tài sản phải cùng đơn vị tại thời điểm liên kết' });
    try {
        const info = db.prepare(`INSERT INTO asset_device_links
            (asset_id,device_id,loai_quan_he,la_lien_ket_chinh,tu_ngay,ghi_chu,nguoi_tao_id)
            VALUES (?,?,?,?,COALESCE(?,date('now','localtime')),?,?)`).run(asset.id,device.id,
                b.loai_quan_he||'gan_voi',b.la_lien_ket_chinh?1:0,b.tu_ngay||null,b.ghi_chu||null,
                req.session.nguoiDung.id);
        res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/i.test(e.message)) return res.status(409).json({ loi: 'Liên kết đang tồn tại hoặc đã có tài sản chính' });
        throw e;
    }
});

r.delete('/:id/lien-ket-tai-san/:linkId', coMaQuyenNay('device.link_asset'), (req,res) => {
    const device = docDevice(req.params.id);
    if (!device || !duocThaoTacDonVi(req.session.nguoiDung,device.don_vi_id)) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    const result = db.prepare(`UPDATE asset_device_links SET den_ngay=date('now','localtime')
        WHERE id=? AND device_id=? AND den_ngay IS NULL`).run(req.params.linkId,device.id);
    if (!result.changes) return res.status(404).json({ loi: 'Không tìm thấy liên kết đang hiệu lực' });
    res.json({ ok: true });
});

r.delete('/:id', coMaQuyenNay('device.archive'), (req,res) => {
    const device = docDevice(req.params.id);
    if (!device || !device.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy thiết bị' });
    if (!duocThaoTacDonVi(req.session.nguoiDung,device.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    db.transaction(() => {
        db.prepare("UPDATE asset_device_links SET den_ngay=date('now','localtime') WHERE device_id=? AND den_ngay IS NULL").run(device.id);
        db.prepare("UPDATE devices SET hoat_dong=0,trang_thai='da_thanh_ly',version=version+1,nguoi_sua_id=?,ngay_sua=datetime('now','localtime') WHERE id=?")
            .run(req.session.nguoiDung.id,device.id);
    })();
    res.json({ ok: true });
});

module.exports = r;
