/* TASK 7 - Hồ sơ kỹ thuật canonical theo Device ID. Cây cấu tạo chỉ đọc đến TASK 8. */
let hsktData=null;let hsktTab='thong-so';let hsktComponentTree=null;

async function mhHoSoKyThuat(el){
 el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">Device Master</div><h2>Hồ sơ kỹ thuật</h2></div></div>
 <div class="the" style="padding:14px"><div class="o-nhap"><label>Tìm thiết bị</label><input id="hskt-q" placeholder="Mã, tên hoặc số serial"></div></div>
 <div class="the"><div id="hskt-list">Đang tải…</div></div>`;
 document.getElementById('hskt-q').onkeydown=e=>{if(e.key==='Enter')taiDsHskt();};await taiDsHskt();
}

async function taiDsHskt(){
 const q=document.getElementById('hskt-q')?.value||'';const d=await api('/device-master?moi_trang=100&q='+encodeURIComponent(q));
 document.getElementById('hskt-list').innerHTML=`<div class="bao-bang"><table><thead><tr><th>Mã thiết bị</th><th>Tên</th><th>Nhóm</th><th>Đơn vị</th><th>Trạng thái</th></tr></thead><tbody>${d.danh_sach.map(x=>`<tr class="bam" onclick="moHskt('${x.id}')"><td class="ma">${esc(x.ma_thiet_bi)}</td><td>${esc(x.ten)}</td><td>${esc(x.ten_nhom)}</td><td>${esc(x.don_vi)}</td><td>${esc(x.trang_thai)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function moHskt(id,tab='thong-so'){
 hsktData=await api('/technical-profiles/devices/'+id);hsktTab=tab;if(tab==='cau-tao')hsktComponentTree=await api('/component-tree/devices/'+id);const d=hsktData,o=d.overview;const el=document.getElementById('chinh');
 const tabs=[['tong-quan','Tổng quan'],['thong-so','Thông số'],['tai-san','Tài sản'],['cau-tao','Cấu tạo'],['tai-lieu','Tài liệu'],['bao-tri','Bảo trì'],['kiem-dinh','Kiểm định'],['lich-su','Lịch sử']];
 el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">${esc(o.ma_thiet_bi)} · ${esc(o.ten_nhom)}</div><h2>${esc(o.ten)}</h2><div class="mo">Hồ sơ v${o.profile_version} · Hoàn thiện ${o.completeness_percent}% · ${esc(o.ten_don_vi)}</div></div><button onclick="dieuHuong('ho-so-ky-thuat')">Quay lại</button></div>
 <div class="the" style="padding:10px;display:flex;gap:6px;flex-wrap:wrap">${tabs.map(([k,n])=>`<button class="${k===tab?'chinh-nut':''}" onclick="moHskt('${id}','${k}')">${n}</button>`).join('')}</div><div class="the" id="hskt-tab"></div>`;
 veTabHskt();
}

function veTabHskt(){const d=hsktData,o=d.overview,el=document.getElementById('hskt-tab');
 if(hsktTab==='tong-quan')el.innerHTML=`<div class="luoi-form"><div><b>Mã thiết bị</b><p>${esc(o.ma_thiet_bi)}</p></div><div><b>Model</b><p>${esc(o.ma_model||'—')}</p></div><div><b>Serial</b><p>${esc(o.so_seri||'—')}</p></div><div><b>Năm sản xuất</b><p>${esc(o.nam_san_xuat||'—')}</p></div><div><b>Tình trạng</b><p>${esc(o.tinh_trang_ky_thuat)}</p></div><div><b>Giờ chạy lũy kế</b><p>${Number(o.gio_chay_luy_ke||0)}</p></div></div>`;
 else if(hsktTab==='thong-so')el.innerHTML=`<div class="dau-trang"><h3>Thông số có kiểm soát kiểu dữ liệu</h3><button class="chinh-nut" onclick="luuThongSoHskt()">Lưu thay đổi</button></div><div id="vung-bao"></div><div class="bao-bang"><table><thead><tr><th>Thông số</th><th>Giá trị</th><th>Đơn vị</th><th>Ràng buộc</th></tr></thead><tbody>${d.attributes.map(a=>`<tr><td>${esc(a.ten)}${a.bat_buoc?' *':''}<div class="mo">${esc(a.ma_thuoc_tinh)}</div></td><td>${inputHskt(a)}</td><td>${esc(a.don_vi||'')}</td><td class="mo">${esc(rangBuocHskt(a))}</td></tr>`).join('')}</tbody></table></div>`;
 else if(hsktTab==='tai-san')el.innerHTML=bangHskt(['Mã tài sản','Tên','Quan hệ'],d.assets,x=>[x.ma_tai_san,x.ten,x.loai_quan_he]);
 else if(hsktTab==='cau-tao')el.innerHTML=`<div class="dau-trang"><div><h3>Cây cấu tạo canonical</h3><div class="mo">Di chuyển và thay thế dùng version để chống ghi đè đồng thời.</div></div><button class="chinh-nut" onclick="themComponentHskt()">Thêm node gốc</button></div><div id="vung-bao"></div>${veCayComponentHskt(hsktComponentTree?.tree||[],0)}`;
 else if(hsktTab==='tai-lieu')el.innerHTML=bangHskt(['Tên tài liệu','Loại','Ngày tải'],d.documents,x=>[x.ten_tai_lieu,x.loai,x.ngay_tai]);
 else if(hsktTab==='bao-tri')el.innerHTML=bangHskt(['Số phiếu','Loại','Trạng thái','Hoàn thành'],d.maintenance,x=>[x.so_phieu,x.loai,x.trang_thai,x.ngay_hoan_thanh]);
 else if(hsktTab==='kiem-dinh')el.innerHTML=bangHskt(['Ngày kiểm định','Kết quả','Hạn tiếp theo'],d.inspections,x=>[x.ngay_kiem_dinh,x.ket_qua,x.han_tiep_theo]);
 else el.innerHTML=bangHskt(['Phiên bản','Thời điểm','Thay đổi'],d.history,x=>[x.profile_version,x.changed_at,(JSON.parse(x.changes_json||'[]').map(c=>c.ma).join(', '))]);
}

function inputHskt(a){const id=`hskt-${a.id}`,v=a.gia_tri??'';if(a.kieu_du_lieu==='BOOLEAN')return `<select id="${id}"><option value=""></option><option value="1" ${v===1?'selected':''}>Có</option><option value="0" ${v===0?'selected':''}>Không</option></select>`;if(a.kieu_du_lieu==='ENUM'){let opts=[];try{opts=JSON.parse(a.options_json||'[]');}catch(_){}return `<select id="${id}"><option value=""></option>${opts.map(x=>`<option ${String(v)===String(x)?'selected':''}>${esc(x)}</option>`).join('')}</select>`;}const type=a.kieu_du_lieu==='NUMBER'?'number':a.kieu_du_lieu==='DATE'?'date':'text';return `<input id="${id}" type="${type}" value="${esc(v)}" ${a.min_value!==null?`min="${a.min_value}"`:''} ${a.max_value!==null?`max="${a.max_value}"`:''}>`;}
function rangBuocHskt(a){return [a.bat_buoc?'Bắt buộc':'',a.min_value!==null?`min ${a.min_value}`:'',a.max_value!==null?`max ${a.max_value}`:''].filter(Boolean).join(' · ');}
function bangHskt(headers,rows,map){return `<div class="bao-bang"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(x=>`<tr>${map(x).map(v=>`<td>${esc(v??'—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="mo">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;}
async function luuThongSoHskt(){try{const values=hsktData.attributes.map(a=>({definition_id:a.id,value:document.getElementById(`hskt-${a.id}`).value}));await api(`/technical-profiles/devices/${hsktData.overview.id}/attributes`,{method:'PUT',body:{version:hsktData.overview.profile_version,values,complete:true}});bao('Đã lưu hồ sơ kỹ thuật.');await moHskt(hsktData.overview.id,'thong-so');}catch(e){bao(e.message,'loi');}}

function veCayComponentHskt(nodes,depth){if(!nodes.length&&depth===0)return '<div class="trong">Chưa có component. Hãy thêm node gốc đầu tiên.</div>';return nodes.map(n=>`<div style="margin-left:${depth*22}px;border-left:${depth?'2px solid var(--vien)':'0'};padding:6px 0 6px 10px"><div class="hang-cay"><strong class="ma">${esc(n.component_code)}</strong> <span>${esc(n.name)}</span> <span class="mo">v${n.version} · ${esc(n.condition)} · SC ${n.repair_count} · VT ${n.material_count}</span><span style="margin-left:auto"><button onclick="themComponentHskt(${n.id})">+ Con</button> <button onclick="suaComponentHskt(${n.id},${n.version},${n.parent_id||'null'})">Sửa/di chuyển</button> <button onclick="thayComponentHskt(${n.id},${n.version})">Thay thế</button></span></div>${veCayComponentHskt(n.children||[],depth+1)}</div>`).join('');}
async function themComponentHskt(parentId=null){const code=prompt('Mã component');if(!code)return;const name=prompt('Tên component');if(!name)return;try{await api(`/component-tree/devices/${hsktData.overview.id}/nodes`,{method:'POST',body:{parent_id:parentId,component_code:code,name}});await moHskt(hsktData.overview.id,'cau-tao');}catch(e){bao(e.message,'loi');}}
async function suaComponentHskt(id,version,parentId){const name=prompt('Tên mới (để trống nếu không đổi)');const parent=prompt('ID node cha mới; để trống = node gốc',parentId||'');if(name===null||parent===null)return;try{await api(`/component-tree/nodes/${id}`,{method:'PUT',body:{version,name:name||undefined,parent_id:parent?Number(parent):null}});await moHskt(hsktData.overview.id,'cau-tao');}catch(e){bao(e.message,'loi');}}
async function thayComponentHskt(id,version){const code=prompt('Mã component thay thế');if(!code)return;const reason=prompt('Lý do thay thế');if(reason===null)return;try{await api(`/component-tree/nodes/${id}/replace`,{method:'POST',body:{version,component_code:code,reason}});await moHskt(hsktData.overview.id,'cau-tao');}catch(e){bao(e.message,'loi');}}
