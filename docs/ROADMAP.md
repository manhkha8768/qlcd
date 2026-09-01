# QLCD DEVELOPMENT ROADMAP

**Objective:** Migrate from Express + SQLite → Hono + Cloudflare D1/R2  
**Estimated Duration:** 12-16 weeks  
**Team:** Claude (dev) + ChatGPT (review) + User (decisions)

---

## MILESTONE OVERVIEW

| Milestone | Duration | Focus | Dependencies |
|-----------|----------|-------|--------------|
| **M0** | Week 1-2 | Infrastructure | None |
| **M1** | Week 3-4 | Core API + Auth | M0 |
| **M2** | Week 5-7 | Equipment & Units | M1 |
| **M3** | Week 8-9 | Transactions Engine | M2 |
| **M4** | Week 10-11 | Inventory + Reconciliation | M3 |
| **M5** | Week 12-13 | React Frontend Migration | M2+ |
| **M6** | Week 14-15 | Testing & Optimization | M3+ |
| **M7** | Week 16 | Production Deployment | M6 |

**Note:** Milestones run in parallel where possible.

---

## M0: INFRASTRUCTURE SETUP (Week 1-2)

### Objectives
- Set up Cloudflare D1, R2, KV resources
- Create repository structure for Hono + React
- Deploy skeleton worker
- Health check passing

### Deliverables
- [ ] Cloudflare D1 database created (qlcd_prod)
- [ ] R2 bucket created (qlcd-files)
- [ ] KV namespace created (qlcd_kv)
- [ ] wrangler.toml configured
- [ ] GitHub repository structure:
  ```
  qlcd/
  ├── backend/
  │   ├── src/
  │   │   ├── index.ts (Hono app)
  │   │   ├── routes/
  │   │   ├── middleware/
  │   │   ├── lib/
  │   │   ├── types/
  │   │   └── db/
  │   ├── wrangler.toml
  │   └── package.json
  └── frontend/
      ├── src/
      │   ├── components/
      │   ├── pages/
      │   ├── services/
      │   ├── hooks/
      │   └── types/
      ├── vite.config.ts
      └── package.json
  ```
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Staging environment ready
- [ ] `/api/health` endpoint responds

### Testing
```bash
curl https://qlcd-staging.workers.dev/api/health
# Response: { "status": "ok" }
```

---

## M1: CORE API + AUTHENTICATION (Week 3-4)

### Objectives
- Authentication middleware (login/logout)
- Session management (KV)
- Database connection (D1)
- Error handling
- Input validation

### Deliverables
- [ ] User authentication (POST /api/auth/login)
- [ ] Session store in KV
- [ ] Secure cookies (HTTP-only, SameSite=Lax)
- [ ] Logout (POST /api/auth/logout)
- [ ] Change password (POST /api/auth/change-password)
- [ ] Permission middleware
- [ ] Global error handler
- [ ] Zod validation schemas
- [ ] TypeScript types for D1
- [ ] Logging middleware

### API Endpoints
```
POST   /api/auth/login           - Authenticate user
POST   /api/auth/logout          - Destroy session
POST   /api/auth/change-password - Update password
GET    /api/auth/me              - Get current user
GET    /api/health               - Health check
```

### Testing
```bash
# Login
curl -X POST https://qlcd-staging.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Response: { "success": true, "data": { "userId": "..." }, "sessionId": "..." }
```

### Database Initialization
- [ ] Deploy all 13 SQL migration files to D1
- [ ] Verify all tables created
- [ ] Create indexes
- [ ] Insert seed data (admin user, default roles)

---

## M2: EQUIPMENT & ORGANIZATION (Week 5-7)

### Objectives
- Equipment CRUD with full specs
- Unit/Organization management
- Equipment categories & models
- QR code generation

### Deliverables
- [ ] Unit management (create, read, update hierarchy)
- [ ] Equipment CRUD (create, read, update, list)
- [ ] Equipment categories & models
- [ ] Equipment specifications (dynamic fields)
- [ ] Equipment lifecycle events table
- [ ] QR code generation & resolution
- [ ] Equipment search/filter

### API Endpoints
```
UNITS:
GET    /api/units                - List all units
POST   /api/units                - Create unit
GET    /api/units/{id}           - Get unit detail
PUT    /api/units/{id}           - Update unit
DELETE /api/units/{id}           - Soft delete

EQUIPMENT:
GET    /api/equipment                  - List equipment (paginated)
POST   /api/equipment                  - Create equipment
GET    /api/equipment/{id}             - Get equipment detail
PUT    /api/equipment/{id}             - Update equipment
DELETE /api/equipment/{id}             - Soft delete
GET    /api/equipment/{id}/timeline    - Lifecycle events
POST   /api/equipment/{id}/qrcode      - Generate QR
GET    /api/qrcode/{qrId}              - Resolve QR

EQUIPMENT SPECS:
GET    /api/equipment/{id}/specs       - Get all specs
POST   /api/equipment/{id}/specs       - Add spec
PUT    /api/equipment/{id}/specs/{specId} - Update spec
```

