const CACHE_NAME = "kindar-v4";
const OFFLINE_URL = "/offline.html";

// Pre-cache essential assets on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        OFFLINE_URL,
        "/manifest.json",
        "/icon-192x192.png",
        "/icon-512x512.png",
        "/apple-touch-icon.png",
        "/kindar-icon.svg",
      ]);
    })
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Network-first strategy for navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip external requests
  if (!request.url.startsWith(self.location.origin)) return;

  // Navigation requests: network first, fallback to offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses for offline use
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try cached version first, then offline page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // API requests: network only (no caching)
  if (request.url.includes("/api/")) {
    return;
  }

  // Static assets (images, fonts, CSS, JS): cache first
  if (
    request.url.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "Kindar",
      body: event.data.text(),
      icon: "/icon-192x192.png",
    };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192x192.png",
    badge: "/icon-96x96.png",
    tag: data.tag || "default",
    data: {
      url: data.url || "/dashboard",
    },
    vibrate: [200, 100, 200],
    actions: data.actions || [],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Kindar", options)
  );
});

// Handle notification click — open the app at the right page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open new window
      return clients.openWindow(targetUrl);
    })
  );
});
