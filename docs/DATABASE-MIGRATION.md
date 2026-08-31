# DATABASE MIGRATION PLAN: SQLite → Cloudflare D1

**Scope:** Gradual migration of QLCD from local SQLite to managed D1  
**Target:** Zero downtime, full data integrity  
**Timeline:** 4 weeks  

---

## I. MIGRATION STRATEGY

### Phase 1: Preparation (Week 1)
1. **Create D1 Database**
   - Create new D1 instance: `qlcd-prod`
   - Generate database_id for wrangler.toml

2. **Deploy Current Schema**
   - Run 13 SQL files against D1 (01-schema.sql through 13-kho-vat-tu.sql)
   - Verify all tables, indexes, constraints created successfully

3. **Set Up Dual-Write System**
   - Modify application to write to BOTH SQLite and D1
   - Keep reads from SQLite temporarily
   - Log all writes to monitor sync issues

### Phase 2: Data Export & Transform (Week 2)
1. **Export SQLite Data**
   ```bash
   # Extract all tables as JSON
   for table in $(sqlite3 db/qlcd.db ".tables"); do
     sqlite3 db/qlcd.db ".mode json" "SELECT * FROM $table" > export/$table.json
   done
   ```

2. **Data Mapping**
   ```
   SQLite ID (INTEGER) → D1 ID (UUID)
   Created dates (TEXT 'localtime') → UTC ISO8601
   Foreign key references (update all)
   Rename columns if needed for consistency
   ```

3. **Validation Script**
   - Verify row counts match
   - Check referential integrity
   - Validate data types

### Phase 3: Initial Load (Week 3)
1. **Batch Insert into D1**
   ```typescript
   // Use Cloudflare Queues for large datasets
   // Process 1000 rows per job
   // Retry failed inserts with exponential backoff
   ```

2. **Switch to Read from D1**
   - Enable read traffic to D1
   - Keep dual-write active (SQLite + D1)
   - Monitor discrepancies

3. **Run Reconciliation**
   ```sql
   -- Check row counts
   SELECT COUNT(*) FROM equipment;
   
   -- Find orphaned foreign keys
   SELECT * FROM transactions WHERE source_unit_id NOT IN (SELECT id FROM units);
   
   -- Verify totals/checksums
   SELECT SUM(gia_tri_con_lai) FROM thiet_bi;
   ```

### Phase 4: Cutover & Cleanup (Week 4)
1. **Stop Dual-Write**
   - Disable SQLite writes
   - Reads from D1 only
   - Keep SQLite as backup (do NOT delete)

2. **Final Verification**
   - Run full reconciliation report
   - Check application logs for errors
   - User acceptance testing (UAT)

3. **Archive SQLite**
   - Backup to R2: `archives/sqlite-backup-2026-09-{date}.db`
   - Keep for 30 days before deletion
   - Document recovery procedure

---

## II. DATA MAPPING

### Core Tables Mapping

| SQLite Table | D1 Table | Changes | Notes |
|--------------|----------|---------|-------|
| `phan_xuong` | `units` | Rename; add `deleted_at` | Parent unit concept |
| `vi_tri` | `locations` | Rename; add soft delete | Hierarchical |
| `nhom_thiet_bi` | `equipment_categories` | Rename; add soft delete | Equipment grouping |
| `model_thiet_bi` | `equipment_models` | Rename | Keep intact |
| `nguoi_dung` | `users` | Rename; add `deleted_at` | Authentication |
| `thiet_bi` | `equipment` | Rename; add soft delete | Core asset |
| `thong_so_thiet_bi` | `equipment_specs` | Rename | Specifications |
| `giao_dich` | `transactions` | Rename; add soft delete | Transaction engine |
| `chi_tiet_giao_dich` | `transaction_items` | Rename | Transaction details |
| `duyet_giao_dich` | `transaction_approvals` | Rename | Approval workflow |
| `kiem_ke_ky` | `inventory_sessions` | Rename; add soft delete | Inventory |
| `chi_tiet_kiem_ke` | `inventory_items` | Rename | Inventory details |
| `doi_chieu_ky` | `reconciliation_sessions` | Rename; add soft delete | TSCĐ-CCDC matching |
| `chi_tiet_doi_chieu` | `reconciliation_items` | Rename | Reconciliation details |
| `nhat_ky_hoat_dong` | `audit_logs` | Rename; immutable | Audit trail |
| `file_mau` | `templates` | Rename | Template management |
| `kho_vat_tu` | `warehouses` | Rename | Material warehouse |
| *NEW* | `file_documents` | Create | File metadata for R2 |
| *NEW* | `system_config` | Create | Configuration key-value |

### ID Migration Strategy

**SQLite:** INTEGER PRIMARY KEY AUTOINCREMENT  
**D1:** TEXT PRIMARY KEY (UUID v4)

**Migration Script:**
```typescript
const oldId = row.id; // e.g., 123
const newId = uuidv4(); // e.g., "550e8400-e29b-41d4-a716-446655440000"

// Track mapping for foreign key updates
idMap.set(oldId, newId);

// Update all references
for (const fkRow of foreignKeyRows) {
  fkRow.parent_id = idMap.get(fkRow.parent_id);
}
```

