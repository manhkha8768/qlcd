# TASK 15 — NCVT Company Aggregation

## Kết quả

- Tổng hợp động chỉ từ submission `APPROVED`, theo đúng kỳ + Material ID + UOM canonical.
- Drill-down theo PX sử dụng cùng tập dữ liệu nguồn, bảo đảm tổng chi tiết khớp tổng Công ty.
- Danh mục nguồn cung canonical và mapping theo Material; hỗ trợ nguồn ưu tiên, thứ tự, lead time, minimum order và kho nội bộ.
- Mapping dùng optimistic version; event tạo/cập nhật/archive là append-only và được database bảo vệ.
- UI Công ty hiển thị tổng, drill-down, cảnh báo Material chưa mapping và thao tác nguồn cung.
- RBAC tách quyền xem tổng hợp và quản lý nguồn; PX bị chặn ở API.
- Không sửa hoặc xóa dữ liệu NCVT legacy.

## Migration

`db/28-ncvt-company-aggregation.sql`

## Acceptance

`test/test-ncvt-aggregate.js` kiểm tra approved-only, cách ly kỳ, Material/UOM, drill-down, nguồn chưa mapping, CRUD/mapping nguồn, duplicate, concurrency, event bất biến, RBAC và dữ liệu legacy.

## Tiếp theo

Dừng review tại TASK 15. Task đề xuất kế tiếp là **TASK 16 — Reservation**; chưa được triển khai trong commit này.
