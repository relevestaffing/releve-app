/* Home-screen launch cache, nothing more.
   ----------------------------------------
   Added to the home screen on iOS, this app is not a real installed PWA —
   it is a standalone WKWebView that iOS suspends and frequently kills
   outright under memory pressure, and its ordinary HTTP disk cache goes
   with it far more readily than a normal Safari tab's does. So a tap on
   the icon is, more often than not, a genuinely cold launch: a fresh
   process, over cellular, re-fetching the whole JS bundle before anything
   can render — which is what a multi-second "every single time" load
   points to, distinct from the server itself (already fast; see the
   deploy-time warm-ping function).

   This worker only ever touches /_next/static/* — the framework's own
   content-hashed, genuinely-immutable build output — and caches it in
   the more durable Cache Storage API rather than trusting the disk cache
   to survive. Every other request (every page, every /api/* call) passes
   straight through to the network, untouched: nothing here should ever be
   the reason an authenticated page shows stale or wrong content. A new
   deploy ships new hashed filenames, so there is nothing to invalidate —
   old entries just stop being requested. */
const CACHE = 'releve-static-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/_next/static/')) return; // everything else: network, always

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
