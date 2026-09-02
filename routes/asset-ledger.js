const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const US = require('../lib/upload-security');
const { uploadsRoot } = require('../lib/document-storage');
const { dangNhap,coMaQuyenNay,donViDuocPhep,duocThaoTacDonVi } = require('../middleware/quyen');

const r=express.Router(); r.use(dangNhap);
const transferDir=path.join(uploadsRoot,'asset-transfer');
if(!fs.existsSync(transferDir))fs.mkdirSync(transferDir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:(req,file,cb)=>cb(null,transferDir),
    filename:(req,file,cb)=>cb(null,`transfer_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname)}`)}),
    limits:{fileSize:20*1024*1024},fileFilter:US.fileFilter('documents','Định dạng chứng từ không hợp lệ')});
const TYPES=['RECEIPT','TRANSFER','RETURN','DISPOSAL','ADJUSTMENT'];
const id=()=>crypto.randomUUID();

function txCode(type){ return `ALT-${type}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function accessible(req,row){
    return (!row.don_vi_nguon_id && !row.don_vi_dich_id) ||
        (row.don_vi_nguon_id && duocThaoTacDonVi(req.session.nguoiDung,row.don_vi_nguon_id)) ||
        (row.don_vi_dich_id && duocThaoTacDonVi(req.session.nguoiDung,row.don_vi_dich_id));
}
function canCreate(req,type,row){
    const unit=type==='RECEIPT'?row.don_vi_dich_id:(row.don_vi_nguon_id||row.don_vi_dich_id);
    return !!unit&&duocThaoTacDonVi(req.session.nguoiDung,unit);
}
function firstLine(txId){return db.prepare('SELECT * FROM asset_transaction_lines WHERE transaction_id=? ORDER BY id LIMIT 1').get(txId);}
function workflow(txId){return db.prepare('SELECT * FROM asset_transfer_workflows WHERE transaction_id=?').get(txId);}
function transferAccess(req,res,next){const w=workflow(req.params.id),line=firstLine(req.params.id);
    if(!w||!line)return res.status(404).json({loi:'Không tìm thấy giao dịch điều chuyển'});
    if(!accessible(req,line))return res.status(403).json({loi:'Không có quyền'});next();}
function timeline(req,txId,action,oldStatus,newStatus,reason=null){db.prepare(`INSERT INTO asset_transfer_timeline
    (transaction_id,hanh_dong,trang_thai_cu,trang_thai_moi,nguoi_thuc_hien_id,ly_do,dia_chi_ip) VALUES (?,?,?,?,?,?,?)`)
    .run(txId,action,oldStatus,newStatus,req.session.nguoiDung.id,reason,req.ip);}
function rebuildProjection(){
    db.prepare('DELETE FROM asset_balance_projection').run();
    db.prepare(`INSERT INTO asset_balance_projection(asset_id,don_vi_id,vi_tri_key,so_luong,dvt,last_entry_id,updated_at)
        SELECT asset_id,don_vi_id,COALESCE(vi_tri_id,0),SUM(so_luong_thay_doi),dvt,MAX(id),datetime('now','localtime')
        FROM asset_ledger_entries GROUP BY asset_id,don_vi_id,COALESCE(vi_tri_id,0),dvt`).run();
}
function validateLine(type,line){
    const errors=[]; const qty=Number(line.so_luong);
    if (!(qty>0)) errors.push('Số lượng phải lớn hơn 0');
    if (!line.asset_id) errors.push('Thiếu tài sản');
    if (['DISPOSAL','TRANSFER','RETURN'].includes(type) && !line.don_vi_nguon_id) errors.push('Thiếu đơn vị nguồn');
    if (['RECEIPT','TRANSFER','RETURN'].includes(type) && !line.don_vi_dich_id) errors.push('Thiếu đơn vị đích');
    if (type==='ADJUSTMENT' && !line.don_vi_nguon_id && !line.don_vi_dich_id) errors.push('Thiếu đơn vị điều chỉnh');
    if (['TRANSFER','RETURN'].includes(type) && Number(line.don_vi_nguon_id)===Number(line.don_vi_dich_id)) errors.push('Đơn vị nguồn và đích phải khác nhau');
    return errors;
}

r.get('/',coMaQuyenNay('asset_ledger.view'),(req,res)=>{
    const scope=donViDuocPhep(req.session.nguoiDung); const where=[]; const p=[];
    if(req.query.trang_thai){where.push('t.trang_thai=?');p.push(req.query.trang_thai);}
    if(req.query.loai){where.push('t.loai=?');p.push(req.query.loai);}
    if(scope!==null){ if(!scope.length) where.push('1=0'); else { const ph=scope.map(()=>'?').join(',');
        where.push(`EXISTS (SELECT 1 FROM asset_transaction_lines l WHERE l.transaction_id=t.id AND (l.don_vi_nguon_id IN (${ph}) OR l.don_vi_dich_id IN (${ph})))`);p.push(...scope,...scope); } }
    const rows=db.prepare(`SELECT t.*,(SELECT COUNT(*) FROM asset_transaction_lines l WHERE l.transaction_id=t.id) so_dong
        FROM asset_transactions t ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.ngay_tao DESC LIMIT 200`).all(...p);
    res.json(rows);
});

r.get('/projection',coMaQuyenNay('asset_ledger.view'),(req,res)=>{
    const scope=donViDuocPhep(req.session.nguoiDung); const where=['p.so_luong<>0']; const p=[];
    if(scope!==null){if(!scope.length)where.push('1=0');else{where.push(`p.don_vi_id IN (${scope.map(()=>'?').join(',')})`);p.push(...scope);}}
    res.json(db.prepare(`SELECT p.*,NULLIF(p.vi_tri_key,0) vi_tri_id,a.ma_tai_san,a.ten,px.ma ma_don_vi
        FROM asset_balance_projection p JOIN assets a ON a.id=p.asset_id JOIN phan_xuong px ON px.id=p.don_vi_id
        WHERE ${where.join(' AND ')} ORDER BY a.ma_tai_san,px.ma`).all(...p));
});

r.get('/reconciliation',coMaQuyenNay('asset_ledger.reconcile'),(req,res)=>{
    const rows=db.prepare(`SELECT a.id asset_id,a.ma_tai_san,a.so_luong asset_quantity,a.don_vi_id asset_unit,
        COALESCE(SUM(p.so_luong),0) ledger_quantity,
        COUNT(DISTINCT CASE WHEN p.so_luong<>0 THEN p.don_vi_id END) ledger_units,
        a.legacy_thiet_bi_id,tb.so_luong legacy_quantity,tb.phan_xuong_id legacy_unit
        FROM assets a LEFT JOIN asset_balance_projection p ON p.asset_id=a.id
        LEFT JOIN thiet_bi tb ON tb.id=a.legacy_thiet_bi_id GROUP BY a.id
        HAVING ABS(a.so_luong-COALESCE(SUM(p.so_luong),0))>0.000001
          OR (tb.id IS NOT NULL AND (ABS(tb.so_luong-COALESCE(SUM(p.so_luong),0))>0.000001
              OR (COUNT(DISTINCT CASE WHEN p.so_luong<>0 THEN p.don_vi_id END)=1
                  AND MIN(CASE WHEN p.so_luong<>0 THEN p.don_vi_id END)<>tb.phan_xuong_id)))`).all();
    res.json({ tong_sai_lech:rows.length,sai_lech:rows });
});

r.post('/rebuild',coMaQuyenNay('asset_ledger.reconcile'),(req,res)=>{
    db.transaction(rebuildProjection)();
    res.json({ok:true,so_projection:db.prepare('SELECT COUNT(*) n FROM asset_balance_projection').get().n});
});

r.get('/:id',coMaQuyenNay('asset_ledger.view'),(req,res)=>{
    const tx=db.prepare('SELECT * FROM asset_transactions WHERE id=?').get(req.params.id);
    if(!tx)return res.status(404).json({loi:'Không tìm thấy giao dịch'});
    const lines=db.prepare('SELECT * FROM asset_transaction_lines WHERE transaction_id=?').all(tx.id);
    if(lines.length && !lines.some(x=>accessible(req,x))) return res.status(403).json({loi:'Không có quyền'});
    res.json({giao_dich:tx,chi_tiet:lines,ledger:db.prepare('SELECT * FROM asset_ledger_entries WHERE transaction_id=? ORDER BY id').all(tx.id),
        giao_nhan:workflow(tx.id)||null,timeline:db.prepare('SELECT * FROM asset_transfer_timeline WHERE transaction_id=? ORDER BY thoi_gian,id').all(tx.id),
        chung_tu:db.prepare('SELECT * FROM asset_transfer_documents WHERE transaction_id=? ORDER BY ngay_tai').all(tx.id)});
});

r.post('/',coMaQuyenNay('asset_ledger.create'),(req,res)=>{
    const b=req.body||{}; const key=String(req.get('Idempotency-Key')||b.idempotency_key||'').trim();
    if(!key)return res.status(400).json({loi:'Thiếu Idempotency-Key'});
    const existing=db.prepare('SELECT * FROM asset_transactions WHERE idempotency_key=?').get(key);
    if(existing)return res.status(200).json({id:existing.id,ma_giao_dich:existing.ma_giao_dich,trang_thai:existing.trang_thai,idempotent:true});
    if(!TYPES.includes(b.loai))return res.status(400).json({loi:'Loại giao dịch không hợp lệ'});
    if(!Array.isArray(b.chi_tiet)||!b.chi_tiet.length)return res.status(400).json({loi:'Giao dịch phải có chi tiết'});
    const errors=[];
    b.chi_tiet.forEach((line,i)=>validateLine(b.loai,line).forEach(e=>errors.push(`Dòng ${i+1}: ${e}`)));
    if(['TRANSFER','RETURN'].includes(b.loai)){
        const first=b.chi_tiet[0];
        b.chi_tiet.forEach((line,i)=>{if(Number(line.don_vi_nguon_id)!==Number(first.don_vi_nguon_id)||Number(line.don_vi_dich_id)!==Number(first.don_vi_dich_id))
            errors.push(`Dòng ${i+1}: mọi dòng điều chuyển phải cùng đơn vị nguồn và đích`);});
    }
    if(errors.length)return res.status(400).json({loi:errors.join('; ')});
    for(const line of b.chi_tiet){
        const asset=db.prepare('SELECT * FROM assets WHERE id=? AND hoat_dong=1').get(line.asset_id);
        if(!asset)return res.status(404).json({loi:`Không tìm thấy tài sản ${line.asset_id}`});
        if(!canCreate(req,b.loai,line))return res.status(403).json({loi:'Đơn vị ngoài phạm vi dữ liệu'});
        if(line.device_id && !db.prepare('SELECT 1 FROM asset_device_links WHERE asset_id=? AND device_id=? AND den_ngay IS NULL').get(asset.id,line.device_id))
            return res.status(400).json({loi:'Device không có liên kết hiệu lực với Asset'});
    }
    const txId=id(),code=txCode(b.loai);
    db.transaction(()=>{
        db.prepare(`INSERT INTO asset_transactions(id,ma_giao_dich,loai,idempotency_key,ngay_hieu_luc,ly_do,so_chung_tu,source_system,source_id,nguoi_tao_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)`).run(txId,code,b.loai,key,b.ngay_hieu_luc||new Date().toISOString().slice(0,10),b.ly_do||null,b.so_chung_tu||null,b.source_system||'qlcd',b.source_id||null,req.session.nguoiDung.id);
        const ins=db.prepare(`INSERT INTO asset_transaction_lines(id,transaction_id,asset_id,device_id,so_luong,dvt,don_vi_nguon_id,vi_tri_nguon_id,don_vi_dich_id,vi_tri_dich_id,ghi_chu)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        b.chi_tiet.forEach(x=>{const a=db.prepare('SELECT dvt FROM assets WHERE id=?').get(x.asset_id);ins.run(id(),txId,x.asset_id,x.device_id||null,Number(x.so_luong),x.dvt||a.dvt,x.don_vi_nguon_id||null,x.vi_tri_nguon_id||null,x.don_vi_dich_id||null,x.vi_tri_dich_id||null,x.ghi_chu||null);});
        if(['TRANSFER','RETURN'].includes(b.loai))db.prepare('INSERT INTO asset_transfer_workflows(transaction_id) VALUES (?)').run(txId);
    })();
    res.status(201).json({id:txId,ma_giao_dich:code,trang_thai:'DRAFT'});
});

