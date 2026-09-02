/** TASK 23: canonical reports, scope, pagination, Excel/PDF/print and export audit. */
const fs=require('fs');const path=require('path');const os=require('os');const bcrypt=require('bcryptjs');const ExcelJS=require('exceljs');
process.env.NODE_ENV='test';process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-reporting-${Date.now()}.db`);
const db=require('../db'),migrationDir=path.join(__dirname,'..','db');
for(const file of fs.readdirSync(migrationDir).filter(x=>/^\d+.*\.sql$/.test(x)).sort())db.exec(fs.readFileSync(path.join(migrationDir,file),'utf8'));
const hash=bcrypt.hashSync('admin123',8);function addUser(name,role,unit=null){return db.prepare('INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES(?,?,?,?,?)').run(name,hash,name,role,unit).lastInsertRowid;}
const unitA=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('R23A','PX Báo cáo A','san_xuat')").run().lastInsertRowid;
const unitB=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('R23B','PX Báo cáo B','san_xuat')").run().lastInsertRowid;
const admin=addUser('report23_admin','admin'),pxA=addUser('report23_pxa','px',unitA);addUser('report23_pxb','px',unitB);addUser('report23_view','xem',unitA);
const group=db.prepare("INSERT INTO nhom_thiet_bi(ma,ten) VALUES('REP.23','Nhóm Báo cáo')").run().lastInsertRowid;
const assetA1=db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,don_vi_id,so_luong,nguyen_gia,gia_tri_con_lai,nguoi_tao_id) VALUES('AS-R23-A1','TSCD','Tài sản Báo cáo A1',?,2,1000000,800000,?)").run(unitA,admin).lastInsertRowid;
const assetA2=db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,don_vi_id,so_luong,nguyen_gia,gia_tri_con_lai,nguoi_tao_id) VALUES('AS-R23-A2','CCDC','Tài sản Báo cáo A2',?,3,300000,200000,?)").run(unitA,admin).lastInsertRowid;
const assetB=db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,don_vi_id,so_luong,nguyen_gia,gia_tri_con_lai,nguoi_tao_id) VALUES('AS-R23-B','TSCD','Tài sản Báo cáo B',?,1,5000000,4000000,?)").run(unitB,admin).lastInsertRowid;
const deviceA=db.prepare("INSERT INTO devices(ma_thiet_bi,ten,nhom_id,don_vi_id,nguoi_tao_id) VALUES('DEV-R23-A','Thiết bị Báo cáo A',?,?,?)").run(group,unitA,admin).lastInsertRowid;
db.prepare("INSERT INTO devices(ma_thiet_bi,ten,nhom_id,don_vi_id,nguoi_tao_id) VALUES('DEV-R23-B','Thiết bị Báo cáo B',?,?,?)").run(group,unitB,admin);
db.prepare("INSERT INTO asset_transactions(id,ma_giao_dich,loai,trang_thai,idempotency_key,ngay_hieu_luc,nguoi_tao_id,nguoi_post_id,ngay_post) VALUES('tx-r23','TX-R23','ADJUSTMENT','POSTED','r23-tx','2026-09-01',?,?,datetime('now','localtime'))").run(admin,admin);
db.prepare("INSERT INTO asset_ledger_entries(id,transaction_id,asset_id,don_vi_id,so_luong_thay_doi,dvt,loai_entry,event_time,posted_by) VALUES('entry-r23','tx-r23',?,?,1,'Cái','ADJUSTMENT','2026-09-01',?)").run(assetA1,unitA,admin);
const material=db.prepare("INSERT INTO materials(material_code,name,normalized_name,base_uom_code,created_by) VALUES('MAT-R23','Vật tư Báo cáo','vật tư báo cáo','EA',?)").run(admin).lastInsertRowid;
const whA=db.prepare("INSERT INTO warehouses(warehouse_code,name,don_vi_id,created_by) VALUES('WH-R23-A','Kho Báo cáo A',?,?)").run(unitA,admin).lastInsertRowid;
const whB=db.prepare("INSERT INTO warehouses(warehouse_code,name,don_vi_id,created_by) VALUES('WH-R23-B','Kho Báo cáo B',?,?)").run(unitB,admin).lastInsertRowid;
db.prepare("INSERT INTO stock_balance_projection(warehouse_id,material_id,uom_code,on_hand,reserved,incoming) VALUES(?,?,'EA',10,2,3)").run(whA,material);
db.prepare("INSERT INTO stock_balance_projection(warehouse_id,material_id,uom_code,on_hand,reserved,incoming) VALUES(?,?,'EA',20,1,0)").run(whB,material);
db.prepare("INSERT INTO ncvt_periods(id,period_code,year,quarter,name,status,created_by) VALUES('period-r23','NCVT-2026-Q3-R23',2026,3,'Kỳ Báo cáo','OPEN',?)").run(admin);
db.prepare("INSERT INTO ncvt_submissions(id,submission_code,period_id,don_vi_id,status,created_by) VALUES('sub-r23','SUB-R23','period-r23',?,'APPROVED',?)").run(unitA,admin);
db.prepare("INSERT INTO ncvt_submission_lines(id,submission_id,material_id,uom_code,requested_quantity,created_by) VALUES('line-r23','sub-r23',?,'EA',5,?)").run(material,admin);
db.prepare("INSERT INTO technical_work_orders(id,work_order_code,operation_type,device_id,status,description,created_by) VALUES('wo-r23','WO-R23','REPAIR',?,'IN_PROGRESS','Sửa chữa thử báo cáo',?)").run(deviceA,admin);
db.prepare("INSERT INTO notification_cases(id,rule_code,fingerprint,category,entity_type,entity_id,don_vi_id,title,severity,owner_user_id,owner_role) VALUES('dq-r23','DOCUMENT_HASH_MISSING','dq:r23','DATA_QUALITY','DOCUMENT_VERSION','doc-r23',?,'Thiếu hash báo cáo','HIGH',?,'px')").run(unitA,pxA);

const app=require('../server');let pass=0,fail=0;function check(name,ok){if(ok){pass++;console.log(`  [ĐẠT]   ${name}`);}else{fail++;console.log(`  [TRƯỢT] ${name}`);}}
(async()=>{console.log('\n===== TEST TASK 23 REPORTING CENTER =====');const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 async function api(url,options={}){const headers={...(options.headers||{})};if(cookie)headers.cookie=cookie;if(options.body){headers['content-type']='application/json';options.body=JSON.stringify(options.body);}const response=await fetch(base+url,{...options,headers});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const type=response.headers.get('content-type')||'';let body;if(type.includes('json'))body=await response.json();else body=Buffer.from(await response.arrayBuffer());return{response,body};}
 async function login(name){cookie='';return api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:name,mat_khau:'admin123'}});}
 let rs=await api('/api/reports/catalog');check('Anonymous bị chặn',rs.response.status===401);
 await login('report23_admin');rs=await api('/api/reports/catalog');check('Catalog có 7 báo cáo canonical và capability đầy đủ',rs.body.reports.length===7&&rs.body.capabilities.excel&&rs.body.capabilities.pdf&&rs.body.capabilities.print&&rs.body.capabilities.audit);
 rs=await api('/api/reports/ASSET_REGISTER?page=1&page_size=1');check('Phân trang trả metadata và đúng một dòng',rs.response.status===200&&rs.body.rows.length===1&&rs.body.pagination.total===3&&rs.body.pagination.total_pages===3);
 rs=await api('/api/reports/ASSET_REGISTER?q=AS-R23-A2&status=dang_su_dung');check('Filter tìm kiếm + trạng thái dùng chung',rs.body.pagination.total===1&&rs.body.rows[0].asset_code==='AS-R23-A2');
 rs=await api('/api/reports/ASSET_LEDGER?date_from=2026-09-01&date_to=2026-09-01');check('Filter thời gian cho ledger',rs.body.pagination.total===1&&rs.body.rows[0].transaction_code==='TX-R23');
 rs=await api('/api/reports/ASSET_REGISTER?sort=asset_code%20DROP%20TABLE');check('Sort không whitelist bị chặn',rs.response.status===422);
 rs=await api('/api/reports/ASSET_REGISTER?don_vi_id=khong-hop-le');check('Mã đơn vị không hợp lệ bị chặn',rs.response.status===422);
 rs=await api('/api/reports/ASSET_REGISTER?date_from=2026-10-01&date_to=2026-09-01');check('Khoảng ngày đảo bị chặn',rs.response.status===422);
 for(const code of ['DEVICE_REGISTER','STOCK_BALANCE','NCVT_FULFILLMENT','TECHNICAL_OPERATIONS','DATA_QUALITY']){rs=await api(`/api/reports/${code}`);check(`${code} đọc được projection canonical`,rs.response.status===200&&Array.isArray(rs.body.rows));}

 await login('report23_pxa');rs=await api('/api/dashboard/baocao/danh-sach-thiet-bi');check('Legacy report chặn tài khoản PX để tránh rò dữ liệu ngoài phạm vi',rs.response.status===403);
 rs=await api('/api/reports/ASSET_REGISTER?page_size=100');check('PX chỉ thấy tài sản đúng assigned unit',rs.body.rows.length===2&&rs.body.rows.every(x=>x.unit_code==='R23A'));
 rs=await api(`/api/reports/ASSET_REGISTER?don_vi_id=${unitB}`);check('Filter đơn vị ngoài scope trả 403',rs.response.status===403);
 rs=await api('/api/reports/STOCK_BALANCE');check('Scope áp dụng cho tồn kho canonical',rs.body.rows.length===1&&rs.body.rows[0].warehouse_code==='WH-R23-A');
 rs=await api('/api/reports/DATA_QUALITY');check('PX không đọc data-quality đơn vị khác/cấp Công ty',rs.body.rows.length===1&&rs.body.rows[0].unit_code==='R23A');
 rs=await api('/api/reports/ASSET_REGISTER/export',{method:'POST',body:{format:'XLSX',filters:{}}});const exportId=rs.response.headers.get('x-qlcd-export-id');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(rs.body);const ws=wb.worksheets[0];check('Excel chuẩn có tiêu đề, header và chỉ dữ liệu trong scope',rs.response.status===200&&ws.getCell('A2').value==='Sổ đăng ký tài sản'&&ws.rowCount===8&&!JSON.stringify(ws.getSheetValues()).includes('AS-R23-B'));
 rs=await api('/api/reports/TECHNICAL_OPERATIONS/export',{method:'POST',body:{format:'PDF',filters:{}}});check('PDF Unicode được tạo và có row-count',rs.response.status===200&&rs.body.slice(0,4).toString()==='%PDF'&&rs.response.headers.get('x-qlcd-row-count')==='1');
 rs=await api('/api/reports/ASSET_REGISTER/export',{method:'POST',body:{format:'PRINT',filters:{q:'AS-R23-A1'}}});const html=rs.body.toString('utf8');check('Bản in HTML có mẫu chuẩn và không rò dữ liệu ngoài scope',rs.response.status===200&&html.includes('Sổ đăng ký tài sản')&&html.includes('AS-R23-A1')&&!html.includes('AS-R23-B')&&html.includes('window.print'));

 await login('report23_admin');rs=await api('/api/reports/exports');check('Export audit lưu format/hash/actor/row count',rs.body.length===3&&rs.body.some(x=>x.id===exportId&&x.content_sha256?.length===64&&x.row_count===2));
 let immutable=false;try{db.prepare('DELETE FROM report_export_runs WHERE id=?').run(exportId);}catch(e){immutable=/immutable/.test(e.message);}check('Export audit bất biến ở database',immutable);
 check('Migration tạo index report performance',db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name LIKE '%_report'").get().n>=7);
 db.prepare("UPDATE report_definitions SET max_export_rows=1 WHERE code='ASSET_REGISTER'").run();
 rs=await api('/api/reports/ASSET_REGISTER/export',{method:'POST',body:{format:'XLSX',filters:{}}});check('Export quá giới hạn bị chặn và ghi FAILED audit',rs.response.status===413&&db.prepare("SELECT COUNT(*) n FROM report_export_runs WHERE report_code='ASSET_REGISTER' AND status='FAILED'").get().n===1);

 await login('report23_view');rs=await api('/api/reports/ASSET_REGISTER');check('Người xem được đọc báo cáo theo scope',rs.response.status===200&&rs.body.rows.length===2);
 rs=await api('/api/reports/ASSET_REGISTER/export',{method:'POST',body:{format:'XLSX',filters:{}}});check('Người xem không được export',rs.response.status===403);
 rs=await api('/api/reports/exports');check('Người xem không đọc export audit',rs.response.status===403);
 server.close();console.log(`===== KẾT QUẢ: ${pass} đạt / ${fail} trượt / ${pass+fail} test =====`);db.close();process.exit(fail?1:0);
})().catch(error=>{console.error(error);try{db.close();}catch(_){}process.exit(1);});
