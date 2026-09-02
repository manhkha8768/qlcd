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
const SH = require('./middleware/security-hardening');
const { auditRoutePolicies } = require('./lib/route-policy-audit');
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
app.use(SH.requestContext);
app.use(BM.epHttps);
app.use(BM.gioiHanTanSuat({ soLan: 300, giay: 60 }));
app.use(BM.locDaiMang);
app.use(SH.protectCrossSiteRequests);

app.use(express.json({ limit: process.env.QLCD_JSON_LIMIT || '2mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 1000 }));

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
    unset: 'destroy',
    store: new KhoPhienSQLite(),
    cookie: {
        maxAge: gioPhien * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        priority: 'high',
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

// Registry dùng chung cho việc mount và audit chính sách route. Nếu một route mới
// quên xác thực, kiểm thử và startup production sẽ báo lỗi thay vì chạy thiếu bảo vệ.
const routeRegistry = [
    ['/api/auth', './routes/auth', [{ method: 'POST', path: '/api/auth/dang-nhap' }]],
    ['/api/danh-muc', './routes/danhmuc'], ['/api/thiet-bi', './routes/thietbi'],
    ['/api/device-master', './routes/device-master'], ['/api/asset-ledger', './routes/asset-ledger'],
    ['/api/inventory', './routes/inventory'], ['/api/technical-profiles', './routes/technical-profile'],
    ['/api/component-tree', './routes/component-tree'], ['/api/documents', './routes/documents'],
    ['/api/materials', './routes/materials'], ['/api/stock-ledger', './routes/stock-ledger'],
    ['/api/warehouse-transfers', './routes/warehouse-transfers'],
    ['/api/ncvt-canonical', './routes/ncvt-canonical'], ['/api/ncvt-canonical', './routes/ncvt-aggregate'],
    ['/api/ncvt-reservations', './routes/ncvt-reservations'], ['/api/ncvt-issues', './routes/ncvt-issues'],
    ['/api/ncvt-receipts', './routes/ncvt-receipts'], ['/api/ncvt-carry-forward', './routes/ncvt-carry-forward'],
    ['/api/ncvt-dashboard', './routes/ncvt-dashboard'], ['/api/technical-operations', './routes/technical-operations'],
    ['/api/notifications', './routes/notifications'], ['/api/reports', './routes/reports'],
    ['/api/tai-san', './routes/taisan'], ['/api/giao-dich', './routes/giaodich'],
    ['/api', './routes/tienich'], ['/api/bao-duong', './routes/baoduong'],
    ['/api/kiem-dinh', './routes/kiemdinh'], ['/api/ky-thuat', './routes/kythuat'],
    ['/api/su-co', './routes/suco'], ['/api/ncvt', './routes/ncvt'], ['/api/mang', './routes/mang'],
    ['/api/import', './routes/import'], ['/api/tong-hop', './routes/tonghop'],
    ['/api/quantri', './routes/quantri'], ['/api/filemau', './routes/filemau'],
    ['/api/kiemke', './routes/kiemke'], ['/api/doichieu', './routes/doichieu'],
    ['/api/khovat', './routes/khovat'], ['/api/dashboard', './routes/dashboard']
].map(([mount, modulePath, publicRoutes = []]) => ({ mount, router: require(modulePath), publicRoutes }));

routeRegistry.forEach(x => app.use(x.mount, x.router));
const routePolicyAudit = auditRoutePolicies(routeRegistry);
app.locals.routePolicyAudit = routePolicyAudit;
if (routePolicyAudit.missing.length) {
    const details = routePolicyAudit.missing.map(x => `${x.method} ${x.path}`).join(', ');
    if (BM.LA_INTERNET) throw new Error(`Route chưa có chính sách xác thực: ${details}`);
    console.warn(`[BẢO MẬT] Route chưa có chính sách xác thực: ${details}`);
}

app.use(express.static(path.join(__dirname, 'public')));

// Xử lý lỗi tập trung
app.use((err, req, res, next) => {
    console.error(`[LỖI ${req.requestId || 'không-rõ'}]`, err.stack || err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ loi: 'File quá lớn (tối đa 30MB)' });
    }
    if (err.code === 'INVALID_FILE_CONTENT' || /Định dạng|Chỉ nhận/.test(err.message || '')) {
        return res.status(400).json({ loi: err.message });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ loi: 'Dữ liệu gửi lên quá lớn' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ loi: 'Dữ liệu JSON không hợp lệ' });
    res.status(500).json({ loi: 'Lỗi hệ thống', ma_tra_cuu: req.requestId });
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
        require('./lib/notification-engine').startNotificationScheduler();
        console.log(`\n  Hệ thống QLCD đang chạy: http://localhost:${CONG}`);
        console.log(`  Database: ${duongDanDB}`);
        console.log(`  Chế độ:   ${BM.LA_INTERNET ? 'INTERNET (đã bật HTTPS, cookie bảo mật, chặn dò mật khẩu)' : 'mạng nội bộ'}\n`);
    });
}

module.exports = app;

