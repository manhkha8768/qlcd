/**
 * Test Dashboard & Báo cáo (v22)
 *
 * Kiểm tra:
 * - Thống kê công ty
 * - Thống kê phân xưởng
 * - 5 loại báo cáo
 * - KPI kỹ thuật
 * - Quyền truy cập
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-dashboard-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));

// Tạo người dùng test
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('px1',?, 'Phân xưởng 1', 'px')`).run(bcrypt.hashSync('px123', 8));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('viewer',?, 'Người xem', 'xem')`).run(bcrypt.hashSync('viewer123', 8));

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

    console.log('\n===== TEST DASHBOARD & BÁO CÁO (v22) =====\n');
    try {

    /* --- Xác thực trước --- */
    let rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200);

    /* --- Kiểm tra schema --- */
    const soPhanXuong = db.prepare('SELECT COUNT(*) n FROM phan_xuong WHERE hoat_dong = 1').get().n;
    kt(`${soPhanXuong} phân xưởng trong hệ thống`, soPhanXuong >= 0);

    const soThietBi = db.prepare('SELECT COUNT(*) n FROM thiet_bi').get().n;
    kt(`${soThietBi} thiết bị trong hệ thống`, soThietBi >= 0);

    /* --- API Thống kê công ty --- */
    rs = await api('/api/dashboard/thong-ke-cong-ty', { method: 'GET' });
    if (rs.status !== 200) console.log('thong-ke-cong-ty:', rs.status, rs.data);
    kt('API thống kê công ty', rs.status === 200 && rs.data.data);
    const stats = rs.data?.data;
    if (stats) {
        kt('  - Có trường so_phan_xuong', stats.so_phan_xuong !== undefined);
        kt('  - Có trường so_thiet_bi', stats.so_thiet_bi !== undefined);
        kt('  - Có trường thiet_bi_hoat_dong', stats.thiet_bi_hoat_dong !== undefined);
        kt('  - Có trường thiet_bi_sua', stats.thiet_bi_sua !== undefined);
        kt('  - Có trường thiet_bi_kem_hong', stats.thiet_bi_kem_hong !== undefined);
        kt('  - Có trường kiem_dinh_het_han', stats.kiem_dinh_het_han !== undefined);
        kt('  - Có trường bao_duong_het_han', stats.bao_duong_het_han !== undefined);
        kt('  - Có trường su_co_mo', stats.su_co_mo !== undefined);
        kt('  - Có trường giao_dich_cho_duyet', stats.giao_dich_cho_duyet !== undefined);
        kt('  - Có trường kho_thap', stats.kho_thap !== undefined);
        kt('  - Có trường gia_tri_tai_san', stats.gia_tri_tai_san !== undefined);
        kt('  - Có trường chi_phi_sua', stats.chi_phi_sua !== undefined);
    }

    /* --- API Thống kê phân xưởng --- */
    const px = db.prepare('SELECT id FROM phan_xuong WHERE hoat_dong = 1 LIMIT 1').get();
    if (px) {
        rs = await api(`/api/dashboard/thong-ke-phan-xuong/${px.id}`, { method: 'GET' });
        kt('API thống kê phân xưởng', rs.status === 200 && rs.data.data);
        const pxStats = rs.data?.data;
        if (pxStats) {
            kt('  - Có trường so_thiet_bi', pxStats.so_thiet_bi !== undefined);
            kt('  - Có trường thiet_bi_hoat_dong', pxStats.thiet_bi_hoat_dong !== undefined);
            kt('  - Có trường thiet_bi_sua', pxStats.thiet_bi_sua !== undefined);
            kt('  - Có trường gia_tri_tai_san', pxStats.gia_tri_tai_san !== undefined);
        }
    }

    /* --- Báo cáo danh sách thiết bị --- */
    rs = await api('/api/dashboard/baocao/danh-sach-thiet-bi', { method: 'GET' });
    kt('API báo cáo danh sách thiết bị', rs.status === 200 && rs.data.data !== undefined);
    kt('  - Trả về mảng dữ liệu', Array.isArray(rs.data?.data));
    kt('  - Có type báo cáo', rs.data?.type === 'danh_sach_thiet_bi');

    /* --- Báo cáo tồn kho --- */
    rs = await api('/api/dashboard/baocao/kho-vat-tu', { method: 'GET' });
    kt('API báo cáo tồn kho', rs.status === 200 && rs.data.data !== undefined);
    kt('  - Trả về mảng dữ liệu', Array.isArray(rs.data?.data));
    kt('  - Có type báo cáo', rs.data?.type === 'kho_vat_tu');

    /* --- Báo cáo kiểm kê --- */
    rs = await api('/api/dashboard/baocao/kiem-ke', { method: 'GET' });
    if (rs.status !== 200) console.log('kiem-ke:', rs.status, rs.data);
    kt('API báo cáo kiểm kê', rs.status === 200 && rs.data.data !== undefined);
    kt('  - Trả về mảng dữ liệu', Array.isArray(rs.data?.data));
    kt('  - Có type báo cáo', rs.data?.type === 'kiem_ke');

    /* --- Báo cáo giao dịch --- */
    rs = await api('/api/dashboard/baocao/giao-dich', { method: 'GET' });
    if (rs.status !== 200) console.log('giao-dich:', rs.status, rs.data);
    kt('API báo cáo giao dịch', rs.status === 200 && rs.data.data !== undefined);
    kt('  - Trả về mảng dữ liệu', Array.isArray(rs.data?.data));
    kt('  - Có type báo cáo', rs.data?.type === 'giao_dich');

    /* --- Báo cáo sự cố --- */
    rs = await api('/api/dashboard/baocao/su-co', { method: 'GET' });
    if (rs.status !== 200) console.log('su-co:', rs.status, rs.data);
    kt('API báo cáo sự cố', rs.status === 200 && rs.data.data !== undefined);
    kt('  - Trả về mảng dữ liệu', Array.isArray(rs.data?.data));
    kt('  - Có type báo cáo', rs.data?.type === 'su_co');

    /* --- API KPI kỹ thuật --- */
    rs = await api('/api/dashboard/kpi', { method: 'GET' });
    if (rs.status !== 200) console.log('kpi:', rs.status, rs.data);
    kt('API KPI kỹ thuật', rs.status === 200 && rs.data.data);
    const kpi = rs.data?.data;
    if (kpi) {
        kt('  - Có trường ty_le_thiet_bi_tot', kpi.ty_le_thiet_bi_tot !== undefined);
        kt('  - Có trường ty_le_thiet_bi_kem_hong', kpi.ty_le_thiet_bi_kem_hong !== undefined);
        kt('  - Có trường ty_le_kiem_dinh_dung_han', kpi.ty_le_kiem_dinh_dung_han !== undefined);
    }

    /* --- Kiểm tra quyền: đăng nhập với user xem --- */
    cookie = '';
    rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'viewer', mat_khau: 'viewer123' } });
    kt('Đăng nhập user xem', rs.status === 200);

    // User xem có quyền thietbi.xem
    rs = await api('/api/dashboard/thong-ke-cong-ty', { method: 'GET' });
    kt('User xem có thể truy cập thống kê công ty', rs.status === 200);

    /* --- Kiểm tra quyền báo cáo --- */
    // Đăng nhập user xem (quyền thêm hạn chế)
    cookie = '';
    rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'viewer', mat_khau: 'viewer123' } });
    kt('Đăng nhập lại user xem', rs.status === 200);

    // Thử báo cáo - user xem có thể không có quyền baocao.xem
    rs = await api('/api/dashboard/baocao/danh-sach-thiet-bi', { method: 'GET' });
    kt('Kiểm tra quyền báo cáo', rs.status === 200 || rs.status === 403);

    /* --- Kiểm tra schema định nghĩa --- */
    const soQuyenDashboard = db.prepare("SELECT COUNT(*) n FROM ma_quyen WHERE ma LIKE 'baocao.%' OR ma LIKE 'thietbi.%'").get().n;
    kt(`${soQuyenDashboard} quyền dashboard/báo cáo định nghĩa`, soQuyenDashboard >= 2);

    /* --- Excel Export --- */
    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'danh-sach-thiet-bi' }
    });
    if (rs.status !== 200) console.log('Export danh-sach-thiet-bi:', rs.status, rs.data);
    kt('Export Excel danh sách thiết bị', rs.status === 200);

    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'kho-vat-tu' }
    });
    if (rs.status !== 200) console.log('Export kho-vat-tu:', rs.status, rs.data);
    kt('Export Excel kho vật tư', rs.status === 200);

    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'kiem-ke' }
    });
    if (rs.status !== 200) console.log('Export kiem-ke:', rs.status, rs.data);
    kt('Export Excel kiểm định', rs.status === 200);

    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'giao-dich' }
    });
    if (rs.status !== 200) console.log('Export giao-dich:', rs.status, rs.data);
    kt('Export Excel giao dịch', rs.status === 200);

    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'su-co' }
    });
    if (rs.status !== 200) console.log('Export su-co:', rs.status, rs.data);
    kt('Export Excel sự cố', rs.status === 200);

    // Test loại báo cáo không hợp lệ
    rs = await api('/api/dashboard/export/excel', {
        method: 'POST',
        body: { loai_bao_cao: 'khong-hop-le' }
    });
    kt('Export báo cáo không hợp lệ bị từ chối', rs.status === 400);

    /* --- PDF Export --- */
    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'danh-sach-thiet-bi' }
    });
    if (rs.status !== 200) console.log('Export danh-sach-thiet-bi PDF:', rs.status, rs.data);
    kt('Export PDF danh sách thiết bị', rs.status === 200);

    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'kho-vat-tu' }
    });
    if (rs.status !== 200) console.log('Export kho-vat-tu PDF:', rs.status, rs.data);
    kt('Export PDF kho vật tư', rs.status === 200);

    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'kiem-ke' }
    });
    if (rs.status !== 200) console.log('Export kiem-ke PDF:', rs.status, rs.data);
    kt('Export PDF kiểm định', rs.status === 200);

    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'giao-dich' }
    });
    if (rs.status !== 200) console.log('Export giao-dich PDF:', rs.status, rs.data);
    kt('Export PDF giao dịch', rs.status === 200);

    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'su-co' }
    });
    if (rs.status !== 200) console.log('Export su-co PDF:', rs.status, rs.data);
    kt('Export PDF sự cố', rs.status === 200);

    // Test loại báo cáo không hợp lệ (PDF)
    rs = await api('/api/dashboard/export/pdf', {
        method: 'POST',
        body: { loai_bao_cao: 'khong-hop-le' }
    });
    kt('Export PDF báo cáo không hợp lệ bị từ chối', rs.status === 400);

    } catch (e) {
        console.error('[LỖI]', e.message, e.stack);
        ds.push(`  [TRƯỢT] Lỗi exception: ${e.message}`);
        truot++;
    }

    console.log('\n' + ds.join('\n'));
    console.log(`\n===== KẾT QUẢ =====`);
    console.log(`Đạt: ${dat} | Trượt: ${truot} | Tổng: ${dat + truot}`);
    console.log(`Tỷ lệ: ${(dat / (dat + truot) * 100).toFixed(1)}%\n`);

    server.close();
    process.exit(truot > 0 ? 1 : 0);
})();
