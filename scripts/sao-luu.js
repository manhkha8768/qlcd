/** Tạo backup có manifest/checksum và xác minh ngay sau khi tạo. */
const path = require('path');
const service = require('../lib/backup-service');
const db = require('../db');

const destination = process.argv[2] || process.env.QLCD_BACKUP_DIR || path.join(__dirname, '..', 'sao-luu');
const retention = Number(process.env.QLCD_BACKUP_RETENTION || 30);

(async () => {
    try {
        const result = await service.createBackup(destination, { retention });
        const verified = service.verifyBackup(result.folder);
        console.log(JSON.stringify({ ok: true, backup: result.folder, ...verified }, null, 2));
        db.close(); process.exit(0);
    } catch (error) {
        console.error('Lỗi sao lưu:', error.message);
        try { db.close(); } catch (_) {}
        process.exit(1);
    }
})();
