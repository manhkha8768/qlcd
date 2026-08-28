/* =====================================================================
   MODULE GIAO DỊCH: Tăng / Giảm / Điều chuyển / Phê duyệt
   Dùng chung một bộ màn hình, khác nhau ở cấu hình theo loại.
   ===================================================================== */

const CAU_HINH_GD = {
    tang: {
        ten: 'Tăng tài sản', eyebrow: 'Chứng từ',
        mo_ta: 'Lập và quản lý giao dịch tăng TSCĐ, CCDC, vật tư và thiết bị',
        nut: 'Tạo phiếu tăng', don_vi_nhan: true,
        ly_do: { mua_moi: 'Mua mới', nhan_dieu_chuyen: 'Nhận điều chuyển', cap_moi: 'Cấp mới',
                 nhap_lai: 'Nhập lại', phat_hien_kiem_ke: 'Phát hiện sau kiểm kê',
                 dieu_chinh: 'Điều chỉnh số liệu', khac: 'Khác' }
    },
    giam: {
        ten: 'Giảm tài sản', eyebrow: 'Chứng từ',
        mo_ta: 'Thu hồi, thanh lý, xuất trả và các trường hợp giảm tài sản khác',
        nut: 'Tạo phiếu giảm', don_vi_nhan: false,
        ly_do: { thu_hoi: 'Thu hồi', thanh_ly: 'Thanh lý', hong: 'Hỏng', mat: 'Mất',
                 xuat_tra: 'Xuất trả', dieu_chinh: 'Điều chỉnh', chuyen_loai: 'Chuyển loại',
                 khac: 'Khác' }
    },
    dieu_chuyen: {
        ten: 'Điều chuyển tài sản — thiết bị', eyebrow: 'Chứng từ',
        mo_ta: 'Một phiếu thực hiện đồng thời giảm ở đơn vị đi và tăng ở đơn vị đến',
        nut: 'Tạo phiếu điều chuyển', don_vi_nhan: true, hai_don_vi: true,
        ly_do: { dieu_dong: 'Điều động sản xuất', dieu_hoa: 'Điều hòa thiết bị',
                 sua_chua: 'Đưa đi sửa chữa', tra_lai: 'Trả lại đơn vị', khac: 'Khác' }
    }
};

const TT_GD = { nhap: 'Nháp', cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt',
                tu_choi: 'Từ chối', huy: 'Hủy' };

function nhanTTGD(k) {
    const lop = { nhap: 'tt-nhap', cho_duyet: 'tt-cho_duyet', da_duyet: 'tt-da_duyet',
                  tu_choi: 'tt-qua_han', huy: 'tt-du_phong' }[k] || 'tt-nhap';
    return `<span class="nhan-tt ${lop}">${TT_GD[k] || k}</span>`;
}

let locGD = { loai: null, trang_thai: '', q: '' };

/* =========================== DANH SÁCH PHIẾU =========================== */
function taoManHinhGD(loai) {
    return async function (el) {
        const c = CAU_HINH_GD[loai];
        locGD = { loai, trang_thai: '', q: '' };

        el.innerHTML = `<div class="dau-trang"><div>
                <div class="eyebrow">${c.eyebrow}</div><h2>${c.ten}</h2>
                <div class="phu">${c.mo_ta}</div></div>
                <div><button class="chinh-nut" onclick="formGD('${loai}')">${c.nut}</button></div></div>
            <div id="vung-bao"></div>
            <div class="thanh-loc">
                <input class="lon" id="gd-q" placeholder="Tìm mã phiếu, số văn bản, tên tài sản…">
                <select id="gd-tt">
                    <option value="">Mọi trạng thái</option>
                    ${Object.entries(TT_GD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
                <button onclick="apDungLocGD()">Lọc</button></div>
            <div class="the"><div id="bang-gd" class="bao-bang">Đang tải…</div></div>`;

        document.getElementById('gd-tt').onchange = apDungLocGD;
        document.getElementById('gd-q').onkeydown = e => { if (e.key === 'Enter') apDungLocGD(); };
        await napChungGD();
        taiBangGD();
    };
}

function apDungLocGD() {
    locGD.trang_thai = gt('gd-tt');
    locGD.q = gt('gd-q');
    taiBangGD();
}

