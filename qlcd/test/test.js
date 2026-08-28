/**
 * Test tự động: chạy trên database tạm, không đụng dữ liệu thật.
 *   node test/test.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-test-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;
process.env.PORT = 0;

const { taoFile1, taoFile2 } = require('./tao-file-mau');
const FILE1 = path.join(__dirname, 'mau-dl1.xlsx');
const FILE2 = path.join(__dirname, 'mau-dl2.xlsx');
taoFile1(FILE1); taoFile2(FILE2);

// Khởi tạo schema
const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));

const app = require('../server');

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dieuKien, chiTiet = '') {
    if (dieuKien) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${chiTiet ? ' -> ' + chiTiet : ''}`); }
}

(async () => {
    const server = app.listen(0);
    const cong = server.address().port;
    const goc = `http://127.0.0.1:${cong}`;
    let cookie = '';

    async function api(duongDan, tuyChon = {}) {
        const h = { ...(tuyChon.headers || {}) };
        if (cookie) h.Cookie = cookie;
        if (tuyChon.body && !(tuyChon.body instanceof FormData)) {
            h['Content-Type'] = 'application/json';
            tuyChon.body = JSON.stringify(tuyChon.body);
        }
        const res = await fetch(goc + duongDan, { ...tuyChon, headers: h });
        const sc = res.headers.getSetCookie?.() || [];
        if (sc.length) cookie = sc[0].split(';')[0];
        let data = null;
        try { data = await res.json(); } catch (e) { /* không phải JSON */ }
        return { status: res.status, data };
    }

    async function taiFile(duongDanFile, pxId) {
        const fd = new FormData();
        const buf = fs.readFileSync(duongDanFile);
        fd.append('file', new Blob([buf]), path.basename(duongDanFile));
        if (pxId) fd.append('phan_xuong_id', String(pxId));
        return api('/api/import/tai-len', { method: 'POST', body: fd });
    }

    console.log('\n===== TEST HỆ THỐNG QLCD =====\n');
    try {

    /* ---------- 1. Xác thực ---------- */
    let rs = await api('/api/thiet-bi');
    kt('Chặn truy cập khi chưa đăng nhập', rs.status === 401);

    rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'sai' } });
    kt('Từ chối mật khẩu sai', rs.status === 401);

    rs = await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });
    kt('Đăng nhập admin', rs.status === 200 && rs.data.nguoi_dung.vai_tro === 'admin');

    /* ---------- 2. Admin quản lý phân xưởng ---------- */
    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL1', ten: 'Phân xưởng Đào lò 1', ten_ngan: 'DL1', so_nhan_luc: 84, thu_tu: 1 } });
    const px1 = rs.data.id;
    kt('Admin thêm phân xưởng DL1', rs.status === 200 && px1 > 0);

    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL2', ten: 'Phân xưởng Đào lò 2', ten_ngan: 'DL2', so_nhan_luc: 76, thu_tu: 2 } });
    const px2 = rs.data.id;
    kt('Admin thêm phân xưởng DL2', rs.status === 200);

    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST', body: { ma: 'DL1', ten: 'Trùng mã' } });
    kt('Chặn trùng mã phân xưởng', rs.status === 400);

    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'TAM', ten: 'Phân xưởng tạm để xoá' } });
    const pxTam = rs.data.id;
    rs = await api('/api/danh-muc/phan-xuong/' + pxTam, { method: 'DELETE' });
    kt('Admin xoá được phân xưởng rỗng', rs.status === 200);

    rs = await api('/api/danh-muc/phan-xuong');
    kt('Danh sách phân xưởng còn 2', rs.data.length === 2, `có ${rs.data.length}`);

    /* ---------- 3. Tài khoản phân xưởng ---------- */
    rs = await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'cddl1', mat_khau: 'dl123', ho_ten: 'Cơ điện DL1',
                vai_tro: 'px', phan_xuong_id: px1 } });
    kt('Tạo tài khoản phân xưởng (mật khẩu 5 ký tự)', rs.status === 200);

    rs = await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'dai', mat_khau: 'matkhauquadai', vai_tro: 'xem' } });
    kt('Chặn mật khẩu ngoài khoảng 4-6 ký tự', rs.status === 400);

    rs = await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'tam1', mat_khau: 'tam12', vai_tro: 'xem', tam_thoi: 1 } });
    kt('Tạo tài khoản tạm có hạn 24h', rs.status === 200 && !!rs.data.het_han);

    rs = await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'cddl2', mat_khau: 'dl223', ho_ten: 'Cơ điện DL2',
                vai_tro: 'px', phan_xuong_id: px2 } });
    kt('Tạo tài khoản phân xưởng DL2', rs.status === 200);

    /* ---------- 4. Import file DL1 ---------- */
    rs = await taiFile(FILE1, px1);
    const lo1 = rs.data.lo_id;
    kt('Tải file TSCĐ của DL1', rs.status === 200 && lo1 > 0);
    kt('Tự dò đúng dòng tiêu đề (bỏ qua 6 dòng đầu)', rs.data.dong_tieu_de === 6,
       `dò ra dòng ${rs.data.dong_tieu_de}`);

    const ax = rs.data.anh_xa_goi_y;
    kt('Tự nhận diện cột "Tên tài sản"', ax.ten !== undefined);
    kt('Tự nhận diện cột "Nguyên giá"', ax.nguyen_gia !== undefined);
    kt('Tự nhận diện cột "Ngày đưa vào sử dụng"', ax.ngay_su_dung !== undefined);
    kt('Tự nhận diện cột "Mã tài sản"', ax.ma_tscd !== undefined);
    kt('Đếm đúng số dòng dữ liệu', rs.data.tong_dong_du_lieu === 15,
       `đếm ${rs.data.tong_dong_du_lieu}`);

    rs = await api(`/api/import/lo/${lo1}/anh-xa`, { method: 'POST',
        body: { mapping: ax, ten_sheet: 'TSCD-CCDC', dong_tieu_de: 6 } });
    kt('Ánh xạ & kiểm tra dữ liệu', rs.status === 200);
    kt('Phát hiện dòng thiếu tên tài sản', rs.data.loi >= 1, `lỗi=${rs.data.loi}`);
    const tongDong = rs.data.tong;

    rs = await api(`/api/import/lo/${lo1}/dong?loc=hop_le`);
    const hopLe = rs.data;
    const timTen = (k) => hopLe.find(x => (x.ten || '').includes(k));

    kt('Nhận diện "Máng cào SGB" -> nhóm VT.01', timTen('Máng cào')?.ma_nhom_tb === 'VT.01',
       timTen('Máng cào')?.ma_nhom_tb);
    kt('Nhận diện "Băng tải" -> VT.02', timTen('Băng tải')?.ma_nhom_tb === 'VT.02');
    kt('Nhận diện "Tời trục tải" -> VT.03', timTen('Tời trục')?.ma_nhom_tb === 'VT.03',
       timTen('Tời trục')?.ma_nhom_tb);
    kt('Nhận diện "Tời hỗ trợ" -> VT.04', timTen('Tời hỗ trợ')?.ma_nhom_tb === 'VT.04');
    kt('Nhận diện "Quạt gió cục bộ" -> TN.01', timTen('Quạt gió cục bộ')?.ma_nhom_tb === 'TN.01');
    kt('Nhận diện "Máy bơm nước" -> TN.03', timTen('Máy bơm')?.ma_nhom_tb === 'TN.03');
    kt('Nhận diện "Trạm biến áp" -> CD.01', timTen('Trạm biến áp')?.ma_nhom_tb === 'CD.01');
    kt('Nhận diện "Khởi động từ" -> CD.02', timTen('Khởi động từ')?.ma_nhom_tb === 'CD.02');
    kt('Nhận diện "Đèn lò" -> AT.02', timTen('Đèn lò')?.ma_nhom_tb === 'AT.02');
    kt('Nhận diện "Máy đo khí" -> AT.01', timTen('Máy đo khí')?.ma_nhom_tb === 'AT.01');
    kt('Nhận diện "Máy khoan" -> CK.02', timTen('Máy khoan')?.ma_nhom_tb === 'CK.02');
    kt('Nhận diện "Palăng" -> VT.08', timTen('Palăng')?.ma_nhom_tb === 'VT.08');
    kt('Nhận diện "Cáp điện" -> CD.04', timTen('Cáp điện')?.ma_nhom_tb === 'CD.04');

    const mangCao = timTen('Máng cào');
    kt('Đọc đúng nguyên giá 850.000.000', mangCao?.nguyen_gia === 850000000, String(mangCao?.nguyen_gia));
    kt('Chuyển ngày 15/06/2022 -> 2022-06-15', mangCao?.ngay_su_dung === '2022-06-15', mangCao?.ngay_su_dung);
    kt('Nhận loại tài sản TSCĐ', mangCao?.loai_ts === 'TSCD', mangCao?.loai_ts);

    const denLo = timTen('Đèn lò');
    kt('Nhận loại CCDC', denLo?.loai_ts === 'CCDC', denLo?.loai_ts);
    kt('Giữ số lượng lô CCDC (45 đèn = 1 bản ghi)', denLo?.so_luong === 45, String(denLo?.so_luong));

    const toiHoTro = timTen('Tời hỗ trợ');
    kt('Chuyển ngày dạng 05/2023 -> 2023-05-01', toiHoTro?.ngay_su_dung === '2023-05-01', toiHoTro?.ngay_su_dung);
    const kdt = timTen('Khởi động từ');
    kt('Chuyển năm 2022 -> 2022-01-01', kdt?.ngay_su_dung === '2022-01-01', kdt?.ngay_su_dung);

    rs = await api(`/api/import/lo/${lo1}/dong?loc=loi`);
    const dongLoi = rs.data;
    kt('Dòng thiếu tên bị đánh dấu lỗi', dongLoi.some(d => /Thiếu tên/.test(d.loi || '')));
    kt('Bàn ghế văn phòng không đoán được nhóm -> lỗi chờ xử lý',
       dongLoi.some(d => (d.ten || '').includes('Bàn ghế')));

    // Sửa 1 dòng lỗi: gán nhóm thủ công
    const nhomKhac = db.prepare("SELECT id FROM nhom_thiet_bi WHERE ma='CK.05'").get().id;
    const dongBanGhe = dongLoi.find(d => (d.ten || '').includes('Bàn ghế'));
    if (dongBanGhe) {
        rs = await api(`/api/import/lo/${lo1}/dong/${dongBanGhe.id}`, { method: 'PUT',
            body: { nhom_id: nhomKhac } });
        kt('Sửa dòng lỗi: gán nhóm thủ công -> thành hợp lệ', rs.data.hop_le === 1);
    }

    rs = await api(`/api/import/lo/${lo1}/xac-nhan`, { method: 'POST', body: {} });
    const daNhap1 = rs.data.da_nhap;
    kt('Nhập dữ liệu vào hệ thống', rs.status === 200 && daNhap1 >= 13, `nhập ${daNhap1}`);

    rs = await api('/api/thiet-bi?moi_trang=100');
    kt('Thiết bị đã vào danh sách', rs.data.tong === daNhap1, `${rs.data.tong} vs ${daNhap1}`);
    const mcTrongHT = rs.data.danh_sach.find(x => x.ten.includes('Máng cào'));
    kt('Sinh mã thiết bị đúng quy tắc DL1.VT01.001', mcTrongHT?.ma_tb === 'DL1.VT01.001', mcTrongHT?.ma_tb);
    kt('Thiết bị mới ở trạng thái chờ duyệt', mcTrongHT?.trang_thai_duyet === 'cho_duyet');

    const tbCT = await api('/api/thiet-bi/' + mcTrongHT.id);
    kt('Hồ sơ thiết bị có lịch sử vị trí ban đầu', tbCT.data.lich_su_vi_tri.length === 1);
    kt('Ghi lại vị trí theo file vào ghi chú',
       /Lò XV mức -50/.test(tbCT.data.thiet_bi.ghi_chu || ''), tbCT.data.thiet_bi.ghi_chu);

    /* ---------- 5. Import lại file cũ -> cảnh báo trùng ---------- */
    rs = await taiFile(FILE1, px1);
    const loTrung = rs.data.lo_id;
    rs = await api(`/api/import/lo/${loTrung}/anh-xa`, { method: 'POST',
        body: { mapping: rs.data.anh_xa_goi_y, ten_sheet: 'TSCD-CCDC', dong_tieu_de: 6 } });
    rs = await api(`/api/import/lo/${loTrung}/dong?loc=canh_bao`);
    kt('Cảnh báo mã tài sản đã có trong hệ thống',
       rs.data.some(d => /đã có trong hệ thống/.test(d.canh_bao || '')));

    rs = await api(`/api/import/lo/${loTrung}/xac-nhan`, { method: 'POST', body: { bo_qua_trung: true } });
    kt('Bỏ qua dòng trùng khi nhập lại', rs.data.bo_qua > 0, `bỏ qua ${rs.data.bo_qua}`);

    /* ---------- 6. Phân quyền phân xưởng ---------- */
    await api('/api/auth/dang-xuat', { method: 'POST' });
    rs = await api('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: 'cddl2', mat_khau: 'dl223' } });
    kt('Đăng nhập tài khoản phân xưởng DL2', rs.status === 200);

    rs = await api('/api/thiet-bi?moi_trang=100');
    kt('Tài khoản DL2 không thấy thiết bị của DL1', rs.data.tong === 0, `thấy ${rs.data.tong}`);

    rs = await api('/api/thiet-bi/' + mcTrongHT.id);
    kt('Chặn xem hồ sơ thiết bị phân xưởng khác', rs.status === 403);

    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST', body: { ma: 'XX', ten: 'Trái phép' } });
    kt('Không phải admin thì không thêm được phân xưởng', rs.status === 403);

    rs = await taiFile(FILE2, px1);   // cố tình khai phân xưởng khác
    kt('Tài khoản DL2 tải file luôn gán về phân xưởng DL2',
       rs.status === 200 && db.prepare('SELECT phan_xuong_id FROM lo_import WHERE id=?')
            .get(rs.data.lo_id).phan_xuong_id === px2);

    const lo2 = rs.data.lo_id;
    kt('Dò tiêu đề file mẫu 2 ở dòng 0', rs.data.dong_tieu_de === 0, `dòng ${rs.data.dong_tieu_de}`);
    kt('Nhận diện cột viết tắt "Mã TS"', rs.data.anh_xa_goi_y.ma_tscd !== undefined);
    kt('Nhận diện cột "Ngày tăng TS"', rs.data.anh_xa_goi_y.ngay_su_dung !== undefined);

    rs = await api(`/api/import/lo/${lo2}/anh-xa`, { method: 'POST',
        body: { mapping: rs.data.anh_xa_goi_y, dong_tieu_de: 0 } });
    kt('Ánh xạ file mẫu 2', rs.status === 200 && rs.data.tong === 8, `tổng ${rs.data.tong}`);

    rs = await api(`/api/import/lo/${lo2}/dong?loc=hop_le`);
    const dsL2 = rs.data;
    const combai = dsL2.find(x => x.ten.includes('Combai'));
    kt('Nhận diện "Combai đào lò" -> CK.04', combai?.ma_nhom_tb === 'CK.04');
    kt('Đọc số có dấu chấm "12.500.000.000"', combai?.nguyen_gia === 12500000000, String(combai?.nguyen_gia));
    const tauDien = dsL2.find(x => x.ten.includes('Tàu điện'));
    kt('Nhận diện "Tàu điện ắc quy" -> VT.05', tauDien?.ma_nhom_tb === 'VT.05');
    kt('Đọc ngày ISO 2023-04-12',
       dsL2.find(x => x.ten.includes('Máng cào'))?.ngay_su_dung === '2023-04-12');

    rs = await api(`/api/import/lo/${lo2}/dong?loc=loi`);
    kt('Thiết bị lạ không đoán được nhóm -> chờ gán tay',
       rs.data.some(d => (d.ten || '').includes('không rõ loại')));

    const nhomKhac2 = db.prepare("SELECT id FROM nhom_thiet_bi WHERE ma='CK.05'").get().id;
    rs = await api(`/api/import/lo/${lo2}/gan-nhom`, { method: 'POST', body: { nhom_id: nhomKhac2 } });
    kt('Gán nhóm hàng loạt cho dòng chưa xác định', rs.data.so_loi === 0, `còn ${rs.data.so_loi} lỗi`);

    rs = await api(`/api/import/lo/${lo2}/xac-nhan`, { method: 'POST', body: {} });
    kt('Nhập toàn bộ 8 dòng file mẫu 2', rs.data.da_nhap === 8, `nhập ${rs.data.da_nhap}`);

    rs = await api('/api/thiet-bi?moi_trang=100');
    kt('DL2 chỉ thấy thiết bị của mình', rs.data.tong === 8, `thấy ${rs.data.tong}`);
    kt('Mã thiết bị DL2 sinh theo phân xưởng DL2',
       rs.data.danh_sach.every(x => x.ma_tb.startsWith('DL2.')));

    /* ---------- 7. Phê duyệt ---------- */
    const tbDuyet = rs.data.danh_sach[0];
    rs = await api(`/api/thiet-bi/${tbDuyet.id}/dong-y`, { method: 'POST' });
    kt('Tài khoản phân xưởng không được tự duyệt', rs.status === 403);

    await api('/api/auth/dang-xuat', { method: 'POST' });
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });

    rs = await api(`/api/thiet-bi/${tbDuyet.id}/chuyen-lai`, { method: 'POST', body: {} });
    kt('Chuyển lại bắt buộc nhập lý do', rs.status === 400);

    rs = await api(`/api/thiet-bi/${tbDuyet.id}/chuyen-lai`, { method: 'POST',
        body: { ly_do: 'Thiếu số seri và ngày đưa vào sử dụng' } });
    kt('Chuyển lại kèm lý do', rs.status === 200);
    kt('Lưu lý do chuyển lại vào lịch sử phê duyệt',
       db.prepare(`SELECT ly_do FROM phe_duyet WHERE doi_tuong_id=? AND hanh_dong='chuyen_lai'`)
         .get(tbDuyet.id)?.ly_do.includes('số seri'));

    rs = await api(`/api/thiet-bi/${tbDuyet.id}/dong-y`, { method: 'POST' });
    kt('Admin duyệt đồng ý', rs.status === 200 &&
       db.prepare('SELECT trang_thai_duyet t FROM thiet_bi WHERE id=?').get(tbDuyet.id).t === 'da_duyet');

    rs = await api('/api/thiet-bi/duyet-lo/' + lo1, { method: 'POST' });
    kt('Duyệt hàng loạt theo lô import', rs.data.da_duyet > 0, `duyệt ${rs.data.da_duyet}`);

    /* ---------- 8. Chặn xoá phân xưởng còn dữ liệu ---------- */
    rs = await api('/api/danh-muc/phan-xuong/' + px1, { method: 'DELETE' });
    kt('Chặn xoá phân xưởng còn thiết bị', rs.status === 400 && /không thể xoá/i.test(rs.data.loi));
    kt('Báo rõ số lượng dữ liệu vướng', rs.data.rang_buoc['thiết bị'] > 0);

    rs = await api('/api/danh-muc/phan-xuong/' + px1, { method: 'PUT', body: { hoat_dong: 0 } });
    kt('Cho phép ngừng hoạt động thay vì xoá', rs.status === 200);
    rs = await api('/api/danh-muc/phan-xuong');
    kt('Phân xưởng ngừng hoạt động bị ẩn khỏi danh sách', rs.data.length === 1);

    /* ---------- 9. Dashboard & cảnh báo ---------- */
    rs = await api('/api/tong-hop/dashboard');
    kt('Dashboard tổng hợp toàn công ty', rs.data.tong.tong > 20, `tổng ${rs.data.tong.tong}`);
    kt('Dashboard có tổng nguyên giá', rs.data.tong.tong_nguyen_gia > 0);
    kt('Thống kê theo nhóm thiết bị', rs.data.theo_nhom.length > 5);

    rs = await api('/api/tong-hop/canh-bao');
    kt('Cảnh báo thiếu kiểm định cho tời trục / palăng',
       rs.data.thieu_kiem_dinh.length > 0, `${rs.data.thieu_kiem_dinh.length} thiết bị`);
    kt('Cảnh báo trạm biến áp cần đo cách điện',
       rs.data.thieu_kiem_dinh.some(x => /Trạm biến áp|Khởi động từ|Cáp điện/.test(x.ten_tb)));

    /* ---------- 10. Thêm thiết bị thủ công ---------- */
    const nhomVT01 = db.prepare("SELECT id FROM nhom_thiet_bi WHERE ma='VT.01'").get().id;
    rs = await api('/api/thiet-bi', { method: 'POST',
        body: { ten: 'Máng cào SGB-620 bổ sung', nhom_id: nhomVT01, phan_xuong_id: px1,
                nguyen_gia: 900000000, ngay_su_dung: '2026-01-15' } });
    kt('Thêm thiết bị thủ công, tự sinh mã tiếp theo',
       rs.status === 200 && rs.data.ma_tb === 'DL1.VT01.002', rs.data.ma_tb);

    rs = await api('/api/thiet-bi?q=SGB');
    kt('Tìm kiếm theo từ khoá', rs.data.tong >= 2, `tìm thấy ${rs.data.tong}`);

    } catch (e) {
        ds.push(`  [LỖI]   Dừng giữa chừng: ${e.message}`);
        truot++;
    }

    server.close();
    console.log(ds.join('\n'));
    console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
    try { fs.unlinkSync(DB_TAM); } catch (e) {}
    process.exit(truot ? 1 : 0);
})();
