const fs = require('fs');
const path = require('path');

const database = process.env.QLCD_UAT_DB;
const password = process.env.QLCD_UAT_PASSWORD;
if (!database || !password) {
    console.error('Bắt buộc cấu hình QLCD_UAT_DB và QLCD_UAT_PASSWORD');
    process.exit(1);
}
const resolved = path.resolve(database);
const manifestPath = `${resolved}.manifest.json`;
if (!fs.existsSync(resolved) || !fs.existsSync(manifestPath)) {
    console.error('Thiếu database staging hoặc manifest ẩn danh');
    process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.format !== 'QLCD_UAT_STAGING_V1' || manifest.source_was_modified !== false) {
    console.error('Manifest staging không hợp lệ');
    process.exit(1);
}
process.env.NODE_ENV = 'test';
process.env.QLCD_DB = resolved;
process.env.QLCD_UPLOAD = process.env.QLCD_UAT_UPLOAD || path.join(path.dirname(resolved), 'uploads');
fs.mkdirSync(process.env.QLCD_UPLOAD, { recursive: true });

const app = require('../server');
const db = require('../db');
const { runUatAcceptance } = require('../lib/uat-runner');
const evidencePath = process.env.QLCD_UAT_EVIDENCE || `${resolved}.evidence.json`;
runUatAcceptance({ app, db, password, manifest, evidencePath }).then(evidence => {
    console.log(JSON.stringify({ ...evidence, checks: undefined, evidence_path: evidencePath }, null, 2));
    db.close();
    process.exit(evidence.failed ? 1 : 0);
}).catch(error => { console.error(error); try { db.close(); } catch (_) {} process.exit(1); });
