# QLCD - CLOUDFLARE-FIRST ARCHITECTURE

**Target State:** Production-ready equipment lifecycle management system  
**Platform:** Cloudflare (Workers, D1, R2, KV)  
**Frontend:** React + TypeScript  
**Status:** TASK 0 Architecture Design  

---

## I. SYSTEM ARCHITECTURE OVERVIEW

### 1.1 Conceptual Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     END USER DEVICES                             │
│            Desktop (Browser) | Mobile (PWA/App)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────────┐
│          CLOUDFLARE EDGE (Global CDN + Security)                │
│  - WAF (Web Application Firewall)                               │
│  - DDoS Protection                                              │
│  - Caching                                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│           CLOUDFLARE WORKERS (Compute)                          │
│  - HTTP Request Handler                                         │
│  - Routing (API + Static Assets)                               │
│  - Authentication Check                                         │
│  - Request/Response Transform                                   │
│  - Business Logic Execution                                     │
└──┬─────────────┬──────────────┬──────────────┬─────────────────┘
   │             │              │              │
   ▼             ▼              ▼              ▼
┌──────┐    ┌────────┐    ┌────────┐    ┌────────┐
│  D1  │    │  R2    │    │  KV    │    │Queue/  │
│      │    │        │    │        │    │Workflow│
│ Data │    │ Files  │    │ Cache  │    │        │
│      │    │        │    │        │    │(Async) │
└──────┘    └────────┘    └────────┘    └────────┘
```

### 1.2 Technology Stack

| Layer | Component | Technology |
|-------|-----------|-----------|
| **Frontend** | UI Framework | React 18 + TypeScript |
| | Build Tool | Vite |
| | CSS | Tailwind CSS + shadcn/ui |
| | State | TanStack Query (React Query) |
| | Package Manager | npm/pnpm |
| **Backend** | API Framework | Hono.js (Cloudflare Workers) |
| | Language | TypeScript |
| | Validation | Zod |
| | Routing | Hono Router |
| **Database** | Primary | Cloudflare D1 (SQLite) |
| | ORM/Query | sql.js / D1 Client |
| | Migration | Custom scripts |
| **Storage** | Files | Cloudflare R2 (Object Storage) |
| | Metadata | D1 (file_documents table) |
| | Cache | Cloudflare KV |
| **Auth** | Session | Cloudflare KV + Secure Cookie |
| | Password | bcryptjs |
| | JWT | Optional for future API keys |
| **Async** | Tasks | Cloudflare Queues (optional) |
| | Workflows | Cloudflare Workflows (optional) |
| **Deployment** | Platform | Cloudflare Pages (frontend) + Workers (backend) |
| | Config | wrangler.toml + wrangler.jsonc |
| | CI/CD | GitHub Actions (optional) |

---

## II. DEPLOYMENT ARCHITECTURE

### 2.1 Cloudflare Worker (Backend)

```
wrangler.toml (Configuration)
├── name: qlcd-api
├── main: src/index.ts (Entry point)
├── Bindings:
│   ├── DB: Cloudflare D1
│   ├── BUCKET: Cloudflare R2
│   ├── KV: Cloudflare KV namespace
│   └── QUEUE: Cloudflare Queue (optional)
└── Routes:
    ├── /api/* → Hono Router
    └── /* → Static assets
```

**Entry Point (src/index.ts):**
```typescript
import { Hono } from 'hono';
import { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', middleware.logging);
app.use('*', middleware.cors);
app.use('/api/*', middleware.authentication);
app.use('/api/*', middleware.authorization);

// Routes
app.route('/api/auth', authRouter);
app.route('/api/equipment', equipmentRouter);
app.route('/api/transactions', transactionRouter);
// ... more routes

export default app;
```

### 2.2 Cloudflare D1 (Database)

```
Database: qlcd_prod (SQLite 3)
├── Core Tables (01-schema.sql)
├── Transaction Module (04-giao-dich.sql)
├── Technical Specs (05-ky-thuat.sql)
├── Material Management (06-ncvt.sql)
├── ... (all existing modules)
└── New Tables:
    ├── file_documents (metadata)
    ├── audit_logs (immutable)
    └── system_config (key-value)
```

**Bindings:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "qlcd_prod"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2.3 Cloudflare R2 (File Storage)

```
Bucket: qlcd-files
├── documents/
│   ├── equipment/{equipment_id}/...
│   ├── transactions/{transaction_id}/...
│   ├── inventory/{inventory_id}/...
│   └── maintenance/{maintenance_id}/...
├── templates/
│   ├── excel/
│   ├── pdf/
│   └── docx/
├── exports/
│   └── {user_id}/{report_id}.xlsx
└── archives/
    └── {date}/...
```

**Bindings:**
```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "qlcd-files"
preview_bucket_always_serve_locally = true
```

### 2.4 Cloudflare KV (Cache & Sessions)

```
Namespace: qlcd_kv
├── session:{session_id} → {user_id, roles, permissions, expires}
├── cache:equipment:{id} → {equipment_data}
├── config:{key} → {value}
└── lock:{entity_id} → {lock_info, expires}
```

**Bindings:**
```toml
kv_namespaces = [
  { binding = "KV", id = "xxxxxxxx", preview_id = "yyyyyyyy" }
]
```

### 2.5 Cloudflare Pages (Frontend)

```
Deployment: qlcd-ui
├── Build Command: npm run build
├── Build Output: dist/
├── Node Version: 22
└── Routes:
    ├── / → index.html
    ├── /* → index.html (SPA routing)
    └── /_redirects → Custom routing
```

**Build & Deploy:**
```bash
npm run build
wrangler pages deploy dist/
```

---

## III. FRONTEND ARCHITECTURE

### 3.1 React Project Structure

```
src/
├── components/          # Reusable React components
│   ├── common/         # Shared (Button, Modal, Dialog)
│   ├── equipment/      # Equipment-related components
│   ├── transactions/   # Transaction UI components
│   ├── inventory/      # Inventory & reconciliation UI
│   ├── reports/        # Report generation UI
│   └── admin/          # Admin panel components
├── pages/              # Page-level components (routing)
│   ├── Login
│   ├── Dashboard
│   ├── Equipment
│   ├── Transactions
│   ├── Inventory
│   ├── Reconciliation
│   └── Admin
├── hooks/              # Custom React hooks
│   ├── useAuth
│   ├── usePermission
│   ├── useEquipment
│   ├── useTransaction
│   └── useQuery (TanStack Query)
├── services/           # API communication
│   ├── authService.ts
│   ├── equipmentService.ts
│   ├── transactionService.ts
│   ├── apiClient.ts
│   └── fileUploadService.ts
├── stores/             # State management (Zustand or Context)
│   ├── authStore.ts
│   ├── uiStore.ts
│   └── cacheStore.ts
├── types/              # TypeScript types
│   ├── equipment.ts
│   ├── transaction.ts
│   ├── user.ts
│   ├── api.ts
│   └── index.ts
├── utils/              # Helper functions
│   ├── format.ts       # Date, currency, number formatting
│   ├── validate.ts     # Input validation
│   ├── permission.ts   # Permission checking
│   └── qrcode.ts       # QR code generation
├── styles/             # Tailwind + custom CSS
│   └── globals.css
├── main.tsx            # Vite entry point
└── vite-env.d.ts       # Vite type declarations
```

### 3.2 Component Hierarchy

```
<App>
├── <Layout>
│   ├── <Sidebar>
│   │   └── Navigation (dynamic based on permissions)
│   └── <Main>
│       ├── <Header>
│       │   ├── User Profile
│       │   ├── Notifications
│       │   └── Logout
│       └── <Router>
│           ├── <DashboardPage>
│           ├── <EquipmentPage>
│           │   ├── <EquipmentList>
│           │   ├── <EquipmentDetail>
│           │   └── <EquipmentForm>
│           ├── <TransactionPage>
│           │   ├── <TransactionList>
│           │   ├── <TransactionForm>
│           │   └── <ApprovalQueue>
│           ├── <InventoryPage>
│           │   ├── <InventorySessions>
│           │   ├── <InventoryDetail>
│           │   └── <ReconciliationUI>
│           ├── <ReportsPage>
│           └── <AdminPage>
│               ├── <UserManagement>
│               ├── <PermissionSettings>
│               ├── <OrganizationTree>
│               └── <AuditLog>
└── <ErrorBoundary>
```

### 3.3 Key Features

1. **Responsive Design**
   - Desktop: Sidebar + Content layout
   - Mobile: Hamburger menu + Bottom navigation
   - Breakpoints: sm (640px), md (768px), lg (1024px)

2. **Real-time Updates**
   - TanStack Query for caching & synchronization
   - WebSocket optional for live notifications (future)

3. **Offline Support**
   - Service Worker for PWA caching
   - Draft storage in localStorage
   - Sync on reconnect

4. **Accessibility**
   - WCAG 2.1 AA compliance
   - Keyboard navigation
   - Screen reader support
   - ARIA labels

---

## IV. BACKEND API STRUCTURE

### 4.1 Hono Router Architecture

```typescript
// src/index.ts - Main entry point
const app = new Hono<{ Bindings: Env }>();

// Middleware Stack
app.use('*', middleware.errorHandler);
app.use('*', middleware.cors);
app.use('*', middleware.requestLogger);
app.use('*', middleware.authenticationCheck);

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/equipment', equipmentRoutes);
app.route('/api/transactions', transactionRoutes);
app.route('/api/inventory', inventoryRoutes);
app.route('/api/reconciliation', reconciliationRoutes);
app.route('/api/maintenance', maintenanceRoutes);
app.route('/api/materials', materialRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/files', fileRoutes);

// Static assets
app.get('*', serveStatic({ root: '/static' }));

export default app;
```

### 4.2 API Route Modules

| Module | Endpoints | Responsibility |
|--------|-----------|-----------------|
| **auth** | POST /login, POST /logout, POST /refresh | User authentication |
| **equipment** | GET, POST, PUT, DELETE /equipment | Equipment CRUD |
| **equipment-details** | GET, POST /equipment/{id}/details | Specs, lifecycle events |
| **transactions** | GET, POST, PUT /transactions | Add/Remove/Transfer operations |
| **transaction-approval** | POST /transactions/{id}/approve | Approval workflow |
| **inventory** | GET, POST /inventory-sessions | Inventory management |
| **reconciliation** | GET, POST /reconciliation-sessions | TSCĐ-CCDC matching |
| **maintenance** | GET, POST /maintenance-orders | Repair, maintenance, inspection |
| **materials** | GET, POST /materials | Material management (NCVT) |
| **reports** | GET /reports/{type} | Report generation |
| **admin** | GET, POST /admin/* | User, permission, org management |
| **files** | POST /upload, GET /download/{id} | File handling via R2 |

### 4.3 Error Handling & Response Format

**Success Response:**
```json
{
  "success": true,
  "data": { /* payload */ },
  "timestamp": "2026-08-31T12:00:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "User does not have permission to access this resource",
    "details": { /* optional debug info */ }
  },
  "timestamp": "2026-08-31T12:00:00Z"
}
```

### 4.4 Authentication & Authorization

**Session Management:**
1. User login → validate credentials against D1
2. Create session object:
   ```json
   {
     "userId": "123",
     "username": "john_doe",
     "roles": ["px"],
     "units": ["DL1", "DL14"],
     "permissions": [
       "equipment.view",
       "transaction.create",
       "transaction.submit"
     ],
     "expiresAt": "2026-09-01T12:00:00Z"
   }
   ```
3. Store in KV: `session:{sessionId}` → session object
4. Set secure HTTP-only cookie: `qlcd.sid={sessionId}`

**Authorization Checks:**
```typescript
// In Hono middleware
const authMiddleware = async (c, next) => {
  const sessionId = c.req.cookie('qlcd.sid');
  const session = await c.env.KV.get(`session:${sessionId}`);
  
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  c.set('session', JSON.parse(session));
  await next();
};

