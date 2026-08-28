/**
 * API Đối chiếu TSCĐ/CCDC/Kiểm kê (v20)
 * So sánh dữ liệu từ nhiều nguồn, xác định sai lệch
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { coMaQuyenNay } = require('../middleware/quyen');

/**
 * GET /api/doichieu
 * Liệt kê các đợt đối chiếu
 */
router.get('/', coMaQuyenNay('doichieu.xem'), (req, res) => {
    try {
        let sql = `
            SELECT d.*, COUNT(DISTINCT c.id) as so_chi_tiet,
                   SUM(CASE WHEN c.da_xac_nhan = 1 THEN 1 ELSE 0 END) as da_xac_nhan
            FROM dot_doi_chieu d
            LEFT JOIN chi_tiet_doi_chieu c ON d.id = c.dot_doi_chieu_id
            WHERE 1=1
        `;
        const params = [];

        if (req.query.trang_thai) {
            sql += ` AND d.trang_thai = ?`;
            params.push(req.query.trang_thai);
        }

        sql += ` GROUP BY d.id ORDER BY d.ngay_tao DESC`;

        const data = db.prepare(sql).all(...params);
        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/doichieu
 * Tạo đợt đối chiếu mới
 */
router.post('/', coMaQuyenNay('doichieu.tao'), (req, res) => {
    try {
        const { ma, ten, dot_kiem_ke_id, mo_ta } = req.body;
        if (!ma || !ten) {
            return res.status(400).json({ ok: false, loi: 'Thiếu thông tin bắt buộc' });
        }

        const stmt = db.prepare(`
            INSERT INTO dot_doi_chieu
            (ma, ten, dot_kiem_ke_id, mo_ta, nguoi_tao_id, trang_thai)
            VALUES (?, ?, ?, ?, ?, 'dang_tao')
        `);

        const result = stmt.run(ma, ten, dot_kiem_ke_id || null, mo_ta || null, req.session.nguoi_dung_id);

        db.prepare(`
            INSERT INTO lich_su_doi_chieu
            (dot_doi_chieu_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'tao_dot', ?, ?, ?)
        `).run(result.lastInsertRowid, JSON.stringify({ ma, ten }), req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(400).json({ ok: false, loi: 'Mã đợt đối chiếu đã tồn tại' });
        }
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/doichieu/:id
 * Chi tiết đợt đối chiếu
 */
router.get('/:id', coMaQuyenNay('doichieu.xem'), (req, res) => {
    try {
        const dot = db.prepare(`
            SELECT d.*, u.ho_ten as nguoi_tao
            FROM dot_doi_chieu d
            LEFT JOIN nguoi_dung u ON d.nguoi_tao_id = u.id
            WHERE d.id = ?
        `).get(req.params.id);

        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt đối chiếu' });
        }

        // Thống kê
        const stats = db.prepare(`
            SELECT
                COUNT(*) as tong_chi_tiet,
                SUM(CASE WHEN phan_loai_sai_lech = 'khop' THEN 1 ELSE 0 END) as so_khop,
                SUM(CASE WHEN phan_loai_sai_lech != 'khop' THEN 1 ELSE 0 END) as so_sai_lech,
                SUM(CASE WHEN da_xac_nhan = 1 THEN 1 ELSE 0 END) as da_xac_nhan
            FROM chi_tiet_doi_chieu
            WHERE dot_doi_chieu_id = ?
        `).get(req.params.id);
        dot.thong_ke = stats || { tong_chi_tiet: 0, so_khop: 0, so_sai_lech: 0, da_xac_nhan: 0 };

        res.json({ ok: true, data: dot });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/doichieu/:id/upload-tscd
 * Upload file TSCĐ
 */
router.post('/:id/upload-tscd', coMaQuyenNay('doichieu.upload'), express.json(), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_doi_chieu WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt đối chiếu' });
        }

        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ ok: false, loi: 'Dữ liệu không hợp lệ' });
        }

        // Xóa dữ liệu TSCĐ cũ
        db.prepare('DELETE FROM du_lieu_tscd WHERE dot_doi_chieu_id = ?').run(req.params.id);

        // Insert dữ liệu mới
        const stmt = db.prepare(`
            INSERT INTO du_lieu_tscd
            (dot_doi_chieu_id, ma_tscd, ten_tscd, loai_ts, so_seri_tscd, dvt_tscd,
             sl_tscd, nguyen_gia_tscd, gia_tri_tscd, ngay_tao_tscd, nhom_tscd, ghi_chu_tscd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const row of data) {
            stmt.run(
                req.params.id, row.ma_tscd, row.ten_tscd, row.loai_ts, row.so_seri,
                row.dvt, row.sl, row.nguyen_gia, row.gia_tri, row.ngay_tao, row.nhom, row.ghi_chu
            );
            count++;
        }

        db.prepare(`
            UPDATE dot_doi_chieu SET ngay_upload_tscd = CURRENT_TIMESTAMP WHERE id = ?
        `).run(req.params.id);

        db.prepare(`
            INSERT INTO lich_su_doi_chieu
            (dot_doi_chieu_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'upload_tscd', ?, ?, ?)
        `).run(req.params.id, JSON.stringify({ so_dong: count }), req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true, so_dong: count });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/doichieu/:id/upload-ccdc
 * Upload file CCDC
 */
router.post('/:id/upload-ccdc', coMaQuyenNay('doichieu.upload'), express.json(), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_doi_chieu WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt đối chiếu' });
        }

        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ ok: false, loi: 'Dữ liệu không hợp lệ' });
        }

        // Xóa dữ liệu CCDC cũ
        db.prepare('DELETE FROM du_lieu_ccdc WHERE dot_doi_chieu_id = ?').run(req.params.id);

        // Insert dữ liệu mới
        const stmt = db.prepare(`
            INSERT INTO du_lieu_ccdc
            (dot_doi_chieu_id, ma_ccdc, ten_ccdc, chi_tieu, so_seri_ccdc, dvt_ccdc,
             sl_ccdc, gia_tri_ccdc, ngay_cap_ccdc, phong_ban_ccdc, ghi_chu_ccdc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const row of data) {
            stmt.run(
                req.params.id, row.ma_ccdc, row.ten_ccdc, row.chi_tieu, row.so_seri,
                row.dvt, row.sl, row.gia_tri, row.ngay_cap, row.phong_ban, row.ghi_chu
            );
            count++;
        }

        db.prepare(`
            UPDATE dot_doi_chieu SET ngay_upload_ccdc = CURRENT_TIMESTAMP WHERE id = ?
        `).run(req.params.id);

        db.prepare(`
            INSERT INTO lich_su_doi_chieu
            (dot_doi_chieu_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'upload_ccdc', ?, ?, ?)
        `).run(req.params.id, JSON.stringify({ so_dong: count }), req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true, so_dong: count });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/doichieu/:id/chay-so-sanh
 * Chạy logic so sánh dữ liệu
 */
router.post('/:id/chay-so-sanh', coMaQuyenNay('doichieu.so_sanh'), (req, res) => {
    try {
        const dot = db.prepare('SELECT * FROM dot_doi_chieu WHERE id = ?').get(req.params.id);
        if (!dot) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy đợt đối chiếu' });
        }

        // Xóa chi tiết đối chiếu cũ
        db.prepare('DELETE FROM chi_tiet_doi_chieu WHERE dot_doi_chieu_id = ?').run(req.params.id);

        let soKhop = 0, soSaiLech = 0;

        // Lấy dữ liệu từ 3 bảng
        const qlcd_list = db.prepare(`
            SELECT id, ma_tb, ten, so_seri, trang_thai,
                   (SELECT COUNT(*) FROM chi_tiet_kiem_ke WHERE thiet_bi_id = tb.id) as da_kiem_ke
            FROM thiet_bi tb
            WHERE trang_thai != 'da_thanh_ly'
            ORDER BY ma_tb
        `).all();

        const tscd_map = {};
        db.prepare('SELECT * FROM du_lieu_tscd WHERE dot_doi_chieu_id = ?')
            .all(req.params.id)
            .forEach(row => {
                tscd_map[row.ma_tscd] = row;
            });

        const ccdc_map = {};
        db.prepare('SELECT * FROM du_lieu_ccdc WHERE dot_doi_chieu_id = ?')
            .all(req.params.id)
            .forEach(row => {
                ccdc_map[row.ma_ccdc] = row;
            });

        const kiem_ke_map = {};
        if (dot.dot_kiem_ke_id) {
            db.prepare(`
                SELECT tb.id, tb.ma_tb, SUM(CASE WHEN c.da_kiem_ke = 1 THEN 1 ELSE 0 END) as so_kiem_ke
                FROM thiet_bi tb
                LEFT JOIN chi_tiet_kiem_ke c ON tb.id = c.thiet_bi_id
                WHERE tb.trang_thai != 'da_thanh_ly'
                GROUP BY tb.id
            `).all().forEach(row => {
                kiem_ke_map[row.ma_tb] = row;
            });
        }

        const insertStmt = db.prepare(`
            INSERT INTO chi_tiet_doi_chieu
            (dot_doi_chieu_id, thiet_bi_id, ma_qlcd, ten_qlcd, ma_tscd, ma_ccdc,
             phan_loai_sai_lech, sl_qlcd, sl_tscd, sl_ccdc, sl_thuc_te)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // So sánh QLCD với TSCĐ/CCDC/Kiểm kê
        for (const qlcd of qlcd_list) {
            const tscd = tscd_map[qlcd.ma_tb];
            const ccdc = ccdc_map[qlcd.ma_tb];
            const kiem_ke = kiem_ke_map[qlcd.ma_tb];

            let phan_loai = 'khop';
            let sl_qlcd = 1, sl_tscd = tscd?.sl_tscd, sl_ccdc = ccdc?.sl_ccdc, sl_thuc_te = kiem_ke?.so_kiem_ke;

            // Kiểm tra khớp
            if (!tscd && !ccdc && !kiem_ke) {
                // Chỉ có ở QLCD
                phan_loai = 'chi_qlcd';
                soSaiLech++;
            } else if (tscd && ccdc && kiem_ke &&
                      sl_qlcd === sl_tscd && sl_qlcd === sl_ccdc && sl_qlcd === sl_thuc_te) {
                phan_loai = 'khop';
                soKhop++;
            } else {
                // Phân loại loại sai lệch
                if ((sl_tscd || sl_ccdc) && sl_tscd !== sl_qlcd) {
                    phan_loai = 'lech_so_luong';
                } else if (!tscd) {
                    phan_loai = 'chi_qlcd';
                }
                soSaiLech++;
            }

            insertStmt.run(
                req.params.id, qlcd.id, qlcd.ma_tb, qlcd.ten, tscd?.ma_tscd || null, ccdc?.ma_ccdc || null,
                phan_loai, sl_qlcd, sl_tscd || null, sl_ccdc || null, sl_thuc_te || null
            );
        }

        // Thêm dữ liệu chỉ có ở TSCĐ
        for (const ma_tscd in tscd_map) {
            const tscd = tscd_map[ma_tscd];
            const qlcd = qlcd_list.find(x => x.ma_tb === ma_tscd);
            if (!qlcd) {
                insertStmt.run(
                    req.params.id, null, null, null, tscd.ma_tscd, null,
                    'chi_tscd', null, tscd.sl_tscd, null, null
                );
                soSaiLech++;
            }
        }

        // Thêm dữ liệu chỉ có ở CCDC
        for (const ma_ccdc in ccdc_map) {
            const ccdc = ccdc_map[ma_ccdc];
            const qlcd = qlcd_list.find(x => x.ma_tb === ma_ccdc);
            if (!qlcd) {
                insertStmt.run(
                    req.params.id, null, null, null, null, ccdc.ma_ccdc,
                    'chi_ccdc', null, null, ccdc.sl_ccdc, null
                );
                soSaiLech++;
            }
        }

        db.prepare(`
            INSERT INTO lich_su_doi_chieu
            (dot_doi_chieu_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'chay_so_sanh', ?, ?, ?)
        `).run(req.params.id, JSON.stringify({ so_khop: soKhop, so_sai_lech: soSaiLech }), req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true, so_khop: soKhop, so_sai_lech: soSaiLech });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/doichieu/:id/chi-tiet
 * Danh sách chi tiết sai lệch
 */
router.get('/:id/chi-tiet', coMaQuyenNay('doichieu.xem'), (req, res) => {
    try {
        const data = db.prepare(`
            SELECT c.*, u.ho_ten as nguoi_xac_nhan
            FROM chi_tiet_doi_chieu c
            LEFT JOIN nguoi_dung u ON c.nguoi_xac_nhan_id = u.id
            WHERE c.dot_doi_chieu_id = ?
            ORDER BY c.phan_loai_sai_lech DESC, c.da_xac_nhan ASC
        `).all(req.params.id);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/doichieu/:id/xac-nhan/:chi_tiet_id
 * Xác nhận sai lệch và chọn hành động
 */
router.post('/:id/xac-nhan/:chi_tiet_id', coMaQuyenNay('doichieu.xac_nhan'), (req, res) => {
    try {
        const { hanh_dong, ghi_chu } = req.body;

        const chi_tiet = db.prepare(
            'SELECT * FROM chi_tiet_doi_chieu WHERE id = ? AND dot_doi_chieu_id = ?'
        ).get(req.params.chi_tiet_id, req.params.id);

        if (!chi_tiet) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy chi tiết' });
        }

        db.prepare(`
            UPDATE chi_tiet_doi_chieu
            SET da_xac_nhan = 1, nguoi_xac_nhan_id = ?, hanh_dong_du_kien = ?, ghi_chu = ?
            WHERE id = ?
        `).run(req.session.nguoi_dung_id, hanh_dong || null, ghi_chu || null, req.params.chi_tiet_id);

        db.prepare(`
            INSERT INTO lich_su_doi_chieu
            (dot_doi_chieu_id, chi_tiet_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, ?, 'xac_nhan', ?, ?, ?)
        `).run(req.params.id, req.params.chi_tiet_id, JSON.stringify({ hanh_dong }), req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/doichieu/:id/lich-su
 * Lịch sử đối chiếu
 */
router.get('/:id/lich-su', coMaQuyenNay('doichieu.xem_lich_su'), (req, res) => {
    try {
        const data = db.prepare(`
            SELECT l.*, u.ho_ten as nguoi_tao
            FROM lich_su_doi_chieu l
            LEFT JOIN nguoi_dung u ON l.nguoi_tao_id = u.id
            WHERE l.dot_doi_chieu_id = ?
            ORDER BY l.created_at DESC
            LIMIT 100
        `).all(req.params.id);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

module.exports = router;
