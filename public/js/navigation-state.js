(function khoiTaoNavigation(root, factory) {
    const navigation = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = navigation;
    if (root) root.QLCDNavigation = navigation;
})(typeof window !== 'undefined' ? window : globalThis, function taoNavigation() {
    const PARAM_ORDER = ['don_vi_id', 'loai', 'nhom', 'trang_thai', 'q', 'trang', 'asset_id', 'device_id', 'tab'];

    function cleanParams(params = {}) {
        const clean = {};
        for (const key of PARAM_ORDER) {
            const value = params[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') clean[key] = String(value);
        }
        return clean;
    }

    function buildHash(screen, params = {}) {
        const query = new URLSearchParams(cleanParams(params)).toString();
        return `#${screen}${query ? `?${query}` : ''}`;
    }

    function parseHash(hash, validScreens = []) {
        const raw = String(hash || '').replace(/^#/, '');
        const splitAt = raw.indexOf('?');
        const requestedScreen = (splitAt >= 0 ? raw.slice(0, splitAt) : raw) || 'tong-quan';
        const screen = validScreens.includes(requestedScreen) ? requestedScreen : 'tong-quan';
        const query = splitAt >= 0 ? raw.slice(splitAt + 1) : '';
        const params = cleanParams(Object.fromEntries(new URLSearchParams(query)));
        return { screen, params };
    }

    return { buildHash, parseHash, cleanParams };
});
