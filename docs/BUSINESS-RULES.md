# BUSINESS RULES & WORKFLOWS

**Scope:** Formal definition of core business logic  
**Audience:** Developers, QA, Business Analysts

---

## I. TRANSACTION ENGINE (Tăng-Giảm-Điều Chuyển)

### Rule TR-001: Atomic Transaction

**Definition:** A transaction must be indivisible - either ALL items succeed or NONE.

**Workflow:**
```
DRAFT
  ↓ [User submits]
SUBMITTED
  ↓ [Admin duyệt]
PENDING_APPROVAL
  ↓ [Admin approves or rejects]
APPROVED
  ↓ [System executes: update inventory]
COMPLETED
  OR REJECTED
  OR CANCELLED (by user before approval)
```

**Implementation:**
```typescript
// Use database transaction (ACID)
db.transaction(() => {
  // 1. Create transaction record
  db.prepare('INSERT INTO transactions ...').run();
  
  // 2. Deduct from source unit
  db.prepare('UPDATE equipment SET unit_id = ? WHERE id IN (...)').run();
  
  // 3. Add to dest unit
  db.prepare('UPDATE equipment SET unit_id = ? WHERE id IN (...)').run();
  
  // 4. Record approval
  db.prepare('INSERT INTO transaction_approvals ...').run();
  
  // 5. Create audit log
  db.prepare('INSERT INTO audit_logs ...').run();
  
  // If any step fails, ALL are rolled back
})();
```

### Rule TR-002: Approval Required

**Definition:** All transactions must be approved before execution.

**Who can approve:**
- System Admin: all transactions
- Company Head (Cơ điện công ty): company-level transactions
- Workshop Manager: transactions within assigned units only

**Approval check:**
```sql
SELECT * FROM transactions 
WHERE status = 'PENDING_APPROVAL' 
AND (
  source_unit_id IN (SELECT unit_id FROM user_assignments WHERE user_id = ?)
  OR dest_unit_id IN (SELECT unit_id FROM user_assignments WHERE user_id = ?)
)
```

### Rule TR-003: No Negative Inventory

**Definition:** Equipment cannot be transferred if not present in source unit.

**Check before execution:**
```sql
SELECT COUNT(*) FROM equipment 
WHERE unit_id = ? AND id IN (...)
HAVING COUNT(*) >= transaction_item_count
```

### Rule TR-004: Audit Trail Immutable

**Definition:** All state changes recorded in `audit_logs`, cannot be deleted.

**Captured:**
- Who made the change
- When (timestamp)
- Old value vs new value
- IP address, session ID
- Approval authority (if applicable)

---

## II. INVENTORY SYSTEM (Kiểm Kê)

### Rule INV-001: Snapshot at Session Creation

**Definition:** When inventory session created, capture system state (equipment list, status, quantities).

```sql
INSERT INTO inventory_sessions (
  id, unit_id, system_snapshot, status, created_at
) VALUES (
  ?, ?, 
  (SELECT json_object('equipment', json_group_array(...)) FROM equipment WHERE unit_id = ?),
  'OPEN',
  now()
);
```

### Rule INV-002: Physical Count Recording

**Definition:** Users record actual count (manual, QR scan, or import).

**Data entry methods:**
1. Manual input form
2. QR code scanner (PWA)
3. Excel import
4. Barcode reader device

**Validation:**
- Equipment code exists in system
- Status recorded (active, damaged, missing, etc.)
- Timestamp of count
- Counter's name

### Rule INV-003: Discrepancy Classification

**Definition:** Compare system state vs physical count.

| Status | Meaning | Action |
|--------|---------|--------|
| MATCHED | Found & state OK | None |
| MISSING | In system, not found | Investigate/remove |
| EXCESS | Found, not in system | Add to system |
| WRONG_STATUS | Found but status mismatch | Correct status |
| WRONG_UNIT | Found in different unit | Transfer |
| UNKNOWN | Found but unidentifiable | Research |

### Rule INV-004: Session Lifecycle

```
OPEN
  ↓ [Users count inventory]
COUNTING_COMPLETE
  ↓ [Admin reviews discrepancies]
NEEDS_CORRECTION
  ↓ [Issues resolved via transactions]
RECONCILED
  ↓ [Approved by authority]
CLOSED
```

---

## III. RECONCILIATION (Đối Chiếu TSCĐ-CCDC)

### Rule REC-001: Three Sources of Truth

**Source 1: QLCD System**
```
SELECT COUNT(*) FROM equipment WHERE unit_id = ? AND loai_ts = 'TSCD'
```

**Source 2: Accounting (TSCĐ-CCDC)**
```
Import from Excel/PDF: [equipment_code, quantity, value]
```

**Source 3: Physical Inventory**
```
From inventory_sessions where status = 'CLOSED'
```

### Rule REC-002: Matching Logic

```typescript
interface ReconciliationItem {
  code: string;
  system_count: number;
  accounting_count: number;
  physical_count: number;
  status: 'matched' | 'discrepancy';
  discrepancy_type: 
    | 'system_excess' 
    | 'accounting_excess' 
    | 'physical_missing'
    | 'quantity_mismatch';
}

// All three counts match
if (system_count === accounting_count && accounting_count === physical_count) {
  status = 'matched';
}
// Any mismatch
else {
  status = 'discrepancy';
  // Classify type
}
```

