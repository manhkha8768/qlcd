# KẾ HOẠCH TRIỂN KHAI QLCD — PHIÊN BẢN V17 → V23

**Ngày lập kế hoạch:** 28/08/2026  
**Phiên bản hiện tại:** v16 (447 test xanh)  
**Mục tiêu:** Nâng cấp QLCD thành **Hệ thống Quản lý Cơ điện – Vận tải toàn Công ty**

---

## PHẦN 1: HIỆN TRẠNG (GIAI ĐOẠN A)

### ✅ Đã hoàn thành
- Đăng nhập, phân quyền theo 4 vai trò (admin, cd_cty, px, xem)
- Import Excel TSCĐ/CCDC thông minh (tự dò tiêu đề, đoán cột, đoán nhóm)
- Giao dịch (Tăng/Giảm/Điều chuyển) với khóa ghi nguyên tử
- Hồ sơ kỹ thuật (cây cụm chi tiết, thông số, sự cố)
- NCVT Quý (Import, cấp phát, không âm, không cấp vượt)
- Bảo mật (phiên, chặn dò mật khẩu, HTTPS, dải mạng)
- **447 test, 0 trượt**

### ⏳ Chưa làm (theo thứ tự ưu tiên)

| Hạng mục | Lý do | Phụ thuộc |
|---|---|---|
| **Quản trị hệ thống** | UI/Menu rối rạc | Không |
| **Phân quyền động** | 4 vai trò cứng, cần chi tiết hóa theo chức năng | Quản trị |
| **File mẫu** | Admin sinh biểu mẫu từ mẫu | Quản trị |
| **Sinh hồ sơ** | Chọn thiết bị + điền form + sinh DOCX/XLSX | File mẫu |
| **Kiểm kê** | Mới, snapshot dữ liệu | Không |
| **Đối chiếu** | Phụ thuộc Kiểm kê | Kiểm kê |
| **Kho vật tư** | Nhập/xuất/tồn/điều chuyển | Không |
| **NCVT ↔ Kho** | Liên kết cấp phát | Kho vật tư |
| **Dashboard** | KPI, thông báo, tối ưu | Kiểm kê, Kho, NCVT |
| **Báo cáo** | Excel/PDF, xuất hàng loạt | Dashboard |

---

## PHẦN 2: GIAI ĐOẠN B (v17) — QUẢN TRỊ HỆ THỐNG + PHÂN QUYỀN ĐỘNG

### 2.1 Hiện trạng menu quản trị

Hiện nay các chức năng quản trị nằm rải rác:
- Tài khoản, vai trò, phân quyền → trong dashboard hoặc route riêng lẻ
- Phân xưởng → import/export, không có UI chuyên biệt
- Danh mục hệ thống → nhân biên, đơn vị, nhóm thiết bị, model → route riêng
- Phiên đăng nhập, dải mạng, audit → Admin tìm khó
- Đổi mật khẩu, Đăng xuất → lộn xộn trên header

**Vấn đề:** Người dùng admin phải nhấp lại nhập lại nhiều lần, UI không thống nhất.

### 2.2 Thiết kế UI "Quản trị hệ thống" (module duy nhất)

Khi admin hoặc người quản trị vào, menu chính hiển thị:

```
┌─ TỔNG QUAN
├─ ĐƠN VỊ
├─ THIẾT BỊ
├─ GIAO DỊCH
├─ KIỂM KÊ – ĐỐI CHIẾU
├─ VẬT TƯ
├─ HỒ SƠ KỸ THUẬT
├─ BÁO CÁO
└─ QUẢN TRỊ HỆ THỐNG ← Khi click mở submenu
    ├─ Tài khoản
    ├─ Vai trò
    ├─ Phân quyền
    ├─ Đơn vị / Phân xưởng
    ├─ Phạm vi dữ liệu
    ├─ File mẫu
    ├─ Danh mục hệ thống
    ├─ Dải mạng
    ├─ Nhật ký hoạt động
    ├─ Phiên đăng nhập
    ├─ Sao lưu dữ liệu
    ├─ Cấu hình
    ├─ Đổi mật khẩu
    └─ Đăng xuất
```

**Không để** các mục này nằm rải rác ở header hay dashboard.

### 2.3 Phân quyền động

**Yêu cầu:** Thay vì 4 vai trò cứng, hỗ trợ:

#### a) Quyền theo chức năng

