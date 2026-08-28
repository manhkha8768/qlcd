# BÀN GIAO DỰ ÁN — HỆ THỐNG QUẢN LÝ THIẾT BỊ CƠ ĐIỆN VẬN TẢI (QLCD)

**Đơn vị:** Công ty Xây lắp Mỏ — Tập đoàn Công nghiệp Than Khoáng sản Việt Nam (TKV)
**Ngày bàn giao:** 26/08/2026
**Phiên bản:** v16

Tài liệu này dành cho người hoặc trợ lý AI tiếp nhận dự án. Đọc hết trước khi sửa bất cứ thứ gì.

---

## 1. DỰ ÁN NÀY LÀ GÌ

Hệ thống web nội bộ quản lý thiết bị cơ điện vận tải trong mỏ hầm lò: máng cào, băng tải, tời trục, tàu điện ắc quy, quạt gió cục bộ, trạm biến áp phòng nổ, máy bơm, combai đào lò.

Người dùng là cán bộ cơ điện các phân xưởng đào lò, dùng trong mạng nội bộ công ty, phần lớn không rành máy tính.

**Toàn bộ giao diện, tên bảng, tên cột, tên biến đều bằng tiếng Việt không dấu.** Đây là quyết định có chủ ý, không phải ngẫu nhiên. Giữ nguyên quy ước này.

---

## 2. CÔNG NGHỆ

```
Backend    Node.js 22+ · Express 4 · better-sqlite3 12.11.1
Database   SQLite, một tệp db/qlcd.db, bật WAL
Frontend   HTML + CSS + JavaScript thuần, KHÔNG framework, KHÔNG build tool
Phiên      express-session, kho lưu tự viết trên SQLite
Đọc Excel  SheetJS (xlsx)
Triển khai Windows nội bộ (pm2), hoặc Docker, hoặc Cloudflare Tunnel
```

**Lý do không dùng framework frontend:** hệ thống phải chạy được trong mạng nội bộ không internet, trên máy tính cũ ở phân xưởng. Không có bước build, chép thư mục là chạy. Đừng đề xuất React/Vue trừ khi người dùng yêu cầu.

**Không dùng thư viện biểu đồ.** Các biểu đồ hiện có vẽ bằng CSS thuần (thanh ngang, cây phân cấp).

---

## 3. CẤU TRÚC MÃ NGUỒN

```
qlcd/
├── server.js                 Điểm khởi động, đăng ký route
├── db/
│   ├── index.js              Kết nối SQLite
│   ├── init.js               Chạy migration + tạo admin
│   ├── 01-schema.sql         Nền: thiết bị, phân xưởng, người dùng, kiểm định
│   ├── 02-import.sql         Import Excel TSCĐ/CCDC
│   ├── 03-bosung.sql         Bổ sung cột số lượng, ĐVT
│   ├── 04-giao-dich.sql      Tăng/Giảm/Điều chuyển + phê duyệt
│   ├── 05-ky-thuat.sql       Hồ sơ kỹ thuật, cụm chi tiết, sự cố
│   ├── 06-ncvt.sql           NCVT Quý
│   ├── 07-bao-mat.sql        Phiên, chặn dò mật khẩu
│   └── 08-dai-mang.sql       Kiểm soát truy cập theo dải mạng
├── lib/                      Lõi nghiệp vụ (1.339 dòng)
│   ├── giao-dich.js          Duyệt giao dịch nguyên tử — QUAN TRỌNG NHẤT
│   ├── cay-thiet-bi.js       Cây cụm chi tiết
│   ├── ky-thuat.js           Lý lịch, chi phí vòng đời
│   ├── ncvt.js               Cấp phát vật tư có khóa
│   ├── doc-excel.js          Dò tiêu đề, đoán cột
│   ├── ma-thiet-bi.js        Sinh mã, đoán nhóm từ tên
│   ├── so-phieu.js           Sinh số phiếu
│   └── phien-sqlite.js       Kho phiên đăng nhập
├── middleware/               (316 dòng)
│   ├── quyen.js              Vai trò
│   ├── quyen-ma.js           Mã quyền chi tiết
│   └── bao-mat.js            Header, HTTPS, chặn dò mật khẩu, lọc dải mạng
├── routes/                   13 file API (3.749 dòng)
├── public/                   Giao diện (4.221 dòng)
├── test/                     7 bộ test (2.305 dòng)
├── scripts/sao-luu.js        Sao lưu bằng lệnh backup của SQLite
└── *.bat                     File cài đặt cho Windows
```

