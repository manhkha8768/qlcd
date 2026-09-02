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

## 10. TASK 5 implementation

Migration `18-transfer-handover.sql` thêm `asset_transfer_workflows`, `asset_transfer_timeline` và `asset_transfer_documents`. Workflow tách khỏi status kế toán của transaction để không rewrite bảng ledger. Phê duyệt và post là một transaction nguyên tử; lỗi tồn nguồn hoặc lỗi ghi entry rollback cả approval. Chứng từ lưu metadata và đường dẫn có ACL ở upload/download; object storage và versioning thuộc Task 9.

## 11. TASK 6 implementation

Migration `19-inventory-ledger-qr.sql` tạo QR identity, kỳ kiểm kê canonical, snapshot bất biến từ projection, batch sync idempotent, observation, discrepancy review và timeline. Kết quả submit không sửa snapshot. Chỉ sai lệch được reviewer chấp thuận mới sinh transaction `ADJUSTMENT`; approval và ledger post chạy nguyên tử. Asset Master/legacy không bị sửa trực tiếp.

## 12. TASK 7 implementation

Migration `20-technical-profile.sql` tạo định nghĩa thuộc tính theo nhóm/model, trạng thái phiên bản hồ sơ, giá trị typed và lịch sử thay đổi bất biến theo `Device ID`. Kiểu dữ liệu gồm text, number, boolean, date và enum; định nghĩa hỗ trợ đơn vị, min/max, pattern, bắt buộc và thứ tự. Dữ liệu `dinh_nghia_thong_so`/`gia_tri_thong_so` được backfill qua legacy mapping, không xóa hay sửa bảng nguồn. Profile canonical trả các tab tài sản, cấu tạo, tài liệu, bảo trì và kiểm định; các tab chưa canonical tiếp tục đọc qua mapping cho tới Task tương ứng.

## 13. TASK 8 implementation

Migration `21-component-tree.sql` tạo `device_components` theo `Device ID`, quan hệ `parent_id` không giới hạn cấp, optimistic `version`, soft removal và legacy mapping. `component_events` là lịch sử append-only được trigger bảo vệ. Backfill chạy hai pha để giữ đúng node và parent; sửa chữa, vật tư sửa chữa và phụ tùng tương thích được nối qua các bảng link canonical riêng. API kiểm tra parent cùng Device và dùng recursive descendants để chặn cycle; move, replace và chuyển node con chạy trong transaction. Bảng `cum_thiet_bi` không bị drop hay rewrite.

## 14. TASK 9 implementation

Migration `22-document-management.sql` tạo `documents`, version bất biến, entity links và access log append-only. Một document có nhiều version; version lưu provider/object key, SHA-256, MIME, size, uploader và change note. Link hỗ trợ Device, Component, Asset, Asset Transaction, giao dịch legacy, sửa chữa và kiểm định. Metadata tài liệu kỹ thuật, giao dịch và điều chuyển được backfill; file vật lý legacy giữ nguyên tại chỗ. Storage adapter giới hạn object key trong vùng upload được phép và dành provider `EXTERNAL` cho object storage sau khi cấu hình môi trường thực.

## 15. TASK 10 implementation

Migration `23-material-master.sql` tạo `materials`, `uoms`, alias ĐVT, source mappings và duplicate candidates. Phụ tùng, kho và NCVT được backfill có truy vết; NCVT chỉ gom bản ghi tương đương trong cùng nguồn. Trùng giữa nguồn tạo candidate, không tự merge. Review xác nhận cùng vật tư mới remap nguồn và archive master thừa; giữ riêng không đổi mapping.

## 16. TASK 11 implementation

Migration `24-stock-ledger.sql` tạo `warehouses`, transaction header/draft lines, `stock_ledger_entries` append-only và `stock_balance_projection`. Opening balance được backfill idempotent từ `ton_kho` qua mapping Material Master vào kho `LEGACY-MAIN`; bảng legacy chỉ dùng đối chiếu và không bị canonical posting sửa. Mỗi entry giữ đúng Material ID/UOM, warehouse và ba delta `on_hand/reserved/incoming`; `AVAILABLE` là view tính `ON_HAND - RESERVED`. Post và reversal rebuild projection trong cùng database transaction; constraint chặn tồn âm, over-reserve và nhận/xuất vượt nguồn.

## 17. TASK 12 implementation

Migration `25-warehouse-transfer-return.sql` tạo workflow `warehouse_transfers`, dòng canonical và timeline append-only. Dispatch ghi một stock transaction gồm `ON_HAND -q` tại nguồn và `INCOMING +q` tại đích; receive ghi `ON_HAND +q / INCOMING -q` tại đích; return trước khi nhận ghi `ON_HAND +q` về nguồn và `INCOMING -q` tại đích. Mỗi transition, ledger entries, projection và workflow status cùng commit hoặc cùng rollback. Transaction ID được lưu trên workflow và retry trạng thái cuối không sinh entry kép.

## 18. TASK 13 implementation

