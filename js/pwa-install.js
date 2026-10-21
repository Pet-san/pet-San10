/* ==========================================================================
   Pet San - PWA Installation Prompt Manager
   ========================================================================== */

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

const isInStandaloneMode = () => {
  const isIosStandalone = ('standalone' in window.navigator) && window.navigator.standalone;
  const isGenericStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(isIosStandalone || isGenericStandalone);
};

// فحص ما إذا كنا داخل لوحة الأدمن لتجنب إظهار الشريط فيها
const isAdminPage = () => window.location.pathname.includes('/admin');

// تشغيل شريط التثبيت للآيفون
window.addEventListener('load', () => {
  if (isAdminPage()) return;
  if (sessionStorage.getItem('pwa_prompt_dismissed')) return;

  if (isIos() && !isInStandaloneMode()) {
    showPwaInstallBanner(true);
  }
});

// التقاط حدث التثبيت لأجهزة أندرويد ومتصفحات كروم
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (isAdminPage()) return;
  if (sessionStorage.getItem('pwa_prompt_dismissed') || isInStandaloneMode()) return;

  showPwaInstallBanner(false);
});

function showPwaInstallBanner(isIosDevice) {
  if (document.getElementById('pwaInstallBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';

  // تنسيق CSS عائم لضمان ظهور الشريط بشكل متناسق أسفل الشاشة في كل الأجهزة
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 32px);
    max-width: 480px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 16px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    z-index: 99999;
    padding: 12px 14px;
    direction: rtl;
    font-family: inherit;
    animation: pwaSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const logoSrc = "/assets/logo/logo.png?v=85";

  const bodyContent = isIosDevice
    ? `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
          <img src="${logoSrc}" alt="Pet San" width="42" height="42" style="border-radius: 10px; object-fit: cover; flex-shrink: 0;">
          <div style="font-size: 0.85rem; line-height: 1.4;">
            <strong style="display: block; color: #0f172a; font-size: 0.95rem;">تثبيت تطبيق Pet San</strong>
            <span style="color: #64748b;">اضغط على زر المشاركة <span style="font-size: 1.1rem; line-height: 1;">⎋</span> ثم اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
          </div>
        </div>
        <button id="pwaDismissBtn" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer; color: #94a3b8; padding: 4px;">✕</button>
      </div>
    `
    : `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
          <img src="${logoSrc}" alt="Pet San" width="42" height="42" style="border-radius: 10px; object-fit: cover; flex-shrink: 0;">
          <div style="font-size: 0.85rem; line-height: 1.4;">
            <strong style="display: block; color: #0f172a; font-size: 0.95rem;">حمّل تطبيق Pet San</strong>
            <span style="color: #64748b;">تصفح أسرع وتجربة تسوق أسهل مباشرة من شاشتك</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button id="pwaInstallBtn" class="btn btn-primary" style="padding: 7px 14px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; cursor: pointer;">تثبيت</button>
          <button id="pwaDismissBtn" style="border: none; background: transparent; font-size: 1.2rem; cursor: pointer; color: #94a3b8; padding: 4px;">✕</button>
        </div>
      </div>
    `;

  banner.innerHTML = bodyContent;
  document.body.appendChild(banner);

  if (!isIosDevice) {
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        banner.remove();
      });
    }
  }

  const dismissBtn = document.getElementById('pwaDismissBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    });
  }
}

// إخفاء الشريط وتفريغ الطلب عند اكتمال التثبيت الفعلي
window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.remove();
  deferredPrompt = null;
});
