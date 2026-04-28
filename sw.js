// CNT Core · Service Worker v1
// ⚠️  IMPORTANTE: Incrementar CACHE_NAME al actualizar cnt.html
//     Ejemplo: 'cnt-core-v3', 'cnt-core-v4', etc.
//     Esto fuerza que los usuarios descarguen la nueva versión.
const CACHE_NAME = 'cnt-core-v5';
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://fonts.gstatic.com',
];
const SHELL_ASSETS = [
  './cnt.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './README.md',
  './README.en.md',
];

// Install: pre-cache the app shell and external libs
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache shell assets (must succeed)
      cache.addAll(SHELL_ASSETS).catch(e => console.warn('Shell cache partial:', e));
      // Cache external assets (best-effort, may fail on first offline install)
      return Promise.allSettled(
        EXTERNAL_ASSETS.map(url =>
          fetch(url, { mode: 'cors' })
            .then(r => r.ok ? cache.put(url, r) : null)
            .catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - External CDN assets → Cache-first (they never change for the same URL)
// - HTML/manifest → Network-first with cache fallback
// - Everything else → Network-first with cache fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isExternal = url.hostname !== location.hostname;
  const isFont = url.hostname.includes('fonts');

  if (isExternal || isFont) {
    // Cache-first for CDN assets
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
  } else {
    // Network-first for local files (so updates are picked up)
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || new Response('Offline', { status: 503 })))
    );
  }
});
