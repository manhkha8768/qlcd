const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db');
const { dangNhap, coMaQuyenNay, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen');
const US = require('../lib/upload-security');
const { interactionAudit } = require('../lib/interaction-audit');

const r = express.Router();
r.use(dangNhap);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: US.fileFilter(['.xlsx'], 'Chỉ nhận file Excel .xlsx') });

function whereTaiSan(req) {
    const where = ['a.hoat_dong=1'];
    const params = [];
    const scope = donViDuocPhep(req.session.nguoiDung);
    if (scope !== null) {
        if (!scope.length) where.push('1=0');
        else {
            where.push(`a.don_vi_id IN (${scope.map(() => '?').join(',')})`);
            params.push(...scope);
        }
    }
    if (req.query.don_vi_id) { where.push('a.don_vi_id=?'); params.push(req.query.don_vi_id); }
    if (req.query.loai) { where.push('a.loai_tai_san=?'); params.push(req.query.loai); }
    if (req.query.nhom?.trim()) { where.push('a.nhom_tai_san LIKE ?'); params.push(`%${req.query.nhom.trim()}%`); }
    if (req.query.trang_thai) { where.push('a.trang_thai=?'); params.push(req.query.trang_thai); }
    if (req.query.tinh_trang_ky_thuat) {
        where.push(`EXISTS (SELECT 1 FROM asset_device_links l JOIN devices d ON d.id=l.device_id
            WHERE l.asset_id=a.id AND l.den_ngay IS NULL AND d.hoat_dong=1 AND d.tinh_trang_ky_thuat=?)`);
        params.push(req.query.tinh_trang_ky_thuat);
    }
    if (req.query.serial?.trim()) {
        where.push(`EXISTS (SELECT 1 FROM asset_device_links l JOIN devices d ON d.id=l.device_id
            WHERE l.asset_id=a.id AND l.den_ngay IS NULL AND d.hoat_dong=1 AND d.so_seri LIKE ?)`);
        params.push(`%${req.query.serial.trim()}%`);
    }
    if (req.query.nam_san_xuat) {
        const year = Number(req.query.nam_san_xuat);
        if (Number.isInteger(year) && year >= 1900 && year <= 2200) {
            where.push(`EXISTS (SELECT 1 FROM asset_device_links l JOIN devices d ON d.id=l.device_id
                WHERE l.asset_id=a.id AND l.den_ngay IS NULL AND d.hoat_dong=1 AND d.nam_san_xuat=?)`);
            params.push(year);
        }
    }
    if (req.query.q?.trim()) {
        const q = `%${req.query.q.trim()}%`;
        where.push(`(a.ma_tai_san LIKE ? OR a.ten LIKE ? OR a.nhom_tai_san LIKE ? OR EXISTS
            (SELECT 1 FROM asset_device_links l JOIN devices d ON d.id=l.device_id
             LEFT JOIN model_thiet_bi m ON m.id=d.model_id WHERE l.asset_id=a.id AND l.den_ngay IS NULL
             AND (d.ma_thiet_bi LIKE ? OR d.so_seri LIKE ? OR m.ma_model LIKE ? OR m.ten LIKE ?)))`);
        params.push(q, q, q, q, q, q, q);
    }
    return { sql: where.join(' AND '), params };
}

function docTaiSan(id) {
    return db.prepare(`SELECT a.*, px.ma AS ma_don_vi, px.ten AS ten_don_vi, vt.ten AS ten_vi_tri,
        (SELECT l.device_id FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL
         ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS device_id
        FROM assets a JOIN phan_xuong px ON px.id=a.don_vi_id
        LEFT JOIN vi_tri vt ON vt.id=a.vi_tri_id WHERE a.id=?`).get(id);
}

function unitFilterAllowed(req, res) {
    if (!req.query.don_vi_id) return true;
    const unitId = Number(req.query.don_vi_id);
    if (!Number.isInteger(unitId) || unitId <= 0) {
        res.status(400).json({ loi: 'Phân xưởng không hợp lệ' }); return false;
    }
    if (!duocThaoTacDonVi(req.session.nguoiDung, unitId)) {
        res.status(403).json({ loi: 'Không có quyền xem dữ liệu của phân xưởng này' }); return false;
    }
    return true;
}

