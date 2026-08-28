/**
 * API GIAO DỊCH: Tăng / Giảm / Điều chuyển
 *
 * Nguyên tắc bảo mật:
 *  - Backend không tin bất kỳ số liệu số lượng nào frontend gửi lên.
 *  - Mọi thao tác đều kiểm tra lại đơn vị của tài sản so với quyền người dùng,
 *    không dựa vào việc frontend đã ẩn nút hay chưa.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { canQuyen, coQuyen, donViDuocPhep, duocThaoTacDonVi, quyenCuaToi } = require('../middleware/quyen-ma');
const G = require('../lib/giao-dich');

const THU_MUC = path.join(__dirname, '..', 'uploads', 'ho-so');
if (!fs.existsSync(THU_MUC)) fs.mkdirSync(THU_MUC, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, f, cb) => cb(null, THU_MUC),
        filename: (req, f, cb) => cb(null, `hs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname)}`)
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, f, cb) => {
        const ok = /\.(pdf|docx?|xlsx?|png|jpe?g|gif|webp)$/i.test(f.originalname);
        cb(ok ? null : new Error('Chỉ nhận PDF, Word, Excel hoặc ảnh'), ok);
    }
});

const r = express.Router();
r.use(dangNhap);

/* ==================== DANH SÁCH & THỐNG KÊ ==================== */

/** Điều kiện lọc theo đơn vị người dùng được phép xem */
function dieuKienDonVi(req) {
    const ds = donViDuocPhep(req.session.nguoiDung);
    if (ds === null) return { sql: '', p: [] };
    if (!ds.length) return { sql: ' AND 1=0', p: [] };
    const ph = ds.map(() => '?').join(',');
    return { sql: ` AND (gd.don_vi_nguon_id IN (${ph}) OR gd.don_vi_dich_id IN (${ph}))`,
             p: [...ds, ...ds] };
}

r.get('/', (req, res) => {
    const dv = dieuKienDonVi(req);
    let sql = 'SELECT * FROM v_giao_dich gd WHERE 1=1' + dv.sql;
    const p = [...dv.p];

    if (req.query.loai) { sql += ' AND gd.loai_giao_dich=?'; p.push(req.query.loai); }
    if (req.query.trang_thai) { sql += ' AND gd.trang_thai=?'; p.push(req.query.trang_thai); }
    if (req.query.don_vi_id) {
        sql += ' AND (gd.don_vi_nguon_id=? OR gd.don_vi_dich_id=?)';
        p.push(req.query.don_vi_id, req.query.don_vi_id);
    }
    if (req.query.nguoi_tao_id) { sql += ' AND gd.nguoi_tao_id=?'; p.push(req.query.nguoi_tao_id); }
    if (req.query.tu_ngay) { sql += ' AND gd.ngay_giao_dich >= ?'; p.push(req.query.tu_ngay); }
    if (req.query.den_ngay) { sql += ' AND gd.ngay_giao_dich <= ?'; p.push(req.query.den_ngay); }
    if (req.query.q) {
        const k = '%' + req.query.q.trim() + '%';
        sql += ` AND (gd.ma_giao_dich LIKE ? OR gd.so_van_ban LIKE ? OR gd.ly_do LIKE ?
                 OR gd.tk_nguoi_tao LIKE ? OR gd.nguoi_tao LIKE ?
                 OR EXISTS (SELECT 1 FROM chi_tiet_giao_dich ct WHERE ct.giao_dich_id=gd.id
                            AND (ct.ten_snapshot LIKE ? OR ct.ma_tb_snapshot LIKE ?
                                 OR ct.ma_tscd_snapshot LIKE ?)))`;
        p.push(k, k, k, k, k, k, k, k);
    }
    sql += ' ORDER BY gd.ngay_giao_dich DESC, gd.ngay_tao DESC LIMIT ?';
    p.push(Math.min(500, Number(req.query.gioi_han) || 200));

    res.json(db.prepare(sql).all(...p));
});

