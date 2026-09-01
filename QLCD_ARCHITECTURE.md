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

1. Task 1 phải đóng P0 authorization và chốt canonical source.
2. Trước đổi database: chạy migration rehearsal trên bản sao dữ liệu, kiểm tra foreign key, transaction, backup/restore và parity test.
3. Trước Internet: environment tách dev/staging/prod, secrets bắt buộc, CI, monitoring, backup, upload hardening và UAT.
