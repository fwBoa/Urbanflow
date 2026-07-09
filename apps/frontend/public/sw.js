const CACHE_NAME = "urbanflow-v4";
const STATIC_ASSETS = [
  "/",
  "/search",
  "/favorites",
  "/profile",
  "/offline",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Mode dev : on désactive tout cache pour ne pas casser le HMR/Turbopack de Next.js.
// Le SW continue de tourner pour que push + install prompt fonctionnent en localhost.
const IS_DEV =
  typeof self !== "undefined" &&
  (self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1" ||
    self.location.port === "3000");

// Install: cache static assets (sauf en dev)
self.addEventListener("install", (event) => {
  if (IS_DEV) {
    self.skipWaiting();
    return;
  }

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

// Fetch: network-first strategy with cache fallback (prod only)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome-extension:// and other non-http(s) schemes
  if (!url.protocol.startsWith("http")) return;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API calls: network-only (fresh data required)
  if (url.pathname.startsWith("/api")) return;

  // Dynamic Next.js pages with large state in URL: bypass Service Worker to avoid
  // timeouts/hydration mismatches and let the browser handle the request directly.
  if (url.pathname.startsWith("/trip/")) return;

  // En dev : tout passe en network-only pour préserver HMR.
  if (IS_DEV) return;

  // Navigation requests: network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { credentials: "same-origin" })
        .then((response) => {
          // Cache successful navigation responses, but never cache the offline page as /
          if (response.ok && new URL(request.url).pathname !== "/offline") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (new URL(request.url).protocol.startsWith("http")) {
                cache.put(request, responseClone);
              }
            });
          }
          return response;
        })
        .catch((err) => {
          // Fallback to cache if offline, then to offline page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Only serve offline page if the browser is actually offline
            if (!self.navigator.onLine) {
              return caches.match("/offline") || Response.error();
            }
            // We are online but fetch failed (e.g. CSP blocked sub-resource): do not show offline page
            throw err;
          });
        })
    );
    return;
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
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
        })
        .catch((err) => {
          // Asset manquant ou requête bloquée : ne pas planter la promesse.
          console.warn("[SW] Static asset fetch failed:", request.url, err);
          return Response.error();
        });
    })
  );
});

// Push: afficher la notification système
self.addEventListener("push", (event) => {
  let payload = { title: "UrbanFlow", body: "Nouvelle alerte", actionUrl: "/" };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (e) {
    console.error("[SW] Invalid push payload", e);
  }

  const title = payload.title || "UrbanFlow";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag || "urbanflow-default",
    data: { actionUrl: payload.actionUrl || "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus une fenêtre ou ouvre l'URL cible
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.actionUrl || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === actionUrl && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(actionUrl);
        }
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
