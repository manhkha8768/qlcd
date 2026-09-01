/** TASK 5 integration tests: two-party handover, evidence, approval and atomic posting. */
const fs=require('fs');const path=require('path');const os=require('os');const bcrypt=require('bcryptjs');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-handover-${Date.now()}.db`);
const db=require('../db'),dbDir=path.join(__dirname,'..','db');
const migrations=fs.readdirSync(dbDir).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
for(const f of migrations.filter(f=>!['17-asset-ledger.sql','18-transfer-handover.sql','19-inventory-ledger-qr.sql','20-technical-profile.sql','21-component-tree.sql','22-document-management.sql','23-material-master.sql','24-stock-ledger.sql','25-warehouse-transfer-return.sql','26-ncvt-period-submission.sql','27-ncvt-review-approval.sql','28-ncvt-company-aggregation.sql','29-ncvt-reservation.sql','30-ncvt-material-issue.sql','31-ncvt-receipt-confirmation.sql','32-ncvt-carry-forward-lock.sql'].includes(f)))db.exec(fs.readFileSync(path.join(dbDir,f),'utf8'));
const px1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('H1','PX Giao','san_xuat')").run().lastInsertRowid;
const px2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('H2','PX Nhận','san_xuat')").run().lastInsertRowid;
const assetId=db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,dvt,so_luong,don_vi_id,trang_thai) VALUES ('HANDOVER-001','TSCD','Tài sản giao nhận','Cái',5,?,'dang_su_dung')").run(px1).lastInsertRowid;
db.exec(fs.readFileSync(path.join(dbDir,'17-asset-ledger.sql'),'utf8'));db.exec(fs.readFileSync(path.join(dbDir,'18-transfer-handover.sql'),'utf8'));
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES ('sender',?,'Bên giao','px',?)").run(bcrypt.hashSync('send123',8),px1);
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES ('receiver',?,'Bên nhận','px',?)").run(bcrypt.hashSync('recv123',8),px2);
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro) VALUES ('approver',?,'Người duyệt','admin')").run(bcrypt.hashSync('admin123',8));
const app=require('../server');let dat=0,truot=0;function kt(n,d){if(d){dat++;console.log(`  [ĐẠT]   ${n}`);}else{truot++;console.log(`  [TRƯỢT] ${n}`);}}
(async()=>{console.log('\n===== TEST TASK 5 TRANSFER HANDOVER =====');const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
async function api(url,options={}){const headers={...(options.headers||{})};if(cookie)headers.cookie=cookie;if(options.body&&!(options.body instanceof FormData)){headers['content-type']='application/json';options.body=JSON.stringify(options.body);}const response=await fetch(base+url,{...options,headers});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body;try{body=await response.json();}catch(_){body=null;}return{response,body};}
async function login(user,password){cookie='';return api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:user,mat_khau:password}});}
await login('sender','send123');let result=await api('/api/asset-ledger',{method:'POST',headers:{'Idempotency-Key':'handover-001'},body:{loai:'TRANSFER',ly_do:'Điều chuyển vận hành',chi_tiet:[{asset_id:assetId,so_luong:2,don_vi_nguon_id:px1,don_vi_dich_id:px2}]}});const txId=result.body.id;
kt('Bên giao lập phiếu sang đơn vị khác',result.response.status===201&&txId);
kt('Chặn post bỏ qua workflow',(await api(`/api/asset-ledger/${txId}/post`,{method:'POST'})).response.status===403);
result=await api(`/api/asset-ledger/${txId}/submit`,{method:'POST'});kt('Bên giao trình phiếu',result.body.trang_thai==='SUBMITTED');
result=await api(`/api/asset-ledger/${txId}/sender-confirm`,{method:'POST'});kt('Bên giao xác nhận bàn giao',result.body.trang_thai==='SENDER_CONFIRMED');
await login('receiver','recv123');kt('Bên nhận không xác nhận khi thiếu chứng từ',(await api(`/api/asset-ledger/${txId}/receiver-confirm`,{method:'POST'})).response.status===409);
const form=new FormData();form.append('loai_chung_tu','bien_ban_giao_nhan');form.append('file',new Blob([Buffer.from('bien ban giao nhan')],{type:'application/pdf'}),'bien-ban.pdf');
result=await api(`/api/asset-ledger/${txId}/documents`,{method:'POST',body:form});kt('Bên nhận tải chứng từ giao nhận',result.response.status===201);const docId=result.body.id;
const downloaded=await fetch(`${base}/api/asset-ledger/${txId}/documents/${docId}/download`,{headers:{cookie}});kt('Bên nhận tải xuống được chứng từ trong scope',downloaded.status===200&&Buffer.from(await downloaded.arrayBuffer()).length>0);
result=await api(`/api/asset-ledger/${txId}/receiver-confirm`,{method:'POST'});kt('Bên nhận xác nhận tiếp nhận',result.body.trang_thai==='RECEIVER_CONFIRMED');
kt('Bên nhận không tự duyệt',(await api(`/api/asset-ledger/${txId}/approve`,{method:'POST'})).response.status===403);
await login('approver','admin123');kt('Người có quyền post vẫn không được bỏ qua approval',(await api(`/api/asset-ledger/${txId}/post`,{method:'POST'})).response.status===409);
result=await api(`/api/asset-ledger/${txId}/approve`,{method:'POST'});kt('Duyệt và post nguyên tử',result.response.status===200&&result.body.trang_thai==='POSTED');
const wf=db.prepare('SELECT * FROM asset_transfer_workflows WHERE transaction_id=?').get(txId);const tx=db.prepare('SELECT * FROM asset_transactions WHERE id=?').get(txId);
kt('Workflow và transaction cùng POSTED',wf.trang_thai==='POSTED'&&tx.trang_thai==='POSTED');
kt('Ledger chỉ sinh sau phê duyệt',db.prepare('SELECT COUNT(*) n FROM asset_ledger_entries WHERE transaction_id=?').get(txId).n===2);
const q1=db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px1).so_luong;const q2=db.prepare('SELECT so_luong FROM asset_balance_projection WHERE asset_id=? AND don_vi_id=?').get(assetId,px2).so_luong;
kt('Projection chuyển 2 tài sản giữa hai đơn vị',q1===3&&q2===2);
result=await api(`/api/asset-ledger/${txId}`);kt('Chi tiết có timeline và chứng từ',result.body.timeline.length===5&&result.body.chung_tu.length===1);
kt('Phê duyệt lặp không post lần hai',(await api(`/api/asset-ledger/${txId}/approve`,{method:'POST'})).response.status===409&&db.prepare('SELECT COUNT(*) n FROM asset_ledger_entries WHERE transaction_id=?').get(txId).n===2);
await login('sender','send123');result=await api('/api/asset-ledger',{method:'POST',headers:{'Idempotency-Key':'handover-reject'},body:{loai:'TRANSFER',chi_tiet:[{asset_id:assetId,so_luong:1,don_vi_nguon_id:px1,don_vi_dich_id:px2}]}});const rejectId=result.body.id;await api(`/api/asset-ledger/${rejectId}/submit`,{method:'POST'});
await login('approver','admin123');result=await api(`/api/asset-ledger/${rejectId}/reject`,{method:'POST',body:{ly_do:'Thiếu quyết định'}});kt('Từ chối bắt buộc lý do và không post',result.body.trang_thai==='REJECTED'&&db.prepare('SELECT COUNT(*) n FROM asset_ledger_entries WHERE transaction_id=?').get(rejectId).n===0);
server.close();console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat+truot} test =====`);try{db.close();}catch(_){}process.exit(truot?1:0);})().catch(e=>{console.error(e);process.exit(1);});
