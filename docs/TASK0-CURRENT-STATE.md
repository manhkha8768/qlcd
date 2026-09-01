# TASK 0 – CURRENT STATE ANALYSIS

**Ngày phân tích:** 2026-08-31  
**Phiên bản hiện tại:** v22.1 (từ git history)  
**Codebase:** ~8,500 dòng code  
**Status:** Deployed locally, 502 error on Railway  

---

## I. REPOSITORY OVERVIEW

### 1.1 Cấu trúc Hiện Tại

```
qlcd/
├── server.js                 # Entry point (Express server)
├── package.json              # Dependencies: Express, better-sqlite3, bcryptjs, exceljs, multer
├── Dockerfile                # Multi-stage build for better-sqlite3
├── docker-compose.yml        # (Optional local dev)
├── railway.json              # Railway deployment config
├── Procfile                  # Process manager config
│
├── db/
│   ├── index.js             # Database initialization (better-sqlite3)
│   ├── init.js              # Migration runner
│   ├── 01-schema.sql        # Core tables (30KB)
│   ├── 02-import.sql        # Import helpers
│   ├── 03-bosung.sql        # Additions
│   ├── 04-giao-dich.sql     # Transaction module
│   ├── 05-ky-thuat.sql      # Technical specs (29KB)
│   ├── 06-ncvt.sql          # Material management
│   ├── 07-bao-mat.sql       # Security audit
│   ├── 08-dai-mang.sql      # Network management
│   ├── 09-phan-quyen-dong.sql # Dynamic permissions
│   ├── 10-file-mau.sql      # Template files
│   ├── 11-kiem-ke.sql       # Inventory
│   ├── 12-doi-chieu.sql     # Reconciliation
│   └── 13-kho-vat-tu.sql    # Material warehouse
│
├── middleware/
│   ├── bao-mat.js           # Security (HTTPS, headers, rate limit, IP whitelist)
│   ├── quyen.js             # Role-based permission check
│   └── quyen-ma.js          # Permission code handler
│
├── lib/
│   ├── phien-sqlite.js      # Session store using SQLite
│   ├── giao-dich.js         # Transaction business logic
│   ├── dai-mang.js          # Network management logic
│   ├── ky-thuat.js          # Technical specs logic
│   ├── cay-thiet-bi.js      # Equipment tree structure
│   ├── doc-excel.js         # Excel reading utilities
│   ├── ma-thiet-bi.js       # Equipment code generation
│   └── so-phieu.js          # Document numbering
│
├── routes/  (17 endpoint modules)
│   ├── auth.js              # Login/logout (8.5KB)
│   ├── danhmuc.js           # Categories
│   ├── thietbi.js           # Equipment management
│   ├── giaodich.js          # Transactions (24.8KB)
│   ├── kiemke.js            # Inventory (17KB)
│   ├── kiemdinh.js          # Inspections
│   ├── kythuat.js           # Technical specs (30KB)
│   ├── baoduong.js          # Maintenance (18KB)
│   ├── ncvt.js              # Material (31KB)
│   ├── khovat.js            # Warehouse (13KB)
│   ├── doichieu.js          # Reconciliation (15KB)
│   ├── filemau.js           # Template files (15KB)
│   ├── quantri.js           # Administration (18KB)
│   ├── dashboard.js         # Dashboard (29KB)
│   ├── import.js            # Excel import (18KB)
│   ├── tonghop.js           # Summary reports
│   ├── suco.js              # Incidents
│   ├── mang.js              # Network
│   └── tienich.js           # Utilities
│
├── public/
│   ├── index.html           # Main entry
│   ├── js/                  # Frontend vanilla JS (~10 files)
│   ├── css/                 # Styling
│   ├── admin/               # Admin pages
│   └── uploads/             # File storage (local)
│
├── scripts/
│   ├── sao-luu.js           # Backup script
│   └── dat-lai-mat-khau.js  # Password reset
│
├── test/                    # Test suite (447 tests passing)
│   └── test-*.js
│
└── docs/
    ├── *.md                 # Documentation
    ├── CAI-DAT-WINDOWS.txt  # Windows setup guide
    ├── TRIEN-KHAI-INTERNET.txt  # Internet deployment
    └── ...
```

