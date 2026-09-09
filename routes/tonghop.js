const express = require('express');
const db = require('../db');
const { dangNhap, gioiHanPX } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);
const conHieuLuc = alias => `NOT EXISTS (SELECT 1 FROM thiet_bi_deletions del WHERE del.thiet_bi_id=${alias}.id)`;

/* ---------- Số liệu dashboard ---------- */
r.get('/dashboard', (req, res) => {
    const gh = gioiHanPX(req);
    const dk = gh !== null ? 'AND tb.phan_xuong_id = ' + Number(gh) : '';

    const theoTrangThai = db.prepare(`
        SELECT trang_thai, COUNT(*) n, COALESCE(SUM(nguyen_gia),0) gt
        FROM thiet_bi tb WHERE ${conHieuLuc('tb')} ${dk} GROUP BY trang_thai`).all();

    const theoPX = db.prepare(`
        SELECT px.id AS phan_xuong_id, px.ten_ngan AS px, px.ten AS ten_px, COUNT(tb.id) n,
               COALESCE(SUM(tb.nguyen_gia),0) gt
        FROM phan_xuong px
        LEFT JOIN thiet_bi tb ON tb.phan_xuong_id = px.id AND tb.trang_thai <> 'da_thanh_ly' AND ${conHieuLuc('tb')}
        WHERE px.hoat_dong = 1 ${gh !== null ? 'AND px.id = ' + Number(gh) : ''}
        GROUP BY px.id ORDER BY px.thu_tu, px.ma`).all();

    const theoNhom = db.prepare(`
        SELECT n.ma AS ma_nhom, n.ten AS ten_nhom, nc.ten AS nhom_cha, COUNT(tb.id) n
        FROM thiet_bi tb
        JOIN nhom_thiet_bi n ON n.id = tb.nhom_id
        LEFT JOIN nhom_thiet_bi nc ON nc.id = n.parent_id
        WHERE tb.trang_thai <> 'da_thanh_ly' AND ${conHieuLuc('tb')} ${dk}
        GROUP BY n.id ORDER BY n.ma`).all();

    const tong = db.prepare(`
        SELECT COUNT(*) tong,
               SUM(CASE WHEN trang_thai='hoat_dong' THEN 1 ELSE 0 END) hoat_dong,
               SUM(CASE WHEN trang_thai='dang_sua' THEN 1 ELSE 0 END) dang_sua,
               SUM(CASE WHEN trang_thai='cho_thanh_ly' THEN 1 ELSE 0 END) cho_thanh_ly,
               SUM(CASE WHEN trang_thai_duyet='cho_duyet' THEN 1 ELSE 0 END) cho_duyet,
               COALESCE(SUM(nguyen_gia),0) tong_nguyen_gia
        FROM thiet_bi tb WHERE trang_thai <> 'da_thanh_ly' AND ${conHieuLuc('tb')} ${dk}`).get();

    res.json({ tong, theo_trang_thai: theoTrangThai, theo_phan_xuong: theoPX, theo_nhom: theoNhom });
});

/* ---------- Cảnh báo gộp ---------- */
r.get('/canh-bao', (req, res) => {
    const gh = gioiHanPX(req);
    const locPX = (alias) => gh !== null ? `AND ${alias} = ${Number(gh)}` : '';

    const kiemDinh = db.prepare(`
        SELECT cb.* FROM v_canh_bao_kiem_dinh cb
        JOIN thiet_bi tb ON tb.id = cb.thiet_bi_id
        WHERE cb.muc_canh_bao IN ('qua_han','sap_het_han') AND ${conHieuLuc('tb')} ${locPX('tb.phan_xuong_id')}
        ORDER BY cb.con_lai_ngay`).all();

    const thieuKD = db.prepare(`
        SELECT tk.* FROM v_thieu_kiem_dinh tk
        JOIN thiet_bi tb ON tb.id = tk.thiet_bi_id
        WHERE ${conHieuLuc('tb')} ${locPX('tb.phan_xuong_id')}
        ORDER BY tk.ma_tb LIMIT 200`).all();

    const baoDuong = db.prepare(`
        SELECT cb.* FROM v_canh_bao_bao_duong cb
        JOIN thiet_bi tb ON tb.id = cb.thiet_bi_id
        WHERE cb.muc_canh_bao IN ('qua_han','den_han') AND ${conHieuLuc('tb')} ${locPX('tb.phan_xuong_id')}
        ORDER BY cb.con_lai_ngay`).all();

    res.json({
        kiem_dinh: kiemDinh,
        thieu_kiem_dinh: thieuKD,
        bao_duong: baoDuong,
        tom_tat: {
            kd_qua_han: kiemDinh.filter(x => x.muc_canh_bao === 'qua_han').length,
            kd_sap_het_han: kiemDinh.filter(x => x.muc_canh_bao === 'sap_het_han').length,
            thieu_kiem_dinh: thieuKD.length,
            bd_qua_han: baoDuong.filter(x => x.muc_canh_bao === 'qua_han').length,
            bd_den_han: baoDuong.filter(x => x.muc_canh_bao === 'den_han').length
        }
    });
});

/* ---------- Việc chờ duyệt ---------- */
r.get('/cho-duyet', (req, res) => {
    const gh = gioiHanPX(req);
    const dk = gh !== null ? 'AND phan_xuong_id = ' + Number(gh) : '';
    const dkDC = gh !== null ? `AND (tu_phan_xuong_id = ${Number(gh)} OR den_phan_xuong_id = ${Number(gh)})` : '';
    res.json({
        thiet_bi: db.prepare(`SELECT COUNT(*) n FROM thiet_bi tb
                              WHERE trang_thai_duyet='cho_duyet' AND ${conHieuLuc('tb')} ${dk}`).get().n,
        dieu_chuyen: db.prepare(`SELECT COUNT(*) n FROM dieu_chuyen
                                 WHERE trang_thai='cho_duyet' ${dkDC}`).get().n,
        sua_chua: db.prepare(`SELECT COUNT(*) n FROM phieu_sua_chua
                              WHERE trang_thai='cho_duyet' ${dk}`).get().n,
        lo_import: db.prepare(`SELECT l.id, l.ten_file, l.so_hop_le, l.ngay_tai, px.ten_ngan AS px
                               FROM lo_import l JOIN phan_xuong px ON px.id=l.phan_xuong_id
                               WHERE l.trang_thai='da_nhap' ${gh !== null ? 'AND l.phan_xuong_id=' + Number(gh) : ''}
                               ORDER BY l.ngay_tai DESC LIMIT 10`).all()
    });
});

module.exports = r;
