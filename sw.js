const CACHE_NAME = "kasaflow-migration-test-v2-3-9";
const SHELL_ASSETS = ["/", "/index.html", "/style.css?v=2.3.9", "/cashier-themes.css?v=2.3.9", "/app-migration-v2.3.js?v=2.3.9", "/payroll-reminder.js?v=2.3.9", "/manifest.webmanifest", "/logo.png", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.hostname === "api.scheax.com.tr") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("/index.html") : Promise.reject()))));
});
