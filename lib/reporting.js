const fs = require('fs');
const db = require('../db');
const { donViDuocPhep } = require('../middleware/quyen');

const REPORTS = {
    ASSET_REGISTER: {
        from: `assets a JOIN phan_xuong px ON px.id=a.don_vi_id`, alias: 'a', unit: 'a.don_vi_id',
        base: 'a.hoat_dong=1', date: 'a.ngay_tao', status: 'a.trang_thai',
        search: ['a.ma_tai_san','a.ten','a.nhom_tai_san','px.ma','px.ten'],
        select: `a.id,a.ma_tai_san asset_code,a.loai_tai_san asset_type,a.ten asset_name,
            px.ma unit_code,a.so_luong quantity,a.dvt uom,a.nguyen_gia original_cost,
            a.gia_tri_con_lai remaining_value,a.trang_thai status,a.ngay_dua_vao_su_dung in_service_date`,
        columns: [['asset_code','Mã tài sản','text'],['asset_type','Loại','text'],['asset_name','Tên tài sản','text'],
            ['unit_code','Đơn vị','text'],['quantity','Số lượng','number'],['uom','ĐVT','text'],
            ['original_cost','Nguyên giá','money'],['remaining_value','Giá trị còn lại','money'],
            ['status','Trạng thái','text'],['in_service_date','Ngày sử dụng','date']],
        sorts: { asset_code:'a.ma_tai_san',asset_name:'a.ten',unit_code:'px.ma',status:'a.trang_thai',in_service_date:'a.ngay_dua_vao_su_dung' },
        defaultSort: 'a.ma_tai_san ASC'
    },
    DEVICE_REGISTER: {
        from: `devices d JOIN phan_xuong px ON px.id=d.don_vi_id JOIN nhom_thiet_bi n ON n.id=d.nhom_id`,
        unit:'d.don_vi_id',base:'d.hoat_dong=1',date:'d.ngay_tao',status:'d.trang_thai',
        search:['d.ma_thiet_bi','d.ten','d.so_seri','n.ma','n.ten','px.ma','px.ten'],
        select:`d.id,d.ma_thiet_bi device_code,d.ten device_name,n.ma group_code,d.so_seri serial_number,
            px.ma unit_code,d.trang_thai status,d.tinh_trang_ky_thuat technical_condition,
            d.gio_chay_luy_ke accumulated_hours,d.ngay_tao created_at`,
        columns:[['device_code','Device ID','text'],['device_name','Tên thiết bị','text'],['group_code','Nhóm','text'],
            ['serial_number','Số seri','text'],['unit_code','Đơn vị','text'],['status','Trạng thái','text'],
            ['technical_condition','Tình trạng KT','text'],['accumulated_hours','Giờ lũy kế','number'],['created_at','Ngày tạo','date']],
        sorts:{device_code:'d.ma_thiet_bi',device_name:'d.ten',unit_code:'px.ma',status:'d.trang_thai',created_at:'d.ngay_tao'},
        defaultSort:'d.ma_thiet_bi ASC'
    },
    ASSET_LEDGER: {
        from:`asset_ledger_entries e JOIN asset_transactions t ON t.id=e.transaction_id
            JOIN assets a ON a.id=e.asset_id JOIN phan_xuong px ON px.id=e.don_vi_id
            LEFT JOIN nguoi_dung u ON u.id=e.posted_by`,
        unit:'e.don_vi_id',base:'1=1',date:'e.event_time',status:'t.trang_thai',
        search:['t.ma_giao_dich','a.ma_tai_san','a.ten','px.ma','e.source_document'],
        select:`e.id,t.ma_giao_dich transaction_code,t.loai transaction_type,e.event_time,
            a.ma_tai_san asset_code,a.ten asset_name,px.ma unit_code,e.loai_entry entry_type,
            e.so_luong_thay_doi quantity_delta,e.dvt uom,u.ho_ten posted_by,e.source_document`,
        columns:[['transaction_code','Mã giao dịch','text'],['transaction_type','Loại GD','text'],['event_time','Ngày hiệu lực','date'],
            ['asset_code','Mã tài sản','text'],['asset_name','Tên tài sản','text'],['unit_code','Đơn vị','text'],
            ['entry_type','Entry','text'],['quantity_delta','Biến động','number'],['uom','ĐVT','text'],['posted_by','Người ghi sổ','text']],
        sorts:{event_time:'e.event_time',transaction_code:'t.ma_giao_dich',asset_code:'a.ma_tai_san',unit_code:'px.ma',quantity_delta:'e.so_luong_thay_doi'},
        defaultSort:'e.event_time DESC,e.id DESC'
    },
    STOCK_BALANCE: {
        from:`v_stock_balance b JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN phan_xuong px ON px.id=w.don_vi_id`,
        unit:'w.don_vi_id',base:"w.status='ACTIVE'",date:'b.updated_at',status:null,
        search:['b.material_code','b.material_name','b.warehouse_code','b.warehouse_name','px.ma'],
        select:`b.warehouse_id,b.material_id,b.warehouse_code,b.warehouse_name,px.ma unit_code,
            b.material_code,b.material_name,b.uom_code,b.on_hand,b.reserved,b.available,b.incoming,b.updated_at`,
        columns:[['warehouse_code','Mã kho','text'],['warehouse_name','Tên kho','text'],['unit_code','Đơn vị','text'],
            ['material_code','Material ID','text'],['material_name','Tên vật tư','text'],['uom_code','UOM','text'],
            ['on_hand','ON HAND','number'],['reserved','RESERVED','number'],['available','AVAILABLE','number'],
            ['incoming','INCOMING','number'],['updated_at','Cập nhật','date']],
        sorts:{warehouse_code:'b.warehouse_code',material_code:'b.material_code',material_name:'b.material_name',on_hand:'b.on_hand',available:'b.available'},
        defaultSort:'b.warehouse_code ASC,b.material_code ASC'
    },
    NCVT_FULFILLMENT: {
        from:`v_ncvt_dashboard_lines v JOIN ncvt_submissions s ON s.id=v.submission_id
            JOIN ncvt_periods p ON p.id=v.period_id JOIN phan_xuong px ON px.id=v.don_vi_id
            JOIN materials m ON m.id=v.material_id`,
        unit:'v.don_vi_id',base:'1=1',date:'s.updated_at',status:'v.submission_status',period:'v.period_id',
        search:['p.period_code','s.submission_code','px.ma','px.ten','m.material_code','m.name','v.project_name'],
        select:`v.submission_line_id,p.period_code,s.submission_code,px.ma unit_code,m.material_code,m.name material_name,
            v.uom_code,v.submission_status status,v.requested_quantity,v.approved_quantity,
            v.active_reserved_quantity reserved_quantity,v.posted_issued_quantity issued_quantity,
            v.accepted_quantity received_quantity,(v.damaged_quantity+v.wrong_quantity+v.refused_quantity) discrepancy_quantity,
            v.pending_confirmation_quantity,v.unallocated_quantity`,
        columns:[['period_code','Kỳ','text'],['submission_code','Submission','text'],['unit_code','PX','text'],
            ['material_code','Material ID','text'],['material_name','Tên vật tư','text'],['uom_code','UOM','text'],
            ['status','Trạng thái','text'],['approved_quantity','Approved','number'],['reserved_quantity','Reserved','number'],
            ['issued_quantity','Issued','number'],['received_quantity','Received','number'],['discrepancy_quantity','Chênh lệch','number'],
            ['pending_confirmation_quantity','Chờ nhận','number'],['unallocated_quantity','Chưa phân bổ','number']],
        sorts:{period_code:'p.period_code',submission_code:'s.submission_code',unit_code:'px.ma',material_code:'m.material_code',status:'v.submission_status'},
        defaultSort:'p.year DESC,p.quarter DESC,px.ma ASC,m.material_code ASC'
    },
    TECHNICAL_OPERATIONS: {
        from:`technical_work_orders w JOIN devices d ON d.id=w.device_id JOIN phan_xuong px ON px.id=d.don_vi_id`,
        unit:'d.don_vi_id',base:'1=1',date:'w.created_at',status:'w.status',
        search:['w.work_order_code','d.ma_thiet_bi','d.ten','w.description','px.ma'],
        select:`w.id,w.work_order_code,w.operation_type,d.ma_thiet_bi device_code,d.ten device_name,
            px.ma unit_code,w.status,w.priority,w.description,w.scheduled_date,w.completed_at,w.next_due_date,w.result`,
        columns:[['work_order_code','Work order','text'],['operation_type','Loại','text'],['device_code','Device ID','text'],
            ['device_name','Thiết bị','text'],['unit_code','Đơn vị','text'],['status','Trạng thái','text'],
            ['priority','Ưu tiên','text'],['scheduled_date','Kế hoạch','date'],['completed_at','Hoàn thành','date'],
            ['next_due_date','Hạn tiếp','date'],['result','Kết quả','text']],
        sorts:{work_order_code:'w.work_order_code',operation_type:'w.operation_type',device_code:'d.ma_thiet_bi',unit_code:'px.ma',status:'w.status',scheduled_date:'w.scheduled_date',next_due_date:'w.next_due_date'},
        defaultSort:'w.created_at DESC,w.work_order_code DESC'
    },
    DATA_QUALITY: {
        from:`notification_cases c JOIN notification_rules r ON r.code=c.rule_code
            LEFT JOIN phan_xuong px ON px.id=c.don_vi_id LEFT JOIN nguoi_dung u ON u.id=c.owner_user_id`,
        unit:'c.don_vi_id',base:"c.category='DATA_QUALITY'",date:'c.last_detected_at',status:'c.status',
        search:['c.title','c.details','c.entity_type','c.entity_id','r.title','u.ho_ten'],
        select:`c.id,c.rule_code,r.title rule_title,c.title,c.entity_type,c.entity_id,px.ma unit_code,
            c.severity,c.status,u.ho_ten owner_name,c.occurrence_count,c.first_detected_at,c.last_detected_at,
            c.resolution_note`,
        columns:[['rule_code','Rule','text'],['title','Vấn đề','text'],['entity_type','Đối tượng','text'],
            ['entity_id','Mã đối tượng','text'],['unit_code','Đơn vị','text'],['severity','Mức độ','text'],
            ['status','Trạng thái','text'],['owner_name','Người phụ trách','text'],['occurrence_count','Số lần','number'],
            ['last_detected_at','Phát hiện cuối','date'],['resolution_note','Kết quả xử lý','text']],
        sorts:{rule_code:'c.rule_code',severity:'c.severity',status:'c.status',unit_code:'px.ma',last_detected_at:'c.last_detected_at'},
        defaultSort:`CASE c.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END,c.last_detected_at DESC`
    }
};

