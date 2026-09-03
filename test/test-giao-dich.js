/**
 * Test kiến trúc giao dịch thống nhất (Giai đoạn 3).
 *   node test/test-giao-dich.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-gd-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));

const app = require('../server');

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dk, ct = '') {
    if (dk) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${ct ? ' -> ' + ct : ''}`); }
}
const homNay = () => new Date().toISOString().slice(0, 10);
const slCua = (id) => db.prepare('SELECT so_luong FROM thiet_bi WHERE id=?').get(id)?.so_luong;
const pxCua = (id) => db.prepare('SELECT phan_xuong_id FROM thiet_bi WHERE id=?').get(id)?.phan_xuong_id;

(async () => {
    const server = app.listen(0);
    const goc = `http://127.0.0.1:${server.address().port}`;
    const phien = {};   // nhiều phiên đăng nhập song song

    function taoApi(ten) {
        return async function api(dd, tc = {}) {
            const h = { ...(tc.headers || {}) };
            if (phien[ten]) h.Cookie = phien[ten];
            if (tc.body) { h['Content-Type'] = 'application/json'; tc.body = JSON.stringify(tc.body); }
            const res = await fetch(goc + dd, { ...tc, headers: h });
            const sc = res.headers.getSetCookie?.() || [];
            if (sc.length) phien[ten] = sc[0].split(';')[0];
            let data = null;
            try { data = await res.json(); } catch (e) {}
            return { status: res.status, data };
        };
    }
    const A = taoApi('admin'), B = taoApi('cd'), C = taoApi('px1'), D = taoApi('px2');
    const dn = (api, u, m) => api('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: u, mat_khau: m } });

    console.log('\n===== TEST KIẾN TRÚC GIAO DỊCH =====\n');
    try {

    /* ---------- Chuẩn bị ---------- */
    await dn(A, 'admin', 'admin123');
    let rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL1', ten: 'Phân xưởng Đào lò 1', ten_ngan: 'DL1' } });
    const px1 = rs.data.id;
    rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL14', ten: 'Phân xưởng Đào lò 14', ten_ngan: 'DL14' } });
    const px14 = rs.data.id;

    rs = await A('/api/danh-muc/vi-tri', { method: 'POST',
        body: { ma: 'LO-CV-120', ten: 'Lò CV mức -120', cap: 3, phan_xuong_id: px14 } });
    const vtDich = rs.data.id;

    await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'cdcty', mat_khau: 'cd123456', ho_ten: 'Cơ điện công ty', vai_tro: 'cd_cty' } });
    await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'px1', mat_khau: 'px123456', ho_ten: 'CĐ Đào lò 1', vai_tro: 'px', phan_xuong_id: px1 } });
    await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'px14', mat_khau: 'px143456', ho_ten: 'CĐ Đào lò 14', vai_tro: 'px', phan_xuong_id: px14 } });
    await dn(B, 'cdcty', 'cd123456'); await dn(C, 'px1', 'px123456'); await dn(D, 'px14', 'px143456');

    const nhom = (m) => db.prepare('SELECT id FROM nhom_thiet_bi WHERE ma=?').get(m).id;
    const taoTB = (ten, ma, nm, px, sl, ng) => db.prepare(`
        INSERT INTO thiet_bi (ma_tb, ten, nhom_id, phan_xuong_id, so_luong, dvt, nguyen_gia,
        gia_tri_con_lai, trang_thai_duyet) VALUES (?,?,?,?,?,'Cái',?,?, 'da_duyet')`)
        .run(ma, ten, nhom(nm), px, sl, ng, ng).lastInsertRowid;

    const tbBom = taoTB('Máy bơm nước 55kW MD155', 'DL1.TN03.001', 'TN.03', px1, 2, 156000000);
    const tbQuat = taoTB('Quạt gió cục bộ YBT-11kW', 'DL1.TN01.001', 'TN.01', px1, 10, 520000000);
    const tbToi = taoTB('Tời trục tải JD-25', 'DL1.VT03.001', 'VT.03', px1, 1, 420000000);
    const tbKD = taoTB('Khởi động từ QBZ-120', 'DL14.CD02.001', 'CD.02', px14, 5, 92500000);

    rs = await C('/api/quyen-cua-toi');
    kt('Tài khoản phân xưởng có quyền lập phiếu', rs.data.quyen.includes('TS_TANG'));
    kt('Tài khoản phân xưởng không có quyền duyệt', !rs.data.quyen.includes('GD_DUYET'));
    rs = await B('/api/quyen-cua-toi');
    kt('Cơ điện công ty có quyền duyệt', rs.data.quyen.includes('GD_DUYET'));
    kt('Cơ điện công ty xem được toàn công ty', rs.data.don_vi === null);

    /* =============== TĂNG TÀI SẢN =============== */
    ds.push('\n  --- Tăng tài sản ---');

    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'tang', ngay_giao_dich: homNay(), ma_ly_do: 'mua_moi',
        ly_do: 'Mua mới bổ sung phục vụ sản xuất', so_van_ban: 'QĐ-45/XLM' } });
    const gdTang = rs.data.id;
    kt('Lập phiếu tăng, sinh mã theo đơn vị và năm',
       /^TANG-DL1-\d{4}-0001$/.test(rs.data.ma_giao_dich), rs.data.ma_giao_dich);

    rs = await C(`/api/giao-dich/${gdTang}/trinh-duyet`, { method: 'POST' });
    kt('Chặn trình duyệt phiếu chưa có dòng chi tiết', rs.status === 400 && /chưa có dòng/.test(rs.data.loi));

    rs = await C(`/api/giao-dich/${gdTang}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBom, so_luong: 1 } });
    kt('Thêm dòng tăng cho tài sản đã có', rs.status === 200 && rs.data.so_luong_truoc === 2);

    rs = await C(`/api/giao-dich/${gdTang}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBom, so_luong: 1 } });
    kt('Chặn thêm trùng tài sản trong cùng phiếu', rs.status === 400);

    rs = await C(`/api/giao-dich/${gdTang}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbKD, so_luong: 1 } });
    kt('Chặn thêm tài sản của đơn vị khác vào phiếu', rs.status === 400 || rs.status === 403);

    rs = await C(`/api/giao-dich/${gdTang}/chi-tiet`, { method: 'POST', body: {
        la_tai_san_moi: 1, so_luong: 3,
        tai_san_moi: { ten: 'Máy bơm chìm 7,5kW', nhom_id: nhom('TN.03'), dvt: 'Cái',
                       nguyen_gia: 45000000, ma_tscd: 'TS-DL1-9001' } } });
    kt('Khai tài sản mới ngay trong phiếu', rs.status === 200 && rs.data.la_tai_san_moi);

    const truocDuyet = db.prepare("SELECT COUNT(*) n FROM thiet_bi WHERE ma_tscd='TS-DL1-9001'").get().n;
    kt('Tài sản mới CHƯA được tạo khi phiếu còn nháp', truocDuyet === 0);
    kt('Số lượng hiện hành CHƯA đổi khi phiếu còn nháp', slCua(tbBom) === 2, String(slCua(tbBom)));

    rs = await C(`/api/giao-dich/${gdTang}/trinh-duyet`, { method: 'POST' });
    kt('Trình duyệt phiếu tăng', rs.status === 200);

    rs = await C(`/api/giao-dich/${gdTang}`, { method: 'PUT', body: { ly_do: 'sửa trộm' } });
    kt('Khóa sửa phiếu sau khi trình duyệt', rs.status === 400);

    rs = await C(`/api/giao-dich/${gdTang}/duyet`, { method: 'POST' });
    kt('Người lập không có quyền duyệt', rs.status === 403);

    rs = await B('/api/giao-dich/cho-duyet');
    kt('Phiếu xuất hiện ở danh sách chờ duyệt', rs.data.kpi.tong === 1 && rs.data.kpi.tang === 1);

    rs = await B(`/api/giao-dich/${gdTang}/duyet`, { method: 'POST' });
    kt('Duyệt phiếu tăng', rs.status === 200);
    kt('Số lượng tài sản đã có: 2 → 3', slCua(tbBom) === 3, String(slCua(tbBom)));

    const tsMoi = db.prepare("SELECT * FROM thiet_bi WHERE ma_tscd='TS-DL1-9001'").get();
    kt('Tài sản mới được tạo khi duyệt', !!tsMoi);
    kt('Tài sản mới sinh mã đúng quy tắc', tsMoi?.ma_tb?.startsWith('DL1.TN03.'), tsMoi?.ma_tb);
    kt('Tài sản mới đúng số lượng và đơn vị',
       tsMoi?.so_luong === 3 && tsMoi?.phan_xuong_id === px1);

    rs = await B(`/api/giao-dich/${gdTang}/duyet`, { method: 'POST' });
    kt('Duyệt lần hai bị chặn (idempotency)',
       rs.status === 409 && /đã được duyệt trước đó/.test(rs.data.loi), rs.data.loi);
    kt('Duyệt lần hai không cộng thêm số lượng', slCua(tbBom) === 3, String(slCua(tbBom)));

    rs = await C(`/api/lich-su-tai-san/${tbBom}`);
    kt('Ghi lịch sử biến động 2 → +1 → 3',
       rs.data[0]?.so_luong_truoc === 2 && rs.data[0]?.so_luong_thay_doi === 1 && rs.data[0]?.so_luong_sau === 3);
    kt('Lịch sử liên kết đúng phiếu', rs.data[0]?.loai_giao_dich === 'tang');

    rs = await C('/api/thong-bao');
    kt('Người lập nhận thông báo phiếu đã duyệt',
       rs.data.danh_sach.some(x => x.loai === 'da_duyet'), JSON.stringify(rs.data.chua_doc));

    /* =============== GIẢM TÀI SẢN =============== */
    ds.push('\n  --- Giảm tài sản ---');

    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ma_ly_do: 'thanh_ly',
        ly_do: 'Thanh lý thiết bị hết khấu hao' } });
    const gdGiam = rs.data.id;
    kt('Lập phiếu giảm', /^GIAM-DL1-\d{4}-0001$/.test(rs.data.ma_giao_dich), rs.data.ma_giao_dich);

    rs = await C(`/api/giao-dich/${gdGiam}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 15 } });
    kt('Chặn giảm vượt số lượng hiện có (10, xin giảm 15)',
       rs.status === 400 && /vượt số lượng hiện có/.test(rs.data.loi), rs.data.loi);

    rs = await C(`/api/giao-dich/${gdGiam}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 2 } });
    kt('Thêm dòng giảm hợp lệ', rs.status === 200);

    await C(`/api/giao-dich/${gdGiam}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdGiam}/duyet`, { method: 'POST' });
    kt('Duyệt phiếu giảm', rs.status === 200);
    kt('Số lượng giảm 10 → 8', slCua(tbQuat) === 8, String(slCua(tbQuat)));

    // Giảm hết số lượng: không xóa bản ghi
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ma_ly_do: 'thanh_ly',
        ly_do: 'Thanh lý toàn bộ tời trục' } });
    const gdGiamHet = rs.data.id;
    await C(`/api/giao-dich/${gdGiamHet}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbToi, so_luong: 1 } });
    await C(`/api/giao-dich/${gdGiamHet}/trinh-duyet`, { method: 'POST' });
    await B(`/api/giao-dich/${gdGiamHet}/duyet`, { method: 'POST' });

    const toiSau = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(tbToi);
    kt('Giảm hết KHÔNG xóa bản ghi tài sản', !!toiSau);
    kt('Giảm hết chuyển trạng thái đã thanh lý', toiSau.trang_thai === 'da_thanh_ly', toiSau.trang_thai);
    kt('Giảm hết thì số lượng về 0', toiSau.so_luong === 0);
    rs = await C(`/api/lich-su-tai-san/${tbToi}`);
    kt('Lịch sử tời trục vẫn còn sau khi thanh lý', rs.data.length > 0);

    /* =============== ĐIỀU CHUYỂN =============== */
    ds.push('\n  --- Điều chuyển ---');

    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'dieu_chuyen', don_vi_dich_id: px1,
        ngay_giao_dich: homNay(), ly_do: 'Test cùng đơn vị' } });
    kt('Chặn điều chuyển trong cùng một đơn vị', rs.status === 400);

    // Điều chuyển một phần: 8 quạt, chuyển 3
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'dieu_chuyen', don_vi_dich_id: px14, ngay_giao_dich: homNay(),
        ly_do: 'Điều động phục vụ đào lò CV mức -120', so_van_ban: 'BB-12/XLM',
        nguoi_giao: 'Nguyễn Văn A', nguoi_nhan: 'Trần Văn B' } });
    const gdDC = rs.data.id;
    kt('Mã điều chuyển chứa cả đơn vị đi và đến',
       /^DC-DL1-DL14-\d{4}-0001$/.test(rs.data.ma_giao_dich), rs.data.ma_giao_dich);

    await C(`/api/giao-dich/${gdDC}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 3, vi_tri_dich_id: vtDich } });
    await C(`/api/giao-dich/${gdDC}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdDC}/duyet`, { method: 'POST' });
    kt('Duyệt điều chuyển một phần', rs.status === 200);

    const kqDC = rs.data.ket_qua[0];
    kt('Đơn vị đi giảm 8 → 5', slCua(tbQuat) === 5, String(slCua(tbQuat)));
    kt('Đơn vị đến nhận 3', kqDC.dich_sau === 3, String(kqDC.dich_sau));
    kt('Tạo bản ghi mới ở đơn vị đến', kqDC.hanh_dong === 'chuyen_mot_phan_tach');
    const quatDich = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(kqDC.thiet_bi_dich_id);
    kt('Bản ghi đích thuộc đơn vị đến', quatDich.phan_xuong_id === px14);
    kt('Bản ghi đích mang mã của đơn vị đến', quatDich.ma_tb.startsWith('DL14.'), quatDich.ma_tb);
    kt('Nguyên giá chia theo tỷ lệ (520tr/10 × 3 = 156tr)',
       Math.round(quatDich.nguyen_gia) === 156000000, String(quatDich.nguyen_gia));
    kt('Nguyên giá nguồn còn lại 260tr',
       Math.round(db.prepare('SELECT nguyen_gia g FROM thiet_bi WHERE id=?').get(tbQuat).g) === 260000000);
    kt('Ghi lịch sử chuyển đi ở nguồn',
       db.prepare(`SELECT COUNT(*) n FROM lich_su_tai_san WHERE thiet_bi_id=? AND loai_su_kien='chuyen_di'`)
         .get(tbQuat).n === 1);
    kt('Ghi lịch sử chuyển đến ở đích',
       db.prepare(`SELECT COUNT(*) n FROM lich_su_tai_san WHERE thiet_bi_id=? AND loai_su_kien='chuyen_den'`)
         .get(quatDich.id).n === 1);

    // Chuyển tiếp một phần nữa: phải gộp vào bản ghi đã có, không tạo thêm
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'dieu_chuyen', don_vi_dich_id: px14, ngay_giao_dich: homNay(),
        ly_do: 'Điều động bổ sung 2 quạt' } });
    const gdDC2 = rs.data.id;
    await C(`/api/giao-dich/${gdDC2}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 2 } });
    await C(`/api/giao-dich/${gdDC2}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdDC2}/duyet`, { method: 'POST' });
    kt('Lần chuyển sau gộp vào bản ghi đích đã có',
       rs.data.ket_qua[0].hanh_dong === 'chuyen_mot_phan_gop', rs.data.ket_qua[0].hanh_dong);
    kt('Không tạo bản ghi trùng ở đơn vị đến',
       rs.data.ket_qua[0].thiet_bi_dich_id === quatDich.id);
    kt('Số lượng đích cộng dồn 3 → 5', slCua(quatDich.id) === 5, String(slCua(quatDich.id)));
    kt('Nhận diện bằng quy tắc mã tài sản kế toán hoặc nhóm',
       ['ma_tscd', 'model', 'nhom_ten_dvt'].includes(rs.data.ket_qua[0].quy_tac_khop),
       rs.data.ket_qua[0].quy_tac_khop);

    // Điều chuyển toàn bộ thiết bị đơn chiếc
    const tbBang = taoTB('Băng tải B650 dài 120m', 'DL1.VT02.001', 'VT.02', px1, 1, 1240000000);
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'dieu_chuyen', don_vi_dich_id: px14, ngay_giao_dich: homNay(),
        ly_do: 'Điều chuyển toàn bộ băng tải sang PX Đào lò 14' } });
    const gdDC3 = rs.data.id;
    await C(`/api/giao-dich/${gdDC3}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBang, so_luong: 1, vi_tri_dich_id: vtDich } });
    await C(`/api/giao-dich/${gdDC3}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdDC3}/duyet`, { method: 'POST' });
    kt('Chuyển toàn bộ: giữ nguyên bản ghi', rs.data.ket_qua[0].hanh_dong === 'chuyen_toan_bo');
    kt('Đơn vị quản lý đổi sang PX Đào lò 14', pxCua(tbBang) === px14, String(pxCua(tbBang)));
    kt('Chuyển toàn bộ giữ nguyên mã thiết bị',
       db.prepare('SELECT ma_tb m FROM thiet_bi WHERE id=?').get(tbBang).m === 'DL1.VT02.001');
    kt('Vị trí lắp đặt cập nhật theo phiếu',
       db.prepare('SELECT vi_tri_id v FROM thiet_bi WHERE id=?').get(tbBang).v === vtDich);
    kt('Lịch sử vị trí đóng mốc cũ và mở mốc mới',
       db.prepare('SELECT COUNT(*) n FROM lich_su_vi_tri WHERE thiet_bi_id=? AND den_ngay IS NULL')
         .get(tbBang).n === 1);
    kt('Ghi cả sự kiện chuyển đi và chuyển đến',
       db.prepare(`SELECT COUNT(*) n FROM lich_su_tai_san WHERE thiet_bi_id=?
                   AND loai_su_kien IN ('chuyen_di','chuyen_den')`).get(tbBang).n === 2);

    /* =============== TRANH CHẤP SỐ LƯỢNG =============== */
    ds.push('\n  --- Tranh chấp số lượng ---');

    const tbCap = taoTB('Cáp điện 3x35+1x16', 'DL1.CD04.001', 'CD.04', px1, 5, 50000000);

    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ma_ly_do: 'hong', ly_do: 'Phiếu A' } });
    const gdA = rs.data.id;
    await C(`/api/giao-dich/${gdA}/chi-tiet`, { method: 'POST', body: { thiet_bi_id: tbCap, so_luong: 4 } });
    await C(`/api/giao-dich/${gdA}/trinh-duyet`, { method: 'POST' });

    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ma_ly_do: 'hong', ly_do: 'Phiếu B' } });
    const gdB = rs.data.id;
    await C(`/api/giao-dich/${gdB}/chi-tiet`, { method: 'POST', body: { thiet_bi_id: tbCap, so_luong: 3 } });
    await C(`/api/giao-dich/${gdB}/trinh-duyet`, { method: 'POST' });
    kt('Hai phiếu cùng giảm một tài sản đều trình duyệt được', true);

    rs = await B(`/api/giao-dich/${gdA}/duyet`, { method: 'POST' });
    kt('Duyệt phiếu A: 5 → 1', rs.status === 200 && slCua(tbCap) === 1, String(slCua(tbCap)));

    rs = await B(`/api/giao-dich/${gdB}/duyet`, { method: 'POST' });
    kt('Duyệt phiếu B bị chặn vì số lượng đã thay đổi',
       rs.status === 409 && /đã thay đổi kể từ khi phiếu được lập/.test(rs.data.loi), rs.data.loi);
    kt('Số lượng không bị âm', slCua(tbCap) === 1, String(slCua(tbCap)));
    kt('Phiếu B vẫn ở trạng thái chờ duyệt',
       db.prepare('SELECT trang_thai t FROM giao_dich WHERE id=?').get(gdB).t === 'cho_duyet');

    /* =============== ROLLBACK =============== */
    ds.push('\n  --- Rollback ---');

    const tbA = taoTB('Goòng 3 tấn', 'DL1.VT06.001', 'VT.06', px1, 10, 180000000);
    const tbB = taoTB('Palăng xích 5 tấn', 'DL1.VT08.001', 'VT.08', px1, 4, 56000000);
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'dieu_chuyen', don_vi_dich_id: px14, ngay_giao_dich: homNay(),
        ly_do: 'Phiếu nhiều dòng để thử rollback' } });
    const gdRB = rs.data.id;
    await C(`/api/giao-dich/${gdRB}/chi-tiet`, { method: 'POST', body: { thiet_bi_id: tbA, so_luong: 5 } });
    await C(`/api/giao-dich/${gdRB}/chi-tiet`, { method: 'POST', body: { thiet_bi_id: tbB, so_luong: 2 } });
    await C(`/api/giao-dich/${gdRB}/trinh-duyet`, { method: 'POST' });

    // Sau khi trình duyệt, tài sản dòng thứ hai bị rút bớt ngoài luồng -> duyệt phải hỏng
    db.prepare('UPDATE thiet_bi SET so_luong=1 WHERE id=?').run(tbB);
    rs = await B(`/api/giao-dich/${gdRB}/duyet`, { method: 'POST' });
    kt('Duyệt thất bại khi một dòng không hợp lệ', rs.status === 409 || rs.status === 400);
    kt('Rollback: dòng thứ nhất KHÔNG bị trừ', slCua(tbA) === 10, String(slCua(tbA)));
    kt('Rollback: đơn vị đến KHÔNG được tăng',
       db.prepare(`SELECT COUNT(*) n FROM thiet_bi WHERE phan_xuong_id=? AND ten='Goòng 3 tấn'`)
         .get(px14).n === 0);
    kt('Rollback: phiếu giữ nguyên trạng thái chờ duyệt',
       db.prepare('SELECT trang_thai t FROM giao_dich WHERE id=?').get(gdRB).t === 'cho_duyet');

    /* =============== TỰ DUYỆT =============== */
    ds.push('\n  --- Tự duyệt & từ chối ---');

    rs = await B('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'tang', don_vi_dich_id: px1, ngay_giao_dich: homNay(),
        ma_ly_do: 'cap_moi', ly_do: 'Cơ điện công ty tự lập' } });
    const gdTuDuyet = rs.data.id;
    await B(`/api/giao-dich/${gdTuDuyet}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBom, so_luong: 1 } });
    await B(`/api/giao-dich/${gdTuDuyet}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdTuDuyet}/duyet`, { method: 'POST' });
    kt('Người lập không được tự duyệt phiếu của mình',
       rs.status === 403 && /không được tự duyệt/.test(rs.data.loi), rs.data.loi);

    rs = await A(`/api/giao-dich/${gdTuDuyet}/duyet`, { method: 'POST' });
    kt('Admin duyệt hộ được', rs.status === 200);

    // Admin có quyền GD_TU_DUYET nên tự duyệt được, nhưng phải ghi nhận vượt quyền
    rs = await A('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'tang', don_vi_dich_id: px1, ngay_giao_dich: homNay(),
        ma_ly_do: 'cap_moi', ly_do: 'Admin tự lập tự duyệt' } });
    const gdAdmin = rs.data.id;
    await A(`/api/giao-dich/${gdAdmin}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBom, so_luong: 1 } });
    await A(`/api/giao-dich/${gdAdmin}/trinh-duyet`, { method: 'POST' });
    rs = await A(`/api/giao-dich/${gdAdmin}/duyet`, { method: 'POST' });
    kt('Admin có quyền tự duyệt', rs.status === 200);
    kt('Ghi nhận cờ tự duyệt vượt quyền',
       db.prepare('SELECT duyet_vuot_quyen d FROM giao_dich WHERE id=?').get(gdAdmin).d === 1);
    kt('Audit ghi lại hành vi tự duyệt',
       db.prepare(`SELECT COUNT(*) n FROM nhat_ky_he_thong
                   WHERE ban_ghi_id=? AND noi_dung LIKE '%tự duyệt vượt quyền%'`).get(gdAdmin).n === 1);

    /* =============== TỪ CHỐI & TRÌNH LẠI =============== */
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ma_ly_do: 'hong', ly_do: 'Thiếu hồ sơ' } });
    const gdTC = rs.data.id;
    await C(`/api/giao-dich/${gdTC}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 1 } });
    await C(`/api/giao-dich/${gdTC}/trinh-duyet`, { method: 'POST' });

    rs = await B(`/api/giao-dich/${gdTC}/tu-choi`, { method: 'POST', body: {} });
    kt('Từ chối bắt buộc nhập lý do', rs.status === 400);

    rs = await B(`/api/giao-dich/${gdTC}/tu-choi`, { method: 'POST',
        body: { ly_do: 'Thiếu biên bản xác nhận hư hỏng' } });
    kt('Từ chối kèm lý do', rs.status === 200);

    rs = await C(`/api/giao-dich/${gdTC}`);
    kt('Người lập xem được lý do từ chối',
       /biên bản xác nhận/.test(rs.data.giao_dich.ly_do_tu_choi));
    kt('Lịch sử trạng thái ghi đủ các bước',
       rs.data.lich_su.map(x => x.hanh_dong).join(',') === 'tao,trinh_duyet,tu_choi',
       rs.data.lich_su.map(x => x.hanh_dong).join(','));

    rs = await C(`/api/giao-dich/${gdTC}`, { method: 'PUT', body: { ly_do: 'Đã bổ sung biên bản' } });
    kt('Phiếu bị từ chối sửa lại được', rs.status === 200);

    await C(`/api/giao-dich/${gdTC}/trinh-duyet`, { method: 'POST' });
    rs = await B(`/api/giao-dich/${gdTC}/duyet`, { method: 'POST' });
    kt('Trình lại và duyệt thành công', rs.status === 200);
    rs = await C(`/api/giao-dich/${gdTC}`);
    kt('Lịch sử ghi nhận lần trình lại',
       rs.data.lich_su.some(x => x.hanh_dong === 'trinh_lai'));

    /* =============== HỦY =============== */
    rs = await C('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', ngay_giao_dich: homNay(), ly_do: 'Phiếu để hủy' } });
    const gdHuy = rs.data.id;
    await C(`/api/giao-dich/${gdHuy}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbQuat, so_luong: 1 } });
    rs = await C(`/api/giao-dich/${gdHuy}/huy`, { method: 'POST', body: { ly_do: 'Lập nhầm' } });
    kt('Hủy được phiếu nháp', rs.status === 200);

    rs = await C(`/api/giao-dich/${gdTC}/huy`, { method: 'POST', body: { ly_do: 'Thử hủy' } });
    kt('Không hủy được phiếu đã duyệt',
       rs.status === 400 && /giao dịch ngược chiều/.test(rs.data.loi));

    /* =============== PHÂN QUYỀN =============== */
    ds.push('\n  --- Phân quyền ---');

    rs = await D('/api/giao-dich');
    const maDL1 = rs.data.filter(x => x.ma_giao_dich.startsWith('TANG-DL1') ||
                                      x.ma_giao_dich.startsWith('GIAM-DL1'));
    kt('PX Đào lò 14 không thấy phiếu nội bộ của PX Đào lò 1', maDL1.length === 0,
       `thấy ${maDL1.length}`);
    kt('PX Đào lò 14 vẫn thấy phiếu điều chuyển đến mình',
       rs.data.some(x => x.ma_giao_dich.includes('DC-DL1-DL14')));

    rs = await D(`/api/giao-dich/${gdTang}`);
    kt('Chặn xem phiếu của đơn vị không liên quan', rs.status === 403);

    rs = await D(`/api/giao-dich/${gdDC}`, { method: 'PUT', body: { ly_do: 'sửa trộm' } });
    kt('Đơn vị nhận chỉ được xem, không sửa phiếu điều chuyển đến',
       rs.status === 403, JSON.stringify(rs.data));

    rs = await D('/api/giao-dich', { method: 'POST', body: {
        loai_giao_dich: 'giam', don_vi_nguon_id: px1, ngay_giao_dich: homNay(), ly_do: 'Giảm hộ' } });
    const gdCheo = rs.data.id;
    const dvCheo = db.prepare('SELECT don_vi_nguon_id d FROM giao_dich WHERE id=?').get(gdCheo)?.d;
    kt('Khai đơn vị khác vẫn bị ép về đơn vị của mình', dvCheo === px14, String(dvCheo));

    rs = await D(`/api/giao-dich/${gdCheo}/chi-tiet`, { method: 'POST',
        body: { thiet_bi_id: tbBom, so_luong: 1 } });
    kt('Backend chặn đưa tài sản đơn vị khác vào phiếu',
       rs.status === 400 || rs.status === 403, String(rs.status));

    rs = await D(`/api/lich-su-tai-san/${tbBom}`);
    kt('Chặn xem lịch sử tài sản đơn vị khác', rs.status === 403);

    rs = await D('/api/giao-dich/cho-duyet');
    kt('Tài khoản không có quyền duyệt thấy danh sách rỗng', rs.data.duoc_duyet === false);

    /* =============== THỐNG KÊ =============== */
    rs = await B('/api/giao-dich/thong-ke');
    kt('Thống kê đếm được phiếu tăng trong tháng', rs.data.tang_trong_thang >= 1);
    kt('Thống kê có dữ liệu biến động theo tháng', rs.data.bien_dong.length > 0);
    kt('Thống kê có danh sách giao dịch gần đây', rs.data.gan_day.length > 0);

    rs = await B('/api/giao-dich?q=Đào lò 14');
    kt('Tìm kiếm giao dịch theo từ khóa', Array.isArray(rs.data));
    rs = await B('/api/giao-dich?loai=dieu_chuyen');
    kt('Lọc theo loại giao dịch', rs.data.every(x => x.loai_giao_dich === 'dieu_chuyen'));

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
