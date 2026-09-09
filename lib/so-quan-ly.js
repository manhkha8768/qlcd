const db = require('../db');

function chuanHoaSoQuanLy(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).normalize('NFKC').trim()
        .replace(/[‐‑‒–—―−]/g, '-')
        .replace(/\s+/g, ' ')
        .toUpperCase();
    return normalized || null;
}

function timTrungSoQuanLy(value, excludeId = null) {
    const normalized = chuanHoaSoQuanLy(value);
    if (!normalized) return null;
    return db.prepare(`SELECT tb.id,tb.ma_tb,tb.ten,tb.phan_xuong_id,px.ten_ngan AS px
        FROM thiet_bi_kiem_ke kk JOIN thiet_bi tb ON tb.id=kk.thiet_bi_id
        LEFT JOIN phan_xuong px ON px.id=tb.phan_xuong_id
        WHERE upper(trim(replace(replace(replace(replace(replace(kk.so_quan_ly,'–','-'),'—','-'),'−','-'),'‑','-'),'‐','-')))=?
          AND (? IS NULL OR tb.id<>?) LIMIT 1`).get(normalized, excludeId, excludeId) || null;
}

module.exports = { chuanHoaSoQuanLy, timTrungSoQuanLy };
