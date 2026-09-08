async function mhWorkInbox(el) {
    const route=THAM_SO_MAN_HINH||{},params=new URLSearchParams({q:route.q||'',type:route.type||'',page:route.page||1,size:30});
    const d = await api('/work-inbox?'+params);
    const card = x => `<article class="work-card ${['URGENT','STOP_PRODUCTION'].includes(x.priority)?'urgent':''}">
        <div><div class="eyebrow">${esc(x.item_type==='TECHNICAL_WORK_ORDER'?'Công việc kỹ thuật':'Giao dịch tài sản')}</div>
        <strong class="ma">${esc(x.code)}</strong>${x.overdue?'<span class="chip-so">Quá 3 ngày</span>':''}<p>${esc(x.title||'Không có mô tả')}</p>
        <div class="mo">${esc(x.reference||'')} · ${esc(x.unit_name||'')} · ${esc(x.created_at||'')}</div></div>
        <div class="work-actions">${x.action_kind==='technical'?`
            <button onclick="xemCongViecKyThuat('${x.id}')">Chi tiết</button>
            ${d.capabilities.review_technical&&x.status==='SUBMITTED'?`<button onclick="inboxTechnical('${x.id}','return',${x.version})">Chuyển lại</button><button class="nguy-hiem" onclick="inboxTechnical('${x.id}','reject',${x.version})">Từ chối</button><button class="chinh-nut" onclick="inboxTechnical('${x.id}','approve',${x.version})">Duyệt</button>`:''}`:
            `<button class="chinh-nut" onclick="xemGD('${x.id}')">Mở và xử lý</button>`}</div></article>`;
    el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">Work Inbox</div><h2>Việc của tôi & Phê duyệt</h2>
        <div class="phu">Một hàng đợi theo quyền và phạm vi đơn vị hiện tại</div></div><button onclick="mhWorkInbox(document.getElementById('chinh'))">Làm mới</button></div>
        <div id="vung-bao"></div><div class="thanh-loc"><input id="inbox-q" class="lon" placeholder="Tìm mã, nội dung, thiết bị, đơn vị…" value="${esc(route.q||'')}"><select id="inbox-type"><option value="">Mọi loại việc</option><option value="TECHNICAL_WORK_ORDER">Work Order</option><option value="ASSET_TRANSACTION">Giao dịch tài sản</option></select><button onclick="locWorkInbox()">Lọc</button></div>
        <div class="luoi-so"><div class="o-so"><div class="nhan">Chờ tôi duyệt</div><div class="gt">${d.summary.approvals}</div></div>
        <div class="o-so ${d.summary.urgent?'nguy':''}"><div class="nhan">Khẩn cấp</div><div class="gt">${d.summary.urgent}</div></div>
        <div class="o-so"><div class="nhan">Tôi đang theo dõi</div><div class="gt">${d.summary.mine}</div></div></div>
        <div class="the"><h3>Chờ phê duyệt</h3><div class="work-list">${d.approvals.map(card).join('')||'<div class="trong">Không có việc chờ duyệt.</div>'}</div></div>
        <div class="the"><h3>Công việc tôi đã lập đang mở</h3><div class="work-list">${d.mine.map(card).join('')||'<div class="trong">Không có công việc đang mở.</div>'}</div></div>
        ${(d.totals.approvals>d.size||d.totals.mine>d.size)?`<div class="phan-trang"><button ${d.page<=1?'disabled':''} onclick="trangWorkInbox(${d.page-1})">Trước</button><span>Trang ${d.page}</span><button ${Math.max(d.totals.approvals,d.totals.mine)<=d.page*d.size?'disabled':''} onclick="trangWorkInbox(${d.page+1})">Sau</button></div>`:''}`;
    document.getElementById('inbox-type').value=route.type||'';document.getElementById('inbox-q').onkeydown=e=>{if(e.key==='Enter')locWorkInbox();};
}
function locWorkInbox(){dieuHuong('work-inbox',{q:gt('inbox-q'),type:gt('inbox-type'),page:1},{thayThe:true});}
function trangWorkInbox(page){dieuHuong('work-inbox',{...(THAM_SO_MAN_HINH||{}),page},{thayThe:true});}
async function inboxTechnical(id, action, version) {
    const reason = prompt(action==='approve'?'Ý kiến duyệt':'Lý do xử lý'); if (!reason) return;
    try { await api(`/technical-operations/work-orders/${id}/${action}`, {method:'POST',body:{version,reason}});
        bao('Đã xử lý công việc.'); await mhWorkInbox(document.getElementById('chinh')); capNhatChip();
    } catch (e) { bao(e.message,'loi'); }
}