/** Danh sách chờ duyệt + KPI cho màn hình phê duyệt */
r.get('/cho-duyet', (req, res) => {
    const u = req.session.nguoiDung;
    if (!coQuyen(u.id, u.vai_tro, 'GD_DUYET')) return res.json({ kpi: {}, danh_sach: [], duoc_duyet: false });

    const dv = dieuKienDonVi(req);
    const ds = db.prepare(`SELECT * FROM v_giao_dich gd WHERE gd.trang_thai='cho_duyet'${dv.sql}
                           ORDER BY gd.ngay_trinh`).all(...dv.p);

    const dem = (l) => ds.filter(x => x.loai_giao_dich === l).length;
    res.json({
        duoc_duyet: true,
        kpi: {
            tong: ds.length, tang: dem('tang'), giam: dem('giam'), dieu_chuyen: dem('dieu_chuyen'),
            qua_han: ds.filter(x => x.ngay_trinh &&
                (Date.now() - new Date(x.ngay_trinh.replace(' ', 'T')).getTime()) > 3 * 864e5).length
        },
        danh_sach: ds
    });
});

/** Số liệu bổ sung cho dashboard */
r.get('/thong-ke', (req, res) => {
    const dv = dieuKienDonVi(req);
    const thang = new Date().toISOString().slice(0, 7);

    const dem = (loai) => db.prepare(
        `SELECT COUNT(*) n FROM v_giao_dich gd WHERE gd.trang_thai='da_duyet'
         AND substr(gd.ngay_giao_dich,1,7)=?${dv.sql}`).get(thang, ...dv.p).n;

    const bienDong = db.prepare(`
        SELECT substr(gd.ngay_giao_dich,1,7) AS thang, gd.loai_giao_dich, COUNT(*) AS so_phieu,
               COALESCE(SUM(gd.tong_so_luong),0) AS so_luong
        FROM v_giao_dich gd
        WHERE gd.trang_thai='da_duyet'
          AND gd.ngay_giao_dich >= date('now','localtime','-11 months','start of month')${dv.sql}
        GROUP BY thang, gd.loai_giao_dich ORDER BY thang`).all(...dv.p);

    res.json({
        cho_duyet: db.prepare(`SELECT COUNT(*) n FROM v_giao_dich gd
                               WHERE gd.trang_thai='cho_duyet'${dv.sql}`).get(...dv.p).n,
        tang_trong_thang: dem('tang'), giam_trong_thang: dem('giam'),
        dieu_chuyen_trong_thang: dem('dieu_chuyen'),
        bien_dong: bienDong,
        gan_day: db.prepare(`SELECT * FROM v_giao_dich gd WHERE 1=1${dv.sql}
                             ORDER BY gd.ngay_tao DESC LIMIT 8`).all(...dv.p)
    });
});

/* ==================== CHI TIẾT MỘT PHIẾU ==================== */
r.get('/:id', (req, res) => {
    const gd = layGD(req, res); if (!gd) return;
    res.json({
        giao_dich: gd,
        chi_tiet: db.prepare(`
            SELECT ct.*, n.ma AS ma_nhom, n.ten AS ten_nhom,
                   tb.so_luong AS so_luong_hien_hanh, tb.ten AS ten_hien_hanh,
                   vtn.ten AS vi_tri_nguon, vtd.ten AS vi_tri_dich,
                   tbd.ma_tb AS ma_tb_dich
            FROM chi_tiet_giao_dich ct
            LEFT JOIN nhom_thiet_bi n ON n.id = ct.nhom_id_snapshot
            LEFT JOIN thiet_bi tb  ON tb.id = ct.thiet_bi_id
            LEFT JOIN thiet_bi tbd ON tbd.id = ct.thiet_bi_dich_id
            LEFT JOIN vi_tri vtn ON vtn.id = ct.vi_tri_nguon_id
            LEFT JOIN vi_tri vtd ON vtd.id = ct.vi_tri_dich_id
            WHERE ct.giao_dich_id=? ORDER BY ct.ngay_tao, ct.id`).all(gd.id),
        tai_lieu: db.prepare(`SELECT tl.*, nd.ho_ten AS nguoi_tai FROM tai_lieu_giao_dich tl
                              LEFT JOIN nguoi_dung nd ON nd.id = tl.nguoi_tai_id
                              WHERE tl.giao_dich_id=? ORDER BY tl.ngay_tai`).all(gd.id),
        lich_su: db.prepare(`SELECT ls.*, nd.ho_ten, nd.ten_dang_nhap FROM lich_su_trang_thai_gd ls
                             LEFT JOIN nguoi_dung nd ON nd.id = ls.nguoi_id
                             WHERE ls.giao_dich_id=? ORDER BY ls.thoi_gian, ls.id`).all(gd.id),
        loi_kiem_tra: gd.trang_thai === 'nhap' || gd.trang_thai === 'tu_choi'
                      ? G.kiemTraTruocTrinh(gd.id) : []
    });
});

