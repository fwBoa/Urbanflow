const CACHE_NAME = "urbanflow-v1";
const STATIC_ASSETS = [
  "/",
  "/search",
  "/favorites",
  "/profile",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first strategy with cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome-extension:// and other non-http(s) schemes
  if (!url.protocol.startsWith("http")) return;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API calls: network-only (fresh data required)
  if (url.pathname.startsWith("/api")) return;

  // Navigation requests: network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (new URL(request.url).protocol.startsWith("http")) {
                cache.put(request, responseClone);
              }
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(request).then((cached) => {
            return cached || caches.match("/");
          });
        })
    );
    return;
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && isCacheable(request)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (new URL(request.url).protocol.startsWith("http")) {
              cache.put(request, responseClone);
            }
          });
        }
        return response;
      });
    })
  );
});

function isCacheable(request) {
  const url = new URL(request.url);
  const ext = url.pathname.split(".").pop() || "";
  const cacheableExtensions = [
    "js",
    "css",
    "png",
    "jpg",
    "jpeg",
    "svg",
    "ico",
    "woff2",
    "woff",
    "json",
  ];
  return cacheableExtensions.includes(ext) || url.pathname === "/";
}