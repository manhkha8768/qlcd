/**
 * HỆ THỐNG QUẢN LÝ THIẾT BỊ CƠ ĐIỆN VẬN TẢI
 * Công ty Xây lắp Mỏ - TKV
 */
const express = require('express');
const session = require('express-session');
const path = require('path');

// Luôn áp dụng migration trước khi nạp middleware/routes (các module này truy cập DB ngay khi require).
// Hàm init không đóng DB hay kết thúc tiến trình khi được gọi từ web server.
const { khoiTaoDatabase } = require('./db/init');
khoiTaoDatabase();

const BM = require('./middleware/bao-mat');
const { KhoPhienSQLite } = require('./lib/phien-sqlite');

const app = express();
const CONG = process.env.PORT || 3000;
// Mặc định lắng nghe mọi card mạng để máy ở dải mạng khác cũng vào được
const DIA_CHI = process.env.QLCD_HOST || '0.0.0.0';

// Dùng cùng path như db/index.js để hiển thị trong log khởi động.
const duongDanDB = process.env.QLCD_DB || path.join(__dirname, 'db', 'qlcd.db');

// Sau proxy (Nginx, Render, Railway) mới đọc đúng địa chỉ IP thật của người dùng
if (BM.LA_INTERNET) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(BM.headerBaoMat);
app.use(BM.epHttps);
app.use(BM.gioiHanTanSuat({ soLan: 300, giay: 60 }));
app.use(BM.locDaiMang);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint - không cần database
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

const gioPhien = Number(process.env.QLCD_PHIEN_GIO) || 8;
app.use(session({
    name: 'qlcd.sid',
    secret: process.env.QLCD_SECRET || 'qlcd-noi-bo-doi-chuoi-nay-khi-trien-khai',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new KhoPhienSQLite(),
    cookie: {
        maxAge: gioPhien * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: BM.LA_INTERNET      // chỉ gửi cookie qua HTTPS khi chạy internet
    }
}));

// Ghi lại nơi phiên được tạo, phục vụ tra cứu khi có sự cố bảo mật
app.use((req, res, next) => {
    if (req.session) {
        req.session.diaChiIp = req.ip;
        req.session.trinhDuyet = req.get('user-agent');
    }
    next();
});

// Load routes với xử lý lỗi
try {
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/danh-muc', require('./routes/danhmuc'));
    app.use('/api/thiet-bi', require('./routes/thietbi'));
    app.use('/api/device-master', require('./routes/device-master'));
    app.use('/api/asset-ledger', require('./routes/asset-ledger'));
    app.use('/api/inventory', require('./routes/inventory'));
    app.use('/api/technical-profiles', require('./routes/technical-profile'));
    app.use('/api/component-tree', require('./routes/component-tree'));
    app.use('/api/documents', require('./routes/documents'));
    app.use('/api/materials', require('./routes/materials'));
    app.use('/api/stock-ledger', require('./routes/stock-ledger'));
    app.use('/api/warehouse-transfers', require('./routes/warehouse-transfers'));
    app.use('/api/ncvt-canonical', require('./routes/ncvt-canonical'));
    app.use('/api/ncvt-canonical', require('./routes/ncvt-aggregate'));
    app.use('/api/ncvt-reservations', require('./routes/ncvt-reservations'));
    app.use('/api/ncvt-issues', require('./routes/ncvt-issues'));
    app.use('/api/ncvt-receipts', require('./routes/ncvt-receipts'));
    app.use('/api/ncvt-carry-forward', require('./routes/ncvt-carry-forward'));
    app.use('/api/tai-san', require('./routes/taisan'));
    app.use('/api/giao-dich', require('./routes/giaodich'));
    app.use('/api', require('./routes/tienich'));
    app.use('/api/bao-duong', require('./routes/baoduong'));
    app.use('/api/kiem-dinh', require('./routes/kiemdinh'));
    app.use('/api/ky-thuat', require('./routes/kythuat'));
    app.use('/api/su-co', require('./routes/suco'));
    app.use('/api/ncvt', require('./routes/ncvt'));
    app.use('/api/mang', require('./routes/mang'));
    app.use('/api/import', require('./routes/import'));
    app.use('/api/tong-hop', require('./routes/tonghop'));
    app.use('/api/quantri', require('./routes/quantri'));
    app.use('/api/filemau', require('./routes/filemau'));
    app.use('/api/kiemke', require('./routes/kiemke'));
    app.use('/api/doichieu', require('./routes/doichieu'));
    app.use('/api/khovat', require('./routes/khovat'));
    app.use('/api/dashboard', require('./routes/dashboard'));
} catch (e) {
    console.error('[!] Lỗi load routes:', e.message);
    // Không exit - để app vẫn chạy với health check endpoint
}

app.use(express.static(path.join(__dirname, 'public')));

// Xử lý lỗi tập trung
app.use((err, req, res, next) => {
    console.error('[LỖI]', err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ loi: 'File quá lớn (tối đa 30MB)' });
    }
    res.status(500).json({ loi: err.message || 'Lỗi hệ thống' });
});

if (require.main === module) {
    const kt = BM.kiemTraCauHinh();
    if (kt.loi.length) {
        console.error('\n  KHÔNG THỂ KHỞI ĐỘNG — cấu hình chưa an toàn để chạy trên internet:\n');
        kt.loi.forEach(x => console.error('   • ' + x + '\n'));
        console.error('  Xem hướng dẫn trong TRIEN-KHAI-INTERNET.txt\n');
        process.exit(1);
    }
    kt.nhac.forEach(x => console.log('\n  Lưu ý: ' + x));

    app.listen(CONG, DIA_CHI, () => {
        console.log(`\n  Hệ thống QLCD đang chạy: http://localhost:${CONG}`);
        console.log(`  Database: ${duongDanDB}`);
        console.log(`  Chế độ:   ${BM.LA_INTERNET ? 'INTERNET (đã bật HTTPS, cookie bảo mật, chặn dò mật khẩu)' : 'mạng nội bộ'}\n`);
    });
}

module.exports = app;

