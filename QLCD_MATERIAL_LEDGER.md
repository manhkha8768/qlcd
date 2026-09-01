# QLCD Material and Stock Ledger Design

## 1. Baseline

`db/13-kho-vat-tu.sql` có `kho_vat_tu`, `ton_kho`, `giao_dich_kho`, `giao_dich_kho_chi_tiet`, `lich_su_kho`. NCVT cấp phát và kho đã có liên kết một phần. Tuy nhiên chưa có Material Master chuẩn duy nhất, reservation, available/incoming, transfer in-transit, receipt discrepancy và ledger append-only làm source of truth. Một số route kho hiện bị lỗi guard authorization P0.

## 2. Target entities

- `materials`, `material_aliases`, `units_of_measure`, approved conversions.
- `warehouses`, `warehouse_locations`.
- `material_transactions`, `material_ledger_entries`.
- `material_reservations` và allocation links tới NCVT.
- `stock_balance_projection` theo material/warehouse/lot khi cần.

Transaction types: `OPENING`, `PURCHASE_RECEIPT`, `TRANSFER_OUT`, `TRANSFER_IN`, `ISSUE`, `RETURN`, `ADJUSTMENT`, `SCRAP`, `REVERSAL`.

## 3. Công thức và invariants

```text
ON_HAND   = SUM(posted ledger entries)
RESERVED  = SUM(active reservations)
AVAILABLE = ON_HAND - RESERVED
INCOMING  = posted/shipped transfer or purchase not yet received
```

- Không sửa trực tiếp `ton_kho`; projection chỉ là cache có thể rebuild.
- Reserve dùng atomic conditional write; `RESERVED <= ON_HAND` trừ policy backorder được phê duyệt.
- Issue posted vừa giảm ON_HAND vừa consume reservation trong cùng transaction.
- Transfer-out đưa hàng vào in-transit; transfer-in chỉ post khi kho nhận.
- UOM phải khớp hoặc có conversion version đã phê duyệt.
- Mọi reversal tham chiếu transaction gốc; không xóa lịch sử.

## 4. Quan hệ với NCVT và sửa chữa

Approved NCVT tạo demand, không tự giảm stock. Allocation/reservation làm giảm AVAILABLE. Phiếu cấp phát tạo ISSUE; PX xác nhận tạo receipt acknowledgement/discrepancy, không tạo tồn kho thứ hai. Vật tư dùng cho sửa chữa liên kết ISSUE line với repair/component.

## 5. Migration

Chuẩn hóa mã vật tư từ `ncvt_chi_tiet`, `phu_tung`, `ton_kho` bằng candidate matching + user review; không auto-merge. Tạo opening ledger từ snapshot kho đã ký, so khớp với lịch sử legacy, rồi chuyển từng kho/module qua write path mới có feature flag.

## 6. Acceptance

Test race reserve/issue, over-reserve, tồn âm, transfer lỗi giữa chừng, return, reversal, UOM mismatch, import trùng, rebuild projection và authorization giữa hai kho.

## 7. TASK 16 reservation

`material_reservations` là allocation có truy vết từ dòng NCVT APPROVED tới kho. Số đang giữ bằng `reserved_quantity - released_quantity - consumed_quantity`; tổng đang giữ làm giảm AVAILABLE qua Stock Ledger, không phải cột tồn độc lập. Reserve và release/cancel đều post ledger trong cùng transaction với thay đổi workflow. Idempotency bảo vệ retry, optimistic version bảo vệ release đồng thời, còn constraint projection là hàng rào cuối chống over-reserve. Task 17 sẽ consume reservation cùng ISSUE; TASK 16 chưa xuất kho và không giảm ON_HAND.

## 8. TASK 17 issue

Phiếu cấp phát canonical chỉ nhận dòng từ reservation. Post ISSUE ghi `ON_HAND -q` và `RESERVED -q` đồng thời, tăng `consumed_quantity` của reservation và khóa voucher POSTED trong cùng transaction. Nhiều phiếu có thể cấp từng đợt; phần còn lại luôn được đọc lại tại thời điểm post để chống double-consume. Reversal sinh stock entry đối ứng và phục hồi reservation. `issued` là số phiếu POSTED chưa reversal; chưa được coi là `received` cho tới TASK 18.
