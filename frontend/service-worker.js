// frontend/service-worker.js
const CACHE_NAME = "alyana-cache-v4";

// Keep precache minimal to avoid "white screen" from stale assets
const PRECACHE_URLS = [
  "/",
  "/app.js",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// Network-first for JS so updates propagate quickly.
// Cache-first for navigation fallback.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Always try network first for app.js
  if (url.pathname === "/app.js") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response("", { status: 503 });
      }
    })());
    return;
  }

  // For navigations, try cache then network then fallback to "/"
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("/");
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        return cached || new Response("", { status: 503 });
      }
    })());
    return;
  }

  // Default: cache-first for small static assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return new Response("", { status: 503 });
    }
  })());
});