/* ==================== TẠO / SỬA PHIẾU ==================== */
r.post('/', canQuyen('GD_TAO'), (req, res) => {
    const b = req.body || {};
    const u = req.session.nguoiDung;
    const loai = b.loai_giao_dich;
    if (!['tang', 'giam', 'dieu_chuyen'].includes(loai)) {
        return res.status(400).json({ loi: 'Loại giao dịch không hợp lệ' });
    }

    const quyenTheoLoai = { tang: 'TS_TANG', giam: 'TS_GIAM', dieu_chuyen: 'TS_DIEU_CHUYEN' };
    if (!coQuyen(u.id, u.vai_tro, quyenTheoLoai[loai])) {
        return res.status(403).json({ loi: 'Bạn không có quyền lập loại phiếu này' });
    }

    // Người dùng bị giới hạn đơn vị thì mọi phiếu đều gắn với đơn vị của họ
    const ds = donViDuocPhep(u);
    let nguon = b.don_vi_nguon_id || null, dich = b.don_vi_dich_id || null;
    if (ds !== null) {
        if (loai === 'tang') dich = ds[0];
        else nguon = ds[0];
    }

    if (loai === 'tang' && !dich) return res.status(400).json({ loi: 'Chưa chọn đơn vị nhận' });
    if (loai === 'giam' && !nguon) return res.status(400).json({ loi: 'Chưa chọn đơn vị giảm' });
    if (loai === 'dieu_chuyen') {
        if (!nguon || !dich) return res.status(400).json({ loi: 'Chưa chọn đủ đơn vị đi và đơn vị đến' });
        if (Number(nguon) === Number(dich)) {
            return res.status(400).json({ loi: 'Đơn vị đi và đơn vị đến phải khác nhau' });
        }
    }
    if (nguon && !duocThaoTacDonVi(u, nguon)) {
        return res.status(403).json({ loi: 'Bạn không có quyền lập phiếu cho đơn vị này' });
    }

    const id = G.uuid();
    const ma = G.sinhMaGiaoDich(loai, nguon, dich);
    db.prepare(`INSERT INTO giao_dich (id, ma_giao_dich, loai_giao_dich, ngay_giao_dich,
            don_vi_nguon_id, don_vi_dich_id, nguon_tham_chieu, ma_tham_chieu,
            so_van_ban, ngay_van_ban, ma_ly_do, ly_do, nguoi_giao, nguoi_nhan,
            nguoi_tao_id, ghi_chu)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, ma, loai, b.ngay_giao_dich || new Date().toISOString().slice(0, 10),
           nguon, dich, b.nguon_tham_chieu || null, b.ma_tham_chieu || null,
           b.so_van_ban || null, b.ngay_van_ban || null, b.ma_ly_do || null,
           b.ly_do || null, b.nguoi_giao || null, b.nguoi_nhan || null, u.id, b.ghi_chu || null);

    G.ghiTrangThai(id, null, 'nhap', 'tao', u.id);
    G.ghiAudit(req, 'GIAO_DICH_TAO', 'giao_dich', id, `Lập ${G.TEN_LOAI[loai]} ${ma}`);
    res.json({ id, ma_giao_dich: ma });
});

r.put('/:id', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (!['nhap', 'tu_choi'].includes(gd.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu đã trình duyệt, không sửa được' });
    }
    const b = req.body || {};
    const cu = { ly_do: gd.ly_do, so_van_ban: gd.so_van_ban, ngay_giao_dich: gd.ngay_giao_dich };

    const c = ['ngay_giao_dich', 'so_van_ban', 'ngay_van_ban', 'ma_ly_do', 'ly_do',
               'nguoi_giao', 'nguoi_nhan', 'ghi_chu', 'don_vi_dich_id'];
    const v = c.map(k => b[k] !== undefined ? b[k] : gd[k]);

    if (gd.loai_giao_dich === 'dieu_chuyen' &&
        Number(b.don_vi_dich_id ?? gd.don_vi_dich_id) === Number(gd.don_vi_nguon_id)) {
        return res.status(400).json({ loi: 'Đơn vị đi và đơn vị đến phải khác nhau' });
    }

    db.prepare(`UPDATE giao_dich SET ${c.map(k => k + '=?').join(',')},
                nguoi_sua_id=?, ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(...v, req.session.nguoiDung.id, gd.id);
    G.ghiAudit(req, 'GIAO_DICH_SUA', 'giao_dich', gd.id, `Sửa ${gd.ma_giao_dich}`, cu, b);
    res.json({ ok: true });
});

r.delete('/:id', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (gd.trang_thai !== 'nhap') {
        return res.status(400).json({ loi: 'Chỉ xóa được phiếu còn ở trạng thái nháp. Phiếu đã trình duyệt phải dùng chức năng Hủy.' });
    }
    db.prepare('DELETE FROM giao_dich WHERE id=?').run(gd.id);
    G.ghiAudit(req, 'GIAO_DICH_XOA_NHAP', 'giao_dich', gd.id, `Xóa phiếu nháp ${gd.ma_giao_dich}`);
    res.json({ ok: true });
});

