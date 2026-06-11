const CACHE_NAME    = 'study-vault-v9';
const OFFLINE_PAGE  = './index.html';

// All files to pre-cache on install
const PRECACHE_URLS = [
  './index.html',
  './nodes.html',
  './pdf.html',
  './qbp.html',
  './fcp.html',
  './exp.html',
  './routine.html',
  './manifest.json',
  './logo.jpg',
  // Google Fonts (will be cached on first use via runtime caching)
];

// ─── Install: pre-cache core files ───────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Force this SW to become active immediately
      return self.skipWaiting();
    }).catch((err) => {
      console.warn('[SW] Pre-cache failed (some files may not exist yet):', err);
      // Don't block install even if some files are missing
      return self.skipWaiting();
    })
  );
});

// ─── Activate: delete old caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ─── Fetch: smart caching strategy ───────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http(s) requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── Strategy 1: Cache-first for static assets ──
  // (images, fonts, icons, CSS, JS files)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Strategy 2: Network-first for HTML pages ──
  // Falls back to cache, then offline page
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // ── Strategy 3: Stale-while-revalidate for everything else ──
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Caching strategy helpers ─────────────────────────────────

// Cache-first: serve from cache, fetch & update if not cached
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset not available offline.', { status: 503 });
  }
}

// Network-first: try network, fall back to cache, then offline page
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Last resort: serve the main index page
    const offlinePage = await caches.match(OFFLINE_PAGE);
    return offlinePage || new Response(
      '<h1>Study Vault</h1><p>You are offline. Please connect to the internet.</p>',
      { headers: { 'Content-Type': 'text/html' }, status: 503 }
    );
  }
}

// Stale-while-revalidate: serve cache instantly, update in background
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

// ─── Helper: detect static assets ────────────────────────────
function isStaticAsset(url) {
  const staticExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.css', '.js',
    '.mp3', '.mp4', '.pdf',
  ];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// ─── Message handler: force update ───────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}
