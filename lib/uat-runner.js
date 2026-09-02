const fs = require('fs');

async function runUatAcceptance({ app, db, password, manifest, evidencePath = null }) {
    const checks = [];
    const check = (code, role, name, passed, detail = null) => checks.push({ code, role, name, passed: !!passed, detail });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    function client() {
        let cookie = '';
        return async (url, options = {}) => {
            const headers = { ...(options.headers || {}) };
            if (cookie) headers.cookie = cookie;
            if (options.body) { headers['content-type'] = 'application/json'; options.body = JSON.stringify(options.body); }
            const response = await fetch(base + url, { ...options, headers });
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            let body = null; try { body = await response.json(); } catch (_) {}
            return { response, body };
        };
    }
    const login = async (api, username) => api('/api/auth/dang-nhap', {
        method: 'POST', body: { ten_dang_nhap: username, mat_khau: password }
    });
    try {
        const anonymous = client();
        let result = await anonymous('/api/ready');
        check('UAT-01', 'PUBLIC', 'Liveness/readiness staging', result.response.status === 200 && result.body?.ready);
        result = await anonymous('/api/tai-san');
        check('UAT-02', 'ANONYMOUS', 'Chặn truy cập khi chưa đăng nhập', result.response.status === 401);

        const admin = client();
        result = await login(admin, 'uat_admin');
        check('UAT-03', 'ADMIN', 'Đăng nhập tài khoản quản trị UAT', result.response.status === 200 && result.body?.nguoi_dung?.vai_tro === 'admin');
        result = await admin('/api/auth/tai-khoan');
        check('UAT-04', 'ADMIN', 'Quản trị xem được tài khoản UAT', result.response.status === 200 &&
            Array.isArray(result.body) &&
            result.body.filter(user => user.hoat_dong).every(user => user.ten_dang_nhap.startsWith('uat_')));
        result = await admin('/api/tai-san');
        check('UAT-05', 'ADMIN', 'Quản trị xem dữ liệu các PX đã chọn', result.response.status === 200 &&
            manifest.selected_unit_ids.every(id => result.body?.danh_sach?.some(asset => Number(asset.don_vi_id) === Number(id))));

        const company = client();
        result = await login(company, 'uat_cdcty');
        check('UAT-06', 'CĐVT', 'Đăng nhập vai trò CĐVT Công ty', result.response.status === 200 && result.body?.nguoi_dung?.vai_tro === 'cd_cty');
        result = await company('/api/tai-san');
        check('UAT-07', 'CĐVT', 'CĐVT xem được dữ liệu nghiệp vụ được phân quyền', result.response.status === 200);

        for (let index = 0; index < manifest.selected_unit_ids.length; index++) {
            const unitId = manifest.selected_unit_ids[index];
            const px = client();
            const username = `uat_px${String(index + 1).padStart(2, '0')}`;
            result = await login(px, username);
            check(`UAT-${String(8 + index * 2).padStart(2, '0')}`, 'PX', `Đăng nhập ${username}`, result.response.status === 200 &&
                Number(result.body?.nguoi_dung?.phan_xuong_id) === Number(unitId));
            result = await px('/api/tai-san');
            check(`UAT-${String(9 + index * 2).padStart(2, '0')}`, 'PX', `${username} chỉ xem tài sản đúng phạm vi`, result.response.status === 200 &&
                result.body?.danh_sach?.length > 0 && result.body.danh_sach.every(asset => Number(asset.don_vi_id) === Number(unitId)));
        }
        const quick = db.pragma('quick_check', { simple: true });
        const foreignKeys = db.pragma('foreign_key_check');
        check('UAT-12', 'SYSTEM', 'Toàn vẹn database sau hành trình UAT', quick === 'ok' && foreignKeys.length === 0);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
    const failed = checks.filter(item => !item.passed);
    const evidence = {
        format: 'QLCD_UAT_EVIDENCE_V1', executed_at: new Date().toISOString(),
        technical_status: failed.length ? 'FAILED' : 'PASSED', passed: checks.length - failed.length,
        failed: failed.length, total: checks.length, checks,
        business_signoff: { status: 'PENDING', required_roles: ['PX', 'CĐVT Công ty', 'Quản trị hệ thống'] }
    };
    if (evidencePath) fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    return evidence;
}

module.exports = { runUatAcceptance };
