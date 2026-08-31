# TASK 0 – CHATGPT REVIEW UPDATES

**Review Status:** CONDITIONALLY APPROVED  
**Date:** 2026-08-31  
**Approver:** ChatGPT  
**Claude Action:** Incorporate 38 review decisions

---

## REVIEW RESULT

✅ **CONDITIONALLY APPROVED** – Có thể chuyển sang TASK 1 sau khi cập nhật các quyết định kiến trúc.

---

## 38 APPROVED ARCHITECTURE DECISIONS

### 1. **Frontend – React Migration** ✅
- **Decision:** Vanilla JS → React + TypeScript (Vite)
- **Constraint:** INCREMENTAL MIGRATION (page-by-page, not rewrite)
- **Process:** Preserve behavior → Create React equivalent → Test → Replace
- **Update:** ARCHITECTURE.md bổ sung phần incremental migration strategy

### 2. **Backend – Hono on Workers** ✅
- **Decision:** Express → Hono on Cloudflare Workers
- **Constraint:** Mandatory layered architecture:
  ```
  Route → Controller → Service → Domain/Business Logic → Repository → D1
  ```
- **Violation:** No monolithic business logic in route handlers
- **Update:** ARCHITECTURE.md add 3-tier architecture diagram

### 3. **Test Suite – Preserve as Contract** ✅
- **Decision:** Keep 447 tests as "Legacy Behavior Contract"
- **Classification needed:**
  - Domain tests (business logic)
  - API tests (endpoints)
  - SQLite-specific tests (deprecate safely)
  - UI tests (convert to React)
  - Integration tests (maintain)
- **Update:** Create TASK1-TESTING-STRATEGY.md

### 4. **Dynamic RBAC** ✅
- **Decision:** Approved (not ABAC for MVP)
- **Model:** USER → ROLE ASSIGNMENT → ROLE → PERMISSIONS
- **Data Scope:** USER → UNIT ASSIGNMENTS → DATA SCOPE
- **Authorization:** hasPermission() AND hasUnitAccess()
- **Future:** Schema must allow ABAC expansion (resource attributes, ownership, limits)
- **Update:** PERMISSIONS-MODEL.md complete

### 5. **User-Unit Model** ✅ (REQUIRED)
- **Decision:** Mandatory user_unit_assignments table
- **Structure:**
  ```sql
  user_unit_assignments (id, user_id, unit_id, role_id, valid_from, valid_to, is_active)
  ```
- **Inheritance:** Can support hierarchical inheritance if policy allows
- **No hard-code:** Not single phan_xuong_id in users table
- **Update:** DATABASE-MIGRATION.md add user_unit_assignments

### 6. **Session Management** ⚠️ (NEEDS DECISION IN TASK 1)
- **NOT APPROVED:** Auto-KV for sessions
- **Requirements:** Focus on correctness, not framework choice
- **Critical operations need consistency:**
  ```
  logout, revoke, permission change, account lock
  ```
- **Options:** Signed cookie + D1 record, or other suitable architecture
- **Decision:** Defer to TASK 1 architecture review
- **Update:** ARCHITECTURE.md: Remove "Sessions in KV" as default

### 7. **KV Usage** ✅
- **Decision:** KV ONLY for caching/config, not business data
- **Allowed uses:**
  ```
  system_config_cache
  lookup_cache
  feature_flags
  non-critical_metadata_cache
  ```
- **Forbidden:** Business database, user data, transaction state
- **Update:** ARCHITECTURE.md clarify KV usage limits

### 8. **Async Processing / Queues** ✅
- **Decision:** NO Queues in Core MVP
- **Requirement:** Abstract for future queue operations (Excel import, R2 migration, OCR, bulk reports)
- **When to add:** Only with specific use case requiring async
- **Update:** ROADMAP.md remove Queues from M0, mark as optional M3+

