/**
 * QUẢN LÝ DẢI MẠNG TRUY CẬP
 *
 * Cho phép quản trị khai báo những mạng nào được vào hệ thống:
 * mạng văn phòng, mạng từng phân xưởng, dải VPN, mạng 4G.
 */
const express = require('express');
const os = require('os');
const db = require('../db');
const { dangNhap } = require('../middleware/quyen');
const { canQuyen } = require('../middleware/quyen-ma');
const DM = require('../lib/dai-mang');
const { ghiAudit } = require('../lib/giao-dich');

const r = express.Router();
r.use(dangNhap);

/* ---------- Chẩn đoán: tôi đang vào từ đâu ----------
   Ai cũng xem được phần này, vì nó chỉ nói về chính kết nối của họ.
   Rất cần khi người dùng gọi điện báo không vào được hệ thống.        */
r.get('/toi', (req, res) => {
    const ip = DM.chuanHoaIp(req.ip);
    const ds = db.prepare('SELECT * FROM dai_mang WHERE hoat_dong=1').all();
    const khop = ds.filter(x => DM.trongDai(ip, x.dai));

    res.json({
        dia_chi_cua_ban: ip,
        loai_mang: DM.moTaMang(ip),
        goi_y_dai: DM.goiYDai(ip),
        giao_thuc: req.get('x-forwarded-proto') || req.protocol,
        loc_dang_bat: db.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa='bm_loc_dai_mang'")
                        .get()?.gia_tri === '1',
        dai_khop: khop.map(x => ({ dai: x.dai, ten: x.ten, cho_phep: !!x.cho_phep }))
    });
});

/* ---------- Địa chỉ máy chủ đang lắng nghe ---------- */
r.get('/may-chu', canQuyen('MANG_QUAN_LY'), (req, res) => {
    const card = [];
    const ifaces = os.networkInterfaces();
    for (const [ten, ds] of Object.entries(ifaces)) {
        for (const x of ds || []) {
            if (x.internal) continue;
            card.push({ card: ten, dia_chi: x.address, ho: x.family,
                        dai_goi_y: x.family === 'IPv4' ? DM.goiYDai(x.address) : null });
        }
    }
    res.json({
        dia_chi_lang_nghe: process.env.QLCD_HOST || '0.0.0.0',
        cong: process.env.PORT || 3000,
        ghi_chu: (process.env.QLCD_HOST || '0.0.0.0') === '0.0.0.0'
            ? 'Đang lắng nghe trên mọi card mạng, máy ở dải mạng khác vào được nếu định tuyến và tường lửa cho phép.'
            : 'Chỉ lắng nghe trên một địa chỉ, máy ở dải mạng khác sẽ không vào được.',
        card_mang: card
    });
});

/* ---------- Danh sách dải mạng ---------- */
r.get('/dai', canQuyen('MANG_QUAN_LY'), (req, res) => {
    res.json({
        dang_bat: db.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa='bm_loc_dai_mang'")
                    .get()?.gia_tri === '1',
        danh_sach: db.prepare(`SELECT d.*, px.ten_ngan AS px FROM dai_mang d
                               LEFT JOIN phan_xuong px ON px.id = d.phan_xuong_id
                               ORDER BY d.cho_phep DESC, d.loai, d.dai`).all()
    });
});

r.post('/dai', canQuyen('MANG_QUAN_LY'), (req, res) => {
    const b = req.body || {};
    const loi = DM.daiHopLe(b.dai);
    if (loi) return res.status(400).json({ loi });
    if (!b.ten) return res.status(400).json({ loi: 'Đặt tên cho dải mạng để sau này còn biết là mạng nào' });

    try {
        const i = db.prepare(`INSERT INTO dai_mang (dai, ten, loai, phan_xuong_id, cho_phep, ghi_chu, nguoi_tao_id)
                              VALUES (?,?,?,?,?,?,?)`)
          .run(String(b.dai).trim(), b.ten.trim(), b.loai || 'noi_bo',
               b.phan_xuong_id || null, b.cho_phep === 0 || b.cho_phep === false ? 0 : 1,
               b.ghi_chu || null, req.session.nguoiDung.id);
        ghiAudit(req, 'DAI_MANG_THEM', 'dai_mang', i.lastInsertRowid, `${b.dai} — ${b.ten}`);
        res.json({ id: i.lastInsertRowid });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Dải mạng này đã được khai báo' });
        throw e;
    }
});

