# RBAC + DATA SCOPING MODEL

**Objective:** Replace hardcoded 4 roles with flexible, function-level, data-scoped permissions  
**Status:** Design (to be implemented in Milestone 2)

---

## I. PERMISSION HIERARCHY

### Three Dimensions:

**1. Function-Level (What can you do?)**
```typescript
// Example: equipment.view, equipment.create, transaction.approve
type FunctionPermission = `${entity}.${action}`;
```

**2. Data-Level (Which units can you access?)**
```
null = all units (admin)
['DL1', 'DL14', 'VT'] = specific units only (manager)
```

**3. Action-Level (How deeply can you modify?)**
```
view    = read-only
create  = create new
edit    = modify existing
delete  = hard/soft delete (restricted)
approve = approval authority
```

---

## II. CORE PERMISSIONS

### Equipment Management
```
equipment.view          - List/search equipment
equipment.create        - Add new equipment
equipment.edit          - Edit equipment details
equipment.delete        - Delete equipment (soft)
equipment.export        - Export to Excel/PDF
equipment.qrcode        - Generate QR codes
```

### Transactions (Tăng/Giảm/Điều chuyển)
```
transaction.create      - Create transaction draft
transaction.submit      - Submit for approval
transaction.approve     - Approve transaction
transaction.reject      - Reject with reason
transaction.complete    - Mark as completed
transaction.view        - List/view transactions
```

### Inventory
```
inventory.create        - Create inventory session
inventory.count         - Record physical count
inventory.reconcile     - Compare & resolve
inventory.approve       - Approve inventory session
inventory.export        - Export inventory report
```

### Reconciliation (TSCĐ-CCDC Matching)
```
reconciliation.view     - View reconciliation
reconciliation.import   - Import accounting data
reconciliation.match    - Match/adjust records
reconciliation.review   - Review discrepancies
reconciliation.export   - Export reconciliation report
```

### Maintenance
```
maintenance.create      - Create maintenance order
maintenance.complete    - Close maintenance
maintenance.history     - View history
maintenance.export      - Export report
```

### Material Warehouse (NCVT/Kho)
```
material.view          - View inventory
material.import        - Import materials
material.export        - Export materials
material.allocate      - Allocate to units
material.adjust        - Adjust quantities
```

### Administration
```
admin.user.view        - List users
admin.user.create      - Create user account
admin.user.edit        - Edit user info
admin.user.delete      - Deactivate user
admin.role.create      - Create role
admin.role.edit        - Edit role permissions
admin.unit.create      - Create unit/workshop
admin.unit.edit        - Edit unit
admin.config           - System configuration
admin.audit            - View audit logs
admin.backup           - Create/restore backups
```

### Reports
```
report.view            - View reports
report.export_excel    - Export to Excel
report.export_pdf      - Export to PDF
```

---

## III. ROLE DEFINITIONS

### Pre-built Roles (Customizable)

**Admin**
```
ALL permissions
All units
Full access
```

**Company Head (Cơ điện công ty)**
```
equipment.*
transaction.view
transaction.approve
transaction.reject
reconciliation.*
report.*
admin.audit
admin.config (read-only)
All units
```

**Workshop Manager (Cơ điện phân xưởng)**
```
equipment.view
equipment.create
equipment.edit
transaction.create
transaction.submit
transaction.view
inventory.create
inventory.count
inventory.view
material.view
material.allocate
report.view
Assigned units only (e.g., ['DL1', 'DL14'])
```

**Equipment Technician (Cán bộ cơ điện)**
```
equipment.view
equipment.edit (limited fields: status, maintenance date)
transaction.view
maintenance.create
maintenance.complete
material.view
report.view
Assigned units only
```

**Warehouse Manager (Thủ kho)**
```
material.view
material.import
material.export
material.adjust
equipment.view (kho unit only)
Assigned units only (['KHO'])
```

**Readonly User (Chỉ xem)**
```
equipment.view
transaction.view
inventory.view (no modify)
material.view (no modify)
report.view
reconciliation.view (no modify)
All units
```

