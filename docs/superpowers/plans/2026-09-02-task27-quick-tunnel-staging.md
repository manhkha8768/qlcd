# TASK 27 Quick Tunnel Staging Implementation Plan

> Security architecture amendment (approved 2026-09-02): Compose contains no `build:` section and no host-data bind mounts. The wrapper requires a clean tracked tree, captures a full commit SHA, archives that exact commit in a temporary context outside the checkout, pins Compose to the resulting content-addressed image ID, and copies validated staging sources into retained named volumes only when uninitialized. This amendment supersedes later steps that mention building directly from the checkout, direct Compose build, or binding staging paths into the app container.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cung cấp staging QLCD tạm thời chạy bằng Docker và Cloudflare Quick Tunnel, có kiểm tra an toàn, URL/evidence cục bộ và lệnh start/status/stop, trong khi giữ TASK 27 ở trạng thái `PARTIAL`.

**Architecture:** Một compose file staging riêng chạy ứng dụng `qlcd-staging` và connector `cloudflared-staging` trong cùng mạng nội bộ. Một module Node kiểm tra đường dẫn/secret, phân tích URL `trycloudflare.com`, điều phối Docker Compose và ghi evidence không chứa bí mật; không thay đổi Worker, DNS hay production.

**Tech Stack:** Node.js 22/CommonJS, Docker Compose, `cloudflare/cloudflared:2026.8.3`, Express/SQLite hiện tại, test runner Node hiện có.

**Spec:** `docs/superpowers/specs/2026-09-02-task27-quick-tunnel-staging-design.md`

## Global Constraints

- TASK 27 phải giữ trạng thái `PARTIAL`; Quick Tunnel không được mô tả là production hoặc hoàn tất go-live.
- Không deploy Cloudflare Workers/D1/R2, không đổi DNS, không sửa Worker `cdvtxlm.manhkha8768.workers.dev` và không merge `origin/feature/cloudflare-foundation`.
- Không dùng database production; database, uploads và backup staging phải khác đường dẫn production.
- Database, uploads và backup staging phải có đích vật lý nằm ngoài checkout dùng làm Docker build context; symlink/junction không được dùng để trỏ ngược vào checkout.
- Ứng dụng chỉ publish trên loopback `127.0.0.1`; chỉ connector tạo kết nối outbound.
- URL phải khớp chính xác `https://<label>.trycloudflare.com` và được xem là tạm thời.
- Không ghi secret, cookie, password hoặc token vào source, compose, evidence hay log do công cụ tạo.
- Lệnh stop giữ nguyên database/uploads/backups và không dùng `down -v`.
- Không tự đánh dấu UAT/sign-off là `PASS` và không mở TASK 28.

---

### Task 1: Validation, URL parser và evidence an toàn

**Files:**
- Create: `lib/quick-tunnel-staging.js`
- Create: `test/test-quick-tunnel-staging.js`

**Interfaces:**
- Produces: `resolveStagingConfig(env, cwd) -> { secret, dbPath, uploadPath, backupPath, port, evidencePath }`.
- Produces: `parseQuickTunnelUrl(text) -> string | null`.
- Produces: `createEvidence({ url, commit, readiness, createdAt }) -> object` với format `QLCD_QUICK_TUNNEL_STAGING_V1`.
- Consumes: `QLCD_STAGING_SECRET`, `QLCD_STAGING_DB`, `QLCD_STAGING_UPLOAD`, `QLCD_STAGING_BACKUP_DIR`, tùy chọn `QLCD_STAGING_PORT`, `QLCD_STAGING_EVIDENCE`; so sánh với `QLCD_DB`, `QLCD_UPLOAD`/`QLCD_UPLOADS`, `QLCD_BACKUP_DIR` nếu được đặt và từ chối mọi đích vật lý trong checkout/build context.

- [ ] **Step 1: Viết test thất bại cho validation**

Thêm các case dùng thư mục tạm:

