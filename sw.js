/* =============================================================================
 * sw.js — Service worker for offline play (cache-first).
 * Bump CACHE on any asset change to force clients to refetch.
 * ===========================================================================*/
const CACHE = 'business-deal-v9';

// Paths are relative so the app works from a GitHub Pages subfolder
// (e.g. /business-deal/) as well as the domain root.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/deck.js',
  './js/game.js',
  './js/ai.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Tolerate individual asset failures so install never hard-fails.
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          // Cache successful same-origin responses for next time.
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached); // offline and uncached
    })
  );
});