---

## IV. USER-UNIT-ROLE MAPPING

### Database Schema

```sql
CREATE TABLE user_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  role_id TEXT REFERENCES roles(id),
  unit_id TEXT REFERENCES units(id),
  effective_date TEXT,
  expiration_date TEXT,
  created_at TEXT,
  deleted_at TEXT
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT REFERENCES roles(id),
  permission_code TEXT NOT NULL,
  created_at TEXT
);

CREATE INDEX idx_user_assignments_user ON user_assignments(user_id);
CREATE INDEX idx_user_assignments_unit ON user_assignments(unit_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
```

### Example Data

**User John (Workshop Manager for DL1 & DL14):**
```
user_id = 'user-123'

Assignments:
┌─────────────────────────────────────────┐
│ role_id  │ role_name           │ unit_id │
├──────────┼─────────────────────┼─────────┤
│ role-wx  │ Workshop Manager    │ DL1     │
│ role-wx  │ Workshop Manager    │ DL14    │
└─────────────────────────────────────────┘
```

**When John logs in:**
```json
{
  "userId": "user-123",
  "username": "john_do",
  "roles": [
    {
      "roleId": "role-wx",
      "roleName": "Workshop Manager",
      "permissions": [
        "equipment.view",
        "equipment.create",
        "equipment.edit",
        "transaction.create",
        "transaction.submit",
        "transaction.view",
        ...
      ],
      "units": ["DL1", "DL14"]
    }
  ],
  "allUnits": ["DL1", "DL14"], // Deduplicated from all roles
  "allPermissions": [...], // Union of all role permissions
  "expiresAt": "2026-09-01T12:00:00Z"
}
```

---

## V. AUTHORIZATION CHECK

### Query-Level Filtering

**When fetching equipment:**
```typescript
// Get user's units
const userUnits = await getAssignedUnits(userId);

// Query with unit filter
const equipment = await db.prepare(`
  SELECT * FROM equipment
  WHERE unit_id IN (${userUnits.map(() => '?').join(',')})
  ORDER BY created_at DESC
  LIMIT 100
`).bind(...userUnits).all();
```

### Function-Level Check

```typescript
// In middleware
const checkPermission = (requiredPermission: string) => {
  return async (c, next) => {
    const session = c.get('session');
    
    if (!session.allPermissions.includes(requiredPermission)) {
      return c.json(
        { error: 'Insufficient permissions' },
        403
      );
    }
    
    await next();
  };
};

// Usage
app.post('/api/transactions', 
  checkPermission('transaction.create'),
  transactionController.create
);
```

### Data-Level Check

```typescript
// Before approving transaction
const transaction = await db.prepare(`
  SELECT source_unit_id, dest_unit_id FROM transactions WHERE id = ?
`).bind(transactionId).get();

const userUnits = session.allUnits;
const hasAccess = 
  userUnits.includes(transaction.source_unit_id) ||
  userUnits.includes(transaction.dest_unit_id);

if (!hasAccess) {
  throw new Error('Cannot access this transaction');
}
```

---

## VI. PERMISSION CACHING

**In KV:**
```
cache:permissions:{userId} → {
  allPermissions: [list],
  allUnits: [list],
  expiresAt: timestamp
}
```

**TTL:** 30 minutes  
**Invalidation:** On role/assignment change

---

## VII. AUDIT TRAIL

```sql
INSERT INTO audit_logs (
  id, user_id, action, entity_type, entity_id,
  old_value, new_value, ip_address, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Example: Assign DL1 to John (from admin)
INSERT INTO audit_logs (
  ...,
  action = 'assign_role',
  entity_type = 'user_assignment',
  entity_id = 'assign-456',
  old_value = NULL,
  new_value = '{"user_id":"user-123","role_id":"role-wx","unit_id":"DL1"}',
  ...
);
```

---

**End of PERMISSIONS-MODEL.md**
