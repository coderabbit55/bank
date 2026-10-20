const CACHE_NAME = "accounts-market-shell-v1";
const APP_URL = new URL("./accounts-market.html", self.registration.scope).href;
const MANIFEST_URL = new URL("./manifest.webmanifest", self.registration.scope).href;
const ICON_192_URL = new URL("./icons/icon-192.png", self.registration.scope).href;
const ICON_512_URL = new URL("./icons/icon-512.png", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([APP_URL, MANIFEST_URL, ICON_192_URL, ICON_512_URL])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match(APP_URL)) || Response.error();
      }
      return Response.error();
    }
  })());
});
