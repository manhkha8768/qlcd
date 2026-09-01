const express=require('express');const crypto=require('crypto');const db=require('../db');
const {dangNhap,coMaQuyenNay,duocThaoTacDonVi,donViDuocPhep}=require('../middleware/quyen');
const r=express.Router();r.use(dangNhap);const uuid=()=>crypto.randomUUID();
function session(id){return db.prepare('SELECT * FROM inventory_sessions WHERE id=?').get(id);}
function allowed(req,s){return s&&duocThaoTacDonVi(req.session.nguoiDung,s.don_vi_id);}
function audit(req,sid,action,detail=null){db.prepare('INSERT INTO inventory_timeline(session_id,hanh_dong,nguoi_id,chi_tiet) VALUES (?,?,?,?)').run(sid,action,req.session.nguoiDung.id,detail?JSON.stringify(detail):null);}
function rebuild(){db.prepare('DELETE FROM asset_balance_projection').run();db.prepare(`INSERT INTO asset_balance_projection(asset_id,don_vi_id,vi_tri_key,so_luong,dvt,last_entry_id,updated_at)
 SELECT asset_id,don_vi_id,COALESCE(vi_tri_id,0),SUM(so_luong_thay_doi),dvt,MAX(id),datetime('now','localtime') FROM asset_ledger_entries
 GROUP BY asset_id,don_vi_id,COALESCE(vi_tri_id,0),dvt`).run();}

r.get('/',coMaQuyenNay('inventory.view'),(req,res)=>{const scope=donViDuocPhep(req.session.nguoiDung),where=[],p=[];
 if(scope!==null){if(!scope.length)where.push('1=0');else{where.push(`s.don_vi_id IN (${scope.map(()=>'?').join(',')})`);p.push(...scope);}}
 res.json(db.prepare(`SELECT s.*,px.ma ma_don_vi,(SELECT COUNT(*) FROM inventory_snapshot_lines x WHERE x.session_id=s.id) so_snapshot,
  (SELECT COUNT(*) FROM inventory_observations o WHERE o.session_id=s.id) so_da_kiem
  FROM inventory_sessions s JOIN phan_xuong px ON px.id=s.don_vi_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.ngay_tao DESC`).all(...p));});

r.post('/',coMaQuyenNay('inventory.create'),(req,res)=>{const b=req.body||{};if(!b.ma_dot?.trim()||!b.ten?.trim()||!b.don_vi_id)return res.status(400).json({loi:'Thiếu mã, tên hoặc đơn vị kiểm kê'});
 if(!duocThaoTacDonVi(req.session.nguoiDung,b.don_vi_id))return res.status(403).json({loi:'Đơn vị ngoài phạm vi'});
 try{let sid=uuid();db.transaction(()=>{db.prepare(`INSERT INTO inventory_sessions(id,ma_dot,ten,don_vi_id,nguoi_tao_id,ghi_chu) VALUES (?,?,?,?,?,?)`)
  .run(sid,b.ma_dot.trim(),b.ten.trim(),b.don_vi_id,req.session.nguoiDung.id,b.ghi_chu||null);
  db.prepare(`INSERT INTO inventory_snapshot_lines(id,session_id,asset_id,don_vi_id,vi_tri_id,so_luong_so,dvt,last_entry_id)
   SELECT lower(hex(randomblob(16))),?,p.asset_id,p.don_vi_id,
    CASE WHEN COUNT(DISTINCT p.vi_tri_key)=1 THEN NULLIF(MAX(p.vi_tri_key),0) ELSE NULL END,
    SUM(p.so_luong),p.dvt,MAX(p.last_entry_id) FROM asset_balance_projection p
   WHERE p.don_vi_id=? AND p.so_luong<>0 GROUP BY p.asset_id,p.don_vi_id,p.dvt`).run(sid,b.don_vi_id);
  db.prepare("INSERT OR IGNORE INTO asset_qr_codes(asset_id,qr_value) SELECT id,'QLCD:ASSET:'||ma_tai_san FROM assets").run();audit(req,sid,'OPEN_SNAPSHOT',{don_vi_id:b.don_vi_id});})();
  res.status(201).json({id:sid,trang_thai:'OPEN'});}catch(e){res.status(/UNIQUE/.test(e.message)?409:500).json({loi:/UNIQUE/.test(e.message)?'Mã đợt đã tồn tại':e.message});}});

