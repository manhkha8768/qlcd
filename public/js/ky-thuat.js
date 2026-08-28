/* =====================================================================
   GIAI ĐOẠN 4 — HỒ SƠ KỸ THUẬT THIẾT BỊ
   Một màn hình hồ sơ với nhiều tab, cùng danh sách sự cố và danh mục
   phụ tùng dùng chung cho toàn công ty.
   ===================================================================== */

const TT_CUM = { dang_lap: 'Đang lắp', da_thao: 'Đã tháo',
                 da_thay_the: 'Đã thay thế', du_phong: 'Dự phòng' };
const LOAI_CUM = { cum: 'Cụm', chi_tiet: 'Chi tiết', vat_tu: 'Vật tư' };
const MUC_DO_SC = { nhe: 'Nhẹ', trung_binh: 'Trung bình',
                    nghiem_trong: 'Nghiêm trọng', khan_cap: 'Khẩn cấp' };
const TT_SU_CO = { moi: 'Mới', dang_kiem_tra: 'Đang kiểm tra', dang_sua: 'Đang sửa',
                   da_xu_ly: 'Đã xử lý', da_dong: 'Đã đóng' };
const LOAI_TL = {
    catalog: 'Catalog', huong_dan: 'Hướng dẫn sử dụng', so_do_dien: 'Sơ đồ điện',
    so_do_thuy_luc: 'Sơ đồ thủy lực', ban_ve: 'Bản vẽ', bien_phap_ktat: 'Biện pháp KTAT',
    bien_ban_nghiem_thu: 'Biên bản nghiệm thu', bien_ban_ban_giao: 'Biên bản bàn giao',
    phieu_sua_chua: 'Phiếu sửa chữa', phieu_bao_duong: 'Phiếu bảo dưỡng',
    chung_nhan_kiem_dinh: 'Chứng nhận kiểm định', khac: 'Tài liệu khác'
};
const SU_KIEN_CUM = { lap_dat: 'Lắp đặt', thao_ra: 'Tháo ra', thay_the: 'Thay thế',
    sua_chua: 'Sửa chữa', bao_duong: 'Bảo dưỡng', hong: 'Hỏng',
    kiem_tra: 'Kiểm tra', chuyen_vi_tri: 'Đổi vị trí' };
const NHOM_TL = { tang_giam: 'Tăng giảm', dieu_chuyen: 'Điều chuyển', su_co: 'Sự cố',
    sua_chua: 'Sửa chữa', bao_duong: 'Bảo dưỡng', linh_kien: 'Linh kiện',
    kiem_dinh: 'Kiểm định' };

