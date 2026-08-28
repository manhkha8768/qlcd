/**
 * API Quản trị hệ thống
 *
 * Gồm:
 * - Quản lý tài khoản
 * - Quản lý vai trò
 * - Phân quyền
 * - Quản lý đơn vị
 * - Phiên đăng nhập
 * - Nhật ký audit
 * - Sao lưu dữ liệu
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { chiAdmin, dangNhap } = require('../middleware/quyen');
const router = express.Router();

// =====================================================================
// TÀI KHOẢN
// =====================================================================

// GET: Liệt kê tài khoản
router.get('/taikhoan', chiAdmin, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT
                u.id, u.ten_dang_nhap, u.ho_ten, u.chuc_vu,
                u.phan_xuong_id, px.ten as ten_phan_xuong,
                u.tam_thoi, u.het_han, u.hoat_dong, u.ngay_tao,
                GROUP_CONCAT(vt.ma) as vai_tro_list
            FROM nguoi_dung u
            LEFT JOIN phan_xuong px ON u.phan_xuong_id = px.id
            LEFT JOIN nguoi_dung_vai_tro ndvt ON u.id = ndvt.nguoi_dung_id
            LEFT JOIN vai_tro vt ON ndvt.vai_tro_id = vt.id
            GROUP BY u.id
            ORDER BY u.ngay_tao DESC
        `).all();

        res.json({ ok: true, data: list });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// GET: Chi tiết một tài khoản
router.get('/taikhoan/:id', chiAdmin, (req, res) => {
    try {
        const u = db.prepare(`
            SELECT
                u.id, u.ten_dang_nhap, u.ho_ten, u.chuc_vu,
                u.phan_xuong_id, u.tam_thoi, u.het_han, u.hoat_dong, u.ngay_tao,
                u.phai_doi_mat_khau
            FROM nguoi_dung u
            WHERE u.id = ?
        `).get(req.params.id);

        if (!u) return res.status(404).json({ loi: 'Tài khoản không tồn tại' });

        // Lấy danh sách vai trò của tài khoản
        const vaiTro = db.prepare(`
            SELECT vt.id, vt.ma, vt.ten
            FROM vai_tro vt
            JOIN nguoi_dung_vai_tro ndvt ON vt.id = ndvt.vai_tro_id
            WHERE ndvt.nguoi_dung_id = ?
            ORDER BY vt.ten
        `).all(u.id);

        res.json({ ok: true, data: { ...u, vai_tro: vaiTro } });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Thêm tài khoản
router.post('/taikhoan', chiAdmin, (req, res) => {
    try {
        const { ten_dang_nhap, ho_ten, chuc_vu, phan_xuong_id, vai_tro_list } = req.body;

        if (!ten_dang_nhap || !ho_ten) {
            return res.status(400).json({ loi: 'Thiếu tên đăng nhập hoặc họ tên' });
        }

        // Kiểm tra tên đăng nhập trùng
        const co = db.prepare('SELECT COUNT(*) n FROM nguoi_dung WHERE ten_dang_nhap = ?').get(ten_dang_nhap);
        if (co.n > 0) {
            return res.status(400).json({ loi: 'Tên đăng nhập đã tồn tại' });
        }

        // Mật khẩu tạm: 4-6 ký tự, hết hạn 24h
        const matKhauTam = Math.random().toString(36).substring(2, 8);
        const hash = bcrypt.hashSync(matKhauTam, 10);
        const hetHan = new Date(Date.now() + 24*60*60*1000).toISOString();

        const chay = db.transaction(() => {
            const info = db.prepare(`
                INSERT INTO nguoi_dung
                (ten_dang_nhap, mat_khau_hash, ho_ten, chuc_vu, phan_xuong_id, tam_thoi, het_han, phai_doi_mat_khau)
                VALUES (?, ?, ?, ?, ?, 1, ?, 1)
            `).run(ten_dang_nhap, hash, ho_ten, chuc_vu, phan_xuong_id || null, hetHan);

            const ndId = info.lastInsertRowid;

            // Gán vai trò (nếu có)
            if (vai_tro_list && vai_tro_list.length > 0) {
                for (const ma of vai_tro_list) {
                    const vt = db.prepare('SELECT id FROM vai_tro WHERE ma = ?').get(ma);
                    if (vt) {
                        db.prepare('INSERT OR IGNORE INTO nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id) VALUES (?, ?)')
                            .run(ndId, vt.id);
                    }
                }
            }

            // Ghi audit
            db.prepare(`
                INSERT INTO audit_quyen (nguoi_dung_id, hanh_dong, chi_tiet_moi, dia_chi_ip)
                VALUES (?, 'them_tai_khoan', ?, ?)
            `).run(req.session.nguoiDung.id, JSON.stringify({ ten_dang_nhap, ho_ten }), req.ip);

            return ndId;
        });

        const ndId = chay.immediate();

        res.json({
            ok: true,
            id: ndId,
            mat_khau_tam: matKhauTam,
            message: `Tài khoản tạm với mật khẩu: ${matKhauTam}, hết hạn: ${hetHan}`
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// PUT: Sửa tài khoản
router.put('/taikhoan/:id', chiAdmin, (req, res) => {
    try {
        const { ho_ten, chuc_vu, phan_xuong_id, hoat_dong, vai_tro_list } = req.body;
        const ndId = req.params.id;

        const u = db.prepare('SELECT id FROM nguoi_dung WHERE id = ?').get(ndId);
        if (!u) return res.status(404).json({ loi: 'Tài khoản không tồn tại' });

        const chay = db.transaction(() => {
            // Cập nhật thông tin
            db.prepare(`
                UPDATE nguoi_dung
                SET ho_ten = ?, chuc_vu = ?, phan_xuong_id = ?, hoat_dong = ?
                WHERE id = ?
            `).run(ho_ten, chuc_vu, phan_xuong_id || null, hoat_dong || 1, ndId);

            // Cập nhật vai trò
            if (vai_tro_list) {
                // Xóa vai trò cũ
                db.prepare('DELETE FROM nguoi_dung_vai_tro WHERE nguoi_dung_id = ?').run(ndId);

                // Thêm vai trò mới
                for (const ma of vai_tro_list) {
                    const vt = db.prepare('SELECT id FROM vai_tro WHERE ma = ?').get(ma);
                    if (vt) {
                        db.prepare('INSERT OR IGNORE INTO nguoi_dung_vai_tro (nguoi_dung_id, vai_tro_id) VALUES (?, ?)')
                            .run(ndId, vt.id);
                    }
                }
            }

            // Ghi audit
            db.prepare(`
                INSERT INTO audit_quyen (nguoi_dung_id, hanh_dong, chi_tiet_moi, dia_chi_ip)
                VALUES (?, 'sua_tai_khoan', ?, ?)
            `).run(req.session.nguoiDung.id, JSON.stringify({ ho_ten, chuc_vu, vai_tro_list }), req.ip);
        });

        chay.immediate();
        res.json({ ok: true, message: 'Cập nhật tài khoản thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Reset mật khẩu (tạo tạm)
router.post('/taikhoan/:id/reset-matkhau', chiAdmin, (req, res) => {
    try {
        const ndId = req.params.id;
        const u = db.prepare('SELECT id FROM nguoi_dung WHERE id = ?').get(ndId);
        if (!u) return res.status(404).json({ loi: 'Tài khoản không tồn tại' });

        const matKhauTam = Math.random().toString(36).substring(2, 8);
        const hash = bcrypt.hashSync(matKhauTam, 10);
        const hetHan = new Date(Date.now() + 24*60*60*1000).toISOString();

        db.prepare(`
            UPDATE nguoi_dung
            SET mat_khau_hash = ?, tam_thoi = 1, het_han = ?, phai_doi_mat_khau = 1
            WHERE id = ?
        `).run(hash, hetHan, ndId);

        res.json({
            ok: true,
            mat_khau_tam: matKhauTam,
            message: `Mật khẩu tạm: ${matKhauTam}, hết hạn: ${hetHan}`
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// VAI TRÒ
// =====================================================================

// GET: Liệt kê vai trò
router.get('/vai-tro', chiAdmin, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT
                id, ma, ten, mo_ta, mac_dinh, hoat_dong, ngay_tao,
                (SELECT COUNT(*) FROM nguoi_dung_vai_tro WHERE vai_tro_id = vai_tro.id) as so_tai_khoan
            FROM vai_tro
            ORDER BY mac_dinh DESC, ten
        `).all();

        res.json({ ok: true, data: list });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Thêm vai trò mới (không thể thêm vai trò mặc định)
router.post('/vai-tro', chiAdmin, (req, res) => {
    try {
        const { ma, ten, mo_ta } = req.body;

        if (!ma || !ten) {
            return res.status(400).json({ loi: 'Thiếu mã hoặc tên vai trò' });
        }

        // Kiểm tra trùng
        const co = db.prepare('SELECT COUNT(*) n FROM vai_tro WHERE ma = ?').get(ma);
        if (co.n > 0) {
            return res.status(400).json({ loi: 'Mã vai trò đã tồn tại' });
        }

        const info = db.prepare(`
            INSERT INTO vai_tro (ma, ten, mo_ta, mac_dinh, hoat_dong)
            VALUES (?, ?, ?, 0, 1)
        `).run(ma, ten, mo_ta);

        res.json({ ok: true, id: info.lastInsertRowid, message: 'Tạo vai trò thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// MÃ QUYỀN
// =====================================================================

// GET: Liệt kê mã quyền
router.get('/ma-quyen', chiAdmin, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT *
            FROM ma_quyen
            ORDER BY hang_muc, ma
        `).all();

        // Nhóm theo hạng mục
        const nhom = {};
        for (const q of list) {
            if (!nhom[q.hang_muc]) nhom[q.hang_muc] = [];
            nhom[q.hang_muc].push(q);
        }

        res.json({ ok: true, data: list, nhom });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// PHÂN QUYỀN: GÁN QUYỀN CHO VAI TRÒ
// =====================================================================

// GET: Liệt kê quyền của một vai trò
router.get('/vai-tro/:id/quyen', chiAdmin, (req, res) => {
    try {
        const vt = db.prepare('SELECT id FROM vai_tro WHERE id = ?').get(req.params.id);
        if (!vt) return res.status(404).json({ loi: 'Vai trò không tồn tại' });

        const quyen = db.prepare(`
            SELECT vq.id, vq.vai_tro_id, vq.ma_quyen, vq.donvi_id, px.ten as ten_donvi
            FROM vai_tro_quyen vq
            LEFT JOIN phan_xuong px ON vq.donvi_id = px.id
            WHERE vq.vai_tro_id = ?
            ORDER BY vq.ma_quyen
        `).all(req.params.id);

        res.json({ ok: true, data: quyen });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Gán quyền cho vai trò
router.post('/vai-tro/:id/quyen', chiAdmin, (req, res) => {
    try {
        const { ma_quyen, donvi_id } = req.body;
        const vt_id = req.params.id;

        if (!ma_quyen) {
            return res.status(400).json({ loi: 'Thiếu mã quyền' });
        }

        const vt = db.prepare('SELECT id FROM vai_tro WHERE id = ?').get(vt_id);
        if (!vt) return res.status(404).json({ loi: 'Vai trò không tồn tại' });

        // Thêm quyền (INSERT OR IGNORE để tránh lỗi trùng)
        const info = db.prepare(`
            INSERT OR IGNORE INTO vai_tro_quyen (vai_tro_id, ma_quyen, donvi_id)
            VALUES (?, ?, ?)
        `).run(vt_id, ma_quyen, donvi_id || null);

        if (info.changes === 0) {
            return res.status(400).json({ loi: 'Quyền này đã được gán hoặc không tồn tại' });
        }

        res.json({ ok: true, message: 'Gán quyền thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// DELETE: Xóa quyền khỏi vai trò
router.delete('/vai-tro/:id/quyen/:quyen_id', chiAdmin, (req, res) => {
    try {
        const vq = db.prepare('SELECT id FROM vai_tro_quyen WHERE id = ? AND vai_tro_id = ?')
            .get(req.params.quyen_id, req.params.id);

        if (!vq) return res.status(404).json({ loi: 'Quyền này không tồn tại' });

        db.prepare('DELETE FROM vai_tro_quyen WHERE id = ?').run(req.params.quyen_id);

        res.json({ ok: true, message: 'Xóa quyền thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// ĐƠN VỊ / PHÂN XƯỞNG
// =====================================================================

// GET: Liệt kê đơn vị
router.get('/donvi', chiAdmin, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT
                id, ma, ten, ten_ngan, loai, quan_doc, co_dien_truong, so_nhan_luc,
                hoat_dong, ngay_tao,
                (SELECT COUNT(*) FROM thiet_bi WHERE phan_xuong_id = phan_xuong.id) as so_thiet_bi
            FROM phan_xuong
            ORDER BY thu_tu, ten
        `).all();

        res.json({ ok: true, data: list });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Thêm đơn vị
router.post('/donvi', chiAdmin, (req, res) => {
    try {
        const { ma, ten, ten_ngan, loai, quan_doc, co_dien_truong, so_nhan_luc } = req.body;

        if (!ma || !ten) {
            return res.status(400).json({ loi: 'Thiếu mã hoặc tên đơn vị' });
        }

        const co = db.prepare('SELECT COUNT(*) n FROM phan_xuong WHERE ma = ?').get(ma);
        if (co.n > 0) {
            return res.status(400).json({ loi: 'Mã đơn vị đã tồn tại' });
        }

        const info = db.prepare(`
            INSERT INTO phan_xuong (ma, ten, ten_ngan, loai, quan_doc, co_dien_truong, so_nhan_luc, hoat_dong)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(ma, ten, ten_ngan, loai || 'san_xuat', quan_doc, co_dien_truong, so_nhan_luc || 0);

        res.json({ ok: true, id: info.lastInsertRowid, message: 'Tạo đơn vị thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// PHIÊN ĐĂNG NHẬP
// =====================================================================

// GET: Liệt kê phiên active
router.get('/phien-dang-nhap', chiAdmin, (req, res) => {
    try {
        const phien = db.prepare(`
            SELECT
                id, ten_dang_nhap, ho_ten, vai_tro, diaChiIp, createdAt,
                CASE WHEN expiredAt < datetime('now') THEN 1 ELSE 0 END as het_han
            FROM phien
            WHERE expiredAt >= datetime('now')
            ORDER BY createdAt DESC
        `).all();

        res.json({ ok: true, data: phien });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// DELETE: Cắt phiên
router.delete('/phien-dang-nhap/:sid', chiAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM phien WHERE id = ?').run(req.params.sid);
        res.json({ ok: true, message: 'Cắt phiên thành công' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// NHẬT KÝ AUDIT
// =====================================================================

// GET: Liệt kê nhật ký
router.get('/nhat-ky-hoat-dong', chiAdmin, (req, res) => {
    try {
        const { tu_ngay, den_ngay, loai, limit = 100 } = req.query;

        let sql = 'SELECT * FROM audit_quyen WHERE 1=1';
        const params = [];

        if (tu_ngay) {
            sql += ' AND ngay_gio >= ?';
            params.push(tu_ngay);
        }
        if (den_ngay) {
            sql += ' AND ngay_gio <= ?';
            params.push(den_ngay);
        }
        if (loai) {
            sql += ' AND hanh_dong = ?';
            params.push(loai);
        }

        sql += ' ORDER BY ngay_gio DESC LIMIT ?';
        params.push(parseInt(limit));

        const data = db.prepare(sql).all(...params);

        res.json({ ok: true, data });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// =====================================================================
// SAO LƯU DỮ LIỆU
// =====================================================================

// GET: Liệt kê bản sao lưu
router.get('/sao-luu', chiAdmin, (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const backupDir = path.join(__dirname, '..', 'backups');

        if (!fs.existsSync(backupDir)) {
            return res.json({ ok: true, data: [] });
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db'))
            .map(f => {
                const p = path.join(backupDir, f);
                const stat = fs.statSync(p);
                return {
                    file: f,
                    size: stat.size,
                    ngay_tao: new Date(stat.ctime).toISOString()
                };
            })
            .sort((a, b) => new Date(b.ngay_tao) - new Date(a.ngay_tao));

        res.json({ ok: true, data: files });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

// POST: Tạo bản sao lưu
router.post('/sao-luu', chiAdmin, (req, res) => {
    try {
        const { execSync } = require('child_process');
        const fs = require('fs');
        const path = require('path');

        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const now = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
        const backupFile = path.join(backupDir, `qlcd_${now}.db`);

        // Dùng SQLite backup
        db.exec(`VACUUM INTO '${backupFile}'`);

        res.json({
            ok: true,
            file: `qlcd_${now}.db`,
            message: 'Sao lưu thành công'
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

module.exports = router;