function error(message, status = 422) { return Object.assign(new Error(message), { status }); }
function definition(code) {
    const key = String(code || '').toUpperCase(); const spec = REPORTS[key];
    const row = db.prepare('SELECT * FROM report_definitions WHERE code=? AND enabled=1').get(key);
    if (!spec || !row) throw error('Loại báo cáo không hợp lệ hoặc đã ngừng', 404);
    return { key, spec, row };
}
function normalizeFilters(query = {}) {
    const filters = {};
    if (query.q?.trim()) filters.q = String(query.q).trim().slice(0, 100);
    if (query.don_vi_id !== undefined && query.don_vi_id !== '') {
        const unitId = Number(query.don_vi_id);
        if (!Number.isInteger(unitId) || unitId <= 0) throw error('Đơn vị không hợp lệ');
        filters.don_vi_id = unitId;
    }
    if (query.status) filters.status = String(query.status).trim().slice(0, 50);
    if (query.period_id) filters.period_id = String(query.period_id).trim().slice(0, 100);
    for (const key of ['date_from','date_to']) {
        if (query[key]) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(query[key]))) throw error(`${key} không hợp lệ`);
            filters[key] = String(query[key]);
        }
    }
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
        throw error('Từ ngày không được sau đến ngày');
    }
    return filters;
}
function scopeInfo(user) {
    const units = donViDuocPhep(user);
    return { mode: units === null ? 'COMPANY' : 'ASSIGNED_UNITS', unit_ids: units };
}
function buildWhere(spec, user, filters) {
    const where = [spec.base || '1=1']; const params = [];
    const scope = donViDuocPhep(user);
    if (scope !== null) {
        if (!scope.length) where.push('1=0');
        else { where.push(`${spec.unit} IN (${scope.map(() => '?').join(',')})`); params.push(...scope); }
        if (filters.don_vi_id && !scope.includes(Number(filters.don_vi_id))) throw error('Đơn vị ngoài phạm vi được phân công', 403);
    }
    if (filters.don_vi_id) { where.push(`${spec.unit}=?`); params.push(filters.don_vi_id); }
    if (filters.status) {
        if (!spec.status) throw error('Báo cáo này không hỗ trợ lọc trạng thái');
        where.push(`${spec.status}=?`); params.push(filters.status);
    }
    if (filters.period_id) {
        if (!spec.period) throw error('Báo cáo này không hỗ trợ lọc kỳ');
        where.push(`${spec.period}=?`); params.push(filters.period_id);
    }
    if (filters.date_from) { where.push(`date(${spec.date})>=date(?)`); params.push(filters.date_from); }
    if (filters.date_to) { where.push(`date(${spec.date})<=date(?)`); params.push(filters.date_to); }
    if (filters.q) {
        const q = `%${filters.q}%`;
        where.push(`(${spec.search.map(field => `${field} LIKE ?`).join(' OR ')})`);
        params.push(...spec.search.map(() => q));
    }
    return { sql: where.join(' AND '), params };
}
function orderBy(spec, sort, direction) {
    if (!sort) return spec.defaultSort;
    if (!spec.sorts[sort]) throw error('Cột sắp xếp không hợp lệ');
    return `${spec.sorts[sort]} ${String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC'}`;
}
function columns(spec) { return spec.columns.map(([key,label,type]) => ({ key,label,type })); }

