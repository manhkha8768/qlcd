# QLCD TASK 4 — Asset Transaction Ledger

## Status

Hoàn thành ledger canonical song song; chưa thay thế workflow `giao_dich` legacy.

## Delivered

- Transaction header có trạng thái, nguồn chứng từ và idempotency key duy nhất.
- Draft lines tách khỏi posted ledger entries.
- Opening balance idempotent từ Asset Master.
- Atomic posting cho receipt, disposal, transfer, return và adjustment.
- Transfer tạo cặp OUT/IN, không đổi tổng số lượng toàn Công ty.
- Trigger chặn update/delete entry đã post.
- Reversal transaction đảo từng entry và chặn reverse lặp.
- Projection theo Asset/đơn vị/vị trí có thể rebuild hoàn toàn.
- Reconciliation so sánh ledger với `assets` và `thiet_bi`, không tự sửa nguồn.
- RBAC và multi-unit data scope.

## Safety boundary

- Không sửa/xóa bảng hoặc giao dịch legacy.
- Không cập nhật trực tiếp số lượng/đơn vị trong Asset Master khi post.
- PX chưa được post; Task 5 bổ sung giao nhận hai đầu và approval.
- Chưa migrate các phiếu legacy đã duyệt; opening snapshot giữ baseline cho ledger mới.

## Next

TASK 5 — Điều chuyển và giao nhận hai đầu: sender confirmation, receiver confirmation, approval, chứng từ và atomic post vào ledger.
