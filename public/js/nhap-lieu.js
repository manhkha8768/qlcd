/* =====================================================================
   TẢI DỮ LIỆU TSCĐ/CCDC CỦA PHÂN XƯỞNG
   Bốn bước: chọn file -> ghép cột -> kiểm tra -> đưa vào hệ thống
   ===================================================================== */

const TRUONG_ANH_XA = [
    { k: 'ten',             n: 'Tên tài sản',        bat_buoc: true },
    { k: 'ma_tscd',         n: 'Mã tài sản' },
    { k: 'loai_ts',         n: 'Loại (TSCĐ/CCDC)' },
    { k: 'so_seri',         n: 'Số seri' },
    { k: 'dvt',             n: 'Đơn vị tính' },
    { k: 'so_luong',        n: 'Số lượng' },
    { k: 'nguyen_gia',      n: 'Nguyên giá' },
    { k: 'gia_tri_con_lai', n: 'Giá trị còn lại' },
    { k: 'ngay_su_dung',    n: 'Ngày đưa vào sử dụng' },
    { k: 'nam_sx',          n: 'Năm sản xuất' },
    { k: 'nuoc_sx',         n: 'Nước sản xuất' },
    { k: 'vi_tri_text',     n: 'Vị trí sử dụng' },
    { k: 'ma_tb',           n: 'Mã thiết bị có sẵn' },
    { k: 'ghi_chu',         n: 'Ghi chú' }
];

let LO = null;   // trạng thái lô đang xử lý

function thanhBuoc(hienTai) {
    const b = ['Chọn file', 'Ghép cột', 'Kiểm tra', 'Hoàn tất'];
    return `<div class="buoc">${b.map((x, i) => {
        const lop = i + 1 === hienTai ? 'dang' : (i + 1 < hienTai ? 'xong' : '');
        return `<div class="b ${lop}"><span class="stt">${i + 1}</span>${x}</div>`;
    }).join('')}</div>`;
}

