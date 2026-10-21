let deferredPrompt = null;

// تسجيل الـ Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}

// فحص نوع الجهاز وما إذا كان يعمل مسبقاً داخل التطبيق المثبت
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

// عرض الشريط للآيفون أو عند توفر حدث التثبيت لأندرويد
window.addEventListener('load', () => {
  if (sessionStorage.getItem('pwa_prompt_dismissed')) return;

  if (isIos() && !isInStandaloneMode()) {
    showPwaInstallBanner(true);
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (sessionStorage.getItem('pwa_prompt_dismissed')) return;
  showPwaInstallBanner(false);
});

function showPwaInstallBanner(isIosDevice) {
  if (document.getElementById('pwaInstallBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';

  const bodyContent = isIosDevice
    ? `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="assets/logo/logo.png?v=80" alt="Logo" width="40" height="40" style="border-radius: 8px; object-fit: cover;">
        </div>
        <div class="pwa-banner-text">
          <strong>تثبيت تطبيق Pet San</strong>
          <p>اضغط على زر المشاركة ⎋ ثم اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></p>
        </div>
        <div class="pwa-banner-actions">
          <button id="pwaDismissBtn" class="btn-icon" style="border: none; background: transparent; font-size: 1.1rem; cursor: pointer; color: var(--text-2);">✕</button>
        </div>
      </div>
    `
    : `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="assets/logo/logo.png?v=80" alt="Logo" width="40" height="40" style="border-radius: 8px; object-fit: cover;">
        </div>
        <div class="pwa-banner-text">
          <strong>حمل تطبيق Pet San</strong>
          <p>تصفح أسرع وتجربة تسوق أسهل مباشرة من شاشتك</p>
        </div>
        <div class="pwa-banner-actions">
          <button id="pwaInstallBtn" class="btn btn-primary" style="padding: 6px 14px; font-size: 0.85rem;">تثبيت</button>
          <button id="pwaDismissBtn" class="btn-icon" style="border: none; background: transparent; font-size: 1.1rem; cursor: pointer; color: var(--text-2);">✕</button>
        </div>
      </div>
    `;

  banner.innerHTML = bodyContent;
  document.body.appendChild(banner);

  if (!isIosDevice) {
    document.getElementById('pwaInstallBtn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.remove();
    });
  }

  document.getElementById('pwaDismissBtn').addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
  });
}

window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.remove();
  deferredPrompt = null;
});