// Permission check (function-level)
const requirePermission = (permission: string) => {
  return async (c, next) => {
    const session = c.get('session');
    if (!session.permissions.includes(permission)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
};

// Usage
app.post('/api/transactions', 
  requirePermission('transaction.create'),
  transactionController.create
);
```

---

## V. DATABASE DESIGN (D1 Migration)

### 5.1 Core Entities

```sql
-- Users & Auth
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

-- Organization
CREATE TABLE units (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT, -- 'company', 'project', 'workshop', 'department'
  created_at TEXT,
  deleted_at TEXT
);

-- Equipment
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT,
  model_id TEXT,
  serial_number TEXT,
  unit_id TEXT,
  status TEXT, -- 'active', 'inactive', 'repair', 'disposal'
  asset_code TEXT, -- TSCĐ reference
  asset_type TEXT, -- 'TSCD', 'CCDC'
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

-- Transactions (core business logic)
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT, -- 'add', 'remove', 'transfer'
  source_unit_id TEXT,
  dest_unit_id TEXT,
  status TEXT, -- 'draft', 'submitted', 'approved', 'completed', 'rejected'
  created_by TEXT,
  approved_by TEXT,
  created_at TEXT,
  approved_at TEXT,
  completed_at TEXT,
  deleted_at TEXT
);

-- Inventory Sessions
CREATE TABLE inventory_sessions (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  status TEXT, -- 'open', 'closed'
  system_snapshot TEXT, -- JSON
  physical_count TEXT, -- JSON
  reconciliation TEXT, -- JSON
  created_at TEXT,
  closed_at TEXT,
  deleted_at TEXT
);

-- File Metadata
CREATE TABLE file_documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT, -- 'equipment', 'transaction', 'inventory', 'maintenance'
  entity_id TEXT,
  object_key TEXT, -- R2 path
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT,
  uploaded_at TEXT,
  checksum TEXT,
  deleted_at TEXT
);

