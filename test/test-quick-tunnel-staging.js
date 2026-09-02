const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveStagingConfig, parseQuickTunnelUrl, createEvidence, createController } = require('../lib/quick-tunnel-staging');
const { main: runCli, createDependencies, runProgram } = require('../scripts/quick-tunnel-staging');

function assertIgnored(dockerIgnore, entry) {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(dockerIgnore, new RegExp(`^${escaped}$`, 'm'), `Docker context must exclude ${entry}`);
}

const dockerIgnore = fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf8');
for (const entry of [
    '.env.staging.local', '*.db', '*.db-wal', '*.db-shm', '*.sqlite', '*.sqlite3',
    'uploads/', 'sao-luu/', 'uat-output/', 'quick-tunnel-output/'
]) {
    assertIgnored(dockerIgnore, entry);
}

const composePath = path.join(__dirname, '..', 'docker-compose.staging.yml');
const compose = fs.existsSync(composePath) ? fs.readFileSync(composePath, 'utf8') : '';
assert.match(compose, /127\.0\.0\.1:\$\{QLCD_STAGING_PORT:-32121\}:3000/);
assert.match(compose, /cloudflare\/cloudflared:2026\.8\.3/);
assert.match(compose, /tunnel --no-autoupdate --url http:\/\/qlcd-staging:3000/);
assert.doesNotMatch(compose, /0\.0\.0\.0:/);
assert.doesNotMatch(compose, /down -v/);
assert.match(compose, /read_only:\s*true/);
assert.match(compose, /cap_drop:\s*\[ALL\]/);
assert.match(compose, /no-new-privileges:\s*true/);
for (const variable of ['QLCD_STAGING_DB', 'QLCD_STAGING_UPLOAD', 'QLCD_STAGING_BACKUP_DIR']) {
    assert.match(compose, new RegExp(`\\$\\{${variable}[^}]*\\}`));
}

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
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_DB: path.join(root, 'missing.db') }, root), /file/);

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

    const config = {
        secret: 's'.repeat(32), port: 32121, uploadPath: path.join(root, 'run', 'uploads'),
        backupPath: path.join(root, 'run', 'backups'), evidencePath: path.join(root, 'run', 'evidence.json')
    };
    const calls = [];
    const controller = createController({
        runPreflight: async () => { calls.push({ action: 'preflight' }); },
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
    assert.deepEqual(calls.map(item => item.action), ['preflight', 'prepare', 'build', 'app-up', 'local-ready', 'tunnel-up', 'logs', 'remote-ready', 'evidence']);
    assert.deepEqual(calls.find(item => item.action === 'build').args, ['build', 'qlcd-staging']);
    assert.deepEqual(calls.find(item => item.action === 'app-up').args, ['up', '-d', '--force-recreate', 'qlcd-staging']);
    assert.deepEqual(calls.find(item => item.action === 'tunnel-up').args, ['up', '-d', '--force-recreate', 'cloudflared-staging']);
    assert.equal(calls.at(-1).evidencePath, config.evidencePath);
    assert.equal(calls.at(-1).item.status, 'TEMPORARY_STAGING');
    assert.equal(JSON.stringify(calls.at(-1).item).includes(config.secret), false);
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
    assert.ok(timeoutByAction['build qlcd-staging'] > timeoutByAction['config --quiet']);
    assert.ok(timeoutByAction['up -d --force-recreate qlcd-staging'] > timeoutByAction['logs --no-color cloudflared-staging']);

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