Mỗi chức năng chia thành các hành động rõ ràng:

```
thietbi.xem          (liệt kê, xem chi tiết)
thietbi.them         (thêm thiết bị mới)
thietbi.sua          (chỉnh sửa thông tin)

kiemke.xem           (xem danh sách kỳ, chi tiết)
kiemke.lap           (lập kỳ kiểm kê mới)
kiemke.duyet         (duyệt kỳ)
kiemke.xuat          (xuất biên bản)

giaodich.lap         (lập phiếu tăng/giảm/điều chuyển)
giaodich.duyet       (duyệt phiếu)
giaodich.huy         (hủy phiếu)

kho.xem              (xem tồn kho)
kho.nhap             (nhập kho)
kho.xuat             (xuất kho)
kho.dieu_chuyen      (điều chuyển kho)
kho.duyet            (duyệt giao dịch kho)

ncvt.xem
ncvt.lap
ncvt.duyet
ncvt.cap_phat

bieumau.xem
bieumau.tao
bieumau.sua
bieumau.xuat

baocao.xem
baocao.xuat_excel
baocao.xuat_pdf

quantri.taikhoan
quantri.vai_tro
quantri.phanquyen
quantri.donvi
quantri.filemau
quantri.nhatky
quantri.sao_luu
```

#### b) Quyền theo đơn vị

```
Một tài khoản có thể được giao:

PX Đào lò 1         ← chỉ thao tác dữ liệu PX này
PX Đào lò 14        ← chỉ thao tác dữ liệu PX này
PX Phục vụ 1        ← chỉ thao tác dữ liệu PX này

Hoặc:

Toàn công ty        ← xem được tất cả (admin, cd_cty)
```

#### c) Quyền theo phạm vi dữ liệu

```
Người A:
  PX ĐL1
    thietbi.xem        ✓
    thietbi.sua        ✓
    giaodich.lap       ✓
    giaodich.duyet     ✗
  
  PX ĐL14
    thietbi.xem        ✓
    thietbi.sua        ✗
    giaodich.lap       ✗

Người B:
  Toàn công ty
    baocao.xem         ✓
    baocao.xuat_excel  ✓
    (nhưng không sửa gì)
```

#### d) Quyền theo hành động chi tiết

Một số chức năng có thêm chi tiết:

```
Xem
Thêm
Sửa
Lập phiếu
Gửi duyệt
Duyệt
Từ chối
In
Xuất Excel
Xuất PDF
Tải file
Xóa (với điều kiện)
Quản lý biểu mẫu
```

### 2.4 Database thay đổi

Thêm 3 bảng mới:

```sql
-- B1. Mã quyền (danh mục)
CREATE TABLE ma_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,
    ten             TEXT NOT NULL,
    mo_ta           TEXT,
    hang_muc        TEXT,              -- 'thietbi', 'kiemke', 'kho', 'quantri', ...
    ngay_tao        TEXT
);

-- B2. Vai trò (không còn cố định, có thể tạo mới)
CREATE TABLE vai_tro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten             TEXT NOT NULL UNIQUE,
    mo_ta           TEXT,
    mac_dinh        INTEGER DEFAULT 0, -- vai trò tích hợp: admin, cd_cty, px, xem
    hoat_dong       INTEGER DEFAULT 1,
    ngay_tao        TEXT
);

-- B3. Gán quyền từng cái cho vai trò
CREATE TABLE vai_tro_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vai_tro_id      INTEGER NOT NULL REFERENCES vai_tro(id) ON DELETE CASCADE,
    ma_quyen        TEXT NOT NULL,
    donvi_id        INTEGER,            -- nếu NULL thì áp dụng cho toàn công ty
    UNIQUE(vai_tro_id, ma_quyen, donvi_id)
);

-- B4. Gán vai trò cho tài khoản (một tài khoản có thể có nhiều vai trò)
CREATE TABLE nguoi_dung_vai_tro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung_id   INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
    vai_tro_id      INTEGER NOT NULL REFERENCES vai_tro(id) ON DELETE CASCADE,
    UNIQUE(nguoi_dung_id, vai_tro_id)
);

-- B5. Lịch sử phân quyền (audit)
CREATE TABLE audit_quyen (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung_id   INTEGER REFERENCES nguoi_dung(id),
    hanh_dong       TEXT,              -- 'them_quyen', 'xoa_quyen', 'sua_vai_tro'
    chi_tiet_cu     TEXT,              -- JSON
    chi_tiet_moi    TEXT,              -- JSON
    dia_chi_ip      TEXT,
    ngay_gio        TEXT DEFAULT (datetime('now','localtime'))
);
```

