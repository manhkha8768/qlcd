/* Khung ứng dụng, đăng nhập, điều hướng */

window.PHIEN = null;
window.CAU_HINH = {};
window.QUYEN = [];
let MAN_HINH = 'tong-quan';

const CAC_MAN_HINH = {
    'tong-quan': { ten: 'Tổng quan',      ve: mhTongQuan,  nhom: 'Theo dõi' },
    'canh-bao':  { ten: 'Cảnh báo hạn',   ve: mhCanhBao,   nhom: 'Theo dõi' },
    'notifications': { ten: 'Thông báo & chất lượng', ve: mhNotifications, nhom: 'Theo dõi' },
    'reports': { ten: 'Trung tâm báo cáo', ve: mhReports, nhom: 'Theo dõi' },
    'thiet-bi':  { ten: 'Thiết bị',       ve: mhThietBi,   nhom: 'Dữ liệu' },
    'tai-san':   { ten: 'TSCĐ / CCDC',    ve: mhTaiSan,    nhom: 'Dữ liệu' },
    'kiem-ke-ledger': { ten: 'Kiểm kê & QR', ve: mhKiemKeLedger, nhom: 'Quản lý' },
    'nhap-lieu': { ten: 'Tải dữ liệu',    ve: mhNhapLieu,  nhom: 'Dữ liệu' },
    'tang-ts':   { ten: 'Tăng tài sản',   ve: taoManHinhGD('tang'),        nhom: 'Quản lý' },
    'giam-ts':   { ten: 'Giảm tài sản',   ve: taoManHinhGD('giam'),        nhom: 'Quản lý' },
    'dieu-chuyen': { ten: 'Điều chuyển',  ve: taoManHinhGD('dieu_chuyen'), nhom: 'Quản lý' },
    'phe-duyet': { ten: 'Giao dịch chờ duyệt', ve: mhPheDuyet,             nhom: 'Quản lý' },
    'work-inbox': { ten: 'Work Inbox', ve: mhWorkInbox, nhom: 'Quản lý' },
    'qr-scan': { ten: 'Quét QR', ve: mhQrScan, nhom: 'Dữ liệu' },
    'sua-chua':  { ten: 'Bảo dưỡng — sửa chữa', ve: mhSuaChua, nhom: 'Nghiệp vụ' },
    'kiem-dinh': { ten: 'Kiểm định',      ve: mhKiemDinh,  nhom: 'Nghiệp vụ' },
    'ncvt':      { ten: 'NCVT Quý',       ve: mhNCVT,      nhom: 'Vật tư' },
    'ncvt-canonical': { ten: 'NCVT PX Submission', ve: mhNCVTCanonical, nhom: 'Vật tư' },
    'material-master': { ten: 'Material Master', ve: mhMaterialMaster, nhom: 'Vật tư' },
    'stock-ledger': { ten: 'Kho & Stock Ledger', ve: mhStockLedger, nhom: 'Vật tư' },
    'su-co':     { ten: 'Sự cố thiết bị', ve: mhSuCo,      nhom: 'Kỹ thuật' },
    'phu-tung':  { ten: 'Danh mục phụ tùng', ve: mhPhuTung, nhom: 'Kỹ thuật' },
    'ho-so-ky-thuat': { ten: 'Hồ sơ kỹ thuật', ve: mhHoSoKyThuat, nhom: 'Kỹ thuật' },
    'ho-so-tb':  { ten: 'Hồ sơ thiết bị', ve: veHoSo,      nhom: 'Kỹ thuật', an: true },
    'quan-tri':  { ten: 'Quản trị',       ve: mhQuanTri,   nhom: 'Hệ thống', chiAdmin: true },
    'bao-mat':   { ten: 'Bảo mật truy cập', ve: mhBaoMat,   nhom: 'Hệ thống', chiAdmin: true }
};

let THAM_SO_MAN_HINH = {};
const taoHash = (manHinh, thamSo = {}) => QLCDNavigation.buildHash(manHinh, thamSo);

const NHOM_DIEU_HUONG = [
    { ma: 'tong-quan', ten: 'Tổng quan', icon: '⌂', manHinh: ['tong-quan', 'canh-bao', 'notifications'] },
    { ma: 'thiet-bi', ten: 'Thiết bị', icon: '▣', manHinh: ['thiet-bi', 'qr-scan', 'kiem-ke-ledger', 'nhap-lieu'] },
    { ma: 'co-dien', ten: 'Cơ điện', icon: '⚙', manHinh: ['sua-chua', 'kiem-dinh', 'su-co', 'ho-so-ky-thuat', 'phu-tung'] },
    { ma: 'vat-tu', ten: 'Vật tư', icon: '▤', manHinh: ['ncvt', 'ncvt-canonical', 'material-master', 'stock-ledger'] },
    { ma: 'tscd', ten: 'TSCĐ – CCDC', icon: '▦', manHinh: ['tai-san', 'tang-ts', 'giam-ts', 'dieu-chuyen', 'work-inbox', 'phe-duyet'] },
    { ma: 'ho-so', ten: 'Hồ sơ', icon: '□', manHinh: ['ho-so-ky-thuat'] },
    { ma: 'bao-cao', ten: 'Báo cáo', icon: '▥', manHinh: ['reports'] },
    { ma: 'quan-tri', ten: 'Quản trị', icon: '⚙', manHinh: ['quan-tri', 'bao-mat'] }
];

