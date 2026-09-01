# TASK 19 — Carry forward + lock

## Kết quả

- Chỉ carry từ period LOCKED sang đúng quý kế tiếp đang OPEN.
- Eligible được tính `APPROVED - POSTED issued - active reserved - already carried` theo dòng canonical.
- Post batch nguyên tử tạo hoặc dùng submission DRAFT ở kỳ đích, giữ Material ID/UOM.
- Mỗi dòng lưu lineage nguồn–đích và snapshot định lượng để audit/drill-down.
- Idempotency bao gồm kỳ nguồn, kỳ đích, lý do và các dòng/số lượng; retry không nhân dữ liệu.
- Batch, lineage và event là append-only; batch được niêm phong sau POST.
- Database khóa update/delete period, submission và submission line thuộc kỳ LOCKED.
- API list/detail/eligible áp dụng permission và data scope server-side; PX chỉ xem đúng đơn vị.
- UI NCVT hỗ trợ chọn kỳ, xem công thức eligible, nhập lượng carry và xem lịch sử/lineage.
- Không sửa dữ liệu NCVT hoặc tồn kho legacy; carry-forward không post Stock Ledger.

## Migration

`db/32-ncvt-carry-forward-lock.sql`

## Acceptance

`test/test-ncvt-carry-forward.js` kiểm tra công thức eligible, kỳ kế tiếp, transaction rollback, idempotency, double-carry, lineage/snapshot, locked immutability, append-only, RBAC/scope, target draft và legacy isolation.

## Tiếp theo

Dừng review tại TASK 19. Task đề xuất kế tiếp là **TASK 20 — NCVT dashboard**; chưa triển khai trong commit này.