### 1.2 Current Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Language** | JavaScript (Node.js) | v22 |
| **Framework** | Express.js | 4.21.1 |
| **Database** | SQLite | 3 (WAL mode) |
| **Driver** | better-sqlite3 | 12.11.1 |
| **Session** | Custom SQLite store | - |
| **Authentication** | bcryptjs | 2.4.3 |
| **File Upload** | multer | 2.2.0 |
| **Excel** | exceljs, xlsx | 4.4.0, 0.18.5 |
| **PDF** | pdfkit | 0.20.1 |
| **Frontend** | Vanilla HTML/CSS/JS | - |
| **Deployment** | Docker + Railway | - |

---

## II. DATABASE ANALYSIS

### 2.1 Core Schema (01-schema.sql)

**Tables:** ~20 tables covering:

1. **Organizational Structure**
   - `phan_xuong` – Workshops/Units (ma, ten, loai, hoat_dong)
   - `vi_tri` – Location hierarchy (parent_id, cap, phan_xuong_id)
   - `nhom_thiet_bi` – Equipment groups (hierarchical)
   - `model_thiet_bi` – Equipment models

2. **User & Permission**
   - `nguoi_dung` – Users (vai_tro: admin/cd_cty/px/xem)
   - **Issue:** vai_tro is HARDCODED in 4 values - not dynamic

3. **Equipment**
   - `thiet_bi` – Main equipment table
   - `thong_so_thiet_bi` – Individual equipment specs

4. **Asset Management**
   - Ma_tscd → TSCĐ/CCDC linkage
   - loai_ts → 'TSCD' or 'CCDC'
   - trang_thai → equipment lifecycle state

### 2.2 Modular Extensions

| File | Purpose | Tables |
|------|---------|--------|
| 02-import.sql | Import data templates | `mat_khau_tam`, `table_import_*` |
| 04-giao-dich.sql | Transactions (Add/Remove/Transfer) | `giao_dich`, `chi_tiet_giao_dich`, `duyet_giao_dich` |
| 05-ky-thuat.sql | Technical lifecycle | `loai_su_co`, `su_co`, `lich_su_thay_the`, `kho_linh_kien` |
| 06-ncvt.sql | Quarterly material (NCVT) | `huong_dan_cap_phat`, `nhat_ky_ncvt_quy` |
| 07-bao-mat.sql | Audit & Security | `phan_quyen_co_so`, `phan_quyen_tuan_tu`, `nhat_ky_hoat_dong` |
| 08-dai-mang.sql | Network filtering | `danh_sach_danh_du_vp`, `danh_sach_danh_du_dm` |
| 09-phan-quyen-dong.sql | Dynamic permissions | `vai_tro_mo_ta`, `chuc_nang`, `ma_quyen`, `vai_tro_ma_quyen` |
| 10-file-mau.sql | Templates | `file_mau`, `file_mau_chi_tiet` |
| 11-kiem-ke.sql | Inventory | `kiem_ke_ky`, `chi_tiet_kiem_ke` |
| 12-doi-chieu.sql | Reconciliation | `doi_chieu_ky`, `chi_tiet_doi_chieu` |
| 13-kho-vat-tu.sql | Material warehouse | `kho_vat_tu`, `chi_tiet_kho` |

### 2.3 Database Issues & Observations

#### ✅ STRENGTHS
- WAL mode enabled for concurrency
- Foreign keys enforced
- Indexes on frequently queried columns
- Soft delete fields not used (all DELETE is hard delete)
- Comprehensive audit logging in `nhat_ky_hoat_dong`

#### ⚠️ ISSUES
1. **Hard Delete Used Throughout** - Dangerous for audit trail
   - Should implement `deleted_at`, `deleted_by` for critical tables
   
2. **Denormalization** - `thiet_bi.phan_xuong_id` duplicated
   - Current state needs to be derived from transaction history
   