function docRouteTuUrl() {
    return QLCDNavigation.parseHash(window.location.hash, Object.keys(CAC_MAN_HINH));
}

function apDungRouteTuUrl() {
    const route = docRouteTuUrl();
    MAN_HINH = route.screen;
    THAM_SO_MAN_HINH = route.params;
}

function capNhatUrlHienTai(thamSo, replace = true) {
    THAM_SO_MAN_HINH = QLCDNavigation.cleanParams(thamSo);
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ ...(window.history.state || {}), scrollY: window.scrollY }, '', taoHash(MAN_HINH, THAM_SO_MAN_HINH));
}

/* ---------- Khởi động ---------- */
(async function khoiDong() {
    try {
        const d = await api('/auth/toi');
        window.PHIEN = d.nguoi_dung;
        window.CAU_HINH = d.cau_hinh || {};
        window.QUYEN = d.quyen || [];
        apDungRouteTuUrl();
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
        window.QUYEN = t.quyen || [];
        MAN_HINH = 'tong-quan'; THAM_SO_MAN_HINH = {};
        window.history.replaceState({ scrollY: 0 }, '', taoHash(MAN_HINH));
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

    const duocHien = ([, m]) => !m.an && (!m.chiAdmin || u.vai_tro === 'admin');
    const nhomNav = NHOM_DIEU_HUONG.map(nhom => ({
        ...nhom,
        ds: nhom.manHinh.map(k => [k, CAC_MAN_HINH[k]]).filter(x => x[1] && duocHien(x))
    })).filter(nhom => nhom.ds.length);

    document.getElementById('app').innerHTML = `
    <div class="khung">
        <aside class="canh-trai">
            <div class="dau">
                <div class="logo-qlcd">QLCD</div>
                <div><div class="ten-ht">Quản lý Cơ điện Vận tải</div>
                <div class="ten-cty">${esc(window.CAU_HINH.ten_cong_ty || 'Công ty Xây lắp Mỏ — TKV')}</div></div>
            </div>
            <nav>${nhomNav.map(nhom => `
                <div class="nhom-nav">${nhom.icon}<span>${nhom.ten}</span></div>
                ${nhom.ds.map(([k, m]) => `<a href="${taoHash(k)}" onclick="dieuHuong('${k}');return false"
                    class="${MAN_HINH === k ? 'chon' : ''}">
                    <span>${m.ten}</span><span id="chip-${k}"></span></a>`).join('')}`).join('')}
            </nav>
            <div class="chan">
                <div class="ten">${esc(u.ho_ten || u.ten_dang_nhap)}</div>
                <div class="vt">${tt(u.vai_tro)}${u.px_ngan ? ' · ' + esc(u.px_ngan) : ''}</div>
                <button onclick="formDoiMatKhau()">Đổi mật khẩu</button>
                <button onclick="dangXuat()">Đăng xuất</button>
            </div>
        </aside>
        <section class="workspace">
            <header class="app-header">
                <button class="nut-menu-mobile" onclick="document.querySelector('.canh-trai').classList.toggle('mo')" aria-label="Mở menu">☰</button>
                <button class="global-search" onclick="moTimKiemToanCuc()" aria-label="Tìm kiếm toàn hệ thống">
                    <span>⌕</span><span>Tìm mã thiết bị, tên, serial, WO, vật tư...</span><kbd>Ctrl K</kbd>
                </button>
                <div class="header-actions">
                    <button onclick="dieuHuong('work-inbox')" title="Việc của tôi">Việc của tôi <span id="header-work" class="chip-so am">0</span></button>
                    <button onclick="dieuHuong('work-inbox')" title="Chờ duyệt">Chờ duyệt <span id="header-approval" class="chip-so">0</span></button>
                    <button class="user-pill" onclick="document.querySelector('.canh-trai').classList.toggle('mo')">${esc((u.ho_ten || u.ten_dang_nhap).split(' ').slice(-1)[0])}</button>
                </div>
            </header>
            <main class="chinh" id="chinh"></main>
        </section>
        <nav class="mobile-bottom-nav" aria-label="Điều hướng mobile">
            <a href="#tong-quan" onclick="dieuHuong('tong-quan');return false"><b>⌂</b><span>Home</span></a>
            <a class="scan" href="#qr-scan" onclick="dieuHuong('qr-scan');return false"><b>⌗</b><span>Scan</span></a>
            <a href="#work-inbox" onclick="dieuHuong('work-inbox');return false"><b>✓</b><span>Tasks</span></a>
            <a href="#thiet-bi" onclick="dieuHuong('thiet-bi');return false"><b>▣</b><span>Assets</span></a>
            <button onclick="document.querySelector('.canh-trai').classList.toggle('mo')"><b>•••</b><span>More</span></button>
        </nav>
    </div>`;

    veManHinh();
    capNhatChip();
}

async function dieuHuong(k, thamSo = {}, tuyChon = {}) {
    if (MAN_HINH === 'qr-scan' && typeof dungQrCamera === 'function') dungQrCamera();
    if (!CAC_MAN_HINH[k]) k = 'tong-quan';
    if (!tuyChon.tuLichSu) {
        window.history.replaceState({ ...(window.history.state || {}), scrollY: window.scrollY }, '', window.location.href);
    }
    MAN_HINH = k;
    THAM_SO_MAN_HINH = QLCDNavigation.cleanParams(thamSo);
    if (!tuyChon.tuLichSu) {
        const method = tuyChon.thayThe ? 'replaceState' : 'pushState';
        window.history[method]({ scrollY: 0 }, '', taoHash(MAN_HINH, THAM_SO_MAN_HINH));
    }
    dongHopThoai();
    document.querySelectorAll('.canh-trai nav a').forEach(a =>
        a.classList.toggle('chon', a.getAttribute('href') === '#' + k));
    await veManHinh();
    if (tuyChon.tuLichSu) requestAnimationFrame(() => window.scrollTo(0, Number(tuyChon.scrollY) || 0));
}

function moTimKiemToanCuc() {
    const u = window.PHIEN || {};
    const muc = Object.entries(CAC_MAN_HINH)
        .filter(([, m]) => !m.an && (!m.chiAdmin || u.vai_tro === 'admin'))
        .map(([k, m]) => `<button class="ket-qua-lenh" data-search="${esc((m.ten + ' ' + m.nhom).toLowerCase())}" onclick="dongHopThoai();dieuHuong('${k}')"><span>${esc(m.ten)}</span><small>${esc(m.nhom)}</small></button>`).join('');
    moHopThoai('Tìm kiếm toàn hệ thống', `
        <div class="o-nhap"><input id="global-search-input" autocomplete="off" placeholder="Thiết bị, WO, vật tư, hồ sơ hoặc chức năng..."></div>
        <div class="goi-y-search" id="global-search-results"><strong>Tác vụ và phân hệ trong phạm vi của bạn</strong>${muc}</div>`, []);
    const input = document.getElementById('global-search-input');
    let timer;
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        clearTimeout(timer);
        if (q.length < 2) {
            document.getElementById('global-search-results').innerHTML = `<strong>Tác vụ và phân hệ trong phạm vi của bạn</strong>${muc}`;
            return;
        }
        timer = setTimeout(async () => {
            const el = document.getElementById('global-search-results'); if (!el) return;
            el.innerHTML = '<div class="trong">Đang tìm trong phạm vi được phép…</div>';
            try {
                const result = await api('/search?q=' + encodeURIComponent(q));
                el.innerHTML = result.groups.length ? result.groups.map(group => `<section class="search-group"><strong>${esc(group.label)}</strong>${group.items.map(item =>
                    `<button class="ket-qua-lenh" onclick="dongHopThoai();dieuHuong('${item.screen}',{${item.param_name}:'${String(item.id).replace(/'/g, '')}'})"><span><b>${esc(item.code)}</b><small>${esc(item.title)}</small></span><small>${esc(item.subtitle || '')}</small></button>`).join('')}</section>`).join('') : '<div class="trong">Không có kết quả trong phạm vi của bạn.</div>';
            } catch (error) { el.innerHTML = `<div class="bao loi">${esc(error.message)}</div>`; }
        }, 250);
    });
    input.focus();
}

