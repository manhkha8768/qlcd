/* TASK 2 - Màn hình Asset Master, tách khỏi hồ sơ kỹ thuật thiết bị. */
let locTaiSan = { q: '', loai: '', nhom: '', trang_thai: '', don_vi_id: '', tinh_trang_ky_thuat: '', serial: '', nam_san_xuat: '', trang: 1 };

function thamSoDanhSachTaiSan() {
    return { q: locTaiSan.q, loai: locTaiSan.loai, nhom: locTaiSan.nhom,
        trang_thai: locTaiSan.trang_thai, don_vi_id: locTaiSan.don_vi_id,
        tinh_trang_ky_thuat: locTaiSan.tinh_trang_ky_thuat, serial: locTaiSan.serial,
        nam_san_xuat: locTaiSan.nam_san_xuat, trang: locTaiSan.trang };
}

async function mhTaiSan(el) {
    const route = THAM_SO_MAN_HINH || {};
    locTaiSan = {
        q: route.q || '', loai: route.loai || '', nhom: route.nhom || '',
        trang_thai: route.trang_thai || '', don_vi_id: route.don_vi_id || '',
        tinh_trang_ky_thuat: route.tinh_trang_ky_thuat || '', serial: route.serial || '',
        nam_san_xuat: route.nam_san_xuat || '',
        trang: Math.max(1, Number(route.trang) || 1)
    };
    el.innerHTML = `<div class="dau-trang"><div><div class="eyebrow">Asset Master</div>
        <h2 id="tieu-de-ts">TSCĐ / CCDC</h2><div class="phu" id="pham-vi-ts"></div></div><div>
        ${coQuyenUI('asset.import') ? '<button onclick="taiMauTaiSan()">Mẫu import</button><button onclick="chonImportTaiSan()">Import Excel</button>' : ''}
        ${coQuyenUI('asset.export') ? '<button onclick="xuatTaiSan()">Xuất Excel</button>' : ''}
        ${(coQuyenUI('asset.sheet.export')||coQuyenUI('asset.sheet.import')||coQuyenUI('asset.sheet.approve')) ? '<button onclick="moDongBoGoogleSheet()">Google Sheets</button>' : ''}
        ${coQuyenUI('asset.create') ? '<button class="chinh-nut" onclick="formTaiSan()">Thêm tài sản</button>' : ''}</div></div>
        <div id="bao-ts"></div><div class="luoi-so asset-kpi" id="asset-kpi"></div><div class="thanh-loc" id="loc-ts"></div>
        <div class="the"><div id="bang-ts" class="bao-bang">Đang tải…</div></div>
        <input id="file-import-ts" type="file" accept=".xlsx" hidden>`;
    const units = await api('/danh-muc/phan-xuong');
    window.DS_DON_VI_TS = units;
    const selectedUnit = units.find(x => String(x.id) === String(locTaiSan.don_vi_id));
    if (selectedUnit) {
        document.getElementById('tieu-de-ts').textContent = `TSCĐ / CCDC — ${selectedUnit.ten_ngan || selectedUnit.ma} — ${selectedUnit.ten}`;
        document.getElementById('pham-vi-ts').textContent = 'Đang lọc theo phân xưởng đã chọn từ Dashboard';
    }
    document.getElementById('loc-ts').innerHTML = `
        <input class="lon" id="ts-q" placeholder="Tìm mã, tên, nhóm tài sản…" value="${esc(locTaiSan.q)}">
        <select id="ts-loai"><option value="">TSCĐ + CCDC</option><option value="TSCD">TSCĐ</option><option value="CCDC">CCDC</option></select>
        <input id="ts-nhom" placeholder="Nhóm tài sản" value="${esc(locTaiSan.nhom)}">
        <select id="ts-trang-thai"><option value="">Mọi trạng thái</option>
            ${['cho_duyet','dang_su_dung','tam_ngung','dang_dieu_chuyen','cho_thanh_ly','da_thanh_ly']
                .map(x => `<option value="${x}">${tt(x)}</option>`).join('')}</select>
        <select id="ts-dv"><option value="">Tất cả đơn vị được phép</option>${units.map(x =>
            `<option value="${x.id}">${esc(x.ten_ngan || x.ma)} — ${esc(x.ten)}</option>`).join('')}</select>
        <button onclick="document.getElementById('loc-ts-nang-cao').classList.toggle('an')">Bộ lọc nâng cao</button>
        <button onclick="apDungLocTaiSan()">Lọc</button>
        <div id="loc-ts-nang-cao" class="advanced-filter ${locTaiSan.tinh_trang_ky_thuat||locTaiSan.serial||locTaiSan.nam_san_xuat?'':'an'}">
            <select id="ts-kt"><option value="">Mọi tình trạng kỹ thuật</option>${['tot','trung_binh','kem','hong'].map(x=>`<option value="${x}">${tt(x)}</option>`).join('')}</select>
            <input id="ts-serial" placeholder="Serial" value="${esc(locTaiSan.serial)}">
            <input id="ts-year" type="number" min="1900" max="2200" placeholder="Năm sản xuất" value="${esc(locTaiSan.nam_san_xuat)}">
            <button onclick="xoaLocTaiSan()">Xóa bộ lọc</button>
        </div>`;
    document.getElementById('ts-loai').value = locTaiSan.loai;
    document.getElementById('ts-trang-thai').value = locTaiSan.trang_thai;
    document.getElementById('ts-dv').value = locTaiSan.don_vi_id;
    document.getElementById('ts-kt').value = locTaiSan.tinh_trang_ky_thuat;
    document.getElementById('ts-q').onkeydown = e => { if (e.key === 'Enter') apDungLocTaiSan(); };
    document.getElementById('ts-nhom').onkeydown = e => { if (e.key === 'Enter') apDungLocTaiSan(); };
    ['ts-loai', 'ts-trang-thai', 'ts-dv'].forEach(id => { document.getElementById(id).onchange = apDungLocTaiSan; });
    document.getElementById('file-import-ts').onchange = importTaiSan;
    await taiBangTaiSan();
    if (route.asset_id) await hienThiHoSoTaiSan(route.asset_id);
    else if (route.asset_code) {
        const resolved = await api('/tai-san/by-code/' + encodeURIComponent(route.asset_code));
        await dieuHuong('tai-san', { ...thamSoDanhSachTaiSan(), asset_id: resolved.id }, { thayThe: true });
    }
}

