const CACHE_NAME = "kasaflow-avans-maas-v9";
const ASSETS = ["./", "./index.html", "./style-v239.css?v=239", "./app-v239.js?v=239", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("garageflow-avans-maas-") || key.startsWith("kasaflow-avans-maas-")) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list[0]?.focus() || clients.openWindow("./index.html"))); });
