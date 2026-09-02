const crypto = require('crypto');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;

function requestContext(req, res, next) {
    const supplied = String(req.get('x-request-id') || '');
    const requestId = /^[A-Za-z0-9._-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
    }
    next();
}

/**
 * Browser CSRF protection which remains compatible with existing API clients.
 * Browsers send Origin and Fetch Metadata; server-to-server and legacy clients
 * which omit both headers continue to work.
 */
function protectCrossSiteRequests(req, res, next) {
    if (!UNSAFE_METHODS.has(req.method) || !req.path.startsWith('/api/')) return next();

    const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') {
        return res.status(403).json({ loi: 'Yêu cầu từ trang bên ngoài đã bị chặn' });
    }

    const origin = req.get('origin');
    if (origin) {
        let parsed;
        try { parsed = new URL(origin); } catch (_) {
            return res.status(403).json({ loi: 'Nguồn gửi yêu cầu không hợp lệ' });
        }
        const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
        const protocol = forwardedProto || req.protocol;
        const allowedOrigin = `${protocol}://${req.get('host')}`;
        if (parsed.origin !== allowedOrigin) {
            return res.status(403).json({ loi: 'Yêu cầu từ trang bên ngoài đã bị chặn' });
        }
    }

    const key = req.get('idempotency-key');
    if (key && !IDEMPOTENCY_KEY.test(key)) {
        return res.status(400).json({ loi: 'Idempotency-Key không hợp lệ' });
    }
    next();
}

module.exports = { requestContext, protectCrossSiteRequests, IDEMPOTENCY_KEY };
