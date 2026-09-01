/** Dịch vụ xác thực, phân quyền và phạm vi dữ liệu duy nhất của QLCD. */
const db = require('../db');

function dangNhap(req, res, next) {
    if (!req.session?.nguoiDung) return res.status(401).json({ loi: 'Chưa đăng nhập' });
    next();
}

function coVaiTro(...vaiTro) {
    return (req, res, next) => {
        if (!req.session?.nguoiDung) return res.status(401).json({ loi: 'Chưa đăng nhập' });
        if (!vaiTro.includes(req.session.nguoiDung.vai_tro)) {
            return res.status(403).json({ loi: 'Không có quyền thực hiện thao tác này' });
        }
        next();
    };
}

const chiAdmin = coVaiTro('admin');
const duocGhi = coVaiTro('admin', 'cd_cty', 'px');
const duocDuyet = coVaiTro('admin', 'cd_cty');

function coQuyen(nguoiDungId, vaiTro, maQuyen, donViId = null) {
    if (vaiTro === 'admin') return true;
    const riengDong = db.prepare(
        'SELECT duoc_phep FROM quyen_nguoi_dung_dong WHERE nguoi_dung_id=? AND ma_quyen=?'
    ).get(nguoiDungId, maQuyen);
    if (riengDong) return !!riengDong.duoc_phep;
    const rieng = db.prepare(
        'SELECT duoc_phep FROM quyen_nguoi_dung WHERE nguoi_dung_id=? AND ma_quyen=?'
    ).get(nguoiDungId, maQuyen);
    if (rieng) return !!rieng.duoc_phep;
    if (db.prepare('SELECT 1 FROM quyen_vai_tro WHERE vai_tro=? AND ma_quyen=?')
        .get(vaiTro, maQuyen)) return true;

    const params = [nguoiDungId, vaiTro, maQuyen];
    let scopeSql = '';
    if (donViId !== null && donViId !== undefined) {
        scopeSql = ' AND (vtq.donvi_id IS NULL OR vtq.donvi_id = ?)';
        params.push(Number(donViId));
    }
    return !!db.prepare(`
        SELECT 1 FROM vai_tro vt
        JOIN vai_tro_quyen vtq ON vtq.vai_tro_id = vt.id
        WHERE (vt.id IN (SELECT vai_tro_id FROM nguoi_dung_vai_tro WHERE nguoi_dung_id = ?)
               OR vt.ma = ?)
          AND vt.hoat_dong = 1 AND vtq.ma_quyen = ?${scopeSql}
        LIMIT 1`).get(...params);
}

function coMaQuyen(req, maQuyen, donViId = null) {
    const u = req.session?.nguoiDung;
    return !!u && coQuyen(u.id, u.vai_tro, maQuyen, donViId);
}

function coMaQuyenNay(...maQuyenList) {
    return (req, res, next) => {
        const u = req.session?.nguoiDung;
        if (!u) return res.status(401).json({ loi: 'Chưa đăng nhập' });
        if (maQuyenList.some(ma => coQuyen(u.id, u.vai_tro, ma))) return next();
        return res.status(403).json({ loi: 'Không có quyền thực hiện thao tác này' });
    };
}

function canQuyen(maQuyen) { return coMaQuyenNay(maQuyen); }

function quyenCuaToi(u) {
    if (u.vai_tro === 'admin') {
        const a = db.prepare('SELECT ma FROM quyen').all().map(x => x.ma);
        const b = db.prepare('SELECT ma FROM ma_quyen WHERE hoat_dong=1').all().map(x => x.ma);
        return [...new Set([...a, ...b])];
    }
    const a = db.prepare('SELECT ma_quyen FROM quyen_vai_tro WHERE vai_tro=?')
        .all(u.vai_tro).map(x => x.ma_quyen);
    const b = db.prepare(`SELECT DISTINCT vtq.ma_quyen FROM vai_tro vt
        JOIN vai_tro_quyen vtq ON vtq.vai_tro_id=vt.id
        WHERE vt.hoat_dong=1 AND (vt.ma=? OR vt.id IN
          (SELECT vai_tro_id FROM nguoi_dung_vai_tro WHERE nguoi_dung_id=?))`)
        .all(u.vai_tro, u.id).map(x => x.ma_quyen);
    const tap = new Set([...a, ...b]);
    db.prepare('SELECT ma_quyen, duoc_phep FROM quyen_nguoi_dung_dong WHERE nguoi_dung_id=?')
        .all(u.id).forEach(r => r.duoc_phep ? tap.add(r.ma_quyen) : tap.delete(r.ma_quyen));
    db.prepare('SELECT ma_quyen, duoc_phep FROM quyen_nguoi_dung WHERE nguoi_dung_id=?')
        .all(u.id).forEach(r => r.duoc_phep ? tap.add(r.ma_quyen) : tap.delete(r.ma_quyen));
    return [...tap];
}

/** null = toàn công ty; mảng = đúng các đơn vị được gán. */
function donViDuocPhep(u) {
    if (u.vai_tro === 'admin' || coQuyen(u.id, u.vai_tro, 'XEM_MOI_DON_VI')) return null;
    const ids = db.prepare(`SELECT don_vi_id FROM nguoi_dung_don_vi
        WHERE nguoi_dung_id=? AND hoat_dong=1
          AND (tu_ngay IS NULL OR tu_ngay <= date('now','localtime'))
          AND (den_ngay IS NULL OR den_ngay >= date('now','localtime'))`)
        .all(u.id).map(x => Number(x.don_vi_id));
    if (u.phan_xuong_id) ids.push(Number(u.phan_xuong_id));
    return [...new Set(ids)];
}

function duocThaoTacDonVi(u, donViId) {
    const ds = donViDuocPhep(u);
    return ds === null || ds.includes(Number(donViId));
}

/** Tương thích route cũ chỉ nhận một PX; route mới dùng donViDuocPhep. */
function gioiHanPX(req) {
    const ds = donViDuocPhep(req.session.nguoiDung);
    return ds === null ? null : (ds[0] ?? -1);
}
function duocThaoTacPX(req, pxId) { return duocThaoTacDonVi(req.session.nguoiDung, pxId); }
function locPX(req, cot = 'phan_xuong_id') {
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds === null) return { dieuKien: '1=1', thamSo: [] };
    if (!ds.length) return { dieuKien: '1=0', thamSo: [] };
    return { dieuKien: `${cot} IN (${ds.map(() => '?').join(',')})`, thamSo: ds };
}

module.exports = { dangNhap, coVaiTro, chiAdmin, duocGhi, duocDuyet,
    coQuyen, coMaQuyen, coMaQuyenNay, canQuyen, quyenCuaToi,
    donViDuocPhep, duocThaoTacDonVi, gioiHanPX, duocThaoTacPX, locPX };
