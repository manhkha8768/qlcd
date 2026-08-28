/**
 * API Quản lý file mẫu (v18)
 * Endpoints cho upload, download, quản lý file template
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const BM = require('../middleware/bao-mat');
const { coMaQuyenNay, coMaQuyen } = require('../middleware/quyen');
const multer = require('multer');
const crypto = require('crypto');

const uploadTam = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * GET /api/filemau/loai
 * Liệt kê loại file mẫu
 */
router.get('/loai', (req, res) => {
    try {
        const data = db.prepare(`
            SELECT id, ma, ten, mo_ta, duoi_file
            FROM loai_file_mau
            ORDER BY ten
        `).all();
        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/filemau/cap-truy-cap
 * Liệt kê cấp truy cập
 */
router.get('/cap-truy-cap', (req, res) => {
    try {
        const data = db.prepare(`
            SELECT id, ma, ten, mo_ta
            FROM cap_truy_cap_file_mau
            ORDER BY ten
        `).all();
        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/filemau
 * Liệt kê file mẫu (có filter)
 * Query: loai_id, tro_cap, q (tìm kiếm)
 */
router.get('/', coMaQuyenNay('filemau.xem'), (req, res) => {
    try {
        let sql = `
            SELECT f.id, f.ma, f.ten, f.mo_ta, f.loai_id, l.ten as loai_ten,
                   f.kich_thuoc, f.tro_cap, f.created_at, u.ho_ten as nguoi_tao,
                   (SELECT COUNT(*) FROM file_mau_ban_ghim WHERE file_mau_id = f.id) as da_ghim
            FROM file_mau f
            JOIN loai_file_mau l ON f.loai_id = l.id
            LEFT JOIN nguoi_dung u ON f.nguoi_tao_id = u.id
            WHERE f.da_xoa = 0
        `;
        const params = [];

        if (req.query.loai_id) {
            sql += ` AND f.loai_id = ?`;
            params.push(req.query.loai_id);
        }

        if (req.query.tro_cap) {
            sql += ` AND f.tro_cap = ?`;
            params.push(req.query.tro_cap);
        }

        if (req.query.q) {
            sql += ` AND (f.ten LIKE ? OR f.ma LIKE ? OR f.mo_ta LIKE ?)`;
            const q = `%${req.query.q}%`;
            params.push(q, q, q);
        }

        sql += ` ORDER BY (SELECT COUNT(*) FROM file_mau_ban_ghim WHERE file_mau_id = f.id) DESC, f.created_at DESC`;

        const data = db.prepare(sql).all(...params);
        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/filemau/:id/download
 * Download file mẫu
 */
router.get('/:id/download', coMaQuyenNay('filemau.download'), (req, res) => {
    try {
        const file = db.prepare(`
            SELECT f.*, l.duoi_file
            FROM file_mau f
            JOIN loai_file_mau l ON f.loai_id = l.id
            WHERE f.id = ? AND f.da_xoa = 0
        `).get(req.params.id);

        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        // Ghi lại download vào audit
        db.prepare(`
            INSERT INTO file_mau_lich_su
            (file_mau_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'download', ?, ?, ?)
        `).run(
            req.params.id,
            JSON.stringify({ so_lan: 1 }),
            req.session.nguoi_dung_id,
            req.ip
        );

        // Sanitize filename for Content-Disposition header
        const safeName = file.ma + file.duoi_file;
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.ten + file.duoi_file)}`);
        res.set('Content-Length', file.kich_thuoc);
        res.send(file.tap_tin);
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/filemau/:id/lich-su
 * Xem lịch sử thay đổi file mẫu
 */
router.get('/:id/lich-su', coMaQuyenNay('filemau.xem'), (req, res) => {
    try {
        const data = db.prepare(`
            SELECT fls.id, fls.hanh_dong, fls.chi_tiet_cu, fls.chi_tiet_moi,
                   fls.ip_dia_chi, fls.created_at, u.ho_ten as nguoi_tao
            FROM file_mau_lich_su fls
            LEFT JOIN nguoi_dung u ON fls.nguoi_tao_id = u.id
            WHERE fls.file_mau_id = ?
            ORDER BY fls.created_at DESC
            LIMIT 100
        `).all(req.params.id);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/filemau/:id/bien
 * Thêm biến (placeholder) vào mẫu
 * Body: {ma_bien, kieu_du_lieu, bat_buoc, mo_ta, gia_tri_mac_dinh}
 */
router.post('/:id/bien', coMaQuyenNay('filemau.sua'), (req, res) => {
    try {
        const file = db.prepare('SELECT id FROM file_mau WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        const { ma_bien, kieu_du_lieu, bat_buoc, mo_ta, gia_tri_mac_dinh } = req.body;
        if (!ma_bien) {
            return res.status(400).json({ ok: false, loi: 'Thiếu mã biến' });
        }

        const result = db.prepare(`
            INSERT INTO file_mau_bien
            (file_mau_id, ma_bien, kieu_du_lieu, bat_buoc, mo_ta, gia_tri_mac_dinh)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            req.params.id,
            ma_bien,
            kieu_du_lieu || 'text',
            bat_buoc !== false ? 1 : 0,
            mo_ta || null,
            gia_tri_mac_dinh || null
        );

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ ok: false, loi: 'Biến này đã tồn tại trong mẫu' });
        }
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * DELETE /api/filemau/:id/bien/:bien_id
 * Xóa biến khỏi mẫu
 */
router.delete('/:id/bien/:bien_id', coMaQuyenNay('filemau.sua'), (req, res) => {
    try {
        const result = db.prepare(`
            DELETE FROM file_mau_bien
            WHERE id = ? AND file_mau_id = ?
        `).run(req.params.bien_id, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy biến' });
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/filemau/:id/quyen
 * Gán quyền truy cập file mẫu cho vai trò
 * Body: {vai_tro_id, donvi_id}
 */
router.post('/:id/quyen', coMaQuyenNay('filemau.phanquyen'), (req, res) => {
    try {
        const file = db.prepare('SELECT id FROM file_mau WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        const { vai_tro_id, donvi_id } = req.body;

        const result = db.prepare(`
            INSERT OR IGNORE INTO file_mau_quyen
            (file_mau_id, vai_tro_id, donvi_id)
            VALUES (?, ?, ?)
        `).run(req.params.id, vai_tro_id || null, donvi_id || null);

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * DELETE /api/filemau/:id/quyen/:quyen_id
 * Xóa quyền truy cập
 */
router.delete('/:id/quyen/:quyen_id', coMaQuyenNay('filemau.phanquyen'), (req, res) => {
    try {
        const result = db.prepare(`
            DELETE FROM file_mau_quyen
            WHERE id = ? AND file_mau_id = ?
        `).run(req.params.quyen_id, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy quyền' });
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/filemau/:id/ghim
 * Ghim (highlight) file mẫu
 * Body: {thu_tu}
 */
router.post('/:id/ghim', coMaQuyenNay('filemau.sua'), (req, res) => {
    try {
        const file = db.prepare('SELECT id FROM file_mau WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        const { thu_tu } = req.body;
        const result = db.prepare(`
            INSERT OR REPLACE INTO file_mau_ban_ghim
            (file_mau_id, thu_tu)
            VALUES (?, ?)
        `).run(req.params.id, thu_tu || 0);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * DELETE /api/filemau/:id/ghim
 * Bỏ ghim file mẫu
 */
router.delete('/:id/ghim', coMaQuyenNay('filemau.sua'), (req, res) => {
    try {
        const result = db.prepare(`
            DELETE FROM file_mau_ban_ghim
            WHERE file_mau_id = ?
        `).run(req.params.id);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * GET /api/filemau/:id
 * Lấy chi tiết file mẫu
 */
router.get('/:id', coMaQuyenNay('filemau.xem'), (req, res) => {
    try {
        const file = db.prepare(`
            SELECT f.*, l.ten as loai_ten, l.duoi_file,
                   u.ho_ten as nguoi_tao
            FROM file_mau f
            JOIN loai_file_mau l ON f.loai_id = l.id
            LEFT JOIN nguoi_dung u ON f.nguoi_tao_id = u.id
            WHERE f.id = ? AND f.da_xoa = 0
        `).get(req.params.id);

        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        // Không trả về blob (tap_tin) ở đây
        delete file.tap_tin;

        // Lấy danh sách biến (placeholder) trong mẫu
        file.bien_list = db.prepare(`
            SELECT id, ma_bien, kieu_du_lieu, bat_buoc, mo_ta, gia_tri_mac_dinh
            FROM file_mau_bien
            WHERE file_mau_id = ?
            ORDER BY id
        `).all(req.params.id);

        // Lấy quyền truy cập
        file.quyen_list = db.prepare(`
            SELECT fq.id, fq.vai_tro_id, fq.donvi_id, v.ten as vai_tro_ten, d.ten as donvi_ten
            FROM file_mau_quyen fq
            LEFT JOIN vai_tro v ON fq.vai_tro_id = v.id
            LEFT JOIN phan_xuong d ON fq.donvi_id = d.id
            WHERE fq.file_mau_id = ?
            ORDER BY v.ten, d.ten
        `).all(req.params.id);

        res.json({ ok: true, data: file });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * POST /api/filemau
 * Tạo file mẫu mới
 * Body: {ma, ten, mo_ta, loai_id, tro_cap}
 * File: tap_tin (multipart)
 */
router.post('/', coMaQuyenNay('filemau.tao'), uploadTam.single('tap_tin'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, loi: 'Phải upload file' });
        }

        const { ma, ten, mo_ta, loai_id, tro_cap } = req.body;
        if (!ma || !ten || !loai_id) {
            return res.status(400).json({ ok: false, loi: 'Thiếu thông tin bắt buộc' });
        }

        // Kiểm tra loại file tồn tại
        const loai = db.prepare('SELECT * FROM loai_file_mau WHERE id = ?').get(loai_id);
        if (!loai) {
            return res.status(400).json({ ok: false, loi: 'Loại file không hợp lệ' });
        }

        // Hash file để kiểm tra trùng
        const maHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        const stmt = db.prepare(`
            INSERT INTO file_mau
            (ma, ten, mo_ta, loai_id, tap_tin, kich_thuoc, ma_hash, tro_cap, nguoi_tao_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            ma,
            ten,
            mo_ta || null,
            loai_id,
            req.file.buffer,
            req.file.size,
            maHash,
            tro_cap || 'noi_bo',
            req.session.nguoi_dung_id
        );

        // Ghi audit
        db.prepare(`
            INSERT INTO file_mau_lich_su
            (file_mau_id, hanh_dong, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'tao', ?, ?, ?)
        `).run(
            result.lastInsertRowid,
            JSON.stringify({ ma, ten, mo_ta, loai_id, kich_thuoc: req.file.size }),
            req.session.nguoi_dung_id,
            req.ip
        );

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) {
        if (e.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ ok: false, loi: 'Mã file mẫu đã tồn tại' });
        }
        res.status(500).json({ ok: false, loi: e.message });
    }
});

/**
 * PUT /api/filemau/:id
 * Cập nhật thông tin file mẫu (không cập nhật file)
 */
router.put('/:id', coMaQuyenNay('filemau.sua'), (req, res) => {
    try {
        const file = db.prepare('SELECT * FROM file_mau WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        const { ten, mo_ta, tro_cap } = req.body;
        const cuUpdate = {};
        const moiUpdate = {};

        if (ten !== undefined) {
            cuUpdate.ten = file.ten;
            moiUpdate.ten = ten;
            db.prepare('UPDATE file_mau SET ten = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(ten, req.params.id);
        }
        if (mo_ta !== undefined) {
            cuUpdate.mo_ta = file.mo_ta;
            moiUpdate.mo_ta = mo_ta;
            db.prepare('UPDATE file_mau SET mo_ta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(mo_ta, req.params.id);
        }
        if (tro_cap !== undefined) {
            cuUpdate.tro_cap = file.tro_cap;
            moiUpdate.tro_cap = tro_cap;
            db.prepare('UPDATE file_mau SET tro_cap = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(tro_cap, req.params.id);
        }

        if (Object.keys(moiUpdate).length > 0) {
            db.prepare(`
                INSERT INTO file_mau_lich_su
                (file_mau_id, hanh_dong, chi_tiet_cu, chi_tiet_moi, nguoi_tao_id, ip_dia_chi)
                VALUES (?, 'sua', ?, ?, ?, ?)
            `).run(
                req.params.id,
                JSON.stringify(cuUpdate),
                JSON.stringify(moiUpdate),
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
 * DELETE /api/filemau/:id
 * Xóa (soft delete) file mẫu
 */
router.delete('/:id', coMaQuyenNay('filemau.xoa'), (req, res) => {
    try {
        const file = db.prepare('SELECT id FROM file_mau WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ ok: false, loi: 'Không tìm thấy file mẫu' });
        }

        db.prepare(`
            UPDATE file_mau SET da_xoa = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(req.params.id);

        db.prepare(`
            INSERT INTO file_mau_lich_su
            (file_mau_id, hanh_dong, nguoi_tao_id, ip_dia_chi)
            VALUES (?, 'xoa', ?, ?)
        `).run(req.params.id, req.session.nguoi_dung_id, req.ip);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, loi: e.message });
    }
});

module.exports = router;
