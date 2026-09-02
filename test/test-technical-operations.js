/** TASK 21: canonical repair/maintenance/inspection lifecycle acceptance tests. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');

process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-technical-operations-${Date.now()}.db`);
const db = require('../db');
const migrationDir = path.join(__dirname, '..', 'db');
const taskFiles = ['23-material-master.sql','24-stock-ledger.sql','25-warehouse-transfer-return.sql',
    '26-ncvt-period-submission.sql','27-ncvt-review-approval.sql','28-ncvt-company-aggregation.sql',
    '29-ncvt-reservation.sql','30-ncvt-material-issue.sql','31-ncvt-receipt-confirmation.sql',
    '32-ncvt-carry-forward-lock.sql','33-ncvt-dashboard.sql','34-technical-operations.sql','35-notifications-data-quality.sql','36-reporting-center.sql','37-production-readiness.sql'];
const files = fs.readdirSync(migrationDir).filter(x => /^\d+.*\.sql$/.test(x)).sort();
for (const file of files.filter(x => !taskFiles.includes(x))) {
    db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
}

const hash = bcrypt.hashSync('admin123', 8);
const admin = db.prepare(`INSERT INTO nguoi_dung
    (ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro) VALUES ('ops21_admin',?,'Admin Operations','admin')`)
    .run(hash).lastInsertRowid;
const unitA = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PX21A','Phân xưởng Operations A','san_xuat')")
    .run().lastInsertRowid;
const unitB = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PX21B','Phân xưởng Operations B','san_xuat')")
    .run().lastInsertRowid;
db.prepare(`INSERT INTO nguoi_dung
    (ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES ('ops21_px',?,'PX Operations A','px',?)`)
    .run(hash, unitA);
db.prepare(`INSERT INTO nguoi_dung
    (ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES ('ops21_other',?,'PX Operations B','px',?)`)
    .run(hash, unitB);
const group = db.prepare("INSERT INTO nhom_thiet_bi(ma,ten) VALUES('OPS.21','Nhóm Operations 21')")
    .run().lastInsertRowid;
const legacyA = db.prepare(`INSERT INTO thiet_bi(ma_tb,ten,nhom_id,phan_xuong_id)
    VALUES('TB-OPS-A','Thiết bị Operations A',?,?)`).run(group, unitA).lastInsertRowid;
const legacyB = db.prepare(`INSERT INTO thiet_bi(ma_tb,ten,nhom_id,phan_xuong_id)
    VALUES('TB-OPS-B','Thiết bị Operations B',?,?)`).run(group, unitB).lastInsertRowid;
const deviceA = db.prepare(`INSERT INTO devices
    (ma_thiet_bi,ten,nhom_id,don_vi_id,legacy_thiet_bi_id,nguoi_tao_id)
    VALUES('DEV-OPS-A','Device Operations A',?,?,?,?)`).run(group, unitA, legacyA, admin).lastInsertRowid;
const deviceB = db.prepare(`INSERT INTO devices
    (ma_thiet_bi,ten,nhom_id,don_vi_id,legacy_thiet_bi_id,nguoi_tao_id)
    VALUES('DEV-OPS-B','Device Operations B',?,?,?,?)`).run(group, unitB, legacyB, admin).lastInsertRowid;
const componentA = db.prepare(`INSERT INTO device_components
    (device_id,component_code,name,component_type,created_by)
    VALUES(?,'CMP-OPS-A','Cụm truyền động A','ASSEMBLY',?)`).run(deviceA, admin).lastInsertRowid;
const componentB = db.prepare(`INSERT INTO device_components
    (device_id,component_code,name,component_type,created_by)
    VALUES(?,'CMP-OPS-B','Cụm truyền động B','ASSEMBLY',?)`).run(deviceB, admin).lastInsertRowid;

const legacyRepair = db.prepare(`INSERT INTO phieu_sua_chua
    (so_phieu,thiet_bi_id,phan_xuong_id,loai,mo_ta_hu_hong,trang_thai,nguoi_lap_id)
    VALUES('SC-OPS-LEGACY',?,?,'sua_chua','Sửa chữa nguồn cũ','hoan_thanh',?)`)
    .run(legacyA, unitA, admin).lastInsertRowid;
db.prepare(`INSERT INTO component_repair_links(component_id,legacy_repair_id,linked_by)
    VALUES(?,?,?)`).run(componentA, legacyRepair, admin);
const legacyMaintenance = db.prepare(`INSERT INTO phieu_bao_duong
    (ma_phieu,thiet_bi_id,phan_xuong_id,trang_thai,noi_dung_cong_viec,nguoi_tao_id)
    VALUES('BD-OPS-LEGACY',?,?,'da_len_lich','Bảo dưỡng nguồn cũ',?)`)
    .run(legacyA, unitA, admin).lastInsertRowid;
const inspectionType = db.prepare('SELECT id FROM loai_kiem_dinh ORDER BY id LIMIT 1').get().id;
const legacyInspection = db.prepare(`INSERT INTO kiem_dinh
    (thiet_bi_id,loai_kiem_dinh_id,ngay_kiem_dinh,ngay_het_han,ket_qua,nguoi_nhap_id)
    VALUES(?,?,'2043-01-01','2044-01-01','dat',?)`).run(legacyA, inspectionType, admin).lastInsertRowid;

for (const file of taskFiles) db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
const material = db.prepare(`INSERT INTO materials
    (material_code,name,normalized_name,base_uom_code,created_by)
    VALUES('MAT-OPS-21','Vòng bi Operations','vòng bi operations','EA',?)`).run(admin).lastInsertRowid;
const warehouse = db.prepare(`INSERT INTO warehouses
    (warehouse_code,name,don_vi_id,created_by) VALUES('WH-OPS-21','Kho Operations',?,?)`)
    .run(unitA, admin).lastInsertRowid;

const app = require('../server');
let passed = 0; let failed = 0;
function check(name, ok) {
    if (ok) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}`); }
}

(async () => {
    console.log('\n===== TEST TASK 21 TECHNICAL OPERATIONS =====');
    const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;
        if (options.body) { headers['content-type'] = 'application/json'; options.body = JSON.stringify(options.body); }
        const response = await fetch(base + url, { ...options, headers });
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        let body; try { body = await response.json(); } catch (_) { body = null; }
        return { response, body };
    }
    async function login(username) {
        cookie = '';
        return api('/api/auth/dang-nhap', { method:'POST', body:{ ten_dang_nhap:username, mat_khau:'admin123' } });
    }

    await login('ops21_admin');
    let tx = (await api('/api/stock-ledger/transactions', { method:'POST', body:{
        type:'RECEIPT', idempotency_key:'ops21-opening',
        lines:[{ warehouse_id:warehouse, material_id:material, quantity:20 }]
    } })).body.id;
    await api(`/api/stock-ledger/transactions/${tx}/post`, { method:'POST' });
    check('Backfill giữ đủ repair/maintenance/inspection legacy',
        db.prepare('SELECT COUNT(*) n FROM technical_work_orders WHERE device_id=? AND work_order_code LIKE \'LEGACY-%\'').get(deviceA).n === 3);
    check('Backfill không sửa hoặc xóa record nguồn',
        db.prepare('SELECT mo_ta_hu_hong FROM phieu_sua_chua WHERE id=?').get(legacyRepair).mo_ta_hu_hong === 'Sửa chữa nguồn cũ'
        && db.prepare('SELECT id FROM phieu_bao_duong WHERE id=?').get(legacyMaintenance)
        && db.prepare('SELECT id FROM kiem_dinh WHERE id=?').get(legacyInspection));

    await login('ops21_px');
    let rs = await api('/api/technical-operations/work-orders', { method:'POST', body:{
        operation_type:'REPAIR', device_id:deviceA, primary_component_id:componentA,
        priority:'STOP_PRODUCTION', description:'Thay vòng bi cụm truyền động',
        idempotency_key:'ops21-repair-create'
    } });
    const orderId = rs.body.id;
    check('PX tạo repair canonical theo Device + Component', rs.response.status === 201 && rs.body.version === 1);
    rs = await api('/api/technical-operations/work-orders', { method:'POST', body:{
        operation_type:'REPAIR', device_id:deviceA, primary_component_id:componentA,
        description:'Retry không nhân bản', idempotency_key:'ops21-repair-create'
    } });
    check('Tạo work order có idempotency', rs.response.status === 200 && rs.body.id === orderId && rs.body.idempotent);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/submit`, { method:'POST', body:{version:1} });
    check('Lifecycle DRAFT → SUBMITTED dùng optimistic version', rs.body.status === 'SUBMITTED' && rs.body.version === 2);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/submit`, { method:'POST', body:{version:1} });
    check('Transition sai trạng thái/version bị chặn', rs.response.status === 409);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/approve`, { method:'POST', body:{version:2,reason:'PX tự duyệt'} });
    check('PX không có quyền tự duyệt', rs.response.status === 403);

    await login('ops21_admin');
    rs = await api(`/api/technical-operations/work-orders/${orderId}/approve`, { method:'POST', body:{version:2,reason:'Đủ phương án kỹ thuật'} });
    check('CĐVT/admin approve tạo quyết định lifecycle', rs.body.status === 'APPROVED' && rs.body.version === 3);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/start`, { method:'POST', body:{version:3} });
    check('Start đưa work order và Device vào đang sửa', rs.body.status === 'IN_PROGRESS'
        && db.prepare('SELECT trang_thai FROM devices WHERE id=?').get(deviceA).trang_thai === 'dang_sua');
    rs = await api(`/api/technical-operations/work-orders/${orderId}/material-issues`, { method:'POST', body:{
        version:4, component_id:componentA, warehouse_id:warehouse, material_id:material,
        quantity:4, reason:'Thay vòng bi hỏng', idempotency_key:'ops21-issue-1'
    } });
    const issueId = rs.body.id;
    check('Material Issue post nguyên tử vào Stock Ledger', rs.response.status === 201
        && db.prepare('SELECT available FROM v_stock_balance WHERE warehouse_id=? AND material_id=?').get(warehouse,material).available === 16
        && db.prepare("SELECT status FROM stock_transactions WHERE id=?").get(rs.body.stock_transaction_id).status === 'POSTED');
    rs = await api(`/api/technical-operations/work-orders/${orderId}/material-issues`, { method:'POST', body:{
        version:5, component_id:componentA, warehouse_id:warehouse, material_id:material,
        quantity:4, reason:'Retry', idempotency_key:'ops21-issue-1'
    } });
    check('Retry Material Issue không double stock', rs.body.idempotent
        && db.prepare('SELECT available FROM v_stock_balance WHERE warehouse_id=? AND material_id=?').get(warehouse,material).available === 16);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/material-issues`, { method:'POST', body:{
        version:5, component_id:componentB, warehouse_id:warehouse, material_id:material,
        quantity:1, reason:'Sai component', idempotency_key:'ops21-bad-component'
    } });
    check('Không thể xuất vật tư cho Component khác Device', rs.response.status === 422);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/material-issues/${issueId}/reverse`, {
        method:'POST', body:{version:5,reason:'Xuất nhầm lô'}
    });
    check('Reversal vật tư phục hồi stock bằng entry đối ứng', rs.response.status === 201
        && db.prepare('SELECT available FROM v_stock_balance WHERE warehouse_id=? AND material_id=?').get(warehouse,material).available === 20
        && db.prepare('SELECT status FROM technical_material_issues WHERE id=?').get(issueId).status === 'REVERSED');
    rs = await api(`/api/technical-operations/work-orders/${orderId}/material-issues`, { method:'POST', body:{
        version:6, component_id:componentA, warehouse_id:warehouse, material_id:material,
        quantity:3, reason:'Xuất đúng vật tư', idempotency_key:'ops21-issue-2'
    } });
    check('Có thể xuất đợt vật tư tiếp theo sau reversal', rs.response.status === 201
        && db.prepare('SELECT available FROM v_stock_balance WHERE warehouse_id=? AND material_id=?').get(warehouse,material).available === 17);
    rs = await api(`/api/technical-operations/work-orders/${orderId}/complete`, { method:'POST', body:{
        version:7,result:'PASS',action_taken:'Đã thay vòng bi và chạy thử đạt',diagnosis:'Mòn vòng bi'
    } });
    check('Complete đồng bộ kết quả sang Device và Component canonical', rs.body.status === 'COMPLETED'
        && db.prepare('SELECT trang_thai||\'/\'||tinh_trang_ky_thuat s FROM devices WHERE id=?').get(deviceA).s === 'hoat_dong/tot'
        && db.prepare('SELECT condition FROM device_components WHERE id=?').get(componentA).condition === 'GOOD');
    let immutable = false;
    try { db.prepare("UPDATE technical_work_orders SET description='rewrite' WHERE id=?").run(orderId); } catch (error) { immutable = /immutable/.test(error.message); }
    check('Work order terminal bất biến ở tầng database', immutable);
    let eventImmutable = false;
    try { db.prepare("DELETE FROM technical_work_order_events WHERE work_order_id=?").run(orderId); } catch (error) { eventImmutable = /immutable/.test(error.message); }
    check('Lifecycle events là append-only', eventImmutable);

    rs = await api('/api/technical-operations/work-orders', { method:'POST', body:{
        operation_type:'INSPECTION',device_id:deviceA,primary_component_id:componentA,
        description:'Kiểm định an toàn sau sửa chữa',idempotency_key:'ops21-inspection'
    } });
    const inspectionId = rs.body.id;
    await api(`/api/technical-operations/work-orders/${inspectionId}/submit`, {method:'POST',body:{version:1}});
    await api(`/api/technical-operations/work-orders/${inspectionId}/approve`, {method:'POST',body:{version:2,reason:'Kiểm định bắt buộc'}});
    await api(`/api/technical-operations/work-orders/${inspectionId}/start`, {method:'POST',body:{version:3}});
    rs = await api(`/api/technical-operations/work-orders/${inspectionId}/complete`, {method:'POST',body:{
        version:4,result:'FAIL',action_taken:'Kiểm tra tải không đạt',next_due_date:'2043-06-30'
    }});
    check('Inspection FAIL cập nhật lifecycle, hạn và tình trạng thiết bị', rs.body.status === 'COMPLETED'
        && db.prepare('SELECT result||\'/\'||next_due_date s FROM technical_work_orders WHERE id=?').get(inspectionId).s === 'FAIL/2043-06-30'
        && db.prepare('SELECT tinh_trang_ky_thuat FROM devices WHERE id=?').get(deviceA).tinh_trang_ky_thuat === 'hong');
    rs = await api(`/api/component-tree/nodes/${componentA}`);
    check('Component drill-down nối work order và Material Issue canonical',
        rs.body.operations.some(x => x.id === orderId) && rs.body.material_issues.some(x => x.work_order_id === orderId));

    await login('ops21_px');
    rs = await api('/api/technical-operations/work-orders');
    check('PX chỉ xem work order trong đơn vị được phân công', rs.body.length >= 1 && rs.body.every(x => x.don_vi_id === unitA));
    await login('ops21_other');
    rs = await api(`/api/technical-operations/work-orders/${orderId}`);
    check('Chi tiết work order ngoài scope bị chặn', rs.response.status === 403);
    rs = await api('/api/technical-operations/work-orders', { method:'POST', body:{
        operation_type:'REPAIR',device_id:deviceA,description:'Ngoài scope',idempotency_key:'ops21-out-scope'
    } });
    check('Không thể tạo work order cho Device ngoài scope', rs.response.status === 403);

    server.close();
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed+failed} test =====`);
    db.close(); process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); try { db.close(); } catch (_) {} process.exit(1); });
