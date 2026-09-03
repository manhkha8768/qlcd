const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveStagingConfig, finalizeStagingConfig, parseQuickTunnelUrl, createEvidence, createController } = require('../lib/quick-tunnel-staging');
const { main: runCli, createDependencies, runProgram } = require('../scripts/quick-tunnel-staging');

function assertIgnored(dockerIgnore, entry) {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(dockerIgnore, new RegExp(`^${escaped}$`, 'm'), `Docker context must exclude ${entry}`);
}

const projectRoot = path.resolve(__dirname, '..');
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-quick-tunnel-'));
const root = path.join(sandboxRoot, 'checkout');
const externalStagingRoot = path.join(sandboxRoot, 'staging-data');
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(externalStagingRoot, { recursive: true });

const valid = {
    QLCD_STAGING_SECRET: 's'.repeat(32),
    QLCD_STAGING_DB: path.join(externalStagingRoot, 'database', 'qlcd.db'),
    QLCD_STAGING_UPLOAD: path.join(externalStagingRoot, 'uploads'),
    QLCD_STAGING_BACKUP_DIR: path.join(externalStagingRoot, 'backups')
};
fs.mkdirSync(path.dirname(valid.QLCD_STAGING_DB), { recursive: true });
fs.writeFileSync(valid.QLCD_STAGING_DB, '');

const contextLocalPaths = {
    QLCD_STAGING_DB: path.join(root, 'arbitrary-data', 'live.records'),
    QLCD_STAGING_UPLOAD: path.join(root, 'anything', 'incoming-files'),
    QLCD_STAGING_BACKUP_DIR: path.join(root, 'custom-name', 'snapshots')
};
fs.mkdirSync(path.dirname(contextLocalPaths.QLCD_STAGING_DB), { recursive: true });
fs.writeFileSync(contextLocalPaths.QLCD_STAGING_DB, '');
for (const [name, contextLocalPath] of Object.entries(contextLocalPaths)) {
    assert.throws(
        () => resolveStagingConfig({ ...valid, [name]: contextLocalPath }, root),
        /outside.*build context/i,
        `${name} must reject arbitrary paths inside the Docker build context`
    );
}
assert.equal(resolveStagingConfig(valid, root).dbPath, valid.QLCD_STAGING_DB);

const dockerIgnore = fs.readFileSync(path.join(projectRoot, '.dockerignore'), 'utf8');
const dockerIgnoreEntries = dockerIgnore.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
assert.equal(dockerIgnoreEntries.includes('db/'), false, 'Docker context must retain the required db/ application source');
for (const entry of [
    '.env.staging.local', '*.db', '*.db-*', '*.sqlite', '*.sqlite-*', '*.sqlite3', '*.sqlite3-*',
    'uploads/', 'sao-luu/', 'uat-output/', 'quick-tunnel-output/'
]) {
    assertIgnored(dockerIgnore, entry);
}
for (const requiredSource of ['db/index.js', 'db/init.js', 'db/01-schema.sql', 'db/37-production-readiness.sql']) {
    assert.equal(fs.existsSync(path.join(projectRoot, requiredSource)), true, `${requiredSource} must remain in the application source contract`);
}
const numberedMigrations = fs.readdirSync(path.join(projectRoot, 'db')).filter(name => /^\d{2}-.+\.sql$/.test(name));
assert.ok(numberedMigrations.length >= 37, 'numbered SQL migrations must remain in the application source contract');

