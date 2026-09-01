# TASK 11 — Warehouse + Stock Ledger

## Phạm vi hoàn thành

- Warehouse canonical có scope đơn vị; seed `LEGACY-MAIN` để chuyển đổi an toàn.
- Opening balance từ `ton_kho` qua Material ID/UOM canonical, giữ nguyên dữ liệu nguồn.
- Transaction draft, idempotent post, append-only ledger, reversal có tham chiếu và atomic projection rebuild.
- Projection `ON_HAND`, `RESERVED`, `AVAILABLE = ON_HAND - RESERVED`, `INCOMING`.
- Chặn tồn âm, over-reserve, issue vượt available và receive vượt incoming bằng constraint trong transaction.
- API list kho/số dư/đối chiếu, tạo/post/reverse và màn hình Kho & Stock Ledger.

## Tương thích và giới hạn

Luồng canonical không dual-write vào `ton_kho`; màn hình reconciliation hiển thị chênh lệch để kiểm soát chuyển đổi. `LEGACY-MAIN` là kho cầu nối, không thay thế thiết kế chuyển kho. In-transit, giao nhận kho đích và hoàn trả atomic thuộc TASK 12. Reservation hiện là stock transaction tổng quát; allocation theo dòng NCVT và xử lý cạnh tranh chuyên sâu thuộc TASK 16.

## Acceptance gate

Test TASK 11 xác minh opening/reconciliation, bốn projection quantities, idempotency, post retry, reversal, reserve/incoming, rollback khi vi phạm số dư, trigger append-only và không sửa tồn legacy. Quality gate cuối cùng được ghi trong commit/report checkpoint.

- TASK 11 acceptance: 16/16 đạt.
- Toàn bộ regression: 740/740 đạt.
- Lint, typecheck và build: 84 file JavaScript đạt.
