# TASK 17 — Phiếu xuất/cấp phát NCVT

## Kết quả

- Voucher canonical có workflow draft, submit, approve/reject, post, cancel và reversal.
- Dòng cấp phát bắt buộc liên kết reservation cùng đơn vị, kho, Material và UOM.
- Quyết định approve/reject lưu snapshot versioned và bất biến.
- Post consume reservation, giảm ON_HAND/RESERVED và cập nhật voucher nguyên tử.
- Hỗ trợ cấp nhiều đợt; recheck tại post chống hai phiếu double-consume.
- Retry post không nhân transaction hoặc ledger entry.
- Reversal tạo entry đối ứng và phục hồi reservation; không sửa ledger cũ.
- Projection issued chỉ tính phiếu POSTED, loại REVERSED.
- UI hỗ trợ lập phiếu, xem timeline, submit, approve/reject, post và reversal.
- Không ghi ngược dữ liệu `ncvt_cap_phat`/`ncvt_chi_tiet` legacy.

## Migration

`db/30-ncvt-material-issue.sql`

## Acceptance

`test/test-ncvt-issues.js` kiểm tra workflow, approval snapshot, multi-issue, atomic ledger, idempotency, tranh chấp reservation, reversal, immutable history, RBAC và legacy compatibility.

## Tiếp theo

Dừng review tại TASK 17. Task đề xuất kế tiếp là **TASK 18 — PX xác nhận nhận**; chưa triển khai trong commit này.
