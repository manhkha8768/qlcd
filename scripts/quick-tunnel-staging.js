const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createController, resolveStagingConfig } = require('../lib/quick-tunnel-staging');

const ENV_FILE = '.env.staging.local';
const COMPOSE_FILE = 'docker-compose.staging.yml';

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

function runProgram(command, args, cwd, environment, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let settled = false;
        const finish = callback => value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback(value);
        };
        const timeout = setTimeout(() => {
            try { child.kill(); } catch (_) {}
            finish(reject)(new Error('Docker Compose command timed out'));
        }, timeoutMs);
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.on('error', () => finish(reject)(new Error('Docker Compose could not be started')));
        child.on('close', code => code === 0 ? finish(resolve)(stdout) : finish(reject)(new Error('Docker Compose command failed')));
    });
}

function dockerEnvironment(environment, config) {
    const childEnvironment = {};
    for (const [name, value] of Object.entries(environment)) {
        if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programdata|programfiles|commonprogramfiles|docker_)/i.test(name)) {
            childEnvironment[name] = value;
        }
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
    return childEnvironment;
}

function createDependencies(cwd, { environment = process.env, runProgramImpl = runProgram } = {}) {
    async function compose(args, config) {
        return runProgramImpl('docker', ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...args], cwd, dockerEnvironment(environment, config));
    }
    return {
        runCompose: async request => {
            if (request.action === 'prepare') {
                fs.mkdirSync(request.config.uploadPath, { recursive: true });
                fs.mkdirSync(request.config.backupPath, { recursive: true });
                return '';
            }
            return compose(request.args || [], request.config);
        },
        fetchImpl: (...args) => global.fetch(...args),
        readLogs: request => compose(['logs', '--no-color', 'cloudflared-staging'], request.config),
        writeEvidence: async (evidencePath, evidence) => {
            fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
            fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
        },
        now: Date.now,
        commit: () => {
            try {
                return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
