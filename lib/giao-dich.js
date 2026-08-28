/**
 * LÕI NGHIỆP VỤ GIAO DỊCH
 *
 * Mọi thay đổi dữ liệu hiện hành (bảng thiet_bi) chỉ xảy ra ở hàm
 * duyetGiaoDich, chạy trong một database transaction duy nhất.
 * Form lập phiếu không bao giờ được ghi thẳng vào thiet_bi.
 */
const crypto = require('crypto');
const db = require('../db');
const { sinhMa } = require('./ma-thiet-bi');
const { coQuyen } = require('../middleware/quyen-ma');

const uuid = () => crypto.randomUUID();

const TEN_LOAI = { tang: 'Tăng tài sản', giam: 'Giảm tài sản',
                   dieu_chuyen: 'Điều chuyển', dieu_chinh: 'Điều chỉnh' };

/* ==================== SINH MÃ PHIẾU ==================== */
/**
 * TANG-DL1-2026-0001 · GIAM-DL1-2026-0001 · DC-DL1-DL2-2026-0001
 * Dùng bộ đếm riêng nên hai người lập phiếu cùng lúc không trùng mã.
 */
function sinhMaGiaoDich(loai, donViNguonId, donViDichId) {
    const nam = new Date().getFullYear();
    const ma = (id) => id ? (db.prepare('SELECT ma FROM phan_xuong WHERE id=?').get(id)?.ma || 'CTY') : 'CTY';

    let tienTo;
    if (loai === 'tang') tienTo = `TANG-${ma(donViDichId)}`;
    else if (loai === 'giam') tienTo = `GIAM-${ma(donViNguonId)}`;
    else if (loai === 'dieu_chuyen') tienTo = `DC-${ma(donViNguonId)}-${ma(donViDichId)}`;
    else tienTo = `DCH-${ma(donViNguonId || donViDichId)}`;

    const khoa = `${tienTo}-${nam}`;
    db.prepare('INSERT INTO bo_dem_ma (khoa, gia_tri) VALUES (?,0) ON CONFLICT(khoa) DO NOTHING').run(khoa);
    db.prepare('UPDATE bo_dem_ma SET gia_tri = gia_tri + 1 WHERE khoa=?').run(khoa);
    const stt = db.prepare('SELECT gia_tri FROM bo_dem_ma WHERE khoa=?').get(khoa).gia_tri;

    return `${khoa}-${String(stt).padStart(4, '0')}`;
}

/* ==================== GHI VẾT ==================== */
function ghiTrangThai(gdId, cu, moi, hanhDong, nguoiId, lyDo = null) {
    db.prepare(`INSERT INTO lich_su_trang_thai_gd
        (giao_dich_id, trang_thai_cu, trang_thai_moi, hanh_dong, nguoi_id, ly_do)
        VALUES (?,?,?,?,?,?)`).run(gdId, cu, moi, hanhDong, nguoiId, lyDo);
}