**Migration mới:** `09-phan-quyen-dong.sql`

### 2.5 API mới (Quản trị hệ thống)

```
POST   /api/quantri/taikhoan              Thêm tài khoản
GET    /api/quantri/taikhoan              Liệt kê tài khoản
PUT    /api/quantri/taikhoan/:id          Sửa tài khoản
DELETE /api/quantri/taikhoan/:id          Khóa tài khoản
POST   /api/quantri/taikhoan/:id/reset    Reset mật khẩu tạm

POST   /api/quantri/vai-tro               Thêm vai trò
GET    /api/quantri/vai-tro               Liệt kê vai trò
PUT    /api/quantri/vai-tro/:id           Sửa vai trò
DELETE /api/quantri/vai-tro/:id           Xóa vai trò

GET    /api/quantri/ma-quyen              Liệt kê mã quyền có sẵn
POST   /api/quantri/vai-tro/:id/quyen     Gán quyền cho vai trò
DELETE /api/quantri/vai-tro/:id/quyen     Xóa quyền

GET    /api/quantri/donvi                 Liệt kê đơn vị
POST   /api/quantri/donvi                 Thêm đơn vị
PUT    /api/quantri/donvi/:id             Sửa đơn vị

GET    /api/quantri/phien-dang-nhap       Liệt kê phiên active
DELETE /api/quantri/phien-dang-nhap/:id   Cắt phiên

GET    /api/quantri/nhat-ky-hoat-dong     Xem nhật ký (audit)

POST   /api/quantri/sao-luu               Tạo bản sao lưu
GET    /api/quantri/sao-luu               Liệt kê bản sao lưu

GET    /api/quantri/trang-thai-he-thong   Hiển thị các bảng thống kê
```

### 2.6 UI mới

**File:** `public/admin/quan-tri-he-thong.html` (trang chính)

Submenu:
- `public/admin/quan-tri-taikhoan.html`
- `public/admin/quan-tri-vai-tro.html`
- `public/admin/quan-tri-phanquyen.html`
- `public/admin/quan-tri-donvi.html`
- `public/admin/quan-tri-phien.html`
- `public/admin/quan-tri-nhatky.html`
- `public/admin/quan-tri-saoluu.html`
- `public/admin/quan-tri-cauhinh.html`

### 2.7 Test mới

`test/test-phan-quyen-dong.js` (60+ test):
- Tạo vai trò custom
- Gán quyền theo chức năng
- Gán quyền theo đơn vị
- Kiểm tra người dùng không vượt quá quyền
- Phân quyền hoạt động khi có nhiều vai trò
- Audit quyền thay đổi
- Cắt phiên

### 2.8 Thay đổi middleware

**File:** `middleware/quyen.js`

Thay đổi:
- Hàm `kiemTraQuyen()` mới: kiểm tra mã quyền chi tiết
- Hàm `locPXTheoQuyen()` mới: lọc dữ liệu theo phạm vi đơn vị
- Tất cả route phải gọi middleware này trước khi truy cập database

### 2.9 Mục tiêu GIAI ĐOẠN B

- ✅ Menu quản trị thống nhất
- ✅ Phân quyền động theo chức năng + đơn vị + phạm vi
- ✅ Admin có UI checkbox để gán quyền (không cần sửa database)
- ✅ Audit tất cả thay đổi quyền
- ✅ 60+ test mới, 0 test cũ bị phá
- ✅ Báo lỗi bảo mật ngay nếu lập trình lỗi quyền

---

## PHẦN 3: GIAI ĐOẠN C (v18) — FILE MẪU + SINH HỒ SƠ

### 3.1 Module File mẫu

Admin quản lý các file mẫu cho hồ sơ hành chính: Quyết định, Lệnh sản xuất, Biên bản, v.v.

**Bảng:** `file_mau`