function validate(body) {
    const errors = [];
    if (!body.ten?.trim()) errors.push('Thiếu tên tài sản');
    if (!['TSCD', 'CCDC'].includes(body.loai_tai_san)) errors.push('Loại tài sản không hợp lệ');
    if (!body.don_vi_id) errors.push('Thiếu đơn vị quản lý');
    for (const field of ['so_luong', 'nguyen_gia', 'gia_tri_con_lai']) {
        if (Number(body[field] ?? 0) < 0) errors.push(`${field} không được âm`);
    }
    if (Number(body.gia_tri_con_lai || 0) > Number(body.nguyen_gia || 0) && Number(body.nguyen_gia || 0) !== 0) {
        errors.push('Giá trị còn lại không được lớn hơn nguyên giá');
    }
    return errors;
}

r.get('/', coMaQuyenNay('asset.view'), (req, res) => {
    if (!unitFilterAllowed(req, res)) return;
    const f = whereTaiSan(req);
    const page = Math.max(1, Number(req.query.trang) || 1);
    const size = Math.min(200, Math.max(1, Number(req.query.moi_trang) || 50));
    const total = db.prepare(`SELECT COUNT(*) n FROM assets a WHERE ${f.sql}`).get(...f.params).n;
    const rows = db.prepare(`SELECT a.*, px.ma AS ma_don_vi, px.ten_ngan AS don_vi,
        (SELECT l.device_id FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL
         ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS device_id,
        (SELECT d.ma_thiet_bi FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS ma_thiet_bi,
        (SELECT d.so_seri FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS so_seri,
        (SELECT d.tinh_trang_ky_thuat FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS tinh_trang_ky_thuat,
        (SELECT d.gio_chay_luy_ke FROM asset_device_links l JOIN devices d ON d.id=l.device_id AND d.hoat_dong=1
         WHERE l.asset_id=a.id AND l.den_ngay IS NULL ORDER BY l.la_lien_ket_chinh DESC,l.id DESC LIMIT 1) AS gio_chay_luy_ke
        FROM assets a JOIN phan_xuong px ON px.id=a.don_vi_id
        WHERE ${f.sql} ORDER BY a.ma_tai_san LIMIT ? OFFSET ?`)
        .all(...f.params, size, (page - 1) * size);
    res.json({ tong: total, trang: page, moi_trang: size, danh_sach: rows });
});

r.get('/summary', coMaQuyenNay('asset.view'), (req, res) => {
    if (!unitFilterAllowed(req, res)) return;
    const f = whereTaiSan(req);
    const row = db.prepare(`SELECT COUNT(*) tong,
        SUM(CASE WHEN a.trang_thai IN ('dang_su_dung','hoat_dong') THEN 1 ELSE 0 END) hoat_dong,
        SUM(CASE WHEN a.trang_thai IN ('dang_sua','sua_chua') THEN 1 ELSE 0 END) sua_chua,
        SUM(CASE WHEN a.trang_thai='hong' THEN 1 ELSE 0 END) hong,
        SUM(CASE WHEN a.loai_tai_san='TSCD' THEN 1 ELSE 0 END) tscd,
        SUM(CASE WHEN a.loai_tai_san='CCDC' THEN 1 ELSE 0 END) ccdc
        FROM assets a WHERE ${f.sql}`).get(...f.params);
    res.json(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v || 0)])));
});

r.get('/by-code/:code', coMaQuyenNay('asset.view'), (req, res) => {
    const asset = db.prepare('SELECT id,don_vi_id FROM assets WHERE ma_tai_san=? AND hoat_dong=1')
        .get(req.params.code);
    if (!asset) return res.status(404).json({ loi: 'Không tìm thấy Asset' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, asset.don_vi_id)) {
        return res.status(403).json({ loi: 'Không có quyền xem Asset này' });
    }
    interactionAudit(req, 'ASSET_QR_RESOLVE', 'assets', asset.id, { code: req.params.code });
    res.json({ id: asset.id });
});

