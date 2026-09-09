/**
 * Đọc file Excel danh sách TSCĐ/CCDC do phân xưởng tải lên.
 *
 * Mỗi phân xưởng có mẫu file khác nhau nên không cố định cấu trúc.
 * Quy trình: dò dòng tiêu đề -> gợi ý ánh xạ cột -> người dùng chỉnh lại -> nhập.
 */
const XLSX = require('xlsx');

/* ---------- Chuẩn hoá chuỗi tiếng Việt để so khớp ---------- */
function khongDau(s) {
    return String(s ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/* ---------- Từ điển nhận diện tên cột ---------- */
const TU_DIEN_COT = {
    ma_tscd:        ['ma tai san', 'ma ts', 'ma tscd', 'ma so tai san', 'ma cccd', 'ma ccdc', 'so the'],
    ma_tb:          ['ma thiet bi', 'ma tb', 'ma may', 'so hieu', 'so hieu thiet bi'],
    ten:            ['ten tai san', 'ten thiet bi', 'ten', 'ten ts', 'ten may', 'noi dung', 'dien giai',
                     'ten tai san co dinh', 'ten ccdc', 'ten cong cu', 'ten vat tu thiet bi'],
    so_seri:        ['so seri', 'seri', 'serial', 'so may', 'so khung', 'so che tao'],
    nam_sx:         ['nam san xuat', 'nam sx', 'nam che tao'],
    nuoc_sx:        ['nuoc san xuat', 'nuoc sx', 'xuat xu', 'hang san xuat', 'hang sx'],
    dvt:            ['dvt', 'don vi tinh', 'dv tinh'],
    so_luong:       ['so luong', 'sl', 'so luong ts'],
    nguyen_gia:     ['nguyen gia', 'gia tri', 'nguyen gia tscd', 'gia tri ban dau', 'thanh tien', 'gia tri tai san'],
    gia_tri_con_lai:['gia tri con lai', 'con lai', 'gtcl', 'gia tri hien tai', 'gia tri chua khau hao'],
    ngay_su_dung:   ['ngay su dung', 'ngay dua vao su dung', 'ngay bat dau su dung', 'nam su dung',
                     'ngay tang', 'thoi gian su dung', 'ngay mua'],
    vi_tri_text:    ['vi tri', 'noi su dung', 'dia diem', 'vi tri lap dat', 'khu vuc', 'bo phan su dung'],
    loai_ts:        ['loai tai san', 'loai ts', 'phan loai', 'nhom tai san'],
    ghi_chu:        ['ghi chu', 'tinh trang', 'note', 'ghi chu khac']
    ,so_kiem_ke:    ['so kiem ke']
    ,so_quan_ly:    ['so quan ly']
    ,so_luong_quan_ly: ['so luong quan ly', 'quan ly']
    ,so_luong_kiem_ke: ['so luong kiem ke', 'kiem ke']
    ,so_luong_doi_chieu: ['so luong doi chieu', 'doi chieu']
    ,danh_gia_ky_thuat: ['danh gia ky thuat', 'd gia ky thuat', 'ky thuat']
    ,ghi_chu_kiem_ke: ['ghi chu kiem ke']
    ,quan_ly_theo_quyet_dinh: ['ql theo lenh qd', 'quan ly theo lenh', 'quan ly theo quyet dinh']
};

function mauVang(cell) {
    const rgb = String(cell?.s?.fgColor?.rgb || '').toUpperCase().replace(/^FF(?=[0-9A-F]{6}$)/, '');
    return ['FFFF00', 'FFCC00', 'FFF200', 'FFD966'].includes(rgb) ? rgb : null;
}

/**
 * Cho điểm mức độ khớp giữa tên cột trong file và một trường dữ liệu.
 */
function diemKhop(tenCot, truong) {
    const t = khongDau(tenCot);
    if (!t) return 0;
    let max = 0;
    for (const tk of TU_DIEN_COT[truong] || []) {
        if (t === tk) max = Math.max(max, 100);
        else if (t.startsWith(tk) || tk.startsWith(t)) max = Math.max(max, 80);
        else if (t.includes(tk)) max = Math.max(max, 65);
    }
    return max;
}

/* ---------- Đọc danh sách sheet ---------- */
function docSheets(duongDan) {
    const wb = XLSX.readFile(duongDan, { cellDates: true, cellStyles: true });
    return wb.SheetNames.map(ten => {
        const ws = wb.Sheets[ten];
        const rg = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
        return {
            ten,
            so_dong: rg ? rg.e.r - rg.s.r + 1 : 0,
            so_cot: rg ? rg.e.c - rg.s.c + 1 : 0
        };
    });
}

/**
 * Dò dòng tiêu đề: dòng có nhiều ô chữ nhất và khớp nhiều từ khoá nhất
 * trong 20 dòng đầu tiên.
 */
function doDongTieuDe(matran) {
    let tot = { dong: 0, diem: -1 };
    const gioiHan = Math.min(20, matran.length);

    for (let i = 0; i < gioiHan; i++) {
        const hang = matran[i] || [];
        const oChu = hang.filter(c => typeof c === 'string' && c.trim().length > 1).length;
        if (oChu < 2) continue;

        let diemTuKhoa = 0;
        for (const o of hang) {
            for (const truong of Object.keys(TU_DIEN_COT)) {
                if (diemKhop(o, truong) >= 65) { diemTuKhoa += 10; break; }
            }
        }
        const diem = oChu * 2 + diemTuKhoa;
        if (diem > tot.diem) tot = { dong: i, diem };
    }
    return tot.dong;
}

/**
 * Gộp tiêu đề nhiều dòng (một số mẫu có tiêu đề gộp 2 dòng).
 */
function layTieuDe(matran, dongTieuDe) {
    const h = matran[dongTieuDe] || [];
    const hSau = matran[dongTieuDe + 1] || [];
    const soCot = Math.max(h.length, hSau.length);
    const cot = [];
    for (let c = 0; c < soCot; c++) {
        let ten = String(h[c] ?? '').trim();
        if (!ten) ten = String(hSau[c] ?? '').trim();
        cot.push({ chi_so: c, ten: ten || `Cột ${c + 1}` });
    }
    return cot;
}

/**
 * Gợi ý ánh xạ: mỗi trường lấy cột có điểm khớp cao nhất, không trùng cột.
 */
function goiYAnhXa(cot) {
    const ungVien = [];
    for (const truong of Object.keys(TU_DIEN_COT)) {
        for (const c of cot) {
            const d = diemKhop(c.ten, truong);
            if (d >= 65) ungVien.push({ truong, chi_so: c.chi_so, ten_cot: c.ten, diem: d });
        }
    }
    ungVien.sort((a, b) => b.diem - a.diem);

    const anhXa = {};
    const daDung = new Set();
    for (const u of ungVien) {
        if (anhXa[u.truong] !== undefined) continue;
        if (daDung.has(u.chi_so)) continue;
        anhXa[u.truong] = u.chi_so;
        daDung.add(u.chi_so);
    }
    return anhXa;
}

/**
 * Phân tích file: trả về thông tin để người dùng xác nhận ánh xạ.
 */
function phanTich(duongDan, tenSheet, dongTieuDe) {
    const wb = XLSX.readFile(duongDan, { cellDates: true, cellStyles: true });
    const sheet = tenSheet || wb.SheetNames[0];
    const ws = wb.Sheets[sheet];
    if (!ws) throw new Error(`Không tìm thấy sheet "${sheet}"`);

    const matran = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null, raw: true });
    const dong = dongTieuDe !== undefined && dongTieuDe !== null ? Number(dongTieuDe) : doDongTieuDe(matran);
    const cot = layTieuDe(matran, dong);
    const anhXa = goiYAnhXa(cot);

    // 5 dòng dữ liệu mẫu để người dùng đối chiếu
    const mau = [];
    for (let i = dong + 1; i < matran.length && mau.length < 5; i++) {
        const h = matran[i] || [];
        if (h.every(c => c === null || String(c).trim() === '')) continue;
        mau.push(cot.map(c => h[c.chi_so] ?? null));
    }

    return {
        sheets: wb.SheetNames,
        ten_sheet: sheet,
        dong_tieu_de: dong,
        cot,
        anh_xa_goi_y: anhXa,
        du_lieu_mau: mau,
        tong_dong_du_lieu: Math.max(0, matran.length - dong - 1)
    };
}

