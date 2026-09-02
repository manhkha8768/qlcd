# QLCD UAT Plan — TASK 26

## 1. Mục tiêu và điều kiện vào

UAT phải chạy trên staging tách biệt, dùng bản sao database đã ẩn danh và chọn 1–2 PX đại diện. Không dùng database production trực tiếp. File tải lên từ nguồn không được sao chép tự động.

Điều kiện vào:

- Có bản backup nguồn đã được người phụ trách dữ liệu cho phép sử dụng.
- Người phụ trách dữ liệu duyệt phạm vi trường cần ẩn danh và kiểm tra lại mẫu dữ liệu staging trước khi cấp quyền cho nhóm UAT.
- Có đường dẫn staging riêng, dung lượng lưu trữ và mật khẩu UAT tối thiểu 12 ký tự.
- Có đại diện PX, CĐVT Công ty và quản trị hệ thống tham gia ký xác nhận.
- TASK 0–25 và full regression đều đạt.

## 2. Chuẩn bị staging

Thiết lập `QLCD_UAT_SOURCE_DB`, `QLCD_UAT_DB`, `QLCD_UAT_PASSWORD`, sau đó chạy `npm run uat:prepare -- --units <PX_ID_1>,<PX_ID_2>`. Nếu không truyền `--units`, công cụ chọn tối đa hai PX hoạt động đầu tiên và ghi ID vào manifest để người phụ trách xác nhận.

Công cụ bắt buộc:

- Sao lưu online sang file mới và từ chối nếu đích trùng nguồn hoặc đã tồn tại.
- Áp dụng migration còn thiếu chỉ trên bản staging.
- Ẩn danh người dùng, tên người, IP, user-agent, ghi chú/free-text và JSON có thể chứa dữ liệu nhạy cảm.
- Vô hiệu hóa toàn bộ tài khoản nguồn; chỉ tạo `uat_admin`, `uat_cdcty`, `uat_px01`, `uat_px02` theo số PX được chọn.
- Không sao chép uploads; phát hành manifest không chứa mật khẩu.
- Chạy `quick_check`, `foreign_key_check` và xác nhận hash nguồn không đổi.

Tùy chọn `--allow-synthetic` chỉ dành cho kiểm thử kỹ thuật khi nguồn chưa có PX. Kết quả này không được coi là UAT dữ liệu thực.

## 3. Ma trận hành trình nghiệp vụ

| Mã | Vai trò | Hành trình | Bằng chứng tối thiểu | Ký |
|---|---|---|---|---|
| UAT-A | PX 01 | Asset/Device → điều chuyển gửi → kiểm kê/QR → hồ sơ kỹ thuật | ID giao dịch, chứng từ đã khử nhạy cảm, kết quả scope | PX 01 |
| UAT-B | PX 02 | Nhận điều chuyển → xác nhận hai đầu → kiểm kê sai lệch → đề nghị adjustment | Timeline, ledger projection trước/sau | PX 02 |
| UAT-C | PX 01/02 | NCVT draft → submit → sửa sau return → resubmit | Submission/version/event history | PX |
| UAT-D | CĐVT | Assign reviewer → approve/reject → tổng hợp Công ty → reservation | Decision snapshot, aggregate drill-down | CĐVT |
| UAT-E | Kho/CĐVT | Chuyển kho/nhận/hoàn → phiếu xuất → PX xác nhận nhận | Stock ledger/projection, không double stock | CĐVT/PX |
| UAT-F | Kỹ thuật | Repair/maintenance/inspection → cấp vật tư → reversal hợp lệ | Work-order events, stock transaction | CĐVT |
| UAT-G | Quản trị | RBAC/scope, báo cáo Excel/PDF/print, thông báo, error queue | Export hash/audit, bằng chứng quyền bị chặn | Admin |
| UAT-H | Hệ thống | Backup/restore drill, readiness, tải đồng thời, graceful restart | Manifest/checksum, metrics, logs | Admin |

## 4. Cổng đạt

- Automated technical journey: 100% đạt và không có lỗi 5xx chưa xử lý.
- Không phát hiện tài khoản nguồn hoạt động hoặc dữ liệu nhận diện cá nhân trong các trường đã phân loại.
- Người phụ trách dữ liệu xác nhận không còn dữ liệu nhạy cảm ngoài danh mục trường đã phân loại; nếu phát hiện trường mới phải bổ sung quy tắc ẩn danh và tạo lại staging.
- Ledger, projection và báo cáo khớp ở từng checkpoint; không ghi đôi khi gửi lại request.
- Mỗi lỗi nghiệp vụ có mức độ, người xử lý và quyết định retest.
- Ba nhóm vai trò ký PASS; nếu còn lỗi nghiêm trọng hoặc chưa đủ chữ ký, TASK 26 giữ trạng thái `PARTIAL`.

Chạy technical journey bằng `npm run uat:run`. Bằng chứng JSON được ghi ngoài source và không chứa mật khẩu.

## 5. Sign-off

| Vai trò | Người xác nhận | Kết quả | Ngày | Ghi chú/chữ ký |
|---|---|---|---|---|
| Đại diện PX 01/02 | Chờ phân công | PENDING | | |
| CĐVT Công ty | Chờ phân công | PENDING | | |
| Quản trị hệ thống | Chờ phân công | PENDING | | |

Chỉ sau khi cả ba dòng chuyển sang `PASS` mới được đổi Roadmap TASK 26 thành Hoàn thành và đề xuất TASK 27.
