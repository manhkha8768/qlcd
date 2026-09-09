-- Biên bản giám định kỹ thuật và bàn giao thiết bị vào sửa chữa.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS repair_minutes(
 id TEXT PRIMARY KEY,minute_code TEXT NOT NULL UNIQUE,device_id INTEGER NOT NULL REFERENCES thiet_bi(id),unit_id INTEGER NOT NULL REFERENCES phan_xuong(id),repair_unit_id INTEGER NOT NULL REFERENCES phan_xuong(id),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SUBMITTED','RETURNED','APPROVED','REJECTED','CANCELLED')),version INTEGER NOT NULL DEFAULT 1,
 minute_date TEXT NOT NULL,start_time TEXT,end_time TEXT,location TEXT,handover_basis TEXT,decision_no TEXT,decision_date TEXT,handover_unit TEXT,receiving_unit TEXT,agreements TEXT,note TEXT,
 company_member_mode TEXT NOT NULL DEFAULT 'DEFAULT' CHECK(company_member_mode IN('DEFAULT','CUSTOM')),
 device_snapshot_json TEXT,unit_members_snapshot_json TEXT,company_members_snapshot_json TEXT,
 created_by INTEGER NOT NULL REFERENCES nguoi_dung(id),submitted_by INTEGER REFERENCES nguoi_dung(id),approved_by INTEGER REFERENCES nguoi_dung(id),updated_by INTEGER REFERENCES nguoi_dung(id),
 created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),submitted_at TEXT,approved_at TEXT,cancelled_at TEXT,last_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_repair_minutes_scope ON repair_minutes(unit_id,status,updated_at);
CREATE TABLE IF NOT EXISTS repair_minute_lines(
 id TEXT PRIMARY KEY,minute_id TEXT NOT NULL REFERENCES repair_minutes(id) ON DELETE CASCADE,line_no INTEGER NOT NULL,material_id INTEGER REFERENCES materials(id),material_code_snapshot TEXT,item_name TEXT NOT NULL,uom TEXT NOT NULL,quantity REAL NOT NULL CHECK(quantity>0),technical_condition TEXT,
 replace_quantity REAL NOT NULL DEFAULT 0 CHECK(replace_quantity>=0),repair_quantity REAL NOT NULL DEFAULT 0 CHECK(repair_quantity>=0),reuse_quantity REAL NOT NULL DEFAULT 0 CHECK(reuse_quantity>=0),note TEXT,
 CHECK(replace_quantity+repair_quantity+reuse_quantity<=quantity),UNIQUE(minute_id,line_no)
);
CREATE TABLE IF NOT EXISTS repair_minute_company_members(id TEXT PRIMARY KEY,minute_id TEXT NOT NULL REFERENCES repair_minutes(id) ON DELETE CASCADE,sort_order INTEGER NOT NULL,full_name TEXT NOT NULL,title TEXT,department TEXT,source_type TEXT NOT NULL DEFAULT 'CUSTOM' CHECK(source_type IN('DEFAULT','DIRECTORY','CUSTOM')));
CREATE TABLE IF NOT EXISTS repair_minute_events(id TEXT PRIMARY KEY,minute_id TEXT NOT NULL REFERENCES repair_minutes(id),event_type TEXT NOT NULL,from_status TEXT,to_status TEXT,minute_version INTEGER NOT NULL,actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),reason TEXT,payload_json TEXT,event_time TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS repair_minute_company_defaults(id INTEGER PRIMARY KEY AUTOINCREMENT,department TEXT NOT NULL,full_name TEXT NOT NULL,title TEXT,sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),updated_by INTEGER REFERENCES nguoi_dung(id),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('repair_minutes.create','Lập biên bản sửa chữa','Tạo và cập nhật biên bản bước 1','repair_minutes'),('repair_minutes.view','Xem biên bản sửa chữa','Xem biên bản trong phạm vi','repair_minutes'),('repair_minutes.update','Sửa biên bản sửa chữa','Sửa bản nháp hoặc hồ sơ bị trả lại','repair_minutes'),('repair_minutes.submit','Gửi duyệt biên bản','Gửi biên bản bước 1','repair_minutes'),('repair_minutes.approve','Duyệt biên bản','Duyệt biên bản thuộc đơn vị quản lý','repair_minutes'),('repair_minutes.return','Chuyển lại biên bản','Yêu cầu bổ sung biên bản','repair_minutes'),('repair_minutes.reject','Từ chối biên bản','Từ chối biên bản','repair_minutes'),('repair_minutes.export','Xuất biên bản','Xuất Word hoặc PDF','repair_minutes'),('repair_minutes.cancel','Hủy biên bản','Hủy biên bản chưa hoàn tất','repair_minutes');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='admin' AND q.hang_muc='repair_minutes';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='px' AND q.ma IN('repair_minutes.create','repair_minutes.view','repair_minutes.update','repair_minutes.submit','repair_minutes.export','repair_minutes.cancel');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='cd_cty' AND q.ma IN('repair_minutes.view','repair_minutes.approve','repair_minutes.return','repair_minutes.reject','repair_minutes.export');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id) SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q WHERE v.ma='xem' AND q.ma='repair_minutes.view';
INSERT OR IGNORE INTO function_visibility(role_code,screen_code,enabled) VALUES('admin','repair-minutes',1),('cd_cty','repair-minutes',1),('px','repair-minutes',1),('xem','repair-minutes',1);
