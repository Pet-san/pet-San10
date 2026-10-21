// Service Worker مبسط لتلبية متطلبات الـ PWA دون تعقيد الكاش الديناميكي
const CACHE_NAME = 'store-pwa-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // تمرير الطلبات للشبكة مباشرة لضمان بقاء دورة التحديث التلقائي للبيانات والـ REST تعمل بسلاسة
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});