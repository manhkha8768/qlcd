const fs = require('fs');
const path = require('path');

const REQUIRED_SECRET_LENGTH = 32;
const DEFAULT_PORT = 32121;
const URL_CANDIDATE = /https?:\/\/[^\s"'<>]+/ig;
const QUICK_TUNNEL_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/i;
const TRAILING_LOG_PUNCTUATION = /[.,;!?)\]}:]$/;

function required(env, name) {
    if (typeof env[name] !== 'string' || env[name].trim() === '') {
        throw new Error(`${name} is required`);
    }
    return env[name];
}

function normalized(value, cwd) {
    const resolved = path.resolve(cwd, value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function resolveStagingConfig(env = process.env, cwd = process.cwd()) {
    const secret = required(env, 'QLCD_STAGING_SECRET');
    if (secret.length < REQUIRED_SECRET_LENGTH) {
        throw new Error(`QLCD_STAGING_SECRET must be at least ${REQUIRED_SECRET_LENGTH} characters`);
    }

    const dbPath = path.resolve(cwd, required(env, 'QLCD_STAGING_DB'));
    let dbStat;
    try {
        dbStat = fs.statSync(dbPath);
    } catch (_) {
        throw new Error('QLCD_STAGING_DB must point to an existing file');
    }
    if (!dbStat.isFile()) throw new Error('QLCD_STAGING_DB must point to an existing file');

    const uploadPath = path.resolve(cwd, required(env, 'QLCD_STAGING_UPLOAD'));
    const backupPath = path.resolve(cwd, required(env, 'QLCD_STAGING_BACKUP_DIR'));
    const stagingPaths = [
        ['QLCD_STAGING_DB', dbPath],
        ['QLCD_STAGING_UPLOAD', uploadPath],
        ['QLCD_STAGING_BACKUP_DIR', backupPath]
    ];
    for (let index = 0; index < stagingPaths.length; index += 1) {
        const [name, stagingPath] = stagingPaths[index];
        for (const [otherName, otherPath] of stagingPaths.slice(index + 1)) {
            if (normalized(stagingPath, cwd) === normalized(otherPath, cwd)) {
                throw new Error(`staging paths must be isolated (${name} must not match ${otherName})`);
            }
        }
    }
    const productionPaths = [
        ['QLCD_DB', env.QLCD_DB],
        ['QLCD_UPLOAD', env.QLCD_UPLOAD],
        ['QLCD_UPLOADS', env.QLCD_UPLOADS],
        ['QLCD_BACKUP_DIR', env.QLCD_BACKUP_DIR]
    ].filter(([, value]) => typeof value === 'string' && value.trim());
    for (const [stagingName, stagingPath] of stagingPaths) {
        for (const [productionName, productionPath] of productionPaths) {
            if (normalized(productionPath, cwd) === normalized(stagingPath, cwd)) {
                throw new Error(`staging path must not match production (${stagingName} conflicts with ${productionName})`);
            }
        }
    }

    const rawPort = env.QLCD_STAGING_PORT == null || env.QLCD_STAGING_PORT === ''
        ? DEFAULT_PORT
        : Number(env.QLCD_STAGING_PORT);
    if (!Number.isInteger(rawPort) || rawPort < 1024 || rawPort > 65535) {
        throw new Error('staging port (QLCD_STAGING_PORT) must be an integer between 1024 and 65535');
    }
    const evidencePath = path.resolve(cwd, env.QLCD_STAGING_EVIDENCE || path.join('quick-tunnel-output', 'evidence.json'));
    return { secret, dbPath, uploadPath, backupPath, port: rawPort, evidencePath };
}

function parseQuickTunnelUrl(text) {
    if (typeof text !== 'string') return null;
    let latest = null;
    for (const rawCandidate of text.match(URL_CANDIDATE) || []) {
        let candidate = rawCandidate;
        while (TRAILING_LOG_PUNCTUATION.test(candidate)) candidate = candidate.slice(0, -1);
        let parsed;
        try {
            parsed = new URL(candidate);
        } catch (_) {
            continue;
        }
        const authority = candidate.slice(candidate.indexOf('//') + 2).split(/[/?#]/, 1)[0];
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || authority.includes(':') || authority.includes('@') || authority.includes('%')) continue;
        if (QUICK_TUNNEL_HOST.test(parsed.hostname)) latest = parsed.origin;
    }
    return latest;
}

function createEvidence({ url, commit, readiness, createdAt }) {
    if (typeof url !== 'string' || parseQuickTunnelUrl(url) !== url) throw new Error('url must be a valid Quick Tunnel URL');
    return {
        format: 'QLCD_QUICK_TUNNEL_STAGING_V1',
        status: 'TEMPORARY_STAGING',
        temporary: true,
        url,
        commit,
        readiness,
        created_at: createdAt,
        task_status: 'PARTIAL',
        business_signoff: { status: 'PENDING' }
    };
}

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60000;

function createTimeout(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
}

function asTimestamp(now) {
    const value = now();
    return value instanceof Date ? value.getTime() : Number(value);
}

async function withinDeadline(operation, timeoutMs, schedule) {
    let timedOut = () => {};
    let cancelTimeout = () => {};
    let work;
    try {
        work = Promise.resolve(operation({ onTimeout: callback => { timedOut = callback; } }));
    } catch (error) {
        work = Promise.reject(error);
    }
    const deadline = new Promise((_, reject) => {
        cancelTimeout = schedule(() => {
            timedOut();
            reject(new Error('operation timed out'));
        }, timeoutMs);
    });
    try {
        return await Promise.race([work, deadline]);
    } finally {
        cancelTimeout();
    }
}

async function poll({ step, now, sleep, operation, timeoutMs = POLL_TIMEOUT_MS, scheduleTimeout: timer = createTimeout }) {
    const startedAt = asTimestamp(now);
    let lastError;
    while (asTimestamp(now) - startedAt <= timeoutMs) {
        try {
            const remainingMs = Math.max(0, timeoutMs - (asTimestamp(now) - startedAt));
            const result = await withinDeadline(operation, remainingMs, timer);
            if (result) return result;
        } catch (error) {
            lastError = error;
        }
        if (asTimestamp(now) - startedAt >= timeoutMs) break;
        await sleep(POLL_INTERVAL_MS);
    }
    const detail = lastError && lastError.message ? `: ${lastError.message}` : '';
    throw new Error(`${step} did not succeed within 60 seconds${detail}`);
}

function createController({ runPreflight, runCompose, fetchImpl, readLogs, writeEvidence, now = Date.now, commit = 'unknown', sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = POLL_TIMEOUT_MS, scheduleTimeout: timer = createTimeout }) {
    for (const [name, dependency] of Object.entries({ runPreflight, runCompose, fetchImpl, readLogs, writeEvidence })) {
        if (typeof dependency !== 'function') throw new Error(`${name} must be a function`);
    }

    async function ready(url, step) {
        return poll({
            step,
            now,
            sleep,
            timeoutMs,
            scheduleTimeout: timer,
            operation: async ({ onTimeout }) => {
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                if (abortController) onTimeout(() => abortController.abort());
                const response = await fetchImpl(url, {
                    redirect: 'error',
                    ...(abortController ? { signal: abortController.signal } : {})
                });
                return response && response.status === 200 ? response : null;
            }
        });
    }

    async function bounded(step, operation) {
        try {
            return await withinDeadline(operation, timeoutMs, timer);
        } catch (error) {
            throw new Error(`${step} did not succeed within 60 seconds: ${error.message}`);
        }
    }

    return {
        async start(config) {
            await runPreflight({ config });
            await runCompose({ action: 'prepare', config });
            await runCompose({ action: 'build', args: ['build', 'qlcd-staging'], config });
            await runCompose({ action: 'app-up', args: ['up', '-d', '--force-recreate', 'qlcd-staging'], config });
            await ready(`http://127.0.0.1:${config.port}/api/ready`, 'local readiness');
            await runCompose({ action: 'tunnel-up', args: ['up', '-d', '--force-recreate', 'cloudflared-staging'], config });
            const url = await poll({
                step: 'Quick Tunnel URL in connector logs',
                now,
                sleep,
                timeoutMs,
                scheduleTimeout: timer,
                operation: async () => parseQuickTunnelUrl(await readLogs({ action: 'logs', config }))
            });
            await ready(`${url}/api/ready`, 'remote readiness');
            const evidence = createEvidence({
                url,
                commit: typeof commit === 'function' ? commit() : commit,
                readiness: 200,
                createdAt: new Date(asTimestamp(now)).toISOString()
            });
            await writeEvidence(config.evidencePath, evidence);
            return { url, evidence };
        },

        async status(config) {
            const composeStatus = await runCompose({ action: 'status', args: ['ps'], config });
            const url = parseQuickTunnelUrl(await bounded('Quick Tunnel URL in connector logs', () => readLogs({ action: 'logs', config })));
            if (!url) return { composeStatus, url: null, readiness: null };
            const response = await bounded('remote readiness', ({ onTimeout }) => {
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                if (abortController) onTimeout(() => abortController.abort());
                return fetchImpl(`${url}/api/ready`, {
                    redirect: 'error',
                    ...(abortController ? { signal: abortController.signal } : {})
                });
            });
            return { composeStatus, url, readiness: response && response.status === 200 ? 200 : (response ? response.status : null) };
        },

        async stop(config) {
            await runCompose({ action: 'stop', args: ['down', '--remove-orphans'], config });
        }
    };
}

module.exports = { resolveStagingConfig, parseQuickTunnelUrl, createEvidence, createController };