function apDungLocTaiSan() {
    locTaiSan = { q: gt('ts-q'), loai: gt('ts-loai'), nhom: gt('ts-nhom'),
        trang_thai: gt('ts-trang-thai'), don_vi_id: gt('ts-dv'),
        tinh_trang_ky_thuat: gt('ts-kt'), serial: gt('ts-serial'), nam_san_xuat: gt('ts-year'), trang: 1 };
    capNhatUrlHienTai(thamSoDanhSachTaiSan());
    taiBangTaiSan();
}
function xoaLocTaiSan() {
    locTaiSan = { q:'',loai:'',nhom:'',trang_thai:'',don_vi_id:'',tinh_trang_ky_thuat:'',serial:'',nam_san_xuat:'',trang:1 };
    dieuHuong('tai-san', locTaiSan, { thayThe:true });
}

async function taiBangTaiSan() {
    const query = new URLSearchParams({ ...locTaiSan, moi_trang: 50 });
    const [data, summary] = await Promise.all([api('/tai-san?' + query), api('/tai-san/summary?' + query)]);
    const kpi = document.getElementById('asset-kpi');
    if (kpi) kpi.innerHTML = [
        ['Tổng thiết bị', summary.tong, '', ''], ['Đang hoạt động', summary.hoat_dong, 'dang_su_dung', 'tot'],
        ['Hỏng', summary.hong, 'hong', 'nguy'], ['Sửa chữa', summary.sua_chua, 'dang_sua', 'canh-bao'],
        ['TSCĐ', summary.tscd, '', ''], ['CCDC', summary.ccdc, '', '']
    ].map(([label, value, status, css]) => `<button class="o-so ${css}" onclick="locNhanhTaiSan('${status}')"><span class="nhan">${label}</span><strong class="gt">${value}</strong><span class="ghi">Nhấn để lọc</span></button>`).join('');
    const el = document.getElementById('bang-ts');
    if (!data.tong) {
        el.innerHTML = `<div class="trong">${locTaiSan.don_vi_id
            ? 'Phân xưởng này chưa có TSCĐ/CCDC' : 'Không có tài sản phù hợp.'}</div>`;
        return;
    }
    const pages = Math.ceil(data.tong / data.moi_trang);
    el.innerHTML = `<table class="asset-table"><thead><tr><th>Mã</th><th>Tên thiết bị</th><th>Serial</th>
        <th>Đơn vị</th><th>Trạng thái</th><th class="phai">Tổng giờ</th><th>Actions</th></tr></thead>
        <tbody>${data.danh_sach.map(x => { const href = taoHash('tai-san', { ...thamSoDanhSachTaiSan(), asset_id: x.id }); return `<tr class="bam" tabindex="0" role="link"
        onclick="moXemNhanhTaiSan(${x.id},event)" onkeydown="moXemNhanhTaiSan(${x.id},event)">
        <td class="ma"><a href="${href}" onclick="moHoSoTaiSanTuLienKet(${x.id},event)">${esc(x.ma_tai_san)}</a></td>
        <td><a href="${href}" onclick="moHoSoTaiSanTuLienKet(${x.id},event)">${esc(x.ten)}</a><div class="mo">${esc(x.ma_thiet_bi || x.nhom_tai_san || '')}</div></td>
        <td class="ma">${esc(x.so_seri || '—')}</td><td>${esc(x.don_vi || '')}</td>
        <td>${nhanTT(x.tinh_trang_ky_thuat || x.trang_thai)}</td><td class="phai so">${Number(x.gio_chay_luy_ke || 0).toLocaleString('vi-VN')}h</td>
        <td><button class="nho" onclick="moHoSoTaiSanTuLienKet(${x.id},event)">Mở hồ sơ</button></td></tr>`; }).join('')}</tbody></table>
        <div class="asset-card-list">${data.danh_sach.map(x => `<article class="asset-card" onclick="moXemNhanhTaiSan(${x.id},event)">
            <div><strong>${esc(x.ten)}</strong><span class="ma">${esc(x.ma_tai_san)}</span></div>${nhanTT(x.tinh_trang_ky_thuat || x.trang_thai)}
            <p>${esc(x.don_vi || '')} · ${esc(x.so_seri || 'Chưa có serial')}</p><p>${Number(x.gio_chay_luy_ke || 0).toLocaleString('vi-VN')} giờ</p>
            <button onclick="moHoSoTaiSanTuLienKet(${x.id},event)">Mở hồ sơ</button></article>`).join('')}</div>
        <div style="padding:10px;display:flex;justify-content:space-between"><span>${data.tong} tài sản · trang ${data.trang}/${pages}</span>
        <span><button ${data.trang<=1?'disabled':''} onclick="trangTaiSan(${data.trang-1})">Trước</button>
        <button ${data.trang>=pages?'disabled':''} onclick="trangTaiSan(${data.trang+1})">Sau</button></span></div>`;
}
function locNhanhTaiSan(status) {
    locTaiSan.trang_thai = status; locTaiSan.trang = 1;
    const select = document.getElementById('ts-trang-thai'); if (select) select.value = status;
    capNhatUrlHienTai(thamSoDanhSachTaiSan()); taiBangTaiSan();
}

