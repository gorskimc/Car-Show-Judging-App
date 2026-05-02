// Service worker — caches the app shell so the PWA opens instantly and
// even loads (the shell, not API data) when the device has no signal.
//
// Strategy:
//   - Install: pre-cache the static shell.
//   - Fetch:
//     * /api/*     -> network only (fresh data is essential for judging)
//     * /uploads/* -> network only (judges always want the latest photo)
//     * everything else (HTML/CSS/JS/icons) -> cache-first, fall back to network

const CACHE_NAME = 'csj-shell-v1';

const SHELL = [
  '/',
  '/index.html',
  '/lookup.html',
  '/judging.html',
  '/review.html',
  '/styles.css',
  '/login.js',
  '/lookup.js',
  '/judging.js',
  '/review.js',
  '/sw-register.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cross-origin: leave the browser alone.
  if (url.origin !== self.location.origin) return;

  // Always go to the network for live data + photos.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    return;
  }

  // Cache-first for the app shell.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Opportunistically cache successful same-origin responses.
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});