r.get('/export.xlsx', coMaQuyenNay('asset.export'), async (req, res, next) => {
    try {
        if (!unitFilterAllowed(req, res)) return;
        const f = whereTaiSan(req);
        const rows = db.prepare(`SELECT a.*, px.ma AS ma_don_vi, px.ten AS ten_don_vi
            FROM assets a JOIN phan_xuong px ON px.id=a.don_vi_id
            WHERE ${f.sql} ORDER BY a.ma_tai_san`).all(...f.params);
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Asset Master');
        ws.columns = [
            ['Mã tài sản','ma_tai_san'], ['Loại','loai_tai_san'], ['Tên tài sản','ten'],
            ['Nhóm','nhom_tai_san'], ['ĐVT','dvt'], ['Số lượng','so_luong'],
            ['Nguyên giá','nguyen_gia'], ['Giá trị còn lại','gia_tri_con_lai'],
            ['Ngày sử dụng','ngay_dua_vao_su_dung'], ['Mã đơn vị','ma_don_vi'],
            ['Tên đơn vị','ten_don_vi'], ['Trạng thái','trang_thai'], ['Ghi chú','ghi_chu']
        ].map(([header, key]) => ({ header, key, width: 20 }));
        rows.forEach(row => ws.addRow(row));
        ws.getRow(1).font = { bold: true };
        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="QLCD_ASSET_MASTER.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (e) { next(e); }
});

r.get('/mau-import.xlsx', coMaQuyenNay('asset.import'), async (req, res, next) => {
    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Assets');
        ws.addRow(['ma_tai_san','loai_tai_san','ten','nhom_tai_san','dvt','so_luong',
            'nguyen_gia','gia_tri_con_lai','ngay_dua_vao_su_dung','ma_don_vi','trang_thai','ghi_chu']);
        ws.getRow(1).font = { bold: true };
        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="QLCD_ASSET_IMPORT_TEMPLATE.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (e) { next(e); }
});

r.post('/import', coMaQuyenNay('asset.import'), upload.single('file'), US.validateMemory(['.xlsx']), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ loi: 'Thiếu file Excel' });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(req.file.buffer);
        const ws = wb.worksheets[0];
        if (!ws) return res.status(400).json({ loi: 'File không có sheet dữ liệu' });
        const headers = {};
        ws.getRow(1).eachCell((cell, col) => { headers[String(cell.value || '').trim()] = col; });
        for (const h of ['loai_tai_san','ten','ma_don_vi']) {
            if (!headers[h]) return res.status(400).json({ loi: `Thiếu cột ${h}` });
        }
        const scope = donViDuocPhep(req.session.nguoiDung);
        const data = [], errors = [];
        for (let rowNo = 2; rowNo <= ws.rowCount; rowNo++) {
            const row = ws.getRow(rowNo);
            if (!row.getCell(headers.ten).value) continue;
            const get = name => headers[name] ? row.getCell(headers[name]).value : null;
            const unit = db.prepare('SELECT id FROM phan_xuong WHERE ma=? AND hoat_dong=1')
                .get(String(get('ma_don_vi') || '').trim());
            const item = {
                ma_tai_san: String(get('ma_tai_san') || '').trim() || null,
                loai_tai_san: String(get('loai_tai_san') || '').trim().toUpperCase(),
                ten: String(get('ten') || '').trim(), nhom_tai_san: get('nhom_tai_san') || null,
                dvt: get('dvt') || 'Cái', so_luong: Number(get('so_luong') ?? 1),
                nguyen_gia: Number(get('nguyen_gia') ?? 0),
                gia_tri_con_lai: Number(get('gia_tri_con_lai') ?? 0),
                ngay_dua_vao_su_dung: get('ngay_dua_vao_su_dung') || null,
                don_vi_id: unit?.id, trang_thai: get('trang_thai') || 'dang_su_dung',
                ghi_chu: get('ghi_chu') || null
            };
            const rowErrors = validate(item);
            if (!unit) rowErrors.push('Mã đơn vị không tồn tại');
            if (unit && scope !== null && !scope.includes(Number(unit.id))) rowErrors.push('Đơn vị ngoài phạm vi');
            if (item.ma_tai_san && db.prepare('SELECT 1 FROM assets WHERE ma_tai_san=?').get(item.ma_tai_san)) {
                rowErrors.push('Mã tài sản đã tồn tại');
            }
            if (rowErrors.length) errors.push({ dong: rowNo, loi: rowErrors }); else data.push(item);
        }
        if (errors.length) return res.status(422).json({ loi: 'Dữ liệu chưa hợp lệ', chi_tiet: errors });
        const insert = db.prepare(`INSERT INTO assets
            (ma_tai_san,loai_tai_san,ten,nhom_tai_san,dvt,so_luong,nguyen_gia,
             gia_tri_con_lai,ngay_dua_vao_su_dung,don_vi_id,trang_thai,ghi_chu,nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        db.transaction(() => data.forEach(x => insert.run(
            x.ma_tai_san || `${x.loai_tai_san}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            x.loai_tai_san,x.ten,x.nhom_tai_san,x.dvt,x.so_luong,x.nguyen_gia,
            x.gia_tri_con_lai,x.ngay_dua_vao_su_dung,x.don_vi_id,x.trang_thai,x.ghi_chu,
            req.session.nguoiDung.id)))();
        res.json({ ok: true, da_nhap: data.length });
    } catch (e) { next(e); }
});

