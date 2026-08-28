/**
 * Test module NCVT Quý — 15 trường hợp bắt buộc theo spec.
 *   node test/test-ncvt.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-ncvt-' + Date.now() + '.db');
process.env.QLCD_DB = DB_TAM;

const bcrypt = require('bcryptjs');
const db = require('../db');
fs.readdirSync(path.join(__dirname, '..', 'db')).filter(f => f.endsWith('.sql')).sort()
  .forEach(f => db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8')));
db.prepare(`INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro)
            VALUES ('admin',?, 'Quản trị', 'admin')`).run(bcrypt.hashSync('admin123', 8));

const app = require('../server');

/* ---------- File NCVT mẫu, mô phỏng bảng NCVT quý thật ---------- */
const FILE_OK = path.join(__dirname, 'ncvt-mau.xlsx');
const FILE_LOI = path.join(__dirname, 'ncvt-loi.xlsx');

function taoFileMau() {
    const rows = [
        ['CÔNG TY XÂY LẮP MỎ - TKV'],
        ['BẢNG NHU CẦU VẬT TƯ QUÝ III NĂM 2026'],
        [],
        ['STT', 'Mã vật tư', 'Tên vật tư', 'Quy cách', 'ĐVT', 'Số lượng', 'Đơn giá', 'Công trình', 'Ghi chú'],
        [1, 'CU.01.045', 'Xích tải máng cào', '26x92', 'm', 240, 1850000, 'Lò XV mức -50', ''],
        [2, 'CU.02.011', 'Má phanh tời JD-25', '', 'Bộ', 12, 3400000, 'Lò XV mức -50', ''],
        [3, 'CD.04.008', 'Cáp điện cao su', '3x35+1x16', 'm', 850, 420000, 'Lò CV mức -120', ''],
        [4, 'VB.01.001', 'Vòng bi 22218', '', 'Cái', 30, 850000, 'Lò CV mức -120', 'Dự phòng'],
        [5, 'DG.01.002', 'Dầu hộp giảm tốc', 'CN220', 'Lít', 400, 45000, '', ''],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'NCVT Q3');
    XLSX.writeFile(wb, FILE_OK);
}
function taoFileLoi() {
    const rows = [
        ['STT', 'Mã vật tư', 'Tên vật tư', 'ĐVT', 'Số lượng'],
        [1, 'X.01', 'Vật tư hợp lệ', 'Cái', 10],
        [2, 'X.02', '', 'Cái', 5],              // thiếu tên
        [3, 'X.03', 'Thiếu số lượng', 'Cái', ''],
        [4, 'X.04', 'Số lượng âm', 'Cái', -5],
        [5, 'X.01', 'Trùng mã với dòng 2', 'Cái', 8],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    XLSX.writeFile(wb, FILE_LOI);
}
taoFileMau(); taoFileLoi();

let dat = 0, truot = 0;
const ds = [];
function kt(ten, dk, ct = '') {
    if (dk) { dat++; ds.push(`  [ĐẠT]   ${ten}`); }
    else { truot++; ds.push(`  [TRƯỢT] ${ten}${ct ? ' -> ' + ct : ''}`); }
}
const conLai = (id) => {
    const r = db.prepare('SELECT so_luong_kh - so_luong_da_cap c FROM ncvt_chi_tiet WHERE id=?').get(id);
    return r ? r.c : null;
};

(async () => {
    const server = app.listen(0);
    const goc = `http://127.0.0.1:${server.address().port}`;
    const phien = {};

    function taoApi(ten) {
        return async function (dd, tc = {}) {
            const h = { ...(tc.headers || {}) };
            if (phien[ten]) h.Cookie = phien[ten];
            if (tc.body && !(tc.body instanceof FormData)) {
                h['Content-Type'] = 'application/json';
                tc.body = JSON.stringify(tc.body);
            }
            const res = await fetch(goc + dd, { ...tc, headers: h });
            const sc = res.headers.getSetCookie?.() || [];
            if (sc.length) phien[ten] = sc[0].split(';')[0];
            let data = null;
            try { data = await res.json(); } catch (e) {}
            return { status: res.status, data };
        };
    }
    const A = taoApi('admin'), CN1 = taoApi('cn1'), CN2 = taoApi('cn2'), X = taoApi('xem');
    const dn = (api, u, m) => api('/api/auth/dang-nhap', { method: 'POST',
        body: { ten_dang_nhap: u, mat_khau: m } });

    async function taiFile(api, kyId, duongDan) {
        const fd = new FormData();
        fd.append('file', new Blob([fs.readFileSync(duongDan)]), path.basename(duongDan));
        return api(`/api/ncvt/ky/${kyId}/tai-len`, { method: 'POST', body: fd });
    }

    console.log('\n===== TEST MODULE NCVT QUÝ =====\n');
    try {

    /* ---------- Chuẩn bị ---------- */
    await dn(A, 'admin', 'admin123');
    let rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL1', ten: 'Phân xưởng Đào lò 1', ten_ngan: 'DL1' } });
    const px1 = rs.data.id;
    rs = await A('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL14', ten: 'Phân xưởng Đào lò 14', ten_ngan: 'DL14' } });
    const px14 = rs.data.id;

    await A('/api/auth/tai-khoan', { method: 'POST', body: { ten_dang_nhap: 'cn1',
        mat_khau: 'cn123', ho_ten: 'Chủ nhiệm CT Đào lò 1', vai_tro: 'px', phan_xuong_id: px1 } });
    await A('/api/auth/tai-khoan', { method: 'POST', body: { ten_dang_nhap: 'cn14',
        mat_khau: 'cn143', ho_ten: 'Chủ nhiệm CT Đào lò 14', vai_tro: 'px', phan_xuong_id: px14 } });
    await A('/api/auth/tai-khoan', { method: 'POST', body: { ten_dang_nhap: 'xemtt',
        mat_khau: 'xem12', ho_ten: 'Người xem', vai_tro: 'xem' } });
    await dn(CN1, 'cn1', 'cn123'); await dn(CN2, 'cn14', 'cn143'); await dn(X, 'xemtt', 'xem12');

    rs = await CN1('/api/quyen-cua-toi');
    kt('Chủ nhiệm công trình có quyền lấy vật tư', rs.data.quyen.includes('NCVT_CAP'));
    kt('Chủ nhiệm không có quyền import NCVT', !rs.data.quyen.includes('NCVT_IMPORT'));
    rs = await X('/api/quyen-cua-toi');
    kt('Tài khoản chỉ xem không được lấy vật tư', !rs.data.quyen.includes('NCVT_CAP'));

    /* ---------- 1. TẠO KỲ VÀ IMPORT ---------- */
    ds.push('\n  --- Import NCVT quý ---');

    rs = await A('/api/ncvt/ky', { method: 'POST', body: { nam: 2026, quy: 3, phan_xuong_id: px1 } });
    const ky1 = rs.data.id;
    kt('Lập kỳ NCVT Q3/2026 cho DL1', rs.status === 200 && ky1 > 0);

    rs = await A('/api/ncvt/ky', { method: 'POST', body: { nam: 2026, quy: 3, phan_xuong_id: px1 } });
    kt('Chặn tạo trùng kỳ cùng năm/quý/đơn vị', rs.status === 400 && /đã tồn tại/.test(rs.data.loi));

    rs = await A('/api/ncvt/ky', { method: 'POST', body: { nam: 2026, quy: 5, phan_xuong_id: px1 } });
    kt('Chặn quý không hợp lệ', rs.status === 400);

    rs = await taiFile(A, ky1, FILE_OK);
    const lo1 = rs.data.lo_id;
    kt('Tải file NCVT lên', rs.status === 200 && lo1 > 0);
    kt('Tự dò dòng tiêu đề bỏ qua phần đầu văn bản', rs.data.dong_tieu_de === 3,
       `dòng ${rs.data.dong_tieu_de}`);
    const ax = rs.data.anh_xa_goi_y;
    kt('Nhận diện cột Mã vật tư', ax.ma_vat_tu !== undefined);
    kt('Nhận diện cột Tên vật tư', ax.ten_vat_tu !== undefined);
    kt('Nhận diện cột Số lượng', ax.so_luong_kh !== undefined);
    kt('Nhận diện cột Công trình', ax.cong_trinh !== undefined);
    kt('Đếm đúng 5 dòng dữ liệu', rs.data.tong_dong_du_lieu === 5, `${rs.data.tong_dong_du_lieu}`);

    rs = await A(`/api/ncvt/lo/${lo1}/anh-xa`, { method: 'POST',
        body: { mapping: ax, ten_sheet: 'NCVT Q3', dong_tieu_de: 3 } });
    kt('Ánh xạ và kiểm tra dữ liệu', rs.status === 200 && rs.data.hop_le === 5,
       JSON.stringify(rs.data));

    // Trước khi xác nhận, chưa có gì trong bảng chính thức
    kt('Chưa xác nhận thì chưa ghi vào NCVT chính thức',
       db.prepare('SELECT COUNT(*) n FROM ncvt_chi_tiet').get().n === 0);

    rs = await A(`/api/ncvt/lo/${lo1}/xac-nhan`, { method: 'POST', body: {} });
    kt('Xác nhận nhập 5 mặt hàng', rs.data.da_nhap === 5, `${rs.data.da_nhap}`);

    const xich = db.prepare("SELECT * FROM ncvt_chi_tiet WHERE ma_vat_tu='CU.01.045'").get();
    kt('Đọc đúng số lượng NCVT (240 m xích tải)', xich.so_luong_kh === 240, String(xich.so_luong_kh));
    kt('Đọc đúng quy cách', xich.quy_cach === '26x92', xich.quy_cach);
    kt('Đọc đúng công trình', xich.cong_trinh === 'Lò XV mức -50', xich.cong_trinh);
    kt('Số đã cấp khởi tạo bằng 0', xich.so_luong_da_cap === 0);
    kt('Gán đúng phân xưởng của kỳ', xich.phan_xuong_id === px1);

    /* ---------- 2. IMPORT FILE LỖI ---------- */
    rs = await A('/api/ncvt/ky', { method: 'POST', body: { nam: 2026, quy: 4, phan_xuong_id: px1 } });
    const kyLoi = rs.data.id;
    rs = await taiFile(A, kyLoi, FILE_LOI);
    const loLoi = rs.data.lo_id;
    rs = await A(`/api/ncvt/lo/${loLoi}/anh-xa`, { method: 'POST',
        body: { mapping: rs.data.anh_xa_goi_y, dong_tieu_de: 0 } });
    kt('File lỗi: phát hiện 3 dòng không hợp lệ', rs.data.loi === 3, JSON.stringify(rs.data));
    kt('File lỗi: vẫn giữ 2 dòng hợp lệ', rs.data.hop_le === 2);

    rs = await A(`/api/ncvt/lo/${loLoi}/dong?loc=loi`);
    kt('Báo rõ dòng thiếu tên vật tư', rs.data.some(x => /Thiếu tên/.test(x.loi || '')));
    kt('Báo rõ dòng số lượng âm', rs.data.some(x => /âm/.test(x.loi || '')));

    rs = await A(`/api/ncvt/lo/${loLoi}/dong?loc=canh_bao`);
    kt('Cảnh báo trùng mã vật tư trong file', rs.data.some(x => /Trùng mã/.test(x.canh_bao || '')));

    /* ---------- 3. KÍCH HOẠT KỲ ---------- */
    ds.push('\n  --- Kích hoạt và phân quyền ---');

    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 10 } });
    kt('Kỳ chưa kích hoạt thì chưa lấy vật tư được',
       rs.status === 400 && /chưa được kích hoạt/.test(rs.data.loi), rs.data.loi);

    rs = await CN1(`/api/ncvt/ky/${ky1}/kich-hoat`, { method: 'POST' });
    kt('Chủ nhiệm không có quyền kích hoạt kỳ', rs.status === 403);

    rs = await A(`/api/ncvt/ky/${ky1}/kich-hoat`, { method: 'POST' });
    kt('Admin kích hoạt kỳ', rs.status === 200 && rs.data.so_mat_hang === 5);

    /* ---------- 4-5. PHẠM VI XEM ---------- */
    rs = await CN1('/api/ncvt/vat-tu');
    kt('Chủ nhiệm DL1 xem được 5 mặt hàng của đơn vị mình', rs.data.length === 5, `${rs.data.length}`);

    rs = await CN2('/api/ncvt/vat-tu');
    kt('Chủ nhiệm DL14 không thấy vật tư của DL1', rs.data.length === 0, `thấy ${rs.data.length}`);

    rs = await CN2(`/api/ncvt/vat-tu/${xich.id}`);
    kt('Chặn xem chi tiết vật tư đơn vị khác', rs.status === 403);

    rs = await A('/api/ncvt/vat-tu');
    kt('Admin xem được toàn bộ', rs.data.length >= 5);

    /* ---------- 6-7. LẤY VẬT TƯ HỢP LỆ ---------- */
    ds.push('\n  --- Lấy vật tư ---');

    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: {
        so_luong: 60, cong_trinh: 'Lò XV mức -50', nguoi_nhan: 'Trần Văn B',
        noi_dung_su_dung: 'Thay xích máng cào SGB-620' } });
    kt('Lấy vật tư hợp lệ 60 m', rs.status === 200, JSON.stringify(rs.data).slice(0, 90));
    kt('Sinh mã phiếu cấp phát', /^CP-Q32026-0001$/.test(rs.data.ma_phieu || ''), rs.data.ma_phieu);
    kt('Trả về đúng số đã lấy', rs.data.da_lay === 60, String(rs.data.da_lay));
    kt('Trả về đúng số còn lại (240 - 60 = 180)', rs.data.con_lai === 180, String(rs.data.con_lai));
    kt('Database ghi đúng số còn lại', conLai(xich.id) === 180, String(conLai(xich.id)));

    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 40 } });
    kt('Lấy lần hai cộng dồn đúng (60 + 40 = 100)', rs.data.da_lay === 100, String(rs.data.da_lay));
    kt('Còn lại giảm tiếp còn 140', conLai(xich.id) === 140, String(conLai(xich.id)));

    /* ---------- 8. KHÔNG CẤP VƯỢT ---------- */
    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 200 } });
    kt('Chặn lấy vượt số còn lại (còn 140, xin 200)',
       rs.status === 409 && /vượt quá số lượng NCVT còn lại/.test(rs.data.loi), rs.data.loi);
    kt('Lấy vượt không làm thay đổi số liệu', conLai(xich.id) === 140);

    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 0 } });
    kt('Chặn số lượng bằng 0', rs.status === 400);
    rs = await CN1(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: -5 } });
    kt('Chặn số lượng âm', rs.status === 400);

    // Lấy đúng bằng số còn lại
    const ma = db.prepare("SELECT * FROM ncvt_chi_tiet WHERE ma_vat_tu='CU.02.011'").get();
    rs = await CN1(`/api/ncvt/vat-tu/${ma.id}/lay`, { method: 'POST', body: { so_luong: 12 } });
    kt('Lấy đúng bằng số kế hoạch được chấp nhận', rs.status === 200 && rs.data.con_lai === 0);
    rs = await A('/api/ncvt/vat-tu?ky_id=' + ky1);
    kt('Mặt hàng hết được đánh dấu đã cấp hết',
       rs.data.find(x => x.id === ma.id).trang_thai_cap === 'da_cap_het');

    rs = await CN1(`/api/ncvt/vat-tu/${ma.id}/lay`, { method: 'POST', body: { so_luong: 1 } });
    kt('Hết hàng thì không lấy thêm được', rs.status === 409);

    /* ---------- 9. HAI NGƯỜI CÙNG LẤY ---------- */
    ds.push('\n  --- Tranh chấp đồng thời ---');

    const cap = db.prepare("SELECT * FROM ncvt_chi_tiet WHERE ma_vat_tu='CD.04.008'").get();
    db.prepare('UPDATE ncvt_chi_tiet SET so_luong_kh=10, so_luong_da_cap=0 WHERE id=?').run(cap.id);

    // Hai yêu cầu gửi đồng thời: 8 và 5, tổng 13 > 10
    const [r1, r2] = await Promise.all([
        CN1(`/api/ncvt/vat-tu/${cap.id}/lay`, { method: 'POST', body: { so_luong: 8 } }),
        A(`/api/ncvt/vat-tu/${cap.id}/lay`, { method: 'POST', body: { so_luong: 5 } })
    ]);
    const thanhCong = [r1, r2].filter(x => x.status === 200).length;
    kt('Hai người cùng lấy: chỉ một giao dịch thành công', thanhCong === 1,
       `${thanhCong} thành công (${r1.status}, ${r2.status})`);
    kt('Tổng đã cấp không vượt kế hoạch',
       db.prepare('SELECT so_luong_da_cap s FROM ncvt_chi_tiet WHERE id=?').get(cap.id).s <= 10,
       String(db.prepare('SELECT so_luong_da_cap s FROM ncvt_chi_tiet WHERE id=?').get(cap.id).s));
    kt('Số còn lại không bị âm', conLai(cap.id) >= 0, String(conLai(cap.id)));

    /* ---------- 10-11. QUYỀN THAO TÁC ---------- */
    ds.push('\n  --- Phân quyền thao tác ---');

    rs = await CN2(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 5 } });
    kt('Chủ nhiệm đơn vị khác không lấy được vật tư này', rs.status === 403,
       `${rs.status} ${rs.data?.loi || ''}`);

    rs = await X(`/api/ncvt/vat-tu/${xich.id}/lay`, { method: 'POST', body: { so_luong: 5 } });
    kt('Tài khoản chỉ xem bị chặn ở backend', rs.status === 403);

    rs = await X('/api/ncvt/vat-tu');
    kt('Tài khoản chỉ xem vẫn đọc được danh sách', rs.status === 200);

    /* ---------- 12. ĐÓNG QUÝ ---------- */
    ds.push('\n  --- Đóng quý ---');

    const vb = db.prepare("SELECT * FROM ncvt_chi_tiet WHERE ma_vat_tu='VB.01.001'").get();
    rs = await A(`/api/ncvt/ky/${ky1}/dong`, { method: 'POST', body: { ly_do: 'Kết thúc quý III' } });
    kt('Đóng kỳ NCVT', rs.status === 200);

    rs = await CN1(`/api/ncvt/vat-tu/${vb.id}/lay`, { method: 'POST', body: { so_luong: 1 } });
    kt('Kỳ đã đóng thì không lấy vật tư được',
       rs.status === 400 && /đã đóng/.test(rs.data.loi), rs.data.loi);

    rs = await A(`/api/ncvt/ky/${ky1}/dong`, { method: 'POST', body: { ly_do: 'lần hai' } });
    kt('Không đóng kỳ hai lần', rs.status === 400);

    /* ---------- 13. HỦY GIAO DỊCH ---------- */
    ds.push('\n  --- Hủy giao dịch & lịch sử ---');

    // Mở lại kỳ để thử hủy
    db.prepare("UPDATE ncvt_ky SET trang_thai='dang_ap_dung' WHERE id=?").run(ky1);
    const gd = db.prepare('SELECT * FROM ncvt_cap_phat WHERE chi_tiet_id=? ORDER BY id LIMIT 1').get(xich.id);

    rs = await A(`/api/ncvt/cap-phat/${gd.id}/huy`, { method: 'POST', body: {} });
    kt('Hủy giao dịch bắt buộc nhập lý do', rs.status === 400);

    const truocHuy = conLai(xich.id);
    rs = await A(`/api/ncvt/cap-phat/${gd.id}/huy`, { method: 'POST',
        body: { ly_do: 'Ghi nhầm số lượng' } });
    kt('Hủy giao dịch cấp phát', rs.status === 200);
    kt('Hủy xong hoàn lại đúng số lượng', conLai(xich.id) === truocHuy + gd.so_luong,
       `${conLai(xich.id)} vs ${truocHuy + gd.so_luong}`);

    const gdSau = db.prepare('SELECT * FROM ncvt_cap_phat WHERE id=?').get(gd.id);
    kt('Giao dịch bị hủy KHÔNG bị xóa khỏi lịch sử', !!gdSau);
    kt('Giao dịch giữ nguyên số lượng gốc để truy vết', gdSau.so_luong === gd.so_luong);
    kt('Lưu lý do hủy', /Ghi nhầm/.test(gdSau.ly_do_huy || ''));

    rs = await A(`/api/ncvt/cap-phat/${gd.id}/huy`, { method: 'POST', body: { ly_do: 'lần hai' } });
    kt('Không hủy hai lần cùng một giao dịch', rs.status === 400);

    /* ---------- 14. AUDIT & ĐỐI CHIẾU ---------- */
    rs = await A(`/api/ncvt/vat-tu/${xich.id}`);
    kt('Xem được lịch sử lấy vật tư', rs.data.lich_su.length >= 2, `${rs.data.lich_su.length} lần`);
    kt('Số liệu tổng hợp khớp với tổng giao dịch', rs.data.khop_so_lieu === true,
       `da_cap=${rs.data.chi_tiet.so_luong_da_cap} vs giao_dich=${rs.data.chi_tiet.tong_cap_thuc_te}`);
    kt('Truy được về dòng Excel gốc', !!rs.data.dong_goc,
       JSON.stringify(rs.data.dong_goc || {}).slice(0, 60));
    kt('Truy được về file NCVT gốc', !!rs.data.file_nguon?.ten_file, rs.data.file_nguon?.ten_file);

    const audit = db.prepare(`SELECT hanh_dong FROM nhat_ky_he_thong
                              WHERE hanh_dong LIKE 'NCVT%'`).all().map(x => x.hanh_dong);
    kt('Audit ghi việc tải file', audit.includes('NCVT_TAI_FILE'));
    kt('Audit ghi việc import', audit.includes('NCVT_IMPORT'));
    kt('Audit ghi việc kích hoạt kỳ', audit.includes('NCVT_KICH_HOAT'));
    kt('Audit ghi việc lấy vật tư', audit.includes('NCVT_LAY_VAT_TU'));
    kt('Audit ghi việc đóng kỳ', audit.includes('NCVT_DONG_KY'));
    kt('Audit ghi việc hủy giao dịch', audit.includes('NCVT_HUY_CAP_PHAT'));
    const auditChiTiet = db.prepare(`SELECT du_lieu_cu, du_lieu_moi FROM nhat_ky_he_thong
        WHERE hanh_dong='NCVT_LAY_VAT_TU' LIMIT 1`).get();
    kt('Audit lưu giá trị trước và sau', !!auditChiTiet.du_lieu_cu && !!auditChiTiet.du_lieu_moi);

    /* ---------- 15. TẢI LẠI KHÔNG SAI SỐ ---------- */
    const l1 = conLai(xich.id);
    await A(`/api/ncvt/vat-tu/${xich.id}`);
    await A('/api/ncvt/vat-tu');
    await A('/api/ncvt/thong-ke');
    kt('Đọc lại nhiều lần không làm sai số lượng', conLai(xich.id) === l1, String(conLai(xich.id)));

    /* ---------- DASHBOARD ---------- */
    ds.push('\n  --- Dashboard NCVT ---');

    rs = await A('/api/ncvt/thong-ke?ky_id=' + ky1);
    const t = rs.data.tong;
    kt('Thống kê đếm đúng số mặt hàng', t.so_mat_hang === 5, String(t.so_mat_hang));
    kt('Thống kê có tổng nhu cầu', t.tong_nhu_cau > 0);
    kt('Thống kê tổng còn lại = nhu cầu - đã cấp',
       Math.abs(t.tong_con_lai - (t.tong_nhu_cau - t.tong_da_cap)) < 1e-9,
       `${t.tong_con_lai} vs ${t.tong_nhu_cau - t.tong_da_cap}`);
    kt('Đếm được mặt hàng đã cấp hết', t.da_cap_het >= 1, String(t.da_cap_het));
    kt('Đếm được mặt hàng chưa lấy lần nào', t.chua_cap >= 1, String(t.chua_cap));
    kt('Thống kê theo phân xưởng', rs.data.theo_phan_xuong.length >= 1);
    kt('Thống kê theo công trình', rs.data.theo_cong_trinh.length >= 1);

    rs = await CN2('/api/ncvt/thong-ke');
    kt('Thống kê của đơn vị khác không lẫn dữ liệu DL1',
       rs.data.tong.so_mat_hang === 0, String(rs.data.tong.so_mat_hang));

    } catch (e) {
        ds.push(`  [LỖI]   Dừng giữa chừng: ${e.message}\n          ${e.stack.split('\n')[1]?.trim()}`);
        truot++;
    }

    server.close();
    console.log(ds.join('\n'));
    console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
    [DB_TAM, FILE_OK, FILE_LOI].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
    process.exit(truot ? 1 : 0);
})();
