/* =====================================================================
   NCVT QUÝ — NHU CẦU VẬT TƯ THEO QUÝ
   Ba màn hình: danh sách kỳ, danh sách vật tư của kỳ, chi tiết một vật tư.
   ===================================================================== */

const TT_KY = { nhap: 'Nháp', da_nhap: 'Đã nhập dữ liệu', dang_ap_dung: 'Đang áp dụng',
                da_dong: 'Đã đóng', huy: 'Đã hủy' };
const TT_CAP = { chua_cap: 'Chưa lấy', con_hang: 'Còn hàng', sap_het: 'Sắp hết',
                 da_cap_het: 'Đã cấp hết', khong_co_ke_hoach: 'Không có KH' };

function nhanTTKy(k) {
    const lop = { nhap: 'tt-nhap', da_nhap: 'tt-da_nhap', dang_ap_dung: 'tt-da_duyet',
                  da_dong: 'tt-du_phong', huy: 'tt-qua_han' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${TT_KY[k] || k}</span>`;
}
function nhanTTCap(k) {
    const lop = { chua_cap: 'tt-nhap', con_hang: 'tt-da_duyet', sap_het: 'tt-cho_duyet',
                  da_cap_het: 'tt-qua_han' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${TT_CAP[k] || k}</span>`;
}

let NCVT = { kyId: null, ky: null, loc: { q: '', cong_trinh: '', trang_thai_cap: '' }, lo: null };

/* =========================== MÀN HÌNH KỲ NCVT =========================== */
async function mhNCVT(el) {
    NCVT.kyId = null;
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Vật tư</div><h2>NCVT Quý</h2>
            <div class="phu">Nhu cầu vật tư theo quý: tải file, theo dõi số đã lấy và còn lại</div></div>
            <div id="nut-ncvt"></div></div>
        <div id="vung-bao"></div>
        <div id="noi-dung">Đang tải…</div>`;

    if (!window.QUYEN) window.QUYEN = (await api('/quyen-cua-toi')).quyen;
    if (!window.DS_PX) window.DS_PX = await api('/danh-muc/phan-xuong');

    if (coQ('NCVT_IMPORT')) {
        document.getElementById('nut-ncvt').innerHTML =
            `<button class="chinh-nut" onclick="formKyNCVT()">Lập kỳ NCVT</button>`;
    }
    taiDanhSachKy();
}

async function taiDanhSachKy() {
    const ds = await api('/ncvt/ky');
    const c = document.getElementById('noi-dung');
    if (!ds.length) {
        c.innerHTML = `<div class="the"><div class="than-the trong">
            Chưa có kỳ NCVT nào.<br><br>
            ${coQ('NCVT_IMPORT') ? 'Lập kỳ theo năm và quý, sau đó tải file NCVT lên.'
                                 : 'Chờ bộ phận vật tư lập kỳ và tải dữ liệu.'}
        </div></div>`;
        return;
    }
    c.innerHTML = `<div class="the"><h3>Các kỳ NCVT</h3><div class="bao-bang"><table>
        <thead><tr><th>Kỳ</th><th>Đơn vị</th><th class="phai">Mặt hàng</th>
            <th class="phai">Tổng nhu cầu</th><th class="phai">Đã cấp</th><th style="width:130px">Tiến độ</th>
            <th>Trạng thái</th><th>Người lập</th><th></th></tr></thead>
        <tbody>${ds.map(k => {
            const tl = k.tong_ke_hoach > 0 ? k.tong_da_cap / k.tong_ke_hoach * 100 : 0;
            return `<tr class="bam" onclick="moKyNCVT(${k.id})">
            <td><strong>Q${k.quy}/${k.nam}</strong>
                ${k.ten_ky ? `<div style="font-size:12px;color:var(--chu-nhat)">${esc(k.ten_ky)}</div>` : ''}</td>
            <td>${esc(k.px || 'Toàn công ty')}</td>
            <td class="phai so">${k.so_mat_hang}</td>
            <td class="phai so">${tien(k.tong_ke_hoach)}</td>
            <td class="phai so">${tien(k.tong_da_cap)}</td>
            <td><div style="height:12px;background:#EDEFF2;border-radius:2px;overflow:hidden">
                <div style="width:${Math.min(100, tl)}%;height:100%;background:var(--ho-phach)"></div></div>
                <div style="font-size:11px;color:var(--chu-nhat)">${tl.toFixed(0)}%</div></td>
            <td>${nhanTTKy(k.trang_thai)}</td>
            <td style="font-size:12.5px">${esc(k.nguoi_tao || '')}</td>
            <td class="phai"><button class="nho">Mở</button></td></tr>`; }).join('')}
        </tbody></table></div></div>`;
}

function formKyNCVT() {
    const nam = new Date().getFullYear();
    const quy = Math.floor(new Date().getMonth() / 3) + 1;
    const pxs = (window.DS_PX || []).filter(p => p.hoat_dong);
    const laPX = window.PHIEN.vai_tro === 'px';

    moHopThoai('Lập kỳ NCVT', `
        <div class="hang">
            <div class="o-nhap"><label>Năm *</label><input id="k-nam" value="${nam}"></div>
            <div class="o-nhap"><label>Quý *</label><select id="k-quy">
                ${[1, 2, 3, 4].map(q => `<option value="${q}" ${q === quy ? 'selected' : ''}>Quý ${q}</option>`).join('')}
            </select></div>
        </div>
        ${laPX ? '' : `<div class="o-nhap"><label>Đơn vị</label><select id="k-px">
            <option value="">Toàn công ty</option>
            ${pxs.map(p => `<option value="${p.id}">${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}
        </select></div>`}
        <div class="o-nhap"><label>Tên kỳ</label>
            <input id="k-ten" placeholder="để trống sẽ tự đặt, ví dụ NCVT Q3/${nam}"></div>
        <div class="o-nhap"><label>Ghi chú</label><input id="k-gc"></div>
        <div class="ghi-nho">Sau khi lập kỳ, tải file NCVT lên rồi kích hoạt.
            Chỉ kỳ đang áp dụng mới cho lấy vật tư.</div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Lập kỳ', lop: 'chinh-nut', chay: async () => {
            try {
                const kq = await api('/ncvt/ky', { method: 'POST', body: {
                    nam: so('k-nam'), quy: Number(gt('k-quy')),
                    phan_xuong_id: document.getElementById('k-px')?.value || null,
                    ten_ky: gt('k-ten') || null, ghi_chu: gt('k-gc') || null } });
                dongHopThoai(); bao('Đã lập kỳ NCVT'); moKyNCVT(kq.id);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== VẬT TƯ TRONG KỲ =========================== */
async function moKyNCVT(kyId) {
    NCVT.kyId = kyId;
    NCVT.loc = { q: '', cong_trinh: '', trang_thai_cap: '' };
    MAN_HINH = 'ncvt';
    const el = document.getElementById('chinh');
    const d = await api('/ncvt/ky/' + kyId);
    NCVT.ky = d.ky;
    const k = d.ky;
    const t = d.thong_ke.tong;

    const o = (n, v, g = '', lop = '') => `<div class="o-so ${lop}"><div class="nhan">${n}</div>
        <div class="gt">${v}</div><div class="ghi">${g || '&nbsp;'}</div></div>`;

    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">NCVT Quý</div><h2>Quý ${k.quy} năm ${k.nam}</h2>
            <div class="phu">${esc(k.px || 'Toàn công ty')} · ${TT_KY[k.trang_thai]}</div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="nut-ky"></div></div>
        <div id="vung-bao"></div>

        <div class="luoi-so">
            ${o('Mặt hàng', t.so_mat_hang)}
            ${o('Tổng nhu cầu', tien(t.tong_nhu_cau))}
            ${o('Đã cấp', tien(t.tong_da_cap),
                t.tong_nhu_cau > 0 ? (t.tong_da_cap / t.tong_nhu_cau * 100).toFixed(0) + '%' : '')}
            ${o('Còn lại', tien(t.tong_con_lai), '', 'tot')}
        </div>
        <div class="luoi-so">
            ${o('Đã cấp hết', t.da_cap_het, 'mặt hàng', t.da_cap_het ? 'canh-bao' : '')}
            ${o('Chưa lấy lần nào', t.chua_cap, 'mặt hàng')}
            ${o('Còn dưới 10%', t.sap_het, 'mặt hàng', t.sap_het ? 'canh-bao' : '')}
            ${o('Giá trị đã cấp', tien(t.gia_tri_da_cap), 'đồng')}
        </div>

        ${d.lo_import.length ? `<div class="the"><h3>File NCVT gốc</h3><div class="bao-bang"><table>
            <thead><tr><th>Tên file</th><th>Người tải</th><th>Thời điểm</th>
                <th class="phai">Dòng</th><th class="phai">Hợp lệ</th><th class="phai">Lỗi</th>
                <th class="phai">Đã nhập</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>${d.lo_import.map(l => `<tr>
                <td>${esc(l.ten_file)}</td><td>${esc(l.nguoi_tai || '')}</td>
                <td style="font-size:12px">${esc(l.ngay_tai)}</td>
                <td class="phai so">${l.tong_dong}</td><td class="phai so">${l.so_hop_le}</td>
                <td class="phai so ${l.so_loi ? 'loi-o' : ''}">${l.so_loi || ''}</td>
                <td class="phai so">${l.so_da_nhap || ''}</td>
                <td>${nhanTT(l.trang_thai)}</td>
                <td class="phai">${l.trang_thai !== 'da_nhap' && coQ('NCVT_IMPORT')
                    ? `<button class="nho" onclick="tiepTucLoNCVT(${l.id})">Tiếp tục</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div></div>` : ''}

        <div class="thanh-loc">
            <input class="lon" id="n-q" placeholder="Tìm mã, tên vật tư, quy cách…">
            <select id="n-tt"><option value="">Mọi trạng thái</option>
                ${Object.entries(TT_CAP).filter(([k2]) => k2 !== 'khong_co_ke_hoach')
                    .map(([k2, v]) => `<option value="${k2}">${v}</option>`).join('')}
            </select>
            <button onclick="locVatTuNCVT()">Lọc</button>
            <button onclick="dieuHuong('ncvt')">Về danh sách kỳ</button>
        </div>
        <div class="the"><div id="bang-ncvt" class="bao-bang">Đang tải…</div></div>`;

    const nut = [];
    if (coQ('NCVT_IMPORT') && k.trang_thai !== 'da_dong') {
        nut.push(`<button class="chinh-nut" onclick="formTaiNCVT()">Tải file NCVT</button>`);
    }
    if (coQ('NCVT_QUAN_LY')) {
        if (['nhap', 'da_nhap'].includes(k.trang_thai)) {
            nut.push(`<button class="nhan-manh" onclick="kichHoatKy()">Kích hoạt kỳ</button>`);
        }
        if (k.trang_thai === 'dang_ap_dung') {
            nut.push(`<button class="nguy-hiem" onclick="dongKy()">Đóng quý</button>`);
        }
    }
    document.getElementById('nut-ky').innerHTML = nut.join('');
    document.getElementById('n-tt').onchange = locVatTuNCVT;
    document.getElementById('n-q').onkeydown = e => { if (e.key === 'Enter') locVatTuNCVT(); };
    taiBangNCVT();
}

function locVatTuNCVT() {
    NCVT.loc.q = gt('n-q');
    NCVT.loc.trang_thai_cap = gt('n-tt');
    taiBangNCVT();
}

async function taiBangNCVT() {
    const c = document.getElementById('bang-ncvt');
    if (!c) return;
    const q = new URLSearchParams({ ky_id: NCVT.kyId });
    if (NCVT.loc.q) q.set('q', NCVT.loc.q);
    if (NCVT.loc.trang_thai_cap) q.set('trang_thai_cap', NCVT.loc.trang_thai_cap);
    const ds = await api('/ncvt/vat-tu?' + q);

    if (!ds.length) {
        c.innerHTML = `<div class="trong">Chưa có vật tư nào trong kỳ này.
            ${coQ('NCVT_IMPORT') ? 'Tải file NCVT lên để bắt đầu.' : ''}</div>`;
        return;
    }
    const dangApDung = NCVT.ky.trang_thai === 'dang_ap_dung';

    c.innerHTML = `<table><thead><tr>
        <th class="phai" style="width:44px">STT</th><th>Mã vật tư</th><th>Tên vật tư</th>
        <th>Quy cách</th><th>ĐVT</th><th class="phai">NCVT Quý</th><th class="phai">Đã lấy</th>
        <th class="phai">Còn lại</th><th>Công trình</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${ds.map((x, i) => `<tr>
            <td class="phai so">${i + 1}</td>
            <td class="ma">${esc(x.ma_vat_tu || '')}</td>
            <td style="cursor:pointer" onclick="xemVatTuNCVT(${x.id})"><strong>${esc(x.ten_vat_tu)}</strong>
                ${x.so_lan_cap ? `<div style="font-size:11.5px;color:var(--chu-mo)">${x.so_lan_cap} lần lấy</div>` : ''}</td>
            <td>${esc(x.quy_cach || '')}</td>
            <td>${esc(x.dvt || '')}</td>
            <td class="phai so">${tien(x.so_luong_kh)}</td>
            <td class="phai so">${x.so_luong_da_cap ? tien(x.so_luong_da_cap) : ''}</td>
            <td class="phai so"><strong class="${x.so_luong_con_lai <= 0 ? 'loi-o'
                : x.trang_thai_cap === 'sap_het' ? 'canh-bao-o' : ''}">
                ${x.so_luong_con_lai <= 0 ? 'Đã cấp hết' : tien(x.so_luong_con_lai)}</strong></td>
            <td style="font-size:12.5px">${esc(x.cong_trinh || '')}</td>
            <td>${nhanTTCap(x.trang_thai_cap)}</td>
            <td class="phai" style="white-space:nowrap">
                <button class="nho" onclick="xemVatTuNCVT(${x.id})">Xem</button>
                ${dangApDung && coQ('NCVT_CAP') && x.so_luong_con_lai > 0
                    ? `<button class="nho nhan-manh" onclick='formLayVatTu(${JSON.stringify(x).replace(/'/g, "&#39;")})'>Lấy</button>`
                    : ''}</td>
        </tr>`).join('')}</tbody></table>`;
}

/* ---------- Kích hoạt / đóng kỳ ---------- */
async function kichHoatKy() {
    if (!confirm('Kích hoạt kỳ NCVT này? Sau khi kích hoạt, chủ nhiệm công trình có thể lấy vật tư.')) return;
    try {
        const kq = await api(`/ncvt/ky/${NCVT.kyId}/kich-hoat`, { method: 'POST' });
        bao(`Đã kích hoạt kỳ với ${kq.so_mat_hang} mặt hàng`);
        moKyNCVT(NCVT.kyId);
    } catch (e) { bao(e.message, 'loi'); }
}

function dongKy() {
    moHopThoai('Đóng quý NCVT', `
        <div class="bao nhac">Sau khi đóng, không lấy thêm vật tư và không hủy giao dịch được nữa.
        Dữ liệu vẫn xem và đối chiếu được bình thường.</div>
        <div class="o-nhap"><label>Lý do / ghi chú</label>
            <textarea id="dk-lydo" rows="2" placeholder="Ví dụ: kết thúc quý III/2026"></textarea></div>`,
        [{ ten: 'Không đóng', chay: dongHopThoai },
         { ten: 'Đóng quý', lop: 'nguy-hiem', chay: async () => {
            try {
                await api(`/ncvt/ky/${NCVT.kyId}/dong`, { method: 'POST', body: { ly_do: gt('dk-lydo') } });
                dongHopThoai(); bao('Đã đóng quý', 'nhac'); moKyNCVT(NCVT.kyId);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== LẤY VẬT TƯ =========================== */
function formLayVatTu(x) {
    const pxs = (window.DS_PX || []).filter(p => p.hoat_dong);
    const laPX = window.PHIEN.vai_tro === 'px';

    moHopThoai('Lấy vật tư theo NCVT', `
        <div class="the" style="margin-bottom:14px"><div class="than-the"><table>
            <tr><td style="color:var(--chu-nhat);width:130px">Mã vật tư</td>
                <td class="ma">${esc(x.ma_vat_tu || '—')}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Tên vật tư</td>
                <td><strong>${esc(x.ten_vat_tu)}</strong></td></tr>
            ${x.quy_cach ? `<tr><td style="color:var(--chu-nhat)">Quy cách</td><td>${esc(x.quy_cach)}</td></tr>` : ''}
            <tr><td style="color:var(--chu-nhat)">NCVT Quý</td>
                <td class="so">${tien(x.so_luong_kh)} ${esc(x.dvt || '')}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Đã lấy trước đó</td>
                <td class="so">${tien(x.so_luong_da_cap) || 0} ${esc(x.dvt || '')}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Còn lại</td>
                <td class="so"><strong style="color:var(--luc);font-size:15px">
                    ${tien(x.so_luong_con_lai)} ${esc(x.dvt || '')}</strong></td></tr>
        </table></div></div>

        <div class="hang">
            <div class="o-nhap"><label>Số lượng lấy lần này * (tối đa ${tien(x.so_luong_con_lai)})</label>
                <input id="l-sl" inputmode="decimal" placeholder="0"></div>
            <div class="o-nhap"><label>Ngày lấy</label>
                <input id="l-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <div class="hang">
            ${laPX ? '' : `<div class="o-nhap"><label>Phân xưởng nhận</label><select id="l-px">
                ${pxs.map(p => `<option value="${p.id}" ${p.id === x.phan_xuong_id ? 'selected' : ''}>
                    ${esc(p.ten_ngan || p.ma)}</option>`).join('')}
            </select></div>`}
            <div class="o-nhap"><label>Công trình</label>
                <input id="l-ct" value="${esc(x.cong_trinh || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Chủ nhiệm công trình</label>
                <input id="l-cn" value="${esc(window.PHIEN.ho_ten || '')}"></div>
            <div class="o-nhap"><label>Người nhận</label><input id="l-nn"></div>
        </div>
        <div class="o-nhap"><label>Nội dung sử dụng</label>
            <textarea id="l-nd" rows="2" placeholder="Ví dụ: thay xích máng cào SGB-620 lò XV mức -50"></textarea></div>
        <div class="o-nhap"><label>Ghi chú</label><input id="l-gc"></div>
        <div class="ghi-nho">Số còn lại do hệ thống tính lại tại thời điểm xác nhận.
            Nếu người khác vừa lấy trước, hệ thống sẽ báo và không cho cấp vượt.</div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Xác nhận lấy', lop: 'nhan-manh', chay: async () => {
            const sl = so('l-sl');
            if (!(sl > 0)) return baoTrongHopThoai('Nhập số lượng lớn hơn 0');
            if (sl > x.so_luong_con_lai) {
                return baoTrongHopThoai(`Số lượng lấy vượt quá số lượng NCVT còn lại (${x.so_luong_con_lai} ${x.dvt || ''}).`);
            }
            try {
                const kq = await api(`/ncvt/vat-tu/${x.id}/lay`, { method: 'POST', body: {
                    so_luong: sl, ngay_cap: gt('l-ngay'),
                    phan_xuong_id: document.getElementById('l-px')?.value || null,
                    cong_trinh: gt('l-ct') || null, chu_nhiem: gt('l-cn') || null,
                    nguoi_nhan: gt('l-nn') || null, noi_dung_su_dung: gt('l-nd') || null,
                    ghi_chu: gt('l-gc') || null } });
                dongHopThoai();
                bao(`${kq.ma_phieu}: đã lấy ${tien(sl)} ${kq.dvt || ''} — còn lại ${tien(kq.con_lai)}`);
                taiBangNCVT();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

/* =========================== CHI TIẾT VẬT TƯ =========================== */
async function xemVatTuNCVT(id) {
    const d = await api('/ncvt/vat-tu/' + id);
    const x = d.chi_tiet;
    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:140px">${n}</td>
        <td>${esc(v)}</td></tr>` : '';

    let h = `<div class="bien-ten">
        <div><div class="ma-lon">${esc(x.ma_vat_tu || '—')}</div>
            <div class="ten-may">${esc(x.ten_vat_tu)}</div>
            <div class="duoi">Q${x.quy}/${x.nam}${x.px ? ' · ' + esc(x.px) : ''}${
                x.cong_trinh ? ' · ' + esc(x.cong_trinh) : ''}</div></div>
        <div class="cot-phai"><div>Còn lại</div>
            <div class="gt" style="font-size:19px">${tien(x.so_luong_con_lai)} ${esc(x.dvt || '')}</div></div>
    </div>

    <div class="luoi-so">
        <div class="o-so"><div class="nhan">NCVT Quý</div>
            <div class="gt">${tien(x.so_luong_kh)}</div><div class="ghi">${esc(x.dvt || '')}</div></div>
        <div class="o-so canh-bao"><div class="nhan">Đã lấy</div>
            <div class="gt">${tien(x.so_luong_da_cap) || 0}</div>
            <div class="ghi">${x.ty_le_da_cap}% nhu cầu</div></div>
        <div class="o-so tot"><div class="nhan">Còn lại</div>
            <div class="gt">${tien(x.so_luong_con_lai)}</div><div class="ghi">${esc(x.dvt || '')}</div></div>
    </div>

    <div class="the"><h3>Thông tin NCVT</h3><div class="than-the"><table>
        ${hang('Quy cách', x.quy_cach)}
        ${hang('Đơn vị tính', x.dvt)}
        ${hang('Đơn giá', tien(x.don_gia) ? tien(x.don_gia) + ' đ' : '')}
        ${hang('Phân xưởng', x.ten_px)}
        ${hang('Công trình', x.cong_trinh)}
        ${hang('Ghi chú', x.ghi_chu)}
        <tr><td style="color:var(--chu-nhat)">Trạng thái</td><td>${nhanTTCap(x.trang_thai_cap)}</td></tr>
    </table></div></div>`;

    /* Đối chiếu với file gốc */
    if (d.file_nguon || d.dong_goc) {
        h += `<div class="the"><h3>Đối chiếu file NCVT gốc</h3><div class="than-the">
            ${d.file_nguon ? `<div class="bao tin">File nguồn: <strong>${esc(d.file_nguon.ten_file)}</strong>
                — tải lên ${esc(d.file_nguon.ngay_tai)}${x.dong_goc ? `, dòng ${x.dong_goc} trong Excel` : ''}.</div>` : ''}
            ${d.dong_goc ? `<table>${Object.entries(d.dong_goc).filter(([, v]) => v !== null && v !== '')
                .map(([k, v]) => `<tr><td style="color:var(--chu-nhat);width:180px">${esc(k)}</td>
                    <td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
            <div class="bao ${d.khop_so_lieu ? 'tot' : 'loi'}" style="margin-top:10px">
                ${d.khop_so_lieu
                    ? `Số liệu khớp: tổng cấp phát ghi nhận ${tien(x.tong_cap_thuc_te)} ${esc(x.dvt || '')} đúng bằng số đã lấy.`
                    : `Lệch số liệu: sổ ghi ${tien(x.so_luong_da_cap)} nhưng tổng giao dịch là ${tien(x.tong_cap_thuc_te)}. Cần kiểm tra.`}</div>
        </div></div>`;
    }

    /* Lịch sử lấy */
    h += `<div class="the"><h3>Lịch sử lấy vật tư</h3><div class="bao-bang"><table>
        <thead><tr><th>Mã phiếu</th><th>Ngày</th><th>Công trình</th><th>PX</th>
            <th>Người lấy</th><th class="phai">SL lấy</th><th>Người nhận</th>
            <th>Nội dung sử dụng</th><th></th></tr></thead>
        <tbody>${d.lich_su.length ? d.lich_su.map(l => `<tr
            style="${l.trang_thai === 'da_huy' ? 'opacity:.55;text-decoration:line-through' : ''}">
            <td class="ma">${esc(l.ma_phieu)}</td>
            <td>${ngay(l.ngay_cap)}</td>
            <td style="font-size:12.5px">${esc(l.cong_trinh || '')}</td>
            <td>${esc(l.px || '')}</td>
            <td style="font-size:12.5px">${esc(l.chu_nhiem || l.nguoi_cap || '')}</td>
            <td class="phai so"><strong>${tien(l.so_luong)}</strong></td>
            <td style="font-size:12.5px">${esc(l.nguoi_nhan || '')}</td>
            <td style="font-size:12.5px">${esc(l.noi_dung_su_dung || '')}
                ${l.trang_thai === 'da_huy'
                    ? `<div class="loi-o">Đã hủy: ${esc(l.ly_do_huy || '')}</div>` : ''}</td>
            <td class="phai">${l.trang_thai === 'hieu_luc' && coQ('NCVT_HUY_CAP')
                ? `<button class="nho nguy-hiem" onclick="huyCapPhat(${l.id},${x.id})">Hủy</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="9" class="trong">Chưa lấy lần nào.</td></tr>'}
        </tbody></table></div></div>`;

    const nut = [];
    if (x.trang_thai_ky === 'dang_ap_dung' && coQ('NCVT_CAP') && x.so_luong_con_lai > 0) {
        nut.push({ ten: 'Lấy vật tư', lop: 'nhan-manh',
                   chay: () => { dongHopThoai(); formLayVatTu(x); } });
    }
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai('Chi tiết vật tư NCVT', h, nut, true);
}

function huyCapPhat(id, ctId) {
    moHopThoai('Hủy giao dịch cấp phát', `
        <div class="bao nhac">Giao dịch không bị xóa. Hệ thống đánh dấu đã hủy, hoàn lại số lượng
        vào phần còn lại và giữ nguyên bản ghi để truy vết.</div>
        <div class="o-nhap"><label>Lý do hủy *</label>
            <textarea id="h-lydo" rows="2" placeholder="Ví dụ: ghi nhầm số lượng"></textarea></div>`,
        [{ ten: 'Không hủy', chay: () => xemVatTuNCVT(ctId) },
         { ten: 'Hủy giao dịch', lop: 'nguy-hiem', chay: async () => {
            if (!gt('h-lydo')) return baoTrongHopThoai('Phải nhập lý do hủy');
            try {
                const kq = await api(`/ncvt/cap-phat/${id}/huy`, { method: 'POST',
                    body: { ly_do: gt('h-lydo') } });
                dongHopThoai(); bao(`Đã hủy, hoàn lại số lượng — còn ${tien(kq.con_lai)}`, 'nhac');
                taiBangNCVT();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== IMPORT FILE NCVT =========================== */
const TRUONG_NCVT = [
    { k: 'ten_vat_tu', n: 'Tên vật tư', bat_buoc: true },
    { k: 'so_luong_kh', n: 'Số lượng NCVT', bat_buoc: true },
    { k: 'ma_vat_tu', n: 'Mã vật tư' },
    { k: 'quy_cach', n: 'Quy cách / thông số' },
    { k: 'dvt', n: 'Đơn vị tính' },
    { k: 'don_gia', n: 'Đơn giá' },
    { k: 'cong_trinh', n: 'Công trình' },
    { k: 'ghi_chu', n: 'Ghi chú' }
];

function formTaiNCVT() {
    moHopThoai('Tải file NCVT Quý', `
        <div class="bao tin">Không cần sửa file theo mẫu. Hệ thống tự dò dòng tiêu đề
        và đoán cột, bạn chỉ đối chiếu lại ở bước sau.</div>
        <div class="o-nhap"><label>File NCVT (.xlsx, .xls, .csv)</label>
            <input type="file" id="nf-file" accept=".xlsx,.xls,.xlsm,.csv"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Tải lên', lop: 'chinh-nut', chay: async () => {
            const f = document.getElementById('nf-file').files[0];
            if (!f) return baoTrongHopThoai('Chọn file');
            const fd = new FormData();
            fd.append('file', f);
            try {
                const d = await api(`/ncvt/ky/${NCVT.kyId}/tai-len`, { method: 'POST', body: fd });
                NCVT.lo = { id: d.lo_id, ten_file: f.name, ...d };
                dongHopThoai(); manHinhAnhXaNCVT();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function tiepTucLoNCVT(loId) {
    try {
        const d = await api(`/ncvt/lo/${loId}/phan-tich`);
        NCVT.lo = { id: loId, ...d };
        manHinhAnhXaNCVT();
    } catch (e) { bao(e.message, 'loi'); }
}

function manHinhAnhXaNCVT() {
    const L = NCVT.lo;
    const ax = L.anh_xa_goi_y || {};
    const chon = (k) => `<select id="nx-${k}">
        <option value="">— không dùng —</option>
        ${L.cot.map(c => `<option value="${c.chi_so}"
            ${String(ax[k]) === String(c.chi_so) ? 'selected' : ''}>${esc(c.ten)}</option>`).join('')}
    </select>`;

    const el = document.getElementById('chinh');
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">NCVT Quý</div><h2>Ghép cột file NCVT</h2>
            <div class="phu">${esc(L.ten_file || '')} · ${L.tong_dong_du_lieu} dòng dữ liệu</div></div></div>
        <div id="vung-bao"></div>

        <div class="the"><div class="than-the">
            <div class="hang">
                <div class="o-nhap"><label>Sheet</label><select id="nx-sheet" onchange="doiSheetNCVT()">
                    ${L.sheets.map(s => `<option ${s === L.ten_sheet ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                </select></div>
                <div class="o-nhap"><label>Dòng tiêu đề trong Excel</label>
                    <input id="nx-dong" type="number" min="1" value="${L.dong_tieu_de + 1}"
                           onchange="doiSheetNCVT()"></div>
            </div>
        </div></div>

        <div class="the"><h3>Ghép cột</h3><div class="than-the">
            <div class="bao-bang"><table class="bang-anh-xa">
                <thead><tr><th style="width:220px">Trường dữ liệu</th><th>Cột trong file</th></tr></thead>
                <tbody>${TRUONG_NCVT.map(t => `<tr>
                    <td>${t.n}${t.bat_buoc ? ' <span style="color:var(--do)">*</span>' : ''}</td>
                    <td>${chon(t.k)}</td></tr>`).join('')}
                </tbody></table></div>
        </div></div>

        <div class="the"><h3>Xem trước dữ liệu</h3><div class="bao-bang">
            <table class="bang-xem-truoc">
            <thead><tr>${L.cot.map(c => `<th>${esc(c.ten)}</th>`).join('')}</tr></thead>
            <tbody>${L.du_lieu_mau.map(h => `<tr>${h.map(v =>
                `<td>${esc(v === null ? '' : v)}</td>`).join('')}</tr>`).join('')}
            </tbody></table></div></div>

        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button onclick="moKyNCVT(${NCVT.kyId})">Hủy</button>
            <button class="chinh-nut" onclick="chotAnhXaNCVT()">Kiểm tra dữ liệu</button>
        </div>`;
}

async function doiSheetNCVT() {
    try {
        const d = await api(`/ncvt/lo/${NCVT.lo.id}/phan-tich?sheet=${encodeURIComponent(gt('nx-sheet'))}` +
                            `&dong_tieu_de=${Number(gt('nx-dong')) - 1}`);
        NCVT.lo = { ...NCVT.lo, ...d };
        manHinhAnhXaNCVT();
    } catch (e) { bao(e.message, 'loi'); }
}

async function chotAnhXaNCVT() {
    const mapping = {};
    TRUONG_NCVT.forEach(t => { const v = gt('nx-' + t.k); if (v !== '') mapping[t.k] = Number(v); });
    if (mapping.ten_vat_tu === undefined) return bao('Phải chọn cột Tên vật tư', 'loi');
    if (mapping.so_luong_kh === undefined) return bao('Phải chọn cột Số lượng NCVT', 'loi');
    try {
        const kq = await api(`/ncvt/lo/${NCVT.lo.id}/anh-xa`, { method: 'POST', body: {
            mapping, ten_sheet: gt('nx-sheet'), dong_tieu_de: Number(gt('nx-dong')) - 1 } });
        NCVT.lo.ket_qua = kq;
        manHinhKiemTraNCVT();
    } catch (e) { bao(e.message, 'loi'); }
}

async function manHinhKiemTraNCVT(loc = 'tat_ca') {
    const kq = NCVT.lo.ket_qua;
    const dong = await api(`/ncvt/lo/${NCVT.lo.id}/dong${loc === 'tat_ca' ? '' : '?loc=' + loc}`);
    const soCB = (await api(`/ncvt/lo/${NCVT.lo.id}/dong?loc=canh_bao`)).length;

    const nut = (k, t, n) => `<button class="${loc === k ? 'chinh-nut' : ''}"
        onclick="manHinhKiemTraNCVT('${k}')">${t}${n !== undefined ? ` (${n})` : ''}</button>`;

    document.getElementById('chinh').innerHTML = `
        <div class="dau-trang"><div>
            <div class="eyebrow">NCVT Quý</div><h2>Kiểm tra trước khi nhập</h2></div></div>
        <div id="vung-bao"></div>
        <div class="luoi-so">
            <div class="o-so"><div class="nhan">Tổng dòng</div><div class="gt">${kq.tong}</div><div class="ghi">&nbsp;</div></div>
            <div class="o-so tot"><div class="nhan">Sẵn sàng nhập</div><div class="gt">${kq.hop_le}</div><div class="ghi">&nbsp;</div></div>
            <div class="o-so ${kq.loi ? 'nguy' : ''}"><div class="nhan">Có lỗi</div><div class="gt">${kq.loi}</div><div class="ghi">&nbsp;</div></div>
            <div class="o-so ${soCB ? 'canh-bao' : ''}"><div class="nhan">Cần lưu ý</div><div class="gt">${soCB}</div><div class="ghi">&nbsp;</div></div>
        </div>
        ${kq.loi ? `<div class="bao nhac">Dòng có lỗi sẽ không được nhập. Sửa trực tiếp ở bảng dưới rồi nhập lại.</div>` : ''}
        <div class="the">
            <div class="than-the" style="padding-bottom:8px;display:flex;gap:8px;flex-wrap:wrap">
                ${nut('tat_ca', 'Tất cả', kq.tong)}${nut('loi', 'Có lỗi', kq.loi)}
                ${nut('canh_bao', 'Cần lưu ý', soCB)}${nut('hop_le', 'Sẵn sàng', kq.hop_le)}
            </div>
            <div class="bao-bang"><table>
                <thead><tr><th class="phai">Dòng</th><th>Mã</th><th>Tên vật tư</th><th>Quy cách</th>
                    <th>ĐVT</th><th class="phai">Số lượng</th><th>Công trình</th><th>Ghi nhận</th><th></th></tr></thead>
                <tbody>${dong.length ? dong.map(d => `<tr>
                    <td class="phai so">${d.dong_goc}</td>
                    <td class="ma">${esc(d.ma_vat_tu || '')}</td>
                    <td>${esc(d.ten_vat_tu || '')}</td>
                    <td>${esc(d.quy_cach || '')}</td><td>${esc(d.dvt || '')}</td>
                    <td class="phai so">${d.so_luong_kh ?? ''}</td>
                    <td style="font-size:12.5px">${esc(d.cong_trinh || '')}</td>
                    <td>${d.loi ? `<div class="loi-o">${esc(d.loi)}</div>` : ''}
                        ${d.canh_bao ? `<div class="canh-bao-o">${esc(d.canh_bao)}</div>` : ''}
                        ${!d.loi && !d.canh_bao ? '<span class="nhan-tt tt-dat">Đủ</span>' : ''}</td>
                    <td class="phai"><button class="nho" onclick="suaDongNCVT(${d.id})">Sửa</button></td>
                </tr>`).join('') : '<tr><td colspan="9" class="trong">Không có dòng nào.</td></tr>'}
                </tbody></table></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button onclick="manHinhAnhXaNCVT()">Quay lại ghép cột</button>
            <button class="chinh-nut" ${kq.hop_le ? '' : 'disabled'} onclick="xacNhanNhapNCVT()">
                Nhập ${kq.hop_le} mặt hàng vào kỳ</button>
        </div>`;
}

async function suaDongNCVT(id) {
    const ds = await api(`/ncvt/lo/${NCVT.lo.id}/dong`);
    const d = ds.find(x => x.id === id);
    if (!d) return;
    moHopThoai(`Sửa dòng ${d.dong_goc}`, `
        ${d.loi ? `<div class="bao loi">${esc(d.loi)}</div>` : ''}
        <div class="hang">
            <div class="o-nhap" style="flex:0 0 140px"><label>Mã vật tư</label>
                <input id="sn-ma" value="${esc(d.ma_vat_tu || '')}"></div>
            <div class="o-nhap"><label>Tên vật tư *</label>
                <input id="sn-ten" value="${esc(d.ten_vat_tu || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Quy cách</label><input id="sn-qc" value="${esc(d.quy_cach || '')}"></div>
            <div class="o-nhap"><label>ĐVT</label><input id="sn-dvt" value="${esc(d.dvt || '')}"></div>
            <div class="o-nhap"><label>Số lượng *</label><input id="sn-sl" value="${d.so_luong_kh ?? ''}"></div>
        </div>
        <div class="o-nhap"><label>Công trình</label><input id="sn-ct" value="${esc(d.cong_trinh || '')}"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Lưu', lop: 'chinh-nut', chay: async () => {
            try {
                await api(`/ncvt/lo/${NCVT.lo.id}/dong/${id}`, { method: 'PUT', body: {
                    ma_vat_tu: gt('sn-ma') || null, ten_vat_tu: gt('sn-ten'),
                    quy_cach: gt('sn-qc') || null, dvt: gt('sn-dvt') || null,
                    so_luong_kh: so('sn-sl'), cong_trinh: gt('sn-ct') || null } });
                dongHopThoai();
                const los = await api('/ncvt/ky/' + NCVT.kyId);
                const l = los.lo_import.find(x => x.id === NCVT.lo.id);
                if (l) NCVT.lo.ket_qua = { tong: l.tong_dong, hop_le: l.so_hop_le, loi: l.so_loi };
                manHinhKiemTraNCVT();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function xacNhanNhapNCVT() {
    try {
        const kq = await api(`/ncvt/lo/${NCVT.lo.id}/xac-nhan`, { method: 'POST', body: {} });
        bao(`Đã nhập ${kq.da_nhap} mặt hàng vào kỳ NCVT`);
        moKyNCVT(NCVT.kyId);
    } catch (e) { bao(e.message, 'loi'); }
}
