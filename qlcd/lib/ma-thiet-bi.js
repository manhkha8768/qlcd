const db = require('../db');
const { khongDau } = require('./doc-excel');

/**
 * Sinh mã thiết bị theo quy tắc {MÃ_PX}.{MÃ_NHÓM}.{STT 3 số}
 * Ví dụ: DL1.VT01.003
 */
function sinhMa(phanXuongId, nhomId) {
    const px = db.prepare('SELECT ma FROM phan_xuong WHERE id = ?').get(phanXuongId);
    const nhom = db.prepare('SELECT ma FROM nhom_thiet_bi WHERE id = ?').get(nhomId);
    if (!px || !nhom) throw new Error('Thiếu phân xưởng hoặc nhóm thiết bị để sinh mã');

    const maNhom = nhom.ma.replace(/\./g, '');
    const tien = `${px.ma}.${maNhom}.`;

    const row = db.prepare(`
        SELECT ma_tb FROM thiet_bi
        WHERE ma_tb LIKE ? ORDER BY ma_tb DESC LIMIT 1`).get(tien + '%');

    let stt = 1;
    if (row) {
        const n = parseInt(row.ma_tb.slice(tien.length), 10);
        if (!isNaN(n)) stt = n + 1;
    }
    // Phòng trường hợp mã đã tồn tại do nhập tay
    let ma;
    do {
        ma = tien + String(stt).padStart(3, '0');
        stt++;
    } while (db.prepare('SELECT 1 FROM thiet_bi WHERE ma_tb = ?').get(ma));

    return ma;
}

/**
 * Đoán nhóm thiết bị từ tên tài sản dựa trên bảng từ khoá.
 * Trả về { nhom_id, ma, ten, do_tin_cay } hoặc null.
 */
let cacheTuKhoa = null;
function napTuKhoa() {
    if (cacheTuKhoa) return cacheTuKhoa;
    cacheTuKhoa = db.prepare(`
        SELECT tk.tu_khoa, tk.do_uu_tien, n.id AS nhom_id, n.ma, n.ten
        FROM tu_khoa_nhom tk JOIN nhom_thiet_bi n ON n.id = tk.nhom_id
        ORDER BY length(tk.tu_khoa) DESC`).all();
    return cacheTuKhoa;
}
function xoaCacheTuKhoa() { cacheTuKhoa = null; }

function doanNhom(tenTaiSan) {
    const t = khongDau(tenTaiSan);
    if (!t) return null;

    let tot = null;
    for (const tk of napTuKhoa()) {
        if (!t.includes(tk.tu_khoa)) continue;
        // Điểm = độ ưu tiên * 10 + độ dài từ khoá (từ khoá dài -> cụ thể hơn)
        const diem = tk.do_uu_tien * 10 + tk.tu_khoa.length;
        if (!tot || diem > tot.diem) {
            tot = { nhom_id: tk.nhom_id, ma: tk.ma, ten: tk.ten, diem, tu_khoa: tk.tu_khoa };
        }
    }
    if (!tot) return null;
    return {
        nhom_id: tot.nhom_id, ma: tot.ma, ten: tot.ten, tu_khoa: tot.tu_khoa,
        do_tin_cay: tot.diem >= 30 ? 'cao' : tot.diem >= 20 ? 'trung_binh' : 'thap'
    };
}

module.exports = { sinhMa, doanNhom, xoaCacheTuKhoa };
