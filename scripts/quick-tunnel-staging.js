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

function runProgram(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.on('error', () => reject(new Error('Docker Compose could not be started')));
        child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error('Docker Compose command failed')));
    });
}

function createDependencies(cwd) {
    async function compose(args) {
        return runProgram('docker', ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...args], cwd);
    }
    return {
        runCompose: async request => {
            if (request.action === 'prepare') {
                fs.mkdirSync(request.config.uploadPath, { recursive: true });
                fs.mkdirSync(request.config.backupPath, { recursive: true });
                return '';
            }
            return compose(request.args || []);
        },
        fetchImpl: (...args) => global.fetch(...args),
        readLogs: () => compose(['logs', '--no-color', 'cloudflared-staging']),
        writeEvidence: async (evidencePath, evidence) => {
            fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
            fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
        },
        now: Date.now,
        commit: () => {
            try {
                return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true }).trim();
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
    if (!['start', 'status', 'stop'].includes(command)) throw new Error('Usage: node scripts/quick-tunnel-staging.js <start|status|stop>');
    const cwd = options.cwd || process.cwd();
    const environment = { ...process.env, ...readStagingEnvironment(path.join(cwd, ENV_FILE)), ...(options.environment || {}) };
    const dependencies = options.dependencies || createDependencies(cwd);
    const controller = createController(dependencies);
    const config = command === 'start'
        ? resolveStagingConfig(environment, cwd)
        : statusConfig(environment, cwd);
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

module.exports = { readStagingEnvironment, createDependencies, main };