-- Audit Log (immutable)
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  old_value TEXT, -- JSON
  new_value TEXT, -- JSON
  ip_address TEXT,
  created_at TEXT
);
```

### 5.2 Migration Path

**Phase 1: Data Export**
```bash
# Export SQLite data
sqlite3 db/qlcd.db ".mode json" "SELECT * FROM thiet_bi" > export/equipment.json
```

**Phase 2: Transform & Validate**
```typescript
// Transform legacy data to new schema
interface LegacyEquipment {
  id: number;
  ma_tb: string;
  ten: string;
  phan_xuong_id: number;
  // ...
}

interface NewEquipment {
  id: string; // UUID
  code: string; // ma_tb
  name: string; // ten
  unit_id: string; // phan_xuong reference
  // ...
}
```

**Phase 3: Load into D1**
```typescript
// In Cloudflare Worker migration script
const batch = transformed.slice(0, 100);
await db.prepare(
  `INSERT INTO equipment (id, code, name, unit_id) VALUES (?, ?, ?, ?)`
).bind(...).run();
```

**Phase 4: Verify & Rollback Strategy**
- Maintain both systems for 1 week
- Run daily reconciliation checks
- Rollback plan: revert to SQLite if issues detected

---

## VI. FILE STORAGE ARCHITECTURE (R2 Migration)

### 6.1 R2 Bucket Structure

```
qlcd-files/
├── documents/
│   ├── equipment/
│   │   ├── {equipment_id}/
│   │   │   ├── specifications.pdf
│   │   │   ├── manual_{date}.pdf
│   │   │   └── images/
│   │   │       ├── photo_2026-08-01.jpg
│   │   │       └── qrcode.png
│   ├── transactions/
│   │   ├── {transaction_id}/
│   │   │   ├── slip_{date}.pdf
│   │   │   └── evidence.jpg
│   ├── inventory/
│   │   ├── {session_id}/
│   │   │   ├── list_snapshot.json
│   │   │   └── physical_count.xlsx
│   └── maintenance/
│       ├── {order_id}/
│       │   ├── work_order.docx
│       │   ├── before.jpg
│       │   └── after.jpg
├── templates/
│   ├── excel/
│   │   ├── equipment_import_template.xlsx
│   │   ├── transaction_slip_template.xlsx
│   │   └── inventory_form_template.xlsx
│   ├── pdf/
│   │   └── report_template.pdf
│   └── docx/
│       ├── equipment_passport.docx
│       └── maintenance_report.docx
├── exports/
│   ├── {user_id}/
│   │   ├── report_2026-08-31.xlsx
│   │   └── report_2026-09-01.xlsx
└── archives/
    ├── 2026-08/
    │   └── daily_backup.tar.gz
    └── 2026-09/
