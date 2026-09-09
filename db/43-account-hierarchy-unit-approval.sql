-- Phân cấp tài khoản, phạm vi quản lý/chỉ xem và quyền duyệt theo đơn vị.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_levels (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, rank INTEGER NOT NULL UNIQUE,
  description TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
INSERT OR IGNORE INTO account_levels(code,name,rank,description) VALUES
('SYSTEM_ADMIN','Quản trị hệ thống',10,'Quản trị và phân quyền toàn hệ thống'),
('COMPANY_DEPARTMENT','Phòng/Ban Công ty',20,'Quản lý nghiệp vụ cấp Công ty'),
('MULTI_UNIT_MANAGER','Cán bộ quản lý nhiều phân xưởng',30,'Quản lý các đơn vị được giao'),
('UNIT_ACCOUNT','Tài khoản Phân xưởng',40,'Thao tác trong phân xưởng'),
('VIEW_ONLY','Tài khoản chỉ xem',50,'Chỉ đọc trong phạm vi được giao');

CREATE TABLE IF NOT EXISTS user_account_level (
  user_id INTEGER PRIMARY KEY REFERENCES nguoi_dung(id) ON DELETE CASCADE,
  level_code TEXT NOT NULL REFERENCES account_levels(code),
  allow_self_approval INTEGER NOT NULL DEFAULT 0 CHECK(allow_self_approval IN(0,1)),
  updated_by INTEGER REFERENCES nguoi_dung(id), updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_unit_access (
  user_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES phan_xuong(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL CHECK(access_type IN('MANAGE','VIEW')),
  valid_from TEXT, valid_to TEXT, assigned_by INTEGER REFERENCES nguoi_dung(id),
  created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
  PRIMARY KEY(user_id,unit_id), CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from)
);
CREATE INDEX IF NOT EXISTS idx_user_unit_access_lookup ON user_unit_access(user_id,access_type,unit_id);

INSERT OR IGNORE INTO user_account_level(user_id,level_code)
SELECT id,CASE vai_tro WHEN 'admin' THEN 'SYSTEM_ADMIN' WHEN 'cd_cty' THEN 'COMPANY_DEPARTMENT'
 WHEN 'px' THEN 'UNIT_ACCOUNT' ELSE 'VIEW_ONLY' END FROM nguoi_dung;
INSERT OR IGNORE INTO user_unit_access(user_id,unit_id,access_type)
SELECT id,phan_xuong_id,CASE WHEN vai_tro='px' THEN 'MANAGE' ELSE 'VIEW' END
FROM nguoi_dung WHERE phan_xuong_id IS NOT NULL;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('thietbi.duyet','Duyệt thiết bị','Duyệt thiết bị của đơn vị thuộc phạm vi quản lý','phe_duyet'),
('thietbi.tu_choi','Chuyển lại thiết bị','Chuyển lại thiết bị của đơn vị thuộc phạm vi quản lý','phe_duyet'),
('vattu.duyet','Duyệt vật tư','Duyệt vật tư của đơn vị thuộc phạm vi quản lý','phe_duyet'),
('vattu.tu_choi','Từ chối vật tư','Từ chối vật tư của đơn vị thuộc phạm vi quản lý','phe_duyet'),
('import.duyet','Duyệt lô nhập','Duyệt lô nhập của đơn vị thuộc phạm vi quản lý','phe_duyet'),
('approval.self','Tự duyệt dữ liệu','Cho phép duyệt dữ liệu do chính mình tạo','phe_duyet'),
('scope.company','Xem toàn Công ty','Cho phép xem dữ liệu toàn Công ty','quantri');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma IN('thietbi.duyet','thietbi.tu_choi','vattu.duyet','vattu.tu_choi','import.duyet','approval.self','scope.company');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='cd_cty' AND q.ma IN('thietbi.duyet','thietbi.tu_choi','vattu.duyet','vattu.tu_choi','import.duyet');
