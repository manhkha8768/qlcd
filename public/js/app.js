/* Khung ứng dụng, đăng nhập, điều hướng */

window.PHIEN = null;
window.CAU_HINH = {};
let MAN_HINH = 'tong-quan';

const CAC_MAN_HINH = {
    'tong-quan': { ten: 'Tổng quan',      ve: mhTongQuan,  nhom: 'Theo dõi' },
    'canh-bao':  { ten: 'Cảnh báo hạn',   ve: mhCanhBao,   nhom: 'Theo dõi' },
    'thiet-bi':  { ten: 'Thiết bị',       ve: mhThietBi,   nhom: 'Dữ liệu' },
    'tai-san':   { ten: 'TSCĐ / CCDC',    ve: mhTaiSan,    nhom: 'Dữ liệu' },
    'kiem-ke-ledger': { ten: 'Kiểm kê & QR', ve: mhKiemKeLedger, nhom: 'Quản lý' },
    'nhap-lieu': { ten: 'Tải dữ liệu',    ve: mhNhapLieu,  nhom: 'Dữ liệu' },
    'tang-ts':   { ten: 'Tăng tài sản',   ve: taoManHinhGD('tang'),        nhom: 'Quản lý' },
    'giam-ts':   { ten: 'Giảm tài sản',   ve: taoManHinhGD('giam'),        nhom: 'Quản lý' },
    'dieu-chuyen': { ten: 'Điều chuyển',  ve: taoManHinhGD('dieu_chuyen'), nhom: 'Quản lý' },
    'phe-duyet': { ten: 'Giao dịch chờ duyệt', ve: mhPheDuyet,             nhom: 'Quản lý' },
    'sua-chua':  { ten: 'Bảo dưỡng — sửa chữa', ve: mhSuaChua, nhom: 'Nghiệp vụ' },
    'kiem-dinh': { ten: 'Kiểm định',      ve: mhKiemDinh,  nhom: 'Nghiệp vụ' },
    'ncvt':      { ten: 'NCVT Quý',       ve: mhNCVT,      nhom: 'Vật tư' },
    'su-co':     { ten: 'Sự cố thiết bị', ve: mhSuCo,      nhom: 'Kỹ thuật' },
    'phu-tung':  { ten: 'Danh mục phụ tùng', ve: mhPhuTung, nhom: 'Kỹ thuật' },
    'ho-so-ky-thuat': { ten: 'Hồ sơ kỹ thuật', ve: mhHoSoKyThuat, nhom: 'Kỹ thuật' },
    'ho-so-tb':  { ten: 'Hồ sơ thiết bị', ve: veHoSo,      nhom: 'Kỹ thuật', an: true },
    'quan-tri':  { ten: 'Quản trị',       ve: mhQuanTri,   nhom: 'Hệ thống', chiAdmin: true },
    'bao-mat':   { ten: 'Bảo mật truy cập', ve: mhBaoMat,   nhom: 'Hệ thống', chiAdmin: true }
};

/* ---------- Khởi động ---------- */
(async function khoiDong() {
    try {
        const d = await api('/auth/toi');
        window.PHIEN = d.nguoi_dung;
        window.CAU_HINH = d.cau_hinh || {};
        veKhung();
    } catch (e) {
        veDangNhap();
    }
})();

/* ---------- Màn hình đăng nhập ---------- */
function veDangNhap(thongDiep = '') {
    document.getElementById('app').innerHTML = `
    <div class="trang-dang-nhap"><div class="hop-dang-nhap">
        <div class="eyebrow">Hệ thống nội bộ</div>
        <h1>Quản lý thiết bị<br>cơ điện vận tải</h1>
        <div class="cty">Công ty Xây lắp Mỏ — TKV</div>
        <div id="bao-dn">${thongDiep ? `<div class="bao loi">${esc(thongDiep)}</div>` : ''}</div>
        <div class="o-nhap"><label>Tên đăng nhập</label><input id="dn-ten" autocomplete="username"></div>
        <div class="o-nhap"><label>Mật khẩu</label><input id="dn-mk" type="password" autocomplete="current-password"></div>
        <button class="chinh-nut" style="width:100%;padding:8px" onclick="dangNhap()">Đăng nhập</button>
    </div></div>`;

    const vao = e => { if (e.key === 'Enter') dangNhap(); };
    document.getElementById('dn-ten').onkeydown = vao;
    document.getElementById('dn-mk').onkeydown = vao;
    document.getElementById('dn-ten').focus();
}

