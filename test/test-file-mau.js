/**
 * Test file mẫu & sinh tài liệu (v18)
 *
 * Kiểm tra:
 * - Upload file mẫu (DOCX)
 * - Liệt kê file mẫu
 * - Chi tiết file mẫu
 * - Cập nhật thông tin mẫu
 * - Thêm biến vào mẫu
 * - Download file mẫu
 * - Phân quyền file mẫu
 * - Ghim (pin) file mẫu
 * - Xóa file mẫu
 * - Lịch sử audit
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-fm-' + Date.now() + '.db');
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
        return { status: res.status, data, headers: res.headers };
    }

    console.log('\n===== TEST FILE MẪU (v18) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra database schema --- */
    const soLoaiMau = db.prepare('SELECT COUNT(*) n FROM loai_file_mau').get().n;
    kt(`${soLoaiMau} loại file mẫu được định nghĩa`, soLoaiMau >= 4);

    const soCapTruyCap = db.prepare('SELECT COUNT(*) n FROM cap_truy_cap_file_mau').get().n;
    kt(`${soCapTruyCap} cấp truy cập được định nghĩa`, soCapTruyCap >= 3);

    /* --- API Loại file --- */
    rs = await api('/api/filemau/loai', { method: 'GET' });
    kt('API liệt kê loại file mẫu', rs.status === 200 && rs.data.data && rs.data.data.length > 0);

    rs = await api('/api/filemau/cap-truy-cap', { method: 'GET' });
    kt('API liệt kê cấp truy cập', rs.status === 200 && rs.data.data && rs.data.data.length > 0);

    /* --- Tạo file mẫu (DOCX) --- */
    // Tạo file DOCX đơn giản (binary format)
    const docxBuffer = Buffer.from([
        0x50, 0x4B, 0x03, 0x04, // ZIP signature
        0x14, 0x00, 0x00, 0x00, 0x08, 0x00, // Version
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x74, 0x65,
        0x73, 0x74, 0x2E, 0x64, 0x6F, 0x63, 0x78  // "test.docx"
    ]);

    // Upload file mẫu - sử dụng FormData
    const formData = new FormData();
    formData.append('ma', 'phieu_ktt_test');
    formData.append('ten', 'Phiếu kiểm tra test');
    formData.append('mo_ta', 'Mẫu kiểm tra thiết bị');
    formData.append('loai_id', '1');
    formData.append('tro_cap', 'noi_bo');
    formData.append('tap_tin', new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'test.docx');

    rs = await api('/api/filemau', {
        method: 'POST',
        headers: { 'Cookie': cookie.split(';')[0] },
        body: formData
    });
    const file_id = rs.data?.id;
    kt('Tạo file mẫu mới', rs.status === 200 && file_id);

    /* --- Liệt kê file mẫu --- */
    rs = await api('/api/filemau', { method: 'GET' });
    kt('API liệt kê file mẫu', rs.status === 200 && rs.data.data && rs.data.data.length > 0);

    /* --- Chi tiết file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}`, { method: 'GET' });
        kt('Lấy chi tiết file mẫu', rs.status === 200 && rs.data.data && rs.data.data.ten === 'Phiếu kiểm tra test',
            `Status: ${rs.status}, Data: ${JSON.stringify(rs.data).substring(0, 100)}`);
    }

    /* --- Cập nhật file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}`, {
            method: 'PUT',
            body: { ten: 'Phiếu kiểm tra test (cập nhật)', mo_ta: 'Mẫu kiểm tra thiết bị được cập nhật' }
        });
        kt('Cập nhật thông tin file mẫu', rs.status === 200);
    }

    /* --- Thêm biến vào mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}/bien`, {
            method: 'POST',
            body: { ma_bien: 'ten_thietbi', kieu_du_lieu: 'text', bat_buoc: true, mo_ta: 'Tên thiết bị' }
        });
        kt('Thêm biến vào mẫu', rs.status === 200 && rs.data.id);

        rs = await api(`/api/filemau/${file_id}/bien`, {
            method: 'POST',
            body: { ma_bien: 'ngay_kiem_tra', kieu_du_lieu: 'date', bat_buoc: true, mo_ta: 'Ngày kiểm tra' }
        });
        kt('Thêm biến ngày vào mẫu', rs.status === 200);
    }

    /* --- Download file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}/download`, { method: 'GET' });
        kt('Download file mẫu', rs.status === 200,
            `Status: ${rs.status}, Data: ${JSON.stringify(rs.data).substring(0, 100)}`);
    }

    /* --- Phân quyền file mẫu --- */
    if (file_id) {
        // Lấy vai trò nhân viên
        const vaitro = db.prepare('SELECT id FROM vai_tro WHERE ma = ?').get('nhanvien');
        if (vaitro) {
            rs = await api(`/api/filemau/${file_id}/quyen`, {
                method: 'POST',
                body: { vai_tro_id: vaitro.id, donvi_id: null }
            });
            kt('Phân quyền file mẫu cho vai trò', rs.status === 200);
        }
    }

    /* --- Ghim file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}/ghim`, {
            method: 'POST',
            body: { thu_tu: 1 }
        });
        kt('Ghim file mẫu', rs.status === 200);
    }

    /* --- Liệt kê file ghim --- */
    rs = await api('/api/filemau?tro_cap=noi_bo', { method: 'GET' });
    const fileCoPinned = rs.data.data?.some(f => f.da_ghim > 0);
    kt('Liệt kê file mẫu có ghim', rs.status === 200 && fileCoPinned);

    /* --- Lịch sử file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}/lich-su`, { method: 'GET' });
        kt('Xem lịch sử file mẫu', rs.status === 200 && rs.data.data && rs.data.data.length > 0);
    }

    /* --- Bỏ ghim file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}/ghim`, { method: 'DELETE' });
        kt('Bỏ ghim file mẫu', rs.status === 200);
    }

    /* --- Xóa file mẫu --- */
    if (file_id) {
        rs = await api(`/api/filemau/${file_id}`, { method: 'DELETE' });
        kt('Xóa file mẫu', rs.status === 200);
    }

    /* --- Kiểm tra audit --- */
    const soAudit = db.prepare('SELECT COUNT(*) n FROM file_mau_lich_su').get().n;
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
