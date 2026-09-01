# QLCD Asset Ledger Design

## 1. Baseline

Legacy có `thiet_bi`, `giao_dich`, `chi_tiet_giao_dich`, `lich_su_tai_san` và `dieu_chuyen`. Các luồng đã có transaction/approval một phần nhưng `thiet_bi` vẫn giữ `so_luong` và vị trí/đơn vị hiện tại mutable; hai mô hình giao dịch cùng tồn tại. Task 4 đã bổ sung ledger canonical song song; workflow legacy chưa được retire trước parity/UAT.

Sau Task 2, `assets` là Asset Master đích và `asset_legacy_map` giữ quan hệ với `thiet_bi`. CRUD Asset Master cố ý chặn đổi `don_vi_id` trực tiếp. Ledger Task 4 sẽ ghi movement và cập nhật projection thay vì mở lại direct balance/location mutation.

## 2. Ledger target

```text
asset_transactions (header/workflow/idempotency)
  -> asset_ledger_entries (immutable posted movements)
  -> asset_balance_projection (rebuildable current state)
```

Loại transaction: `OPENING`, `RECEIPT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN`, `DISPOSAL`, `ADJUSTMENT`, `REVERSAL`.

Mỗi entry tối thiểu có: transaction ID, asset ID, device ID tùy chọn, source/destination unit/location, quantity, UOM, event time, posted time, actor, approval, source document và reversal-of.

## 3. Invariants

- Entry đã POSTED là append-only; không update/delete.
- Điều chuyển nội bộ tạo cặp OUT/IN trong một database transaction và giữ nguyên Asset/Device ID.
- Tổng company balance trước/sau transfer không đổi.
- Quantity không âm; serial-managed device mặc định quantity = 1.
- Idempotency key duy nhất theo source/system ngăn submit lặp.
- Projection có thể rebuild hoàn toàn từ ledger và phải có reconciliation job.
- Reversal tham chiếu entry gốc, đảo dấu và không cho reverse hai lần.

## 4. Workflow

`DRAFT -> SUBMITTED -> SENDER_CONFIRMED -> RECEIVER_CONFIRMED -> APPROVED -> POSTED`, kèm `REJECTED`, `CANCELLED` trước post và `REVERSED` sau post. Trạng thái có thể đơn giản hóa theo loại giao dịch nhưng POSTED là ranh giới kế toán bắt buộc.

## 5. Migration từ legacy

1. Lập opening entries từ snapshot được phê duyệt; lưu legacy ID/checksum.
2. Map `giao_dich/chi_tiet_giao_dich` đã duyệt sang transaction/entries.
3. So sánh projection với `thiet_bi.phan_xuong_id/so_luong`; xuất exception report, không tự sửa.
4. Chuyển write path theo feature flag; giữ read parity một chu kỳ.
5. Chỉ khóa direct update sau UAT và backup/rollback rehearsal.

## 6. Acceptance

Concurrent approvals không nhân đôi entry; transfer lỗi giữa chừng rollback; reversal rebuild đúng; data-scope ngăn PX A thao tác asset PX B; audit cho biết ai/when/why/document; import lặp không tạo giao dịch kép.

## 7. TASK 4 implementation

Migration `17-asset-ledger.sql` tạo `asset_transactions`, dòng nháp, `asset_ledger_entries` bất biến và `asset_balance_projection`. Opening entries được sinh một lần từ Asset Master. API yêu cầu idempotency key, post nguyên tử, kiểm tra số lượng nguồn, sinh cặp OUT/IN cho transfer, tạo reversal tham chiếu từng entry gốc, rebuild projection và báo reconciliation với `assets/thiet_bi` mà không tự sửa. Task 5 sẽ bổ sung workflow xác nhận giao/nhận/phê duyệt trước POST.
