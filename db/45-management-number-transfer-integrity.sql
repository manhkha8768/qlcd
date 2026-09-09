-- Số quản lý là định danh duy nhất toàn Công ty; giữ nguyên dữ liệu cũ để đối soát.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS management_number_conflicts (
    normalized_number TEXT NOT NULL,
    thiet_bi_id INTEGER NOT NULL REFERENCES thiet_bi(id) ON DELETE RESTRICT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES nguoi_dung(id),
    resolution_note TEXT,
    PRIMARY KEY(normalized_number,thiet_bi_id)
);

INSERT OR IGNORE INTO management_number_conflicts(normalized_number,thiet_bi_id)
SELECT upper(trim(replace(replace(replace(replace(replace(kk.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-'))),kk.thiet_bi_id
FROM thiet_bi_kiem_ke kk
WHERE NULLIF(trim(kk.so_quan_ly),'') IS NOT NULL
  AND upper(trim(replace(replace(replace(replace(replace(kk.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-'))) IN (
    SELECT upper(trim(replace(replace(replace(replace(replace(x.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-')))
    FROM thiet_bi_kiem_ke x WHERE NULLIF(trim(x.so_quan_ly),'') IS NOT NULL
    GROUP BY 1 HAVING COUNT(*)>1
  );

CREATE TRIGGER IF NOT EXISTS trg_so_quan_ly_unique_insert
BEFORE INSERT ON thiet_bi_kiem_ke
WHEN NULLIF(trim(NEW.so_quan_ly),'') IS NOT NULL
 AND EXISTS(SELECT 1 FROM thiet_bi_kiem_ke x
   WHERE x.thiet_bi_id<>NEW.thiet_bi_id
     AND upper(trim(replace(replace(replace(replace(replace(x.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-')))
       = upper(trim(replace(replace(replace(replace(replace(NEW.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-'))))
BEGIN SELECT RAISE(ABORT,'SO_QUAN_LY_DUPLICATE'); END;

CREATE TRIGGER IF NOT EXISTS trg_so_quan_ly_unique_update
BEFORE UPDATE OF so_quan_ly ON thiet_bi_kiem_ke
WHEN NULLIF(trim(NEW.so_quan_ly),'') IS NOT NULL
 AND upper(trim(replace(replace(replace(replace(replace(NEW.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-')))
   <> COALESCE(upper(trim(replace(replace(replace(replace(replace(OLD.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-'))),'')
 AND EXISTS(SELECT 1 FROM thiet_bi_kiem_ke x
   WHERE x.thiet_bi_id<>NEW.thiet_bi_id
     AND upper(trim(replace(replace(replace(replace(replace(x.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-')))
       = upper(trim(replace(replace(replace(replace(replace(NEW.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-'))))
BEGIN SELECT RAISE(ABORT,'SO_QUAN_LY_DUPLICATE'); END;

CREATE INDEX IF NOT EXISTS idx_management_conflicts_open ON management_number_conflicts(resolved_at,normalized_number);

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('thietbi.management_number_conflicts','Đối soát Số quản lý trùng','Xem và xử lý danh sách Số quản lý trùng từ dữ liệu lịch sử','thietbi'),
('asset_transfer.dual_confirm','Xác nhận hai phía ngoại lệ','Cho phép một người xác nhận cả bên giao và bên nhận','asset_transfer');

INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT v.id,q.ma,NULL FROM vai_tro v CROSS JOIN ma_quyen q
WHERE v.ma='admin' AND q.ma IN ('thietbi.management_number_conflicts','asset_transfer.dual_confirm');
