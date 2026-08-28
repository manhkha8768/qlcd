/**
 * LỚP BẢO MẬT KHI CHẠY TRÊN INTERNET
 *
 * Trong mạng nội bộ, kẻ tấn công phải vào được mạng công ty trước.
 * Trên internet thì bất kỳ ai cũng gõ được địa chỉ, nên cần thêm:
 *   - Ép HTTPS
 *   - Header chống nhúng trang và chống đoán kiểu tệp
 *   - Khóa tạm khi dò mật khẩu
 */
const db = require('../db');
const DM = require('../lib/dai-mang');

const LA_INTERNET = process.env.QLCD_INTERNET === '1' || process.env.NODE_ENV === 'production';

/* ---------- Header bảo mật ---------- */
function headerBaoMat(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +   // giao diện dùng onclick nội tuyến
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'; " +
        "base-uri 'self'");

    if (LA_INTERNET) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

/* ---------- Ép HTTPS ---------- */
function epHttps(req, res, next) {
    if (!LA_INTERNET) return next();
    const giaoThuc = req.get('x-forwarded-proto') || req.protocol;
    if (giaoThuc !== 'https') {
        return res.redirect(308, 'https://' + req.get('host') + req.originalUrl);
    }
    next();
}

/* ---------- Chặn dò mật khẩu ---------- */
function cauHinhSo(khoa, macDinh) {
    const v = db.prepare('SELECT gia_tri FROM cau_hinh WHERE khoa=?').get(khoa)?.gia_tri;
    const n = Number(v);
    return isFinite(n) && n > 0 ? n : macDinh;
}

/**
 * Kiểm tra tài khoản hoặc địa chỉ IP có đang bị khóa tạm không.
 * Đếm theo cả hai chiều: một kẻ dò nhiều tài khoản từ một IP cũng bị chặn.
 */
function dangBiKhoa(tenDangNhap, ip) {
    const soLanSai = cauHinhSo('bm_so_lan_sai', 5);
    const phutKhoa = cauHinhSo('bm_phut_khoa', 15);
    const moc = `-${phutKhoa} minutes`;

    const theoTen = db.prepare(`SELECT COUNT(*) n, MAX(thoi_gian) cuoi FROM dang_nhap_that_bai
        WHERE ten_dang_nhap = ? AND thoi_gian > datetime('now','localtime',?)`).get(tenDangNhap, moc);
    const theoIp = db.prepare(`SELECT COUNT(*) n, MAX(thoi_gian) cuoi FROM dang_nhap_that_bai
        WHERE dia_chi_ip = ? AND thoi_gian > datetime('now','localtime',?)`).get(ip || '', moc);

    // Từ một IP cho phép nhiều hơn, vì cả phân xưởng có thể dùng chung đường mạng
    if (theoTen.n >= soLanSai) return { khoa: true, con_lai_phut: phutKhoa, ly_do: 'tai_khoan' };
    if (theoIp.n >= soLanSai * 4) return { khoa: true, con_lai_phut: phutKhoa, ly_do: 'dia_chi' };
    return { khoa: false, da_sai: theoTen.n, con_lai: soLanSai - theoTen.n };
}

function ghiDangNhapSai(tenDangNhap, ip, trinhDuyet) {
    db.prepare(`INSERT INTO dang_nhap_that_bai (ten_dang_nhap, dia_chi_ip, trinh_duyet)
                VALUES (?,?,?)`).run(tenDangNhap || null, ip || null, (trinhDuyet || '').slice(0, 200) || null);
    // Giữ lại 30 ngày cho việc điều tra, quá thì dọn
    db.prepare(`DELETE FROM dang_nhap_that_bai
                WHERE thoi_gian < datetime('now','localtime','-30 days')`).run();
}

function xoaDangNhapSai(tenDangNhap, ip) {
    db.prepare('DELETE FROM dang_nhap_that_bai WHERE ten_dang_nhap=? OR dia_chi_ip=?')
      .run(tenDangNhap, ip || '');
}

/* ---------- Giới hạn tần suất chung ---------- */
const dem = new Map();
function gioiHanTanSuat({ soLan = 300, giay = 60 } = {}) {
    return (req, res, next) => {
        if (!LA_INTERNET) return next();
        const khoa = req.ip || 'khong-ro';
        const gio = Date.now();
        const x = dem.get(khoa);
        if (!x || gio > x.het) {
            dem.set(khoa, { n: 1, het: gio + giay * 1000 });
            return next();
        }
        x.n++;
        if (x.n > soLan) {
            return res.status(429).json({ loi: 'Bạn thao tác quá nhanh, vui lòng chờ một lát rồi thử lại' });
        }
        next();
    };
}
setInterval(() => {
    const gio = Date.now();
    for (const [k, v] of dem) if (gio > v.het) dem.delete(k);
}, 60000).unref?.();