### Frontend Components (React)
- [ ] Equipment list page (table with pagination)
- [ ] Equipment detail page (read-only initially)
- [ ] Equipment form (create/edit modal)
- [ ] Unit tree view (hierarchical)
- [ ] QR code reader component (PWA camera)

### Testing
- [ ] CRUD operations for units
- [ ] Equipment creation with specs
- [ ] QR code generation & resolution
- [ ] Permission checks (user can only access assigned units)

---

## M3: TRANSACTION ENGINE (Week 8-9)

### Objectives
- Implement core transaction logic (Tăng/Giảm/Điều chuyển)
- Approval workflow
- Atomic operations
- Transaction history

### Deliverables
- [ ] Transaction creation (Tăng/Giảm/Điều chuyển)
- [ ] Draft → Submitted → Approval → Completed workflow
- [ ] Atomic updates (all-or-nothing)
- [ ] Transaction approval by authorized users
- [ ] Transaction history & audit log
- [ ] Rejection workflow with reason
- [ ] Equipment inventory sync

### API Endpoints
```
TRANSACTIONS:
GET    /api/transactions                      - List transactions
POST   /api/transactions                      - Create transaction
GET    /api/transactions/{id}                 - Get transaction detail
POST   /api/transactions/{id}/submit          - Submit for approval
POST   /api/transactions/{id}/approve         - Approve (admin only)
POST   /api/transactions/{id}/reject          - Reject with reason
POST   /api/transactions/{id}/complete        - Mark completed
DELETE /api/transactions/{id}                 - Cancel (draft only)
```

### Database Changes
- [ ] Implement transaction_items (line items)
- [ ] Implement transaction_approvals (approval trail)
- [ ] Add distributed locks in KV
- [ ] Atomic transaction block (SERIALIZABLE isolation)

### Testing
- [ ] Cannot complete without approval
- [ ] Cannot transfer if equipment not in source unit
- [ ] Approval creates audit trail
- [ ] Rejection reasons captured
- [ ] Equipment quantities updated correctly

---

## M4: INVENTORY & RECONCILIATION (Week 10-11)

### Objectives
- Inventory session management
- Physical count recording
- Reconciliation against accounting
- Discrepancy reporting

### Deliverables
- [ ] Create inventory sessions
- [ ] Snapshot system state
- [ ] Record physical count (manual + QR + import)
- [ ] Reconciliation matching logic
- [ ] Discrepancy classification
- [ ] Excel export for inventory forms
- [ ] Reconciliation report generation

### API Endpoints
```
INVENTORY:
GET    /api/inventory-sessions                      - List sessions
POST   /api/inventory-sessions                      - Create session
GET    /api/inventory-sessions/{id}                 - Get session detail
POST   /api/inventory-sessions/{id}/items           - Record count
GET    /api/inventory-sessions/{id}/reconcile       - Compare vs system
POST   /api/inventory-sessions/{id}/close           - Close session

RECONCILIATION:
GET    /api/reconciliation-sessions                 - List
POST   /api/reconciliation-sessions                 - Create
POST   /api/reconciliation-sessions/{id}/import     - Import accounting data
GET    /api/reconciliation-sessions/{id}/discrepancies - List issues
POST   /api/reconciliation-sessions/{id}/resolve    - Resolve discrepancy
```

### Testing
- [ ] Snapshot captures all equipment
- [ ] Discrepancy detection works
- [ ] No auto-correction (manual approval)
- [ ] Excel export/import

---

## M5: REACT FRONTEND MIGRATION (Week 12-13)

### Objectives
- Rebuild frontend from vanilla JS → React
- Responsive UI (desktop + mobile)
- State management with TanStack Query
- PWA capabilities

### Deliverables
- [ ] React project setup (Vite + TypeScript)
- [ ] Component library (shadcn/ui)
- [ ] Authentication flow (login page)
- [ ] Dashboard with KPIs
- [ ] Equipment list/detail pages
- [ ] Transaction management UI
- [ ] Inventory/reconciliation UI
- [ ] Admin panel
- [ ] Reports page
- [ ] PWA manifest (offline support)
- [ ] Mobile navigation

