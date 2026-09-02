# QLCD TASK 25 Report — Performance + production readiness

## Status

COMPLETED on branch `task25/performance-production-readiness`.

## Delivered

- Migration 37: operational error queue plus targeted read-path indexes.
- Query-plan profiler with 7 index assertions.
- Liveness/readiness split and bounded in-process request/latency/error/event-loop/memory metrics.
- Central 5xx fingerprint tracking, admin/CĐVT read access and admin resolution workflow.
- Online SQLite backup with SHA-256 manifest, immediate verification and isolated restore drill.
- Configurable read-only load test with concurrency, RPS, p50/p95/p99 and error-rate gates.
- Unified persistent upload root, production config fail-closed, graceful SIGTERM/WAL checkpoint.
- Docker non-root runtime, lockfile-only install, readiness healthcheck and separate backup volume.

## Migration

- `db/37-production-readiness.sql` is additive: it creates the operational error queue, permissions and targeted read-path indexes.
- Migration was exercised only on temporary test databases; no production or user database was reset, deleted or rewritten.

## Verification

- TASK 25 acceptance: 18/18 passed.
- Full regression: 996/996 passed.
- Query plans: 7/7 use the expected indexes.
- Local load gate: 400 requests, concurrency 20, 0 errors, 360.69 requests/second, p50 44.43 ms, p95 112.99 ms, p99 170.85 ms; gate passed (`p95 <= 250 ms`, error rate `0`).
- Lint, typecheck and build: 128 JavaScript files passed each check.
- Docker Compose production configuration: valid with a strong temporary secret.
- Browser Core Web Vitals trace: not run because Chrome DevTools MCP is unavailable in this environment.

## Known limits

- Metrics are per-process and reset on restart; production aggregation/alert delivery requires external monitoring in deployment Task 27.
- SQLite remains a single-writer architecture; multi-instance active-active is not approved.
- Browser Core Web Vitals trace could not run because Chrome DevTools MCP is not configured in this environment.
- Load test in TASK 25 is local/synthetic; TASK 26 must repeat against staging with anonymized production-scale data.

## Next

TASK 26 — UAT dữ liệu thực.
