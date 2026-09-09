const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { dangNhap, chiAdmin, quyenCuaToi } = require('../middleware/quyen');
const BM = require('../middleware/bao-mat');
const { catPhienCuaNguoi, danhSachPhien } = require('../lib/phien-sqlite');
const { passwordLengthError } = require('../lib/password-policy');
const { effectiveScreens } = require('../lib/function-visibility');

const r = express.Router();

/* ---------- Đăng nhập ---------- */
r.post('/dang-nhap', (req, res, next) => {
    const { ten_dang_nhap, mat_khau } = req.body || {};
    if (!ten_dang_nhap || !mat_khau) {
        return res.status(400).json({ loi: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    }

    const ten = ten_dang_nhap.trim();
    const ip = req.ip;

    // Chặn dò mật khẩu trước khi đụng tới database mật khẩu
    const khoa = BM.dangBiKhoa(ten, ip);
    if (khoa.khoa) {
        return res.status(429).json({
            loi: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${khoa.con_lai_phut} phút.` });
    }

    const u = db.prepare(`
        SELECT nd.*, px.ten AS ten_px, px.ten_ngan AS px_ngan
        FROM nguoi_dung nd
        LEFT JOIN phan_xuong px ON px.id = nd.phan_xuong_id
        WHERE nd.ten_dang_nhap = ?`).get(ten_dang_nhap.trim());

    if (!u || !bcrypt.compareSync(mat_khau, u.mat_khau_hash)) {
        BM.ghiDangNhapSai(ten, ip, req.get('user-agent'));
        const sau = BM.dangBiKhoa(ten, ip);
        // Lần sai này vừa chạm ngưỡng thì báo khóa luôn, không để người dùng
        // thử tiếp rồi mới biết mình đã bị khóa từ lượt trước
        if (sau.khoa) {
            return res.status(429).json({
                loi: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${sau.con_lai_phut} phút.` });
        }
        return res.status(401).json({
            loi: 'Tên đăng nhập hoặc mật khẩu không đúng' +
                 (sau.con_lai <= 2 ? `. Còn ${sau.con_lai} lần thử trước khi khóa tạm.` : '') });
    }
    if (!u.hoat_dong) {
        return res.status(403).json({ loi: 'Tài khoản đã bị khoá' });
    }
    if (u.tam_thoi && u.het_han && u.het_han < new Date().toISOString().slice(0, 19).replace('T', ' ')) {
        return res.status(403).json({ loi: 'Tài khoản tạm đã hết hạn' });
    }

    BM.xoaDangNhapSai(ten, ip);
    db.prepare(`UPDATE nguoi_dung SET lan_dang_nhap = datetime('now','localtime'),
                lan_dang_nhap_ip = ? WHERE id = ?`).run(ip, u.id);

    const nguoiDung = {
        id: u.id, ten_dang_nhap: u.ten_dang_nhap, ho_ten: u.ho_ten,
        vai_tro: u.vai_tro, phan_xuong_id: u.phan_xuong_id,
        ten_px: u.ten_px, px_ngan: u.px_ngan
    };
    req.session.regenerate(err => {
        if (err) return next(err);
        req.session.nguoiDung = nguoiDung;
        req.session.diaChiIp = ip;
        req.session.trinhDuyet = req.get('user-agent');
        req.session.save(saveError => {
            if (saveError) return next(saveError);
            res.json({ nguoi_dung: nguoiDung, phai_doi_mat_khau: !!u.phai_doi_mat_khau });
        });
    });
});

r.post('/dang-xuat', dangNhap, (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie('qlcd.sid', { httpOnly: true, sameSite: 'lax', secure: BM.LA_INTERNET });
        res.json({ ok: true });
    });
});

r.get('/toi', dangNhap, (req, res) => {
    const ch = db.prepare('SELECT khoa, gia_tri FROM cau_hinh').all();
    const cauHinh = Object.fromEntries(ch.map(x => [x.khoa, x.gia_tri]));
    const quyen = quyenCuaToi(req.session.nguoiDung);
    res.json({ nguoi_dung: req.session.nguoiDung, cau_hinh: cauHinh, quyen,
        hien_thi: effectiveScreens(req.session.nguoiDung, quyen) });
});

