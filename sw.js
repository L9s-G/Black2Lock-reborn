const CACHE_NAME = 'Block2Lock-v2.5.31';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './data.js',
    './game.js',
    './render.js',
    './drag.js',
    './store.js',
    './lvl_base.bin',
    './manifest.json',
    './B2L_192.png',
    './B2L_512.png',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const isLocal = ['localhost', '127.0.0.1'].includes(self.location.hostname);
    if (isLocal) {
        e.respondWith(fetch(e.request));
    } else {
        e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
    }
});
