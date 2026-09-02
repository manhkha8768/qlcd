# TASK 27 — Thiết kế staging tạm thời qua Cloudflare Quick Tunnel

## 1. Quyết định và phạm vi

TASK 27 cung cấp một môi trường staging tạm thời cho QLCD hiện tại bằng Docker và Cloudflare Quick Tunnel. Môi trường này phục vụ kiểm tra từ xa trước khi có tên miền riêng; không phải production, không thay thế UAT dữ liệu thực và không mở TASK 28.

Trạng thái TASK 27 sau khi hoàn thành phần này vẫn là `PARTIAL`. URL `*.trycloudflare.com` do Cloudflare cấp ngẫu nhiên, có thể thay đổi sau mỗi lần khởi động và không có cam kết uptime. Hostname Worker `cdvtxlm.manhkha8768.workers.dev` không bị thay đổi hoặc sử dụng làm origin.

Ngoài phạm vi:

- Không deploy lên Cloudflare Workers, D1 hoặc R2.
- Không merge nhánh `origin/feature/cloudflare-foundation`.
- Không thay đổi DNS, Worker đang tồn tại hoặc tài nguyên production.
- Không dùng database production hay tự động sao chép uploads thực.
- Không tự đánh dấu business UAT hoặc sign-off là `PASS`.

## 2. Kiến trúc

Một compose file staging riêng chạy hai service trong cùng mạng Docker:

1. `qlcd-staging` chạy ứng dụng Express/SQLite bằng Docker image ID bất biến. Wrapper chụp một commit cụ thể, tạo build context tạm bên ngoài checkout từ chính commit đó; Compose chỉ tham chiếu image ID và không có quyền build.
2. `cloudflared-staging` chạy Quick Tunnel và chuyển tiếp tới `http://qlcd-staging:3000` qua mạng Docker nội bộ.

Ứng dụng chỉ publish cổng loopback `127.0.0.1` để kiểm tra tại máy chủ; không bind cổng ứng dụng lên mọi interface. `cloudflared` tạo kết nối outbound tới Cloudflare nên máy chủ không cần mở inbound port cho QLCD.

Database, uploads và backup chạy trong ba Docker named volume staging riêng, không bind mount bất kỳ đường dẫn dữ liệu host nào vào ứng dụng. Database được đọc qua file descriptor đã đối chiếu identity, sao chép vào snapshot riêng rồi seed một lần; upload/backup volume khởi tạo rỗng để không vô tình công khai file host. Ba marker chỉ được ghi sau khi seed thành công; volume đã có đủ marker được giữ nguyên khi restart. Secret phiên staging được truyền qua file môi trường nằm ngoài Git.

## 3. Luồng vận hành

### Khởi động

1. Kiểm tra Docker Compose và các biến staging bắt buộc.
2. Từ chối đường dẫn hoặc volume được nhận diện là production, hoặc có đích vật lý nằm trong checkout/build context.
3. Chạy lint, typecheck, test và build; yêu cầu tracked tree sạch, xuất đúng commit đã theo dõi sang build context tạm và dựng image bất biến.
4. Khởi động `qlcd-staging`, chờ `/api/ready` đạt.
5. Khởi động `cloudflared-staging`, đọc URL HTTPS từ log và ghi evidence cục bộ bị Git bỏ qua.
6. Kiểm tra readiness qua URL Quick Tunnel và hiển thị cảnh báo `TEMPORARY STAGING — NOT PRODUCTION`.

### Trạng thái

Lệnh trạng thái hiển thị tình trạng hai container, URL hiện tại và kết quả readiness gần nhất. Evidence không chứa secret, cookie hay dữ liệu đăng nhập.

### Dừng

Lệnh dừng chỉ dừng và gỡ container/network của staging. Volume staging được giữ mặc định. Không cung cấp lệnh xóa volume trong workflow thông thường.

## 4. Cấu hình và bí mật

Các giá trị bắt buộc:

- `QLCD_STAGING_SECRET`: secret riêng tối thiểu 32 ký tự.
- `QLCD_STAGING_DB`: database staging hoặc database tổng hợp đã sao chép ra ngoài checkout; không được trỏ tới database nguồn/production.
- `QLCD_STAGING_UPLOAD`: thư mục uploads staging riêng có đích vật lý ngoài checkout.
- `QLCD_STAGING_BACKUP_DIR`: thư mục backup staging riêng có đích vật lý ngoài checkout.

