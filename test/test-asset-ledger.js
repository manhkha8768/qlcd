/** TASK 4 integration tests: append-only posting, idempotency, reversal, projection. */
const fs=require('fs'); const path=require('path'); const os=require('os'); const bcrypt=require('bcryptjs');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-ledger-${Date.now()}.db`);
const db=require('../db'); const dbDir=path.join(__dirname,'..','db');
const migrations=fs.readdirSync(dbDir).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
for(const f of migrations.filter(f=>!['17-asset-ledger.sql','18-transfer-handover.sql','19-inventory-ledger-qr.sql','20-technical-profile.sql','21-component-tree.sql','22-document-management.sql','23-material-master.sql','24-stock-ledger.sql','25-warehouse-transfer-return.sql','26-ncvt-period-submission.sql','27-ncvt-review-approval.sql','28-ncvt-company-aggregation.sql','29-ncvt-reservation.sql','30-ncvt-material-issue.sql'].includes(f)))db.exec(fs.readFileSync(path.join(dbDir,f),'utf8'));
const px1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('L1','PX Ledger 1','san_xuat')").run().lastInsertRowid;
const px2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('L2','PX Ledger 2','san_xuat')").run().lastInsertRowid;
const assetId=db.prepare(`INSERT INTO assets(ma_tai_san,loai_tai_san,ten,dvt,so_luong,don_vi_id,trang_thai)
    VALUES ('LEDGER-001','TSCD','Tài sản ledger','Cái',10,?,'dang_su_dung')`).run(px1).lastInsertRowid;
db.exec(fs.readFileSync(path.join(dbDir,'17-asset-ledger.sql'),'utf8'));
db.exec(fs.readFileSync(path.join(dbDir,'18-transfer-handover.sql'),'utf8'));
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro) VALUES ('ledger_admin',?,'Admin Ledger','admin')").run(bcrypt.hashSync('admin123',8));
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES ('ledger_px',?,'PX Ledger','px',?)").run(bcrypt.hashSync('px12345',8),px1);
const app=require('../server'); let dat=0,truot=0;
function kt(ten,dk){if(dk){dat++;console.log(`  [ĐẠT]   ${ten}`);}else{truot++;console.log(`  [TRƯỢT] ${ten}`);}}

(async()=>{
 console.log('\n===== TEST TASK 4 ASSET LEDGER =====');
 kt('Opening entry backfill từ Asset Master',db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px1)?.so_luong===10);
 const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 async function api(url,options={}){const headers={...(options.headers||{})};if(cookie)headers.cookie=cookie;if(options.body){headers['content-type']='application/json';options.body=JSON.stringify(options.body);}const response=await fetch(base+url,{...options,headers});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body;try{body=await response.json();}catch(_){body=null;}return{response,body};}
 await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:'ledger_admin',mat_khau:'admin123'}});
 const payload={loai:'TRANSFER',ly_do:'Điều chuyển thử',chi_tiet:[{asset_id:assetId,so_luong:4,don_vi_nguon_id:px1,don_vi_dich_id:px2}]};
 let result=await api('/api/asset-ledger',{method:'POST',headers:{'Idempotency-Key':'transfer-001'},body:payload});
 kt('Tạo transaction DRAFT',result.response.status===201&&result.body.trang_thai==='DRAFT'); const txId=result.body.id;
 result=await api('/api/asset-ledger',{method:'POST',headers:{'Idempotency-Key':'transfer-001'},body:payload});
 kt('Idempotency trả lại transaction cũ',result.response.status===200&&result.body.id===txId&&result.body.idempotent);
 db.prepare("UPDATE asset_transfer_workflows SET trang_thai='RECEIVER_CONFIRMED' WHERE transaction_id=?").run(txId);
 result=await api(`/api/asset-ledger/${txId}/approve`,{method:'POST'});
 kt('Post transaction thành công',result.response.status===200);
 let entries=db.prepare('SELECT * FROM asset_ledger_entries WHERE transaction_id=?').all(txId);
 kt('Transfer tạo đúng cặp OUT/IN',entries.length===2&&entries.reduce((s,x)=>s+x.so_luong_thay_doi,0)===0);
 const p1=db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px1);
 const p2=db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px2);
 kt('Projection cập nhật 6 nguồn / 4 đích',p1.so_luong===6&&p2.so_luong===4);
 await api(`/api/asset-ledger/${txId}/post`,{method:'POST'});
 kt('Post lặp không nhân đôi entry',db.prepare('SELECT COUNT(*) n FROM asset_ledger_entries WHERE transaction_id=?').get(txId).n===2);
 let immutable=false;try{db.prepare('UPDATE asset_ledger_entries SET so_luong_thay_doi=99 WHERE transaction_id=?').run(txId);}catch(e){immutable=/immutable/.test(e.message);}kt('Entry POSTED không thể update',immutable);
 result=await api(`/api/asset-ledger/${txId}/reverse`,{method:'POST',body:{ly_do:'Hoàn tác kiểm thử'}});
 kt('Tạo reversal có lý do',result.response.status===201); const reversalId=result.body.id;
 kt('Reversal đảo đủ từng entry',db.prepare('SELECT COUNT(*) n FROM asset_ledger_entries WHERE transaction_id=?').get(reversalId).n===2);
 const after=db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px1);
 kt('Projection trở về opening sau reversal',after.so_luong===10&&!db.prepare('SELECT 1 FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=? AND so_luong<>0').get(assetId,px2));
 kt('Chặn reversal lần hai',(await api(`/api/asset-ledger/${txId}/reverse`,{method:'POST',body:{ly_do:'Lặp'}})).response.status===409);
 db.prepare('DELETE FROM asset_balance_projection').run(); result=await api('/api/asset-ledger/rebuild',{method:'POST'});
 kt('Rebuild projection hoàn toàn từ ledger',result.response.status===200&&db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px1).so_luong===10);
 result=await api('/api/asset-ledger/reconciliation');kt('Reconciliation không tự sửa và không báo sai sau reversal',result.response.status===200&&result.body.tong_sai_lech===0);
 cookie='';await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:'ledger_px',mat_khau:'px12345'}});
 result=await api('/api/asset-ledger',{method:'POST',headers:{'Idempotency-Key':'scope-001'},body:{loai:'TRANSFER',chi_tiet:[{asset_id:assetId,so_luong:1,don_vi_nguon_id:px2,don_vi_dich_id:px1}]}});
 kt('Data scope chặn transaction ngoài đơn vị',result.response.status===403);
 result=await api('/api/asset-ledger/projection');kt('PX chỉ xem projection đúng scope',result.response.status===200&&result.body.every(x=>Number(x.don_vi_id)===Number(px1)));
 server.close();console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat+truot} test =====`);try{db.close();}catch(_){}process.exit(truot?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
