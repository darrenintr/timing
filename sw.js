const CACHE = 'timing-__TIMING_CACHE_VERSION__';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-maskable.svg', './icon-monochrome.svg', './src/main.js', './src/style.css', './src/fonts/roboto-flex.woff2', './src/fonts/fraunces.woff2', './src/fonts/fraunces-italic.woff2', './src/fonts/jetbrains-mono.woff2'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith('timing-') && key !== CACHE);
    await Promise.all(old.map(key => caches.delete(key)));
    await self.clients.claim();
    if (old.length) {
      for (const client of await self.clients.matchAll({type:'window'})) client.postMessage({type:'TIMING_UPDATE_READY'});
    }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
