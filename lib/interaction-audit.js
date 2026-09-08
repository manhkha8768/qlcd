const db = require('../db');

function interactionAudit(req, action, table, recordId, details = {}) {
    const user = req.session?.nguoiDung;
    if (!user) return;
    const safe = { ...details, ip: req.ip || null,
        user_agent: String(req.get?.('user-agent') || '').slice(0, 300) || null };
    db.prepare(`INSERT INTO nhat_ky_he_thong
        (nguoi_id,hanh_dong,bang,ban_ghi_id,noi_dung) VALUES (?,?,?,?,?)`)
        .run(user.id, action, table || null, recordId == null ? null : Number(recordId), JSON.stringify(safe));
}

module.exports = { interactionAudit };