function queryReport(code, user, query = {}, exportMode = false) {
    const started = Date.now(); const { key, spec, row: report } = definition(code);
    const filters = normalizeFilters(query); const where = buildWhere(spec, user, filters);
    const sort = query.sort || null; const direction = query.direction || 'asc';
    const ordering = orderBy(spec, sort, direction);
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.page_size, 10) || report.default_page_size));
    const total = db.prepare(`SELECT COUNT(*) n FROM ${spec.from} WHERE ${where.sql}`).get(...where.params).n;
    const limit = exportMode ? report.max_export_rows + 1 : pageSize;
    const offset = exportMode ? 0 : (page - 1) * pageSize;
    const rows = db.prepare(`SELECT ${spec.select} FROM ${spec.from} WHERE ${where.sql}
        ORDER BY ${ordering} LIMIT ? OFFSET ?`).all(...where.params, limit, offset);
    if (exportMode && rows.length > report.max_export_rows) {
        throw error(`Báo cáo vượt ${report.max_export_rows.toLocaleString('vi-VN')} dòng; hãy thu hẹp bộ lọc`, 413);
    }
    return { report: { code:key,title:report.title,category:report.category,description:report.description,
            orientation:report.orientation,max_export_rows:report.max_export_rows },
        columns:columns(spec),rows,total,pagination:{page,page_size:pageSize,total,total_pages:Math.max(1,Math.ceil(total/pageSize))},
        filters,sort:sort || '',direction,scope:scopeInfo(user),generated_at:new Date().toISOString(),duration_ms:Date.now()-started };
}