async function moXemNhanhTaiSan(id, event) {
    if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event?.target?.closest?.('a,button,input,select,textarea')) return;
    event?.preventDefault();
    const data = await api('/tai-san/' + id); const a = data.tai_san;
    moHopThoai('Xem nhanh thiết bị', `<div class="quick-asset-head"><div><strong>${esc(a.ten)}</strong><div class="ma">${esc(a.ma_tai_san)}</div></div>${nhanTT(a.trang_thai)}</div>
        <div class="luoi-2 quick-asset-stats"><div><span>Đơn vị</span><b>${esc(a.ten_don_vi)}</b></div><div><span>Vị trí</span><b>${esc(a.ten_vi_tri || 'Chưa cập nhật')}</b></div>
        <div><span>Loại</span><b>${tt(a.loai_tai_san)}</b></div><div><span>Số lượng</span><b>${a.so_luong} ${esc(a.dvt)}</b></div></div>
        <div class="bao tin">${data.device_id ? 'Đã liên kết hồ sơ kỹ thuật canonical.' : 'Chưa liên kết Device Master; chỉ hiển thị hồ sơ tài sản.'}</div>`,
        [{ ten: 'Đóng', chay: dongHopThoai }, { ten: 'Mở Asset 360', lop: 'chinh-nut', chay: () => { dongHopThoai(); moHoSoTaiSan(id); }}], true);
}
function trangTaiSan(page) {
    locTaiSan.trang = page; capNhatUrlHienTai(thamSoDanhSachTaiSan()); taiBangTaiSan();
}