r.get('/qr/:value',(req,res)=>{const value=decodeURIComponent(req.params.value);const asset=db.prepare(`SELECT a.id,a.ma_tai_san,a.ten,a.dvt,q.qr_value
 FROM asset_qr_codes q JOIN assets a ON a.id=q.asset_id WHERE q.qr_value=? AND a.hoat_dong=1`).get(value);
 if(!asset)return res.status(404).json({loi:'QR không thuộc Asset Master'});res.json(asset);});

r.get('/:id',coMaQuyenNay('inventory.view'),(req,res)=>{const s=session(req.params.id);if(!s)return res.status(404).json({loi:'Không tìm thấy kỳ kiểm kê'});if(!allowed(req,s))return res.status(403).json({loi:'Không có quyền'});
 res.json({ky:s,snapshot:db.prepare(`SELECT x.*,a.ma_tai_san,a.ten,q.qr_value FROM inventory_snapshot_lines x JOIN assets a ON a.id=x.asset_id LEFT JOIN asset_qr_codes q ON q.asset_id=a.id WHERE x.session_id=? ORDER BY a.ma_tai_san`).all(s.id),
  observations:db.prepare('SELECT * FROM inventory_observations WHERE session_id=? ORDER BY updated_at').all(s.id),
  discrepancies:db.prepare('SELECT * FROM inventory_discrepancies WHERE session_id=? ORDER BY asset_id').all(s.id),
  timeline:db.prepare('SELECT * FROM inventory_timeline WHERE session_id=? ORDER BY thoi_gian,id').all(s.id)});});

r.post('/:id/sync',coMaQuyenNay('inventory.scan'),(req,res)=>{const s=session(req.params.id),b=req.body||{};if(!s)return res.status(404).json({loi:'Không tìm thấy kỳ kiểm kê'});if(!allowed(req,s))return res.status(403).json({loi:'Không có quyền'});if(s.trang_thai!=='OPEN')return res.status(409).json({loi:'Kỳ kiểm kê đã khóa'});
 if(!b.client_batch_id||!Array.isArray(b.observations))return res.status(400).json({loi:'Thiếu client_batch_id hoặc observations'});const hash=crypto.createHash('sha256').update(JSON.stringify(b.observations)).digest('hex');
 const old=db.prepare('SELECT * FROM inventory_sync_batches WHERE session_id=? AND client_batch_id=?').get(s.id,b.client_batch_id);if(old){if(old.payload_hash!==hash)return res.status(409).json({loi:'Batch ID đã dùng với payload khác'});return res.json({accepted:old.accepted_count,idempotent:true});}
 try{let accepted=0;db.transaction(()=>{const upsert=db.prepare(`INSERT INTO inventory_observations
  (id,session_id,asset_id,qr_value,so_luong_thuc_te,don_vi_thuc_te_id,vi_tri_thuc_te_id,tinh_trang,ghi_chu,client_updated_at,nguoi_kiem_ke_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,asset_id) DO UPDATE SET qr_value=excluded.qr_value,so_luong_thuc_te=excluded.so_luong_thuc_te,
  don_vi_thuc_te_id=excluded.don_vi_thuc_te_id,vi_tri_thuc_te_id=excluded.vi_tri_thuc_te_id,tinh_trang=excluded.tinh_trang,ghi_chu=excluded.ghi_chu,
  client_updated_at=excluded.client_updated_at,nguoi_kiem_ke_id=excluded.nguoi_kiem_ke_id,updated_at=datetime('now','localtime')`);
  for(const o of b.observations){const asset=db.prepare('SELECT q.asset_id,a.dvt FROM asset_qr_codes q JOIN assets a ON a.id=q.asset_id WHERE q.qr_value=? AND a.hoat_dong=1').get(o.qr_value);if(!asset)throw Object.assign(new Error(`QR không hợp lệ: ${o.qr_value}`),{status:422});const qty=Number(o.so_luong_thuc_te);if(!(qty>=0))throw Object.assign(new Error('Số lượng thực tế không hợp lệ'),{status:422});upsert.run(uuid(),s.id,asset.asset_id,o.qr_value,qty,s.don_vi_id,o.vi_tri_thuc_te_id||null,o.tinh_trang||'tot',o.ghi_chu||null,o.client_updated_at||null,req.session.nguoiDung.id);accepted++;}
  db.prepare('INSERT INTO inventory_sync_batches(id,session_id,client_batch_id,device_ref,nguoi_gui_id,payload_hash,accepted_count) VALUES (?,?,?,?,?,?,?)').run(uuid(),s.id,b.client_batch_id,b.device_ref||null,req.session.nguoiDung.id,hash,accepted);audit(req,s.id,'SYNC_BATCH',{client_batch_id:b.client_batch_id,accepted});})();res.json({accepted,idempotent:false});}catch(e){res.status(e.status||500).json({loi:e.message});}});