3. **No Soft Delete** - Cannot recover deleted data
   
4. **Session Storage in SQLite** - Not production-ready for multi-instance
   - Need to migrate to Cloudflare KV eventually
   
5. **File Metadata Not in DB** - Files stored in `uploads/` filesystem
   - Should migrate to R2 + metadata in D1

6. **No Data Versioning** - Equipment/transaction amendments leave no trace

---

## III. API & ROUTES ANALYSIS

### 3.1 Endpoint Coverage

**Authentication (auth.js)**
- `POST /api/auth/login` – Username/password
- `POST /api/auth/logout` – Session destruction
- `POST /api/auth/doi-mat-khau` – Change password

**Equipment (thietbi.js)**
- `GET /api/thiet-bi/danh-sach` – List equipment
- `POST /api/thiet-bi/them` – Add equipment
- `POST /api/thiet-bi/{id}/sua` – Update equipment

**Transactions (giaodich.js - 24.8KB)**
- `POST /api/giao-dich/lap` – Create transaction (Tăng/Giảm/Điều chuyển)
- `POST /api/giao-dich/{id}/duyet` – Approve transaction
- `GET /api/giao-dich/danh-sach` – List transactions
- Transaction workflow: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → COMPLETED

**Inventory (kiemke.js - 17KB)**
- Create inventory session
- Snapshot system state
- Upload physical count
- Reconcile differences

**Technical Specs (kythuat.js - 30KB)**
- Equipment lifecycle events
- Maintenance history
- Component management
- Failure tracking

**Reports (dashboard.js - 29KB)**
- KPI summaries
- Equipment status distribution
- Maintenance statistics

### 3.2 Permission Middleware

**middleware/quyen.js:**
- Checks `req.session.vai_tro` against hardcoded roles
- Role-based access: admin > cd_cty > px > xem

**Issue:** 
- No function-level permissions (e.g., `thietbi.sua` vs `thietbi.xem`)
- No unit-scoping (user can only access assigned units)
- Middleware approves/rejects entire endpoints, not specific actions

---

## IV. FRONTEND ANALYSIS

### 4.1 Structure

```
public/
├── index.html               # SPA entry point
├── js/
│   ├── app.js              # Main app controller
│   ├── man-hinh.js         # Screen/modal management
│   ├── nhap-lieu.js        # Data entry
│   ├── giao-dich.js        # Transaction UI
│   ├── ky-thuat.js         # Technical specs UI
│   ├── ncvt.js             # Material UI
│   ├── tien-ich.js         # Utilities
│   ├── bao-mat.js          # Security dialogs
│   └── nghiep-vu.js        # Business logic
├── css/
│   └── style.css           # Bootstrap + custom styles
└── admin/
    ├── quan-tri-he-thong.html
    ├── dashboard.html
    └── ...
```

### 4.2 Observations

- **Technology:** Vanilla HTML/CSS/JavaScript (NO React/Vue/Angular)
  - Means: Lower barrier to entry but harder to scale
  - Embedded in `public/` folder served by Express.static()

- **Architecture:** 
  - AJAX calls to `/api/*` endpoints
  - Server-side session management
  - Form-based interactions (not modern SPA)

- **Advantages:**
  - No build step needed (simple to deploy)
  - Direct server-side rendering possible
  - Lightweight

- **Disadvantages:**
  - Hard to maintain as complexity grows
  - No component reusability
  - No state management
  - Difficult to test

---

## V. DEPLOYMENT & INFRASTRUCTURE

### 5.1 Current State

- **Development:** Windows batch scripts (CAI-DAT.bat, CHAY.bat, etc.)
- **Local:** `npm start` → `node server.js` → SQLite on disk
- **Production Attempt:** Railway + Docker
  - **Status:** 502 Bad Gateway (blocker)
  - **Cause:** Unknown (needs Railway logs investigation)

### 5.2 Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**Issues:**
- `better-sqlite3` requires build tools (not available in Alpine by default)
- Current Dockerfile uses multi-stage but may still fail on Alpine
- No explicit health check

