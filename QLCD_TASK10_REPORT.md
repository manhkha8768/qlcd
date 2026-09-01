# TASK 10 — Material Master Report

Hoàn thành Material ID/UOM canonical, mapping PART/WAREHOUSE/NCVT_LINE, optimistic version, RBAC, UI và duplicate-review workflow. Backfill không sửa bảng nguồn và không tự merge. Mapping nguồn bị chặn xóa; review xác nhận cùng vật tư bắt buộc canonical ID và lý do, còn giữ riêng không đổi master.

Giới hạn: UOM chưa có conversion; stock ledger vẫn legacy và thuộc TASK 11. Alias chưa nhận diện được dùng `OTHER` để review, không tự suy đoán.

**Next:** TASK 11 — Warehouse + Stock Ledger canonical.