```js
assert.throws(() => resolveStagingConfig({}, root), /QLCD_STAGING_SECRET/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_STAGING_SECRET: 'short' }, root), /32/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_DB: valid.QLCD_STAGING_DB }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_UPLOAD: valid.QLCD_STAGING_UPLOAD }, root), /production/);
assert.throws(() => resolveStagingConfig({ ...valid, QLCD_BACKUP_DIR: valid.QLCD_STAGING_BACKUP_DIR }, root), /production/);
assert.equal(resolveStagingConfig(valid, root).port, 32121);
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `node test/test-quick-tunnel-staging.js`

Expected: FAIL vì `lib/quick-tunnel-staging.js` chưa tồn tại.

- [ ] **Step 3: Cài đặt validation tối thiểu**

`resolveStagingConfig` phải:

```js
const REQUIRED_SECRET_LENGTH = 32;
const DEFAULT_PORT = 32121;
```

Chuẩn hóa đường dẫn bằng `path.resolve(cwd, value)`, yêu cầu database là file tồn tại, tạo upload/backup parent chỉ ở bước start chứ không trong validator, từ chối port ngoài `1024..65535`, và từ chối mọi đường dẫn staging trùng đường dẫn production sau chuẩn hóa/case-fold trên Windows. Database phải dùng `realpath`; upload/backup chưa tồn tại phải resolve ancestor hiện hữu gần nhất rồi nối phần còn thiếu. Cả ba đích vật lý phải nằm ngoài checkout/build context.

- [ ] **Step 4: Viết test thất bại cho URL/evidence**

```js
assert.equal(parseQuickTunnelUrl('Visit https://blue-tree.trycloudflare.com now'), 'https://blue-tree.trycloudflare.com');
assert.equal(parseQuickTunnelUrl('https://example.com'), null);
assert.equal(parseQuickTunnelUrl('http://blue-tree.trycloudflare.com'), null);
const evidence = createEvidence({ url, commit: 'abc123', readiness: 200, createdAt: '2026-09-02T00:00:00.000Z' });
assert.equal(evidence.status, 'TEMPORARY_STAGING');
assert.equal(JSON.stringify(evidence).includes('secret'), false);
assert.equal(evidence.business_signoff.status, 'PENDING');
```

- [ ] **Step 5: Cài đặt parser và evidence**

Parser chỉ nhận `/https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com\b/i`. Evidence gồm `format`, `status`, `temporary`, `url`, `commit`, `readiness`, `created_at`, `task_status: 'PARTIAL'` và `business_signoff: { status: 'PENDING' }`.

- [ ] **Step 6: Chạy test Task 1**

Run: `node test/test-quick-tunnel-staging.js`

Expected: tất cả case validation/parser/evidence PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/quick-tunnel-staging.js test/test-quick-tunnel-staging.js
git commit -m "feat(staging): validate quick tunnel configuration"
```

---

### Task 2: Docker Compose staging cách ly

**Files:**
- Create: `docker-compose.staging.yml`
- Modify: `test/test-quick-tunnel-staging.js`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: biến đã được `resolveStagingConfig` kiểm tra.
- Produces: services `qlcd-staging`, `cloudflared-staging`, network `qlcd-staging-network` và các bind mount staging.
- Produces: image connector cố định `cloudflare/cloudflared:2026.8.3`.

- [ ] **Step 1: Viết static contract test thất bại cho compose**

Đọc `docker-compose.staging.yml` và assert:

```js
assert.match(compose, /127\.0\.0\.1:\$\{QLCD_STAGING_PORT:-32121\}:3000/);
assert.match(compose, /cloudflare\/cloudflared:2026\.8\.3/);
assert.match(compose, /tunnel --no-autoupdate --url http:\/\/qlcd-staging:3000/);
assert.doesNotMatch(compose, /0\.0\.0\.0:/);
assert.doesNotMatch(compose, /down -v/);
```

Đồng thời xác nhận compose có `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true` cho connector và ba bind mount lấy từ `QLCD_STAGING_DB`, `QLCD_STAGING_UPLOAD`, `QLCD_STAGING_BACKUP_DIR`.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `node test/test-quick-tunnel-staging.js`

Expected: FAIL vì compose chưa tồn tại.

- [ ] **Step 3: Tạo compose staging**

`qlcd-staging` build từ `Dockerfile`, dùng `NODE_ENV=production`, `QLCD_INTERNET=1`, `QLCD_DB=/data/db/qlcd.db`, `QLCD_UPLOAD=/data/uploads`, `QLCD_BACKUP_DIR=/data/backups`, `QLCD_SECRET=${QLCD_STAGING_SECRET:?…}` và healthcheck `/api/ready` với `X-Forwarded-Proto: https`.

