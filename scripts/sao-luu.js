/**
 * Sao lưu database và tệp đính kèm.
 *   node scripts/sao-luu.js [thư-mục-đích]
 *
 * Dùng lệnh backup của SQLite nên sao lưu được cả khi hệ thống đang chạy,
 * không cần dừng dịch vụ và không lo chép phải file đang ghi dở.
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');

const dich = process.argv[2] || path.join(__dirname, '..', 'sao-luu');
const dau = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const thuMuc = path.join(dich, 'qlcd-' + dau);
fs.mkdirSync(thuMuc, { recursive: true });

const fileDb = path.join(thuMuc, 'qlcd.db');
db.backup(fileDb).then(() => {
    const kich = (fs.statSync(fileDb).size / 1048576).toFixed(2);
    console.log(`  Database: ${fileDb} (${kich} MB)`);

    const nguon = process.env.QLCD_UPLOAD || path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(nguon)) {
        const dichUp = path.join(thuMuc, 'uploads');
        fs.cpSync(nguon, dichUp, { recursive: true });
        const dem = (d) => fs.readdirSync(d, { withFileTypes: true })
            .reduce((t, e) => t + (e.isDirectory() ? dem(path.join(d, e.name)) : 1), 0);
        console.log(`  Tệp đính kèm: ${dichUp} (${dem(dichUp)} tệp)`);
    }

    // Giữ 30 bản gần nhất, xóa bản cũ hơn
    const ds = fs.readdirSync(dich).filter(x => x.startsWith('qlcd-')).sort();
    ds.slice(0, Math.max(0, ds.length - 30)).forEach(x => {
        fs.rmSync(path.join(dich, x), { recursive: true, force: true });
        console.log(`  Đã xóa bản sao lưu cũ: ${x}`);
    });

    console.log(`\n  Xong. Sao lưu tại: ${thuMuc}\n`);
}).catch(e => {
    console.error('  Lỗi sao lưu:', e.message);
    process.exit(1);
});
