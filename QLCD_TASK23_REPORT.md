# QLCD TASK 23 Report — Reporting/Excel/PDF/print

## Status

COMPLETED trên nhánh `task23/reporting-exports-print`.

## Delivered

- Report Center canonical với 7 mẫu: Asset, Device, Asset Ledger, Stock Balance, NCVT Fulfillment, Technical Operations và Data Quality.
- Một query registry dùng chung cho màn hình, XLSX, PDF và bản in; hỗ trợ search, trạng thái, kỳ, thời gian, đơn vị, sort whitelist và server-side paging.
- Data scope áp dụng trước query/export; tham số ngoài scope trả 403 và report legacy bị chặn với tài khoản PX.
- Excel mẫu chuẩn có metadata/filter, freeze header, auto-filter, định dạng cột và page setup.
- PDF Unicode và bản in HTML có tiêu đề lặp, page orientation/footer và CSS in.
- Export limit chống file quá lớn; nhật ký SUCCEEDED/FAILED lưu actor, filter/scope, row count, duration và SHA-256 bất biến.
- RBAC tách view, Excel, PDF, print và audit; người xem không được xuất file.

## Acceptance

- TASK 23 acceptance: 28/28 checks pass.
- Full regression: 961/961 checks pass.
- Lint/typecheck/build: 113 JavaScript files pass.
- UI browser QA: menu, 7 mẫu, đổi mẫu/filter, bảng, empty state, Excel audit và lịch sử xuất hiển thị đúng; không có console warning/error.

## Known issue

- PDF là bảng tổng quát; mẫu chứng từ có chữ ký/đóng dấu riêng vẫn thuộc từng workflow nghiệp vụ.
- Export chạy đồng bộ và giới hạn 10.000 dòng; dataset lớn hơn cần background job/object storage ở TASK 25.
- API dashboard legacy vẫn còn cho vai trò toàn cục để tương thích; đã chặn PX vì legacy query không hỗ trợ unit scope.

## Next

TASK 24 — Security hardening.
