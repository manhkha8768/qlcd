-- TASK 7: canonical versioned technical profile on Device ID.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS technical_attribute_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom_id INTEGER NOT NULL REFERENCES nhom_thiet_bi(id),
    model_id INTEGER REFERENCES model_thiet_bi(id),
    ma_thuoc_tinh TEXT NOT NULL,
    ten TEXT NOT NULL,
    kieu_du_lieu TEXT NOT NULL DEFAULT 'TEXT'
        CHECK (kieu_du_lieu IN ('TEXT','NUMBER','BOOLEAN','DATE','ENUM')),
    don_vi TEXT,
    options_json TEXT,
    min_value REAL,
    max_value REAL,
    pattern TEXT,
    bat_buoc INTEGER NOT NULL DEFAULT 0 CHECK (bat_buoc IN (0,1)),
    thu_tu INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    legacy_definition_id INTEGER UNIQUE REFERENCES dinh_nghia_thong_so(id),
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_sua_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_technical_definition_scope
    ON technical_attribute_definitions(nhom_id,COALESCE(model_id,0),ma_thuoc_tinh);

CREATE TABLE IF NOT EXISTS technical_profile_state (
    device_id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    completeness_percent REAL NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES nguoi_dung(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS technical_attribute_values (
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    definition_id INTEGER NOT NULL REFERENCES technical_attribute_definitions(id),
    value_text TEXT,
    value_number REAL,
    value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0,1)),
    value_date TEXT,
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    legacy_value_id INTEGER UNIQUE REFERENCES gia_tri_thong_so(id),
    updated_by INTEGER REFERENCES nguoi_dung(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY(device_id,definition_id)
);

CREATE TABLE IF NOT EXISTS technical_profile_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    profile_version INTEGER NOT NULL,
    changes_json TEXT NOT NULL,
    changed_by INTEGER REFERENCES nguoi_dung(id),
    changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(device_id,profile_version)
);
CREATE TRIGGER IF NOT EXISTS trg_technical_history_no_update
BEFORE UPDATE ON technical_profile_history BEGIN SELECT RAISE(ABORT,'Technical profile history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_history_no_delete
BEFORE DELETE ON technical_profile_history BEGIN SELECT RAISE(ABORT,'Technical profile history is immutable'); END;

INSERT OR IGNORE INTO technical_attribute_definitions
(nhom_id,ma_thuoc_tinh,ten,kieu_du_lieu,don_vi,options_json,bat_buoc,thu_tu,legacy_definition_id)
SELECT nhom_id,ma_thong_so,ten,
 CASE kieu_du_lieu WHEN 'so' THEN 'NUMBER' WHEN 'logic' THEN 'BOOLEAN' WHEN 'ngay' THEN 'DATE'
  WHEN 'chon' THEN 'ENUM' ELSE 'TEXT' END,
 don_vi,gia_tri_chon,bat_buoc,thu_tu,id FROM dinh_nghia_thong_so WHERE hoat_dong=1;

INSERT OR IGNORE INTO technical_profile_state(device_id)
SELECT id FROM devices WHERE hoat_dong=1;

INSERT OR IGNORE INTO technical_attribute_values
(device_id,definition_id,value_text,value_number,value_boolean,value_date,note,legacy_value_id,updated_by,updated_at)
SELECT dv.id,td.id,
 CASE WHEN td.kieu_du_lieu IN ('TEXT','ENUM') THEN gv.gia_tri_chu END,
 CASE WHEN td.kieu_du_lieu='NUMBER' THEN gv.gia_tri_so END,
 CASE WHEN td.kieu_du_lieu='BOOLEAN' THEN gv.gia_tri_logic END,
 CASE WHEN td.kieu_du_lieu='DATE' THEN gv.gia_tri_chu END,
 gv.ghi_chu,gv.id,COALESCE(gv.nguoi_sua_id,gv.nguoi_tao_id),COALESCE(gv.ngay_sua,gv.ngay_tao)
FROM gia_tri_thong_so gv
JOIN devices dv ON dv.legacy_thiet_bi_id=gv.thiet_bi_id
JOIN technical_attribute_definitions td ON td.legacy_definition_id=gv.dinh_nghia_id;

UPDATE technical_profile_state SET completeness_percent=COALESCE((
 SELECT ROUND(100.0*SUM(CASE WHEN v.definition_id IS NOT NULL THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1)
 FROM technical_attribute_definitions d LEFT JOIN technical_attribute_values v
  ON v.definition_id=d.id AND v.device_id=technical_profile_state.device_id
 JOIN devices x ON x.id=technical_profile_state.device_id
 WHERE d.hoat_dong=1 AND d.nhom_id=x.nhom_id AND (d.model_id IS NULL OR d.model_id=x.model_id)
),0);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('technical_profile.view','Xem hồ sơ kỹ thuật','Xem profile canonical theo Device','technical_profile'),
('technical_profile.edit','Sửa hồ sơ kỹ thuật','Cập nhật thuộc tính có validation/version','technical_profile'),
('technical_profile.define','Quản lý định nghĩa kỹ thuật','Tạo/sửa định nghĩa thuộc tính','technical_profile');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='admin' AND q.hang_muc='technical_profile';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma IN ('cd_cty','px') AND q.ma IN ('technical_profile.view','technical_profile.edit');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='xem' AND q.ma='technical_profile.view';
