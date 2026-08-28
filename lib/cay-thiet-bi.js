/**
 * CÂY CẤU TRÚC THIẾT BỊ
 *
 * Lưu kèm duong_dan dạng /1/5/9/ và cap để:
 *   - lấy toàn bộ cây con bằng một truy vấn LIKE
 *   - chặn di chuyển một cụm vào chính cây con của nó
 */
const db = require('../db');

/** Tính đường dẫn và cấp từ cụm cha */
function tinhViTri(cumChaId) {
    if (!cumChaId) return { duong_dan: '/', cap: 1 };
    const cha = db.prepare('SELECT id, duong_dan, cap FROM cum_thiet_bi WHERE id=?').get(cumChaId);
    if (!cha) throw new Error('Không tìm thấy cụm cha');
    return { duong_dan: `${cha.duong_dan}${cha.id}/`, cap: cha.cap + 1 };
}

/** Cập nhật lại đường dẫn cho cụm và toàn bộ cây con sau khi di chuyển */
function capNhatCayCon(cumId) {
    const cum = db.prepare('SELECT * FROM cum_thiet_bi WHERE id=?').get(cumId);
    if (!cum) return;
    const con = db.prepare('SELECT id FROM cum_thiet_bi WHERE cum_cha_id=?').all(cumId);
    const q = db.prepare('UPDATE cum_thiet_bi SET duong_dan=?, cap=? WHERE id=?');
    for (const c of con) {
        q.run(`${cum.duong_dan}${cum.id}/`, cum.cap + 1, c.id);
        capNhatCayCon(c.id);
    }
}

/** Lấy toàn bộ cụm của một thiết bị, dựng thành cây lồng nhau */
function layCay(thietBiId, gomCaDaThao = false) {
    const dk = gomCaDaThao ? '' : ' AND hoat_dong = 1';
    const ds = db.prepare(`
        SELECT c.*,
               (SELECT COUNT(*) FROM cum_thiet_bi x WHERE x.cum_cha_id = c.id AND x.hoat_dong=1) AS so_con,
               (SELECT COUNT(*) FROM vat_tu_tuong_thich v WHERE v.cum_id = c.id) AS so_vat_tu,
               (SELECT COUNT(*) FROM lich_su_cum l WHERE l.cum_id = c.id) AS so_su_kien
        FROM cum_thiet_bi c
        WHERE c.thiet_bi_id = ?${dk}
        ORDER BY c.cap, c.thu_tu, c.id`).all(thietBiId);

    const theoId = new Map(ds.map(x => [x.id, { ...x, con: [] }]));
    const goc = [];
    for (const x of theoId.values()) {
        if (x.cum_cha_id && theoId.has(x.cum_cha_id)) theoId.get(x.cum_cha_id).con.push(x);
        else goc.push(x);
    }
    return goc;
}

/** Kiểm tra cumMoiChaId có nằm trong cây con của cumId không (chặn vòng lặp) */
function laConChau(cumId, cumMoiChaId) {
    if (!cumMoiChaId) return false;
    if (Number(cumId) === Number(cumMoiChaId)) return true;
    const cha = db.prepare('SELECT duong_dan FROM cum_thiet_bi WHERE id=?').get(cumMoiChaId);
    return !!cha && cha.duong_dan.includes(`/${cumId}/`);
}

function ghiLichSuCum(x) {
    db.prepare(`INSERT INTO lich_su_cum (cum_id, thiet_bi_id, loai_su_kien, ngay_su_kien,
            trang_thai_truoc, trang_thai_sau, cum_cu_id, cum_moi_id, phieu_sc_id,
            ban_ghi_bd_id, su_co_id, nguoi_thuc_hien_id, ghi_chu)
        VALUES (@cum_id,@thiet_bi_id,@loai_su_kien,@ngay_su_kien,@trang_thai_truoc,
            @trang_thai_sau,@cum_cu_id,@cum_moi_id,@phieu_sc_id,@ban_ghi_bd_id,
            @su_co_id,@nguoi_thuc_hien_id,@ghi_chu)`)
      .run({ trang_thai_truoc: null, trang_thai_sau: null, cum_cu_id: null, cum_moi_id: null,
             phieu_sc_id: null, ban_ghi_bd_id: null, su_co_id: null, ghi_chu: null, ...x });
}

/** Vật tư gợi ý cho một cụm: ưu tiên gắn trực tiếp, sau đó tới thiết bị, rồi nhóm */
function vatTuGoiY({ cumId = null, thietBiId = null, nhomId = null }) {
    const ds = db.prepare(`
        SELECT v.*, t.so_luong_khuyen_nghi, t.la_chinh,
               CASE WHEN t.cum_id IS NOT NULL THEN 'cum'
                    WHEN t.thiet_bi_id IS NOT NULL THEN 'thiet_bi'
                    ELSE 'nhom' END AS nguon_goi_y
        FROM vat_tu_tuong_thich t
        JOIN vat_tu v ON v.id = t.vat_tu_id AND v.hoat_dong = 1
        WHERE (? IS NOT NULL AND t.cum_id = ?)
           OR (? IS NOT NULL AND t.thiet_bi_id = ?)
           OR (? IS NOT NULL AND t.nhom_id = ?)
        ORDER BY t.la_chinh DESC, v.ten_vat_tu`)
      .all(cumId, cumId, thietBiId, thietBiId, nhomId, nhomId);

    // Bỏ trùng, giữ bản ghi có mức ưu tiên cao nhất
    const uuTien = { cum: 3, thiet_bi: 2, nhom: 1 };
    const theoVT = new Map();
    for (const x of ds) {
        const cu = theoVT.get(x.id);
        if (!cu || uuTien[x.nguon_goi_y] > uuTien[cu.nguon_goi_y]) theoVT.set(x.id, x);
    }
    return [...theoVT.values()];
}

module.exports = { tinhViTri, capNhatCayCon, layCay, laConChau, ghiLichSuCum, vatTuGoiY };
