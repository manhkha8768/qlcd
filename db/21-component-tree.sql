-- TASK 8: canonical component tree on Device ID with versioned mutations.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    parent_id INTEGER REFERENCES device_components(id) ON DELETE RESTRICT,
    component_code TEXT NOT NULL,
    name TEXT NOT NULL,
    component_type TEXT NOT NULL DEFAULT 'ASSEMBLY'
        CHECK (component_type IN ('ASSEMBLY','PART','MATERIAL')),
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    part_number TEXT,
    quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
    uom TEXT NOT NULL DEFAULT 'Cái',
    installed_at TEXT,
    removed_at TEXT,
    status TEXT NOT NULL DEFAULT 'INSTALLED'
        CHECK (status IN ('INSTALLED','REMOVED','REPLACED','SPARE')),
    condition TEXT NOT NULL DEFAULT 'GOOD'
        CHECK (condition IN ('GOOD','FAIR','POOR','FAILED')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    legacy_component_id INTEGER UNIQUE REFERENCES cum_thiet_bi(id),
    created_by INTEGER REFERENCES nguoi_dung(id),
    updated_by INTEGER REFERENCES nguoi_dung(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(device_id,component_code),
    CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_device_components_tree ON device_components(device_id,parent_id,active,sort_order);

CREATE TABLE IF NOT EXISTS component_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id INTEGER NOT NULL REFERENCES device_components(id) ON DELETE RESTRICT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN
        ('INSTALL','MOVE','UPDATE','REMOVE','REPLACE_OUT','REPLACE_IN','REPAIR','MAINTENANCE','MATERIAL_USE','INSPECT','FAIL')),
    component_version INTEGER NOT NULL,
    previous_parent_id INTEGER REFERENCES device_components(id),
    new_parent_id INTEGER REFERENCES device_components(id),
    related_component_id INTEGER REFERENCES device_components(id),
    details_json TEXT,
    event_date TEXT NOT NULL DEFAULT (date('now','localtime')),
    actor_id INTEGER REFERENCES nguoi_dung(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_component_events_node ON component_events(component_id,id);
CREATE TRIGGER IF NOT EXISTS trg_component_events_no_update
BEFORE UPDATE ON component_events BEGIN SELECT RAISE(ABORT,'Component event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_component_events_no_delete
BEFORE DELETE ON component_events BEGIN SELECT RAISE(ABORT,'Component event is immutable'); END;

CREATE TABLE IF NOT EXISTS component_repair_links (
    component_id INTEGER NOT NULL REFERENCES device_components(id) ON DELETE RESTRICT,
    legacy_repair_id INTEGER NOT NULL UNIQUE REFERENCES phieu_sua_chua(id) ON DELETE RESTRICT,
    linked_by INTEGER REFERENCES nguoi_dung(id),
    linked_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY(component_id,legacy_repair_id)
);
CREATE TABLE IF NOT EXISTS component_material_links (
    component_id INTEGER NOT NULL REFERENCES device_components(id) ON DELETE RESTRICT,
    legacy_repair_material_id INTEGER NOT NULL UNIQUE REFERENCES vat_tu_sua_chua(id) ON DELETE RESTRICT,
    part_id INTEGER REFERENCES phu_tung(id),
    linked_by INTEGER REFERENCES nguoi_dung(id),
    linked_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY(component_id,legacy_repair_material_id)
);
CREATE TABLE IF NOT EXISTS component_part_compatibility (
    component_id INTEGER NOT NULL REFERENCES device_components(id) ON DELETE RESTRICT,
    part_id INTEGER NOT NULL REFERENCES phu_tung(id) ON DELETE RESTRICT,
    recommended_quantity REAL NOT NULL DEFAULT 1 CHECK (recommended_quantity > 0),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    note TEXT,
    legacy_link_id INTEGER UNIQUE REFERENCES phu_tung_thiet_bi(id),
    PRIMARY KEY(component_id,part_id)
);

INSERT OR IGNORE INTO device_components
(device_id,component_code,name,component_type,manufacturer,model,serial_number,part_number,quantity,uom,
 installed_at,removed_at,status,condition,sort_order,note,active,legacy_component_id,created_by,updated_by,created_at,updated_at)
SELECT d.id,c.ma_cum,c.ten,CASE c.loai_cum WHEN 'chi_tiet' THEN 'PART' WHEN 'vat_tu' THEN 'MATERIAL' ELSE 'ASSEMBLY' END,
 c.hang_sx,c.model,c.so_seri,c.ma_phu_tung,c.so_luong,COALESCE(c.dvt,'Cái'),c.ngay_lap,c.ngay_thao,
 CASE c.trang_thai WHEN 'da_thao' THEN 'REMOVED' WHEN 'da_thay_the' THEN 'REPLACED' WHEN 'du_phong' THEN 'SPARE' ELSE 'INSTALLED' END,
 CASE c.tinh_trang_kt WHEN 'trung_binh' THEN 'FAIR' WHEN 'kem' THEN 'POOR' WHEN 'hong' THEN 'FAILED' ELSE 'GOOD' END,
 c.thu_tu,c.ghi_chu,c.hoat_dong,c.id,c.nguoi_tao_id,c.nguoi_sua_id,c.ngay_tao,COALESCE(c.ngay_sua,c.ngay_tao)
FROM cum_thiet_bi c JOIN devices d ON d.legacy_thiet_bi_id=c.thiet_bi_id;

UPDATE device_components SET parent_id=(SELECT p.id FROM cum_thiet_bi c
 JOIN device_components p ON p.legacy_component_id=c.cha_id WHERE c.id=device_components.legacy_component_id)
WHERE legacy_component_id IS NOT NULL;

INSERT OR IGNORE INTO component_repair_links(component_id,legacy_repair_id)
SELECT dc.id,p.id FROM phieu_sua_chua p JOIN device_components dc ON dc.legacy_component_id=p.cum_id WHERE p.cum_id IS NOT NULL;
INSERT OR IGNORE INTO component_material_links(component_id,legacy_repair_material_id,part_id)
SELECT dc.id,v.id,v.phu_tung_id FROM vat_tu_sua_chua v JOIN device_components dc ON dc.legacy_component_id=v.cum_id WHERE v.cum_id IS NOT NULL;
INSERT OR IGNORE INTO component_part_compatibility(component_id,part_id,recommended_quantity,is_primary,note,legacy_link_id)
SELECT dc.id,p.phu_tung_id,p.so_luong_khuyen_nghi,p.la_chinh,p.ghi_chu,p.id FROM phu_tung_thiet_bi p
 JOIN device_components dc ON dc.legacy_component_id=p.cum_id WHERE p.cum_id IS NOT NULL;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('component_tree.view','Xem cây cấu tạo','Xem cây canonical theo Device','component_tree'),
('component_tree.edit','Sửa cây cấu tạo','Tạo, sửa, di chuyển, thay thế node có version','component_tree'),
('component_tree.link_operation','Liên kết nghiệp vụ cấu tạo','Liên kết sửa chữa và vật tư vào component','component_tree');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='admin' AND q.hang_muc='component_tree';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma IN ('cd_cty','px') AND q.hang_muc='component_tree';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='xem' AND q.ma='component_tree.view';
