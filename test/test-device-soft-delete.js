/** Xóa mềm trực tiếp bảng thiet_bi: permission, scope, blocker, audit, restore và UI. */
const fs=require('fs'),path=require('path'),os=require('os'),bcrypt=require('bcryptjs');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-device-delete-${Date.now()}.db`);
const {khoiTaoDatabase}=require('../db/init'),db=khoiTaoDatabase();
const px1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('TBD1','PX Thiết bị 1','san_xuat')").run().lastInsertRowid;
const px2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('TBD2','PX Thiết bị 2','san_xuat')").run().lastInsertRowid;
const nhom=db.prepare("SELECT id FROM nhom_thiet_bi WHERE cap=2 LIMIT 1").get().id;
const admin=db.prepare("SELECT id FROM nguoi_dung WHERE vai_tro='admin'").get().id,hash=bcrypt.hashSync('admin123',8);
const pxUser=db.prepare("INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id) VALUES('device_delete_px',?,'PX Device','px',?)").run(hash,px1).lastInsertRowid;
const ins=db.prepare("INSERT INTO thiet_bi(ma_tb,ten,nhom_id,phan_xuong_id,so_luong,nguoi_tao_id) VALUES(?,?,?,?,?,?)");
const d1=ins.run('TBD-A1','Thiết bị một',nhom,px1,1,admin).lastInsertRowid;
const d2=ins.run('TBD-A2','Thiết bị không',nhom,px1,0,admin).lastInsertRowid;
const outside=ins.run('TBD-B1','Thiết bị ngoài scope',nhom,px2,2,admin).lastInsertRowid;
const blocked=ins.run('TBD-A3','Thiết bị đang sửa',nhom,px1,3,admin).lastInsertRowid;
db.prepare("INSERT INTO phieu_sua_chua(so_phieu,thiet_bi_id,phan_xuong_id,trang_thai) VALUES('SC-TBD',?,?,'dang_thuc_hien')").run(blocked,px1);
const app=require('../server');let pass=0,fail=0;const check=(n,ok)=>ok?(pass++,console.log(`  [ĐẠT]   ${n}`)):(fail++,console.log(`  [TRƯỢT] ${n}`));
(async()=>{console.log('\n===== TEST DEVICE SOFT DELETE =====');const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;let cookie='';
async function api(url,o={}){const headers={...(o.headers||{})};if(cookie)headers.cookie=cookie;if(o.body!==undefined){headers['content-type']='application/json';o.body=JSON.stringify(o.body);}const response=await fetch(base+url,{...o,headers});const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body;try{body=await response.json();}catch(_){body=null;}return{response,body};}
async function login(user){cookie='';await api('/api/auth/dang-nhap',{method:'POST',body:{ten_dang_nhap:user,mat_khau:'admin123'}});}
await login('device_delete_px');let rs=await api(`/api/thiet-bi/${d1}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('PX mặc định không có quyền xóa',rs.response.status===403);
db.prepare("INSERT INTO quyen_nguoi_dung_dong(nguoi_dung_id,ma_quyen,duoc_phep) VALUES(?,'thietbi.xoa',1)").run(pxUser);
await login('device_delete_px');rs=await api(`/api/thiet-bi/${outside}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('Chặn xóa ngoài Data Scope',rs.response.status===403);
rs=await api(`/api/thiet-bi/${blocked}`,{method:'DELETE',body:{reason:'Nhập sai'}});check('Chặn thiết bị có nghiệp vụ đang mở',rs.response.status===409&&rs.body.chi_tiet.length);
await login('admin');rs=await api('/api/thiet-bi/bulk-delete',{method:'POST',body:{ids:[d1,d2],reason:'Dữ liệu nhập nhầm',confirmation:'XOA 2'}});check('Xóa mềm nhiều thiết bị',rs.response.status===200&&rs.body.da_xoa===2);
rs=await api('/api/thiet-bi?q=TBD-A');check('Ẩn khỏi bảng thiết bị',!rs.body.danh_sach.some(x=>[d1,d2].includes(x.id)));
rs=await api(`/api/thiet-bi/${d1}`);check('Ẩn khỏi hồ sơ thông thường',rs.response.status===404);
rs=await api('/api/tong-hop/dashboard');check('Không tính vào Dashboard',Number(rs.body.tong.tong)===2);
const audit=db.prepare("SELECT noi_dung FROM nhat_ky_he_thong WHERE hanh_dong='DEVICE_SOFT_DELETE' ORDER BY id DESC LIMIT 1").get();const detail=audit&&JSON.parse(audit.noi_dung);check('Audit lưu lý do, ID và mã',detail?.reason==='Dữ liệu nhập nhầm'&&detail.device_ids.length===2&&detail.device_codes.includes('TBD-A1'));
rs=await api('/api/thiet-bi/deleted');check('Quản trị xem danh sách đã xóa',rs.body.some(x=>x.id===d1));
rs=await api(`/api/thiet-bi/${d1}/restore`,{method:'POST',body:{reason:'Khôi phục kiểm tra'}});check('Khôi phục thành công',rs.response.status===200&&!db.prepare('SELECT 1 FROM thiet_bi_deletions WHERE thiet_bi_id=?').get(d1));
const ui=fs.readFileSync(path.join(__dirname,'..','public','js','man-hinh.js'),'utf8');check('UI #thiet-bi có chọn/xóa/khôi phục theo quyền',/thietBiDaChon/.test(ui)&&/coQuyenUI\('thietbi\.xoa'\)/.test(ui)&&/moThungRacThietBi/.test(ui));
server.close();console.log(`===== KẾT QUẢ: ${pass} đạt / ${fail} trượt / ${pass+fail} test =====`);try{db.close();}catch(_){}process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
