/**
 * LÕI NGHIỆP VỤ KỸ THUẬT (Giai đoạn 4)
 */
const db = require('../db');
const { sinhSoPhieu } = require('./so-phieu');

/* ==================== CÂY CẤU TRÚC THIẾT BỊ ==================== */

/**
 * Dựng cây từ danh sách phẳng. Không giới hạn số cấp.
 * Node mồ côi (cha đã bị xóa mềm) được đưa lên gốc để không mất khỏi giao diện.
 */
function dungCay(ds) {
    const map = new Map();
    ds.forEach(n => map.set(n.id, { ...n, con: [] }));
    const goc = [];
    for (const n of map.values()) {
        const cha = n.cha_id ? map.get(n.cha_id) : null;
        if (cha) cha.con.push(n); else goc.push(n);
    }
    const sapXep = (arr) => {
        arr.sort((a, b) => (a.thu_tu - b.thu_tu) || a.ma_cum.localeCompare(b.ma_cum, 'vi'));
        arr.forEach(x => sapXep(x.con));
    };
    sapXep(goc);
    return goc;
}

/** Toàn bộ id hậu duệ của một cụm, dùng khi xóa mềm hoặc kiểm tra vòng lặp */
function hauDue(cumId) {
    const ket = [];
    const hangDoi = [cumId];
    while (hangDoi.length) {
        const id = hangDoi.shift();
        const con = db.prepare('SELECT id FROM cum_thiet_bi WHERE cha_id=?').all(id);
        con.forEach(c => { ket.push(c.id); hangDoi.push(c.id); });
    }
    return ket;
}

/** Đường dẫn từ gốc tới cụm: "Cụm tang > Tang chủ động > Gối đỡ" */
function duongDanCum(cumId) {
    const ten = [];
    let id = cumId, buoc = 0;
    while (id && buoc++ < 50) {
        const c = db.prepare('SELECT ten, cha_id FROM cum_thiet_bi WHERE id=?').get(id);
        if (!c) break;
        ten.unshift(c.ten);
        id = c.cha_id;
    }
    return ten.join(' > ');
}

function ghiLichSuCum(x) {
    db.prepare(`INSERT INTO lich_su_cum (cum_id, thiet_bi_id, loai_su_kien, ngay_su_kien,
        tinh_trang_truoc, tinh_trang_sau, cum_cu_id, cum_moi_id, phieu_bao_duong_id,
        phieu_sua_chua_id, su_co_id, nguoi_thuc_hien_id, ghi_chu)
        VALUES (@cum_id,@thiet_bi_id,@loai_su_kien,@ngay_su_kien,@tinh_trang_truoc,
        @tinh_trang_sau,@cum_cu_id,@cum_moi_id,@phieu_bao_duong_id,@phieu_sua_chua_id,
        @su_co_id,@nguoi_thuc_hien_id,@ghi_chu)`)
      .run({ tinh_trang_truoc: null, tinh_trang_sau: null, cum_cu_id: null, cum_moi_id: null,
             phieu_bao_duong_id: null, phieu_sua_chua_id: null, su_co_id: null,
             nguoi_thuc_hien_id: null, ghi_chu: null, ...x });
}

/* ==================== TÍNH HẠN BẢO DƯỠNG ==================== */

const NGAY_CHU_KY = { ngay: 1, tuan: 7, thang: 30, quy: 90, nam: 365 };

/**
 * Tính ngày bảo dưỡng kế tiếp từ ngày thực hiện và chu kỳ của kế hoạch.
 * Chu kỳ tháng/quý/năm cộng theo lịch chứ không quy đổi ra ngày, để
 * 24/08 chu kỳ 3 tháng ra đúng 24/11 chứ không phải 22/11.
 */
function tinhHanKeTiep(keHoach, ngayThucHien) {
    const loai = keHoach.loai_chu_ky || keHoach.cap_bd || 'thang';
    const n = Number(keHoach.gia_tri_chu_ky) || 1;

    if (loai === 'gio_chay') return null;            // hạn theo giờ chạy, không theo lịch

    if (['thang', 'quy', 'nam'].includes(loai)) {
        const soThang = loai === 'thang' ? n : loai === 'quy' ? n * 3 : n * 12;
        return db.prepare(`SELECT date(?, '+' || ? || ' months') t`).get(ngayThucHien, soThang).t;
    }
    if (['ngay', 'tuan'].includes(loai)) {
        return db.prepare(`SELECT date(?, '+' || ? || ' days') t`)
                 .get(ngayThucHien, n * NGAY_CHU_KY[loai]).t;
    }
    // tuy_chinh hoặc chu kỳ cũ ghi bằng số ngày
    const soNgay = Number(keHoach.chu_ky_ngay) || 30;
    return db.prepare(`SELECT date(?, '+' || ? || ' days') t`).get(ngayThucHien, soNgay).t;
}

