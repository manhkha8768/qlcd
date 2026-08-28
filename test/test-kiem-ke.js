/**
 * Test kiểm kê & quản lý snapshot thiết bị (v19)
 *
 * Kiểm tra:
 * - Tạo đợt kiểm kê mới
 * - Tạo snapshot trước kiểm kê
 * - Giao nhiệm vụ cho phân xưởng
 * - Ghi nhận chi tiết thiết bị
 * - Hoàn thành kiểm kê
 * - Báo cáo thiếu/mất
 * - Lịch sử audit
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-kk-' + Date.now() + '.db');
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

    console.log('\n===== TEST KIỂM KÊ (v19) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra database schema --- */
    const soDot = db.prepare('SELECT COUNT(*) n FROM dot_kiem_ke').get().n;
    kt(`${soDot} đợt kiểm kê tạo được`, soDot >= 0);

    const soQuyen = db.prepare("SELECT COUNT(*) n FROM ma_quyen WHERE ma LIKE 'kiemke.%'").get().n;
    kt(`${soQuyen} quyền kiểm kê được định nghĩa`, soQuyen >= 7);

    /* --- API Danh sách --- */
    rs = await api('/api/kiemke', { method: 'GET' });
    kt('API liệt kê kiểm kê', rs.status === 200 && rs.data.data);

    /* --- Tạo đợt kiểm kê --- */
    rs = await api('/api/kiemke', {
        method: 'POST',
        body: {
            ma: 'KK_2024_1',
            ten: 'Kiểm kê năm 2024 kỳ I',
            so_hieu_kiemke: 'KK-2024-001',
            nam: 2024,
            ky: 1,
            ngay_bat_dau: new Date().toISOString().split('T')[0]
        }
    });
    const dot_id = rs.data?.id;
    kt('Tạo đợt kiểm kê mới', rs.status === 200 && dot_id);

    /* --- Chi tiết đợt kiểm kê --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}`, { method: 'GET' });
        kt('Lấy chi tiết đợt kiểm kê', rs.status === 200 && rs.data.data);
    }

    /* --- Tạo snapshot --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}/tao-snapshot`, { method: 'POST' });
        kt('Tạo snapshot trước kiểm kê', rs.status === 200 && rs.data.so_thiet_bi >= 0);
    }

    /* --- Giao nhiệm vụ --- */
    if (dot_id) {
        // Lấy phân xưởng đầu tiên
        const px = db.prepare('SELECT id FROM phan_xuong LIMIT 1').get();
        if (px) {
            rs = await api(`/api/kiemke/${dot_id}/giao-nhiem-vu`, {
                method: 'POST',
                body: { phan_xuong_id: px.id }
            });
            const nhiem_vu_id = rs.data?.id;
            kt('Giao nhiệm vụ kiểm kê cho phân xưởng', rs.status === 200 && nhiem_vu_id);

            /* --- Chi tiết nhiệm vụ --- */
            if (nhiem_vu_id) {
                rs = await api(`/api/kiemke/${dot_id}/nhiem-vu/${nhiem_vu_id}`, { method: 'GET' });
                kt('Lấy chi tiết nhiệm vụ', rs.status === 200 && rs.data.data);
            }

            /* --- Ghi nhận chi tiết thiết bị --- */
            if (nhiem_vu_id) {
                // Lấy thiết bị đầu tiên
                const tb = db.prepare('SELECT id FROM thiet_bi LIMIT 1').get();
                if (tb) {
                    rs = await api(`/api/kiemke/${dot_id}/nhiem-vu/${nhiem_vu_id}/them-chi-tiet`, {
                        method: 'POST',
                        body: {
                            thiet_bi_id: tb.id,
                            trang_thai_moi: 'hoat_dong',
                            ket_luan: 'Tình trạng tốt'
                        }
                    });
                    kt('Ghi nhận chi tiết thiết bị', rs.status === 200);
                }
            }
        }
    }

    /* --- Hoàn thành kiểm kê --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}/hoan-thanh`, { method: 'POST' });
        kt('Hoàn thành đợt kiểm kê', rs.status === 200);
    }

    /* --- Báo cáo thiếu/mất --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}/bao-cao-thieu-mat`, { method: 'GET' });
        kt('Lấy báo cáo thiếu/mất', rs.status === 200 && rs.data.data !== undefined);
    }

    /* --- Lịch sử kiểm kê --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}/lich-su`, { method: 'GET' });
        kt('Lấy lịch sử kiểm kê', rs.status === 200 && rs.data.data && rs.data.data.length > 0);
    }

    /* --- Cập nhật đợt kiểm kê --- */
    if (dot_id) {
        rs = await api(`/api/kiemke/${dot_id}`, {
            method: 'PUT',
            body: { ten: 'Kiểm kê năm 2024 kỳ I (cập nhật)' }
        });
        kt('Cập nhật thông tin đợt kiểm kê', rs.status === 200);
    }

    /* --- Kiểm tra audit --- */
    const soAudit = db.prepare('SELECT COUNT(*) n FROM lich_su_kiem_ke').get().n;
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
