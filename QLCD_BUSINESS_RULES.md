# QLCD Business Rules

## 1. Organization and identity

1. Phân xưởng, kho, phòng ban và công trình là dữ liệu động; seed ban đầu không được hard-code vào logic.
2. Một user có thể phụ trách nhiều đơn vị trong khoảng thời gian xác định.
3. Mọi truy cập phải thỏa cả permission và data scope; client không quyết định scope.

## 2. Asset and device

4. Mỗi tài sản có một `ASSET_ID` duy nhất; mỗi thiết bị kỹ thuật có một `DEVICE_ID` duy nhất.
5. Điều chuyển không delete/create lại master và không đổi ID vòng đời.
6. Asset (kế toán/TSCĐ/CCDC) và device (kỹ thuật) là hai khái niệm có quan hệ, không phải một record bắt buộc 1:1.
7. Tăng, giảm, điều chuyển, trả, thanh lý, điều chỉnh đều tạo transaction; không sửa balance trực tiếp.
8. Giao nhận hai đầu: bên giao xác nhận, bên nhận xác nhận, người có quyền duyệt. Tổng tài sản toàn Công ty không đổi khi điều chuyển nội bộ.
9. Giao dịch đã post không sửa/xóa; sai sót dùng reversal/adjustment có tham chiếu và audit.

## 3. Inventory and reconciliation

10. Kỳ kiểm kê giữ snapshot số sổ sách tại thời điểm mở; kết quả thực tế không được làm đổi snapshot.
11. Chênh lệch chỉ tạo adjustment sau review/approval, không tự sửa master.
12. QR xác định entity; quét QR không tự xác nhận tình trạng hoặc vị trí.

## 4. Technical profile and documents

13. Thuộc tính kỹ thuật là định nghĩa động theo nhóm/model; không thêm cột/hard-code cho mỗi loại máy.
14. Cây cấu tạo dùng `parent_id`, không giới hạn cấp và không được tạo cycle.
15. File gốc bất biến; version mới tạo object/version mới, lưu hash, MIME, size, uploader và entity link.
16. Quyền download được kiểm tra tại thời điểm cấp signed URL/download, không chỉ ở UI.

## 5. Materials and warehouse

17. Một vật tư chuẩn chỉ có một Material ID; nghi trùng được cảnh báo nhưng không tự merge.
18. `ON_HAND = tổng ledger đã POSTED`; `AVAILABLE = ON_HAND - RESERVED`; `INCOMING` không được tính vào available.
19. Mọi nhập/xuất/chuyển/trả/điều chỉnh/scrap/reversal là ledger entry; cấm sửa trực tiếp tồn kho.
20. Chuyển kho có trạng thái in-transit; cùng một số lượng không được hiện hữu ở cả hai kho.
21. Không cho tồn âm, over-reserve hoặc issue vượt available trừ workflow override riêng có lý do và phê duyệt.
22. Không cộng số lượng khác đơn vị tính; conversion chỉ dùng bảng quy đổi đã phê duyệt.

## 6. NCVT

23. Kỳ quý là dữ liệu động với state machine; period `LOCKED` không sửa trực tiếp.
24. PX lập draft, submit; Chủ nhiệm review theo assignment; Phòng CĐVT tổng hợp/approve.
25. Dòng NCVT liên kết Material Master; import không tự tạo master mới nếu chưa được xác nhận.
26. Approved quantity bất biến; thay đổi dùng quyết định điều chỉnh có audit.
27. Reservation không giảm on-hand nhưng giảm available; phải chống race/over-reserve.
28. Một nhu cầu được cấp nhiều đợt; chỉ issue `POSTED` mới giảm kho.
29. `issued` khác `received`; thiếu/hỏng/sai chủng loại tạo discrepancy, không tự coi nhận đủ.
30. Carry-forward liên kết dòng nguồn và chỉ chuyển phần còn hợp lệ, không nhân đôi nhu cầu.

## 7. Technical operations

31. Repair, maintenance và inspection dùng work order có state machine; work order terminal và lifecycle event không được sửa/xóa.
32. Component gắn công việc phải thuộc đúng Device; kết quả hoàn thành mới cập nhật tình trạng Device/Component.
33. Vật tư sửa chữa/bảo dưỡng chỉ được xuất khi công việc đang thực hiện, theo Material ID/UOM canonical; post và reversal phải nguyên tử với Stock Ledger.
34. Inspection phải lưu PASS/CONDITIONAL/FAIL và hạn kế tiếp khi có; FAIL đưa thiết bị về trạng thái không an toàn để tiếp tục vận hành.