### Rule REC-003: No Auto-Correction

**Definition:** System NEVER automatically modifies source data to match.

**Instead:** Generate reconciliation report, flag issues, route to admin approval.

```
Discrepancy → Reconciliation Report → Admin Review → Approve Correction → Transaction Created
```

---

## IV. EQUIPMENT LIFECYCLE (Vòng Đời Thiết Bị)

### Rule EQ-001: Immutable History

**Definition:** Equipment lifecycle events cannot be deleted or modified retroactively.

**Events:**
- Creation/Import
- Transfer between units
- Status change (active → repair → disposal)
- Maintenance performed
- Inspection passed/failed
- Components replaced
- Retirement

**Storage:**
```sql
CREATE TABLE equipment_events (
  id TEXT PRIMARY KEY,
  equipment_id TEXT,
  event_type TEXT, -- 'created', 'transferred', 'repaired', etc.
  event_data JSON, -- {from_unit, to_unit, reason, ...}
  recorded_by TEXT,
  recorded_at TEXT,
  created_at TEXT -- immutable
);
```

### Rule EQ-002: Current State Derived from Events

**Definition:** Don't store redundant `current_unit`, derive it from latest transfer event.

```typescript
function getCurrentUnit(equipmentId: string): string {
  const latestEvent = db.prepare(`
    SELECT event_data FROM equipment_events
    WHERE equipment_id = ? AND event_type = 'transferred'
    ORDER BY recorded_at DESC LIMIT 1
  `).bind(equipmentId).get();
  
  return latestEvent?.event_data?.to_unit || equipment.original_unit;
}
```

### Rule EQ-003: Status Transitions

**Valid transitions:**
```
ACTIVE
  ↓ [maintenance needed]
UNDER_REPAIR
  ↓ [repair complete]
ACTIVE  OR  DISPOSED
  ↓ [end of life]
DISPOSED
```

**Invalid transitions:** Cannot jump directly from ACTIVE to DISPOSED (must go through UNDER_REPAIR for audit).

---

## V. MATERIAL MANAGEMENT (NCVT/Kho)

### Rule MAT-001: Quarterly Allocation

**Definition:** Material allocated to units on quarterly basis (Q1, Q2, Q3, Q4).

```sql
CREATE TABLE material_allocations (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  quarter TEXT, -- 'Q1', 'Q2', etc.
  year INTEGER,
  material_id TEXT,
  quantity_allocated INTEGER,
  quantity_used INTEGER,
  status TEXT, -- 'pending', 'approved', 'closed'
  created_at TEXT
);
```

### Rule MAT-002: No Negative Allocation

**Definition:** Cannot use more material than allocated.

**Check:**
```sql
SELECT SUM(quantity_used) < quantity_allocated FROM material_allocations
```

### Rule MAT-003: End of Quarter Close

**Definition:** At quarter end, unused material must be returned or written off.

**Actions:**
1. Audit remaining quantities
2. Return to central warehouse OR
3. Write off with approval

---

## VI. MAINTENANCE WORKFLOW (Bảo Dưỡng)

### Rule MAIN-001: Planned Maintenance

**Definition:** Based on equipment model, schedule periodic maintenance.

```
Equipment → Model → Maintenance Schedule (e.g., every 500 operating hours)
  ↓
System generates maintenance reminder
  ↓
Technician creates maintenance order
  ↓
Perform work, record parts used
  ↓
Close order with before/after notes
```

### Rule MAIN-002: Inspection Required

**Definition:** Before returning to service, equipment must pass inspection.

```
Maintenance Complete
  ↓
Inspection Scheduled
  ↓
Passed → Active
  OR
Failed → Needs Rework
```

---

## VII. FILE & DOCUMENT MANAGEMENT

### Rule FILE-001: Metadata Only in D1

**Definition:** File binaries stored in R2, metadata in D1.

```sql
INSERT INTO file_documents (
  id, entity_type, entity_id, object_key, 
  filename, mime_type, size_bytes, uploaded_by, uploaded_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
```

### Rule FILE-002: Deletion is Soft

**Definition:** Files marked deleted, actual R2 object retained 30 days, then purged.

```sql
UPDATE file_documents SET deleted_at = ? WHERE id = ?;
-- After 30 days: DELETE FROM file_documents; rm from R2
```

### Rule FILE-003: Access Control

**Definition:** File download checks user has access to entity.

```typescript
// Before download
const file = db.prepare('SELECT entity_type, entity_id FROM file_documents WHERE id = ?')
  .bind(fileId).get();

const entity = db.prepare(`SELECT * FROM ${file.entity_type} WHERE id = ?`)
  .bind(file.entity_id).get();

// Check user's access to this entity (unit scoping, role, etc.)
if (!userCanAccess(entity)) {
  throw new Error('Access Denied');
}
```

---

## VIII. SYSTEM INVARIANTS

**These must NEVER be violated:**

1. ✅ No negative equipment quantities
2. ✅ No negative material allocations
3. ✅ All transactions atomically succeed or fail
4. ✅ Audit logs are immutable
5. ✅ Equipment can only exist in ONE unit at a time
6. ✅ All transactions must be approved before execution
7. ✅ No equipment can be created/transferred without valid unit
8. ✅ Soft deletes must leave audit trail intact

---

**End of BUSINESS-RULES.md**
