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
