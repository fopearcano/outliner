// Minimal offline service worker. Lets the installed app launch and run even
// when the local server isn't up. Cache-first for same-origin assets;
// network-first for navigations with an offline fallback to the cached shell.
const CACHE = 'outliner-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const c = await caches.open(CACHE);
          c.put('/', net.clone());
          return net;
        } catch {
          return (await caches.match('/')) || (await caches.match('/index.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Same-origin assets: serve from cache first, populate on the way.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net.ok && net.type === 'basic') {
          const c = await caches.open(CACHE);
          c.put(req, net.clone());
        }
        return net;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