function systemName() {
    const rows = db.prepare("SELECT khoa,gia_tri FROM cau_hinh WHERE khoa IN('ten_cong_ty','ten_he_thong')").all();
    const values = Object.fromEntries(rows.map(x => [x.khoa,x.gia_tri]));
    return { company: values.ten_cong_ty || 'Công ty Xây lắp Mỏ — TKV',
        system: values.ten_he_thong || 'Quản lý thiết bị cơ điện vận tải' };
}
function display(value, type) {
    if (value === null || value === undefined || value === '') return '';
    if (type === 'money') return Number(value).toLocaleString('vi-VN');
    if (type === 'number') return Number(value).toLocaleString('vi-VN',{maximumFractionDigits:3});
    if (type === 'date') {
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
    }
    return String(value);
}
function filterText(result) {
    const f = result.filters; const parts = [];
    if (f.don_vi_id) parts.push(`Đơn vị #${f.don_vi_id}`);
    if (f.period_id) parts.push(`Kỳ ${f.period_id}`);
    if (f.status) parts.push(`Trạng thái ${f.status}`);
    if (f.date_from || f.date_to) parts.push(`Thời gian ${f.date_from || '…'} — ${f.date_to || '…'}`);
    if (f.q) parts.push(`Tìm “${f.q}”`);
    return parts.join(' · ') || 'Không có bộ lọc bổ sung';
}
function findFont() {
    const candidates = [process.env.QLCD_REPORT_FONT,'C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/tahoma.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/dejavu/DejaVuSans.ttf'];
    return candidates.find(value => value && fs.existsSync(value)) || null;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function renderExcel(result) {
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const names = systemName();
    wb.creator = 'QLCD'; wb.created = new Date();
    const ws = wb.addWorksheet(result.report.title.slice(0,31), { views:[{state:'frozen',ySplit:6}] });
    const last = Math.max(1,result.columns.length); ws.mergeCells(1,1,1,last); ws.getCell(1,1).value=names.company;
    ws.mergeCells(2,1,2,last); ws.getCell(2,1).value=result.report.title;
    ws.mergeCells(3,1,3,last); ws.getCell(3,1).value=`Phạm vi: ${result.scope.mode} · ${filterText(result)}`;
    ws.mergeCells(4,1,4,last); ws.getCell(4,1).value=`Thời điểm xuất: ${new Date(result.generated_at).toLocaleString('vi-VN')} · ${result.total.toLocaleString('vi-VN')} dòng`;
    ws.getCell(1,1).font={bold:true,size:12}; ws.getCell(2,1).font={bold:true,size:16,color:{argb:'FF1B2430'}};
    ws.getCell(3,1).font={italic:true,color:{argb:'FF66727F'}}; ws.getCell(4,1).font={color:{argb:'FF66727F'}};
    const headerRow=ws.getRow(6); result.columns.forEach((column,index)=>{const cell=headerRow.getCell(index+1);cell.value=column.label;
        cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1B2430'}};
        cell.alignment={vertical:'middle',horizontal:column.type==='number'||column.type==='money'?'right':'left'};});
    result.rows.forEach(row=>{const output=ws.addRow(result.columns.map(column=>row[column.key]));
        result.columns.forEach((column,index)=>{const cell=output.getCell(index+1);
            if(column.type==='money')cell.numFmt='#,##0'; else if(column.type==='number')cell.numFmt='#,##0.###';
            cell.alignment={vertical:'top',wrapText:true,horizontal:column.type==='number'||column.type==='money'?'right':'left'};});});
    result.columns.forEach((column,index)=>{const max=Math.max(column.label.length,...result.rows.slice(0,200).map(row=>String(row[column.key]??'').length));
        ws.getColumn(index+1).width=Math.min(36,Math.max(11,max+2));});
    ws.autoFilter={from:{row:6,column:1},to:{row:6,column:last}};
    ws.pageSetup={orientation:result.report.orientation.toLowerCase(),fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
    ws.headerFooter.oddFooter=`&L${names.company}&CTrang &P / &N&RQLCD`;
    return Buffer.from(await wb.xlsx.writeBuffer());
}

async function renderPdf(result) {
    const PDFDocument=require('pdfkit'); const names=systemName(); const landscape=result.report.orientation==='LANDSCAPE';
    const doc=new PDFDocument({size:'A4',layout:landscape?'landscape':'portrait',margin:28,bufferPages:true});
    const parts=[]; doc.on('data',chunk=>parts.push(chunk)); const complete=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(parts)));doc.on('error',reject);});
    const font=findFont(); if(font){doc.registerFont('QLCD',font);doc.font('QLCD');}
    const regular=font?'QLCD':'Helvetica'; const pageWidth=doc.page.width-56;
    doc.font(regular).fontSize(9).text(names.company,{align:'center'});
    doc.font(regular).fontSize(15).text(result.report.title,{align:'center'});
    doc.fontSize(7).fillColor('#66727F').text(`Phạm vi: ${result.scope.mode} · ${filterText(result)}`,{align:'center'});
    doc.text(`Thời điểm xuất: ${new Date(result.generated_at).toLocaleString('vi-VN')} · ${result.total.toLocaleString('vi-VN')} dòng`,{align:'center'});
    doc.moveDown(.8).fillColor('#1B2430');
    const widths=result.columns.map(column=>column.type==='text'?1.35:1); const totalWeight=widths.reduce((a,b)=>a+b,0);
    const colWidths=widths.map(value=>pageWidth*value/totalWeight); const startX=doc.page.margins.left; let y=doc.y;
    function row(values,header=false){const lineHeight=Math.max(...values.map((value,index)=>doc.heightOfString(String(value??''),{width:colWidths[index]-5,height:30})),10)+5;
        if(y+lineHeight>doc.page.height-45){doc.addPage();y=doc.page.margins.top;headerRow();}
        let x=startX; values.forEach((value,index)=>{doc.rect(x,y,colWidths[index],lineHeight).fillAndStroke(header?'#1B2430':'#FFFFFF','#DCE0E6');
            doc.fillColor(header?'#FFFFFF':'#1B2430').fontSize(header?6.5:6.3).text(String(value??'').slice(0,180),x+2.5,y+2.5,{width:colWidths[index]-5,height:lineHeight-4,ellipsis:true,
                align:['number','money'].includes(result.columns[index].type)?'right':'left'});x+=colWidths[index];});y+=lineHeight;doc.y=y;}
    function headerRow(){row(result.columns.map(column=>column.label),true);}
    headerRow(); result.rows.forEach(item=>row(result.columns.map(column=>display(item[column.key],column.type))));
    const range=doc.bufferedPageRange(); for(let page=range.start;page<range.start+range.count;page++){doc.switchToPage(page);
        doc.font(regular).fontSize(7).fillColor('#66727F').text(`${names.company} · ${result.report.code} · Trang ${page-range.start+1}/${range.count}`,
            28,doc.page.height-28,{width:doc.page.width-56,align:'center',lineBreak:false});}
    doc.end(); return complete;
}

