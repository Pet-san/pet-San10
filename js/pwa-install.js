/* ==========================================================================
   Pet San - PWA Installation Manager (iOS & Android)
   ========================================================================== */

let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}

const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const isInStandaloneMode = () => {
  const isIosStandalone = ('standalone' in window.navigator) && window.navigator.standalone;
  const isGenericStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(isIosStandalone || isGenericStandalone);
};

const isAdminPage = () => window.location.pathname.includes('/admin');

window.addEventListener('load', () => {
  if (isAdminPage()) return;
  if (sessionStorage.getItem('pwa_prompt_dismissed') || isInStandaloneMode()) return;

  if (isIos()) {
    showIosInstallModal();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (isAdminPage()) return;
  if (sessionStorage.getItem('pwa_prompt_dismissed') || isInStandaloneMode()) return;

  showAndroidBanner();
});

/* ==================== واجهة iOS (نافذة سفلية أنيقة مع مؤشر سفلي) ==================== */
function showIosInstallModal() {
  if (document.getElementById('iosInstallModal')) return;

  const modal = document.createElement('div');
  modal.id = 'iosInstallModal';
  modal.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 999999;
    padding: 20px 16px 28px;
    background: #ffffff;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    direction: rtl;
    font-family: inherit;
    animation: pwaSlideUp 0.35s ease-out;
  `;

  // أيقونة المشاركة الخاصة بسفاري (مربع مع سهم لأعلى)
  const shareIconSvg = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  `;

  // أيقونة الإضافة إلى الشاشة الرئيسية (مربع وبداخله زائد)
  const addIconSvg = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
      <rect x="3" y="3" width="18" height="18" rx="4"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  `;

  modal.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="/assets/logo/logo.png?v=85" alt="Pet San" width="46" height="46" style="border-radius: 12px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div>
          <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #1e293b;">تثبيت تطبيق Pet San</h3>
          <p style="margin: 2px 0 0; font-size: 0.8rem; color: #64748b;">تسوّق بشكل أسرع دون الحاجة لكتابة الرابط</p>
        </div>
      </div>
      <button id="closeIosPwa" style="border: none; background: #f1f5f9; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; font-size: 1rem;">✕</button>
    </div>

    <div style="background: #f8fafc; border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; font-size: 0.88rem; line-height: 1.7; color: #334155; border: 1px solid #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <span style="background: #e0f2fe; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #0369a1; font-size: 0.8rem;">1</span>
        <span>اضغط على زر المشاركة ${shareIconSvg} في الشريط السفلي.</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #e0f2fe; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #0369a1; font-size: 0.8rem;">2</span>
        <span>اختر <strong>إضافة إلى الشاشة الرئيسية</strong> ${addIconSvg}.</span>
      </div>
    </div>

    <!-- سهم يشير للأسفل باتجاه شريط سفاري -->
    <div style="text-align: center; color: #007aff; font-size: 0.82rem; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px;">
      <span>زر المشاركة موجود في الأسفل</span>
      <span style="font-size: 1.1rem; animation: bounceDown 1.2s infinite;">↓</span>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closeIosPwa').addEventListener('click', () => {
    modal.remove();
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
  });
}

/* ==================== واجهة أندرويد وكروم (زر تثبيت فوري) ==================== */
function showAndroidBanner() {
  if (document.getElementById('androidInstallBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'androidInstallBanner';
  banner.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 32px);
    max-width: 440px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    z-index: 999999;
    padding: 12px 14px;
    direction: rtl;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid rgba(0,0,0,0.06);
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <img src="/assets/logo/logo.png?v=85" alt="Pet San" width="40" height="40" style="border-radius: 10px; object-fit: cover;">
      <div>
        <strong style="display: block; font-size: 0.92rem; color: #0f172a;">تطبيق Pet San</strong>
        <span style="font-size: 0.78rem; color: #64748b;">تثبيت المتجر على الشاشة الرئيسية</span>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <button id="pwaAndroidInstallBtn" class="btn btn-primary" style="padding: 7px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 10px;">تثبيت</button>
      <button id="pwaAndroidDismissBtn" style="border: none; background: transparent; color: #94a3b8; font-size: 1.1rem; cursor: pointer; padding: 4px;">✕</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwaAndroidInstallBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.remove();
  });

  document.getElementById('pwaAndroidDismissBtn').addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
  });
}

window.addEventListener('appinstalled', () => {
  const modal = document.getElementById('iosInstallModal') || document.getElementById('androidInstallBanner');
  if (modal) modal.remove();
  deferredPrompt = null;
});
