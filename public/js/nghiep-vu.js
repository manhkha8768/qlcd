/* =====================================================================
   MÀN HÌNH NGHIỆP VỤ: điều chuyển, sửa chữa, kiểm định
   ===================================================================== */

/* Hộp chọn thiết bị dùng lại ở nhiều nơi */
async function napDanhSachTB() {
    // Luôn nạp lại: danh sách thiết bị thay đổi sau mỗi lần import hoặc điều chuyển
    const d = await api('/thiet-bi?moi_trang=500');
    window.DS_TB_CHON = d.danh_sach;
    return window.DS_TB_CHON;
}
function chonTB(id, chon = '') {
    return `<select id="${id}"><option value="">— Chọn thiết bị —</option>
        ${(window.DS_TB_CHON || []).map(t => `<option value="${t.id}" ${t.id == chon ? 'selected' : ''}>
            ${esc(t.ma_tb)} — ${esc(t.ten)}</option>`).join('')}</select>`;
}

const LOAI_DC = {
    dieu_chuyen: 'Điều chuyển giữa phân xưởng', di_chuyen_vi_tri: 'Đổi vị trí lắp đặt',
    dua_di_sua: 'Đưa đi sửa chữa', nhan_ve: 'Nhận về sau sửa chữa',
    thu_hoi: 'Thu hồi về công ty', thanh_ly: 'Đưa đi thanh lý', cap_moi: 'Cấp mới cho phân xưởng'
};
const LOAI_SC = {
    sua_chua: 'Sửa chữa', bao_duong_dk: 'Bảo dưỡng định kỳ', su_co: 'Xử lý sự cố',
    dai_tu: 'Đại tu', cai_tao: 'Cải tạo nâng cấp'
};
const CAP_BD = { ca: 'Theo ca', ngay: 'Hằng ngày', tuan: 'Hằng tuần', thang: 'Hằng tháng',
                 quy: 'Hằng quý', nam: 'Hằng năm', dai_tu: 'Đại tu' };

/* Điều chuyển đã chuyển sang module giao dịch thống nhất (js/giao-dich.js) */
async function napPhanXuong() {
    if (!window.DS_PX) window.DS_PX = await api('/danh-muc/phan-xuong');
    if (!window.DS_VITRI) window.DS_VITRI = await api('/danh-muc/vi-tri');
}

