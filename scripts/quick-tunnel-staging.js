const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createController, resolveStagingConfig, finalizeStagingConfig } = require('../lib/quick-tunnel-staging');

const ENV_FILE = '.env.staging.local';
const COMPOSE_FILE = 'docker-compose.staging.yml';
const DEFAULT_OUTPUT_LIMIT = 64 * 1024;
const COMMAND_TIMEOUTS = Object.freeze({
    lint: 120000,
    typecheck: 120000,
    test: 900000,
    build: 300000,
    composeConfig: 60000,
    composeBuild: 1200000,
    composeUp: 180000,
    composeStatus: 60000,
    composeLogs: 60000,
    composeStop: 180000
});

function readStagingEnvironment(filePath) {
    const values = {};
    if (!fs.existsSync(filePath)) return values;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value;
    }
    return values;
}

function appendOutput(current, chunk, maxOutputBytes) {
    const combined = current + String(chunk);
    return combined.length <= maxOutputBytes ? combined : combined.slice(-maxOutputBytes);
}

function redactOutput(value, environment) {
    let redacted = String(value || '');
    const secrets = Object.entries(environment || {})
        .filter(([name, secret]) => /(?:SECRET|PASSWORD|TOKEN|COOKIE|AUTH)/i.test(name) && typeof secret === 'string' && secret.length >= 4)
        .map(([, secret]) => secret)
        .sort((left, right) => right.length - left.length);
    for (const secret of secrets) redacted = redacted.split(secret).join('[REDACTED]');
    return redacted;
}

function runProgram(command, args, cwd, environment, options = {}) {
    const settings = typeof options === 'number' ? { timeoutMs: options } : options;
    const timeoutMs = settings.timeoutMs || COMMAND_TIMEOUTS.composeStatus;
    const label = settings.label || 'Command';
    const maxOutputBytes = settings.maxOutputBytes || DEFAULT_OUTPUT_LIMIT;
    const spawnImpl = settings.spawnImpl || spawn;
    return new Promise((resolve, reject) => {
        const child = spawnImpl(command, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timeout;
        const finish = callback => value => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            callback(value);
        };
        timeout = setTimeout(() => {
            try { child.kill(); } catch (_) {}
            const detail = redactOutput(stderr || stdout, environment).trim();
            finish(reject)(new Error(`${label} timed out after ${timeoutMs} ms${detail ? `: ${detail}` : ''}`));
        }, timeoutMs);
        child.stdout.on('data', chunk => { stdout = appendOutput(stdout, chunk, maxOutputBytes); });
        child.stderr.on('data', chunk => { stderr = appendOutput(stderr, chunk, maxOutputBytes); });
        child.on('error', () => finish(reject)(new Error(`${label} could not be started`)));
        child.on('close', code => {
            const safeStdout = redactOutput(stdout, environment);
            if (code === 0) return finish(resolve)(safeStdout);
            const detail = redactOutput(stderr || stdout, environment).trim();
            return finish(reject)(new Error(`${label} failed (exit ${code})${detail ? `: ${detail}` : ''}`));
        });
    });
}

function baseCommandEnvironment(environment) {
    const childEnvironment = {};
    for (const [name, value] of Object.entries(environment)) {
        if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programdata|programfiles|commonprogramfiles|docker_|node_|npm_|ci$)/i.test(name)) {
            childEnvironment[name] = value;
        }
    }
    return childEnvironment;
}

function dockerEnvironment(environment, config) {
    const childEnvironment = baseCommandEnvironment(environment);
    for (const [name, value] of Object.entries(environment)) {
        if (/^QLCD_STAGING_/.test(name)) childEnvironment[name] = value;
    }
    if (config && config.secret) {
        Object.assign(childEnvironment, {
            QLCD_STAGING_SECRET: config.secret,
            QLCD_STAGING_DB: config.dbPath,
            QLCD_STAGING_UPLOAD: config.uploadPath,
            QLCD_STAGING_BACKUP_DIR: config.backupPath,
            QLCD_STAGING_PORT: String(config.port)
        });
    }
    if (config && config.image) childEnvironment.QLCD_STAGING_IMAGE = config.image;
    return childEnvironment;
}