r.put('/dai/:id', canQuyen('MANG_QUAN_LY'), (req, res) => {
    const d = db.prepare('SELECT * FROM dai_mang WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).json({ loi: 'Không tìm thấy dải mạng' });
    const b = req.body || {};
    if (b.dai) {
        const loi = DM.daiHopLe(b.dai);
        if (loi) return res.status(400).json({ loi });
    }
    db.prepare(`UPDATE dai_mang SET dai=?, ten=?, loai=?, phan_xuong_id=?, cho_phep=?,
                hoat_dong=?, ghi_chu=? WHERE id=?`)
      .run(b.dai ?? d.dai, b.ten ?? d.ten, b.loai ?? d.loai,
           b.phan_xuong_id !== undefined ? b.phan_xuong_id : d.phan_xuong_id,
           b.cho_phep !== undefined ? (b.cho_phep ? 1 : 0) : d.cho_phep,
           b.hoat_dong !== undefined ? (b.hoat_dong ? 1 : 0) : d.hoat_dong,
           b.ghi_chu ?? d.ghi_chu, d.id);
    ghiAudit(req, 'DAI_MANG_SUA', 'dai_mang', d.id, d.dai, d, b);
    res.json({ ok: true });
});

r.delete('/dai/:id', canQuyen('MANG_QUAN_LY'), (req, res) => {
    const d = db.prepare('SELECT * FROM dai_mang WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).json({ loi: 'Không tìm thấy dải mạng' });

    // Không cho xóa dải cuối cùng đang phủ chính người đang thao tác,
    // nếu không họ sẽ tự khóa mình ra ngoài ngay lập tức
    const bat = db.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa='bm_loc_dai_mang'").get()?.gia_tri;
    if (bat === '1' && !DM.laLoopback(req.ip)) {
        const conLai = db.prepare('SELECT * FROM dai_mang WHERE hoat_dong=1 AND cho_phep=1 AND id<>?')
            .all(d.id).filter(x => DM.trongDai(req.ip, x.dai));
        if (!conLai.length) {
            return res.status(400).json({
                loi: 'Xóa dải này thì chính bạn sẽ không vào được hệ thống nữa. ' +
                     'Hãy thêm dải mạng khác phủ địa chỉ của bạn trước, hoặc tắt lọc dải mạng.' });
        }
    }
    db.prepare('DELETE FROM dai_mang WHERE id=?').run(d.id);
    ghiAudit(req, 'DAI_MANG_XOA', 'dai_mang', d.id, `${d.dai} — ${d.ten}`);
    res.json({ ok: true });
});

/* ---------- Bật / tắt lọc ---------- */
r.post('/loc', canQuyen('MANG_QUAN_LY'), (req, res) => {
    const bat = req.body?.bat ? '1' : '0';

    if (bat === '1' && !DM.laLoopback(req.ip)) {
        const ds = db.prepare('SELECT * FROM dai_mang WHERE hoat_dong=1 AND cho_phep=1').all();
        if (!ds.length) {
            return res.status(400).json({
                loi: 'Chưa khai báo dải mạng nào. Thêm ít nhất một dải trước khi bật lọc, ' +
                     'nếu không sẽ không ai vào được hệ thống.' });
        }
        if (!ds.some(x => DM.trongDai(req.ip, x.dai))) {
            return res.status(400).json({
                loi: `Địa chỉ của bạn (${DM.chuanHoaIp(req.ip)}) không nằm trong dải nào đã khai báo. ` +
                     'Bật lọc bây giờ là bạn tự khóa mình ra ngoài. Hãy thêm dải phủ địa chỉ này trước.',
                goi_y_dai: DM.goiYDai(req.ip) });
        }
    }

    db.prepare(`INSERT INTO cau_hinh (khoa, gia_tri) VALUES ('bm_loc_dai_mang', ?)
                ON CONFLICT(khoa) DO UPDATE SET gia_tri=excluded.gia_tri`).run(bat);
    ghiAudit(req, bat === '1' ? 'LOC_DAI_MANG_BAT' : 'LOC_DAI_MANG_TAT', 'cau_hinh', 0,
             bat === '1' ? 'Bật lọc truy cập theo dải mạng' : 'Tắt lọc truy cập theo dải mạng');
    res.json({ ok: true, dang_bat: bat === '1' });
});

/* ---------- Nhật ký truy cập bị chặn ---------- */
r.get('/bi-chan', canQuyen('MANG_QUAN_LY'), (req, res) => {
    res.json(db.prepare(`SELECT dia_chi_ip, COUNT(*) AS so_lan,
                                MIN(thoi_gian) AS lan_dau, MAX(thoi_gian) AS lan_cuoi
                         FROM truy_cap_bi_chan
                         GROUP BY dia_chi_ip ORDER BY so_lan DESC LIMIT 100`).all());
});

module.exports = r;
