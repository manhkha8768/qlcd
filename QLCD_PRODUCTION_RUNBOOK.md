# QLCD Production Readiness Runbook

## Required configuration

Set `NODE_ENV=production`, `QLCD_INTERNET=1`, strong `QLCD_SECRET`, persistent `QLCD_DB`, `QLCD_UPLOAD`, and a separate persistent `QLCD_BACKUP_DIR`. Set `QLCD_PUBLIC_HOST` to the production domain. Run `npm run production:check` before startup.

## Health and monitoring

- `/api/health`: liveness; process is responding.
- `/api/ready`: database quick-check, migration completeness, upload and backup storage.
- `/api/operations/metrics`: authenticated operational metrics for admin/CĐVT.
- `/api/operations/errors`: authenticated error queue; admin resolves with an explanation.

Alert when readiness is non-200, 5xx error rate is non-zero for five minutes, p95 exceeds the agreed environment threshold, event-loop max rises continuously, or RSS approaches the container limit.

## Backup and restore

Run `npm run sao-luu` on a schedule and copy backups off-host. Each backup contains `qlcd.db`, uploads and `manifest.json` checksums. Run `npm run restore:drill` regularly; the drill copies into a temporary directory and never overwrites the active database. Retention defaults to 30 and is configurable through `QLCD_BACKUP_RETENTION`.

## Performance gates

Run `npm run profile:db` after migration/schema changes. Run `npm run loadtest -- <staging-url>` with `QLCD_LOAD_REQUESTS`, `QLCD_LOAD_CONCURRENCY`, `QLCD_LOAD_P95_MS` and `QLCD_LOAD_MAX_ERROR_RATE`. Use staging with production-like data volume; do not load-test production without an approved window.

## Deploy and rollback

Before deploy: verified backup, production config check, migration rehearsal on a copy, full regression and readiness. During deploy: send SIGTERM and allow at least 35 seconds. After deploy: verify readiness, error queue, metrics and a role-based smoke test. Rollback application image only after confirming schema compatibility; restore data only from a verified backup under an approved incident procedure.

## UAT rehearsal before deployment

1. Đặt `QLCD_UAT_SOURCE_DB`, `QLCD_UAT_DB` và `QLCD_UAT_PASSWORD` trên máy staging tách biệt.
2. Chạy `npm run uat:prepare`; lưu manifest và xác nhận `source_was_modified=false`.
3. Chạy `npm run uat:run`; lưu evidence JSON cùng biên bản UAT.
4. Hoàn thành UAT-A đến UAT-H trong `QLCD_UAT_PLAN.md` và lấy chữ ký PX, CĐVT, quản trị hệ thống.
5. Không triển khai production nếu technical status khác `PASSED` hoặc business sign-off còn `PENDING`.

## Temporary Quick Tunnel staging (TASK 27)

Quick Tunnel is a temporary staging transport for a review or UAT rehearsal. It is **not** a production endpoint, has no SLA, and its `https://<label>.trycloudflare.com` URL can change every time the connector restarts. Do not use it for production traffic, production DNS, a named tunnel, or an availability commitment.

Prerequisites: Docker Engine and Docker Compose must be available to the operator; a staging database file must already exist; staging upload and backup directories must be distinct; and none of the staging paths may be a production database, upload, or backup path. The database, upload, and backup paths must all be physically outside the repository checkout because that checkout is the Docker build context. Use only an approved, anonymized external staging/UAT copy; never use production data with this compose file.

1. Copy `.env.example` to `.env.staging.local` (this local file is ignored by Git). Set a unique `QLCD_STAGING_SECRET` of at least 32 characters, `QLCD_STAGING_DB` to an existing database copy outside the checkout, and `QLCD_STAGING_UPLOAD` and `QLCD_STAGING_BACKUP_DIR` to separate paths outside the checkout. The validator resolves links/junctions physically, so an external-looking link that targets the checkout is rejected. Optionally set `QLCD_STAGING_PORT`; it defaults to `32121`.
2. Run `npm run staging:tunnel:start`. This wrapper is the only supported build/start entry point because it validates physical path isolation and runs preflight before Docker build/up. Direct `docker compose build` or `docker compose up` is unsupported because it bypasses that validation. The application listens only on `127.0.0.1`; the connector makes the outbound tunnel connection. A successful command prints `TEMPORARY STAGING — NOT PRODUCTION` and the temporary URL.
3. Find the current URL in the start output or `quick-tunnel-output/evidence.json`; use `npm run staging:tunnel:status` to check the containers and remote readiness. Treat the URL as stale after any tunnel restart and obtain it again from status/log output.
4. When the rehearsal ends, run `npm run staging:tunnel:stop`. This calls Compose `down --remove-orphans` only. Do **not** run `down -v`: the staging database, uploads, and backups must be retained for evidence and recovery.

The operational smoke check is only successful when local and remote `/api/ready` both return HTTP 200 and the evidence reports `TEMPORARY_STAGING`. It never substitutes for UAT sign-off, production secrets/storage, a production domain, a named/HA tunnel, or an approved production rollout.
