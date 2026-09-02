/** Diễn tập phục hồi trong thư mục tạm, không ghi đè database hiện tại. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const service = require('../lib/backup-service');
const db = require('../db');

(async () => {
    let backup = process.argv[2], generatedRoot = null;
    try {
        if (!backup) {
            generatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qlcd-backup-drill-'));
            backup = (await service.createBackup(generatedRoot, { retention: 1 })).folder;
        }
        const result = service.restoreDrill(backup);
        console.log(JSON.stringify({ ok: true, source_backup: path.resolve(backup), ...result }, null, 2));
        db.close();
        if (generatedRoot) fs.rmSync(generatedRoot, { recursive: true, force: true });
        process.exit(0);
    } catch (error) {
        console.error('Diễn tập phục hồi thất bại:', error.message);
        try { db.close(); } catch (_) {}
        if (generatedRoot) try { fs.rmSync(generatedRoot, { recursive: true, force: true }); } catch (_) {}
        process.exit(1);
    }
})();
