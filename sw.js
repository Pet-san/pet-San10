/* ==========================================================================
   Pet San - Service Worker (PWA Engine)
   ========================================================================== */

const CACHE_NAME = 'petsan-pwa-v85';

// الملفات الأساسية المطلوب تثبيتها لضمان فتح التطبيق ومطابقة معايير PWA
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css?v=85',
  '/css/refresh.css?v=85',
  '/js/config.js?v=85',
  '/js/icons.js?v=85',
  '/js/store.js?v=85',
  '/js/whatsapp.js?v=85',
  '/js/app.js?v=85',
  '/js/pwa-install.js?v=85',
  '/assets/logo/logo.png?v=85'
];

// مرحلة التثبيت: حفظ الهيكل الأساسي وتخطي الانتظار
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// مرحلة التفعيل: مسح أي كاش قديم لضمان نظافة التحديثات والسيطرة الفورية
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// معالجة الطلبات: الشبكة أولاً دائماً للحفاظ على حداثة المنتجات والبيانات
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // تجاهل طلبات غير الـ HTTP/HTTPS مثل إضافات المتصفح
  if (!req.url.startsWith('http')) return;

  // استبعاد طلبات لوحة الأدمن من أي تدخل
  if (req.url.includes('/admin')) return;

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        // في حال انقطاع الإنترنت بالكامل، يتم جلب الصفحة أو المورد المخزن مسبقاً
        return caches.match(req).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
