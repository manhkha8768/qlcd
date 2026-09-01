/* TASK 6 - Kiểm kê Asset Ledger, QR scanner input và offline draft. */
const KK_QUEUE_KEY='qlcd_inventory_offline_v1';let kkSession=null;
function kkQueue(){try{return JSON.parse(localStorage.getItem(KK_QUEUE_KEY)||'[]');}catch(_){return[];}}
function saveKkQueue(rows){localStorage.setItem(KK_QUEUE_KEY,JSON.stringify(rows));}
function kkUuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}

async function mhKiemKeLedger(el){el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">Asset Ledger</div><h2>Kiểm kê & QR</h2></div>
 <button onclick="dongBoKiemKeOffline()">Đồng bộ draft offline</button></div><div id="vung-bao"></div><div class="the"><div id="kk-danh-sach">Đang tải…</div></div>`;
 const sessions=await api('/inventory');const pending=kkQueue().length;document.getElementById('kk-danh-sach').innerHTML=`${pending?`<div class="bao canh-bao">Có ${pending} quan sát đang chờ đồng bộ.</div>`:''}
 <table><thead><tr><th>Mã đợt</th><th>Tên</th><th>Đơn vị</th><th>Trạng thái</th><th>Đã kiểm / Snapshot</th></tr></thead><tbody>${sessions.map(s=>`<tr class="bam" onclick="moKiemKeLedger('${s.id}')"><td class="ma">${esc(s.ma_dot)}</td><td>${esc(s.ten)}</td><td>${esc(s.ma_don_vi)}</td><td>${esc(s.trang_thai)}</td><td>${s.so_da_kiem}/${s.so_snapshot}</td></tr>`).join('')}</tbody></table>`;}

async function moKiemKeLedger(id){const data=await api('/inventory/'+id);kkSession=data.ky;const el=document.getElementById('chinh');el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">${esc(data.ky.ma_dot)}</div><h2>${esc(data.ky.ten)}</h2></div><button onclick="dieuHuong('kiem-ke-ledger')">Quay lại</button></div>
 <div id="vung-bao"></div><div class="the" style="padding:14px"><div class="luoi-form"><div class="o-nhap"><label>Quét/nhập nội dung QR</label><input id="kk-qr" placeholder="QLCD:ASSET:..." autocomplete="off"></div><div class="o-nhap"><label>Số lượng thực tế</label><input id="kk-qty" type="number" min="0" value="1"></div><div class="o-nhap"><label>Tình trạng</label><select id="kk-condition"><option value="tot">Tốt</option><option value="trung_binh">Trung bình</option><option value="kem">Kém</option><option value="hong">Hỏng</option><option value="khong_tim_thay">Không tìm thấy</option></select></div></div>
 <button class="chinh-nut" onclick="luuQuanSatOffline()">Lưu draft trên máy</button> <button onclick="dongBoKiemKeOffline()">Đồng bộ ngay</button></div>
 <div class="the"><div class="bao-bang"><table><thead><tr><th>Mã tài sản</th><th>Tên</th><th>QR payload</th><th>SL sổ</th></tr></thead><tbody>${data.snapshot.map(x=>`<tr><td class="ma">${esc(x.ma_tai_san)}</td><td>${esc(x.ten)}</td><td><code>${esc(x.qr_value)}</code></td><td>${x.so_luong_so} ${esc(x.dvt)}</td></tr>`).join('')}</tbody></table></div></div>`;
 document.getElementById('kk-qr').onkeydown=e=>{if(e.key==='Enter')luuQuanSatOffline();};document.getElementById('kk-qr').focus();}

function luuQuanSatOffline(){if(!kkSession)return;const qr=gt('kk-qr'),qty=Number(gt('kk-qty'));if(!qr||!(qty>=0))return bao('QR hoặc số lượng không hợp lệ','loi');const rows=kkQueue();rows.push({session_id:kkSession.id,batch_id:kkUuid(),observation:{qr_value:qr,so_luong_thuc_te:qty,tinh_trang:gt('kk-condition'),client_updated_at:new Date().toISOString()}});saveKkQueue(rows);document.getElementById('kk-qr').value='';bao('Đã lưu draft trên máy. Có thể tiếp tục khi mất mạng.');}

async function dongBoKiemKeOffline(){const rows=kkQueue();if(!rows.length)return bao('Không có draft chờ đồng bộ.');const remain=[];let synced=0;for(const row of rows){try{await api(`/inventory/${row.session_id}/sync`,{method:'POST',body:{client_batch_id:row.batch_id,device_ref:navigator.userAgent,observations:[row.observation]}});synced++;}catch(e){remain.push(row);}}saveKkQueue(remain);bao(`Đã đồng bộ ${synced}; còn ${remain.length} draft trên máy.`,remain.length?'canh-bao':'tot');}