function nhanCum(k) {
    const lop = { dang_lap: 'tt-hoat_dong', da_thao: 'tt-du_phong',
                  da_thay_the: 'tt-da_nhap', du_phong: 'tt-nhap' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${TT_CUM[k] || k}</span>`;
}
function nhanMucDo(k) {
    const lop = { nhe: 'tt-hoat_dong', trung_binh: 'tt-cho_duyet',
                  nghiem_trong: 'tt-qua_han', khan_cap: 'tt-qua_han' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${MUC_DO_SC[k] || k}</span>`;
}
function nhanTTSuCo(k) {
    const lop = { moi: 'tt-qua_han', dang_kiem_tra: 'tt-cho_duyet', dang_sua: 'tt-cho_duyet',
                  da_xu_ly: 'tt-da_duyet', da_dong: 'tt-du_phong' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${TT_SU_CO[k] || k}</span>`;
}

/* =========================== HỒ SƠ THIẾT BỊ =========================== */
let HS = { tbId: null, tab: 'tong-quan', tb: null };

const TAB_HS = [
    ['tong-quan', 'Tổng quan'], ['thong-so', 'Thông số'], ['cau-truc', 'Cấu trúc'],
    ['ly-lich', 'Lý lịch'], ['sua-chua', 'Sửa chữa'], ['bao-duong', 'Bảo dưỡng'],
    ['su-co', 'Sự cố'], ['phu-tung', 'Phụ tùng'], ['tai-lieu', 'Tài liệu'], ['chi-phi', 'Chi phí']
];

async function moHoSo(thietBiId, tab = 'tong-quan') {
    HS = { tbId: thietBiId, tab, tb: null };
    MAN_HINH = 'ho-so-tb';
    document.querySelectorAll('.canh-trai nav a').forEach(a => a.classList.remove('chon'));
    const d = await api('/thiet-bi/' + thietBiId);
    HS.tb = d.thiet_bi;
    if (!window.QUYEN) window.QUYEN = (await api('/quyen-cua-toi')).quyen;
    veHoSo();
}

async function doiTabHS(t) { HS.tab = t; veHoSo(); }

async function veHoSo() {
    const el = document.getElementById('chinh');
    const b = HS.tb;

    el.innerHTML = `
    <div class="dau-trang"><div>
        <div class="eyebrow">Hồ sơ kỹ thuật</div>
        <h2>${esc(b.ten)}</h2>
        <div class="phu">${esc(b.ma_tb)} · ${esc(b.ten_nhom || '')} · ${esc(b.ten_px || '')}</div></div>
        <div><button onclick="dieuHuong('thiet-bi')">Về danh sách</button></div></div>
    <div id="vung-bao"></div>

    <div class="bien-ten">
        <div><div class="ma-lon">${esc(b.ma_tb)}</div>
            <div class="ten-may">${esc(b.ten)}</div>
            <div class="duoi">${esc(b.ma_nhom || '')} · ${esc(b.ten_nhom || '')}${
                b.so_seri ? ' · Seri ' + esc(b.so_seri) : ''}${
                b.nam_sx ? ' · SX ' + b.nam_sx : ''}</div></div>
        <div class="cot-phai">
            <div>Đơn vị quản lý</div><div class="gt">${esc(b.ten_px || '—')}</div>
            <div style="margin-top:6px">Trạng thái</div>
            <div class="gt">${nhanTT(b.trang_thai)} ${nhanTT(b.tinh_trang_kt)}</div></div>
    </div>

    <div class="buoc" style="margin-bottom:16px;flex-wrap:wrap">
        ${TAB_HS.map(([k, t]) => `<div class="b ${HS.tab === k ? 'dang' : ''}"
            style="cursor:pointer;flex:0 1 auto;min-width:0"
            onclick="doiTabHS('${k}')">${t}</div>`).join('')}
    </div>

    <div id="noi-dung-tab">Đang tải…</div>`;

    const ve = {
        'tong-quan': tabTongQuan, 'thong-so': tabThongSo, 'cau-truc': tabCauTruc,
        'ly-lich': tabLyLich, 'sua-chua': tabSuaChua, 'bao-duong': tabBaoDuong,
        'su-co': tabSuCoTB, 'phu-tung': tabPhuTung, 'tai-lieu': tabTaiLieu, 'chi-phi': tabChiPhi
    }[HS.tab];

    try { await ve(document.getElementById('noi-dung-tab')); }
    catch (e) { document.getElementById('noi-dung-tab').innerHTML =
        `<div class="bao loi">Không thể tải phần này: ${esc(e.message)}
         <button class="nho" style="margin-left:8px" onclick="veHoSo()">Thử lại</button></div>`; }
}

/* ---------- Tab 1: Tổng quan ---------- */
async function tabTongQuan(el) {
    const d = await api(`/ky-thuat/thiet-bi/${HS.tbId}/tong-quan`);
    const b = HS.tb;
    const cp = d.chi_phi || {};
    const o = (n, v, g = '', lop = '') => `<div class="o-so ${lop}"><div class="nhan">${n}</div>
        <div class="gt">${v}</div><div class="ghi">${g || '&nbsp;'}</div></div>`;

    const bdKT = d.bao_duong_ke_tiep;
    const lopBD = bdKT?.muc_canh_bao === 'qua_han' ? 'nguy'
                : bdKT?.muc_canh_bao === 'den_han' ? 'canh-bao' : '';

    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:160px">${n}</td>
        <td>${esc(v)}</td></tr>` : '';

    el.innerHTML = `
    <div class="luoi-so">
        ${o('Số lần sửa chữa', d.so_lan_sua_chua)}
        ${o('Số lần bảo dưỡng', d.so_lan_bao_duong)}
        ${o('Sự cố', d.so_su_co, d.su_co_dang_mo ? d.su_co_dang_mo + ' đang mở' : '',
            d.su_co_dang_mo ? 'canh-bao' : '')}
        ${o('Chi phí tích lũy', tien(cp.tong_chi_phi) || 0,
            cp.ty_le_tren_nguyen_gia != null ? cp.ty_le_tren_nguyen_gia + '% nguyên giá' : '')}
    </div>
    <div class="luoi-so">
        ${o('Cụm chi tiết', d.so_cum)}
        ${o('Bảo dưỡng gần nhất', d.bao_duong_gan_nhat ? ngay(d.bao_duong_gan_nhat.ngay_thuc_hien) : '—',
            d.bao_duong_gan_nhat?.cap_bd || '')}
        ${o('Bảo dưỡng kế tiếp', bdKT ? ngay(bdKT.lan_ke_tiep) : '—',
            bdKT ? (bdKT.con_lai_ngay < 0 ? 'quá ' + (-bdKT.con_lai_ngay) + ' ngày'
                                          : 'còn ' + bdKT.con_lai_ngay + ' ngày') : 'chưa lập kế hoạch',
            lopBD)}
    </div>

    <div class="the"><h3>Thông tin thiết bị</h3><div class="than-the"><table>
        ${hang('Mã tài sản', b.ma_tscd)}
        ${hang('Model', b.ma_model)}
        ${hang('Số seri', b.so_seri)}
        ${hang('Hãng sản xuất', b.model_hang)}
        ${hang('Năm sản xuất', b.nam_sx)}
        ${hang('Nước sản xuất', b.nuoc_sx)}
        ${hang('Công suất', b.cong_suat_kw ? b.cong_suat_kw + ' kW' : '')}
        ${hang('Vị trí lắp đặt', b.ten_vi_tri)}
        ${hang('Ngày đưa vào sử dụng', ngay(b.ngay_su_dung))}
        ${hang('Nguyên giá', tien(b.nguyen_gia) ? tien(b.nguyen_gia) + ' đ' : '')}
        ${hang('Giờ chạy luỹ kế', b.gio_chay_luy_ke ? b.gio_chay_luy_ke + ' giờ' : '')}
        <tr><td style="color:var(--chu-nhat)">Trạng thái quản lý</td><td>${nhanTT(b.trang_thai)}</td></tr>
        <tr><td style="color:var(--chu-nhat)">Tình trạng kỹ thuật</td><td>${nhanTT(b.tinh_trang_kt)}</td></tr>
    </table>
    <div class="ghi-nho">Trạng thái quản lý và tình trạng kỹ thuật là hai chỉ tiêu độc lập:
        máy vẫn hoạt động nhưng tình trạng kém là hợp lệ, nghĩa là cần bảo dưỡng.</div>
    </div></div>`;
}

/* ---------- Tab 2: Thông số kỹ thuật ---------- */
async function tabThongSo(el) {
    const ds = await api(`/ky-thuat/thiet-bi/${HS.tbId}/thong-so`);
    if (!ds.length) {
        el.innerHTML = `<div class="the"><div class="than-the trong">
            Nhóm thiết bị này chưa khai báo bộ thông số kỹ thuật.
            ${coQ('KT_SUA') ? '<br><br>Admin khai báo trong mục Quản trị để mọi thiết bị cùng nhóm dùng chung.' : ''}
        </div></div>`;
        return;
    }
    const suaDuoc = coQ('KT_SUA');
    const oNhap = (x) => {
        const gt = x.kieu_du_lieu === 'so' ? (x.gia_tri_so ?? '')
                 : x.kieu_du_lieu === 'logic' ? '' : (x.gia_tri_chu ?? '');
        if (!suaDuoc) return esc(gt) || '<span style="color:var(--chu-mo)">chưa nhập</span>';
        if (x.kieu_du_lieu === 'logic') {
            return `<input type="checkbox" id="ts-${x.dinh_nghia_id}" style="width:auto"
                    ${x.gia_tri_logic ? 'checked' : ''}>`;
        }
        if (x.kieu_du_lieu === 'chon' && x.gia_tri_chon) {
            const opts = JSON.parse(x.gia_tri_chon);
            return `<select id="ts-${x.dinh_nghia_id}"><option value=""></option>
                ${opts.map(o => `<option ${o === gt ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        }
        return `<input id="ts-${x.dinh_nghia_id}" value="${esc(gt)}"
                ${x.kieu_du_lieu === 'ngay' ? 'type="date"' : ''}>`;
    };

    el.innerHTML = `<div class="the"><h3>Thông số kỹ thuật · ${esc(HS.tb.ten_nhom || '')}</h3>
        <div class="bao-bang"><table>
        <thead><tr><th style="width:240px">Thông số</th><th>Giá trị</th>
            <th style="width:90px">Đơn vị</th></tr></thead>
        <tbody>${ds.map(x => `<tr>
            <td>${esc(x.ten)}${x.bat_buoc ? ' <span style="color:var(--do)">*</span>' : ''}
                <div class="ma" style="color:var(--chu-mo)">${esc(x.ma_thong_so)}</div></td>
            <td>${oNhap(x)}</td>
            <td style="color:var(--chu-nhat)">${esc(x.don_vi || '')}</td></tr>`).join('')}
        </tbody></table></div>
        ${suaDuoc ? `<div class="than-the"><button class="chinh-nut" onclick="luuThongSo()">Lưu thông số</button>
            <span class="ghi-nho" style="margin-left:10px">Bộ thông số theo nhóm thiết bị, mỗi nhóm một bộ riêng.</span>
        </div>` : ''}
    </div>`;
    window._DS_TS = ds;
}

async function luuThongSo() {
    const body = (window._DS_TS || []).map(x => {
        const e = document.getElementById('ts-' + x.dinh_nghia_id);
        if (!e) return null;
        return { dinh_nghia_id: x.dinh_nghia_id,
                 gia_tri: x.kieu_du_lieu === 'logic' ? (e.checked ? 1 : 0) : e.value };
    }).filter(Boolean);
    try {
        await api(`/ky-thuat/thiet-bi/${HS.tbId}/thong-so`, { method: 'PUT', body });
        bao('Đã lưu thông số kỹ thuật');
    } catch (e) { bao(e.message, 'loi'); }
}

/* ---------- Tab 3: Cấu trúc thiết bị dạng cây ---------- */
let MO_ROng = new Set();

async function tabCauTruc(el) {
    const d = await api(`/ky-thuat/thiet-bi/${HS.tbId}/cay`);
    const cay = d.cay || [];

    el.innerHTML = `<div class="the">
        <h3>Cấu trúc cụm — chi tiết</h3>
        <div class="than-the" style="padding-bottom:8px;display:flex;gap:8px;flex-wrap:wrap">
            ${coQ('CUM_TAO') ? `<button class="chinh-nut" onclick="formCum(null)">Thêm cụm gốc</button>` : ''}
            <button onclick="moTatCa(true)">Mở tất cả</button>
            <button onclick="moTatCa(false)">Thu gọn</button>
        </div>
        <div class="than-the" id="cay-tb" style="padding-top:0">
            ${cay.length ? veCay(cay, 0) : `<div class="trong">Chưa khai báo cấu trúc.
                ${coQ('CUM_TAO') ? 'Bấm "Thêm cụm gốc" để bắt đầu, ví dụ Cụm truyền động, Cụm tang, Cụm khung.' : ''}</div>`}
        </div></div>`;
    window._CAY = cay;
}

function veCay(ns, muc) {
    return ns.map(n => {
        const coCon = (n.con || []).length > 0;
        const mo = MO_ROng.has(n.id) || muc < 1;
        return `<div class="nut-cay" style="margin-left:${muc * 18}px">
            <div class="hang-cay">
                <span class="mo-cay" onclick="toggleCay(${n.id})"
                      style="cursor:${coCon ? 'pointer' : 'default'};color:${coCon ? 'var(--chu)' : 'transparent'}">
                    ${coCon ? (mo ? '▾' : '▸') : '•'}</span>
                <span class="ma">${esc(n.ma_cum || '')}</span>
                <strong style="cursor:pointer" onclick="xemCum(${n.id})">${esc(n.ten)}</strong>
                <span style="color:var(--chu-nhat);font-size:12px">${LOAI_CUM[n.loai_cum] || ''}</span>
                ${n.so_luong > 1 ? `<span class="so" style="font-size:12px">×${n.so_luong}</span>` : ''}
                ${n.ma_phu_tung ? `<span class="ma" style="color:var(--chu-mo)">PN ${esc(n.ma_phu_tung)}</span>` : ''}
                ${nhanTT(n.tinh_trang_kt)}
                ${n.so_tai_lieu ? `<span style="font-size:11.5px;color:var(--chu-mo)">${n.so_tai_lieu} tệp</span>` : ''}
                <span class="thao-tac-cay">
                    <button class="nho" onclick="xemCum(${n.id})">Xem</button>
                    ${coQ('CUM_TAO') ? `<button class="nho" onclick="formCum(${n.id})">+ Con</button>` : ''}
                    ${coQ('CUM_SUA') ? `<button class="nho" onclick="formThayThe(${n.id},'${esc(n.ten)}')">Thay</button>` : ''}
                </span>
            </div>
            ${coCon && mo ? veCay(n.con, muc + 1) : ''}
        </div>`;
    }).join('');
}

function toggleCay(id) {
    if (MO_ROng.has(id)) MO_ROng.delete(id); else MO_ROng.add(id);
    document.getElementById('cay-tb').innerHTML = veCay(window._CAY || [], 0);
}
function moTatCa(mo) {
    const duyet = (ns) => ns.forEach(n => { mo ? MO_ROng.add(n.id) : MO_ROng.delete(n.id); duyet(n.con || []); });
    duyet(window._CAY || []);
    document.getElementById('cay-tb').innerHTML = veCay(window._CAY || [], 0);
}

function formCum(chaId, cum = null) {
    moHopThoai(cum ? 'Sửa cụm' : (chaId ? 'Thêm cụm con' : 'Thêm cụm gốc'), `
        <div class="hang">
            <div class="o-nhap" style="flex:0 0 140px"><label>Mã cụm</label>
                <input id="c-ma" value="${esc(cum?.ma_cum || '')}" placeholder="tự sinh"></div>
            <div class="o-nhap"><label>Tên cụm / chi tiết *</label>
                <input id="c-ten" value="${esc(cum?.ten || '')}" placeholder="Ví dụ: Hộp giảm tốc"></div>
            <div class="o-nhap" style="flex:0 0 130px"><label>Loại</label><select id="c-loai">
                ${Object.entries(LOAI_CUM).map(([k, v]) =>
                    `<option value="${k}" ${cum?.loai_cum === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Hãng sản xuất</label><input id="c-hang" value="${esc(cum?.hang_sx || '')}"></div>
            <div class="o-nhap"><label>Model</label><input id="c-model" value="${esc(cum?.model || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số seri</label><input id="c-seri" value="${esc(cum?.so_seri || '')}"></div>
            <div class="o-nhap"><label>Mã phụ tùng (Part No.)</label>
                <input id="c-pn" value="${esc(cum?.ma_phu_tung || '')}" placeholder="22218"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số lượng</label><input id="c-sl" value="${cum?.so_luong ?? 1}"></div>
            <div class="o-nhap"><label>ĐVT</label><input id="c-dvt" value="${esc(cum?.dvt || 'Cái')}"></div>
            <div class="o-nhap"><label>Ngày lắp</label><input id="c-ngay" type="date" value="${cum?.ngay_lap || ''}"></div>
            <div class="o-nhap"><label>Tình trạng</label><select id="c-tt">
                ${['tot', 'trung_binh', 'kem', 'hong'].map(k =>
                    `<option value="${k}" ${cum?.tinh_trang_kt === k ? 'selected' : ''}>${tt(k)}</option>`).join('')}
            </select></div>
        </div>
        <div class="o-nhap"><label>Ghi chú</label><input id="c-gc" value="${esc(cum?.ghi_chu || '')}"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: cum ? 'Lưu' : 'Thêm', lop: 'chinh-nut', chay: async () => {
            const body = { ma_cum: gt('c-ma') || null, ten: gt('c-ten'), loai_cum: gt('c-loai'),
                hang_sx: gt('c-hang') || null, model: gt('c-model') || null,
                so_seri: gt('c-seri') || null, ma_phu_tung: gt('c-pn') || null,
                so_luong: so('c-sl') ?? 1, dvt: gt('c-dvt'), ngay_lap: gt('c-ngay') || null,
                tinh_trang_kt: gt('c-tt'), ghi_chu: gt('c-gc') || null };
            if (!body.ten) return baoTrongHopThoai('Nhập tên cụm');
            try {
                if (cum) await api('/ky-thuat/cum/' + cum.id, { method: 'PUT', body });
                else {
                    body.cha_id = chaId || null;
                    await api(`/ky-thuat/thiet-bi/${HS.tbId}/cum`, { method: 'POST', body });
                    if (chaId) MO_ROng.add(chaId);
                }
                dongHopThoai(); veHoSo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function xemCum(id) {
    const d = await api('/ky-thuat/cum/' + id);
    const c = d.cum;
    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:150px">${n}</td><td>${esc(v)}</td></tr>` : '';

    let h = `<div class="the"><h3>Thông tin</h3><div class="than-the"><table>
        ${hang('Mã cụm', c.ma_cum)}
        ${hang('Thuộc cụm', c.ten_cha)}
        ${hang('Loại', LOAI_CUM[c.loai_cum])}
        ${hang('Hãng sản xuất', c.hang_sx)}
        ${hang('Model', c.model)}
        ${hang('Số seri', c.so_seri)}
        ${hang('Mã phụ tùng', c.ma_phu_tung)}
        ${hang('Số lượng', c.so_luong > 1 ? c.so_luong + ' ' + (c.dvt || '') : '')}
        ${hang('Ngày lắp', ngay(c.ngay_lap))}
        <tr><td style="color:var(--chu-nhat)">Trạng thái</td>
            <td>${nhanCum(c.trang_thai)} ${nhanTT(c.tinh_trang_kt)}</td></tr>
        ${hang('Ghi chú', c.ghi_chu)}
    </table></div></div>`;

    if (d.phu_tung?.length) {
        h += `<div class="the"><h3>Phụ tùng tương thích</h3><div class="bao-bang"><table>
            <thead><tr><th>Mã</th><th>Tên phụ tùng</th><th>Part No.</th>
                <th class="phai">SL khuyến nghị</th></tr></thead>
            <tbody>${d.phu_tung.map(p => `<tr>
                <td class="ma">${esc(p.ma_phu_tung || p.ma || '')}</td>
                <td>${esc(p.ten)}${p.la_chinh ? ' <span class="nhan-tt tt-da_duyet">Chính</span>' : ''}</td>
                <td class="ma">${esc(p.part_number || '')}</td>
                <td class="phai so">${p.so_luong_khuyen_nghi || ''}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }
    if (d.sua_chua?.length) {
        h += `<div class="the"><h3>Sửa chữa liên quan</h3><div class="bao-bang"><table>
            <thead><tr><th>Số phiếu</th><th>Ngày</th><th>Nội dung</th>
                <th class="phai">Chi phí</th><th>Trạng thái</th></tr></thead>
            <tbody>${d.sua_chua.map(p => `<tr><td class="ma">${esc(p.so_phieu)}</td>
                <td>${ngay(p.ngay_bat_dau)}</td><td>${esc(p.mo_ta_hu_hong || '')}</td>
                <td class="phai so">${tien(p.tong_chi_phi)}</td>
                <td>${nhanTT(p.trang_thai)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }
    h += `<div class="the"><h3>Lịch sử cụm</h3><div class="bao-bang"><table>
        <thead><tr><th>Ngày</th><th>Sự kiện</th><th>Tình trạng</th><th>Người thực hiện</th><th>Ghi chú</th></tr></thead>
        <tbody>${(d.lich_su || []).length ? d.lich_su.map(l => `<tr>
            <td>${ngay(l.ngay_su_kien)}</td>
            <td>${SU_KIEN_CUM[l.loai_su_kien] || l.loai_su_kien}</td>
            <td>${l.tinh_trang_truoc || l.tinh_trang_sau
                ? `${l.tinh_trang_truoc ? tt(l.tinh_trang_truoc) + ' → ' : ''}${tt(l.tinh_trang_sau || '')}` : ''}</td>
            <td>${esc(l.ho_ten || '')}</td><td>${esc(l.ghi_chu || '')}</td></tr>`).join('')
            : '<tr><td colspan="5" class="trong">Chưa có sự kiện.</td></tr>'}
        </tbody></table></div></div>`;

    const nut = [];
    if (coQ('CUM_SUA')) {
        nut.push({ ten: 'Sửa', chay: () => { dongHopThoai(); formCum(null, c); } });
        nut.push({ ten: 'Đổi vị trí', chay: () => formDiChuyen(c) });
        nut.push({ ten: 'Thay thế', lop: 'nhan-manh', chay: () => formThayThe(c.id, c.ten) });
    }
    if (coQ('CUM_XOA')) nut.push({ ten: 'Gỡ ra', lop: 'nguy-hiem', chay: () => goCum(c.id, c.ten) });
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai(`Cụm: ${c.ten}`, h, nut, true);
}

function formThayThe(id, ten) {
    moHopThoai('Thay thế cụm', `
        <div class="bao tin">Cụm cũ <strong>${esc(ten)}</strong> không bị xóa. Hệ thống chuyển nó
        sang trạng thái đã thay thế, giữ nguyên lịch sử, và tạo cụm mới kế thừa đúng vị trí trong cây.</div>
        <div class="hang">
            <div class="o-nhap"><label>Tên cụm mới</label><input id="tt-ten" value="${esc(ten)}"></div>
            <div class="o-nhap"><label>Số seri mới</label><input id="tt-seri"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Model</label><input id="tt-model"></div>
            <div class="o-nhap"><label>Ngày thay</label>
                <input id="tt-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <div class="o-nhap"><label>Lý do thay thế</label>
            <textarea id="tt-lydo" rows="2" placeholder="Ví dụ: vòng bi rơ, phát sinh tiếng kêu"></textarea></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Thay thế', lop: 'nhan-manh', chay: async () => {
            try {
                await api(`/ky-thuat/cum/${id}/thay-the`, { method: 'POST', body: {
                    ten: gt('tt-ten'), so_seri: gt('tt-seri') || null, model: gt('tt-model') || null,
                    ngay_thay: gt('tt-ngay'), ly_do: gt('tt-lydo') || null } });
                dongHopThoai(); bao('Đã thay thế cụm, lịch sử được giữ nguyên'); veHoSo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

function formDiChuyen(c) {
    const phang = [];
    const duyet = (ns, muc) => ns.forEach(n => {
        if (n.id !== c.id) phang.push({ id: n.id, ten: '　'.repeat(muc) + n.ten });
        duyet(n.con || [], muc + 1);
    });
    duyet(window._CAY || [], 0);

    moHopThoai('Đổi vị trí trong cấu trúc', `
        <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:10px">
        Chuyển <strong>${esc(c.ten)}</strong> sang thuộc một cụm khác.
        Toàn bộ cụm con đi theo.</p>
        <div class="o-nhap"><label>Cụm cha mới</label><select id="dc-cha">
            <option value="">— Đưa lên cấp gốc —</option>
            ${phang.map(x => `<option value="${x.id}">${esc(x.ten)}</option>`).join('')}
        </select></div>
        <div class="o-nhap"><label>Lý do</label><input id="dc-lydo"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Chuyển', lop: 'chinh-nut', chay: async () => {
            try {
                await api(`/ky-thuat/cum/${c.id}/di-chuyen`, { method: 'POST', body: {
                    cha_id: gt('dc-cha') || null, ly_do: gt('dc-lydo') || null } });
                dongHopThoai(); bao('Đã đổi vị trí'); veHoSo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function goCum(id, ten) {
    if (!confirm(`Gỡ "${ten}" khỏi cấu trúc? Dữ liệu và lịch sử vẫn được giữ lại.`)) return;
    try { await api('/ky-thuat/cum/' + id, { method: 'DELETE' }); dongHopThoai(); veHoSo(); }
    catch (e) { bao(e.message, 'loi'); }
}

/* ---------- Tab 4: Lý lịch ---------- */
let LOC_LL = '';

async function tabLyLich(el) {
    const d = await api(`/ky-thuat/thiet-bi/${HS.tbId}/timeline${LOC_LL ? '?loc=' + LOC_LL : ''}`);
    const sk = Array.isArray(d) ? d : (d.su_kien || []);

    const nut = (k, t) => `<button class="${LOC_LL === k ? 'chinh-nut' : ''}"
        onclick="LOC_LL='${k}';veHoSo()">${t}</button>`;

    el.innerHTML = `<div class="the">
        <h3>Toàn bộ lịch sử thiết bị</h3>
        <div class="than-the" style="padding-bottom:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${nut('', 'Tất cả')}
            ${Object.entries(NHOM_TL).map(([k, t]) => nut(k, t)).join('')}
        </div>
        <div class="bao-bang"><table>
            <thead><tr><th style="width:100px">Ngày</th><th style="width:110px">Loại</th>
                <th>Nội dung</th><th>Chứng từ</th><th>Người</th></tr></thead>
            <tbody>${sk.length ? sk.map(x => `<tr>
                <td class="so">${ngay(x.ngay)}</td>
                <td><span class="nhan-tt ${x.nhom === 'su_co' ? 'tt-qua_han'
                    : x.nhom === 'sua_chua' ? 'tt-cho_duyet'
                    : x.nhom === 'bao_duong' ? 'tt-da_duyet' : 'tt-nhap'}">${NHOM_TL[x.nhom] || x.nhom}</span></td>
                <td><strong>${esc(x.tieu_de || '')}</strong>
                    ${x.mo_ta ? `<div style="font-size:12px;color:var(--chu-nhat)">${esc(x.mo_ta)}</div>` : ''}</td>
                <td class="ma">${esc(x.chung_tu || '')}</td>
                <td style="font-size:12.5px">${esc(x.nguoi || '')}</td></tr>`).join('')
                : '<tr><td colspan="5" class="trong">Chưa có sự kiện nào trong nhóm này.</td></tr>'}
            </tbody></table></div>
        <div class="than-the ghi-nho">Lý lịch gom từ nhiều nguồn: tăng giảm, điều chuyển,
            sự cố, sửa chữa, bảo dưỡng, thay linh kiện và kiểm định.</div>
    </div>`;
}

/* ---------- Tab 5–7: Sửa chữa, Bảo dưỡng, Sự cố của thiết bị ---------- */
async function tabSuaChua(el) {
    const ds = await api('/bao-duong/phieu?thiet_bi_id=' + HS.tbId);
    el.innerHTML = `<div class="the"><h3>Phiếu sửa chữa</h3>
        ${coQ('SC_TAO') ? `<div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formPhieuSC()">Lập phiếu sửa chữa</button></div>` : ''}
        <div class="bao-bang"><table>
        <thead><tr><th>Số phiếu</th><th>Loại</th><th>Nội dung</th><th>Bắt đầu</th>
            <th>Hoàn thành</th><th class="phai">Chi phí</th><th class="phai">Giờ dừng</th>
            <th>Trạng thái</th></tr></thead>
        <tbody>${ds.length ? ds.map(p => `<tr class="bam" onclick="xemPhieuSC(${p.id})">
            <td class="ma">${esc(p.so_phieu)}</td><td>${LOAI_SC[p.loai] || p.loai}</td>
            <td>${esc(p.mo_ta_hu_hong || '')}</td><td>${ngay(p.ngay_bat_dau)}</td>
            <td>${ngay(p.ngay_hoan_thanh)}</td>
            <td class="phai so">${tien(p.tong_chi_phi)}</td>
            <td class="phai so">${p.thoi_gian_dung_may || ''}</td>
            <td>${nhanTT(p.trang_thai)}</td></tr>`).join('')
            : '<tr><td colspan="8" class="trong">Chưa có phiếu sửa chữa nào.</td></tr>'}
        </tbody></table></div></div>`;
}

async function tabBaoDuong(el) {
    const [kh, ds] = await Promise.all([
        api('/bao-duong/ke-hoach?thiet_bi_id=' + HS.tbId),
        api('/bao-duong/phieu?thiet_bi_id=' + HS.tbId).catch(() => [])]);

    el.innerHTML = `<div class="the"><h3>Kế hoạch bảo dưỡng định kỳ</h3>
        ${coQ('BD_TAO') ? `<div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formKeHoachBD()">Lập kế hoạch</button></div>` : ''}
        <div class="bao-bang"><table>
        <thead><tr><th>Cấp</th><th>Chu kỳ</th><th>Lần cuối</th><th>Hạn kế tiếp</th>
            <th class="phai">Còn lại</th><th>Phụ trách</th></tr></thead>
        <tbody>${kh.length ? kh.map(k => {
            const con = k.lan_ke_tiep
                ? Math.round((new Date(k.lan_ke_tiep) - new Date()) / 864e5) : null;
            return `<tr>
            <td>${CAP_BD[k.cap_bd] || k.cap_bd}</td>
            <td>${k.chu_ky_ngay ? k.chu_ky_ngay + ' ngày' : ''}${k.chu_ky_gio ? ' / ' + k.chu_ky_gio + ' giờ' : ''}</td>
            <td>${ngay(k.lan_cuoi)}</td><td>${ngay(k.lan_ke_tiep)}</td>
            <td class="phai so ${con !== null && con < 0 ? 'loi-o' : con !== null && con <= 7 ? 'canh-bao-o' : ''}">
                ${con === null ? '' : con < 0 ? 'quá ' + (-con) + ' ngày' : con + ' ngày'}</td>
            <td>${esc(k.nguoi_phu_trach || '')}</td></tr>`; }).join('')
            : '<tr><td colspan="6" class="trong">Chưa lập kế hoạch bảo dưỡng.</td></tr>'}
        </tbody></table></div></div>`;
}

async function tabSuCoTB(el) {
    const ds = await api('/su-co?thiet_bi_id=' + HS.tbId);
    el.innerHTML = `<div class="the"><h3>Sự cố của thiết bị</h3>
        ${coQ('SU_CO_TAO') ? `<div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formSuCo(${HS.tbId})">Báo sự cố</button></div>` : ''}
        <div class="bao-bang"><table>
        <thead><tr><th>Mã</th><th>Ngày</th><th>Cụm</th><th>Hiện tượng</th>
            <th>Mức độ</th><th class="phai">Dừng máy</th><th>Trạng thái</th></tr></thead>
        <tbody>${ds.length ? ds.map(s => `<tr class="bam" onclick="xemSuCo(${s.id})">
            <td class="ma">${esc(s.ma_su_co || s.ma || '')}</td>
            <td>${ngay(s.ngay_su_co)}</td><td>${esc(s.ten_cum || '')}</td>
            <td>${esc(s.hien_tuong)}</td><td>${nhanMucDo(s.muc_do)}</td>
            <td class="phai so">${s.thoi_gian_dung_phut ? s.thoi_gian_dung_phut + ' ph' : ''}</td>
            <td>${nhanTTSuCo(s.trang_thai)}</td></tr>`).join('')
            : '<tr><td colspan="7" class="trong">Chưa ghi nhận sự cố nào.</td></tr>'}
        </tbody></table></div></div>`;
}

/* ---------- Tab 8: Phụ tùng ---------- */
async function tabPhuTung(el) {
    const ds = await api(`/ky-thuat/thiet-bi/${HS.tbId}/phu-tung`);
    el.innerHTML = `<div class="the"><h3>Phụ tùng tương thích</h3>
        <div class="than-the" style="padding-bottom:8px">
            <span class="ghi-nho">Danh sách lấy từ dữ liệu tương thích đã khai báo cho thiết bị,
            nhóm thiết bị và từng cụm — không phải suy đoán.</span></div>
        <div class="bao-bang"><table>
        <thead><tr><th>Mã</th><th>Tên phụ tùng</th><th>Part No.</th><th>Quy cách</th>
            <th>Gắn với cụm</th><th class="phai">SL khuyến nghị</th><th class="phai">Giá tham khảo</th></tr></thead>
        <tbody>${ds.length ? ds.map(p => `<tr>
            <td class="ma">${esc(p.ma || p.ma_phu_tung || '')}</td>
            <td>${esc(p.ten)}${p.la_chinh ? ' <span class="nhan-tt tt-da_duyet">Chính</span>' : ''}</td>
            <td class="ma">${esc(p.part_number || '')}</td>
            <td>${esc(p.quy_cach || '')}</td>
            <td>${esc(p.ten_cum || '<span style="color:var(--chu-mo)">cả thiết bị</span>')}</td>
            <td class="phai so">${p.so_luong_khuyen_nghi || ''}</td>
            <td class="phai so">${tien(p.gia_tham_khao || p.don_gia)}</td></tr>`).join('')
            : `<tr><td colspan="7" class="trong">Chưa khai báo phụ tùng tương thích.
                Vào mục Phụ tùng để thêm và gắn với thiết bị hoặc từng cụm.</td></tr>`}
        </tbody></table></div></div>`;
}

/* ---------- Tab 9: Tài liệu ---------- */
async function tabTaiLieu(el) {
    const d = await api(`/ky-thuat/thiet-bi/${HS.tbId}/tai-lieu`);
    const theoLoai = d.theo_loai || {};

    el.innerHTML = `<div class="the"><h3>Tài liệu kỹ thuật</h3>
        ${coQ('TAI_LIEU_TAI_LEN') ? `<div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formTaiLieuKT()">Tải tài liệu lên</button></div>` : ''}
        <div class="than-the">
        ${Object.keys(theoLoai).length ? Object.entries(theoLoai).map(([loai, ds]) => `
            <div style="margin-bottom:14px">
                <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                     color:var(--chu-nhat);margin-bottom:5px">${LOAI_TL[loai] || loai}</div>
                ${ds.map(t => `<div style="display:flex;align-items:center;gap:10px;
                     padding:6px 0;border-bottom:1px solid #EDEFF2">
                    <a href="/api/ky-thuat/tai-lieu/${t.id}/tai-ve" style="color:var(--lam);flex:1">
                        ${esc(t.ten_tai_lieu || t.ten_file)}</a>
                    ${t.so_van_ban ? `<span class="ma" style="color:var(--chu-mo)">${esc(t.so_van_ban)}</span>` : ''}
                    ${t.ten_cum ? `<span style="font-size:12px;color:var(--chu-nhat)">${esc(t.ten_cum)}</span>` : ''}
                    <span class="so" style="font-size:12px;color:var(--chu-mo)">
                        ${t.kich_thuoc ? (t.kich_thuoc / 1024).toFixed(0) + ' KB' : ''}</span>
                    ${coQ('TAI_LIEU_XOA') ? `<button class="nho nguy-hiem"
                        onclick="xoaTaiLieuKT(${t.id})">Gỡ</button>` : ''}
                </div>`).join('')}
            </div>`).join('')
            : '<div class="trong">Chưa có tài liệu nào. Tải catalog, sơ đồ điện, bản vẽ lắp đặt lên đây.</div>'}
        </div></div>`;
}

function formTaiLieuKT() {
    const cum = [];
    const duyet = (ns, muc) => ns.forEach(n => {
        cum.push({ id: n.id, ten: '　'.repeat(muc) + n.ten }); duyet(n.con || [], muc + 1); });
    duyet(window._CAY || [], 0);

    moHopThoai('Tải tài liệu kỹ thuật', `
        <div class="hang">
            <div class="o-nhap"><label>Loại tài liệu</label><select id="k-loai">
                ${Object.entries(LOAI_TL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Gắn với cụm (tùy chọn)</label><select id="k-cum">
                <option value="">— Cả thiết bị —</option>
                ${cum.map(c => `<option value="${c.id}">${esc(c.ten)}</option>`).join('')}
            </select></div>
        </div>
        <div class="o-nhap"><label>Tên tài liệu</label><input id="k-ten" placeholder="để trống thì lấy tên tệp"></div>
        <div class="hang">
            <div class="o-nhap"><label>Số văn bản</label><input id="k-vb"></div>
            <div class="o-nhap"><label>Ngày ban hành</label><input id="k-ngay" type="date"></div>
            <div class="o-nhap"><label>Phiên bản</label><input id="k-pb"></div>
        </div>
        <div class="o-nhap"><label>Tệp *</label><input type="file" id="k-file"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Tải lên', lop: 'chinh-nut', chay: async () => {
            const f = document.getElementById('k-file').files[0];
            if (!f) return baoTrongHopThoai('Chọn tệp');
            const fd = new FormData();
            fd.append('file', f);
            fd.append('loai_tai_lieu', gt('k-loai'));
            if (gt('k-cum')) fd.append('cum_id', gt('k-cum'));
            if (gt('k-ten')) fd.append('ten_tai_lieu', gt('k-ten'));
            if (gt('k-vb')) fd.append('so_van_ban', gt('k-vb'));
            if (gt('k-ngay')) fd.append('ngay_ban_hanh', gt('k-ngay'));
            if (gt('k-pb')) fd.append('phien_ban', gt('k-pb'));
            try {
                await api(`/ky-thuat/thiet-bi/${HS.tbId}/tai-lieu`, { method: 'POST', body: fd });
                dongHopThoai(); veHoSo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function xoaTaiLieuKT(id) {
    if (!confirm('Gỡ tài liệu này?')) return;
    await api('/ky-thuat/tai-lieu/' + id, { method: 'DELETE' });
    veHoSo();
}

/* ---------- Tab 10: Chi phí vòng đời ---------- */
async function tabChiPhi(el) {
    const d = await api(`/ky-thuat/thiet-bi/${HS.tbId}/chi-phi`);
    const t = d.tong_hop || {};
    const o = (n, v, g = '') => `<div class="o-so"><div class="nhan">${n}</div>
        <div class="gt" style="font-size:20px">${tien(v) || 0}</div><div class="ghi">${g || 'đồng'}</div></div>`;

    const max = Math.max(1, ...(d.theo_thang || []).map(x => (x.sua_chua || 0) + (x.bao_duong || 0)));

    el.innerHTML = `
    <div class="luoi-so">
        ${o('Sửa chữa', t.chi_phi_sua_chua, `${t.so_lan_sua_chua || 0} lần`)}
        ${o('Bảo dưỡng', t.chi_phi_bao_duong, `${t.so_lan_bao_duong || 0} lần`)}
        ${o('Kiểm định', t.chi_phi_kiem_dinh)}
        ${o('Tổng vòng đời', t.tong_chi_phi,
            t.ty_le_tren_nguyen_gia != null ? t.ty_le_tren_nguyen_gia + '% nguyên giá' : 'đồng')}
    </div>

    <div class="the"><h3>Chi phí theo tháng</h3><div class="than-the">
        ${(d.theo_thang || []).length ? `<table>
            <thead><tr><th>Tháng</th><th style="width:45%">Cơ cấu</th>
                <th class="phai">Sửa chữa</th><th class="phai">Bảo dưỡng</th><th class="phai">Cộng</th></tr></thead>
            <tbody>${d.theo_thang.map(x => {
                const sc = x.sua_chua || 0, bd = x.bao_duong || 0, c = sc + bd;
                return `<tr>
                <td class="so">${esc(x.thang)}</td>
                <td><div style="display:flex;height:14px;background:#EDEFF2;border-radius:2px;overflow:hidden">
                    <div style="width:${sc / max * 100}%;background:var(--ho-phach)"></div>
                    <div style="width:${bd / max * 100}%;background:var(--luc)"></div></div></td>
                <td class="phai so">${tien(sc)}</td><td class="phai so">${tien(bd)}</td>
                <td class="phai so"><strong>${tien(c)}</strong></td></tr>`; }).join('')}
            </tbody></table>
            <div class="ghi-nho" style="margin-top:8px">
                <span style="color:var(--ho-phach)">■</span> Sửa chữa
                <span style="color:var(--luc);margin-left:10px">■</span> Bảo dưỡng</div>`
            : '<div class="trong">Chưa phát sinh chi phí.</div>'}
    </div></div>

    <div class="the"><h3>Cơ cấu chi phí</h3><div class="than-the"><table>
        <tr><td style="color:var(--chu-nhat);width:220px">Vật tư dùng trong sửa chữa</td>
            <td class="phai so">${tien(t.vat_tu_sua_chua) || 0}</td></tr>
        <tr><td style="color:var(--chu-nhat)">Vật tư dùng trong bảo dưỡng</td>
            <td class="phai so">${tien(t.vat_tu_bao_duong) || 0}</td></tr>
    </table>
    <div class="bao tin" style="margin-top:10px">Tổng chi phí = sửa chữa + bảo dưỡng + kiểm định.
        Chi phí vật tư đã nằm trong tổng của từng phiếu; phần cơ cấu ở đây chỉ để phân tích,
        không cộng thêm vào tổng.</div>
    </div></div>`;
}

/* =========================== MÀN HÌNH SỰ CỐ =========================== */
let locSuCo = { trang_thai: '', muc_do: '' };

async function mhSuCo(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Kỹ thuật</div><h2>Sự cố thiết bị</h2>
            <div class="phu">Ghi nhận, theo dõi và đóng sự cố. Một sự cố có thể sinh ra nhiều phiếu sửa chữa.</div></div>
            ${coQ('SU_CO_TAO') ? `<div><button class="chinh-nut" onclick="formSuCo()">Báo sự cố</button></div>` : ''}
        </div>
        <div id="vung-bao"></div>
        <div class="thanh-loc">
            <select id="sc-tt" onchange="locSuCo.trang_thai=this.value;taiBangSuCo()">
                <option value="">Mọi trạng thái</option>
                ${Object.entries(TT_SU_CO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
            <select id="sc-md" onchange="locSuCo.muc_do=this.value;taiBangSuCo()">
                <option value="">Mọi mức độ</option>
                ${Object.entries(MUC_DO_SC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
            <button onclick="locSuCo={trang_thai:'',muc_do:''};mhSuCo(document.getElementById('chinh'))">Xóa lọc</button>
        </div>
        <div id="kpi-sc" class="luoi-so"></div>
        <div class="the"><div id="bang-sc" class="bao-bang">Đang tải…</div></div>`;

    if (!window.QUYEN) window.QUYEN = (await api('/quyen-cua-toi')).quyen;
    if (!window.DS_TB_CHON) await napDanhSachTB();
    taiBangSuCo();
}

async function taiBangSuCo() {
    const q = new URLSearchParams();
    if (locSuCo.trang_thai) q.set('trang_thai', locSuCo.trang_thai);
    if (locSuCo.muc_do) q.set('muc_do', locSuCo.muc_do);
    const ds = await api('/su-co?' + q);

    const dem = (f) => ds.filter(f).length;
    const o = (n, v, lop = '') => `<div class="o-so ${lop}"><div class="nhan">${n}</div>
        <div class="gt">${v}</div><div class="ghi">&nbsp;</div></div>`;
    const kpi = document.getElementById('kpi-sc');
    if (kpi) kpi.innerHTML =
        o('Tổng sự cố', ds.length) +
        o('Đang mở', dem(x => x.trang_thai !== 'da_dong'), dem(x => x.trang_thai !== 'da_dong') ? 'canh-bao' : '') +
        o('Nghiêm trọng / khẩn cấp', dem(x => ['nghiem_trong', 'khan_cap'].includes(x.muc_do)),
          dem(x => ['nghiem_trong', 'khan_cap'].includes(x.muc_do)) ? 'nguy' : '') +
        o('Tổng giờ dừng máy',
          Math.round(ds.reduce((t, x) => t + (x.thoi_gian_dung_phut || 0), 0) / 60 * 10) / 10);

    const el = document.getElementById('bang-sc');
    el.innerHTML = ds.length ? `<table><thead><tr>
        <th>Mã</th><th>Ngày</th><th>Thiết bị</th><th>PX</th><th>Cụm</th>
        <th>Hiện tượng</th><th>Mức độ</th><th class="phai">Dừng máy</th>
        <th class="giua">Phiếu SC</th><th>Trạng thái</th></tr></thead>
        <tbody>${ds.map(s => `<tr class="bam" onclick="xemSuCo(${s.id})">
            <td class="ma">${esc(s.ma_su_co || s.ma || '')}</td>
            <td>${ngay(s.ngay_su_co)}</td>
            <td><span class="ma">${esc(s.ma_tb || '')}</span>
                <div style="font-size:12px">${esc(s.ten_tb || '')}</div></td>
            <td>${esc(s.px || '')}</td><td style="font-size:12.5px">${esc(s.ten_cum || '')}</td>
            <td style="max-width:240px">${esc(s.hien_tuong)}
                ${s.dung_thiet_bi ? '<div><span class="nhan-tt tt-qua_han">Dừng máy</span></div>' : ''}</td>
            <td>${nhanMucDo(s.muc_do)}</td>
            <td class="phai so">${s.thoi_gian_dung_phut ? s.thoi_gian_dung_phut + ' ph' : ''}</td>
            <td class="giua so">${s.so_phieu_sc || ''}</td>
            <td>${nhanTTSuCo(s.trang_thai)}</td></tr>`).join('')}
        </tbody></table>`
        : '<div class="trong">Không có sự cố nào khớp điều kiện lọc.</div>';
}

async function formSuCo(thietBiId = null) {
    if (!window.DS_TB_CHON) await napDanhSachTB();
    let cumHtml = '<option value="">— Chưa xác định cụm —</option>';
    if (thietBiId) {
        try {
            const d = await api(`/ky-thuat/thiet-bi/${thietBiId}/cay`);
            const phang = [];
            const duyet = (ns, m) => ns.forEach(n => { phang.push({ id: n.id, ten: '　'.repeat(m) + n.ten }); duyet(n.con || [], m + 1); });
            duyet(d.cay || [], 0);
            cumHtml += phang.map(c => `<option value="${c.id}">${esc(c.ten)}</option>`).join('');
        } catch (e) { /* thiết bị chưa có cấu trúc */ }
    }

    moHopThoai('Báo sự cố thiết bị', `
        <div class="o-nhap"><label>Thiết bị *</label>
            <select id="s-tb" onchange="doiTBSuCo()">
            <option value="">— Chọn thiết bị —</option>
            ${(window.DS_TB_CHON || []).map(t => `<option value="${t.id}"
                ${t.id === thietBiId ? 'selected' : ''}>${esc(t.ma_tb)} — ${esc(t.ten)}</option>`).join('')}
            </select></div>
        <div class="o-nhap"><label>Cụm / chi tiết nghi ngờ</label>
            <select id="s-cum">${cumHtml}</select></div>
        <div class="hang">
            <div class="o-nhap"><label>Ngày xảy ra *</label>
                <input id="s-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="o-nhap"><label>Giờ</label><input id="s-gio" type="time"></div>
            <div class="o-nhap"><label>Mức độ *</label><select id="s-muc">
                ${Object.entries(MUC_DO_SC).map(([k, v]) =>
                    `<option value="${k}" ${k === 'trung_binh' ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="o-nhap"><label>Hiện tượng *</label>
            <textarea id="s-ht" rows="2" placeholder="Ví dụ: hộp giảm tốc rung mạnh, có tiếng kêu bất thường"></textarea></div>
        <div class="o-nhap"><label>Mô tả thêm</label>
            <textarea id="s-mota" rows="2" placeholder="Thời điểm phát hiện, diễn biến, điều kiện vận hành"></textarea></div>
        <div class="o-nhap"><label>Nguyên nhân nghi ngờ</label><input id="s-nn"></div>
        <div class="hang">
            <div class="o-nhap"><label><input type="checkbox" id="s-dung" style="width:auto;margin-right:6px">
                Sự cố làm dừng thiết bị</label></div>
            <div class="o-nhap"><label>Thời gian dừng (phút)</label><input id="s-tgdung"></div>
        </div>
        <div class="ghi-nho">Sự cố mức nghiêm trọng trở lên sẽ gửi thông báo tới cơ điện công ty.</div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Báo sự cố', lop: 'nhan-manh', chay: async () => {
            if (!gt('s-tb')) return baoTrongHopThoai('Chọn thiết bị');
            if (!gt('s-ht')) return baoTrongHopThoai('Mô tả hiện tượng gặp phải');
            try {
                await api('/su-co', { method: 'POST', body: {
                    thiet_bi_id: Number(gt('s-tb')), cum_id: gt('s-cum') || null,
                    ngay_su_co: gt('s-ngay'), gio_su_co: gt('s-gio') || null,
                    muc_do: gt('s-muc'), hien_tuong: gt('s-ht'), mo_ta: gt('s-mota') || null,
                    nguyen_nhan_nghi_ngo: gt('s-nn') || null,
                    dung_thiet_bi: document.getElementById('s-dung').checked ? 1 : 0,
                    thoi_gian_dung_phut: so('s-tgdung') ?? 0 } });
                dongHopThoai(); bao('Đã ghi nhận sự cố');
                if (MAN_HINH === 'ho-so-tb') veHoSo(); else taiBangSuCo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function doiTBSuCo() {
    const id = gt('s-tb');
    const sel = document.getElementById('s-cum');
    sel.innerHTML = '<option value="">— Chưa xác định cụm —</option>';
    if (!id) return;
    try {
        const d = await api(`/ky-thuat/thiet-bi/${id}/cay`);
        const duyet = (ns, m) => ns.forEach(n => {
            sel.innerHTML += `<option value="${n.id}">${'　'.repeat(m)}${esc(n.ten)}</option>`;
            duyet(n.con || [], m + 1); });
        duyet(d.cay || [], 0);
    } catch (e) { /* không có quyền hoặc chưa có cấu trúc */ }
}

async function xemSuCo(id) {
    const s = await api('/su-co/' + id);
    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:170px">${n}</td><td>${esc(v)}</td></tr>` : '';

    let h = `<div class="bien-ten">
        <div><div class="ma-lon">${esc(s.ma_su_co || s.ma || '')}</div>
            <div class="ten-may">${esc(s.hien_tuong)}</div>
            <div class="duoi">${esc(s.ma_tb || '')} — ${esc(s.ten_tb || '')}${
                s.ten_cum ? ' · ' + esc(s.ten_cum) : ''}</div></div>
        <div class="cot-phai"><div>Mức độ</div><div class="gt">${MUC_DO_SC[s.muc_do]}</div>
            <div style="margin-top:6px">Trạng thái</div><div class="gt">${TT_SU_CO[s.trang_thai]}</div></div>
    </div>

    <div class="the"><h3>Nội dung sự cố</h3><div class="than-the"><table>
        ${hang('Thời gian', ngay(s.ngay_su_co) + (s.gio_su_co ? ' ' + s.gio_su_co : ''))}
        ${hang('Đơn vị', s.px)}
        ${hang('Người báo', s.nguoi_bao)}
        ${hang('Mô tả', s.mo_ta)}
        ${hang('Nguyên nhân nghi ngờ', s.nguyen_nhan_nghi_ngo)}
        ${hang('Nguyên nhân thực tế', s.nguyen_nhan_thuc_te)}
        ${hang('Biện pháp xử lý', s.bien_phap_xu_ly)}
        <tr><td style="color:var(--chu-nhat)">Dừng thiết bị</td>
            <td>${s.dung_thiet_bi ? 'Có' : 'Không'}${
                s.thoi_gian_dung_phut ? ` — ${s.thoi_gian_dung_phut} phút` : ''}</td></tr>
        ${hang('Ngày đóng', ngay(s.ngay_dong))}
    </table></div></div>`;

    if (s.phieu_sua_chua?.length) {
        h += `<div class="the"><h3>Phiếu sửa chữa phát sinh</h3><div class="bao-bang"><table>
            <thead><tr><th>Số phiếu</th><th>Bắt đầu</th><th>Hoàn thành</th>
                <th class="phai">Chi phí</th><th>Trạng thái</th></tr></thead>
            <tbody>${s.phieu_sua_chua.map(p => `<tr><td class="ma">${esc(p.so_phieu)}</td>
                <td>${ngay(p.ngay_bat_dau)}</td><td>${ngay(p.ngay_hoan_thanh)}</td>
                <td class="phai so">${tien(p.tong_chi_phi)}</td>
                <td>${nhanTT(p.trang_thai)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    const nut = [];
    if (s.trang_thai !== 'da_dong') {
        if (coQ('SU_CO_SUA')) nut.push({ ten: 'Cập nhật', chay: () => formSuaSuCo(s) });
        if (coQ('SU_CO_DONG') || coQ('SC_DUYET')) {
            nut.push({ ten: 'Đóng sự cố', lop: 'nhan-manh', chay: () => formDongSuCo(s) });
        }
    }
    nut.push({ ten: 'Xem hồ sơ thiết bị', chay: () => { dongHopThoai(); moHoSo(s.thiet_bi_id, 'su-co'); } });
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai('Sự cố thiết bị', h, nut, true);
}

function formSuaSuCo(s) {
    moHopThoai('Cập nhật sự cố', `
        <div class="hang">
            <div class="o-nhap"><label>Mức độ</label><select id="u-muc">
                ${Object.entries(MUC_DO_SC).map(([k, v]) =>
                    `<option value="${k}" ${s.muc_do === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Trạng thái</label><select id="u-tt">
                ${Object.entries(TT_SU_CO).filter(([k]) => k !== 'da_dong').map(([k, v]) =>
                    `<option value="${k}" ${s.trang_thai === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Thời gian dừng (phút)</label>
                <input id="u-tg" value="${s.thoi_gian_dung_phut || ''}"></div>
        </div>
        <div class="o-nhap"><label>Nguyên nhân thực tế</label>
            <textarea id="u-nn" rows="2">${esc(s.nguyen_nhan_thuc_te || '')}</textarea></div>
        <div class="o-nhap"><label>Biện pháp xử lý</label>
            <textarea id="u-bp" rows="2">${esc(s.bien_phap_xu_ly || '')}</textarea></div>`,
        [{ ten: 'Hủy', chay: () => xemSuCo(s.id) },
         { ten: 'Lưu', lop: 'chinh-nut', chay: async () => {
            try {
                await api('/su-co/' + s.id, { method: 'PUT', body: {
                    muc_do: gt('u-muc'), trang_thai: gt('u-tt'),
                    thoi_gian_dung_phut: so('u-tg'), nguyen_nhan_thuc_te: gt('u-nn') || null,
                    bien_phap_xu_ly: gt('u-bp') || null } });
                dongHopThoai(); bao('Đã cập nhật sự cố');
                if (MAN_HINH === 'ho-so-tb') veHoSo(); else taiBangSuCo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

function formDongSuCo(s) {
    moHopThoai('Đóng sự cố ' + (s.ma_su_co || ''), `
        <div class="bao nhac">Phải ghi rõ nguyên nhân thực tế trước khi đóng.
        Mọi phiếu sửa chữa liên quan cũng phải hoàn thành xong.</div>
        <div class="o-nhap"><label>Nguyên nhân thực tế *</label>
            <textarea id="d-nn" rows="2">${esc(s.nguyen_nhan_thuc_te || '')}</textarea></div>
        <div class="o-nhap"><label>Biện pháp đã xử lý</label>
            <textarea id="d-bp" rows="2">${esc(s.bien_phap_xu_ly || '')}</textarea></div>
        <div class="o-nhap"><label>Tổng thời gian dừng máy (phút)</label>
            <input id="d-tg" value="${s.thoi_gian_dung_phut || ''}"></div>`,
        [{ ten: 'Hủy', chay: () => xemSuCo(s.id) },
         { ten: 'Đóng sự cố', lop: 'nhan-manh', chay: async () => {
            if (!gt('d-nn')) return baoTrongHopThoai('Phải ghi nguyên nhân thực tế');
            try {
                await api(`/su-co/${s.id}/dong`, { method: 'POST', body: {
                    nguyen_nhan_thuc_te: gt('d-nn'), bien_phap_xu_ly: gt('d-bp') || null,
                    thoi_gian_dung_phut: so('d-tg') } });
                dongHopThoai(); bao('Đã đóng sự cố');
                if (MAN_HINH === 'ho-so-tb') veHoSo(); else taiBangSuCo();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== DANH MỤC PHỤ TÙNG =========================== */
async function mhPhuTung(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Kỹ thuật</div><h2>Danh mục phụ tùng</h2>
            <div class="phu">Khai báo phụ tùng và gắn với thiết bị hoặc từng cụm để tra cứu khi sửa chữa</div></div>
            <div id="nut-pt"></div></div>
        <div id="vung-bao"></div>
        <div class="thanh-loc">
            <input class="lon" id="pt-q" placeholder="Tìm mã, tên, part number, hãng sản xuất…">
            <button onclick="taiBangPhuTung()">Tìm</button></div>
        <div class="the"><div id="bang-pt" class="bao-bang">Đang tải…</div></div>`;

    if (!window.QUYEN) window.QUYEN = (await api('/quyen-cua-toi')).quyen;
    if (coQ('PHU_TUNG_SUA')) {
        document.getElementById('nut-pt').innerHTML =
            `<button class="chinh-nut" onclick="formPhuTung()">Thêm phụ tùng</button>`;
    }
    document.getElementById('pt-q').onkeydown = e => { if (e.key === 'Enter') taiBangPhuTung(); };
    taiBangPhuTung();
}

async function taiBangPhuTung() {
    const q = gt('pt-q');
    const ds = await api('/ky-thuat/phu-tung' + (q ? '?q=' + encodeURIComponent(q) : ''));
    const el = document.getElementById('bang-pt');
    el.innerHTML = ds.length ? `<table><thead><tr>
        <th>Mã</th><th>Tên phụ tùng</th><th>Part No.</th><th>Hãng SX</th>
        <th>Quy cách</th><th>ĐVT</th><th class="phai">Giá tham khảo</th>
        ${coQ('PHU_TUNG_SUA') ? '<th></th>' : ''}</tr></thead>
        <tbody>${ds.map(p => `<tr>
            <td class="ma">${esc(p.ma || p.ma_phu_tung || '')}</td>
            <td>${esc(p.ten)}</td>
            <td class="ma">${esc(p.part_number || '')}</td>
            <td>${esc(p.hang_sx || '')}</td>
            <td>${esc(p.quy_cach || '')}</td>
            <td>${esc(p.dvt || '')}</td>
            <td class="phai so">${tien(p.gia_tham_khao || p.don_gia)}</td>
            ${coQ('PHU_TUNG_SUA') ? `<td class="phai">
                <button class="nho" onclick='formPhuTung(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Sửa</button></td>` : ''}
        </tr>`).join('')}</tbody></table>`
        : `<div class="trong">Chưa có phụ tùng nào.
            ${coQ('PHU_TUNG_SUA') ? 'Thêm phụ tùng để gắn với thiết bị và cụm chi tiết.' : ''}</div>`;
}

function formPhuTung(p = null) {
    moHopThoai(p ? 'Sửa phụ tùng' : 'Thêm phụ tùng', `
        <div class="hang">
            <div class="o-nhap" style="flex:0 0 150px"><label>Mã</label>
                <input id="p-ma" value="${esc(p?.ma || '')}" placeholder="tự sinh"></div>
            <div class="o-nhap"><label>Tên phụ tùng *</label>
                <input id="p-ten" value="${esc(p?.ten || '')}" placeholder="Vòng bi 22218"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Part number</label><input id="p-pn" value="${esc(p?.part_number || '')}"></div>
            <div class="o-nhap"><label>Hãng sản xuất</label><input id="p-hang" value="${esc(p?.hang_sx || '')}"></div>
        </div>
        <div class="o-nhap"><label>Quy cách</label><input id="p-qc" value="${esc(p?.quy_cach || '')}"></div>
        <div class="hang">
            <div class="o-nhap"><label>ĐVT</label><input id="p-dvt" value="${esc(p?.dvt || 'Cái')}"></div>
            <div class="o-nhap"><label>Giá tham khảo (đ)</label>
                <input id="p-gia" value="${p?.gia_tham_khao || p?.don_gia || ''}"></div>
        </div>
        <div class="o-nhap"><label>Ghi chú</label><input id="p-gc" value="${esc(p?.ghi_chu || '')}"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: p ? 'Lưu' : 'Thêm', lop: 'chinh-nut', chay: async () => {
            const body = { ma: gt('p-ma') || null, ten: gt('p-ten'), part_number: gt('p-pn') || null,
                hang_sx: gt('p-hang') || null, quy_cach: gt('p-qc') || null, dvt: gt('p-dvt'),
                gia_tham_khao: so('p-gia') ?? 0, ghi_chu: gt('p-gc') || null };
            if (!body.ten) return baoTrongHopThoai('Nhập tên phụ tùng');
            try {
                if (p) await api('/ky-thuat/phu-tung/' + p.id, { method: 'PUT', body });
                else await api('/ky-thuat/phu-tung', { method: 'POST', body });
                dongHopThoai(); taiBangPhuTung(); bao('Đã lưu phụ tùng');
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}
