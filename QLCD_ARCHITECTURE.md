# QLCD Architecture Baseline and Gap Analysis

> Baseline audit: 2026-09-01 | Branch: `main` | Commit: `fd65edc8ee80ac3f4e11d3016f52c4a1fc159585`

## 1. Kết luận kiến trúc

QLCD hiện là monolith Node.js/CommonJS chạy Express 4, giao diện HTML/CSS/JavaScript tĩnh, SQLite (`better-sqlite3`) và lưu file trên đĩa cục bộ. Hệ thống có nhiều nghiệp vụ thật và không nên rewrite. Cách an toàn là giữ legacy chạy được, ổn định Foundation và bổ sung ledger/migration theo từng Task.

Nhánh `feature/cloudflare-foundation` (HEAD `374a82f`) thêm monorepo React/TypeScript/Vite + Hono/Cloudflare Workers, D1/R2/KV và CI. Tuy nhiên D1/KV ID còn placeholder, backend mới có health/auth sơ bộ, frontend mới có Health page, chưa migrate 81 bảng/route/nghiệp vụ legacy. Nhánh này là spike/scaffold, không phải baseline production và không được merge trong Task 0.

Quality gate độc lập trên nhánh cho thấy typecheck và production build đạt; lint thất bại vì không có ESLint config; không có file test/spec và test runner không hoàn thành. Workflow CI còn trỏ cache tới `backend/package-lock.json`/`frontend/package-lock.json` trong khi nhánh chỉ có root lockfile. Do đó nhãn commit “foundation complete” chưa tương ứng với một pipeline xanh có thể tái lập.

## 2. Cấu trúc đang chạy trên `main`

```text
Browser (public/*.html, public/js/*.js)
        |
        v
Express server.js -> routes/*.js -> lib/*.js -> better-sqlite3
        |                                 |
        +-> middleware auth/RBAC/security +-> db/qlcd.db
        +-> multer -> uploads/*
```

- Startup tự chạy `db/init.js`, lần lượt thực thi `db/01-schema.sql` đến `13-kho-vat-tu.sql`.
- API gồm auth, danh mục, thiết bị, giao dịch, bảo dưỡng, kiểm định, kỹ thuật, sự cố, NCVT, import, kiểm kê, đối chiếu, kho và dashboard.
- Session được lưu trong SQLite, không còn dùng MemoryStore.
- Deploy hiện có Docker, Docker Compose, Railway/Procfile, PM2/Windows và hướng dẫn Cloudflare Tunnel. `main` chưa có GitHub Actions, Wrangler, D1 hay R2.
- Repo có bản sao gần đầy đủ trong `qlcd/`; ba file khác top-level là `db/index.js`, `db/init.js`, `middleware/bao-mat.js`. Đây là rủi ro drift/release packaging.

## 3. Điểm mạnh cần giữ

- Nghiệp vụ legacy khá rộng; schema có 81 bảng, view, trigger, index và 13 script SQL.
- Có transaction cho giao dịch tài sản, cấp phát NCVT và kho ở một số luồng.
- Có dynamic technical attributes, component tree, kiểm kê, đối chiếu, file template, audit và session persistence.
- Có test module hóa và tài liệu vận hành Windows/Docker/Internet.

## 4. Architecture gaps theo mức ưu tiên

