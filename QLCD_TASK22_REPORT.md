# QLCD TASK 22 Report — Notifications + Data Quality

## Status

COMPLETED trên nhánh `task22/notifications-data-quality`.

## Delivered

- Registry 5 rule chuẩn: hạn kỹ thuật, NCVT chờ review, mapping Material, duplicate Material và file thiếu SHA-256.
- Job định kỳ/thủ công có journal, fingerprint idempotent, auto-resolve và reopen khi vấn đề tái diễn.
- Hàng đợi case có owner, unit scope, severity, SLA, escalation level, occurrence count và optimistic version.
- Triage đầy đủ: acknowledge, start, resolve, dismiss, reassign và manual/automatic escalation.
- In-app delivery/chưa đọc; escalation gửi thêm quản trị; event case và rule configuration append-only.
- RBAC tách view/triage/assign/manage; PX không nhìn thấy data-quality cấp Công ty hoặc case đơn vị khác.
- Màn hình “Thông báo & chất lượng” có KPI, filter, chi tiết timeline, phân công, xử lý và cấu hình rule.
- Scheduler mặc định 15 phút, có thể cấu hình bằng `QLCD_NOTIFICATION_INTERVAL_MINUTES`; đặt `0` để tắt.

## Acceptance

- TASK 22 acceptance: 22/22 checks pass.
- Full regression: 933/933 checks pass.
- Lint/typecheck/build: 109 JavaScript files pass.
- UI browser QA: KPI, filter, danh sách, detail timeline, owner/actions và cấu hình 5 rule hiển thị đúng; không có console warning/error.

## Known issue

- Kênh delivery hiện là in-app; email/SMS/push chưa cấu hình vì chưa có provider hoặc chính sách gửi được duyệt.
- Bảng `thong_bao` legacy được giữ nguyên; canonical engine chưa backfill các thông báo giao dịch cũ.
- Bộ rule hiện là registry do code triển khai, chưa hỗ trợ người dùng tự viết biểu thức/SQL để tránh thực thi rule không an toàn.

## Next

TASK 23 — Reporting/Excel/PDF/print.
