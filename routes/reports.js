const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { dangNhap, coMaQuyenNay, coQuyen, donViDuocPhep } = require('../middleware/quyen');
const { REPORTS, queryReport, renderExcel, renderPdf, renderPrint, scopeInfo } = require('../lib/reporting');

const r = express.Router();
r.use(dangNhap);

function fail(res, error) {
    res.status(error.status || 400).json({ loi: error.message });
}
function userCan(user, permission) { return coQuyen(user.id,user.vai_tro,permission); }

r.get('/catalog', coMaQuyenNay('report.view'), (req,res) => {
    const definitions=db.prepare('SELECT * FROM report_definitions WHERE enabled=1 ORDER BY category,title').all();
    res.json({ reports:definitions.map(row=>({ ...row,columns:REPORTS[row.code].columns.map(([key,label,type])=>({key,label,type})) })),
        capabilities:{ excel:userCan(req.session.nguoiDung,'report.export.excel'),
            pdf:userCan(req.session.nguoiDung,'report.export.pdf'),print:userCan(req.session.nguoiDung,'report.print'),
            audit:userCan(req.session.nguoiDung,'report.audit') },scope:scopeInfo(req.session.nguoiDung) });
});

r.get('/filters', coMaQuyenNay('report.view'), (req,res) => {
    const scope=donViDuocPhep(req.session.nguoiDung);
    let units;
    if(scope===null) units=db.prepare('SELECT id,ma,ten FROM phan_xuong WHERE hoat_dong=1 ORDER BY ma').all();
    else if(!scope.length) units=[];
    else units=db.prepare(`SELECT id,ma,ten FROM phan_xuong WHERE hoat_dong=1 AND id IN (${scope.map(()=>'?').join(',')}) ORDER BY ma`).all(...scope);
    res.json({ units,periods:db.prepare('SELECT id,period_code,name,status FROM ncvt_periods ORDER BY year DESC,quarter DESC').all() });
});

r.get('/exports', coMaQuyenNay('report.audit'), (req,res) => {
    const rows=db.prepare(`SELECT x.*,d.title,u.ho_ten requested_by_name FROM report_export_runs x
        JOIN report_definitions d ON d.code=x.report_code JOIN nguoi_dung u ON u.id=x.requested_by
        ORDER BY x.started_at DESC LIMIT 200`).all();
    res.json(rows);
});

r.get('/:code', coMaQuyenNay('report.view'), (req,res) => {
    try { res.json(queryReport(req.params.code,req.session.nguoiDung,req.query)); }
    catch(error){fail(res,error);}
});

r.post('/:code/export', (req,res,next) => {
    const format=String(req.body?.format||'').toUpperCase();
    const permission={XLSX:'report.export.excel',PDF:'report.export.pdf',PRINT:'report.print'}[format];
    if(!req.session?.nguoiDung) return res.status(401).json({loi:'Chưa đăng nhập'});
    if(!permission || !userCan(req.session.nguoiDung,permission)) return res.status(403).json({loi:'Không có quyền xuất định dạng này'});
    next();
}, async (req,res) => {
    const format=String(req.body.format).toUpperCase(); const code=String(req.params.code).toUpperCase();
    const id=crypto.randomUUID(); const started=Date.now(); const filters={...(req.body.filters||{})};
    const scope=scopeInfo(req.session.nguoiDung);
    try {
        db.prepare(`INSERT INTO report_export_runs(id,report_code,format,status,filters_json,scope_json,requested_by)
            VALUES (?,?,?,'RUNNING',?,?,?)`).run(id,code,format,JSON.stringify(filters),JSON.stringify(scope),req.session.nguoiDung.id);
    } catch(error){return fail(res,Object.assign(error,{status:/FOREIGN KEY/.test(error.message)?404:400}));}
    try {
        const result=queryReport(code,req.session.nguoiDung,filters,true);
        let buffer; let type; let extension; let disposition='attachment';
        if(format==='XLSX'){buffer=await renderExcel(result);type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';extension='xlsx';}
        else if(format==='PDF'){buffer=await renderPdf(result);type='application/pdf';extension='pdf';}
        else {buffer=renderPrint(result);type='text/html; charset=utf-8';extension='html';disposition='inline';}
        const hash=crypto.createHash('sha256').update(buffer).digest('hex');
        db.prepare(`UPDATE report_export_runs SET status='SUCCEEDED',row_count=?,duration_ms=?,content_sha256=?,
            finished_at=datetime('now','localtime') WHERE id=?`).run(result.rows.length,Date.now()-started,hash,id);
        res.setHeader('Content-Type',type);
        res.setHeader('Content-Disposition',`${disposition}; filename="QLCD_${code}_${new Date().toISOString().slice(0,10)}.${extension}"`);
        res.setHeader('X-QLCD-Export-Id',id); res.setHeader('X-QLCD-Row-Count',String(result.rows.length));
        res.send(buffer);
    } catch(error){
        try{db.prepare(`UPDATE report_export_runs SET status='FAILED',duration_ms=?,error_message=?,
            finished_at=datetime('now','localtime') WHERE id=?`).run(Date.now()-started,String(error.message).slice(0,1000),id);}catch(_){}
        fail(res,error);
    }
});

module.exports=r;
