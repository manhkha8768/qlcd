# QLCD Database Design Baseline

> Audit source of truth: `db/01-schema.sql` ... `db/13-kho-vat-tu.sql` on `main@fd65edc`.

## 1. Hiện trạng

SQLite là database thực tế. `db/init.js` chạy 13 file SQL theo tên khi server khởi động. Audit tĩnh ghi nhận 81 bảng duy nhất, ngoài ra có view, trigger và index. Database runtime (`db/qlcd.db`, WAL/SHM) được `.gitignore`; Task 0 không mở, reset hay sửa database người dùng.

| Script | Phạm vi |
|---|---|
| `01-schema.sql` | đơn vị/vị trí, người dùng, thiết bị, hồ sơ, điều chuyển, bảo dưỡng, sửa chữa, kiểm định, audit |
| `02-import.sql`–`03-bosung.sql` | staging/import Excel và bổ sung số lượng |
| `04-giao-dich.sql` | giao dịch tài sản, chi tiết, tài liệu, lịch sử, notification, quyền legacy |
| `05-ky-thuat.sql` | thuộc tính động, cây cấu tạo, sự cố, bảo dưỡng, phụ tùng, tài liệu kỹ thuật |
| `06-ncvt.sql` | kỳ/import/chi tiết/cấp phát NCVT |
| `07-bao-mat.sql`–`09-phan-quyen-dong.sql` | session, login failure, network security, RBAC động |
| `10-file-mau.sql` | file mẫu, version, ACL, pin, history |
| `11-kiem-ke.sql`–`12-doi-chieu.sql` | kiểm kê, snapshot, nhiệm vụ, đối chiếu |
| `13-kho-vat-tu.sql` | kho, tồn kho, giao dịch kho, lịch sử |

## 2. Aggregate hiện có và gap

| Domain | Bảng chính hiện có | Đánh giá |
|---|---|---|
| Organization | `phan_xuong`, `vi_tri` | Có danh mục động; thiếu hierarchy công ty/phòng/công trình và user-many-units. |
| Identity/RBAC | `nguoi_dung`, hai bộ bảng quyền, `phien_dang_nhap` | Có thật nhưng trùng mô hình, scope yếu. |
| Asset/device | `thiet_bi`, `model_thiet_bi`, `nhom_thiet_bi` | Một bảng trộn asset/device; cần tách có migration mapping. |
| Asset movement | `giao_dich`, `chi_tiet_giao_dich`, `lich_su_tai_san`, `dieu_chuyen` | Có workflow nhưng song song hai mô hình và chưa ledger chuẩn/reversal đầy đủ. |
| Technical | `dinh_nghia_thong_so`, `gia_tri_thong_so`, `cum_thiet_bi`, `lich_su_cum` | Nền tốt cho Task 7-8; cần chuẩn hóa constraint/version. |
| Files | `ho_so_dinh_kem`, `tai_lieu_*`, `file_mau*` | Metadata phân tán; thiếu object key/hash/version dùng chung. |
| Material/warehouse | `phu_tung`, `kho_vat_tu`, `ton_kho`, `giao_dich_kho*`, `lich_su_kho` | Một phần; chưa có Material Master duy nhất, reservation, transfer-in-transit và ledger balance chuẩn. |
| NCVT | `ncvt_ky`, `ncvt_chi_tiet`, `ncvt_cap_phat` | MVP import/cấp phát; thiếu proposal/approval/reservation/receive/carry-forward chuẩn. |

## 3. Nguyên tắc target

