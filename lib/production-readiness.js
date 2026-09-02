const path = require('path');
function auditProductionConfig(env = process.env) {
    const errors = [], warnings = [], secret = String(env.QLCD_SECRET || '');
    if (secret.length < 32 || secret === 'your-secure-random-secret-change-this') errors.push('QLCD_SECRET phải là secret riêng tối thiểu 32 ký tự');
    if (!env.QLCD_DB || env.QLCD_DB === ':memory:') errors.push('QLCD_DB phải trỏ tới volume database bền');
    if (!env.QLCD_UPLOADS && !env.QLCD_UPLOAD) errors.push('QLCD_UPLOAD phải trỏ tới volume file bền');
    if (env.QLCD_UPLOADS && env.QLCD_UPLOAD && path.resolve(env.QLCD_UPLOADS) !== path.resolve(env.QLCD_UPLOAD)) {
        errors.push('QLCD_UPLOAD và QLCD_UPLOADS đang trỏ tới hai thư mục khác nhau');
    }
    if (!env.QLCD_BACKUP_DIR) errors.push('QLCD_BACKUP_DIR phải trỏ tới volume backup tách biệt');
    if (!env.QLCD_PUBLIC_HOST) warnings.push('Nên đặt QLCD_PUBLIC_HOST theo domain production');
    if (env.NODE_ENV !== 'production' || env.QLCD_INTERNET !== '1') errors.push('Production phải bật NODE_ENV=production và QLCD_INTERNET=1');
    return { ready: errors.length === 0, errors, warnings };
}
module.exports = { auditProductionConfig };