const composePath = path.join(__dirname, '..', 'docker-compose.staging.yml');
const compose = fs.existsSync(composePath) ? fs.readFileSync(composePath, 'utf8') : '';
assert.match(compose, /127\.0\.0\.1:\$\{QLCD_STAGING_PORT:-32121\}:3000/);
assert.match(compose, /image:\s*\$\{QLCD_STAGING_IMAGE:\?[^}]+\}/);
assert.doesNotMatch(compose, /^\s*build:/m, 'Compose must never build from the repository checkout');
assert.doesNotMatch(compose, /context:\s*\./, 'Compose must not expose the repository as a Docker build context');
assert.match(compose, /cloudflare\/cloudflared:2026\.8\.3/);
assert.match(compose, /tunnel --no-autoupdate --url http:\/\/qlcd-staging:3000/);
assert.doesNotMatch(compose, /0\.0\.0\.0:/);
assert.doesNotMatch(compose, /down -v/);
assert.match(compose, /read_only:\s*true/);
assert.match(compose, /cap_drop:\s*\[ALL\]/);
assert.match(compose, /no-new-privileges:\s*true/);
assert.doesNotMatch(compose, /type:\s*bind/);
assert.doesNotMatch(compose, /source:\s*\$\{QLCD_STAGING_/);
for (const volume of ['qlcd-staging-db', 'qlcd-staging-uploads', 'qlcd-staging-backups']) assert.match(compose, new RegExp(volume));

assert.throws(() => resolveStagingConfig({}, root), /QLCD_STAGING_SECRET/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_SECRET: 'short' }, root), /32/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_DB: valid.QLCD_STAGING_DB }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_UPLOAD: valid.QLCD_STAGING_UPLOAD }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_BACKUP_DIR: valid.QLCD_STAGING_BACKUP_DIR }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_BACKUP_DIR: valid.QLCD_STAGING_UPLOAD }, root), /isolated/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_UPLOAD: valid.QLCD_STAGING_DB }, root), /isolated/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_BACKUP_DIR: valid.QLCD_STAGING_DB }, root), /isolated/);
for (const stagingName of ['QLCD_STAGING_DB', 'QLCD_STAGING_UPLOAD', 'QLCD_STAGING_BACKUP_DIR']) {
    for (const productionName of ['QLCD_DB', 'QLCD_UPLOAD', 'QLCD_UPLOADS', 'QLCD_BACKUP_DIR']) {
        assert.throws(
            () => resolveStagingConfig({ ...valid, [productionName]: valid[stagingName] }, root),
            /production/,
            `${stagingName} must not collide with ${productionName}`
        );
    }
}
assert.equal(resolveStagingConfig(valid, root).port, 32121);
assert.equal(resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '4567' }, root).port, 4567);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '1023' }, root), /port/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_PORT: '65536' }, root), /port/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_DB: path.join(externalStagingRoot, 'missing.db') }, root), /file/);

const finalized = finalizeStagingConfig(resolveStagingConfig(valid, root), root);
assert.equal(finalized.dbPath, fs.realpathSync(valid.QLCD_STAGING_DB));
assert.equal(fs.existsSync(finalized.dbSnapshotPath), true);
assert.equal(finalized.uploadPath, fs.realpathSync(valid.QLCD_STAGING_UPLOAD));
assert.equal(finalized.backupPath, fs.realpathSync(valid.QLCD_STAGING_BACKUP_DIR));

const insideTarget = path.join(root, 'physical-inside');
const externalAliasToInside = path.join(externalStagingRoot, 'alias-to-checkout');
fs.mkdirSync(insideTarget, { recursive: true });
try {
    fs.symlinkSync(insideTarget, externalAliasToInside, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
        () => resolveStagingConfig({ ...valid, QLCD_STAGING_UPLOAD: path.join(externalAliasToInside, 'uploads') }, root),
        /outside.*build context/i,
        'physical containment must reject an external alias that resolves into the build context'
    );
} catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'UNKNOWN'].includes(error.code)) throw error;
}

const retargetAlias = path.join(externalStagingRoot, 'retarget-alias');
const safeAliasTarget = path.join(externalStagingRoot, 'safe-alias-target');
fs.mkdirSync(safeAliasTarget, { recursive: true });
try {
    fs.symlinkSync(safeAliasTarget, retargetAlias, process.platform === 'win32' ? 'junction' : 'dir');
    const beforeRetarget = resolveStagingConfig({ ...valid, QLCD_STAGING_UPLOAD: path.join(retargetAlias, 'uploads') }, root);
    fs.rmSync(retargetAlias);
    fs.symlinkSync(insideTarget, retargetAlias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
        () => finalizeStagingConfig(beforeRetarget, root),
        /outside.*build context/i,
        'final physical resolution must catch an alias retargeted after initial validation'
    );
} catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'UNKNOWN'].includes(error.code)) throw error;
}