Validator phải dùng đường dẫn vật lý và lưu identity của database (device/inode/size/mtime). Trước seed, wrapper mở database, đối chiếu identity trên file descriptor, sao chép byte qua descriptor sang snapshot riêng và kiểm tra file không đổi trong lúc đọc. Docker chỉ nhận snapshot riêng; upload/backup host không được sao chép. Compose không nhận đường dẫn host nên symlink/junction không thể làm ứng dụng mount nhầm database hoặc thư mục production.

Runtime ứng dụng dùng `NODE_ENV=production` và `QLCD_INTERNET=1` để kiểm tra đúng cookie/HTTPS/security gate. `QLCD_PUBLIC_HOST` không cố định vì Quick Tunnel cấp hostname sau khi connector khởi động; request hợp lệ đi qua HTTPS và Host do Cloudflare chuyển tiếp.

Không ghi token Cloudflare, mật khẩu hoặc secret vào compose, log evidence, source hay GitHub Actions. Quick Tunnel không cần Tunnel token.

## 5. Tự động hóa

Phần tự động hóa ở TASK 27 chỉ dựng và kiểm tra staging khi người vận hành chạy lệnh rõ ràng. `npm run staging:tunnel:start` tạo image từ commit đã chụp, lấy content-addressed image ID, tạo container, xác nhận cả ba volume rỗng trước khi seed database snapshot và chỉ sau đó ghi đủ marker. Trạng thái không chắc chắn hoặc volume có dữ liệu nhưng thiếu marker đều fail closed. `docker-compose.staging.yml` không chứa `build:` hoặc host data bind mount.

CI tiếp tục chạy quality gate trên push/pull request. Việc tự động phát hành production chỉ được thiết kế sau khi có domain ổn định, UAT TASK 26 đủ sign-off và cơ chế rollback production được duyệt.

## 6. Xử lý lỗi và rollback

- Nếu quality gate, Docker build, local readiness hoặc remote readiness thất bại, lệnh khởi động trả mã lỗi và giữ log để điều tra.
- Nếu Quick Tunnel mất kết nối, ứng dụng staging vẫn chỉ truy cập được qua loopback; khởi động lại connector có thể sinh URL khác.
- Rollback ứng dụng staging dùng image/tag trước đó hoặc checkout commit trước; database không tự restore.
- Restore database chỉ chạy từ backup đã xác minh và theo lệnh riêng hiện có; workflow Quick Tunnel không gọi restore.

## 7. Kiểm thử và tiêu chí chấp nhận

Implementation phải có test tự động cho:

- Cấu hình từ chối secret yếu, database production, đường dẫn staging trùng nhau và mọi database/upload/backup có đích vật lý trong checkout/build context.
- Docker build context tạm nằm ngoài checkout, chỉ chứa file từ commit đã chụp, giữ `db/index.js`, `db/init.js` và các migration SQL; Compose không có `build:` hoặc context repository.
- Compose không publish QLCD ra `0.0.0.0`, dùng volume riêng và chuyển tiếp đúng service nội bộ.
- Parser chỉ chấp nhận URL HTTPS thuộc `trycloudflare.com` từ log connector.
- Evidence không chứa secret.
- Start/status/stop không xóa volume.

Verification cuối gồm lint, typecheck, toàn bộ regression, build, `docker compose config` và smoke test nếu Docker/cloudflared khả dụng. Nếu môi trường không có Docker hoặc không có outbound network, kết quả phải ghi rõ `NOT RUN`; không được báo staging đã triển khai.

## 8. Tài liệu và trạng thái Roadmap

Cập nhật runbook với cách khởi động, lấy URL, kiểm tra và dừng staging. Cập nhật Roadmap:

- TASK 26: vẫn `PARTIAL`, chờ dữ liệu thực và ba sign-off.
- TASK 27: `PARTIAL`, có Quick Tunnel staging tạm nhưng chưa có domain/HA/pipeline/rollback production.
- NEXT RECOMMENDED TASK: hoàn tất TASK 26 và chuẩn bị tên miền ổn định trước production rollout.
