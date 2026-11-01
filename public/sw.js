// MALVIA PWA worker: update-aware shell cache; API requests are never intercepted.
const CACHE = 'malvia-shell-v6';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok && response.type === 'basic') await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('malvia-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // HTML and executable assets are network-first so a deployment is picked up immediately.
  const updateSensitive = request.mode === 'navigate' || ['script', 'style'].includes(request.destination);
  if (updateSensitive) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: request.mode === 'navigate' ? 'no-cache' : 'default' });
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          await cache.put(request.mode === 'navigate' ? '/' : request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (request.mode === 'navigate' ? (await caches.match('/')) : null) || Response.error();
      }
    })());
    return;
  }

  // Other static assets retain an offline fallback; hashed Vite assets are immutable per build.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const fallback = await caches.match(url.pathname);
      return fallback || new Response('Resource unavailable', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});
