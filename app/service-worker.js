/**
 * service-worker.js — offline caching (root-scoped), update-friendly.
 *
 * Subpath-safe: every precache entry is a path RELATIVE to this file's own
 * location. A service worker resolves relative fetch/cache URLs against its own
 * script URL (`self.location`), which already includes whatever subpath the site
 * is deployed under (e.g. GitHub Pages' `/learning-games/`) — so no hardcoded
 * root-absolute path is ever needed here.
 *
 * Strategy: NETWORK-FIRST for every same-origin GET, falling back to the cache
 * when offline (and to offline.html for navigations). This guarantees a new
 * deploy shows up immediately for returning visitors — no stale shell — while
 * still working offline from the last-seen copy. (During active iteration we
 * favor freshness over the marginal speed of cache-first; we can reintroduce
 * stale-while-revalidate for static media once content stabilizes.) Only OK,
 * non-redirected responses are ever cached.
 *
 * Bump CACHE_VERSION whenever the precached shell should be replaced.
 */

const CACHE_VERSION = "v2";
const CACHE_NAME = `lg-shell-${CACHE_VERSION}`;

/** Core app shell, precached on install so the app can cold-start offline. */
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
 * Network-first handler: try the network (caching OK, non-redirected responses),
 * and fall back to the cache when offline — to `offline.html` for navigations.
 * @param {Request} request
 * @param {{ isNavigation: boolean }} options
 * @returns {Promise<Response>}
 */
async function networkFirst(request, { isNavigation }) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && !networkResponse.redirected) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (isNavigation) {
      return (await cache.match("shared/offline.html")) ?? Response.error();
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(request, { isNavigation: request.mode === "navigate" }));
});