## 8. Cross-cutting

35. Mọi approval, reversal, override, upload/delete file và thay đổi quyền phải ghi audit actor/time/IP/before/after/reason.
36. API mutation có validation, transaction và idempotency phù hợp; lỗi giữa chừng phải rollback toàn bộ aggregate.
37. AI/OCR chỉ đề xuất; user kiểm tra, submit và approval trước khi dữ liệu thành chính thức.
38. Dev/staging/prod tách database/storage/secrets; không dùng dữ liệu dev làm production.

## 9. Notifications and data quality

39. Mỗi cảnh báo có rule, fingerprint, mức độ, owner và trạng thái triage; retry job không được tạo case kép.
40. Case đi qua OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED; bỏ qua hoặc đổi rule bắt buộc lý do và audit.
41. Quá SLA phải escalation có cấp độ và delivery cho người chịu trách nhiệm/cấp quản trị; đã đọc không đồng nghĩa đã xử lý.
42. Data-quality engine chỉ phát hiện và theo dõi; không tự merge Material, sửa file, duyệt NCVT hay update work order nguồn.
43. Khi nguồn được sửa, case đang mở tự RESOLVED; nếu cùng vấn đề xuất hiện lại sau đó, case RESOLVED được REOPENED và giữ toàn bộ lịch sử.

## 10. Reporting and export

44. Màn hình, Excel, PDF và bản in của cùng một báo cáo phải dùng chung query, filter, sort và data scope canonical.
45. Scope được áp dụng tại server trước phân trang/tổng số dòng; tham số đơn vị không được mở rộng quyền của người gọi.
46. Sort chỉ nhận cột whitelist; page size và số dòng export có giới hạn để tránh query/file không kiểm soát.
47. Mỗi lần export phải ghi actor, format, filter/scope, số dòng, thời gian và SHA-256; audit terminal không được sửa/xóa.
48. Số lượng không được cộng xuyên UOM; số liệu ledger/stock/NCVT phải lấy từ projection canonical và không tự sửa nguồn khi xuất báo cáo.

## 8. Gap so với baseline

Baseline đáp ứng một phần rules 1, 5, 9-16, 23 và 28. Các rule về tách asset/device, ledger chuẩn, multi-unit scope, object storage/version, reservation, received/discrepancy và carry-forward chưa hoàn chỉnh. Không tuyên bố rule “đạt” chỉ vì có bảng hoặc màn hình; cần acceptance test end-to-end.

TASK 6 triển khai rules 10–12 trên luồng canonical: snapshot lấy từ Asset Ledger và bất biến, kết quả thực tế lưu riêng, QR chỉ nhận diện Asset, còn chênh lệch phải review/approve trước khi tạo ledger adjustment.

TASK 7 triển khai rule 13 trên luồng canonical: định nghĩa thuộc tính áp dụng theo nhóm/model, giá trị được kiểm tra đúng kiểu và ràng buộc trước khi lưu, batch ghi dùng optimistic version, mỗi phiên bản tạo history bất biến. Bảng kỹ thuật legacy được giữ nguyên và chỉ dùng làm nguồn backfill/compatibility read.

TASK 8 triển khai rule 14 trên luồng canonical: mọi node thuộc đúng một Device, parent phải cùng Device, recursive cycle check chặn chuyển node vào hậu duệ. Mutation yêu cầu version hiện hành; replace giữ node cũ, tạo node mới, chuyển node con và ghi event bất biến trong một transaction. Phiếu sửa chữa và vật tư sử dụng có liên kết trực tiếp tới component canonical.

TASK 9 triển khai rules 15–16 trên luồng canonical: version file đã tạo không sửa/xóa, version mới sinh object key và SHA-256 mới; archive chỉ đổi metadata/link, không xóa file vật lý. Quyền xem/tải được tính lại từ entity link và data scope tại từng request. Backfill chỉ tạo metadata trỏ tới file legacy trong vùng upload cho phép, không di chuyển hoặc đổi nội dung file nguồn.

