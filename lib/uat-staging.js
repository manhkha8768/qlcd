const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const MIGRATION_PATTERN = /^\d+.*\.sql$/;
const REDACTED = '[UAT REDACTED]';
const CLEARED_TABLES = [
    'phien_dang_nhap', 'dang_nhap_that_bai', 'truy_cap_bi_chan',
    'document_access_log', 'report_export_runs', 'operational_error_events'
];
const DIRECT_REDACT = new Set([
    'ho_ten', 'chuc_vu', 'quan_doc', 'co_dien_truong', 'nguoi_giao', 'nguoi_nhan',
    'nguoi_quan_ly', 'nguoi_phu_trach', 'nguoi_thuc_hien', 'nguoi_bao',
    'chu_nhiem', 'receiver_name', 'ten_don_vi_ngoai', 'don_vi_thuc_hien'
]);

function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function assertSeparate(source, target) {
    if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) {
        throw new Error('Database staging phải khác database nguồn');
    }
}
function removeDatabaseFiles(file) {
    [file, `${file}-wal`, `${file}-shm`].forEach(item => {
        try { fs.rmSync(item, { force: true }); } catch (_) {}
    });
}
function tableExists(db, table) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}
function columns(db, table) { return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all(); }
function suspendTriggers(db) {
    const triggers = db.prepare(`SELECT name,sql FROM sqlite_master
        WHERE type='trigger' AND sql IS NOT NULL ORDER BY name`).all();
    triggers.forEach(trigger => db.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`));
    return () => triggers.forEach(trigger => db.exec(trigger.sql));
}

function applyMigrations(db, migrationsDir = path.join(__dirname, '..', 'db')) {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        ten_file TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        ngay_ap_dung TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    const files = fs.readdirSync(migrationsDir).filter(file => MIGRATION_PATTERN.test(file)).sort();
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const applied = db.prepare('SELECT checksum_sha256 FROM schema_migrations WHERE ten_file=?').get(file);
        if (applied) {
            if (applied.checksum_sha256 !== checksum) throw new Error(`Migration đã bị thay đổi: ${file}`);
            continue;
        }
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations(ten_file,checksum_sha256) VALUES(?,?)').run(file, checksum);
    }
    return files.length;
}

function seedSyntheticUnits(db) {
    const ids = [];
    for (let index = 1; index <= 2; index++) {
        ids.push(Number(db.prepare(`INSERT INTO phan_xuong(ma,ten,ten_ngan,loai)
            VALUES(?,?,?,'san_xuat')`).run(`PX-UAT-${String(index).padStart(2, '0')}`,
            `Phân xưởng UAT ${index}`, `PX UAT ${index}`).lastInsertRowid));
    }
    ids.forEach((unitId, index) => db.prepare(`INSERT INTO assets
        (ma_tai_san,loai_tai_san,ten,dvt,so_luong,nguyen_gia,gia_tri_con_lai,don_vi_id,trang_thai)
        VALUES(?,?,?,'Cái',1,1000000,800000,?,'dang_su_dung')`)
        .run(`UAT-ASSET-${index + 1}`, index ? 'CCDC' : 'TSCD', `Tài sản UAT ${index + 1}`, unitId));
    return ids;
}

function scrubTextColumns(db) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for (const { name: table } of tables) {
        if (table === 'schema_migrations' || table === 'nguoi_dung' || table === 'phan_xuong') continue;
        for (const column of columns(db, table)) {
            const name = column.name.toLowerCase();
            if (!/TEXT/i.test(column.type || '')) continue;
            let replacement = null;
            if (DIRECT_REDACT.has(name) || /(^|_)(email|dien_thoai|so_dien_thoai)$/.test(name)) replacement = REDACTED;
            else if (/ip_address|dia_chi_ip|ip_dia_chi|lan_dang_nhap_ip|user_agent|trinh_duyet/.test(name)) replacement = null;
            else if (/du_lieu_goc/.test(name)) replacement = REDACTED;
            else if (/(^|_)(ghi_chu|note|reason|ly_do|mo_ta|description|resolution_note|review_note)$/.test(name)) replacement = REDACTED;
            else if (/(_json|json_)$/.test(name) || /(_json)$/.test(name)) replacement = '{}';
            else if (/^(duong_dan|object_key|original_filename|ten_file)$/.test(name)) replacement = '[UAT FILE REMOVED]';
            else continue;
            const sql = `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column.name)}=? WHERE ${quoteIdentifier(column.name)} IS NOT NULL`;
            db.prepare(sql).run(replacement);
        }
    }
}

function anonymizeUnits(db) {
    const rows = db.prepare('SELECT id FROM phan_xuong ORDER BY id').all();
    const temporary = db.prepare('UPDATE phan_xuong SET ma=? WHERE id=?');
    rows.forEach(row => temporary.run(`__UAT_UNIT_${row.id}_${crypto.randomBytes(4).toString('hex')}`, row.id));
    const update = db.prepare(`UPDATE phan_xuong SET ma=?,ten=?,ten_ngan=?,quan_doc=NULL,co_dien_truong=NULL WHERE id=?`);
    rows.forEach((row, index) => {
        const number = String(index + 1).padStart(2, '0');
        update.run(`PX-UAT-${number}`, `Phân xưởng UAT ${index + 1}`, `PX UAT ${index + 1}`, row.id);
    });
}

function anonymizeExistingUsers(db, disabledHash) {
    const rows = db.prepare('SELECT id FROM nguoi_dung ORDER BY id').all();
    const temporary = db.prepare('UPDATE nguoi_dung SET ten_dang_nhap=? WHERE id=?');
    rows.forEach(row => temporary.run(`__uat_user_${row.id}_${crypto.randomBytes(4).toString('hex')}`, row.id));
    const update = db.prepare(`UPDATE nguoi_dung SET ten_dang_nhap=?,mat_khau_hash=?,ho_ten=?,chuc_vu=?,
        hoat_dong=0,tam_thoi=0,het_han=NULL,lan_dang_nhap=NULL,lan_dang_nhap_ip=NULL,
        phai_doi_mat_khau=1,ngay_doi_mat_khau=NULL WHERE id=?`);
    rows.forEach(row => update.run(`uat_legacy_${row.id}`, disabledHash,
        `Người dùng đã ẩn danh ${row.id}`, 'Tài khoản nguồn đã vô hiệu hóa', row.id));
}

function createUatUsers(db, unitIds, passwordHash) {
    const insert = db.prepare(`INSERT INTO nguoi_dung
        (ten_dang_nhap,mat_khau_hash,ho_ten,chuc_vu,vai_tro,phan_xuong_id,hoat_dong,phai_doi_mat_khau)
        VALUES(?,?,?,?,?,?,1,0)`);
    const users = [
        ['uat_admin', 'Quản trị UAT', 'UAT', 'admin', null],
        ['uat_cdcty', 'Cơ điện Công ty UAT', 'UAT', 'cd_cty', null]
    ];
    unitIds.forEach((id, index) => users.push([
        `uat_px${String(index + 1).padStart(2, '0')}`, `Người dùng PX UAT ${index + 1}`, 'UAT', 'px', id
    ]));
    const ids = [];
    for (const user of users) ids.push(Number(insert.run(
        user[0], passwordHash, user[1], user[2], user[3], user[4]).lastInsertRowid));
    const assignment = db.prepare(`INSERT OR IGNORE INTO nguoi_dung_don_vi
        (nguoi_dung_id,don_vi_id,loai_phan_cong) VALUES(?,?,'thanh_vien')`);
    unitIds.forEach((unitId, index) => assignment.run(ids[index + 2], unitId));
    return users.map((user, index) => ({ id: ids[index], username: user[0], role: user[3], unit_id: user[4] }));
}

function validateSanitized(db, originalUsernames) {
    const quick = db.pragma('quick_check', { simple: true });
    const foreignKeys = db.pragma('foreign_key_check');
    const activeNonUat = db.prepare("SELECT COUNT(*) n FROM nguoi_dung WHERE hoat_dong=1 AND ten_dang_nhap NOT LIKE 'uat_%'").get().n;
    const leakedUsername = originalUsernames.some(username => username &&
        db.prepare('SELECT 1 FROM nguoi_dung WHERE ten_dang_nhap=?').get(username));
    let networkIdentifiers = 0;
    for (const table of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
        for (const column of columns(db, table.name).filter(item => /ip_address|dia_chi_ip|ip_dia_chi|lan_dang_nhap_ip|user_agent|trinh_duyet/.test(item.name))) {
            networkIdentifiers += db.prepare(`SELECT COUNT(*) n FROM ${quoteIdentifier(table.name)} WHERE ${quoteIdentifier(column.name)} IS NOT NULL`).get().n;
        }
    }
    if (quick !== 'ok' || foreignKeys.length || activeNonUat || leakedUsername || networkIdentifiers) {
        throw new Error('Bản staging không đạt kiểm tra toàn vẹn/ẩn danh');
    }
    return { quick_check: quick, foreign_key_violations: foreignKeys.length,
        active_non_uat_users: activeNonUat, network_identifiers: networkIdentifiers };
}

async function createUatStaging(options) {
    const sourceDb = path.resolve(options.sourceDb || '');
    const targetDb = path.resolve(options.targetDb || '');
    const password = String(options.password || '');
    if (!fs.existsSync(sourceDb)) throw new Error('Không tìm thấy database nguồn');
    if (!targetDb || targetDb === path.parse(targetDb).root) throw new Error('Đường dẫn database staging không hợp lệ');
    if (password.length < 12) throw new Error('QLCD_UAT_PASSWORD phải có ít nhất 12 ký tự');
    assertSeparate(sourceDb, targetDb);
    if (fs.existsSync(targetDb)) throw new Error('Database staging đã tồn tại; không tự ghi đè');
    fs.mkdirSync(path.dirname(targetDb), { recursive: true });

    const sourceHashBefore = sha256File(sourceDb);
    const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
    try { await source.backup(targetDb); } finally { source.close(); }
    const target = new Database(targetDb);
    let result;
    try {
        target.pragma('foreign_keys = ON');
        target.pragma('journal_mode = WAL');
        const migrationCount = applyMigrations(target, options.migrationsDir);
        const originalUsernames = target.prepare('SELECT ten_dang_nhap FROM nguoi_dung').all().map(row => row.ten_dang_nhap);
        const passwordHash = bcrypt.hashSync(password, 10);
        const disabledHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
        target.transaction(() => {
            const restoreTriggers = suspendTriggers(target);
            CLEARED_TABLES.filter(table => tableExists(target, table)).forEach(table => target.exec(`DELETE FROM ${quoteIdentifier(table)}`));
            scrubTextColumns(target);
            anonymizeUnits(target);
            anonymizeExistingUsers(target, disabledHash);
            const requestedUnits = [...new Set((options.unitIds || []).map(Number).filter(Number.isInteger))];
            if (requestedUnits.length > 2) throw new Error('UAT chỉ được chọn tối đa 2 PX');
            let unitIds = requestedUnits.length ? requestedUnits :
                target.prepare('SELECT id FROM phan_xuong WHERE hoat_dong=1 ORDER BY id LIMIT ?').all(options.unitLimit || 2).map(row => Number(row.id));
            if (!unitIds.length && options.allowSynthetic) unitIds = seedSyntheticUnits(target);
            if (!unitIds.length) throw new Error('Database nguồn không có PX để UAT');
            if (unitIds.some(id => !target.prepare('SELECT 1 FROM phan_xuong WHERE id=? AND hoat_dong=1').get(id))) {
                throw new Error('PX được chọn không tồn tại hoặc đã ngừng hoạt động');
            }
            const users = createUatUsers(target, unitIds.slice(0, 2), passwordHash);
            restoreTriggers();
            result = { migration_count: migrationCount, selected_unit_ids: unitIds.slice(0, 2), users };
        })();
        const validation = validateSanitized(target, originalUsernames);
        result.validation = validation;
        result.counts = {
            units: target.prepare('SELECT COUNT(*) n FROM phan_xuong').get().n,
            assets: target.prepare('SELECT COUNT(*) n FROM assets').get().n,
            devices: target.prepare('SELECT COUNT(*) n FROM devices').get().n,
            materials: target.prepare('SELECT COUNT(*) n FROM materials').get().n
        };
    } catch (error) {
        try { target.close(); } catch (_) {}
        removeDatabaseFiles(targetDb);
        throw error;
    }
    target.pragma('wal_checkpoint(TRUNCATE)');
    target.close();
    if (sha256File(sourceDb) !== sourceHashBefore) throw new Error('Database nguồn đã thay đổi ngoài dự kiến');
    const manifest = {
        format: 'QLCD_UAT_STAGING_V1', created_at: new Date().toISOString(),
        source_sha256: sourceHashBefore, staging_sha256: sha256File(targetDb),
        source_was_modified: false, uploads_copied: false, ...result,
        business_signoff: { status: 'PENDING', required_roles: ['PX', 'CĐVT Công ty', 'Quản trị hệ thống'] }
    };
    const manifestPath = `${targetDb}.manifest.json`;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { targetDb, manifestPath, manifest };
}

module.exports = { applyMigrations, createUatStaging, validateSanitized, sha256File };
