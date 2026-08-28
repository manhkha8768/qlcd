/**
 * SO KHỚP ĐỊA CHỈ IP VỚI DẢI MẠNG
 *
 * Hỗ trợ:
 *   - Dải CIDR:        192.168.1.0/24
 *   - Địa chỉ đơn lẻ:  113.161.45.7  (tương đương /32)
 *   - Khoảng:          192.168.1.10-192.168.1.50
 *   - IPv6 cơ bản:     ::1, fe80::/10
 *
 * Địa chỉ IPv4 đi qua Node thường ở dạng ::ffff:192.168.1.1, phải bóc
 * tiền tố ra trước khi so, nếu không mọi phép so đều trượt.
 */

function chuanHoaIp(ip) {
    if (!ip) return '';
    let s = String(ip).trim();
    if (s.startsWith('::ffff:')) s = s.slice(7);   // IPv4 bọc trong IPv6
    if (s.startsWith('[') && s.includes(']')) s = s.slice(1, s.indexOf(']'));
    const cong = s.lastIndexOf(':');
    // Bỏ cổng khỏi dạng 1.2.3.4:5678, nhưng giữ nguyên IPv6 thật
    if (cong > 0 && s.indexOf(':') === cong && s.includes('.')) s = s.slice(0, cong);
    return s.toLowerCase();
}

const laIpv4 = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s);

function sangSo(ip) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some(x => !(x >= 0 && x <= 255))) return null;
    // Dùng phép nhân thay vì dịch bit, tránh tràn số có dấu ở bit thứ 32
    return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
}

/**
 * Kiểm tra một địa chỉ có nằm trong dải không.
 * Trả về true/false, không ném lỗi khi dải khai sai định dạng.
 */
function trongDai(ip, dai) {
    const a = chuanHoaIp(ip);
    const d = String(dai || '').trim().toLowerCase();
    if (!a || !d) return false;

    // Khoảng: 192.168.1.10-192.168.1.50
    if (d.includes('-')) {
        const [dau, cuoi] = d.split('-').map(x => x.trim());
        if (!laIpv4(a) || !laIpv4(dau) || !laIpv4(cuoi)) return false;
        const n = sangSo(a), n1 = sangSo(dau), n2 = sangSo(cuoi);
        return n !== null && n1 !== null && n2 !== null && n >= Math.min(n1, n2) && n <= Math.max(n1, n2);
    }

    // CIDR
    if (d.includes('/')) {
        const [mang, bitStr] = d.split('/');
        const bit = Number(bitStr);
        if (laIpv4(mang)) {
            if (!laIpv4(a) || !Number.isInteger(bit) || bit < 0 || bit > 32) return false;
            if (bit === 0) return true;
            const nA = sangSo(a), nM = sangSo(mang);
            if (nA === null || nM === null) return false;
            // Cùng dải khi phần đầu của hai địa chỉ giống nhau.
            // Chia cho kích thước khối rồi so thương, tránh phép dịch bit
            // vì bit thứ 32 trong JavaScript bị hiểu là dấu âm.
            const kichThuocKhoi = Math.pow(2, 32 - bit);
            return Math.floor(nA / kichThuocKhoi) === Math.floor(nM / kichThuocKhoi);
        }
        // IPv6: so khớp theo tiền tố văn bản, đủ dùng cho fe80::/10 hay 2001:db8::/32
        const tienTo = mang.replace(/::+$/, '');
        return a.startsWith(tienTo);
    }

    // Địa chỉ đơn lẻ
    return a === d;
}

/** Địa chỉ nội bộ của chính máy chủ, luôn cho phép để không tự khóa mình */
function laLoopback(ip) {
    const a = chuanHoaIp(ip);
    return a === '127.0.0.1' || a === '::1' || a.startsWith('127.');
}

/** Kiểm tra định dạng dải mạng trước khi cho lưu */
function daiHopLe(dai) {
    const d = String(dai || '').trim();
    if (!d) return 'Chưa nhập dải mạng';

    if (d.includes('-')) {
        const [a, b] = d.split('-').map(x => x.trim());
        if (!laIpv4(a) || !laIpv4(b)) return 'Khoảng địa chỉ phải có dạng 192.168.1.10-192.168.1.50';
        if (sangSo(a) === null || sangSo(b) === null) return 'Địa chỉ trong khoảng không hợp lệ';
        return null;
    }
    if (d.includes('/')) {
        const [mang, bit] = d.split('/');
        if (laIpv4(mang)) {
            const n = Number(bit);
            if (!(n >= 0 && n <= 32)) return 'Số bit của dải IPv4 phải từ 0 đến 32';
            if (sangSo(mang) === null) return 'Địa chỉ mạng không hợp lệ';
            return null;
        }
        if (mang.includes(':')) return null;
        return 'Dải mạng không hợp lệ. Ví dụ đúng: 192.168.1.0/24';
    }
    if (laIpv4(d) && sangSo(d) !== null) return null;
    if (d.includes(':')) return null;
    return 'Địa chỉ không hợp lệ. Ví dụ đúng: 192.168.1.0/24 hoặc 113.161.45.7';
}

/** Gợi ý dải mạng từ một địa chỉ cụ thể, dùng khi thêm nhanh mạng đang ngồi */
function goiYDai(ip) {
    const a = chuanHoaIp(ip);
    if (!laIpv4(a)) return a;
    const p = a.split('.');
    return `${p[0]}.${p[1]}.${p[2]}.0/24`;
}

/** Mô tả loại mạng của một địa chỉ, giúp người dùng hiểu mình đang ở đâu */
function moTaMang(ip) {
    const a = chuanHoaIp(ip);
    if (laLoopback(a)) return 'Máy chủ nội bộ';
    if (!laIpv4(a)) return 'IPv6';
    if (trongDai(a, '10.0.0.0/8') || trongDai(a, '172.16.0.0/12') || trongDai(a, '192.168.0.0/16')) {
        return 'Mạng nội bộ';
    }
    if (trongDai(a, '100.64.0.0/10')) return 'Mạng nhà mạng (thường là 4G)';
    return 'Internet công cộng';
}

module.exports = { chuanHoaIp, trongDai, laLoopback, daiHopLe, goiYDai, moTaMang, laIpv4 };