```sql
CREATE TABLE file_mau (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,
    ten             TEXT NOT NULL,
    loai_ho_so      TEXT NOT NULL,      -- 'quyet_dinh', 'lenh_sx', 'ncvt', 'bien_ban_kiem_ke', ...
    phien_ban       TEXT,               -- v1.0, v1.1, v2.0
    donvi_ap_dung   INTEGER,            -- NULL = tất cả, hoặc phan_xuong_id cụ thể
    ngay_hieu_luc   TEXT,
    trang_thai      TEXT DEFAULT 'dang_dung'  -- dang_dung, ngung_dung, luu_tru
    duong_dan_file  TEXT NOT NULL,      -- uploads/mau/{id}_{ma}.{ext}
    ext             TEXT,               -- docx, xlsx, pdf
    size_byte       INTEGER,
    md5             TEXT,               -- kiểm tra trùng
    nguoi_tai_len_id INTEGER REFERENCES nguoi_dung(id),
    ngay_tai_len    TEXT,
    ghi_chu         TEXT,
    ngay_tao        TEXT
);
```

### 3.2 Luồng tạo hồ sơ từ mẫu

```
Bước 1: Chọn loại hồ sơ
  → Quyết định, Lệnh sản xuất, Biên bản kiểm kê, ...

Bước 2: Chọn mẫu
  → Danh sách file mẫu theo loại (có phiên bản)

Bước 3: Chọn thiết bị
  → Liệt kê thiết bị của đơn vị
  → ☑ Checkbox từng cái hoặc ☑ Chọn tất cả
  → Tìm kiếm: mã, tên, model, serial, nhóm, tình trạng

Bước 4: Điền biểu mẫu
  → Trường thay đổi theo loại hồ sơ:
    - Quyết định: số, ngày, nội dung, người ký
    - Biên bản: ngày, thời gian, người lập, người kiểm kê
    - Lệnh sản xuất: công trình, hạng mục, thời gian thực hiện

Bước 5: Hệ thống tự lấy dữ liệu thiết bị
  → Mã, tên, model, serial, SL, nguyên giá, ĐVT, ...

Bước 6: Sinh tài liệu
  → DOCX / XLSX / PDF (chọn định dạng)
  → Xem trước → Tải xuống → In → Lưu vào hồ sơ → Gửi duyệt

Bước 7: Lưu lịch sử
  → Ghi nhận ai, khi nào, file nào, phiên bản mẫu nào
```

### 3.3 API + UI

**API:**
- `POST /api/filemau/tai-len` – Upload mẫu
- `GET /api/filemau` – Liệt kê
- `PUT /api/filemau/:id` – Sửa phiên bản
- `DELETE /api/filemau/:id` – Khóa mẫu (soft delete)
- `POST /api/filemau/:id/tao-ho-so` – Sinh hồ sơ từ mẫu
- `GET /api/filemau/:id/xem-truoc` – Xem trước

**UI:**
- `public/admin/quan-tri-file-mau.html` (quản lý)
- `public/don-vi/tao-ho-so.html` (sinh hồ sơ)

### 3.4 Công nghệ sinh tài liệu

- **DOCX:** `docxtemplater` hoặc `exceljs` + Apache POI qua child_process
- **XLSX:** `exceljs` (có sẵn)
- **PDF:** `pdfkit` hoặc dùng `libreoffice --headless` chuyển DOCX sang PDF

---

## PHẦN 4: GIAI ĐOẠN D (v19) — KIỂM KÊ

### 4.1 Khái niệm

Kiểm kê là quá trình ghi lại số lượng thực tế của thiết bị tại một thời điểm cụ thể.

**Vấn đề:** Kỳ kiểm kê cũ không được thay đổi khi dữ liệu hiện hành sau này thay đổi.

**Giải pháp:** Snapshot dữ liệu lúc lập kỳ.

### 4.2 Schema

