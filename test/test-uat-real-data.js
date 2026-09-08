/** TASK 26 acceptance: immutable source, anonymized staging, two-unit role journey and pending human sign-off. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { applyMigrations, createUatStaging, sha256File } = require('../lib/uat-staging');
const { matchesMigrationChecksum } = require('../lib/migration-checksum');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-uat-'));
const sourceDb = path.join(temp, 'source.db');
const targetDb = path.join(temp, 'staging', 'uat.db');
const password = 'Uat-Safe-Password-2026!';
let passed = 0, failed = 0;
function check(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}${detail ? ` -> ${detail}` : ''}`); }
}

(async () => {
    console.log('\n===== TEST TASK 26 UAT DỮ LIỆU THỰC =====');
    const compatibilityDbPath = path.join(temp, 'migration-eol-compatibility.db');
    const compatibilityDb = new Database(compatibilityDbPath);
    applyMigrations(compatibilityDb);
    const firstMigrationLf = fs.readFileSync(path.join(__dirname, '..', 'db', '01-schema.sql'), 'utf8').replace(/\r\n/g, '\n');
    const firstMigrationLfChecksum = crypto.createHash('sha256').update(firstMigrationLf).digest('hex');
    compatibilityDb.prepare("UPDATE schema_migrations SET checksum_sha256=? WHERE ten_file='01-schema.sql'").run(firstMigrationLfChecksum);
    compatibilityDb.close();
    const compatibilityRun = spawnSync(process.execPath, ['-e', "const db=require('./db/init').khoiTaoDatabase(); db.close();"], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'test', QLCD_DB: compatibilityDbPath, QLCD_ADMIN_PASS: password },
        encoding: 'utf8'
    });
    check('Migration checksum tương thích LF/CRLF giữa Windows và Linux', compatibilityRun.status === 0, compatibilityRun.stderr);
    const compatibilityUatDb = new Database(compatibilityDbPath);
    let compatibilityUatPassed = true;
    try { applyMigrations(compatibilityUatDb); } catch (_) { compatibilityUatPassed = false; }
    compatibilityUatDb.close();
    check('UAT migration dùng cùng quy tắc checksum đa nền tảng', compatibilityUatPassed);
    check('Checksum vẫn chặn thay đổi nội dung migration', !matchesMigrationChecksum(firstMigrationLfChecksum, `${firstMigrationLf}\nSELECT 1;`));

    const source = new Database(sourceDb);
    applyMigrations(source);
    const unit1 = Number(source.prepare("INSERT INTO phan_xuong(ma,ten,ten_ngan,loai,quan_doc) VALUES('REAL-A','PX Nguồn A','A','san_xuat','Nguyễn Văn Nhạy')").run().lastInsertRowid);
    const unit2 = Number(source.prepare("INSERT INTO phan_xuong(ma,ten,ten_ngan,loai,co_dien_truong) VALUES('REAL-B','PX Nguồn B','B','san_xuat','Trần Văn Kín')").run().lastInsertRowid);
    const realUser = Number(source.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,chuc_vu,vai_tro,phan_xuong_id,lan_dang_nhap_ip) VALUES('real.user',?,'Tên Người Thật','Quản đốc','px',?,'10.20.30.40')")
        .run(bcrypt.hashSync('old-password', 8), unit1).lastInsertRowid);
    const insertAsset = source.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,don_vi_id,nguoi_quan_ly,ghi_chu) VALUES(?,? ,?,?,?,?)");
    insertAsset.run('REAL-ASSET-A', 'TSCD', 'Tài sản nguồn A', unit1, 'Tên Người Thật', 'Số điện thoại 0900000000');
    insertAsset.run('REAL-ASSET-B', 'CCDC', 'Tài sản nguồn B', unit2, 'Tên Người Thật', 'Thông tin nội bộ');
    source.prepare(`INSERT INTO asset_transactions
        (id,ma_giao_dich,loai,trang_thai,idempotency_key,ngay_hieu_luc,nguoi_tao_id,ly_do)
        VALUES('uat-history','REAL-HISTORY','TRANSFER','DRAFT','real-history','2026-09-01',?,'Tên Người Thật gọi 0900000000')`).run(realUser);
    source.close();
    const sourceHash = sha256File(sourceDb);

    const made = await createUatStaging({ sourceDb, targetDb, password, unitIds: [unit1, unit2] });
    check('Không sửa database nguồn', sha256File(sourceDb) === sourceHash && made.manifest.source_was_modified === false);
    check('Không sao chép uploads nhạy cảm', made.manifest.uploads_copied === false);
    check('Chọn đúng 2 PX cho UAT', made.manifest.selected_unit_ids.length === 2);
    check('Manifest không chứa mật khẩu UAT', !fs.readFileSync(made.manifestPath, 'utf8').includes(password));
    let refusedOverwrite = false;
    try { await createUatStaging({ sourceDb, targetDb, password }); } catch (error) { refusedOverwrite = /đã tồn tại/.test(error.message); }
    check('Không ghi đè database staging đã tồn tại', refusedOverwrite);
    let refusedSource = false;
    try { await createUatStaging({ sourceDb, targetDb: sourceDb, password }); } catch (error) { refusedSource = /khác database nguồn/.test(error.message); }
    check('Không cho dùng database nguồn làm đích UAT', refusedSource);
    const staged = new Database(targetDb);
    const expectedMigrations = fs.readdirSync(path.join(__dirname, '..', 'db')).filter(x => /^\d+.*\.sql$/.test(x)).length;
    check(`Đủ ${expectedMigrations} migration trên staging`, staged.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n === expectedMigrations);
    check('Tài khoản nguồn bị ẩn danh và vô hiệu hóa', !staged.prepare("SELECT 1 FROM nguoi_dung WHERE ten_dang_nhap='real.user' OR ho_ten='Tên Người Thật'").get() &&
        staged.prepare("SELECT COUNT(*) n FROM nguoi_dung WHERE ten_dang_nhap LIKE 'uat_legacy_%' AND hoat_dong=0").get().n === 1);
    check('Thông tin người/IP/ghi chú đã được xóa hoặc thay thế', !staged.prepare("SELECT 1 FROM assets WHERE nguoi_quan_ly='Tên Người Thật' OR ghi_chu LIKE '%0900000000%'").get() &&
        staged.prepare('SELECT COUNT(*) n FROM nguoi_dung WHERE lan_dang_nhap_ip IS NOT NULL').get().n === 0 &&
        staged.prepare("SELECT ly_do FROM asset_transactions WHERE id='uat-history'").get().ly_do === '[UAT REDACTED]');
    const triggerCount = staged.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n;
    check('Trigger bảo vệ được phục hồi sau ẩn danh', triggerCount > 0);
    check('Chỉ tài khoản UAT mới được hoạt động', staged.prepare("SELECT COUNT(*) n FROM nguoi_dung WHERE hoat_dong=1 AND ten_dang_nhap NOT LIKE 'uat_%'").get().n === 0);
    staged.close();

    process.env.NODE_ENV = 'test';
    process.env.QLCD_DB = targetDb;
    process.env.QLCD_UPLOAD = path.join(temp, 'uploads');
    fs.mkdirSync(process.env.QLCD_UPLOAD, { recursive: true });
    const app = require('../server');
    const db = require('../db');
    const { runUatAcceptance } = require('../lib/uat-runner');
    const evidence = await runUatAcceptance({ app, db, password, manifest: made.manifest });
    evidence.checks.forEach(item => check(`${item.code} ${item.name}`, item.passed, item.detail || ''));
    check('Technical UAT đạt nhưng không giả mạo ký duyệt nghiệp vụ', evidence.technical_status === 'PASSED' && evidence.business_signoff.status === 'PENDING');
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed + failed} test =====`);
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