---

## III. SCHEMA CHANGES

### Add Soft Delete Fields

```sql
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE units ADD COLUMN deleted_at TEXT;
ALTER TABLE equipment ADD COLUMN deleted_at TEXT;
ALTER TABLE transactions ADD COLUMN deleted_at TEXT;
ALTER TABLE inventory_sessions ADD COLUMN deleted_at TEXT;
ALTER TABLE reconciliation_sessions ADD COLUMN deleted_at TEXT;
```

### Add New Tables

**File Metadata:**
```sql
CREATE TABLE file_documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'equipment', 'transaction', 'inventory', etc.
  entity_id TEXT NOT NULL,
  object_key TEXT NOT NULL, -- R2 path
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT,
  uploaded_at TEXT,
  checksum TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX idx_file_entity ON file_documents(entity_type, entity_id);
CREATE INDEX idx_file_uploaded ON file_documents(uploaded_at);
```

**System Configuration:**
```sql
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);
```

---

## IV. MIGRATION SCRIPT (TypeScript)

```typescript
// src/migration/migrate-sqlite-to-d1.ts

import Database from 'better-sqlite3';
import { Env } from '../types/env';
import { v4 as uuidv4 } from 'uuid';

interface MigrationResult {
  tableName: string;
  rowsMigrated: number;
  errors: string[];
}

export async function migrateSQLiteToD1(env: Env): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];
  const idMaps: Record<string, Map<number, string>> = {};

  // Connect to local SQLite
  const localDb = new Database('db/qlcd.db');

  try {
    // Phase 1: Migrate ID-based tables (no foreign keys to track)
    const simpleTables = ['phan_xuong', 'nhom_thiet_bi', 'model_thiet_bi'];
    
    for (const tableName of simpleTables) {
      const result = await migrateTable(env, localDb, tableName, idMaps);
      results.push(result);
    }

    // Phase 2: Migrate dependent tables
    const result = await migrateEquipment(env, localDb, idMaps);
    results.push(result);

    // Phase 3: Migrate transactions (uses equipment IDs)
    const txResult = await migrateTransactions(env, localDb, idMaps);
    results.push(txResult);

    console.log('Migration complete:', results);
    return results;
  } finally {
    localDb.close();
  }
}

async function migrateTable(
  env: Env,
  localDb: Database.Database,
  tableName: string,
  idMaps: Record<string, Map<number, string>>
): Promise<MigrationResult> {
  const rows = localDb.prepare(`SELECT * FROM ${tableName}`).all();
  const idMap = new Map<number, string>();
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const newId = uuidv4();
      idMap.set(row.id, newId);

      const transformedRow = transformRow(row, tableName, idMaps);

      await env.DB.prepare(`
        INSERT INTO ${tableName} (id, ...) VALUES (?, ...)
      `).bind(newId, ...Object.values(transformedRow)).run();
    } catch (error) {
      errors.push(`Row ${row.id}: ${error.message}`);
    }
  }

  idMaps[tableName] = idMap;

  return {
    tableName,
    rowsMigrated: rows.length - errors.length,
    errors,
  };
}

function transformRow(
  row: any,
  tableName: string,
  idMaps: Record<string, Map<number, string>>
): Record<string, any> {
  const transformed = { ...row };

  // Remove old ID
  delete transformed.id;

  // Update foreign keys
  if (transformed.parent_id && idMaps[tableName]) {
    transformed.parent_id = idMaps[tableName].get(transformed.parent_id);
  }

  if (transformed.phan_xuong_id && idMaps['phan_xuong']) {
    transformed.unit_id = idMaps['phan_xuong'].get(transformed.phan_xuong_id);
    delete transformed.phan_xuong_id;
  }

  // Convert timestamps
  if (transformed.ngay_tao) {
    transformed.created_at = new Date(transformed.ngay_tao).toISOString();
    delete transformed.ngay_tao;
  }

  return transformed;
}
```

---

## V. VERIFICATION CHECKLIST

- [ ] All 13 SQL files executed without errors
- [ ] Table count matches source (60+ tables)
- [ ] Row count matches for each table
- [ ] Foreign key constraints validated
- [ ] No NULL values in NOT NULL columns
- [ ] Checksums match (SUM of numeric columns)
- [ ] Date formats consistent (ISO8601 UTC)
- [ ] Soft delete fields empty (all deleted_at IS NULL)
- [ ] Indexes created successfully
- [ ] New tables (file_documents, system_config) ready
- [ ] Application logic tested with D1 data
- [ ] Performance baseline established

---

## VI. ROLLBACK PROCEDURE

**If issues detected:**
1. Stop writes to D1
2. Revert reads back to SQLite
3. Investigate and fix issues
4. Restart migration from Phase 2

**Keep backup SQLite for 30 days post-migration.**

---

**End of DATABASE-MIGRATION.md**
