const path = require('path');
const { createUatStaging } = require('../lib/uat-staging');

function value(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

(async () => {
    const sourceDb = value('--source') || process.env.QLCD_UAT_SOURCE_DB;
    const targetDb = value('--target') || process.env.QLCD_UAT_DB;
    if (!sourceDb || !targetDb) throw new Error('Bắt buộc truyền --source và --target (hoặc QLCD_UAT_SOURCE_DB/QLCD_UAT_DB)');
    const result = await createUatStaging({
        sourceDb: path.resolve(sourceDb), targetDb: path.resolve(targetDb),
        password: process.env.QLCD_UAT_PASSWORD,
        unitIds: String(value('--units') || '').split(',').filter(Boolean),
        allowSynthetic: process.argv.includes('--allow-synthetic')
    });
    console.log(JSON.stringify({ ok: true, staging_db: result.targetDb,
        manifest: result.manifestPath, selected_unit_ids: result.manifest.selected_unit_ids,
        accounts: result.manifest.users.map(user => ({ username: user.username, role: user.role, unit_id: user.unit_id })) }, null, 2));
})().catch(error => { console.error(`Không thể tạo staging UAT: ${error.message}`); process.exit(1); });
