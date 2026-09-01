-- TASK 21: canonical repair, maintenance and inspection lifecycle.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS technical_work_orders (
    id TEXT PRIMARY KEY,
    work_order_code TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL CHECK(operation_type IN('REPAIR','MAINTENANCE','INSPECTION')),
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    primary_component_id INTEGER REFERENCES device_components(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN('DRAFT','SUBMITTED','RETURNED','APPROVED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN('NORMAL','URGENT','STOP_PRODUCTION')),
    description TEXT NOT NULL,
    diagnosis TEXT,
    action_taken TEXT,
    result TEXT CHECK(result IN('PASS','CONDITIONAL','FAIL') OR result IS NULL),
    scheduled_date TEXT,
    started_at TEXT,
    completed_at TEXT,
    next_due_date TEXT,
    idempotency_key TEXT UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    legacy_repair_id INTEGER UNIQUE REFERENCES phieu_sua_chua(id) ON DELETE RESTRICT,
    legacy_maintenance_id INTEGER UNIQUE REFERENCES phieu_bao_duong(id) ON DELETE RESTRICT,
    legacy_inspection_id INTEGER UNIQUE REFERENCES kiem_dinh(id) ON DELETE RESTRICT,
    created_by INTEGER REFERENCES nguoi_dung(id),
    updated_by INTEGER REFERENCES nguoi_dung(id),
    created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_technical_work_orders_scope
    ON technical_work_orders(device_id,operation_type,status,scheduled_date);

CREATE TABLE IF NOT EXISTS technical_work_order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id TEXT NOT NULL REFERENCES technical_work_orders(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK(event_type IN
        ('MIGRATED','CREATED','SUBMITTED','RETURNED','APPROVED','REJECTED','STARTED','MATERIAL_ISSUED','MATERIAL_REVERSED','COMPLETED','CANCELLED')),
    from_status TEXT,
    to_status TEXT,
    work_order_version INTEGER NOT NULL,
    reason TEXT,
    details_json TEXT,
    actor_id INTEGER REFERENCES nguoi_dung(id),
    event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_technical_work_order_events
    ON technical_work_order_events(work_order_id,id);
CREATE TRIGGER IF NOT EXISTS trg_technical_work_order_events_no_update
BEFORE UPDATE ON technical_work_order_events BEGIN SELECT RAISE(ABORT,'Technical work order event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_work_order_events_no_delete
BEFORE DELETE ON technical_work_order_events BEGIN SELECT RAISE(ABORT,'Technical work order event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_work_orders_no_delete
BEFORE DELETE ON technical_work_orders BEGIN SELECT RAISE(ABORT,'Technical work order cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_work_orders_terminal_no_update
BEFORE UPDATE ON technical_work_orders
WHEN OLD.status IN('COMPLETED','REJECTED','CANCELLED')
BEGIN SELECT RAISE(ABORT,'Terminal technical work order is immutable'); END;

CREATE TABLE IF NOT EXISTS technical_material_issues (
    id TEXT PRIMARY KEY,
    work_order_id TEXT NOT NULL REFERENCES technical_work_orders(id) ON DELETE RESTRICT,
    component_id INTEGER NOT NULL REFERENCES device_components(id) ON DELETE RESTRICT,
    stock_transaction_id TEXT NOT NULL UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,
    reversal_stock_transaction_id TEXT UNIQUE REFERENCES stock_transactions(id) ON DELETE RESTRICT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    uom_code TEXT NOT NULL REFERENCES uoms(code),
    quantity REAL NOT NULL CHECK(quantity>0),
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN('POSTED','REVERSED')),
    idempotency_key TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    issued_by INTEGER REFERENCES nguoi_dung(id),
    issued_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    reversed_by INTEGER REFERENCES nguoi_dung(id),
    reversed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_technical_material_issues_order
    ON technical_material_issues(work_order_id,status,material_id);

-- Compatibility backfill: source records remain untouched.
INSERT OR IGNORE INTO technical_work_orders
(id,work_order_code,operation_type,device_id,primary_component_id,status,priority,description,diagnosis,
 action_taken,result,scheduled_date,started_at,completed_at,legacy_repair_id,created_by,created_at,updated_at)
SELECT 'legacy-repair-'||p.id,'LEGACY-'||p.so_phieu,'REPAIR',d.id,l.component_id,
 CASE p.trang_thai WHEN 'nhap' THEN 'DRAFT' WHEN 'cho_duyet' THEN 'SUBMITTED'
  WHEN 'chuyen_lai' THEN 'RETURNED' WHEN 'da_duyet' THEN 'APPROVED'
  WHEN 'dang_thuc_hien' THEN 'IN_PROGRESS' WHEN 'hoan_thanh' THEN 'COMPLETED'
  WHEN 'huy' THEN 'CANCELLED' ELSE 'DRAFT' END,
 CASE p.muc_do WHEN 'khan' THEN 'URGENT' WHEN 'dung_san_xuat' THEN 'STOP_PRODUCTION' ELSE 'NORMAL' END,
 COALESCE(p.mo_ta_hu_hong,'Phiếu sửa chữa legacy'),p.nguyen_nhan,p.bien_phap_xu_ly,
 CASE p.ket_qua WHEN 'dat' THEN 'PASS' WHEN 'khong_dat' THEN 'FAIL' ELSE NULL END,
 p.ngay_bat_dau,p.ngay_bat_dau,p.ngay_hoan_thanh,p.id,p.nguoi_lap_id,p.ngay_tao,p.ngay_tao
FROM phieu_sua_chua p JOIN devices d ON d.legacy_thiet_bi_id=p.thiet_bi_id
LEFT JOIN component_repair_links l ON l.legacy_repair_id=p.id;

INSERT OR IGNORE INTO technical_work_orders
(id,work_order_code,operation_type,device_id,primary_component_id,status,description,action_taken,result,
 scheduled_date,started_at,completed_at,next_due_date,legacy_maintenance_id,created_by,created_at,updated_at)
SELECT 'legacy-maintenance-'||p.id,'LEGACY-'||p.ma_phieu,'MAINTENANCE',d.id,c.id,
 CASE p.trang_thai WHEN 'da_len_lich' THEN 'DRAFT' WHEN 'den_han' THEN 'APPROVED'
  WHEN 'qua_han' THEN 'APPROVED' WHEN 'dang_thuc_hien' THEN 'IN_PROGRESS'
  WHEN 'hoan_thanh' THEN 'COMPLETED' WHEN 'huy' THEN 'CANCELLED'
  WHEN 'bo_qua' THEN 'CANCELLED' ELSE 'DRAFT' END,
 COALESCE(p.noi_dung_cong_viec,'Phiếu bảo dưỡng legacy'),p.ket_qua_kiem_tra,
 CASE WHEN p.trang_thai='hoan_thanh' THEN 'PASS' ELSE NULL END,p.ngay_ke_hoach,p.ngay_thuc_hien,
 CASE WHEN p.trang_thai='hoan_thanh' THEN p.ngay_thuc_hien ELSE NULL END,p.ngay_han_ke_tiep,
 p.id,p.nguoi_tao_id,p.ngay_tao,COALESCE(p.ngay_sua,p.ngay_tao)
FROM phieu_bao_duong p JOIN devices d ON d.legacy_thiet_bi_id=p.thiet_bi_id
LEFT JOIN device_components c ON c.legacy_component_id=p.cum_id;

INSERT OR IGNORE INTO technical_work_orders
(id,work_order_code,operation_type,device_id,status,description,action_taken,result,scheduled_date,
 started_at,completed_at,next_due_date,legacy_inspection_id,created_by,created_at,updated_at)
SELECT 'legacy-inspection-'||k.id,'LEGACY-KD-'||k.id,'INSPECTION',d.id,'COMPLETED',
 COALESCE(l.ten,'Kiểm định thiết bị'),k.ket_luan,
 CASE k.ket_qua WHEN 'dat' THEN 'PASS' WHEN 'dat_co_dieu_kien' THEN 'CONDITIONAL' ELSE 'FAIL' END,
 k.ngay_kiem_dinh,k.ngay_kiem_dinh,k.ngay_kiem_dinh,k.ngay_het_han,k.id,k.nguoi_nhap_id,k.ngay_tao,k.ngay_tao
FROM kiem_dinh k JOIN devices d ON d.legacy_thiet_bi_id=k.thiet_bi_id
JOIN loai_kiem_dinh l ON l.id=k.loai_kiem_dinh_id;

INSERT OR IGNORE INTO technical_work_order_events
(work_order_id,event_type,to_status,work_order_version,reason,details_json,event_time)
SELECT id,'MIGRATED',status,version,'Backfill tương thích; không sửa dữ liệu nguồn',
 json_object('legacy_repair_id',legacy_repair_id,'legacy_maintenance_id',legacy_maintenance_id,
             'legacy_inspection_id',legacy_inspection_id),created_at
FROM technical_work_orders WHERE legacy_repair_id IS NOT NULL OR legacy_maintenance_id IS NOT NULL OR legacy_inspection_id IS NOT NULL;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('technical_operation.view','Xem công việc kỹ thuật','Xem repair/maintenance/inspection canonical','technical_operation'),
('technical_operation.create','Lập công việc kỹ thuật','Tạo và submit work order canonical','technical_operation'),
('technical_operation.review','Duyệt công việc kỹ thuật','Return, approve hoặc reject work order','technical_operation'),
('technical_operation.execute','Thực hiện công việc kỹ thuật','Start và complete work order','technical_operation'),
('technical_operation.material_issue','Xuất vật tư kỹ thuật','Post/reverse ISSUE vào Stock Ledger cho work order','technical_operation');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma IN('admin','cd_cty') AND q.hang_muc='technical_operation';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN('technical_operation.view','technical_operation.create',
 'technical_operation.execute','technical_operation.material_issue');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='technical_operation.view';
