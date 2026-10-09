// Keeps the two screens opening when the phone has no signal. Data calls are never cached.
var CACHE = 'pal-plays-v11';
var SHELL = ['./', './log/', './dashboard/', './shared/api.js?v=11', './shared/config.js?v=11', './icons/plays-192.png', './icons/plays-512.png', './icons/plays-180.png', './icons/dash-192.png', './icons/dash-512.png', './icons/dash-180.png', './log/manifest.webmanifest', './dashboard/manifest.webmanifest'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});
