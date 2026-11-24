// Garde l'app disponible hors ligne (sous-sols de magasins sans réseau).
// Change VERSION à chaque mise à jour pour forcer le rechargement.
const VERSION = "courses-v17";
const SHELL = ["./", "index.html", "style.css", "app.js", "categories.js", "config.js", "manifest.webmanifest", "icon.svg",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord pour les fichiers de l'app, cache si pas de réseau.
// Les appels à Supabase ne passent pas par ici.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin !== location.origin && u.host !== "cdn.jsdelivr.net") return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
