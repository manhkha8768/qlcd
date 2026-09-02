# QLCD TASK 26 Report — UAT dữ liệu thực

## Status

PARTIAL — technical UAT framework hoàn thành; business UAT trên dữ liệu thực và sign-off đang chờ.

## Delivered

- Tạo staging bằng online backup sang đường dẫn mới, không ghi đè và kiểm tra hash nguồn không đổi.
- Áp migration còn thiếu chỉ trên staging.
- Ẩn danh người dùng, thông tin người/IP/user-agent/free-text/JSON; vô hiệu hóa tài khoản nguồn.
- Không sao chép uploads legacy; manifest không chứa mật khẩu và ghi rõ sign-off `PENDING`.
- Tạo tài khoản theo vai trò admin, CĐVT và tối đa hai PX.
- Automated UAT kiểm tra readiness, anonymous denial, login ba vai trò, RBAC/data scope và database integrity.
- Kế hoạch UAT end-to-end, cổng đạt và bảng ký xác nhận.

## Evidence available now

- Database cục bộ được audit chỉ có dữ liệu seed: 0 PX, 0 Asset, 0 Device, 0 Material.
- Technical acceptance dùng fixture có hai PX và dữ liệu nhạy cảm giả lập: 24/24 đạt.
- Technical staging smoke trên bản sao cục bộ: 12/12 đạt; giao diện staging hiển thị đúng màn hình đăng nhập.
- Full regression: 1.020/1.020 đạt. Lint/typecheck/build: 133 file đạt.
- Sửa fixture migration rehearsal của các task cũ để migration 37 chỉ chạy sau schema phụ thuộc; cập nhật chứng từ test thành PDF có chữ ký nội dung hợp lệ.
- Kết quả tự động không được thay thế chữ ký của người dùng nghiệp vụ.

## Pending exit gates

- Nhận bản sao dữ liệu thật đã được phép sử dụng.
- Người phụ trách dữ liệu rà soát danh mục trường ẩn danh và quét/mẫu kiểm tra staging thực; cơ chế hiện tại dựa trên các trường đã phân loại nên không thể tự bảo đảm cho trường nghiệp vụ mới hoặc dữ liệu tự do chưa biết trước.
- Chạy `uat:prepare` và `uat:run` trên staging tách biệt.
- Thực hiện UAT-A đến UAT-H, xử lý/retest lỗi.
- Đại diện PX, CĐVT Công ty và quản trị hệ thống ký PASS.

## Next

Hoàn tất business sign-off TASK 26. Chưa được chuyển TASK 27 trước khi đủ exit gate.
