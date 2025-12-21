/* Simple PWA service worker for Alyana Luz */
const CACHE_NAME = "alyana-cache-v1";
const CORE_ASSETS = [
  "/",
  "/app.js",
  "/manifest.webmanifest"
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API calls, cache-first for static
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for API-ish routes (so auth/billing stays correct)
  const isApi =
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/premium/") ||
    url.pathname.startsWith("/me") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/logout") ||
    url.pathname.startsWith("/stripe/") ||
    url.pathname.startsWith("/bible/") ||
    url.pathname.startsWith("/devotional") ||
    url.pathname.startsWith("/daily_prayer");

  if (isApi) {
    event.respondWith(
      fetch(req).catch(() => new Response("Offline. Please reconnect and try again.", { status: 503 }))
    );
    return;
  }

  // Static: cache-first, then network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return resp;
      });
    })
  );
});