/* ==================== CHI TIẾT PHIẾU ==================== */
r.post('/:id/chi-tiet', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (!['nhap', 'tu_choi'].includes(gd.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu đã trình duyệt, không thêm dòng được' });
    }
    const b = req.body || {};
    const soLuong = Number(b.so_luong);
    if (!(soLuong > 0)) return res.status(400).json({ loi: 'Số lượng phải lớn hơn 0' });

    const id = G.uuid();

    // Trường hợp tài sản mới: giữ ở dạng nháp, chỉ tạo bản ghi thật khi duyệt
    if (b.la_tai_san_moi) {
        if (gd.loai_giao_dich !== 'tang') {
            return res.status(400).json({ loi: 'Chỉ phiếu tăng mới được khai tài sản mới' });
        }
        const m = b.tai_san_moi || {};
        if (!m.ten) return res.status(400).json({ loi: 'Nhập tên tài sản mới' });
        if (!m.nhom_id) return res.status(400).json({ loi: 'Chọn nhóm thiết bị cho tài sản mới' });

        db.prepare(`INSERT INTO chi_tiet_giao_dich (id, giao_dich_id, ten_snapshot, dvt_snapshot,
                nhom_id_snapshot, ma_tscd_snapshot, don_gia_snapshot, so_luong, so_luong_truoc,
                vi_tri_dich_id, la_tai_san_moi, du_lieu_moi_json, ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,0,?,1,?,?)`)
          .run(id, gd.id, m.ten, m.dvt || 'Cái', m.nhom_id, m.ma_tscd || null,
               soLuong > 0 ? (Number(m.nguyen_gia) || 0) / soLuong : 0, soLuong,
               b.vi_tri_dich_id || null, JSON.stringify(m), b.ghi_chu || null);

        return res.json({ id, la_tai_san_moi: true });
    }

    // Tài sản đã có: chụp snapshot tại thời điểm đưa vào phiếu
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(b.thiet_bi_id);
    if (!tb) return res.status(404).json({ loi: 'Không tìm thấy tài sản' });

    // Kiểm tra đơn vị của tài sản, không tin frontend
    const donViYeuCau = gd.loai_giao_dich === 'tang' ? gd.don_vi_dich_id : gd.don_vi_nguon_id;
    if (Number(tb.phan_xuong_id) !== Number(donViYeuCau)) {
        return res.status(400).json({
            loi: `Tài sản "${tb.ten}" không thuộc đơn vị của phiếu này` });
    }
    if (!duocThaoTacDonVi(req.session.nguoiDung, tb.phan_xuong_id)) {
        return res.status(403).json({ loi: 'Bạn không có quyền thao tác trên đơn vị này' });
    }
    if (db.prepare('SELECT 1 FROM chi_tiet_giao_dich WHERE giao_dich_id=? AND thiet_bi_id=?')
          .get(gd.id, tb.id)) {
        return res.status(400).json({ loi: `Tài sản "${tb.ten}" đã có trong phiếu` });
    }
    if (['giam', 'dieu_chuyen'].includes(gd.loai_giao_dich) && soLuong > tb.so_luong) {
        return res.status(400).json({
            loi: `Số lượng ${gd.loai_giao_dich === 'giam' ? 'giảm' : 'điều chuyển'} vượt số lượng hiện có (${tb.so_luong} ${tb.dvt || ''}).` });
    }

    const s = G.chupSnapshot(tb.id);
    db.prepare(`INSERT INTO chi_tiet_giao_dich (id, giao_dich_id, thiet_bi_id, ma_tb_snapshot,
            ten_snapshot, dvt_snapshot, nhom_id_snapshot, ma_tscd_snapshot, don_gia_snapshot,
            so_luong, so_luong_truoc, vi_tri_nguon_id, vi_tri_nguon_text, vi_tri_dich_id,
            tinh_trang_truoc, ghi_chu)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, gd.id, tb.id, s.ma_tb_snapshot, s.ten_snapshot, s.dvt_snapshot,
           s.nhom_id_snapshot, s.ma_tscd_snapshot, s.don_gia_snapshot, soLuong,
           s.so_luong_truoc, s.vi_tri_nguon_id, s.vi_tri_nguon_text,
           b.vi_tri_dich_id || null, s.tinh_trang_truoc, b.ghi_chu || null);

    res.json({ id, so_luong_truoc: s.so_luong_truoc });
});

r.put('/:id/chi-tiet/:ctId', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (!['nhap', 'tu_choi'].includes(gd.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu đã trình duyệt, không sửa được' });
    }
    const ct = db.prepare('SELECT * FROM chi_tiet_giao_dich WHERE id=? AND giao_dich_id=?')
        .get(req.params.ctId, gd.id);
    if (!ct) return res.status(404).json({ loi: 'Không tìm thấy dòng chi tiết' });

    const b = req.body || {};
    const sl = b.so_luong !== undefined ? Number(b.so_luong) : ct.so_luong;
    if (!(sl > 0)) return res.status(400).json({ loi: 'Số lượng phải lớn hơn 0' });

    if (['giam', 'dieu_chuyen'].includes(gd.loai_giao_dich) && ct.thiet_bi_id) {
        const tb = db.prepare('SELECT so_luong, ten, dvt FROM thiet_bi WHERE id=?').get(ct.thiet_bi_id);
        if (tb && sl > tb.so_luong) {
            return res.status(400).json({
                loi: `Số lượng vượt số lượng hiện có (${tb.so_luong} ${tb.dvt || ''}).` });
        }
    }
    db.prepare(`UPDATE chi_tiet_giao_dich SET so_luong=?, vi_tri_dich_id=?, ghi_chu=?,
                ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(sl, b.vi_tri_dich_id !== undefined ? b.vi_tri_dich_id : ct.vi_tri_dich_id,
           b.ghi_chu !== undefined ? b.ghi_chu : ct.ghi_chu, ct.id);
    res.json({ ok: true });
});

r.delete('/:id/chi-tiet/:ctId', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (!['nhap', 'tu_choi'].includes(gd.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu đã trình duyệt, không xóa dòng được' });
    }
    db.prepare('DELETE FROM chi_tiet_giao_dich WHERE id=? AND giao_dich_id=?')
      .run(req.params.ctId, gd.id);
    res.json({ ok: true });
});

/* ==================== TÀI LIỆU ĐÍNH KÈM ==================== */
r.post('/:id/tai-lieu', canQuyen('GD_SUA'), upload.single('file'), (req, res) => {
    const gd = layGD(req, res, true);
    if (!gd) { if (req.file) fs.unlinkSync(req.file.path); return; }
    if (!req.file) return res.status(400).json({ loi: 'Chưa chọn file' });
    if (gd.trang_thai === 'da_duyet') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ loi: 'Phiếu đã duyệt, không đính kèm thêm được' });
    }

    const id = G.uuid();
    db.prepare(`INSERT INTO tai_lieu_giao_dich (id, giao_dich_id, ten_file, duong_dan, loai_file,
            kich_thuoc, loai_ho_so, nguoi_tai_id, ghi_chu) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, gd.id, req.file.originalname, req.file.filename,
           path.extname(req.file.originalname).slice(1).toLowerCase(), req.file.size,
           req.body.loai_ho_so || 'khac', req.session.nguoiDung.id, req.body.ghi_chu || null);
    G.ghiAudit(req, 'TAI_LIEU_TAI_LEN', 'tai_lieu_giao_dich', id,
               `${gd.ma_giao_dich}: đính kèm ${req.file.originalname}`);
    res.json({ id });
});

r.get('/:id/tai-lieu/:tlId/tai-ve', (req, res) => {
    const gd = layGD(req, res); if (!gd) return;
    const tl = db.prepare('SELECT * FROM tai_lieu_giao_dich WHERE id=? AND giao_dich_id=?')
        .get(req.params.tlId, gd.id);
    if (!tl) return res.status(404).json({ loi: 'Không tìm thấy tài liệu' });
    res.download(path.join(THU_MUC, tl.duong_dan), tl.ten_file);
});

r.delete('/:id/tai-lieu/:tlId', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (gd.trang_thai === 'da_duyet') {
        return res.status(400).json({ loi: 'Phiếu đã duyệt, không xóa tài liệu được' });
    }
    const tl = db.prepare('SELECT * FROM tai_lieu_giao_dich WHERE id=? AND giao_dich_id=?')
        .get(req.params.tlId, gd.id);
    if (!tl) return res.status(404).json({ loi: 'Không tìm thấy tài liệu' });
    try { fs.unlinkSync(path.join(THU_MUC, tl.duong_dan)); } catch (e) { /* file đã mất */ }
    db.prepare('DELETE FROM tai_lieu_giao_dich WHERE id=?').run(tl.id);
    res.json({ ok: true });
});

/* ==================== LUỒNG PHÊ DUYỆT ==================== */
r.get('/:id/kiem-tra', (req, res) => {
    const gd = layGD(req, res); if (!gd) return;
    res.json({ loi: G.kiemTraTruocTrinh(gd.id) });
});

r.post('/:id/trinh-duyet', canQuyen('GD_TRINH'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (!['nhap', 'tu_choi'].includes(gd.trang_thai)) {
        return res.status(400).json({ loi: 'Phiếu không ở trạng thái trình duyệt được' });
    }
    const loi = G.kiemTraTruocTrinh(gd.id);
    if (loi.length) return res.status(400).json({ loi: loi[0], danh_sach_loi: loi });

    const cu = gd.trang_thai;
    db.prepare(`UPDATE giao_dich SET trang_thai='cho_duyet', nguoi_trinh_id=?,
                ngay_trinh=datetime('now','localtime') WHERE id=?`)
      .run(req.session.nguoiDung.id, gd.id);
    G.ghiTrangThai(gd.id, cu, 'cho_duyet', cu === 'tu_choi' ? 'trinh_lai' : 'trinh_duyet',
                   req.session.nguoiDung.id);
    G.ghiAudit(req, 'GIAO_DICH_TRINH_DUYET', 'giao_dich', gd.id, `Trình duyệt ${gd.ma_giao_dich}`);
    G.baoNguoiDuyet(gd, 'Có giao dịch mới chờ duyệt',
        `${G.TEN_LOAI[gd.loai_giao_dich]} ${gd.ma_giao_dich} đang chờ duyệt.`);
    res.json({ ok: true });
});

r.post('/:id/duyet', canQuyen('GD_DUYET'), (req, res) => {
    const gd = layGD(req, res); if (!gd) return;
    try {
        const kq = G.duyetGiaoDich(req, gd.id);
        res.json({ ok: true, ket_qua: kq });
    } catch (e) {
        if (e.nghiepVu) return res.status(e.maHttp).json({ loi: e.message });
        throw e;
    }
});

r.post('/:id/tu-choi', canQuyen('GD_TU_CHOI'), (req, res) => {
    const gd = layGD(req, res); if (!gd) return;
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do từ chối' });
    if (gd.trang_thai !== 'cho_duyet') {
        return res.status(400).json({ loi: 'Chỉ từ chối được giao dịch đang chờ duyệt' });
    }

    db.prepare(`UPDATE giao_dich SET trang_thai='tu_choi', nguoi_tu_choi_id=?,
                ngay_tu_choi=datetime('now','localtime'), ly_do_tu_choi=? WHERE id=?`)
      .run(req.session.nguoiDung.id, lyDo, gd.id);
    G.ghiTrangThai(gd.id, 'cho_duyet', 'tu_choi', 'tu_choi', req.session.nguoiDung.id, lyDo);
    G.ghiAudit(req, 'GIAO_DICH_TU_CHOI', 'giao_dich', gd.id, `Từ chối ${gd.ma_giao_dich}: ${lyDo}`);
    G.taoThongBao(gd.nguoi_tao_id, 'tu_choi', 'Phiếu bị từ chối',
        `${G.TEN_LOAI[gd.loai_giao_dich]} ${gd.ma_giao_dich} bị từ chối. Lý do: ${lyDo}`, gd.id);
    res.json({ ok: true });
});

/** Mở lại phiếu bị từ chối để sửa và trình lại */
r.post('/:id/mo-lai', canQuyen('GD_SUA'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    if (gd.trang_thai !== 'tu_choi') {
        return res.status(400).json({ loi: 'Chỉ mở lại được phiếu đã bị từ chối' });
    }
    db.prepare("UPDATE giao_dich SET trang_thai='nhap' WHERE id=?").run(gd.id);
    G.ghiTrangThai(gd.id, 'tu_choi', 'nhap', 'mo_lai', req.session.nguoiDung.id);
    res.json({ ok: true });
});

r.post('/:id/huy', canQuyen('GD_HUY'), (req, res) => {
    const gd = layGD(req, res, true); if (!gd) return;
    const lyDo = (req.body?.ly_do || '').trim();
    if (!lyDo) return res.status(400).json({ loi: 'Phải nhập lý do hủy' });
    if (gd.trang_thai === 'da_duyet') {
        return res.status(400).json({
            loi: 'Giao dịch đã duyệt không hủy được. Muốn đảo lại phải lập giao dịch ngược chiều.' });
    }
    if (gd.trang_thai === 'huy') return res.status(400).json({ loi: 'Giao dịch đã hủy trước đó' });

    const cu = gd.trang_thai;
    db.prepare(`UPDATE giao_dich SET trang_thai='huy', nguoi_huy_id=?,
                ngay_huy=datetime('now','localtime'), ly_do_huy=? WHERE id=?`)
      .run(req.session.nguoiDung.id, lyDo, gd.id);
    G.ghiTrangThai(gd.id, cu, 'huy', 'huy', req.session.nguoiDung.id, lyDo);
    G.ghiAudit(req, 'GIAO_DICH_HUY', 'giao_dich', gd.id, `Hủy ${gd.ma_giao_dich}: ${lyDo}`);
    res.json({ ok: true });
});

/* --------------------------------------------------------------- */
/**
 * Lấy phiếu và kiểm tra quyền truy cập theo đơn vị.
 * chiDonViNguon = true: yêu cầu quyền thao tác trên đơn vị chịu trách nhiệm
 * (đơn vị nhận với phiếu tăng, đơn vị đi với phiếu giảm và điều chuyển).
 */
function layGD(req, res, canThaoTac = false) {
    const gd = db.prepare('SELECT * FROM v_giao_dich WHERE id=?').get(req.params.id);
    if (!gd) { res.status(404).json({ loi: 'Không tìm thấy giao dịch' }); return null; }

    const u = req.session.nguoiDung;
    const ds = donViDuocPhep(u);
    if (ds !== null) {
        const lienQuan = ds.includes(Number(gd.don_vi_nguon_id)) || ds.includes(Number(gd.don_vi_dich_id));
        if (!lienQuan) { res.status(403).json({ loi: 'Bạn không có quyền thao tác trên đơn vị này' }); return null; }

        if (canThaoTac) {
            const dvChiu = gd.loai_giao_dich === 'tang' ? gd.don_vi_dich_id : gd.don_vi_nguon_id;
            if (!ds.includes(Number(dvChiu))) {
                res.status(403).json({ loi: 'Phiếu này do đơn vị khác lập, bạn chỉ được xem' });
                return null;
            }
        }
    }
    return gd;
}

module.exports = r;