r.post('/doi-mat-khau', dangNhap, (req, res) => {
    const { mat_khau_cu, mat_khau_moi } = req.body || {};
    const loiDoDai = passwordLengthError(mat_khau_moi);
    if (loiDoDai) return res.status(400).json({ loi: loiDoDai });
    if (BM.LA_INTERNET && /^(admin|123456|password|qlcd)/i.test(mat_khau_moi)) {
        return res.status(400).json({ loi: 'Mật khẩu quá dễ đoán, chọn chuỗi khác' });
    }
    const u = db.prepare('SELECT * FROM nguoi_dung WHERE id = ?').get(req.session.nguoiDung.id);
    if (!bcrypt.compareSync(mat_khau_cu || '', u.mat_khau_hash)) {
        return res.status(400).json({ loi: 'Mật khẩu hiện tại không đúng' });
    }
    db.prepare(`UPDATE nguoi_dung SET mat_khau_hash = ?, phai_doi_mat_khau = 0,
                ngay_doi_mat_khau = datetime('now','localtime') WHERE id = ?`)
      .run(bcrypt.hashSync(mat_khau_moi, 10), u.id);
    res.json({ ok: true });
});

/* ---------- Quản lý tài khoản (chỉ admin) ---------- */
r.get('/tai-khoan', dangNhap, chiAdmin, (req, res) => {
    res.json(db.prepare(`
        SELECT nd.id, nd.ten_dang_nhap, nd.ho_ten, nd.chuc_vu, nd.vai_tro,
               nd.phan_xuong_id, px.ten_ngan AS px, nd.tam_thoi, nd.het_han,
               nd.hoat_dong, nd.lan_dang_nhap
        FROM nguoi_dung nd
        LEFT JOIN phan_xuong px ON px.id = nd.phan_xuong_id
        ORDER BY nd.vai_tro, nd.ten_dang_nhap`).all());
});

const QUYEN_PHAN_CAP = ['thietbi.xem','thietbi.them','thietbi.sua','thietbi.duyet','thietbi.tu_choi',
    'material.view','material.edit','vattu.duyet','vattu.tu_choi','import.duyet',
    'thietbi.export','thietbi.export.official','quantri.nhatky','scope.company','approval.self'];

r.get('/tai-khoan/:id/phan-cap', dangNhap, chiAdmin, (req,res) => {
    const u=db.prepare('SELECT id,ten_dang_nhap,ho_ten,vai_tro,hoat_dong FROM nguoi_dung WHERE id=?').get(req.params.id);
    if(!u) return res.status(404).json({loi:'Không tìm thấy tài khoản'});
    const level=db.prepare('SELECT * FROM user_account_level WHERE user_id=?').get(u.id);
    const units=db.prepare(`SELECT unit_id,access_type,valid_from,valid_to FROM user_unit_access WHERE user_id=? ORDER BY unit_id`).all(u.id);
    const overrides=db.prepare(`SELECT ma_quyen,duoc_phep FROM quyen_nguoi_dung_dong WHERE nguoi_dung_id=? AND ma_quyen IN (${QUYEN_PHAN_CAP.map(()=>'?').join(',')})`).all(u.id,...QUYEN_PHAN_CAP);
    const permissions=db.prepare(`SELECT ma,ten,hang_muc FROM ma_quyen WHERE ma IN (${QUYEN_PHAN_CAP.map(()=>'?').join(',')}) ORDER BY hang_muc,ten`).all(...QUYEN_PHAN_CAP);
    res.json({user:u,level,units,overrides,effective_permissions:quyenCuaToi(u),permissions,levels:db.prepare('SELECT code,name,rank FROM account_levels WHERE active=1 ORDER BY rank').all()});
});