```

### 6.2 File Upload/Download Flow

**Upload:**
```
1. User selects file
2. Frontend: multipart/form-data POST /api/files/upload
3. Worker:
   - Validate MIME type & size
   - Generate R2 key: `documents/equipment/{id}/{uuid}.{ext}`
   - Upload to R2
   - Insert metadata into D1
   - Return file ID
4. Frontend: attach file ID to form
```

**Download:**
```
1. User clicks download
2. Frontend: GET /api/files/{fileId}/download
3. Worker:
   - Query D1 for metadata
   - Check permissions (user can access this entity)
   - Generate presigned R2 URL (10-min expiry)
   - Redirect to R2 URL
4. Browser downloads from R2
```

### 6.3 Security & Cleanup

- **Access Control:** Check D1 file_documents record for entity ownership
- **Malware Scanning:** (Optional) Integrate with ClamAV via Queue
- **Cleanup:** Soft delete (update deleted_at in D1), keep file 30 days, then remove
- **Encryption:** R2 supports encryption at rest (default enabled)

---

## VII. CACHING & PERFORMANCE (KV)

### 7.1 KV Namespace Strategy

```
kv_namespace: qlcd_kv

Cache Keys:
├── session:{sessionId} → user session (TTL: 8h)
├── cache:equipment:{id} → equipment data (TTL: 1h)
├── cache:units:{id} → unit data (TTL: 24h)
├── cache:permissions:{userId} → computed permissions (TTL: 30m)
├── config:{key} → system configuration (TTL: 24h)
├── lock:{entity_id} → distributed lock (TTL: 5m)
└── counter:{metric} → metrics (TTL: varies)
```

### 7.2 Cache Invalidation

**On Equipment Update:**
```typescript
// Invalidate cache
await kv.delete(`cache:equipment:${equipmentId}`);
await kv.delete(`cache:units:${unitId}`); // Unit's equipment list
```

**On User Permission Change:**
```typescript
// Invalidate user's permission cache
await kv.delete(`cache:permissions:${userId}`);
// Force re-login if currently active
await kv.delete(`session:${sessionId}`);
```

### 7.3 Distributed Locks

**Prevent concurrent updates:**
```typescript
const lockKey = `lock:transaction:${transactionId}`;
const lockTTL = 5 * 60; // 5 minutes

