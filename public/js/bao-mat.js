/* =====================================================================
   QUẢN TRỊ BẢO MẬT
   Dải mạng truy cập, phiên đăng nhập, nhật ký dò mật khẩu.
   ===================================================================== */

const LOAI_MANG = {
    noi_bo: 'Mạng nội bộ', phan_xuong: 'Mạng phân xưởng',
    vpn: 'VPN', di_dong: 'Mạng di động', khac: 'Khác'
};

async function mhBaoMat(el) {
    el.innerHTML = `<div class="dau-trang"><div>
            <div class="eyebrow">Hệ thống</div><h2>Bảo mật truy cập</h2>
            <div class="phu">Kiểm soát mạng nào vào được hệ thống, ai đang đăng nhập,
                và có ai đang dò mật khẩu không</div></div></div>
        <div id="vung-bao"></div><div id="noi-dung">Đang tải…</div>`;
    if (!window.DS_PX) window.DS_PX = await api('/danh-muc/phan-xuong');
    await veBaoMat();
}

async function veBaoMat() {
    const el = document.getElementById('noi-dung');
    if (!el) return;

    const [toi, dai, phien, sai, chan, mayChu] = await Promise.all([
        api('/mang/toi'),
        api('/mang/dai').catch(() => ({ dang_bat: false, danh_sach: [] })),
        api('/auth/phien').catch(() => []),
        api('/auth/dang-nhap-sai').catch(() => []),
        api('/mang/bi-chan').catch(() => []),
        api('/mang/may-chu').catch(() => null)
    ]);

    const o = (n, v, g = '', lop = '') => `<div class="o-so ${lop}"><div class="nhan">${n}</div>
        <div class="gt" style="font-size:17px">${v}</div><div class="ghi">${g || '&nbsp;'}</div></div>`;

    let h = `
    <div class="luoi-so">
        ${o('Kết nối của bạn', esc(toi.dia_chi_cua_ban), esc(toi.loai_mang))}
        ${o('Lọc dải mạng', toi.loc_dang_bat ? 'Đang bật' : 'Đang tắt',
            toi.loc_dang_bat ? `${dai.danh_sach.filter(x => x.hoat_dong && x.cho_phep).length} dải được phép`
                             : 'mọi mạng đều vào được',
            toi.loc_dang_bat ? 'tot' : 'canh-bao')}
        ${o('Đang đăng nhập', phien.length, 'phiên đang mở')}
        ${o('Đăng nhập sai', sai.length, '30 ngày gần đây', sai.length > 20 ? 'nguy' : '')}
    </div>`;

    /* ---- Dải mạng ---- */
    h += `<div class="the">
        <h3>Dải mạng được phép truy cập</h3>
        <div class="than-the" style="padding-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="chinh-nut" onclick="formDaiMang()">Thêm dải mạng</button>
            <button onclick="themNhanhDaiCuaToi('${esc(toi.goi_y_dai)}')">Thêm dải đang dùng (${esc(toi.goi_y_dai)})</button>
            <button class="${toi.loc_dang_bat ? 'nguy-hiem' : 'nhan-manh'}"
                    onclick="doiLocDaiMang(${toi.loc_dang_bat ? 0 : 1})">
                ${toi.loc_dang_bat ? 'Tắt lọc' : 'Bật lọc'}</button>
        </div>`;

    if (!toi.loc_dang_bat) {
        h += `<div class="than-the" style="padding-top:0"><div class="bao nhac">
            Lọc đang tắt: bất kỳ ai biết địa chỉ hệ thống đều vào được trang đăng nhập.
            Khi hệ thống đã ra internet, nên khai đủ dải mạng của Công ty rồi bật lọc.</div></div>`;
    }

    h += `<div class="bao-bang"><table>
        <thead><tr><th>Dải mạng</th><th>Tên gọi</th><th>Loại</th><th>PX</th>
            <th class="giua">Trạng thái</th><th>Truy cập gần nhất</th>
            <th class="phai">Lượt</th><th></th></tr></thead>
        <tbody>${dai.danh_sach.length ? dai.danh_sach.map(d => `<tr ${!d.hoat_dong ? 'style="opacity:.5"' : ''}>
            <td class="ma"><strong>${esc(d.dai)}</strong></td>
            <td>${esc(d.ten)}${d.ghi_chu ? `<div style="font-size:11.5px;color:var(--chu-mo)">${esc(d.ghi_chu)}</div>` : ''}</td>
            <td style="font-size:12.5px">${LOAI_MANG[d.loai] || d.loai}</td>
            <td>${esc(d.px || '')}</td>
            <td class="giua">${d.cho_phep
                ? '<span class="nhan-tt tt-da_duyet">Cho phép</span>'
                : '<span class="nhan-tt tt-qua_han">Chặn</span>'}
                ${!d.hoat_dong ? '<div><span class="nhan-tt tt-nhap">Ngừng</span></div>' : ''}</td>
            <td style="font-size:12px">${esc(d.lan_truy_cap_cuoi || '')}</td>
            <td class="phai so">${d.so_lan_truy_cap || ''}</td>
            <td class="phai" style="white-space:nowrap">
                <button class="nho" onclick='formDaiMang(${JSON.stringify(d).replace(/'/g, "&#39;")})'>Sửa</button>
                <button class="nho nguy-hiem" onclick="xoaDaiMang(${d.id},'${esc(d.dai)}')">Xóa</button></td>
        </tr>`).join('') : `<tr><td colspan="8" class="trong">
            Chưa khai báo dải mạng nào. Khi chưa có dải nào, hệ thống cho phép mọi nơi truy cập.</td></tr>`}
        </tbody></table></div>
        <div class="than-the ghi-nho">
            Cách khai: <span class="ma">192.168.1.0/24</span> cả một mạng ·
            <span class="ma">113.161.45.7</span> một địa chỉ ·
            <span class="ma">192.168.1.10-192.168.1.50</span> một khoảng.
            Dải đặt là "Chặn" luôn thắng dải "Cho phép", dùng để cấm riêng một máy.
        </div>
    </div>`;

    /* ---- Phiên đăng nhập ---- */
    h += `<div class="the"><h3>Đang đăng nhập</h3><div class="bao-bang"><table>
        <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Địa chỉ IP</th>
            <th>Đăng nhập lúc</th><th>Hết hạn</th><th></th></tr></thead>
        <tbody>${phien.length ? phien.map(p => `<tr>
            <td class="ma">${esc(p.ten_dang_nhap || '')}</td>
            <td>${esc(p.ho_ten || '')}</td>
            <td style="font-size:12.5px">${tt(p.vai_tro)}</td>
            <td class="ma">${esc(p.dia_chi_ip || '')}</td>
            <td style="font-size:12px">${esc(p.ngay_tao || '')}</td>
            <td style="font-size:12px">${esc(p.het_han || '')}</td>
            <td class="phai">${p.nguoi_dung_id && p.nguoi_dung_id !== window.PHIEN.id
                ? `<button class="nho nguy-hiem"
                     onclick="catPhien(${p.nguoi_dung_id},'${esc(p.ten_dang_nhap || '')}')">Cắt phiên</button>`
                : '<span style="font-size:12px;color:var(--chu-mo)">phiên của bạn</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="trong">Không có phiên nào đang mở.</td></tr>'}
        </tbody></table></div>
        <div class="than-the ghi-nho">Cắt phiên dùng khi nhân viên mất máy, nghỉ việc,
            hoặc nghi có người dùng trộm tài khoản. Người bị cắt mất quyền truy cập ngay.</div>
    </div>`;

    /* ---- Đăng nhập sai ---- */
    h += `<div class="the"><h3>Đăng nhập sai gần đây</h3><div class="bao-bang"><table>
        <thead><tr><th>Tài khoản bị thử</th><th>Địa chỉ IP</th><th>Thời điểm</th></tr></thead>
        <tbody>${sai.length ? sai.slice(0, 40).map(x => `<tr>
            <td class="ma">${esc(x.ten_dang_nhap || '')}</td>
            <td class="ma">${esc(x.dia_chi_ip || '')}</td>
            <td style="font-size:12px">${esc(x.thoi_gian)}</td></tr>`).join('')
            : '<tr><td colspan="3" class="trong">Chưa ghi nhận lần đăng nhập sai nào.</td></tr>'}
        </tbody></table></div>
        ${sai.length > 40 ? `<div class="than-the ghi-nho">Hiện 40 lần gần nhất trong tổng ${sai.length}.</div>` : ''}
    </div>`;

    /* ---- Bị chặn theo dải mạng ---- */
    if (chan.length) {
        h += `<div class="the"><h3>Truy cập bị chặn theo dải mạng</h3><div class="bao-bang"><table>
            <thead><tr><th>Địa chỉ IP</th><th class="phai">Số lượt</th>
                <th>Lần đầu</th><th>Lần cuối</th><th></th></tr></thead>
            <tbody>${chan.map(x => `<tr>
                <td class="ma">${esc(x.dia_chi_ip)}</td>
                <td class="phai so">${x.so_lan}</td>
                <td style="font-size:12px">${esc(x.lan_dau)}</td>
                <td style="font-size:12px">${esc(x.lan_cuoi)}</td>
                <td class="phai"><button class="nho"
                    onclick="formDaiMang(null,'${esc(x.dia_chi_ip)}')">Cho phép dải này</button></td>
            </tr>`).join('')}</tbody></table></div>
            <div class="than-the ghi-nho">Nếu đây là mạng của Công ty thì thêm dải cho phép.
                Nếu là địa chỉ lạ gõ cửa nhiều lần thì để nguyên, hệ thống đã chặn.</div>
        </div>`;
    }

    /* ---- Thông tin máy chủ ---- */
    if (mayChu) {
        h += `<div class="the"><h3>Máy chủ</h3><div class="than-the">
            <table>
                <tr><td style="color:var(--chu-nhat);width:200px">Địa chỉ lắng nghe</td>
                    <td class="ma">${esc(mayChu.dia_chi_lang_nghe)}:${mayChu.cong}</td></tr>
                <tr><td style="color:var(--chu-nhat)">Giao thức bạn đang dùng</td>
                    <td class="ma">${esc(toi.giao_thuc)}</td></tr>
            </table>
            <div class="bao ${mayChu.dia_chi_lang_nghe === '0.0.0.0' ? 'tin' : 'nhac'}" style="margin-top:10px">
                ${esc(mayChu.ghi_chu)}</div>
            ${mayChu.card_mang.length ? `<div class="bao-bang" style="margin-top:10px"><table>
                <thead><tr><th>Card mạng</th><th>Địa chỉ</th><th>Họ</th><th>Dải gợi ý</th></tr></thead>
                <tbody>${mayChu.card_mang.map(c => `<tr>
                    <td>${esc(c.card)}</td><td class="ma">${esc(c.dia_chi)}</td>
                    <td>${esc(c.ho)}</td><td class="ma">${esc(c.dai_goi_y || '')}</td></tr>`).join('')}
                </tbody></table></div>` : ''}
        </div></div>`;
    }

    el.innerHTML = h;
}

/* ---------- Thao tác dải mạng ---------- */
function formDaiMang(d = null, goiYTu = null) {
    const pxs = window.DS_PX || [];
    const dai = d?.dai || (goiYTu ? goiYTu.split('.').slice(0, 3).join('.') + '.0/24' : '');

    moHopThoai(d ? 'Sửa dải mạng' : 'Thêm dải mạng', `
        <div class="hang">
            <div class="o-nhap"><label>Dải mạng *</label>
                <input id="dm-dai" value="${esc(dai)}" placeholder="192.168.1.0/24"></div>
            <div class="o-nhap"><label>Loại</label><select id="dm-loai">
                ${Object.entries(LOAI_MANG).map(([k, v]) =>
                    `<option value="${k}" ${d?.loai === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="o-nhap"><label>Tên gọi *</label>
            <input id="dm-ten" value="${esc(d?.ten || '')}" placeholder="Mạng văn phòng Công ty"></div>
        <div class="hang">
            <div class="o-nhap"><label>Thuộc phân xưởng</label><select id="dm-px">
                <option value="">— Không gắn —</option>
                ${pxs.map(p => `<option value="${p.id}" ${d?.phan_xuong_id === p.id ? 'selected' : ''}>
                    ${esc(p.ten_ngan || p.ma)} — ${esc(p.ten)}</option>`).join('')}
            </select></div>
            <div class="o-nhap"><label>Tác dụng</label><select id="dm-cp">
                <option value="1" ${d?.cho_phep !== 0 ? 'selected' : ''}>Cho phép truy cập</option>
                <option value="0" ${d?.cho_phep === 0 ? 'selected' : ''}>Chặn truy cập</option>
            </select></div>
        </div>
        <div class="o-nhap"><label>Ghi chú</label><input id="dm-gc" value="${esc(d?.ghi_chu || '')}"></div>
        <div class="ghi-nho">
            <strong>192.168.1.0/24</strong> — cả mạng, 254 máy<br>
            <strong>113.161.45.7</strong> — đúng một địa chỉ<br>
            <strong>192.168.1.10-192.168.1.50</strong> — một khoảng địa chỉ<br>
            Lưu ý: mạng cáp quang gia đình và 4G thường đổi địa chỉ, nên khai cả dải
            thay vì một địa chỉ cụ thể.
        </div>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: d ? 'Lưu' : 'Thêm', lop: 'chinh-nut', chay: async () => {
            const body = {
                dai: gt('dm-dai'), ten: gt('dm-ten'), loai: gt('dm-loai'),
                phan_xuong_id: gt('dm-px') ? Number(gt('dm-px')) : null,
                cho_phep: gt('dm-cp') === '1' ? 1 : 0, ghi_chu: gt('dm-gc') || null
            };
            if (!body.dai) return baoTrongHopThoai('Nhập dải mạng');
            if (!body.ten) return baoTrongHopThoai('Đặt tên cho dải mạng');
            try {
                if (d) await api('/mang/dai/' + d.id, { method: 'PUT', body });
                else await api('/mang/dai', { method: 'POST', body });
                dongHopThoai(); bao('Đã lưu dải mạng'); veBaoMat();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }], true);
}

async function themNhanhDaiCuaToi(goiY) {
    formDaiMang(null, goiY.replace('/24', ''));
    const o = document.getElementById('dm-dai');
    if (o) o.value = goiY;
    const t = document.getElementById('dm-ten');
    if (t) { t.value = 'Mạng đang dùng'; t.focus(); t.select(); }
}

async function xoaDaiMang(id, dai) {
    if (!confirm(`Xóa dải mạng ${dai}?\n\nNếu lọc đang bật, các máy trong dải này sẽ không vào được hệ thống nữa.`)) return;
    try { await api('/mang/dai/' + id, { method: 'DELETE' }); bao('Đã xóa dải mạng'); veBaoMat(); }
    catch (e) { bao(e.message, 'loi'); }
}

function doiLocDaiMang(bat) {
    if (!bat) {
        moHopThoai('Tắt lọc dải mạng', `
            <div class="bao nhac">Sau khi tắt, mọi mạng đều vào được trang đăng nhập.
            Hệ thống vẫn còn các lớp bảo vệ khác: mật khẩu, khóa khi dò mật khẩu, phân quyền.</div>`,
            [{ ten: 'Không tắt', chay: dongHopThoai },
             { ten: 'Tắt lọc', lop: 'nguy-hiem', chay: async () => {
                try {
                    await api('/mang/loc', { method: 'POST', body: { bat: 0 } });
                    dongHopThoai(); bao('Đã tắt lọc dải mạng', 'nhac'); veBaoMat();
                } catch (e) { baoTrongHopThoai(e.message); }
             } }]);
        return;
    }

    moHopThoai('Bật lọc dải mạng', `
        <div class="bao nhac">Sau khi bật, <strong>chỉ các dải mạng đã khai báo mới vào được</strong>
        hệ thống. Máy ở mạng khác sẽ bị chặn ngay từ cổng, chưa tới được trang đăng nhập.</div>
        <p style="font-size:13px;color:var(--chu-nhat)">
        Hệ thống sẽ từ chối bật nếu địa chỉ của chính bạn không nằm trong dải nào đã khai,
        để bạn không tự khóa mình ra ngoài.</p>
        <p style="font-size:13px;color:var(--chu-nhat)">
        Nếu lỡ bị khóa, chạy trên máy chủ:<br>
        <span class="ma">QLCD_BO_QUA_DAI_MANG=1 npm start</span></p>`,
        [{ ten: 'Hủy', chay: dongHopThoai },
         { ten: 'Bật lọc', lop: 'nhan-manh', chay: async () => {
            try {
                await api('/mang/loc', { method: 'POST', body: { bat: 1 } });
                dongHopThoai(); bao('Đã bật lọc dải mạng'); veBaoMat();
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}

async function catPhien(nguoiDungId, ten) {
    if (!confirm(`Cắt phiên đăng nhập của "${ten}"?\n\nNgười này sẽ bị đăng xuất ngay lập tức.`)) return;
    try {
        const kq = await api('/auth/phien/cat/' + nguoiDungId, { method: 'POST' });
        bao(`Đã cắt ${kq.so_phien_da_cat} phiên của ${ten}`);
        veBaoMat();
    } catch (e) { bao(e.message, 'loi'); }
}

/* =========================== ĐỔI MẬT KHẨU =========================== */
function formDoiMatKhau(batBuoc = false) {
    moHopThoai(batBuoc ? 'Bắt buộc đổi mật khẩu' : 'Đổi mật khẩu', `
        ${batBuoc ? `<div class="bao nhac">Tài khoản của bạn đang dùng mật khẩu khởi tạo.
            Phải đổi trước khi tiếp tục sử dụng hệ thống.</div>` : ''}
        <div class="o-nhap"><label>Mật khẩu hiện tại *</label>
            <input id="mk-cu" type="password" autocomplete="current-password"></div>
        <div class="o-nhap"><label>Mật khẩu mới *</label>
            <input id="mk-moi" type="password" minlength="8" maxlength="128"
                autocomplete="new-password" oninput="capNhatLoiMatKhau('mk-moi','mk-moi-loi')">
            <div id="mk-moi-loi" class="loi-truong" aria-live="polite"></div></div>
        <div class="o-nhap"><label>Nhập lại mật khẩu mới *</label>
            <input id="mk-lai" type="password" minlength="8" maxlength="128" autocomplete="new-password"></div>
        <div class="ghi-nho">Mật khẩu phải có độ dài từ 8 đến 128 ký tự. Nên dùng mật khẩu dài, dễ nhớ với mình nhưng khó đoán với người khác.
            Không dùng lại mật khẩu của email hay tài khoản khác.</div>`,
        [...(batBuoc ? [] : [{ ten: 'Hủy', chay: dongHopThoai }]),
         { ten: 'Đổi mật khẩu', lop: 'chinh-nut', chay: async () => {
            if (!gt('mk-cu')) return baoTrongHopThoai('Nhập mật khẩu hiện tại');
            const matKhauMoi = document.getElementById('mk-moi').value;
            const matKhauLai = document.getElementById('mk-lai').value;
            const loiMatKhau = capNhatLoiMatKhau('mk-moi', 'mk-moi-loi');
            if (loiMatKhau) return baoTrongHopThoai(loiMatKhau);
            if (matKhauMoi !== matKhauLai) return baoTrongHopThoai('Hai lần nhập mật khẩu mới không khớp');
            try {
                await api('/auth/doi-mat-khau', { method: 'POST',
                    body: { mat_khau_cu: document.getElementById('mk-cu').value, mat_khau_moi: matKhauMoi } });
                dongHopThoai(); bao('Đã đổi mật khẩu');
            } catch (e) { baoTrongHopThoai(e.message); }
         } }]);
}
