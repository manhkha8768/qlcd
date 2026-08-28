/**
 * API Kho Vật Tư (v21)
 *
 * - Quản lý danh mục vật tư
 * - Nhập/xuất/điều chuyển kho
 * - Tồn kho, audit
 *
 * Lưu ý: Đặt routes theo thứ tự: specific trước, generic sau
 */

const express = require('express');
const db = require('../db');
const { coMaQuyenNay } = require('../middleware/quyen');

const router = express.Router();

/**
 * GET /api/khovat/giao-dich — Danh sách giao dịch kho
 */
router.get('/giao-dich', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                gk.id, gk.ma, gk.loai, gk.trang_thai, gk.ly_do,
                nd.ho_ten as nguoi_lap,
                nd2.ho_ten as nguoi_duyet,
                gk.ngay_tao, gk.ngay_duyet,
                COUNT(gkct.id) as so_chi_tiet
            FROM giao_dich_kho gk
            LEFT JOIN nguoi_dung nd ON gk.nguoi_lap_id = nd.id
            LEFT JOIN nguoi_dung nd2 ON gk.nguoi_duyet_id = nd2.id
            LEFT JOIN giao_dich_kho_chi_tiet gkct ON gk.id = gkct.giao_dich_kho_id
            GROUP BY gk.id
            ORDER BY gk.ngay_tao DESC
            LIMIT 100
        `).all();

        res.json({ data: ds });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/khovat/giao-dich/:id — Chi tiết giao dịch
 */
router.get('/giao-dich/:id', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const gd = db.prepare(`
            SELECT
                gk.*,
                nd.ho_ten as nguoi_lap,
                nd2.ho_ten as nguoi_duyet
            FROM giao_dich_kho gk
            LEFT JOIN nguoi_dung nd ON gk.nguoi_lap_id = nd.id
            LEFT JOIN nguoi_dung nd2 ON gk.nguoi_duyet_id = nd2.id
            WHERE gk.id = ?
        `).get(req.params.id);

        const chi_tiet = db.prepare(`
            SELECT gkct.*, k.ma, k.ten, k.dvt
            FROM giao_dich_kho_chi_tiet gkct
            JOIN kho_vat_tu k ON gkct.vat_tu_id = k.id
            WHERE gkct.giao_dich_kho_id = ?
        `).all(req.params.id);

        res.json({ data: { ...gd, chi_tiet } });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/khovat/giao-dich/:id/duyet — Duyệt giao dịch kho
 */
router.post('/giao-dich/:id/duyet', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.duyet')) return res.status(403).json({ loi: 'Không có quyền' });

    const { phe_duyet } = req.body;

    try {
        const gd = db.prepare('SELECT * FROM giao_dich_kho WHERE id = ?').get(req.params.id);
        if (!gd) return res.status(404).json({ loi: 'Không tìm thấy giao dịch' });

        if (phe_duyet) {
            // Duyệt: cập nhật tồn kho
            const chi_tiet = db.prepare('SELECT vat_tu_id, so_luong FROM giao_dich_kho_chi_tiet WHERE giao_dich_kho_id = ?')
                .all(req.params.id);

            const update_ton = db.transaction(() => {
                chi_tiet.forEach(ct => {
                    if (gd.loai === 'nhap_kho') {
                        db.prepare('UPDATE ton_kho SET ton_hien_tai = ton_hien_tai + ? WHERE vat_tu_id = ?')
                            .run(ct.so_luong, ct.vat_tu_id);
                    } else if (gd.loai === 'xuat_kho') {
                        db.prepare('UPDATE ton_kho SET ton_hien_tai = ton_hien_tai - ? WHERE vat_tu_id = ?')
                            .run(ct.so_luong, ct.vat_tu_id);
                    }
                });

                db.prepare(`UPDATE giao_dich_kho
                           SET trang_thai = 'da_duyet', nguoi_duyet_id = ?, ngay_duyet = CURRENT_TIMESTAMP
                           WHERE id = ?`)
                    .run(req.session.nguoi_dung_id, req.params.id);
            });

            update_ton();

            db.prepare(`INSERT INTO lich_su_kho (giao_dich_kho_id, hanh_dong, nguoi_dung_id, dia_chi_ip, ngay_gio)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`)
                .run(req.params.id, 'duyet_giao_dich', req.session.nguoi_dung_id, req.ip);

            res.json({ ok: true, message: 'Đã duyệt' });
        } else {
            // Từ chối
            db.prepare(`UPDATE giao_dich_kho
                       SET trang_thai = 'tu_choi', nguoi_duyet_id = ?, ngay_duyet = CURRENT_TIMESTAMP
                       WHERE id = ?`)
                .run(req.session.nguoi_dung_id, req.params.id);

            db.prepare(`INSERT INTO lich_su_kho (giao_dich_kho_id, hanh_dong, nguoi_dung_id, dia_chi_ip, ngay_gio)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`)
                .run(req.params.id, 'tu_choi_giao_dich', req.session.nguoi_dung_id, req.ip);

            res.json({ ok: true, message: 'Đã từ chối' });
        }
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/khovat/lich-su — Lịch sử audit kho
 */
router.get('/lich-su', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem_lich_su')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                lk.*,
                nd.ho_ten,
                gk.ma as giao_dich_ma
            FROM lich_su_kho lk
            LEFT JOIN nguoi_dung nd ON lk.nguoi_dung_id = nd.id
            LEFT JOIN giao_dich_kho gk ON lk.giao_dich_kho_id = gk.id
            ORDER BY lk.ngay_gio DESC
            LIMIT 500
        `).all();

        res.json({ data: ds });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/khovat — Danh sách vật tư với tồn kho
 */
