/**
 * Kho lưu phiên đăng nhập trên SQLite.
 *
 * Thay cho bộ nhớ tạm mặc định của express-session. Lý do:
 *   - Khởi động lại máy chủ không làm mọi người bị đăng xuất
 *   - Bộ nhớ không phình dần theo số lượt đăng nhập
 *   - Quản trị nhìn được ai đang đăng nhập và cắt phiên từ xa khi cần
 */
const session = require('express-session');
const db = require('../db');

const Store = session.Store;

class KhoPhienSQLite extends Store {
    constructor() {
        super();
        // Dọn phiên hết hạn mỗi 15 phút
        this.hen = setInterval(() => this.donDep(), 15 * 60 * 1000);
        if (this.hen.unref) this.hen.unref();
        this.donDep();
    }

    get(sid, cb) {
        try {
            const r = db.prepare('SELECT du_lieu, het_han FROM phien_dang_nhap WHERE sid=?').get(sid);
            if (!r) return cb(null, null);
            if (r.het_han < Date.now()) {
                db.prepare('DELETE FROM phien_dang_nhap WHERE sid=?').run(sid);
                return cb(null, null);
            }
            cb(null, JSON.parse(r.du_lieu));
        } catch (e) { cb(e); }
    }

    set(sid, phien, cb) {
        try {
            const hetHan = phien.cookie?.expires
                ? new Date(phien.cookie.expires).getTime()
                : Date.now() + (phien.cookie?.maxAge || 8 * 3600 * 1000);

            db.prepare(`INSERT INTO phien_dang_nhap (sid, du_lieu, nguoi_dung_id, dia_chi_ip, trinh_duyet, het_han)
                        VALUES (?,?,?,?,?,?)
                        ON CONFLICT(sid) DO UPDATE SET
                            du_lieu=excluded.du_lieu, nguoi_dung_id=excluded.nguoi_dung_id,
                            dia_chi_ip=excluded.dia_chi_ip, het_han=excluded.het_han`)
              .run(sid, JSON.stringify(phien), phien.nguoiDung?.id || null,
                   phien.diaChiIp || null, (phien.trinhDuyet || '').slice(0, 200) || null, hetHan);
            cb(null);
        } catch (e) { cb(e); }
    }

    destroy(sid, cb) {
        try { db.prepare('DELETE FROM phien_dang_nhap WHERE sid=?').run(sid); cb(null); }
        catch (e) { cb(e); }
    }

    touch(sid, phien, cb) {
        try {
            const hetHan = Date.now() + (phien.cookie?.maxAge || 8 * 3600 * 1000);
            db.prepare('UPDATE phien_dang_nhap SET het_han=? WHERE sid=?').run(hetHan, sid);
            cb(null);
        } catch (e) { cb(e); }
    }

    length(cb) {
        try { cb(null, db.prepare('SELECT COUNT(*) n FROM phien_dang_nhap').get().n); }
        catch (e) { cb(e); }
    }

    clear(cb) {
        try { db.prepare('DELETE FROM phien_dang_nhap').run(); cb(null); }
        catch (e) { cb(e); }
    }

    donDep() {
        try { db.prepare('DELETE FROM phien_dang_nhap WHERE het_han < ?').run(Date.now()); }
        catch (e) { /* database có thể đang bận, lần sau dọn tiếp */ }
    }
}

/** Cắt toàn bộ phiên của một tài khoản, dùng khi khóa tài khoản hoặc mất máy */
function catPhienCuaNguoi(nguoiDungId) {
    return db.prepare('DELETE FROM phien_dang_nhap WHERE nguoi_dung_id=?').run(nguoiDungId).changes;
}

function danhSachPhien() {
    return db.prepare(`
        SELECT p.sid, p.nguoi_dung_id, p.dia_chi_ip, p.trinh_duyet, p.ngay_tao,
               datetime(p.het_han/1000, 'unixepoch', 'localtime') AS het_han,
               nd.ten_dang_nhap, nd.ho_ten, nd.vai_tro
        FROM phien_dang_nhap p
        LEFT JOIN nguoi_dung nd ON nd.id = p.nguoi_dung_id
        WHERE p.het_han > ? ORDER BY p.ngay_tao DESC`).all(Date.now());
}

module.exports = { KhoPhienSQLite, catPhienCuaNguoi, danhSachPhien };