### 9. **Multi-Region** ✅
- **Decision:** NO multi-region application architecture for MVP
- **Why:** Cloudflare Workers already provide edge runtime distribution
- **Priority:** Data consistency, backup, authorization, audit, migration safety > geographic distribution
- **Update:** ARCHITECTURE.md remove multi-region section, focus on Cloudflare edge benefits

### 10. **Audit Log** ✅
- **Decision:** APPEND-ONLY application policy (no UI delete/edit)
- **Minimum fields:**
  ```
  id, timestamp, actor_user_id, action, entity_type, entity_id, 
  unit_id, request_id, before_json, after_json, reason, 
  ip_metadata, user_agent_metadata
  ```
- **Sensitive ops:** Add correlation_id, transaction_id for chain traceability
- **Hash chaining:** Optional (can add Phase 2 if needed)
- **Update:** BUSINESS-RULES.md enhance audit trail specification

### 11. **Transaction Engine** ✅ (STRICT)
- **Decision:** ATOMIC business operations (all-or-nothing)
- **Example:** Transfer equipment = validate + update source + update dest + create event + audit (single operation)
- **Failure:** NO partial state (A decreased but B increase failed = ROLLBACK)
- **DB:** Use transaction block (SERIALIZABLE if needed)
- **Update:** BUSINESS-RULES.md strengthen transaction semantics

### 12. **Idempotency** ✅ (NEW REQUIREMENT)
- **Decision:** Required for critical operations
- **Operations:** Approve, Transfer, Import, File upload finalize, Inventory submit
- **Mechanism:** idempotency_key or equivalent
- **Failure:** Double-click submit = same result, not double operation
- **Example:** 
  ```
  First click: -1 source, +1 dest ✓
  Second click: idempotency prevents double -1, +1
  ```
- **Update:** Add IDEMPOTENCY section to BUSINESS-RULES.md

### 13. **Optimistic Concurrency** ✅ (NEW REQUIREMENT)
- **Decision:** Prevent concurrent overwrites
- **Mechanism:** version or updated_at field
- **Pattern:** `UPDATE WHERE id=? AND version=?` → 409 CONFLICT if mismatch
- **Frontend:** Handle conflict resolution (retry, merge, user notification)
- **Update:** Add OPTIMISTIC-LOCKING section to ARCHITECTURE.md

### 14. **Current State vs Event History** ✅ (NEW REQUIREMENT)
- **Decision:** Maintain TWO SEPARATE concepts
- **Equipment (current state):** Single record, reflects now
- **Equipment_events (history):** Append-only, immutable
- **Fetching:** NO replay from events on every request
- **Pattern:**
  ```
  COMMAND
    ↓ updates
  Current State
    + appends
  Event Record
    + appends
  Audit Log
  (all in single transaction)
  ```
- **Update:** Add section to ARCHITECTURE.md and BUSINESS-RULES.md

### 15. **Inventory Snapshot** ✅ (CRITICAL)
- **Decision:** Snapshot equipment state when creating inventory session
- **NOT:** Dynamic equipment list during counting
- **Separation:**
  ```
  Expected (at snapshot time)
  vs
  Current (now)
  vs
  Observed (physically)
  ```
- **Impact:** Can detect if equipment moved during inventory
- **Update:** BUSINESS-RULES.md strengthen inventory rules

### 16. **Reconciliation Staging** ✅
- **Decision:** NO direct import into equipment table
- **Architecture:**
  ```
  Excel kế toán → STAGING/IMPORT → Normalize → Match → Review → Resolution
  
  Tables:
  - reconciliation_sessions
  - reconciliation_source_rows (imported data)
  - reconciliation_matches (algorithm results)
  - reconciliation_items (line-by-line)
  ```
- **Matching:** Prioritized (exact code → code → serial → normalized name)
- **Fuzzy matching:** SUGGEST only, not auto-correct
- **Update:** BUSINESS-RULES.md enhance reconciliation workflow

### 17. **R2 File Model** ✅
- **Decision:** Approved
- **Constraint:** Object key structure (not just filename)
- **Format:**
  ```
  org/{org_id}/unit/{unit_id}/entity/{entity_type}/{entity_id}/{uuid}
  
  original_filename stored in file_documents.filename (metadata)
  ```
