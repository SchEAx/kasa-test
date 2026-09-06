const CACHE_NAME = "kasaflow-avans-maas-v6";
const ASSETS = ["./", "./index.html", "./style.css?v=5", "./app.js?v=5", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("garageflow-avans-maas-") || key.startsWith("kasaflow-avans-maas-")) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list[0]?.focus() || clients.openWindow("./index.html"))); });
