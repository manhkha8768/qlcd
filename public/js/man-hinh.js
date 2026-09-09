/* Các màn hình chính */

/* =========================== TỔNG QUAN =========================== */
async function mhTongQuan(el) {
    el.innerHTML = `<div class="dau-trang"><div>
        <div class="eyebrow">Bảng theo dõi</div><h2>Tổng quan</h2></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;

    const [d, cb, gd] = await Promise.all([
        api('/tong-hop/dashboard'), api('/tong-hop/canh-bao'), api('/giao-dich/thong-ke')]);
    const t = d.tong, s = cb.tom_tat;

    const o = (nhan, gia, ghi, lop = '') =>
        `<div class="o-so ${lop}"><div class="nhan">${nhan}</div>
         <div class="gt">${gia}</div><div class="ghi">${ghi || '&nbsp;'}</div></div>`;

    let h = `<div class="luoi-so">
        ${o('Tổng thiết bị', t.tong || 0, tien(t.tong_nguyen_gia) ? tien(t.tong_nguyen_gia) + ' đ nguyên giá' : '')}
        ${o('Đang hoạt động', t.hoat_dong || 0, '', 'tot')}
        ${o('Đang sửa chữa', t.dang_sua || 0, '', t.dang_sua ? 'canh-bao' : '')}
        ${o('Chờ duyệt', t.cho_duyet || 0, '', t.cho_duyet ? 'canh-bao' : '')}
    </div>`;

    const tongCB = s.kd_qua_han + s.kd_sap_het_han + s.bd_qua_han + s.bd_den_han + s.thieu_kiem_dinh;
    if (tongCB) {
        h += `<div class="the"><h3>Cần xử lý</h3><div class="than-the"><div class="luoi-so" style="margin:0">
            ${o('Kiểm định quá hạn', s.kd_qua_han, '', s.kd_qua_han ? 'nguy' : '')}
            ${o('Sắp hết hạn', s.kd_sap_het_han, '', s.kd_sap_het_han ? 'canh-bao' : '')}
            ${o('Chưa kiểm định', s.thieu_kiem_dinh, 'thuộc nhóm bắt buộc', s.thieu_kiem_dinh ? 'canh-bao' : '')}
            ${o('Bảo dưỡng quá hạn', s.bd_qua_han, '', s.bd_qua_han ? 'nguy' : '')}
        </div><div style="margin-top:12px"><button onclick="dieuHuong('canh-bao')">Xem chi tiết cảnh báo</button></div>
        </div></div>`;
    }

    h += `<div class="the"><h3>Biến động tài sản</h3><div class="than-the">
        <div class="luoi-so" style="margin:0">
            ${o('Giao dịch chờ duyệt', gd.cho_duyet, '', gd.cho_duyet ? 'canh-bao' : '')}
            ${o('Tăng trong tháng', gd.tang_trong_thang, 'phiếu đã duyệt')}
            ${o('Giảm trong tháng', gd.giam_trong_thang, 'phiếu đã duyệt')}
            ${o('Điều chuyển trong tháng', gd.dieu_chuyen_trong_thang, 'phiếu đã duyệt')}
        </div>
        ${gd.cho_duyet ? `<div style="margin-top:12px">
            <button onclick="dieuHuong('phe-duyet')">Xử lý giao dịch chờ duyệt</button></div>` : ''}
    </div></div>`;

    if (gd.gan_day.length) {
        h += `<div class="the"><h3>Giao dịch gần đây</h3><div class="bao-bang"><table>
            <thead><tr><th>Loại</th><th>Mã phiếu</th><th>Đơn vị</th><th>Ngày</th>
                <th class="phai">Số dòng</th><th>Trạng thái</th></tr></thead>
            <tbody>${gd.gan_day.map(x => `<tr class="bam" onclick="xemGD('${x.id}')">
                <td>${(CAU_HINH_GD[x.loai_giao_dich] || {}).ten || x.loai_giao_dich}</td>
                <td class="ma">${esc(x.ma_giao_dich)}</td>
                <td>${esc(x.don_vi_nguon || x.don_vi_dich || '')}${
                    x.loai_giao_dich === 'dieu_chuyen' && x.don_vi_dich
                        ? ' → ' + esc(x.don_vi_dich) : ''}</td>
                <td>${ngay(x.ngay_giao_dich)}</td>
                <td class="phai so">${x.so_dong}</td>
                <td>${nhanTTGD(x.trang_thai)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    if (d.theo_phan_xuong.length > 1) {
        h += `<div class="the"><h3>Thiết bị theo phân xưởng</h3><div class="bao-bang"><table>
            <thead><tr><th>Phân xưởng</th><th class="phai">Số thiết bị</th><th class="phai">Nguyên giá (đ)</th></tr></thead>
            <tbody>${d.theo_phan_xuong.map(x => `<tr class="bam" tabindex="0" role="link"
                aria-label="Xem TSCĐ và CCDC của ${esc(x.ten_px)}"
                onclick="moTaiSanTheoPhanXuong(${Number(x.phan_xuong_id)},event)"
                onkeydown="moTaiSanTheoPhanXuong(${Number(x.phan_xuong_id)},event)">
                <td><strong>${esc(x.px || '')}</strong> <span style="color:var(--chu-nhat)">${esc(x.ten_px)}</span></td>
                <td class="phai so">${x.n}</td><td class="phai so">${tien(x.gt)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    if (d.theo_nhom.length) {
        h += `<div class="the"><h3>Cơ cấu theo nhóm thiết bị</h3><div class="bao-bang"><table>
            <thead><tr><th>Mã</th><th>Nhóm thiết bị</th><th>Thuộc</th><th class="phai">Số lượng</th></tr></thead>
            <tbody>${d.theo_nhom.map(x => `<tr>
                <td class="ma">${esc(x.ma_nhom)}</td><td>${esc(x.ten_nhom)}</td>
                <td style="color:var(--chu-nhat)">${esc(x.nhom_cha || '')}</td>
                <td class="phai so">${x.n}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    if (!t.tong) {
        h = `<div class="the"><div class="than-the trong">
            Chưa có thiết bị nào.<br><br>
            ${window.PHIEN.vai_tro === 'admin' ? 'Thêm phân xưởng trong mục Quản trị, sau đó ' : ''}
            vào mục <strong>Tải dữ liệu</strong> để đưa danh sách TSCĐ/CCDC của phân xưởng lên hệ thống.
            <br><br><button class="chinh-nut" onclick="dieuHuong('nhap-lieu')">Tải dữ liệu lên</button>
        </div></div>`;
    }
    document.getElementById('noi-dung').innerHTML = h;
}

function moTaiSanTheoPhanXuong(phanXuongId, event) {
    if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event?.type === 'keydown') event.preventDefault();
    dieuHuong('tai-san', { don_vi_id: String(phanXuongId), trang: 1 });
}

/* =========================== THIẾT BỊ =========================== */
let boLoc = { q: '', phan_xuong_id: '', nhom_id: '', trang_thai: '', loai_ts: '', hidden_status:'visible', co_so_kiem_ke:'', co_so_quan_ly:'', ky_thuat_tu:'', ky_thuat_den:'', trang: 1 };
let thietBiDaChon = new Set();

async function mhThietBi(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Danh mục</div><h2>Thiết bị</h2></div>
            <div>${coQuyenUI('thietbi.export')?'<button onclick="xuatThietBi(false)">Xuất danh sách</button> ':''}${coQuyenUI('thietbi.export.official')?'<button onclick="xuatThietBi(true)">Biên bản đầy đủ</button> ':''}<button class="chinh-nut" onclick="formThietBi()">Thêm thiết bị</button></div></div>
        <div id="vung-bao"></div>
        <div class="thanh-loc" id="thanh-loc"></div>
        <div class="the"><div id="bang-tb" class="bao-bang">Đang tải…</div></div>`;

    const [pxs, nhoms] = await Promise.all([api('/danh-muc/phan-xuong'), api('/danh-muc/nhom-thiet-bi')]);
    window.DS_PX = pxs; window.DS_NHOM = nhoms;
    const nhomCap2 = nhoms.filter(n => n.cap === 2);

    document.getElementById('thanh-loc').innerHTML = `
        <input class="lon" id="l-q" placeholder="Tìm mã, tên, số seri, mã tài sản…" value="${esc(boLoc.q)}">
        ${window.PHIEN.vai_tro !== 'px' ? `<select id="l-px"><option value="">Tất cả phân xưởng</option>
            ${pxs.map(p => `<option value="${p.id}">${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}</select>` : ''}
        <select id="l-nhom"><option value="">Tất cả nhóm</option>
            ${nhomCap2.map(n => `<option value="${n.id}">${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}</select>
        <select id="l-tt"><option value="">Mọi trạng thái</option>
            ${['hoat_dong', 'du_phong', 'dang_sua', 'cho_thanh_ly', 'da_thanh_ly']
                .map(k => `<option value="${k}">${tt(k)}</option>`).join('')}</select>
        <select id="l-loai"><option value="">TSCĐ + CCDC</option>
            <option value="TSCD">Chỉ TSCĐ</option><option value="CCDC">Chỉ CCDC</option></select>
        <select id="l-sokk"><option value="">Số kiểm kê: tất cả</option><option value="1">Đã có</option><option value="0">Chưa có</option></select>
        <select id="l-soql"><option value="">Số quản lý: tất cả</option><option value="1">Đã có</option><option value="0">Chưa có</option></select>
        <input id="l-kttu" type="number" min="0" max="100" placeholder="% KT từ" style="width:90px"><input id="l-ktden" type="number" min="0" max="100" placeholder="đến" style="width:75px">
        ${coQuyenUI('thietbi.unhide')?`<select id="l-an"><option value="visible">Đang hiển thị</option><option value="hidden">Đang ẩn</option><option value="all">Tất cả</option></select>`:''}
        <button onclick="apDungLoc()">Lọc</button>`;

    ['l-px', 'l-nhom', 'l-tt', 'l-loai'].forEach(id => {
        const e = document.getElementById(id);
        if (e) { e.value = boLoc[{ 'l-px': 'phan_xuong_id', 'l-nhom': 'nhom_id', 'l-tt': 'trang_thai', 'l-loai': 'loai_ts' }[id]]; e.onchange = apDungLoc; }
    });
    document.getElementById('l-q').onkeydown = e => { if (e.key === 'Enter') apDungLoc(); };
    [['l-sokk','co_so_kiem_ke'],['l-soql','co_so_quan_ly'],['l-an','hidden_status'],['l-kttu','ky_thuat_tu'],['l-ktden','ky_thuat_den']].forEach(([id,k])=>{const e=document.getElementById(id);if(e){e.value=boLoc[k]??'';}});

    taiBangThietBi();
}

function apDungLoc() {
    boLoc = {
        q: gt('l-q'),
        phan_xuong_id: document.getElementById('l-px')?.value || '',
        nhom_id: gt('l-nhom'), trang_thai: gt('l-tt'), loai_ts: gt('l-loai'),
        hidden_status:document.getElementById('l-an')?.value||'visible',co_so_kiem_ke:gt('l-sokk'),co_so_quan_ly:gt('l-soql'),ky_thuat_tu:gt('l-kttu'),ky_thuat_den:gt('l-ktden'),trang: 1
    };
    thietBiDaChon.clear();
    taiBangThietBi();
}

async function taiBangThietBi() {
    const c = document.getElementById('bang-tb');
    const q = new URLSearchParams({ ...boLoc, moi_trang: 50 });
    const d = await api('/thiet-bi?' + q);
    const duocXoa = coQuyenUI('thietbi.xoa'), duocAn=coQuyenUI('thietbi.hide');

    if (!d.tong) {
        c.innerHTML = `${coQuyenUI('thietbi.khoi_phuc') ? '<div class="asset-bulk-bar"><button onclick="moThungRacThietBi()">Thiết bị đã xóa</button></div>' : ''}<div class="trong">Không có thiết bị nào khớp điều kiện lọc.</div>`;
        return;
    }
    const soTrang = Math.ceil(d.tong / d.moi_trang);
    const idsTrang = d.danh_sach.map(x => Number(x.id));
    thietBiDaChon = new Set([...thietBiDaChon].filter(id => idsTrang.includes(id)));
    c.innerHTML = `${duocXoa ? `<div class="asset-bulk-bar"><strong id="device-selected-count">Đã chọn ${thietBiDaChon.size} thiết bị</strong>
            <button id="device-delete-selected" class="nguy-hiem" ${thietBiDaChon.size ? '' : 'disabled'} onclick="xacNhanXoaThietBi([...thietBiDaChon])">Xóa thiết bị đã chọn</button>
            ${duocAn?`<button id="device-hide-selected" ${thietBiDaChon.size?'':'disabled'} onclick="xacNhanAnThietBi([...thietBiDaChon])">Ẩn khỏi web</button>`:''}
            ${coQuyenUI('thietbi.khoi_phuc') ? '<button onclick="moThungRacThietBi()">Thiết bị đã xóa</button>' : ''}</div>` : ''}<table><thead><tr>
            ${duocXoa ? `<th><input type="checkbox" aria-label="Chọn tất cả thiết bị trang này" onchange="chonTatCaThietBi(this.checked)" ${idsTrang.length && idsTrang.every(id => thietBiDaChon.has(id)) ? 'checked' : ''}></th>` : ''}
            <th>STT</th><th>Số kiểm kê</th><th>Số quản lý</th><th>Tên thiết bị</th><th>ĐVT</th><th class="giua">Số lượng</th><th>Số chế tạo</th><th>PX</th><th>Trạng thái</th><th>% kỹ thuật</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
        <tbody>${d.danh_sach.map(x => `<tr class="bam" onclick="xemThietBi(${x.id})">
            ${duocXoa ? `<td><input class="device-check" type="checkbox" data-id="${x.id}" aria-label="Chọn ${esc(x.ma_tb)}" ${thietBiDaChon.has(Number(x.id)) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="chonThietBi(${x.id},this.checked)"></td>` : ''}
            <td>${(d.trang-1)*d.moi_trang+d.danh_sach.indexOf(x)+1}</td><td>${esc(x.so_kiem_ke??'—')}</td><td class="ma">${esc(x.so_quan_ly??x.ma_tb)}</td><td>${esc(x.ten)}</td><td>${esc(x.dvt||'')}</td><td class="giua so">${x.so_luong??'—'}</td><td>${esc(x.so_seri||'—')}</td><td>${esc(x.px||'')}</td><td>${nhanTT(x.trang_thai)}</td><td>${x.danh_gia_ky_thuat??'—'}</td><td>${esc(x.ghi_chu_kiem_ke??x.ghi_chu??'')}</td><td>${x.hidden_from_web&&coQuyenUI('thietbi.unhide')?`<button class="nho" onclick="event.stopPropagation();hienLaiThietBi(${x.id})">Hiện lại</button>`:''}${duocXoa?` <button class="nho nguy-hiem" onclick="event.stopPropagation();xacNhanXoaThietBi([${x.id}])">Xóa</button>`:''}</td></tr>`).join('')}
        </tbody></table>
        <div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:var(--chu-nhat)">
            <span>${d.tong} thiết bị · trang ${d.trang}/${soTrang}</span>
            <span>
              <button class="nho" ${d.trang <= 1 ? 'disabled' : ''} onclick="doiTrang(${d.trang - 1})">Trước</button>
              <button class="nho" ${d.trang >= soTrang ? 'disabled' : ''} onclick="doiTrang(${d.trang + 1})">Sau</button>
            </span></div>`;
}
function doiTrang(n) { boLoc.trang = n; thietBiDaChon.clear(); taiBangThietBi(); }

function capNhatChonThietBi() {
    const label = document.getElementById('device-selected-count');
    const button = document.getElementById('device-delete-selected');
    const hideButton = document.getElementById('device-hide-selected');
    if (label) label.textContent = `Đã chọn ${thietBiDaChon.size} thiết bị`;
    if (button) button.disabled = !thietBiDaChon.size;
    if (hideButton) hideButton.disabled = !thietBiDaChon.size;
}
function xuatThietBi(dayDu){ location.href=`/api/thiet-bi/export/${dayDu?'official':'filtered'}`; }
async function xacNhanAnThietBi(ids){const reason=prompt('Nhập lý do ẩn các thiết bị khỏi web:');if(!reason)return;try{await api('/thiet-bi/bulk-hide',{method:'POST',body:{ids,reason}});thietBiDaChon.clear();await taiBangThietBi();bao(`Đã ẩn ${ids.length} thiết bị`);}catch(e){bao(e.message,'loi');}}
async function hienLaiThietBi(id){try{await api(`/thiet-bi/${id}/unhide`,{method:'POST',body:{}});await taiBangThietBi();bao('Đã hiện lại thiết bị');}catch(e){bao(e.message,'loi');}}
function chonThietBi(id, checked) {
    checked ? thietBiDaChon.add(Number(id)) : thietBiDaChon.delete(Number(id));
    capNhatChonThietBi();
}
function chonTatCaThietBi(checked) {
    document.querySelectorAll('.device-check').forEach(x => {
        x.checked = checked;
        checked ? thietBiDaChon.add(Number(x.dataset.id)) : thietBiDaChon.delete(Number(x.dataset.id));
    });
    capNhatChonThietBi();
}
async function xacNhanXoaThietBi(ids) {
    if (!ids.length) return;
    const confirmText = `XOA ${ids.length}`;
    moHopThoai('Xóa thiết bị nhập sai', `<div class="bao loi"><b>${ids.length} thiết bị</b> sẽ bị ẩn khỏi danh sách và Tổng quan. Toàn bộ hồ sơ liên quan vẫn được giữ để truy vết và có thể khôi phục.</div>
        <div class="o-nhap"><label>Lý do xóa *</label><textarea id="device-delete-reason" placeholder="Ví dụ: Nhập nhầm dữ liệu từ file"></textarea></div>
        ${ids.length > 1 ? `<div class="o-nhap"><label>Nhập chính xác <b>${confirmText}</b></label><input id="device-delete-confirm"></div>` : ''}`,
        [{ ten:'Hủy', chay:dongHopThoai }, { ten:'Xóa', lop:'nguy-hiem', chay:async () => { try {
            const reason = gt('device-delete-reason');
            if (reason.length < 5) return baoTrongHopThoai('Lý do xóa phải có ít nhất 5 ký tự');
            if (ids.length === 1) await api(`/thiet-bi/${ids[0]}`, { method:'DELETE', body:{ reason } });
            else await api('/thiet-bi/bulk-delete', { method:'POST', body:{ ids, reason, confirmation:gt('device-delete-confirm') } });
            ids.forEach(id => thietBiDaChon.delete(Number(id)));
            dongHopThoai(); await taiBangThietBi(); bao(`Đã xóa mềm ${ids.length} thiết bị`);
        } catch (e) { baoTrongHopThoai(e.message); } } }], true);
}
async function moThungRacThietBi() { try {
    const rows = await api('/thiet-bi/deleted');
    moHopThoai('Thiết bị đã xóa', `<div class="bao-bang"><table><thead><tr><th>Mã</th><th>Tên</th><th>PX</th><th>Lý do</th><th>Người xóa</th><th>Thời gian</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td class="ma">${esc(x.ma_tb)}</td><td>${esc(x.ten)}</td><td>${esc(x.px || '')}</td><td>${esc(x.delete_reason)}</td><td>${esc(x.deleted_by_name || '')}</td><td>${esc(x.deleted_at)}</td><td><button onclick="khoiPhucThietBi(${x.id})">Khôi phục</button></td></tr>`).join('') || '<tr><td colspan="7" class="trong">Không có thiết bị đã xóa.</td></tr>'}</tbody></table></div>`, [{ ten:'Đóng', chay:dongHopThoai }], true);
} catch (e) { bao(e.message, 'loi'); } }
async function khoiPhucThietBi(id) { try {
    await api(`/thiet-bi/${id}/restore`, { method:'POST', body:{} });
    dongHopThoai(); await taiBangThietBi(); bao('Đã khôi phục thiết bị');
} catch (e) { baoTrongHopThoai(e.message); } }

/* ---------- Hồ sơ thiết bị ---------- */
async function xemThietBi(id) {
    const d = await api('/thiet-bi/' + id);
    const b = d.thiet_bi;

    const hang = (n, v) => v ? `<tr><td style="color:var(--chu-nhat);width:150px">${n}</td><td>${esc(v)}</td></tr>` : '';

    let h = `<div class="bien-ten">
        <div><div class="ma-lon">${esc(b.ma_tb)}</div>
            <div class="ten-may">${esc(b.ten)}</div>
            <div class="duoi">${esc(b.ma_nhom || '')} · ${esc(b.ten_nhom || '')}${b.ten_nhom_cha ? ' · ' + esc(b.ten_nhom_cha) : ''}</div></div>
        <div class="cot-phai">
            <div>Phân xưởng</div><div class="gt">${esc(b.ten_px || '—')}</div>
            <div style="margin-top:6px">Nguyên giá</div><div class="gt">${tien(b.nguyen_gia) || '—'} đ</div></div>
    </div>

    <div class="the"><h3>Thông tin chung</h3><div class="than-the"><table>
        ${hang('Mã tài sản', b.ma_tscd)}
        ${hang('Loại', tt(b.loai_ts))}
        ${hang('Số seri', b.so_seri)}
        ${hang('Năm sản xuất', b.nam_sx)}
        ${hang('Nước sản xuất', b.nuoc_sx)}
        ${hang('Số lượng', `${b.so_luong ?? '—'} ${b.dvt || ''}`)}
        ${hang('Ngày sử dụng', ngay(b.ngay_su_dung))}
        ${hang('Giá trị còn lại', tien(b.gia_tri_con_lai) ? tien(b.gia_tri_con_lai) + ' đ' : '')}
        ${hang('Vị trí', b.ten_vi_tri)}
        <tr><td style="color:var(--chu-nhat)">Trạng thái</td><td>${nhanTT(b.trang_thai)} ${nhanTT(b.tinh_trang_kt)} ${nhanTT(b.trang_thai_duyet)}</td></tr>
        ${hang('Ghi chú', b.ghi_chu)}
    </table></div></div>`;

    if (d.kiem_dinh.length) {
        h += `<div class="the"><h3>Kiểm định</h3><div class="bao-bang"><table>
            <thead><tr><th>Loại</th><th>Ngày KĐ</th><th>Hết hạn</th><th>Kết quả</th><th>Số giấy CN</th></tr></thead>
            <tbody>${d.kiem_dinh.map(k => `<tr><td>${esc(k.ten_loai)}</td><td>${ngay(k.ngay_kiem_dinh)}</td>
                <td>${ngay(k.ngay_het_han)}</td><td>${nhanTT(k.ket_qua)}</td><td>${esc(k.so_giay_cn || '')}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    if (d.sua_chua.length) {
        h += `<div class="the"><h3>Lịch sử sửa chữa</h3><div class="bao-bang"><table>
            <thead><tr><th>Số phiếu</th><th>Loại</th><th>Bắt đầu</th><th>Nội dung</th><th class="phai">Chi phí</th><th>Trạng thái</th></tr></thead>
            <tbody>${d.sua_chua.map(p => `<tr><td class="ma">${esc(p.so_phieu)}</td><td>${tt(p.loai)}</td>
                <td>${ngay(p.ngay_bat_dau)}</td><td>${esc(p.mo_ta_hu_hong || '')}</td>
                <td class="phai so">${tien(p.tong_chi_phi)}</td><td>${nhanTT(p.trang_thai)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    h += `<div class="the"><h3>Lịch sử vị trí</h3><div class="bao-bang"><table>
        <thead><tr><th>Từ ngày</th><th>Đến ngày</th><th>Phân xưởng</th><th>Vị trí</th></tr></thead>
        <tbody>${d.lich_su_vi_tri.map(l => `<tr><td>${ngay(l.tu_ngay)}</td>
            <td>${l.den_ngay ? ngay(l.den_ngay) : '<span style="color:var(--luc);font-weight:600">hiện tại</span>'}</td>
            <td>${esc(l.px || '')}</td><td>${esc(l.vi_tri || '')}</td></tr>`).join('')}
        </tbody></table></div></div>`;

    const nut = [];
    if (['admin', 'cd_cty'].includes(window.PHIEN.vai_tro) && b.trang_thai_duyet !== 'da_duyet') {
        nut.push({ ten: 'Chuyển lại', lop: 'nguy-hiem', chay: () => chuyenLaiTB(b.id) });
        nut.push({ ten: 'Đồng ý', lop: 'nhan-manh', chay: () => duyetTB(b.id) });
    }
    if (coQuyenUI('thietbi.xoa')) nut.push({ ten:'Xóa', lop:'nguy-hiem', chay:() => { dongHopThoai(); xacNhanXoaThietBi([b.id]); } });
    nut.push({ ten: 'Hồ sơ kỹ thuật', lop: 'nhan-manh',
               chay: () => { dongHopThoai(); moHoSo(b.id); } });
    nut.push({ ten: 'Sửa', chay: () => formThietBi(b) });
    nut.push({ ten: 'Đóng', lop: 'chinh-nut', chay: dongHopThoai });
    moHopThoai('Hồ sơ thiết bị', h, nut, true);
}

async function duyetTB(id) {
    await api(`/thiet-bi/${id}/dong-y`, { method: 'POST' });
    dongHopThoai(); bao('Đã duyệt thiết bị'); taiBangThietBi();
}

function chuyenLaiTB(id) {
    moHopThoai('Chuyển lại phân xưởng', `
        <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:10px">
        Nêu rõ nội dung cần bổ sung hoặc sửa để phân xưởng biết phải làm gì.</p>
        <div class="o-nhap"><label>Lý do chuyển lại</label>
        <textarea id="ly-do" rows="3" placeholder="Ví dụ: thiếu số seri và ngày đưa vào sử dụng"></textarea></div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Chuyển lại', lop: 'nguy-hiem', chay: async () => {
             const l = gt('ly-do');
             if (!l) return baoTrongHopThoai('Phải nhập lý do chuyển lại');
             try {
                 await api(`/thiet-bi/${id}/chuyen-lai`, { method: 'POST', body: { ly_do: l } });
                 dongHopThoai(); bao('Đã chuyển lại phân xưởng', 'nhac'); taiBangThietBi();
             } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* ---------- Thêm / sửa thiết bị ---------- */
function formThietBi(b = null) {
    const nhom2 = (window.DS_NHOM || []).filter(n => n.cap === 2);
    const pxs = window.DS_PX || [];
    const laPX = window.PHIEN.vai_tro === 'px';

    moHopThoai(b ? 'Sửa thiết bị' : 'Thêm thiết bị', `
        <div class="o-nhap"><label>Tên thiết bị *</label>
            <input id="f-ten" value="${esc(b?.ten || '')}" placeholder="Ví dụ: Máng cào SGB-620/40T"></div>
        <div class="hang">
            <div class="o-nhap"><label>Nhóm thiết bị *</label><select id="f-nhom">
                <option value="">— Chọn nhóm —</option>
                ${nhom2.map(n => `<option value="${n.id}" ${b?.nhom_id === n.id ? 'selected' : ''}>${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}
            </select></div>
            ${laPX ? '' : `<div class="o-nhap"><label>Phân xưởng *</label><select id="f-px">
                <option value="">— Chọn —</option>
                ${pxs.map(p => `<option value="${p.id}" ${b?.phan_xuong_id === p.id ? 'selected' : ''}>${esc(p.ten_ngan || p.ma)}</option>`).join('')}
            </select></div>`}
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Mã tài sản</label><input id="f-tscd" value="${esc(b?.ma_tscd || '')}"></div>
            <div class="o-nhap"><label>Loại</label><select id="f-loai">
                <option value="TSCD" ${b?.loai_ts === 'TSCD' ? 'selected' : ''}>TSCĐ</option>
                <option value="CCDC" ${b?.loai_ts === 'CCDC' ? 'selected' : ''}>CCDC</option></select></div>
            <div class="o-nhap"><label>Số seri</label><input id="f-seri" value="${esc(b?.so_seri || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số lượng</label><input id="f-sl" value="${b?.so_luong ?? 1}"></div>
            <div class="o-nhap"><label>ĐVT</label><input id="f-dvt" value="${esc(b?.dvt || 'Cái')}"></div>
            <div class="o-nhap"><label>Năm SX</label><input id="f-nam" value="${b?.nam_sx || ''}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Nguyên giá (đ)</label><input id="f-ng" value="${b?.nguyen_gia || ''}"></div>
            <div class="o-nhap"><label>Giá trị còn lại (đ)</label><input id="f-gtcl" value="${b?.gia_tri_con_lai || ''}"></div>
            <div class="o-nhap"><label>Ngày sử dụng</label><input id="f-ngay" type="date" value="${b?.ngay_su_dung || ''}"></div>
        </div>
        <div class="o-nhap"><label>Ghi chú</label><input id="f-gc" value="${esc(b?.ghi_chu || '')}"></div>
        ${b ? '' : '<div class="ghi-nho">Mã thiết bị sinh tự động theo phân xưởng và nhóm, ví dụ DL1.VT01.003.</div>'}`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: b ? 'Lưu thay đổi' : 'Thêm thiết bị', lop: 'chinh-nut', chay: async () => {
            const body = {
                ten: gt('f-ten'), nhom_id: gt('f-nhom') || null,
                phan_xuong_id: laPX ? null : (gt('f-px') || null),
                ma_tscd: gt('f-tscd') || null, loai_ts: gt('f-loai'), so_seri: gt('f-seri') || null,
                so_luong: so('f-sl') ?? 1, dvt: gt('f-dvt'), nam_sx: so('f-nam'),
                nguyen_gia: so('f-ng') ?? 0, gia_tri_con_lai: so('f-gtcl') ?? 0,
                ngay_su_dung: gt('f-ngay') || null, ghi_chu: gt('f-gc') || null
            };
            if (!body.ten) return baoTrongHopThoai('Nhập tên thiết bị');
            if (!body.nhom_id) return baoTrongHopThoai('Chọn nhóm thiết bị');
            if (!laPX && !body.phan_xuong_id) return baoTrongHopThoai('Chọn phân xưởng');
            try {
                if (b) await api('/thiet-bi/' + b.id, { method: 'PUT', body });
                else {
                    const kq = await api('/thiet-bi', { method: 'POST', body });
                    bao('Đã thêm thiết bị ' + kq.ma_tb);
                }
                dongHopThoai(); taiBangThietBi();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

/* =========================== CẢNH BÁO =========================== */
async function mhCanhBao(el) {
    el.innerHTML = `<div class="dau-trang"><div>
        <div class="eyebrow">An toàn thiết bị</div><h2>Cảnh báo hạn</h2>
        <div class="phu">Kiểm định, đo cách điện và bảo dưỡng đến hạn hoặc đã quá hạn</div></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;

    const d = await api('/tong-hop/canh-bao');
    let h = '';

    const bangKD = (ds, tieuDe) => !ds.length ? '' : `
        <div class="the"><h3>${tieuDe} (${ds.length})</h3><div class="bao-bang"><table>
        <thead><tr><th>Mã thiết bị</th><th>Tên</th><th>PX</th><th>Loại kiểm định</th>
            <th>Hết hạn</th><th class="phai">Còn lại</th><th>Mức</th></tr></thead>
        <tbody>${ds.map(x => `<tr class="bam" onclick="xemThietBi(${x.thiet_bi_id})">
            <td class="ma">${esc(x.ma_tb)}</td><td>${esc(x.ten_tb)}</td><td>${esc(x.px || '')}</td>
            <td>${esc(x.loai_kiem_dinh)}</td><td>${ngay(x.ngay_het_han)}</td>
            <td class="phai so">${x.con_lai_ngay < 0 ? 'quá ' + (-x.con_lai_ngay) + ' ngày' : x.con_lai_ngay + ' ngày'}</td>
            <td>${nhanTT(x.muc_canh_bao)}</td></tr>`).join('')}
        </tbody></table></div></div>`;

    h += bangKD(d.kiem_dinh.filter(x => x.muc_canh_bao === 'qua_han'), 'Kiểm định đã quá hạn');
    h += bangKD(d.kiem_dinh.filter(x => x.muc_canh_bao === 'sap_het_han'), 'Kiểm định sắp hết hạn');

    if (d.bao_duong.length) {
        h += `<div class="the"><h3>Bảo dưỡng đến hạn (${d.bao_duong.length})</h3><div class="bao-bang"><table>
            <thead><tr><th>Mã thiết bị</th><th>Tên</th><th>PX</th><th>Cấp BD</th>
                <th>Lần trước</th><th>Hạn kế tiếp</th><th>Mức</th></tr></thead>
            <tbody>${d.bao_duong.map(x => `<tr class="bam" onclick="xemThietBi(${x.thiet_bi_id})">
                <td class="ma">${esc(x.ma_tb)}</td><td>${esc(x.ten_tb)}</td><td>${esc(x.px || '')}</td>
                <td>${tt(x.cap_bd)}</td><td>${ngay(x.lan_cuoi)}</td><td>${ngay(x.lan_ke_tiep)}</td>
                <td>${nhanTT(x.muc_canh_bao)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    if (d.thieu_kiem_dinh.length) {
        h += `<div class="the"><h3>Chưa có hồ sơ kiểm định (${d.thieu_kiem_dinh.length})</h3>
            <div class="than-the" style="padding-bottom:0"><div class="bao nhac">
            Các thiết bị này thuộc nhóm bắt buộc kiểm định nhưng chưa có hồ sơ nào trong hệ thống.
            Cập nhật hồ sơ kiểm định gần nhất để hệ thống theo dõi hạn.</div></div>
            <div class="bao-bang"><table>
            <thead><tr><th>Mã thiết bị</th><th>Tên</th><th>PX</th><th>Loại kiểm định cần có</th></tr></thead>
            <tbody>${d.thieu_kiem_dinh.map(x => `<tr class="bam" onclick="xemThietBi(${x.thiet_bi_id})">
                <td class="ma">${esc(x.ma_tb)}</td><td>${esc(x.ten_tb)}</td>
                <td>${esc(x.px || '')}</td><td>${esc(x.loai_kiem_dinh)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    document.getElementById('noi-dung').innerHTML = h ||
        `<div class="the"><div class="than-the trong">Không có cảnh báo nào. Toàn bộ thiết bị còn trong hạn.</div></div>`;
}

/* =========================== QUẢN TRỊ =========================== */
async function mhQuanTri(el) {
    el.innerHTML = `<div class="dau-trang"><div>
        <div class="eyebrow">Quản trị hệ thống</div><h2>Phân xưởng & tài khoản</h2></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;

    const [pxs, tks, hienThi] = await Promise.all([
        api('/danh-muc/phan-xuong?tat_ca=1'), api('/auth/tai-khoan'), api('/function-visibility')]);
    window.DS_PX = pxs;
    const hienThiPx = hienThi.filter(x => x.role_code === 'px');

    document.getElementById('noi-dung').innerHTML = `
    <div class="the">
        <h3>Phân xưởng</h3>
        <div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formPhanXuong()">Thêm phân xưởng</button>
        </div>
        <div class="bao-bang"><table>
            <thead><tr><th>Mã</th><th>Tên phân xưởng</th><th>Quản đốc</th><th>Cơ điện trưởng</th>
                <th class="phai">Nhân lực</th><th class="phai">Thiết bị</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>${pxs.length ? pxs.map(p => `<tr>
                <td class="ma">${esc(p.ma)}</td><td>${esc(p.ten)}</td>
                <td>${esc(p.quan_doc || '')}</td><td>${esc(p.co_dien_truong || '')}</td>
                <td class="phai so">${p.so_nhan_luc || ''}</td>
                <td class="phai so">${p.so_thiet_bi || 0}</td>
                <td>${p.hoat_dong ? '<span class="nhan-tt tt-hoat_dong">Hoạt động</span>'
                                  : '<span class="nhan-tt tt-du_phong">Ngừng</span>'}</td>
                <td class="phai" style="white-space:nowrap">
                    <button class="nho" onclick='formPhanXuong(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Sửa</button>
                    <button class="nho nguy-hiem" onclick="xoaPhanXuong(${p.id},'${esc(p.ma)}')">Xoá</button></td>
                </tr>`).join('') : '<tr><td colspan="8" class="trong">Chưa có phân xưởng nào. Thêm phân xưởng đầu tiên để bắt đầu.</td></tr>'}
            </tbody></table></div>
    </div>

    <div class="the">
        <h3>Tài khoản</h3>
        <div class="than-the" style="padding-bottom:8px">
            <button class="chinh-nut" onclick="formTaiKhoan()">Thêm tài khoản</button>
        </div>
        <div class="bao-bang"><table>
            <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Phân xưởng</th>
                <th>Đăng nhập gần nhất</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>${tks.map(u => `<tr>
                <td class="ma">${esc(u.ten_dang_nhap)}</td><td>${esc(u.ho_ten || '')}</td>
                <td>${tt(u.vai_tro)}</td><td>${esc(u.px || '')}</td>
                <td style="font-size:12px">${esc(u.lan_dang_nhap || 'chưa đăng nhập')}</td>
                <td>${u.tam_thoi ? '<span class="nhan-tt tt-cho_duyet">Tạm 24h</span> ' : ''}
                    ${u.hoat_dong ? '<span class="nhan-tt tt-hoat_dong">Hoạt động</span>'
                                  : '<span class="nhan-tt tt-qua_han">Khoá</span>'}</td>
                <td class="phai"><button class="nho" onclick="formPhanCapTaiKhoan(${u.id})">Phân quyền</button> ${u.ten_dang_nhap === 'admin' ? '' :
                    `<button class="nho nguy-hiem" onclick="xoaTaiKhoan(${u.id},'${esc(u.ten_dang_nhap)}')">Xoá</button>`}</td>
                </tr>`).join('')}
            </tbody></table></div>
    </div>

    <div class="the"><h3>Giao diện tài khoản Phân xưởng</h3><div class="than-the">
        <p class="ghi-nho">Chỉ hiển thị những chức năng Phân xưởng thực sự sử dụng. Quyền truy cập và phạm vi dữ liệu trên máy chủ vẫn được kiểm tra độc lập.</p>
        <div class="hang" style="align-items:stretch">
            ${hienThiPx.map(x => `<label class="o-nhap" style="min-width:210px;display:flex;flex-direction:row;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--vien,#e4e7ec);border-radius:8px">
                <input type="checkbox" ${x.enabled ? 'checked' : ''}
                    onchange="luuHienThiChucNang('${esc(x.screen_code)}',this.checked,this)" style="width:auto">
                <span>${esc(CAC_MAN_HINH[x.screen_code]?.ten || x.screen_code)}</span>
            </label>`).join('')}
        </div>
    </div></div>

    <div class="the"><h3>Tên hiển thị</h3><div class="than-the">
        <div class="hang">
            <div class="o-nhap"><label>Tiêu đề hệ thống</label>
                <input id="ch-ht" value="${esc(window.CAU_HINH?.ten_he_thong || '')}"></div>
            <div class="o-nhap"><label>Tên đơn vị</label>
                <input id="ch-cty" value="${esc(window.CAU_HINH?.ten_cong_ty || '')}"></div>
            <div class="hep"><button onclick="luuCauHinh()">Lưu</button></div>
        </div>
    </div></div>`;
}

async function luuHienThiChucNang(screen, enabled, checkbox) {
    checkbox.disabled = true;
    try {
        await api('/function-visibility/px/' + encodeURIComponent(screen), {
            method: 'PUT', body: { enabled }
        });
        bao(`Đã ${enabled ? 'hiện' : 'ẩn'} chức năng ${CAC_MAN_HINH[screen]?.ten || screen} cho tài khoản Phân xưởng`);
    } catch (e) {
        checkbox.checked = !enabled;
        bao(e.message, 'loi');
    } finally { checkbox.disabled = false; }
}

function formPhanXuong(p = null) {
    moHopThoai(p ? 'Sửa phân xưởng' : 'Thêm phân xưởng', `
        <div class="hang">
            <div class="o-nhap" style="flex:0 0 110px"><label>Mã *</label>
                <input id="px-ma" value="${esc(p?.ma || '')}" placeholder="DL1"></div>
            <div class="o-nhap"><label>Tên phân xưởng *</label>
                <input id="px-ten" value="${esc(p?.ten || '')}" placeholder="Phân xưởng Đào lò 1"></div>
            <div class="o-nhap" style="flex:0 0 110px"><label>Tên ngắn</label>
                <input id="px-ngan" value="${esc(p?.ten_ngan || '')}" placeholder="DL1"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Quản đốc</label><input id="px-qd" value="${esc(p?.quan_doc || '')}"></div>
            <div class="o-nhap"><label>Cơ điện trưởng</label><input id="px-cd" value="${esc(p?.co_dien_truong || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số nhân lực</label><input id="px-nl" value="${p?.so_nhan_luc || ''}"></div>
            <div class="o-nhap"><label>Thứ tự hiển thị</label><input id="px-tt" value="${p?.thu_tu || ''}"></div>
            <div class="o-nhap"><label>Trạng thái</label><select id="px-hd">
                <option value="1" ${p?.hoat_dong !== 0 ? 'selected' : ''}>Hoạt động</option>
                <option value="0" ${p?.hoat_dong === 0 ? 'selected' : ''}>Ngừng hoạt động</option></select></div>
        </div>
        <div class="ghi-nho">Mã phân xưởng dùng làm tiền tố mã thiết bị nên đặt ngắn, viết hoa, không dấu.</div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: p ? 'Lưu' : 'Thêm', lop: 'chinh-nut', chay: async () => {
            const body = {
                ma: gt('px-ma'), ten: gt('px-ten'), ten_ngan: gt('px-ngan') || gt('px-ma'),
                quan_doc: gt('px-qd'), co_dien_truong: gt('px-cd'),
                so_nhan_luc: so('px-nl') ?? 0, thu_tu: so('px-tt') ?? 0,
                hoat_dong: gt('px-hd') === '1' ? 1 : 0
            };
            if (!body.ma || !body.ten) return baoTrongHopThoai('Nhập mã và tên phân xưởng');
            try {
                if (p) await api('/danh-muc/phan-xuong/' + p.id, { method: 'PUT', body });
                else await api('/danh-muc/phan-xuong', { method: 'POST', body });
                dongHopThoai(); veManHinh(); bao('Đã lưu phân xưởng');
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function xoaPhanXuong(id, ma) {
    if (!confirm(`Xoá phân xưởng ${ma}?`)) return;
    try {
        await api('/danh-muc/phan-xuong/' + id, { method: 'DELETE' });
        veManHinh(); bao('Đã xoá phân xưởng ' + ma);
    } catch (e) { bao(e.message, 'loi'); }
}

function formTaiKhoan() {
    const pxs = window.DS_PX || [];
    moHopThoai('Thêm tài khoản', `
        <div class="hang">
            <div class="o-nhap"><label>Tên đăng nhập *</label><input id="tk-ten" placeholder="cddl1"></div>
            <div class="o-nhap"><label>Mật khẩu * (8–128 ký tự)</label>
                <input id="tk-mk" type="password" minlength="8" maxlength="128"
                    autocomplete="new-password" oninput="capNhatLoiMatKhau('tk-mk','tk-mk-loi')">
                <div id="tk-mk-loi" class="loi-truong" aria-live="polite"></div></div>
        </div>
        <div class="o-nhap"><label>Họ tên</label><input id="tk-hoten"></div>
        <div class="hang">
            <div class="o-nhap"><label>Vai trò *</label><select id="tk-vt" onchange="doiVaiTro()">
                <option value="px">Cơ điện phân xưởng — nhập liệu phân xưởng mình</option>
                <option value="cd_cty">Cơ điện công ty — xem toàn công ty, duyệt</option>
                <option value="xem">Chỉ xem</option>
                <option value="admin">Quản trị hệ thống</option></select></div>
        </div>
        <div class="o-nhap" id="o-px"><label>Phân xưởng *</label><select id="tk-px">
            <option value="">— Chọn —</option>
            ${pxs.filter(p => p.hoat_dong).map(p => `<option value="${p.id}">${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}
        </select></div>
        <div class="o-nhap"><label><input type="checkbox" id="tk-tam" style="width:auto;margin-right:6px">
            Tài khoản tạm, tự hết hạn sau 24 giờ</label></div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Thêm tài khoản', lop: 'chinh-nut', chay: async () => {
            const matKhau = document.getElementById('tk-mk').value;
            const body = {
                ten_dang_nhap: gt('tk-ten'), mat_khau: matKhau, ho_ten: gt('tk-hoten'),
                vai_tro: gt('tk-vt'), phan_xuong_id: gt('tk-px') || null,
                tam_thoi: document.getElementById('tk-tam').checked ? 1 : 0
            };
            if (!body.ten_dang_nhap || !body.mat_khau) return baoTrongHopThoai('Nhập tên đăng nhập và mật khẩu');
            const loiMatKhau = capNhatLoiMatKhau('tk-mk', 'tk-mk-loi');
            if (loiMatKhau) return baoTrongHopThoai(loiMatKhau);
            try {
                await api('/auth/tai-khoan', { method: 'POST', body });
                dongHopThoai(); veManHinh(); bao('Đã tạo tài khoản');
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

function doiVaiTro() {
    document.getElementById('o-px').style.display = gt('tk-vt') === 'px' ? '' : 'none';
}

async function formPhanCapTaiKhoan(id) {
    try {
        const d=await api(`/auth/tai-khoan/${id}/phan-cap`), pxs=(window.DS_PX||[]).filter(x=>x.hoat_dong);
        const managed=new Set(d.units.filter(x=>x.access_type==='MANAGE').map(x=>Number(x.unit_id)));
        const viewed=new Set(d.units.filter(x=>x.access_type==='VIEW').map(x=>Number(x.unit_id)));
        const explicit=new Map(d.overrides.map(x=>[x.ma_quyen,!!x.duoc_phep]));
        const effective=new Set(d.effective_permissions||[]);
        const unitRows=pxs.map(p=>`<tr><td>${esc(p.ten_ngan||p.ma)} — ${esc(p.ten)}</td>
          <td class="giua"><input class="pc-manage" data-unit="${p.id}" type="checkbox" ${managed.has(Number(p.id))?'checked':''} onchange="dongBoPhamVi(this,'manage')"></td>
          <td class="giua"><input class="pc-view" data-unit="${p.id}" type="checkbox" ${viewed.has(Number(p.id))?'checked':''} onchange="dongBoPhamVi(this,'view')"></td></tr>`).join('');
        moHopThoai('Phân cấp: '+(d.user.ho_ten||d.user.ten_dang_nhap),`
          <div class="o-nhap"><label>Cấp độ tài khoản</label><select id="pc-level">${d.levels.map(x=>`<option value="${x.code}" ${x.code===(d.level?.level_code||'VIEW_ONLY')?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
          <label class="o-nhap"><input id="pc-self" type="checkbox" style="width:auto" ${d.level?.allow_self_approval?'checked':''}> Cho phép tự duyệt dữ liệu do chính tài khoản tạo</label>
          <h4>Phạm vi đơn vị</h4><p class="ghi-nho">Quản lý: được thao tác/duyệt nếu có quyền. Chỉ xem: không thể duyệt.</p>
          <div class="bao-bang" style="max-height:230px"><table><thead><tr><th>Phân xưởng</th><th>Quản lý</th><th>Chỉ xem</th></tr></thead><tbody>${unitRows}</tbody></table></div>
          <h4>Quyền nghiệp vụ</h4><div class="hang" style="align-items:stretch">${d.permissions.map(q=>{const on=explicit.has(q.ma)?explicit.get(q.ma):effective.has(q.ma);return `<label class="o-nhap" style="min-width:220px;display:flex;flex-direction:row;gap:8px"><input class="pc-perm" type="checkbox" value="${esc(q.ma)}" ${on?'checked':''} style="width:auto"><span>${esc(q.ten)}</span></label>`}).join('')}</div>`,
          [{ten:'Hủy',chay:dongHopThoai},{ten:'Lưu phân quyền',lop:'chinh-nut',chay:()=>luuPhanCapTaiKhoan(id)}],true);
    } catch(e){bao(e.message,'loi');}
}
function dongBoPhamVi(el,type){const id=el.dataset.unit;if(el.checked)document.querySelector(`.${type==='manage'?'pc-view':'pc-manage'}[data-unit="${id}"]`).checked=false;}
async function luuPhanCapTaiKhoan(id){
    const ids=sel=>[...document.querySelectorAll(sel+':checked')].map(x=>Number(x.dataset.unit));
    const body={level_code:gt('pc-level'),allow_self_approval:document.getElementById('pc-self').checked,
      managed_unit_ids:ids('.pc-manage'),view_unit_ids:ids('.pc-view'),permissions:[...document.querySelectorAll('.pc-perm:checked')].map(x=>x.value)};
    try{await api(`/auth/tai-khoan/${id}/phan-cap`,{method:'PUT',body});dongHopThoai();bao('Đã lưu phân cấp và phạm vi tài khoản');}
    catch(e){baoTrongHopThoai(e.message);}
}

async function xoaTaiKhoan(id, ten) {
    if (!confirm(`Xoá tài khoản ${ten}?`)) return;
    try { await api('/auth/tai-khoan/' + id, { method: 'DELETE' }); veManHinh(); bao('Đã xoá tài khoản'); }
    catch (e) { bao(e.message, 'loi'); }
}

async function luuCauHinh() {
    try {
        await api('/danh-muc/cau-hinh/ten_he_thong', { method: 'PUT', body: { gia_tri: gt('ch-ht') } });
        await api('/danh-muc/cau-hinh/ten_cong_ty', { method: 'PUT', body: { gia_tri: gt('ch-cty') } });
        window.CAU_HINH.ten_he_thong = gt('ch-ht');
        window.CAU_HINH.ten_cong_ty = gt('ch-cty');
        veKhung(); bao('Đã lưu tên hiển thị');
    } catch (e) { bao(e.message, 'loi'); }
}
