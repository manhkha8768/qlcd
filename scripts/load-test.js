/** Load test read-only cho một môi trường QLCD đang chạy. */
const { runLoadTest } = require('../lib/load-test');
const baseUrl = process.argv[2] || process.env.QLCD_LOAD_URL;
if (!baseUrl) { console.error('Cần URL: node scripts/load-test.js http://127.0.0.1:3000'); process.exit(1); }
(async () => {
    const result = await runLoadTest({ baseUrl: baseUrl.replace(/\/$/, ''),
        requests: Number(process.env.QLCD_LOAD_REQUESTS || 500),
        concurrency: Number(process.env.QLCD_LOAD_CONCURRENCY || 20),
        p95LimitMs: Number(process.env.QLCD_LOAD_P95_MS || 500),
        maxErrorRate: Number(process.env.QLCD_LOAD_MAX_ERROR_RATE || 0) });
    console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
