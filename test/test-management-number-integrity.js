const fs=require('fs');const path=require('path');const os=require('os');
process.env.QLCD_DB=path.join(os.tmpdir(),`qlcd-management-number-${Date.now()}.db`);
const db=require('../db');const dbDir=path.join(__dirname,'..','db');
for(const file of fs.readdirSync(dbDir).filter(x=>/^\d+.*\.sql$/.test(x)).sort())db.exec(fs.readFileSync(path.join(dbDir,file),'utf8'));
const {chuanHoaSoQuanLy,timTrungSoQuanLy}=require('../lib/so-quan-ly');
let dat=0,truot=0;function kt(name,ok){ok?dat++:truot++;console.log(`  [${ok?'ĐẠT':'TRƯỢT'}] ${name}`);}
const px1=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('SQ1','Đào lò 1','san_xuat')").run().lastInsertRowid;
const px2=db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('SQ2','Đào lò 14','san_xuat')").run().lastInsertRowid;
const group=db.prepare("INSERT INTO nhom_thiet_bi(ma,ten,cap) VALUES('SQ','Thiết bị SQL',2)").run().lastInsertRowid;
function device(code,unit){return db.prepare("INSERT INTO thiet_bi(ma_tb,ten,nhom_id,phan_xuong_id) VALUES (?,'Thiết bị',?,?)").run(code,group,unit).lastInsertRowid;}
const a=device('XLM-1',px1),b=device('XLM-2',px2),c=device('XLM-3',px2);
db.prepare('INSERT INTO thiet_bi_kiem_ke(thiet_bi_id,so_quan_ly) VALUES (?,?)').run(a,'XLM-T1191');
kt('Chuẩn hóa khoảng trắng, chữ hoa và dấu gạch',chuanHoaSoQuanLy('  xlm–t1191 ')==='XLM-T1191');
kt('Phát hiện số quản lý đã thuộc đơn vị khác',timTrungSoQuanLy('xlm—t1191',b)?.id===a);
let duplicateBlocked=false;try{db.prepare('INSERT INTO thiet_bi_kiem_ke(thiet_bi_id,so_quan_ly) VALUES (?,?)').run(b,'xlm–t1191');}catch(e){duplicateBlocked=/SO_QUAN_LY_DUPLICATE/.test(e.message);}
kt('Database chặn số quản lý trùng sau chuẩn hóa',duplicateBlocked);
db.prepare('INSERT INTO thiet_bi_kiem_ke(thiet_bi_id,so_quan_ly) VALUES (?,NULL)').run(c);
kt('Thiết bị chưa có số quản lý được lưu NULL',db.prepare('SELECT so_quan_ly FROM thiet_bi_kiem_ke WHERE thiet_bi_id=?').get(c).so_quan_ly===null);
console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt =====`);db.close();try{fs.unlinkSync(process.env.QLCD_DB);}catch(_){}process.exit(truot?1:0);
