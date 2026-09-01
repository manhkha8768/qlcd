/** TASK 22: notifications, ownership, triage, escalation and data-quality acceptance tests. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-notifications-${Date.now()}.db`);
const db = require('../db');
const migrationDir = path.join(__dirname, '..', 'db');
for (const file of fs.readdirSync(migrationDir).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
}

const hash = bcrypt.hashSync('admin123', 8);
function user(username, role, unit = null) {
    return db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id)
        VALUES (?,?,?,?,?)`).run(username, hash, username, role, unit).lastInsertRowid;
}
const unitA = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PX22A','Phân xưởng 22 A','san_xuat')").run().lastInsertRowid;
const unitB = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PX22B','Phân xưởng 22 B','san_xuat')").run().lastInsertRowid;
const admin = user('notify22_admin', 'admin');
const reviewer = user('notify22_reviewer', 'cd_cty');
const pxA = user('notify22_pxa', 'px', unitA);
user('notify22_pxb', 'px', unitB);
user('notify22_view', 'xem', unitA);

const group = db.prepare("INSERT INTO nhom_thiet_bi(ma,ten) VALUES('NOT.22','Nhóm Notifications')").run().lastInsertRowid;
const device = db.prepare(`INSERT INTO devices(ma_thiet_bi,ten,nhom_id,don_vi_id,nguoi_tao_id)
    VALUES('DEV-NOT-22','Thiết bị cần kiểm định',?,?,?)`).run(group, unitA, admin).lastInsertRowid;
db.prepare(`INSERT INTO technical_work_orders(id,work_order_code,operation_type,device_id,status,description,
    result,next_due_date,created_by) VALUES('wo-notify-22','TO-NOTIFY-22','INSPECTION',?,'COMPLETED',
    'Kiểm định định kỳ','PASS','2026-09-03',?)`).run(device, admin);

const matA = db.prepare(`INSERT INTO materials(material_code,name,normalized_name,base_uom_code,created_by)
    VALUES('MAT-NOT-A','Bu lông A','bu lông','EA',?)`).run(admin).lastInsertRowid;
const matB = db.prepare(`INSERT INTO materials(material_code,name,normalized_name,base_uom_code,created_by)
    VALUES('MAT-NOT-B','Bu lông B','bu lông','EA',?)`).run(admin).lastInsertRowid;
const mapping = db.prepare(`INSERT INTO material_source_mappings(source_type,source_id,source_code,source_name,
    source_uom,mapping_status) VALUES('WAREHOUSE','notify-source','VT-NOT','Vật tư chưa map','cái','UNMAPPED')`).run().lastInsertRowid;
db.prepare(`INSERT INTO material_duplicate_candidates(material_a_id,material_b_id,reason,score)
    VALUES(?,?, 'SAME_NORMALIZED_NAME',0.95)`).run(matA, matB);
db.prepare(`INSERT INTO documents(id,document_code,title,created_by) VALUES('doc-notify','DOC-NOT-22','File legacy thiếu hash',?)`).run(admin);
db.prepare(`INSERT INTO document_versions(id,document_id,version_number,original_filename,storage_provider,
    object_key,size_bytes,uploaded_by) VALUES('doc-version-notify','doc-notify',1,'legacy.pdf','LOCAL_LEGACY','legacy.pdf',100,?)`).run(admin);

db.prepare(`INSERT INTO ncvt_periods(id,period_code,year,quarter,name,status,created_by)
    VALUES('period-notify','NCVT-2026-Q3-NOT',2026,3,'Kỳ Notifications','OPEN',?)`).run(admin);
db.prepare(`INSERT INTO ncvt_submissions(id,submission_code,period_id,don_vi_id,status,version,created_by,
    submitted_by,submitted_at) VALUES('submission-notify','SUB-NOT-22','period-notify',?,'SUBMITTED',2,?,?,
    '2026-08-25 08:00:00')`).run(unitA, pxA, pxA);
db.prepare(`INSERT INTO ncvt_review_assignments(id,period_id,don_vi_id,reviewer_user_id,assigned_by)
    VALUES('assignment-notify','period-notify',?,?,?)`).run(unitA, reviewer, admin);

const { evaluateNotifications } = require('../lib/notification-engine');
let passed = 0; let failed = 0;
function check(name, ok) {
    if (ok) { passed++; console.log(`  [ĐẠT]   ${name}`); }
    else { failed++; console.log(`  [TRƯỢT] ${name}`); }
}

(async () => {
    console.log('\n===== TEST TASK 22 NOTIFICATIONS + DATA QUALITY =====');
    let run = evaluateNotifications({ triggerType:'TEST', actorId:admin, now:new Date('2026-09-02T05:00:00Z') });
    check('Job đánh giá đủ 5 rule chuẩn', run.status === 'SUCCEEDED' && run.rules_evaluated === 5);
    check('Tạo case idempotent theo fingerprint cho 5 nguồn', run.cases_created === 5
        && db.prepare('SELECT COUNT(*) n FROM notification_cases').get().n === 5);
    check('Công việc kỹ thuật tự gán đúng người PX trong đơn vị',
        db.prepare("SELECT owner_user_id FROM notification_cases WHERE rule_code='TECHNICAL_DUE'").get().owner_user_id === pxA);
    check('NCVT chờ review tự gán reviewer đang ACTIVE',
        db.prepare("SELECT owner_user_id FROM notification_cases WHERE rule_code='NCVT_REVIEW_PENDING'").get().owner_user_id === reviewer);
    check('Data quality phân loại riêng và có owner', db.prepare("SELECT COUNT(*) n FROM notification_cases WHERE category='DATA_QUALITY' AND owner_user_id=?").get(reviewer).n === 3);
    run = evaluateNotifications({ triggerType:'TEST', actorId:admin, now:new Date('2026-09-02T06:00:00Z') });
    check('Chạy lại không nhân case hoặc delivery DETECTED', run.cases_created === 0
        && db.prepare('SELECT COUNT(*) n FROM notification_cases').get().n === 5
        && db.prepare("SELECT COUNT(*) n FROM notification_deliveries WHERE delivery_event='DETECTED'").get().n === 5);

    const app = require('../server'); const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`; let cookie = '';
    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) }; if (cookie) headers.cookie = cookie;
        if (options.body) { headers['content-type']='application/json'; options.body=JSON.stringify(options.body); }
        const response = await fetch(base+url,{...options,headers});
        const setCookie=response.headers.get('set-cookie'); if(setCookie) cookie=setCookie.split(';')[0];
        let body=null; try{body=await response.json();}catch(_){}
        return {response,body};
    }
    async function login(username){cookie='';return api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:username,mat_khau:'admin123'}});}

    let rs = await api('/api/notifications/summary');
    check('Anonymous bị chặn khỏi hàng đợi', rs.response.status === 401);
    await login('notify22_pxa');
    rs = await api('/api/notifications/cases');
    check('PX chỉ thấy case thuộc đúng đơn vị, không thấy data quality cấp Công ty', rs.body.length === 2
        && rs.body.every(x => x.don_vi_id === unitA) && rs.body.every(x => x.category === 'NOTIFICATION'));
    const tech = rs.body.find(x => x.rule_code === 'TECHNICAL_DUE');
    rs = await api(`/api/notifications/cases/${tech.id}/acknowledge`,{method:'POST',body:{version:tech.version}});
    check('Owner tiếp nhận bằng optimistic version', rs.body.status === 'ACKNOWLEDGED' && rs.body.version === 2);
    rs = await api(`/api/notifications/cases/${tech.id}/acknowledge`,{method:'POST',body:{version:tech.version}});
    check('Retry version cũ hoặc trạng thái sai bị chặn', rs.response.status === 409);
    await login('notify22_pxb');
    rs = await api('/api/notifications/cases');
    check('PX khác không nhìn thấy case ngoài scope', rs.body.length === 0);
    rs = await api(`/api/notifications/cases/${tech.id}/start`,{method:'POST',body:{version:2}});
    check('PX khác không thể xử lý case', rs.response.status === 403);

    await login('notify22_admin');
    rs = await api(`/api/notifications/cases/${tech.id}/reassign`,{method:'POST',body:{version:2,owner_user_id:pxA,reason:'Giữ người phụ trách đơn vị'}});
    check('Phân công có lý do và tạo delivery riêng', rs.response.status === 200 && rs.body.version === 3
        && db.prepare("SELECT COUNT(*) n FROM notification_case_events WHERE case_id=? AND event_type='REASSIGNED'").get(tech.id).n === 1);
    rs = await api(`/api/notifications/cases/${tech.id}/resolve`,{method:'POST',body:{version:3,reason:'Đã lập lịch kiểm định'}});
    check('Resolve bắt buộc kết quả và giữ audit actor', rs.body.status === 'RESOLVED'
        && db.prepare('SELECT resolved_by FROM notification_cases WHERE id=?').get(tech.id).resolved_by === admin);
    run = evaluateNotifications({ triggerType:'TEST', actorId:admin, now:new Date('2026-09-02T07:00:00Z') });
    check('Nguồn còn tồn tại làm case RESOLVED được reopen', run.cases_reopened === 1
        && db.prepare('SELECT status FROM notification_cases WHERE id=?').get(tech.id).status === 'OPEN');

    db.prepare("UPDATE material_source_mappings SET material_id=?,mapping_status='MAPPED' WHERE id=?").run(matA,mapping);
    run = evaluateNotifications({ triggerType:'TEST', actorId:admin, now:new Date('2026-09-02T08:00:00Z') });
    check('Nguồn đã sửa được auto-resolve, không xóa lịch sử', run.cases_auto_resolved === 1
        && db.prepare("SELECT status FROM notification_cases WHERE rule_code='MATERIAL_MAPPING_REVIEW'").get().status === 'RESOLVED');

    const duplicateCase = db.prepare("SELECT * FROM notification_cases WHERE rule_code='MATERIAL_DUPLICATE_PENDING'").get();
    db.prepare("UPDATE notification_cases SET next_escalation_at='2026-09-01 00:00:00' WHERE id=?").run(duplicateCase.id);
    run = evaluateNotifications({ triggerType:'TEST', actorId:admin, now:new Date('2026-09-02T09:00:00Z') });
    check('Quá hạn tự escalation và gửi cả owner/admin', run.cases_escalated >= 1
        && db.prepare('SELECT escalation_level FROM notification_cases WHERE id=?').get(duplicateCase.id).escalation_level === 1
        && db.prepare("SELECT COUNT(*) n FROM notification_deliveries WHERE case_id=? AND delivery_event='ESCALATED'").get(duplicateCase.id).n === 2);

    rs = await api('/api/notifications/rules'); const rule = rs.body.find(x=>x.code==='TECHNICAL_DUE');
    rs = await api('/api/notifications/rules/TECHNICAL_DUE',{method:'PUT',body:{version:rule.version,enabled:true,lead_days:14,escalation_hours:12,reason:'Áp dụng SLA kỹ thuật mới'}});
    check('Admin cấu hình rule có optimistic version', rs.body.version === rule.version+1
        && db.prepare("SELECT lead_days FROM notification_rules WHERE code='TECHNICAL_DUE'").get().lead_days === 14
        && db.prepare("SELECT COUNT(*) n FROM notification_rule_events WHERE rule_code='TECHNICAL_DUE'").get().n === 1);
    rs = await api('/api/notifications/job-runs');
    check('Job journal lưu thống kê và trạng thái', rs.body.length >= 5 && rs.body.every(x=>x.status==='SUCCEEDED'));
    let immutable=false; try{db.prepare('DELETE FROM notification_case_events WHERE case_id=?').run(tech.id);}catch(e){immutable=/immutable/.test(e.message);}
    check('Triage event append-only ở database', immutable);

    await login('notify22_view');
    rs = await api('/api/notifications/evaluate',{method:'POST'});
    check('Người chỉ xem không thể chạy job', rs.response.status === 403);
    rs = await api(`/api/notifications/cases/${tech.id}/start`,{method:'POST',body:{version:5}});
    check('Người chỉ xem không thể mutation', rs.response.status === 403);

    server.close();
    console.log(`===== KẾT QUẢ: ${passed} đạt / ${failed} trượt / ${passed+failed} test =====`);
    db.close(); process.exit(failed?1:0);
})().catch(error=>{console.error(error);try{db.close();}catch(_){}process.exit(1);});