async function dangNhap() {
    const ten = gt('dn-ten'), mk = gt('dn-mk');
    if (!ten || !mk) {
        document.getElementById('bao-dn').innerHTML = '<div class="bao loi">Nhập tên đăng nhập và mật khẩu</div>';
        return;
    }
    try {
        const d = await api('/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: ten, mat_khau: mk } });
        window.PHIEN = d.nguoi_dung;
        const t = await api('/auth/toi');
        window.CAU_HINH = t.cau_hinh || {};
        MAN_HINH = 'tong-quan';
        veKhung();
        if (d.phai_doi_mat_khau) setTimeout(() => formDoiMatKhau(true), 300);
    } catch (e) {
        document.getElementById('bao-dn').innerHTML = `<div class="bao loi">${esc(e.message)}</div>`;
    }
}

async function dangXuat() {
    await api('/auth/dang-xuat', { method: 'POST' });
    window.PHIEN = null;
    veDangNhap();
}

/* ---------- Khung chính ---------- */
function veKhung() {
    if (!window.PHIEN) return veDangNhap();
    const u = window.PHIEN;

    const nhomNav = {};
    Object.entries(CAC_MAN_HINH).forEach(([k, m]) => {
        if (m.chiAdmin && u.vai_tro !== 'admin') return;
        if (m.an) return;
        (nhomNav[m.nhom] = nhomNav[m.nhom] || []).push([k, m]);
    });

    document.getElementById('app').innerHTML = `
    <div class="khung">
        <aside class="canh-trai">
            <div class="dau">
                <div class="ten-ht">${esc(window.CAU_HINH.ten_he_thong || 'Quản lý thiết bị cơ điện vận tải')}</div>
                <div class="ten-cty">${esc(window.CAU_HINH.ten_cong_ty || 'Công ty Xây lắp Mỏ — TKV')}</div>
            </div>
            <nav>${Object.entries(nhomNav).map(([nhom, ds]) => `
                <div class="nhom-nav">${nhom}</div>
                ${ds.map(([k, m]) => `<a href="#${k}" onclick="dieuHuong('${k}');return false"
                    class="${MAN_HINH === k ? 'chon' : ''}">
                    <span>${m.ten}</span>
                    <span id="chip-${k}"></span></a>`).join('')}`).join('')}
            </nav>
            <div class="chan">
                <div class="ten">${esc(u.ho_ten || u.ten_dang_nhap)}</div>
                <div class="vt">${tt(u.vai_tro)}${u.px_ngan ? ' · ' + esc(u.px_ngan) : ''}</div>
                <button onclick="formDoiMatKhau()">Đổi mật khẩu</button>
                <button onclick="dangXuat()">Đăng xuất</button>
            </div>
        </aside>
        <main class="chinh" id="chinh"></main>
    </div>`;

    veManHinh();
    capNhatChip();
}

function dieuHuong(k) {
    MAN_HINH = k;
    document.querySelectorAll('.canh-trai nav a').forEach(a =>
        a.classList.toggle('chon', a.getAttribute('href') === '#' + k));
    veManHinh();
}

async function veManHinh() {
    const el = document.getElementById('chinh');
    if (!el) return veKhung();
    const m = CAC_MAN_HINH[MAN_HINH];
    try {
        await m.ve(el);
        capNhatChip();
    } catch (e) {
        el.innerHTML = `<div class="bao loi">${esc(e.message)}</div>`;
    }
}

/* Chip số bên cạnh menu: việc đang chờ xử lý */
async function capNhatChip() {
    if (!window.PHIEN) return;
    try {
        const [cb, cd] = await Promise.all([
            api('/tong-hop/canh-bao'), api('/tong-hop/cho-duyet')]);
        const s = cb.tom_tat;
        const soCB = s.kd_qua_han + s.kd_sap_het_han + s.bd_qua_han + s.bd_den_han;
        const eCB = document.getElementById('chip-canh-bao');
        if (eCB) eCB.innerHTML = soCB ? `<span class="chip-so">${soCB}</span>` : '';
        const chip = (id, n, lop = 'am') => {
            const e = document.getElementById(id);
            if (e) e.innerHTML = n ? `<span class="chip-so ${lop}">${n}</span>` : '';
        };
        chip('chip-thiet-bi', cd.thiet_bi);
        chip('chip-sua-chua', cd.sua_chua);
        try {
            const gd = await api('/giao-dich/cho-duyet');
            chip('chip-phe-duyet', gd.kpi?.tong || 0, 'chip-so');
        } catch (e) { /* không có quyền duyệt */ }
    } catch (e) { /* không chặn giao diện nếu lỗi */ }
}
