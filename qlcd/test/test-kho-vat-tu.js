/**
 * Test kho vật tư & quản lý tồn kho (v21)
 *
 * Kiểm tra:
 * - Tạo vật tư mới
 * - Nhập kho, xuất kho
 * - Kiểm tra tồn kho
 * - Duyệt giao dịch
 * - Cảnh báo mức tồn
 * - Lịch sử audit
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-kho-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('kho',?, 'Nhân viên kho', 'px')`).run(bcrypt.hashSync('kho123', 8));

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

    console.log('\n===== TEST KHO VẬT TƯ (v21) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra schema --- */
    const soVatTu = db.prepare('SELECT COUNT(*) n FROM kho_vat_tu').get().n;
    kt(`${soVatTu} vật tư trong hệ thống`, soVatTu >= 0);

    const soQuyenKho = db.prepare("SELECT COUNT(*) n FROM ma_quyen WHERE ma LIKE 'kho.%'").get().n;
    kt(`${soQuyenKho} quyền kho định nghĩa`, soQuyenKho >= 6);

    /* --- API Danh sách vật tư --- */
    rs = await api('/api/khovat', { method: 'GET' });
    kt('API liệt kê vật tư', rs.status === 200 && rs.data.data);

    /* --- Tạo vật tư mới --- */
    rs = await api('/api/khovat', {
        method: 'POST',
        body: {
            ma: 'VT-001',
            ten: 'Axle 10mm',
            chi_tieu: '10mm',
            dvt: 'cái',
            ton_dau: 50,
            muc_toi_thieu: 20,
            muc_toi_da: 100,
            vi_tri_kho: 'Kho A - Giá 1',
            ghi_chu: 'Trục chính'
        }
    });
    const vt1_id = rs.data?.id;
    kt('Tạo vật tư mới', rs.status === 200 && vt1_id);

    /* --- Tạo vật tư thứ 2 --- */
    rs = await api('/api/khovat', {
        method: 'POST',
        body: {
            ma: 'VT-002',
            ten: 'Coupling 50mm',
            chi_tieu: '50mm',
            dvt: 'bộ',
            ton_dau: 30,
            muc_toi_thieu: 10,
            muc_toi_da: 80,
            vi_tri_kho: 'Kho A - Giá 2'
        }
    });
    const vt2_id = rs.data?.id;
    kt('Tạo vật tư thứ 2', rs.status === 200 && vt2_id);

    /* --- Chi tiết vật tư --- */
    if (vt1_id) {
        rs = await api(`/api/khovat/${vt1_id}`, { method: 'GET' });
        kt('Lấy chi tiết vật tư', rs.status === 200 && rs.data.data);
    }

    /* --- Nhập kho --- */
    if (vt1_id) {
        rs = await api(`/api/khovat/${vt1_id}/nhap`, {
            method: 'POST',
            body: {
                vat_tu_id: vt1_id,
                so_luong: 25,
                ly_do: 'Nhập từ nhà cung cấp ABC'
            }
        });
        const gd_nhap_id = rs.data?.id;
        kt('Lập phiếu nhập kho', rs.status === 200 && gd_nhap_id);

        /* --- Duyệt phiếu nhập --- */
        if (gd_nhap_id) {
            rs = await api(`/api/khovat/giao-dich/${gd_nhap_id}/duyet`, {
                method: 'POST',
                body: { phe_duyet: true }
            });
            kt('Duyệt phiếu nhập', rs.status === 200);

            // Kiểm tra tồn kho sau duyệt
            const ton_sau_nhap = db.prepare('SELECT ton_hien_tai FROM ton_kho WHERE vat_tu_id = ?').get(vt1_id);
            kt(`Tồn kho sau nhập: ${ton_sau_nhap.ton_hien_tai}`, ton_sau_nhap.ton_hien_tai === 75); // 50 + 25
        }
    }

    /* --- Xuất kho --- */
    if (vt1_id) {
        rs = await api(`/api/khovat/${vt1_id}/xuat`, {
            method: 'POST',
            body: {
                vat_tu_id: vt1_id,
                so_luong: 20,
                ly_do: 'Cấp cho PX ĐL1'
            }
        });
        const gd_xuat_id = rs.data?.id;
        kt('Lập phiếu xuất kho', rs.status === 200 && gd_xuat_id);

        /* --- Duyệt phiếu xuất --- */
        if (gd_xuat_id) {
            rs = await api(`/api/khovat/giao-dich/${gd_xuat_id}/duyet`, {
                method: 'POST',
                body: { phe_duyet: true }
            });
            kt('Duyệt phiếu xuất', rs.status === 200);

            // Kiểm tra tồn kho sau duyệt
            const ton_sau_xuat = db.prepare('SELECT ton_hien_tai FROM ton_kho WHERE vat_tu_id = ?').get(vt1_id);
            kt(`Tồn kho sau xuất: ${ton_sau_xuat.ton_hien_tai}`, ton_sau_xuat.ton_hien_tai === 55); // 75 - 20
        }
    }

    /* --- Xuất vượt tồn (phải từ chối) --- */
    if (vt1_id) {
        rs = await api(`/api/khovat/${vt1_id}/xuat`, {
            method: 'POST',
            body: {
                vat_tu_id: vt1_id,
                so_luong: 1000,
                ly_do: 'Xuất vượt (test)'
            }
        });
        kt('Xuất vượt tồn bị từ chối', rs.status === 400 && rs.data.loi);
    }

    /* --- API Danh sách giao dịch --- */
    rs = await api('/api/khovat/giao-dich', { method: 'GET' });
    kt('API liệt kê giao dịch kho', rs.status === 200 && rs.data.data);

    /* --- Chi tiết giao dịch --- */
    if (vt1_id) {
        const gd_list = db.prepare('SELECT id FROM giao_dich_kho LIMIT 1').all();
        if (gd_list.length > 0) {
            rs = await api(`/api/khovat/giao-dich/${gd_list[0].id}`, { method: 'GET' });
            kt('Lấy chi tiết giao dịch', rs.status === 200 && rs.data.data);
        }
    }

    /* --- Lịch sử audit --- */
    rs = await api('/api/khovat/lich-su', { method: 'GET' });
    kt('Lấy lịch sử audit kho', rs.status === 200 && rs.data.data);

    /* --- Kiểm tra cảnh báo mức tồn --- */
    if (vt1_id) {
        const vt = db.prepare(`
            SELECT k.*, COALESCE(t.ton_hien_tai, 0) as ton_hien_tai
            FROM kho_vat_tu k
            LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
            WHERE k.id = ?
        `).get(vt1_id);
        kt('Tính toán tinh trạng tồn (bình thường)', vt.ton_hien_tai >= vt.muc_toi_thieu && vt.ton_hien_tai <= vt.muc_toi_da);
    }

    /* --- Từ chối giao dịch --- */
    if (vt2_id) {
        rs = await api(`/api/khovat/${vt2_id}/nhap`, {
            method: 'POST',
            body: {
                vat_tu_id: vt2_id,
                so_luong: 15,
                ly_do: 'Nhập thử để từ chối'
            }
        });
        const gd_test_id = rs.data?.id;

        if (gd_test_id) {
            rs = await api(`/api/khovat/giao-dich/${gd_test_id}/duyet`, {
                method: 'POST',
                body: { phe_duyet: false }
            });
            kt('Từ chối giao dịch', rs.status === 200);

            // Tồn kho không thay đổi khi từ chối
            const ton = db.prepare('SELECT ton_hien_tai FROM ton_kho WHERE vat_tu_id = ?').get(vt2_id);
            kt('Tồn kho giữ nguyên khi từ chối', ton.ton_hien_tai === 30); // ban đầu
        }
    }

    /* --- Kiểm tra audit records --- */
    const soAudit = db.prepare('SELECT COUNT(*) n FROM lich_su_kho').get().n;
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