function addEntry(tx,line,unit,location,delta,type,userId,reversalOf=null){
    db.prepare(`INSERT INTO asset_ledger_entries(id,transaction_id,line_id,asset_id,device_id,don_vi_id,vi_tri_id,so_luong_thay_doi,dvt,loai_entry,event_time,posted_by,reversal_of_entry_id,source_document)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id(),tx.id,reversalOf?null:(line?.id||null),line.asset_id,line.device_id||null,unit,location||null,delta,line.dvt,type,tx.ngay_hieu_luc,userId,reversalOf,tx.so_chung_tu||null);
}

function postRaw(req,txId,fromApproval=false){
    const tx=db.prepare('SELECT * FROM asset_transactions WHERE id=?').get(txId);
    if(!tx)throw Object.assign(new Error('Không tìm thấy giao dịch'),{status:404});
    if(tx.trang_thai==='POSTED')return tx;
    if(tx.trang_thai!=='DRAFT')throw Object.assign(new Error('Chỉ giao dịch DRAFT được post'),{status:409});
    if(['TRANSFER','RETURN'].includes(tx.loai) && (!fromApproval || workflow(tx.id)?.trang_thai!=='APPROVED'))
        throw Object.assign(new Error('Điều chuyển phải hoàn tất giao nhận và phê duyệt'),{status:409});
    const lines=db.prepare('SELECT * FROM asset_transaction_lines WHERE transaction_id=?').all(tx.id);
    for(const line of lines){
        if(!accessible(req,line))throw Object.assign(new Error('Đơn vị ngoài phạm vi dữ liệu'),{status:403});
        const qty=Number(line.so_luong);
        if(['DISPOSAL','TRANSFER','RETURN'].includes(tx.loai)){
            const bal=db.prepare(`SELECT COALESCE(SUM(so_luong),0) n FROM asset_balance_projection
                WHERE asset_id=? AND don_vi_id=?`).get(line.asset_id,line.don_vi_nguon_id).n;
            if(bal<qty)throw Object.assign(new Error('Số lượng nguồn không đủ'),{status:409});
        }
        if(tx.loai==='RECEIPT')addEntry(tx,line,line.don_vi_dich_id,line.vi_tri_dich_id,qty,'IN',req.session.nguoiDung.id);
        else if(tx.loai==='DISPOSAL')addEntry(tx,line,line.don_vi_nguon_id,line.vi_tri_nguon_id,-qty,'OUT',req.session.nguoiDung.id);
        else if(['TRANSFER','RETURN'].includes(tx.loai)){
            addEntry(tx,line,line.don_vi_nguon_id,line.vi_tri_nguon_id,-qty,'OUT',req.session.nguoiDung.id);
            addEntry(tx,line,line.don_vi_dich_id,line.vi_tri_dich_id,qty,'IN',req.session.nguoiDung.id);
        } else { const positive=!!line.don_vi_dich_id; addEntry(tx,line,positive?line.don_vi_dich_id:line.don_vi_nguon_id,positive?line.vi_tri_dich_id:line.vi_tri_nguon_id,positive?qty:-qty,'ADJUSTMENT',req.session.nguoiDung.id); }
    }
    db.prepare("UPDATE asset_transactions SET trang_thai='POSTED',nguoi_post_id=?,ngay_post=datetime('now','localtime') WHERE id=? AND trang_thai='DRAFT'").run(req.session.nguoiDung.id,tx.id);
    rebuildProjection(); return tx;
}

r.post('/:id/post',coMaQuyenNay('asset_ledger.post'),(req,res)=>{
    try{db.transaction(()=>postRaw(req,req.params.id,false))();res.json({ok:true,trang_thai:'POSTED'});}
    catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/submit',coMaQuyenNay('asset_transfer.submit'),(req,res)=>{
    try{db.transaction(()=>{const w=workflow(req.params.id),line=firstLine(req.params.id);
        if(!w||!line)throw Object.assign(new Error('Không tìm thấy giao dịch điều chuyển'),{status:404});
        if(w.trang_thai!=='DRAFT')throw Object.assign(new Error('Chỉ phiếu DRAFT được trình'),{status:409});
        if(!duocThaoTacDonVi(req.session.nguoiDung,line.don_vi_nguon_id))throw Object.assign(new Error('Chỉ đơn vị giao được trình phiếu'),{status:403});
        const changed=db.prepare("UPDATE asset_transfer_workflows SET trang_thai='SUBMITTED',version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=? AND trang_thai='DRAFT'").run(req.params.id);
        if(!changed.changes)throw Object.assign(new Error('Trạng thái đã thay đổi'),{status:409}); timeline(req,req.params.id,'SUBMIT','DRAFT','SUBMITTED');
    })();res.json({ok:true,trang_thai:'SUBMITTED'});}catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/sender-confirm',coMaQuyenNay('asset_transfer.sender_confirm'),(req,res)=>{
    try{db.transaction(()=>{const w=workflow(req.params.id),line=firstLine(req.params.id);
        if(!w||!line)throw Object.assign(new Error('Không tìm thấy giao dịch điều chuyển'),{status:404});
        if(w.trang_thai!=='SUBMITTED')throw Object.assign(new Error('Phiếu chưa ở bước bên giao xác nhận'),{status:409});
        if(!duocThaoTacDonVi(req.session.nguoiDung,line.don_vi_nguon_id))throw Object.assign(new Error('Không thuộc đơn vị giao'),{status:403});
        db.prepare("UPDATE asset_transfer_workflows SET trang_thai='SENDER_CONFIRMED',sender_user_id=?,sender_confirmed_at=datetime('now','localtime'),version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=? AND trang_thai='SUBMITTED'")
            .run(req.session.nguoiDung.id,req.params.id);timeline(req,req.params.id,'SENDER_CONFIRM','SUBMITTED','SENDER_CONFIRMED');
    })();res.json({ok:true,trang_thai:'SENDER_CONFIRMED'});}catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/documents',coMaQuyenNay('asset_transfer.document'),transferAccess,upload.single('file'),US.validateDisk('documents'),(req,res)=>{
    if(!req.file)return res.status(400).json({loi:'Thiếu file chứng từ'});
    const types=['bien_ban_giao_nhan','quyet_dinh_dieu_chuyen','anh_hien_trang','khac'];
    const type=types.includes(req.body?.loai_chung_tu)?req.body.loai_chung_tu:'khac'; const docId=id();
    db.prepare(`INSERT INTO asset_transfer_documents(id,transaction_id,loai_chung_tu,ten_file,duong_dan,mime_type,kich_thuoc,nguoi_tai_id,ghi_chu)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(docId,req.params.id,type,req.file.originalname,req.file.path,req.file.mimetype,req.file.size,req.session.nguoiDung.id,req.body?.ghi_chu||null);
    res.status(201).json({id:docId,ten_file:req.file.originalname});
});

