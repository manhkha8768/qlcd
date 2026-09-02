# QLCD TASK 24 Report — Security hardening

## Status

COMPLETED trên nhánh `task24/security-hardening`.

## Delivered

- Route registry và automated policy audit cho 394 method/path; một public endpoint, không route thiếu xác thực.
- Session ID rotation sau đăng nhập, logout xóa cookie, cookie priority cao và production secret fail-closed.
- Origin + Fetch Metadata CSRF guard tương thích client hiện tại; kiểm tra định dạng Idempotency-Key.
- Request ID, API no-store, body limit nhỏ hơn và phản hồi lỗi 500 không lộ stack/message nội bộ.
- HTTPS redirect dùng public host cấu hình hoặc Host đã validate, chặn host header không hợp lệ.
- Upload hardening tập trung cho document, chứng từ, kỹ thuật, import tài sản/NCVT và File mẫu: whitelist extension, tên file an toàn, magic signature, giới hạn kích thước; file disk sai bị xóa.
- Password policy nhất quán cho admin tạo/reset tài khoản khi chạy internet.

## Acceptance

- TASK 24 acceptance: 17/17 checks pass.
- Route policy audit: 394 routes, 393 protected, 1 explicitly public, 0 missing.
- Existing security suite: 37/37 checks pass.
- Full regression: 978/978 checks pass, gồm các suite idempotency/concurrency/append-only hiện có.
- Lint/typecheck/build: 117 JavaScript files pass.

## Migration

Không có migration mới. TASK 24 chỉ harden middleware, route registration, upload validation, session và quality gates; không sửa hoặc xóa dữ liệu nghiệp vụ.

## Known issues

- CSP vẫn cần `unsafe-inline` vì UI legacy còn inline handlers/styles; loại bỏ cần refactor UI có kiểm thử riêng.
- Rate limiting vẫn theo bộ nhớ từng process; production nhiều instance cần shared limiter/WAF ở TASK 25/27.
- Local disk storage vẫn phù hợp single-node; multi-instance cần object storage lifecycle/virus scanning trước production.
- CSRF dùng browser Origin/Fetch Metadata để giữ tương thích client hiện tại; nếu mở API cho đối tác phải bổ sung token/API credential contract riêng.

## Next

TASK 25 — Performance + production readiness.
