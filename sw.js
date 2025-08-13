// sw.js
const CACHE = "obikyo-v13"; // 版数は更新のたびに変える
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./beep.mp3",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // Offline-first（まずキャッシュ、なければネット）
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      // 動的に取得できたものも静的資産ならキャッシュへ
      const clone = res.clone();
      if (req.method === "GET" && req.url.startsWith(self.location.origin)) {
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => cached))
  );
});