/* ---------------------- Màn hình chính ---------------------- */
async function mhNhapLieu(el) {
    el.innerHTML = `<div class="dau-trang"><div>
        <div class="eyebrow">Đưa dữ liệu vào hệ thống</div><h2>Nhập dữ liệu TSCĐ / CCDC</h2>
        <div class="phu">Chọn file bảng tính hoặc quét mã thiết bị bằng máy ảnh</div></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;

    LO = null;
    const [pxs, los] = await Promise.all([
        api('/danh-muc/phan-xuong'), api('/import/lo')]);
    window.DS_PX = pxs;
    const laPX = window.PHIEN.vai_tro === 'px';

    if (!pxs.length && !laPX) {
        document.getElementById('noi-dung').innerHTML = `<div class="the"><div class="than-the trong">
            Chưa có phân xưởng nào. Vào mục Quản trị để thêm phân xưởng trước khi tải dữ liệu.
            <br><br><button class="chinh-nut" onclick="dieuHuong('quan-tri')">Đi tới Quản trị</button></div></div>`;
        return;
    }

    document.getElementById('noi-dung').innerHTML = `
        ${thanhBuoc(1)}
        <div class="import-methods">
        <div class="the"><h3>① Chọn file tải lên</h3><div class="than-the">
            ${laPX ? `<div class="bao tin">Dữ liệu sẽ được ghi cho phân xưởng
                      <strong>${esc(window.PHIEN.ten_px || window.PHIEN.px_ngan || '')}</strong>.</div>`
                   : `<div class="o-nhap" style="max-width:340px"><label>Phân xưởng nhận dữ liệu</label>
                      <select id="ip-px">${pxs.map(p => `<option value="${p.id}">${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}</select></div>`}
            <div class="o-tha" id="o-tha" onclick="document.getElementById('ip-file').click()">
                <div class="to">Kéo file vào đây hoặc bấm để chọn</div>
                <div class="nho2">Nhận .xlsx, .xls, .xlsm, .csv — tối đa 30 MB</div>
            </div>
            <input type="file" id="ip-file" accept=".xlsx,.xls,.xlsm,.csv" style="display:none">
            <div id="ip-file-status" class="ghi-nho" role="status">Chưa chọn file</div>
            <div class="ghi-nho">Không cần sửa file theo mẫu. Hệ thống tự dò dòng tiêu đề và
                đoán cột, bạn chỉ cần đối chiếu lại ở bước sau.</div>
        </div></div>
        <div class="the"><h3>② Quét bằng máy ảnh</h3><div class="than-the">
            <p>Dùng camera điện thoại để quét QR/mã vạch, xác định đúng thiết bị rồi mở Asset 360.</p>
            <button class="chinh-nut" onclick="dieuHuong('qr-scan')">Mở camera quét mã</button>
            <div class="ghi-nho">Camera chỉ bật sau khi bạn bấm nút và cấp quyền. Mã được xác thực lại trên máy chủ theo phạm vi Phân xưởng.</div>
        </div></div></div>
        ${los.length ? bangLichSu(los) : ''}`;

    ganSuKienTaiFile();
}

function bangLichSu(los) {
    return `<div class="the"><h3>Các lần tải trước</h3><div class="bao-bang"><table>
        <thead><tr><th>File</th><th>PX</th><th>Người tải</th><th>Thời điểm</th>
            <th class="phai">Dòng</th><th class="phai">Đã nhập</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${los.map(l => `<tr>
            <td>${esc(l.ten_file)}</td><td>${esc(l.px || '')}</td>
            <td>${esc(l.nguoi_tai || l.ten_dang_nhap || '')}</td>
            <td style="font-size:12px">${esc(l.ngay_tai)}</td>
            <td class="phai so">${l.tong_dong}</td>
            <td class="phai so">${l.so_da_nhap || ''}</td>
            <td>${nhanTT(l.trang_thai)}</td>
            <td class="phai">${l.trang_thai === 'da_nhap' ? '' :
                `<button class="nho" onclick="tiepTucLo(${l.id})">Tiếp tục</button>`}
                <button class="nho nguy-hiem" onclick="xoaLo(${l.id})">Xoá</button></td>
        </tr>`).join('')}</tbody></table></div></div>`;
}

function ganSuKienTaiFile() {
    const oTha = document.getElementById('o-tha');
    const ipFile = document.getElementById('ip-file');
    if (!oTha) return;

    ipFile.onchange = () => { if (ipFile.files[0]) taiFileLen(ipFile.files[0]); };
    ['dragenter', 'dragover'].forEach(e => oTha.addEventListener(e, ev => {
        ev.preventDefault(); oTha.classList.add('keo');
    }));
    ['dragleave', 'drop'].forEach(e => oTha.addEventListener(e, ev => {
        ev.preventDefault(); oTha.classList.remove('keo');
    }));
    oTha.addEventListener('drop', ev => {
        const f = ev.dataTransfer.files[0];
        if (f) taiFileLen(f);
    });
}

async function taiFileLen(file) {
    const oTha = document.getElementById('o-tha');
    const status = document.getElementById('ip-file-status');
    const mb = (file.size / 1024 / 1024).toFixed(2);
    if (status) status.textContent = `${file.name} · ${mb} MB · ${file.type || 'không xác định MIME'}`;
    if (file.size > 30 * 1024 * 1024) return bao('File quá lớn (tối đa 30 MB)', 'loi');
    oTha.innerHTML = `<div class="to">Đang đọc ${esc(file.name)}…</div>`;

    const fd = new FormData();
    fd.append('file', file);
    const px = document.getElementById('ip-px')?.value;
    if (px) fd.append('phan_xuong_id', px);

    try {
        const d = await api('/import/tai-len', { method: 'POST', body: fd });
        LO = { id: d.lo_id, ten_file: file.name, ...d };
        manHinhAnhXa();
    } catch (e) {
        oTha.innerHTML = `<div class="to">Kéo file vào đây hoặc bấm để chọn</div>
                          <div class="nho2">Nhận .xlsx, .xls, .xlsm, .csv — tối đa 30 MB</div>`;
        ganSuKienTaiFile();
        bao(e.message, 'loi');
    }
}

async function tiepTucLo(id) {
    try {
        const d = await api(`/import/lo/${id}/phan-tich`);
        LO = { id, ...d };
        manHinhAnhXa();
    } catch (e) { bao(e.message, 'loi'); }
}

async function xoaLo(id) {
    if (!confirm('Xoá lô dữ liệu này?')) return;
    try { await api('/import/lo/' + id, { method: 'DELETE' }); veManHinh(); bao('Đã xoá lô'); }
    catch (e) { bao(e.message, 'loi'); }
}

/* ---------------------- BƯỚC 2: Ghép cột ---------------------- */
function manHinhAnhXa() {
    const cot = LO.cot;
    const ax = LO.anh_xa_goi_y || {};
    const soDoan = Object.keys(ax).length;

    const chonCot = (k) => `<select id="ax-${k}">
        <option value="">— không dùng —</option>
        ${cot.map(c => `<option value="${c.chi_so}" ${String(ax[k]) === String(c.chi_so) ? 'selected' : ''}>
            ${esc(c.ten)}</option>`).join('')}</select>`;

    document.getElementById('noi-dung').innerHTML = `
    ${thanhBuoc(2)}
    <div class="the"><h3>File: ${esc(LO.ten_file || '')}</h3><div class="than-the">
        <div class="bao tot">Đã đọc được ${LO.tong_dong_du_lieu} dòng dữ liệu và tự nhận ra
            ${soDoan} cột. Kiểm tra lại bảng bên dưới trước khi tiếp tục.</div>
        <div class="hang">
            <div class="o-nhap"><label>Sheet</label><select id="ax-sheet" onchange="doiSheet()">
                ${LO.sheets.map(s => `<option ${s === LO.ten_sheet ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Dòng tiêu đề trong file Excel</label>
                <input id="ax-dong" type="number" min="1" value="${LO.dong_tieu_de + 1}" onchange="doiSheet()"></div>
            <div class="o-nhap"><label>Nhóm mặc định cho dòng không đoán được</label>
                <select id="ax-nhom-md"><option value="">— để trống, xử lý sau —</option>
                ${(window.DS_NHOM_CAP2 || []).map(n => `<option value="${n.id}">${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}
                </select></div>
        </div>
    </div></div>

    <div class="the"><h3>Ghép cột trong file với dữ liệu hệ thống</h3><div class="than-the">
        <div class="bao-bang"><table class="bang-anh-xa">
            <thead><tr><th style="width:200px">Trường dữ liệu</th><th>Cột trong file</th></tr></thead>
            <tbody>${TRUONG_ANH_XA.map(t => `<tr>
                <td>${t.n}${t.bat_buoc ? ' <span style="color:var(--do)">*</span>' : ''}</td>
                <td>${chonCot(t.k)}</td></tr>`).join('')}
            </tbody></table></div>
        <div class="ghi-nho">Chỉ bắt buộc cột Tên tài sản. Nhóm thiết bị được đoán tự động từ tên,
            ví dụ "Máng cào SGB-620" sẽ vào nhóm VT.01.</div>
    </div></div>

    <div class="the"><h3>Xem trước dữ liệu trong file</h3><div class="bao-bang">
        <table class="bang-xem-truoc"><thead><tr>${cot.map(c => `<th>${esc(c.ten)}</th>`).join('')}</tr></thead>
        <tbody>${LO.du_lieu_mau.map(h => `<tr>${h.map(v =>
            `<td>${esc(v === null ? '' : v)}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="veManHinh()">Huỷ</button>
        <button class="chinh-nut" onclick="chotAnhXa()">Kiểm tra dữ liệu</button>
    </div>`;

    napNhomCap2();
}

async function napNhomCap2() {
    if (window.DS_NHOM_CAP2) return;
    const ns = await api('/danh-muc/nhom-thiet-bi');
    window.DS_NHOM = ns;
    window.DS_NHOM_CAP2 = ns.filter(n => n.cap === 2);
    const s = document.getElementById('ax-nhom-md');
    if (s) s.innerHTML = `<option value="">— để trống, xử lý sau —</option>` +
        window.DS_NHOM_CAP2.map(n => `<option value="${n.id}">${esc(n.ma)} — ${esc(n.ten)}</option>`).join('');
}

async function doiSheet() {
    const sheet = gt('ax-sheet');
    const dong = Number(gt('ax-dong')) - 1;
    try {
        const d = await api(`/import/lo/${LO.id}/phan-tich?sheet=${encodeURIComponent(sheet)}&dong_tieu_de=${dong}`);
        LO = { ...LO, ...d };
        manHinhAnhXa();
    } catch (e) { bao(e.message, 'loi'); }
}

async function chotAnhXa() {
    const mapping = {};
    TRUONG_ANH_XA.forEach(t => {
        const v = gt('ax-' + t.k);
        if (v !== '') mapping[t.k] = Number(v);
    });
    if (mapping.ten === undefined) return bao('Phải chọn cột chứa Tên tài sản', 'loi');

    try {
        const kq = await api(`/import/lo/${LO.id}/anh-xa`, { method: 'POST', body: {
            mapping, ten_sheet: gt('ax-sheet'), dong_tieu_de: Number(gt('ax-dong')) - 1,
            nhom_mac_dinh_id: gt('ax-nhom-md') || null
        } });
        LO.ket_qua = kq;
        manHinhKiemTra();
    } catch (e) { bao(e.message, 'loi'); }
}

/* ---------------------- BƯỚC 3: Kiểm tra ---------------------- */
async function manHinhKiemTra(loc = 'tat_ca') {
    const kq = LO.ket_qua;
    const dong = await api(`/import/lo/${LO.id}/dong${loc === 'tat_ca' ? '' : '?loc=' + loc}`);
    const soCanhBao = (await api(`/import/lo/${LO.id}/dong?loc=canh_bao`)).length;

    const nut = (k, ten, n) => `<button class="${loc === k ? 'chinh-nut' : ''}"
        onclick="manHinhKiemTra('${k}')">${ten}${n !== undefined ? ` (${n})` : ''}</button>`;

    document.getElementById('noi-dung').innerHTML = `
    ${thanhBuoc(3)}
    <div class="luoi-so">
        <div class="o-so"><div class="nhan">Tổng số dòng</div><div class="gt">${kq.tong}</div></div>
        <div class="o-so tot"><div class="nhan">Sẵn sàng nhập</div><div class="gt">${kq.hop_le}</div></div>
        <div class="o-so ${kq.loi ? 'nguy' : ''}"><div class="nhan">Còn thiếu thông tin</div><div class="gt">${kq.loi}</div></div>
        <div class="o-so ${soCanhBao ? 'canh-bao' : ''}"><div class="nhan">Cần lưu ý</div><div class="gt">${soCanhBao}</div></div>
    </div>

    ${kq.loi ? `<div class="bao nhac">Các dòng thiếu thông tin sẽ không được nhập.
        Phần lớn là do chưa đoán được nhóm thiết bị — chọn nhóm rồi lưu, hoặc dùng nút
        "Gán nhóm cho tất cả dòng còn thiếu" ở dưới.</div>` : ''}

    <div class="the"><h3>Nhóm thiết bị nhận diện được</h3><div class="bao-bang"><table>
        <thead><tr><th>Mã nhóm</th><th>Tên nhóm</th><th class="phai">Số dòng</th></tr></thead>
        <tbody>${kq.thong_ke_nhom.map(x => `<tr>
            <td class="ma">${esc(x.ma_nhom)}</td><td>${esc(x.ten_nhom)}</td>
            <td class="phai so">${x.so_dong}</td></tr>`).join('')}
        </tbody></table></div></div>

    <div class="the">
        <h3>Chi tiết từng dòng</h3>
        <div class="than-the" style="padding-bottom:8px;display:flex;gap:8px;flex-wrap:wrap">
            ${nut('tat_ca', 'Tất cả', kq.tong)}
            ${nut('loi', 'Thiếu thông tin', kq.loi)}
            ${nut('canh_bao', 'Cần lưu ý', soCanhBao)}
            ${nut('hop_le', 'Sẵn sàng', kq.hop_le)}
            ${kq.loi ? `<button class="nhan-manh" onclick="ganNhomHangLoat()">Gán nhóm cho tất cả dòng còn thiếu</button>` : ''}
        </div>
        <div class="bao-bang"><table>
            <thead><tr><th class="phai">Dòng</th><th>Tên tài sản</th><th>Nhóm</th><th>Mã TS</th>
                <th class="giua">SL</th><th class="phai">Nguyên giá</th><th>Ngày SD</th><th>Ghi nhận</th><th></th></tr></thead>
            <tbody>${dong.length ? dong.map(d => `<tr>
                <td class="phai so">${d.dong_goc}</td>
                <td>${esc(d.ten || '')}</td>
                <td>${d.ma_nhom_tb ? `<span class="ma">${esc(d.ma_nhom_tb)}</span> ${esc(d.ten_nhom)}` :
                     '<span class="nhan-tt tt-qua_han">chưa có</span>'}</td>
                <td class="ma">${esc(d.ma_tscd || '')}</td>
                <td class="giua so">${d.so_luong ?? '—'}</td>
                <td class="phai so">${tien(d.nguyen_gia)}</td>
                <td>${ngay(d.ngay_su_dung)}</td>
                <td>${d.loi ? `<div class="loi-o">${esc(d.loi)}</div>` : ''}
                    ${d.canh_bao ? `<div class="canh-bao-o">${esc(d.canh_bao)}</div>` : ''}
                    ${!d.loi && !d.canh_bao ? '<span class="nhan-tt tt-dat">Đủ</span>' : ''}</td>
                <td class="phai"><button class="nho" onclick="suaDong(${d.id})">Sửa</button></td>
            </tr>`).join('') : '<tr><td colspan="9" class="trong">Không có dòng nào.</td></tr>'}
            </tbody></table></div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
        <label style="margin:0"><input type="checkbox" id="bo-trung" checked style="width:auto;margin-right:6px">
            Bỏ qua dòng có mã tài sản đã tồn tại</label>
        <button onclick="manHinhAnhXa()">Quay lại ghép cột</button>
        <button class="chinh-nut" ${kq.hop_le ? '' : 'disabled'} onclick="xacNhanNhap()">
            Đưa ${kq.hop_le} dòng vào hệ thống</button>
    </div>`;
}

async function suaDong(id) {
    const ds = await api(`/import/lo/${LO.id}/dong`);
    const d = ds.find(x => x.id === id);
    if (!d) return;
    const nhom2 = window.DS_NHOM_CAP2 || [];

    moHopThoai(`Sửa dòng ${d.dong_goc}`, `
        ${d.loi ? `<div class="bao loi">${esc(d.loi)}</div>` : ''}
        <div class="o-nhap"><label>Tên tài sản *</label><input id="sd-ten" value="${esc(d.ten || '')}"></div>
        <div class="o-nhap"><label>Nhóm thiết bị *</label><select id="sd-nhom">
            <option value="">— Chọn nhóm —</option>
            ${nhom2.map(n => `<option value="${n.id}" ${d.nhom_id === n.id ? 'selected' : ''}>${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}
        </select></div>
        <div class="hang">
            <div class="o-nhap"><label>Mã tài sản</label><input id="sd-tscd" value="${esc(d.ma_tscd || '')}"></div>
            <div class="o-nhap"><label>Số seri</label><input id="sd-seri" value="${esc(d.so_seri || '')}"></div>
        </div>
        <div class="hang">
            <div class="o-nhap"><label>Số lượng</label><input id="sd-sl" value="${d.so_luong ?? 1}"></div>
            <div class="o-nhap"><label>Nguyên giá</label><input id="sd-ng" value="${d.nguyen_gia ?? ''}"></div>
            <div class="o-nhap"><label>Ngày sử dụng</label><input id="sd-ngay" type="date" value="${d.ngay_su_dung || ''}"></div>
        </div>
        <details><summary style="cursor:pointer;font-size:12.5px;color:var(--chu-nhat)">Dữ liệu gốc trong file</summary>
            <div style="font-size:12px;background:#F4F5F7;padding:8px;margin-top:6px;border-radius:3px">
            ${Object.entries(JSON.parse(d.du_lieu_goc || '{}')).map(([k, v]) =>
                v === null || v === '' ? '' : `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('')}
            </div></details>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Lưu dòng', lop: 'chinh-nut', chay: async () => {
            try {
                await api(`/import/lo/${LO.id}/dong/${id}`, { method: 'PUT', body: {
                    ten: gt('sd-ten'), nhom_id: gt('sd-nhom') ? Number(gt('sd-nhom')) : null,
                    ma_tscd: gt('sd-tscd') || null, so_seri: gt('sd-seri') || null,
                    so_luong: so('sd-sl') ?? 1, nguyen_gia: so('sd-ng'),
                    ngay_su_dung: gt('sd-ngay') || null
                } });
                dongHopThoai();
                LO.ket_qua = { ...LO.ket_qua, ...(await demLaiLo()) };
                manHinhKiemTra();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function demLaiLo() {
    const los = await api('/import/lo');
    const l = los.find(x => x.id === LO.id);
    return l ? { tong: l.tong_dong, hop_le: l.so_hop_le, loi: l.so_loi } : {};
}

function ganNhomHangLoat() {
    const nhom2 = window.DS_NHOM_CAP2 || [];
    moHopThoai('Gán nhóm cho các dòng còn thiếu', `
        <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:10px">
        Toàn bộ dòng chưa xác định được nhóm sẽ được gán vào nhóm chọn dưới đây.
        Bạn vẫn sửa lại từng thiết bị được sau khi nhập.</p>
        <div class="o-nhap"><label>Nhóm thiết bị</label><select id="gn-nhom">
            <option value="">— Chọn nhóm —</option>
            ${nhom2.map(n => `<option value="${n.id}">${esc(n.ma)} — ${esc(n.ten)}</option>`).join('')}
        </select></div>`,
        [{ ten: 'Huỷ', chay: dongHopThoai },
         { ten: 'Gán nhóm', lop: 'chinh-nut', chay: async () => {
            if (!gt('gn-nhom')) return baoTrongHopThoai('Chọn nhóm thiết bị');
            try {
                const kq = await api(`/import/lo/${LO.id}/gan-nhom`, { method: 'POST',
                    body: { nhom_id: Number(gt('gn-nhom')) } });
                dongHopThoai();
                LO.ket_qua = { ...LO.ket_qua, tong: kq.tong_dong, hop_le: kq.so_hop_le, loi: kq.so_loi };
                manHinhKiemTra();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

/* ---------------------- BƯỚC 4: Hoàn tất ---------------------- */
async function xacNhanNhap() {
    const boTrung = document.getElementById('bo-trung')?.checked;
    try {
        const kq = await api(`/import/lo/${LO.id}/xac-nhan`, { method: 'POST',
            body: { bo_qua_trung: boTrung } });

        document.getElementById('noi-dung').innerHTML = `
        ${thanhBuoc(4)}
        <div class="the"><div class="than-the">
            <div class="bao tot">Đã đưa <strong>${kq.da_nhap}</strong> thiết bị vào hệ thống${
                kq.bo_qua ? `, bỏ qua ${kq.bo_qua} dòng` : ''}.</div>
            <p style="font-size:13px;color:var(--chu-nhat);margin-bottom:12px">
                Thiết bị vừa nhập đang ở trạng thái <span class="nhan-tt tt-cho_duyet">Chờ duyệt</span>.
                Cơ điện công ty kiểm tra rồi bấm Đồng ý, hoặc Chuyển lại kèm lý do nếu cần bổ sung.</p>
            ${kq.loi_chi_tiet?.length ? `<div class="bao nhac">Một số dòng không nhập được:</div>
                <div class="bao-bang"><table><thead><tr><th>Dòng</th><th>Tên</th><th>Lý do</th></tr></thead>
                <tbody>${kq.loi_chi_tiet.map(x => `<tr><td>${x.dong}</td><td>${esc(x.ten || '')}</td>
                    <td class="loi-o">${esc(x.loi)}</td></tr>`).join('')}</tbody></table></div>` : ''}
            <div style="display:flex;gap:8px;margin-top:14px">
                <button class="chinh-nut" onclick="dieuHuong('thiet-bi')">Xem danh sách thiết bị</button>
                <button onclick="veManHinh()">Tải file khác</button>
                ${['admin', 'cd_cty'].includes(window.PHIEN.vai_tro) ?
                    `<button class="nhan-manh" onclick="duyetCaLo(${LO.id})">Duyệt toàn bộ lô này</button>` : ''}
            </div>
        </div></div>`;
    } catch (e) { bao(e.message, 'loi'); }
}

async function duyetCaLo(loId) {
    try {
        const kq = await api('/thiet-bi/duyet-lo/' + loId, { method: 'POST' });
        bao(`Đã duyệt ${kq.da_duyet} thiết bị`);
    } catch (e) { bao(e.message, 'loi'); }
}