`cloudflared-staging` phụ thuộc healthcheck của `qlcd-staging`, dùng:

```yaml
command: tunnel --no-autoupdate --url http://qlcd-staging:3000
```

Connector không có port, volume hay secret ứng dụng.

- [ ] **Step 4: Thêm cấu hình mẫu an toàn**

Thêm vào `.env.example` các tên biến staging với giá trị rỗng; không thêm secret mẫu có thể dùng nhầm. Thêm `quick-tunnel-output/` và `.env.staging.local` vào `.gitignore`.

`.dockerignore` phải giữ `db/index.js`, `db/init.js` và migration SQL trong build context; chỉ loại các mẫu runtime `*.db`, `*.db-*`, `*.sqlite`, `*.sqlite-*`, `*.sqlite3`, `*.sqlite3-*` cùng các thư mục dữ liệu nhạy cảm đã biết. Static ignore không thay thế path validator vì tên/đuôi staging có thể tùy ý.

- [ ] **Step 5: Kiểm tra compose và test**

Run: `node test/test-quick-tunnel-staging.js`

Run khi Docker có sẵn:

```bash
docker compose --env-file .env.staging.local -f docker-compose.staging.yml config --quiet
```

Expected: tests PASS; compose config PASS khi file môi trường hợp lệ được cung cấp.

- [ ] **Step 6: Commit Task 2**

```bash
git add docker-compose.staging.yml test/test-quick-tunnel-staging.js .env.example .gitignore
git commit -m "feat(staging): add isolated quick tunnel compose"
```

---

### Task 3: Công cụ start/status/stop và smoke test

**Files:**
- Modify: `lib/quick-tunnel-staging.js`
- Create: `scripts/quick-tunnel-staging.js`
- Modify: `test/test-quick-tunnel-staging.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createController({ runCompose, fetchImpl, readLogs, writeEvidence, now, commit })`.
- Produces: CLI `node scripts/quick-tunnel-staging.js <start|status|stop>`.
- Produces: npm scripts `staging:tunnel:start`, `staging:tunnel:status`, `staging:tunnel:stop`.
- Consumes: `docker compose --env-file .env.staging.local -f docker-compose.staging.yml`.

- [ ] **Step 1: Viết controller tests thất bại với dependency giả**

Các case bắt buộc:

```js
// start: local ready -> tunnel up -> parse URL -> remote ready -> write evidence
assert.deepEqual(calls.map(item => item.action), ['prepare', 'app-up', 'local-ready', 'tunnel-up', 'logs', 'remote-ready', 'evidence']);

// thiếu URL sau timeout phải fail, không tạo evidence PASSED
await assert.rejects(() => controller.start(config), /Quick Tunnel URL/);

// stop tuyệt đối không truyền -v
await controller.stop(config);
assert.equal(composeArgs.flat().includes('-v'), false);
```

Thêm case remote `/api/ready` khác HTTP 200, URL log không hợp lệ và evidence writer nhận object không có secret.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `node test/test-quick-tunnel-staging.js`

Expected: FAIL vì controller/CLI chưa tồn tại.

- [ ] **Step 3: Cài đặt controller**

`start` tạo upload/backup directories, chạy app detached, poll local readiness tối đa 60 giây, chạy connector detached, poll log tối đa 60 giây, sau đó poll remote readiness tối đa 60 giây. Mọi poll dùng khoảng nghỉ 1 giây và trả lỗi có bước thất bại nhưng không in environment.

`status` không thay đổi container, đọc `docker compose ps`, parse URL từ log và gọi readiness nếu có URL.

`stop` chỉ gọi:

```text
docker compose --env-file .env.staging.local -f docker-compose.staging.yml down --remove-orphans
```

- [ ] **Step 4: Tạo CLI mỏng và npm scripts**

CLI chỉ nhận ba command cố định, gọi validator trước `start`, không echo env, ghi evidence mặc định vào `quick-tunnel-output/evidence.json`, và in rõ `TEMPORARY STAGING — NOT PRODUCTION` cùng URL khi thành công.

`npm run staging:tunnel:start` là wrapper build/start duy nhất được hỗ trợ. Không hướng dẫn operator chạy trực tiếp `docker compose build` hoặc `docker compose up` vì các lệnh đó bỏ qua validation/preflight.

