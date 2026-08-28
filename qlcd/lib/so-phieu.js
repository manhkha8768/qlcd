const db = require('../db');

/**
 * Sinh số phiếu dạng {TIỀN_TỐ}-{NĂM}/{STT 3 số}, ví dụ SC-2026/007.
 * Số thứ tự chạy riêng theo từng loại phiếu và từng năm.
 */
function sinhSoPhieu(bang, cot, tienTo) {
    const nam = new Date().getFullYear();
    const mau = `${tienTo}-${nam}/`;
    const row = db.prepare(
        `SELECT ${cot} AS sp FROM ${bang} WHERE ${cot} LIKE ? ORDER BY ${cot} DESC LIMIT 1`
    ).get(mau + '%');

    let stt = 1;
    if (row) {
        const n = parseInt(row.sp.slice(mau.length), 10);
        if (!isNaN(n)) stt = n + 1;
    }
    let sp;
    do {
        sp = mau + String(stt).padStart(3, '0');
        stt++;
    } while (db.prepare(`SELECT 1 FROM ${bang} WHERE ${cot} = ?`).get(sp));
    return sp;
}

/** Ghi vết phê duyệt dùng chung cho mọi loại chứng từ */
function ghiPheDuyet(loai, id, hanhDong, nguoiId, lyDo = null) {
    db.prepare(`INSERT INTO phe_duyet (doi_tuong_loai, doi_tuong_id, hanh_dong, ly_do, nguoi_id)
                VALUES (?,?,?,?,?)`).run(loai, id, hanhDong, lyDo, nguoiId);
}

module.exports = { sinhSoPhieu, ghiPheDuyet };