function coQuyenUI(ma) {
    return window.PHIEN?.vai_tro === 'admin' || window.QUYEN.includes(ma);
}

window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && window.PHIEN) {
        event.preventDefault(); moTimKiemToanCuc();
    }
});

window.addEventListener('popstate', event => {
    if (!window.PHIEN) return;
    const route = docRouteTuUrl();
    dieuHuong(route.screen, route.params, { tuLichSu: true, scrollY: event.state?.scrollY });
});

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
        const [cb, cd, nt, inbox] = await Promise.all([
            api('/tong-hop/canh-bao'), api('/tong-hop/cho-duyet'), api('/notifications/summary'), api('/work-inbox')]);
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
        chip('chip-notifications', nt.unread || nt.mine || nt.open, nt.critical ? '' : 'am');
        const work = document.getElementById('header-work');
        if (work) work.textContent = inbox.summary.mine || nt.mine || nt.open || 0;
        try {
            const gd = await api('/giao-dich/cho-duyet');
            chip('chip-phe-duyet', gd.kpi?.tong || 0, 'chip-so');
            const approval = document.getElementById('header-approval');
            if (approval) approval.textContent = inbox.summary.approvals || gd.kpi?.tong || 0;
        } catch (e) { /* không có quyền duyệt */ }
    } catch (e) { /* không chặn giao diện nếu lỗi */ }
}
