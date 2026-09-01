# TASK 14 — Review + approval NCVT

## Phạm vi hoàn thành

- Phân công reviewer theo period/PX; phân công lại revoke bản cũ nhưng giữ lịch sử.
- Chỉ reviewer ACTIVE được return, reject hoặc approve submission SUBMITTED.
- Mọi quyết định bắt buộc lý do, gắn submission version và snapshot dòng tại thời điểm quyết định.
- Decision bị database trigger chặn update/delete.
- RETURNED cho PX phản hồi, mở DRAFT, sửa và resubmit vòng mới; quyết định cũ không đổi.
- REJECTED/APPROVED là terminal; khóa kỳ chỉ khi mọi submission đã có quyết định cuối.
- API, RBAC và UI assignment/review/decision history.

## Giới hạn

TASK 14 duyệt submission ở cấp PX. Tổng hợp số lượng APPROVED theo Material/PX, drill-down và canonical supply source thuộc TASK 15. Không ghi ngược trạng thái review vào bảng NCVT legacy.

## Quality gate

- TASK 14 acceptance: 18/18 đạt.
- Toàn bộ regression: 796/796 đạt.
- Lint, typecheck và build: 90 file JavaScript đạt.
