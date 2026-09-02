/**
 * Test lớp bảo mật khi chạy trên internet.
 *   node test/test-bao-mat.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-bm-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;
process.env.QLCD_INTERNET = '1';
process.env.QLCD_SECRET = 'chuoi-bi-mat-du-dai-cho-moi-truong-kiem-thu-1234567890';

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro, phai_doi_mat_khau)
            VALUES ('admin',?, 'Quản trị', 'admin', 1)`).run(bcrypt.hashSync('MatKhauManh2026', 8));

const app = require('../server');
const BM = require('../middleware/bao-mat');
const { danhSachPhien } = require('../lib/phien-sqlite');

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dk, ct = '') {
    if (dk) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${ct ? ' -> ' + ct : ''}`); }
}

(async () => {
    const server = app.listen(0);
    const goc = `http://127.0.0.1:${server.address().port}`;
    const phien = {};

    function taoApi(ten) {
        return async function (dd, tc = {}) {
            const h = { 'X-Forwarded-Proto': 'https', ...(tc.headers || {}) };
            if (phien[ten]) h.Cookie = phien[ten];
            if (tc.body) { h['Content-Type'] = 'application/json'; tc.body = JSON.stringify(tc.body); }
            const res = await fetch(goc + dd, { ...tc, headers: h, redirect: 'manual' });
            const sc = res.headers.getSetCookie?.() || [];
            if (sc.length) phien[ten] = sc[0].split(';')[0];
            let data = null;
            try { data = await res.json(); } catch (e) {}
            return { status: res.status, data, headers: res.headers, cookieGoc: sc };
        };
    }
    const A = taoApi('admin'), X = taoApi('ke_tan_cong');

    console.log('\n===== TEST BẢO MẬT (chế độ internet) =====\n');
    try {

    /* ---------- Header ---------- */
    ds.push('  --- Header bảo mật ---');
    let rs = await A('/');
    kt('Chặn nhúng trang vào iframe', rs.headers.get('x-frame-options') === 'DENY');
    kt('Chặn đoán kiểu tệp', rs.headers.get('x-content-type-options') === 'nosniff');
    kt('Bật HSTS ép trình duyệt dùng HTTPS',
       /max-age=\d+/.test(rs.headers.get('strict-transport-security') || ''));
    kt('Có Content-Security-Policy', !!rs.headers.get('content-security-policy'));
    kt('Chặn nhúng từ trang ngoài',
       /frame-ancestors 'none'/.test(rs.headers.get('content-security-policy') || ''));
    kt('Giấu thông tin máy chủ', !rs.headers.get('x-powered-by'));

    /* ---------- Ép HTTPS ---------- */
    const resHttp = await fetch(goc + '/', { headers: { 'X-Forwarded-Proto': 'http' }, redirect: 'manual' });
    kt('Truy cập qua HTTP bị chuyển sang HTTPS',
       resHttp.status === 308 && /^https:/.test(resHttp.headers.get('location') || ''),
       `${resHttp.status} ${resHttp.headers.get('location')}`);

    /* ---------- Cookie ---------- */
    ds.push('\n  --- Phiên đăng nhập ---');
    rs = await A('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'MatKhauManh2026' } });
    kt('Đăng nhập đúng mật khẩu', rs.status === 200);
    const ck = (rs.cookieGoc || []).join(';');
    kt('Cookie chỉ gửi qua HTTPS', /Secure/i.test(ck), ck.slice(0, 80));
    kt('Cookie chặn JavaScript đọc', /HttpOnly/i.test(ck));
    kt('Cookie chặn gửi kèm từ trang khác', /SameSite/i.test(ck));

    kt('Phiên lưu vào database, không nằm trong bộ nhớ',
       db.prepare('SELECT COUNT(*) n FROM phien_dang_nhap').get().n === 1);
    kt('Ghi lại địa chỉ IP tạo phiên',
       !!db.prepare('SELECT dia_chi_ip FROM phien_dang_nhap LIMIT 1').get().dia_chi_ip);

    rs = await A('/api/auth/toi');
    kt('Phiên dùng được cho lần gọi sau', rs.status === 200);

    /* ---------- Bắt đổi mật khẩu mặc định ---------- */
    ds.push('\n  --- Mật khẩu ---');
    rs = await A('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'MatKhauManh2026' } });
    kt('Báo cho admin biết phải đổi mật khẩu', rs.data.phai_doi_mat_khau === true,
       JSON.stringify(rs.data.phai_doi_mat_khau));

    rs = await A('/api/auth/doi-mat-khau', { method: 'POST',
        body: { mat_khau_cu: 'MatKhauManh2026', mat_khau_moi: 'abc12' } });
    kt('Chặn mật khẩu ngắn khi chạy internet',
       rs.status === 400 && /tối thiểu 8/.test(rs.data.loi), rs.data.loi);

    rs = await A('/api/auth/doi-mat-khau', { method: 'POST',
        body: { mat_khau_cu: 'MatKhauManh2026', mat_khau_moi: 'admin12345' } });
    kt('Chặn mật khẩu dễ đoán', rs.status === 400 && /dễ đoán/.test(rs.data.loi), rs.data.loi);

    rs = await A('/api/auth/doi-mat-khau', { method: 'POST',
        body: { mat_khau_cu: 'MatKhauManh2026', mat_khau_moi: 'Xlm@2026Kha' } });
    kt('Đổi mật khẩu đủ mạnh thành công', rs.status === 200);
    kt('Gỡ cờ bắt buộc đổi mật khẩu',
       db.prepare("SELECT phai_doi_mat_khau p FROM nguoi_dung WHERE ten_dang_nhap='admin'").get().p === 0);

    /* ---------- Chặn dò mật khẩu ---------- */
    ds.push('\n  --- Chặn dò mật khẩu ---');
    let cuoi = null;
    for (let i = 0; i < 4; i++) {
        cuoi = await X('/api/auth/dang-nhap', { method: 'POST',
            body: { ten_dang_nhap: 'admin', mat_khau: 'doan-bua-' + i } });
    }
    kt('Từ chối mật khẩu sai', cuoi.status === 401);
    kt('Cảnh báo số lần thử còn lại trước khi khóa',
       /Còn \d+ lần/.test(cuoi.data.loi || ''), cuoi.data.loi);

    cuoi = await X('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'doan-bua-cuoi' } });
    kt('Lần sai thứ 5 khóa tạm ngay, báo rõ thời gian chờ',
       cuoi.status === 429 && /quá nhiều lần/.test(cuoi.data.loi), `${cuoi.status} ${cuoi.data.loi}`);

    cuoi = await X('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'Xlm@2026Kha' } });
    kt('Đang khóa thì mật khẩu đúng cũng không vào được', cuoi.status === 429);

    kt('Ghi nhật ký từng lần đăng nhập sai',
       db.prepare('SELECT COUNT(*) n FROM dang_nhap_that_bai').get().n === 5,
       String(db.prepare('SELECT COUNT(*) n FROM dang_nhap_that_bai').get().n));
    kt('Nhật ký lưu địa chỉ IP để truy vết',
       !!db.prepare('SELECT dia_chi_ip FROM dang_nhap_that_bai LIMIT 1').get().dia_chi_ip);

    // Xóa nhật ký để mở khóa, mô phỏng hết thời gian khóa
    db.prepare('DELETE FROM dang_nhap_that_bai').run();
    cuoi = await X('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'Xlm@2026Kha' } });
    kt('Hết thời gian khóa thì đăng nhập lại được', cuoi.status === 200);

    kt('Đăng nhập đúng xóa lịch sử sai của tài khoản đó',
       db.prepare("SELECT COUNT(*) n FROM dang_nhap_that_bai WHERE ten_dang_nhap='admin'").get().n === 0);

    /* ---------- Quản trị phiên ---------- */
    ds.push('\n  --- Quản trị phiên từ xa ---');
    rs = await A('/api/auth/phien');
    kt('Admin xem được ai đang đăng nhập', rs.status === 200 && rs.data.length >= 1,
       `${rs.data.length} phiên`);
    kt('Danh sách phiên có tên tài khoản và địa chỉ IP',
       !!rs.data[0].ten_dang_nhap && !!rs.data[0].dia_chi_ip);

    // Tạo tài khoản phân xưởng rồi cắt phiên
    await A('/api/danh-muc/phan-xuong', { method: 'POST', body: { ma: 'DL1', ten: 'Đào lò 1' } });
    rs = await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'px1', mat_khau: 'Px1Manh2026', vai_tro: 'px', phan_xuong_id: 1 } });
    const idPx = rs.data.id;
    const P = taoApi('px1');
    await P('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'px1', mat_khau: 'Px1Manh2026' } });
    rs = await P('/api/auth/toi');
    kt('Tài khoản phân xưởng đăng nhập được', rs.status === 200);

    rs = await A(`/api/auth/phien/cat/${idPx}`, { method: 'POST' });
    kt('Admin cắt được phiên từ xa', rs.status === 200 && rs.data.so_phien_da_cat >= 1);

    rs = await P('/api/auth/toi');
    kt('Phiên bị cắt thì mất quyền truy cập ngay', rs.status === 401, String(rs.status));

    // Khóa tài khoản cũng cắt phiên
    await P('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'px1', mat_khau: 'Px1Manh2026' } });
    await A('/api/auth/tai-khoan/' + idPx, { method: 'PUT', body: { hoat_dong: 0 } });
    rs = await P('/api/auth/toi');
    kt('Khóa tài khoản tự cắt phiên đang mở', rs.status === 401);

    rs = await A('/api/auth/dang-nhap-sai');
    kt('Admin xem được nhật ký đăng nhập sai', rs.status === 200);

    rs = await P('/api/auth/phien');
    kt('Người không phải admin không xem được danh sách phiên',
       rs.status === 401 || rs.status === 403);

    /* ---------- Kiểm tra cấu hình khởi động ---------- */
    ds.push('\n  --- Kiểm tra cấu hình ---');
    const kq = BM.kiemTraCauHinh();
    kt('Cấu hình hiện tại hợp lệ để chạy internet', kq.loi.length === 0, kq.loi.join(' | '));
    kt('Nhận biết đang ở chế độ internet', kq.la_internet === true);

    } catch (e) {
        ds.push(`  [LỖI]   Dừng giữa chừng: ${e.message}\n          ${e.stack.split('\n')[1]?.trim()}`);
        truot++;
    }

    server.close();
    console.log(ds.join('\n'));
    console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
    try { fs.unlinkSync(DB_TAM); } catch (e) {}
    process.exit(truot ? 1 : 0);
})();