// Acquire lock
const lockValue = crypto.randomUUID();
const acquired = await kv.put(lockKey, lockValue, { 
  expirationTtl: lockTTL,
  onlyIfNotExists: true
});

if (!acquired) {
  throw new Error('Resource is locked by another process');
}

try {
  // Do critical work
  await db.prepare('UPDATE transactions SET status = ? WHERE id = ?')
    .bind('completed', transactionId)
    .run();
} finally {
  // Release lock
  const currentLock = await kv.get(lockKey);
  if (currentLock === lockValue) {
    await kv.delete(lockKey);
  }
}
```

---

## VIII. ASYNC PROCESSING (Queues & Workflows)

### 8.1 Use Cases

| Task | Queue | Reason |
|------|-------|--------|
| Send email notifications | Yes | Slow SMTP |
| Generate PDF reports | Yes | CPU-intensive |
| Import Excel data | Yes | Large files |
| Sync external systems | Workflow | Long-running, retries |
| Backup data to S3 | Workflow | Scheduled, reliable |

### 8.2 Queue Implementation

**Producer (Worker):**
```typescript
app.post('/api/reports/export', async (c) => {
  const reportId = generateId();
  
  // Queue async job
  await c.env.QUEUE.send({
    type: 'report.export',
    reportId,
    userId: session.userId,
    format: 'xlsx'
  });
  
  return c.json({ reportId, status: 'generating' });
});
```

**Consumer (Queue Handler):**
```typescript
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { type, reportId, userId, format } = message.body;
      
      if (type === 'report.export') {
        try {
          const report = await generateReport(reportId, format, env.DB);
          const fileKey = `exports/${userId}/${reportId}.${format}`;
          await env.BUCKET.put(fileKey, report);
          
          message.ack();
        } catch (error) {
          console.error('Report generation failed:', error);
          message.retry();
        }
      }
    }
  }
};
```

---

## IX. SECURITY MODEL

### 9.1 Authentication

- **Method:** Session-based + secure cookies
- **Password Storage:** bcryptjs (cost: 12)
- **Session TTL:** 8 hours (configurable)
- **HTTPS:** Enforced (Cloudflare edge)
- **Cookie:** HTTP-only, Secure, SameSite=Lax

### 9.2 Authorization

**RBAC (Role-Based Access Control):**
```typescript
interface Permission {
  id: string;
  code: string; // 'equipment.view', 'transaction.approve'
  description: string;
  category: string; // 'equipment', 'transaction', 'admin'
}