router.get('/', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                k.id, k.ma, k.ten, k.chi_tieu, k.dvt,
                k.muc_toi_thieu, k.muc_toi_da, k.vi_tri_kho,
                COALESCE(t.ton_hien_tai, 0) as ton_hien_tai,
                CASE
                    WHEN t.ton_hien_tai < k.muc_toi_thieu THEN 'canh_bao_thap'
                    WHEN t.ton_hien_tai > k.muc_toi_da THEN 'canh_bao_cao'
                    ELSE 'binh_thuong'
                END as tinh_trang_ton
            FROM kho_vat_tu k
            LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
            WHERE k.hoat_dong = 1
            ORDER BY k.ma
        `).all();

        res.json({ data: ds });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/khovat — Tạo vật tư mới
 */
router.post('/', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    const { ma, ten, chi_tieu, dvt, ton_dau, muc_toi_thieu, muc_toi_da, vi_tri_kho, ghi_chu } = req.body;

    if (!ma || !ten || !dvt) {
        return res.status(400).json({ loi: 'Thiếu thông tin: ma, ten, dvt' });
    }

    try {
        // Sử dụng transaction để đảm bảo nhất quán
        const insert_vat_tu = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO kho_vat_tu (ma, ten, chi_tieu, dvt, ton_dau, muc_toi_thieu, muc_toi_da, vi_tri_kho, ghi_chu)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const res_insert = stmt.run(ma, ten, chi_tieu || null, dvt, ton_dau || 0, muc_toi_thieu, muc_toi_da, vi_tri_kho, ghi_chu);

            // Tạo bản ghi tồn kho ban đầu
            const stmt_ton = db.prepare('INSERT INTO ton_kho (vat_tu_id, ton_hien_tai) VALUES (?, ?)');
            stmt_ton.run(res_insert.lastInsertRowid, ton_dau || 0);

            // Ghi audit
            db.prepare(`INSERT INTO lich_su_kho (hanh_dong, nguoi_dung_id, dia_chi_ip, chi_tiet_moi, ngay_gio)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`)
                .run('tao_vat_tu', req.session.nguoi_dung_id, req.ip, JSON.stringify({ ma, ten, dvt }));

            return res_insert.lastInsertRowid;
        });

        const vat_tu_id = insert_vat_tu();
        res.json({ id: vat_tu_id, ma, ten });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/khovat/:id — Chi tiết vật tư
 */
router.get('/:id', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const vt = db.prepare(`
            SELECT k.*, COALESCE(t.ton_hien_tai, 0) as ton_hien_tai
            FROM kho_vat_tu k
            LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
            WHERE k.id = ? AND k.hoat_dong = 1
        `).get(req.params.id);

        if (!vt) return res.status(404).json({ loi: 'Không tìm thấy vật tư' });
        res.json({ data: vt });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * PUT /api/khovat/:id — Sửa thông tin vật tư
 */
router.put('/:id', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    const { ten, chi_tieu, muc_toi_thieu, muc_toi_da, vi_tri_kho, ghi_chu } = req.body;

    try {
        const stmt = db.prepare(`
            UPDATE kho_vat_tu
            SET ten = ?, chi_tieu = ?, muc_toi_thieu = ?, muc_toi_da = ?, vi_tri_kho = ?, ghi_chu = ?
            WHERE id = ?
        `);
        stmt.run(ten, chi_tieu, muc_toi_thieu, muc_toi_da, vi_tri_kho, ghi_chu, req.params.id);

        db.prepare(`INSERT INTO lich_su_kho (hanh_dong, nguoi_dung_id, dia_chi_ip, chi_tiet_moi, ngay_gio)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`)
            .run('sua_vat_tu', req.session.nguoi_dung_id, req.ip, JSON.stringify({ ten, chi_tieu }));

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/khovat/:id/nhap — Lập phiếu nhập kho
 */
router.post('/:id/nhap', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.nhap')) return res.status(403).json({ loi: 'Không có quyền' });

    const { vat_tu_id, so_luong, ly_do } = req.body;

    if (!vat_tu_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ loi: 'Số lượng nhập phải > 0' });
    }

    try {
        const ma = 'NK' + Date.now();
        const gd_stmt = db.prepare(`
            INSERT INTO giao_dich_kho (ma, loai, trang_thai, nguoi_lap_id, ly_do)
            VALUES (?, 'nhap_kho', 'nhap', ?, ?)
        `);
        const gd_res = gd_stmt.run(ma, req.session.nguoi_dung_id, ly_do);

        // Thêm chi tiết
        db.prepare(`INSERT INTO giao_dich_kho_chi_tiet (giao_dich_kho_id, vat_tu_id, so_luong)
                   VALUES (?, ?, ?)`)
            .run(gd_res.lastInsertRowid, vat_tu_id, so_luong);

        db.prepare(`INSERT INTO lich_su_kho (giao_dich_kho_id, hanh_dong, nguoi_dung_id, dia_chi_ip, chi_tiet_moi, ngay_gio)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
            .run(gd_res.lastInsertRowid, 'lap_phieu_nhap', req.session.nguoi_dung_id, req.ip,
                 JSON.stringify({ so_luong, ly_do }));

        res.json({ id: gd_res.lastInsertRowid, ma });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/khovat/:id/xuat — Lập phiếu xuất kho
 */
router.post('/:id/xuat', (req, res) => {
    if (!coMaQuyenNay(req, 'kho.xuat')) return res.status(403).json({ loi: 'Không có quyền' });

    const { vat_tu_id, so_luong, ly_do } = req.body;

    if (!vat_tu_id || !so_luong || so_luong <= 0) {
        return res.status(400).json({ loi: 'Số lượng xuất phải > 0' });
    }

    try {
        // Kiểm tra tồn kho
        const ton = db.prepare('SELECT ton_hien_tai FROM ton_kho WHERE vat_tu_id = ?').get(vat_tu_id);
        if (!ton || ton.ton_hien_tai < so_luong) {
            return res.status(400).json({ loi: 'Tồn kho không đủ' });
        }

        const ma = 'XK' + Date.now();
        const gd_stmt = db.prepare(`
            INSERT INTO giao_dich_kho (ma, loai, trang_thai, nguoi_lap_id, ly_do)
            VALUES (?, 'xuat_kho', 'nhap', ?, ?)
        `);
        const gd_res = gd_stmt.run(ma, req.session.nguoi_dung_id, ly_do);

        db.prepare(`INSERT INTO giao_dich_kho_chi_tiet (giao_dich_kho_id, vat_tu_id, so_luong)
                   VALUES (?, ?, ?)`)
            .run(gd_res.lastInsertRowid, vat_tu_id, so_luong);

        db.prepare(`INSERT INTO lich_su_kho (giao_dich_kho_id, hanh_dong, nguoi_dung_id, dia_chi_ip, chi_tiet_moi, ngay_gio)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
            .run(gd_res.lastInsertRowid, 'lap_phieu_xuat', req.session.nguoi_dung_id, req.ip,
                 JSON.stringify({ so_luong, ly_do }));

        res.json({ id: gd_res.lastInsertRowid, ma });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

module.exports = router;