/** Đồng bộ hai cách khai chu kỳ: kiểu cũ (chu_ky_ngay) và kiểu mới (loai_chu_ky) */
function chuanHoaChuKy(b) {
    const loai = b.loai_chu_ky || b.cap_bd || 'thang';
    let giaTri = Number(b.gia_tri_chu_ky) || 1;
    let chuKyNgay = Number(b.chu_ky_ngay) || null;

    if (!b.gia_tri_chu_ky && chuKyNgay && NGAY_CHU_KY[loai]) {
        giaTri = Math.max(1, Math.round(chuKyNgay / NGAY_CHU_KY[loai]));
    }
    if (!chuKyNgay && NGAY_CHU_KY[loai]) chuKyNgay = giaTri * NGAY_CHU_KY[loai];
    return { loai_chu_ky: loai, gia_tri_chu_ky: giaTri, chu_ky_ngay: chuKyNgay };
}

/* ==================== SINH MÃ ==================== */
const maSuCo = () => sinhSoPhieu('su_co', 'ma_su_co', 'SC');
const maPhieuBD = () => sinhSoPhieu('phieu_bao_duong', 'ma_phieu', 'BD');
const maPhieuSC = () => sinhSoPhieu('phieu_sua_chua', 'so_phieu', 'SCH');

/* ==================== TIMELINE VÒNG ĐỜI ==================== */

/**
 * Gom sự kiện từ mọi nguồn về một dòng thời gian.
 * Trả về mảng đã sắp giảm dần theo ngày.
 */
