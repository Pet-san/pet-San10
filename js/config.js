/* ==========================================================================
   config.js
   الملف المركزي لإعدادات المتجر وربط الخدمات السحابية.
   ========================================================================== */

const STORE_CONFIG = {
  // رقم إصدار البيانات (زد هذا الرقم 3, 4... عند إجراء حذف أو تعديل شامل للمنتجات لتحديث أجهزة الزوار فوراً)
  dataVersion: 3,

  // اسم المتجر ووصفه — تظهر في الهيدر والفوتر وصفحة "من نحن"
  storeName: "Test",
  storeTagline: "تجربة تسوق بسيطة، واضحة ومباشرة",
  storeDescription: "متجر إلكتروني يقدم أفضل المنتجات بطلب مباشر عبر واتساب.",

  // بيانات التواصل
  whatsappNumber: "",    // بصيغة دولية بدون + وبدون مسافات، مثال: 9647xxxxxxxxx
  phone: "",
  instagram: "",
  tiktok: "",

  address: "",
  workingHours: "",
  deliveryInfo: "",

  currencySymbol: "د.ع",

  // === Firebase Web App / Authentication ===
    firebaseApiKey: "AIzaSyA2aBIZ4dMwCSXdsEWRfug0C2ZyUnrXR_I",
  firebaseAuthDomain: "petshop4-bd006.firebaseapp.com",
  firebaseProjectId: "petshop4-bd006",
  firebaseStorageBucket: "petshop4-bd006.firebasestorage.app",
  firebaseMessagingSenderId: "732533658054",
  firebaseAppId: "1:732533658054:web:583c7a5a175bbf53eae2c7",
  
  // حسابات الأدمن المسموح لها بدخول لوحة التحكم
  adminEmails: ["a@email.com"],

  // === Firebase Realtime Database ===
  firebaseDatabaseURL: "https://petshop4-bd006-default-rtdb.europe-west1.firebasedatabase.app/",

  // === ImgBB (رفع الصور) ===
  imgbbApiKey: "53a5a9f8ee5d5c4443be4eb275e54418",

  // === ImageKit (تحسين وضغط الصور عبر CDN) ===
  imageKitEndpoint: "https://ik.imagekit.io/petshop/"

  // === Algolia Search Engine ===
  algoliaAppId: "OMN0MLR7PE",
  algoliaSearchKey: "12af33f3ef65f6c90459f089b7301d6f",       // مفتاح البحث فقط (آمن للواجهة العامة)
  algoliaAdminKey: "44dc546894c94620675e5a9112264cc1",         // مفتاح الإدارة للوحة التحكم فقط
  algoliaIndexName: "products",

  // === ضوابط المعمارية الهجينة والمنتجات ===
  // الحد الفاصل للتحويل التلقائي إلى Algolia:
  // ما دون هذا الرقم يعمل محلياً ومجاناً، وما فوقه يتحول تلقائياً إلى خوادم Algolia
  algoliaThreshold: 200000,

  // الحد الأقصى للمنتجات المستوردة من الإكسل
  maxExcelImportCount: 100                       
};
