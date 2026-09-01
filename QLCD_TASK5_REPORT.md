# QLCD TASK 5 — Transfer Handover

## Status

Hoàn thành workflow điều chuyển/giao nhận hai đầu trên Asset Ledger canonical; legacy workflow tiếp tục tồn tại để parity/UAT.

## Delivered

- State machine: draft, submitted, sender confirmed, receiver confirmed, approved, posted, rejected/cancelled.
- Bên giao chỉ thao tác theo đơn vị nguồn; bên nhận theo đơn vị đích.
- Mọi dòng trong một phiếu bắt buộc cùng cặp đơn vị nguồn/đích.
- Receiver confirmation bắt buộc có chứng từ.
- Upload/download chứng từ có permission và data-scope check.
- Timeline lưu actor, thời gian, IP, trạng thái trước/sau và lý do.
- Approval và ledger posting trong cùng transaction; lỗi sẽ rollback toàn bộ.
- Direct post bị chặn cho transfer/return; reject bắt buộc lý do và không sinh ledger entry.

## Safety boundary

- Không thay đổi/xóa phiếu điều chuyển legacy.
- Chưa cập nhật trực tiếp Asset Master hoặc `thiet_bi`; projection ledger là nguồn trạng thái mới.
- File hiện lưu local có ACL; object storage/hash/version thuộc Task 9.
- Chưa có QR/offline inventory; thuộc Task 6.

## Next

TASK 6 — Kiểm kê, đối chiếu và QR; chênh lệch chỉ tạo ledger adjustment sau review/approval.
