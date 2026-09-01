# TASK 9 — Canonical Document Management Report

## Phạm vi hoàn thành

- Document metadata canonical, immutable version và entity links dùng chung.
- Version lưu original filename, provider, object key, SHA-256, MIME, size, uploader và change note.
- Upload canonical sinh object key không dựa vào tên file người dùng; giới hạn loại và dung lượng.
- Optimistic version khi thêm phiên bản, giữ mọi phiên bản cũ để truy vết/tải lại.
- Download ACL được tính lại từ entity và data scope ở từng request; download ghi access log.
- Archive mềm metadata/link, không xóa file vật lý hay version.
- Backfill tài liệu kỹ thuật, chứng từ Asset Transaction và giao dịch legacy mà không di chuyển file.
- Tab Tài liệu của Hồ sơ kỹ thuật dùng API canonical để upload/list/download.
- Endpoint tải tài liệu kỹ thuật legacy được bổ sung data-scope check.

## Storage decision

Adapter hiện dùng provider `LOCAL` cho môi trường hiện tại và chỉ resolve object key bên trong `uploads/documents`. `LOCAL_LEGACY` chỉ đọc file nằm dưới vùng `uploads` đã kiểm soát. Provider `EXTERNAL` là contract dành cho object storage; hệ thống trả lỗi rõ ràng nếu chưa cấu hình, không giả lập signed URL hoặc tuyên bố đã triển khai cloud storage.

## Compatibility và giới hạn có chủ đích

- File legacy được giữ tại đường dẫn cũ; hash của metadata backfill để trống vì SQL migration không đọc nội dung file. Upload/version canonical luôn có SHA-256.
- Chưa di chuyển blob sang R2/S3 do chưa có môi trường, bucket, secret và retention policy được phê duyệt.
- Các UI legacy vẫn hoạt động; Hồ sơ kỹ thuật canonical dùng document service mới.
- Không xóa vật lý khi archive để bảo toàn dữ liệu và phục vụ retention/restore.

## Next recommended task

**TASK 10 — Material Master:** Material ID/UOM canonical, mapping từ phụ tùng/NCVT/kho legacy và duplicate-review workflow không tự merge.
