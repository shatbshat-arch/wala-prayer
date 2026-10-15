/* Service Worker - مختصر أحكام الصيام (offline-first lite) */
const CACHE_VERSION = 'siyam-v2';
const CORE_CACHE = CACHE_VERSION + '-core';
const PAGES_CACHE = CACHE_VERSION + '-pages';
const ASSETS_CACHE = CACHE_VERSION + '-assets';

const CORE_ASSETS = [
  './',
  './siyam.html',
  './quiz.html',
  './manifest.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

// روابط تُستثنى من التخزين (تسجيل الدخول / OAuth)
function isExcluded(url) {
  const u = url.toLowerCase();
  return (
    u.includes('/login') ||
    u.includes('/signin') ||
    u.includes('/signup') ||
    u.includes('/auth') ||
    u.includes('oauth') ||
    u.includes('accounts.google') ||
    u.includes('login.microsoft') ||
    u.includes('facebook.com/dialog/oauth')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('siyam-v') && ![CORE_CACHE, PAGES_CACHE, ASSETS_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isExcluded(req.url)) return; // اتركها للشبكة مباشرة دون تخزين

  // الصفحات والتنقل: الشبكة أولاً ثم الكاش
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) => hit || caches.match('./siyam.html')
          )
        )
    );
    return;
  }

  // الملفات الثابتة (أيقونات/خطوط/صور/CSS/JS بما فيها ذات الأسماء المتغيرة hash): التخزين أولاً
  const dest = req.destination;
  const isStatic =
    ['image', 'font', 'style', 'script'].includes(dest) ||
    /\.(png|jpe?g|webp|svg|ico|css|js|woff2?|ttf)$/i.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(ASSETS_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // باقي الطلبات (مثل Google Fonts): الشبكة أولاً ثم الكاش
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(PAGES_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
