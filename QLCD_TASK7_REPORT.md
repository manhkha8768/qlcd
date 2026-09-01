# TASK 7 — Technical Profile Report

## Phạm vi hoàn thành

- Hồ sơ kỹ thuật canonical theo `Device ID`, không tiếp tục lấy `thiet_bi_id` legacy làm identity chính.
- Định nghĩa thuộc tính động theo nhóm/model với kiểu `TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `ENUM`.
- Validation bắt buộc, enum, ngày, min/max và pattern; batch save có optimistic version.
- Lịch sử phiên bản append-only; trigger chặn sửa/xóa history.
- Backfill định nghĩa/giá trị kỹ thuật hiện có, giữ legacy mapping và không drop dữ liệu nguồn.
- API và màn hình hồ sơ gồm Tổng quan, Thông số, Tài sản, Cấu tạo, Tài liệu, Bảo trì, Kiểm định, Lịch sử.
- Permission riêng cho xem, sửa hồ sơ và quản trị định nghĩa; data scope theo đơn vị.

## Compatibility và giới hạn có chủ đích

- Cấu tạo, tài liệu, bảo trì và kiểm định đang compatibility-read qua legacy mapping. Chuẩn hóa cây cấu tạo thuộc TASK 8; document storage/version thuộc TASK 9.
- Migration backfill là idempotent tại thời điểm áp dụng. Ghi mới trực tiếp vào bảng legacy sau migration chưa tự dual-write sang canonical.
- TASK 7 không thay đổi stack, không xóa bảng cũ, không reset database và không triển khai TASK 8.

## Acceptance

Test riêng bao phủ backfill, các tab, typed/range validation, batch version, stale conflict, completeness, immutable history, definition version và data scope. Quality gate cuối cùng được ghi trong commit/report bàn giao.

## Next recommended task

**TASK 8 — Cây cấu tạo:** component tree canonical theo Device ID, cycle/concurrency guard, migration compatibility và integration với sửa chữa/vật tư.
