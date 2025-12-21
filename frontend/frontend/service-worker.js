/* Alyana Luz — PWA service worker (improved) */
const CACHE_VERSION = "v2";
const CACHE_NAME = `alyana-cache-${CACHE_VERSION}`;

// Cache the real essentials (include icons + index.html for offline refresh)
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
      )
      .then(() => self.clients.claim())
  );
});

function isApiRoute(pathname) {
  return (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/premium/") ||
    pathname.startsWith("/me") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/logout") ||
    pathname.startsWith("/stripe/") ||
    pathname.startsWith("/bible/") ||
    pathname.startsWith("/devotional") ||
    pathname.startsWith("/daily_prayer")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET (avoid caching POST/PUT)
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for API routes (correctness for auth/billing)
  if (isApiRoute(url.pathname)) {
    event.respondWith(
      fetch(req).catch(() => new Response("Offline. Please reconnect and try again.", { status: 503 }))
    );
    return;
  }

  // Navigations: allow offline refresh to still load UI
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

