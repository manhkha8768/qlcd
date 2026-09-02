function percentile(values, percent) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)].toFixed(2));
}
async function runLoadTest({ baseUrl, cookie = '', requests = 500, concurrency = 20,
    paths = ['/api/health'], p95LimitMs = 500, maxErrorRate = 0 } = {}) {
    let cursor = 0, errors = 0; const durations = [], started = Date.now();
    async function worker() {
        while (true) {
            const index = cursor++;
            if (index >= requests) return;
            const before = performance.now();
            try {
                const response = await fetch(baseUrl + paths[index % paths.length], { headers: cookie ? { Cookie: cookie } : undefined });
                if (!response.ok) errors++;
                await response.arrayBuffer();
            } catch (_) { errors++; }
            durations.push(performance.now() - before);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    const elapsedMs = Date.now() - started;
    const result = { requests, concurrency, errors, error_rate: errors / requests, elapsed_ms: elapsedMs,
        requests_per_second: Number((requests * 1000 / elapsedMs).toFixed(2)), p50_ms: percentile(durations, .5),
        p95_ms: percentile(durations, .95), p99_ms: percentile(durations, .99),
        thresholds: { p95_ms: p95LimitMs, max_error_rate: maxErrorRate } };
    result.passed = result.p95_ms <= p95LimitMs && result.error_rate <= maxErrorRate;
    return result;
}
module.exports = { runLoadTest, percentile };
