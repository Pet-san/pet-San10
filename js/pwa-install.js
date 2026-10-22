(function () {
  'use strict';

  // تسجيل الـ Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js?v=78').catch(function (err) {
        console.error('PWA SW Fail:', err);
      });
    });
  }

  // التحقق إن كان التطبيق مثبتًا ويعمل حالياً كـ Standalone
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  // فحص أجهزة iOS
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var isSafari = isIos && !/crios|fxios/i.test(window.navigator.userAgent) && /safari/i.test(window.navigator.userAgent);

  var deferredPrompt = null;

  function createPwaUI() {
    // 1. شريط التثبيت للـ Android / Windows / Mac
    var banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.id = 'pwaBanner';
    banner.innerHTML = 
      '<img src="assets/logo/logo.png?v=78" alt="App Logo" class="pwa-banner-icon">' +
      '<div class="pwa-banner-info">' +
        '<strong>تثبيت التطبيق</strong>' +
        '<p>تصفح المتجر واطلب بشكل أسرع عبر تثبيت التطبيق</p>' +
      '</div>' +
      '<div class="pwa-banner-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" id="pwaInstallBtn">تثبيت</button>' +
        '<button type="button" class="btn-icon" id="pwaCloseBtn" aria-label="إغلاق" style="width:34px;height:34px;">✕</button>' +
      '</div>';
    document.body.appendChild(banner);

    // 2. نافذة تعليمات iOS بالتنسيق المحسّن
    var iosModal = document.createElement('div');
    iosModal.className = 'ios-install-modal';
    iosModal.id = 'iosInstallModal';
    iosModal.innerHTML = 
      '<div class="ios-modal-card">' +
        '<h3>تثبيت التطبيق على الآيفون</h3>' +
        '<p class="ios-subtitle">أضف المتجر لشاشتك الرئيسية لتصفح وطلب أسرع:</p>' +
        '<div class="ios-steps">' +
          '<div class="ios-step-item">' +
            '<span class="ios-step-num">1</span>' +
            '<div class="ios-step-text">' +
              'اضغط على زر المشاركة' +
              '<span class="ios-inline-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>' +
                  '<polyline points="16 6 12 2 8 6"></polyline>' +
                  '<line x1="12" y1="2" x2="12" y2="15"></line>' +
                '</svg>' +
              '</span>' +
              'في شريط المتصفح بالأسفل.' +
            '</div>' +
          '</div>' +
          '<div class="ios-step-item">' +
            '<span class="ios-step-num">2</span>' +
            '<div class="ios-step-text">' +
              'مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية</strong>.' +
            '</div>' +
          '</div>' +
          '<div class="ios-step-item">' +
            '<span class="ios-step-num">3</span>' +
            '<div class="ios-step-text">' +
              'اضغط على <strong>إضافة (Add)</strong> في الزاوية العلوية.' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-block" id="iosCloseModal">فهمت ذلك</button>' +
      '</div>';
    document.body.appendChild(iosModal);

    // أحداث الإغلاق
    document.getElementById('pwaCloseBtn').addEventListener('click', function () {
      banner.classList.remove('show');
      localStorage.setItem('pwa_dismissed', Date.now());
    });

    document.getElementById('iosCloseModal').addEventListener('click', function () {
      iosModal.classList.remove('show');
      localStorage.setItem('pwa_dismissed', Date.now());
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    // التأكد من عدم إزعاج المستخدم إذا أغلق الإشعار خلال آخر 5 أيام
    var lastDismissed = localStorage.getItem('pwa_dismissed');
    if (lastDismissed && Date.now() - parseInt(lastDismissed, 10) < 5 * 24 * 60 * 60 * 1000) {
      return;
    }

    createPwaUI();

    var banner = document.getElementById('pwaBanner');
    var installBtn = document.getElementById('pwaInstallBtn');
    var iosModal = document.getElementById('iosInstallModal');

    // أندرويد وكروم للكمبيوتر
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (banner) banner.classList.add('show');
    });

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (isIos) {
          // عرض نافذة الخطوات للآيفون
          if (banner) banner.classList.remove('show');
          if (iosModal) iosModal.classList.add('show');
        } else if (deferredPrompt) {
          // نافذة النظام المباشرة لأندرويد والكمبيوتر
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function (choice) {
            if (choice.outcome === 'accepted') {
              if (banner) banner.classList.remove('show');
            }
            deferredPrompt = null;
          });
        }
      });
    }

    // إذا كان الجهاز iOS ويعمل على Safari ولم يتم التثبيت بعد
    if (isSafari && !isStandalone) {
      setTimeout(function () {
        if (banner) banner.classList.add('show');
      }, 2500);
    }
  });
})();
