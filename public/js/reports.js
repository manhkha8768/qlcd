const REPORT_STATUS_OPTIONS={ASSET_REGISTER:['cho_duyet','dang_su_dung','tam_ngung','cho_thanh_ly','da_thanh_ly'],
 DEVICE_REGISTER:['hoat_dong','du_phong','dang_sua','dang_dieu_chuyen','cho_thanh_ly','da_thanh_ly'],
 ASSET_LEDGER:['POSTED','REVERSED'],NCVT_FULFILLMENT:['DRAFT','SUBMITTED','RETURNED','REJECTED','APPROVED','CANCELLED'],
 TECHNICAL_OPERATIONS:['DRAFT','SUBMITTED','RETURNED','APPROVED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED'],
 DATA_QUALITY:['OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED']};
window.REPORT_CENTER={catalog:null,filters:null,current:null,page:1};

async function mhReports(el){
 const [catalog,filters]=await Promise.all([api('/reports/catalog'),api('/reports/filters')]);REPORT_CENTER.catalog=catalog;REPORT_CENTER.filters=filters;
 el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">Canonical Report Center</div><h2>Báo cáo, Excel, PDF & bản in</h2>
  <div class="phu">Một nguồn số liệu, cùng bộ lọc và phạm vi cho màn hình lẫn file xuất.</div></div><div>${catalog.capabilities.audit?'<button onclick="xemLichSuXuatBaoCao()">Lịch sử xuất</button>':''}</div></div>
  <div id="vung-bao"></div><div class="the"><div class="than-the"><div class="luoi-4">
   <div class="o-nhap"><label>Mẫu báo cáo</label><select id="rp-code" onchange="doiMauBaoCao()">${catalog.reports.map(x=>`<option value="${x.code}">${esc(x.title)}</option>`).join('')}</select></div>
   <div class="o-nhap"><label>Đơn vị</label><select id="rp-unit"><option value="">Tất cả trong phạm vi</option>${filters.units.map(x=>`<option value="${x.id}">${esc(x.ma)} — ${esc(x.ten)}</option>`).join('')}</select></div>
   <div class="o-nhap"><label>Trạng thái</label><select id="rp-status"><option value="">Tất cả</option></select></div>
   <div class="o-nhap" id="rp-period-wrap"><label>Kỳ NCVT</label><select id="rp-period"><option value="">Tất cả kỳ</option>${filters.periods.map(x=>`<option value="${x.id}">${esc(x.period_code)} — ${esc(x.status)}</option>`).join('')}</select></div>
  </div><div class="luoi-4"><div class="o-nhap"><label>Từ ngày</label><input id="rp-from" type="date"></div><div class="o-nhap"><label>Đến ngày</label><input id="rp-to" type="date"></div>
   <div class="o-nhap"><label>Tìm kiếm</label><input id="rp-q" placeholder="Mã, tên, nội dung" onkeydown="if(event.key==='Enter')taiBaoCaoCanonical(1)"></div>
   <div class="o-nhap"><label>Số dòng mỗi trang</label><select id="rp-size"><option>10</option><option selected>25</option><option>50</option><option>100</option></select></div></div>
  <div class="hang"><button class="chinh-nut" onclick="taiBaoCaoCanonical(1)">Xem báo cáo</button>
   ${catalog.capabilities.excel?'<button onclick="xuatBaoCaoCanonical(\'XLSX\')">Xuất Excel</button>':''}
   ${catalog.capabilities.pdf?'<button onclick="xuatBaoCaoCanonical(\'PDF\')">Xuất PDF</button>':''}
   ${catalog.capabilities.print?'<button onclick="xuatBaoCaoCanonical(\'PRINT\')">Bản in</button>':''}</div></div></div>
  <div id="rp-description" class="bao tin"></div><div id="rp-result" class="the"><div class="trong">Chọn bộ lọc và xem báo cáo.</div></div>`;
 doiMauBaoCao();await taiBaoCaoCanonical(1);
}

function reportFilters(){const f={};const mapping=[['don_vi_id','rp-unit'],['status','rp-status'],['period_id','rp-period'],['date_from','rp-from'],['date_to','rp-to'],['q','rp-q']];mapping.forEach(([key,id])=>{const value=gt(id);if(value)f[key]=value;});if(gt('rp-code')!=='NCVT_FULFILLMENT')delete f.period_id;return f;}
function doiMauBaoCao(){const code=gt('rp-code'),report=REPORT_CENTER.catalog.reports.find(x=>x.code===code);REPORT_CENTER.current=report;REPORT_CENTER.page=1;
 const status=document.getElementById('rp-status');if(status)status.innerHTML='<option value="">Tất cả</option>'+((REPORT_STATUS_OPTIONS[code]||[]).map(x=>`<option value="${x}">${esc(tt(x))}</option>`).join(''));
 const period=document.getElementById('rp-period-wrap');if(period)period.style.display=code==='NCVT_FULFILLMENT'?'block':'none';
 const description=document.getElementById('rp-description');if(description)description.innerHTML=`<b>${esc(report.title)}</b> — ${esc(report.description)} · tối đa ${Number(report.max_export_rows).toLocaleString('vi-VN')} dòng mỗi lần xuất.`;}
function reportValue(value,type){if(value===null||value===undefined||value==='')return '—';if(type==='money')return Number(value).toLocaleString('vi-VN');if(type==='number')return Number(value).toLocaleString('vi-VN',{maximumFractionDigits:3});if(type==='date')return ngay(value);return tt(String(value));}

async function taiBaoCaoCanonical(page=1){try{REPORT_CENTER.page=page;const code=gt('rp-code'),params=new URLSearchParams({...reportFilters(),page:String(page),page_size:gt('rp-size')||'25'});const d=await api(`/reports/${code}?${params}`);REPORT_CENTER.data=d;
 const rows=d.rows.map(row=>`<tr>${d.columns.map(c=>`<td class="${c.type==='number'||c.type==='money'?'phai so':''}">${esc(reportValue(row[c.key],c.type))}</td>`).join('')}</tr>`).join('');
 const p=d.pagination,buttons=`<div class="hang" style="padding:10px 14px"><div class="phu">${p.total.toLocaleString('vi-VN')} dòng · Trang ${p.page}/${p.total_pages} · ${d.duration_ms} ms</div><div class="hep"><button ${p.page<=1?'disabled':''} onclick="taiBaoCaoCanonical(${p.page-1})">Trang trước</button> <button ${p.page>=p.total_pages?'disabled':''} onclick="taiBaoCaoCanonical(${p.page+1})">Trang sau</button></div></div>`;
 document.getElementById('rp-result').innerHTML=`<h3>${esc(d.report.title)}</h3><div class="bao-bang"><table><thead><tr>${d.columns.map(c=>`<th class="${c.type==='number'||c.type==='money'?'phai':''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${d.columns.length}" class="trong">Không có dữ liệu phù hợp.</td></tr>`}</tbody></table></div>${buttons}`;
 }catch(e){document.getElementById('rp-result').innerHTML=`<div class="bao loi">${esc(e.message)}</div>`;}}

async function xuatBaoCaoCanonical(format){const code=gt('rp-code');let printWindow=null;try{if(format==='PRINT'){printWindow=window.open('about:blank','_blank');if(printWindow)printWindow.opener=null;}bao('Đang tạo file báo cáo…','tin');const response=await fetch(`/api/reports/${code}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,filters:reportFilters()})});
 if(!response.ok){let body={};try{body=await response.json();}catch(_){}throw new Error(body.loi||`Lỗi ${response.status}`);}const blob=await response.blob(),url=URL.createObjectURL(blob);
 if(format==='PRINT'){if(!printWindow)throw new Error('Trình duyệt đang chặn cửa sổ bản in');printWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}else{const a=document.createElement('a');a.href=url;const ext=format==='XLSX'?'xlsx':'pdf';a.download=`QLCD_${code}_${new Date().toISOString().slice(0,10)}.${ext}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}bao(`Đã tạo ${format} từ ${response.headers.get('X-QLCD-Row-Count')||0} dòng`);
 }catch(e){if(printWindow&&!printWindow.closed)printWindow.close();bao(e.message,'loi');}}

async function xemLichSuXuatBaoCao(){try{const rows=await api('/reports/exports');moHopThoai('Lịch sử xuất báo cáo',`<div class="bao-bang"><table><thead><tr><th>Thời điểm</th><th>Báo cáo</th><th>Định dạng</th><th>Người xuất</th><th>Dòng</th><th>Kết quả</th><th>Thời gian</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.started_at)}</td><td>${esc(x.title)}</td><td>${esc(x.format)}</td><td>${esc(x.requested_by_name)}</td><td class="phai">${x.row_count}</td><td>${esc(x.status)}</td><td class="phai">${x.duration_ms??'—'} ms</td></tr>`).join('')||'<tr><td colspan="7" class="trong">Chưa có lần xuất nào.</td></tr>'}</tbody></table></div>`,[{ten:'Đóng',chay:dongHopThoai}],true);}catch(e){bao(e.message,'loi');}}
