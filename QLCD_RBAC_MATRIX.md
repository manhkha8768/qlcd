# QLCD RBAC and Data Scope Matrix

## 1. Baseline

Role legacy: `admin`, `cd_cty`, `px`, `xem`. Session chỉ mang một `phan_xuong_id`. Code có hai engine quyền:

- `middleware/quyen.js`: role guard, scope một PX và các bảng `vai_tro_quyen`/`nguoi_dung_vai_tro`.
- `middleware/quyen-ma.js`: permission override qua `quyen_vai_tro`/`quyen_nguoi_dung`.

Sự trùng lặp này làm kết quả quyền phụ thuộc route dùng middleware nào. P0: `dashboard.js` và `khovat.js` gọi sai `coMaQuyenNay`; authorization không thực thi. Anonymous hiện bị chặn gián tiếp bởi router `/api`, nhưng audit runtime xác nhận user role `xem` không có permission vẫn nhận HTTP 200. Tất cả quyền dưới đây là target contract, chưa được coi là đạt cho tới khi có test 401/403/scope.

## 2. Data scopes đích

| Scope | Ý nghĩa |
|---|---|
| `COMPANY` | Toàn Công ty theo permission cụ thể |
| `ASSIGNED_UNITS` | Nhiều phân xưởng/kho/công trình được giao, có hiệu lực từ–đến |
| `OWN_UNIT` | Đơn vị làm việc chính |
| `OWN_RECORDS` | Bản nháp do chính user tạo |

Scope phải được resolve server-side từ assignment; không tin `unit_id` client gửi. Danh sách Phân xưởng/kho là seed có thể thay đổi, tuyệt đối không hard-code.

## 3. Matrix vai trò nghiệp vụ

Legend: V=view, C=create/edit draft, S=submit, A=approve/reject, X=admin/config, `—`=deny.

| Chức năng | System Admin | Phòng CĐVT | Chủ nhiệm công trình | PX/Cơ điện PX | Thủ kho | Người xem |
|---|---:|---:|---:|---:|---:|---:|
| User/role/permission | X | — | — | — | — | — |
| Organization/assignment | X | C/A company | V assigned | V own | V own | V scoped |
| Asset/device master | X | V/C/A company | V/C assigned | V/C own | V scoped | V scoped |
| Asset transaction | X | V/C/A company | V/C/S assigned | V/C/S own | V/C/S warehouse | V scoped |
| Inventory/reconciliation | X | V/C/A company | V/C/S assigned | V/C/S own | V/C/S own | V scoped |
| Technical profile/files | X | V/C company | V/C assigned | V/C own | V scoped | V scoped |
| Material master | X | V/C/A company | V | V | V/C | V scoped |
| Warehouse ledger | X | V/A company | V assigned | V own | V/C/S own warehouse | V scoped |
| NCVT draft/submit | X | V/A company | V/A assigned | V/C/S own | V | V scoped |
| Material reserve/issue | X | V/C/A company | V assigned | V/receive own | V/C/S own warehouse | V scoped |
| Report/export | X | V company | V assigned | V own | V own | V scoped if granted |
| Audit/security/config | X | V audit if granted | — | — | — | — |

Separation of duties: người tạo không tự duyệt giao dịch nhạy cảm; override cấp vượt/tồn âm mặc định bị cấm và nếu được mở phải có permission riêng, lý do và approval.

## 4. Permission naming target

Chuẩn hóa dạng `resource.action`, ví dụ: `asset.view`, `asset.create`, `asset_transaction.submit`, `asset_transaction.approve`, `inventory.perform`, `document.upload`, `material.manage`, `stock.issue`, `ncvt.submit`, `ncvt.approve`, `report.export`, `audit.view`. Loại bỏ việc cùng tồn tại mã hoa (`GD_TAO`) và mã thường (`filemau.xem`) sau migration có mapping.

## 5. Acceptance tests bắt buộc Task 1

- Anonymous nhận 401 ở mọi API trừ health/login; không có route chỉ dựa vào function truthy.
- Authenticated thiếu permission nhận 403; không rò existence của record ngoài scope.
- User có 2+ đơn vị chỉ thấy đúng assignments còn hiệu lực.
- Gọi API thủ công với `unit_id` khác không mở rộng scope.
- Admin bypass được ghi audit; deny override ở user thắng allow role theo policy đã chốt.
- Test toàn bộ route table tự động phát hiện endpoint không gắn policy.

## 6. TASK 15 permissions

`ncvt.aggregate.view` chỉ cấp cho `admin` và `cd_cty`, phạm vi COMPANY; PX không được đọc tổng hợp hoặc drill-down toàn Công ty. `ncvt.supply.manage` chỉ cấp cho hai vai trò này để tạo nguồn cung và thay đổi mapping Material. API kiểm tra permission ở server; việc ẩn nút trên UI không thay thế authorization.

TASK 16: `ncvt.reservation.manage` và `ncvt.reservation.release` chỉ cấp `admin`/`cd_cty`; `ncvt.reservation.view` cấp thêm PX nhưng dữ liệu được lọc server-side theo đơn vị submission. PX không được tự reserve, release hoặc cancel bằng cách gọi API trực tiếp.

TASK 17: `ncvt.issue.create/submit/approve/post/reverse` cấp `admin` và `cd_cty`; người lập không được tự quyết định trừ admin override. PX chỉ có `ncvt.issue.view`, kết quả lọc theo đơn vị của voucher và không thể tạo/post bằng API thủ công.

TASK 18: PX có `ncvt.receipt.view/create/confirm` nhưng tất cả API lọc và kiểm tra lại `don_vi_id` của issue voucher. Phòng CĐVT chỉ xem toàn Công ty qua `ncvt.receipt.view`; admin có quyền override. PX khác nhận 403 khi tạo receipt và không thấy progress ngoài scope.

TASK 19: `ncvt.carry.manage` chỉ cấp `admin` và `cd_cty`, cho phép post carry-forward ở phạm vi Công ty. `ncvt.carry.view` cấp thêm PX nhưng API eligible, danh sách batch và chi tiết lineage đều kiểm tra scope đơn vị ở server. PX không thể post bằng API thủ công; batch có nhiều PX chỉ được trả khi toàn bộ dòng nằm trong scope của người đọc.

TASK 20: `ncvt.dashboard.view` cấp cho `admin`, `cd_cty`, `px` và vai trò chỉ xem. Admin/CĐVT xem theo scope được gán hoặc COMPANY; PX/chỉ xem chỉ nhận các dòng thuộc đơn vị hiệu lực của mình. Tham số `don_vi_id` ngoài scope trả 403 và drill-down kiểm tra lại đơn vị của submission line. Permission chỉ cho đọc; dashboard không có endpoint mutation.