assert.equal(parseQuickTunnelUrl('Visit https://blue-tree.trycloudflare.com now'), 'https://blue-tree.trycloudflare.com');
assert.equal(parseQuickTunnelUrl('https://example.com'), null);
assert.equal(parseQuickTunnelUrl('http://blue-tree.trycloudflare.com'), null);
assert.equal(parseQuickTunnelUrl('https://blue-tree.trycloudflare.com.evil'), null);
assert.equal(parseQuickTunnelUrl('https://blue-tree.trycloudflare.com@evil'), null);
assert.equal(parseQuickTunnelUrl('https://blue-tree.trycloudflare.com%40evil'), null);
assert.equal(parseQuickTunnelUrl('https://blue-tree.trycloudflare.com:443'), null);
assert.equal(parseQuickTunnelUrl('https://user:pass@blue-tree.trycloudflare.com'), null);
assert.equal(parseQuickTunnelUrl('https://-bad.trycloudflare.com'), null);
assert.equal(parseQuickTunnelUrl('https://a'.concat('x'.repeat(63), '.trycloudflare.com')), null);
assert.equal(
    parseQuickTunnelUrl('old https://old-tree.trycloudflare.com\nnew https://new-tree.trycloudflare.com'),
    'https://new-tree.trycloudflare.com'
);
for (const punctuation of ['.', ',', ';', '!', '?', ')', ']', '}']) {
    assert.equal(
        parseQuickTunnelUrl(`Tunnel available at https://blue-tree.trycloudflare.com${punctuation}`),
        'https://blue-tree.trycloudflare.com',
        `Quick Tunnel URL must tolerate trailing ${punctuation}`
    );
}