```sql
CREATE TABLE kiem_ke_ky (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,
    ten             TEXT NOT NULL,
    phan_xuong_id   INTEGER NOT NULL REFERENCES phan_xuong(id),
    ngay_kiem_ke    TEXT NOT NULL,
    thoi_diem_chot  TEXT,               -- timestamp lúc snapshot
    trang_thai      TEXT DEFAULT 'dang_kiem_ke'
                    CHECK (trang_thai IN ('dang_kiem_ke', 'cho_duyet', 'da_duyet', 'da_khoa')),
    nguoi_lap_id    INTEGER REFERENCES nguoi_dung(id),
    nguoi_kiem_ke_id INTEGER REFERENCES nguoi_dung(id),
    nguoi_duyet_id  INTEGER REFERENCES nguoi_dung(id),
    ghi_chu         TEXT,
    ngay_tao        TEXT,
    ngay_sua        TEXT
);

CREATE TABLE kiem_ke_chi_tiet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kiem_ke_ky_id   INTEGER NOT NULL REFERENCES kiem_ke_ky(id) ON DELETE CASCADE,
    thiet_bi_id     INTEGER NOT NULL REFERENCES thiet_bi(id),
    so_luong_so_sach REAL,              -- từ snapshot
    so_luong_thuc_te REAL,
    thieu_thua      REAL,               -- thực - sổ sách
    tinh_trang_kt   TEXT,               -- kỹ thuật theo thực tế
    vi_tri_theo_he  TEXT,               -- vị trí trong hệ thống
    vi_tri_thuc_te  TEXT,               -- vị trí thực tế tìm thấy
    serial          TEXT,               -- kiểm tra serial thực tế
    ghi_chu         TEXT,
    ket_luan        TEXT                -- 'hop_le', 'can_kiem_tra', ...
);
```

### 4.3 Luồng

```
Đơn vị → Lập kỳ kiểm kê mới
  → Hệ thống snapshot dữ liệu thiet_bi vào kiem_ke_chi_tiet
  → Chi tiết kiểm kê lưu số lượng sổ sách (tại thời điểm đó)
  
→ Kiểm kê thực tế
  → Người lập nhập số lượng thực tế, tình trạng, vị trí, serial
  
→ Hệ thống tính tự động
  → thieu_thua = so_luong_thuc_te - so_luong_so_sach
  
→ Gửi duyệt
→ Admin duyệt
  → Nếu duyệt: khoá kỳ, không sửa được nữa
  → Nếu từ chối: cho sửa lại
  
→ Xuất biên bản kiểm kê
```

### 4.4 Test

`test/test-kiem-ke.js` (50+ test):
- Lập kỳ snapshot đúng
- Số lượng cũ không thay đổi dù dữ liệu sau này đổi
- Import Excel kiểm kê
- Duyệt, từ chối
- Xuất biên bản
- Không sửa sau khi khoá
- Tính thieu_thua đúng
- Ghi nhật ký

---

## PHẦN 5: GIAI ĐOẠN E (v20) — ĐỐI CHIẾU TSCĐ/CCDC/KIỂM KÊ

### 5.1 Khái niệm

Đối chiếu so sánh dữ liệu từ nhiều nguồn:
- QLCD (dữ liệu quản lý)
- TSCĐ (tài sản cố định – kế toán)
- CCDC (công cụ dụng cụ – kế toán)
- Kết quả kiểm kê (thực tế)

Phân loại sai lệch rồi tạo giao dịch điều chỉnh.

### 5.2 Schema

```sql
CREATE TABLE doi_chieu (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,
    kiem_ke_ky_id   INTEGER REFERENCES kiem_ke_ky(id),
    trang_thai      TEXT DEFAULT 'dang_tao'
                    CHECK (trang_thai IN ('dang_tao', 'cho_duyet', 'da_duyet')),
    ngay_tao        TEXT
);

CREATE TABLE doi_chieu_chi_tiet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doi_chieu_id    INTEGER REFERENCES doi_chieu(id) ON DELETE CASCADE,
    thiet_bi_id     INTEGER,            -- NULL nếu chỉ có ở TSCĐ/CCDC
    ma_tscd         TEXT,
    phan_loai_sai_lech TEXT              -- 'khop', 'lech_sl', 'lech_dvt', 'lech_ten',
                                          -- 'lech_ma', 'lech_gia', 'chi_qlcd', 'chi_tscd',
                                          -- 'chi_ccdc', 'chi_thuc_te'
    xac_nhan_id     INTEGER REFERENCES nguoi_dung(id),
    hanh_dong_du_kien TEXT              -- 'tao_giao_dich', 'sao_chep_tu_tscđ', ...
    ngay_tao        TEXT
);
```

### 5.3 Luồng