/* ---------- Lọc truy cập theo dải mạng ----------
   Bật lên thì chỉ các mạng đã khai báo mới vào được hệ thống.
   Ba lớp an toàn để không bao giờ tự khóa mình ra ngoài:
     1. Địa chỉ nội bộ máy chủ luôn được vào
     2. Danh sách rỗng thì cho phép tất cả
     3. Biến môi trường QLCD_BO_QUA_DAI_MANG=1 gỡ lọc khi cần cứu hệ thống
*/
function locDaiMang(req, res, next) {
    if (process.env.QLCD_BO_QUA_DAI_MANG === '1') return next();

    const bat = db.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa='bm_loc_dai_mang'").get()?.gia_tri;
    if (bat !== '1') return next();

    const ip = req.ip;
    if (DM.laLoopback(ip)) return next();

    const ds = db.prepare('SELECT * FROM dai_mang WHERE hoat_dong=1').all();
    if (!ds.length) return next();

    // Dải bị chặn có ưu tiên cao hơn dải cho phép
    const bijChan = ds.find(x => !x.cho_phep && DM.trongDai(ip, x.dai));
    const duocPhep = ds.find(x => x.cho_phep && DM.trongDai(ip, x.dai));

    if (bijChan || !duocPhep) {
        try {
            db.prepare(`INSERT INTO truy_cap_bi_chan (dia_chi_ip, duong_dan, trinh_duyet)
                        VALUES (?,?,?)`)
              .run(ip, req.originalUrl?.slice(0, 200) || null,
                   (req.get('user-agent') || '').slice(0, 200) || null);
            db.prepare(`DELETE FROM truy_cap_bi_chan
                        WHERE thoi_gian < datetime('now','localtime','-30 days')`).run();
        } catch (e) { /* không để lỗi ghi log chặn mất phản hồi */ }

        return res.status(403).json({
            loi: 'Hệ thống chỉ cho phép truy cập từ các dải mạng đã đăng ký của Công ty. ' +
                 `Địa chỉ của bạn: ${DM.chuanHoaIp(ip)}. ` +
                 'Liên hệ quản trị để đăng ký thêm dải mạng.',
            dia_chi_cua_ban: DM.chuanHoaIp(ip)
        });
    }

    // Ghi nhận dải nào đang được dùng, phục vụ rà soát định kỳ
    try {
        db.prepare(`UPDATE dai_mang SET lan_truy_cap_cuoi=datetime('now','localtime'),
                    so_lan_truy_cap=so_lan_truy_cap+1 WHERE id=?`).run(duocPhep.id);
    } catch (e) { /* bỏ qua */ }
    next();
}

/* ---------- Kiểm tra cấu hình trước khi chạy ---------- */
function kiemTraCauHinh() {
    const loi = [], nhac = [];
    const bimat = process.env.QLCD_SECRET;

    if (LA_INTERNET) {
        if (!bimat || bimat.length < 32) {
            loi.push('Chưa đặt QLCD_SECRET, hoặc chuỗi ngắn hơn 32 ký tự. ' +
                     'Đây là khóa ký phiên đăng nhập, để mặc định thì bất kỳ ai đọc mã nguồn ' +
                     'cũng giả mạo được phiên của quản trị.');
        }
        try {
            const bcrypt = require('bcryptjs');
            const ad = db.prepare("SELECT mat_khau_hash FROM nguoi_dung WHERE ten_dang_nhap='admin'").get();
            if (ad && bcrypt.compareSync('admin123', ad.mat_khau_hash)) {
                loi.push('Tài khoản admin vẫn dùng mật khẩu khởi tạo admin123. ' +
                         'Phải đổi trước khi mở ra internet.');
            }
        } catch (e) { /* chưa có database thì bỏ qua */ }
    } else if (!bimat) {
        nhac.push('Đang chạy chế độ mạng nội bộ. Khi đưa ra internet nhớ đặt QLCD_SECRET ' +
                  'và biến QLCD_INTERNET=1.');
    }
    return { loi, nhac, la_internet: LA_INTERNET };
}

module.exports = {
    LA_INTERNET, headerBaoMat, epHttps, locDaiMang, dangBiKhoa, ghiDangNhapSai,
    xoaDangNhapSai, gioiHanTanSuat, kiemTraCauHinh, cauHinhSo
};