TASK 10 triển khai rules 17 và 22 ở tầng master: mỗi nguồn giữ mapping bất biến tới Material ID; alias ĐVT chuẩn hóa về UOM canonical. Nghi trùng chỉ vào hàng đợi review, không auto-merge; xác nhận cùng vật tư bắt buộc chọn master giữ lại và ghi lý do.

TASK 11 triển khai rules 18, 19 và 21 trên Stock Ledger canonical: `ON_HAND`, `RESERVED`, `AVAILABLE` và `INCOMING` chỉ được chiếu từ entry đã post; incoming không tính vào available. Post có idempotency key, ledger không sửa/xóa, sai sót dùng reversal tham chiếu entry gốc. Constraint projection và transaction rollback chặn tồn âm, over-reserve, issue vượt available hoặc receive vượt incoming; dữ liệu `ton_kho` legacy không bị ghi ngược.

TASK 12 triển khai rule 20: dispatch loại số lượng khỏi ON_HAND nguồn trước khi ghi INCOMING ở đích trong cùng transaction, nên hàng in-transit không hiện hữu đồng thời ở hai kho. Chỉ receiver transition mới chuyển incoming thành on-hand; hoàn trả chỉ hợp lệ khi còn DISPATCHED, bắt buộc lý do và phục hồi kho nguồn nguyên tử. Retry dispatch/receive/return trả kết quả cũ, không nhân ledger entry.

TASK 13 triển khai rules 23 và 25 cho giai đoạn lập nhu cầu: period dùng state machine DRAFT/OPEN/LOCKED/CANCELLED và optimistic version; period LOCKED không nhận mutation. Mỗi PX có một submission, chỉ DRAFT trong period OPEN được sửa. Mỗi dòng bắt buộc Material ID/UOM canonical; submit nguyên tử khóa draft và ghi event bất biến. Import/backfill không tự tạo Material mới và không tự coi dữ liệu legacy là đã submit.

TASK 14 triển khai rules 24 và 26 ở tầng review: reviewer phải được phân công ACTIVE đúng period/PX mới được quyết định. RETURN/REJECT/APPROVE bắt buộc lý do và tạo decision bất biến theo submission version cùng snapshot dòng. RETURN cho phép PX phản hồi, mở DRAFT, sửa và resubmit; quyết định vòng cũ vẫn giữ nguyên. APPROVED quantity không sửa trực tiếp; period chỉ khóa khi mọi submission đã APPROVED, REJECTED hoặc CANCELLED.

TASK 15 triển khai tổng hợp Công ty chỉ từ submission đang ở trạng thái APPROVED. Tổng được tính động theo period + Material ID + UOM canonical; DRAFT, SUBMITTED, RETURNED, REJECTED và kỳ khác không được tham gia. Drill-down theo PX dùng cùng tập nguồn để bảo toàn tổng. Nguồn cung là master riêng, mapping theo Material có một nguồn ưu tiên ACTIVE tối đa; không có mapping được hiển thị là thiếu dữ liệu, hệ thống không tự suy đoán hoặc tự chọn nhà cung cấp.

TASK 16 triển khai rule 27: chỉ dòng của submission APPROVED được reserve; tổng đã reserve chưa release không vượt approved quantity và từng reserve không vượt AVAILABLE của đúng kho/Material/UOM. Reserve không giảm ON_HAND, chỉ tăng RESERVED và giảm AVAILABLE. Release/cancel không tăng ON_HAND, chỉ hoàn nguyên RESERVED. Mọi thao tác dùng idempotency key, transaction nguyên tử và optimistic version; retry không nhân ledger/event, lỗi concurrency rollback toàn bộ.

TASK 17 triển khai rule 28: mỗi dòng cấp phát phải consume reservation canonical cùng Material/kho/UOM. Phiếu được lập, submit, quyết định rồi mới post; chỉ POSTED mới giảm ON_HAND. Khi issue reservation, ON_HAND và RESERVED cùng giảm nên AVAILABLE không bị giảm lần hai. Có thể cấp nhiều đợt nhưng tổng POSTED không vượt phần approved đã reserve. Quyết định và timeline bất biến; retry post không nhân ledger. Reversal là giao dịch đối ứng và phục hồi reservation, không sửa entry cũ.