```
Admin chọn kỳ kiểm kê đã duyệt
  → Upload file TSCĐ.xlsx
  → Upload file CCDC.xlsx
  
Hệ thống so sánh:
  QLCD ↔ TSCĐ ↔ CCDC ↔ Kiểm kê
  
Xác định sai lệch:
  - Khớp (OK)
  - Lệch số lượng
  - Lệch đơn vị tính
  - Lệch tên (chỉnh tả)
  - Lệch mã
  - Lệch nguyên giá
  - Chỉ có ở QLCD (mới thêm)
  - Chỉ có ở TSCĐ (mất ở QLCD)
  - Chỉ có ở CCDC (bị cấp không ghi)
  - Chỉ có ở kiểm kê thực tế (không ghi gì cả)
  
Hiển thị danh sách sai lệch:
  → Người có thẩm quyền xác nhận từng dòng
  → Chọn hành động: tạo giao dịch điều chỉnh, sao chép từ TSCĐ, bỏ qua, ...
  
Duyệt đối chiếu
  → Mới tạo giao dịch điều chỉnh
  → Cập nhật dữ liệu QLCD
```

---

## PHẦN 6: GIAI ĐOẠN F (v21) — KHO VẬT TƯ

### 6.1 Schema

```sql
CREATE TABLE kho_vat_tu (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,
    ten             TEXT NOT NULL,
    chi_tieu        TEXT,               -- 10mm, 50mm, ...
    dvt             TEXT,               -- bộ, cái, kg, ...
    ton_dau         REAL DEFAULT 0,
    muc_toi_thieu   REAL,
    muc_toi_da      REAL,
    vi_tri_kho      TEXT,
    ghi_chu         TEXT
);

CREATE TABLE ton_kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vat_tu_id       INTEGER UNIQUE REFERENCES kho_vat_tu(id),
    ton_hien_tai    REAL DEFAULT 0,
    ngay_cap_nhat   TEXT
);

CREATE TABLE giao_dich_kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT NOT NULL UNIQUE,          -- NhapK001, XuatK001, DCK001
    loai            TEXT NOT NULL CHECK (loai IN ('nhap_kho', 'xuat_kho', 'dieu_chuyen_kho')),
    trang_thai      TEXT DEFAULT 'nhap'
                    CHECK (trang_thai IN ('nhap', 'cho_duyet', 'da_duyet', 'tu_choi')),
    nguoi_lap_id    INTEGER REFERENCES nguoi_dung(id),
    nguoi_duyet_id  INTEGER REFERENCES nguoi_dung(id),
    ly_do           TEXT,
    ngay_tao        TEXT
);

CREATE TABLE giao_dich_kho_chi_tiet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    giao_dich_kho_id INTEGER REFERENCES giao_dich_kho(id) ON DELETE CASCADE,
    vat_tu_id       INTEGER REFERENCES kho_vat_tu(id),
    so_luong        REAL NOT NULL,
    CHECK (so_luong > 0)
);
```

### 6.2 Luồng + Quy tắc

```
Nhập kho:
  Người → Upload file / Lập phiếu nhập
  → Chọn vật tư, nhập số lượng
  → Tăng ton_kho
  → Duyệt xong mới cập nhật

Xuất kho:
  Người → Lập phiếu xuất
  → Chọn vật tư, nhập số lượng
  → Kiểm tra: so_luong ≤ ton_hien_tai
  → Nếu không: từ chối
  → Duyệt xong: ton_kho -= so_luong

Điều chuyển kho:
  Lập phiếu (kho nào → kho nào)
  → Giảm tồn kho nguồn, tăng tồn kho đích
  → Trong 1 transaction

Cấp cho phân xưởng:
  NCVT được duyệt → Tạo yêu cầu cấp → Xuất từ kho → Giảm cấp trong NCVT
```

### 6.3 Liên kết NCVT ↔ Kho

```
Trước: NCVT Quý độc lập, không liên kết kho

Sau: Khi cấp phát NCVT
  → Kiểm tra tồn kho
  → Nếu đủ: cấp được
  → Nếu không đủ: chờ nhập kho hoặc từ chối cấp
  → Cấp xong: Giảm tồn kho + Ghi nhận cấp NCVT trong cùng transaction
```

---

## PHẦN 7: GIAI ĐOẠN G (v22) — DASHBOARD + BÁO CÁO

### 7.1 Dashboard công ty

Admin/Phòng Cơ điện xem:

