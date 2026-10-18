const CACHE = 'spelling-garden-v8';
const CORE = ['./', './index.html', './styles.css', './app.js', './core.js', './statistics.js', './storage.js', './audio.js', './bee.svg', './data/words.json', './data/overrides.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('spelling-garden-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/audio/')) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const existing = await cache.match(event.request); if (existing) return existing;
      const response = await fetch(event.request);
      if (response.ok) { try { await cache.put(event.request, response.clone()); } catch {} }
      return response;
    }));
  } else {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {}); }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
  }
});