async function napChungGD() {
    window.DS_PX = await api('/danh-muc/phan-xuong');
    if (!window.DS_NHOM_CAP2) {
        const n = await api('/danh-muc/nhom-thiet-bi');
        window.DS_NHOM = n; window.DS_NHOM_CAP2 = n.filter(x => x.cap === 2);
    }
    window.DS_VITRI = await api('/danh-muc/vi-tri');
    if (!window.QUYEN) window.QUYEN = (await api('/quyen-cua-toi')).quyen;
}
const coQ = (m) => (window.QUYEN || []).includes(m);

async function taiBangGD() {
    const el = document.getElementById('bang-gd');
    if (!el) return;
    const c = CAU_HINH_GD[locGD.loai];
    const q = new URLSearchParams({ loai: locGD.loai });
    if (locGD.trang_thai) q.set('trang_thai', locGD.trang_thai);
    if (locGD.q) q.set('q', locGD.q);

    const ds = await api('/giao-dich?' + q);
    if (!ds.length) {
        el.innerHTML = `<div class="trong">Chưa có ${c.ten.toLowerCase()} nào.<br><br>
            <button class="chinh-nut" onclick="formGD('${locGD.loai}')">${c.nut}</button></div>`;
        return;
    }

    const cotDonVi = locGD.loai === 'dieu_chuyen'
        ? '<th>Đơn vị đi</th><th>Đơn vị đến</th>'
        : `<th>${locGD.loai === 'tang' ? 'Đơn vị nhận' : 'Đơn vị'}</th>`;

    el.innerHTML = `<table><thead><tr>
        <th>Mã phiếu</th><th>Ngày</th>${cotDonVi}
        <th class="phai">Số dòng</th><th class="phai">Tổng SL</th><th>Lý do</th>
        <th>Người lập</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${ds.map(g => `<tr class="bam" onclick="xemGD('${g.id}')">
            <td class="ma">${esc(g.ma_giao_dich)}
                ${g.so_tai_lieu ? `<div style="font-size:11px;color:var(--chu-mo)">${g.so_tai_lieu} tệp</div>` : ''}</td>
            <td>${ngay(g.ngay_giao_dich)}</td>
            ${locGD.loai === 'dieu_chuyen'
                ? `<td>${esc(g.don_vi_nguon || '')}</td><td>${esc(g.don_vi_dich || '')}</td>`
                : `<td>${esc(g.don_vi_dich || g.don_vi_nguon || '')}</td>`}
            <td class="phai so">${g.so_dong}</td>
            <td class="phai so">${g.tong_so_luong || ''}</td>
            <td style="max-width:220px;font-size:12.5px">${esc(c.ly_do[g.ma_ly_do] || g.ly_do || '')}</td>
            <td style="font-size:12.5px">${esc(g.nguoi_tao || g.tk_nguoi_tao || '')}</td>
            <td>${nhanTTGD(g.trang_thai)}</td>
            <td class="phai"><button class="nho">Mở</button></td>
        </tr>`).join('')}</tbody></table>`;
}

