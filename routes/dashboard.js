/**
 * API Dashboard & Báo cáo (v22)
 *
 * - Thống kê công ty
 * - Thống kê phân xưởng
 * - 15 loại báo cáo
 * - KPI kỹ thuật
 */

const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyen } = require('../middleware/quyen');

const router = express.Router();
router.use(dangNhap);

/**
 * GET /api/dashboard/thong-ke-cong-ty — Thống kê công ty
 */
router.get('/thong-ke-cong-ty', (req, res) => {
    if (!coMaQuyen(req, 'thietbi.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        // Tổng phân xưởng
        const so_phan_xuong = db.prepare('SELECT COUNT(*) n FROM phan_xuong WHERE hoat_dong = 1').get().n;

        // Tổng thiết bị
        const so_thiet_bi = db.prepare('SELECT COUNT(*) n FROM thiet_bi').get().n;

        // Thiết bị theo trạng thái
        const theo_trang_thai = db.prepare(`
            SELECT trang_thai, COUNT(*) as so_luong
            FROM thiet_bi
            GROUP BY trang_thai
        `).all();
        const trang_thai_map = {};
        theo_trang_thai.forEach(x => trang_thai_map[x.trang_thai] = x.so_luong);

        // Thiết bị theo tình trạng
        const theo_tinh_trang = db.prepare(`
            SELECT tinh_trang_kt, COUNT(*) as so_luong
            FROM thiet_bi
            GROUP BY tinh_trang_kt
        `).all();
        const tinh_trang_map = {};
        theo_tinh_trang.forEach(x => tinh_trang_map[x.tinh_trang_kt] = x.so_luong);

        // Kiểm định sắp hết hạn (30 ngày)
        const kiem_dinh_het_han = db.prepare(`
            SELECT COUNT(DISTINCT tb.id) as so_luong
            FROM thiet_bi tb
            JOIN kiem_dinh kd ON tb.id = kd.thiet_bi_id
            WHERE kd.ngay_het_han BETWEEN datetime('now') AND datetime('now', '+30 days')
        `).get().so_luong;

        // Bảo dưỡng đến hạn (hôm nay)
        const bao_duong_het_han = db.prepare(`
            SELECT COUNT(*) n
            FROM phieu_bao_duong
            WHERE ngay_ke_hoach = CURRENT_DATE AND trang_thai IN ('da_len_lich', 'dang_thuc_hien')
        `).get().n;

        // Sự cố đang mở
        const su_co_mo = db.prepare(`
            SELECT COUNT(*) n FROM su_co WHERE trang_thai IN ('dang_mo', 'cho_duyet')
        `).get().n;

        // Giao dịch chờ duyệt
        const giao_dich_cho_duyet = db.prepare(`
            SELECT COUNT(*) n FROM giao_dich WHERE trang_thai = 'cho_duyet'
        `).get().n;

        // NCVT chưa cấp đủ (tạm thời = 0)
        const ncvt_thieu = 0;

        // Tồn kho dưới mức tối thiểu
        const kho_thap = db.prepare(`
            SELECT COUNT(DISTINCT t.id) as so_luong
            FROM ton_kho t
            JOIN kho_vat_tu k ON t.vat_tu_id = k.id
            WHERE t.ton_hien_tai < k.muc_toi_thieu
        `).get().so_luong;

        // Giá trị tài sản (tính từ thiet_bi.gia_tri_con_lai)
        const gia_tri_tai_san = db.prepare(`
            SELECT COALESCE(SUM(gia_tri_con_lai), 0) as tong
            FROM thiet_bi
        `).get().tong;

        // Chi phí sửa chữa (3 tháng gần nhất)
        const chi_phi_sua = db.prepare(`
            SELECT COALESCE(SUM(tong_chi_phi), 0) as tong
            FROM phieu_bao_duong
            WHERE ngay_tao >= datetime('now', '-3 months')
        `).get().tong;

        res.json({
            data: {
                so_phan_xuong,
                so_thiet_bi,
                thiet_bi_hoat_dong: trang_thai_map['hoat_dong'] || 0,
                thiet_bi_sua: tinh_trang_map['dang_sua'] || 0,
                thiet_bi_kem_hong: (tinh_trang_map['kem'] || 0) + (tinh_trang_map['hong'] || 0),
                kiem_dinh_het_han,
                bao_duong_het_han,
                su_co_mo,
                giao_dich_cho_duyet,
                ncvt_thieu,
                kho_thap,
                gia_tri_tai_san,
                chi_phi_sua
            }
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/thong-ke-phan-xuong/:px_id — Thống kê phân xưởng
 */
router.get('/thong-ke-phan-xuong/:px_id', (req, res) => {
    if (!coMaQuyen(req, 'thietbi.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const px_id = req.params.px_id;

        // Thiết bị theo trang thái
        const theo_trang_thai = db.prepare(`
            SELECT trang_thai, COUNT(*) as so_luong
            FROM thiet_bi WHERE phan_xuong_id = ?
            GROUP BY trang_thai
        `).all(px_id);
        const trang_thai_map = {};
        theo_trang_thai.forEach(x => trang_thai_map[x.trang_thai] = x.so_luong);

        // Thiết bị theo tình trạng
        const theo_tinh_trang = db.prepare(`
            SELECT tinh_trang_kt, COUNT(*) as so_luong
            FROM thiet_bi WHERE phan_xuong_id = ?
            GROUP BY tinh_trang_kt
        `).all(px_id);
        const tinh_trang_map = {};
        theo_tinh_trang.forEach(x => tinh_trang_map[x.tinh_trang_kt] = x.so_luong);

        const so_thiet_bi = Object.values(trang_thai_map).reduce((a, b) => a + b, 0);

        // Kiểm định sắp hết
        const kiem_dinh = db.prepare(`
            SELECT COUNT(DISTINCT tb.id) as so_luong
            FROM thiet_bi tb
            JOIN kiem_dinh kd ON tb.id = kd.thiet_bi_id
            WHERE tb.phan_xuong_id = ? AND kd.ngay_het_han BETWEEN datetime('now') AND datetime('now', '+30 days')
        `).get(px_id).so_luong;

        // Bảo dưỡng đến hạn
        const bao_duong = db.prepare(`
            SELECT COUNT(DISTINCT phieu_bao_duong.thiet_bi_id) as so_luong
            FROM phieu_bao_duong
            JOIN thiet_bi ON phieu_bao_duong.thiet_bi_id = thiet_bi.id
            WHERE thiet_bi.phan_xuong_id = ? AND phieu_bao_duong.ngay_ke_hoach = CURRENT_DATE
        `).get(px_id).so_luong;

        // Sự cố
        const su_co = db.prepare(`
            SELECT COUNT(DISTINCT su_co.thiet_bi_id) as so_luong
            FROM su_co
            JOIN thiet_bi ON su_co.thiet_bi_id = thiet_bi.id
            WHERE thiet_bi.phan_xuong_id = ? AND su_co.trang_thai IN ('dang_mo', 'cho_duyet')
        `).get(px_id).so_luong;

        // Giao dịch chờ duyệt
        const giao_dich = db.prepare(`
            SELECT COUNT(*) n FROM giao_dich
            WHERE phan_xuong_id = ? AND trang_thai = 'cho_duyet'
        `).get(px_id).n;

        // Giá trị tài sản
        const gia_tri = db.prepare(`
            SELECT COALESCE(SUM(gia_tri_con_lai), 0) as tong
            FROM thiet_bi WHERE phan_xuong_id = ?
        `).get(px_id).tong;

        res.json({
            data: {
                so_thiet_bi,
                thiet_bi_hoat_dong: trang_thai_map['hoat_dong'] || 0,
                thiet_bi_sua: tinh_trang_map['dang_sua'] || 0,
                thiet_bi_kem_hong: (tinh_trang_map['kem'] || 0) + (tinh_trang_map['hong'] || 0),
                kiem_dinh_het_han: kiem_dinh,
                bao_duong_het_han: bao_duong,
                su_co_mo: su_co,
                giao_dich_cho_duyet: giao_dich,
                gia_tri_tai_san: gia_tri
            }
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/baocao/danh-sach-thiet-bi — Báo cáo danh sách thiết bị
 */
router.get('/baocao/danh-sach-thiet-bi', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                tb.ma_tb, tb.ten, m.ten as model,
                COUNT(*) as so_luong,
                SUM(CASE WHEN tb.trang_thai = 'hoat_dong' THEN 1 ELSE 0 END) as hoat_dong,
                SUM(CASE WHEN tb.tinh_trang_kt = 'kem' THEN 1 ELSE 0 END) as dang_sua,
                SUM(CASE WHEN tb.tinh_trang_kt IN ('kem', 'hong') THEN 1 ELSE 0 END) as hong,
                SUM(tb.nguyen_gia) as nguyen_gia
            FROM thiet_bi tb
            LEFT JOIN model_thiet_bi m ON tb.model_id = m.id
            GROUP BY tb.ma_tb, tb.ten, m.ten
            ORDER BY tb.ma_tb
        `).all();

        res.json({ data: ds, type: 'danh_sach_thiet_bi' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/baocao/kho-vat-tu — Báo cáo tồn kho
 */
router.get('/baocao/kho-vat-tu', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                k.ma, k.ten, k.chi_tieu, k.dvt,
                t.ton_hien_tai,
                k.muc_toi_thieu, k.muc_toi_da,
                k.vi_tri_kho,
                CASE
                    WHEN t.ton_hien_tai < k.muc_toi_thieu THEN 'canh_bao_thap'
                    WHEN t.ton_hien_tai > k.muc_toi_da THEN 'canh_bao_cao'
                    ELSE 'binh_thuong'
                END as tinh_trang
            FROM kho_vat_tu k
            LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
            WHERE k.hoat_dong = 1
            ORDER BY k.ma
        `).all();

        res.json({ data: ds, type: 'kho_vat_tu' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/baocao/kiem-ke — Báo cáo kiểm định
 */
router.get('/baocao/kiem-ke', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                kd.id,
                tb.ma_tb as thiet_bi_ma, tb.ten as thiet_bi_ten,
                kd.ngay_kiem_dinh,
                kd.ngay_het_han,
                kd.ket_qua,
                nd.ho_ten as nguoi_lap
            FROM kiem_dinh kd
            LEFT JOIN thiet_bi tb ON kd.thiet_bi_id = tb.id
            LEFT JOIN nguoi_dung nd ON kd.nguoi_nhap_id = nd.id
            ORDER BY kd.ngay_kiem_dinh DESC
            LIMIT 100
        `).all();

        res.json({ data: ds, type: 'kiem_ke' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/baocao/giao-dich — Báo cáo giao dịch tăng/giảm
 */
router.get('/baocao/giao-dich', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                gd.ma_giao_dich, gd.loai_giao_dich,
                ctgd.ma_tb_snapshot as thiet_bi_ma, ctgd.ten_snapshot as thiet_bi_ten,
                ctgd.so_luong,
                nd.ho_ten as nguoi_lap,
                gd.ngay_giao_dich,
                gd.trang_thai
            FROM giao_dich gd
            LEFT JOIN chi_tiet_giao_dich ctgd ON gd.id = ctgd.giao_dich_id
            LEFT JOIN nguoi_dung nd ON gd.nguoi_tao_id = nd.id
            ORDER BY gd.ngay_giao_dich DESC
            LIMIT 500
        `).all();

        res.json({ data: ds, type: 'giao_dich' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/baocao/su-co — Báo cáo sự cố
 */
router.get('/baocao/su-co', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const ds = db.prepare(`
            SELECT
                sc.ma_su_co,
                tb.ma_tb as thiet_bi_ma, tb.ten as thiet_bi_ten,
                sc.hien_tuong,
                sc.ngay_su_co,
                sc.trang_thai,
                nd.ho_ten as nguoi_lap
            FROM su_co sc
            LEFT JOIN thiet_bi tb ON sc.thiet_bi_id = tb.id
            LEFT JOIN nguoi_dung nd ON sc.nguoi_bao_id = nd.id
            ORDER BY sc.ngay_su_co DESC
            LIMIT 500
        `).all();

        res.json({ data: ds, type: 'su_co' });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * GET /api/dashboard/kpi — KPI kỹ thuật
 */
router.get('/kpi', (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        // Tỷ lệ thiết bị tốt
        const so_thiet_bi = db.prepare('SELECT COUNT(*) n FROM thiet_bi').get().n;
        const so_hoat_dong = db.prepare("SELECT COUNT(*) n FROM thiet_bi WHERE trang_thai = 'hoat_dong'").get().n;
        const ty_le_tot = so_thiet_bi > 0 ? (so_hoat_dong / so_thiet_bi * 100).toFixed(2) : 'N/A';

        // Tỷ lệ thiết bị kém/hỏng
        const so_kem_hong = db.prepare("SELECT COUNT(*) n FROM thiet_bi WHERE tinh_trang_kt IN ('kem', 'hong')").get().n;
        const ty_le_kem_hong = so_thiet_bi > 0 ? (so_kem_hong / so_thiet_bi * 100).toFixed(2) : 'N/A';

        // Tỷ lệ kiểm định đúng hạn
        const kiem_dinh_tong = db.prepare('SELECT COUNT(DISTINCT thiet_bi_id) n FROM kiem_dinh').get().n;
        const kiem_dinh_dung_han = db.prepare(`
            SELECT COUNT(DISTINCT thiet_bi_id) n FROM kiem_dinh
            WHERE ngay_het_han >= CURRENT_DATE
        `).get().n;
        const ty_le_kiem_dinh = kiem_dinh_tong > 0 ? (kiem_dinh_dung_han / kiem_dinh_tong * 100).toFixed(2) : 'N/A';

        res.json({
            data: {
                ty_le_thiet_bi_tot: ty_le_tot,
                ty_le_thiet_bi_kem_hong: ty_le_kem_hong,
                ty_le_kiem_dinh_dung_han: ty_le_kiem_dinh,
                chu_y: 'MTBF và MTTR cần dữ liệu lịch sử đầy đủ'
            }
        });
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/dashboard/export/excel — Export báo cáo ra Excel
 */
router.post('/export/excel', async (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const { loai_bao_cao } = req.body;
        if (!loai_bao_cao) return res.status(400).json({ loi: 'Thiếu loai_bao_cao' });

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Báo cáo');

        // Style chung
        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2c3e50' } }, alignment: { horizontal: 'center', vertical: 'center' } };

        let data = [];
        let tenBaoCao = '';

        // Lấy dữ liệu theo loại báo cáo
        switch (loai_bao_cao) {
            case 'danh-sach-thiet-bi':
                tenBaoCao = 'Danh sách Thiết bị';
                data = db.prepare(`
                    SELECT tb.ma_tb, tb.ten, m.ten as model,
                        COUNT(*) as so_luong,
                        SUM(CASE WHEN tb.trang_thai = 'hoat_dong' THEN 1 ELSE 0 END) as hoat_dong,
                        SUM(CASE WHEN tb.tinh_trang_kt = 'kem' THEN 1 ELSE 0 END) as dang_sua,
                        SUM(CASE WHEN tb.tinh_trang_kt IN ('kem', 'hong') THEN 1 ELSE 0 END) as hong,
                        SUM(tb.nguyen_gia) as nguyen_gia
                    FROM thiet_bi tb
                    LEFT JOIN model_thiet_bi m ON tb.model_id = m.id
                    GROUP BY tb.ma_tb, tb.ten, m.ten
                    ORDER BY tb.ma_tb
                `).all();
                ws.columns = [
                    { header: 'Mã TB', key: 'ma_tb', width: 15 },
                    { header: 'Tên', key: 'ten', width: 30 },
                    { header: 'Model', key: 'model', width: 20 },
                    { header: 'Số lượng', key: 'so_luong', width: 12 },
                    { header: 'Hoạt động', key: 'hoat_dong', width: 12 },
                    { header: 'Đang sửa', key: 'dang_sua', width: 12 },
                    { header: 'Hỏng', key: 'hong', width: 12 },
                    { header: 'Giá trị', key: 'nguyen_gia', width: 15 }
                ];
                break;

            case 'kho-vat-tu':
                tenBaoCao = 'Tồn kho Vật tư';
                data = db.prepare(`
                    SELECT k.ma, k.ten, k.chi_tieu, k.dvt,
                        t.ton_hien_tai,
                        k.muc_toi_thieu, k.muc_toi_da,
                        CASE
                            WHEN t.ton_hien_tai < k.muc_toi_thieu THEN 'Thấp'
                            WHEN t.ton_hien_tai > k.muc_toi_da THEN 'Cao'
                            ELSE 'Bình thường'
                        END as tinh_trang
                    FROM kho_vat_tu k
                    LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
                    WHERE k.hoat_dong = 1
                    ORDER BY k.ma
                `).all();
                ws.columns = [
                    { header: 'Mã VT', key: 'ma', width: 12 },
                    { header: 'Tên', key: 'ten', width: 25 },
                    { header: 'Chỉ tiêu', key: 'chi_tieu', width: 15 },
                    { header: 'Đơn vị', key: 'dvt', width: 10 },
                    { header: 'Tồn hiện tại', key: 'ton_hien_tai', width: 12 },
                    { header: 'Tối thiểu', key: 'muc_toi_thieu', width: 12 },
                    { header: 'Tối đa', key: 'muc_toi_da', width: 12 },
                    { header: 'Tình trạng', key: 'tinh_trang', width: 12 }
                ];
                break;

            case 'kiem-ke':
                tenBaoCao = 'Báo cáo Kiểm định';
                data = db.prepare(`
                    SELECT kd.id, tb.ma_tb, tb.ten,
                        kd.ngay_kiem_dinh,
                        kd.ngay_het_han,
                        kd.ket_qua,
                        nd.ho_ten as nguoi_lap
                    FROM kiem_dinh kd
                    LEFT JOIN thiet_bi tb ON kd.thiet_bi_id = tb.id
                    LEFT JOIN nguoi_dung nd ON kd.nguoi_nhap_id = nd.id
                    ORDER BY kd.ngay_kiem_dinh DESC
                    LIMIT 500
                `).all();
                ws.columns = [
                    { header: 'Mã TB', key: 'ma_tb', width: 15 },
                    { header: 'Tên TB', key: 'ten', width: 30 },
                    { header: 'Ngày kiểm định', key: 'ngay_kiem_dinh', width: 15 },
                    { header: 'Hết hạn', key: 'ngay_het_han', width: 15 },
                    { header: 'Kết quả', key: 'ket_qua', width: 12 },
                    { header: 'Người lập', key: 'nguoi_lap', width: 20 }
                ];
                break;

            case 'giao-dich':
                tenBaoCao = 'Báo cáo Giao dịch';
                data = db.prepare(`
                    SELECT gd.ma_giao_dich, gd.loai_giao_dich,
                        ctgd.ma_tb_snapshot as thiet_bi_ma, ctgd.ten_snapshot as thiet_bi_ten,
                        ctgd.so_luong,
                        nd.ho_ten as nguoi_lap,
                        gd.ngay_giao_dich,
                        gd.trang_thai
                    FROM giao_dich gd
                    LEFT JOIN chi_tiet_giao_dich ctgd ON gd.id = ctgd.giao_dich_id
                    LEFT JOIN nguoi_dung nd ON gd.nguoi_tao_id = nd.id
                    ORDER BY gd.ngay_giao_dich DESC
                    LIMIT 500
                `).all();
                ws.columns = [
                    { header: 'Mã GD', key: 'ma_giao_dich', width: 15 },
                    { header: 'Loại', key: 'loai_giao_dich', width: 15 },
                    { header: 'Mã TB', key: 'thiet_bi_ma', width: 15 },
                    { header: 'Tên TB', key: 'thiet_bi_ten', width: 30 },
                    { header: 'Số lượng', key: 'so_luong', width: 12 },
                    { header: 'Người lập', key: 'nguoi_lap', width: 20 },
                    { header: 'Ngày GD', key: 'ngay_giao_dich', width: 15 },
                    { header: 'Trạng thái', key: 'trang_thai', width: 12 }
                ];
                break;

            case 'su-co':
                tenBaoCao = 'Báo cáo Sự cố';
                data = db.prepare(`
                    SELECT sc.ma_su_co, tb.ma_tb, tb.ten,
                        sc.hien_tuong,
                        sc.ngay_su_co,
                        sc.trang_thai,
                        nd.ho_ten as nguoi_lap
                    FROM su_co sc
                    LEFT JOIN thiet_bi tb ON sc.thiet_bi_id = tb.id
                    LEFT JOIN nguoi_dung nd ON sc.nguoi_bao_id = nd.id
                    ORDER BY sc.ngay_su_co DESC
                    LIMIT 500
                `).all();
                ws.columns = [
                    { header: 'Mã SC', key: 'ma_su_co', width: 15 },
                    { header: 'Mã TB', key: 'ma_tb', width: 15 },
                    { header: 'Tên TB', key: 'ten', width: 30 },
                    { header: 'Hiện tượng', key: 'hien_tuong', width: 30 },
                    { header: 'Ngày SC', key: 'ngay_su_co', width: 15 },
                    { header: 'Trạng thái', key: 'trang_thai', width: 12 },
                    { header: 'Người báo', key: 'nguoi_lap', width: 20 }
                ];
                break;

            default:
                return res.status(400).json({ loi: 'Loại báo cáo không hợp lệ' });
        }

        // Format header
        ws.getRow(1).eachCell(cell => {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill;
            cell.alignment = headerStyle.alignment;
        });

        // Thêm dữ liệu
        data.forEach(row => ws.addRow(row));

        // Đơn vị và ngày xuất
        const lastRow = ws.lastRow.number + 2;
        ws.getCell(`A${lastRow}`).value = `Công ty Xây lắp Mỏ - TKV | ${tenBaoCao}`;
        ws.getCell(`A${lastRow + 1}`).value = `Xuất: ${new Date().toLocaleString('vi-VN')}`;

        // Gửi file
        const filename = `${tenBaoCao.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        await wb.xlsx.write(res);
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

/**
 * POST /api/dashboard/export/pdf — Export báo cáo ra PDF
 */
router.post('/export/pdf', async (req, res) => {
    if (!coMaQuyen(req, 'baocao.xem')) return res.status(403).json({ loi: 'Không có quyền' });

    try {
        const { loai_bao_cao } = req.body;
        if (!loai_bao_cao) return res.status(400).json({ loi: 'Thiếu loai_bao_cao' });

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', margin: 40 });

        // Tiêu đề tài liệu
        doc.font('Helvetica-Bold').fontSize(18).text('Báo cáo Quản lý Thiết bị Cơ điện', { align: 'center' });
        doc.moveDown(0.5);

        let data = [];
        let tenBaoCao = '';
        let columns = [];

        // Lấy dữ liệu theo loại báo cáo
        switch (loai_bao_cao) {
            case 'danh-sach-thiet-bi':
                tenBaoCao = 'Danh sách Thiết bị';
                data = db.prepare(`
                    SELECT tb.ma_tb, tb.ten, m.ten as model,
                        COUNT(*) as so_luong,
                        SUM(CASE WHEN tb.trang_thai = 'hoat_dong' THEN 1 ELSE 0 END) as hoat_dong,
                        SUM(CASE WHEN tb.tinh_trang_kt = 'kem' THEN 1 ELSE 0 END) as dang_sua,
                        SUM(CASE WHEN tb.tinh_trang_kt IN ('kem', 'hong') THEN 1 ELSE 0 END) as hong,
                        SUM(tb.nguyen_gia) as nguyen_gia
                    FROM thiet_bi tb
                    LEFT JOIN model_thiet_bi m ON tb.model_id = m.id
                    GROUP BY tb.ma_tb, tb.ten, m.ten
                    ORDER BY tb.ma_tb
                `).all();
                columns = ['ma_tb', 'ten', 'model', 'so_luong', 'hoat_dong', 'dang_sua', 'hong', 'nguyen_gia'];
                break;

            case 'kho-vat-tu':
                tenBaoCao = 'Tồn kho Vật tư';
                data = db.prepare(`
                    SELECT k.ma, k.ten, k.chi_tieu, k.dvt,
                        t.ton_hien_tai,
                        k.muc_toi_thieu, k.muc_toi_da,
                        CASE
                            WHEN t.ton_hien_tai < k.muc_toi_thieu THEN 'Thấp'
                            WHEN t.ton_hien_tai > k.muc_toi_da THEN 'Cao'
                            ELSE 'Bình thường'
                        END as tinh_trang
                    FROM kho_vat_tu k
                    LEFT JOIN ton_kho t ON k.id = t.vat_tu_id
                    WHERE k.hoat_dong = 1
                    ORDER BY k.ma
                `).all();
                columns = ['ma', 'ten', 'chi_tieu', 'dvt', 'ton_hien_tai', 'muc_toi_thieu', 'muc_toi_da', 'tinh_trang'];
                break;

            case 'kiem-ke':
                tenBaoCao = 'Báo cáo Kiểm định';
                data = db.prepare(`
                    SELECT kd.id, tb.ma_tb, tb.ten,
                        kd.ngay_kiem_dinh,
                        kd.ngay_het_han,
                        kd.ket_qua,
                        nd.ho_ten as nguoi_lap
                    FROM kiem_dinh kd
                    LEFT JOIN thiet_bi tb ON kd.thiet_bi_id = tb.id
                    LEFT JOIN nguoi_dung nd ON kd.nguoi_nhap_id = nd.id
                    ORDER BY kd.ngay_kiem_dinh DESC
                    LIMIT 500
                `).all();
                columns = ['ma_tb', 'ten', 'ngay_kiem_dinh', 'ngay_het_han', 'ket_qua', 'nguoi_lap'];
                break;

            case 'giao-dich':
                tenBaoCao = 'Báo cáo Giao dịch';
                data = db.prepare(`
                    SELECT gd.ma_giao_dich, gd.loai_giao_dich,
                        ctgd.ma_tb_snapshot as thiet_bi_ma, ctgd.ten_snapshot as thiet_bi_ten,
                        ctgd.so_luong,
                        nd.ho_ten as nguoi_lap,
                        gd.ngay_giao_dich,
                        gd.trang_thai
                    FROM giao_dich gd
                    LEFT JOIN chi_tiet_giao_dich ctgd ON gd.id = ctgd.giao_dich_id
                    LEFT JOIN nguoi_dung nd ON gd.nguoi_tao_id = nd.id
                    ORDER BY gd.ngay_giao_dich DESC
                    LIMIT 500
                `).all();
                columns = ['ma_giao_dich', 'loai_giao_dich', 'thiet_bi_ma', 'thiet_bi_ten', 'so_luong', 'nguoi_lap', 'ngay_giao_dich', 'trang_thai'];
                break;

            case 'su-co':
                tenBaoCao = 'Báo cáo Sự cố';
                data = db.prepare(`
                    SELECT sc.ma_su_co, tb.ma_tb, tb.ten,
                        sc.hien_tuong,
                        sc.ngay_su_co,
                        sc.trang_thai,
                        nd.ho_ten as nguoi_lap
                    FROM su_co sc
                    LEFT JOIN thiet_bi tb ON sc.thiet_bi_id = tb.id
                    LEFT JOIN nguoi_dung nd ON sc.nguoi_bao_id = nd.id
                    ORDER BY sc.ngay_su_co DESC
                    LIMIT 500
                `).all();
                columns = ['ma_su_co', 'ma_tb', 'ten', 'hien_tuong', 'ngay_su_co', 'trang_thai', 'nguoi_lap'];
                break;

            default:
                return res.status(400).json({ loi: 'Loại báo cáo không hợp lệ' });
        }

        // Viết tên báo cáo
        doc.font('Helvetica-Bold').fontSize(14).text(tenBaoCao, { align: 'center' });
        doc.moveDown(1);

        // Viết bảng dữ liệu
        if (data.length > 0) {
            // Header
            doc.font('Helvetica-Bold').fontSize(9);
            let x = doc.x;
            const colWidth = (doc.page.width - 80) / columns.length;

            columns.forEach(col => {
                const header = col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, ' ');
                doc.text(header, x, doc.y, { width: colWidth, align: 'center' });
                x += colWidth;
            });
            doc.moveDown(0.8);

            // Dữ liệu
            doc.font('Helvetica').fontSize(8);
            data.slice(0, 100).forEach(row => {
                x = doc.x;
                columns.forEach(col => {
                    const value = row[col] !== null && row[col] !== undefined ? row[col] : '';
                    const text = String(value).substring(0, 20);
                    doc.text(text, x, doc.y, { width: colWidth, align: 'left' });
                    x += colWidth;
                });
                doc.moveDown(0.5);
            });

            if (data.length > 100) {
                doc.fontSize(8).text(`... và ${data.length - 100} bản ghi khác`, { align: 'center' });
            }
        } else {
            doc.text('Không có dữ liệu', { align: 'center' });
        }

        // Footer
        doc.moveDown(2);
        doc.font('Helvetica').fontSize(9);
        doc.text(`Công ty Xây lắp Mỏ - TKV | ${tenBaoCao}`, { align: 'center' });
        doc.text(`Xuất: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });

        // Gửi file
        const filename = `${tenBaoCao.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        doc.pipe(res);
        doc.end();
    } catch (e) {
        res.status(500).json({ loi: e.message });
    }
});

module.exports = router;
