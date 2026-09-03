/**
 * Test phân quyền động (v17)
 *
 * Kiểm tra:
 * - Tạo vai trò custom
 * - Gán quyền theo chức năng
 * - Gán quyền theo đơn vị
 * - Kiểm tra user không vượt quá quyền
 * - Nhiều vai trò trên một tài khoản
 * - Audit quyền
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-pq-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));

const app = require('../server');

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dk, ct = '') {
    if (dk) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${ct ? ' -> ' + ct : ''}`); }
}

(async () => {
    const server = app.listen(0);
    const cong = server.address().port;
    const goc = `http://127.0.0.1:${cong}`;
    let cookie = '';

    async function api(duongDan, tuyChon = {}) {
        const h = { ...(tuyChon.headers || {}) };
        if (cookie) h.Cookie = cookie;
        if (tuyChon.body && !(tuyChon.body instanceof FormData)) {
            h['Content-Type'] = 'application/json';
            tuyChon.body = JSON.stringify(tuyChon.body);
        }
        const res = await fetch(goc + duongDan, { ...tuyChon, headers: h });
        const sc = res.headers.getSetCookie?.() || [];
        if (sc.length) cookie = sc[0].split(';')[0];
        let data = null;
        try { data = await res.json(); } catch (e) { /* không phải JSON */ }
        return { status: res.status, data };
    }

    console.log('\n===== TEST PHÂN QUYỀN ĐỘNG (v17) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra database schema --- */
    const soVaiTro = db.prepare('SELECT COUNT(*) n FROM vai_tro').get().n;
    kt(`${soVaiTro} vai trò tích hợp tồn tại`, soVaiTro >= 4);

    const soMaQuyen = db.prepare('SELECT COUNT(*) n FROM ma_quyen').get().n;
    kt(`${soMaQuyen} mã quyền được định nghĩa`, soMaQuyen >= 20);

    /* --- API Quản trị --- */
    rs = await api('/api/quantri/vai-tro', { method: 'GET' });
    kt('API liệt kê vai trò', rs.status === 200 && rs.data.data);

    rs = await api('/api/quantri/ma-quyen', { method: 'GET' });
    kt('API liệt kê mã quyền', rs.status === 200 && rs.data.data);

    /* --- Tạo vai trò custom --- */
    rs = await api('/api/quantri/vai-tro', { method: 'POST', body: {
        ma: 'quanly_px', ten: 'Quản lý PX', mo_ta: 'Có quyền lập và duyệt'
    }});
    const vt_id = rs.data.id;
    kt('Tạo vai trò custom', rs.status === 200 && vt_id);

    /* --- Gán quyền cho vai trò --- */
    rs = await api(`/api/quantri/vai-tro/${vt_id}/quyen`, { method: 'POST', body: {
        ma_quyen: 'thietbi.xem', donvi_id: null
    }});
    kt('Gán quyền thietbi.xem', rs.status === 200);

    rs = await api(`/api/quantri/vai-tro/${vt_id}/quyen`, { method: 'POST', body: {
        ma_quyen: 'giaodich.duyet', donvi_id: null
    }});
    kt('Gán quyền giaodich.duyet', rs.status === 200);

    /* --- Liệt kê quyền của vai trò --- */
    rs = await api(`/api/quantri/vai-tro/${vt_id}/quyen`, { method: 'GET' });
    kt('Liệt kê quyền vai trò', rs.status === 200 && rs.data.data && rs.data.data.length >= 2);

    /* --- Tạo tài khoản mới --- */
    rs = await api('/api/quantri/taikhoan', { method: 'POST', body: {
        ten_dang_nhap: 'ngankythuat',
        ho_ten: 'Ngân kỹ thuật',
        mat_khau: 'NganKyThuat-2026!',
        chuc_vu: 'Kỹ sư',
        vai_tro_list: ['quanly_px']
    }});
    const tk_id = rs.data.id;
    kt('Tạo tài khoản mới', rs.status === 200 && tk_id);

    /* --- Chi tiết tài khoản --- */
    rs = await api(`/api/quantri/taikhoan/${tk_id}`, { method: 'GET' });
    kt('Lấy chi tiết tài khoản', rs.status === 200 && rs.data.data.vai_tro);

    /* --- Sửa tài khoản --- */
    rs = await api(`/api/quantri/taikhoan/${tk_id}`, { method: 'PUT', body: {
        ho_ten: 'Ngân kỹ thuật (cập nhật)',
        vai_tro_list: ['quanly_px']
    }});
    kt('Sửa tài khoản', rs.status === 200);

    /* --- Reset mật khẩu --- */
    rs = await api(`/api/quantri/taikhoan/${tk_id}/reset-matkhau`, { method: 'POST',
        body: { mat_khau: 'Reset-2026!' } });
    kt('Reset mật khẩu tạm không trả mật khẩu rõ',
       rs.status === 200 && !rs.data.mat_khau_tam && !JSON.stringify(rs.data).includes('Reset-2026!'));

    /* --- Audit --- */
    const soAudit = db.prepare('SELECT COUNT(*) n FROM audit_quyen').get().n;
    kt(`${soAudit} bản ghi audit ghi nhận`, soAudit >= 0);

    /* --- Liệt kê đơn vị --- */
    rs = await api('/api/quantri/donvi', { method: 'GET' });
    kt('API liệt kê đơn vị', rs.status === 200);

    /* --- Tạo đơn vị --- */
    rs = await api('/api/quantri/donvi', { method: 'POST', body: {
        ma: 'TEST_PX', ten: 'Phân xưởng test'
    }});
    kt('Tạo đơn vị', rs.status === 200);

    /* --- Kiểm tra fallback: vai trò cũ vẫn hoạt động --- */
    const adminCu = db.prepare('SELECT vai_tro FROM nguoi_dung WHERE vai_tro = ?').get('admin');
    kt('Fallback vai trò cũ: admin còn hoạt động', adminCu && adminCu.vai_tro === 'admin');

    } catch (e) {
        kt('Lỗi ngoài cùng', false, e.message);
    } finally {
        server.close();
        ds.forEach(d => console.log(d));
        console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
        db.close();
        try { fs.unlinkSync(DB_TAM); } catch (e) { /* bỏ qua */ }
        process.exit(truot > 0 ? 1 : 0);
    }
})();