function renderPrint(result) {
    const names=systemName(); const head=result.columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('');
    const rows=result.rows.map(row=>`<tr>${result.columns.map(c=>`<td class="${c.type}">${escapeHtml(display(row[c.key],c.type))}</td>`).join('')}</tr>`).join('');
    return Buffer.from(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(result.report.title)}</title><style>
      @page{size:A4 ${result.report.orientation.toLowerCase()};margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1B2430;font-size:10px;margin:0}h1{font-size:18px;margin:4px 0;text-align:center}header{text-align:center;margin-bottom:12px}.meta{color:#66727F;margin:2px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #B8BFC8;padding:4px;vertical-align:top}th{background:#1B2430;color:white;text-align:left;font-size:9px}.number,.money{text-align:right;font-variant-numeric:tabular-nums}.tools{margin-bottom:10px;text-align:right}@media print{.tools{display:none}thead{display:table-header-group}tr{break-inside:avoid}}footer{margin-top:8px;color:#66727F;text-align:center}</style></head><body>
      <div class="tools"><button onclick="window.print()">In báo cáo</button></div><header><div>${escapeHtml(names.company)}</div><h1>${escapeHtml(result.report.title)}</h1>
      <div class="meta">Phạm vi: ${escapeHtml(result.scope.mode)} · ${escapeHtml(filterText(result))}</div><div class="meta">${result.total.toLocaleString('vi-VN')} dòng · ${escapeHtml(new Date(result.generated_at).toLocaleString('vi-VN'))}</div></header>
      <table><thead><tr>${head}</tr></thead><tbody>${rows||`<tr><td colspan="${result.columns.length}">Không có dữ liệu</td></tr>`}</tbody></table><footer>QLCD · ${escapeHtml(result.report.code)}</footer></body></html>`,'utf8');
}

module.exports={ REPORTS,definition,normalizeFilters,scopeInfo,queryReport,renderExcel,renderPdf,renderPrint,filterText };