- **Benefit:** Avoids collision, avoids filename dependency
- **Update:** DATABASE-MIGRATION.md add file_documents schema

### 18. **File Immutability** ✅
- **Decision:** Don't overwrite at same key
- **Versioning:** version 1, version 2 (track history)
- **Approved transaction files:** Never overwrite (create new version)
- **Update:** ARCHITECTURE.md section on R2 versioning

### 19. **SQLite → D1 Migration** ✅ (IMPORTANT)
- **Decision:** NO default dual-write for 1+ week
- **Reason:** Increases risk (ordering mismatch, duplicate ops, partial failures)
- **Approved approach:**
  ```
  Freeze/maintenance window
    ↓ Backup
    ↓ Export SQLite
    ↓ Transform
    ↓ Import D1 staging
    ↓ Integrity validation
    ↓ User acceptance
    ↓ Delta migration (if needed)
    ↓ Cutover
  ```
- **Dual-write:** Only if PROVEN necessary for near-zero downtime
- **Update:** DATABASE-MIGRATION.md revise strategy

### 20. **Migration Verification** ✅ (ENHANCED)
- **Decision:** NOT just row counts
- **Checklist:**
  ```
  Foreign key relationships
  Nullability constraints
  Unique key violations
  Asset ownership integrity
  Transaction totals match
  Inventory counts match
  Document link integrity
  Orphan record detection
  Hash/checksum validation (critical datasets)
  ```
- **Example:** Equipment by unit, by status must match; TSCĐ totals must reconcile
- **Update:** DATABASE-MIGRATION.md add verification section

### 21. **Soft Delete Scope** ✅
- **Decision:** Not every table needs soft delete
- **Soft delete required:**
  ```
  equipment, documents metadata, transactions, inventory,
  reconciliation, maintenance
  ```
- **Hard delete OK:**
  ```
  temporary cache, session logs, staging import, test data
  ```
- **Retention:** Per-entity policy (not one-size-fits-all)
- **Update:** ARCHITECTURE.md clarify soft delete scope

### 22. **Database ID Strategy** ✅ (DECISION NEEDED IN TASK 1)
- **Recommendation:** UUID/ULID/UUIDv7 for public/business identifiers
- **QR codes:** Should NOT expose: equipment/1, equipment/2 pattern
- **Can keep:** Numeric internal keys if beneficial
- **Choice:** Defer to TASK 1, but decide before implementation
- **Update:** ARCHITECTURE.md add note

### 23. **Timezone Handling** ✅
- **Decision:** Store UTC; display per user timezone
- **Database:** ISO8601 UTC (created_at, updated_at, approved_at)
- **Frontend:** Convert to user's timezone on display
- **Forbidden:** Text-based local times (01/09/2026 08:30) as canonical value
- **Update:** ARCHITECTURE.md add timezone section

### 24. **QR Code** ✅
- **Decision:** URL/token identifier only (not full data)
- **Pattern:** `https://qlcd.../q/{public_id}`
- **Server:** Verify permissions before returning asset data
- **Future:** Can have public-safe view later
- **Update:** ARCHITECTURE.md QR section complete

### 25. **Security** ✅
- **Requirements beyond rate limit:**
  ```
  Zod/schema validation
  Secure headers
  Authorization middleware
  Upload MIME validation
  File size limits
  Filename normalization
  CSRF (if cookie auth)
  CORS policy
  Secret management
  ```
- **Critical:** Never trust unit_id, role, user_id from frontend
- **Must:** Derive identity from session/token server-side
- **Update:** ARCHITECTURE.md security section

### 26. **Reporting** ✅
- **Decision:** Don't build full Report Engine in M0
- **But:** Schema/abstraction must not lock biểu mẫu (01/KKTS-XLM, ĐCTS)
- **Future:** Implement in later milestone with templates
- **Update:** ROADMAP.md note reporting phased approach