```
┌─ Tổng số phân xưởng        : 12
├─ Tổng thiết bị              : 3.456
├─ Tổng TSCĐ                  : 2.100
├─ Tổng CCDC                  : 1.356
├─ Thiết bị hoạt động         : 3.100 (89%)
├─ Thiết bị đang sửa          : 200 (6%)
├─ Thiết bị kém/hỏng          : 156 (5%)
├─ Kiểm định sắp hết hạn      : 23 (trong 30 ngày)
├─ Bảo dưỡng đến hạn          : 45 (hôm nay)
├─ Sự cố đang mở              : 7
├─ Giao dịch chờ duyệt        : 12
├─ NCVT chưa cấp đủ           : 5 kỳ
├─ Tồn kho dưới mức tối thiểu : 8 vật tư
├─ Giá trị tài sản tổng       : 125.400.000 VNĐ
├─ Chi phí sửa chữa (Q3/2026) : 8.500.000 VNĐ
└─ MTBF trung bình (6 tháng)  : 720 giờ
```

### 7.2 Dashboard phân xưởng

Người px xem chỉ dữ liệu đơn vị:

```
PX Đào lò 1

├─ Thiết bị: 156
├─ Hoạt động: 150 (96%)
├─ Sửa: 4 (3%)
├─ Hỏng: 2 (1%)
├─ Kiểm định sắp hết: 2
├─ Bảo dưỡng đến hạn: 3
├─ Sự cố: 1
├─ Giao dịch chờ duyệt: 2
└─ Giá trị tài sản: 15.200.000 VNĐ
```

### 7.3 Trung tâm báo cáo

Bộ lọc:
```
Từ ngày: [__________]
Đến ngày: [__________]
Đơn vị: [Chọn]
Nhóm thiết bị: [Chọn]
Thiết bị: [Chọn]
Trạng thái: [Chọn]
Tình trạng: [Chọn]
```

Báo cáo tối thiểu:

```
1. Danh sách thiết bị
   → Mã, Tên, Model, Tổng SL, Hoạt động, Sửa, Hỏng, Nguyên giá

2. TSCĐ – CCDC
   → So sánh sổ sách vs. dữ liệu QLCD

3. Kiểm kê
   → Kỳ, SL sổ sách, SL thực tế, Sai lệch, Tỷ lệ

4. Sai lệch kiểm kê
   → Chi tiết sai lệch từng thiết bị

5. Đối chiếu
   → Phân loại sai lệch

6. Tăng/Giảm tài sản
   → Chi tiết giao dịch, người làm, ngày duyệt

7. Điều chuyển
   → Từ → Đến → SL → Ngày

8. Kiểm định
   → Danh sách, ngày hết hạn, tỷ lệ

9. Bảo dưỡng
   → Danh sách, ngày thực hiện

10. Sự cố
    → Danh sách, thời gian, chi phí sửa

11. Chi phí sửa chữa
    → Tổng, trung bình, top máy sửa nhiều nhất

12. NCVT
    → Nhu cầu, cấp phát, còn lại

13. Cấp phát
    → Chi tiết vật tư, SL, ngày

14. Tồn kho
    → Danh sách vật tư, tồn, mức tối thiểu, tối đa

15. Lịch sử thiết bị
    → Timeline đầy đủ
```

Mỗi báo cáo cho phép:
- ✅ Xem
- ✅ In
- ✅ Xuất Excel
- ✅ Xuất PDF

### 7.4 KPI kỹ thuật

Nếu đủ dữ liệu tính:

```
MTBF (Mean Time Between Failures)
  = Tổng giờ chạy / Số lần hỏng
  
MTTR (Mean Time To Repair)
  = Tổng thời gian sửa / Số lần hỏng
  
Tỷ lệ thiết bị tốt
  = (SL hoạt động) / (Tổng SL) × 100%
  
Tỷ lệ thiết bị kém/hỏng
  = (SL kém + SL hỏng) / (Tổng SL) × 100%
  
Tỷ lệ kiểm định đúng hạn
  = (Số máy kiểm định đúng hạn) / (Số máy cần kiểm định) × 100%
  
Tỷ lệ bảo dưỡng đúng hạn
  = (Số máy bảo dưỡng đúng hạn) / (Số máy cần bảo dưỡng) × 100%
```

**Quy tắc:** Không giả lập. Nếu chưa đủ dữ liệu → Hiển thị "Chưa đủ dữ liệu"

---

## PHẦN 8: GIAI ĐOẠN H (v23) — HOÀN THIỆN & TRIỂN KHAI

### 8.1 Code review

- ✅ Tất cả code phải qua chuẩn coding
- ✅ Không hard-code
- ✅ Tất cả phân quyền kiểm tra backend
- ✅ Tất cả input validate
- ✅ Tất cả database transaction đơn vị

### 8.2 Test