| Mức | Gap | Bằng chứng / tác động | Hướng xử lý |
|---|---|---|---|
| P0 | Authorization bị bypass ở dashboard/kho | `routes/dashboard.js` và `routes/khovat.js` gọi `coMaQuyenNay(req, code)`; hàm này trả middleware function nên điều kiện luôn cho qua. `app.use('/api', tienich)` vô tình chặn anonymous, nhưng kiểm thử audit xác nhận user đã đăng nhập không có permission vẫn nhận HTTP 200 ở cả hai API. | Task 1: sửa guard, thêm integration test 401/403/data scope cho mọi endpoint. |
| P0 | Hai mô hình RBAC song song | `quyen.js` dùng `vai_tro_quyen/nguoi_dung_vai_tro`; `quyen-ma.js` dùng `quyen_vai_tro/quyen_nguoi_dung`; role tĩnh vẫn tồn tại. | Chọn một authorization service, migrate dữ liệu, deny-by-default. |
| P0 | Data scope chỉ một phân xưởng | session có `phan_xuong_id`; chưa biểu diễn user phụ trách nhiều đơn vị/công trình. | Task 1: user-unit assignments + scope query tập trung. |
| P1 | Tài sản và thiết bị đang trộn | `thiet_bi` chứa cả trường kế toán TSCĐ/CCDC và kỹ thuật. | Task 2-3: tách `assets` và `devices`, giữ mapping ID legacy. |
| P1 | Balance/stock vẫn có trường mutable | `thiet_bi.so_luong`, `ton_kho.so_luong_ton`; chưa có ledger chuẩn và reversal đầy đủ. | Task 4 và 11: append-only ledger, projection/reconciliation. |
| P1 | File local, không version/hash tổng quát | Multer ghi `uploads/*`; metadata phân tán; serverless/multi-instance sẽ mất/không chia sẻ file. | Task 9: storage abstraction, object storage, hash/version/signed URL. |
| P1 | Migration không có journal/checksum | Startup chạy lại toàn bộ SQL và bỏ qua lỗi duplicate theo thông báo; rollback/backup gate chưa có. | Task 1: migration table, checksum, backup/restore test. |
| P1 | Thiếu lint/typecheck/build trên `main` | `package.json` chỉ có start/init/test/backup. | Task 1: ESLint, JSDoc/TS strategy, CI tối thiểu không đổi stack vội. |
| P2 | Frontend chưa PWA và chưa componentized | HTML/JS tĩnh; chưa manifest/service worker/offline draft chuẩn. | Task 1 shell/PWA; React migration chỉ theo strangler pattern nếu được duyệt. |
| P2 | Trùng source và zip 25 MB trong Git | `qlcd/` gần như bản sao; `qlcd-v22.1_1.zip` được commit. | Quyết định canonical root và artifact policy ở Task 1, không xóa trong Task 0. |
| P2 | Supply-chain debt | `npm ci` báo 3 vulnerability trên `main`; scaffold Cloudflare báo 20 (gồm 1 critical). | Task 1/24: triage theo dependency path, nâng có kiểm thử; không chạy auto-fix phá vỡ stack. |

## 5. Target architecture đề xuất

Giữ một monorepo và chuyển dần theo strangler pattern: legacy Express/SQLite tiếp tục phục vụ chức năng đang dùng; mọi nghiệp vụ mới đi qua service/domain layer, authorization service duy nhất, migration có journal, ledger append-only và storage adapter. Chỉ chuyển sang Cloudflare D1/R2 hoặc PostgreSQL/Supabase sau spike có dữ liệu thật, kiểm tra transaction/concurrency, chi phí và kế hoạch rollback. Không merge scaffold chỉ vì đã tồn tại.

## 6. Decision gates

1. Task 1 đã đóng P0 authorization trên dashboard/kho, thống nhất authorization service và thêm migration journal/CI/PWA foundation.
2. Trước đổi database: chạy migration rehearsal trên bản sao dữ liệu, kiểm tra foreign key, transaction, backup/restore và parity test.
3. Trước Internet: environment tách dev/staging/prod, secrets bắt buộc, CI, monitoring, backup, upload hardening và UAT.

## 7. TASK 1 implementation note

`task1/foundation-stabilization` giữ Express/SQLite làm canonical runtime. `middleware/quyen.js` là authorization service duy nhất; `quyen-ma.js` chỉ còn compatibility facade. Migration 14 thêm Project/Unit assignment, user-many-units, dynamic per-user permission override và migration journal checksum. Dashboard/kho dùng permission predicate thật; PWA app shell và GitHub Actions quality gate đã được bổ sung.

## 8. TASK 19 architecture note

Carry-forward được triển khai như một nghiệp vụ canonical riêng trên Express/SQLite, không ghi ngược bảng NCVT legacy và không tác động Stock Ledger. Route chỉ orchestration; invariant quan trọng được neo bằng view eligibility, foreign key, unique idempotency, transaction và trigger bất biến trong migration 32. Dòng kỳ mới giữ Material ID/UOM và lineage về dòng nguồn, tạo nền giải thích số liệu cho dashboard Task 20. UI hiện hữu được mở rộng tại module NCVT thay vì đổi frontend stack.

## 9. TASK 20 architecture note

Dashboard NCVT là read model riêng: migration 33 hợp nhất các projection Task 13–19 ở cấp submission line, route áp dụng permission/data scope rồi mới filter và tổng hợp theo UOM. API drill-down giữ liên kết tới workflow nguồn thay vì lưu bản sao KPI. Giao diện NCVT hiện hữu được mở rộng bằng KPI cards, filter, alerts và bảng chi tiết; không đổi stack và không thêm write path. Release C vì vậy có một đường đọc canonical end-to-end mà không phụ thuộc dashboard NCVT legacy.

## 10. TASK 21 architecture note