function moHoSoTaiSanTuLienKet(id, event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;
    event.preventDefault(); event.stopPropagation(); moHoSoTaiSan(id);
}

function moHoSoTaiSan(id, event) {
    if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event?.target?.closest?.('a,button,input,select,textarea')) return;
    event?.preventDefault();
    dieuHuong('tai-san', { ...thamSoDanhSachTaiSan(), asset_id: id });
}

async function hienThiHoSoTaiSan(id) {
    const data = await api('/tai-san/' + id); const a = data.tai_san;
    if (data.device_id) {
        return moHskt(data.device_id, 'tong-quan', { screen: 'tai-san', params: thamSoDanhSachTaiSan() });
    }
    const row = (name, value) => `<tr><td style="width:170px;color:var(--chu-nhat)">${name}</td><td>${esc(value ?? '—')}</td></tr>`;
    document.getElementById('chinh').innerHTML = `<div class="dau-trang"><div><div class="eyebrow">Asset Master</div>
        <h2>${esc(a.ten)}</h2><div class="phu ma">${esc(a.ma_tai_san)}</div></div>
        <div><button onclick="dieuHuong('tai-san',thamSoDanhSachTaiSan())">Quay lại</button>
        ${coQuyenUI('asset.edit') ? '<button class="chinh-nut" onclick="formTaiSan(window.TAI_SAN_DANG_XEM)">Sửa</button>' : ''}</div></div>
        <div class="the"><h3>Hồ sơ tài sản</h3><div class="than-the"><table>
        ${row('Loại', tt(a.loai_tai_san))}${row('Nhóm', a.nhom_tai_san)}${row('Đơn vị', a.ten_don_vi)}
        ${row('Số lượng', `${a.so_luong} ${a.dvt}`)}${row('Nguyên giá', tien(a.nguyen_gia))}
        ${row('Giá trị còn lại', tien(a.gia_tri_con_lai))}${row('Ngày sử dụng', ngay(a.ngay_dua_vao_su_dung))}
        ${row('Trạng thái', tt(a.trang_thai))}${row('Mapping legacy', data.legacy ? `thiet_bi #${data.legacy.id}` : 'Không')}
        </table><div class="ghi-nho">Tài sản này chưa liên kết với Device Master nên chưa có hồ sơ kỹ thuật.</div></div></div>`;
    window.TAI_SAN_DANG_XEM = a;
}

async function formTaiSan(asset = null) {
    const units = window.DS_DON_VI_TS || await api('/danh-muc/phan-xuong');
    moHopThoai(asset ? 'Sửa tài sản' : 'Thêm tài sản', `
        <div class="luoi-form"><div class="o-nhap"><label>Mã tài sản</label><input id="ats-ma" ${asset?'disabled':''} value="${esc(asset?.ma_tai_san || '')}"></div>
        <div class="o-nhap"><label>Loại</label><select id="ats-loai"><option value="TSCD">TSCĐ</option><option value="CCDC">CCDC</option></select></div>
        <div class="o-nhap"><label>Tên tài sản *</label><input id="ats-ten" value="${esc(asset?.ten || '')}"></div>
        <div class="o-nhap"><label>Nhóm</label><input id="ats-nhom" value="${esc(asset?.nhom_tai_san || '')}"></div>
        <div class="o-nhap"><label>Đơn vị *</label><select id="ats-dv" ${asset?'disabled':''}>${units.map(x => `<option value="${x.id}">${esc(x.ten)}</option>`).join('')}</select></div>
        <div class="o-nhap"><label>ĐVT</label><input id="ats-dvt" value="${esc(asset?.dvt || 'Cái')}"></div>
        <div class="o-nhap"><label>Số lượng</label><input id="ats-sl" type="number" min="0" value="${asset?.so_luong ?? 1}"></div>
        <div class="o-nhap"><label>Nguyên giá</label><input id="ats-ng" type="number" min="0" value="${asset?.nguyen_gia ?? 0}"></div>
        <div class="o-nhap"><label>Giá trị còn lại</label><input id="ats-gt" type="number" min="0" value="${asset?.gia_tri_con_lai ?? 0}"></div>
        <div class="o-nhap"><label>Ngày sử dụng</label><input id="ats-ngay" type="date" value="${esc(asset?.ngay_dua_vao_su_dung || '')}"></div></div>`,
        [{ ten: 'Hủy', chay: dongHopThoai }, { ten: 'Lưu', lop: 'chinh-nut', chay: async () => {
            try {
                const body = { ma_tai_san: gt('ats-ma') || null, loai_tai_san: gt('ats-loai'), ten: gt('ats-ten'),
                    nhom_tai_san: gt('ats-nhom') || null, don_vi_id: Number(gt('ats-dv')), dvt: gt('ats-dvt'),
                    so_luong: Number(gt('ats-sl')), nguyen_gia: Number(gt('ats-ng')), gia_tri_con_lai: Number(gt('ats-gt')),
                    ngay_dua_vao_su_dung: gt('ats-ngay') || null, version: asset?.version };
                if (asset) await api('/tai-san/' + asset.id, { method: 'PUT', body });
                else await api('/tai-san', { method: 'POST', body });
                dongHopThoai();
                if (typeof hsktData !== 'undefined' && hsktData?.overview && !document.getElementById('bang-ts')) await moHskt(hsktData.overview.id, hsktTab);
                else await taiBangTaiSan();
            } catch (e) { alert(e.message); }
        }}], true);
    document.getElementById('ats-loai').value = asset?.loai_tai_san || 'TSCD';
    document.getElementById('ats-dv').value = asset?.don_vi_id || units[0]?.id || '';
}

function xuatTaiSan() { window.location.href = '/api/tai-san/export.xlsx?' + new URLSearchParams(locTaiSan); }
function taiMauTaiSan() { window.location.href = '/api/tai-san/mau-import.xlsx'; }
function chonImportTaiSan() { document.getElementById('file-import-ts').click(); }

async function moDongBoGoogleSheet() {
    try {
        const [status,batches]=await Promise.all([api('/sheet-sync/status'),api('/sheet-sync/batches')]);
        const actions=[{ten:'Đóng',chay:dongHopThoai}];
        if(coQuyenUI('asset.sheet.export'))actions.push({ten:'Xuất dữ liệu',lop:'chinh-nut',chay:xuatGoogleSheet});
        if(coQuyenUI('asset.sheet.import'))actions.push({ten:'Nhập để kiểm duyệt',chay:nhapGoogleSheet});
        moHopThoai('Đồng bộ Google Sheets',`${status.configured?'':'<div class="bao canh-bao">Chưa cấu hình kết nối Google. Quản trị viên cần khai báo tài khoản dịch vụ.</div>'}
            <div class="bao tin">Dữ liệu nhập từ Sheet luôn ở trạng thái chờ kiểm duyệt, chưa làm thay đổi hồ sơ chính.</div>
            <p class="phu">Tài khoản cần được chia sẻ quyền chỉnh sửa Sheet: <b>${esc(status.service_account_email||'Chưa cấu hình')}</b></p>
            <h4>Lịch sử đồng bộ</h4><div class="bao-bang"><table><thead><tr><th>Lô</th><th>Loại</th><th>Thời điểm</th><th>Kết quả</th><th></th></tr></thead><tbody>${batches.map(b=>`<tr><td>#${b.id}</td><td>${b.direction==='EXPORT'?'Xuất':'Nhập'}</td><td>${esc(b.created_at)}</td><td>${nhanTT(b.status)} · ${b.row_count} dòng</td><td>${b.direction==='IMPORT'?`<button onclick="xemLoDongBoSheet(${b.id})">Xem</button>`:`<a target="_blank" rel="noopener" href="${esc(b.spreadsheet_url)}">Mở Sheet</a>`}</td></tr>`).join('')||'<tr><td colspan="5" class="trong">Chưa có lô đồng bộ.</td></tr>'}</tbody></table></div>`,actions,true);
    } catch(e){bao(e.message,'loi');}
}
async function xuatGoogleSheet(){try{const d=await api('/sheet-sync/export',{method:'POST',body:{}});window.open(d.spreadsheet_url,'_blank','noopener');dongHopThoai();bao(`Đã xuất ${d.row_count} tài sản ra Google Sheets`);}catch(e){baoTrongHopThoai(e.message);}}
function nhapGoogleSheet(){const url=prompt('Dán liên kết Google Sheet đã chia sẻ cho tài khoản dịch vụ:');if(!url)return;const sheet=prompt('Tên tab dữ liệu:','Asset Master');if(!sheet)return;(async()=>{try{const d=await api('/sheet-sync/imports',{method:'POST',body:{spreadsheet_url:url,sheet_name:sheet}});dongHopThoai();bao(`Đã tạo lô #${d.batch_id} chờ kiểm duyệt`);await xemLoDongBoSheet(d.batch_id);}catch(e){baoTrongHopThoai(e.message);}})();}
async function xemLoDongBoSheet(id){try{const d=await api('/sheet-sync/batches/'+id),b=d.batch,label={CREATE:'Thêm mới',UPDATE:'Cập nhật',UNCHANGED:'Không đổi',ERROR:'Lỗi'};const actions=[{ten:'Đóng',chay:dongHopThoai}];if(b.status==='PENDING_REVIEW'&&coQuyenUI('asset.sheet.approve')){actions.push({ten:'Từ chối',lop:'nguy-hiem',chay:()=>xuLyLoSheet(id,'reject')});if(!(b.summary.ERROR||0))actions.push({ten:'Phê duyệt và áp dụng',lop:'chinh-nut',chay:()=>xuLyLoSheet(id,'approve')});}moHopThoai(`Lô đồng bộ #${id}`,`<div class="luoi-so"><div class="o-so"><span class="nhan">Thêm mới</span><strong class="gt">${b.summary.CREATE||0}</strong></div><div class="o-so"><span class="nhan">Cập nhật</span><strong class="gt">${b.summary.UPDATE||0}</strong></div><div class="o-so"><span class="nhan">Không đổi</span><strong class="gt">${b.summary.UNCHANGED||0}</strong></div><div class="o-so nguy"><span class="nhan">Lỗi</span><strong class="gt">${b.summary.ERROR||0}</strong></div></div><div class="bao-bang"><table><thead><tr><th>Dòng</th><th>Mã</th><th>Đề xuất</th><th>Chi tiết</th></tr></thead><tbody>${d.rows.map(x=>`<tr><td>${x.sheet_row}</td><td class="ma">${esc(x.asset_code)}</td><td>${label[x.action]}</td><td>${x.errors.length?esc(x.errors.join('; ')):Object.entries(x.changes).map(([k,v])=>`${esc(k)}: ${esc(v.from??'—')} → ${esc(v.to??'—')}`).join('<br>')||'—'}</td></tr>`).join('')}</tbody></table></div>`,actions,true);}catch(e){bao(e.message,'loi');}}
async function xuLyLoSheet(id,action){const note=prompt(action==='approve'?'Ghi chú phê duyệt:':'Lý do từ chối:')||'';try{const d=await api(`/sheet-sync/batches/${id}/${action}`,{method:'POST',body:{note}});dongHopThoai();bao(action==='approve'?`Đã áp dụng ${d.applied} thay đổi`:'Đã từ chối lô đồng bộ');await taiBangTaiSan();}catch(e){baoTrongHopThoai(e.message);}}
async function importTaiSan(event) {
    const file = event.target.files[0]; if (!file) return;
    const form = new FormData(); form.append('file', file);
    try {
        const result = await api('/tai-san/import', { method: 'POST', body: form });
        document.getElementById('bao-ts').innerHTML = `<div class="bao thanh-cong">Đã nhập ${result.da_nhap} tài sản.</div>`;
        await taiBangTaiSan();
    } catch (e) { document.getElementById('bao-ts').innerHTML = `<div class="bao loi">${esc(e.message)}</div>`; }
    event.target.value = '';
}
