const express = require('express');
const db = require('../db');
const { dangNhap, coMaQuyen, donViDuocPhep, donViQuanLy } = require('../middleware/quyen');
const r = express.Router();
r.use(dangNhap);

function scope(column, user, args) {
    const units = donViDuocPhep(user);
    if (units === null) return '1=1';
    if (!units.length) return '1=0';
    args.push(...units);
    return `${column} IN (${units.map(() => '?').join(',')})`;
}
function transactionScope(user, args) {
    const units = donViDuocPhep(user);
    if (units === null) return '1=1';
    if (!units.length) return '1=0';
    args.push(...units, ...units);
    const marks = units.map(() => '?').join(',');
    return `(gd.don_vi_nguon_id IN (${marks}) OR gd.don_vi_dich_id IN (${marks}))`;
}

r.get('/', (req, res) => {
    const user = req.session.nguoiDung; let approvals = [];
    if(coMaQuyen(req,'thietbi.duyet')||coMaQuyen(req,'thietbi.tu_choi')){
      const units=donViQuanLy(user),args=[];let s='1=1';if(units!==null){if(!units.length)s='1=0';else{s=`tb.phan_xuong_id IN (${units.map(()=>'?').join(',')})`;args.push(...units);}}
      approvals.push(...db.prepare(`SELECT 'DEVICE' item_type,tb.id,tb.ma_tb code,tb.ten title,tb.trang_thai_duyet status,'NORMAL' priority,tb.ngay_tao created_at,
        tb.loai_ts reference,px.ten_ngan unit_name,NULL version,'device' action_kind FROM thiet_bi tb JOIN phan_xuong px ON px.id=tb.phan_xuong_id
        WHERE tb.trang_thai_duyet='cho_duyet' AND ${s} AND (tb.nguoi_tao_id<>? OR ?=1)
        AND NOT EXISTS(SELECT 1 FROM thiet_bi_deletions d WHERE d.thiet_bi_id=tb.id) ORDER BY tb.ngay_tao`)
        .all(...args,user.id,coMaQuyen(req,'approval.self')?1:0));
    }
    if (coMaQuyen(req, 'technical_operation.review')) {
        const args = [];
        approvals.push(...db.prepare(`SELECT 'TECHNICAL_WORK_ORDER' item_type,w.id,w.work_order_code code,
            w.description title,w.status,w.priority,w.created_at,d.ma_thiet_bi reference,px.ten_ngan unit_name,
            w.version,'technical' action_kind FROM technical_work_orders w
            JOIN devices d ON d.id=w.device_id JOIN phan_xuong px ON px.id=d.don_vi_id
            WHERE w.status='SUBMITTED' AND ${scope('d.don_vi_id', user, args)} ORDER BY w.created_at`).all(...args));
    }
    if (coMaQuyen(req, 'GD_DUYET')) {
        const args = [];
        approvals.push(...db.prepare(`SELECT 'ASSET_TRANSACTION' item_type,gd.id,gd.ma_giao_dich code,
            gd.ly_do title,gd.trang_thai status,'NORMAL' priority,gd.ngay_trinh created_at,
            gd.loai_giao_dich reference,COALESCE(gd.don_vi_nguon,gd.don_vi_dich) unit_name,
            NULL version,'transaction' action_kind FROM v_giao_dich gd
            WHERE gd.trang_thai='cho_duyet' AND ${transactionScope(user, args)}
            ORDER BY gd.ngay_trinh`).all(...args));
    }
    const mineArgs = [user.id];
    let mine = db.prepare(`SELECT 'TECHNICAL_WORK_ORDER' item_type,w.id,w.work_order_code code,
        w.description title,w.status,w.priority,w.created_at,d.ma_thiet_bi reference,px.ten_ngan unit_name,
        w.version,'technical' action_kind FROM technical_work_orders w
        JOIN devices d ON d.id=w.device_id JOIN phan_xuong px ON px.id=d.don_vi_id
        WHERE w.created_by=? AND w.status NOT IN('COMPLETED','REJECTED','CANCELLED')
          AND ${scope('d.don_vi_id', user, mineArgs)} ORDER BY w.updated_at DESC LIMIT 100`).all(...mineArgs);
    const q = String(req.query.q || '').trim().toLocaleLowerCase('vi');
    const type = String(req.query.type || '').toUpperCase();
    const matches = x => (!q || [x.code,x.title,x.reference,x.unit_name].some(v => String(v||'').toLocaleLowerCase('vi').includes(q)))
        && (!type || x.item_type === type);
    approvals = approvals.filter(matches).map(x => ({ ...x,
        overdue: !!x.created_at && Date.now() - new Date(String(x.created_at).replace(' ','T')).getTime() > 3 * 864e5
    })).sort((a,b) => Number(b.priority==='STOP_PRODUCTION')-Number(a.priority==='STOP_PRODUCTION') || Number(b.overdue)-Number(a.overdue));
    mine = mine.filter(matches);
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 30));
    const totalApprovals = approvals.length; const totalMine = mine.length;
    const urgent = approvals.filter(x => ['URGENT','STOP_PRODUCTION'].includes(x.priority)).length;
    approvals = approvals.slice((page-1)*size, page*size);
    mine = mine.slice((page-1)*size, page*size);
    res.json({ approvals, mine, page, size, totals: { approvals: totalApprovals, mine: totalMine }, capabilities: {
        review_technical: coMaQuyen(req, 'technical_operation.review'),
        approve_transaction: coMaQuyen(req, 'GD_DUYET')
        ,approve_device: coMaQuyen(req,'thietbi.duyet'),reject_device:coMaQuyen(req,'thietbi.tu_choi')
    }, summary: { approvals: totalApprovals, mine: totalMine,
        urgent } });
});
module.exports = r;
