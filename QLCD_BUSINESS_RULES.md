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

## 7. Cross-cutting

31. Mọi approval, reversal, override, upload/delete file và thay đổi quyền phải ghi audit actor/time/IP/before/after/reason.
32. API mutation có validation, transaction và idempotency phù hợp; lỗi giữa chừng phải rollback toàn bộ aggregate.
33. AI/OCR chỉ đề xuất; user kiểm tra, submit và approval trước khi dữ liệu thành chính thức.
34. Dev/staging/prod tách database/storage/secrets; không dùng dữ liệu dev làm production.

## 8. Gap so với baseline

Baseline đáp ứng một phần rules 1, 5, 9-16, 23 và 28. Các rule về tách asset/device, ledger chuẩn, multi-unit scope, object storage/version, reservation, received/discrepancy và carry-forward chưa hoàn chỉnh. Không tuyên bố rule “đạt” chỉ vì có bảng hoặc màn hình; cần acceptance test end-to-end.

TASK 6 triển khai rules 10–12 trên luồng canonical: snapshot lấy từ Asset Ledger và bất biến, kết quả thực tế lưu riêng, QR chỉ nhận diện Asset, còn chênh lệch phải review/approve trước khi tạo ledger adjustment.

TASK 7 triển khai rule 13 trên luồng canonical: định nghĩa thuộc tính áp dụng theo nhóm/model, giá trị được kiểm tra đúng kiểu và ràng buộc trước khi lưu, batch ghi dùng optimistic version, mỗi phiên bản tạo history bất biến. Bảng kỹ thuật legacy được giữ nguyên và chỉ dùng làm nguồn backfill/compatibility read.

TASK 8 triển khai rule 14 trên luồng canonical: mọi node thuộc đúng một Device, parent phải cùng Device, recursive cycle check chặn chuyển node vào hậu duệ. Mutation yêu cầu version hiện hành; replace giữ node cũ, tạo node mới, chuyển node con và ghi event bất biến trong một transaction. Phiếu sửa chữa và vật tư sử dụng có liên kết trực tiếp tới component canonical.

TASK 9 triển khai rules 15–16 trên luồng canonical: version file đã tạo không sửa/xóa, version mới sinh object key và SHA-256 mới; archive chỉ đổi metadata/link, không xóa file vật lý. Quyền xem/tải được tính lại từ entity link và data scope tại từng request. Backfill chỉ tạo metadata trỏ tới file legacy trong vùng upload cho phép, không di chuyển hoặc đổi nội dung file nguồn.

TASK 10 triển khai rules 17 và 22 ở tầng master: mỗi nguồn giữ mapping bất biến tới Material ID; alias ĐVT chuẩn hóa về UOM canonical. Nghi trùng chỉ vào hàng đợi review, không auto-merge; xác nhận cùng vật tư bắt buộc chọn master giữ lại và ghi lý do.

TASK 11 triển khai rules 18, 19 và 21 trên Stock Ledger canonical: `ON_HAND`, `RESERVED`, `AVAILABLE` và `INCOMING` chỉ được chiếu từ entry đã post; incoming không tính vào available. Post có idempotency key, ledger không sửa/xóa, sai sót dùng reversal tham chiếu entry gốc. Constraint projection và transaction rollback chặn tồn âm, over-reserve, issue vượt available hoặc receive vượt incoming; dữ liệu `ton_kho` legacy không bị ghi ngược.

TASK 12 triển khai rule 20: dispatch loại số lượng khỏi ON_HAND nguồn trước khi ghi INCOMING ở đích trong cùng transaction, nên hàng in-transit không hiện hữu đồng thời ở hai kho. Chỉ receiver transition mới chuyển incoming thành on-hand; hoàn trả chỉ hợp lệ khi còn DISPATCHED, bắt buộc lý do và phục hồi kho nguồn nguyên tử. Retry dispatch/receive/return trả kết quả cũ, không nhân ledger entry.
