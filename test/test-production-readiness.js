/** TASK 25 acceptance: readiness, metrics, error tracking, indexes, backup/restore and load thresholds. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-prod-ready-'));
process.env.NODE_ENV = 'test';
process.env.QLCD_DB = path.join(temp, 'qlcd.db');
process.env.QLCD_UPLOAD = path.join(temp, 'uploads');
process.env.QLCD_BACKUP_DIR = path.join(temp, 'backups');
process.env.QLCD_ADMIN_PASS = 'Ready@2026';
fs.mkdirSync(process.env.QLCD_UPLOAD, { recursive: true });
fs.writeFileSync(path.join(process.env.QLCD_UPLOAD, 'fixture.txt'), 'backup fixture');

const app = require('../server');
const db = require('../db');
const OBS = require('../lib/observability');
const backup = require('../lib/backup-service');
const { profileQueryPlans } = require('../lib/query-profile');
const { auditProductionConfig } = require('../lib/production-readiness');
const { runLoadTest } = require('../lib/load-test');
let passed = 0, failed = 0;
function check(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}${detail ? ` -> ${detail}` : ''}`); }
}

(async () => {
    console.log('\n===== TEST TASK 25 PRODUCTION READINESS =====');
    check('Migration 37 được journal', !!db.prepare("SELECT 1 FROM schema_migrations WHERE ten_file='37-production-readiness.sql'").get());
    const plans = profileQueryPlans();
    check('7/7 truy vấn nóng dùng index dự kiến', plans.length === 7 && plans.every(x => x.indexed),
        plans.filter(x => !x.indexed).map(x => x.name).join(','));
    check('Cấu hình thiếu volume/secret bị chặn', !auditProductionConfig({}).ready);
    const config = auditProductionConfig({ NODE_ENV: 'production', QLCD_INTERNET: '1',
        QLCD_SECRET: 'production-secret-example-longer-than-thirty-two', QLCD_DB: '/data/db/qlcd.db',
        QLCD_UPLOAD: '/data/uploads', QLCD_BACKUP_DIR: '/data/backups', QLCD_PUBLIC_HOST: 'qlcd.example.vn' });
    check('Cấu hình production đầy đủ đạt gate', config.ready, config.errors.join('; '));
    check('Readiness kiểm tra database/migration/storage', OBS.readiness().ready,
        JSON.stringify(OBS.readiness()));

    const made = await backup.createBackup(process.env.QLCD_BACKUP_DIR, { retention: 3 });
    const verified = backup.verifyBackup(made.folder);
    check('Backup có manifest và checksum hợp lệ', verified.ok && verified.files >= 2);
    const expectedMigrations = fs.readdirSync(path.join(__dirname, '..', 'db')).filter(x => /^\d+.*\.sql$/.test(x)).length;
    check(`Backup database đủ ${expectedMigrations} migration`, verified.migrations === expectedMigrations, String(verified.migrations));
    check('Restore drill trên vùng tạm đạt', backup.restoreDrill(made.folder).ok);
    fs.appendFileSync(path.join(made.folder, 'uploads', 'fixture.txt'), 'tampered');
    let detected = false;
    try { backup.verifyBackup(made.folder); } catch (error) { detected = /checksum/.test(error.message); }
    check('Phát hiện file backup bị thay đổi', detected);

    const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.Cookie = cookie;
        if (options.body) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
        const response = await fetch(base + url, { ...options, headers });
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        let body = null; try { body = await response.json(); } catch (_) {}
        return { response, body };
    }
    let result = await api('/api/ready');
    check('Readiness endpoint public trả 200', result.response.status === 200 && result.body.ready);
    check('Metrics endpoint chặn anonymous', (await api('/api/operations/metrics')).response.status === 401);
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'Ready@2026' } });
    result = await api('/api/operations/metrics');
    check('Admin đọc metrics vận hành', result.response.status === 200 && result.body.requests.total >= 2);

    const errorId = OBS.captureError(new Error('TASK25 synthetic error'), {
        requestId: 'task25-test-request', method: 'GET', originalUrl: '/test/error', ip: '127.0.0.1',
        session: { nguoiDung: { id: 1 } }
    }, 500);
    check('Error tracking lưu fingerprint và request ID', !!errorId &&
        db.prepare('SELECT request_id FROM operational_error_events WHERE id=?').get(errorId)?.request_id === 'task25-test-request');
    result = await api('/api/operations/errors');
    check('Admin xem hàng đợi lỗi', result.response.status === 200 && result.body.some(x => x.id === errorId));
    result = await api(`/api/operations/errors/${errorId}/resolve`, { method: 'POST', body: { note: 'Đã kiểm tra acceptance' } });
    check('Resolve lỗi cần actor và ghi chú', result.response.status === 200 &&
        db.prepare('SELECT status FROM operational_error_events WHERE id=?').get(errorId).status === 'RESOLVED');

    const load = await runLoadTest({ baseUrl: base, requests: 400, concurrency: 20,
        paths: ['/api/health', '/api/ready'], p95LimitMs: 250, maxErrorRate: 0 });
    check('Load test 400 request/20 concurrent đạt error-rate 0%', load.error_rate === 0, JSON.stringify(load));
    check('Load test đạt ngưỡng p95 <= 250ms', load.passed, JSON.stringify(load));
    console.log('  LOAD RESULT:', JSON.stringify(load));
    result = await api('/api/operations/metrics');
    check('Metrics ghi nhận latency theo route có giới hạn bộ nhớ', result.body.requests.total >= 400 &&
        result.body.routes.length > 0 && result.body.routes.every(x => x.p95_ms >= 0));

    await new Promise(resolve => server.close(resolve));
    try { db.close(); } catch (_) {}
    fs.rmSync(temp, { recursive: true, force: true });
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed + failed} test =====`);
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
