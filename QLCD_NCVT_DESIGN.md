# QLCD NCVT Design

## 1. Baseline assessment

Legacy đã có kỳ quý, import Excel/staging, dòng nhu cầu, cấp phát nhiều lần, chống cấp vượt cơ bản, hủy cấp và test module. Trạng thái kỳ hiện là `nhap/da_nhap/dang_ap_dung/da_dong/huy`; chưa biểu diễn đầy đủ draft theo PX, submit/review/return/approve, reservation, issued-vs-received, discrepancy và carry-forward. Material được nhận diện chủ yếu bằng mã/text, chưa bắt buộc liên kết Material Master.

Kết luận sau Task 19: Task 13–19 đã có luồng canonical và acceptance test; Task 20 dashboard chưa hoàn chỉnh. Cấp phát legacy vẫn được giữ để tương thích nhưng không bị canonical posting/receipt/carry-forward ghi ngược.

Reservation canonical chỉ được tạo từ dòng APPROVED, có thể phân bổ nhiều kho nhưng tổng không vượt nhu cầu. Mỗi allocation post RESERVED vào Stock Ledger nguyên tử; release/cancel hoàn nguyên bằng entry mới và giữ audit bất biến. Reservation không đồng nghĩa đã xuất hoặc đã nhận.

Phiếu cấp phát canonical có quyết định versioned và chỉ POSTED mới tính issued. Mỗi dòng consume reservation tại đúng kho; cấp nhiều đợt được phép nhưng recheck khi post chặn hai phiếu cùng dùng một phần giữ chỗ. Reversal loại phiếu khỏi issued và phục hồi Stock Ledger/reservation. Issued vẫn khác received; TASK 17 không tự xác nhận người nhận hoặc chênh lệch giao nhận.

Receipt canonical do PX xác nhận theo issue line và có thể chia nhiều đợt. Mỗi đợt phân loại số nhận đạt, hỏng, sai chủng loại hoặc từ chối; hệ thống không gộp chúng thành received. Confirm dùng optimistic version và recheck pending để chống ghi vượt. Receipt không post kho; xử lý vật tư trả lại hoặc bù thiếu là workflow sau, không được suy diễn từ trạng thái REFUSED/DISCREPANCY.

## 2. Aggregate target

```text
ncvt_periods
  -> ncvt_submissions (một PX/kỳ, versioned)
      -> ncvt_lines -> materials
      -> submission_reviews / approvals
      -> allocations -> material_reservations
      -> issue_lines -> material_ledger
      -> receipt_confirmations / discrepancies
      -> carry_forward_links
```

## 3. State machines

Period: `DRAFT -> OPEN -> REVIEWING -> APPROVED -> FULFILLING -> CLOSING -> LOCKED`, kèm `CANCELLED` có kiểm soát.

Submission: `DRAFT -> SUBMITTED -> IN_REVIEW -> RETURN_FOR_EDIT | REJECTED | APPROVED`. Mỗi lần submit tạo version/audit; approved quantity không update trực tiếp.

Issue: `DRAFT -> SUBMITTED -> APPROVED -> POSTED -> PARTIALLY_RECEIVED | RECEIVED | DISPUTED`; cancellation trước POSTED, reversal sau POSTED.

## 4. Business calculations

Theo material và PX: requested, approved, reserved, issued, received, discrepancy, remaining-to-issue, available, incoming và shortage. Dashboard không cộng khác UOM. Drill-down từ toàn Công ty tới từng PX, kỳ, submission, issue và receipt.

`remaining_to_issue = approved - valid_posted_issued`; `remaining_to_receive = issued - accepted_received`. Cancel/reversal phải cập nhật qua transaction links, không sửa tổng.

## 5. Import

File gốc bất biến. Pipeline: upload -> parse staging -> map columns/material candidates -> validate -> user review -> save draft -> submit. Dòng chưa map Material Master không được approve. Import lặp dùng file hash + business key để cảnh báo/idempotency.

## 6. Carry forward

Khi period đã LOCKED, carry chỉ được post sang đúng quý kế tiếp đang OPEN. Eligible theo dòng là `APPROVED - POSTED issued - active reserved - already carried`; projection được đọc lại bên trong transaction ngay trước khi tạo target line. Batch tạo hoặc dùng submission DRAFT theo PX, giữ cùng Material ID/UOM, `source_line_id -> target_line_id`, snapshot định lượng, actor, reason và event POST. Idempotency payload chặn retry sinh kép. Trigger database chặn mutation kỳ nguồn và niêm phong batch sau POST; adjustment/reversal thuộc ledger riêng, không mở khóa approved demand.

## 7. Acceptance

Multi-unit scope cho Chủ nhiệm; return-for-edit tạo version; approve bất biến; concurrent reserve không vượt available; nhiều issue không vượt approved; issued 10/received 9 tạo discrepancy 1; carry-forward chạy lặp không nhân đôi; lock ngăn mọi mutation trừ adjustment/reversal có quyền.

## 8. Company aggregation và supply source

Tổng hợp Công ty là projection đọc, không phải số tổng nhập tay: chỉ lấy submission APPROVED và nhóm đúng `period_id + material_id + uom_code`. Drill-down theo PX phải dùng cùng predicate và tổng chi tiết bằng tổng Công ty. Nguồn cung chuẩn được quản lý độc lập với submission; một Material có thể có nhiều nguồn nhưng chỉ một nguồn preferred ACTIVE. Material chưa mapping vẫn xuất hiện trong tổng hợp với cảnh báo để người dùng xử lý, không bị loại khỏi nhu cầu đã duyệt.
