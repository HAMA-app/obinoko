const CACHE_NAME = 'obikyo-cache-v2025-08-19';
const ASSETS = [
  './',
  'index.html?v=2025-08-16',
  'styles.css?v=2025-08-16',
  'app.js?v=2025-08-16',
  'manifest.json?v=2025-08-16',
  'icon-180.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))));
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=>cached || fetch(e.request).then(res=>{
      const url=new URL(e.request.url);
      if(url.origin===location.origin){
        const clone=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
      }
      return res;
    }).catch(()=>cached))
  );
});
