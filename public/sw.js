// Service worker ERP : rend l'application installable et garde les fichiers de l'interface
// en cache pour un démarrage rapide. Les données (API) passent toujours par le réseau.
const CACHE = 'angy-erp-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icon-192.png', '/img/logo.webp'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Fichiers versionnés de Next.js et images : cache d'abord
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/img/') || /\.(png|webp|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // Pages : réseau d'abord, page « hors connexion » si internet est coupé
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
});