/* Dùng chung cho mọi loại chứng từ */
function chuyenLaiChungTu(duongDan, id, taiLai) {
    moHopThoai('Chuyển lại phân xưởng', `
        <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:10px">
        Nêu rõ nội dung cần bổ sung để phân xưởng sửa và gửi lại.</p>
        <div class="o-nhap"><label>Lý do chuyển lại</label><textarea id="cl-lydo" rows="3"></textarea></div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Chuyển lại', lop: 'nguy-hiem', chay: async () => {
            if (!gt('cl-lydo')) return baoTrongHopThoai('Phải nhập lý do chuyển lại');
            try {
                await api(`/${duongDan}/${id}/chuyen-lai`, { method: 'POST', body: { ly_do: gt('cl-lydo') } });
                dongHopThoai(); bao('Đã chuyển lại phân xưởng', 'nhac'); taiLai();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* =========================== SỬA CHỮA =========================== */
let locSC = '';

async function mhSuaChua(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Chứng từ</div><h2>Bảo dưỡng — sửa chữa</h2></div>
            <div style="display:flex;gap:8px">
                <button onclick="formKeHoachBD()">Kế hoạch bảo dưỡng</button>
                <button onclick="formCongViecKyThuatCanonical()">Lập công việc canonical</button>
                <button class="chinh-nut" onclick="formPhieuSC()">Lập phiếu</button></div></div>
        <div id="vung-bao"></div>
        <div class="the"><h3>Repair / Maintenance canonical</h3><div id="technical-operations">Đang tải…</div></div>
        <div class="thanh-loc">
            <select id="l-sc" onchange="locSC=this.value;taiBangSC()">
                <option value="">Mọi trạng thái</option>
                ${['nhap', 'cho_duyet', 'dang_thuc_hien', 'chuyen_lai', 'hoan_thanh']
                    .map(k => `<option value="${k}">${tt(k)}</option>`).join('')}
            </select></div>
        <div class="the"><h3>Phiếu sửa chữa — bảo dưỡng</h3><div id="bang-sc" class="bao-bang">Đang tải…</div></div>
        <div class="the"><h3>Kế hoạch bảo dưỡng định kỳ</h3><div id="bang-kh" class="bao-bang"></div></div>`;

    await napDanhSachTB();
    taiBangSC(); taiBangKeHoach(); taiCongViecKyThuatCanonical('');
}

async function taiBangSC() {
    const c = document.getElementById('bang-sc');
    const ds = await api('/bao-duong/phieu' + (locSC ? '?trang_thai=' + locSC : ''));
    if (!ds.length) { c.innerHTML = '<div class="trong">Chưa có phiếu nào.</div>'; return; }

    c.innerHTML = `<table><thead><tr>
        <th>Số phiếu</th><th>Thiết bị</th><th>Loại</th><th>Nội dung</th><th>Bắt đầu</th>
        <th class="phai">Chi phí (đ)</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${ds.map(p => `<tr>
            <td class="ma">${esc(p.so_phieu)}</td>
            <td><span class="ma">${esc(p.ma_tb)}</span><div style="font-size:12px">${esc(p.ten_tb)}</div></td>
            <td style="font-size:12.5px">${LOAI_SC[p.loai] || p.loai}
                ${p.muc_do === 'dung_san_xuat' ? '<div><span class="nhan-tt tt-qua_han">Dừng SX</span></div>'
                 : p.muc_do === 'khan' ? '<div><span class="nhan-tt tt-cho_duyet">Khẩn</span></div>' : ''}</td>
            <td style="max-width:260px">${esc(p.mo_ta_hu_hong || '')}</td>
            <td>${ngay(p.ngay_bat_dau)}</td>
            <td class="phai so">${tien(p.tong_chi_phi)}</td>
            <td>${nhanTT(p.trang_thai)}</td>
            <td class="phai"><button class="nho" onclick="xemPhieuSC(${p.id})">Mở</button></td>
        </tr>`).join('')}</tbody></table>`;
}

async function taiBangKeHoach() {
    const c = document.getElementById('bang-kh');
    if (!c) return;
    const ds = await api('/bao-duong/ke-hoach');
    if (!ds.length) {
        c.innerHTML = `<div class="trong">Chưa lập kế hoạch bảo dưỡng nào.
            Lập kế hoạch để hệ thống nhắc khi đến hạn.</div>`;
        return;
    }
    c.innerHTML = `<table><thead><tr>
        <th>Thiết bị</th><th>PX</th><th>Cấp</th><th>Chu kỳ</th>
        <th>Lần cuối</th><th>Hạn kế tiếp</th><th class="phai">Giờ chạy</th><th></th></tr></thead>
        <tbody>${ds.map(k => `<tr>
            <td><span class="ma">${esc(k.ma_tb)}</span><div style="font-size:12px">${esc(k.ten_tb)}</div></td>
            <td>${esc(k.px || '')}</td><td>${CAP_BD[k.cap_bd] || k.cap_bd}</td>
            <td>${k.chu_ky_ngay ? k.chu_ky_ngay + ' ngày' : ''}${k.chu_ky_gio ? ' / ' + k.chu_ky_gio + ' giờ' : ''}</td>
            <td>${ngay(k.lan_cuoi)}</td>
            <td>${ngay(k.lan_ke_tiep)}</td>
            <td class="phai so">${k.gio_chay_luy_ke || ''}</td>
            <td class="phai"><button class="nho nguy-hiem" onclick="xoaKeHoach(${k.id})">Bỏ</button></td>
        </tr>`).join('')}</tbody></table>`;
}

async function xoaKeHoach(id) {
    if (!confirm('Bỏ kế hoạch bảo dưỡng này?')) return;
    await api('/bao-duong/ke-hoach/' + id, { method: 'DELETE' });
    taiBangKeHoach(); bao('Đã bỏ kế hoạch');
}

function formKeHoachBD() {
    moHopThoai('Lập kế hoạch bảo dưỡng định kỳ', `
        <div class="o-nhap"><label>Thiết bị *</label>${chonTB('kh-tb')}</div>
        <div class="hang">
            <div class="o-nhap"><label>Cấp bảo dưỡng *</label><select id="kh-cap">
                ${Object.entries(CAP_BD).map(([k, v]) => `<option value="${k}" ${k === 'thang' ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Chu kỳ (ngày)</label><input id="kh-ngay" value="30"></div>
            <div class="o-nhap"><label>Hoặc theo giờ chạy</label><input id="kh-gio" placeholder="ví dụ 500"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Lần bảo dưỡng gần nhất</label><input id="kh-cuoi" type="date"></div>
            <div class="o-nhap"><label>Người phụ trách</label><input id="kh-nguoi"></div>
        </div>
        <div class="ghi-nho">Hạn kế tiếp tính tự động. Mỗi lần hoàn thành phiếu bảo dưỡng định kỳ,
            hệ thống tự dời hạn sang chu kỳ sau.</div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Lập kế hoạch', lop: 'chinh-nut', chay: async () => {
            if (!gt('kh-tb')) return baoTrongHopThoai('Chọn thiết bị');
            try {
                await api('/bao-duong/ke-hoach', { method: 'POST', body: {
                    thiet_bi_id: Number(gt('kh-tb')), cap_bd: gt('kh-cap'),
                    chu_ky_ngay: so('kh-ngay'), chu_ky_gio: so('kh-gio'),
                    lan_cuoi: gt('kh-cuoi') || null, nguoi_phu_trach: gt('kh-nguoi')
                } });
                dongHopThoai(); bao('Đã lập kế hoạch bảo dưỡng'); taiBangKeHoach();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

function formPhieuSC() {
    moHopThoai('Lập phiếu sửa chữa — bảo dưỡng', `
        <div class="o-nhap"><label>Thiết bị *</label>${chonTB('sc-tb')}</div>
        <div class="hang">
            <div class="o-nhap"><label>Loại công việc</label><select id="sc-loai">
                ${Object.entries(LOAI_SC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Mức độ</label><select id="sc-muc">
                <option value="binh_thuong">Bình thường</option>
                <option value="khan">Khẩn</option>
                <option value="dung_san_xuat">Dừng sản xuất</option></select></div>
            <div class="o-nhap"><label>Cấp BD (nếu định kỳ)</label><select id="sc-cap">
                <option value="">—</option>
                ${Object.entries(CAP_BD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="o-nhap"><label>Nội dung hư hỏng / công việc *</label>
            <textarea id="sc-mota" rows="2" placeholder="Ví dụ: mòn má phanh, cáp tời xơ tao"></textarea></div>
        <div class="o-nhap"><label>Nguyên nhân</label><input id="sc-ng"></div>
        <div class="hang">
            <div class="o-nhap"><label>Ngày báo hỏng</label><input id="sc-baohong" type="date"></div>
            <div class="o-nhap"><label>Ngày bắt đầu</label>
                <input id="sc-batdau" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Đơn vị thực hiện</label><select id="sc-dv" onchange="doiDonVi()">
                <option value="noi_bo">Tự làm (nội bộ)</option>
                <option value="thue_ngoai">Thuê ngoài</option></select></div>
            <div class="o-nhap" id="o-dvngoai" style="display:none"><label>Tên đơn vị thuê</label><input id="sc-dvten"></div>
            <div class="o-nhap"><label>Số công</label><input id="sc-cong"></div>
            <div class="o-nhap"><label>Chi phí nhân công (đ)</label><input id="sc-nc"></div>
        </div>
        <div class="ghi-nho">Vật tư thay thế nhập ở bước sau, trong màn hình chi tiết phiếu.</div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Lập phiếu', lop: 'chinh-nut', chay: async () => {
            if (!gt('sc-tb')) return baoTrongHopThoai('Chọn thiết bị');
            if (!gt('sc-mota')) return baoTrongHopThoai('Mô tả nội dung công việc');
            try {
                const kq = await api('/bao-duong/phieu', { method: 'POST', body: {
                    thiet_bi_id: Number(gt('sc-tb')), loai: gt('sc-loai'), muc_do: gt('sc-muc'),
                    cap_bd: gt('sc-cap') || null, mo_ta_hu_hong: gt('sc-mota'), nguyen_nhan: gt('sc-ng'),
                    ngay_bao_hong: gt('sc-baohong') || null, ngay_bat_dau: gt('sc-batdau'),
                    don_vi_thuc_hien: gt('sc-dv'), ten_don_vi_ngoai: gt('sc-dvten'),
                    so_cong: so('sc-cong') ?? 0, chi_phi_nhan_cong: so('sc-nc') ?? 0
                } });
                dongHopThoai(); bao('Đã lập phiếu ' + kq.so_phieu);
                taiBangSC(); xemPhieuSC(kq.id);
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

function doiDonVi() {
    document.getElementById('o-dvngoai').style.display = gt('sc-dv') === 'thue_ngoai' ? '' : 'none';
}

async function xemPhieuSC(id) {
    const p = await api('/bao-duong/phieu/' + id);
    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:150px">${n}</td><td>${esc(v)}</td></tr>` : '';
    const suaDuoc = !['hoan_thanh'].includes(p.trang_thai);

    let h = `<div class="bien-ten">
        <div><div class="ma-lon">${esc(p.so_phieu)}</div>
            <div class="ten-may">${esc(p.ten_tb)}</div>
            <div class="duoi">${esc(p.ma_tb)} · ${LOAI_SC[p.loai] || p.loai}${p.px ? ' · ' + esc(p.px) : ''}</div></div>
        <div class="cot-phai"><div>Tổng chi phí</div>
            <div class="gt" style="font-size:17px">${tien(p.tong_chi_phi) || 0} đ</div></div></div>

    <div class="the"><h3>Nội dung</h3><div class="than-the"><table>
        ${hang('Hư hỏng / công việc', p.mo_ta_hu_hong)}
        ${hang('Nguyên nhân', p.nguyen_nhan)}
        ${hang('Biện pháp xử lý', p.bien_phap_xu_ly)}
        ${hang('Ngày báo hỏng', ngay(p.ngay_bao_hong))}
        ${hang('Bắt đầu', ngay(p.ngay_bat_dau))}
        ${hang('Hoàn thành', ngay(p.ngay_hoan_thanh))}
        ${hang('Giờ dừng máy', p.thoi_gian_dung_may)}
        ${hang('Đơn vị thực hiện', p.don_vi_thuc_hien === 'thue_ngoai' ? (p.ten_don_vi_ngoai || 'Thuê ngoài') : 'Tự làm')}
        ${hang('Người lập', p.nguoi_lap)}
        <tr><td style="color:var(--chu-nhat)">Trạng thái</td><td>${nhanTT(p.trang_thai)}</td></tr>
    </table></div></div>

    <div class="the"><h3>Vật tư thay thế</h3>
        <div class="bao-bang"><table>
            <thead><tr><th>Mã VTHH</th><th>Tên vật tư</th><th>ĐVT</th>
                <th class="phai">SL</th><th class="phai">Đơn giá</th><th class="phai">Thành tiền</th><th></th></tr></thead>
            <tbody>${p.vat_tu.length ? p.vat_tu.map(v => `<tr>
                <td class="ma">${esc(v.ma_vthh || '')}</td><td>${esc(v.ten_vthh)}</td><td>${esc(v.dvt || '')}</td>
                <td class="phai so">${v.so_luong}</td><td class="phai so">${tien(v.don_gia)}</td>
                <td class="phai so">${tien(v.so_luong * v.don_gia)}</td>
                <td class="phai">${suaDuoc ? `<button class="nho nguy-hiem" onclick="xoaVatTu(${v.id},${p.id})">Xoá</button>` : ''}</td>
            </tr>`).join('') : '<tr><td colspan="7" class="trong">Chưa có vật tư nào.</td></tr>'}
            </tbody>
            <tfoot><tr style="font-weight:600;background:#F4F5F7">
                <td colspan="5">Vật tư</td><td class="phai so">${tien(p.chi_phi_vat_tu) || 0}</td><td></td></tr>
                <tr><td colspan="5">Nhân công</td><td class="phai so">${tien(p.chi_phi_nhan_cong) || 0}</td><td></td></tr>
                <tr style="font-weight:650"><td colspan="5">Tổng cộng</td>
                <td class="phai so">${tien(p.tong_chi_phi) || 0}</td><td></td></tr></tfoot>
        </table></div>
        ${suaDuoc ? `<div class="than-the"><button onclick="formVatTu(${p.id})">Thêm vật tư</button></div>` : ''}
    </div>`;

    if (p.lich_su_duyet.length) {
        h += `<div class="the"><h3>Quá trình xử lý</h3><div class="bao-bang"><table>
            <thead><tr><th>Thời điểm</th><th>Người</th><th>Thao tác</th><th>Lý do</th></tr></thead>
            <tbody>${p.lich_su_duyet.map(x => `<tr><td style="font-size:12px">${esc(x.thoi_gian)}</td>
                <td>${esc(x.ho_ten || '')}</td>
                <td>${x.hanh_dong === 'dong_y' ? 'Đồng ý' : x.hanh_dong === 'chuyen_lai' ? 'Chuyển lại' : 'Gửi duyệt'}</td>
                <td class="${x.hanh_dong === 'chuyen_lai' ? 'loi-o' : ''}">${esc(x.ly_do || '')}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    const vt = window.PHIEN.vai_tro;
    const nut = [];
    if (['nhap', 'chuyen_lai'].includes(p.trang_thai)) {
        nut.push({ ten: 'Gửi duyệt', lop: 'nhan-manh', chay: async () => {
            await api(`/bao-duong/phieu/${p.id}/gui-duyet`, { method: 'POST' });
            dongHopThoai(); bao('Đã gửi duyệt'); taiBangSC();
        } });
    }
    if (p.trang_thai === 'cho_duyet' && ['admin', 'cd_cty'].includes(vt)) {
        nut.push({ ten: 'Chuyển lại', lop: 'nguy-hiem',
                   chay: () => chuyenLaiChungTu('bao-duong/phieu', p.id, taiBangSC) });
        nut.push({ ten: 'Đồng ý', lop: 'nhan-manh', chay: async () => {
            await api(`/bao-duong/phieu/${p.id}/dong-y`, { method: 'POST' });
            dongHopThoai(); bao('Đã duyệt phiếu'); taiBangSC();
        } });
    }
    if (['da_duyet', 'dang_thuc_hien'].includes(p.trang_thai)) {
        nut.push({ ten: 'Hoàn thành', lop: 'nhan-manh', chay: () => formHoanThanhSC(p) });
    }
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai('Phiếu sửa chữa', h, nut, true);
}

function formVatTu(phieuId) {
    moHopThoai('Thêm vật tư thay thế', `
        <div class="hang">
            <div class="o-nhap" style="flex:0 0 130px"><label>Mã VTHH</label>
                <input id="vt-ma" placeholder="CU.01.045"></div>
            <div class="o-nhap"><label>Tên vật tư *</label><input id="vt-ten"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>ĐVT</label><input id="vt-dvt" value="Cái"></div>
            <div class="o-nhap"><label>Số lượng *</label><input id="vt-sl" value="1"></div>
            <div class="o-nhap"><label>Đơn giá (đ)</label><input id="vt-gia"></div>
            <div class="o-nhap"><label>Nguồn</label><select id="vt-nguon">
                <option value="kho">Xuất kho</option><option value="mua_moi">Mua mới</option>
                <option value="tan_dung">Tận dụng</option></select></div>
        </div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Thêm', lop: 'chinh-nut', chay: async () => {
            if (!gt('vt-ten')) return baoTrongHopThoai('Nhập tên vật tư');
            try {
                await api(`/bao-duong/phieu/${phieuId}/vat-tu`, { method: 'POST', body: {
                    ma_vthh: gt('vt-ma'), ten_vthh: gt('vt-ten'), dvt: gt('vt-dvt'),
                    so_luong: so('vt-sl') ?? 1, don_gia: so('vt-gia') ?? 0, nguon: gt('vt-nguon')
                } });
                dongHopThoai(); xemPhieuSC(phieuId); taiBangSC();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function xoaVatTu(id, phieuId) {
    if (!confirm('Xoá dòng vật tư này?')) return;
    await api('/bao-duong/vat-tu/' + id, { method: 'DELETE' });
    xemPhieuSC(phieuId); taiBangSC();
}

function formHoanThanhSC(p) {
    moHopThoai('Hoàn thành phiếu ' + p.so_phieu, `
        <div class="hang">
            <div class="o-nhap"><label>Ngày hoàn thành</label>
                <input id="ht-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="o-nhap"><label>Giờ dừng máy</label><input id="ht-dung" value="${p.thoi_gian_dung_may || ''}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Kết quả</label><select id="ht-kq">
                <option value="dat">Đạt — thiết bị hoạt động lại</option>
                <option value="khong_dat">Không đạt — chuyển chờ thanh lý</option></select></div>
            <div class="o-nhap"><label>Tình trạng kỹ thuật sau sửa</label><select id="ht-tt">
                <option value="tot">Tốt</option><option value="trung_binh">Trung bình</option>
                <option value="kem">Kém</option></select></div>
        </div>
        <div class="o-nhap"><label>Biện pháp đã xử lý</label><textarea id="ht-bp" rows="2"></textarea></div>
        ${p.cap_bd ? `<div class="bao tin">Đây là bảo dưỡng ${CAP_BD[p.cap_bd] || p.cap_bd}.
            Hoàn thành xong hệ thống tự dời hạn bảo dưỡng kế tiếp.</div>` : ''}`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Hoàn thành', lop: 'chinh-nut', chay: async () => {
            try {
                const kq = await api(`/bao-duong/phieu/${p.id}/hoan-thanh`, { method: 'POST', body: {
                    ngay_hoan_thanh: gt('ht-ngay'), thoi_gian_dung_may: so('ht-dung'),
                    ket_qua: gt('ht-kq'), tinh_trang_kt: gt('ht-tt'), bien_phap_xu_ly: gt('ht-bp') || null
                } });
                dongHopThoai();
                const kh = kq.ke_hoach?.find(x => x.cap_bd === p.cap_bd);
                bao('Đã hoàn thành phiếu' + (kh?.lan_ke_tiep ? `. Hạn bảo dưỡng kế tiếp: ${ngay(kh.lan_ke_tiep)}` : ''));
                taiBangSC(); taiBangKeHoach();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

/* =========================== KIỂM ĐỊNH =========================== */
async function mhKiemDinh(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Hồ sơ an toàn</div><h2>Kiểm định thiết bị</h2>
            <div class="phu">Hạn hết hiệu lực tính tự động theo chu kỳ từng loại kiểm định</div></div>
            <div><button onclick="formCongViecKyThuatCanonical('INSPECTION')">Lập kiểm định canonical</button>
            <button class="chinh-nut" onclick="formKiemDinh()">Nhập hồ sơ kiểm định</button></div></div>
        <div id="vung-bao"></div>
        <div class="the"><h3>Inspection lifecycle canonical</h3><div id="technical-operations">Đang tải…</div></div>
        <div class="the"><h3>Hồ sơ kiểm định</h3><div id="bang-kd" class="bao-bang">Đang tải…</div></div>`;

    await Promise.all([napDanhSachTB(), napLoaiKD()]);
    taiBangKD(); taiCongViecKyThuatCanonical('INSPECTION');
}

async function napLoaiKD() {
    if (!window.DS_LOAI_KD) window.DS_LOAI_KD = await api('/danh-muc/loai-kiem-dinh');
}

async function taiBangKD() {
    const c = document.getElementById('bang-kd');
    const ds = await api('/kiem-dinh');
    if (!ds.length) {
        c.innerHTML = `<div class="trong">Chưa có hồ sơ kiểm định nào.
            Xem mục Cảnh báo hạn để biết thiết bị nào bắt buộc phải kiểm định.</div>`;
        return;
    }
    c.innerHTML = `<table><thead><tr>
        <th>Thiết bị</th><th>PX</th><th>Loại kiểm định</th><th>Ngày KĐ</th><th>Hết hạn</th>
        <th class="phai">Còn lại</th><th>Kết quả</th><th>Số giấy CN</th><th></th></tr></thead>
        <tbody>${ds.map(k => `<tr>
            <td><span class="ma">${esc(k.ma_tb)}</span><div style="font-size:12px">${esc(k.ten_tb)}</div></td>
            <td>${esc(k.px || '')}</td><td>${esc(k.ten_loai)}</td>
            <td>${ngay(k.ngay_kiem_dinh)}</td><td>${ngay(k.ngay_het_han)}</td>
            <td class="phai so ${k.con_lai_ngay < 0 ? 'loi-o' : k.con_lai_ngay < 30 ? 'canh-bao-o' : ''}">
                ${k.con_lai_ngay < 0 ? 'quá ' + (-k.con_lai_ngay) + ' ngày' : k.con_lai_ngay + ' ngày'}</td>
            <td>${nhanTT(k.ket_qua)}</td><td class="ma">${esc(k.so_giay_cn || '')}</td>
            <td class="phai"><button class="nho nguy-hiem" onclick="xoaKiemDinh(${k.id})">Xoá</button></td>
        </tr>`).join('')}</tbody></table>`;
}

async function xoaKiemDinh(id) {
    if (!confirm('Xoá hồ sơ kiểm định này?')) return;
    await api('/kiem-dinh/' + id, { method: 'DELETE' });
    taiBangKD(); bao('Đã xoá hồ sơ');
}

function formKiemDinh() {
    moHopThoai('Nhập hồ sơ kiểm định', `
        <div class="o-nhap"><label>Thiết bị *</label>
            <select id="kd-tb" onchange="goiYLoaiKD()"><option value="">— Chọn thiết bị —</option>
            ${(window.DS_TB_CHON || []).map(t => `<option value="${t.id}">${esc(t.ma_tb)} — ${esc(t.ten)}</option>`).join('')}
            </select></div>
        <div id="kd-goiy"></div>
        <div class="hang">
            <div class="o-nhap"><label>Loại kiểm định *</label><select id="kd-loai" onchange="tinhHanKD()">
                <option value="">— Chọn loại —</option>
                ${(window.DS_LOAI_KD || []).map(l => `<option value="${l.id}" data-ck="${l.chu_ky_thang}">
                    ${esc(l.ten)} (${l.chu_ky_thang} tháng)</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Ngày kiểm định *</label>
                <input id="kd-ngay" type="date" value="${new Date().toISOString().slice(0, 10)}" onchange="tinhHanKD()"></div>
            <div class="o-nhap"><label>Hết hạn (tự tính)</label><input id="kd-hethan" type="date"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Đơn vị kiểm định</label><input id="kd-dv"></div>
            <div class="o-nhap"><label>Số giấy chứng nhận</label><input id="kd-so"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Kết quả</label><select id="kd-kq">
                <option value="dat">Đạt</option>
                <option value="dat_co_dieu_kien">Đạt có điều kiện</option>
                <option value="khong_dat">Không đạt — dừng thiết bị</option></select></div>
            <div class="o-nhap"><label>Chi phí (đ)</label><input id="kd-cp"></div>
        </div>
        <div class="o-nhap"><label>Kết luận</label><input id="kd-kl"></div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Lưu hồ sơ', lop: 'chinh-nut', chay: async () => {
            if (!gt('kd-tb')) return baoTrongHopThoai('Chọn thiết bị');
            if (!gt('kd-loai')) return baoTrongHopThoai('Chọn loại kiểm định');
            try {
                const kq = await api('/kiem-dinh', { method: 'POST', body: {
                    thiet_bi_id: Number(gt('kd-tb')), loai_kiem_dinh_id: Number(gt('kd-loai')),
                    ngay_kiem_dinh: gt('kd-ngay'), ngay_het_han: gt('kd-hethan') || null,
                    don_vi_kiem_dinh: gt('kd-dv'), so_giay_cn: gt('kd-so'),
                    ket_qua: gt('kd-kq'), ket_luan: gt('kd-kl'), chi_phi: so('kd-cp') ?? 0
                } });
                dongHopThoai(); bao('Đã lưu hồ sơ, hết hạn ngày ' + ngay(kq.ngay_het_han));
                taiBangKD();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

/** Gợi ý các loại kiểm định bắt buộc của thiết bị vừa chọn */
async function goiYLoaiKD() {
    const id = gt('kd-tb');
    const c = document.getElementById('kd-goiy');
    if (!id) { c.innerHTML = ''; return; }
    try {
        const ds = await api('/kiem-dinh/can-lam/' + id);
        if (!ds.length) {
            c.innerHTML = `<div class="bao tin">Nhóm thiết bị này không thuộc diện bắt buộc kiểm định.</div>`;
            return;
        }
        c.innerHTML = `<div class="bao ${ds.some(x => !x.ngay_het_han) ? 'nhac' : 'tin'}">
            Thiết bị này phải có: ${ds.map(x => `<strong>${esc(x.ten)}</strong>${
                x.ngay_het_han ? ` (hạn ${ngay(x.ngay_het_han)})` : ' <em>— chưa có hồ sơ</em>'}`).join(' · ')}</div>`;
    } catch (e) { c.innerHTML = ''; }
}

function tinhHanKD() {
    const sel = document.getElementById('kd-loai');
    const ck = Number(sel.selectedOptions[0]?.dataset.ck);
    const nk = gt('kd-ngay');
    if (!ck || !nk) return;
    const d = new Date(nk);
    d.setMonth(d.getMonth() + ck);
    document.getElementById('kd-hethan').value = d.toISOString().slice(0, 10);
}
