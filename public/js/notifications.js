const NT_STATUS = { OPEN:'Mới', ACKNOWLEDGED:'Đã tiếp nhận', IN_PROGRESS:'Đang xử lý',
    RESOLVED:'Đã xử lý', DISMISSED:'Đã bỏ qua' };
const NT_SEVERITY = { INFO:'Thông tin', WARNING:'Cảnh báo', HIGH:'Cao', CRITICAL:'Khẩn cấp' };

async function mhNotifications(el) {
    const manage = PHIEN && ['admin','cd_cty'].includes(PHIEN.vai_tro);
    el.innerHTML = `<div class="dau-trang"><div><div class="eyebrow">Có người chịu trách nhiệm</div>
        <h2>Thông báo & chất lượng dữ liệu</h2><div class="phu">Một hàng đợi chung để tiếp nhận, phân công, xử lý và escalation.</div></div>
        <div>${manage ? '<button onclick="cauHinhNotificationRules()">Cấu hình rule</button> <button class="chinh-nut" onclick="chayDanhGiaNotifications()">Quét dữ liệu ngay</button>' : ''}</div></div>
        <div id="vung-bao"></div><div id="nt-kpi" class="luoi-4"></div>
        <div class="the"><div class="than-the"><div class="luoi-4">
          <div class="o-nhap"><label>Loại</label><select id="nt-category" onchange="taiNotificationCases()"><option value="">Tất cả</option><option value="NOTIFICATION">Thông báo nghiệp vụ</option><option value="DATA_QUALITY">Chất lượng dữ liệu</option></select></div>
          <div class="o-nhap"><label>Trạng thái</label><select id="nt-status" onchange="taiNotificationCases()"><option value="">Tất cả</option><option value="OPEN">Mới</option><option value="ACKNOWLEDGED">Đã tiếp nhận</option><option value="IN_PROGRESS">Đang xử lý</option><option value="RESOLVED">Đã xử lý</option><option value="DISMISSED">Đã bỏ qua</option></select></div>
          <div class="o-nhap"><label>Mức độ</label><select id="nt-severity" onchange="taiNotificationCases()"><option value="">Tất cả</option><option value="CRITICAL">Khẩn cấp</option><option value="HIGH">Cao</option><option value="WARNING">Cảnh báo</option><option value="INFO">Thông tin</option></select></div>
          <div class="o-nhap"><label>Tìm kiếm</label><input id="nt-q" onkeydown="if(event.key==='Enter')taiNotificationCases()" placeholder="Mã, tiêu đề, nội dung"></div>
        </div><label><input id="nt-mine" type="checkbox" onchange="taiNotificationCases()"> Chỉ việc giao cho tôi</label></div>
        <div id="nt-list" class="trong">Đang tải…</div></div>`;
    await taiNotificationCases();
}

