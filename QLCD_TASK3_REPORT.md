# QLCD TASK 3 — Device Master

## Status

Hoàn thành canonical Device Master theo chiến lược migration song song, không drop hoặc rewrite `thiet_bi`.

## Delivered

- `devices`: Device ID và hồ sơ kỹ thuật tách khỏi dữ liệu kế toán.
- `device_legacy_map`: truy vết hai chiều về ID `thiet_bi` hiện hữu.
- `asset_device_links`: quan hệ asset/device nhiều-nhiều, có loại quan hệ, liên kết chính và khoảng hiệu lực.
- Backfill tự động từ toàn bộ `thiet_bi` hợp lệ; tự nối Asset và Device cùng nguồn legacy.
- API CRUD, tìm kiếm/filter/phân trang, optimistic locking, soft archive, RBAC và multi-unit scope.
- API quản lý liên kết Asset/Device; kết thúc liên kết giữ nguyên lịch sử.
- API legacy trả thêm `device_id` và `asset_id` để giữ tương thích đọc cho UI/nghiệp vụ hiện tại.

## Safety boundary

- Không xóa hoặc đổi cấu trúc bảng legacy.
- Không đổi đơn vị trực tiếp trong Device CRUD; movement thuộc Task 4–5.
- Các module bảo dưỡng, sửa chữa, kiểm định và sự cố tiếp tục dùng `thiet_bi` cho tới khi từng module có parity test với Device ID.
- Device tạo mới trực tiếp trên canonical API chưa tự tạo record legacy; do đó chưa tham gia các workflow legacy cho đến giai đoạn chuyển đổi module.

## Next

TASK 4 — Asset Transaction Ledger: append-only entries, idempotent posting, reversal và projection/reconciliation với dữ liệu legacy.