### 27. **Roadmap Acceptance Gates** ✅ (vs Week-based)
- **Change:** From "Week-based" to "Acceptance-gate based"
- **Example:** M0 complete ONLY IF:
  ```
  D1 migrations pass
  Worker deploys
  R2 works
  Auth skeleton works
  CI passes
  Rollback documented
  ```
- **Not:** "hết tuần 2 = M0 done"
- **Update:** ROADMAP.md reframe as gate-based

### 28. **Task 1 Scope – Not Too Large** ✅
- **Decision:** M0A only (not M0 full)
- **Task 1 Deliverables:**
  ```
  Cloudflare Worker project setup
  Hono API skeleton
  React/Vite application shell
  Environment configuration (local, staging)
  D1 binding
  R2 binding
  Migration mechanism foundation
  Health endpoint
  CI/build verification
  Local dev config
  Staging config
  ```
- **NOT in Task 1:** Production migration, full data migration, equipment module
- **Update:** ROADMAP.md restructure M0 → M0A (Task 1), M0B (Task 2)

### 29. **Task 1 – Database Foundation Only** ✅
- **Create core schema only:**
  ```
  organizations, units
  users, roles, permissions, role_permissions
  user_role_assignments, user_unit_assignments
  schema_migrations
  audit_logs (optional foundation)
  ```
- **Equipment domain:** Next task
- **60+ tables:** Not in one task
- **Update:** ROADMAP.md Task 1 database scope

### 30. **Task 1 – Environment Isolation** ✅
- **Requirement:** At least local, staging, production configs
- **Automation:** local + staging only
- **Production:** Manual gate (no auto-deploy without approval)
- **Update:** ARCHITECTURE.md environment section

### 31. **Task 1 – CI/CD** ✅
- **Minimum on push/PR:**
  ```
  install
  typecheck
  lint
  test
  build
  ```
- **Legacy tests:** If incompatible, don't delete; classify + document migration plan
- **Update:** Create TASK1-CI-CD.md

### 32. **Backup Before Migration** ✅
- **Requirement:** Manifest for every production data migration
- **Contents:**
  ```
  backup_id, created_at, source_db, db_sha256, db_size,
  uploads_file_count, uploads_total_size
  ```
- **Purpose:** Verify exact data source later
- **Update:** DATABASE-MIGRATION.md add backup manifest spec

### 33. **5 Questions Answered** ✅
1. **Dynamic RBAC or ABAC?** → Dynamic RBAC + Data Scope (MVP), not ABAC
2. **React or Vanilla JS?** → React + TypeScript, incremental migration
3. **Queues now?** → No, design extension point but not core M0
4. **Multi-region?** → No application multi-region for MVP
5. **Audit signed/immutable?** → Append-only application policy yes, crypto signing optional Phase 2

### 34. **Documentation Update Requirement** ✅
- **Before Task 1 code:** Update all files with 34-38 decisions
- **Specific additions:**
  - Idempotency section
  - Concurrency control
  - Inventory snapshot detail
  - Reconciliation staging
  - Current state vs event
  - Session consistency
  - Migration verification
  - Environment isolation

### 35. **Task 1 – Final Status** ✅
- **After implementing:** TASK 0 = APPROVED
- **Go ahead:** TASK 1 – M0A CLOUDFLARE FOUNDATION
- **Restrictions:**
  - ❌ No production migration
  - ❌ No SQLite deletion
  - ❌ No uploads deletion
  - ❌ No business logic rewrite
  - ❌ No unsolicited production deployment
  - ❌ No equipment module in Task 1

### 36. **Task 1 Handoff Requirement** ✅
After Task 1 completion, handoff to ChatGPT must include:
```
Branch & Commit
Cloudflare architecture status
Files added/modified
D1 status (local/staging/prod)
R2 status (local/staging/prod)
KV (used or not + reason)
API endpoints list
Frontend status
Migration mechanism
Legacy code impact
Test before/after
Build status
Security checks
Known issues
Production changes (NONE for Task 1)
Recommended Task 2
```
Then STOP for ChatGPT review.

