const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const db = require('../db');
const storage = require('./document-storage');

function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(root, current = root) {
    if (!fs.existsSync(current)) return [];
    return fs.readdirSync(current, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(current, entry.name);
        return entry.isDirectory() ? listFiles(root, full) : [path.relative(root, full).replaceAll('\\', '/')];
    });
}
function assertChild(parent, child) {
    if (!path.resolve(child).startsWith(path.resolve(parent) + path.sep)) {
        throw new Error('Đường dẫn backup nằm ngoài thư mục cho phép');
    }
}

async function createBackup(destination, { retention = 30, now = new Date() } = {}) {
    const root = path.resolve(destination);
    fs.mkdirSync(root, { recursive: true });
    const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    let folder = path.join(root, `qlcd-${stamp}`), suffix = 1;
    while (fs.existsSync(folder)) folder = path.join(root, `qlcd-${stamp}-${suffix++}`);
    assertChild(root, folder); fs.mkdirSync(folder);
    const dbFile = path.join(folder, 'qlcd.db');
    await db.backup(dbFile);
    const uploadTarget = path.join(folder, 'uploads');
    if (fs.existsSync(storage.uploadsRoot)) fs.cpSync(storage.uploadsRoot, uploadTarget, { recursive: true });
    const files = listFiles(folder).filter(x => x !== 'manifest.json').map(relative => {
        const file = path.join(folder, ...relative.split('/'));
        return { path: relative, size: fs.statSync(file).size, sha256: hashFile(file) };
    });
    const manifest = { format: 'QLCD_BACKUP_V1', created_at: now.toISOString(), files };
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
    if (Number.isInteger(retention) && retention > 0) {
        const folders = fs.readdirSync(root, { withFileTypes: true })
          .filter(x => x.isDirectory() && /^qlcd-\d{4}-\d{2}-\d{2}/.test(x.name)).map(x => x.name).sort();
        for (const name of folders.slice(0, Math.max(0, folders.length - retention))) {
            const old = path.join(root, name); assertChild(root, old); fs.rmSync(old, { recursive: true, force: true });
        }
    }
    return { folder, manifest };
}

function verifyBackup(folder) {
    const root = path.resolve(folder), manifestPath = path.join(root, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('Backup thiếu manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== 'QLCD_BACKUP_V1' || !Array.isArray(manifest.files)) throw new Error('Manifest backup không hợp lệ');
    for (const item of manifest.files) {
        const file = path.resolve(root, ...String(item.path).split('/'));
        assertChild(root, file);
        if (!fs.existsSync(file) || fs.statSync(file).size !== item.size || hashFile(file) !== item.sha256) {
            throw new Error(`File backup sai checksum: ${item.path}`);
        }
    }
    const restoredDb = new Database(path.join(root, 'qlcd.db'), { readonly: true, fileMustExist: true });
    try {
        const quick = restoredDb.pragma('quick_check', { simple: true });
        const foreignKeys = restoredDb.pragma('foreign_key_check');
        const migrations = restoredDb.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
        if (quick !== 'ok' || foreignKeys.length) throw new Error('Database backup không toàn vẹn');
        return { ok: true, files: manifest.files.length, migrations, database_sha256: hashFile(path.join(root, 'qlcd.db')) };
    } finally { restoredDb.close(); }
}

function restoreDrill(folder) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-restore-drill-'));
    try { const copy = path.join(temp, 'restored'); fs.cpSync(path.resolve(folder), copy, { recursive: true }); return verifyBackup(copy); }
    finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

module.exports = { createBackup, verifyBackup, restoreDrill, hashFile, listFiles };
