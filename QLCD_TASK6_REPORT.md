# QLCD TASK 6 — Inventory, Reconciliation and QR

## Status

Hoàn thành luồng kiểm kê canonical song song với module kiểm kê/đối chiếu legacy.

## Delivered

- Mở kỳ và chụp snapshot bất biến từ Asset Ledger projection theo đơn vị.
- QR identity ổn định `QLCD:ASSET:<mã tài sản>` và API resolve Asset.
- Mobile scanner input; draft lưu `localStorage` khi offline.
- Đồng bộ theo client batch ID và payload hash, chống gửi lặp hoặc reuse sai payload.
- Observation tách khỏi snapshot; submit khóa draft và sinh discrepancy.
- Review approve/reject từng discrepancy; reject bắt buộc lý do.
- Approval bị chặn khi còn discrepancy chưa review.
- Sai lệch được duyệt tạo transaction `ADJUSTMENT` và post ledger nguyên tử.
- Location mismatch tạo cặp adjustment OUT/IN; quantity mismatch tạo delta.
- Asset Master và legacy không bị sửa tự động; timeline lưu toàn bộ bước chính.

## Safety boundary

- Không sửa/xóa bảng kiểm kê và đối chiếu legacy.
- QR dùng payload chuẩn và scanner input; camera scanning/tem in hàng loạt chưa được tối ưu UX.
- Draft offline nằm trên trình duyệt thiết bị; chưa có mã hóa local hoặc background sync tự động.
- Điều chỉnh tình trạng kỹ thuật không tự sửa Device Master; thuộc Task 7/21.

## Next

TASK 7 — Hồ sơ kỹ thuật canonical theo Device ID, thuộc tính động có validation/version và cầu nối dữ liệu legacy.
