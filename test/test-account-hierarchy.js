/** Phân cấp tài khoản: quản lý/chỉ xem, capability duyệt và Work Inbox. */
const path=require('path'),os=require('os'),bcrypt=require('bcryptjs'),fs=require('fs');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-hierarchy-${Date.now()}.db`);
const {khoiTaoDatabase}=require('../db/init'),db=khoiTaoDatabase(),hash=bcrypt.hashSync('admin123',8);
const px1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PC1','PX quản lý','san_xuat')").run().lastInsertRowid;
const px2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PC2','PX chỉ xem','san_xuat')").run().lastInsertRowid;
const px3=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('PC3','PX ngoài scope','san_xuat')").run().lastInsertRowid;
const manager=db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro) VALUES('manager_scope',?,'Cán bộ quản lý','cd_cty')").run(hash).lastInsertRowid;
const creator=db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES('creator_scope',?,'Người nhập','px',?)").run(hash,px1).lastInsertRowid;
const nhom=db.prepare('SELECT id FROM nhom_thiet_bi WHERE cap=2 LIMIT 1').get().id;
const ins=db.prepare("INSERT INTO thiet_bi(ma_tb,ten,nhom_id,phan_xuong_id,nguoi_tao_id,trang_thai_duyet) VALUES(?,?,?,?,?,'cho_duyet')");
const managedAsset=ins.run('PC1-TB','Thiết bị được quản lý',nhom,px1,creator).lastInsertRowid;
const viewAsset=ins.run('PC2-TB','Thiết bị chỉ xem',nhom,px2,creator).lastInsertRowid;
ins.run('PC3-TB','Thiết bị ngoài phạm vi',nhom,px3,creator);
const app=require('../server');let pass=0,fail=0;const check=(n,ok)=>ok?(pass++,console.log('  [ĐẠT] '+n)):(fail++,console.log('  [TRƯỢT] '+n));
(async()=>{const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
async function api(url,o={}){const h={...(o.headers||{})};if(cookie)h.cookie=cookie;if(o.body!==undefined){h['content-type']='application/json';o.body=JSON.stringify(o.body);}const response=await fetch(base+url,{...o,headers:h});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body;try{body=await response.json();}catch(_){body=null;}return{response,body};}
async function login(name){cookie='';return api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:name,mat_khau:'admin123'}});}
await login('admin');let rs=await api(`/api/auth/tai-khoan/${manager}/phan-cap`,{method:'PUT',body:{level_code:'MULTI_UNIT_MANAGER',managed_unit_ids:[px1],view_unit_ids:[px2],permissions:['thietbi.xem','thietbi.duyet','thietbi.tu_choi']}});check('Admin lưu phân cấp',rs.response.status===200);
rs=await api(`/api/auth/tai-khoan/${manager}/phan-cap`,{method:'PUT',body:{level_code:'MULTI_UNIT_MANAGER',managed_unit_ids:[px1],view_unit_ids:[px1],permissions:[]}});check('Chặn trùng quản lý và chỉ xem',rs.response.status===400);
await login('manager_scope');rs=await api('/api/thiet-bi?moi_trang=100');const codes=rs.body.danh_sach.map(x=>x.ma_tb);check('Đọc đơn vị quản lý và chỉ xem nhưng không rò ngoài scope',codes.includes('PC1-TB')&&codes.includes('PC2-TB')&&!codes.includes('PC3-TB'));
rs=await api('/api/work-inbox');check('Work Inbox chỉ có thiết bị thuộc phạm vi quản lý',rs.body.approvals.some(x=>x.id===managedAsset)&&!rs.body.approvals.some(x=>x.id===viewAsset));
rs=await api(`/api/thiet-bi/${viewAsset}/dong-y`,{method:'POST',body:{}});check('Không duyệt đơn vị chỉ xem',rs.response.status===403);
rs=await api(`/api/thiet-bi/${managedAsset}/dong-y`,{method:'POST',body:{}});check('Duyệt thiết bị đơn vị quản lý',rs.response.status===200);
rs=await api(`/api/thiet-bi/${managedAsset}/dong-y`,{method:'POST',body:{}});check('Chặn duyệt lại',rs.response.status===409);
check('Ghi audit thay đổi phân cấp',!!db.prepare("SELECT 1 FROM audit_quyen WHERE hanh_dong='cap_nhat_phan_cap'").get());
const ui=fs.readFileSync(path.join(__dirname,'..','public','js','man-hinh.js'),'utf8');check('UI có hai cột Quản lý và Chỉ xem',/pc-manage/.test(ui)&&/pc-view/.test(ui)&&/Phân quyền/.test(ui));
server.close();try{db.close();}catch(_){}console.log(`===== KẾT QUẢ PHÂN CẤP: ${pass} đạt / ${fail} trượt =====`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
