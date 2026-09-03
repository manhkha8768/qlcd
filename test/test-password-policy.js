/**
 * Regression tests for the canonical 8-128 character password policy.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DB_TAM = path.join(os.tmpdir(), `qlcd-password-policy-${Date.now()}.db`);
process.env.QLCD_DB = DB_TAM;
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const db = require('../db');
const dbDir = path.join(__dirname, '..', 'db');
fs.readdirSync(dbDir).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(dbDir, f), 'utf8')));

// This deliberately represents an existing account created under the old policy.
const legacyPassword = 'old6!';
db.prepare(`INSERT INTO nguoi_dung
    (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
    VALUES ('admin', ?, 'Quản trị cũ', 'admin')`)
  .run(bcrypt.hashSync(legacyPassword, 8));

const app = require('../server');
const ERROR = 'Mật khẩu phải có độ dài từ 8 đến 128 ký tự';
let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed++;
        results.push(`  [ĐẠT]   ${name}`);
    } else {
        failed++;
        results.push(`  [TRƯỢT] ${name}${detail ? ` -> ${detail}` : ''}`);
    }
}

(async () => {
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';

    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.Cookie = cookie;
        if (options.body) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        const response = await fetch(base + url, { ...options, headers });
        const setCookies = response.headers.getSetCookie?.() || [];
        if (setCookies.length) cookie = setCookies[0].split(';')[0];
        let data = null;
        try { data = await response.json(); } catch (_) { /* response without JSON */ }
        return { status: response.status, data };
    }

    function responseDoesNotContain(response, secret) {
        return !JSON.stringify(response.data || {}).includes(secret);
    }

    try {
        let rs = await api('/api/auth/dang-nhap', {
            method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: legacyPassword }
        });
        check('Tài khoản cũ với mật khẩu 5 ký tự vẫn đăng nhập được', rs.status === 200, String(rs.status));

        const createCases = [
            { name: 'pw7', password: 'A'.repeat(7), accepted: false },
            { name: 'pw8', password: 'B'.repeat(8), accepted: true },
            { name: 'pw64', password: 'C'.repeat(64), accepted: true },
            { name: 'pw128', password: 'D'.repeat(128), accepted: true },
            { name: 'pw129', password: 'E'.repeat(129), accepted: false }
        ];

        for (const item of createCases) {
            rs = await api('/api/auth/tai-khoan', { method: 'POST', body: {
                ten_dang_nhap: item.name, mat_khau: item.password, vai_tro: 'xem'
            }});
            const expectedStatus = item.accepted ? 200 : 400;
            check(`${item.password.length} ký tự ${item.accepted ? 'được chấp nhận' : 'bị từ chối'} khi thêm tài khoản`,
                rs.status === expectedStatus, `${rs.status} ${rs.data?.loi || ''}`);
            if (!item.accepted) {
                check(`Lỗi ${item.password.length} ký tự dùng đúng thông báo`, rs.data?.loi === ERROR, rs.data?.loi);
            }
            check(`Response không lộ mật khẩu ${item.password.length} ký tự`,
                responseDoesNotContain(rs, item.password));
        }

        const change7 = 'F'.repeat(7);
        rs = await api('/api/auth/doi-mat-khau', { method: 'POST', body: {
            mat_khau_cu: legacyPassword, mat_khau_moi: change7
        }});
        check('Đổi mật khẩu 7 ký tự bị backend từ chối', rs.status === 400 && rs.data?.loi === ERROR,
            `${rs.status} ${rs.data?.loi || ''}`);
        check('Lỗi đổi mật khẩu không lộ mật khẩu', responseDoesNotContain(rs, change7));

        const change128 = 'G'.repeat(128);
        rs = await api('/api/auth/doi-mat-khau', { method: 'POST', body: {
            mat_khau_cu: legacyPassword, mat_khau_moi: change128
        }});
        check('Đổi mật khẩu 128 ký tự được chấp nhận', rs.status === 200, `${rs.status} ${rs.data?.loi || ''}`);
        check('Response đổi mật khẩu không lộ mật khẩu', responseDoesNotContain(rs, change128));

        const change129 = 'J'.repeat(129);
        rs = await api('/api/auth/doi-mat-khau', { method: 'POST', body: {
            mat_khau_cu: change128, mat_khau_moi: change129
        }});
        check('Đổi mật khẩu 129 ký tự bị backend từ chối',
            rs.status === 400 && rs.data?.loi === ERROR, `${rs.status} ${rs.data?.loi || ''}`);
        check('Lỗi 129 ký tự không lộ mật khẩu', responseDoesNotContain(rs, change129));

        const adminCreatePassword = 'Temporary-Account-2026!';
        rs = await api('/api/quantri/taikhoan', { method: 'POST', body: {
            ten_dang_nhap: 'temporary_user', ho_ten: 'Tài khoản tạm',
            mat_khau: adminCreatePassword, vai_tro_list: ['xem']
        }});
        const temporaryId = rs.data?.id;
        const temporaryRow = temporaryId
            ? db.prepare('SELECT mat_khau_hash FROM nguoi_dung WHERE id=?').get(temporaryId)
            : null;
        check('Quản trị tạo tài khoản tạm bằng mật khẩu được nhập',
            rs.status === 200 && temporaryRow && bcrypt.compareSync(adminCreatePassword, temporaryRow.mat_khau_hash),
            `${rs.status} ${rs.data?.loi || ''}`);
        check('API tạo tài khoản tạm không trả mật khẩu',
            responseDoesNotContain(rs, adminCreatePassword) && !Object.hasOwn(rs.data || {}, 'mat_khau_tam'));

        const reset7 = 'H'.repeat(7);
        rs = await api(`/api/quantri/taikhoan/${temporaryId}/reset-matkhau`, {
            method: 'POST', body: { mat_khau: reset7 }
        });
        check('Quản trị reset mật khẩu 7 ký tự bị từ chối',
            rs.status === 400 && rs.data?.loi === ERROR, `${rs.status} ${rs.data?.loi || ''}`);

        const reset8 = 'I'.repeat(8);
        rs = await api(`/api/quantri/taikhoan/${temporaryId}/reset-matkhau`, {
            method: 'POST', body: { mat_khau: reset8 }
        });
        const resetRow = db.prepare('SELECT mat_khau_hash FROM nguoi_dung WHERE id=?').get(temporaryId);
        check('Quản trị reset mật khẩu 8 ký tự được chấp nhận',
            rs.status === 200 && bcrypt.compareSync(reset8, resetRow.mat_khau_hash),
            `${rs.status} ${rs.data?.loi || ''}`);
        check('API reset không trả mật khẩu',
            responseDoesNotContain(rs, reset8) && !Object.hasOwn(rs.data || {}, 'mat_khau_tam'));

        const update129 = 'K'.repeat(129);
        rs = await api(`/api/auth/tai-khoan/${temporaryId}`, {
            method: 'PUT', body: { mat_khau: update129 }
        });
        check('API cập nhật tài khoản từ chối mật khẩu 129 ký tự',
            rs.status === 400 && rs.data?.loi === ERROR, `${rs.status} ${rs.data?.loi || ''}`);
        check('API cập nhật không lộ mật khẩu bị từ chối', responseDoesNotContain(rs, update129));

        const reset128 = 'L'.repeat(128);
        rs = await api(`/api/quantri/taikhoan/${temporaryId}/reset-matkhau`, {
            method: 'POST', body: { mat_khau: reset128 }
        });
        check('Quản trị reset mật khẩu 128 ký tự được chấp nhận', rs.status === 200, `${rs.status} ${rs.data?.loi || ''}`);
        check('API reset 128 ký tự không trả mật khẩu', responseDoesNotContain(rs, reset128));

        const reset129 = 'M'.repeat(129);
        rs = await api(`/api/quantri/taikhoan/${temporaryId}/reset-matkhau`, {
            method: 'POST', body: { mat_khau: reset129 }
        });
        check('Quản trị reset mật khẩu 129 ký tự bị từ chối',
            rs.status === 400 && rs.data?.loi === ERROR, `${rs.status} ${rs.data?.loi || ''}`);
        check('API reset 129 ký tự không lộ mật khẩu', responseDoesNotContain(rs, reset129));

        const auditText = db.prepare('SELECT chi_tiet_cu, chi_tiet_moi FROM audit_quyen').all()
            .map(row => JSON.stringify(row)).join('\n');
        check('Audit không chứa mật khẩu rõ',
            ![adminCreatePassword, reset7, reset8].some(secret => auditText.includes(secret)));

        const root = path.join(__dirname, '..');
        const frontendSources = [
            'public/js/man-hinh.js',
            'public/js/bao-mat.js',
            'public/admin/quan-tri-he-thong.html'
        ].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
        check('Giao diện khai báo minlength 8 và maxlength 128',
            /minlength="8"/.test(frontendSources) && /maxlength="128"/.test(frontendSources));
        check('Giao diện hiển thị hướng dẫn 8–128 ký tự',
            frontendSources.includes('Mật khẩu phải có độ dài từ 8 đến 128 ký tự'));
        check('Giao diện không còn hướng dẫn 4–6 ký tự',
            !/4\s*[-–]\s*6\s*ký tự/i.test(frontendSources));

        const lifecycleDb = path.join(os.tmpdir(), `qlcd-password-lifecycle-${Date.now()}.db`);
        const initPassword = 'Init-Secret-2026!';
        const initResult = spawnSync(process.execPath, ['db/init.js'], {
            cwd: root, encoding: 'utf8',
            env: { ...process.env, QLCD_DB: lifecycleDb, QLCD_ADMIN_PASS: initPassword }
        });
        const initOutput = `${initResult.stdout || ''}\n${initResult.stderr || ''}`;
        check('Khởi tạo tài khoản chấp nhận mật khẩu hợp lệ', initResult.status === 0, initOutput.slice(-300));
        check('Khởi tạo tài khoản không ghi log mật khẩu rõ', !initOutput.includes(initPassword));

        const cliPassword = 'Reset-CLI-Secret-2026!';
        const resetResult = spawnSync(process.execPath, ['scripts/dat-lai-mat-khau.js', cliPassword], {
            cwd: root, encoding: 'utf8',
            env: { ...process.env, QLCD_DB: lifecycleDb }
        });
        const resetOutput = `${resetResult.stdout || ''}\n${resetResult.stderr || ''}`;
        check('Script đặt lại mật khẩu chấp nhận mật khẩu hợp lệ', resetResult.status === 0, resetOutput.slice(-300));
        check('Script đặt lại mật khẩu không ghi log mật khẩu rõ', !resetOutput.includes(cliPassword));
        try { fs.unlinkSync(lifecycleDb); } catch (_) { /* already removed */ }
    } catch (error) {
        check('Không có lỗi ngoài dự kiến', false, error.stack || error.message);
    } finally {
        await new Promise(resolve => server.close(resolve));
        results.forEach(line => console.log(line));
        console.log(`\n===== KẾT QUẢ PASSWORD POLICY: ${passed} đạt / ${failed} trượt =====\n`);
        db.close();
        try { fs.unlinkSync(DB_TAM); } catch (_) { /* already removed */ }
        process.exit(failed ? 1 : 0);
    }
})();
