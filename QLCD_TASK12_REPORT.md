# TASK 12 — Chuyển kho + hoàn trả

## Phạm vi hoàn thành

- Phiếu chuyển kho canonical có kho nguồn, kho đích, Material ID/UOM, version và idempotency key.
- State machine `DRAFT → DISPATCHED → RECEIVED` hoặc `DRAFT → DISPATCHED → RETURNED`.
- Dispatch, receive và return post Stock Ledger cùng workflow transition trong một database transaction.
- Timeline append-only và liên kết từng transition tới stock transaction tương ứng.
- UI lập phiếu, xuất chuyển, xác nhận nhận và hoàn trả có lý do.

## Bảo đảm số dư

Trong thời gian vận chuyển, hàng không còn trong `ON_HAND` nguồn và chỉ nằm trong `INCOMING` đích. Receive mới đưa vào `ON_HAND` đích; return phục hồi `ON_HAND` nguồn và xóa `INCOMING` đích. Constraint projection chặn dispatch vượt available và mọi receive/return vượt incoming; lỗi rollback cả ledger lẫn trạng thái phiếu.

## Giới hạn

TASK 12 xử lý full-line receive/return. Partial receipt, discrepancy và refusal theo dòng sẽ được nối với nghiệp vụ cấp phát/nhận ở TASK 18. Workflow không ghi ngược vào `ton_kho` legacy.

## Quality gate

- TASK 12 acceptance: 18/18 đạt.
- Toàn bộ regression: 758/758 đạt.
- Lint, typecheck và build: 86 file JavaScript đạt.
