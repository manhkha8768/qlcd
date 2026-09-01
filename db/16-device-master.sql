-- TASK 3: canonical technical Device Master and explicit asset/device boundary.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_thiet_bi TEXT NOT NULL UNIQUE,
    ten TEXT NOT NULL,
    nhom_id INTEGER NOT NULL REFERENCES nhom_thiet_bi(id),
    model_id INTEGER REFERENCES model_thiet_bi(id),
    so_seri TEXT,
    nam_san_xuat INTEGER CHECK (nam_san_xuat IS NULL OR nam_san_xuat BETWEEN 1900 AND 2200),
    nuoc_san_xuat TEXT,
    don_vi_id INTEGER NOT NULL REFERENCES phan_xuong(id),
    vi_tri_id INTEGER REFERENCES vi_tri(id),
    trang_thai TEXT NOT NULL DEFAULT 'hoat_dong'
        CHECK (trang_thai IN ('hoat_dong','du_phong','dang_sua','dang_dieu_chuyen','cho_thanh_ly','da_thanh_ly')),
    tinh_trang_ky_thuat TEXT NOT NULL DEFAULT 'tot'
        CHECK (tinh_trang_ky_thuat IN ('tot','trung_binh','kem','hong')),
    gio_chay_luy_ke REAL NOT NULL DEFAULT 0 CHECK (gio_chay_luy_ke >= 0),
    ghi_chu TEXT,
    legacy_thiet_bi_id INTEGER UNIQUE REFERENCES thiet_bi(id),
    version INTEGER NOT NULL DEFAULT 1,
    hoat_dong INTEGER NOT NULL DEFAULT 1 CHECK (hoat_dong IN (0,1)),
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_sua_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ngay_sua TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_devices_donvi ON devices(don_vi_id, hoat_dong);
CREATE INDEX IF NOT EXISTS idx_devices_nhom ON devices(nhom_id, trang_thai);
CREATE INDEX IF NOT EXISTS idx_devices_model ON devices(model_id);
CREATE INDEX IF NOT EXISTS idx_devices_legacy ON devices(legacy_thiet_bi_id);

CREATE TABLE IF NOT EXISTS device_legacy_map (
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    legacy_table TEXT NOT NULL,
    legacy_id INTEGER NOT NULL,
    ngay_map TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (legacy_table, legacy_id),
    UNIQUE (device_id, legacy_table)
);

CREATE TABLE IF NOT EXISTS asset_device_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    loai_quan_he TEXT NOT NULL DEFAULT 'gan_voi'
        CHECK (loai_quan_he IN ('gan_voi','bo_phan','thay_the','tham_chieu')),
    la_lien_ket_chinh INTEGER NOT NULL DEFAULT 0 CHECK (la_lien_ket_chinh IN (0,1)),
    tu_ngay TEXT NOT NULL DEFAULT (date('now','localtime')),
    den_ngay TEXT,
    ghi_chu TEXT,
    nguoi_tao_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (den_ngay IS NULL OR den_ngay >= tu_ngay),
    UNIQUE (asset_id, device_id, tu_ngay)
);

CREATE INDEX IF NOT EXISTS idx_asset_device_asset ON asset_device_links(asset_id, den_ngay);
CREATE INDEX IF NOT EXISTS idx_asset_device_device ON asset_device_links(device_id, den_ngay);
CREATE UNIQUE INDEX IF NOT EXISTS ux_device_primary_active
    ON asset_device_links(device_id) WHERE la_lien_ket_chinh=1 AND den_ngay IS NULL;

INSERT OR IGNORE INTO devices (
    ma_thiet_bi,ten,nhom_id,model_id,so_seri,nam_san_xuat,nuoc_san_xuat,
    don_vi_id,vi_tri_id,trang_thai,tinh_trang_ky_thuat,gio_chay_luy_ke,
    ghi_chu,legacy_thiet_bi_id,hoat_dong
)
SELECT ma_tb,ten,nhom_id,model_id,so_seri,nam_sx,nuoc_sx,phan_xuong_id,vi_tri_id,
       trang_thai,COALESCE(tinh_trang_kt,'tot'),COALESCE(gio_chay_luy_ke,0),
       ghi_chu,id,CASE WHEN trang_thai='da_thanh_ly' THEN 0 ELSE 1 END
FROM thiet_bi WHERE phan_xuong_id IS NOT NULL;

INSERT OR IGNORE INTO device_legacy_map(device_id,legacy_table,legacy_id)
SELECT id,'thiet_bi',legacy_thiet_bi_id FROM devices WHERE legacy_thiet_bi_id IS NOT NULL;

INSERT OR IGNORE INTO asset_device_links(asset_id,device_id,loai_quan_he,la_lien_ket_chinh,tu_ngay)
SELECT a.id,d.id,'gan_voi',1,COALESCE(a.ngay_dua_vao_su_dung,date('now','localtime'))
FROM devices d JOIN assets a ON a.legacy_thiet_bi_id=d.legacy_thiet_bi_id;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('device.view','Xem thiết bị','Xem Device Master và liên kết tài sản','device'),
('device.create','Thêm thiết bị','Tạo hồ sơ kỹ thuật thiết bị','device'),
('device.edit','Sửa thiết bị','Sửa Device Master','device'),
('device.archive','Ngừng thiết bị','Ngừng hồ sơ kỹ thuật thiết bị','device'),
('device.link_asset','Liên kết tài sản','Quản lý liên kết device với asset','device');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='admin' AND q.hang_muc='device';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma IN ('cd_cty','px') AND q.ma IN ('device.view','device.create','device.edit','device.link_asset');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='device.view';