r.put('/tai-khoan/:id/phan-cap', dangNhap, chiAdmin, (req,res) => {
    const id=Number(req.params.id), b=req.body||{};
    const u=db.prepare('SELECT * FROM nguoi_dung WHERE id=?').get(id); if(!u)return res.status(404).json({loi:'Không tìm thấy tài khoản'});
    if(!db.prepare('SELECT 1 FROM account_levels WHERE code=? AND active=1').get(b.level_code))return res.status(400).json({loi:'Cấp độ tài khoản không hợp lệ'});
    const managed=[...new Set((b.managed_unit_ids||[]).map(Number))], viewed=[...new Set((b.view_unit_ids||[]).map(Number))];
    if(managed.some(x=>viewed.includes(x)))return res.status(400).json({loi:'Một phân xưởng không thể đồng thời thuộc nhóm quản lý và chỉ xem'});
    const all=[...managed,...viewed]; if(all.some(x=>!Number.isInteger(x)||!db.prepare('SELECT 1 FROM phan_xuong WHERE id=? AND hoat_dong=1').get(x)))return res.status(400).json({loi:'Có phân xưởng không hợp lệ'});
    const selected=new Set((b.permissions||[]).filter(x=>QUYEN_PHAN_CAP.includes(x)));
    if(b.allow_self_approval) selected.add('approval.self'); else selected.delete('approval.self');
    const before={level:db.prepare('SELECT * FROM user_account_level WHERE user_id=?').get(id),units:db.prepare('SELECT unit_id,access_type FROM user_unit_access WHERE user_id=?').all(id),overrides:db.prepare('SELECT ma_quyen,duoc_phep FROM quyen_nguoi_dung_dong WHERE nguoi_dung_id=?').all(id)};
    db.transaction(()=>{
      db.prepare(`INSERT INTO user_account_level(user_id,level_code,allow_self_approval,updated_by,updated_at) VALUES (?,?,?,?,datetime('now','localtime'))
        ON CONFLICT(user_id) DO UPDATE SET level_code=excluded.level_code,allow_self_approval=excluded.allow_self_approval,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(id,b.level_code,b.allow_self_approval?1:0,req.session.nguoiDung.id);
      db.prepare('DELETE FROM user_unit_access WHERE user_id=?').run(id);
      const ins=db.prepare('INSERT INTO user_unit_access(user_id,unit_id,access_type,assigned_by) VALUES (?,?,?,?)'); managed.forEach(x=>ins.run(id,x,'MANAGE',req.session.nguoiDung.id));viewed.forEach(x=>ins.run(id,x,'VIEW',req.session.nguoiDung.id));
      const up=db.prepare(`INSERT INTO quyen_nguoi_dung_dong(nguoi_dung_id,ma_quyen,duoc_phep) VALUES (?,?,?) ON CONFLICT(nguoi_dung_id,ma_quyen) DO UPDATE SET duoc_phep=excluded.duoc_phep`);
      QUYEN_PHAN_CAP.forEach(q=>up.run(id,q,selected.has(q)?1:0));
      db.prepare(`INSERT INTO audit_quyen(nguoi_dung_id,hanh_dong,chi_tiet_cu,chi_tiet_moi,dia_chi_ip,user_agent) VALUES (?,'cap_nhat_phan_cap',?,?,?,?)`)
        .run(req.session.nguoiDung.id,JSON.stringify(before),JSON.stringify({target_user_id:id,level_code:b.level_code,managed,viewed,permissions:[...selected],allow_self_approval:!!b.allow_self_approval}),req.ip,req.get('user-agent'));
    }).immediate();
    catPhienCuaNguoi(id); res.json({ok:true});
});

r.post('/tai-khoan', dangNhap, chiAdmin, (req, res) => {
    const { ten_dang_nhap, mat_khau, ho_ten, chuc_vu, vai_tro, phan_xuong_id, tam_thoi } = req.body || {};
    if (!ten_dang_nhap) return res.status(400).json({ loi: 'Thiếu tên đăng nhập' });
    const loiDoDai = passwordLengthError(mat_khau);
    if (loiDoDai) return res.status(400).json({ loi: loiDoDai });
    if (vai_tro === 'px' && !phan_xuong_id) {
        return res.status(400).json({ loi: 'Tài khoản phân xưởng phải chọn phân xưởng' });
    }

    // Tài khoản tạm: hết hạn sau số giờ cấu hình (mặc định 24h), không cần tên/email
    let hetHan = null;
    if (tam_thoi) {
        const gio = Number(db.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa='tk_tam_gio'").get()?.gia_tri || 24);
        hetHan = db.prepare(`SELECT datetime('now','localtime','+${gio} hours') t`).get().t;
    }

    try {
        const info = db.prepare(`
            INSERT INTO nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, chuc_vu, vai_tro,
                                    phan_xuong_id, tam_thoi, het_han)
            VALUES (?,?,?,?,?,?,?,?)`)
          .run(ten_dang_nhap.trim(), bcrypt.hashSync(mat_khau, 10),
               ho_ten || null, chuc_vu || null, vai_tro || 'px',
               phan_xuong_id || null, tam_thoi ? 1 : 0, hetHan);
        res.json({ id: info.lastInsertRowid, het_han: hetHan });
    } catch (e) {
        if (/UNIQUE/.test(e.message)) return res.status(400).json({ loi: 'Tên đăng nhập đã tồn tại' });
        throw e;
    }
});

r.put('/tai-khoan/:id', dangNhap, chiAdmin, (req, res) => {
    const { ho_ten, chuc_vu, vai_tro, phan_xuong_id, hoat_dong, mat_khau } = req.body || {};
    const u = db.prepare('SELECT * FROM nguoi_dung WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ loi: 'Không tìm thấy tài khoản' });

    if (mat_khau) {
        const loiDoDai = passwordLengthError(mat_khau);
        if (loiDoDai) return res.status(400).json({ loi: loiDoDai });
    }

    db.prepare(`UPDATE nguoi_dung SET ho_ten=?, chuc_vu=?, vai_tro=?, phan_xuong_id=?, hoat_dong=?
                WHERE id=?`)
      .run(ho_ten ?? u.ho_ten, chuc_vu ?? u.chuc_vu, vai_tro ?? u.vai_tro,
           phan_xuong_id ?? u.phan_xuong_id, hoat_dong === undefined ? u.hoat_dong : (hoat_dong ? 1 : 0),
           u.id);

    if (mat_khau) {
        db.prepare(`UPDATE nguoi_dung SET mat_khau_hash=?, phai_doi_mat_khau=1 WHERE id=?`)
          .run(bcrypt.hashSync(mat_khau, 10), u.id);
    }
    // Khóa tài khoản hoặc đổi quyền thì cắt phiên đang mở, không đợi hết hạn
    if (mat_khau || hoat_dong === 0 || hoat_dong === false ||
        (vai_tro && vai_tro !== u.vai_tro)) {
        catPhienCuaNguoi(u.id);
    }
    res.json({ ok: true });
});

r.delete('/tai-khoan/:id', dangNhap, chiAdmin, (req, res) => {
    if (Number(req.params.id) === req.session.nguoiDung.id) {
        return res.status(400).json({ loi: 'Không thể xoá tài khoản đang đăng nhập' });
    }
    catPhienCuaNguoi(req.params.id);
    db.prepare('DELETE FROM nguoi_dung WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

/* ---------- Quản trị phiên đăng nhập ---------- */
r.get('/phien', dangNhap, chiAdmin, (req, res) => {
    res.json(danhSachPhien());
});

r.post('/phien/cat/:nguoiDungId', dangNhap, chiAdmin, (req, res) => {
    const n = catPhienCuaNguoi(req.params.nguoiDungId);
    res.json({ ok: true, so_phien_da_cat: n });
});

/* ---------- Nhật ký đăng nhập sai ---------- */
r.get('/dang-nhap-sai', dangNhap, chiAdmin, (req, res) => {
    res.json(db.prepare(`SELECT ten_dang_nhap, dia_chi_ip, thoi_gian, trinh_duyet
                         FROM dang_nhap_that_bai
                         ORDER BY thoi_gian DESC LIMIT 200`).all());
});

module.exports = r;