**Migration cộng dồn.** `db/init.js` chạy mọi tệp `.sql` theo thứ tự tên, bỏ qua lỗi `already exists` và `duplicate column name`. Chạy lại nhiều lần an toàn. Thêm tính năng mới thì tạo tệp `09-*.sql`, **không sửa tệp cũ**.

---

## 4. DATABASE

53 bảng, 11 view, 6 trigger.

### Bảng cốt lõi

| Bảng | Vai trò |
|---|---|
| `thiet_bi` | Vừa là tài sản vừa là thiết bị. Có `so_luong` nên một bản ghi biểu diễn được cả lô CCDC (45 đèn lò = 1 dòng) |
| `phan_xuong` | Đơn vị. Admin thêm/bớt được |
| `nguoi_dung` | Vai trò: `admin`, `cd_cty`, `px`, `xem` |
| `nhom_thiet_bi` | 30 nhóm 2 cấp, đã nạp sẵn |
| `giao_dich` + `chi_tiet_giao_dich` | Kiến trúc giao dịch thống nhất |
| `cum_thiet_bi` | Cây cấu trúc, không giới hạn cấp |
| `su_co` | Tách hẳn khỏi phiếu sửa chữa |
| `ncvt_ky` + `ncvt_chi_tiet` + `ncvt_cap_phat` | Nhu cầu vật tư theo quý |

### Hai trường trạng thái độc lập

```
thiet_bi.trang_thai     hoat_dong, du_phong, dang_sua, dang_dieu_chuyen,
                        cho_thanh_ly, da_thanh_ly     (trạng thái quản lý)

thiet_bi.tinh_trang_kt  tot, trung_binh, kem, hong     (tình trạng kỹ thuật)
```

Máy `hoat_dong` + `kem` là hợp lệ: vẫn chạy nhưng cần bảo dưỡng. **Đừng gộp hai trường này.**

### Quy tắc mã

```
Thiết bị    DL1.VT01.003        {mã PX}.{mã nhóm}.{STT}
Cụm         C02.01.01.01        phân cấp theo cây
Giao dịch   TANG-DL1-2026-0001
            GIAM-DL1-2026-0001
            DC-DL1-DL14-2026-0001
Cấp phát    CP-Q32026-0001
```

Mã thiết bị **giữ nguyên khi điều chuyển** sang phân xưởng khác. Mã là định danh máy, không phải định danh vị trí.

---

## 5. BỐN NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ

### 5.1 Dữ liệu hiện hành chỉ đổi sau khi duyệt

Form lập phiếu **không bao giờ** ghi thẳng vào `thiet_bi`. Mọi thay đổi số lượng, đơn vị quản lý đều đi qua `lib/giao-dich.js → duyetGiaoDich()`.

Luồng: `nhap → cho_duyet → da_duyet | tu_choi → (mở lại) → nhap`

### 5.2 Backend không tin số liệu frontend gửi lên

Khi duyệt, backend **đọc lại** số lượng hiện hành trong cùng transaction, không tin cả `so_luong_truoc` đã lưu lúc lập phiếu.

### 5.3 Chống tranh chấp bằng khóa ghi

```javascript
const chay = db.transaction(() => { ... });
chay.immediate();          // BEGIN IMMEDIATE, giữ khóa ghi ngay
```

Đã kiểm chứng: hai người cùng giảm một tài sản còn 5, A xin 4 và B xin 3 → chỉ một giao dịch thành công, không bao giờ âm.

Lớp chặn cuối ở tầng database:
```sql
CHECK (so_luong_da_cap <= so_luong_kh)
```

### 5.4 Không xóa lịch sử

- Giảm hết số lượng → chuyển `da_thanh_ly`, **không xóa bản ghi**
- Thay cụm chi tiết → cụm cũ chuyển `da_thay_the`, ẩn khỏi cây, giữ lịch sử
- Hủy giao dịch cấp phát → đánh dấu `da_huy`, hoàn số lượng, giữ bản ghi
- Giao dịch đã duyệt **không sửa, không xóa, không hủy** — muốn đảo phải lập phiếu ngược chiều

