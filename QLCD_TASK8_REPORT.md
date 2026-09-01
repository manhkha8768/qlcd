# TASK 8 — Canonical Component Tree Report

## Phạm vi hoàn thành

- Cây cấu tạo canonical theo `Device ID`, `parent_id` không giới hạn số cấp.
- Backfill node và quan hệ cha–con từ `cum_thiet_bi`, giữ `legacy_component_id` để truy vết.
- CRUD, move, replace và soft removal có optimistic version và data scope theo đơn vị.
- Chặn self-parent, cross-device parent và cycle bằng recursive descendants.
- Replace nguyên tử: giữ node cũ, tạo node mới và chuyển toàn bộ node con không làm đứt cây.
- Event history append-only; trigger database chặn sửa và xóa.
- Liên kết canonical tới phiếu sửa chữa, vật tư đã sử dụng và danh mục phụ tùng tương thích.
- Form lập phiếu/vật tư hiện hữu nhận thêm `component_id`, đồng thời giữ compatibility mapping khi node có nguồn legacy.
- Tab Cấu tạo trong Hồ sơ kỹ thuật đọc và thao tác cây canonical.

## Compatibility và giới hạn có chủ đích

- Không xóa, reset hoặc rewrite `cum_thiet_bi`, `lich_su_cum`, phiếu sửa chữa hay vật tư legacy.
- Backfill là idempotent khi migration chạy. Mutation trực tiếp qua API cây legacy sau thời điểm migration chưa tự dual-write sang canonical.
- Material Master và stock ledger canonical thuộc TASK 10–11; TASK 8 chỉ nối dòng vật tư sửa chữa hiện có tới component.
- Document storage/versioning không thuộc TASK 8.

## Acceptance

Test riêng bao phủ backfill, parent, tree read, create, cycle, optimistic version, replace, child continuity, history retention, repair/material integration, immutable events và unit scope.

## Next recommended task

**TASK 9 — Document/file management:** canonical document metadata/version/hash/entity links, download ACL và lộ trình object storage an toàn cho file legacy.
