/** TASK 3 integration tests: canonical devices, mapping, linking, scope and compatibility. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');

process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-device-${Date.now()}.db`);
const db = require('../db');
const dbDir = path.join(__dirname,'..','db');
const migrations = fs.readdirSync(dbDir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
for (const f of migrations.filter(f => !['15-asset-master.sql','16-device-master.sql','17-asset-ledger.sql','18-transfer-handover.sql','19-inventory-ledger-qr.sql','20-technical-profile.sql','21-component-tree.sql','22-document-management.sql','23-material-master.sql','24-stock-ledger.sql','25-warehouse-transfer-return.sql','26-ncvt-period-submission.sql','27-ncvt-review-approval.sql','28-ncvt-company-aggregation.sql','29-ncvt-reservation.sql','30-ncvt-material-issue.sql','31-ncvt-receipt-confirmation.sql'].includes(f))) {
    db.exec(fs.readFileSync(path.join(dbDir,f),'utf8'));
}

const px1 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('D1','PX Device 1','san_xuat')").run().lastInsertRowid;
const px2 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('D2','PX Device 2','san_xuat')").run().lastInsertRowid;
const nhom = db.prepare('SELECT id FROM nhom_thiet_bi LIMIT 1').get().id;
const legacyId = db.prepare(`INSERT INTO thiet_bi
    (ma_tb,ten,nhom_id,ma_tscd,loai_ts,phan_xuong_id,so_seri,gio_chay_luy_ke)
    VALUES ('LEGACY.D1.001','Thiết bị legacy',?,'TS-D1-001','TSCD',?,'SN-001',125)`)
    .run(nhom,px1).lastInsertRowid;
db.exec(fs.readFileSync(path.join(dbDir,'15-asset-master.sql'),'utf8'));
db.exec(fs.readFileSync(path.join(dbDir,'16-device-master.sql'),'utf8'));

db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro)
    VALUES ('device_admin',?,'Admin Device','admin')`).run(bcrypt.hashSync('admin123',8));
db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id)
    VALUES ('device_px',?,'PX Device','px',?)`).run(bcrypt.hashSync('px12345',8),px1);

const app = require('../server');
let dat=0,truot=0;
function kt(ten,dk) { if (dk) { dat++; console.log(`  [ĐẠT]   ${ten}`); }
    else { truot++; console.log(`  [TRƯỢT] ${ten}`); } }

(async () => {
    console.log('\n===== TEST TASK 3 DEVICE MASTER =====');
    const mapped = db.prepare('SELECT * FROM devices WHERE legacy_thiet_bi_id=?').get(legacyId);
    kt('Backfill tạo Device ID và giữ legacy mapping',mapped?.ma_thiet_bi==='LEGACY.D1.001');
    kt('Backfill giữ hồ sơ kỹ thuật',mapped?.so_seri==='SN-001' && mapped?.gio_chay_luy_ke===125);
    const link = db.prepare('SELECT * FROM asset_device_links WHERE device_id=?').get(mapped.id);
    kt('Backfill liên kết asset/device chính',link?.la_lien_ket_chinh===1);

    const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`; let cookie='';
    async function api(url,options={}) {
        const headers={...(options.headers||{})}; if(cookie) headers.cookie=cookie;
        if(options.body) { headers['content-type']='application/json'; options.body=JSON.stringify(options.body); }
        const response=await fetch(base+url,{...options,headers});
        const setCookie=response.headers.get('set-cookie'); if(setCookie) cookie=setCookie.split(';')[0];
        let body; try { body=await response.json(); } catch (_) { body=null; }
        return {response,body};
    }
    await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:'device_admin',mat_khau:'admin123'}});
    let result=await api('/api/device-master',{method:'POST',body:{
        ma_thiet_bi:'DEV-D1-002',ten:'Bơm kỹ thuật',nhom_id:nhom,don_vi_id:px1,so_seri:'SN-002'
    }});
    kt('Tạo Device Master độc lập Asset',result.response.status===201 && result.body.id);
    const deviceId=result.body.id;
    kt('Chặn mã Device trùng',(await api('/api/device-master',{method:'POST',body:{
        ma_thiet_bi:'DEV-D1-002',ten:'Trùng',nhom_id:nhom,don_vi_id:px1
    }})).response.status===409);
    result=await api('/api/device-master?moi_trang=1&q=DEV-D1');
    kt('Danh sách có filter và pagination',result.response.status===200 && result.body.moi_trang===1);
    result=await api(`/api/device-master/${deviceId}`,{method:'PUT',body:{ten:'Bơm 6kV',version:1}});
    kt('Cập nhật optimistic version',result.response.status===200 && result.body.version===2);
    kt('Chặn cập nhật stale version',(await api(`/api/device-master/${deviceId}`,{
        method:'PUT',body:{ten:'Stale',version:1}
    })).response.status===409);
    kt('Chặn đổi đơn vị trực tiếp',(await api(`/api/device-master/${deviceId}`,{
        method:'PUT',body:{don_vi_id:px2,version:2}
    })).response.status===400);

    const assetId=db.prepare(`INSERT INTO assets
        (ma_tai_san,loai_tai_san,ten,don_vi_id,nguoi_tao_id) VALUES ('TS-D1-NEW','TSCD','Tài sản bơm',?,1)`)
        .run(px1).lastInsertRowid;
    result=await api(`/api/device-master/${deviceId}/lien-ket-tai-san`,{method:'POST',body:{
        asset_id:assetId,la_lien_ket_chinh:true
    }});
    kt('Liên kết Device với Asset',result.response.status===201);
    const linkId=result.body.id;
    result=await api(`/api/device-master/${deviceId}`);
    kt('Hồ sơ Device trả về Asset liên kết',result.body.tai_san_lien_ket.some(x=>x.asset_id===assetId));
    kt('Chấm dứt liên kết không xóa lịch sử',(await api(`/api/device-master/${deviceId}/lien-ket-tai-san/${linkId}`,{
        method:'DELETE'
    })).response.status===200 && db.prepare('SELECT den_ngay FROM asset_device_links WHERE id=?').get(linkId).den_ngay);
    result=await api(`/api/thiet-bi/${legacyId}`);
    kt('API legacy trả canonical Device ID và Asset ID',result.body.thiet_bi.device_id===mapped.id && !!result.body.thiet_bi.asset_id);

    cookie=''; await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:'device_px',mat_khau:'px12345'}});
    result=await api('/api/device-master');
    kt('PX chỉ thấy Device đúng scope',result.response.status===200 && result.body.danh_sach.every(x=>Number(x.don_vi_id)===Number(px1)));
    kt('Scope chặn tạo Device đơn vị khác',(await api('/api/device-master',{method:'POST',body:{
        ma_thiet_bi:'DEV-D2-001',ten:'Ngoài scope',nhom_id:nhom,don_vi_id:px2
    }})).response.status===403);

    server.close();
    console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat+truot} test =====`);
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(truot?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
