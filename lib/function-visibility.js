const db = require('../db');

const SCREEN_PERMISSION = Object.freeze({
    'thiet-bi': 'thietbi.xem', 'tai-san': 'thietbi.xem', 'qr-scan': 'thietbi.xem',
    'kiem-ke-ledger': 'kiemke.xem', 'nhap-lieu': 'thietbi.them',
    'tang-ts': 'giaodich.lap', 'giam-ts': 'giaodich.lap', 'dieu-chuyen': 'giaodich.lap',
    'phe-duyet': 'giaodich.duyet', 'sua-chua': 'baoduong.xem',
    'kiem-dinh': 'kiemdinh.xem', 'ncvt': 'ncvt.xem', 'ncvt-canonical': 'ncvt.xem',
    'material-master': 'kho.xem', 'stock-ledger': 'kho.xem', 'su-co': 'suco.xem',
    'phu-tung': 'kythuat.xem', 'ho-so-ky-thuat': 'kythuat.xem', 'reports': 'baocao.xem'
});

const ALWAYS = new Set(['tong-quan', 'canh-bao', 'notifications', 'work-inbox', 'repair-minutes']);

function effectiveScreens(user, permissions) {
    const permissionSet = new Set(permissions || []);
    const configured = new Map(db.prepare(
        'SELECT screen_code, enabled FROM function_visibility WHERE role_code=?'
    ).all(user.vai_tro).map(x => [x.screen_code, !!x.enabled]));
    const result = {};
    for (const screen of new Set([...ALWAYS, ...Object.keys(SCREEN_PERMISSION), ...configured.keys()])) {
        const permitted = user.vai_tro === 'admin' || ALWAYS.has(screen) || permissionSet.has(SCREEN_PERMISSION[screen]);
        result[screen] = permitted && (configured.has(screen) ? configured.get(screen) : true);
    }
    result['quan-tri'] = user.vai_tro === 'admin';
    result['bao-mat'] = user.vai_tro === 'admin';
    return result;
}

module.exports = { SCREEN_PERMISSION, effectiveScreens };
