/* TASK 2 - Màn hình Asset Master, tách khỏi hồ sơ kỹ thuật thiết bị. */
let locTaiSan = { q: '', loai: '', don_vi_id: '', trang: 1 };

async function mhTaiSan(el) {
    el.innerHTML = `<div class="dau-trang"><div><div class="eyebrow">Asset Master</div>
        <h2>TSCĐ / CCDC</h2></div><div>
        <button onclick="taiMauTaiSan()">Mẫu import</button>
        <button onclick="xuatTaiSan()">Xuất Excel</button>
        <button onclick="chonImportTaiSan()">Import Excel</button>
        <button class="chinh-nut" onclick="formTaiSan()">Thêm tài sản</button></div></div>
        <div id="bao-ts"></div><div class="thanh-loc" id="loc-ts"></div>
        <div class="the"><div id="bang-ts" class="bao-bang">Đang tải…</div></div>
        <input id="file-import-ts" type="file" accept=".xlsx" hidden>`;
    const units = await api('/danh-muc/phan-xuong');
    window.DS_DON_VI_TS = units;
    document.getElementById('loc-ts').innerHTML = `
        <input class="lon" id="ts-q" placeholder="Tìm mã, tên, nhóm tài sản…" value="${esc(locTaiSan.q)}">
        <select id="ts-loai"><option value="">TSCĐ + CCDC</option><option value="TSCD">TSCĐ</option><option value="CCDC">CCDC</option></select>
        <select id="ts-dv"><option value="">Tất cả đơn vị được phép</option>${units.map(x =>
            `<option value="${x.id}">${esc(x.ten_ngan || x.ma)} — ${esc(x.ten)}</option>`).join('')}</select>
        <button onclick="apDungLocTaiSan()">Lọc</button>`;
    document.getElementById('ts-loai').value = locTaiSan.loai;
    document.getElementById('ts-dv').value = locTaiSan.don_vi_id;
    document.getElementById('ts-q').onkeydown = e => { if (e.key === 'Enter') apDungLocTaiSan(); };
    document.getElementById('file-import-ts').onchange = importTaiSan;
    await taiBangTaiSan();
}

function apDungLocTaiSan() {
    locTaiSan = { q: gt('ts-q'), loai: gt('ts-loai'), don_vi_id: gt('ts-dv'), trang: 1 };
    taiBangTaiSan();
}

async function taiBangTaiSan() {
    const data = await api('/tai-san?' + new URLSearchParams({ ...locTaiSan, moi_trang: 50 }));
    const el = document.getElementById('bang-ts');
    if (!data.tong) { el.innerHTML = '<div class="trong">Không có tài sản phù hợp.</div>'; return; }
    const pages = Math.ceil(data.tong / data.moi_trang);
    el.innerHTML = `<table><thead><tr><th>Mã tài sản</th><th>Tên tài sản</th><th>Loại</th>
        <th>Đơn vị</th><th class="giua">SL</th><th class="phai">Nguyên giá</th><th>Trạng thái</th></tr></thead>
        <tbody>${data.danh_sach.map(x => `<tr class="bam" onclick="xemTaiSan(${x.id})">
        <td class="ma">${esc(x.ma_tai_san)}</td><td>${esc(x.ten)}<div style="font-size:11px;color:var(--chu-mo)">${esc(x.nhom_tai_san || '')}</div></td>
        <td>${tt(x.loai_tai_san)}</td><td>${esc(x.don_vi || '')}</td><td class="giua so">${x.so_luong} ${esc(x.dvt)}</td>
        <td class="phai so">${tien(x.nguyen_gia)}</td><td>${nhanTT(x.trang_thai)}</td></tr>`).join('')}</tbody></table>
        <div style="padding:10px;display:flex;justify-content:space-between"><span>${data.tong} tài sản · trang ${data.trang}/${pages}</span>
        <span><button ${data.trang<=1?'disabled':''} onclick="trangTaiSan(${data.trang-1})">Trước</button>
        <button ${data.trang>=pages?'disabled':''} onclick="trangTaiSan(${data.trang+1})">Sau</button></span></div>`;
}
function trangTaiSan(page) { locTaiSan.trang = page; taiBangTaiSan(); }

async function xemTaiSan(id) {
    const data = await api('/tai-san/' + id); const a = data.tai_san;
    const row = (name, value) => `<tr><td style="width:170px;color:var(--chu-nhat)">${name}</td><td>${esc(value ?? '—')}</td></tr>`;
    moHopThoai('Hồ sơ tài sản', `<div class="ma-lon">${esc(a.ma_tai_san)}</div><h3>${esc(a.ten)}</h3>
        <table>${row('Loại', tt(a.loai_tai_san))}${row('Nhóm', a.nhom_tai_san)}${row('Đơn vị', a.ten_don_vi)}
        ${row('Số lượng', `${a.so_luong} ${a.dvt}`)}${row('Nguyên giá', tien(a.nguyen_gia))}
        ${row('Giá trị còn lại', tien(a.gia_tri_con_lai))}${row('Ngày sử dụng', ngay(a.ngay_dua_vao_su_dung))}
        ${row('Trạng thái', tt(a.trang_thai))}${row('Mapping legacy', data.legacy ? `thiet_bi #${data.legacy.id}` : 'Không')}</table>`,
        [{ ten: 'Đóng', chay: dongHopThoai }, { ten: 'Sửa', lop: 'chinh-nut', chay: () => { dongHopThoai(); formTaiSan(a); } }], true);
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
                dongHopThoai(); await taiBangTaiSan();
            } catch (e) { alert(e.message); }
        }}], true);
    document.getElementById('ats-loai').value = asset?.loai_tai_san || 'TSCD';
    document.getElementById('ats-dv').value = asset?.don_vi_id || units[0]?.id || '';
}

function xuatTaiSan() { window.location.href = '/api/tai-san/export.xlsx?' + new URLSearchParams(locTaiSan); }
function taiMauTaiSan() { window.location.href = '/api/tai-san/mau-import.xlsx'; }
function chonImportTaiSan() { document.getElementById('file-import-ts').click(); }
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
