const CACHE_NAME = 'arc-studio-offline-v1';
const OFFLINE_PAGE = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_PAGE, '/arc.png'];
//
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('arc-studio-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(fetch(request).then((response) => {
    if (response.status >= 500) {
      return caches.match(OFFLINE_PAGE).then((offline) => offline || response);
    }
    return response;
  }).catch(() => caches.match(OFFLINE_PAGE).then((offline) => offline || Response.error())));
});