TASK 18 triển khai rule 29: issued không tự trở thành received. PX xác nhận từng phần bằng bốn số riêng: nhận đạt, hỏng, sai chủng loại và từ chối; tổng các lần xác nhận không vượt issue POSTED. Receipt terminal bất biến và không tự sửa kho, reservation hoặc approved demand. Khi đã có xác nhận, cấm reversal issue trực tiếp; discrepancy/refusal phải đi qua luồng xử lý có chứng từ thay vì giả định hàng đã quay lại kho.

TASK 19 triển khai rule 30: chỉ kỳ nguồn LOCKED được carry sang đúng kỳ quý kế tiếp đang OPEN. Số hợp lệ từng dòng bằng `APPROVED - POSTED issued - active reserved - already carried`; mọi số âm hoặc vượt phần còn lại đều bị từ chối và rollback cả batch. Carry tạo dòng DRAFT mới theo cùng Material ID/UOM, giữ lineage và snapshot nguồn, không sửa dòng đã duyệt. Idempotency key gắn với toàn bộ payload và lý do; retry không nhân dòng. Period, submission và line thuộc kỳ LOCKED, cùng batch/line/event đã post, đều không được update/delete ở tầng database.

TASK 20 triển khai quy tắc dashboard read-only: dashboard chỉ đọc projection canonical và mọi đại lượng số lượng phải giữ UOM trong khóa nhóm. Không được cộng EA với M/KG/SET thành một KPI chung. KPI, alert count và danh sách chi tiết phải được tính lại trên cùng bộ lọc period/PX/Material/status/search/alert và cùng data scope server-side. `received` trên dashboard là accepted receipt; damaged, wrong và refused nằm ở discrepancy riêng. Alert UNALLOCATED, PENDING_RECEIPT, DISCREPANCY và CARRY_AVAILABLE chỉ phản ánh projection, không tự post, approve, reserve, issue, receipt hay carry.

TASK 21 triển khai rules 31–34: work order canonical dùng DRAFT → SUBMITTED → APPROVED → IN_PROGRESS → COMPLETED cùng nhánh RETURNED/REJECTED/CANCELLED, optimistic version và event append-only. Material Issue chỉ post cho REPAIR/MAINTENANCE đang thực hiện, bắt buộc Component cùng Device và kiểm tra AVAILABLE; retry không nhân stock, reversal tạo entry đối ứng. Complete mới đồng bộ kết quả sang Device/Component; inspection FAIL đánh dấu thiết bị hỏng/đang sửa. Dữ liệu legacy chỉ backfill, không bị rewrite.

TASK 22 triển khai rules 39–43: năm rule chuẩn được đánh giá bằng job có journal; fingerprint unique ngăn sinh case/delivery kép. Owner lấy từ reviewer NCVT, người PX trong scope hoặc role fallback. Acknowledge/start/resolve/reassign/escalate/dismiss dùng version và event bất biến. Engine auto-resolve/reopen theo nguồn nhưng tuyệt đối không sửa aggregate nghiệp vụ để làm mất cảnh báo.

TASK 23 triển khai rules 44–48: registry query duy nhất phục vụ screen/XLSX/PDF/PRINT, áp scope trước filter/paging và chỉ cho sort theo whitelist. Export quá giới hạn bị từ chối và ghi FAILED audit; export thành công lưu hash, actor, scope/filter và row count bất biến. Các báo cáo stock/NCVT luôn hiển thị UOM trong khóa dữ liệu; Report Center không update ledger hoặc aggregate nguồn.
## TASK 25 — Quy tắc vận hành production

- Liveness chỉ chứng minh tiến trình còn phản hồi; readiness chỉ trả 200 khi database, migration, upload và backup storage sẵn sàng.
- Production không khởi động nếu thiếu secret, database volume, upload volume, backup volume hoặc cờ môi trường production/internet.
- Backup chỉ đạt khi manifest SHA-256, SQLite `quick_check`, foreign-key check và số migration đều hợp lệ; restore drill không được ghi đè database đang chạy.
- Load gate mặc định không chấp nhận HTTP error và yêu cầu p95 không vượt ngưỡng cấu hình; kết quả phải ghi rõ concurrency, RPS, p50/p95/p99.
- SIGTERM ngừng nhận kết nối mới, dừng scheduler, chờ request hiện tại và checkpoint WAL trước khi đóng database.
- Error tracking không lưu request body, cookie, password hoặc secret; resolve bắt buộc actor và ghi chú.