r.post('/:id/submit',coMaQuyenNay('inventory.submit'),(req,res)=>{const s=session(req.params.id);if(!s)return res.status(404).json({loi:'Không tìm thấy kỳ kiểm kê'});if(!allowed(req,s))return res.status(403).json({loi:'Không có quyền'});if(s.trang_thai!=='OPEN')return res.status(409).json({loi:'Chỉ kỳ OPEN được trình'});
 db.transaction(()=>{const rows=db.prepare(`SELECT x.asset_id,x.so_luong_so,x.don_vi_id don_vi_so_id,x.vi_tri_id vi_tri_so_id,
  COALESCE(o.so_luong_thuc_te,0) so_luong_thuc_te,COALESCE(o.don_vi_thuc_te_id,x.don_vi_id) don_vi_thuc_te_id,o.vi_tri_thuc_te_id
  FROM inventory_snapshot_lines x LEFT JOIN inventory_observations o ON o.session_id=x.session_id AND o.asset_id=x.asset_id WHERE x.session_id=?`).all(s.id);
  rows.push(...db.prepare(`SELECT o.asset_id,0 so_luong_so,o.don_vi_thuc_te_id don_vi_so_id,NULL vi_tri_so_id,
   o.so_luong_thuc_te,o.don_vi_thuc_te_id,o.vi_tri_thuc_te_id FROM inventory_observations o
   WHERE o.session_id=? AND NOT EXISTS (SELECT 1 FROM inventory_snapshot_lines x WHERE x.session_id=o.session_id AND x.asset_id=o.asset_id)`).all(s.id));
  const ins=db.prepare(`INSERT OR IGNORE INTO inventory_discrepancies(id,session_id,asset_id,loai,so_luong_so,so_luong_thuc_te,don_vi_so_id,don_vi_thuc_te_id,vi_tri_so_id,vi_tri_thuc_te_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  rows.forEach(x=>{let type=null;if(x.so_luong_thuc_te===0&&x.so_luong_so>0)type='MISSING';else if(x.so_luong_thuc_te!==x.so_luong_so)type=x.so_luong_thuc_te>x.so_luong_so?'EXCESS':'QUANTITY';else if(Number(x.vi_tri_thuc_te_id||0)!==Number(x.vi_tri_so_id||0))type='LOCATION';if(type)ins.run(uuid(),s.id,x.asset_id,type,x.so_luong_so,x.so_luong_thuc_te,x.don_vi_so_id,x.don_vi_thuc_te_id,x.vi_tri_so_id,x.vi_tri_thuc_te_id);});
  db.prepare("UPDATE inventory_sessions SET trang_thai='SUBMITTED' WHERE id=? AND trang_thai='OPEN'").run(s.id);audit(req,s.id,'SUBMIT',{discrepancies:db.prepare('SELECT COUNT(*) n FROM inventory_discrepancies WHERE session_id=?').get(s.id).n});})();res.json({ok:true,trang_thai:'SUBMITTED'});});

r.post('/:id/discrepancies/:discrepancyId/review',coMaQuyenNay('inventory.review'),(req,res)=>{const s=session(req.params.id),status=req.body?.status,reason=String(req.body?.reason||'').trim();if(!s)return res.status(404).json({loi:'Không tìm thấy kỳ kiểm kê'});if(!['APPROVED','REJECTED'].includes(status))return res.status(400).json({loi:'Trạng thái review không hợp lệ'});if(status==='REJECTED'&&!reason)return res.status(400).json({loi:'Từ chối phải có lý do'});
 const result=db.prepare(`UPDATE inventory_discrepancies SET review_status=?,review_reason=?,reviewer_id=?,reviewed_at=datetime('now','localtime') WHERE id=? AND session_id=? AND review_status='PENDING'`).run(status,reason||null,req.session.nguoiDung.id,req.params.discrepancyId,s.id);if(!result.changes)return res.status(409).json({loi:'Sai lệch đã được review hoặc không tồn tại'});audit(req,s.id,'REVIEW',{id:req.params.discrepancyId,status});res.json({ok:true});});

r.post('/:id/approve',coMaQuyenNay('inventory.approve'),(req,res)=>{const s=session(req.params.id);if(!s)return res.status(404).json({loi:'Không tìm thấy kỳ kiểm kê'});if(s.trang_thai!=='SUBMITTED')return res.status(409).json({loi:'Kỳ chưa ở trạng thái SUBMITTED'});if(db.prepare("SELECT 1 FROM inventory_discrepancies WHERE session_id=? AND review_status='PENDING'").get(s.id))return res.status(409).json({loi:'Còn sai lệch chưa review'});
 try{let txId=null;db.transaction(()=>{const approved=db.prepare("SELECT * FROM inventory_discrepancies WHERE session_id=? AND review_status='APPROVED'").all(s.id);if(approved.length){txId=uuid();db.prepare(`INSERT INTO asset_transactions(id,ma_giao_dich,loai,trang_thai,idempotency_key,ngay_hieu_luc,ly_do,source_system,source_id,nguoi_tao_id,nguoi_post_id,ngay_post)
 VALUES (?,?, 'ADJUSTMENT','POSTED',?,date('now','localtime'),'Điều chỉnh sau kiểm kê','inventory',?,?,?,datetime('now','localtime'))`).run(txId,`INV-ADJ-${s.ma_dot}`,`inventory:${s.id}:adjustment`,s.id,req.session.nguoiDung.id,req.session.nguoiDung.id);
  const lineIns=db.prepare(`INSERT INTO asset_transaction_lines(id,transaction_id,asset_id,so_luong,dvt,don_vi_nguon_id,vi_tri_nguon_id,don_vi_dich_id,vi_tri_dich_id,ghi_chu) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const entry=db.prepare(`INSERT INTO asset_ledger_entries(id,transaction_id,line_id,asset_id,don_vi_id,vi_tri_id,so_luong_thay_doi,dvt,loai_entry,event_time,posted_by,source_document) VALUES (?,?,?,?,?,?,?,?, 'ADJUSTMENT',datetime('now','localtime'),?,?)`);
  approved.forEach(d=>{const a=db.prepare('SELECT dvt FROM assets WHERE id=?').get(d.asset_id),diff=d.so_luong_thuc_te-d.so_luong_so,lineId=uuid();lineIns.run(lineId,txId,d.asset_id,Math.abs(diff)||d.so_luong_so,a.dvt,d.don_vi_so_id,d.vi_tri_so_id,d.don_vi_thuc_te_id,d.vi_tri_thuc_te_id,`Inventory ${s.ma_dot}`);
   if(diff)entry.run(uuid(),txId,lineId,d.asset_id,diff<0?d.don_vi_so_id:d.don_vi_thuc_te_id,diff<0?d.vi_tri_so_id:d.vi_tri_thuc_te_id,diff,a.dvt,req.session.nguoiDung.id,s.ma_dot);
   else if(d.loai==='LOCATION'){entry.run(uuid(),txId,lineId,d.asset_id,d.don_vi_so_id,d.vi_tri_so_id,-d.so_luong_so,a.dvt,req.session.nguoiDung.id,s.ma_dot);entry.run(uuid(),txId,lineId,d.asset_id,d.don_vi_thuc_te_id,d.vi_tri_thuc_te_id,d.so_luong_thuc_te,a.dvt,req.session.nguoiDung.id,s.ma_dot);}});rebuild();}
  db.prepare("UPDATE inventory_sessions SET trang_thai='POSTED',adjustment_transaction_id=?,nguoi_duyet_id=?,ngay_duyet=datetime('now','localtime') WHERE id=? AND trang_thai='SUBMITTED'").run(txId,req.session.nguoiDung.id,s.id);audit(req,s.id,'APPROVE_POST',{adjustment_transaction_id:txId});})();res.json({ok:true,trang_thai:'POSTED',adjustment_transaction_id:txId});}catch(e){res.status(/UNIQUE/.test(e.message)?409:500).json({loi:e.message});}});

module.exports=r;
