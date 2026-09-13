/**
 * service-worker.js — app-shell offline caching (root-scoped).
 *
 * Subpath-safe: every precache entry is a path RELATIVE to this file's own
 * location. A service worker resolves relative fetch/cache URLs against its
 * own script URL (`self.location`), which already includes whatever subpath
 * the site is deployed under (e.g. GitHub Pages' `/learning-games/`) — so no
 * hardcoded root-absolute path is ever needed here.
 *
 * Strategy:
 *  - Navigations (HTML page loads): network-first, falling back to the cache
 *    and finally to `offline.html` when there's no network and no cache hit.
 *  - Everything else (css/js/manifest/icons): stale-while-revalidate — serve
 *    the cached copy immediately and refresh it from the network in the
 *    background, so edits propagate on the next load. Only OK, non-redirected
 *    responses are ever cached.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `lg-shell-${CACHE_VERSION}`;

/** Core app shell, precached on install. Paths are relative to this file. */
const PRECACHE_URLS = [
  "./",
  "index.html",
  "shared/offline.html",
  "manifest.json",
  "shared/css/reset.css",
  "shared/css/theme.css",
  "shared/css/base.css",
  "shared/js/storage.js",
  "shared/js/i18n.js",
  "shared/js/audio.js",
  "shared/js/util.js",
  "shared/js/nav.js",
  "shared/js/portal.js",
  "games/manifest.js",
  "assets/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith("lg-shell-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Network-first navigation handler, falling back to the cached shell and
 * finally to the offline page.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && !networkResponse.redirected) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    return cached ?? (await cache.match("shared/offline.html")) ?? Response.error();
  }
}

/**
 * Cache-first handler for static assets, populating the cache on a miss.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleAsset(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Revalidate from the network, caching only OK, non-redirected responses so a
  // transient 404/500 (or a trailing-slash redirect) never poisons the cache.
  const revalidate = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok && !networkResponse.redirected) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => undefined);

  if (cached) {
    // Stale-while-revalidate: serve the cached copy now, refresh for next load.
    event.waitUntil(revalidate);
    return cached;
  }
  return (await revalidate) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request, event));
});
