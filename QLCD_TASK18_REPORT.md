# TASK 18 — PX xác nhận nhận

## Kết quả

- PX lập receipt chỉ cho phiếu cấp phát POSTED trong đúng scope.
- Xác nhận từng dòng/từng đợt, tách accepted, damaged, wrong và refused.
- Batch tự phân loại RECEIVED, DISCREPANCY hoặc REFUSED.
- Atomic recheck chặn nhiều draft xác nhận vượt số issued.
- Dòng và timeline sau confirm là bất biến; draft cancel dùng optimistic version.
- Projection giữ riêng issued, accepted, discrepancy và pending confirmation.
- Receipt không tự thay đổi Stock Ledger hoặc reservation.
- Chặn reversal issue trực tiếp sau khi đã có receipt terminal.
- UI PX hỗ trợ xem tiến độ, lập draft, khai số lượng và confirm/cancel.
- Không ghi ngược dữ liệu NCVT/cấp phát legacy.

## Migration

`db/31-ncvt-receipt-confirmation.sql`

## Acceptance

`test/test-ncvt-receipts.js` kiểm tra partial received, race, discrepancy, refusal, ledger isolation, reversal guard, immutability, idempotency và data scope.

## Tiếp theo

Dừng review tại TASK 18. Task đề xuất kế tiếp là **TASK 19 — Carry forward + lock**; chưa triển khai trong commit này.
