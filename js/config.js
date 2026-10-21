/* ==========================================================================
   config.js
   الملف المركزي لإعدادات المتجر وربط الخدمات السحابية.
   ========================================================================== */

const STORE_CONFIG = {
  // رقم إصدار البيانات
  dataVersion: 3,

  // اسم المتجر ووصفه
  storeName: "Pet San",
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
  firebaseApiKey: "AIzaSyAO5teGRN0iSVyuvrKQGAgBfoHB4A5v7tw",
  firebaseAuthDomain: "pet-san-10.firebaseapp.com",
  firebaseProjectId: "pet-san-10",
  firebaseStorageBucket: "pet-san-10.firebasestorage.app",
  firebaseMessagingSenderId: "615362246830",
  firebaseAppId: "1:615362246830:web:c33027364d9eebb9be553f",

  // حسابات الأدمن المسموح لها بدخول لوحة التحكم
  adminEmails: ["a@email.com"],

  // === Firebase Realtime Database ===
  firebaseDatabaseURL: "https://pet-san-10-default-rtdb.europe-west1.firebasedatabase.app",

  // === ImgBB (رفع الصور) ===
  imgbbApiKey: "53a5a9f8ee5d5c4443be4eb275e54418",

  // === ImageKit (تحسين وضغط الصور عبر CDN - بدون سلاش في النهاية مع الفاصلة) ===
  imageKitEndpoint: "https://ik.imagekit.io/petshop",

  // === Algolia Search Engine ===
  algoliaAppId: "OMN0MLR7PE",
  algoliaSearchKey: "12af33f3ef65f6c90459f089b7301d6f",
  algoliaAdminKey: "",
  algoliaIndexName: "products",

  // الحد الأقصى للمنتجات المستوردة من الإكسل
  maxExcelImportCount: 100
};