Thêm `node test/test-quick-tunnel-staging.js` vào cuối `npm test` và ba npm scripts tương ứng.

- [ ] **Step 5: Chạy tests Task 3**

Run: `node test/test-quick-tunnel-staging.js`

Expected: tất cả validation, compose contract, controller và CLI tests PASS.

- [ ] **Step 6: Chạy smoke test thực nếu Docker/network có sẵn**

Tạo `.env.staging.local` ngoài Git, sao chép database UAT đã khử nhạy cảm sang một thư mục staging bên ngoài checkout/build context, dùng secret ngẫu nhiên tối thiểu 32 ký tự và đặt upload/backup staging ở các đường dẫn riêng cũng bên ngoài checkout. Chạy:

```bash
npm run staging:tunnel:start
npm run staging:tunnel:status
npm run staging:tunnel:stop
```

Expected: nhận URL `https://*.trycloudflare.com`, remote `/api/ready` trả 200, evidence ghi `TEMPORARY_STAGING`, và stop giữ dữ liệu.

- [ ] **Step 7: Commit Task 3**

```bash
git add lib/quick-tunnel-staging.js scripts/quick-tunnel-staging.js test/test-quick-tunnel-staging.js package.json
git commit -m "feat(staging): automate quick tunnel lifecycle"
```

---

### Task 4: Runbook, roadmap và verification cuối

**Files:**
- Create: `QLCD_TASK27_REPORT.md`
- Modify: `QLCD_PRODUCTION_RUNBOOK.md`
- Modify: `QLCD_IMPLEMENTATION_ROADMAP.md`
- Modify: `QLCD_ARCHITECTURE.md`
- Modify: `QLCD_BUSINESS_RULES.md`
- Modify: `QLCD_DATABASE_DESIGN.md`
- Modify: `QLCD_RBAC_MATRIX.md`

**Interfaces:**
- Consumes: commands/evidence từ Task 3.
- Produces: hướng dẫn vận hành staging và mapping TASK 27 `PARTIAL`.

- [ ] **Step 1: Cập nhật tài liệu vận hành**

Runbook phải ghi rõ prerequisites, cách tạo `.env.staging.local`, start/status/stop, cách tìm URL, URL thay đổi sau restart, không SLA, không dùng dữ liệu production, không dùng Quick Tunnel làm production và không chạy `down -v`.

- [ ] **Step 2: Cập nhật tài liệu kiến trúc/nghiệp vụ/dữ liệu/RBAC**

Ghi rõ Quick Tunnel chỉ thêm transport staging, không thay đổi schema, RBAC, business rule, storage model hoặc canonical ledger. Anonymous denial và role scope vẫn do Express kiểm soát.

- [ ] **Step 3: Cập nhật roadmap/report**

TASK 27 giữ `Một phần`: staging Quick Tunnel hoàn thành, còn thiếu domain production, named tunnel/HA, production secrets/storage, UAT sign-off và approved rollout. `NEXT RECOMMENDED TASK` là hoàn tất TASK 26 rồi hoàn tất production portion TASK 27; không mở TASK 28.

- [ ] **Step 4: Chạy verification đầy đủ**

Run:

```bash
node test/test-quick-tunnel-staging.js
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: tất cả PASS. Báo riêng smoke test Quick Tunnel là PASS, SKIPPED do thiếu Docker/network, hoặc FAILED; không nhập nhằng với unit/regression.

- [ ] **Step 5: Review diff và commit Task 4**

```bash
git add QLCD_TASK27_REPORT.md QLCD_PRODUCTION_RUNBOOK.md QLCD_IMPLEMENTATION_ROADMAP.md QLCD_ARCHITECTURE.md QLCD_BUSINESS_RULES.md QLCD_DATABASE_DESIGN.md QLCD_RBAC_MATRIX.md
git commit -m "docs(staging): document temporary tunnel rollout"
```

- [ ] **Step 6: Báo checkpoint**

Báo STATUS, BRANCH, COMMIT SHA, FILES CHANGED, MIGRATIONS, TEST RESULT, TYPECHECK RESULT, BUILD RESULT, QUICK TUNNEL SMOKE, KNOWN ISSUES, TASK MAPPING và NEXT RECOMMENDED TASK. Giữ branch để review; không merge, push, deploy production hoặc chuyển TASK 28.