function ghiAudit(req, hanhDong, bang, banGhiId, noiDung, cu = null, moi = null) {
    db.prepare(`INSERT INTO nhat_ky_he_thong
        (nguoi_id, hanh_dong, bang, ban_ghi_id, noi_dung, du_lieu_cu, du_lieu_moi, dia_chi_ip, trinh_duyet)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(req.session?.nguoiDung?.id || null, hanhDong, bang, String(banGhiId ?? ''), noiDung,
           cu ? JSON.stringify(cu) : null, moi ? JSON.stringify(moi) : null,
           req.ip || null, (req.get?.('user-agent') || '').slice(0, 200) || null);
}

function ghiLichSuTaiSan(x) {
    db.prepare(`INSERT INTO lich_su_tai_san
        (thiet_bi_id, giao_dich_id, loai_su_kien, ngay_su_kien, don_vi_truoc_id, don_vi_sau_id,
         so_luong_truoc, so_luong_thay_doi, so_luong_sau, vi_tri_truoc, vi_tri_sau,
         trang_thai_truoc, trang_thai_sau, nguoi_thuc_hien_id, ghi_chu)
        VALUES (@thiet_bi_id,@giao_dich_id,@loai_su_kien,@ngay_su_kien,@don_vi_truoc_id,@don_vi_sau_id,
         @so_luong_truoc,@so_luong_thay_doi,@so_luong_sau,@vi_tri_truoc,@vi_tri_sau,
         @trang_thai_truoc,@trang_thai_sau,@nguoi_thuc_hien_id,@ghi_chu)`)
      .run({ don_vi_truoc_id: null, don_vi_sau_id: null, so_luong_truoc: null,
             so_luong_thay_doi: null, so_luong_sau: null, vi_tri_truoc: null, vi_tri_sau: null,
             trang_thai_truoc: null, trang_thai_sau: null, ghi_chu: null, ...x });
}

function taoThongBao(nguoiNhanId, loai, tieuDe, noiDung, maThamChieu) {
    if (!nguoiNhanId) return;
    db.prepare(`INSERT INTO thong_bao (nguoi_nhan_id, loai, tieu_de, noi_dung, loai_tham_chieu, ma_tham_chieu)
                VALUES (?,?,?,?,'giao_dich',?)`).run(nguoiNhanId, loai, tieuDe, noiDung, maThamChieu);
}

/** Gửi thông báo tới mọi người có quyền duyệt liên quan đến đơn vị của phiếu */
function baoNguoiDuyet(gd, tieuDe, noiDung) {
    const ds = db.prepare(`
        SELECT DISTINCT nd.id FROM nguoi_dung nd
        WHERE nd.hoat_dong = 1
          AND (EXISTS (SELECT 1 FROM quyen_vai_tro q WHERE q.vai_tro = nd.vai_tro AND q.ma_quyen='GD_DUYET')
               OR EXISTS (SELECT 1 FROM quyen_nguoi_dung q WHERE q.nguoi_dung_id = nd.id
                          AND q.ma_quyen='GD_DUYET' AND q.duoc_phep=1))
          AND NOT EXISTS (SELECT 1 FROM quyen_nguoi_dung q WHERE q.nguoi_dung_id = nd.id
                          AND q.ma_quyen='GD_DUYET' AND q.duoc_phep=0)`).all();
    ds.forEach(u => taoThongBao(u.id, 'cho_duyet', tieuDe, noiDung, gd.id));
}

/* ==================== SNAPSHOT CHI TIẾT ==================== */
/**
 * Chụp lại thông tin tài sản tại thời điểm đưa vào phiếu.
 * Lịch sử phiếu không phụ thuộc dữ liệu hiện hành: sau này thiết bị
 * đổi tên hay thanh lý, phiếu cũ vẫn đọc đúng nội dung lúc lập.
 */
function chupSnapshot(thietBiId) {
    const tb = db.prepare(`
        SELECT tb.*, vt.ten AS ten_vi_tri FROM thiet_bi tb
        LEFT JOIN vi_tri vt ON vt.id = tb.vi_tri_id WHERE tb.id=?`).get(thietBiId);
    if (!tb) throw new Error('Không tìm thấy tài sản');
    return {
        ma_tb_snapshot: tb.ma_tb, ten_snapshot: tb.ten, dvt_snapshot: tb.dvt,
        nhom_id_snapshot: tb.nhom_id, ma_tscd_snapshot: tb.ma_tscd,
        don_gia_snapshot: tb.so_luong > 0 ? (tb.nguyen_gia || 0) / tb.so_luong : (tb.nguyen_gia || 0),
        so_luong_truoc: tb.so_luong,
        vi_tri_nguon_id: tb.vi_tri_id, vi_tri_nguon_text: tb.ten_vi_tri,
        tinh_trang_truoc: tb.tinh_trang_kt,
        _tb: tb
    };
}

/* ==================== KIỂM TRA TRƯỚC KHI TRÌNH ==================== */
/**
 * @param khiDuyet  true = bỏ qua so sánh số lượng, để hàm áp dụng nghiệp vụ
 *                  báo lỗi tranh chấp với thông điệp riêng, rõ nguyên nhân hơn.
 */
function kiemTraTruocTrinh(gdId, khiDuyet = false) {
    const gd = db.prepare('SELECT * FROM giao_dich WHERE id=?').get(gdId);
    if (!gd) return ['Không tìm thấy giao dịch'];
    const ct = db.prepare('SELECT * FROM chi_tiet_giao_dich WHERE giao_dich_id=?').all(gdId);
    const loi = [];

    if (!ct.length) loi.push('Phiếu chưa có dòng chi tiết nào');
    if (!gd.ly_do || !gd.ly_do.trim()) loi.push('Chưa nhập lý do');
    if (!gd.ngay_giao_dich) loi.push('Chưa có ngày giao dịch');

    if (gd.loai_giao_dich === 'tang' && !gd.don_vi_dich_id) loi.push('Chưa chọn đơn vị nhận');
    if (gd.loai_giao_dich === 'giam' && !gd.don_vi_nguon_id) loi.push('Chưa chọn đơn vị giảm');
    if (gd.loai_giao_dich === 'dieu_chuyen') {
        if (!gd.don_vi_nguon_id || !gd.don_vi_dich_id) loi.push('Chưa chọn đủ đơn vị đi và đơn vị đến');
        else if (gd.don_vi_nguon_id === gd.don_vi_dich_id) loi.push('Đơn vị đi và đơn vị đến phải khác nhau');
    }

    for (const d of ct) {
        if (!(d.so_luong > 0)) loi.push(`Dòng "${d.ten_snapshot}": số lượng phải lớn hơn 0`);

        if (['giam', 'dieu_chuyen'].includes(gd.loai_giao_dich) && d.thiet_bi_id) {
            const tb = db.prepare('SELECT so_luong, ten FROM thiet_bi WHERE id=?').get(d.thiet_bi_id);
            if (!tb) loi.push(`Dòng "${d.ten_snapshot}": tài sản không còn tồn tại`);
            else if (!khiDuyet && d.so_luong > tb.so_luong) {
                loi.push(`Dòng "${tb.ten}": số lượng ${gd.loai_giao_dich === 'giam' ? 'giảm' : 'điều chuyển'} ` +
                         `(${d.so_luong}) vượt số lượng hiện có (${tb.so_luong})`);
            }
        }
        if (d.la_tai_san_moi) {
            const m = JSON.parse(d.du_lieu_moi_json || '{}');
            if (!m.ten) loi.push('Tài sản mới thiếu tên');
            if (!m.nhom_id) loi.push(`Tài sản mới "${m.ten || ''}" chưa chọn nhóm thiết bị`);
        }
    }
    return loi;
}

/* ==================== TÌM TÀI SẢN TƯƠNG ỨNG Ở ĐƠN VỊ ĐÍCH ==================== */
/**
 * Dùng khi điều chuyển một phần. Không khớp bằng tên đơn thuần:
 *   1. Trùng mã tài sản kế toán (ma_tscd)  - chắc chắn nhất
 *   2. Trùng model và cùng nhóm
 *   3. Cùng nhóm, cùng tên, cùng đơn vị tính
 * Không lấy bản ghi đã thanh lý.
 */
function timTaiSanDich(nguon, donViDichId) {
    const q = (sql, ...p) => db.prepare(sql).get(...p);
    const dk = `phan_xuong_id=? AND trang_thai<>'da_thanh_ly'`;

    if (nguon.ma_tscd) {
        const t = q(`SELECT * FROM thiet_bi WHERE ${dk} AND ma_tscd=? AND nhom_id=?`,
                    donViDichId, nguon.ma_tscd, nguon.nhom_id);
        if (t) return { tb: t, quy_tac: 'ma_tscd' };
    }
    if (nguon.model_id) {
        const t = q(`SELECT * FROM thiet_bi WHERE ${dk} AND model_id=? AND nhom_id=?`,
                    donViDichId, nguon.model_id, nguon.nhom_id);
        if (t) return { tb: t, quy_tac: 'model' };
    }
    const t = q(`SELECT * FROM thiet_bi WHERE ${dk} AND nhom_id=? AND ten=?
                 AND COALESCE(dvt,'') = COALESCE(?,'')`,
                donViDichId, nguon.nhom_id, nguon.ten, nguon.dvt);
    return t ? { tb: t, quy_tac: 'nhom_ten_dvt' } : null;
}

/* ==================== DUYỆT GIAO DỊCH ==================== */
/**
 * Chạy trong một transaction duy nhất (BEGIN IMMEDIATE).
 * Bất kỳ bước nào lỗi thì toàn bộ bị hủy, không có trường hợp
 * đơn vị đi đã giảm mà đơn vị đến chưa tăng.
 *
 * Backend tự đọc lại số lượng hiện hành, không tin số liệu frontend gửi lên
 * và cũng không tin so_luong_truoc đã lưu lúc lập phiếu.
 */
function duyetGiaoDich(req, gdId) {
    const nguoiDuyet = req.session.nguoiDung;

    const chay = db.transaction(() => {
        const gd = db.prepare('SELECT * FROM giao_dich WHERE id=?').get(gdId);
        if (!gd) throw loiNV('Không tìm thấy giao dịch', 404);

        // Duyệt lại lần hai không được áp dụng dữ liệu thêm lần nữa
        if (gd.trang_thai === 'da_duyet') throw loiNV('Giao dịch đã được duyệt trước đó.', 409);
        if (gd.trang_thai !== 'cho_duyet') {
            throw loiNV('Chỉ duyệt được giao dịch đang ở trạng thái chờ duyệt', 400);
        }

        // Người lập không tự duyệt phiếu của mình, trừ khi được cấp quyền riêng
        let vuotQuyen = 0;
        if (Number(gd.nguoi_tao_id) === Number(nguoiDuyet.id)) {
            if (!coQuyen(nguoiDuyet.id, nguoiDuyet.vai_tro, 'GD_TU_DUYET')) {
                throw loiNV('Người lập phiếu không được tự duyệt giao dịch của mình', 403);
            }
            vuotQuyen = 1;
        }

        const loi = kiemTraTruocTrinh(gdId, true);
        if (loi.length) throw loiNV(loi[0], 400);

        const ct = db.prepare('SELECT * FROM chi_tiet_giao_dich WHERE giao_dich_id=? ORDER BY ngay_tao, id')
            .all(gdId);
        const ngay = gd.ngay_giao_dich;
        const ketQua = [];

        for (const d of ct) {
            if (gd.loai_giao_dich === 'tang')            ketQua.push(apDungTang(gd, d, ngay, nguoiDuyet));
            else if (gd.loai_giao_dich === 'giam')       ketQua.push(apDungGiam(gd, d, ngay, nguoiDuyet));
            else if (gd.loai_giao_dich === 'dieu_chuyen')ketQua.push(apDungDieuChuyen(gd, d, ngay, nguoiDuyet));
            else throw loiNV('Loại giao dịch chưa được hỗ trợ', 400);
        }

        db.prepare(`UPDATE giao_dich SET trang_thai='da_duyet', nguoi_duyet_id=?,
                           ngay_duyet=datetime('now','localtime'), duyet_vuot_quyen=?
                    WHERE id=?`).run(nguoiDuyet.id, vuotQuyen, gdId);
        ghiTrangThai(gdId, 'cho_duyet', 'da_duyet', 'duyet', nguoiDuyet.id,
                     vuotQuyen ? 'Admin tự duyệt phiếu do mình lập' : null);

        return { gd, ketQua, vuotQuyen };
    });

    // BEGIN IMMEDIATE: giữ khóa ghi ngay từ đầu, chặn hai người cùng duyệt một tài sản
    const kq = chay.immediate();

    ghiAudit(req, 'GIAO_DICH_DUYET', 'giao_dich', gdId,
             `${TEN_LOAI[kq.gd.loai_giao_dich]} ${kq.gd.ma_giao_dich}: duyệt ${kq.ketQua.length} dòng` +
             (kq.vuotQuyen ? ' (tự duyệt vượt quyền)' : ''),
             { trang_thai: 'cho_duyet' }, { trang_thai: 'da_duyet', chi_tiet: kq.ketQua });

    taoThongBao(kq.gd.nguoi_tao_id, 'da_duyet', 'Phiếu đã được duyệt',
        `${TEN_LOAI[kq.gd.loai_giao_dich]} ${kq.gd.ma_giao_dich} đã được duyệt. Số liệu tài sản đã cập nhật.`,
        gdId);

    return kq.ketQua;
}

/* ---------- TĂNG ---------- */
function apDungTang(gd, d, ngay, nguoi) {
    const donVi = gd.don_vi_dich_id;

    if (d.la_tai_san_moi) {
        const m = JSON.parse(d.du_lieu_moi_json || '{}');
        const maTb = (m.ma_tb || '').trim() || sinhMa(donVi, m.nhom_id);
        const info = db.prepare(`
            INSERT INTO thiet_bi (ma_tb, ten, model_id, nhom_id, so_seri, nam_sx, nuoc_sx, ma_tscd,
                loai_ts, nguyen_gia, gia_tri_con_lai, ngay_su_dung, phan_xuong_id, vi_tri_id,
                so_luong, dvt, trang_thai, tinh_trang_kt, nguoi_tao_id, trang_thai_duyet, ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'hoat_dong',?,?,'da_duyet',?)`)
          .run(maTb, m.ten, m.model_id || null, m.nhom_id, m.so_seri || null, m.nam_sx || null,
               m.nuoc_sx || null, m.ma_tscd || null, m.loai_ts || 'TSCD',
               m.nguyen_gia || 0, m.gia_tri_con_lai || m.nguyen_gia || 0,
               m.ngay_su_dung || ngay, donVi, d.vi_tri_dich_id || m.vi_tri_id || null,
               d.so_luong, m.dvt || d.dvt_snapshot || 'Cái', m.tinh_trang_kt || 'tot',
               gd.nguoi_tao_id, m.ghi_chu || null);

        const tbId = info.lastInsertRowid;
        db.prepare(`UPDATE chi_tiet_giao_dich SET thiet_bi_id=?, thiet_bi_dich_id=?,
                           so_luong_truoc=0, so_luong_sau=? WHERE id=?`)
          .run(tbId, tbId, d.so_luong, d.id);
        db.prepare(`INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, vi_tri_id, tu_ngay)
                    VALUES (?,?,?,?)`).run(tbId, donVi, d.vi_tri_dich_id || null, ngay);

        ghiLichSuTaiSan({ thiet_bi_id: tbId, giao_dich_id: gd.id, loai_su_kien: 'tao_moi',
            ngay_su_kien: ngay, don_vi_sau_id: donVi, so_luong_truoc: 0,
            so_luong_thay_doi: d.so_luong, so_luong_sau: d.so_luong,
            trang_thai_sau: 'hoat_dong', nguoi_thuc_hien_id: nguoi.id,
            ghi_chu: `Tạo mới từ phiếu ${gd.ma_giao_dich}` });

        return { dong: d.id, hanh_dong: 'tao_moi', thiet_bi_id: tbId, ma_tb: maTb,
                 truoc: 0, sau: d.so_luong };
    }

    // Tăng số lượng tài sản đã có: đọc lại số hiện hành ngay trong transaction
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(d.thiet_bi_id);
    if (!tb) throw loiNV(`Tài sản "${d.ten_snapshot}" không còn tồn tại`, 400);

    const truoc = tb.so_luong;
    const sau = truoc + d.so_luong;
    const dgSnap = d.don_gia_snapshot || 0;

    db.prepare(`UPDATE thiet_bi SET so_luong=?, nguyen_gia=COALESCE(nguyen_gia,0)+?,
                       trang_thai=CASE WHEN trang_thai='da_thanh_ly' THEN 'hoat_dong' ELSE trang_thai END,
                       ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(sau, dgSnap * d.so_luong, tb.id);
    db.prepare('UPDATE chi_tiet_giao_dich SET so_luong_truoc=?, so_luong_sau=?, thiet_bi_dich_id=? WHERE id=?')
      .run(truoc, sau, tb.id, d.id);

    ghiLichSuTaiSan({ thiet_bi_id: tb.id, giao_dich_id: gd.id, loai_su_kien: 'tang',
        ngay_su_kien: ngay, don_vi_truoc_id: tb.phan_xuong_id, don_vi_sau_id: tb.phan_xuong_id,
        so_luong_truoc: truoc, so_luong_thay_doi: d.so_luong, so_luong_sau: sau,
        nguoi_thuc_hien_id: nguoi.id, ghi_chu: gd.ly_do });

    return { dong: d.id, hanh_dong: 'tang', thiet_bi_id: tb.id, ma_tb: tb.ma_tb, truoc, sau };
}