r.get('/:id/documents/:docId/download',coMaQuyenNay('asset_ledger.view'),transferAccess,(req,res)=>{
    const doc=db.prepare('SELECT * FROM asset_transfer_documents WHERE id=? AND transaction_id=?').get(req.params.docId,req.params.id);
    if(!doc)return res.status(404).json({loi:'Không tìm thấy chứng từ'});
    const absolute=path.resolve(doc.duong_dan),root=path.resolve(transferDir)+path.sep;
    if(!absolute.startsWith(root)||!fs.existsSync(absolute))return res.status(404).json({loi:'File chứng từ không tồn tại'});
    res.download(absolute,doc.ten_file);
});

r.post('/:id/receiver-confirm',coMaQuyenNay('asset_transfer.receiver_confirm'),(req,res)=>{
    try{db.transaction(()=>{const w=workflow(req.params.id),line=firstLine(req.params.id);
        if(!w||!line)throw Object.assign(new Error('Không tìm thấy giao dịch điều chuyển'),{status:404});
        if(w.trang_thai!=='SENDER_CONFIRMED')throw Object.assign(new Error('Bên giao chưa xác nhận'),{status:409});
        if(!duocThaoTacDonVi(req.session.nguoiDung,line.don_vi_dich_id))throw Object.assign(new Error('Không thuộc đơn vị nhận'),{status:403});
        if(!db.prepare('SELECT 1 FROM asset_transfer_documents WHERE transaction_id=?').get(req.params.id))throw Object.assign(new Error('Phải có chứng từ giao nhận'),{status:409});
        db.prepare("UPDATE asset_transfer_workflows SET trang_thai='RECEIVER_CONFIRMED',receiver_user_id=?,receiver_confirmed_at=datetime('now','localtime'),version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=? AND trang_thai='SENDER_CONFIRMED'")
            .run(req.session.nguoiDung.id,req.params.id);timeline(req,req.params.id,'RECEIVER_CONFIRM','SENDER_CONFIRMED','RECEIVER_CONFIRMED');
    })();res.json({ok:true,trang_thai:'RECEIVER_CONFIRMED'});}catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/approve',coMaQuyenNay('asset_transfer.approve'),(req,res)=>{
    try{db.transaction(()=>{const w=workflow(req.params.id);
        if(!w)throw Object.assign(new Error('Không tìm thấy giao dịch điều chuyển'),{status:404});
        if(w.trang_thai!=='RECEIVER_CONFIRMED')throw Object.assign(new Error('Chưa đủ xác nhận giao nhận'),{status:409});
        db.prepare("UPDATE asset_transfer_workflows SET trang_thai='APPROVED',approver_user_id=?,approved_at=datetime('now','localtime'),version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=? AND trang_thai='RECEIVER_CONFIRMED'")
            .run(req.session.nguoiDung.id,req.params.id);timeline(req,req.params.id,'APPROVE','RECEIVER_CONFIRMED','APPROVED');
        postRaw(req,req.params.id,true);db.prepare("UPDATE asset_transfer_workflows SET trang_thai='POSTED',version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=? AND trang_thai='APPROVED'").run(req.params.id);
        timeline(req,req.params.id,'POST','APPROVED','POSTED');
    })();res.json({ok:true,trang_thai:'POSTED'});}catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/reject',coMaQuyenNay('asset_transfer.approve'),(req,res)=>{
    const reason=String(req.body?.ly_do||'').trim();if(!reason)return res.status(400).json({loi:'Phải nhập lý do từ chối'});
    try{db.transaction(()=>{const w=workflow(req.params.id);if(!w)throw Object.assign(new Error('Không tìm thấy giao dịch điều chuyển'),{status:404});
        if(!['SUBMITTED','SENDER_CONFIRMED','RECEIVER_CONFIRMED'].includes(w.trang_thai))throw Object.assign(new Error('Không thể từ chối ở trạng thái hiện tại'),{status:409});
        db.prepare("UPDATE asset_transfer_workflows SET trang_thai='REJECTED',rejection_reason=?,approver_user_id=?,version=version+1,updated_at=datetime('now','localtime') WHERE transaction_id=?")
            .run(reason,req.session.nguoiDung.id,req.params.id);timeline(req,req.params.id,'REJECT',w.trang_thai,'REJECTED',reason);
    })();res.json({ok:true,trang_thai:'REJECTED'});}catch(e){res.status(e.status||500).json({loi:e.message});}
});

