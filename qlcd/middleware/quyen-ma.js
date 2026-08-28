/**
 * Kiểm tra quyền theo mã quyền.
 *
 * Thứ tự ưu tiên: quyền cấp riêng cho tài khoản  >  quyền của vai trò.
 * Nhờ vậy cấp quyền duyệt cho một quản đốc cụ thể mà không phải nâng
 * người đó lên vai trò cơ điện công ty, và ngược lại cấm được một
 * quyền của vai trò với một tài khoản cụ thể.
 */
const db = require('../db');

function coQuyen(nguoiDungId, vaiTro, maQuyen) {
    const rieng = db.prepare(
        'SELECT duoc_phep FROM quyen_nguoi_dung WHERE nguoi_dung_id=? AND ma_quyen=?'
    ).get(nguoiDungId, maQuyen);
    if (rieng) return !!rieng.duoc_phep;

    return !!db.prepare('SELECT 1 FROM quyen_vai_tro WHERE vai_tro=? AND ma_quyen=?')
        .get(vaiTro, maQuyen);
}

function quyenCuaToi(nguoiDung) {
    const ds = db.prepare('SELECT ma_quyen FROM quyen_vai_tro WHERE vai_tro=?')
        .all(nguoiDung.vai_tro).map(x => x.ma_quyen);
    const rieng = db.prepare('SELECT ma_quyen, duoc_phep FROM quyen_nguoi_dung WHERE nguoi_dung_id=?')
        .all(nguoiDung.id);
    const tap = new Set(ds);
    rieng.forEach(r => r.duoc_phep ? tap.add(r.ma_quyen) : tap.delete(r.ma_quyen));
    return [...tap];
}

/** Middleware yêu cầu một mã quyền */
function canQuyen(maQuyen) {
    return (req, res, next) => {
        const u = req.session?.nguoiDung;
        if (!u) return res.status(401).json({ loi: 'Chưa đăng nhập' });
        if (!coQuyen(u.id, u.vai_tro, maQuyen)) {
            return res.status(403).json({ loi: 'Bạn không có quyền thực hiện thao tác này' });
        }
        next();
    };
}

/**
 * Danh sách id phân xưởng người dùng được thao tác.
 * Trả về null nghĩa là toàn công ty.
 */
function donViDuocPhep(nguoiDung) {
    if (coQuyen(nguoiDung.id, nguoiDung.vai_tro, 'XEM_MOI_DON_VI')) return null;
    return nguoiDung.phan_xuong_id ? [nguoiDung.phan_xuong_id] : [];
}

function duocThaoTacDonVi(nguoiDung, donViId) {
    const ds = donViDuocPhep(nguoiDung);
    if (ds === null) return true;
    return ds.includes(Number(donViId));
}

module.exports = { coQuyen, quyenCuaToi, canQuyen, donViDuocPhep, duocThaoTacDonVi };
