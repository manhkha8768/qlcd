/**
 * Xác thực & phân quyền.
 *
 * Vai trò:
 *   admin   - toàn quyền, quản lý danh mục phân xưởng và tài khoản
 *   cd_cty  - Phòng Cơ điện công ty: xem toàn công ty, duyệt phiếu
 *   px      - Cơ điện phân xưởng: chỉ thao tác dữ liệu phân xưởng mình
 *   xem     - chỉ đọc
 *
 * Nguyên tắc: mọi lọc dữ liệu theo phân xưởng thực hiện ở tầng này,
 * không tin vào tham số phan_xuong_id do client gửi lên.
 */

function dangNhap(req, res, next) {
    if (!req.session || !req.session.nguoiDung) {
        return res.status(401).json({ loi: 'Chưa đăng nhập' });
    }
    next();
}

function coVaiTro(...vaiTro) {
    return (req, res, next) => {
        if (!req.session || !req.session.nguoiDung) {
            return res.status(401).json({ loi: 'Chưa đăng nhập' });
        }
        if (!vaiTro.includes(req.session.nguoiDung.vai_tro)) {
            return res.status(403).json({ loi: 'Không có quyền thực hiện thao tác này' });
        }
        next();
    };
}

const chiAdmin = coVaiTro('admin');
const duocGhi  = coVaiTro('admin', 'cd_cty', 'px');
const duocDuyet = coVaiTro('admin', 'cd_cty');

/**
 * Trả về id phân xưởng mà user bị giới hạn, hoặc null nếu xem được toàn công ty.
 */
function gioiHanPX(req) {
    const u = req.session.nguoiDung;
    if (u.vai_tro === 'px') return u.phan_xuong_id;
    return null;
}

/**
 * Kiểm tra user có được thao tác trên dữ liệu của phân xưởng pxId không.
 */
function duocThaoTacPX(req, pxId) {
    const gh = gioiHanPX(req);
    if (gh === null) return true;
    return Number(pxId) === Number(gh);
}

/**
 * Ghép điều kiện WHERE lọc phân xưởng vào câu truy vấn.
 * Trả về { sql, params } đã bổ sung.
 */
function locPX(req, cot = 'phan_xuong_id') {
    const gh = gioiHanPX(req);
    if (gh === null) return { dieuKien: '1=1', thamSo: [] };
    return { dieuKien: `${cot} = ?`, thamSo: [gh] };
}

/**
 * Kiểm tra quyền chi tiết (mã quyền).
 *
 * Ví dụ:
 *   coMaQuyen(req, 'thietbi.xem')
 *   coMaQuyen(req, 'giaodich.duyet')
 *
 * Trả về true nếu user có quyền, false nếu không.
 */
function coMaQuyen(req, maQuyen, pxId) {
    if (!req.session || !req.session.nguoiDung) {
        return false;
    }

    const db = require('../db');
    const u = req.session.nguoiDung;

    // Admin luôn có mọi quyền
    if (u.vai_tro === 'admin') {
        return true;
    }

    // Tìm quyền trong database
    let sql = `
        SELECT COUNT(*) n
        FROM vai_tro_quyen vq
        JOIN nguoi_dung_vai_tro ndvt ON vq.vai_tro_id = ndvt.vai_tro_id
        WHERE ndvt.nguoi_dung_id = ?
        AND vq.ma_quyen = ?
    `;
    const params = [u.id, maQuyen];

    // Nếu có pxId, kiểm tra quyền theo đơn vị
    if (pxId) {
        sql += ' AND (vq.donvi_id IS NULL OR vq.donvi_id = ?)';
        params.push(pxId);
    }

    const result = db.prepare(sql).get(...params);
    return result && result.n > 0;
}

/**
 * Middleware: Kiểm tra một hoặc nhiều mã quyền.
 *
 * Ví dụ:
 *   router.get('/api/thiet-bi', coMaQuyenNay('thietbi.xem'), (req, res) => { ... })
 */
function coMaQuyenNay(...maQuyenList) {
    return (req, res, next) => {
        if (!req.session || !req.session.nguoiDung) {
            return res.status(401).json({ loi: 'Chưa đăng nhập' });
        }

        const u = req.session.nguoiDung;

        // Admin luôn được
        if (u.vai_tro === 'admin') {
            return next();
        }

        // Kiểm tra có ít nhất một mã quyền
        const db = require('../db');
        for (const maQuyen of maQuyenList) {
            const result = db.prepare(`
                SELECT COUNT(*) n
                FROM vai_tro_quyen vq
                JOIN nguoi_dung_vai_tro ndvt ON vq.vai_tro_id = ndvt.vai_tro_id
                WHERE ndvt.nguoi_dung_id = ?
                AND vq.ma_quyen = ?
            `).get(u.id, maQuyen);

            if (result && result.n > 0) {
                return next();
            }
        }

        return res.status(403).json({ loi: 'Không có quyền thực hiện thao tác này' });
    };
}

module.exports = {
    dangNhap, coVaiTro, chiAdmin, duocGhi, duocDuyet,
    gioiHanPX, duocThaoTacPX, locPX,
    coMaQuyen, coMaQuyenNay
};
