# QLCD Official Implementation Roadmap

> Chốt từ MASTER PROMPT/Roadmap và hiệu chỉnh bằng audit `main@fd65edc` ngày 2026-09-01. Trạng thái chỉ phản ánh bằng chứng source; “một phần” không đồng nghĩa production-ready.

## 1. Task mapping

| Task | Phạm vi | Baseline | Gap chính / exit gate |
|---:|---|---|---|
| 0 | Audit + baseline/docs | Hoàn thành trong commit Task 0 | 8 tài liệu, test/build report, không đổi nghiệp vụ |
| 1 | Foundation stabilization | Hoàn thành | Authorization service thống nhất, scope nhiều đơn vị, project/unit foundation, migration journal, CI/PWA foundation và regression test |
| 2 | Asset/TSCĐ/CCDC master | Hoàn thành | `assets` tách khỏi device, legacy mapping, CRUD/import/export/pagination, RBAC và multi-unit scope |
| 3 | Device master | Hoàn thành | `devices`, legacy mapping, asset/device history, CRUD/RBAC/scope/version và compatibility read |
| 4 | Asset transaction ledger | Hoàn thành | Opening backfill, append-only posting, reversal, projection/rebuild, idempotency và reconciliation |
| 5 | Điều chuyển + giao nhận hai đầu | Hoàn thành | sender/receiver/approval bắt buộc, evidence ACL, timeline, reject và atomic ledger post |
| 6 | Kiểm kê + đối chiếu + QR | Hoàn thành | Ledger snapshot bất biến, QR identity, mobile offline queue, idempotent sync, reviewed adjustment |
| 7 | Hồ sơ kỹ thuật | Hoàn thành | Device ID canonical, UI profile/tab, typed validation, optimistic version và immutable history |
| 8 | Cây cấu tạo | Hoàn thành | Device ID canonical, cycle guard, optimistic version, replace/move và repair/material integration |
| 9 | Document/file management | Một phần | object storage, version/hash/link/signed URL/ACL |
| 10 | Material master | Một phần sơ khai | canonical material/UOM/dedup review |
| 11 | Warehouse + stock ledger | Một phần | append-only ledger + on-hand/reserved/available/incoming |
| 12 | Chuyển kho + hoàn trả | Chưa đầy đủ | in-transit, receive/return atomic, không double stock |
| 13 | NCVT period + PX submission | Một phần | submission/version/state/material link |
| 14 | Review + approval NCVT | Chưa đầy đủ | assignment review, return/reject/approve immutable |
| 15 | Tổng hợp NCVT Công ty | Một phần | material/PX drill-down và nguồn cung chuẩn |
| 16 | Reservation | Chưa làm | concurrency-safe reservation/allocation |
| 17 | Phiếu xuất/cấp phát | Một phần | issue workflow nối stock ledger/reservation |
| 18 | PX xác nhận nhận | Chưa làm | received/discrepancy/refusal |
| 19 | Carry forward + lock | Chưa làm | source link/idempotency/immutable locked period |
| 20 | NCVT dashboard | Một phần sơ khai | KPI/filter/alert đúng UOM và scope |
| 21 | Repair/maintenance/inspection | Một phần đáng kể | nối component + material issue + lifecycle |
| 22 | Notifications + data quality | Một phần sơ khai | rules/jobs/ownership/triage |
| 23 | Reporting/Excel/PDF/print | Một phần | chuẩn mẫu, scope, pagination/performance |
| 24 | Security hardening | Một phần | route policy audit, upload/secrets/idempotency/concurrency tests |
| 25 | Performance + production readiness | Chưa đầy đủ | profiling/index/monitoring/error tracking/restore drill/load test |
| 26 | UAT dữ liệu thực | Chưa làm | staging + 1–2 PX, end-to-end sign-off |
| 27 | Production deployment | Một phần hạ tầng legacy | tách env, domain/HTTPS, prod DB/storage, pipeline/rollback |
| 28 | Controlled go-live | Chưa làm | pilot 1–2 PX, observability/support, staged rollout |
| 29 | AI/OCR | Chưa làm | chỉ sau dữ liệu ổn định; preview/user confirm/approval |

## 2. Release gates

- Release A Core: Task 0–9.
- Release B Material: Task 10–12.
- Release C NCVT: Task 13–20.
- Release D Operations: Task 21–25.
- Release E Production: Task 26–29.

## 3. Thứ tự bắt buộc

Foundation -> Asset/Device -> Ledger -> Transfer -> Inventory -> Technical/File -> Material -> Warehouse -> NCVT -> Reservation -> Issue/Receive -> Operations -> Security/Performance -> UAT -> Production/Pilot -> AI.

Task tiếp theo đề xuất: **TASK 9 — Document/file management**, chuẩn hóa metadata, object/version/hash, entity link, download ACL và lộ trình object storage không làm mất file legacy.

## 4. Quality gate sau mỗi Task

`INSPECT -> PLAN -> MIGRATION -> IMPLEMENT -> PERMISSION -> VALIDATION -> TEST -> LINT -> TYPECHECK -> BUILD -> REVIEW DIFF -> COMMIT -> REPORT -> STOP`.

Mỗi checkpoint báo: STATUS, BRANCH, COMMIT SHA, FILES CHANGED, MIGRATIONS, TEST, TYPECHECK, BUILD, KNOWN ISSUES, TASK MAPPING và NEXT RECOMMENDED TASK. Không tự sang Task tiếp theo khi chưa review.

## 5. Cloudflare decision

Không coi `feature/cloudflare-foundation` là Task 1 hoàn tất. Audit hiện tại: typecheck/build đạt, lint thiếu config, không có test/spec và CI tham chiếu workspace lockfile không tồn tại. Chỉ tiếp tục/merge sau khi: cấu hình placeholder được thay bằng môi trường thật an toàn; legacy parity/migration plan được duyệt; CI thực sự chạy; test auth/RBAC/data scope đạt; D1 transaction/concurrency và R2 lifecycle đáp ứng ledger/file; có rollback. Nếu không đạt, ổn định Express/SQLite trước và dùng Cloudflare Tunnel cho pilot vẫn là lựa chọn hợp lệ.
