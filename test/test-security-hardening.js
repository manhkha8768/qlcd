/** TASK 24 acceptance: route policy, session, CSRF, secrets, upload and request safety. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(os.tmpdir(), `qlcd-security-${Date.now()}.db`);
process.env.QLCD_DB = dbPath;
process.env.QLCD_INTERNET = '1';
process.env.QLCD_SECRET = 'task-24-secret-that-is-long-random-and-test-only-2026';

const db = require('../db');
const dbDir = path.join(__dirname, '..', 'db');
for (const file of fs.readdirSync(dbDir).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    db.exec(fs.readFileSync(path.join(dbDir, file), 'utf8'));
}
db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro)
    VALUES ('security_admin',?,'Security Admin','admin')`).run(bcrypt.hashSync('Security@2026', 8));

const app = require('../server');
const BM = require('../middleware/bao-mat');
const US = require('../lib/upload-security');
let passed = 0, failed = 0;
function check(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}${detail ? ` -> ${detail}` : ''}`); }
}

(async () => {
    console.log('\n===== TEST TASK 24 SECURITY HARDENING =====');
    const audit = app.locals.routePolicyAudit;
    check('Audit toàn bộ route không còn API thiếu xác thực', audit.routes.length >= 390 && audit.missing.length === 0,
        JSON.stringify(audit.missing));
    check('Chỉ endpoint đăng nhập được khai báo public', audit.publicCount === 1);

    check('Nhận đúng chữ ký PDF', US.contentMatches(Buffer.from('%PDF-1.7\n'), '.pdf'));
    check('Chặn file PDF giả mạo', !US.contentMatches(Buffer.from('<script>alert(1)</script>'), '.pdf'));
    check('Nhận đúng container XLSX/DOCX', US.contentMatches(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '.xlsx'));
    check('Chặn tên file có ký tự điều khiển', US.extension('bao\0cao.pdf') === null);

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (url, options = {}) => fetch(base + url, {
        ...options,
        redirect: 'manual',
        headers: { 'X-Forwarded-Proto': 'https', ...(options.headers || {}) }
    });

    let response = await request('/api/auth/dang-nhap', {
        method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_dang_nhap: 'security_admin', mat_khau: 'Security@2026' })
    });
    check('CSRF chặn Origin từ website bên ngoài', response.status === 403, String(response.status));

    response = await request('/api/auth/dang-nhap', {
        method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_dang_nhap: 'security_admin', mat_khau: 'Security@2026' })
    });
    check('Fetch Metadata chặn yêu cầu cross-site', response.status === 403, String(response.status));

    response = await request('/api/auth/dang-nhap', {
        method: 'POST', headers: { 'Idempotency-Key': 'bad key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_dang_nhap: 'security_admin', mat_khau: 'Security@2026' })
    });
    check('Chặn Idempotency-Key sai định dạng', response.status === 400, String(response.status));

    let redirectStatus = null;
    BM.epHttps({ get: name => name === 'x-forwarded-proto' ? 'http' : 'evil_example',
        protocol: 'http', originalUrl: '/api/health' }, {
        status(code) { redirectStatus = code; return this; }, json() { return this; },
        redirect(code) { redirectStatus = code; return this; }
    }, () => {});
    check('Chặn Host header không hợp lệ khi chuyển HTTPS', redirectStatus === 400, String(redirectStatus));

    response = await request('/api/auth/toi');
    const preCookie = response.headers.get('set-cookie')?.split(';')[0];
    check('API riêng tư từ chối khi chưa đăng nhập', response.status === 401);
    check('Mỗi phản hồi API có mã tra cứu', !!response.headers.get('x-request-id'));
    check('Dữ liệu API không được cache', /no-store/.test(response.headers.get('cache-control') || ''));

    response = await request('/api/auth/dang-nhap', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(preCookie ? { Cookie: preCookie } : {}) },
        body: JSON.stringify({ ten_dang_nhap: 'security_admin', mat_khau: 'Security@2026' })
    });
    const postCookie = response.headers.get('set-cookie')?.split(';')[0];
    check('Đăng nhập hợp lệ thành công', response.status === 200, String(response.status));
    check('Đổi mã phiên sau đăng nhập để chống session fixation', !!postCookie && postCookie !== preCookie);

    response = await request('/api/auth/dang-xuat', { method: 'POST', headers: { Cookie: postCookie } });
    check('Đăng xuất xóa cookie phiên', response.status === 200 && /Expires=Thu, 01 Jan 1970/i.test(response.headers.get('set-cookie') || ''));

    const originalSecret = process.env.QLCD_SECRET;
    delete process.env.QLCD_SECRET;
    const config = BM.kiemTraCauHinh();
    process.env.QLCD_SECRET = originalSecret;
    check('Production từ chối khởi động khi thiếu secret mạnh', config.loi.length > 0);

    await new Promise(resolve => server.close(resolve));
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(dbPath); } catch (_) {}
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed + failed} test =====`);
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