### Pages to Build
```
/login                          - Login form
/dashboard                      - Dashboard with KPIs
/equipment                      - Equipment list
/equipment/{id}                 - Equipment detail
/transactions                   - Transaction list
/transactions/create            - Transaction form
/inventory                      - Inventory sessions
/inventory/{id}                 - Inventory detail
/reconciliation                 - Reconciliation UI
/reports                        - Reports
/admin                          - Admin panel
/admin/users                    - User management
/admin/roles                    - Role management
/admin/units                    - Unit management
```

### Testing
- [ ] All pages load and render correctly
- [ ] Responsive on mobile (< 768px)
- [ ] Forms validate input
- [ ] Session timeout redirects to login
- [ ] Permissions enforce (hide/disable unavailable features)

---

## M6: TESTING & OPTIMIZATION (Week 14-15)

### Objectives
- Comprehensive testing (unit, integration, E2E)
- Performance optimization
- Security hardening
- Documentation

### Deliverables
- [ ] Unit tests for all business logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical workflows
- [ ] Performance baseline (response time < 500ms p95)
- [ ] Load testing (100+ concurrent users)
- [ ] Security audit (OWASP)
- [ ] Database query optimization
- [ ] Frontend bundle size optimization
- [ ] API documentation (Swagger)
- [ ] Runbook for operations

### Testing Checklist
- [ ] Happy path workflows
- [ ] Permission validation
- [ ] Data integrity on failures
- [ ] Concurrent access (locks prevent double-submit)
- [ ] File upload/download
- [ ] Excel import validation

---

## M7: PRODUCTION DEPLOYMENT (Week 16)

### Objectives
- Production readiness checklist
- Data migration (SQLite → D1)
- File migration (uploads → R2)
- Cutover strategy

### Deliverables
- [ ] Production Cloudflare resources provisioned
- [ ] Secrets/environment variables configured
- [ ] SSL/TLS certificates
- [ ] Data migration scripts tested
- [ ] Runbook for incident response
- [ ] Monitoring & alerting configured
- [ ] Backup strategy (daily backups to R2)
- [ ] Disaster recovery plan documented
- [ ] User training materials
- [ ] Go-live approval

### Cutover Process
1. Backup SQLite to R2 (`sqlite-backup-{date}.db`)
2. Run data migration scripts (SQLite → D1)
3. Run file migration (uploads → R2)
4. Switch traffic to Cloudflare Workers
5. Monitor error rates, performance
6. Keep SQLite as fallback 7 days
7. Decommission SQLite

### Go/No-Go Criteria
- ✅ All M1-M6 deliverables complete
- ✅ Test suite passing (100+ tests)
- ✅ Performance baseline met
- ✅ Security audit passed
- ✅ Data migration verified
- ✅ Disaster recovery plan documented
- ✅ User training complete

---

## PARALLEL WORK STREAMS

### Legacy System Deprecation
- Continue supporting SQLite locally until M7
- Maintain dual-write (SQLite + D1) during M4-M7
- Gradual frontend migration (not all-at-once)

### Documentation
- Keep docs up-to-date with each milestone
- API documentation (auto-generated from Hono)
- Architecture diagrams
- Deployment procedures

### Training & Knowledge Transfer
- Developer onboarding guide
- User training materials (by M6)
- Admin runbook (by M7)

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| D1 query performance degrades | Monitor, optimize indexes, test with realistic data load |
| R2 file migration takes too long | Start early, parallel uploads, retry logic |
| React migration complexity | Incremental migration (build pages one-by-one) |
| Data loss during migration | Backup SQLite, run dual-write 1+ week, verify checksums |
| User adoption resistance | Early training, UI/UX feedback loop, gradual rollout |

---

## SUCCESS METRICS

By end of M7:
- [ ] 100% of original features working
- [ ] < 500ms p95 API response time
- [ ] 99.95% uptime SLA
- [ ] 100 tests passing (unit + integration)
- [ ] Zero data loss
- [ ] 100% user adoption

---

**End of ROADMAP.md**

---

## TASK 0 COMPLETION SUMMARY

All TASK 0 deliverables completed:

✅ `/docs/TASK0-CURRENT-STATE.md` – Comprehensive analysis of existing codebase  
✅ `/docs/ARCHITECTURE.md` – Target Cloudflare-first architecture  
✅ `/docs/DATABASE-MIGRATION.md` – SQLite → D1 migration strategy  
✅ `/docs/PERMISSIONS-MODEL.md` – RBAC + data scoping design  
✅ `/docs/BUSINESS-RULES.md` – Formal business logic specifications  
✅ `/docs/ROADMAP.md` – 16-week development roadmap  

**Next Step:** HANDOFF TO CHATGPT FOR REVIEW