async function taiNotificationCases() {
    const query = new URLSearchParams();
    [['category','nt-category'],['status','nt-status'],['severity','nt-severity'],['q','nt-q']]
        .forEach(([k,id]) => { const v=gt(id); if(v) query.set(k,v); });
    if (document.getElementById('nt-mine')?.checked) query.set('mine','1');
    const [summary, rows] = await Promise.all([api('/notifications/summary'), api('/notifications/cases?'+query)]);
    const kpi = document.getElementById('nt-kpi');
    if (kpi) kpi.innerHTML = `
      <div class="the"><div class="than-the"><div class="phu">Đang mở</div><div class="ma-lon">${summary.open}</div></div></div>
      <div class="the"><div class="than-the"><div class="phu">Giao cho tôi</div><div class="ma-lon">${summary.mine}</div></div></div>
      <div class="the"><div class="than-the"><div class="phu">Cao / khẩn</div><div class="ma-lon">${summary.high+summary.critical}</div></div></div>
      <div class="the"><div class="than-the"><div class="phu">Chất lượng dữ liệu</div><div class="ma-lon">${summary.data_quality}</div></div></div>`;
    const list = document.getElementById('nt-list'); if (!list) return;
    list.innerHTML = `<div class="bao-bang"><table><thead><tr><th>Mức</th><th>Việc cần xử lý</th><th>Đơn vị</th><th>Người phụ trách</th><th>Trạng thái</th><th>Phát hiện</th></tr></thead><tbody>
      ${rows.map(x=>`<tr class="bam" onclick="xemNotificationCase('${x.id}')"><td>${esc(NT_SEVERITY[x.severity]||x.severity)}${x.escalation_level?` · L${x.escalation_level}`:''}</td>
      <td><b>${esc(x.title)}</b><div class="phu">${esc(x.rule_title)} · ${esc(x.details||'')}</div></td><td>${esc(x.unit_code||'Công ty')}</td>
      <td>${esc(x.owner_name||x.owner_role||'Chưa gán')}</td><td>${esc(NT_STATUS[x.status]||x.status)}${x.unread?' · Chưa đọc':''}</td><td>${ngay(x.last_detected_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="trong">Không có mục phù hợp.</td></tr>'}
      </tbody></table></div>`;
}

async function xemNotificationCase(id) {
    const d = await api('/notifications/cases/'+id), x=d.case;
    for (const delivery of d.deliveries.filter(v=>Number(v.recipient_user_id)===Number(PHIEN.id)&&!v.read_at)) {
        await api('/notifications/deliveries/'+delivery.id+'/read',{method:'POST'});
    }
    const mine = Number(x.owner_user_id)===Number(PHIEN.id), manage=['admin','cd_cty'].includes(PHIEN.vai_tro);
    const actions=[{ten:'Đóng',chay:dongHopThoai}];
    if ((mine||manage)&&x.status==='OPEN') actions.push({ten:'Tiếp nhận',chay:()=>thaoTacNotification(x,'acknowledge')});
    if ((mine||manage)&&['OPEN','ACKNOWLEDGED'].includes(x.status)) actions.push({ten:'Bắt đầu xử lý',chay:()=>thaoTacNotification(x,'start')});
    if ((mine||manage)&&['OPEN','ACKNOWLEDGED','IN_PROGRESS'].includes(x.status)) actions.push({ten:'Hoàn tất',lop:'chinh-nut',chay:()=>thaoTacNotification(x,'resolve',true)});
    if (manage&&['OPEN','ACKNOWLEDGED','IN_PROGRESS'].includes(x.status)) {
        actions.push({ten:'Phân công',chay:()=>formPhanCongNotification(x)});
        actions.push({ten:'Escalation',chay:()=>thaoTacNotification(x,'escalate',true)});
        actions.push({ten:'Bỏ qua',lop:'nguy-hiem',chay:()=>thaoTacNotification(x,'dismiss',true)});
    }
    const events=d.events.map(e=>`<tr><td>${esc(e.event_time)}</td><td>${esc(e.event_type)}</td><td>${esc(e.actor_name||'Job hệ thống')}</td><td>${esc(e.reason||'')}</td></tr>`).join('');
    moHopThoai(x.title,`<div class="bien-ten"><div><div class="ma-lon">${esc(NT_SEVERITY[x.severity]||x.severity)}</div><div>${esc(x.rule_title)}</div></div><div class="cot-phai"><div>Version</div><div class="gt">${x.version}</div></div></div>
      <div class="the"><div class="than-the"><p>${esc(x.details||'')}</p><p><b>Trạng thái:</b> ${esc(NT_STATUS[x.status]||x.status)} · <b>Phụ trách:</b> ${esc(x.owner_name||x.owner_role)}</p><p><b>Đối tượng:</b> ${esc(x.entity_type)} / ${esc(x.entity_id)} · <b>Đơn vị:</b> ${esc(x.unit_name||'Công ty')}</p><p><b>Hạn nguồn:</b> ${ngay(x.source_due_at)||'—'} · <b>Số lần phát hiện:</b> ${x.occurrence_count}</p>${x.resolution_note?`<p><b>Kết quả:</b> ${esc(x.resolution_note)}</p>`:''}</div></div>
      <h4>Lịch sử bất biến</h4><div class="bao-bang"><table><thead><tr><th>Thời điểm</th><th>Sự kiện</th><th>Người</th><th>Lý do</th></tr></thead><tbody>${events}</tbody></table></div>`,actions,true);
}

function thaoTacNotification(x, action, reasonRequired=false) {
    if (!reasonRequired) return api(`/notifications/cases/${x.id}/${action}`,{method:'POST',body:{version:x.version}})
        .then(()=>{dongHopThoai();bao('Đã cập nhật thông báo');taiNotificationCases();capNhatChip();}).catch(e=>baoTrongHopThoai(e.message));
    const label=action==='resolve'?'Kết quả xử lý':action==='dismiss'?'Lý do bỏ qua':'Lý do escalation';
    moHopThoai(label,`<div class="o-nhap"><label>${label}</label><textarea id="nt-reason"></textarea></div>`,[
      {ten:'Hủy',chay:()=>xemNotificationCase(x.id)},
      {ten:'Xác nhận',lop:'chinh-nut',chay:async()=>{try{await api(`/notifications/cases/${x.id}/${action}`,{method:'POST',body:{version:x.version,reason:gt('nt-reason')}});dongHopThoai();bao('Đã cập nhật thông báo');await taiNotificationCases();capNhatChip();}catch(e){baoTrongHopThoai(e.message);}}}
    ]);
}

async function formPhanCongNotification(x) {
    const users=await api('/notifications/assignees');
    moHopThoai('Phân công người xử lý',`<div class="o-nhap"><label>Người phụ trách</label><select id="nt-owner">${users.map(u=>`<option value="${u.id}" ${Number(u.id)===Number(x.owner_user_id)?'selected':''}>${esc(u.ho_ten||u.ten_dang_nhap)} · ${esc(tt(u.vai_tro))}</option>`).join('')}</select></div><div class="o-nhap"><label>Lý do</label><textarea id="nt-assign-reason"></textarea></div>`,[
      {ten:'Hủy',chay:()=>xemNotificationCase(x.id)},
      {ten:'Phân công',lop:'chinh-nut',chay:async()=>{try{await api(`/notifications/cases/${x.id}/reassign`,{method:'POST',body:{version:x.version,owner_user_id:Number(gt('nt-owner')),reason:gt('nt-assign-reason')}});dongHopThoai();bao('Đã phân công người xử lý');await taiNotificationCases();}catch(e){baoTrongHopThoai(e.message);}}}
    ]);
}

async function chayDanhGiaNotifications() {
    try { const r=await api('/notifications/evaluate',{method:'POST'}); bao(`Đã quét ${r.findings_seen} phát hiện; tạo ${r.cases_created}, tự đóng ${r.cases_auto_resolved}, escalation ${r.cases_escalated}`); await taiNotificationCases(); capNhatChip(); }
    catch(e){bao(e.message,'loi');}
}

async function cauHinhNotificationRules() {
    const rules=await api('/notifications/rules');
    moHopThoai('Cấu hình rule',`<div class="o-nhap"><label>Lý do thay đổi</label><input id="nt-rule-reason" placeholder="Ví dụ: điều chỉnh SLA theo quy trình đã duyệt"></div><div class="bao-bang"><table><thead><tr><th>Rule</th><th>Loại</th><th>Báo trước (ngày)</th><th>Escalation (giờ)</th><th>Bật</th><th></th></tr></thead><tbody>
      ${rules.map((x,i)=>`<tr><td><b>${esc(x.title)}</b><div class="phu">${esc(x.description)}</div></td><td>${x.category==='DATA_QUALITY'?'Chất lượng dữ liệu':'Thông báo'}</td><td><input id="nt-lead-${i}" type="number" min="0" value="${x.lead_days}" style="width:80px"></td><td><input id="nt-hours-${i}" type="number" min="1" value="${x.escalation_hours}" style="width:80px"></td><td><input id="nt-enabled-${i}" type="checkbox" ${x.enabled?'checked':''}></td><td><button onclick="luuNotificationRule('${x.code}',${x.version},${i})">Lưu</button></td></tr>`).join('')}
      </tbody></table></div>`,[{ten:'Đóng',chay:dongHopThoai}],true);
}
async function luuNotificationRule(code,version,index){try{await api('/notifications/rules/'+code,{method:'PUT',body:{version,lead_days:Number(gt('nt-lead-'+index)),escalation_hours:Number(gt('nt-hours-'+index)),enabled:document.getElementById('nt-enabled-'+index).checked,reason:gt('nt-rule-reason')}});baoTrongHopThoai('Đã lưu rule','tot');setTimeout(cauHinhNotificationRules,400);}catch(e){baoTrongHopThoai(e.message);}}