Migration `26-ncvt-period-submission.sql` tách `ncvt_periods` cấp Công ty khỏi `ncvt_submissions` theo từng PX. Mỗi năm/quý chỉ có một period, mỗi PX chỉ có một submission trong period. Dòng submission bắt buộc Material ID, UOM canonical và số lượng dương; mutation chỉ được phép khi submission DRAFT và period OPEN. Submit tăng optimistic version, khóa nội dung và ghi event append-only. `ncvt_ky/ncvt_chi_tiet` được map/backfill sang draft canonical, không đổi trạng thái hoặc số lượng nguồn.

## 19. TASK 14 implementation

Migration `27-ncvt-review-approval.sql` tạo assignment theo period/PX, giữ lịch sử khi phân công lại và chỉ cho một assignment ACTIVE. Mỗi vòng submit chỉ có một `ncvt_review_decisions`, gắn submission version, reviewer, lý do, tổng dòng/tổng lượng và JSON snapshot; trigger database cấm update/delete. RETURN chuyển submission sang RETURNED để PX phản hồi, mở lại DRAFT, sửa và submit vòng mới. REJECT/APPROVE là trạng thái terminal. Period chỉ được LOCKED khi mọi submission đã có quyết định cuối.

## 20. TASK 15 implementation

Migration `28-ncvt-company-aggregation.sql` tạo view `v_ncvt_company_aggregate` tính trực tiếp từ `ncvt_submissions.status='APPROVED'`, nhóm theo period, Material ID và UOM; không lưu một bảng tổng dễ stale. Drill-down dùng cùng điều kiện nguồn và nhóm theo PX nên tổng chi tiết phải khớp tổng Công ty. `supply_sources` là danh mục nguồn cung canonical, có thể liên kết kho nội bộ; `material_supply_sources` ánh xạ nhiều nguồn cho một Material với priority, preferred, lead time và minimum order. Mỗi Material chỉ có tối đa một nguồn ưu tiên ACTIVE. Thay đổi mapping dùng optimistic version và ghi `material_supply_source_events` bất biến; bảng NCVT legacy không bị sửa.

## 21. TASK 16 implementation

Migration `29-ncvt-reservation.sql` tạo `material_reservations` liên kết trực tiếp dòng NCVT APPROVED với kho, Material ID và UOM canonical. Reserve kiểm tra cả phần nhu cầu chưa phân bổ và `AVAILABLE` hiện hành rồi tạo stock transaction/ledger `RESERVE` trong cùng database transaction; constraint projection chặn `RESERVED > ON_HAND`. Release/cancel tạo ledger `RELEASE`, tăng version và cập nhật reservation nguyên tử. `material_reservation_events` chứa idempotency key, stock transaction, actor, lý do và payload, được trigger bảo vệ khỏi update/delete. View `v_ncvt_reservation_progress` chiếu requested, active reserved, consumed và unallocated theo dòng để Task 17 consume mà không đổi approved demand.

## 22. TASK 17 implementation

Migration `30-ncvt-material-issue.sql` tạo voucher cấp phát canonical và dòng bắt buộc tham chiếu reservation. Workflow `DRAFT -> SUBMITTED -> APPROVED -> POSTED`, có REJECTED/CANCELLED và REVERSED; quyết định approve/reject lưu snapshot bất biến theo version. Khi post, mỗi dòng kiểm tra lại phần reservation chưa consume, ghi stock transaction `ISSUE` với cả `on_hand_delta=-q` và `reserved_delta=-q`, cập nhật consumed/status reservation và voucher trong một database transaction. Vì vậy cấp nhiều đợt không vượt reservation và hai phiếu cạnh tranh không double-consume. Reversal tạo entry đối ứng, phục hồi cả ON_HAND/RESERVED và consumed reservation; phiếu REVERSED bị loại khỏi projection issued.

## 23. TASK 18 implementation

Migration `31-ncvt-receipt-confirmation.sql` tạo receipt header và dòng xác nhận liên kết issue line POSTED. Mỗi dòng tách `accepted_quantity`, `damaged_quantity`, `wrong_quantity`, `refused_quantity`; nhiều receipt có thể ghi nhận từng đợt nhưng tổng terminal không vượt quantity đã issued. Confirm recheck trong transaction để hai draft cạnh tranh không double-confirm, sau đó phân loại batch thành RECEIVED, DISCREPANCY hoặc REFUSED. Dòng và event đã confirm được trigger bảo vệ. View `v_ncvt_receipt_progress` giữ riêng issued, accepted, từng loại discrepancy và pending. Receipt không ghi Stock Ledger; issue đã có receipt terminal bị chặn reversal trực tiếp để tránh hoàn tồn sai thực tế.

## 24. TASK 19 implementation