r.get('/:id', coMaQuyenNay('asset.view'), (req, res) => {
    const asset = docTaiSan(req.params.id);
    if (!asset || !asset.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, asset.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    interactionAudit(req, 'ASSET_PROFILE_VIEW', 'assets', asset.id, { device_id: asset.device_id || null });
    res.json({ tai_san: asset, device_id: asset.device_id || null,
        legacy: asset.legacy_thiet_bi_id ? { bang: 'thiet_bi', id: asset.legacy_thiet_bi_id } : null });
});

r.post('/', coMaQuyenNay('asset.create'), (req, res) => {
    const b = req.body || {};
    const errors = validate(b);
    if (errors.length) return res.status(400).json({ loi: errors.join('; ') });
    if (!duocThaoTacDonVi(req.session.nguoiDung, b.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    const code = b.ma_tai_san?.trim() || `${b.loai_tai_san}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    try {
        const info = db.prepare(`INSERT INTO assets
            (ma_tai_san,loai_tai_san,ten,nhom_tai_san,dvt,so_luong,nguyen_gia,
             gia_tri_con_lai,ngay_dua_vao_su_dung,nguon_hinh_thanh,don_vi_id,vi_tri_id,
             nguoi_quan_ly,trang_thai,ghi_chu,nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,b.loai_tai_san,b.ten.trim(),
                b.nhom_tai_san||null,b.dvt||'Cái',Number(b.so_luong??1),Number(b.nguyen_gia??0),
                Number(b.gia_tri_con_lai??0),b.ngay_dua_vao_su_dung||null,b.nguon_hinh_thanh||null,
                b.don_vi_id,b.vi_tri_id||null,b.nguoi_quan_ly||null,b.trang_thai||'cho_duyet',
                b.ghi_chu||null,req.session.nguoiDung.id);
        res.status(201).json({ id: info.lastInsertRowid, ma_tai_san: code });
    } catch (e) {
        if (/UNIQUE/i.test(e.message)) return res.status(409).json({ loi: 'Mã tài sản đã tồn tại' });
        throw e;
    }
});

r.put('/:id', coMaQuyenNay('asset.edit'), (req, res) => {
    const old = docTaiSan(req.params.id);
    if (!old || !old.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, old.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    const b = { ...old, ...(req.body || {}) };
    const errors = validate(b);
    if (errors.length) return res.status(400).json({ loi: errors.join('; ') });
    if (Number(b.don_vi_id) !== Number(old.don_vi_id)) {
        return res.status(400).json({ loi: 'Không đổi đơn vị trực tiếp; dùng giao dịch điều chuyển ở TASK 4/5' });
    }
    const expected = Number(req.body?.version ?? old.version);
    const result = db.prepare(`UPDATE assets SET ten=?,loai_tai_san=?,nhom_tai_san=?,dvt=?,
        so_luong=?,nguyen_gia=?,gia_tri_con_lai=?,ngay_dua_vao_su_dung=?,nguon_hinh_thanh=?,
        vi_tri_id=?,nguoi_quan_ly=?,trang_thai=?,ghi_chu=?,nguoi_sua_id=?,version=version+1,
        ngay_sua=datetime('now','localtime') WHERE id=? AND version=?`).run(b.ten.trim(),b.loai_tai_san,
            b.nhom_tai_san||null,b.dvt||'Cái',Number(b.so_luong??1),Number(b.nguyen_gia??0),
            Number(b.gia_tri_con_lai??0),b.ngay_dua_vao_su_dung||null,b.nguon_hinh_thanh||null,
            b.vi_tri_id||null,b.nguoi_quan_ly||null,b.trang_thai,b.ghi_chu||null,
            req.session.nguoiDung.id,old.id,expected);
    if (!result.changes) return res.status(409).json({ loi: 'Dữ liệu đã thay đổi; vui lòng tải lại' });
    res.json({ ok: true, version: expected + 1 });
});

r.delete('/:id', coMaQuyenNay('asset.archive'), (req, res) => {
    const asset = docTaiSan(req.params.id);
    if (!asset || !asset.hoat_dong) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, asset.don_vi_id)) return res.status(403).json({ loi: 'Không có quyền' });
    db.prepare(`UPDATE assets SET hoat_dong=0,trang_thai='da_thanh_ly',nguoi_sua_id=?,
        version=version+1,ngay_sua=datetime('now','localtime') WHERE id=?`)
        .run(req.session.nguoiDung.id, asset.id);
    res.json({ ok: true });
});

module.exports = r;