Repair, maintenance và inspection dùng chung aggregate `technical_work_orders` theo Device ID, có Component chính tùy chọn, optimistic version và event lifecycle append-only. Material Issue là write path kỹ thuật riêng nhưng vẫn post vào Stock Ledger canonical trong cùng transaction; reversal tạo stock entry đối ứng. Kết quả hoàn thành cập nhật Device/Component canonical và compatibility state của thiết bị legacy, trong khi các phiếu legacy được backfill chỉ đọc, không rewrite hoặc xóa. UI nghiệp vụ cũ tiếp tục hoạt động song song và được bổ sung card canonical theo strangler pattern.

## 11. TASK 22 architecture note

Thông báo và vấn đề chất lượng dữ liệu được chuẩn hóa thành `notification_cases`, tách khỏi các aggregate nguồn. Rule engine chỉ đọc projection canonical, tạo fingerprint để retry không nhân case, tự đóng khi nguồn đã đạt và mở lại nếu vấn đề tái diễn. Mỗi case có owner, scope đơn vị, optimistic version, SLA escalation, in-app delivery và timeline append-only. Job chạy định kỳ trong tiến trình Express hoặc chạy thủ công có journal riêng; không sửa dữ liệu nguồn để “chữa” cảnh báo. Năm rule đầu gồm hạn kỹ thuật, NCVT chờ review, mapping Material, duplicate Material và file thiếu SHA-256.

## 12. TASK 23 architecture note

Report Center là read layer canonical dùng một registry query chung cho màn hình, Excel, PDF và bản in; vì vậy file tải xuống không có đường truy vấn riêng dễ lệch số liệu. Bảy mẫu đầu phủ Asset, Device, Asset Ledger, Stock, NCVT, vận hành kỹ thuật và chất lượng dữ liệu. Data scope được áp dụng tại server trước filter/paging/export, sort chỉ nhận whitelist và export bị chặn khi vượt giới hạn cấu hình. `report_export_runs` lưu actor, scope/filter, số dòng, thời gian và SHA-256; bản ghi terminal là bất biến. API báo cáo legacy tiếp tục phục vụ vai trò toàn cục nhưng bị chặn với PX vì không có scope an toàn.

## 13. TASK 24 architecture note

Server dùng route registry làm nguồn mount và security audit duy nhất. Middleware xác thực/quyền mang metadata policy; startup production và acceptance test đều fail closed nếu route không public rõ ràng mà thiếu xác thực. Audit hiện phủ 394 method/path, trong đó chỉ `POST /api/auth/dang-nhap` public. Phiên được regenerate sau xác thực, cookie bị xóa khi logout, API gắn request ID/no-store và lỗi 500 không lộ thông tin nội bộ. Yêu cầu mutation từ browser bị kiểm tra Origin/Fetch Metadata, Idempotency-Key được kiểm tra định dạng, HTTPS redirect không tin Host tùy ý và production bắt buộc secret riêng tối thiểu 32 ký tự. Upload canonical/legacy dùng whitelist tên file và signature nội dung cho document/spreadsheet/image trước khi nghiệp vụ đọc hoặc lưu; file disk không hợp lệ được xóa ngay. Không thêm migration và không thay đổi dữ liệu nghiệp vụ.

## 14. TASK 25 architecture note

Production readiness giữ nguyên Express/SQLite single-node nhưng bổ sung ranh giới vận hành rõ ràng. `observability` đo request count/error rate, route p50/p95/p99, event-loop và memory theo bộ nhớ hữu hạn; mọi HTTP 500 được fingerprint vào hàng đợi lỗi và chỉ admin/CĐVT được xem. Liveness tách khỏi readiness; readiness kiểm tra quick-check database, đủ migration, upload và backup volume. Migration 37 thêm error queue và index đã được neo bằng 7 `EXPLAIN QUERY PLAN` assertions. Upload legacy/canonical cùng dùng một volume; Docker chạy non-root, npm lockfile bắt buộc, có health readiness và graceful SIGTERM 30 giây. Backup dùng SQLite online backup, manifest SHA-256 cho database/file, verify và restore drill hoàn toàn trong vùng tạm. Load gate read-only ghi p50/p95/p99/RPS/error-rate với ngưỡng cấu hình.

## 15. TASK 26 architecture note

UAT database là bản clone có nguồn bất biến: đường dẫn nguồn/đích bắt buộc khác nhau và file đích tồn tại không bao giờ bị ghi đè. Migration và mọi thao tác UAT chỉ chạy trên clone; hash nguồn được kiểm tra không đổi. Danh tính nguồn bị vô hiệu hóa/ẩn danh, uploads không tự sao chép và chỉ phát hành tài khoản UAT theo vai trò cho tối đa hai PX được chọn. Machine evidence chỉ chứng minh technical gate; business acceptance giữ PENDING đến khi PX, CĐVT và quản trị hệ thống ký.