Migration `32-ncvt-carry-forward-lock.sql` tạo batch carry-forward POSTED, các dòng lineage `source_line_id -> target_line_id`, snapshot định lượng nguồn và event POST bất biến. View `v_ncvt_carry_forward_eligible` tính phần được chuyển bằng nhu cầu APPROVED trừ issue voucher còn POSTED, reservation đang còn hiệu lực và lượng đã carry. API chỉ nhận kỳ nguồn LOCKED và đúng kỳ quý kế tiếp đang OPEN; toàn bộ validation, tạo draft đích, dòng canonical, lineage và event cùng nằm trong một transaction có idempotency payload. Trigger khóa cứng period, submission và submission line của kỳ LOCKED; batch đã có event POST không nhận thêm dòng. Bảng NCVT legacy không bị sửa.

## 25. TASK 20 implementation

Migration `33-ncvt-dashboard.sql` tạo view đọc `v_ncvt_dashboard_lines` theo khóa `period_id + submission_line_id + don_vi_id + material_id + uom_code`. Mỗi dòng chiếu approved, active reserved, POSTED issued, accepted received, damaged/wrong/refused, pending confirmation, unallocated, remaining-to-issue, carried-in/out và carry-eligible bằng các nguồn canonical Task 13–19. API chỉ tổng hợp các dòng sau khi áp dụng data scope và trả `kpis_by_uom`, không tạo một tổng số lượng xuyên UOM. Dashboard là read projection, không ghi workflow, ledger hoặc legacy; drill-down truy ngược reservation, issue, receipt và carry lineage.

## 26. TASK 21 implementation

Migration `34-technical-operations.sql` tạo `technical_work_orders` cho ba loại REPAIR/MAINTENANCE/INSPECTION, state machine có version và `technical_work_order_events` append-only. `technical_material_issues` nối trực tiếp work order + Component + Material ID/UOM + Warehouse + Stock Transaction. Post ISSUE và reversal cập nhật `stock_ledger_entries`, projection và lifecycle trong một transaction; không tạo balance kỹ thuật riêng. Work order terminal bị trigger cấm update/delete. Phiếu sửa chữa, bảo dưỡng và kiểm định legacy được backfill có khóa nguồn riêng, không bị sửa hoặc xóa.

## 27. TASK 22 implementation

Migration `35-notifications-data-quality.sql` tạo registry `notification_rules`, hàng đợi `notification_cases`, delivery theo người nhận, event triage/rule append-only và `notification_job_runs`. Fingerprint unique bảo đảm một nguồn/rule không sinh case kép. Case có category, entity reference, unit scope, severity, owner, SLA, escalation level, occurrence count và optimistic version. Rule change bắt buộc lý do và lưu before/after; job terminal và event không thể sửa/xóa. Engine chỉ auto-resolve case khi nguồn không còn vi phạm, không update Material, Document, NCVT hoặc work order nguồn.

## 28. TASK 23 implementation

Migration `36-reporting-center.sql` tạo `report_definitions` và seed bảy định nghĩa báo cáo canonical với page size, export limit, orientation và trạng thái kích hoạt. `report_export_runs` ghi một lần chạy XLSX/PDF/PRINT gồm filter/scope JSON, số dòng, duration, SHA-256, actor và lỗi; trigger chặn delete và chặn update sau SUCCEEDED/FAILED. Các index report-specific được bổ sung cho Asset, Device, Asset Ledger, Stock Balance, NCVT submission, Technical Work Order và Data Quality Case. Dữ liệu báo cáo tiếp tục đọc trực tiếp từ aggregate/projection nguồn, không tạo balance hay snapshot nghiệp vụ song song.

## 6. Rủi ro cần test

- D1 không tương đương SQLite server về transaction/concurrency và giới hạn request; scaffold Cloudflare chưa chứng minh parity.
- `ALTER TABLE` lặp lại khi startup có thể che lỗi migration thật.
- Trigger cập nhật số liệu cần được kiểm tra cùng service transaction để tránh ghi kép.
- Backup hiện là file SQLite + uploads; khi dùng object storage phải có manifest và restore drill đồng bộ.
## 29. TASK 25 — Operational data and indexes

Migration `37-production-readiness.sql` thêm `operational_error_events` để lưu request ID, route, HTTP status, error fingerprint, actor và trạng thái xử lý. Bảng này không chứa request body/secret. Index queue theo `status, occurred_at` và fingerprint hỗ trợ triage/deduplicate. Chín read-path index bổ sung cho scope điều chuyển, chi tiết/ledger kho, transaction status, document, report job, notification job và active user. Bảy query quan trọng có `EXPLAIN QUERY PLAN` acceptance bắt buộc dùng đúng index. Backup database dùng online backup API; restore drill chạy `quick_check`, `foreign_key_check`, migration count và SHA-256 của toàn bộ manifest.

## 30. TASK 26 — UAT database clone

TASK 26 không thêm migration hoặc bảng production. Staging là SQLite online backup sang file mới; migration còn thiếu chỉ được áp trên clone. Manifest ngoài database ghi hash nguồn/đích, số migration, PX được chọn, kiểm tra toàn vẹn và trạng thái sign-off, tuyệt đối không ghi mật khẩu. Tài khoản nguồn được đổi định danh và vô hiệu hóa, session/security logs bị xóa, trường nhận diện/free-text bị redacted. Foreign key và ID nghiệp vụ vẫn giữ để kiểm thử quan hệ.