/* =========================== TẠO PHIẾU =========================== */
function formGD(loai) {
    const c = CAU_HINH_GD[loai];
    const pxs = (window.DS_PX || []).filter(p => p.hoat_dong);
    const laPX = window.PHIEN.vai_tro === 'px';

    const chonDonVi = (id, nhan) => `<div class="o-nhap"><label>${nhan} *</label>
        <select id="${id}"><option value="">— Chọn —</option>
        ${pxs.map(p => `<option value="${p.id}">${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}
        </select></div>`;

    moHopThoai(c.nut, `
        ${laPX ? `<div class="bao tin">Phiếu sẽ gắn với phân xưởng
            <strong>${esc(window.PHIEN.ten_px || window.PHIEN.px_ngan || '')}</strong>.</div>` : ''}
        <div class="hang">
            <div class="o-nhap"><label>Ngày giao dịch *</label>
                <input id="g-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="o-nhap"><label>${loai === 'tang' ? 'Nguồn tăng' : loai === 'giam' ? 'Nguyên nhân giảm' : 'Lý do điều chuyển'}</label>
                <select id="g-maly">${Object.entries(c.ly_do)
                    .map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        </div>
        ${laPX ? '' : (c.hai_don_vi
            ? `<div class="hang">${chonDonVi('g-nguon', 'Đơn vị đi')}${chonDonVi('g-dich', 'Đơn vị đến')}</div>`
            : (c.don_vi_nhan ? chonDonVi('g-dich', 'Đơn vị nhận') : chonDonVi('g-nguon', 'Đơn vị giảm')))}
        ${c.hai_don_vi && laPX ? chonDonVi('g-dich', 'Đơn vị đến') : ''}
        <div class="hang">
            <div class="o-nhap"><label>Số văn bản</label><input id="g-vb" placeholder="QĐ-45/XLM"></div>
            <div class="o-nhap"><label>Ngày văn bản</label><input id="g-ngayvb" type="date"></div>
        </div>
        ${c.hai_don_vi ? `<div class="hang">
            <div class="o-nhap"><label>Người giao</label><input id="g-giao"></div>
            <div class="o-nhap"><label>Người nhận</label><input id="g-nhan"></div></div>` : ''}
        <div class="o-nhap"><label>Lý do chi tiết *</label>
            <textarea id="g-lydo" rows="2" placeholder="Nêu rõ căn cứ và mục đích"></textarea></div>
        <div class="ghi-nho">Sau khi tạo, phiếu ở trạng thái Nháp. Số liệu tài sản chỉ thay đổi
            sau khi phiếu được duyệt.</div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Tạo phiếu', lop: 'chinh-nut', chay: async () => {
            const body = {
                loai_giao_dich: loai, ngay_giao_dich: gt('g-ngay'), ma_ly_do: gt('g-maly'),
                ly_do: gt('g-lydo'), so_van_ban: gt('g-vb') || null,
                ngay_van_ban: gt('g-ngayvb') || null,
                don_vi_nguon_id: document.getElementById('g-nguon')?.value || null,
                don_vi_dich_id: document.getElementById('g-dich')?.value || null,
                nguoi_giao: document.getElementById('g-giao')?.value || null,
                nguoi_nhan: document.getElementById('g-nhan')?.value || null
            };
            if (!body.ly_do) return baoTrongHopThoai('Nhập lý do');
            try {
                const kq = await api('/giao-dich', { method: 'POST', body });
                dongHopThoai(); bao('Đã tạo phiếu ' + kq.ma_giao_dich);
                taiBangGD(); xemGD(kq.id);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

/* =========================== CHI TIẾT PHIẾU =========================== */
async function xemGD(id) {
    const d = await api('/giao-dich/' + id);
    const g = d.giao_dich;
    const c = CAU_HINH_GD[g.loai_giao_dich] || CAU_HINH_GD.tang;
    const suaDuoc = ['nhap', 'tu_choi'].includes(g.trang_thai) && coQ('GD_SUA');
    const laDC = g.loai_giao_dich === 'dieu_chuyen';

    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:150px">${n}</td><td>${esc(v)}</td></tr>` : '';

    let h = `<div class="bien-ten">
        <div><div class="ma-lon">${esc(g.ma_giao_dich)}</div>
            <div class="ten-may">${c.ten}</div>
            <div class="duoi">${ngay(g.ngay_giao_dich)} · ${esc(c.ly_do[g.ma_ly_do] || '')}</div></div>
        <div class="cot-phai">
            ${laDC ? `<div>Từ</div><div class="gt">${esc(g.don_vi_nguon || '—')}</div>
                      <div style="margin-top:6px">Đến</div><div class="gt">${esc(g.don_vi_dich || '—')}</div>`
                   : `<div>Đơn vị</div><div class="gt">${esc(g.don_vi_dich || g.don_vi_nguon || '—')}</div>`}
        </div></div>`;

    if (g.trang_thai === 'tu_choi') {
        h += `<div class="bao loi"><strong>Phiếu bị từ chối.</strong> Lý do: ${esc(g.ly_do_tu_choi)}</div>`;
    }
    if (g.trang_thai === 'huy') {
        h += `<div class="bao nhac"><strong>Phiếu đã hủy.</strong> Lý do: ${esc(g.ly_do_huy)}</div>`;
    }
    if (g.trang_thai === 'cho_duyet') {
        h += `<div class="bao nhac">Đang chờ duyệt — không sửa được cho tới khi có kết quả.</div>`;
    }
    if (d.loi_kiem_tra?.length) {
        h += `<div class="bao loi">Chưa trình duyệt được:<ul style="margin:4px 0 0 18px">
            ${d.loi_kiem_tra.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }

    h += `<div class="the"><h3>Thông tin phiếu</h3><div class="than-the"><table>
        ${hang('Lý do', g.ly_do)}
        ${hang('Số văn bản', g.so_van_ban)}
        ${hang('Ngày văn bản', ngay(g.ngay_van_ban))}
        ${hang('Người giao', g.nguoi_giao)}
        ${hang('Người nhận', g.nguoi_nhan)}
        ${hang('Người lập', g.nguoi_tao)}
        ${hang('Người duyệt', g.nguoi_duyet)}
        ${hang('Ngày duyệt', g.ngay_duyet)}
        <tr><td style="color:var(--chu-nhat)">Trạng thái</td><td>${nhanTTGD(g.trang_thai)}
            ${g.duyet_vuot_quyen ? ' <span class="nhan-tt tt-cho_duyet">Tự duyệt</span>' : ''}</td></tr>
    </table></div></div>`;

    /* ---- Chi tiết ---- */
    h += `<div class="the"><h3>Chi tiết ${g.so_dong ? `(${g.so_dong} dòng)` : ''}</h3>
        <div class="bao-bang"><table><thead><tr>
            <th>Mã tài sản</th><th>Tên</th><th>Nhóm</th>
            <th class="phai">SL hiện hành</th><th class="phai">SL ${laDC ? 'chuyển' : g.loai_giao_dich === 'tang' ? 'tăng' : 'giảm'}</th>
            ${g.trang_thai === 'da_duyet' ? '<th class="phai">Sau GD</th>' : ''}
            ${laDC ? '<th>Vị trí đến</th>' : ''}<th></th></tr></thead>
        <tbody>${d.chi_tiet.length ? d.chi_tiet.map(ct => {
            const hienHanh = ct.la_tai_san_moi ? '—' : (ct.so_luong_hien_hanh ?? ct.so_luong_truoc);
            const thieu = !ct.la_tai_san_moi && ['giam', 'dieu_chuyen'].includes(g.loai_giao_dich)
                          && ct.so_luong > (ct.so_luong_hien_hanh ?? 0);
            return `<tr>
            <td class="ma">${esc(ct.ma_tb_snapshot || '')}
                ${ct.la_tai_san_moi ? '<span class="nhan-tt tt-da_nhap">Mới</span>' : ''}</td>
            <td>${esc(ct.ten_snapshot)}
                ${ct.ma_tscd_snapshot ? `<div style="font-size:11.5px;color:var(--chu-mo)">TS: ${esc(ct.ma_tscd_snapshot)}</div>` : ''}</td>
            <td style="font-size:12.5px"><span class="ma">${esc(ct.ma_nhom || '')}</span> ${esc(ct.ten_nhom || '')}</td>
            <td class="phai so ${thieu ? 'loi-o' : ''}">${hienHanh}</td>
            <td class="phai so"><strong>${ct.so_luong}</strong> ${esc(ct.dvt_snapshot || '')}</td>
            ${g.trang_thai === 'da_duyet'
                ? `<td class="phai so">${ct.so_luong_sau ?? ''}${ct.ma_tb_dich && laDC
                    ? `<div style="font-size:11px;color:var(--chu-mo)">→ ${esc(ct.ma_tb_dich)}</div>` : ''}</td>` : ''}
            ${laDC ? `<td style="font-size:12.5px">${esc(ct.vi_tri_dich || '')}</td>` : ''}
            <td class="phai">${suaDuoc
                ? `<button class="nho" onclick="suaDongGD('${g.id}','${ct.id}',${ct.so_luong})">Sửa</button>
                   <button class="nho nguy-hiem" onclick="xoaDongGD('${g.id}','${ct.id}')">Xóa</button>` : ''}</td>
        </tr>`; }).join('') : `<tr><td colspan="9" class="trong">Chưa có dòng nào. Bấm "Thêm tài sản" bên dưới.</td></tr>`}
        </tbody></table></div>
        ${suaDuoc ? `<div class="than-the" style="display:flex;gap:8px">
            <button onclick="themDongGD('${g.id}','${g.loai_giao_dich}')">Thêm tài sản</button>
            ${g.loai_giao_dich === 'tang'
                ? `<button onclick="themTaiSanMoiGD('${g.id}')">Khai tài sản mới</button>` : ''}
        </div>` : ''}
    </div>`;

    /* ---- Tài liệu ---- */
    h += `<div class="the"><h3>Hồ sơ đính kèm</h3>
        <div class="bao-bang"><table><thead><tr>
            <th>Tên tệp</th><th>Loại hồ sơ</th><th class="phai">Dung lượng</th>
            <th>Người tải</th><th></th></tr></thead>
        <tbody>${d.tai_lieu.length ? d.tai_lieu.map(t => `<tr>
            <td><a href="/api/giao-dich/${g.id}/tai-lieu/${t.id}/tai-ve"
                   style="color:var(--lam)">${esc(t.ten_file)}</a></td>
            <td style="font-size:12.5px">${LOAI_HO_SO[t.loai_ho_so] || t.loai_ho_so}</td>
            <td class="phai so">${(t.kich_thuoc / 1024).toFixed(0)} KB</td>
            <td style="font-size:12.5px">${esc(t.nguoi_tai || '')}</td>
            <td class="phai">${suaDuoc
                ? `<button class="nho nguy-hiem" onclick="xoaTaiLieuGD('${g.id}','${t.id}')">Xóa</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="trong">Chưa có hồ sơ đính kèm.</td></tr>'}
        </tbody></table></div>
        ${suaDuoc ? `<div class="than-the"><button onclick="formTaiLieuGD('${g.id}')">Đính kèm hồ sơ</button></div>` : ''}
    </div>`;

    /* ---- Lịch sử ---- */
    if (d.lich_su.length) {
        h += `<div class="the"><h3>Quá trình xử lý</h3><div class="bao-bang"><table>
            <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Thao tác</th><th>Lý do</th></tr></thead>
            <tbody>${d.lich_su.map(x => `<tr>
                <td style="font-size:12px">${esc(x.thoi_gian)}</td>
                <td>${esc(x.ho_ten || x.ten_dang_nhap || '')}</td>
                <td>${TEN_HANH_DONG[x.hanh_dong] || x.hanh_dong}</td>
                <td class="${x.hanh_dong === 'tu_choi' ? 'loi-o' : ''}">${esc(x.ly_do || '')}</td>
            </tr>`).join('')}</tbody></table></div></div>`;
    }

    /* ---- Nút thao tác ---- */
    const nut = [];
    if (['nhap', 'tu_choi'].includes(g.trang_thai)) {
        if (g.trang_thai === 'tu_choi' && coQ('GD_SUA')) {
            nut.push({ ten: 'Chỉnh sửa lại', chay: () => thaoTacGD(g.id, 'mo-lai', 'Đã mở lại phiếu để sửa') });
        }
        if (coQ('GD_TRINH') && !d.loi_kiem_tra?.length) {
            nut.push({ ten: 'Trình duyệt', lop: 'nhan-manh', chay: () => trinhDuyetGD(g.id) });
        }
        if (coQ('GD_HUY')) nut.push({ ten: 'Hủy phiếu', lop: 'nguy-hiem', chay: () => huyGD(g.id) });
    }
    if (g.trang_thai === 'cho_duyet' && coQ('GD_DUYET')) {
        nut.push({ ten: 'Từ chối', lop: 'nguy-hiem', chay: () => tuChoiGD(g.id) });
        nut.push({ ten: 'Duyệt', lop: 'nhan-manh', chay: () => xacNhanDuyetGD(g) });
    }
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai(`Phiếu ${g.ma_giao_dich}`, h, nut, true);
}

const LOAI_HO_SO = {
    bien_ban_giao_nhan: 'Biên bản giao nhận', bien_ban_dieu_chuyen: 'Biên bản điều chuyển',
    quyet_dinh: 'Quyết định', phieu_xuat: 'Phiếu xuất', phieu_nhap: 'Phiếu nhập', khac: 'Hồ sơ khác'
};
const TEN_HANH_DONG = {
    tao: 'Tạo phiếu', sua: 'Sửa', trinh_duyet: 'Trình duyệt', duyet: 'Duyệt',
    tu_choi: 'Từ chối', huy: 'Hủy', trinh_lai: 'Trình lại', mo_lai: 'Mở lại để sửa'
};

/* =========================== THÊM DÒNG =========================== */
async function themDongGD(gdId, loai) {
    const d = await api('/giao-dich/' + gdId);
    const g = d.giao_dich;
    const donVi = loai === 'tang' ? g.don_vi_dich_id : g.don_vi_nguon_id;
    const daCo = new Set(d.chi_tiet.map(x => x.thiet_bi_id));

    const ts = await api(`/thiet-bi?phan_xuong_id=${donVi}&moi_trang=500`);
    const ds = ts.danh_sach.filter(x => !daCo.has(x.id) &&
        (loai === 'tang' || (x.so_luong > 0 && x.trang_thai !== 'da_thanh_ly')));

    if (!ds.length) {
        return moHopThoai('Thêm tài sản', `<div class="bao nhac">Không còn tài sản nào phù hợp
            ở đơn vị này để đưa vào phiếu.</div>`, [{ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai }]);
    }

    const vts = (window.DS_VITRI || []).filter(v =>
        loai === 'dieu_chuyen' ? (!v.phan_xuong_id || v.phan_xuong_id === g.don_vi_dich_id) : true);

    moHopThoai('Thêm tài sản vào phiếu', `
        <div class="o-nhap"><label>Tài sản *</label>
            <select id="td-tb" onchange="capNhatSLHienHanh()">
                <option value="">— Chọn tài sản —</option>
                ${ds.map(x => `<option value="${x.id}" data-sl="${x.so_luong}" data-dvt="${esc(x.dvt || '')}">
                    ${esc(x.ma_tb)} — ${esc(x.ten)} (còn ${x.so_luong} ${esc(x.dvt || '')})</option>`).join('')}
            </select></div>
        <div id="td-sl-hien" class="ghi-nho"></div>
        <div class="hang">
            <div class="o-nhap"><label>Số lượng ${loai === 'tang' ? 'tăng' : loai === 'giam' ? 'giảm' : 'điều chuyển'} *</label>
                <input id="td-sl" value="1"></div>
            ${loai === 'dieu_chuyen' ? `<div class="o-nhap"><label>Vị trí lắp đặt tại đơn vị đến</label>
                <select id="td-vt"><option value="">— Chưa xác định —</option>
                ${vts.map(v => `<option value="${v.id}">${esc(v.ten)}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="o-nhap"><label>Ghi chú dòng</label><input id="td-gc"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Thêm vào phiếu', lop: 'chinh-nut', chay: async () => {
            if (!gt('td-tb')) return baoTrongHopThoai('Chọn tài sản');
            try {
                await api(`/giao-dich/${gdId}/chi-tiet`, { method: 'POST', body: {
                    thiet_bi_id: Number(gt('td-tb')), so_luong: so('td-sl'),
                    vi_tri_dich_id: document.getElementById('td-vt')?.value || null,
                    ghi_chu: gt('td-gc') || null } });
                dongHopThoai(); xemGD(gdId);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

function capNhatSLHienHanh() {
    const o = document.getElementById('td-tb').selectedOptions[0];
    const e = document.getElementById('td-sl-hien');
    if (!o?.value) { e.textContent = ''; return; }
    e.textContent = `Số lượng hiện hành: ${o.dataset.sl} ${o.dataset.dvt}`;
}

function themTaiSanMoiGD(gdId) {
    const nhom2 = window.DS_NHOM_CAP2 || [];
    moHopThoai('Khai tài sản mới trong phiếu', `
        <div class="bao tin">Tài sản chỉ được tạo chính thức khi phiếu được duyệt.</div>
        <div class="o-nhap"><label>Tên tài sản *</label><input id="tm-ten"></div>
        <div class="hang">
            <div class="o-nhap"><label>Nhóm thiết bị *</label><select id="tm-nhom">
                <option value="">— Chọn nhóm —</option>
                ${nhom2.map(n => `<option value="${n.id}">${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Loại</label><select id="tm-loai">
                <option value="TSCD">TSCĐ</option><option value="CCDC">CCDC</option></select></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Mã tài sản kế toán</label><input id="tm-tscd"></div>
            <div class="o-nhap"><label>Số seri</label><input id="tm-seri"></div>
            <div class="o-nhap"><label>Năm SX</label><input id="tm-nam"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số lượng *</label><input id="tm-sl" value="1"></div>
            <div class="o-nhap"><label>ĐVT</label><input id="tm-dvt" value="Cái"></div>
            <div class="o-nhap"><label>Nguyên giá (đ)</label><input id="tm-ng"></div>
        </div>
        <div class="o-nhap"><label>Ghi chú</label><input id="tm-gc"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Thêm vào phiếu', lop: 'chinh-nut', chay: async () => {
            if (!gt('tm-ten')) return baoTrongHopThoai('Nhập tên tài sản');
            if (!gt('tm-nhom')) return baoTrongHopThoai('Chọn nhóm thiết bị');
            try {
                await api(`/giao-dich/${gdId}/chi-tiet`, { method: 'POST', body: {
                    la_tai_san_moi: 1, so_luong: so('tm-sl') ?? 1,
                    tai_san_moi: {
                        ten: gt('tm-ten'), nhom_id: Number(gt('tm-nhom')), loai_ts: gt('tm-loai'),
                        ma_tscd: gt('tm-tscd') || null, so_seri: gt('tm-seri') || null,
                        nam_sx: so('tm-nam'), dvt: gt('tm-dvt'), nguyen_gia: so('tm-ng') ?? 0,
                        ghi_chu: gt('tm-gc') || null } } });
                dongHopThoai(); xemGD(gdId);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

function suaDongGD(gdId, ctId, slHienTai) {
    moHopThoai('Sửa dòng chi tiết', `
        <div class="o-nhap"><label>Số lượng</label><input id="sd-sl" value="${slHienTai}"></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Lưu', lop: 'chinh-nut', chay: async () => {
            try {
                await api(`/giao-dich/${gdId}/chi-tiet/${ctId}`, { method: 'PUT',
                    body: { so_luong: so('sd-sl') } });
                dongHopThoai(); xemGD(gdId);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function xoaDongGD(gdId, ctId) {
    if (!confirm('Xóa dòng này khỏi phiếu?')) return;
    await api(`/giao-dich/${gdId}/chi-tiet/${ctId}`, { method: 'DELETE' });
    xemGD(gdId);
}

/* =========================== TÀI LIỆU =========================== */
function formTaiLieuGD(gdId) {
    moHopThoai('Đính kèm hồ sơ', `
        <div class="o-nhap"><label>Loại hồ sơ</label><select id="tl-loai">
            ${Object.entries(LOAI_HO_SO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select></div>
        <div class="o-nhap"><label>Tệp *</label>
            <input type="file" id="tl-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"></div>
        <div class="o-nhap"><label>Ghi chú</label><input id="tl-gc"></div>
        <div class="ghi-nho">Nhận PDF, Word, Excel hoặc ảnh, tối đa 20 MB.</div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Tải lên', lop: 'chinh-nut', chay: async () => {
            const f = document.getElementById('tl-file').files[0];
            if (!f) return baoTrongHopThoai('Chọn tệp');
            const fd = new FormData();
            fd.append('file', f);
            fd.append('loai_ho_so', gt('tl-loai'));
            fd.append('ghi_chu', gt('tl-gc'));
            try {
                await api(`/giao-dich/${gdId}/tai-lieu`, { method: 'POST', body: fd });
                dongHopThoai(); xemGD(gdId);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function xoaTaiLieuGD(gdId, tlId) {
    if (!confirm('Xóa tệp đính kèm này?')) return;
    await api(`/giao-dich/${gdId}/tai-lieu/${tlId}`, { method: 'DELETE' });
    xemGD(gdId);
}

/* =========================== WORKFLOW =========================== */
async function thaoTacGD(id, hd, tb) {
    try {
        await api(`/giao-dich/${id}/${hd}`, { method: 'POST' });
        bao(tb); xemGD(id); taiBangGD();
    } catch (e) { bao(e.message, 'loi'); }
}

async function trinhDuyetGD(id) {
    try {
        await api(`/giao-dich/${id}/trinh-duyet`, { method: 'POST' });
        dongHopThoai(); bao('Đã trình duyệt, phiếu đang chờ người có thẩm quyền xử lý');
        taiBangGD(); capNhatChip();
    } catch (e) {
        bao(e.message, 'loi'); xemGD(id);
    }
}

function xacNhanDuyetGD(g) {
    moHopThoai('Xác nhận duyệt giao dịch', `
        <div class="bao nhac">Sau khi duyệt, số liệu tài sản hiện hành sẽ được cập nhật
        và không hoàn tác được. Bạn có chắc chắn muốn tiếp tục?</div>
        <table><tr><td style="color:var(--chu-nhat);width:130px">Phiếu</td>
            <td class="ma">${esc(g.ma_giao_dich)}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Loại</td>
            <td>${(CAU_HINH_GD[g.loai_giao_dich] || {}).ten || ''}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Số dòng</td><td>${g.so_dong}</td></tr>
            <tr><td style="color:var(--chu-nhat)">Người lập</td><td>${esc(g.nguoi_tao || '')}</td></tr>
        </table>`,
        [{ ten: 'Hủy', chay: () => xemGD(g.id) },
         { ten: 'Xác nhận duyệt', lop: 'nhan-manh', chay: async () => {
            try {
                const kq = await api(`/giao-dich/${g.id}/duyet`, { method: 'POST' });
                dongHopThoai();
                bao(`Đã duyệt ${g.ma_giao_dich}, cập nhật ${kq.ket_qua.length} dòng tài sản`);
                taiBangGD(); capNhatChip();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

function tuChoiGD(id) {
    moHopThoai('Từ chối giao dịch', `
        <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:10px">
        Nêu rõ nội dung cần sửa để người lập biết phải bổ sung gì rồi trình lại.</p>
        <div class="o-nhap"><label>Lý do từ chối *</label><textarea id="tc-lydo" rows="3"></textarea></div>`,
        [{ ten: 'Hủy', chay: () => xemGD(id) },
         { ten: 'Từ chối', lop: 'nguy-hiem', chay: async () => {
            if (!gt('tc-lydo')) return baoTrongHopThoai('Phải nhập lý do từ chối');
            try {
                await api(`/giao-dich/${id}/tu-choi`, { method: 'POST', body: { ly_do: gt('tc-lydo') } });
                dongHopThoai(); bao('Đã từ chối phiếu', 'nhac'); taiBangGD(); capNhatChip();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

function huyGD(id) {
    moHopThoai('Hủy phiếu', `
        <div class="o-nhap"><label>Lý do hủy *</label><textarea id="hy-lydo" rows="2"></textarea></div>`,
        [{ ten: 'Không hủy', chay: () => xemGD(id) },
         { ten: 'Hủy phiếu', lop: 'nguy-hiem', chay: async () => {
            if (!gt('hy-lydo')) return baoTrongHopThoai('Phải nhập lý do hủy');
            try {
                await api(`/giao-dich/${id}/huy`, { method: 'POST', body: { ly_do: gt('hy-lydo') } });
                dongHopThoai(); bao('Đã hủy phiếu', 'nhac'); taiBangGD();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== MÀN HÌNH PHÊ DUYỆT =========================== */
async function mhPheDuyet(el) {
    el.innerHTML = `<div class="dau-trang"><div>
        <div class="eyebrow">Phê duyệt</div><h2>Giao dịch chờ duyệt</h2>
        <div class="phu">Số liệu tài sản chỉ thay đổi sau khi bạn bấm duyệt</div></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;

    await napChungGD();
    const d = await api('/giao-dich/cho-duyet');

    if (!d.duoc_duyet) {
        document.getElementById('noi-dung').innerHTML =
            `<div class="the"><div class="than-the trong">Bạn không có quyền duyệt giao dịch.</div></div>`;
        return;
    }
    const k = d.kpi;
    const o = (n, v, lop = '') => `<div class="o-so ${lop}"><div class="nhan">${n}</div>
        <div class="gt">${v}</div><div class="ghi">&nbsp;</div></div>`;

    document.getElementById('noi-dung').innerHTML = `
        <div class="luoi-so">
            ${o('Tổng chờ duyệt', k.tong, k.tong ? 'canh-bao' : '')}
            ${o('Phiếu tăng', k.tang)}
            ${o('Phiếu giảm', k.giam)}
            ${o('Điều chuyển', k.dieu_chuyen)}
            ${o('Quá 3 ngày', k.qua_han, k.qua_han ? 'nguy' : '')}
        </div>
        <div class="the"><h3>Danh sách chờ duyệt</h3><div class="bao-bang">
        ${d.danh_sach.length ? `<table><thead><tr>
            <th>Loại</th><th>Mã phiếu</th><th>Ngày</th><th>Đơn vị</th><th>Đến</th>
            <th class="phai">Số dòng</th><th>Người lập</th><th>Trình lúc</th><th></th></tr></thead>
            <tbody>${d.danh_sach.map(g => `<tr class="bam" onclick="xemGD('${g.id}')">
                <td>${(CAU_HINH_GD[g.loai_giao_dich] || {}).ten || g.loai_giao_dich}</td>
                <td class="ma">${esc(g.ma_giao_dich)}</td>
                <td>${ngay(g.ngay_giao_dich)}</td>
                <td>${esc(g.don_vi_nguon || g.don_vi_dich || '')}</td>
                <td>${g.loai_giao_dich === 'dieu_chuyen' ? esc(g.don_vi_dich || '') : ''}</td>
                <td class="phai so">${g.so_dong}</td>
                <td style="font-size:12.5px">${esc(g.nguoi_tao || g.tk_nguoi_tao || '')}</td>
                <td style="font-size:12px">${esc(g.ngay_trinh || '')}</td>
                <td class="phai"><button class="nho nhan-manh">Xử lý</button></td>
            </tr>`).join('')}</tbody></table>`
        : '<div class="trong">Không có giao dịch nào chờ duyệt.</div>'}
        </div></div>`;
}
