const express = require('express');
const db = require('../db');
const sheets = require('../lib/google-sheets');
const { dangNhap, coMaQuyen, coMaQuyenNay, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen');
const { interactionAudit } = require('../lib/interaction-audit');
const r = express.Router();
r.use(dangNhap);

const HEADERS = ['ma_tai_san','loai_tai_san','ten','nhom_tai_san','dvt','so_luong','nguyen_gia',
    'gia_tri_con_lai','ngay_dua_vao_su_dung','ma_don_vi','trang_thai','ghi_chu','version'];
const MUTABLE = ['loai_tai_san','ten','nhom_tai_san','dvt','so_luong','nguyen_gia','gia_tri_con_lai',
    'ngay_dua_vao_su_dung','trang_thai','ghi_chu'];

function normalize(row, headers) {
    const get = key => row[headers.indexOf(key)];
    return { ma_tai_san: String(get('ma_tai_san') || '').trim(), loai_tai_san: String(get('loai_tai_san') || '').trim().toUpperCase(),
        ten: String(get('ten') || '').trim(), nhom_tai_san: get('nhom_tai_san') || null, dvt: get('dvt') || 'Cái',
        so_luong: Number(get('so_luong') ?? 1), nguyen_gia: Number(get('nguyen_gia') ?? 0),
        gia_tri_con_lai: Number(get('gia_tri_con_lai') ?? 0), ngay_dua_vao_su_dung: get('ngay_dua_vao_su_dung') || null,
        ma_don_vi: String(get('ma_don_vi') || '').trim(), trang_thai: get('trang_thai') || 'dang_su_dung',
        ghi_chu: get('ghi_chu') || null, version: Number(get('version') || 0) };
}

function validate(x, unit) {
    const e=[]; if(!x.ma_tai_san)e.push('Thiếu mã tài sản'); if(!x.ten)e.push('Thiếu tên');
    if(!['TSCD','CCDC'].includes(x.loai_tai_san))e.push('Loại phải là TSCD hoặc CCDC'); if(!unit)e.push('Mã đơn vị không tồn tại');
    if([x.so_luong,x.nguyen_gia,x.gia_tri_con_lai].some(v=>!Number.isFinite(v)||v<0))e.push('Số lượng/giá trị không hợp lệ');
    if(x.nguyen_gia && x.gia_tri_con_lai>x.nguyen_gia)e.push('Giá trị còn lại lớn hơn nguyên giá'); return e;
}

r.get('/status', coMaQuyenNay('asset.sheet.export','asset.sheet.import','asset.sheet.approve'), (req,res)=>{
    const c=sheets.config(); res.json({ configured:!!(c.email&&c.privateKey), service_account_email:c.email||null,
        default_spreadsheet_id:c.spreadsheetId||null });
});

r.post('/export', coMaQuyenNay('asset.sheet.export'), async(req,res,next)=>{try{
    const scope=donViDuocPhep(req.session.nguoiDung), where=['a.hoat_dong=1'], params=[];
    if(scope!==null){if(!scope.length)where.push('1=0');else{where.push(`a.don_vi_id IN (${scope.map(()=>'?').join(',')})`);params.push(...scope);}}
    const rows=db.prepare(`SELECT a.*,p.ma ma_don_vi FROM assets a JOIN phan_xuong p ON p.id=a.don_vi_id WHERE ${where.join(' AND ')} ORDER BY a.ma_tai_san`).all(...params);
    let id=req.body?.spreadsheet_id?sheets.spreadsheetId(req.body.spreadsheet_id):sheets.config().spreadsheetId;
    let created=null; const sheetName=String(req.body?.sheet_name||'Asset Master').slice(0,80);
    if(!id){created=await sheets.createSpreadsheet(`QLCD Asset Master ${new Date().toISOString().slice(0,10)}`,sheetName);id=created.spreadsheetId;}
    await sheets.writeValues(id,sheetName,[HEADERS,...rows.map(x=>HEADERS.map(h=>x[h]??''))]);
    const url=`https://docs.google.com/spreadsheets/d/${id}/edit`;
    const info=db.prepare(`INSERT INTO sheet_sync_batches(direction,spreadsheet_id,spreadsheet_url,sheet_name,status,row_count,summary_json,created_by) VALUES('EXPORT',?,?,?,'EXPORTED',?,?,?)`).run(id,url,sheetName,rows.length,JSON.stringify({created:!!created}),req.session.nguoiDung.id);
    interactionAudit(req,'ASSET_SHEET_EXPORT','sheet_sync_batches',info.lastInsertRowid,{spreadsheet_id:id,row_count:rows.length});
    res.json({ok:true,batch_id:info.lastInsertRowid,spreadsheet_id:id,spreadsheet_url:url,row_count:rows.length});
}catch(e){next(e);}});

r.post('/imports', coMaQuyenNay('asset.sheet.import'), async(req,res,next)=>{try{
    const id=sheets.spreadsheetId(req.body?.spreadsheet_id||req.body?.spreadsheet_url), sheetName=String(req.body?.sheet_name||'Asset Master').slice(0,80);
    const values=await sheets.readValues(id,sheetName); if(!values.length)return res.status(400).json({loi:'Sheet không có dữ liệu'});
    const headers=values[0].map(x=>String(x).trim()); for(const h of ['ma_tai_san','loai_tai_san','ten','ma_don_vi'])if(!headers.includes(h))return res.status(400).json({loi:`Thiếu cột ${h}`});
    const batch=db.prepare(`INSERT INTO sheet_sync_batches(direction,spreadsheet_id,spreadsheet_url,sheet_name,status,created_by) VALUES('IMPORT',?,?,?,'PENDING_REVIEW',?)`).run(id,`https://docs.google.com/spreadsheets/d/${id}/edit`,sheetName,req.session.nguoiDung.id);
    const ins=db.prepare(`INSERT INTO sheet_sync_rows(batch_id,sheet_row,asset_id,asset_version,asset_code,action,source_json,before_json,changes_json,validation_errors) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    const counts={CREATE:0,UPDATE:0,UNCHANGED:0,ERROR:0};
    db.transaction(()=>values.slice(1).forEach((row,i)=>{if(!row.some(v=>String(v||'').trim()))return;const x=normalize(row,headers),unit=db.prepare('SELECT id FROM phan_xuong WHERE ma=? AND hoat_dong=1').get(x.ma_don_vi),old=db.prepare('SELECT * FROM assets WHERE ma_tai_san=? AND hoat_dong=1').get(x.ma_tai_san);const errors=validate(x,unit);if(unit&&!duocThaoTacDonVi(req.session.nguoiDung,unit.id))errors.push('Đơn vị ngoài phạm vi dữ liệu');if(old&&!duocThaoTacDonVi(req.session.nguoiDung,old.don_vi_id))errors.push('Tài sản ngoài phạm vi dữ liệu');const changes={};if(old)MUTABLE.forEach(k=>{if(String(old[k]??'')!==String(x[k]??''))changes[k]={from:old[k],to:x[k]};});let action=errors.length?'ERROR':!old?'CREATE':Object.keys(changes).length?'UPDATE':'UNCHANGED';counts[action]++;ins.run(batch.lastInsertRowid,i+2,old?.id||null,old?.version||null,x.ma_tai_san,action,JSON.stringify({...x,don_vi_id:unit?.id}),old?JSON.stringify(old):null,JSON.stringify(changes),errors.length?JSON.stringify(errors):null);} ))();
    const total=Object.values(counts).reduce((a,b)=>a+b,0);db.prepare('UPDATE sheet_sync_batches SET row_count=?,summary_json=? WHERE id=?').run(total,JSON.stringify(counts),batch.lastInsertRowid);
    interactionAudit(req,'ASSET_SHEET_IMPORT_STAGED','sheet_sync_batches',batch.lastInsertRowid,{spreadsheet_id:id,counts});res.status(201).json({ok:true,batch_id:batch.lastInsertRowid,summary:counts});
}catch(e){next(e);}});

r.get('/batches', coMaQuyenNay('asset.sheet.export','asset.sheet.import','asset.sheet.approve'), (req,res)=>{const approve=coMaQuyen(req,'asset.sheet.approve');res.json(db.prepare(`SELECT b.*,u.ho_ten created_by_name,rv.ho_ten reviewed_by_name FROM sheet_sync_batches b JOIN nguoi_dung u ON u.id=b.created_by LEFT JOIN nguoi_dung rv ON rv.id=b.reviewed_by ${approve?'':'WHERE b.created_by=?'} ORDER BY b.id DESC LIMIT 100`).all(...(approve?[]:[req.session.nguoiDung.id])).map(x=>({...x,summary:JSON.parse(x.summary_json||'{}')})));});
r.get('/batches/:id', coMaQuyenNay('asset.sheet.export','asset.sheet.import','asset.sheet.approve'), (req,res)=>{const batch=db.prepare('SELECT * FROM sheet_sync_batches WHERE id=?').get(req.params.id);if(!batch)return res.status(404).json({loi:'Không tìm thấy lô đồng bộ'});if(batch.created_by!==req.session.nguoiDung.id&&!coMaQuyen(req,'asset.sheet.approve'))return res.status(403).json({loi:'Không có quyền xem lô này'});const rows=db.prepare('SELECT * FROM sheet_sync_rows WHERE batch_id=? ORDER BY sheet_row').all(batch.id).map(x=>({...x,source:JSON.parse(x.source_json),changes:JSON.parse(x.changes_json||'{}'),errors:JSON.parse(x.validation_errors||'[]')}));res.json({batch:{...batch,summary:JSON.parse(batch.summary_json||'{}')},rows});});

r.post('/batches/:id/reject', coMaQuyenNay('asset.sheet.approve'), (req,res)=>{const b=db.prepare("SELECT * FROM sheet_sync_batches WHERE id=? AND status='PENDING_REVIEW'").get(req.params.id);if(!b)return res.status(409).json({loi:'Lô không còn chờ duyệt'});db.prepare("UPDATE sheet_sync_batches SET status='REJECTED',reviewed_by=?,review_note=?,reviewed_at=datetime('now','localtime') WHERE id=?").run(req.session.nguoiDung.id,String(req.body?.note||''),b.id);interactionAudit(req,'ASSET_SHEET_REJECT','sheet_sync_batches',b.id);res.json({ok:true});});
r.post('/batches/:id/approve', coMaQuyenNay('asset.sheet.approve'), (req,res)=>{const b=db.prepare("SELECT * FROM sheet_sync_batches WHERE id=? AND status='PENDING_REVIEW'").get(req.params.id);if(!b)return res.status(409).json({loi:'Lô không còn chờ duyệt'});const bad=db.prepare("SELECT COUNT(*) n FROM sheet_sync_rows WHERE batch_id=? AND action='ERROR'").get(b.id).n;if(bad)return res.status(422).json({loi:`Còn ${bad} dòng lỗi; hãy sửa Sheet và tạo lô nhập mới`});const rows=db.prepare("SELECT * FROM sheet_sync_rows WHERE batch_id=? AND action IN ('CREATE','UPDATE')").all(b.id);try{db.transaction(()=>{for(const row of rows){const x=JSON.parse(row.source_json);if(!duocThaoTacDonVi(req.session.nguoiDung,x.don_vi_id))throw new Error('Phạm vi dữ liệu đã thay đổi');if(row.action==='CREATE')db.prepare(`INSERT INTO assets(ma_tai_san,loai_tai_san,ten,nhom_tai_san,dvt,so_luong,nguyen_gia,gia_tri_con_lai,ngay_dua_vao_su_dung,don_vi_id,trang_thai,ghi_chu,nguoi_tao_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(x.ma_tai_san,x.loai_tai_san,x.ten,x.nhom_tai_san,x.dvt,x.so_luong,x.nguyen_gia,x.gia_tri_con_lai,x.ngay_dua_vao_su_dung,x.don_vi_id,x.trang_thai,x.ghi_chu,req.session.nguoiDung.id);else{const result=db.prepare(`UPDATE assets SET loai_tai_san=?,ten=?,nhom_tai_san=?,dvt=?,so_luong=?,nguyen_gia=?,gia_tri_con_lai=?,ngay_dua_vao_su_dung=?,trang_thai=?,ghi_chu=?,nguoi_sua_id=?,version=version+1,ngay_sua=datetime('now','localtime') WHERE id=? AND version=?`).run(x.loai_tai_san,x.ten,x.nhom_tai_san,x.dvt,x.so_luong,x.nguyen_gia,x.gia_tri_con_lai,x.ngay_dua_vao_su_dung,x.trang_thai,x.ghi_chu,req.session.nguoiDung.id,row.asset_id,row.asset_version);if(!result.changes)throw new Error(`Tài sản ${row.asset_code} đã thay đổi sau khi đối chiếu`);}db.prepare("UPDATE sheet_sync_rows SET applied_at=datetime('now','localtime') WHERE id=?").run(row.id);}db.prepare("UPDATE sheet_sync_batches SET status='APPROVED',reviewed_by=?,review_note=?,reviewed_at=datetime('now','localtime') WHERE id=?").run(req.session.nguoiDung.id,String(req.body?.note||''),b.id);})();interactionAudit(req,'ASSET_SHEET_APPROVE','sheet_sync_batches',b.id,{applied:rows.length});res.json({ok:true,applied:rows.length});}catch(e){return res.status(409).json({loi:e.message});}});
module.exports=r;