function timeline(thietBiId, loc = null, gioiHan = 200) {
    const sk = [];
    const them = (x) => { if (!loc || loc === 'tat_ca' || loc === x.nhom) sk.push(x); };

    db.prepare(`SELECT ls.*, gd.ma_giao_dich, gd.loai_giao_dich,
                       pxt.ten_ngan AS px_truoc, pxs.ten_ngan AS px_sau, nd.ho_ten
                FROM lich_su_tai_san ls
                LEFT JOIN giao_dich gd ON gd.id = ls.giao_dich_id
                LEFT JOIN phan_xuong pxt ON pxt.id = ls.don_vi_truoc_id
                LEFT JOIN phan_xuong pxs ON pxs.id = ls.don_vi_sau_id
                LEFT JOIN nguoi_dung nd ON nd.id = ls.nguoi_thuc_hien_id
                WHERE ls.thiet_bi_id=?`).all(thietBiId).forEach(x => {
        const chuyen = ['chuyen_di', 'chuyen_den'].includes(x.loai_su_kien);
        them({
            nhom: chuyen ? 'dieu_chuyen' : 'tang_giam',
            ngay: x.ngay_su_kien,
            loai: x.loai_su_kien,
            tieu_de: { tang: 'Tăng số lượng', giam: 'Giảm số lượng', tao_moi: 'Đưa vào sử dụng',
                       chuyen_di: 'Điều chuyển đi', chuyen_den: 'Điều chuyển đến',
                       dieu_chinh: 'Điều chỉnh' }[x.loai_su_kien] || x.loai_su_kien,
            mo_ta: [x.so_luong_thay_doi != null
                        ? `${x.so_luong_truoc} → ${x.so_luong_sau}` : null,
                    chuyen && x.px_truoc && x.px_sau ? `${x.px_truoc} → ${x.px_sau}` : null,
                    x.ghi_chu].filter(Boolean).join(' · '),
            chung_tu: x.ma_giao_dich, nguoi: x.ho_ten, id: x.id
        });
    });

    db.prepare(`SELECT s.*, c.ten AS ten_cum FROM su_co s
                LEFT JOIN cum_thiet_bi c ON c.id = s.cum_id
                WHERE s.thiet_bi_id=?`).all(thietBiId).forEach(x => them({
        nhom: 'su_co', ngay: x.ngay_su_co, loai: 'su_co',
        tieu_de: `Sự cố: ${x.hien_tuong}`,
        mo_ta: [x.ten_cum, MUC_DO[x.muc_do], x.dung_thiet_bi ? 'dừng thiết bị' : null]
               .filter(Boolean).join(' · '),
        chung_tu: x.ma_su_co, nguoi: x.nguoi_bao, muc_do: x.muc_do,
        trang_thai: x.trang_thai, id: x.id
    }));

    db.prepare(`SELECT p.*, c.ten AS ten_cum FROM phieu_sua_chua p
                LEFT JOIN cum_thiet_bi c ON c.id = p.cum_id
                WHERE p.thiet_bi_id=?`).all(thietBiId).forEach(x => them({
        nhom: 'sua_chua', ngay: x.ngay_hoan_thanh || x.ngay_bat_dau || x.ngay_tao?.slice(0, 10),
        loai: 'sua_chua', tieu_de: `Sửa chữa: ${x.mo_ta_hu_hong || ''}`,
        mo_ta: [x.ten_cum, x.tong_chi_phi ? dinh(x.tong_chi_phi) : null].filter(Boolean).join(' · '),
        chung_tu: x.so_phieu, trang_thai: x.trang_thai, chi_phi: x.tong_chi_phi, id: x.id
    }));

    db.prepare(`SELECT p.*, c.ten AS ten_cum FROM phieu_bao_duong p
                LEFT JOIN cum_thiet_bi c ON c.id = p.cum_id
                WHERE p.thiet_bi_id=?`).all(thietBiId).forEach(x => them({
        nhom: 'bao_duong', ngay: x.ngay_thuc_hien || x.ngay_ke_hoach,
        loai: 'bao_duong', tieu_de: `Bảo dưỡng ${x.cap_bd || ''}`,
        mo_ta: [x.ten_cum, x.noi_dung_cong_viec, x.tong_chi_phi ? dinh(x.tong_chi_phi) : null]
               .filter(Boolean).join(' · '),
        chung_tu: x.ma_phieu, nguoi: x.nguoi_thuc_hien, trang_thai: x.trang_thai,
        chi_phi: x.tong_chi_phi, id: x.id
    }));

    db.prepare(`SELECT lc.*, c.ten AS ten_cum, c.ma_cum, nd.ho_ten FROM lich_su_cum lc
                LEFT JOIN cum_thiet_bi c ON c.id = lc.cum_id
                LEFT JOIN nguoi_dung nd ON nd.id = lc.nguoi_thuc_hien_id
                WHERE lc.thiet_bi_id=?`).all(thietBiId).forEach(x => them({
        nhom: 'linh_kien', ngay: x.ngay_su_kien, loai: x.loai_su_kien,
        tieu_de: `${SU_KIEN_CUM[x.loai_su_kien] || x.loai_su_kien}: ${x.ten_cum || ''}`,
        mo_ta: x.ghi_chu, nguoi: x.ho_ten, id: x.id
    }));

    db.prepare(`SELECT k.*, l.ten AS ten_loai FROM kiem_dinh k
                JOIN loai_kiem_dinh l ON l.id = k.loai_kiem_dinh_id
                WHERE k.thiet_bi_id=?`).all(thietBiId).forEach(x => them({
        nhom: 'kiem_dinh', ngay: x.ngay_kiem_dinh, loai: 'kiem_dinh',
        tieu_de: `Kiểm định: ${x.ten_loai}`,
        mo_ta: [`hết hạn ${x.ngay_het_han}`, x.don_vi_kiem_dinh].filter(Boolean).join(' · '),
        chung_tu: x.so_giay_cn, trang_thai: x.ket_qua, id: x.id
    }));

    sk.sort((a, b) => String(b.ngay || '').localeCompare(String(a.ngay || '')));
    return sk.slice(0, gioiHan);
}

const MUC_DO = { nhe: 'Nhẹ', trung_binh: 'Trung bình',
                 nghiem_trong: 'Nghiêm trọng', khan_cap: 'Khẩn cấp' };
const SU_KIEN_CUM = { lap_dat: 'Lắp đặt', thao_ra: 'Tháo ra', thay_the: 'Thay thế',
                      sua_chua: 'Sửa chữa', bao_duong: 'Bảo dưỡng', hong: 'Hỏng',
                      kiem_tra: 'Kiểm tra', chuyen_vi_tri: 'Chuyển vị trí' };
const dinh = (n) => Number(n).toLocaleString('vi-VN') + ' đ';

module.exports = {
    dungCay, hauDue, duongDanCum, ghiLichSuCum,
    tinhHanKeTiep, chuanHoaChuKy, NGAY_CHU_KY,
    maSuCo, maPhieuBD, maPhieuSC, timeline, MUC_DO, SU_KIEN_CUM
};
