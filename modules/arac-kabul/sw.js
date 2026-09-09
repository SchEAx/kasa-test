const CACHE_NAME = "kasaflow-arac-kabul-migration-v2-3-1";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => { if (e.request.method !== "GET") return; e.respondWith(fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request))); });