/* ---------- GIẢM ---------- */
function apDungGiam(gd, d, ngay, nguoi) {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(d.thiet_bi_id);
    if (!tb) throw loiNV(`Tài sản "${d.ten_snapshot}" không còn tồn tại`, 400);

    const truoc = tb.so_luong;
    if (d.so_luong > truoc) {
        throw loiNV(`Số lượng tài sản "${tb.ten}" đã thay đổi kể từ khi phiếu được lập ` +
                    `(hiện còn ${truoc}, phiếu ghi giảm ${d.so_luong}). Vui lòng kiểm tra lại giao dịch.`, 409);
    }

    const sau = truoc - d.so_luong;
    const dgSnap = truoc > 0 ? (tb.nguyen_gia || 0) / truoc : 0;

    // Hết số lượng thì ngừng quản lý chứ không xóa, để giữ toàn bộ lịch sử
    const ttMoi = sau === 0 ? trangThaiTheoLyDo(gd.ma_ly_do) : tb.trang_thai;

    db.prepare(`UPDATE thiet_bi SET so_luong=?, nguyen_gia=?, trang_thai=?,
                       ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(sau, Math.max(0, (tb.nguyen_gia || 0) - dgSnap * d.so_luong), ttMoi, tb.id);
    db.prepare('UPDATE chi_tiet_giao_dich SET so_luong_truoc=?, so_luong_sau=? WHERE id=?')
      .run(truoc, sau, d.id);

    if (sau === 0) {
        db.prepare(`UPDATE lich_su_vi_tri SET den_ngay=? WHERE thiet_bi_id=? AND den_ngay IS NULL`)
          .run(ngay, tb.id);
    }

    ghiLichSuTaiSan({ thiet_bi_id: tb.id, giao_dich_id: gd.id, loai_su_kien: 'giam',
        ngay_su_kien: ngay, don_vi_truoc_id: tb.phan_xuong_id, don_vi_sau_id: tb.phan_xuong_id,
        so_luong_truoc: truoc, so_luong_thay_doi: -d.so_luong, so_luong_sau: sau,
        trang_thai_truoc: tb.trang_thai, trang_thai_sau: ttMoi,
        nguoi_thuc_hien_id: nguoi.id, ghi_chu: gd.ly_do });

    return { dong: d.id, hanh_dong: 'giam', thiet_bi_id: tb.id, ma_tb: tb.ma_tb,
             truoc, sau, trang_thai: ttMoi };
}

function trangThaiTheoLyDo(maLyDo) {
    if (maLyDo === 'thanh_ly') return 'da_thanh_ly';
    if (maLyDo === 'hong') return 'cho_thanh_ly';
    if (['thu_hoi', 'xuat_tra', 'mat', 'chuyen_loai'].includes(maLyDo)) return 'da_thanh_ly';
    return 'da_thanh_ly';
}

/* ---------- ĐIỀU CHUYỂN ---------- */
function apDungDieuChuyen(gd, d, ngay, nguoi) {
    const tb = db.prepare('SELECT * FROM thiet_bi WHERE id=?').get(d.thiet_bi_id);
    if (!tb) throw loiNV(`Tài sản "${d.ten_snapshot}" không còn tồn tại`, 400);
    if (Number(tb.phan_xuong_id) !== Number(gd.don_vi_nguon_id)) {
        throw loiNV(`Tài sản "${tb.ten}" không còn thuộc đơn vị đi. Vui lòng kiểm tra lại giao dịch.`, 409);
    }

    const truoc = tb.so_luong;
    if (d.so_luong > truoc) {
        throw loiNV(`Số lượng tài sản "${tb.ten}" đã thay đổi kể từ khi phiếu được lập ` +
                    `(hiện còn ${truoc}, phiếu ghi chuyển ${d.so_luong}). Vui lòng kiểm tra lại giao dịch.`, 409);
    }

    const viTriCu = db.prepare('SELECT ten FROM vi_tri WHERE id=?').get(tb.vi_tri_id)?.ten || null;
    const viTriMoi = db.prepare('SELECT ten FROM vi_tri WHERE id=?').get(d.vi_tri_dich_id)?.ten || null;

    /* --- Chuyển toàn bộ: giữ nguyên bản ghi, chỉ đổi đơn vị quản lý ---
       Cách này giữ được mã thiết bị, hồ sơ kiểm định và toàn bộ lịch sử. */
    if (d.so_luong === truoc) {
        db.prepare(`UPDATE thiet_bi SET phan_xuong_id=?, vi_tri_id=?, trang_thai='hoat_dong',
                           ngay_sua=datetime('now','localtime') WHERE id=?`)
          .run(gd.don_vi_dich_id, d.vi_tri_dich_id || null, tb.id);

        db.prepare('UPDATE lich_su_vi_tri SET den_ngay=? WHERE thiet_bi_id=? AND den_ngay IS NULL')
          .run(ngay, tb.id);
        db.prepare(`INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, vi_tri_id, tu_ngay, ghi_chu)
                    VALUES (?,?,?,?,?)`)
          .run(tb.id, gd.don_vi_dich_id, d.vi_tri_dich_id || null, ngay, gd.ma_giao_dich);

        db.prepare('UPDATE chi_tiet_giao_dich SET so_luong_truoc=?, so_luong_sau=?, thiet_bi_dich_id=? WHERE id=?')
          .run(truoc, 0, tb.id, d.id);

        const chung = { giao_dich_id: gd.id, ngay_su_kien: ngay,
            don_vi_truoc_id: gd.don_vi_nguon_id, don_vi_sau_id: gd.don_vi_dich_id,
            vi_tri_truoc: viTriCu, vi_tri_sau: viTriMoi, nguoi_thuc_hien_id: nguoi.id,
            ghi_chu: `${gd.ma_giao_dich}: ${gd.ly_do || ''}`.trim() };
        ghiLichSuTaiSan({ ...chung, thiet_bi_id: tb.id, loai_su_kien: 'chuyen_di',
            so_luong_truoc: truoc, so_luong_thay_doi: -truoc, so_luong_sau: 0 });
        ghiLichSuTaiSan({ ...chung, thiet_bi_id: tb.id, loai_su_kien: 'chuyen_den',
            so_luong_truoc: 0, so_luong_thay_doi: truoc, so_luong_sau: truoc });

        return { dong: d.id, hanh_dong: 'chuyen_toan_bo', thiet_bi_id: tb.id, ma_tb: tb.ma_tb,
                 nguon_truoc: truoc, nguon_sau: 0, dich_sau: truoc, giu_ma: true };
    }

    /* --- Chuyển một phần: tách bản ghi --- */
    const sauNguon = truoc - d.so_luong;
    const donGia = truoc > 0 ? (tb.nguyen_gia || 0) / truoc : 0;
    const gtclDonVi = truoc > 0 ? (tb.gia_tri_con_lai || 0) / truoc : 0;

    db.prepare(`UPDATE thiet_bi SET so_luong=?, nguyen_gia=?, gia_tri_con_lai=?,
                       ngay_sua=datetime('now','localtime') WHERE id=?`)
      .run(sauNguon, Math.max(0, (tb.nguyen_gia || 0) - donGia * d.so_luong),
           Math.max(0, (tb.gia_tri_con_lai || 0) - gtclDonVi * d.so_luong), tb.id);

    // Đơn vị đích đã có tài sản tương ứng chưa
    const khop = timTaiSanDich(tb, gd.don_vi_dich_id);
    let tbDich, dichTruoc, dichSau, hanhDong, quyTac = null;

    if (khop) {
        tbDich = khop.tb; quyTac = khop.quy_tac;
        dichTruoc = tbDich.so_luong;
        dichSau = dichTruoc + d.so_luong;
        db.prepare(`UPDATE thiet_bi SET so_luong=?, nguyen_gia=COALESCE(nguyen_gia,0)+?,
                           gia_tri_con_lai=COALESCE(gia_tri_con_lai,0)+?,
                           vi_tri_id=COALESCE(?, vi_tri_id), ngay_sua=datetime('now','localtime')
                    WHERE id=?`)
          .run(dichSau, donGia * d.so_luong, gtclDonVi * d.so_luong, d.vi_tri_dich_id || null, tbDich.id);
        hanhDong = 'chuyen_mot_phan_gop';
    } else {
        // Chưa có: tạo bản ghi mới ở đơn vị đích từ snapshot nguồn
        const maMoi = sinhMa(gd.don_vi_dich_id, tb.nhom_id);
        const info = db.prepare(`
            INSERT INTO thiet_bi (ma_tb, ten, model_id, nhom_id, so_seri, nam_sx, nuoc_sx, ma_tscd,
                loai_ts, nguyen_gia, gia_tri_con_lai, ngay_su_dung, phan_xuong_id, vi_tri_id,
                so_luong, dvt, trang_thai, tinh_trang_kt, nguoi_tao_id, trang_thai_duyet, ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'hoat_dong',?,?,'da_duyet',?)`)
          .run(maMoi, tb.ten, tb.model_id, tb.nhom_id, tb.so_seri, tb.nam_sx, tb.nuoc_sx,
               tb.ma_tscd, tb.loai_ts, donGia * d.so_luong, gtclDonVi * d.so_luong,
               tb.ngay_su_dung, gd.don_vi_dich_id, d.vi_tri_dich_id || null,
               d.so_luong, tb.dvt, tb.tinh_trang_kt, gd.nguoi_tao_id,
               `Tách từ ${tb.ma_tb} theo phiếu ${gd.ma_giao_dich}`);
        tbDich = { id: info.lastInsertRowid, ma_tb: maMoi };
        dichTruoc = 0; dichSau = d.so_luong;
        hanhDong = 'chuyen_mot_phan_tach';

        db.prepare(`INSERT INTO lich_su_vi_tri (thiet_bi_id, phan_xuong_id, vi_tri_id, tu_ngay, ghi_chu)
                    VALUES (?,?,?,?,?)`)
          .run(tbDich.id, gd.don_vi_dich_id, d.vi_tri_dich_id || null, ngay, gd.ma_giao_dich);
    }

    db.prepare('UPDATE chi_tiet_giao_dich SET so_luong_truoc=?, so_luong_sau=?, thiet_bi_dich_id=? WHERE id=?')
      .run(truoc, sauNguon, tbDich.id, d.id);

    ghiLichSuTaiSan({ thiet_bi_id: tb.id, giao_dich_id: gd.id, loai_su_kien: 'chuyen_di',
        ngay_su_kien: ngay, don_vi_truoc_id: gd.don_vi_nguon_id, don_vi_sau_id: gd.don_vi_nguon_id,
        so_luong_truoc: truoc, so_luong_thay_doi: -d.so_luong, so_luong_sau: sauNguon,
        vi_tri_truoc: viTriCu, nguoi_thuc_hien_id: nguoi.id,
        ghi_chu: `${gd.ma_giao_dich}: chuyển ${d.so_luong} sang đơn vị khác` });

    ghiLichSuTaiSan({ thiet_bi_id: tbDich.id, giao_dich_id: gd.id, loai_su_kien: 'chuyen_den',
        ngay_su_kien: ngay, don_vi_truoc_id: gd.don_vi_nguon_id, don_vi_sau_id: gd.don_vi_dich_id,
        so_luong_truoc: dichTruoc, so_luong_thay_doi: d.so_luong, so_luong_sau: dichSau,
        vi_tri_sau: viTriMoi, nguoi_thuc_hien_id: nguoi.id,
        ghi_chu: `${gd.ma_giao_dich}: nhận ${d.so_luong} từ ${tb.ma_tb}` });

    return { dong: d.id, hanh_dong: hanhDong, thiet_bi_id: tb.id, ma_tb: tb.ma_tb,
             nguon_truoc: truoc, nguon_sau: sauNguon,
             thiet_bi_dich_id: tbDich.id, ma_tb_dich: tbDich.ma_tb,
             dich_truoc: dichTruoc, dich_sau: dichSau, quy_tac_khop: quyTac };
}

/* ---------- Lỗi nghiệp vụ có mã HTTP ---------- */
function loiNV(thongDiep, ma = 400) {
    const e = new Error(thongDiep);
    e.maHttp = ma;
    e.nghiepVu = true;
    return e;
}

module.exports = {
    uuid, TEN_LOAI, sinhMaGiaoDich, ghiTrangThai, ghiAudit, ghiLichSuTaiSan,
    taoThongBao, baoNguoiDuyet, chupSnapshot, kiemTraTruocTrinh,
    timTaiSanDich, duyetGiaoDich, loiNV
};