function createDependencies(cwd, { environment = process.env, runProgramImpl = runProgram } = {}) {
    const npmCommand = process.platform === 'win32' ? (environment.ComSpec || environment.COMSPEC || 'cmd.exe') : 'npm';
    const npmPrefixArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : [];
    async function compose(args, config, { timeoutMs, label }) {
        return runProgramImpl(
            'docker',
            ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...args],
            cwd,
            dockerEnvironment(environment, config),
            { timeoutMs, label }
        );
    }
    async function quality(args, timeoutMs, label) {
        return runProgramImpl(npmCommand, [...npmPrefixArgs, ...args], cwd, baseCommandEnvironment(environment), { timeoutMs, label });
    }
    function currentCommit() {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    return {
        runPreflight: async request => {
            await quality(['run', 'lint'], COMMAND_TIMEOUTS.lint, 'Preflight lint');
            await quality(['run', 'typecheck'], COMMAND_TIMEOUTS.typecheck, 'Preflight typecheck');
            await quality(['test'], COMMAND_TIMEOUTS.test, 'Preflight tests');
            await quality(['run', 'build'], COMMAND_TIMEOUTS.build, 'Preflight application build');
        },
        buildImage: async () => {
            const commit = currentCommit();
            const image = `qlcd-staging:${commit.slice(0, 12).toLowerCase()}`;
            const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-staging-image-'));
            const archivePath = path.join(temporaryRoot, 'source.tar');
            const contextPath = path.join(temporaryRoot, 'context');
            fs.mkdirSync(contextPath);
            try {
                await runProgramImpl('git', ['diff', '--quiet', commit, '--'], cwd, baseCommandEnvironment(environment), {
                    timeoutMs: COMMAND_TIMEOUTS.composeConfig,
                    label: 'Tracked source cleanliness check'
                });
                await runProgramImpl('git', ['archive', '--format=tar', '-o', archivePath, commit], cwd, baseCommandEnvironment(environment), {
                    timeoutMs: COMMAND_TIMEOUTS.composeConfig,
                    label: 'Committed source archive'
                });
                await runProgramImpl('tar', ['-xf', archivePath, '-C', contextPath], temporaryRoot, baseCommandEnvironment(environment), {
                    timeoutMs: COMMAND_TIMEOUTS.composeConfig,
                    label: 'Committed source extraction'
                });
                await runProgramImpl('docker', ['build', '--pull', '--tag', image, contextPath], temporaryRoot, baseCommandEnvironment(environment), {
                    timeoutMs: COMMAND_TIMEOUTS.composeBuild,
                    label: 'Immutable staging image build'
                });
                const imageId = (await runProgramImpl('docker', ['image', 'inspect', '--format', '{{.Id}}', image], temporaryRoot, baseCommandEnvironment(environment), {
                    timeoutMs: COMMAND_TIMEOUTS.composeConfig,
                    label: 'Immutable staging image inspection'
                })).trim();
                if (!/^sha256:[0-9a-f]{64}$/i.test(imageId)) throw new Error('Docker did not return an immutable staging image ID');
                return imageId.toLowerCase();
            } finally {
                fs.rmSync(temporaryRoot, { recursive: true, force: true });
            }
        },
        finalizeConfig: config => finalizeStagingConfig(config, cwd),
        seedData: async ({ config }) => {
            const dockerBaseEnvironment = baseCommandEnvironment(environment);
            try {
                const volumeStateScript = 'if [ -f /data/db/.qlcd-seeded ] && [ -f /data/uploads/.qlcd-seeded ] && [ -f /data/backups/.qlcd-seeded ]; then echo READY; elif find /data/db /data/uploads /data/backups -mindepth 1 -print -quit | grep -q .; then echo DIRTY; else echo EMPTY; fi';
                const volumeState = (await runProgramImpl('docker', [
                    'run', '--rm', '--user', '0', '--volumes-from', 'qlcd-staging', config.image,
                    'sh', '-c', volumeStateScript
                ], cwd, dockerBaseEnvironment, {
                    timeoutMs: COMMAND_TIMEOUTS.composeUp,
                    label: 'Staging named-volume state check'
                })).trim();
                if (volumeState === 'READY') return;
                if (volumeState !== 'EMPTY') throw new Error('Staging named volumes are not empty and do not have a complete seed marker; refusing to overwrite them');
                await runProgramImpl('docker', ['cp', config.dbSnapshotPath, 'qlcd-staging:/data/db/qlcd.db'], cwd, dockerBaseEnvironment, {
                    timeoutMs: COMMAND_TIMEOUTS.composeUp,
                    label: 'Staging database seed'
                });
                await runProgramImpl('docker', [
                    'run', '--rm', '--user', '0', '--volumes-from', 'qlcd-staging', config.image,
                    'sh', '-c', 'chown -R node:node /data && touch /data/db/.qlcd-seeded /data/uploads/.qlcd-seeded /data/backups/.qlcd-seeded'
                ], cwd, dockerBaseEnvironment, {
                    timeoutMs: COMMAND_TIMEOUTS.composeUp,
                    label: 'Staging named-volume finalization'
                });
            } finally {
                fs.rmSync(config.dbSnapshotRoot, { recursive: true, force: true });
            }
        },
        runCompose: async request => {
            if (request.action === 'prepare') {
                fs.mkdirSync(request.config.uploadPath, { recursive: true });
                fs.mkdirSync(request.config.backupPath, { recursive: true });
                return '';
            }
            const settings = {
                config: { timeoutMs: COMMAND_TIMEOUTS.composeConfig, label: 'Docker Compose staging config' },
                'app-create': { timeoutMs: COMMAND_TIMEOUTS.composeUp, label: 'Docker Compose staging application create' },
                'app-start': { timeoutMs: COMMAND_TIMEOUTS.composeUp, label: 'Docker Compose staging application start' },
                'tunnel-up': { timeoutMs: COMMAND_TIMEOUTS.composeUp, label: 'Docker Compose tunnel start' },
                status: { timeoutMs: COMMAND_TIMEOUTS.composeStatus, label: 'Docker Compose staging status' },
                stop: { timeoutMs: COMMAND_TIMEOUTS.composeStop, label: 'Docker Compose staging stop' }
            }[request.action];
            if (!settings) throw new Error(`Unsupported Docker Compose action: ${request.action}`);
            return compose(request.args || [], request.config, settings);
        },
        fetchImpl: (...args) => global.fetch(...args),
        readLogs: request => compose(['logs', '--no-color', 'cloudflared-staging'], request.config, {
            timeoutMs: COMMAND_TIMEOUTS.composeLogs,
            label: 'Docker Compose tunnel logs'
        }),
        writeEvidence: async (evidencePath, evidence) => {
            fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
            fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
        },
        now: Date.now,
        commit: () => {
            try {
                return currentCommit();
            } catch (_) {
                return 'unknown';
            }
        }
    };
}