- Mọi migration có ID, checksum, timestamp, trạng thái và chạy đúng một lần; không dựa vào việc bỏ qua lỗi `already exists`.
- Foreign key bật và được test. Dùng UUID/ULID hoặc ID ổn định cho entity mới; giữ bảng mapping từ ID legacy.
- Tách master khỏi ledger/projection. Không cập nhật trực tiếp số dư tài sản hoặc vật tư.
- Ledger append-only: sửa sai bằng `REVERSAL`/`ADJUSTMENT` có tham chiếu giao dịch gốc, lý do, người duyệt và idempotency key.
- Tất cả entity nghiệp vụ có `created_at/by`, `updated_at/by`, status version; audit không cho user thường sửa/xóa.
- Unit-of-measure phải chuẩn hóa trước khi tổng hợp; không cộng các ĐVT khác nhau.

## 4. Mô hình đích tối thiểu theo Roadmap

```text
organizations <- user_unit_assignments -> users <- user_roles -> roles -> role_permissions
organizations <- assets <- asset_device_links -> devices
assets <- asset_ledger_entries -> asset_transactions
materials <- warehouse_stock_ledger -> warehouses
materials <- material_reservations -> ncvt_lines -> ncvt_submissions -> ncvt_periods
documents -> document_versions -> entity_document_links
```

Các bảng kiểm kê, kỹ thuật, bảo dưỡng và sửa chữa liên kết bằng ID ổn định tới `assets/devices/materials`, không sao chép master record.

## 5. Migration strategy

1. Chụp backup và restore thử trên bản sao; kiểm kê row count/checksum.
2. Thêm migration journal và constraint/index còn thiếu, không đổi nghiệp vụ.
3. Tạo bảng target song song; backfill ID mapping; dual-read/parity report trước dual-write.
4. Chuyển từng module qua target schema, có feature flag và rollback.
5. Chỉ retire schema cũ sau UAT và kỳ lưu giữ; không drop trong các Task đầu.

## 7. TASK 2 implementation

Migration `15-asset-master.sql` tạo `assets` làm Master Asset mới và `asset_legacy_map` để truy vết về `thiet_bi`. Backfill giữ mã TSCĐ duy nhất; bản ghi thiếu/trùng mã nhận mã ổn định `QLCD-LEGACY-{id}`. Bảng legacy tiếp tục tồn tại, không dual-write và không bị drop. Asset mới có optimistic `version`, soft archive, RBAC, scope đơn vị, API phân trang/filter và import/export Excel. Việc đổi đơn vị bị chặn khỏi CRUD để buộc đi qua ledger/transfer ở Task 4–5.

## 8. TASK 3 implementation

Migration `16-device-master.sql` tạo `devices` chỉ chứa nhận dạng và hồ sơ kỹ thuật, `device_legacy_map` giữ ID `thiet_bi`, còn `asset_device_links` biểu diễn quan hệ nhiều-nhiều có hiệu lực theo thời gian. Backfill tạo Device ID ổn định và liên kết chính tới Asset sinh từ cùng record legacy. API Device Master có CRUD, filter/pagination, RBAC, multi-unit scope, optimistic version và đóng liên kết thay vì xóa lịch sử. API `/api/thiet-bi` cũ trả thêm `device_id`/`asset_id` để các màn hình hiện hữu chuyển đổi dần.

## 9. TASK 4 implementation

Migration `17-asset-ledger.sql` thêm transaction header, draft lines, immutable posted entries và projection có thể rebuild. Opening balance được backfill idempotent từ `assets`; transfer tạo hai entry cân bằng theo toàn Công ty. Trigger database chặn update/delete posted entry. Reversal là transaction mới tham chiếu entry gốc. Reconciliation chỉ đọc và báo chênh lệch với Asset Master/legacy.

## 6. Rủi ro cần test

- D1 không tương đương SQLite server về transaction/concurrency và giới hạn request; scaffold Cloudflare chưa chứng minh parity.
- `ALTER TABLE` lặp lại khi startup có thể che lỗi migration thật.
- Trigger cập nhật số liệu cần được kiểm tra cùng service transaction để tránh ghi kép.
- Backup hiện là file SQLite + uploads; khi dùng object storage phải có manifest và restore drill đồng bộ.