r.post('/:id/reverse',coMaQuyenNay('asset_ledger.reverse'),(req,res)=>{
    const reason=String(req.body?.ly_do||'').trim(); if(!reason)return res.status(400).json({loi:'Phải nhập lý do reversal'});
    try{let reversalId;db.transaction(()=>{
        const original=db.prepare('SELECT * FROM asset_transactions WHERE id=?').get(req.params.id);
        if(!original)throw Object.assign(new Error('Không tìm thấy giao dịch'),{status:404});
        if(original.trang_thai!=='POSTED')throw Object.assign(new Error('Chỉ giao dịch POSTED được reversal'),{status:409});
        reversalId=id(); const rev={...original,id:reversalId,so_chung_tu:original.so_chung_tu,ngay_hieu_luc:new Date().toISOString().slice(0,10)};
        db.prepare(`INSERT INTO asset_transactions(id,ma_giao_dich,loai,trang_thai,idempotency_key,ngay_hieu_luc,ly_do,reversal_of_transaction_id,nguoi_tao_id,nguoi_post_id,ngay_post)
            VALUES (?,?, 'REVERSAL','POSTED',?,?,?,?,?,?,datetime('now','localtime'))`).run(reversalId,txCode('REVERSAL'),`reversal:${original.id}`,rev.ngay_hieu_luc,reason,original.id,req.session.nguoiDung.id,req.session.nguoiDung.id);
        const entries=db.prepare('SELECT * FROM asset_ledger_entries WHERE transaction_id=?').all(original.id);
        entries.forEach(e=>addEntry(rev,e,e.don_vi_id,e.vi_tri_id,-e.so_luong_thay_doi,'REVERSAL',req.session.nguoiDung.id,e.id));
        db.prepare("UPDATE asset_transactions SET trang_thai='REVERSED' WHERE id=?").run(original.id); rebuildProjection();
    })();res.status(201).json({id:reversalId,trang_thai:'POSTED'});}catch(e){res.status(e.status||(/UNIQUE/.test(e.message)?409:500)).json({loi:e.message});}
});

module.exports=r;