function statusConfig(environment, cwd) {
    const port = Number(environment.QLCD_STAGING_PORT || 32121);
    return {
        port: Number.isInteger(port) ? port : 32121,
        image: 'qlcd-staging:status-only',
        evidencePath: path.resolve(cwd, environment.QLCD_STAGING_EVIDENCE || path.join('quick-tunnel-output', 'evidence.json'))
    };
}

async function main(argv = process.argv, options = {}) {
    const command = argv[2];
    if (argv.length !== 3 || !['start', 'status', 'stop'].includes(command)) throw new Error('Usage: node scripts/quick-tunnel-staging.js <start|status|stop>');
    const cwd = options.cwd || process.cwd();
    const environment = { ...process.env, ...readStagingEnvironment(path.join(cwd, ENV_FILE)), ...(options.environment || {}) };
    const config = command === 'start'
        ? resolveStagingConfig(environment, cwd)
        : statusConfig(environment, cwd);
    const dependencies = options.dependencies || (options.dependencyFactory
        ? options.dependencyFactory(cwd, environment)
        : createDependencies(cwd, { environment }));
    const controller = createController(dependencies);
    const result = await controller[command](config);
    if (command === 'start') {
        console.log('TEMPORARY STAGING — NOT PRODUCTION');
        console.log(result.url);
    } else if (command === 'status') {
        console.log('TEMPORARY STAGING — NOT PRODUCTION');
        console.log('Compose state:');
        console.log(result.composeStatus || 'unavailable');
        console.log(result.url || 'Quick Tunnel URL not available');
        console.log(`Readiness: ${result.readiness == null ? 'unavailable' : result.readiness}`);
    } else {
        console.log('TEMPORARY STAGING — NOT PRODUCTION stopped');
    }
    return result;
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { readStagingEnvironment, runProgram, createDependencies, main };
