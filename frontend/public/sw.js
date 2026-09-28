const SHELL_CACHE = "bharath-painters-shell-v2";
const STATIC_CACHE = "bharath-painters-static-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/pwa-icon.svg", "/favicon.svg"];
const LOCAL_DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  event.waitUntil(LOCAL_DEV ? self.skipWaiting() : caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const allowedCaches = new Set([SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => !allowedCaches.has(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (LOCAL_DEV) return;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Account and business data must always come from the server.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(SHELL_CACHE).then((cache) => cache.put("/", response.clone()));
      return response;
    }).catch(() => caches.match("/")));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "" }; }
  const path = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/dashboard";
  event.waitUntil(self.registration.showNotification(data.title || "Bharath Painters", {
    body: data.body || "You have a new update.",
    icon: "/pwa-icon.svg",
    badge: "/pwa-icon.svg",
    tag: `bp-notification-${data.id || Date.now()}`,
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.path || "/dashboard", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
