# TASK 20 — NCVT dashboard

## Kết quả

- Dashboard canonical theo period, chỉ đọc dữ liệu Task 13–19.
- KPI tách bắt buộc theo UOM: approved, active reserved, issued, received/accepted, discrepancy, pending confirmation, remaining-to-issue, unallocated và carry.
- Bộ lọc PX, Material, trạng thái submission, tìm kiếm và mã cảnh báo cùng cập nhật lại KPI/danh sách.
- Cảnh báo chờ review, returned, chưa phân bổ, chờ xác nhận nhận, discrepancy và carry available.
- Drill-down theo dòng nối reservation/kho, issue voucher, receipt và carry lineage.
- `ncvt.dashboard.view` áp dụng permission và data scope server-side; ép PX ngoài scope trả 403.
- UI NCVT có KPI cards theo UOM, alert summary, bảng chi tiết và modal drill-down.
- Dashboard không tạo write path, không sửa Stock Ledger hoặc NCVT legacy.

## Migration

`db/33-ncvt-dashboard.sql`

## Acceptance

`test/test-ncvt-dashboard-canonical.js` kiểm tra KPI/UOM, công thức Task 13–19, filter/search/alert, drill-down, RBAC/data scope và legacy isolation.

## Tiếp theo

Dừng review tại TASK 20. Task đề xuất kế tiếp là **TASK 21 — Repair/maintenance/inspection**; chưa triển khai trong commit này.
