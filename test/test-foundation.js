/** TASK 1 integration tests: migration journal, permission deny, multi-unit scope. */
const path = require('path');
const os = require('os');
const fs = require('fs');
const bcrypt = require('bcryptjs');

process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-foundation-${Date.now()}.db`);
const db = require('../db');
const { khoiTaoDatabase } = require('../db/init');
khoiTaoDatabase();
khoiTaoDatabase();

let dat = 0, truot = 0;
function kt(ten, dk) {
    if (dk) { dat++; console.log(`  [ĐẠT]   ${ten}`); }
    else { truot++; console.log(`  [TRƯỢT] ${ten}`); }
}

const px1 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('F1','PX 1','san_xuat')").run().lastInsertRowid;
const px2 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('F2','PX 2','san_xuat')").run().lastInsertRowid;
const userId = db.prepare(`INSERT INTO nguoi_dung
    (ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id)
    VALUES ('foundation_user',?,'Foundation user','px',?)`)
    .run(bcrypt.hashSync('foundation123', 8), px1).lastInsertRowid;
db.prepare(`INSERT INTO nguoi_dung_don_vi
    (nguoi_dung_id,don_vi_id,loai_phan_cong) VALUES (?,?,'chu_nhiem')`).run(userId, px2);
for (const ma of ['thietbi.xem', 'baocao.xem', 'kho.xem']) {
    db.prepare(`INSERT INTO quyen_nguoi_dung_dong(nguoi_dung_id,ma_quyen,duoc_phep)
        VALUES (?,?,0)`).run(userId, ma);
}

const app = require('../server');
(async () => {
    console.log('\n===== TEST TASK 1 FOUNDATION =====');
    const migrations = db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
    const expectedMigrations = fs.readdirSync(path.join(__dirname, '..', 'db'))
        .filter(name => name.endsWith('.sql')).length;
    kt(`Migration journal ghi đủ ${expectedMigrations} migration`, migrations === expectedMigrations);
    kt('Migration chạy lần hai không nhân đôi journal',
        db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n === expectedMigrations);

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/auth/dang-nhap', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ten_dang_nhap: 'foundation_user', mat_khau: 'foundation123' })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const call = url => fetch(base + url, { headers: { cookie } });
    kt('Đăng nhập user Foundation', login.status === 200);
    kt('Deny override chặn dashboard', (await call('/api/dashboard/thong-ke-cong-ty')).status === 403);
    kt('Deny override chặn kho', (await call('/api/khovat')).status === 403);

    const scope = await call('/api/quyen-cua-toi');
    const scopeBody = await scope.json();
    kt('Data scope trả đúng nhiều đơn vị', scope.status === 200 &&
        scopeBody.don_vi.length === 2 && scopeBody.don_vi.includes(Number(px1)) &&
        scopeBody.don_vi.includes(Number(px2)));
    kt('Cho truy cập đơn vị thứ hai được phân công',
        (await call(`/api/giao-dich-don-vi/${px2}`)).status === 200);
    const manifest = await fetch(base + '/manifest.webmanifest');
    kt('PWA manifest được phục vụ', manifest.status === 200 &&
        (await manifest.json()).short_name === 'QLCD');
    const sw = await fetch(base + '/service-worker.js');
    kt('PWA service worker được phục vụ', sw.status === 200 &&
        (await sw.text()).includes("qlcd-shell-v1"));

    server.close();
    console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====`);
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(truot ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
