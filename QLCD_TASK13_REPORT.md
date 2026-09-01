# TASK 13 — NCVT period + PX submission

## Phạm vi hoàn thành

- Period canonical cấp Công ty theo năm/quý với state DRAFT, OPEN, LOCKED, CANCELLED và optimistic version.
- Một submission canonical cho mỗi PX trong một period; create có idempotency key.
- Dòng nhu cầu bắt buộc Material ID, UOM canonical, số lượng dương, công trình và giải trình tùy chọn.
- PX chỉ sửa DRAFT khi period OPEN; submit khóa nội dung, tăng version và ghi event append-only.
- Backfill `ncvt_ky/ncvt_chi_tiet` qua legacy map và Material mapping, không rewrite dữ liệu nguồn.
- API, RBAC/data scope và UI tạo/mở/khóa kỳ, lập draft, thêm dòng và submit.

## Giới hạn

Backfill giữ submission ở DRAFT để người dùng xác nhận, không suy diễn trạng thái phê duyệt từ workflow legacy. Reviewer assignment, return, reject, approve và immutable decision thuộc TASK 14; tổng hợp Công ty thuộc TASK 15.

## Quality gate

- TASK 13 acceptance: 20/20 đạt.
- Toàn bộ regression: 778/778 đạt.
- Lint, typecheck và build: 89 file JavaScript đạt.