- ✅ Chạy toàn bộ 700+ test, 0 trượt
- ✅ Test mới cho từng module (Kiểm kê, Kho, Báo cáo)
- ✅ Test tranh chấp (2 người cùng thao tác)
- ✅ Test rollback

### 8.3 Tài liệu

- ✅ Cập nhật BAN-GIAO.md
- ✅ Hướng dẫn sử dụng mỗi module
- ✅ API documentation
- ✅ Hướng dẫn cài đặt & triển khai

### 8.4 Triển khai

- ✅ Cài Windows + pm2
- ✅ Cài Docker
- ✅ Cài Cloudflare Tunnel
- ✅ Backup/Restore
- ✅ Monitoring

---

## PHẦN 9: TIMELINE

| Giai đoạn | Nội dung | Thời gian | Phiên bản |
|---|---|---|---|
| A | Rà soát, 447 test ✅ | Đã xong | v16 |
| B | Quản trị + Phân quyền động | 1-2 tuần | v17 |
| C | File mẫu + Sinh hồ sơ | 1 tuần | v18 |
| D | Kiểm kê + Snapshot | 1 tuần | v19 |
| E | Đối chiếu TSCĐ/CCDC/Kiểm kê | 1 tuần | v20 |
| F | Kho vật tư + Liên kết NCVT | 1-2 tuần | v21 |
| G | Dashboard + Báo cáo + KPI | 2 tuần | v22 |
| H | Hoàn thiện & Triển khai | 1 tuần | v23 |

**Tổng:** 8-10 tuần

---

## PHẦN 10: KIỂM SOÁT CHẤT LƯỢNG

### 10.1 Nguyên tắc

1. **Mỗi giai đoạn phải**
   - Tạo migration mới, không sửa cũ
   - Viết test trước / sau
   - Chạy toàn bộ test, 0 trượt
   - Update BAN-GIAO.md

2. **Không được**
   - Xóa database
   - Xóa uploads
   - Xóa lịch sử
   - Làm phá tính năng đang hoạt động

3. **Backend luôn kiểm tra**
   - Đã đăng nhập?
   - Có quyền chức năng?
   - Có quyền đơn vị?
   - Dữ liệu nhập hợp lệ?

### 10.2 Audit

Ghi nhật ký:
- Đăng nhập / Đăng xuất
- Tạo / Sửa / Xóa tài khoản, vai trò, quyền
- Import dữ liệu
- Lập / Duyệt / Từ chối phiếu
- Thay đổi thiết bị
- File mẫu: upload, khóa
- Kho: nhập, xuất
- Kiểm kê: snapshot
- Đối chiếu: xác nhận sai lệch

### 10.3 Cảnh báo

- ⚠️ Không được xóa dữ liệu quá khứ
- ⚠️ Không được tin số lượng frontend gửi
- ⚠️ Không được ghi trực tiếp `thiet_bi` từ form
- ⚠️ Không được duyệt hai lần
- ⚠️ Không được cho số lượng âm
- ⚠️ Không được cho cấp vượt tồn

---

## KẾT LUẬN

**Mục tiêu:** Từ hệ thống quản lý đơn lẻ (v16), nâng cấp thành **Hệ thống Quản lý Cơ điện – Vận tải toàn Công ty** (v23) với đầy đủ phân quyền động, kiểm kê, đối chiếu, kho vật tư, dashboard và báo cáo.

**Phương pháp:** Từng giai đoạn một, mỗi giai đoạn có test, migration, API, UI rõ ràng. Không xây dựng lại, không phá tính năng cũ.

**Kết quả mong đợi:**
- ✅ Phân quyền linh hoạt theo chức năng + đơn vị
- ✅ Quản lý file mẫu & sinh hồ sơ tự động
- ✅ Kiểm kê snapshot, không mất dữ liệu cũ
- ✅ Đối chiếu TSCĐ/CCDC/Kiểm kê, xác định sai lệch
- ✅ Kho vật tư thực tế, liên kết NCVT
- ✅ Dashboard + Báo cáo + KPI
- ✅ Audit đầy đủ, bảo mật chặt chẽ
- ✅ 700+ test, 0 trượt
- ✅ Sẵn sàng triển khai thực tế

---

**Được lập bởi:** AI Assistant (Senior Full-Stack Developer)  
**Ngày:** 28/08/2026  
**Trạng thái:** ✅ Sẵn sàng triển khai Giai đoạn B