### 5.3 Current Deployment Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| 502 Bad Gateway on Railway | Production blocked | CRITICAL |
| SQLite not suitable for multi-instance | Scalability | HIGH |
| No R2 integration | File storage needs migration | HIGH |
| No D1 integration | Database not on Cloudflare | HIGH |
| Session not in KV | Multi-instance sessions fail | HIGH |

---

## VI. TESTING

### 6.1 Test Suite

- **Total:** 447 tests
- **Status:** ALL PASSING ✅
- **Coverage:** Includes all major modules (negotiations, transactions, technicals, NCVT, security, network, permissions, templates, inventory, reconciliation, material warehouse, dashboard)

**Test command:**
```bash
npm test
```

**Tests verify:**
- Business logic
- Database constraints
- Transaction workflows
- Authorization
- Import/export

---

## VII. SECURITY ANALYSIS

### 7.1 What's Implemented ✅

1. **Authentication**
   - bcryptjs password hashing
   - Session management (secure cookies)
   - Session expiry (default 8 hours)
   - Session regeneration on login

2. **Network Security**
   - HTTPS enforcement (middleware)
   - Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
   - Rate limiting (300 requests/60sec)
   - IP whitelist (configurable by network)
   - User-Agent logging

3. **Data Protection**
   - Audit logging (`nhat_ky_hoat_dong`)
   - Permission checks in middleware
   - SQL injection prevention (parameterized queries via better-sqlite3)

### 7.2 What's Missing ⚠️

1. **Input Validation**
   - Some routes validate; others don't
   - No centralized validation layer

2. **CSRF Protection**
   - No CSRF tokens in forms

