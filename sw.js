// Service Worker for Arboleaf Scale PWA

const CACHE_NAME = 'arboleaf-scale-v1';
const urlsToCache = [
    '.',
    'index.html',
    'app.js',
    'styles.css',
    'manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached version immediately if available
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        // Update cache with fresh version
                        if (networkResponse.ok) {
                            const cacheCopy = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, cacheCopy);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse); // Fallback to cache if network fails

                // Return cached response immediately, or fetch if not cached
                return cachedResponse || fetchPromise;
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});
