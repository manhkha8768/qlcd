/**
 * Test kiểm soát truy cập theo dải mạng.
 *   node test/test-dai-mang.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-dm-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));

const app = require('../server');
const DM = require('../lib/dai-mang');

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dk, ct = '') {
    if (dk) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${ct ? ' -> ' + ct : ''}`); }
}

(async () => {
    // trust proxy để giả lập được địa chỉ đến từ nhiều dải mạng khác nhau
    app.set('trust proxy', true);
    const server = app.listen(0);
    const goc = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';

    /** Gọi API giả lập đến từ một địa chỉ IP cụ thể */
    async function api(dd, tuChoIp = null, tc = {}) {
        const h = { ...(tc.headers || {}) };
        if (cookie) h.Cookie = cookie;
        if (tuChoIp) h['X-Forwarded-For'] = tuChoIp;
        if (tc.body) { h['Content-Type'] = 'application/json'; tc.body = JSON.stringify(tc.body); }
        const res = await fetch(goc + dd, { ...tc, headers: h });
        const sc = res.headers.getSetCookie?.() || [];
        if (sc.length) cookie = sc[0].split(';')[0];
        let data = null;
        try { data = await res.json(); } catch (e) {}
        return { status: res.status, data };
    }

    console.log('\n===== TEST KIỂM SOÁT DẢI MẠNG =====\n');
    try {

    /* ---------- Thuật toán so khớp ---------- */
    ds.push('  --- So khớp địa chỉ với dải mạng ---');
    kt('Địa chỉ trong dải /24', DM.trongDai('192.168.1.55', '192.168.1.0/24'));
    kt('Địa chỉ ngoài dải /24', !DM.trongDai('192.168.2.55', '192.168.1.0/24'));
    kt('Dải lớn /8 chứa mạng VPN', DM.trongDai('10.8.0.6', '10.0.0.0/8'));
    kt('Dải /12 chặn đúng biên', DM.trongDai('172.20.5.1', '172.16.0.0/12') &&
       !DM.trongDai('172.32.5.1', '172.16.0.0/12'));
    kt('Xử lý được IPv4 bọc trong IPv6',
       DM.trongDai('::ffff:192.168.1.55', '192.168.1.0/24'));
    kt('Địa chỉ đơn lẻ khớp chính xác',
       DM.trongDai('113.161.45.7', '113.161.45.7') && !DM.trongDai('113.161.45.8', '113.161.45.7'));
    kt('Khoảng địa chỉ hoạt động',
       DM.trongDai('192.168.1.20', '192.168.1.10-192.168.1.50') &&
       !DM.trongDai('192.168.1.60', '192.168.1.10-192.168.1.50'));
    kt('Dải /32 chỉ khớp đúng một địa chỉ',
       DM.trongDai('192.168.1.1', '192.168.1.1/32') && !DM.trongDai('192.168.1.2', '192.168.1.1/32'));
    kt('Bit thứ 32 không bị tràn số âm',
       DM.trongDai('200.1.1.1', '128.0.0.0/1') && !DM.trongDai('100.1.1.1', '128.0.0.0/1'));
    kt('Nhận diện đúng loại mạng',
       DM.moTaMang('192.168.1.5') === 'Mạng nội bộ' &&
       DM.moTaMang('113.161.45.7') === 'Internet công cộng');
    kt('Chặn định dạng dải sai', !!DM.daiHopLe('192.168.1.0/99'));
    kt('Chấp nhận định dạng dải đúng', DM.daiHopLe('192.168.1.0/24') === null);

    /* ---------- Chẩn đoán kết nối ---------- */
    ds.push('\n  --- Chẩn đoán kết nối ---');
    await api('/api/auth/dang-nhap', null, { method: 'POST',
        body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });

    let rs = await api('/api/mang/toi', '203.113.45.9');
    kt('Người dùng xem được địa chỉ mình đang vào',
       rs.data.dia_chi_cua_ban === '203.113.45.9', rs.data.dia_chi_cua_ban);
    kt('Cho biết đang vào từ loại mạng nào',
       rs.data.loai_mang === 'Internet công cộng', rs.data.loai_mang);
    kt('Gợi ý dải mạng để khai báo nhanh',
       rs.data.goi_y_dai === '203.113.45.0/24', rs.data.goi_y_dai);

    rs = await api('/api/mang/may-chu');
    kt('Máy chủ lắng nghe trên mọi card mạng',
       rs.data.dia_chi_lang_nghe === '0.0.0.0', rs.data.dia_chi_lang_nghe);
    kt('Liệt kê được card mạng của máy chủ', Array.isArray(rs.data.card_mang));

    /* ---------- Chống tự khóa mình ---------- */
    ds.push('\n  --- Chống tự khóa mình ra ngoài ---');
    rs = await api('/api/mang/loc', '203.113.45.9', { method: 'POST', body: { bat: 1 } });
    kt('Chặn bật lọc khi chưa khai dải nào',
       rs.status === 400 && /Chưa khai báo dải mạng nào/.test(rs.data.loi), rs.data.loi);

    rs = await api('/api/mang/dai', '203.113.45.9', { method: 'POST',
        body: { dai: '192.168.1.0/24', ten: 'Mạng văn phòng Công ty', loai: 'noi_bo' } });
    const daiVP = rs.data.id;
    kt('Thêm dải mạng văn phòng', rs.status === 200 && daiVP > 0);

    rs = await api('/api/mang/loc', '203.113.45.9', { method: 'POST', body: { bat: 1 } });
    kt('Chặn bật lọc khi địa chỉ của mình không nằm trong dải nào',
       rs.status === 400 && /tự khóa mình ra ngoài/.test(rs.data.loi), rs.data.loi);
    kt('Gợi ý dải cần thêm', rs.data.goi_y_dai === '203.113.45.0/24');

    /* ---------- Khai báo nhiều dải mạng ---------- */
    ds.push('\n  --- Nhiều dải mạng khác nhau ---');
    const them = async (dai, ten, loai) =>
        (await api('/api/mang/dai', '203.113.45.9', { method: 'POST', body: { dai, ten, loai } })).data.id;

    const daiPX = await them('192.168.5.0/24', 'Mạng PX Đào lò 1', 'phan_xuong');
    const daiVPN = await them('10.8.0.0/24', 'Dải VPN cán bộ đi công trường', 'vpn');
    const daiAdmin = await them('203.113.45.0/24', 'Mạng nhà quản trị', 'khac');
    kt('Khai báo được nhiều dải cho nhiều mạng khác nhau',
       !!daiPX && !!daiVPN && !!daiAdmin);

    rs = await api('/api/mang/dai', '203.113.45.9');
    kt('Danh sách gom đủ 4 dải', rs.data.danh_sach.length === 4, `${rs.data.danh_sach.length}`);

    rs = await api('/api/mang/dai', '203.113.45.9', { method: 'POST',
        body: { dai: '192.168.1.0/24', ten: 'Trùng' } });
    kt('Chặn khai trùng dải', rs.status === 400 && /đã được khai báo/.test(rs.data.loi));

    /* ---------- Bật lọc và kiểm tra từng dải ---------- */
    rs = await api('/api/mang/loc', '203.113.45.9', { method: 'POST', body: { bat: 1 } });
    kt('Bật lọc khi đã có dải phủ địa chỉ của mình', rs.status === 200 && rs.data.dang_bat === true);

    rs = await api('/api/mang/toi', '192.168.1.77');
    kt('Máy ở mạng văn phòng vào được', rs.status === 200);
    rs = await api('/api/mang/toi', '192.168.5.30');
    kt('Máy ở mạng phân xưởng vào được', rs.status === 200);
    rs = await api('/api/mang/toi', '10.8.0.15');
    kt('Máy nối qua VPN vào được', rs.status === 200);

    rs = await api('/api/thiet-bi', '113.22.99.1');
    kt('Máy từ mạng lạ bị chặn', rs.status === 403 && /dải mạng đã đăng ký/.test(rs.data.loi),
       `${rs.status} ${rs.data.loi}`);
    kt('Báo cho người bị chặn biết địa chỉ của họ',
       rs.data.dia_chi_cua_ban === '113.22.99.1', rs.data.dia_chi_cua_ban);

    kt('Ghi nhật ký truy cập bị chặn',
       db.prepare("SELECT COUNT(*) n FROM truy_cap_bi_chan WHERE dia_chi_ip='113.22.99.1'").get().n >= 1);

    rs = await api('/api/mang/bi-chan', '203.113.45.9');
    kt('Quản trị xem được ai đang gõ cửa từ mạng lạ',
       rs.data.some(x => x.dia_chi_ip === '113.22.99.1'));

    /* ---------- Dải bị chặn có ưu tiên cao hơn ---------- */
    ds.push('\n  --- Chặn riêng một địa chỉ ---');
    await api('/api/mang/dai', '203.113.45.9', { method: 'POST',
        body: { dai: '192.168.1.99', ten: 'Máy nghi ngờ bị nhiễm', loai: 'khac', cho_phep: 0 } });
    rs = await api('/api/mang/toi', '192.168.1.99');
    kt('Địa chỉ bị chặn không vào được dù nằm trong dải cho phép', rs.status === 403);
    rs = await api('/api/mang/toi', '192.168.1.98');
    kt('Máy khác cùng dải vẫn vào bình thường', rs.status === 200);

    /* ---------- Không cho tự khóa khi xóa dải ---------- */
    rs = await api('/api/mang/dai/' + daiAdmin, '203.113.45.9', { method: 'DELETE' });
    kt('Chặn xóa dải cuối cùng đang phủ chính mình',
       rs.status === 400 && /không vào được hệ thống nữa/.test(rs.data.loi), rs.data.loi);

    rs = await api('/api/mang/dai/' + daiPX, '203.113.45.9', { method: 'DELETE' });
    kt('Xóa được dải không ảnh hưởng tới mình', rs.status === 200);
    rs = await api('/api/mang/toi', '192.168.5.30');
    kt('Xóa dải xong thì mạng đó không vào được nữa', rs.status === 403);

    /* ---------- Lối thoát khi lỡ tự khóa ---------- */
    ds.push('\n  --- Lối thoát khẩn cấp ---');
    rs = await api('/api/mang/toi', null);   // không giả lập IP, đi từ máy chủ
    kt('Địa chỉ nội bộ máy chủ luôn vào được dù lọc đang bật', rs.status === 200);

    rs = await api('/api/mang/loc', '203.113.45.9', { method: 'POST', body: { bat: 0 } });
    kt('Tắt lọc được', rs.status === 200 && rs.data.dang_bat === false);
    rs = await api('/api/mang/toi', '113.22.99.1');
    kt('Tắt lọc thì mọi mạng vào lại được', rs.status === 200);

    // Danh sách rỗng thì không chặn ai
    db.prepare("UPDATE cau_hinh SET gia_tri='1' WHERE khoa='bm_loc_dai_mang'").run();
    db.prepare('UPDATE dai_mang SET hoat_dong=0').run();
    rs = await api('/api/mang/toi', '113.22.99.1');
    kt('Danh sách rỗng thì cho phép tất cả, không khóa chết hệ thống', rs.status === 200);

    /* ---------- Phân quyền ---------- */
    ds.push('\n  --- Phân quyền ---');
    db.prepare('UPDATE dai_mang SET hoat_dong=1').run();
    db.prepare("UPDATE cau_hinh SET gia_tri='0' WHERE khoa='bm_loc_dai_mang'").run();

    await api('/api/danh-muc/phan-xuong', null, { method: 'POST', body: { ma: 'DL1', ten: 'Đào lò 1' } });
    await api('/api/auth/tai-khoan', null, { method: 'POST',
        body: { ten_dang_nhap: 'px1', mat_khau: 'px123', vai_tro: 'px', phan_xuong_id: 1 } });
    cookie = '';
    await api('/api/auth/dang-nhap', null, { method: 'POST',
        body: { ten_dang_nhap: 'px1', mat_khau: 'px123' } });

    rs = await api('/api/mang/dai', null);
    kt('Người không phải quản trị không xem được danh sách dải', rs.status === 403);
    rs = await api('/api/mang/dai', null, { method: 'POST', body: { dai: '1.1.1.0/24', ten: 'Lén' } });
    kt('Người không phải quản trị không thêm được dải', rs.status === 403);
    rs = await api('/api/mang/loc', null, { method: 'POST', body: { bat: 1 } });
    kt('Người không phải quản trị không bật tắt được lọc', rs.status === 403);
    rs = await api('/api/mang/toi', null);
    kt('Nhưng ai cũng tự xem được kết nối của mình', rs.status === 200);

    } catch (e) {
        ds.push(`  [LỖI]   Dừng giữa chừng: ${e.message}\n          ${e.stack.split('\n')[1]?.trim()}`);
        truot++;
    }

    server.close();
    console.log(ds.join('\n'));
    console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
    try { fs.unlinkSync(DB_TAM); } catch (e) {}
    process.exit(truot ? 1 : 0);
})();