---

## 6. ĐÃ LÀM XONG

### Giai đoạn 1–2: Nền tảng
- Đăng nhập, phân quyền, quản lý phân xưởng và tài khoản
- **Import Excel TSCĐ/CCDC thông minh**: tự dò dòng tiêu đề (bỏ qua quốc hiệu, tên bảng ở đầu file), tự đoán cột theo 14 từ điển tên cột, tự đoán nhóm thiết bị từ tên tài sản qua 66 từ khóa không dấu ("Máng cào SGB-620" → VT.01)
- Xem trước, sửa dòng lỗi, gán nhóm hàng loạt, rồi mới xác nhận nhập

### Giai đoạn 3: Giao dịch tài sản
- Tăng / Giảm / Điều chuyển dùng chung một kiến trúc
- Snapshot dữ liệu lúc lập phiếu
- Điều chuyển toàn bộ: giữ nguyên bản ghi, chỉ đổi đơn vị quản lý
- Điều chuyển một phần: tách bản ghi, chia nguyên giá theo tỷ lệ, tự tìm bản ghi tương ứng ở đơn vị đích theo mã tài sản → model → nhóm+tên+ĐVT
- Cấm tự duyệt phiếu mình lập (admin được nhưng ghi cờ `duyet_vuot_quyen` + audit)
- Duyệt hai lần trả 409, không cộng thêm

### Giai đoạn 4: Hồ sơ kỹ thuật
- Thông số kỹ thuật động theo nhóm thiết bị (băng tải có chiều rộng băng, máy bơm có lưu lượng và cột áp)
- Cây cụm chi tiết không giới hạn cấp, di chuyển nút có chặn vòng lặp
- Thay thế cụm giữ nguyên lịch sử
- Sự cố tách khỏi sửa chữa
- Lý lịch tổng hợp từ 7 nguồn sự kiện
- Chi phí vòng đời, không cộng trùng vật tư

### NCVT Quý
- Import file Excel nhu cầu vật tư theo quý
- Chủ nhiệm công trình lấy vật tư, số còn lại tự giảm
- Không cấp vượt, không âm khi nhiều người cùng thao tác
- Đối chiếu ngược về đúng dòng Excel gốc (lưu nguyên dòng dạng JSON)

### Bảo mật
- Phiên lưu database, cắt phiên từ xa
- Khóa tạm 15 phút sau 5 lần sai
- Ép HTTPS, header bảo mật, CSP
- Lọc truy cập theo dải mạng CIDR, có 3 lớp chống tự khóa mình
- Từ chối khởi động ở chế độ internet nếu chưa đặt khóa bí mật hoặc admin còn `admin123`

---

## 7. CHƯA LÀM

| Hạng mục | Ghi chú |
|---|---|
| **Kiểm kê** | Chưa có. Nhiều spec người dùng gửi giả định đã có module này |
| **Đối chiếu** | Chưa có. Phụ thuộc Kiểm kê |
| **Kho vật tư** | Chưa có: nhập kho, xuất kho, tồn kho, điều chuyển kho, yêu cầu cấp vật tư. Bảng `phu_tung` mới chỉ là danh mục |
| **Báo cáo & KPI** | Chưa có: dashboard công ty/đơn vị, trung tâm báo cáo, MTTR/MTBF, xuất Excel/PDF, biểu mẫu in |
| **Giao diện dải mạng** | Đã có API và màn hình, nhưng chưa test thực tế trên Windows |

**Cảnh báo cho người tiếp nhận:** người dùng có xu hướng gửi spec rất dài giả định các module trên đã tồn tại. Kiểm tra schema thật trước khi viết code, đừng tin mô tả trong spec.

---

## 8. KIỂM THỬ

7 bộ, **447 phép thử, 0 trượt**. Chạy: `npm test`

| Bộ | Số test | Nội dung |
|---|---|---|
| `test.js` | 87 | Phân xưởng, tài khoản, import Excel |
| `test-nghiep-vu.js` | 44 | Bảo dưỡng, kiểm định |
| `test-giao-dich.js` | 93 | Tăng/Giảm/Điều chuyển, tranh chấp, rollback |
| `test-ky-thuat.js` | 58 | Cây cụm, thông số, sự cố, chi phí |
| `test-ncvt.js` | 83 | NCVT Quý |
| `test-bao-mat.js` | 37 | Phiên, chặn dò mật khẩu, HTTPS |
| `test-dai-mang.js` | 45 | So khớp CIDR, lọc truy cập |

