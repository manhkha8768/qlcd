/**
 * Đặt lại mật khẩu admin.
 *   node scripts/dat-lai-mat-khau.js [mật-khẩu-mới]
 */
const bcrypt = require('bcryptjs');
const db = require('../db');
const { passwordLengthError } = require('../lib/password-policy');
const mk = process.argv[2] || 'admin123';

const loiDoDai = passwordLengthError(mk);
if (loiDoDai) {
    console.error('\n  ' + loiDoDai + '\n');
    try { db.close(); } catch (e) { /* đã đóng */ }
    process.exit(1);
}

const u = db.prepare("SELECT id, ten_dang_nhap FROM nguoi_dung WHERE ten_dang_nhap='admin'").get();
if (!u) {
    console.log('\n  Không tìm thấy tài khoản admin. Chạy: node db\\init.js\n');
} else {
    db.prepare(`UPDATE nguoi_dung SET mat_khau_hash=?, phai_doi_mat_khau=1, hoat_dong=1
                WHERE id=?`).run(bcrypt.hashSync(mk, 10), u.id);
    db.prepare('DELETE FROM dang_nhap_that_bai').run();
    db.prepare('DELETE FROM phien_dang_nhap').run();
    console.log('\n  Đã đặt lại mật khẩu admin.');
    console.log('  Đã xóa lịch sử đăng nhập sai và mọi phiên đang mở.');
    console.log('  Đăng nhập xong hệ thống sẽ bắt đổi mật khẩu ngay.\n');
}
try { db.close(); } catch (e) {}
process.exit(0);