3. **Authorization Granularity**
   - Endpoint-level only, not function-level
   - No data-level scoping (user A sees user B's data)

4. **Sensitive Data**
   - Passwords stored with bcryptjs ✅
   - API secrets/tokens – none currently (would need env vars)

5. **Audit Trail**
   - Good logging but no immutable audit trail
   - Hard deletes remove audit evidence

---

## VIII. FILE HANDLING

### 8.1 Current Implementation

- **Location:** `uploads/` directory (local filesystem)
- **Mechanism:** `multer` middleware
- **Max size:** 30MB
- **Supported:** Excel, PDF, images, Word documents

**Routes:**
- `POST /api/import` – Upload Excel
- `POST /api/filemau` – Upload templates
- `POST /api/dashboard/export` – Export reports

### 8.2 Issues with Current Approach

| Issue | Impact |
|-------|--------|
| Tied to single server instance | No multi-instance deployment |
| No cloud storage | Files lost on container restart |
| Manual file management | Difficult to track lineage |
| No version control for documents | Cannot retrieve old versions |
| Security risk if exposed | Secrets might be in PDF/Excel |

**Target:** Migrate to Cloudflare R2 + D1 metadata

---

## IX. ADMINISTRATIVE FEATURES

### 9.1 What Exists

- Dashboard (KPI view)
- User management (add/edit user)
- Permission assignment (4 hardcoded roles)
- Category management (import/create)
- Password reset script (`scripts/dat-lai-mat-khau.js`)
- Backup script (`scripts/sao-luu.js`)

### 9.2 What's Missing

- **Dynamic Permissions** - Only hardcoded 4 roles
- **Audit Log UI** - Logged but not browsable
- **System Configuration** - No dynamic settings UI
- **Data Reconciliation Tools** - Ad-hoc, not systematic
- **Reporting Dashboard** - Exists but limited
- **User Session Management** - No UI to see active sessions

---

## X. DOCUMENTATION

### 10.1 Available

✅ README/QUICKSTART  
✅ Windows setup guide (CAI-DAT-WINDOWS.txt)  
✅ Internet deployment guide (TRIEN-KHAI-INTERNET.txt)  
✅ Railway deployment (railway.json, Dockerfile, Procfile)  
✅ Release notes (RELEASE_NOTES_v22.1.md)  
✅ Handover documentation (HANDOVER-CHATGPT.md)  
✅ Implementation roadmap (KE-HOACH-TRIEN-KHAI.md)  

### 10.2 Missing

❌ API documentation (no Swagger/OpenAPI)  
❌ Database schema diagram  
❌ Architecture diagram  
❌ Security & compliance documentation  
❌ Performance baseline/optimization guide  

---

## XI. THIRD-PARTY INTEGRATIONS

### 11.1 Current

- None (SQLite, file storage, basic SMTP not configured)

### 11.2 Future Needed

- Cloudflare (Workers, D1, R2, KV)
- Email notifications (Mailgun, SendGrid, etc.)
- QR code generation
- PDF signature (digital)
- OCR for document scanning

---

## XII. TESTING & QA

### 12.1 Current

✅ 447 unit/integration tests  
✅ All passing  
✅ Test coverage: business logic, DB, auth  

### 12.2 Missing

❌ E2E tests (UI testing)  
❌ Performance tests  
❌ Load testing  
❌ Security testing (OWASP)  
❌ API contract testing  

---

## XIII. SUMMARY

### ✅ KEEP

1. **Database Schema** – Well-designed, modular structure
2. **Business Logic** – 447 tests passing; core workflows solid
3. **API Design** – RESTful endpoints with permission checks
4. **Security Middleware** – Good foundation (HTTPS, headers, rate limit)
5. **Test Suite** – Comprehensive coverage
6. **Documentation** – Good setup/deployment guides

### 🔧 REFACTOR

1. **Frontend** – Migrate Vanilla JS → React + TypeScript
2. **Permissions** – From hardcoded roles → dynamic RBAC
3. **File Storage** – From `uploads/` → Cloudflare R2
4. **Session Store** – From SQLite → Cloudflare KV
5. **Database** – From SQLite → Cloudflare D1 (managed)
6. **API Validation** – Add centralized validation layer
7. **Error Handling** – Standardize error responses
8. **Configuration** – Move secrets to environment variables

### 🚀 MIGRATE

1. **Cloudflare Workers** – HTTP Server replacement
2. **Cloudflare D1** – Database migration
3. **Cloudflare R2** – File storage migration
4. **Cloudflare KV** – Session + cache storage
5. **API Authentication** – Consider JWT vs session

### ❌ REMOVE

1. **Procfile/Railway** – Replace with Cloudflare deployment
2. **Docker** – Not needed if using Workers
3. **Batch Scripts** – Windows setup becomes obsolete
4. **Hard Deletes** – Implement soft delete instead

---

## XIV. METRICS

| Metric | Value |
|--------|-------|
| Total LOC (backend) | ~8,500 |
| Routes | 17 modules, 80+ endpoints |
| Database Tables | ~60+ |
| Test Count | 447 |
| Frontend Pages | ~10+ (vanilla HTML) |
| Dependencies | 7 core (better-sqlite3, express, etc.) |
| Current Deployment | Docker + Railway (broken) |
| Database Size | Unknown (SQLite file) |

---

## XV. RISKS & BLOCKERS

| Risk | Severity | Mitigation |
|------|----------|-----------|
| 502 on Railway | CRITICAL | Investigate logs, switch to Cloudflare Workers |
| SQLite on production | HIGH | Migrate to D1 immediately |
| Single-server deployment | HIGH | Implement multi-instance support via Cloudflare |
| Hard deletes | MEDIUM | Add soft delete columns + migration |
| Vanilla JS frontend | MEDIUM | Gradual React migration (or continue if team prefers) |
| No API docs | MEDIUM | Generate Swagger from code |
| File storage impermanence | HIGH | Migrate to R2 + metadata in D1 |

---

## XVI. NEXT STEPS

This document feeds into **TASK 0 Sub-Documents:**
1. `/docs/ARCHITECTURE.md` – Target state design
2. `/docs/DATABASE.md` – Schema migration plan
3. `/docs/BUSINESS-RULES.md` – Workflow specifications
4. `/docs/PERMISSIONS.md` – RBAC implementation
5. `/docs/ROADMAP.md` – Milestone breakdown

---

**End of CURRENT STATE ANALYSIS**
