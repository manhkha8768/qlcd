/**
 * Test Giai đoạn 4: hồ sơ kỹ thuật vòng đời thiết bị.
 *   node test/test-ky-thuat.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-kt-' + Date.now() + '.db');
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

(async () => {
    const server = app.listen(0);
    const goc = `http://127.0.0.1:${server.address().port}`;
    const phien = {};

    function taoApi(ten) {
        return async function (dd, tc = {}) {
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
    const A = taoApi('admin'), P1 = taoApi('px1'), P2 = taoApi('px2');
    const dn = (api, u, m) => api('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: u, mat_khau: m } });

    console.log('\n===== TEST GIAI ĐOẠN 4: HỒ SƠ KỸ THUẬT =====\n');
    try {

    /* ---------- Chuẩn bị ---------- */
    await dn(A, 'admin', 'admin123');
    let rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL1', ten: 'Phân xưởng Đào lò 1', ten_ngan: 'DL1' } });
    const px1 = rs.data.id;
    rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL14', ten: 'Phân xưởng Đào lò 14', ten_ngan: 'DL14' } });
    const px14 = rs.data.id;

    await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'px1', mat_khau: 'px123456', vai_tro: 'px', phan_xuong_id: px1 } });
    await A('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'px14', mat_khau: 'px143456', vai_tro: 'px', phan_xuong_id: px14 } });
    await dn(P1, 'px1', 'px123456'); await dn(P2, 'px14', 'px143456');

    const nhom = (m) => db.prepare('SELECT id FROM nhom_thiet_bi WHERE ma=?').get(m).id;
    rs = await A('/api/thiet-bi', { method: 'POST', body: {
        ten: 'Băng tải B650 dài 120m', nhom_id: nhom('VT.02'), phan_xuong_id: px1,
        nguyen_gia: 1240000000, ngay_su_dung: '2024-01-15' } });
    const tbBang = rs.data.id;
    rs = await A('/api/thiet-bi', { method: 'POST', body: {
        ten: 'Máy bơm nước MD155', nhom_id: nhom('TN.03'), phan_xuong_id: px14, nguyen_gia: 78000000 } });
    const tbBom = rs.data.id;

    /* =============== THÔNG SỐ ĐỘNG =============== */
    ds.push('\n  --- Thông số kỹ thuật động ---');

    rs = await A('/api/ky-thuat/dinh-nghia-thong-so?nhom_id=' + nhom('VT.02'));
    kt('Nhóm băng tải có sẵn bộ thông số riêng', rs.data.length >= 7, `${rs.data.length} thông số`);
    kt('Có thông số chiều rộng băng',
       rs.data.some(x => x.ma_thong_so === 'CHIEU_RONG_BANG'));

    rs = await A('/api/ky-thuat/dinh-nghia-thong-so?nhom_id=' + nhom('TN.03'));
    kt('Nhóm máy bơm có bộ thông số khác hẳn',
       rs.data.some(x => x.ma_thong_so === 'LUU_LUONG') &&
       !rs.data.some(x => x.ma_thong_so === 'CHIEU_RONG_BANG'));

    rs = await A('/api/ky-thuat/thiet-bi/' + tbBang + '/thong-so');
    const dsTS = rs.data;
    kt('Thiết bị hiện đủ ô thông số dù chưa nhập', dsTS.length >= 7);
    kt('Chưa nhập thì giá trị để trống', dsTS.every(x => x.gia_tri_so === null && x.gia_tri_chu === null));

    const idCua = (ma) => dsTS.find(x => x.ma_thong_so === ma).dinh_nghia_id;
    rs = await A('/api/ky-thuat/thiet-bi/' + tbBang + '/thong-so', { method: 'PUT', body: [
        { dinh_nghia_id: idCua('CHIEU_RONG_BANG'), gia_tri: 650 },
        { dinh_nghia_id: idCua('TOC_DO_BANG'), gia_tri: 1.6 },
        { dinh_nghia_id: idCua('CONG_SUAT_DC'), gia_tri: 55 },
        { dinh_nghia_id: idCua('DIEN_AP'), gia_tri: '660/1140' }
    ] });
    kt('Lưu giá trị thông số', rs.status === 200);

    rs = await A('/api/ky-thuat/thiet-bi/' + tbBang + '/thong-so');
    const ts = Object.fromEntries(rs.data.map(x => [x.ma_thong_so, x]));
    kt('Thông số kiểu số lưu vào cột số', ts.CHIEU_RONG_BANG.gia_tri_so === 650);
    kt('Thông số kiểu chữ lưu vào cột chữ', ts.DIEN_AP.gia_tri_chu === '660/1140');
    kt('Thông số thập phân đúng giá trị', ts.TOC_DO_BANG.gia_tri_so === 1.6);

    rs = await A('/api/ky-thuat/thiet-bi/' + tbBang + '/thong-so', { method: 'PUT', body: [
        { dinh_nghia_id: idCua('CONG_SUAT_DC'), gia_tri: 75 } ] });
    rs = await A('/api/ky-thuat/thiet-bi/' + tbBang + '/thong-so');
    kt('Cập nhật lại thông số không tạo bản ghi trùng',
       rs.data.filter(x => x.ma_thong_so === 'CONG_SUAT_DC').length === 1 &&
       rs.data.find(x => x.ma_thong_so === 'CONG_SUAT_DC').gia_tri_so === 75);

    /* =============== CÂY CẤU TRÚC =============== */
    ds.push('\n  --- Cấu trúc thiết bị dạng cây ---');

    const themCum = (b) => A(`/api/ky-thuat/thiet-bi/${tbBang}/cum`, { method: 'POST', body: b });

    rs = await themCum({ ten: 'Cụm truyền động', loai_cum: 'cum' });
    const cumTD = rs.data.id;
    kt('Thêm cụm cấp 1', rs.status === 200 && cumTD > 0);

    rs = await themCum({ ten: 'Động cơ 55kW', cha_id: cumTD, loai_cum: 'chi_tiet',
                         model: 'YB3-250M-4', so_seri: 'DC-2024-118' });
    const cumDC = rs.data.id;
    kt('Thêm cụm con cấp 2', rs.status === 200 && cumDC > 0);

    rs = await themCum({ ten: 'Hộp giảm tốc', cha_id: cumTD, loai_cum: 'chi_tiet' });
    const cumHGT = rs.data.id;

    rs = await themCum({ ten: 'Cụm tang', loai_cum: 'cum' });
    const cumTang = rs.data.id;
    rs = await themCum({ ten: 'Tang chủ động', cha_id: cumTang });
    const cumTangCD = rs.data.id;
    rs = await themCum({ ten: 'Gối đỡ', cha_id: cumTangCD });
    const cumGoiDo = rs.data.id;
    rs = await themCum({ ten: 'Vòng bi 22218', cha_id: cumGoiDo, loai_cum: 'chi_tiet',
                         ma_phu_tung: '22218', so_seri: 'VB-A-001' });
    const cumVongBi = rs.data.id;
    kt('Thêm được cụm ở cấp sâu thứ 4', rs.status === 200 && cumVongBi > 0);

    rs = await A(`/api/ky-thuat/thiet-bi/${tbBang}/cay`);
    const cay = rs.data.cay;
    kt('Cây trả về 2 nhánh gốc', cay.length === 2, `${cay.length} nhánh`);
    const nhanhTang = cay.find(x => x.ten === 'Cụm tang');
    kt('Nhánh cụm tang lồng đúng 4 cấp',
       nhanhTang?.con?.[0]?.con?.[0]?.con?.[0]?.ten === 'Vòng bi 22218',
       JSON.stringify(nhanhTang?.con?.[0]?.con?.[0]?.con?.[0]?.ten));
    kt('Đếm đúng số cụm con', cay.find(x => x.ten === 'Cụm truyền động').con.length === 2);

    // Di chuyển nút
    rs = await A(`/api/ky-thuat/cum/${cumHGT}/di-chuyen`, { method: 'POST', body: { cha_id: cumTangCD } });
    kt('Di chuyển cụm sang nhánh khác', rs.status === 200 && rs.data.cha_id === cumTangCD,
       JSON.stringify(rs.data));

    rs = await A(`/api/ky-thuat/cum/${cumTang}/di-chuyen`, { method: 'POST', body: { cha_id: cumVongBi } });
    kt('Chặn chuyển cụm vào chính cây con của nó',
       rs.status === 400 && /cây con/.test(rs.data.loi || ''), JSON.stringify(rs.data));

    rs = await A(`/api/ky-thuat/cum/${cumTang}/di-chuyen`, { method: 'POST', body: { cha_id: cumTang } });
    kt('Chặn đặt cụm làm cha của chính nó', rs.status === 400);

    /* --- Thay thế cụm --- */
    rs = await A(`/api/ky-thuat/cum/${cumVongBi}/thay-the`, { method: 'POST', body: {
        ten: 'Vòng bi 22218', so_seri: 'VB-B-002', ly_do: 'Vòng bi cũ rơ, thay mới' } });
    const cumVBMoi = rs.data.cum_moi_id;
    kt('Thay thế cụm tạo cụm mới', rs.status === 200 && cumVBMoi > 0);

    const vbCu = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(cumVongBi);
    kt('Cụm cũ KHÔNG bị xóa', !!vbCu);
    kt('Cụm cũ chuyển trạng thái đã thay thế', vbCu.trang_thai === 'da_thay_the', vbCu.trang_thai);
    kt('Cụm cũ bị ẩn khỏi cây đang hoạt động', vbCu.hoat_dong === 0);

    const vbMoi = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(cumVBMoi);
    kt('Cụm mới kế thừa đúng vị trí trong cây', vbMoi.cha_id === cumGoiDo);
    kt('Cụm mới mang số seri mới', vbMoi.so_seri === 'VB-B-002');

    kt('Ghi lịch sử tháo ra ở cụm cũ',
       db.prepare("SELECT COUNT(*) n FROM lich_su_cum WHERE cum_id=? AND loai_su_kien='thao_ra'")
         .get(cumVongBi).n === 1);
    kt('Ghi lịch sử thay thế ở cụm mới',
       db.prepare("SELECT COUNT(*) n FROM lich_su_cum WHERE cum_id=? AND loai_su_kien='thay_the'")
         .get(cumVBMoi).n === 1);
    kt('Hai cụm cùng gắn với một sự kiện thay thế',
       db.prepare("SELECT COUNT(*) n FROM lich_su_cum WHERE cum_id IN (?,?)").get(cumVongBi, cumVBMoi).n >= 3);

    rs = await A(`/api/ky-thuat/thiet-bi/${tbBang}/cay`);
    kt('Cây hiện hành chỉ còn cụm mới, cụm đã thay bị ẩn',
       JSON.stringify(rs.data).includes('VB-B-002') && !JSON.stringify(rs.data).includes('VB-A-001'));

    /* =============== SỰ CỐ =============== */
    ds.push('\n  --- Sự cố ---');

    rs = await P1('/api/su-co', { method: 'POST', body: {
        thiet_bi_id: tbBang, cum_id: cumHGT, muc_do: 'nghiem_trong',
        hien_tuong: 'Hộp giảm tốc rung mạnh, có tiếng kêu bất thường',
        mo_ta: 'Phát hiện đầu ca 2, rung tăng dần theo tải',
        dung_thiet_bi: 1, thoi_gian_dung_phut: 180 } });
    const sc1 = rs.data.id;
    kt('Báo sự cố', rs.status === 200 && !!rs.data.id, JSON.stringify(rs.data).slice(0, 80));

    rs = await P1('/api/su-co', { method: 'POST', body: {
        thiet_bi_id: tbBang, hien_tuong: '' } });
    kt('Bắt buộc mô tả hiện tượng', rs.status === 400);

    rs = await P2('/api/su-co', { method: 'POST', body: {
        thiet_bi_id: tbBang, hien_tuong: 'Báo hộ đơn vị khác' } });
    kt('Chặn báo sự cố cho thiết bị đơn vị khác', rs.status === 403);

    const tbSau = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(tbBang);
    kt('Sự cố dừng máy chuyển thiết bị sang đang sửa',
       tbSau.trang_thai === 'dang_sua', tbSau.trang_thai);

    rs = await P1('/api/su-co?dang_mo=1');
    kt('Lọc được sự cố đang mở', rs.data.length >= 1);

    rs = await P2('/api/su-co');
    kt('Phân xưởng khác không thấy sự cố này',
       !rs.data.some(x => x.id === sc1), `thấy ${rs.data.length}`);

    rs = await P1(`/api/su-co/${sc1}/dong`, { method: 'POST', body: {} });
    kt('Chặn đóng sự cố khi chưa có nguyên nhân thực tế', rs.status === 400 || rs.status === 403,
       JSON.stringify(rs.data));

    /* =============== TÀI LIỆU KỸ THUẬT =============== */
    ds.push('\n  --- Tài liệu kỹ thuật ---');

    const fd = new FormData();
    fd.append('file', new Blob(['So do dien bang tai B650']), 'so-do-dien.txt');
    fd.append('loai_tai_lieu', 'so_do_dien');
    fd.append('ten_tai_lieu', 'Sơ đồ điện băng tải B650');
    const resTL = await fetch(`${goc}/api/ky-thuat/thiet-bi/${tbBang}/tai-lieu`,
        { method: 'POST', body: fd, headers: { Cookie: phien['admin'] } });
    const dataTL = await resTL.json();
    kt('Tải tài liệu kỹ thuật lên', resTL.status === 200 && !!dataTL.id,
       JSON.stringify(dataTL).slice(0, 80));

    rs = await A(`/api/ky-thuat/thiet-bi/${tbBang}/tai-lieu`);
    const dsTL = rs.data.danh_sach || rs.data;
    kt('Danh sách tài liệu của thiết bị', dsTL.length === 1, JSON.stringify(rs.data).slice(0, 100));
    kt('Phân loại đúng nhóm tài liệu', dsTL[0]?.loai_tai_lieu === 'so_do_dien');
    kt('Tài liệu được gom theo loại để hiển thị dạng cây',
       !!rs.data.theo_loai && Array.isArray(rs.data.theo_loai.so_do_dien));

    rs = await P2(`/api/ky-thuat/thiet-bi/${tbBang}/tai-lieu`);
    kt('Chặn xem tài liệu thiết bị đơn vị khác', rs.status === 403);

    /* =============== CHI PHÍ VÒNG ĐỜI =============== */
    ds.push('\n  --- Chi phí vòng đời ---');

    // Tạo dữ liệu chi phí: 1 phiếu sửa chữa hoàn thành
    rs = await P1('/api/bao-duong/phieu', { method: 'POST', body: {
        thiet_bi_id: tbBang, loai: 'sua_chua', mo_ta_hu_hong: 'Thay vòng bi tang chủ động',
        chi_phi_nhan_cong: 1000000, chi_phi_khac: 500000 } });
    const psc = rs.data.id;
    await P1(`/api/bao-duong/phieu/${psc}/vat-tu`, { method: 'POST', body: [
        { ten_vthh: 'Vòng bi 22218', dvt: 'Cái', so_luong: 2, don_gia: 1000000 } ] });
    await P1(`/api/bao-duong/phieu/${psc}/gui-duyet`, { method: 'POST' });
    await A(`/api/bao-duong/phieu/${psc}/dong-y`, { method: 'POST' });
    rs = await P1(`/api/bao-duong/phieu/${psc}/hoan-thanh`, { method: 'POST',
        body: { thoi_gian_dung_may: 6 } });
    kt('Hoàn thành phiếu sửa chữa', rs.status === 200);

    const pscDB = db.prepare('SELECT * FROM phieu_sua_chua WHERE id=?').get(psc);
    kt('Tổng chi phí = nhân công + vật tư + khác (1tr + 2tr + 0,5tr)',
       pscDB.tong_chi_phi === 3500000, String(pscDB.tong_chi_phi));

    rs = await A(`/api/ky-thuat/thiet-bi/${tbBang}/chi-phi`);
    const cp = rs.data;
    kt('Chi phí vòng đời lấy đúng tổng sửa chữa',
       (cp.tong_hop?.chi_phi_sua_chua ?? cp.chi_phi_sua_chua) === 3500000,
       JSON.stringify(cp).slice(0, 120));
    kt('Có tách cơ cấu vật tư để phân tích',
       JSON.stringify(cp).includes('vat_tu'));
    kt('Không cộng trùng vật tư vào tổng',
       (cp.tong_hop?.tong_chi_phi ?? cp.tong_chi_phi) === 3500000,
       String(cp.tong_hop?.tong_chi_phi ?? cp.tong_chi_phi));

    /* =============== LÝ LỊCH TỔNG HỢP =============== */
    ds.push('\n  --- Lý lịch thiết bị ---');

    rs = await A(`/api/ky-thuat/thiet-bi/${tbBang}/timeline`);
    const tl = rs.data.su_kien || rs.data;
    kt('Lý lịch gom sự kiện từ nhiều nguồn', Array.isArray(tl) && tl.length >= 3,
       `${Array.isArray(tl) ? tl.length : 0} sự kiện`);
    const nhomSK = new Set((tl || []).map(x => x.nhom));
    kt('Lý lịch có sự kiện sự cố', nhomSK.has('su_co'), [...nhomSK].join(','));
    kt('Lý lịch có sự kiện sửa chữa', nhomSK.has('sua_chua'));
    kt('Lý lịch có sự kiện thay linh kiện', nhomSK.has('linh_kien'), [...nhomSK].join(','));
    kt('Lý lịch sắp xếp giảm dần theo thời gian',
       (tl || []).every((x, i, a) => i === 0 || String(a[i - 1].ngay || '') >= String(x.ngay || '')));

    rs = await P2(`/api/ky-thuat/thiet-bi/${tbBang}/timeline`);
    kt('Chặn xem lý lịch thiết bị đơn vị khác', rs.status === 403);

    /* =============== PHÂN QUYỀN =============== */
    ds.push('\n  --- Phân quyền ---');

    rs = await P2(`/api/ky-thuat/thiet-bi/${tbBang}/cay`);
    kt('Chặn xem cấu trúc thiết bị đơn vị khác', rs.status === 403);

    rs = await P2(`/api/ky-thuat/thiet-bi/${tbBang}/cum`, { method: 'POST',
        body: { ten: 'Cụm chui vào' } });
    kt('Chặn thêm cụm vào thiết bị đơn vị khác', rs.status === 403);

    rs = await P2(`/api/ky-thuat/thiet-bi/${tbBang}/thong-so`, { method: 'PUT', body: [] });
    kt('Chặn sửa thông số thiết bị đơn vị khác', rs.status === 403);

    rs = await A('/api/quyen-cua-toi');
    kt('Admin có đủ quyền kỹ thuật mới',
       ['CUM_TAO', 'SU_CO_TAO', 'TAI_LIEU_TAI_LEN', 'PHU_TUNG_SUA'].every(q => rs.data.quyen.includes(q)),
       rs.data.quyen.filter(q => /CUM|SU_CO|TAI_LIEU|PHU_TUNG/.test(q)).join(','));

    rs = await P1('/api/quyen-cua-toi');
    kt('Phân xưởng có quyền báo sự cố', rs.data.quyen.includes('SU_CO_TAO'));
    kt('Phân xưởng không có quyền gỡ cụm', !rs.data.quyen.includes('CUM_XOA'));

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
