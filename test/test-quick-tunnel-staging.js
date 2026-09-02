const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveStagingConfig, parseQuickTunnelUrl, createEvidence } = require('../lib/quick-tunnel-staging');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-quick-tunnel-'));
const valid = {
    QLCD_STAGING_SECRET: 's'.repeat(32),
    QLCD_STAGING_DB: path.join(root, 'staging', 'qlcd.db'),
    QLCD_STAGING_UPLOAD: path.join(root, 'staging', 'uploads'),
    QLCD_STAGING_BACKUP_DIR: path.join(root, 'staging', 'backups')
};
fs.mkdirSync(path.dirname(valid.QLCD_STAGING_DB), { recursive: true });
fs.writeFileSync(valid.QLCD_STAGING_DB, '');

assert.throws(() => resolveStagingConfig({}, root), /QLCD_STAGING_SECRET/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_SECRET: 'short' }, root), /32/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_DB: valid.QLCD_STAGING_DB }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_UPLOAD: valid.QLCD_STAGING_UPLOAD }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_BACKUP_DIR: valid.QLCD_STAGING_BACKUP_DIR }, root), /production/);
assert.equal(resolveStagingConfig(valid, root).port, 32121);
assert.equal(resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '4567' }, root).port, 4567);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '1023' }, root), /port/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '65536' }, root), /port/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_DB: path.join(root, 'missing.db') }, root), /file/);

assert.equal(parseQuickTunnelUrl('Visit https://blue-tree.trycloudflare.com now'), 'https://blue-tree.trycloudflare.com');
assert.equal(parseQuickTunnelUrl('https://example.com'), null);
assert.equal(parseQuickTunnelUrl('http://blue-tree.trycloudflare.com'), null);
assert.equal(parseQuickTunnelUrl('https://-bad.trycloudflare.com'), null);
assert.equal(parseQuickTunnelUrl('https://a'.concat('x'.repeat(63), '.trycloudflare.com')), null);

const url = 'https://blue-tree.trycloudflare.com';
const evidence = createEvidence({ url, commit: 'abc123', readiness: 200, createdAt: '2026-09-02T00:00:00.000Z' });
assert.equal(evidence.format, 'QLCD_QUICK_TUNNEL_STAGING_V1');
assert.equal(evidence.status, 'TEMPORARY_STAGING');
assert.equal(evidence.temporary, true);
assert.equal(evidence.url, url);
assert.equal(evidence.commit, 'abc123');
assert.equal(evidence.readiness, 200);
assert.equal(evidence.created_at, '2026-09-02T00:00:00.000Z');
assert.equal(evidence.task_status, 'PARTIAL');
assert.equal(JSON.stringify(evidence).includes('secret'), false);
assert.equal(evidence.business_signoff.status, 'PENDING');

console.log('quick tunnel staging tests passed');