/**
 * Đọc toàn bộ dòng dữ liệu theo ánh xạ đã chốt.
 */
function docDuLieu(duongDan, tenSheet, dongTieuDe, anhXa) {
    const wb = XLSX.readFile(duongDan, { cellDates: true, cellStyles: true });
    const ws = wb.Sheets[tenSheet || wb.SheetNames[0]];
    const matran = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null, raw: true });
    const cot = layTieuDe(matran, dongTieuDe);

    const ket = [];
    for (let i = dongTieuDe + 1; i < matran.length; i++) {
        const h = matran[i] || [];
        if (h.every(c => c === null || String(c).trim() === '')) continue;

        const goc = {};
        cot.forEach(c => { goc[c.ten] = h[c.chi_so] ?? null; });

        const ban = { dong_goc: i + 1, du_lieu_goc: goc };
        for (const [truong, chiSo] of Object.entries(anhXa)) {
            if (chiSo === null || chiSo === undefined || chiSo === '') continue;
            ban[truong] = h[Number(chiSo)] ?? null;
        }
        const coDanhTinh = String(ban.ten ?? '').trim() && [ban.so_kiem_ke, ban.so_quan_ly, ban.ma_tscd, ban.so_seri]
            .some(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (coDanhTinh) {
            // Chỉ xét sau khi đã xác nhận đây là dòng thiết bị; sau đó quét toàn bộ
            // vùng dữ liệu của dòng để không bỏ sót màu ở cột ghi chú phụ của mẫu Công ty.
            const rg = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s:{c:0}, e:{c:h.length-1} };
            const mau = Array.from({ length: rg.e.c-rg.s.c+1 }, (_,n) => n)
                .map(c => mauVang(ws[XLSX.utils.encode_cell({ r:i, c })])).find(Boolean);
            ban.hidden_from_web = !!mau;
            ban.highlight_color = mau || null;
        } else {
            ban.hidden_from_web = false;
            ban.highlight_color = null;
        }
        ket.push(ban);
    }
    return ket;
}

/* ---------- Chuẩn hoá giá trị ---------- */
function veSo(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/[^\d,.\-]/g, '').replace(/\./g, '#').replace(/,/g, '.').replace(/#/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
}

function veNgay(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {                       // serial date của Excel
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);      // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);          // yyyy-mm-dd
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);                          // mm/yyyy
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
    m = s.match(/^(\d{4})$/);                                          // chỉ có năm
    if (m) return `${m[1]}-01-01`;
    return null;
}

function veNam(v) {
    if (!v) return null;
    const n = parseInt(String(v).match(/\d{4}/)?.[0], 10);
    return n >= 1900 && n <= 2100 ? n : null;
}

module.exports = { khongDau, docSheets, phanTich, docDuLieu, veSo, veNgay, veNam, TU_DIEN_COT };
