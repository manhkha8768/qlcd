/** TASK 2 integration tests: legacy backfill, CRUD, scope, pagination, Excel. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

process.env.QLCD_DB = path.join(os.tmpdir(), `qlcd-asset-${Date.now()}.db`);
const db = require('../db');
const dbDir = path.join(__dirname, '..', 'db');
const migrations = fs.readdirSync(dbDir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
for (const f of migrations.filter(f => !['15-asset-master.sql','16-device-master.sql','17-asset-ledger.sql','18-transfer-handover.sql','19-inventory-ledger-qr.sql','20-technical-profile.sql','21-component-tree.sql','22-document-management.sql','23-material-master.sql','24-stock-ledger.sql'].includes(f))) {
    db.exec(fs.readFileSync(path.join(dbDir, f), 'utf8'));
}

const px1 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('A1','PX Asset 1','san_xuat')").run().lastInsertRowid;
const px2 = db.prepare("INSERT INTO phan_xuong(ma,ten,loai) VALUES('A2','PX Asset 2','san_xuat')").run().lastInsertRowid;
const nhom = db.prepare('SELECT id FROM nhom_thiet_bi LIMIT 1').get().id;
const legacyId = db.prepare(`INSERT INTO thiet_bi
    (ma_tb,ten,nhom_id,ma_tscd,loai_ts,nguyen_gia,gia_tri_con_lai,phan_xuong_id)
    VALUES ('LEGACY.A1.001','Tời legacy',?,'TS-LEGACY-001','TSCD',1000000,600000,?)`)
    .run(nhom, px1).lastInsertRowid;
db.exec(fs.readFileSync(path.join(dbDir, '15-asset-master.sql'), 'utf8'));

db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id)
    VALUES ('asset_admin',?,'Admin Asset','admin',NULL)`).run(bcrypt.hashSync('admin123', 8));
db.prepare(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_hash,ho_ten,vai_tro,phan_xuong_id)
    VALUES ('asset_px',?,'PX Asset','px',?)`).run(bcrypt.hashSync('px12345', 8), px1);

const app = require('../server');
let dat = 0, truot = 0;
function kt(ten, dk) {
    if (dk) { dat++; console.log(`  [ĐẠT]   ${ten}`); }
    else { truot++; console.log(`  [TRƯỢT] ${ten}`); }
}

(async () => {
    console.log('\n===== TEST TASK 2 ASSET MASTER =====');
    const mapped = db.prepare('SELECT * FROM assets WHERE legacy_thiet_bi_id=?').get(legacyId);
    kt('Backfill giữ mapping legacy', mapped?.ma_tai_san === 'TS-LEGACY-001');
    kt('Backfill giữ nguyên giá và giá trị còn lại', mapped?.nguyen_gia === 1000000 && mapped?.gia_tri_con_lai === 600000);

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    async function api(url, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;
        if (options.body && !(options.body instanceof FormData)) {
            headers['content-type'] = 'application/json'; options.body = JSON.stringify(options.body);
        }
        const response = await fetch(base + url, { ...options, headers });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        let body; try { body = await response.json(); } catch (_) { body = null; }
        return { response, body };
    }
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'asset_admin', mat_khau: 'admin123' } });
    let result = await api('/api/tai-san', { method: 'POST', body: {
        ma_tai_san: 'TS-NEW-001', loai_tai_san: 'TSCD', ten: 'Máy biến áp',
        don_vi_id: px1, so_luong: 1, nguyen_gia: 2000000, gia_tri_con_lai: 1500000
    }});
    kt('Tạo Asset Master', result.response.status === 201 && result.body.id);
    const assetId = result.body.id;
    kt('Chặn mã tài sản trùng', (await api('/api/tai-san', { method: 'POST', body: {
        ma_tai_san: 'TS-NEW-001', loai_tai_san: 'TSCD', ten: 'Trùng', don_vi_id: px1
    }})).response.status === 409);

    result = await api('/api/tai-san?loai=TSCD&moi_trang=1&trang=1');
    kt('Danh sách có filter và pagination', result.response.status === 200 && result.body.moi_trang === 1 && result.body.tong >= 2);
    result = await api(`/api/tai-san/${assetId}`, { method: 'PUT', body: { ten: 'Máy biến áp 6kV', version: 1 } });
    kt('Cập nhật optimistic version', result.response.status === 200 && result.body.version === 2);
    kt('Chặn cập nhật stale version', (await api(`/api/tai-san/${assetId}`, {
        method: 'PUT', body: { ten: 'Stale', version: 1 }
    })).response.status === 409);
    kt('Chặn đổi đơn vị trực tiếp', (await api(`/api/tai-san/${assetId}`, {
        method: 'PUT', body: { don_vi_id: px2, version: 2 }
    })).response.status === 400);

    const exported = await fetch(base + '/api/tai-san/export.xlsx', { headers: { cookie } });
    kt('Export Excel Asset Master', exported.status === 200 &&
        exported.headers.get('content-type').includes('spreadsheetml'));

    cookie = '';
    await api('/api/auth/dang-nhap', { method: 'POST', body: { ten_dang_nhap: 'asset_px', mat_khau: 'px12345' } });
    kt('Data scope chặn tạo tài sản đơn vị khác', (await api('/api/tai-san', { method: 'POST', body: {
        loai_tai_san: 'CCDC', ten: 'Ngoài scope', don_vi_id: px2
    }})).response.status === 403);
    result = await api('/api/tai-san');
    kt('PX chỉ thấy tài sản đúng scope', result.response.status === 200 &&
        result.body.danh_sach.every(x => Number(x.don_vi_id) === Number(px1)));

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Assets');
    ws.addRow(['ma_tai_san','loai_tai_san','ten','ma_don_vi']);
    ws.addRow(['CCDC-001','CCDC','Máy khoan cầm tay','A1']);
    const form = new FormData(); form.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'assets.xlsx');
    result = await api('/api/tai-san/import', { method: 'POST', body: form });
    kt('Import Excel trong scope', result.response.status === 200 && result.body.da_nhap === 1);

    server.close();
    console.log(`===== KẾT QUẢ: ${dat} đạt / ${truot} trượt / ${dat + truot} test =====`);
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(truot ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
