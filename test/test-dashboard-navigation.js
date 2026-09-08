/** Regression: Dashboard -> Asset list -> canonical dossier, URL state and scope. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');

process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-dashboard-navigation-${Date.now()}.db`);
const db = require('../db');
const dbDir = path.join(__dirname, '..', 'db');
fs.readdirSync(dbDir).filter(f => /^\d+.*\.sql$/.test(f)).sort()
    .forEach(f => db.exec(fs.readFileSync(path.join(dbDir, f), 'utf8')));

const unit1 = db.prepare("INSERT INTO phan_xuong(ma,ten,ten_ngan,loai) VALUES('NAV1','Phân xưởng Điều hướng 1','ĐH1','san_xuat')").run().lastInsertRowid;
const unit2 = db.prepare("INSERT INTO phan_xuong(ma,ten,ten_ngan,loai) VALUES('NAV2','Phân xưởng Điều hướng 2','ĐH2','san_xuat')").run().lastInsertRowid;
const groupId = db.prepare('SELECT id FROM nhom_thiet_bi LIMIT 1').get().id;
const legacy1 = db.prepare("INSERT INTO thiet_bi(ma_tb,ten,nhom_id,ma_tscd,loai_ts,phan_xuong_id) VALUES('NAV.001','Thiết bị trùng tên',?,'NAV-A1','TSCD',?)").run(groupId, unit1).lastInsertRowid;
db.prepare("INSERT INTO thiet_bi(ma_tb,ten,nhom_id,ma_tscd,loai_ts,phan_xuong_id) VALUES('NAV.002','Thiết bị trùng tên',?,'NAV-A2','CCDC',?)").run(groupId, unit2);

// Migrations have already run, so create one explicit canonical pair for navigation.
const asset1 = db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,nhom_tai_san,don_vi_id,legacy_thiet_bi_id) VALUES('NAV-A1','TSCD','Thiết bị trùng tên','Nhóm điều hướng',?,?)").run(unit1, legacy1).lastInsertRowid;
const asset2 = db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,nhom_tai_san,don_vi_id) VALUES('NAV-A2','CCDC','Thiết bị trùng tên','Nhóm điều hướng',?)").run(unit2).lastInsertRowid;
const device1 = db.prepare("INSERT INTO devices(ma_thiet_bi,ten,nhom_id,don_vi_id,legacy_thiet_bi_id) VALUES('NAV.001','Thiết bị trùng tên',?,?,?)").run(groupId, unit1, legacy1).lastInsertRowid;
db.prepare("INSERT INTO asset_device_links(asset_id,device_id,loai_quan_he,la_lien_ket_chinh) VALUES(?,?,'gan_voi',1)").run(asset1, device1);

db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro) VALUES('nav_admin',?,'Admin Navigation','admin')").run(bcrypt.hashSync('admin123', 8));
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES('nav_px',?,'PX Navigation','px',?)").run(bcrypt.hashSync('px12345', 8), unit1);
const adminId = db.prepare("SELECT id FROM nguoi_dung WHERE ten_dang_nhap='nav_admin'").get().id;
db.prepare("UPDATE devices SET so_seri='SER-NAV-2026',nam_san_xuat=2026,tinh_trang_ky_thuat='tot' WHERE id=?").run(device1);
db.prepare("INSERT INTO nhat_ky_van_hanh(thiet_bi_id,ngay,ca,gio_chay,san_luong,tinh_trang,nguoi_ghi_id) VALUES(?,date('now'),'1',7.5,125,'Bình thường',?)").run(legacy1, adminId);
db.prepare("INSERT INTO technical_work_orders(id,work_order_code,operation_type,device_id,status,description,created_by) VALUES('wo-nav-1','WO-NAV-001','REPAIR',?,'IN_PROGRESS','Kiểm tra truyền động',?)").run(device1, adminId);
db.prepare("INSERT INTO technical_work_order_events(work_order_id,event_type,to_status,work_order_version,reason,actor_id) VALUES('wo-nav-1','CREATED','DRAFT',1,'Khởi tạo kiểm tra',?)").run(adminId);
db.prepare("INSERT INTO technical_work_orders(id,work_order_code,operation_type,device_id,status,description,created_by) VALUES('wo-nav-review','WO-NAV-REVIEW','MAINTENANCE',?,'SUBMITTED','Chờ duyệt từ Work Inbox',?)").run(device1, adminId);

let navigation = {};
try { navigation = require('../public/js/navigation-state'); } catch (_) { /* expected RED before implementation */ }
const app = require('../server');
let passed = 0, failed = 0;
function check(name, condition) {
    if (condition) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}`); }
}

(async () => {
    console.log('\n===== TEST DASHBOARD DETAIL NAVIGATION =====');

    check('Hash giữ màn hình, phân xưởng, loại, trang và hồ sơ canonical',
        typeof navigation.buildHash === 'function' &&
        navigation.buildHash('tai-san', { don_vi_id: unit1, loai: 'TSCD', trang: 2, asset_id: asset1 }) ===
            `#tai-san?don_vi_id=${unit1}&loai=TSCD&trang=2&asset_id=${asset1}`);
    const parsed = typeof navigation.parseHash === 'function'
        ? navigation.parseHash(`#tai-san?don_vi_id=${unit1}&q=bom&trang=3`, ['tong-quan', 'tai-san']) : {};
    check('Tải lại URL khôi phục đúng bộ lọc', parsed.screen === 'tai-san' && parsed.params?.don_vi_id === String(unit1) && parsed.params?.q === 'bom' && parsed.params?.trang === '3');
    check('URL không chấp nhận màn hình ngoài whitelist',
        typeof navigation.parseHash === 'function' && navigation.parseHash('#khong-hop-le?asset_id=1', ['tong-quan', 'tai-san']).screen === 'tong-quan');

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;
        if (options.body) { headers['content-type'] = 'application/json'; options.body = JSON.stringify(options.body); }
        const response = await fetch(base + url, { ...options, headers });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        let body; try { body = await response.json(); } catch (_) { body = null; }
        return { response, body };
    }

    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'nav_admin', mat_khau: 'admin123' } });
    let result = await api('/api/tong-hop/dashboard');
    check('Dashboard trả phan_xuong_id chuẩn cho từng dòng', result.response.status === 200 && result.body.theo_phan_xuong.every(x => Number.isInteger(x.phan_xuong_id)));

    result = await api(`/api/tai-san?don_vi_id=${unit1}`);
    check('Danh sách API lọc đúng phân xưởng', result.response.status === 200 && result.body.tong === 1 && result.body.danh_sach.every(x => Number(x.don_vi_id) === Number(unit1)));
    check('Danh sách trả Device ID canonical đã liên kết', result.body.danh_sach[0]?.device_id === device1);
    check('Danh sách REF-05 trả tín hiệu kỹ thuật canonical', result.body.danh_sach[0]?.ma_thiet_bi === 'NAV.001' && 'gio_chay_luy_ke' in result.body.danh_sach[0]);
    result = await api('/api/tai-san?serial=SER-NAV-2026&nam_san_xuat=2026&tinh_trang_ky_thuat=tot');
    check('Filter nâng cao REF-05 lọc serial, năm sản xuất và tình trạng kỹ thuật', result.response.status === 200 && result.body.tong === 1 && result.body.danh_sach[0]?.id === asset1);
    result = await api('/api/search?q=NAV');
    check('Global Search server-side trả Asset và Work Order', result.response.status === 200 && result.body.groups.some(x => x.type === 'ASSET') && result.body.groups.some(x => x.type === 'WORK_ORDER'));
    result = await api('/api/work-inbox');
    check('Work Inbox hợp nhất việc kỹ thuật chờ duyệt theo quyền', result.response.status === 200 && result.body.approvals.some(x => x.id === 'wo-nav-review') && result.body.capabilities.review_technical);
    result = await api('/api/work-inbox?q=REVIEW&type=TECHNICAL_WORK_ORDER&page=1&size=1');
    check('Work Inbox hỗ trợ filter và pagination server-side', result.response.status === 200 && result.body.size === 1 && result.body.totals.approvals === 1 && result.body.approvals[0]?.id === 'wo-nav-review');
    result = await api(`/api/technical-profiles/devices/${device1}`);
    check('Asset 360 trả dữ liệu vận hành thật', result.response.status === 200 && result.body.operating_logs[0]?.gio_chay === 7.5);
    check('Asset 360 trả Timeline Work Order thật', result.body.timeline[0]?.work_order_code === 'WO-NAV-001');
    check('Asset 360 có nguồn dữ liệu vật tư canonical', Array.isArray(result.body.material_issues));
    const auditActions = db.prepare("SELECT hanh_dong FROM nhat_ky_he_thong WHERE nguoi_id=?").all(adminId).map(x => x.hanh_dong);
    check('Audit trail ghi tìm kiếm và xem hồ sơ', auditActions.includes('GLOBAL_SEARCH') && auditActions.includes('DEVICE_PROFILE_VIEW'));
    result = await api(`/api/interaction-audit?entity_type=DEVICE&entity_id=${device1}`);
    check('Người có quyền audit xem được nhật ký Asset 360', result.response.status === 200 && result.body.items.some(x => x.hanh_dong === 'DEVICE_PROFILE_VIEW'));
    result = await api(`/api/tai-san/summary?don_vi_id=${unit1}`);
    check('KPI quick filter tuân Data Scope', result.response.status === 200 && result.body.tong === 1 && result.body.tscd === 1);
    result = await api('/api/tai-san/by-code/NAV-A1');
    check('QR code resolve về Asset ID canonical', result.response.status === 200 && result.body.id === asset1);
    result = await api(`/api/tai-san/${asset1}`);
    check('Hồ sơ Asset trả Device ID canonical', result.response.status === 200 && result.body.device_id === device1);
    check('Hai tài sản cùng tên vẫn định danh bằng Asset ID', asset1 !== asset2);

    cookie = '';
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'nav_px', mat_khau: 'px12345' } });
    result = await api('/api/search?q=NAV-A2');
    check('Global Search không làm lộ Asset ngoài Data Scope', result.response.status === 200 && result.body.total === 0);
    result = await api(`/api/interaction-audit?entity_type=DEVICE&entity_id=${device1}`);
    check('Người không có quyền quản trị không xem được audit truy cập', result.response.status === 403);
    result = await api(`/api/tai-san?don_vi_id=${unit2}`);
    check('API danh sách từ chối lọc phân xưởng ngoài scope', result.response.status === 403);
    result = await api('/api/tai-san/by-code/NAV-A2');
    check('QR shortcut không làm lộ Asset ngoài scope', result.response.status === 403);
    result = await api(`/api/tai-san/${asset2}`);
    check('API hồ sơ từ chối Asset ngoài scope', result.response.status === 403);
    result = await api('/api/tai-san/99999999');
    check('API hồ sơ trả 404 khi Asset không tồn tại', result.response.status === 404);
    result = await api(`/api/thiet-bi?phan_xuong_id=${unit2}`);
    check('API thiết bị từ chối phân xưởng ngoài scope', result.response.status === 403);

    const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'man-hinh.js'), 'utf8');
    const assetSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tai-san.js'), 'utf8');
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    const profileSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'technical-profile.js'), 'utf8');
    const cssSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
    const qrSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'qr-scanner.js'), 'utf8');
    const inboxSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'work-inbox.js'), 'utf8');
    const operationsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'technical-operations.js'), 'utf8');
    check('Dòng phân xưởng hỗ trợ click và bàn phím', /moTaiSanTheoPhanXuong/.test(dashboardSource) && /tabindex="0"/.test(dashboardSource) && /onkeydown/.test(dashboardSource));
    check('Danh sách tài sản có deep link canonical mở được tab mới',
        /const href = taoHash/.test(assetSource) && /href="\$\{href\}"/.test(assetSource) && /asset_id/.test(assetSource));
    check('Danh sách có thông báo rỗng riêng cho phân xưởng', assetSource.includes('Phân xưởng này chưa có TSCĐ/CCDC'));
    check('Bộ lọc URL gồm REF-05 cơ bản và nâng cao', ['loai', 'nhom', 'trang_thai', 'q', 'tinh_trang_ky_thuat', 'serial', 'nam_san_xuat'].every(x => assetSource.includes(x)));
    check('Back/forward được đồng bộ từ URL', /popstate|hashchange/.test(appSource));
    check('Dòng tương tác có focus hiển thị rõ', /tr\.bam:focus/.test(cssSource));
    check('Asset List có KPI quick filter, Quick View và mobile cards', /asset-kpi/.test(assetSource) && /moXemNhanhTaiSan/.test(assetSource) && /asset-card-list/.test(assetSource));
    check('Asset 360 định nghĩa đủ 13 tab REF-06', ['tong-quan','thong-so','cau-tao','van-hanh','kiem-tu','su-co','work-order','bao-duong','kiem-dinh','vat-tu','tai-san','tai-lieu','timeline'].every(x => profileSource.includes(`'${x}'`)));
    check('Các action Asset List được ẩn/hiện theo permission', /coQuyenUI\('asset\.(create|edit|import|export)'\)/.test(assetSource));
    check('Global Search dùng API server-side', appSource.includes("api('/search?q='"));
    check('QR scanner dùng camera sau, fallback và tự giải phóng camera', /getUserMedia/.test(qrSource) && /BarcodeDetector/.test(qrSource) && /qr-manual/.test(qrSource) && /visibilitychange/.test(qrSource) && /pagehide/.test(qrSource));
    check('Work Inbox có action duyệt/chuyển lại/từ chối theo capability', /review_technical/.test(inboxSource) && /approve/.test(inboxSource) && /reject/.test(inboxSource) && /return/.test(inboxSource));
    check('Asset 360 action CRUD được kiểm soát bằng permission', ['device.edit','device.archive','asset.edit','technical_operation.create','technical_profile.edit'].every(x => profileSource.includes(x)));
    check('Work Order UI không hard-code vai trò duyệt/thực hiện', !operationsSource.includes("['admin','cd_cty'].includes(PHIEN.vai_tro)") && ['technical_operation.create','technical_operation.review','technical_operation.execute','technical_operation.material_issue'].every(x => operationsSource.includes(`coQuyenUI('${x}')`)));
    check('QR nhận mã thuần, payload và URL tem /a/:assetCode', /chuanHoaMaQr/.test(qrSource) && /\/a\\\//.test(qrSource) && /kind:'PAYLOAD'/.test(qrSource));

    server.close();
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed + failed} test =====`);
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
