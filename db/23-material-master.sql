-- TASK 10: canonical Material Master, UOM and reviewed duplicate workflow.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS uoms(code TEXT PRIMARY KEY,name TEXT NOT NULL,dimension TEXT NOT NULL DEFAULT 'COUNT',decimal_places INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
INSERT OR IGNORE INTO uoms VALUES('EA','Cái','COUNT',0,1),('SET','Bộ','COUNT',0,1),('KG','Kilôgam','MASS',3,1),('M','Mét','LENGTH',3,1),('L','Lít','VOLUME',3,1),('OTHER','Khác','OTHER',3,1);
CREATE TABLE IF NOT EXISTS uom_aliases(alias TEXT PRIMARY KEY,uom_code TEXT NOT NULL REFERENCES uoms(code));
INSERT OR IGNORE INTO uom_aliases VALUES('cái','EA'),('cai','EA'),('chiếc','EA'),('chiec','EA'),('bộ','SET'),('bo','SET'),('kg','KG'),('kilogram','KG'),('m','M'),('mét','M'),('met','M'),('l','L'),('lít','L'),('lit','L');
CREATE TABLE IF NOT EXISTS materials(
 id INTEGER PRIMARY KEY AUTOINCREMENT,material_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,normalized_name TEXT NOT NULL,
 category TEXT,specification TEXT,part_number TEXT,manufacturer TEXT,barcode TEXT,base_uom_code TEXT NOT NULL REFERENCES uoms(code),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','ARCHIVED')),version INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER REFERENCES nguoi_dung(id),updated_by INTEGER REFERENCES nguoi_dung(id),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS idx_material_name ON materials(normalized_name);
CREATE TABLE IF NOT EXISTS material_source_mappings(
 id INTEGER PRIMARY KEY AUTOINCREMENT,source_type TEXT NOT NULL CHECK(source_type IN('PART','WAREHOUSE','NCVT_LINE')),source_id TEXT NOT NULL,
 material_id INTEGER REFERENCES materials(id) ON DELETE RESTRICT,source_code TEXT,source_name TEXT,source_uom TEXT,source_snapshot_json TEXT,
 mapping_status TEXT NOT NULL DEFAULT 'MAPPED' CHECK(mapping_status IN('MAPPED','REVIEW','UNMAPPED')),confidence REAL,reviewed_by INTEGER REFERENCES nguoi_dung(id),reviewed_at TEXT,UNIQUE(source_type,source_id));
CREATE INDEX IF NOT EXISTS idx_material_mapping ON material_source_mappings(material_id,source_type);
CREATE TABLE IF NOT EXISTS material_duplicate_candidates(
 id INTEGER PRIMARY KEY AUTOINCREMENT,material_a_id INTEGER NOT NULL REFERENCES materials(id),material_b_id INTEGER NOT NULL REFERENCES materials(id),
 reason TEXT NOT NULL,score REAL NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','CONFIRMED_SAME','KEEP_SEPARATE')),
 canonical_material_id INTEGER REFERENCES materials(id),review_note TEXT,reviewed_by INTEGER REFERENCES nguoi_dung(id),reviewed_at TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(material_a_id,material_b_id),CHECK(material_a_id<material_b_id));
CREATE TRIGGER IF NOT EXISTS trg_material_mapping_no_delete BEFORE DELETE ON material_source_mappings BEGIN SELECT RAISE(ABORT,'Material source mapping cannot be deleted'); END;

INSERT OR IGNORE INTO materials(material_code,name,normalized_name,category,specification,part_number,manufacturer,barcode,base_uom_code,created_by,created_at)
SELECT 'PART-'||id||'-'||ma_phu_tung,ten,lower(trim(ten)),nhom,quy_cach,part_number,hang_sx,ma_vach,COALESCE((SELECT uom_code FROM uom_aliases WHERE alias=lower(trim(COALESCE(dvt,'')))),'OTHER'),nguoi_tao_id,ngay_tao FROM phu_tung;
INSERT OR IGNORE INTO material_source_mappings(source_type,source_id,material_id,source_code,source_name,source_uom,source_snapshot_json,confidence)
SELECT 'PART',CAST(p.id AS TEXT),m.id,p.ma_phu_tung,p.ten,p.dvt,json_object('part_number',p.part_number,'specification',p.quy_cach),1 FROM phu_tung p JOIN materials m ON m.material_code='PART-'||p.id||'-'||p.ma_phu_tung;

INSERT OR IGNORE INTO materials(material_code,name,normalized_name,specification,base_uom_code,created_at)
SELECT 'WH-'||id||'-'||ma,ten,lower(trim(ten)),chi_tieu,COALESCE((SELECT uom_code FROM uom_aliases WHERE alias=lower(trim(dvt))),'OTHER'),ngay_tao FROM kho_vat_tu;
INSERT OR IGNORE INTO material_source_mappings(source_type,source_id,material_id,source_code,source_name,source_uom,source_snapshot_json,confidence)
SELECT 'WAREHOUSE',CAST(k.id AS TEXT),m.id,k.ma,k.ten,k.dvt,json_object('specification',k.chi_tieu),1 FROM kho_vat_tu k JOIN materials m ON m.material_code='WH-'||k.id||'-'||k.ma;

INSERT OR IGNORE INTO materials(material_code,name,normalized_name,specification,base_uom_code)
SELECT 'NCVT-'||MIN(id),ten_vat_tu,lower(trim(ten_vat_tu)),quy_cach,COALESCE((SELECT uom_code FROM uom_aliases WHERE alias=lower(trim(dvt))),'OTHER') FROM ncvt_chi_tiet
GROUP BY COALESCE(ma_vat_tu,''),lower(trim(ten_vat_tu)),COALESCE(lower(trim(quy_cach)),''),lower(trim(dvt));
INSERT OR IGNORE INTO material_source_mappings(source_type,source_id,material_id,source_code,source_name,source_uom,source_snapshot_json,confidence)
SELECT 'NCVT_LINE',CAST(n.id AS TEXT),m.id,n.ma_vat_tu,n.ten_vat_tu,n.dvt,json_object('specification',n.quy_cach,'period_id',n.ky_id),1 FROM ncvt_chi_tiet n JOIN materials m ON m.material_code='NCVT-'||(SELECT MIN(x.id) FROM ncvt_chi_tiet x WHERE COALESCE(x.ma_vat_tu,'')=COALESCE(n.ma_vat_tu,'') AND lower(trim(x.ten_vat_tu))=lower(trim(n.ten_vat_tu)) AND COALESCE(lower(trim(x.quy_cach)),'')=COALESCE(lower(trim(n.quy_cach)),'') AND lower(trim(x.dvt))=lower(trim(n.dvt)));

INSERT OR IGNORE INTO material_duplicate_candidates(material_a_id,material_b_id,reason,score)
SELECT a.id,b.id,CASE WHEN EXISTS(SELECT 1 FROM material_source_mappings x JOIN material_source_mappings y ON lower(trim(x.source_code))=lower(trim(y.source_code)) WHERE x.material_id=a.id AND y.material_id=b.id AND COALESCE(x.source_code,'')<>'') THEN 'SAME_SOURCE_CODE' ELSE 'SAME_NORMALIZED_NAME' END,
 CASE WHEN a.base_uom_code=b.base_uom_code THEN 0.95 ELSE 0.75 END FROM materials a JOIN materials b ON a.id<b.id AND a.normalized_name=b.normalized_name;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('material.view','Xem Material Master','Xem vật tư canonical và mappings','material'),('material.edit','Sửa Material Master','Tạo/sửa vật tư có version','material'),('material.review_duplicate','Review vật tư nghi trùng','Xác nhận cùng/khác sau review','material');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='admin' AND q.hang_muc='material';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='cd_cty' AND q.hang_muc='material';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma IN('px','xem') AND q.ma='material.view';