### 37. **Task 1 – Exact Scope** ✅
```
[TASK 1 SCOPE]

Frontend:
- React/Vite project shell
- Login page component (not connected)
- Dashboard placeholder

Backend:
- Hono API skeleton
- Health endpoint (/api/health)
- Auth middleware (not full login yet)
- Error handling

Database:
- D1 create (local + staging)
- Foundation tables only (users, roles, permissions, units)
- Schema migrations mechanism

Storage:
- R2 bindings (local + staging)
- File upload endpoint skeleton

Infrastructure:
- wrangler.toml
- Environment configs (local, staging)
- GitHub Actions CI
- Local dev setup

NOT in Task 1:
- Equipment CRUD
- Transactions
- Inventory
- Reconciliation
- Production deployment
- Full data migration
- File migration
```

### 38. **Final Approval Gate** ✅
TASK 0 = APPROVED WITH UPDATES
Then proceed to TASK 1

---

## SUMMARY OF CHANGES

### Files to Update
1. ✏️ **ARCHITECTURE.md**
   - Add idempotency section
   - Add optimistic concurrency
   - Add current state vs event history
   - Clarify KV scope (not sessions)
   - Remove multi-region architecture
   - Add timezone handling
   - Add incremental migration pattern
   - Add 3-tier backend architecture
   - Remove default session in KV

2. ✏️ **DATABASE-MIGRATION.md**
   - Revise dual-write strategy (not default)
   - Add migration verification checklist
   - Add user_unit_assignments table
   - Add backup manifest spec
   - Add soft delete scope
   - Add file_documents schema

3. ✏️ **BUSINESS-RULES.md**
   - Enhance transaction atomicity
   - Add idempotency rules
   - Enhance inventory snapshot rules
   - Add reconciliation staging workflow
   - Add audit trail requirements
   - Add event history rules

4. ✏️ **PERMISSIONS-MODEL.md**
   - Ensure user_unit_assignments schema
   - Note ABAC expansion path
   - Clarify authorization flow

5. ✏️ **ROADMAP.md**
   - Change from week-based to gate-based
   - Restructure M0 → M0A (Task 1)
   - Remove Queues from M0
   - Task 1 scope clarification
   - Remove multi-region

### New Files to Create
1. 📄 **TASK1-TESTING-STRATEGY.md** – Test classification and migration
2. 📄 **TASK1-CI-CD.md** – CI/CD pipeline specification
3. 📄 **TASK1-SCOPE.md** – Exact Task 1 scope and deliverables

---

## APPROVAL STATUS

✅ **TASK 0 = CONDITIONALLY APPROVED**

**Conditions Met:**
- [x] ChatGPT architecture review complete
- [x] 38 decisions documented
- [x] Approvals granted
- [x] Updates identified
- [x] Task 1 scope refined

**Next Step:** 
Claude updates documentation files (above), then **TASK 0 OFFICIALLY COMPLETE**.
Then ready for **TASK 1 – M0A CLOUDFLARE FOUNDATION**

---

**Prepared by:** Claude (implementing ChatGPT review)  
**Date:** 2026-08-31  
**Status:** APPROVED – Ready for TASK 1 handoff preparation

---

## CHECKLIST FOR CLAUDE

- [ ] Update ARCHITECTURE.md (38 changes)
- [ ] Update DATABASE-MIGRATION.md (10 changes)
- [ ] Update BUSINESS-RULES.md (8 changes)
- [ ] Update PERMISSIONS-MODEL.md (2 changes)
- [ ] Update ROADMAP.md (5 changes)
- [ ] Create TASK1-TESTING-STRATEGY.md
- [ ] Create TASK1-CI-CD.md
- [ ] Create TASK1-SCOPE.md
- [ ] Commit all updates to git
- [ ] Report TASK 0 COMPLETE to user

---

**END OF CHATGPT REVIEW UPDATES**
