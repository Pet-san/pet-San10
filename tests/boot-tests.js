/* اختبارات محرّك التهيئة js/boot.js: node tests/boot-tests.js
   تشغّل boot.js داخل DOM وهمي وتتحقق من الثيم والرموز و Google Analytics. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const BOOT = fs.readFileSync(path.join(__dirname, "..", "js", "boot.js"), "utf8");
const CONFIG_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");

function makeEnv(cfgPatch, opts) {
  opts = opts || {};
  const head = [];
  const metas = (opts.metas || []).map(c => ({ _a: { content: c }, getAttribute(k) { return this._a[k]; }, setAttribute(k, v) { this._a[k] = v; } }));
  const attrs = new Set(opts.htmlAttrs || []);
  const fetched = [];
  const ctx = {
    console: { warn() {}, log() {}, error() {} },
    URL, URLSearchParams, encodeURIComponent, Date, Object, Array, Number, String, JSON, Math, Promise,
    localStorage: { getItem: () => null }, sessionStorage: (function () { const m = {}; return { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } }; })(),
    location: { search: opts.search || "", origin: "https://shop.example", href: "https://shop.example/" },
    fetch: u => { fetched.push(u); return Promise.resolve({ ok: false }); }
  };
  ctx.window = ctx;
  ctx.document = {
    readyState: "complete", title: opts.title || "", addEventListener() {},
    documentElement: { hasAttribute: a => attrs.has(a) },
    head: {
      appendChild(el) { head.push(el); },
      querySelector: () => null,
      querySelectorAll(sel) { return sel === "meta[content]" ? metas : []; }
    },
    querySelector: () => null, querySelectorAll: () => [],
    createElement(tag) { return { tag, _a: {}, setAttribute(k, v) { this._a[k] = v; }, textContent: "" }; }
  };
  vm.createContext(ctx);
  vm.runInContext(CONFIG_SRC + "\n;this.__C = STORE_CONFIG;", ctx);
  const C = ctx.__C;
  if (cfgPatch) cfgPatch(C);
  vm.runInContext(BOOT, ctx);
  const style = head.find(e => e.tag === "style");
  return { ctx, head, metas, fetched, css: style ? style.textContent : "", C };
}

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }

console.log("boot.js — الثيم");
t("القالب الافتراضي navy-gold يطبّق الألوان الأساسية", () => {
  const e = makeEnv();
  assert.ok(e.css.startsWith(":root:root{"));
  assert.ok(e.css.includes("--primary:#172554"));
  assert.ok(e.css.includes("--secondary:#2563EB"));
});
t("تغيير preset يغيّر كل الألوان", () => {
  const e = makeEnv(C => { C.theme.preset = "cosmetics-rose"; });
  assert.ok(e.css.includes("--primary:#5B4146"));
  assert.ok(e.css.includes("--bg:#FFF9F5"));
});
t("لون مخصص في theme.colors يتغلب على القالب", () => {
  const e = makeEnv(C => { C.theme.colors.primary = "#112233"; });
  assert.ok(e.css.includes("--primary:#112233"));
  assert.ok(e.css.includes("--secondary:#2563EB"), "بقية الألوان من القالب");
  assert.ok(e.css.includes("--primary-rgb:17,34,51"));
});
t("لون غير صالح يُتجاهل ويُستخدم لون القالب", () => {
  const e = makeEnv(C => { C.theme.colors.accent = "not-a-color"; });
  assert.ok(e.css.includes("--accent:#D4A853"));
});
t("قالب غير معروف يرجع إلى navy-gold", () => {
  const e = makeEnv(C => { C.theme.preset = "nope"; });
  assert.ok(e.css.includes("--primary:#172554"));
});
t("لون أساسي فاتح ← نص أغمق على الأزرار والفوتر (on-primary)", () => {
  const e = makeEnv(C => { C.theme.colors.primary = "#F5E7E8"; });
  assert.ok(!e.css.includes("--on-primary:#FFFFFF"));
  const e2 = makeEnv();
  assert.ok(e2.css.includes("--on-primary:#FFFFFF"));
});
t("الخط والشكل وبطاقة المنتج من الإعدادات", () => {
  const e = makeEnv(C => { C.theme.fontFamily = "Cairo"; C.theme.radiusCard = 20; C.theme.cardImageRatio = "4/5"; C.theme.cardImageFit = "contain"; });
  assert.ok(e.css.includes("--font-body:'Cairo',system-ui"));
  assert.ok(e.css.includes("--r-card:20px"));
  assert.ok(e.css.includes("--card-image-ratio:4/5"));
  assert.ok(e.css.includes("--card-image-fit:contain"));
  const link = e.head.find(x => x._a && x._a.href && x._a.href.indexOf("fonts.googleapis.com/css2") > -1);
  assert.ok(link && link._a.href.indexOf("family=Cairo:wght@400;500;700") > -1);
});
t("المعاينة ?theme= تعمل فقط عند allowPreview", () => {
  const off = makeEnv(null, { search: "?theme=pharmacy-teal" });
  assert.ok(off.css.includes("--primary:#172554"));
  const on = makeEnv(C => { C.theme.allowPreview = true; }, { search: "?theme=pharmacy-teal" });
  assert.ok(on.css.includes("--primary:#172B45") && on.css.includes("--secondary:#0E7C7E"));
});

t("خلفية الهيرو منفصلة: لا تغيّر primary وتحسب نص الهيرو منها", () => {
  const e = makeEnv(C => { C.theme.colors.hero = "#FFF3C4"; });
  assert.ok(e.css.includes("--hero-bg:#FFF3C4"));
  assert.ok(e.css.includes("--primary:#172554"), "primary لم يتغير");
  assert.ok(/\.hero\{--on-primary:#0F172A/.test(e.css), "نص داكن فوق هيرو فاتح");
  const none = makeEnv();
  assert.ok(!none.css.includes("--hero-bg") && !none.css.includes(".hero{"));
  const bad = makeEnv(C => { C.theme.colors.hero = "zzz"; });
  assert.ok(!bad.css.includes("--hero-bg"));
});

console.log("boot.js — الخدمات والوسوم");
t("Google Analytics يُحقن من googleAnalyticsId", () => {
  const e = makeEnv(C => { C.googleAnalyticsId = "G-TEST12345"; });
  const s = e.head.find(x => x.tag === "script");
  assert.ok(s && s.src.indexOf("id=G-TEST12345") > -1);
});
t("لا Analytics إذا كان المعرّف فارغاً أو الصفحة data-no-analytics", () => {
  assert.ok(!makeEnv(C => { C.googleAnalyticsId = ""; }).head.some(x => x.tag === "script"));
  assert.ok(!makeEnv(null, { htmlAttrs: ["data-no-analytics"] }).head.some(x => x.tag === "script"));
});
t("preconnect لـ Firebase و ImageKit من الإعدادات", () => {
  const e = makeEnv();
  const hrefs = e.head.filter(x => x._a && x._a.rel === "preconnect").map(x => x._a.href);
  assert.ok(hrefs.includes("https://test3-2a6de-default-rtdb.europe-west1.firebasedatabase.app"));
  assert.ok(hrefs.includes("https://ik.imagekit.io"));
});
t("الشعار وأيقونة الموقع من config.logo مع رقم النسخة", () => {
  const e = makeEnv(C => { C.logo = "assets/logo/my.png"; C.assetVersion = 5; });
  const icon = e.head.find(x => x._a && x._a.rel === "icon");
  assert.strictEqual(icon._a.href, "assets/logo/my.png?v=5");
});
t("رموز {{storeName}} في العنوان ووسوم الميتا", () => {
  const e = makeEnv(C => { C.storeName = "متجر الورد"; C.siteUrl = "https://rose.example/"; }, {
    title: "السلة | {{storeName}}", metas: ["{{siteUrl}}/", "{{logoUrl}}", "نص عادي"]
  });
  assert.strictEqual(e.ctx.document.title, "السلة | متجر الورد");
  assert.strictEqual(e.metas[0].getAttribute("content"), "https://rose.example/");
  assert.strictEqual(e.metas[1].getAttribute("content"), "https://rose.example/assets/logo/logo.png?v=77");
  assert.strictEqual(e.metas[2].getAttribute("content"), "نص عادي");
});
t("الجلب المبكر يعمل فقط في الصفحة التي تحمل data-early-fetch", () => {
  assert.strictEqual(makeEnv().fetched.length, 0);
  const e = makeEnv(null, { htmlAttrs: ["data-early-fetch"] });
  assert.ok(e.fetched.length >= 3 && e.fetched[0].indexOf("firebasedatabase.app/ws_categories.json") > -1);
});

console.log("\nالنتيجة: " + pass + " نجح، " + fail + " فشل");
process.exit(fail ? 1 : 0);
