const CACHE = 'qlcd-shell-v3';
const SHELL = ['/', '/index.html', '/css/style.css', '/icons/qlcd.svg', '/js/tien-ich.js',
    '/js/kiem-ke-ledger.js', '/js/notifications.js', '/js/app.js'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith('qlcd-shell-') && key !== CACHE)
            .map(key => caches.delete(key))
    )));
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    if (new URL(request.url).pathname.startsWith('/api/')) {
        event.respondWith(fetch(request));
        return;
    }
    event.respondWith(fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('/index.html'))));
});
