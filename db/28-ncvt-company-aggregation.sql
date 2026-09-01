-- TASK 15: Company NCVT aggregation and canonical supply sources.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS supply_sources(
 id TEXT PRIMARY KEY,source_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
 source_type TEXT NOT NULL CHECK(source_type IN('INTERNAL_WAREHOUSE','CONTRACT','SUPPLIER','OTHER')),
 warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','ARCHIVED')),
 version INTEGER NOT NULL DEFAULT 1,note TEXT,created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),
 created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 CHECK((source_type='INTERNAL_WAREHOUSE' AND warehouse_id IS NOT NULL) OR (source_type<>'INTERNAL_WAREHOUSE' AND warehouse_id IS NULL))
);
CREATE TABLE IF NOT EXISTS material_supply_sources(
 id TEXT PRIMARY KEY,material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
 supply_source_id TEXT NOT NULL REFERENCES supply_sources(id) ON DELETE RESTRICT,
 priority INTEGER NOT NULL DEFAULT 1 CHECK(priority>0),preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN(0,1)),
 lead_time_days INTEGER CHECK(lead_time_days IS NULL OR lead_time_days>=0),min_order_quantity REAL CHECK(min_order_quantity IS NULL OR min_order_quantity>0),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','ARCHIVED')),version INTEGER NOT NULL DEFAULT 1,note TEXT,
 created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 updated_by INTEGER REFERENCES nguoi_dung(id),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 UNIQUE(material_id,supply_source_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_supply_preferred ON material_supply_sources(material_id) WHERE preferred=1 AND status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_material_supply_active ON material_supply_sources(material_id,status,priority);
CREATE TABLE IF NOT EXISTS material_supply_source_events(
 id TEXT PRIMARY KEY,mapping_id TEXT NOT NULL REFERENCES material_supply_sources(id) ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN('CREATE','UPDATE','ARCHIVE')),
 from_version INTEGER,to_version INTEGER NOT NULL,payload_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS trg_material_supply_events_no_update BEFORE UPDATE ON material_supply_source_events BEGIN SELECT RAISE(ABORT,'Material supply source event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_material_supply_events_no_delete BEFORE DELETE ON material_supply_source_events BEGIN SELECT RAISE(ABORT,'Material supply source event is immutable'); END;
CREATE VIEW IF NOT EXISTS v_ncvt_company_aggregate AS
 SELECT s.period_id,l.material_id,l.uom_code,SUM(l.requested_quantity) approved_quantity,
 COUNT(DISTINCT s.don_vi_id) unit_count,COUNT(DISTINCT s.id) submission_count,COUNT(l.id) line_count
 FROM ncvt_submissions s JOIN ncvt_submission_lines l ON l.submission_id=s.id
 WHERE s.status='APPROVED' GROUP BY s.period_id,l.material_id,l.uom_code;
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
 ('ncvt.aggregate.view','Xem tổng hợp NCVT Công ty','Xem tổng hợp chỉ từ submission đã duyệt','ncvt_company'),
 ('ncvt.supply.manage','Quản lý nguồn cung NCVT','Quản lý danh mục và mapping nguồn cung chuẩn','ncvt_company');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
 SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma IN('admin','cd_cty') AND q.hang_muc='ncvt_company';