Mỗi bộ dựng database tạm riêng, không đụng dữ liệu thật.

---

## 9. LỖI ĐÃ GẶP VÀ CÁCH SỬA

Ghi lại để người tiếp nhận không mất thời gian lặp lại.

**`Cannot find module 'express'`**
Thiếu `node_modules`. Chạy `npm install`.

**`prebuild-install No prebuilt binaries found (target=24.x)`**
`better-sqlite3` cũ chưa hỗ trợ Node mới. **Đã sửa: nâng lên ^12.11.1** (có bản dựng sẵn cho Node 22/24/25/26 trên Windows). Đừng hạ Node xuống — Node 24 hiện là LTS.

**`Assertion failed: (env) != nullptr` khi thoát**
Cùng nguyên nhân trên. Ngoài ra mọi script phải kết thúc bằng `db.close(); process.exit(0);`

**`EADDRINUSE :::3000`**
Cổng bị chiếm. `set PORT=3005` rồi `npm start`.

**`findstr /R "[^\x20-\x7E]"` luôn khớp**
`findstr` không hiểu cú pháp hex. Đã chuyển sang PowerShell.

**Sai mật khẩu hiện "Phiên làm việc đã hết hạn"**
Hàm `api()` bắt mọi 401. Đã loại trừ `/auth/toi` và `/auth/dang-nhap`.

**Tài khoản admin không tồn tại sau khi cài**
`db/init.js` crash sau migration, chưa kịp tạo admin. Đã sửa. Cứu bằng `scripts/dat-lai-mat-khau.js` (tự tạo nếu thiếu).

---

## 10. QUY ƯỚC PHẢI GIỮ

**Đặt tên**
- Tiếng Việt không dấu, snake_case: `thiet_bi`, `so_luong_da_cap`
- Đừng đổi sang tiếng Anh

**Giao diện**
- Gọn, ít màu, mật độ thông tin cao. Đây là công cụ dùng hằng ngày, không phải trang giới thiệu
- Tên viết tắt ngắn: DL1, NL, TS
- Chức năng quản trị nhạy cảm chỉ admin thấy

**Phê duyệt**
- Từ chối phải có lý do bắt buộc, trả về người lập để sửa và trình lại
- Không dùng từ "bác bỏ" đơn thuần

**Tài khoản tạm**
- Mật khẩu 4–6 ký tự, hết hạn 24 giờ, không bắt đổi mật khẩu

**Bảo mật**
- Backend luôn kiểm tra lại quyền, không dựa vào việc frontend đã ẩn nút
- Người dùng vai trò `px` mọi truy vấn tự thêm `WHERE phan_xuong_id = ?` ở tầng middleware

---

## 11. TRẠNG THÁI HIỆN TẠI

Người dùng đang cài trên máy Windows tại `D:\qlcd`. Hệ thống đã chạy được, giao diện lên, đang ở bước đăng nhập lần đầu.

**Việc tiếp theo của người dùng:**
1. Gỡ khóa tạm nếu còn: `node -e "const d=require('./db');d.prepare('DELETE FROM dang_nhap_that_bai').run();d.close();process.exit(0)"`
2. Đăng nhập `admin` / `admin123`, đổi mật khẩu
3. Thêm phân xưởng, thêm tài khoản
4. Từng phân xưởng tải file Excel TSCĐ/CCDC lên

**Khuyến nghị:** chạy thử ở một phân xưởng vài tuần trước khi mở rộng hoặc đưa ra internet.

---

## 12. LƯU Ý VỀ DỮ LIỆU

Hệ thống chứa nguyên giá tài sản, hồ sơ thiết bị và nhân sự phân xưởng của một đơn vị thuộc TKV.

Trước khi đưa ra internet, cần hỏi bộ phận CNTT công ty — nhiều đơn vị nhà nước có quy định riêng về dữ liệu nội bộ đặt trên máy chủ nước ngoài. Nếu công ty đã có VPN thì dùng VPN an toàn hơn.

Đây là quyết định của người dùng, không phải của người phát triển. Nhưng phải nêu rõ để họ biết mà cân nhắc.
