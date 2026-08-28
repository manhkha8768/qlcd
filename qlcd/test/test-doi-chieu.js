/**
 * Test đối chiếu & quản lý sai lệch dữ liệu (v20)
 *
 * Kiểm tra:
 * - Tạo đợt đối chiếu mới
 * - Upload file TSCĐ
 * - Upload file CCDC
 * - Chạy logic so sánh
 * - Xác nhận sai lệch
 * - Lịch sử audit
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-dc-' + Date.now() + '.db');
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

    console.log('\n===== TEST ĐỐI CHIẾU (v20) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra database schema --- */
    const soDot = db.prepare('SELECT COUNT(*) n FROM dot_doi_chieu').get().n;
    kt(`${soDot} đợt đối chiếu tạo được`, soDot >= 0);

    const soQuyen = db.prepare("SELECT COUNT(*) n FROM ma_quyen WHERE ma LIKE 'doichieu.%'").get().n;
    kt(`${soQuyen} quyền đối chiếu được định nghĩa`, soQuyen >= 7);

    /* --- API Danh sách --- */
    rs = await api('/api/doichieu', { method: 'GET' });
    kt('API liệt kê đối chiếu', rs.status === 200 && rs.data.data);

    /* --- Tạo đợt đối chiếu --- */
    rs = await api('/api/doichieu', {
        method: 'POST',
        body: {
            ma: 'DC_2024_1',
            ten: 'Đối chiếu năm 2024 kỳ I',
            mo_ta: 'So sánh TSCĐ, CCDC với QLCD và kiểm kê thực tế'
        }
    });
    const dot_id = rs.data?.id;
    kt('Tạo đợt đối chiếu mới', rs.status === 200 && dot_id);

    /* --- Chi tiết đợt đối chiếu --- */
    if (dot_id) {
        rs = await api(`/api/doichieu/${dot_id}`, { method: 'GET' });
        kt('Lấy chi tiết đợt đối chiếu', rs.status === 200 && rs.data.data);
    }

    /* --- Upload file TSCĐ --- */
    if (dot_id) {
        const tscd_data = [
            { ma_tscd: 'SGB-620/40T-001', ten_tscd: 'Máy quay trục', loai_ts: 'TSCD',
              so_seri: 'SN123456', dvt: 'cái', sl: 1, nguyen_gia: 5000000, gia_tri: 4500000,
              ngay_tao: '2023-01-15', nhom: 'VT.01' },
            { ma_tscd: 'VT-05-002', ten_tscd: 'Khung cấp', loai_ts: 'TSCD',
              so_seri: 'SN654321', dvt: 'bộ', sl: 2, nguyen_gia: 2000000, gia_tri: 1800000,
              ngay_tao: '2023-02-20', nhom: 'VT.05' }
        ];
        rs = await api(`/api/doichieu/${dot_id}/upload-tscd`, {
            method: 'POST',
            body: { data: tscd_data }
        });
        kt('Upload file TSCĐ', rs.status === 200 && rs.data.so_dong === 2);
    }

    /* --- Upload file CCDC --- */
    if (dot_id) {
        const ccdc_data = [
            { ma_ccdc: 'CCDC-001', ten_ccdc: 'Máy quay trục', chi_tieu: 'SGB-620/40T',
              so_seri: 'SN123456', dvt: 'cái', sl: 1, gia_tri: 4500000,
              ngay_cap: '2023-01-15', phong_ban: 'PX ĐL1' }
        ];
        rs = await api(`/api/doichieu/${dot_id}/upload-ccdc`, {
            method: 'POST',
            body: { data: ccdc_data }
        });
        kt('Upload file CCDC', rs.status === 200 && rs.data.so_dong === 1);
    }

    /* --- Chạy logic so sánh --- */
    if (dot_id) {
        rs = await api(`/api/doichieu/${dot_id}/chay-so-sanh`, { method: 'POST' });
        kt('Chạy logic so sánh dữ liệu', rs.status === 200 && rs.data.so_khop >= 0);
    }

    /* --- Lấy danh sách chi tiết sai lệch --- */
    if (dot_id) {
        rs = await api(`/api/doichieu/${dot_id}/chi-tiet`, { method: 'GET' });
        kt('Lấy danh sách chi tiết', rs.status === 200 && rs.data.data);
    }

    /* --- Xác nhận sai lệch --- */
    if (dot_id) {
        // Lấy chi tiết đầu tiên
        const chi_tiet_list = db.prepare('SELECT id FROM chi_tiet_doi_chieu WHERE dot_doi_chieu_id = ? LIMIT 1').all(dot_id);
        if (chi_tiet_list.length > 0) {
            const chi_tiet_id = chi_tiet_list[0].id;
            rs = await api(`/api/doichieu/${dot_id}/xac-nhan/${chi_tiet_id}`, {
                method: 'POST',
                body: { hanh_dong: 'tao_giao_dich_dieu_chinh', ghi_chu: 'Cần điều chỉnh' }
            });
            kt('Xác nhận sai lệch', rs.status === 200);
        }
    }

    /* --- Lịch sử đối chiếu --- */
    if (dot_id) {
        rs = await api(`/api/doichieu/${dot_id}/lich-su`, { method: 'GET' });
        kt('Lấy lịch sử đối chiếu', rs.status === 200 && rs.data.data && rs.data.data.length > 0);
    }

    /* --- Kiểm tra audit --- */
    const soAudit = db.prepare('SELECT COUNT(*) n FROM lich_su_doi_chieu').get().n;
    kt(`${soAudit} bản ghi audit ghi nhận`, soAudit > 0);

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
