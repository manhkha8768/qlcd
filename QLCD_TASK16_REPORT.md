# TASK 16 — NCVT Reservation

## Kết quả

- Reservation liên kết dòng NCVT APPROVED với kho, Material ID và UOM canonical.
- Reserve kiểm tra nhu cầu còn lại và tồn AVAILABLE, rồi post Stock Ledger nguyên tử.
- Release một phần và cancel phần còn lại tạo entry hoàn nguyên, không sửa/xóa ledger cũ.
- Retry dùng idempotency key; release/cancel dùng optimistic version và rollback khi stale.
- Event reservation append-only lưu actor, reason, quantity và stock transaction.
- Projection theo dòng hiển thị approved, active reserved, consumed và unallocated.
- UI hỗ trợ xem tiến độ, tạo reserve, release và cancel; PX chỉ xem dữ liệu đúng scope.
- Không sửa dữ liệu NCVT hoặc tồn kho legacy.

## Migration

`db/29-ncvt-reservation.sql`

## Acceptance

`test/test-ncvt-reservations.js` kiểm tra approved-only, demand cap, available cap, atomic rollback, idempotency, partial release, cancel, immutable audit, projection và RBAC.

## Tiếp theo

Dừng review tại TASK 16. Task đề xuất kế tiếp là **TASK 17 — Phiếu xuất/cấp phát**; chưa triển khai trong commit này.
