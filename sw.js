// sw.js — Service worker الأساسي لتفعيل قابلية التثبيت (PWA)
const CACHE_NAME = 'store-pwa-v78';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // تمرير الطلبات كالمعتاد للشبكة لضمان عمل الكاش الذكي الخاص بالمتجر
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
