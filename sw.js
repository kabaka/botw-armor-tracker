
const CACHE = "botw-armor-tracker-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./src/state.js",
  "./src/ui.js",
  "./manifest.json",
  "./data/botw_armor_data.json",
  "./data/armor_sources.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k===CACHE)?null:caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if(url.origin !== location.origin) return;

  // Network-first for JSON (so your hosted DATA_URL can be updated later), cache-fallback.
  if(url.pathname.endsWith(".json")){
    event.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(cache=>cache.put(req, copy));
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(cache=>cache.put(req, copy));
      return res;
    }))
  );
});
