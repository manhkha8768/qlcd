/**
 * API Kiểm kê thiết bị (v19)
 * Quản lý đợt kiểm kê, giao nhiệm vụ, ghi nhận chi tiết
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { coMaQuyenNay } = require('../middleware/quyen');

/**
 * GET /api/kiemke
 * Liệt kê các đợt kiểm kê
 * Query: trang_thai, nam, ky
 */
router.get('/', coMaQuyenNay('kiemke.xem'), (req, res) => {
    try {
        let sql = `
            SELECT d.*, COUNT(DISTINCT n.id) as so_nhiem_vu,
                   SUM(n.so_thiet_bi_kiem_ke) as tong_kiem_ke
            FROM dot_kiem_ke d
            LEFT JOIN nhiem_vu_kiem_ke n ON d.id = n.dot_kiem_ke_id
            WHERE 1=1
        `;
        const params = [];

        if (req.query.trang_thai) {
            sql += ` AND d.trang_thai = ?`;
            params.push(req.query.trang_thai);
        }
        if (req.query.nam) {
            sql += ` AND d.nam = ?`;
            params.push(req.query.nam);
        }
        if (req.query.ky) {
            sql += ` AND d.ky = ?`;
            params.push(req.query.ky);
        }

        sql += ` GROUP BY d.id ORDER BY d.created_at DESC`;

        const data = db.prepare(sql).all(...params);
        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/kiemke
 * Tạo đợt kiểm kê mới
 */
router.post('/', coMaQuyenNay('kiemke.tao'), (req, res) => {
    try {
        const { ma, ten, so_hieu_kiemke, nam, ky, ngay_bat_dau, mo_ta } = req.body;
        if (!ma || !ten || !ngay_bat_dau) {
            return res.status(400).json({ ok: false, loi: 'Thiếu thông tin bắt buộc' });
        }

        const stmt = db.prepare(`
            INSERT INTO dot_kiem_ke
            (ma, ten, so_hieu_kiemke, nam, ky, ngay_bat_dau, mo_ta, nguoi_tao_id, trang_thai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dang_thuc_hien')
        `);

        const result = stmt.run(
            ma, ten, so_hieu_kiemke || null, nam || new Date().getFullYear(),
            ky || null, ngay_bat_dau, mo_ta || null, req.session.nguoi_dung_id
        );

        // Ghi audit
        db.prepare(`
            INSERT INTO lich_su_kiem_ke
            (dot_kiem_ke_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'tao', ?, ?, ?)
        `).run(
            result.lastInsertRowid,
            JSON.stringify({ ma, ten, nam, ky }),
            req.session.nguoi_dung_id,
            req.ip
        );

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(400).json({ ok: false, loi: 'Mã đợt kiểm kê đã tồn tại' });
        }
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/kiemke/:id
 * Chi tiết đợt kiểm kê
 */
router.get('/:id', coMaQuyenNay('kiemke.xem'), (req, res) => {
    try {
        const dot = db.prepare(`
            SELECT d.*, u.ho_ten as nguoi_tao
            FROM dot_kiem_ke d
            LEFT JOIN nguoi_dung u ON d.nguoi_tao_id = u.id
            WHERE d.id = ?
        `).get(req.params.id);

        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt kiểm kê' });
        }

        // Lấy danh sách nhiệm vụ
        dot.nhiem_vu_list = db.prepare(`
            SELECT n.*, p.ten as phan_xuong_ten, u.ho_ten as nguoi_phu_trach
            FROM nhiem_vu_kiem_ke n
            LEFT JOIN phan_xuong p ON n.phan_xuong_id = p.id
            LEFT JOIN nguoi_dung u ON n.nguoi_phu_trach_id = u.id
            WHERE n.dot_kiem_ke_id = ?
            ORDER BY p.ten
        `).all(req.params.id);

        // Thống kê
        const stats = db.prepare(`
            SELECT
                COUNT(DISTINCT phan_xuong_id) as so_phong_ban,
                SUM(so_thiet_bi_du_kien) as tong_du_kien,
                SUM(so_thiet_bi_kiem_ke) as tong_kiem_ke
            FROM nhiem_vu_kiem_ke
            WHERE dot_kiem_ke_id = ?
        `).get(req.params.id);
        dot.thong_ke = stats;

        res.json({ ok: true, data: dot });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * PUT /api/kiemke/:id
 * Cập nhật đợt kiểm kê
 */
router.put('/:id', coMaQuyenNay('kiemke.sua'), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_kiem_ke WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt kiểm kê' });
        }

        const { ten, mo_ta, trang_thai, ngay_ket_thuc } = req.body;
        const updates = {};

        if (ten !== undefined) {
            db.prepare('UPDATE dot_kiem_ke SET ten = ? WHERE id = ?').run(ten, req.params.id);
            updates.ten = { cu: dot.ten, moi: ten };
        }
        if (trang_thai !== undefined) {
            db.prepare('UPDATE dot_kiem_ke SET trang_thai = ? WHERE id = ?').run(trang_thai, req.params.id);
            updates.trang_thai = { cu: dot.trang_thai, moi: trang_thai };
        }
        if (ngay_ket_thuc !== undefined) {
            db.prepare('UPDATE dot_kiem_ke SET ngay_ket_thuc = ? WHERE id = ?').run(ngay_ket_thuc, req.params.id);
        }
        if (mo_ta !== undefined) {
            db.prepare('UPDATE dot_kiem_ke SET mo_ta = ? WHERE id = ?').run(mo_ta, req.params.id);
        }

        if (Object.keys(updates).length > 0) {
            db.prepare(`
                INSERT INTO lich_su_kiem_ke
                (dot_kiem_ke_id, hanh_dong, chi_tiet_cu, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
                VALUES (?, 'sua', ?, ?, ?, ?)
            `).run(
                req.params.id,
                JSON.stringify(updates.cu || {}),
                JSON.stringify(updates.moi || {}),
                req.session.nguoi_dung_id,
                req.ip
            );
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/kiemke/:id/tao-snapshot
 * Tạo snapshot trước kiểm kê
 */
router.post('/:id/tao-snapshot', coMaQuyenNay('kiemke.tao'), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_kiem_ke WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt kiểm kê' });
        }

        // Lấy tất cả thiết bị còn sử dụng (trừ thiết bị đã thanh lý)
        const thiet_bi_list = db.prepare(`
            SELECT id, ma_tb, ten, trang_thai, vi_tri_id, so_seri, nam_sx, nguyen_gia
            FROM thiet_bi
            WHERE trang_thai != 'da_thanh_ly'
        `).all();

        let count = 0;
        const insertStmt = db.prepare(`
            INSERT INTO snapshot_truoc_kiem_ke
            (dot_kiem_ke_id, thiet_bi_id, trang_thai, vi_tri_phieu, so_seri, nam_phat_hanh, gia_tri_sach)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const tb of thiet_bi_list) {
            try {
                insertStmt.run(
                    req.params.id, tb.id, tb.trang_thai, tb.vi_tri_id || null,
                    tb.so_seri || null, tb.nam_sx || null, tb.nguyen_gia || null
                );
                count++;
            } catch (e) {
                // Skip if already exists
            }
        }

        db.prepare(`
            INSERT INTO lich_su_kiem_ke
            (dot_kiem_ke_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'tao_snapshot', ?, ?, ?)
        `).run(
            req.params.id,
            JSON.stringify({ so_thiet_bi: count }),
            req.session.nguoi_dung_id,
            req.ip
        );

        res.json({ ok: true, so_thiet_bi: count });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/kiemke/:id/giao-nhiem-vu
 * Giao nhiệm vụ kiểm kê cho phân xưởng
 */
router.post('/:id/giao-nhiem-vu', coMaQuyenNay('kiemke.giao-nhiem-vu'), (req, res) => {
    try {
        const { phan_xuong_id, nguoi_phu_trach_id } = req.body;
        if (!phan_xuong_id) {
            return res.status(400).json({ ok: false, loi: 'Thiếu phân xưởng' });
        }

        // Đếm thiết bị trong phân xưởng (trừ thiết bị đã thanh lý)
        const so_thiet_bi = db.prepare(`
            SELECT COUNT(*) as n FROM thiet_bi
            WHERE phan_xuong_id = ? AND trang_thai != 'da_thanh_ly'
        `).get(phan_xuong_id).n;

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO nhiem_vu_kiem_ke
            (dot_kiem_ke_id, phan_xuong_id, nguoi_phu_trach_id, so_thiet_bi_du_kien, trang_thai)
            VALUES (?, ?, ?, ?, 'chua_bat_dau')
        `);

        const result = stmt.run(req.params.id, phan_xuong_id, nguoi_phu_trach_id || null, so_thiet_bi);

        db.prepare(`
            INSERT INTO lich_su_kiem_ke
            (dot_kiem_ke_id, nhiem_vu_kiem_ke_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, ?, 'giao_nhiem_vu', ?, ?, ?)
        `).run(
            req.params.id,
            result.lastInsertRowid,
            JSON.stringify({ phan_xuong_id, so_thiet_bi }),
            req.session.nguoi_dung_id,
            req.ip
        );

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(400).json({ ok: false, loi: 'Phân xưởng đã được giao nhiệm vụ' });
        }
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/kiemke/:id/nhiem-vu/:nhiem_vu_id
 * Chi tiết nhiệm vụ kiểm kê
 */
router.get('/:id/nhiem-vu/:nhiem_vu_id', coMaQuyenNay('kiemke.kiem-tra-chi-tiet'), (req, res) => {
    try {
        const nhiem_vu = db.prepare(`
            SELECT n.*, p.ten as phan_xuong_ten, u.ho_ten as nguoi_phu_trach
            FROM nhiem_vu_kiem_ke n
            LEFT JOIN phan_xuong p ON n.phan_xuong_id = p.id
            LEFT JOIN nguoi_dung u ON n.nguoi_phu_trach_id = u.id
            WHERE n.id = ? AND n.dot_kiem_ke_id = ?
        `).get(req.params.nhiem_vu_id, req.params.id);

        if (!nhiem_vu) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy nhiệm vụ' });
        }

        // Lấy danh sách thiết bị cần kiểm kê
        nhiem_vu.chi_tiet_list = db.prepare(`
            SELECT c.*, t.so_hieu, t.ten, t.trang_thai as trang_thai_cu,
                   t.vi_tri_phieu, t.so_seri, u.ho_ten as nguoi_kiem_ke
            FROM chi_tiet_kiem_ke c
            LEFT JOIN thiet_bi t ON c.thiet_bi_id = t.id
            LEFT JOIN nguoi_dung u ON c.nguoi_kiem_ke_id = u.id
            WHERE c.nhiem_vu_kiem_ke_id = ?
            ORDER BY t.so_hieu
        `).all(req.params.nhiem_vu_id);

        res.json({ ok: true, data: nhiem_vu });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/kiemke/:id/nhiem-vu/:nhiem_vu_id/them-chi-tiet
 * Thêm chi tiết kiểm kê cho thiết bị
 */
router.post('/:id/nhiem-vu/:nhiem_vu_id/them-chi-tiet', coMaQuyenNay('kiemke.kiem-tra-chi-tiet'), (req, res) => {
    try {
        const { thiet_bi_id, trang_thai_moi, vi_tri_moi, so_seri_moi, ghi_chu_kiem_ke, ket_luan } = req.body;

        if (!thiet_bi_id) {
            return res.status(400).json({ ok: false, loi: 'Thiếu ID thiết bị' });
        }

        // Lấy thông tin cũ
        const snapshot = db.prepare(`
            SELECT * FROM snapshot_truoc_kiem_ke
            WHERE thiet_bi_id = ? AND dot_kiem_ke_id = ?
        `).get(thiet_bi_id, req.params.id);

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO chi_tiet_kiem_ke
            (nhiem_vu_kiem_ke_id, thiet_bi_id, trang_thai_cu, trang_thai_moi,
             vi_tri_cu, vi_tri_moi, so_seri_cu, so_seri_moi,
             ghi_chu_kiem_ke, ket_luan, da_kiem_ke, nguoi_kiem_ke_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `);

        const result = stmt.run(
            req.params.nhiem_vu_id, thiet_bi_id,
            snapshot?.trang_thai || null, trang_thai_moi || null,
            snapshot?.vi_tri_phieu || null, vi_tri_moi || null,
            snapshot?.so_seri || null, so_seri_moi || null,
            ghi_chu_kiem_ke || null, ket_luan || null,
            req.session.nguoi_dung_id
        );

        // Cập nhật số thiết bị đã kiểm kê
        const so_da_kiem = db.prepare(`
            SELECT COUNT(*) as n FROM chi_tiet_kiem_ke WHERE nhiem_vu_kiem_ke_id = ? AND da_kiem_ke = 1
        `).get(req.params.nhiem_vu_id).n;

        db.prepare(`
            UPDATE nhiem_vu_kiem_ke
            SET so_thiet_bi_kiem_ke = ?, trang_thai = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(so_da_kiem, 'dang_thuc_hien', req.params.nhiem_vu_id);

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/kiemke/:id/hoan-thanh
 * Hoàn thành đợt kiểm kê
 */
router.post('/:id/hoan-thanh', coMaQuyenNay('kiemke.hoan-thanh'), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_kiem_ke WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt kiểm kê' });
        }

        // Cập nhật trạng thái
        db.prepare(`
            UPDATE dot_kiem_ke
            SET trang_thai = 'da_hoan_thanh', ngay_ket_thuc = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(req.params.id);

        // Cập nhật trạng thái nhiệm vụ
        db.prepare(`
            UPDATE nhiem_vu_kiem_ke
            SET trang_thai = 'da_hoan_thanh'
            WHERE dot_kiem_ke_id = ?
        `).run(req.params.id);

        // Tạo báo cáo thiếu/mất
        taoBC_ThieuMat(req.params.id, req.session.nguoi_dung_id, req.ip);

        db.prepare(`
            INSERT INTO lich_su_kiem_ke
            (dot_kiem_ke_id, hanh_dong, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'hoan_thanh', ?, ?)
        `).run(req.params.id, req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/kiemke/:id/bao-cao-thieu-mat
 * Báo cáo thiếu/mất thiết bị
 */
router.get('/:id/bao-cao-thieu-mat', coMaQuyenNay('kiemke.xem-bao-cao'), (req, res) => {
    try {
        const data = db.prepare(`
            SELECT b.*, p.ten as phan_xuong_ten
            FROM bao_cao_thieu_mat b
            LEFT JOIN phan_xuong p ON b.phan_xuong_id = p.id
            WHERE b.dot_kiem_ke_id = ?
            ORDER BY b.loai_thieu_mat, b.ngay_lap DESC
        `).all(req.params.id);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/kiemke/:id/lich-su
 * Lịch sử kiểm kê
 */
router.get('/:id/lich-su', coMaQuyenNay('kiemke.xem'), (req, res) => {
    try {
        const data = db.prepare(`
            SELECT l.*, u.ho_ten as nguoi_tao
            FROM lich_su_kiem_ke l
            LEFT JOIN nguoi_dung u ON l.nguoi_tao_id = u.id
            WHERE l.dot_kiem_ke_id = ?
            ORDER BY l.created_at DESC
            LIMIT 100
        `).all(req.params.id);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * Hàm helper: Tạo báo cáo thiếu/mất
 */
function taoBC_ThieuMat(dot_kiem_ke_id, nguoi_tao_id, ip) {
    try {
        // Tìm thiết bị không có chi tiết kiểm kê (thiết bị thiếu/mất)
        const thieu_bi = db.prepare(`
            SELECT t.id, t.ma_tb, t.ten, t.phan_xuong_id, t.nguyen_gia
            FROM thiet_bi t
            LEFT JOIN snapshot_truoc_kiem_ke s ON t.id = s.thiet_bi_id AND s.dot_kiem_ke_id = ?
            LEFT JOIN chi_tiet_kiem_ke c ON t.id = c.thiet_bi_id AND c.nhiem_vu_kiem_ke_id IN (
                SELECT id FROM nhiem_vu_kiem_ke WHERE dot_kiem_ke_id = ?
            )
            WHERE t.trang_thai != 'da_thanh_ly' AND s.dot_kiem_ke_id = ? AND c.id IS NULL
        `).all(dot_kiem_ke_id, dot_kiem_ke_id, dot_kiem_ke_id);

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO bao_cao_thieu_mat
            (dot_kiem_ke_id, thiet_bi_id, so_hieu, ten_thiet_bi, phan_xuong_id, loai_thieu_mat, gia_tri_sach)
            VALUES (?, ?, ?, ?, ?, 'khong_tim_thay', ?)
        `);

        for (const tb of thieu_bi) {
            insertStmt.run(
                dot_kiem_ke_id, tb.id, tb.ma_tb, tb.ten, tb.phan_xuong_id, tb.nguyen_gia || null
            );
        }
    } catch (e) {
        console.error('Lỗi tạo báo cáo:', e.message);
    }
}

module.exports = router;
