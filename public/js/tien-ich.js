/* Tiện ích dùng chung */

const TT = {
    hoat_dong: 'Hoạt động', du_phong: 'Dự phòng', dang_sua: 'Đang sửa',
    dang_su_dung: 'Đang sử dụng', tam_ngung: 'Tạm ngừng',
    dang_dieu_chuyen: 'Điều chuyển', cho_thanh_ly: 'Chờ thanh lý', da_thanh_ly: 'Đã thanh lý',
    nhap: 'Nháp', cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', chuyen_lai: 'Chuyển lại',
    tot: 'Tốt', trung_binh: 'Trung bình', kem: 'Kém', hong: 'Hỏng',
    qua_han: 'Quá hạn', sap_het_han: 'Sắp hết hạn', den_han: 'Đến hạn', con_han: 'Còn hạn',
    da_tai: 'Đã tải lên', da_anh_xa: 'Đã ánh xạ', da_nhap: 'Đã nhập', huy: 'Đã huỷ',
    TSCD: 'TSCĐ', CCDC: 'CCDC',
    admin: 'Quản trị hệ thống', cd_cty: 'Cơ điện công ty', px: 'Cơ điện phân xưởng', xem: 'Chỉ xem'
};

const tt = k => TT[k] || k || '';

function nhanTT(k) {
    return `<span class="nhan-tt tt-${k || 'nhap'}">${tt(k)}</span>`;
}

function tien(n) {
    if (n === null || n === undefined || n === '') return '';
    const v = Number(n);
    if (!isFinite(v) || v === 0) return '';
    return v.toLocaleString('vi-VN');
}

function ngay(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Gọi API ---------- */
async function api(duongDan, tuyChon = {}) {
    const opt = { ...tuyChon };
    if (opt.body && !(opt.body instanceof FormData)) {
        opt.headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
        opt.body = JSON.stringify(opt.body);
    }
    const res = await fetch('/api' + duongDan, opt);
    let data = null;
    try { data = await res.json(); } catch (e) { /* không phải JSON */ }

    // Mã 401 ở hai màn hình này là chuyện bình thường, không phải hết phiên:
    //   /auth/toi        - kiểm tra lúc mở trang khi chưa đăng nhập
    //   /auth/dang-nhap  - sai mật khẩu, phải để nguyên lời báo của server
    const KHONG_PHAI_HET_PHIEN = ['/auth/toi', '/auth/dang-nhap'];
    if (res.status === 401 && !KHONG_PHAI_HET_PHIEN.includes(duongDan)) {
        window.PHIEN = null; veManHinh();
        throw new Error('Phiên làm việc đã hết hạn, đăng nhập lại');
    }
    if (!res.ok) throw new Error(data?.loi || `Lỗi ${res.status}`);
    return data;
}

/* ---------- Hộp thoại ---------- */
function moHopThoai(tieuDe, noiDungHTML, cacNut = [], rong = false) {
    dongHopThoai();
    const nen = document.createElement('div');
    nen.className = 'nen-mo';
    nen.id = 'nen-mo';
    nen.innerHTML = `
        <div class="hop-thoai ${rong ? 'rong' : ''}">
            <header><h3>${esc(tieuDe)}</h3>
                <button class="dong-x" onclick="dongHopThoai()" aria-label="Đóng">&times;</button></header>
            <div class="noi-dung">${noiDungHTML}</div>
            ${cacNut.length ? '<footer id="chan-hop-thoai"></footer>' : ''}
        </div>`;
    document.body.appendChild(nen);

    const chan = nen.querySelector('#chan-hop-thoai');
    cacNut.forEach(n => {
        const b = document.createElement('button');
        b.textContent = n.ten;
        if (n.lop) b.className = n.lop;
        b.onclick = n.chay;
        chan.appendChild(b);
    });
    nen.addEventListener('click', e => { if (e.target === nen) dongHopThoai(); });
    document.addEventListener('keydown', thoatEsc);
    const oDau = nen.querySelector('input, select, textarea');
    if (oDau) oDau.focus();
}
function thoatEsc(e) { if (e.key === 'Escape') dongHopThoai(); }
function dongHopThoai() {
    document.getElementById('nen-mo')?.remove();
    document.removeEventListener('keydown', thoatEsc);
}

function baoTrongHopThoai(thongDiep, loai = 'loi') {
    const nd = document.querySelector('#nen-mo .noi-dung');
    if (!nd) return;
    nd.querySelector('.bao')?.remove();
    nd.insertAdjacentHTML('afterbegin', `<div class="bao ${loai}">${esc(thongDiep)}</div>`);
}

/* ---------- Thông báo trên trang ---------- */
function bao(thongDiep, loai = 'tot') {
    const c = document.getElementById('vung-bao');
    if (!c) return alert(thongDiep);
    c.innerHTML = `<div class="bao ${loai}">${esc(thongDiep)}</div>`;
    if (loai === 'tot') setTimeout(() => { c.innerHTML = ''; }, 4000);
}

function gt(id) { return document.getElementById(id)?.value?.trim() ?? ''; }
function so(id) {
    const v = gt(id).replace(/[.\s]/g, '').replace(',', '.');
    return v === '' ? null : Number(v);
}
