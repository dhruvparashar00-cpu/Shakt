// sw.js - Shakt Progressive Web App Service Worker
// Provides offline support, asset caching, and background sync for the Shakt note digitizer
// Install as PWA on Android and desktop for offline-first note study.

const CACHE_NAME = 'shakt-v1.2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/db.js',
  '/js/sample-data.js',
  '/js/pdf-viewer.js',
  '/js/ai-converter.js',
  '/js/note-editor.js',
  '/js/ai-doubt.js',
  '/js/search-notes.js',
  '/js/export-notes.js',
  '/js/undo-redo.js',
  '/js/batch-converter.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/vendor/katex/katex.min.css',
  '/vendor/katex/katex.min.js',
  '/vendor/katex/auto-render.min.js'
];

// API routes that should never be cached (always proxy to server)
const API_ROUTES = ['/api/claude', '/api/py/action', '/api/py/status', '/api/config'];

// ============================================================================
// INSTALL - Cache static assets
// ============================================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Shakt SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'no-cache' })));
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================================
// ACTIVATE - Clean up old caches
// ============================================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH - Cache-first for static assets, network-first for API, fallback to cache
// ============================================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API routes: try network first, fallback to cache (offline queue could go here)
  if (API_ROUTES.some((route) => url.pathname.startsWith(route))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Don't cache error responses
          if (!response.ok || response.status !== 200) {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response.ok) return response;
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
            return response;
          })
          .catch(() => {
            // Offline fallback for HTML
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// ============================================================================
// MESSAGE - Handle skipWaiting and cache clearing from client
// ============================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(names.map((name) => caches.delete(name)))
      ).then(() => {
        event.ports[0]?.postMessage({ type: 'CACHE_CLEARED' });
      })
    );
  }
});

console.log('[Shakt SW] Service Worker script loaded');
