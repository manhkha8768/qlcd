/**
 * Khởi tạo database: chạy các file .sql theo thứ tự tên file,
 * sau đó tạo tài khoản admin đầu tiên nếu chưa có.
 *
 *   node db/init.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');

function chayMigration() {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        ten_file TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        ngay_ap_dung TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    const files = fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const f of files) {
        const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const daChay = db.prepare(
            'SELECT checksum_sha256 FROM schema_migrations WHERE ten_file=?'
        ).get(f);
        if (daChay) {
            if (daChay.checksum_sha256 !== checksum) {
                throw new Error(`Migration ${f} đã bị thay đổi sau khi áp dụng`);
            }
            console.log(`  [ĐÃ CÓ] ${f}`);
            continue;
        }
        try {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (ten_file, checksum_sha256) VALUES (?,?)')
                .run(f, checksum);
            console.log(`  [OK]   ${f}`);
        } catch (e) {
            // Bỏ qua các lỗi phát sinh do chạy lại trên database đã có.
            // SQLite báo mỗi kiểu một khác: bảng và chỉ mục nói "already exists",
            // còn ALTER TABLE ADD COLUMN nói "duplicate column name".
            if (/already exists|duplicate column name/i.test(e.message)) {
                db.prepare('INSERT INTO schema_migrations (ten_file, checksum_sha256) VALUES (?,?)')
                    .run(f, checksum);
                console.log(`  [BỎ QUA] ${f} - đã áp dụng trước đó`);
            } else {
                console.error(`  [LỖI]  ${f}: ${e.message}`);
                throw e;
            }
        }
    }
}

function taoAdmin() {
    const co = db.prepare("SELECT COUNT(*) n FROM nguoi_dung WHERE vai_tro='admin'").get().n;
    if (co > 0) {
        console.log('  Tài khoản admin đã tồn tại - bỏ qua');
        return;
    }
    const matKhau = process.env.QLCD_ADMIN_PASS || 'admin123';
    // Dùng mật khẩu khởi tạo thì bắt đổi ngay ở lần đăng nhập đầu tiên
    const laMacDinh = !process.env.QLCD_ADMIN_PASS ? 1 : 0;
    db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, chuc_vu, vai_tro,
                phai_doi_mat_khau) VALUES (?,?,?,?,'admin',?)`)
      .run('admin', bcrypt.hashSync(matKhau, 10), 'Quản trị hệ thống', 'Admin', laMacDinh);
    console.log(`  Đã tạo tài khoản admin / ${matKhau}  <-- ĐỔI MẬT KHẨU NGAY SAU KHI ĐĂNG NHẬP`);
}

function khoiTaoDatabase() {
    console.log('Khởi tạo database:', db.DB_PATH || '');
    chayMigration();
    taoAdmin();

    const dem = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    console.log('\nTóm tắt:');
    console.log('  Nhóm thiết bị :', dem('nhom_thiet_bi'));
    console.log('  Loại kiểm định:', dem('loai_kiem_dinh'));
    console.log('  Từ khoá nhận diện nhóm:', dem('tu_khoa_nhom'));
    console.log('  Phân xưởng    :', dem('phan_xuong'), '(admin tự thêm trong phần Quản trị)');
    return db;
}

/**
 * Đóng database và thoát dứt khoát.
 *
 * Trên Windows, thư viện better-sqlite3 đăng ký một móc dọn dẹp với Node.
 * Khi tiến trình tự kết thúc, Node dọn môi trường trước rồi mới gỡ móc,
 * gây lỗi "Assertion failed: (env) != nullptr" tuy dữ liệu đã ghi xong.
 * Đóng tay rồi thoát ngay sẽ tránh được đường dẫn code đó.
 */
if (require.main === module) {
    try {
        khoiTaoDatabase();
        console.log('\nXong. Chạy: npm start');
        db.close();
        process.exit(0);
    } catch (e) {
        console.error('\nKhông thể khởi tạo database:', e.message);
        try { db.close(); } catch (_) { /* đã đóng sẵn */ }
        process.exit(1);
    }
}

module.exports = { khoiTaoDatabase };