interface Role {
  id: string;
  name: string; // 'Equipment Manager'
  permissions: Permission[];
}

interface UserAssignment {
  userId: string;
  role: Role;
  units: Unit[]; // Which units this role applies to
}
```

**Function-Level Permissions:**
```typescript
const permissions = {
  equipment: {
    view: 'equipment.view',
    create: 'equipment.create',
    edit: 'equipment.edit',
    delete: 'equipment.delete',
  },
  transaction: {
    create: 'transaction.create',
    submit: 'transaction.submit',
    approve: 'transaction.approve',
    reject: 'transaction.reject',
  },
  // ... more
};
```

**Data-Level Scoping:**
```typescript
// When user fetches equipment, filter by assigned units
const equipment = await db.prepare(`
  SELECT e.* FROM equipment e
  WHERE e.unit_id IN (
    SELECT unit_id FROM user_unit_assignments WHERE user_id = ?
  )
`).bind(userId).all();
```

### 9.3 Input Validation

```typescript
// Zod schema
import { z } from 'zod';

const CreateEquipmentSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(200),
  category_id: z.string().uuid(),
  serial_number: z.string().optional(),
  unit_id: z.string().uuid(),
});

// In route handler
app.post('/api/equipment', async (c) => {
  const body = await c.req.json();
  const validated = CreateEquipmentSchema.parse(body);
  // ... proceed
});
```

### 9.4 Audit Logging

```typescript
// Immutable audit log (append-only)
await db.prepare(`
  INSERT INTO audit_logs (
    id, user_id, action, entity_type, entity_id,
    old_value, new_value, ip_address, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  generateId(),
  userId,
  'update',
  'equipment',
  equipmentId,
  JSON.stringify(oldData),
  JSON.stringify(newData),
  clientIP,
  new Date().toISOString()
).run();
```

---

## X. DEPLOYMENT FLOW

### 10.1 Development

```bash
# Local development
npm install
npm run dev

# Runs Wrangler in local mode (SQLite local, KV mock)
# http://localhost:8787
```

### 10.2 Staging

```bash
# Deploy to Cloudflare Staging
wrangler deploy --env staging

# Runs against staging Cloudflare resources
# https://qlcd-staging.example.workers.dev
```

### 10.3 Production

```bash
# Deploy to Cloudflare Production
wrangler deploy --env production

# Runs against production Cloudflare resources
# https://qlcd.example.workers.dev
```

### 10.4 Environment Configuration

**wrangler.toml:**
```toml
name = "qlcd-api"
main = "src/index.ts"
compatibility_date = "2026-09-01"

[env.production]
vars = { ENVIRONMENT = "production" }
d1_databases = [{ binding = "DB", database_id = "prod-id" }]
r2_buckets = [{ binding = "BUCKET", bucket_name = "qlcd-files-prod" }]
kv_namespaces = [{ binding = "KV", id = "prod-kv-id" }]

[env.staging]
vars = { ENVIRONMENT = "staging" }
d1_databases = [{ binding = "DB", database_id = "staging-id" }]
r2_buckets = [{ binding = "BUCKET", bucket_name = "qlcd-files-staging" }]
kv_namespaces = [{ binding = "KV", id = "staging-kv-id" }]
```

---

## XI. MONITORING & OBSERVABILITY

### 11.1 Logging

- **Frontend:** Console logs (development); error tracking (production)
- **Backend:** Structured JSON logs to Cloudflare Analytics
- **Database:** Query performance logs (D1)
- **Storage:** R2 access logs (audit trail)

### 11.2 Metrics

- **Request latency** (Worker response time)
- **Error rate** (4xx, 5xx percentage)
- **Database query time** (D1 performance)
- **KV hit/miss rate** (cache efficiency)
- **User activity** (login, transaction count)

### 11.3 Alerting

- High error rate → Alert ops team
- Database slow queries → Investigate indexes
- High KV miss rate → Adjust TTL
- Unusual audit log activity → Security review

---

## XII. DISASTER RECOVERY

### 12.1 Backup Strategy

**Daily automated backups:**
```bash
# Export D1 data to R2
# Runs on schedule (e.g., 2 AM UTC)
```

**Retention:**
- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 12 months

### 12.2 Restore Procedure

1. **Data Backup in R2** → Download to local
2. **Restore to D1** → `wrangler d1 execute qlcd_prod < backup.sql`
3. **Verify Integrity** → Run consistency checks
4. **Deploy Hotfix** → If application code issue

### 12.3 High Availability

- **Cloudflare Workers:** Distributed globally, auto-fail-over
- **D1:** Managed by Cloudflare (replicated internally)
- **R2:** Multi-region redundancy
- **KV:** Geo-replicated

No single point of failure.

---

## XIII. SCALABILITY CONSIDERATIONS

### 13.1 Limits & Quotas

| Component | Limit | Mitigation |
|-----------|-------|-----------|
| **D1** | 100k rows/min insert | Batch writes, background jobs |
| **R2** | Unlimited storage | Archive old files after 1 year |
| **KV** | 10s keys/second write | Coalesce writes, use Queue |
| **Worker** | 30s execution time | Defer long tasks to Queue |
| **Storage** | 100 GB baseline | Add custom tier if needed |

### 13.2 Design for Scale

1. **Pagination** – All list endpoints return max 100 items
2. **Indexes** – Strategic DB indexes on `unit_id`, `created_at`, status fields
3. **Caching** – Popular queries (equipment, units) cached in KV
4. **Compression** – Gzip response bodies
5. **CDN** – Static assets cached at Cloudflare edge (30 days)

---

## XIV. MIGRATION ROADMAP

| Phase | Duration | Component | Status |
|-------|----------|-----------|--------|
| **Phase 0** | Week 1 | Infrastructure setup (D1, R2, KV) | Planning |
| **Phase 1** | Week 2-3 | Hono API skeleton + authentication | TODO |
| **Phase 2** | Week 4-5 | Core entities (Equipment, Units, Users) | TODO |
| **Phase 3** | Week 6-7 | Transaction engine + business logic | TODO |
| **Phase 4** | Week 8 | Data migration (SQLite → D1) | TODO |
| **Phase 5** | Week 9 | File migration (uploads → R2) | TODO |
| **Phase 6** | Week 10-11 | React frontend migration | TODO |
| **Phase 7** | Week 12 | Testing, optimization, hardening | TODO |
| **Phase 8** | Week 13 | Production deployment | TODO |

---

## XV. SUCCESS METRICS

| Metric | Target | Current |
|--------|--------|---------|
| **Page Load Time** | < 2s | Unknown |
| **API Response Time (p95)** | < 500ms | Unknown |
| **Database Query Time (p95)** | < 100ms | Unknown |
| **Uptime** | 99.95% | Unknown |
| **Error Rate** | < 0.1% | Unknown |
| **User Adoption** | 100% of TKV staff | 0% (MVP) |

---

**End of ARCHITECTURE.md**

Next documents: DATABASE.md, BUSINESS-RULES.md, PERMISSIONS.md, ROADMAP.md
