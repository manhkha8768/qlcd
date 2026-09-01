-- TASK 9: canonical document metadata, immutable versions and entity links.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    document_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    current_version_number INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    legacy_source TEXT,
    legacy_id TEXT,
    created_by INTEGER REFERENCES nguoi_dung(id),
    archived_by INTEGER REFERENCES nguoi_dung(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    archived_at TEXT,
    UNIQUE(legacy_source,legacy_id)
);

CREATE TABLE IF NOT EXISTS document_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    original_filename TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'LOCAL'
        CHECK (storage_provider IN ('LOCAL','LOCAL_LEGACY','EXTERNAL')),
    object_key TEXT NOT NULL,
    sha256 TEXT,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    change_note TEXT,
    uploaded_by INTEGER REFERENCES nguoi_dung(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(document_id,version_number),
    CHECK (sha256 IS NULL OR length(sha256)=64)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id,version_number DESC);

CREATE TABLE IF NOT EXISTS entity_document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    entity_type TEXT NOT NULL CHECK (entity_type IN
        ('DEVICE','COMPONENT','ASSET','ASSET_TRANSACTION','LEGACY_TRANSACTION','REPAIR','INSPECTION')),
    entity_id TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT 'ATTACHMENT',
    don_vi_id INTEGER REFERENCES phan_xuong(id),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    linked_by INTEGER REFERENCES nguoi_dung(id),
    linked_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(document_id,entity_type,entity_id,relationship)
);
CREATE INDEX IF NOT EXISTS idx_entity_document_lookup ON entity_document_links(entity_type,entity_id,active);

CREATE TABLE IF NOT EXISTS document_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_id TEXT REFERENCES document_versions(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('UPLOAD','NEW_VERSION','DOWNLOAD','ARCHIVE','LINK')),
    actor_id INTEGER REFERENCES nguoi_dung(id),
    ip_address TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_document_access_doc ON document_access_log(document_id,id);
CREATE TRIGGER IF NOT EXISTS trg_document_versions_no_update
BEFORE UPDATE ON document_versions BEGIN SELECT RAISE(ABORT,'Document version is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_document_versions_no_delete
BEFORE DELETE ON document_versions BEGIN SELECT RAISE(ABORT,'Document version is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_document_access_no_update
BEFORE UPDATE ON document_access_log BEGIN SELECT RAISE(ABORT,'Document access log is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_document_access_no_delete
BEFORE DELETE ON document_access_log BEGIN SELECT RAISE(ABORT,'Document access log is immutable'); END;

-- Backfill technical documents; physical files remain untouched.
INSERT OR IGNORE INTO documents(id,document_code,title,category,current_version_number,description,legacy_source,legacy_id,created_by,created_at)
SELECT 'legacy-tech-'||id,'TLKT-'||id,ten_tai_lieu,upper(loai_tai_lieu),1,ghi_chu,'tai_lieu_ky_thuat',CAST(id AS TEXT),nguoi_tai_id,ngay_tai
FROM tai_lieu_ky_thuat WHERE duong_dan IS NOT NULL;
INSERT OR IGNORE INTO document_versions(id,document_id,version_number,original_filename,storage_provider,object_key,mime_type,size_bytes,uploaded_by,uploaded_at)
SELECT 'legacy-tech-v-'||id,'legacy-tech-'||id,1,COALESCE(ten_file,ten_tai_lieu),'LOCAL_LEGACY','ky-thuat/'||duong_dan,loai_file,COALESCE(kich_thuoc,0),nguoi_tai_id,ngay_tai
FROM tai_lieu_ky_thuat WHERE duong_dan IS NOT NULL;
INSERT OR IGNORE INTO entity_document_links(document_id,entity_type,entity_id,don_vi_id)
SELECT 'legacy-tech-'||t.id,'DEVICE',CAST(d.id AS TEXT),d.don_vi_id FROM tai_lieu_ky_thuat t JOIN devices d ON d.legacy_thiet_bi_id=t.thiet_bi_id WHERE t.duong_dan IS NOT NULL AND t.thiet_bi_id IS NOT NULL;
INSERT OR IGNORE INTO entity_document_links(document_id,entity_type,entity_id,don_vi_id)
SELECT 'legacy-tech-'||t.id,'COMPONENT',CAST(c.id AS TEXT),d.don_vi_id FROM tai_lieu_ky_thuat t JOIN device_components c ON c.legacy_component_id=t.cum_id JOIN devices d ON d.id=c.device_id WHERE t.duong_dan IS NOT NULL AND t.cum_id IS NOT NULL;

INSERT OR IGNORE INTO documents(id,document_code,title,category,current_version_number,description,legacy_source,legacy_id,created_by,created_at)
SELECT 'legacy-transfer-'||id,'ATD-'||id,ten_file,upper(loai_chung_tu),1,ghi_chu,'asset_transfer_documents',id,nguoi_tai_id,ngay_tai FROM asset_transfer_documents;
INSERT OR IGNORE INTO document_versions(id,document_id,version_number,original_filename,storage_provider,object_key,mime_type,size_bytes,uploaded_by,uploaded_at)
SELECT 'legacy-transfer-v-'||id,'legacy-transfer-'||id,1,ten_file,'LOCAL_LEGACY',duong_dan,mime_type,kich_thuoc,nguoi_tai_id,ngay_tai FROM asset_transfer_documents;
INSERT OR IGNORE INTO entity_document_links(document_id,entity_type,entity_id)
SELECT 'legacy-transfer-'||id,'ASSET_TRANSACTION',transaction_id FROM asset_transfer_documents;

INSERT OR IGNORE INTO documents(id,document_code,title,category,current_version_number,description,legacy_source,legacy_id,created_by,created_at)
SELECT 'legacy-gd-'||id,'GD-'||id,ten_file,upper(loai_ho_so),1,ghi_chu,'tai_lieu_giao_dich',id,nguoi_tai_id,ngay_tai FROM tai_lieu_giao_dich;
INSERT OR IGNORE INTO document_versions(id,document_id,version_number,original_filename,storage_provider,object_key,mime_type,size_bytes,uploaded_by,uploaded_at)
SELECT 'legacy-gd-v-'||id,'legacy-gd-'||id,1,ten_file,'LOCAL_LEGACY','ho-so/'||duong_dan,loai_file,COALESCE(kich_thuoc,0),nguoi_tai_id,ngay_tai FROM tai_lieu_giao_dich;
INSERT OR IGNORE INTO entity_document_links(document_id,entity_type,entity_id)
SELECT 'legacy-gd-'||id,'LEGACY_TRANSACTION',giao_dich_id FROM tai_lieu_giao_dich;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('document.view','Xem tài liệu','Xem metadata và entity links','document'),
('document.download','Tải tài liệu','Tải version sau kiểm tra ACL','document'),
('document.upload','Tải tài liệu lên','Tạo document canonical và version đầu','document'),
('document.version','Tạo phiên bản tài liệu','Thêm version bất biến','document'),
('document.archive','Lưu trữ tài liệu','Soft archive document','document');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='admin' AND q.hang_muc='document';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma IN ('cd_cty','px') AND q.hang_muc='document';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q WHERE vai_tro.ma='xem' AND q.ma IN ('document.view','document.download');