async function lifecycleTests() {
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

    const immutableBuildCalls = [];
    const immutableDependencies = createDependencies(projectRoot, {
        environment: process.env,
        runProgramImpl: async (command, args, childCwd, childEnvironment, commandOptions) => {
            immutableBuildCalls.push({ command, args, childCwd, childEnvironment, commandOptions });
            if (command === 'docker' && args[0] === 'image') return `sha256:${'a'.repeat(64)}\n`;
            return '';
        }
    });
    const immutableImage = await immutableDependencies.buildImage({ config: {} });
    assert.equal(immutableImage, `sha256:${'a'.repeat(64)}`);
    assert.deepEqual(immutableBuildCalls[0].args.slice(0, 3), ['-c', `safe.directory=${projectRoot}`, 'diff']);
    assert.deepEqual(immutableBuildCalls[1].args.slice(0, 5), [
        '-c', `safe.directory=${projectRoot}`, '-c', 'core.autocrlf=false', 'archive'
    ]);
    const capturedCommit = immutableBuildCalls[0].args[4];
    assert.match(capturedCommit, /^[0-9a-f]{40}$/);
    assert.equal(immutableBuildCalls[1].args.at(-1), capturedCommit, 'archive must use the captured commit, not symbolic HEAD');
    assert.deepEqual(immutableBuildCalls.map(call => call.command), ['git', 'git', 'tar', 'docker', 'docker']);
    assert.deepEqual(immutableBuildCalls[2].args.slice(0, 3), ['-xf', immutableBuildCalls[2].args[1], '-C']);
    assert.deepEqual(immutableBuildCalls[3].args.slice(0, 3), ['build', '--pull', '--tag']);
    assert.deepEqual(immutableBuildCalls[4].args.slice(0, 3), ['image', 'inspect', '--format']);
    const dockerBuildContext = immutableBuildCalls[3].args.at(-1);
    assert.notEqual(path.relative(projectRoot, dockerBuildContext).split(path.sep)[0], '', 'Docker build context must not be the checkout');
    assert.ok(path.relative(projectRoot, dockerBuildContext).startsWith('..'), 'Docker build context must be outside the checkout');

    const seedCalls = [];
    const seedDependencies = createDependencies(projectRoot, {
        environment: process.env,
        runProgramImpl: async (command, args) => {
            seedCalls.push({ command, args });
            if (args[0] === 'run' && args.some(arg => String(arg).includes('echo DIRTY; else echo EMPTY'))) return 'EMPTY\n';
            return '';
        }
    });
    await seedDependencies.seedData({ config: { ...finalized, image: `sha256:${'a'.repeat(64)}` } });
    assert.equal(seedCalls.length, 3, 'empty named volumes require a fail-closed state check, database snapshot copy, and atomic finalization');
    assert.ok(seedCalls.every(call => call.command === 'docker'));
    assert.equal(seedCalls.some(call => call.args.includes('--volume') || call.args.includes('-v')), false, 'host data must never be bind-mounted');
    assert.ok(seedCalls.some(call => call.args[0] === 'cp' && call.args[2] === 'qlcd-staging:/data/db/qlcd.db'));
    assert.equal(seedCalls.some(call => call.args.includes(finalized.dbPath)), false, 'Docker must receive the private snapshot path, not the validated source pathname');

    const dirtySeedDependencies = createDependencies(projectRoot, {
        environment: process.env,
        runProgramImpl: async () => 'DIRTY\n'
    });
    await assert.rejects(
        () => dirtySeedDependencies.seedData({ config: { ...finalized, image: `sha256:${'b'.repeat(64)}` } }),
        /refusing to overwrite/i,
        'an uncertain or partially initialized volume must fail closed'
    );

    let buildReached = false;
    await assert.rejects(
        () => runCli(['node', 'quick-tunnel-staging.js', 'start'], {
            cwd: root,
            environment: { ...valid, QLCD_STAGING_DB: contextLocalPaths.QLCD_STAGING_DB },
            dependencies: {
                runPreflight: async () => {},
                runCompose: async request => { if (request.action === 'build') buildReached = true; },
                fetchImpl: async () => ({ status: 200 }), readLogs: async () => '', writeEvidence: async () => {}
            }
        }),
        /outside.*build context/i
    );
    assert.equal(buildReached, false, 'unsafe context-local data must be rejected before Docker build');

    const config = {
        secret: 's'.repeat(32), port: 32121, uploadPath: path.join(root, 'run', 'uploads'),
        backupPath: path.join(root, 'run', 'backups'), evidencePath: path.join(root, 'run', 'evidence.json')
    };
    const calls = [];
    const controller = createController({
        runPreflight: async () => { calls.push({ action: 'preflight' }); },
        buildImage: async () => { calls.push({ action: 'image-build' }); return 'qlcd-staging:abc123'; },
        finalizeConfig: async current => { calls.push({ action: 'finalize' }); return { ...current, image: 'qlcd-staging:abc123' }; },
        seedData: async () => { calls.push({ action: 'seed-data' }); },
        runCompose: async request => { calls.push({ action: request.action, args: request.args || [] }); return ''; },
        fetchImpl: async (requestUrl, requestOptions) => {
            calls.push({ action: requestUrl.startsWith('http://127.0.0.1') ? 'local-ready' : 'remote-ready', requestUrl, requestOptions });
            return { status: 200 };
        },
        readLogs: async () => { calls.push({ action: 'logs' }); return `INF Your quick Tunnel has been created! Visit it at ${url}`; },
        writeEvidence: async (evidencePath, item) => { calls.push({ action: 'evidence', evidencePath, item }); },
        now: () => Date.parse('2026-09-02T00:00:00.000Z'),
        commit: 'abc123',
        sleep: async () => {}
    });
    const started = await controller.start(config);
    assert.equal(started.url, url);
    assert.deepEqual(calls.map(item => item.action), ['preflight', 'prepare', 'image-build', 'config', 'app-create', 'finalize', 'seed-data', 'app-start', 'local-ready', 'tunnel-up', 'logs', 'remote-ready', 'evidence']);
    assert.deepEqual(calls.find(item => item.action === 'app-create').args, ['create', '--force-recreate', 'qlcd-staging']);
    assert.deepEqual(calls.find(item => item.action === 'app-start').args, ['start', 'qlcd-staging']);
    assert.deepEqual(calls.find(item => item.action === 'tunnel-up').args, ['up', '-d', '--force-recreate', 'cloudflared-staging']);
    assert.equal(calls.at(-1).evidencePath, config.evidencePath);
    assert.equal(calls.at(-1).item.status, 'TEMPORARY_STAGING');
    assert.equal(JSON.stringify(calls.at(-1).item).includes(config.secret), false);
    assert.equal(calls.find(item => item.action === 'local-ready').requestOptions.headers['X-Forwarded-Proto'], 'https');
    assert.equal(calls.find(item => item.action === 'remote-ready').requestOptions.redirect, 'error');

    let clock = 0;
    const missingUrl = createController({
        runPreflight: async () => {},
        runCompose: async () => {}, fetchImpl: async () => ({ status: 200 }), readLogs: async () => 'still starting',
        writeEvidence: async () => { throw new Error('evidence must not be written'); },
        now: () => clock, commit: 'abc123', sleep: async () => { clock += 1000; }
    });
    await assert.rejects(() => missingUrl.start(config), /Quick Tunnel URL.*logs/);

    const invalidUrl = createController({
        runPreflight: async () => {},
        runCompose: async () => {}, fetchImpl: async () => ({ status: 200 }), readLogs: async () => 'https://example.com',
        writeEvidence: async () => { throw new Error('evidence must not be written'); },
        now: () => clock, commit: 'abc123', sleep: async () => { clock += 1000; }
    });
    await assert.rejects(() => invalidUrl.start(config), /Quick Tunnel URL.*logs/);

    const remoteNotReady = createController({
        runPreflight: async () => {},
        runCompose: async () => {},
        fetchImpl: async requestUrl => ({ status: requestUrl.startsWith('http://127.0.0.1') ? 200 : 503 }),
        readLogs: async () => url, writeEvidence: async () => { throw new Error('evidence must not be written'); },
        now: () => clock, commit: 'abc123', sleep: async () => { clock += 1000; }
    });
    await assert.rejects(() => remoteNotReady.start(config), /remote readiness/);

    let hungClock = 0;
    const immediateTimeout = (callback, milliseconds) => {
        hungClock += milliseconds;
        queueMicrotask(callback);
        return () => {};
    };
    const hungFetch = createController({
        runPreflight: async () => {},
        runCompose: async () => {}, fetchImpl: async () => new Promise(() => {}), readLogs: async () => url,
        writeEvidence: async () => {}, now: () => hungClock, commit: 'abc123', sleep: async () => {},
        timeoutMs: 5, scheduleTimeout: immediateTimeout
    });
    await assert.rejects(() => Promise.race([
        hungFetch.start(config), new Promise((_, reject) => setTimeout(() => reject(new Error('test timeout')), 50))
    ]), /local readiness/);

    hungClock = 0;
    const hungLogs = createController({
        runPreflight: async () => {},
        runCompose: async () => {}, fetchImpl: async () => ({ status: 200 }), readLogs: async () => new Promise(() => {}),
        writeEvidence: async () => {}, now: () => hungClock, commit: 'abc123', sleep: async () => {},
        timeoutMs: 5, scheduleTimeout: immediateTimeout
    });
    await assert.rejects(() => Promise.race([
        hungLogs.start(config), new Promise((_, reject) => setTimeout(() => reject(new Error('test timeout')), 50))
    ]), /Quick Tunnel URL.*logs/);

    const composeArgs = [];
    const stopController = createController({
        runPreflight: async () => {},
        runCompose: async request => { composeArgs.push(request.args || []); }, fetchImpl: async () => ({ status: 200 }),
        readLogs: async () => '', writeEvidence: async () => {}, now: () => Date.now(), commit: 'abc123', sleep: async () => {}
    });
    await stopController.stop(config);
    assert.deepEqual(composeArgs, [['down', '--remove-orphans']]);
    assert.equal(composeArgs.flat().includes('-v'), false);

    const statusCalls = [];
    let statusFetchOptions;
    const statusController = createController({
        runPreflight: async () => {},
        runCompose: async request => { statusCalls.push(request.action); return 'running'; },
        fetchImpl: async (_requestUrl, requestOptions) => { statusFetchOptions = requestOptions; return { status: 200 }; }, readLogs: async () => url, writeEvidence: async () => {},
        now: () => Date.now(), commit: 'abc123', sleep: async () => {}
    });
    const status = await statusController.status(config);
    assert.deepEqual(statusCalls, ['status']);
    assert.equal(status.url, url);
    assert.equal(status.readiness, 200);
    assert.equal(statusFetchOptions.redirect, 'error');

    const statusOutput = [];
    const originalStatusLog = console.log;
    console.log = message => statusOutput.push(message);
    try {
        await runCli(['node', 'quick-tunnel-staging.js', 'status'], {
            cwd: root,
            dependencies: {
                runPreflight: async () => {}, runCompose: async () => 'qlcd-staging running\ncloudflared-staging running',
                fetchImpl: async () => ({ status: 200 }), readLogs: async () => url,
                writeEvidence: async () => {}, now: Date.now, commit: 'abc123', sleep: async () => {}
            }
        });
    } finally {
        console.log = originalStatusLog;
    }
    assert.match(statusOutput.join('\n'), /qlcd-staging running/);
    assert.match(statusOutput.join('\n'), /cloudflared-staging running/);

    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    for (const name of ['staging:tunnel:start', 'staging:tunnel:status', 'staging:tunnel:stop']) {
        assert.equal(packageJson.scripts[name], `node scripts/quick-tunnel-staging.js ${name.split(':').at(-1)}`);
    }

    const output = [];
    const originalLog = console.log;
    console.log = message => output.push(message);
    try {
        await runCli(['node', 'quick-tunnel-staging.js', 'start'], {
            cwd: root,
            environment: valid,
            dependencies: {
                runPreflight: async () => {},
                runCompose: async () => {}, fetchImpl: async () => ({ status: 200 }), readLogs: async () => url,
                writeEvidence: async () => {}, now: () => Date.parse('2026-09-02T00:00:00.000Z'), commit: 'abc123', sleep: async () => {}
            }
        });
    } finally {
        console.log = originalLog;
    }
    assert.deepEqual(output, ['TEMPORARY STAGING — NOT PRODUCTION', url]);
    assert.equal(output.join('\n').includes(valid.QLCD_STAGING_SECRET), false);
    await assert.rejects(() => runCli(['node', 'quick-tunnel-staging.js', 'deploy']), /start\|status\|stop/);
    await assert.rejects(() => runCli(['node', 'quick-tunnel-staging.js', 'stop', 'extra'], {
        cwd: root,
        dependencies: {
            runPreflight: async () => {},
            runCompose: async () => {}, fetchImpl: async () => ({ status: 200 }), readLogs: async () => '',
            writeEvidence: async () => {}, now: Date.now, commit: 'abc123'
        }
    }), /start\|status\|stop/);

    const envFile = path.join(root, '.env.staging.local');
    fs.writeFileSync(envFile, [
        `QLCD_STAGING_SECRET=${valid.QLCD_STAGING_SECRET}`,
        `QLCD_STAGING_DB=${valid.QLCD_STAGING_DB}`,
        `QLCD_STAGING_UPLOAD=${valid.QLCD_STAGING_UPLOAD}`,
        `QLCD_STAGING_BACKUP_DIR=${valid.QLCD_STAGING_BACKUP_DIR}`,
        'QLCD_STAGING_PORT=43210'
    ].join('\n'));
    const staleParent = {
        QLCD_STAGING_SECRET: process.env.QLCD_STAGING_SECRET,
        QLCD_STAGING_DB: process.env.QLCD_STAGING_DB,
        QLCD_STAGING_UPLOAD: process.env.QLCD_STAGING_UPLOAD,
        QLCD_STAGING_BACKUP_DIR: process.env.QLCD_STAGING_BACKUP_DIR,
        QLCD_STAGING_PORT: process.env.QLCD_STAGING_PORT
    };
    const programCalls = [];
    const originalComposeLog = console.log;
    Object.assign(process.env, {
        QLCD_STAGING_SECRET: 'parent-secret-that-must-not-be-used'.repeat(2),
        QLCD_STAGING_DB: path.join(root, 'parent', 'wrong.db'),
        QLCD_STAGING_UPLOAD: path.join(root, 'parent', 'uploads'),
        QLCD_STAGING_BACKUP_DIR: path.join(root, 'parent', 'backups'),
        QLCD_STAGING_PORT: '49999'
    });
    console.log = () => {};
    try {
        await runCli(['node', 'quick-tunnel-staging.js', 'start'], {
            cwd: root,
            dependencyFactory: (factoryCwd, environment) => ({
                ...createDependencies(factoryCwd, {
                    environment,
                    runProgramImpl: async (command, args, childCwd, childEnvironment, commandOptions) => {
                        programCalls.push({ command, args, childCwd, childEnvironment, commandOptions });
                        return args.includes('logs') ? url : '';
                    }
                }),
                buildImage: async () => 'qlcd-staging:abc123',
                finalizeConfig: config => finalizeStagingConfig(config, factoryCwd),
                seedData: async ({ config }) => { fs.rmSync(config.dbSnapshotRoot, { recursive: true, force: true }); },
                fetchImpl: async () => ({ status: 200 })
            })
        });
    } finally {
        console.log = originalComposeLog;
        for (const [name, previous] of Object.entries(staleParent)) {
            if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
        }
    }
    const composeCalls = programCalls.filter(call => call.command === 'docker');
    assert.equal(composeCalls.length, 5);
    for (const call of composeCalls) {
        assert.deepEqual(call.args.slice(0, 5), ['compose', '--env-file', '.env.staging.local', '-f', 'docker-compose.staging.yml']);
        assert.equal(call.childEnvironment.QLCD_STAGING_SECRET, valid.QLCD_STAGING_SECRET);
        assert.equal(call.childEnvironment.QLCD_STAGING_DB, valid.QLCD_STAGING_DB);
        assert.equal(call.childEnvironment.QLCD_STAGING_PORT, '43210');
        assert.equal(call.childEnvironment.QLCD_STAGING_IMAGE, 'qlcd-staging:abc123');
    }
    const qualityCalls = programCalls.filter(call => call.command !== 'docker');
    const qualityArgsOffset = process.platform === 'win32' ? 4 : 0;
    assert.deepEqual(qualityCalls.map(call => call.args.slice(qualityArgsOffset).join(' ')), ['run lint', 'run typecheck', 'test', 'run build']);
    if (process.platform === 'win32') {
        for (const call of qualityCalls) {
            assert.equal(path.basename(call.command).toLowerCase(), 'cmd.exe');
            assert.deepEqual(call.args.slice(0, 4), ['/d', '/s', '/c', 'npm']);
        }
    }
    assert.ok(programCalls.every(call => Number.isInteger(call.commandOptions.timeoutMs)));
    const timeoutByAction = Object.fromEntries(programCalls.map(call => [call.command === 'docker' ? call.args.slice(5).join(' ') : call.args.slice(qualityArgsOffset).join(' '), call.commandOptions.timeoutMs]));
    assert.ok(timeoutByAction.test > timeoutByAction['run lint']);
    assert.ok(timeoutByAction['create --force-recreate qlcd-staging'] > timeoutByAction['logs --no-color cloudflared-staging']);

    const drainSecret = 'sensitive-value-that-must-be-redacted';
    const noisyFailure = [
        "const chunk = 'x'.repeat(512 * 1024);",
        "process.stderr.write(chunk, () => process.stderr.write('\\nsecret=' + process.env.QLCD_STAGING_SECRET, () => process.exit(7)));"
    ].join('');
    await assert.rejects(
        () => runProgram(process.execPath, ['-e', noisyFailure], root, {
            ...process.env,
            QLCD_STAGING_SECRET: drainSecret
        }, { timeoutMs: 5000, label: 'output-drain-check', maxOutputBytes: 1024 }),
        error => {
            assert.match(error.message, /output-drain-check failed/);
            assert.match(error.message, /\[REDACTED\]/);
            assert.doesNotMatch(error.message, new RegExp(drainSecret));
            return true;
        }
    );
}

lifecycleTests().then(() => console.log('quick tunnel staging tests passed')).catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
