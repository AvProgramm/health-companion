/*
 * Service worker for the Health Companion app shell.
 *
 * Precache every file of this build at install time, so the diary opens with no
 * network at all. The diary records themselves live in IndexedDB, not here.
 * The build (vite.config.ts) fills in the two placeholders below.
 */

// The exact files of this build, e.g. /index.html and the hashed /assets/* files
const PRECACHE_URLS = __PRECACHE_URLS__;

// Named after a hash of the file list, so each build gets its own cache
const CACHE_PREFIX = 'health-companion-shell-';
const CACHE_NAME = CACHE_PREFIX + '__BUILD_ID__';

self.addEventListener('install', (event) => {
  // Download the whole shell before this worker counts as installed,
  // so a half-cached build never takes over
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Delete caches from older builds, then take control of open pages straight away
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore anything that is not a plain read, since only reads can come from a cache
  if (request.method !== 'GET') {
    return;
  }

  // Ignore other origins and the coach API, which must never be answered from a cache
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Serve every page navigation from the cached index.html, so a cold start works offline
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('/index.html').then((cached) => cached || fetch(request)));
    return;
  }

  // Serve build files from the cache first, falling back to the network.
  // ignoreVary is needed because the server sends "Vary: Origin" and module scripts
  // are requested with an Origin header the precache request did not have, so a
  // strict match would miss every script and the offline page would stay blank.
  event.respondWith(caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request)));
});
