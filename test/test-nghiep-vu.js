/**
 * Test phân hệ nghiệp vụ: điều chuyển, bảo dưỡng - sửa chữa, kiểm định.
 *   node test/test-nghiep-vu.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_TAM = path.join(os.tmpdir(), 'qlcd-nv-' + Date.now() + '.db');
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
const congNgay = (n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};

(async () => {
    const server = app.listen(0);
    const cong = server.address().port;
    const goc = `http://127.0.0.1:${cong}`;
    let cookie = '';

    async function api(dd, tc = {}) {
        const h = { ...(tc.headers || {}) };
        if (cookie) h.Cookie = cookie;
        if (tc.body) { h['Content-Type'] = 'application/json'; tc.body = JSON.stringify(tc.body); }
        const res = await fetch(goc + dd, { ...tc, headers: h });
        const sc = res.headers.getSetCookie?.() || [];
        if (sc.length) cookie = sc[0].split(';')[0];
        let data = null;
        try { data = await res.json(); } catch (e) {}
        return { status: res.status, data };
    }

    console.log('\n===== TEST PHÂN HỆ NGHIỆP VỤ =====\n');
    try {

    /* ---------- Chuẩn bị dữ liệu ---------- */
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });

    let rs = await api('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL1', ten: 'Phân xưởng Đào lò 1', ten_ngan: 'DL1' } });
    const px1 = rs.data.id;
    rs = await api('/api/danh-muc/phan-xuong', { method: 'POST',
        body: { ma: 'DL2', ten: 'Phân xưởng Đào lò 2', ten_ngan: 'DL2' } });
    const px2 = rs.data.id;

    rs = await api('/api/danh-muc/vi-tri', { method: 'POST',
        body: { ma: 'LO-XV-50', ten: 'Lò XV mức -50', cap: 3, phan_xuong_id: px1 } });
    const vt1 = rs.data.id;
    rs = await api('/api/danh-muc/vi-tri', { method: 'POST',
        body: { ma: 'LO-CV-120', ten: 'Lò CV mức -120', cap: 3, phan_xuong_id: px2 } });
    const vt2 = rs.data.id;

    await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'cddl1', mat_khau: 'dl123456', vai_tro: 'px', phan_xuong_id: px1 } });
    await api('/api/auth/tai-khoan', { method: 'POST',
        body: { ten_dang_nhap: 'cddl2', mat_khau: 'dl223456', vai_tro: 'px', phan_xuong_id: px2 } });

    const nhom = (ma) => db.prepare('SELECT id FROM nhom_thiet_bi WHERE ma=?').get(ma).id;

    rs = await api('/api/thiet-bi', { method: 'POST', body: {
        ten: 'Máng cào SGB-620/40T', nhom_id: nhom('VT.01'), phan_xuong_id: px1,
        vi_tri_id: vt1, nguyen_gia: 850000000, ngay_su_dung: '2022-06-15' } });
    const tbMangCao = rs.data.id;
    kt('Tạo thiết bị máng cào', rs.status === 200 && rs.data.ma_tb === 'DL1.VT01.001', rs.data.ma_tb);

    rs = await api('/api/thiet-bi', { method: 'POST', body: {
        ten: 'Tời trục tải JD-25', nhom_id: nhom('VT.03'), phan_xuong_id: px1,
        vi_tri_id: vt1, nguyen_gia: 420000000 } });
    const tbToi = rs.data.id;

    /* =============== ĐIỀU CHUYỂN ===============
       Đã chuyển sang kiến trúc giao dịch thống nhất ở Giai đoạn 3,
       kiểm thử nằm trong test/test-giao-dich.js                    */
    await api('/api/auth/dang-xuat', { method: 'POST' });
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'cddl1', mat_khau: 'dl123456' } });

    /* =============== BẢO DƯỠNG - SỬA CHỮA =============== */
    ds.push('\n  --- Bảo dưỡng - sửa chữa ---');

    rs = await api('/api/bao-duong/ke-hoach', { method: 'POST', body: {
        thiet_bi_id: tbToi, cap_bd: 'thang', chu_ky_ngay: 30,
        lan_cuoi: congNgay(-45), nguoi_phu_trach: 'Tổ cơ điện' } });
    kt('Lập kế hoạch bảo dưỡng định kỳ', rs.status === 200);
    kt('Tự tính hạn bảo dưỡng kế tiếp', rs.data.lan_ke_tiep === congNgay(-15), rs.data.lan_ke_tiep);

    rs = await api('/api/bao-duong/ke-hoach', { method: 'POST', body: {
        thiet_bi_id: tbToi, cap_bd: 'thang', chu_ky_ngay: 30 } });
    kt('Chặn trùng kế hoạch cùng cấp bảo dưỡng', rs.status === 400);

    rs = await api('/api/tong-hop/canh-bao');
    kt('Cảnh báo bảo dưỡng quá hạn xuất hiện',
       rs.data.bao_duong.some(x => x.muc_canh_bao === 'qua_han'), JSON.stringify(rs.data.tom_tat));

    rs = await api('/api/bao-duong/phieu', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai: 'sua_chua', mo_ta_hu_hong: 'Mòn má phanh, cáp tời xơ tao',
        nguyen_nhan: 'Vận hành quá tải kéo dài', chi_phi_nhan_cong: 2500000,
        ngay_bao_hong: homNay(), muc_do: 'khan' } });
    const sc1 = rs.data.id;
    kt('Lập phiếu sửa chữa, sinh số phiếu',
       rs.status === 200 && /^SC-\d{4}\/001$/.test(rs.data.so_phieu), rs.data.so_phieu);

    rs = await api(`/api/bao-duong/phieu/${sc1}/vat-tu`, { method: 'POST', body: [
        { ma_vthh: 'CU.01.045', ten_vthh: 'Cáp thép 6x19 D18', dvt: 'm', so_luong: 120, don_gia: 185000 },
        { ma_vthh: 'CU.02.011', ten_vthh: 'Má phanh tời JD-25', dvt: 'Bộ', so_luong: 2, don_gia: 3400000 }
    ] });
    kt('Thêm vật tư thay thế', rs.status === 200 && rs.data.ids.length === 2);
    kt('Tự cộng chi phí vật tư (120×185.000 + 2×3.400.000)',
       rs.data.phieu.chi_phi_vat_tu === 29000000, String(rs.data.phieu.chi_phi_vat_tu));
    kt('Tổng chi phí = vật tư + nhân công',
       rs.data.phieu.tong_chi_phi === 31500000, String(rs.data.phieu.tong_chi_phi));

    rs = await api('/api/bao-duong/phieu/' + sc1);
    const vtXoa = rs.data.vat_tu[1].id;
    rs = await api('/api/bao-duong/vat-tu/' + vtXoa, { method: 'DELETE' });
    kt('Xoá dòng vật tư', rs.status === 200);
    rs = await api('/api/bao-duong/phieu/' + sc1);
    kt('Chi phí tự trừ lại sau khi xoá vật tư',
       rs.data.tong_chi_phi === 24700000, String(rs.data.tong_chi_phi));

    rs = await api(`/api/bao-duong/phieu/${sc1}/hoan-thanh`, { method: 'POST' });
    kt('Chưa duyệt thì chưa hoàn thành phiếu được', rs.status === 400);

    await api(`/api/bao-duong/phieu/${sc1}/gui-duyet`, { method: 'POST' });
    rs = await api(`/api/bao-duong/phieu/${sc1}/dong-y`, { method: 'POST' });
    kt('PX không tự duyệt phiếu sửa chữa của mình', rs.status === 403);

    await api('/api/auth/dang-xuat', { method: 'POST' });
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'admin', mat_khau: 'admin123' } });

    rs = await api(`/api/bao-duong/phieu/${sc1}/chuyen-lai`, { method: 'POST',
        body: { ly_do: 'Thiếu nguyên nhân hư hỏng chi tiết' } });
    kt('Chuyển lại phiếu sửa chữa kèm lý do', rs.status === 200);

    await api(`/api/bao-duong/phieu/${sc1}/gui-duyet`, { method: 'POST' });
    rs = await api(`/api/bao-duong/phieu/${sc1}/dong-y`, { method: 'POST' });
    kt('Duyệt phiếu sửa chữa', rs.status === 200);

    rs = await api('/api/thiet-bi/' + tbToi);
    kt('Duyệt xong thiết bị chuyển sang đang sửa',
       rs.data.thiet_bi.trang_thai === 'dang_sua', rs.data.thiet_bi.trang_thai);

    rs = await api(`/api/bao-duong/phieu/${sc1}/hoan-thanh`, { method: 'POST',
        body: { thoi_gian_dung_may: 16, ket_qua: 'dat' } });
    kt('Hoàn thành phiếu sửa chữa', rs.status === 200);

    rs = await api('/api/thiet-bi/' + tbToi);
    kt('Sửa xong thiết bị trở lại hoạt động', rs.data.thiet_bi.trang_thai === 'hoat_dong');

    /* Bảo dưỡng định kỳ -> tự tính hạn kế tiếp */
    rs = await api('/api/bao-duong/phieu', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai: 'bao_duong_dk', cap_bd: 'thang',
        mo_ta_hu_hong: 'Bảo dưỡng định kỳ tháng: tra dầu mỡ, siết bu lông, kiểm tra cáp' } });
    const bd1 = rs.data.id;
    await api(`/api/bao-duong/phieu/${bd1}/gui-duyet`, { method: 'POST' });
    await api(`/api/bao-duong/phieu/${bd1}/dong-y`, { method: 'POST' });
    rs = await api(`/api/bao-duong/phieu/${bd1}/hoan-thanh`, { method: 'POST',
        body: { ngay_hoan_thanh: homNay() } });
    kt('Hoàn thành bảo dưỡng định kỳ', rs.status === 200);
    const kh = rs.data.ke_hoach.find(x => x.cap_bd === 'thang');
    kt('Kế hoạch cập nhật lần bảo dưỡng cuối', kh?.lan_cuoi === homNay(), kh?.lan_cuoi);
    kt('Tự dời hạn bảo dưỡng kế tiếp thêm 30 ngày',
       kh?.lan_ke_tiep === congNgay(30), kh?.lan_ke_tiep);

    rs = await api('/api/tong-hop/canh-bao');
    kt('Hết cảnh báo bảo dưỡng quá hạn sau khi làm xong',
       !rs.data.bao_duong.some(x => x.muc_canh_bao === 'qua_han'));

    /* Nhật ký vận hành */
    rs = await api('/api/bao-duong/nhat-ky', { method: 'POST', body: {
        thiet_bi_id: tbToi, ngay: homNay(), ca: '1', gio_chay: 7.5, san_luong: 120 } });
    kt('Ghi nhật ký vận hành ca 1', rs.status === 200 && rs.data.gio_chay_luy_ke === 7.5);

    rs = await api('/api/bao-duong/nhat-ky', { method: 'POST', body: {
        thiet_bi_id: tbToi, ngay: homNay(), ca: '2', gio_chay: 6 } });
    kt('Giờ chạy cộng dồn luỹ kế', rs.data.gio_chay_luy_ke === 13.5, String(rs.data.gio_chay_luy_ke));

    rs = await api('/api/bao-duong/nhat-ky', { method: 'POST', body: {
        thiet_bi_id: tbToi, ngay: homNay(), ca: '1', gio_chay: 8 } });
    kt('Chặn ghi trùng thiết bị trong cùng ca', rs.status === 400);

    rs = await api('/api/bao-duong/bao-cao-chi-phi');
    const cp = rs.data.find(x => x.thiet_bi_id === tbToi);
    kt('Báo cáo chi phí tổng hợp theo thiết bị', cp && cp.so_lan_sc === 2, JSON.stringify(cp?.so_lan_sc));
    kt('Tính tỷ lệ chi phí trên nguyên giá', cp?.ty_le_cp_tren_nguyen_gia > 0, String(cp?.ty_le_cp_tren_nguyen_gia));

    /* =============== KIỂM ĐỊNH =============== */
    ds.push('\n  --- Kiểm định ---');

    rs = await api('/api/kiem-dinh/can-lam/' + tbToi);
    kt('Biết tời trục phải kiểm định thiết bị nâng',
       rs.data.some(x => x.ma === 'KD.NANG'), JSON.stringify(rs.data.map(x => x.ma)));
    kt('Biết tời trục phải kiểm tra cáp thép', rs.data.some(x => x.ma === 'KD.CAPTHEP'));
    kt('Chưa có hồ sơ thì để trống ngày hết hạn',
       rs.data.every(x => x.ngay_het_han === null));

    const loaiNang = rs.data.find(x => x.ma === 'KD.NANG').id;
    const loaiCap = rs.data.find(x => x.ma === 'KD.CAPTHEP').id;

    rs = await api('/api/kiem-dinh', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai_kiem_dinh_id: loaiNang, ngay_kiem_dinh: '2026-03-10',
        don_vi_kiem_dinh: 'Trung tâm Kiểm định KTAT khu vực I', so_giay_cn: 'KD-2026/0871' } });
    kt('Nhập hồ sơ kiểm định', rs.status === 200);
    kt('Tự tính hạn theo chu kỳ 12 tháng', rs.data.ngay_het_han === '2027-03-10', rs.data.ngay_het_han);

    rs = await api('/api/kiem-dinh', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai_kiem_dinh_id: loaiCap, ngay_kiem_dinh: congNgay(-100) } });
    kt('Kiểm tra cáp thép chu kỳ 3 tháng thành quá hạn', rs.status === 200);

    rs = await api('/api/tong-hop/canh-bao');
    kt('Cảnh báo kiểm định quá hạn',
       rs.data.kiem_dinh.some(x => x.muc_canh_bao === 'qua_han' && /Cáp thép|cáp thép/.test(x.loai_kiem_dinh)),
       JSON.stringify(rs.data.tom_tat));
    kt('Không còn báo thiếu kiểm định nâng cho tời',
       !rs.data.thieu_kiem_dinh.some(x => x.thiet_bi_id === tbToi && x.loai_kiem_dinh.includes('nâng')));

    rs = await api('/api/kiem-dinh/can-lam/' + tbToi);
    const kdNang = rs.data.find(x => x.ma === 'KD.NANG');
    kt('Hồ sơ hiện hành hiển thị đúng số giấy chứng nhận', kdNang.so_giay_cn === 'KD-2026/0871');

    rs = await api('/api/kiem-dinh', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai_kiem_dinh_id: loaiNang, ngay_kiem_dinh: homNay(),
        ket_qua: 'khong_dat', ket_luan: 'Phanh không đạt, dừng thiết bị' } });
    kt('Ghi nhận kiểm định không đạt', rs.status === 200);

    rs = await api('/api/thiet-bi/' + tbToi);
    kt('Kiểm định không đạt thì dừng thiết bị lại',
       rs.data.thiet_bi.trang_thai === 'dang_sua', rs.data.thiet_bi.trang_thai);
    kt('Hồ sơ thiết bị lưu đủ 3 lần kiểm định', rs.data.kiem_dinh.length === 3);

    rs = await api('/api/kiem-dinh/can-lam/' + tbToi);
    kt('Lấy đúng hồ sơ kiểm định mới nhất theo từng loại',
       rs.data.find(x => x.ma === 'KD.NANG').ket_qua === 'khong_dat');

    /* ---------- Phân quyền chéo ---------- */
    ds.push('\n  --- Phân quyền ---');
    await api('/api/auth/dang-xuat', { method: 'POST' });
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'cddl2', mat_khau: 'dl223456' } });

    rs = await api('/api/bao-duong/phieu');
    kt('PX DL2 không thấy phiếu sửa chữa của DL1', rs.data.length === 0, `thấy ${rs.data.length}`);

    rs = await api('/api/kiem-dinh');
    kt('PX DL2 không thấy hồ sơ kiểm định của DL1', rs.data.length === 0);

    rs = await api('/api/bao-duong/phieu/' + sc1, { method: 'PUT', body: { ghi_chu: 'sửa trộm' } });
    kt('Chặn PX khác sửa phiếu không thuộc mình', rs.status === 403);

    rs = await api('/api/kiem-dinh', { method: 'POST', body: {
        thiet_bi_id: tbToi, loai_kiem_dinh_id: loaiNang, ngay_kiem_dinh: homNay() } });
    kt('Chặn PX khác nhập kiểm định cho thiết bị không thuộc mình', rs.status === 403);

    } catch (e) {
        ds.push(`  [LỖI]   Dừng giữa chừng: ${e.message}\n${e.stack.split('\n')[1]}`);
        truot++;
    }

    server.close();
    console.log(ds.join('\n'));
    console.log(`\n===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====\n`);
    try { fs.unlinkSync(DB_TAM); } catch (e) {}
    process.exit(truot ? 1 : 0);
})();
