# QLCD TASK 21 Report — Repair / Maintenance / Inspection

## Status

COMPLETED trên nhánh `task21/repair-maintenance-inspection`.

## Delivered

- Work order canonical chung cho REPAIR, MAINTENANCE và INSPECTION theo Device ID/Component ID.
- Lifecycle versioned: DRAFT, SUBMITTED, RETURNED, APPROVED, REJECTED, IN_PROGRESS, COMPLETED và CANCELLED.
- Event timeline append-only; work order terminal bị khóa ở tầng database.
- Material Issue theo Material ID/UOM canonical, post nguyên tử vào Stock Ledger và hỗ trợ reversal đối ứng.
- Đồng bộ kết quả hoàn thành sang Device/Component; inspection FAIL đưa thiết bị về trạng thái không an toàn.
- Backfill repair, maintenance và inspection legacy mà không rewrite/xóa dữ liệu nguồn.
- UI canonical được gắn vào màn hình sửa chữa/bảo dưỡng và kiểm định hiện hữu.
- Technical Profile và Component drill-down đọc work order/material issue canonical.

## Acceptance

- 22/22 acceptance checks TASK 21: pass.
- Full regression 911/911: pass.
- Lint/typecheck/build: 105 file pass.
- UI browser check: danh sách canonical, form inspection và drill-down lifecycle/material issue hiển thị đúng; không có console error.

## Known issue

- Lịch nhắc tự động theo `next_due_date` và hàng đợi triage thuộc TASK 22.
- Attachment trực tiếp theo entity `TECHNICAL_OPERATION` chưa mở rộng; tài liệu vẫn có thể liên kết Device/Component và hồ sơ legacy theo TASK 9.

## Next

TASK 22 — Notifications + data quality.
