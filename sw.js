const CACHE = 'produce-cvp-v10';
const ASSETS = [
  './','./index.html','./styles.css','./app-1.js','./app-2.js','./app-3.js','./app-4.js','./app-5.js','./app-6.js','./data/produce-meta.js','./data/produce-1.js','./data/produce-2.js','./data/produce-3.js','./data/produce-4.js','./data/barcodes.js','./data/produce-i18n.js','./data/packaged-products.js','./manifest.webmanifest',
  './assets/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network first so a deployed update appears quickly, cache fallback for offline use.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Static assets: cache first for speed/offline, refresh in background.
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
