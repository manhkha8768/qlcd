const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');
const db = require('../db');
const storage = require('./document-storage');

const startedAt = Date.now();
const routes = new Map();
let total = 0, inFlight = 0, serverErrors = 0;
let acceptingTraffic = true;
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

function percentile(values, percent) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return Number(sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)].toFixed(2));
}

function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    inFlight++;
    res.on('finish', () => {
        inFlight = Math.max(0, inFlight - 1);
        total++;
        if (res.statusCode >= 500) serverErrors++;
        const duration = Number(process.hrtime.bigint() - start) / 1e6;
        const route = `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`;
        const item = routes.get(route) || { count: 0, errors: 0, durations: [] };
        item.count++;
        if (res.statusCode >= 500) item.errors++;
        item.durations.push(duration);
        if (item.durations.length > 500) item.durations.shift();
        routes.set(route, item);
        if (res.statusCode >= 500 && !req.operationalErrorCaptured) {
            captureError(new Error('HTTP 500 response without propagated error'), req, res.statusCode);
        }
        const threshold = Number(process.env.QLCD_SLOW_REQUEST_MS || 1000);
        if (duration >= threshold) {
            console.warn(JSON.stringify({ level: 'warn', event: 'slow_request', request_id: req.requestId,
                method: req.method, route, status: res.statusCode, duration_ms: Number(duration.toFixed(2)) }));
        }
    });
    next();
}

function snapshot() {
    const memory = process.memoryUsage();
    return {
        started_at: new Date(startedAt).toISOString(), uptime_seconds: Math.floor(process.uptime()),
        requests: { total, in_flight: inFlight, server_errors: serverErrors,
            error_rate: total ? Number((serverErrors / total).toFixed(6)) : 0 },
        event_loop: { mean_ms: Number((eventLoop.mean / 1e6 || 0).toFixed(2)),
            max_ms: Number((eventLoop.max / 1e6 || 0).toFixed(2)) },
        memory_mb: { rss: Number((memory.rss / 1048576).toFixed(2)),
            heap_used: Number((memory.heapUsed / 1048576).toFixed(2)) },
        routes: [...routes.entries()].map(([route, item]) => ({ route, count: item.count, errors: item.errors,
            p50_ms: percentile(item.durations, .5), p95_ms: percentile(item.durations, .95),
            p99_ms: percentile(item.durations, .99) })).sort((a, b) => b.p95_ms - a.p95_ms)
    };
}

function readiness() {
    const checks = { accepting_traffic: acceptingTraffic };
    try { checks.database = db.pragma('quick_check', { simple: true }) === 'ok'; }
    catch (_) { checks.database = false; }
    try {
        const expected = fs.readdirSync(path.join(__dirname, '..', 'db')).filter(x => /^\d+.*\.sql$/.test(x)).length;
        const applied = db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
        checks.migrations = applied === expected;
    } catch (_) { checks.migrations = false; }
    try { fs.mkdirSync(storage.uploadsRoot, { recursive: true }); fs.accessSync(storage.uploadsRoot, fs.constants.W_OK); checks.storage = true; }
    catch (_) { checks.storage = false; }
    try {
        if (!process.env.QLCD_BACKUP_DIR) checks.backup_storage = process.env.NODE_ENV !== 'production';
        else {
            fs.mkdirSync(process.env.QLCD_BACKUP_DIR, { recursive: true });
            fs.accessSync(process.env.QLCD_BACKUP_DIR, fs.constants.W_OK); checks.backup_storage = true;
        }
    } catch (_) { checks.backup_storage = false; }
    return { ready: Object.values(checks).every(Boolean), checks };
}

function markStopping() { acceptingTraffic = false; }

function captureError(error, req, status = 500) {
    if (status < 500) return null;
    try {
        const stack = String(error?.stack || error?.message || error || 'Unknown error');
        const id = db.prepare(`INSERT INTO operational_error_events
            (request_id,method,route,http_status,error_name,error_message,stack_sha256,actor_id,ip_address)
            VALUES (?,?,?,?,?,?,?,?,?)`).run(req.requestId || crypto.randomUUID(), req.method || 'UNKNOWN',
              String(req.originalUrl || req.path || '/').slice(0, 500), status,
              String(error?.name || 'Error').slice(0, 100), String(error?.message || error).slice(0, 1000),
              crypto.createHash('sha256').update(stack).digest('hex'), req.session?.nguoiDung?.id || null,
              String(req.ip || '').slice(0, 100) || null).lastInsertRowid;
        req.operationalErrorCaptured = true;
        return id;
    } catch (_) { return null; }
}

module.exports = { metricsMiddleware, snapshot, readiness, captureError, percentile, markStopping };
