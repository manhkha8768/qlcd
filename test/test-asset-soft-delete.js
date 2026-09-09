/** Permission, Data Scope, blocker, audit and restore tests for Asset soft delete. */
const fs=require('fs'),path=require('path'),os=require('os'),bcrypt=require('bcryptjs');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-asset-delete-${Date.now()}.db`);
const {khoiTaoDatabase}=require('../db/init'),db=khoiTaoDatabase();
const u1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('DEL1','PX Xóa 1','san_xuat')").run().lastInsertRowid;
const u2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('DEL2','PX Xóa 2','san_xuat')").run().lastInsertRowid;
const hash=bcrypt.hashSync('admin123',8),admin=db.prepare("SELECT id FROM nguoi_dung WHERE vai_tro='admin'").get().id;
db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES('delete_px',?,'PX Delete','px',?)").run(hash,u1);
const ins=db.prepare("INSERT INTO assets(ma_tai_san,loai_tai_san,ten,don_vi_id,so_luong,nguoi_tao_id) VALUES(?,'CCDC',?,?,?,?)");
const a1=ins.run('DEL-A1','Thiết bị số một',u1,1,admin).lastInsertRowid;
const a2=ins.run('DEL-A2','Thiết bị số không',u1,0,admin).lastInsertRowid;
const outside=ins.run('DEL-B1','Thiết bị ngoài scope',u2,2,admin).lastInsertRowid;
const blocked=ins.run('DEL-A3','Thiết bị đang kiểm kê',u1,3,admin).lastInsertRowid;
db.prepare("INSERT INTO inventory_sessions(id,ma_dot,ten,don_vi_id,trang_thai) VALUES('del-inv','DEL-INV','Đợt đang mở',?,'OPEN')").run(u1);
db.prepare("INSERT INTO inventory_snapshot_lines(id,session_id,asset_id,don_vi_id,so_luong_so,dvt) VALUES('del-line','del-inv',?,?,3,'Cái')").run(blocked,u1);
const app=require('../server');let pass=0,fail=0;const check=(n,ok)=>ok?(pass++,console.log(`  [ĐẠT]   ${n}`)):(fail++,console.log(`  [TRƯỢT] ${n}`));
(async()=>{console.log('\n===== TEST ASSET SOFT DELETE =====');const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
async function api(url,o={}){const headers={...(o.headers||{})};if(cookie)headers.cookie=cookie;if(o.body!==undefined){headers['content-type']='application/json';o.body=JSON.stringify(o.body);}const response=await fetch(base+url,{...o,headers});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body;try{body=await response.json();}catch(_){body=null;}return{response,body};}
async function login(user){cookie='';await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:user,mat_khau:'admin123'}});}
await login('delete_px');let rs=await api(`/api/tai-san/${a1}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('PX mặc định không có quyền xóa',rs.response.status===403);
const pxId=db.prepare("SELECT id FROM nguoi_dung WHERE ten_dang_nhap='delete_px'").get().id;db.prepare("INSERT INTO quyen_nguoi_dung_dong(nguoi_dung_id,ma_quyen,duoc_phep) VALUES(?,'asset.delete',1)").run(pxId);
await login('delete_px');rs=await api(`/api/tai-san/${outside}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('Chặn xóa ngoài Data Scope',rs.response.status===403);
rs=await api(`/api/tai-san/${blocked}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('Chặn khi nghiệp vụ chưa hoàn tất',rs.response.status===409&&rs.body.chi_tiet.length);
await login('admin');rs=await api('/api/tai-san/bulk-delete',{method:'POST',body:{ids:[a1,a2],reason:'Dữ liệu nhập nhầm',confirmation:'XOA 2'}});check('Xóa mềm nhiều thiết bị',rs.response.status===200&&rs.body.da_xoa===2);
rs=await api('/api/tai-san?q=Thiết bị');check('Ẩn khỏi danh sách',!rs.body.danh_sach.some(x=>[a1,a2].includes(x.id)));
rs=await api('/api/search?q=DEL-A1');check('Ẩn khỏi Global Search',rs.body.total===0);
rs=await api('/api/tai-san/by-code/DEL-A1');check('QR không resolve thiết bị đã xóa',rs.response.status===404);
const audit=db.prepare("SELECT noi_dung FROM nhat_ky_he_thong WHERE hanh_dong='ASSET_SOFT_DELETE' ORDER BY id DESC LIMIT 1").get();const detail=audit&&JSON.parse(audit.noi_dung);check('Audit lưu lý do và danh sách ID',detail?.reason==='Dữ liệu nhập nhầm'&&detail.asset_ids.length===2);
rs=await api('/api/tai-san/deleted');check('Admin xem thùng rác',rs.body.some(x=>x.id===a1));
rs=await api(`/api/tai-san/${a1}/restore`,{method:'POST',body:{}});check('Khôi phục thành công',rs.response.status===200&&db.prepare('SELECT hoat_dong FROM assets WHERE id=?').get(a1).hoat_dong===1&&!db.prepare('SELECT 1 FROM asset_deletions WHERE asset_id=?').get(a1));
const ui=fs.readFileSync(path.join(__dirname,'..','public','js','tai-san.js'),'utf8');check('Desktop/mobile cùng permission và state',/taiSanDaChon/.test(ui)&&/coQuyenUI\('asset\.delete'\)/.test(ui)&&/asset-card-list/.test(ui));
const qty=['tai-san.js','man-hinh.js','nhap-lieu.js','ky-thuat.js'].map(x=>fs.readFileSync(path.join(__dirname,'..','public','js',x),'utf8')).join('\n');check('Không còn ẩn số lượng bằng 1',!/so_luong\s*>\s*1\s*\?/.test(qty));
server.close();console.log(`===== KẾT QUẢ: ${pass} đạt / ${fail} trượt / ${pass+fail} test =====`);try{db.close();}catch(_){}process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
