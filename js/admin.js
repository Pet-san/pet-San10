/* ==========================================================================
   admin.js
   منطق لوحة تحكم الأدمن بالكامل (admin.html). 
   تم التحديث: دعم خيارات المنتجات المتعددة بالصور + حل مشكلة قائمة يتبع لقسم.
   ========================================================================== */

let editingProductId = null;
let editingCategoryId = null;
let editingAdId = null; 
let pendingProductImage = null; 
let pendingCategoryImage = null; 
let pendingAdImage = null; 
let pendingVariants = []; // [{ name: "", image: "", stock: 0 }]

function bumpMetaVersion() {
  try {
    if (typeof firebase !== "undefined" && firebase.database) {
      firebase.database().ref("ws_meta_v").set(Date.now());
    }
  } catch (err) {
    console.warn("Failed to bump ws_meta_v:", err);
  }
}

async function initAdminPage() {
  const app = document.getElementById("adminApp");
  if (!app) return;
  if (typeof requireAdminAuth === "function") {
    const isAuthed = await requireAdminAuth();
    if (!isAuthed) return;
  }

  await pullFromFirebase(true);
  await Store.loadAllProductsFromFirebase(true);
  await Store.loadOrdersFromFirebase(300);

  Store.rebuildIndex(false).then(function (ok) {
    if (!ok) showAdminBanner("تعذّر إنشاء/قراءة فهرس المتجر ws_index. أضف قاعدة ws_index إلى Firebase Rules ثم حدّث الصفحة.");
  });

  if (!Store.canWriteProducts()) {
    showAdminBanner("تعذّر تحميل كل المنتجات من الخادم، لذلك أُوقف حفظ/حذف المنتجات مؤقتاً لحماية بياناتك. تحقق من الاتصال ثم حدّث الصفحة.");
  }

  wireSidebarNav();
  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleAdminLogout);
  
  const sidebarToggle = document.getElementById("adminSidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", toggleAdminSidebar);
  }

  renderStats();
  renderProductsTable();
  renderCategoriesTable();
  renderOrdersTable();
  renderAdsTable(); 
  
  fillSettingsForm();
  populateCategorySelect();
  populateIconPicker();

  wireProductModal();
  wireCategoryModal();
  wireAdModal(); 
  wireSettingsForm();
  wireExcelSync();

  wireProductsTableEvents();
}

function showAdminBanner(message) {
  const main = document.querySelector(".admin-main");
  if (!main) return;
  const box = document.createElement("div");
  box.className = "setup-note";
  box.setAttribute("role", "alert");
  box.textContent = message;
  main.insertBefore(box, main.firstChild);
}

function ensureProductsWritable() {
  if (Store.canWriteProducts()) return true;
  showToast("لم يكتمل تحميل المنتجات من الخادم، لذلك أُوقف الحفظ لحماية بياناتك. حدّث الصفحة ثم أعد المحاولة.", "error");
  return false;
}

/* ---------------------------------------------------------------------- */
/* مزامنة البيانات مع محرك البحث Algolia                                  */
/* ---------------------------------------------------------------------- */

let _algoliaKeyDeclined = false;
function algoliaConfigured() {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  return !!(cfg.useAlgolia === true && cfg.algoliaAppId && !String(cfg.algoliaAppId).startsWith("YOUR_"));
}
function getAlgoliaAdminKey() {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (cfg.algoliaAdminKey && !String(cfg.algoliaAdminKey).startsWith("YOUR_")) {
    return String(cfg.algoliaAdminKey);
  }
  try { return sessionStorage.getItem("ws_algolia_admin_key") || ""; } catch (e) { return ""; }
}
function requestAlgoliaAdminKey() {
  if (!algoliaConfigured()) return "";
  let key = getAlgoliaAdminKey();
  if (key || _algoliaKeyDeclined) return key;
  key = (window.prompt("لمزامنة محرك البحث Algolia أدخل مفتاح Admin API Key.\nاضغط إلغاء لتخطي المزامنة.") || "").trim();
  if (!key) {
    _algoliaKeyDeclined = true;
    showToast("تم تخطي مزامنة Algolia في هذه الجلسة.", "error");
    return "";
  }
  try { sessionStorage.setItem("ws_algolia_admin_key", key); } catch (e) {}
  return key;
}

async function syncProductsToAlgolia(productsList) {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (!algoliaConfigured()) return;
  const adminKey = requestAlgoliaAdminKey();
  if (!adminKey) return;

  const indexName = cfg.algoliaIndexName || "products";
  const url = `https://${cfg.algoliaAppId}.algolia.net/1/indexes/${encodeURIComponent(indexName)}/batch`;

  const requests = [];
  productsList.forEach(p => {
    const isAvail = Store.isProductAvailable(p);
    if (isAvail) {
      requests.push({
        action: "updateObject",
        body: {
          objectID: p.id,
          name: p.name || "",
          price: Number(p.price) || 0,
          oldPrice: Number(p.oldPrice) || 0,
          categoryId: p.categoryId || "",
          image: p.image || "",
          variants: p.variants || [],
          featured: !!p.featured,
          isOffer: !!p.isOffer,
          isNew: !!p.isNew,
          available: true,
          stock: Number(Store.getTotalStock(p)) || Number(p.stock) || 1
        }
      });
    } else {
      requests.push({
        action: "deleteObject",
        body: { objectID: p.id }
      });
    }
  });

  if (!requests.length) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": cfg.algoliaAppId,
        "X-Algolia-API-Key": adminKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
  } catch (err) {
    console.error("فشل مزامنة Algolia:", err);
  }
}

async function deleteProductFromAlgolia(productId) {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (!algoliaConfigured()) return;
  const adminKey = requestAlgoliaAdminKey();
  if (!adminKey) return;
  const indexName = cfg.algoliaIndexName || "products";
  const url = `https://${cfg.algoliaAppId}.algolia.net/1/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(productId)}`;

  try {
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Algolia-Application-Id": cfg.algoliaAppId,
        "X-Algolia-API-Key": adminKey
      }
    });
  } catch (err) {
    console.error("فشل حذف المنتج من Algolia:", err);
  }
}

/* ---------------------------------------------------------------------- */
/* مزامنة واستيراد الأسعار والمخزون عبر ملفات Excel / CSV                 */
/* ---------------------------------------------------------------------- */

function wireExcelSync() {
  const fileInput = document.getElementById("excelSyncInput") || document.querySelector('input[type="file"][accept=".xlsx, .xls, .csv"]');
  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) {
        alert("الملف فارغ أو لا يحتوي على بيانات مقروءة.");
        return;
      }

      const getVal = (row, possibleKeys) => {
        for (let key of possibleKeys) {
          const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
          if (foundKey && row[foundKey] !== "") return row[foundKey];
        }
        return null;
      };

      const barcodeKeys = ["الباركود", "باركود", "كود المادة", "كود", "barcode", "sku"];
      const nameKeys = ["اسم المنتج", "الاسم", "المادة", "name"];
      const priceKeys = ["السعر", "سعر البيع", "سعر المفرد", "price"];
      const stockKeys = ["الكمية", "المخزون", "الرصيد", "stock", "qty"];

      const parseCellNumber = (raw) => {
        if (raw === null || raw === undefined || raw === "") return null;
        if (typeof raw === "number") return isFinite(raw) ? raw : null;
        const txt = String(raw)
          .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
          .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
          .replace(/[\u066C,\s]/g, "")
          .replace(/\u066B/g, ".");
        const n = parseFloat(txt);
        return isFinite(n) ? n : null;
      };

      const validRows = [];
      rows.forEach(row => {
        const barcodeVal = getVal(row, barcodeKeys)?.toString().trim();
        const nameVal = getVal(row, nameKeys)?.toString().trim();
        let priceVal = parseCellNumber(getVal(row, priceKeys));
        let stockVal = parseCellNumber(getVal(row, stockKeys));

        if (!nameVal && !barcodeVal) return;
        if (priceVal !== null && priceVal < 0) priceVal = null;
        if (stockVal !== null) stockVal = Math.max(0, Math.floor(stockVal));

        validRows.push({ barcodeVal, nameVal, priceVal, stockVal });
      });

      if (validRows.length === 0) {
        alert("لم يتم العثور على أي صفوف صالحة في الملف.");
        return;
      }

      if (!ensureProductsWritable()) return;

      let products = Store.getProducts();
      let updatedCount = 0;
      let addedCount = 0;
      const touchedProducts = [];

      validRows.forEach(item => {
        let existingProduct = products.find(p =>
          (item.barcodeVal && (p.barcode === item.barcodeVal || p.sku === item.barcodeVal || p.id === item.barcodeVal)) ||
          (item.nameVal && p.name === item.nameVal)
        );

        if (existingProduct) {
          if (item.priceVal !== null) existingProduct.price = item.priceVal;
          if (item.stockVal !== null) {
            existingProduct.stock = item.stockVal;
            if (item.stockVal > 0) existingProduct.available = true;
          }
          if (item.barcodeVal && !existingProduct.barcode) {
            existingProduct.barcode = item.barcodeVal;
            existingProduct.sku = item.barcodeVal;
          }
          touchedProducts.push(existingProduct);
          updatedCount++;
        } else {
          if (!item.nameVal || !(item.priceVal > 0) || !(item.stockVal > 0)) return;
          const newProduct = {
            id: uid("prd"),
            name: item.nameVal,
            barcode: item.barcodeVal || "",
            sku: item.barcodeVal || "",
            price: item.priceVal,
            oldPrice: 0,
            stock: item.stockVal,
            categoryId: "",
            available: true,
            featured: false,
            isNew: true,
            isOffer: false,
            image: "",
            images: [],
            variants: []
          };
          products.push(newProduct);
          touchedProducts.push(newProduct);
          addedCount++;
        }
      });

      const saved = await Store.saveProducts(products);
      if (saved === false) {
        alert("تعذّر حفظ التغييرات على الخادم. حدّث الصفحة وأعد المحاولة.");
        return;
      }
      await syncProductsToAlgolia(touchedProducts);

      alert(`تمت العملية بنجاح!\n- تم تحديث: ${updatedCount} منتج\n- تمت إضافة: ${addedCount} منتج جديد`);
      renderProductsTable();
      renderStats();
    } catch (error) {
      console.error("Excel import error:", error);
      alert("حدث خطأ أثناء قراءة الملف.");
    } finally {
      fileInput.value = "";
    }
  });
}

/* ---------------------------------------------------------------------- */
/* رفع الصور ومعالجتها عبر ImageKit CDN                                   */
/* ---------------------------------------------------------------------- */

async function uploadToImgBB(file, isBanner = false) {
  if (!file) throw new Error("لم يتم اختيار ملف");

  const MAX_SIZE_MB = 5;
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    const errorMsg = `حجم الصورة كبير جداً! الحد الأقصى هو ${MAX_SIZE_MB}MB.`;
    showToast(errorMsg, "error");
    throw new Error(errorMsg);
  }

  const apiKey = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imgbbApiKey || "").trim();
  if (!apiKey) throw new Error("لم يتم إعداد مفتاح ImgBB في config.js.");

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    body: formData
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error((data.error && data.error.message) || "فشل رفع الصورة إلى ImgBB.");
  }

  const rawUrl = data.data.url;
  const imageKitEndpoint = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imageKitEndpoint || "").trim().replace(/\/+$/, "");

  if (!imageKitEndpoint) return rawUrl;

  const match = rawUrl.match(/^https?:\/\/i\.ibb\.co\/(.+)$/);
  if (!match) return rawUrl;

  const transform = isBanner ? "tr:w-1400,q-90,f-webp" : "tr:w-900,q-85,f-webp";
  return imageKitEndpoint + "/" + transform + "/" + match[1];
}

/* ---------------------------------------------------------------------- */
/* التنقل والقائمة الجانبية                                              */
/* ---------------------------------------------------------------------- */

function wireSidebarNav() {
  const buttons = document.querySelectorAll(".admin-nav button[data-panel]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      buttons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll(".admin-panel-view").forEach(function (p) { p.style.display = "none"; });
      document.getElementById("panel-" + btn.dataset.panel).style.display = "block";
      
      const sidebar = document.querySelector(".admin-sidebar");
      const overlay = document.querySelector(".sidebar-overlay");
      if (sidebar) sidebar.classList.remove("active", "open");
      if (overlay) overlay.classList.remove("active");
    });
  });
}

window.toggleAdminSidebar = function() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
};

/* ---------------------------------------------------------------------- */
/* الإحصائيات                                                             */
/* ---------------------------------------------------------------------- */

function renderStats() {
  const products = Store.getProducts();
  const outOfStock = products.filter(function (p) { return !Store.isProductAvailable(p); }).length;
  const stats = [
    { num: products.length, label: "إجمالي المنتجات" },
    { num: Store.getCategories().length, label: "الأقسام" },
    { num: outOfStock, label: "منتجات غير متوفرة" },
    { num: Store.getOrders().length, label: "طلبات عبر واتساب" }
  ];
  const el = document.getElementById("statsRow");
  if (!el) return;
  el.innerHTML = stats.map(function (s) {
    return '<div class="stat-card"><div class="num">' + s.num + '</div><div class="label">' + s.label + "</div></div>";
  }).join("");
}

/* ---------------------------------------------------------------------- */
/* جدول المنتجات                                                          */
/* ---------------------------------------------------------------------- */

const ADMIN_PRODUCTS_PAGE_SIZE = 40;
let adminProductsShown = ADMIN_PRODUCTS_PAGE_SIZE;
let adminProductsLastQuery = "";
let adminProductsSearchTimer = null;

function adminProductMatches(p, q) {
  return (p.name && String(p.name).toLowerCase().includes(q)) ||
         (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
         (p.sku && String(p.sku).toLowerCase().includes(q));
}

function adminProductRowHtml(p) {
  const thumbUrl = (typeof window.getIkUrl === "function" && p.image) ? window.getIkUrl(p.image, 96, 60) : (p.image || "");
  const img = thumbUrl
    ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" width="44" height="44" loading="lazy" decoding="async" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">'
    : '<div class="admin-table-icon">' + iconSvg("box") + "</div>";
  const statusPill = Store.isProductAvailable(p)
    ? '<span class="pill pill-ok">متوفر</span>'
    : '<span class="pill pill-off" style="color: #dc2626; background: #fee2e2; border: 1px solid #fca5a5; font-weight: bold;">غير متوفر</span>';

  const tags = [];
  if (p.featured) tags.push("مميز");
  if (p.isNew) tags.push("جديد");
  if (p.isOffer) tags.push("عرض🔥");

  const code = p.barcode || p.sku;
  const barcodeDisplay = code
    ? '<span style="font-family:monospace; background:var(--olive-50); padding:3px 8px; border-radius:6px; border:1px solid var(--line); font-size:0.85rem;">' + escapeHtml(code) + "</span>"
    : '<span style="color:var(--ink-300); font-size:0.85rem;">—</span>';

  const id = escapeHtml(p.id);
  return (
    "<tr>" +
      "<td>" + img + "</td>" +
      "<td>" + barcodeDisplay + "</td>" +
      "<td>" + escapeHtml(p.name) + (tags.length ? ' <span class="field-hint" style="color:var(--danger);">(' + tags.join(" / ") + ")</span>" : "") + "</td>" +
      "<td>" + escapeHtml(Store.getCategoryName(p.categoryId)) + "</td>" +
      "<td>" + formatPrice(p.price) + "</td>" +
      "<td>" + (Store.getTotalStock ? Store.getTotalStock(p) : p.stock) + "</td>" +
      "<td>" + statusPill + "</td>" +
      '<td class="row-actions">' +
        '<button class="btn-icon btn-sm" title="تعديل" data-act="edit" data-id="' + id + '">' + iconSvg("edit") + "</button>" +
        '<button class="btn-icon btn-sm" title="حذف" data-act="del" data-id="' + id + '">' + iconSvg("trash") + "</button>" +
      "</td>" +
    "</tr>"
  );
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;

  const query = ((document.getElementById("adminProductSearch") || {}).value || "").trim().toLowerCase();
  if (query !== adminProductsLastQuery) {
    adminProductsLastQuery = query;
    adminProductsShown = ADMIN_PRODUCTS_PAGE_SIZE;
  }

  let products = Store.getProducts().filter(Boolean);
  if (query) products = products.filter(function (p) { return adminProductMatches(p, query); });

  const total = products.length;
  if (!total) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد منتجات</td></tr>';
    return;
  }

  const visible = products.slice(0, adminProductsShown);
  let html = visible.map(adminProductRowHtml).join("");
  if (total > visible.length) {
    html += '<tr class="admin-more-row"><td colspan="8" style="text-align:center;padding:16px;">' +
      '<button type="button" class="btn btn-outline btn-sm" data-act="more">عرض المزيد (' + visible.length + " من " + total + ")</button>" +
      "</td></tr>";
  }
  tbody.innerHTML = html;
}

function wireProductsTableEvents() {
  const tbody = document.getElementById("productsTableBody");
  if (tbody && !tbody.dataset.wired) {
    tbody.dataset.wired = "1";
    tbody.addEventListener("click", function (e) {
      const btn = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "more") {
        adminProductsShown += ADMIN_PRODUCTS_PAGE_SIZE;
        renderProductsTable();
      } else if (act === "edit") {
        openProductModal(btn.dataset.id);
      } else if (act === "del") {
        deleteProductConfirm(btn.dataset.id);
      }
    });
  }
  const search = document.getElementById("adminProductSearch");
  if (search && !search.dataset.wired) {
    search.dataset.wired = "1";
    search.addEventListener("input", function () {
      clearTimeout(adminProductsSearchTimer);
      adminProductsSearchTimer = setTimeout(renderProductsTable, 250);
    });
  }
}

async function deleteProductConfirm(id) {
  const product = Store.getProduct(id);
  if (!product) return;
  if (confirm('هل تريد حذف المنتج "' + product.name + '"؟')) {
    if (!ensureProductsWritable()) return;
    const ok = await Store.deleteProduct(id);
    if (ok === false) {
      showToast("تعذّر حذف المنتج من الخادم.", "error");
      return;
    }
    await deleteProductFromAlgolia(id);
    renderProductsTable();
    renderStats();
    showToast("تم حذف المنتج", "success");
  }
}

function populateCategorySelect() {
  const select = document.getElementById("productCategorySelect");
  if (!select) return;
  select.innerHTML = Store.getCategories().map(function (c) {
    return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + "</option>";
  }).join("");
}

/* ---------------------------------------------------------------------- */
/* خيارات المنتج مع صورها الخاصة (Variants)                                */
/* ---------------------------------------------------------------------- */

function renderVariantsList() {
  const list = document.getElementById("variantsList");
  const stockInput = document.getElementById("productStock");
  const stockLabel = document.getElementById("productStockLabel");
  if (!list) return;

  if (!pendingVariants.length) {
    list.innerHTML = "";
    if (stockInput) stockInput.readOnly = false;
    if (stockLabel) stockLabel.textContent = "الكمية المتوفرة الكلية";
    return;
  }

  list.innerHTML = pendingVariants.map((v, idx) => {
    const thumb = v.image
      ? `<img src="${escapeHtml(v.image)}" style="width:100%;height:100%;object-fit:cover;">`
      : iconSvg("image");

    return `
      <div class="variant-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; background:#fff; padding:12px; border-radius:8px; border:1px solid var(--line);">
        <div style="flex:1; min-width:140px;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:3px;">اسم الخيار (مثال: حجم كبير / لون أسود)</label>
          <input type="text" placeholder="اسم الخيار" value="${escapeHtml(v.name || "")}" data-v-idx="${idx}" class="v-name-inp" style="width:100%; padding:8px; border:1px solid var(--line); border-radius:6px;">
        </div>

        <div style="min-width:140px;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:3px;">صورة الخيار</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <div id="vImgPreview_${idx}" style="width:38px; height:38px; border-radius:6px; overflow:hidden; border:1px solid var(--line); display:flex; align-items:center; justify-content:center; background:var(--surface-2); flex-shrink:0;">
              ${thumb}
            </div>
            <input type="file" accept="image/*" class="v-image-inp" data-v-idx="${idx}" style="font-size:0.75rem; width:110px;">
          </div>
        </div>

        <div style="width:80px;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:3px;">الكمية</label>
          <input type="number" min="0" placeholder="0" value="${Number(v.stock) || 0}" data-v-idx="${idx}" class="v-stock-inp" style="width:100%; padding:8px; border:1px solid var(--line); border-radius:6px; text-align:center;">
        </div>

        <div style="display:flex; align-items:flex-end; padding-top:16px;">
          <button type="button" class="btn-icon btn-sm" style="color:var(--danger); background:#fee2e2; border-radius:6px; width:36px; height:36px;" title="حذف الخيار" onclick="removeVariantRow(${idx})">
            ${iconSvg("trash")}
          </button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".v-name-inp").forEach(inp => {
    inp.addEventListener("input", function() {
      pendingVariants[Number(this.dataset.vIdx)].name = this.value;
    });
  });

  list.querySelectorAll(".v-stock-inp").forEach(inp => {
    inp.addEventListener("input", function() {
      pendingVariants[Number(this.dataset.vIdx)].stock = Math.max(0, parseInt(this.value, 10) || 0);
      updateVariantsTotalStock();
    });
  });

  list.querySelectorAll(".v-image-inp").forEach(inp => {
    inp.addEventListener("change", async function() {
      const idx = Number(this.dataset.vIdx);
      const file = this.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع صورة الخيار...");
        const url = await uploadToImgBB(file, false);
        pendingVariants[idx].image = url;
        showToast("تم رفع صورة الخيار بنجاح!", "success");
        renderVariantsList();
      } catch (err) {
        showToast(err.message || "فشل رفع الصورة", "error");
      }
    });
  });

  if (stockLabel) stockLabel.textContent = "إجمالي المخزون (محسوب تلقائياً من الخيارات)";
  if (stockInput) stockInput.readOnly = true;
  updateVariantsTotalStock();
}

function updateVariantsTotalStock() {
  const stockInput = document.getElementById("productStock");
  if (!stockInput || !pendingVariants.length) return;
  const total = pendingVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  stockInput.value = total;
}

window.removeVariantRow = function(idx) {
  pendingVariants.splice(idx, 1);
  renderVariantsList();
};

/* ---------------------------------------------------------------------- */
/* نافذة المنتج                                                           */
/* ---------------------------------------------------------------------- */

function wireProductModal() {
  const addBtn = document.getElementById("addProductBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openProductModal(null); });

  const closeBtn = document.getElementById("closeProductModal");
  if (closeBtn) closeBtn.addEventListener("click", closeProductModal);

  const form = document.getElementById("productForm");
  if (form) form.addEventListener("submit", saveProductForm);

  const imageInput = document.getElementById("productImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع الصورة الرئيسية...");
        const imageUrl = await uploadToImgBB(file, false);
        pendingProductImage = imageUrl;
        document.getElementById("productImagePreview").innerHTML = '<img src="' + escapeHtml(imageUrl) + '">';
        showToast("تم رفع الصورة بنجاح!", "success");
      } catch (error) {
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeProductImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingProductImage = null;
      if (document.getElementById("productImageInput")) document.getElementById("productImageInput").value = "";
      document.getElementById("productImagePreview").innerHTML = iconSvg("box");
    });
  }

  const addVariantBtn = document.getElementById("addVariantBtn");
  if (addVariantBtn) {
    addVariantBtn.addEventListener("click", function () {
      pendingVariants.push({
        name: "خيار " + (pendingVariants.length + 1),
        image: "",
        stock: 1
      });
      renderVariantsList();
    });
  }
}

window.removeExtraImage = function(index) {
  if (!confirm("هل تريد حذف هذه الصورة من المعرض؟")) return;
  if (editingProductId) {
    if (!ensureProductsWritable()) return;
    const p = Store.getProduct(editingProductId);
    if (p && p.images) {
      p.images.splice(index, 1);
      Store.updateProduct(editingProductId, { images: p.images });
      openProductModal(editingProductId);
      showToast("تم حذف الصورة", "success");
    }
  }
};

function openProductModal(productId) {
  editingProductId = productId;
  pendingProductImage = null;
  pendingVariants = [];
  populateCategorySelect();

  const modal = document.getElementById("productModal");
  const title = document.getElementById("productModalTitle");
  const form = document.getElementById("productForm");
  form.reset();

  const preview = document.getElementById("productImagePreview");
  const extraImagesInput = document.getElementById("productExtraImagesInput");
  const extraImagesPreview = document.getElementById("extraImagesPreview");
  if (extraImagesInput) extraImagesInput.value = "";
  if (extraImagesPreview) extraImagesPreview.innerHTML = "";

  if (productId) {
    const p = Store.getProduct(productId);
    title.textContent = "تعديل المنتج";
    if (document.getElementById("productBarcode")) document.getElementById("productBarcode").value = p.barcode || p.sku || "";
    document.getElementById("productName").value = p.name;
    document.getElementById("productDescription").value = p.description || "";
    document.getElementById("productPrice").value = p.price;
    if (document.getElementById("productOldPrice")) document.getElementById("productOldPrice").value = p.oldPrice || "";
    document.getElementById("productCategorySelect").value = p.categoryId;
    document.getElementById("productStock").value = p.stock;
    
    document.getElementById("productAvailable").checked = p.available;
    document.getElementById("productFeatured").checked = !!p.featured;
    document.getElementById("productNew").checked = !!p.isNew;
    if (document.getElementById("productOffer")) document.getElementById("productOffer").checked = !!p.isOffer; 
    
    pendingProductImage = p.image || null;
    preview.innerHTML = p.image ? '<img src="' + escapeHtml(p.image) + '">' : iconSvg("box");
    
    if (p.images && p.images.length > 0 && extraImagesPreview) {
      extraImagesPreview.innerHTML = p.images.map((img, idx) => `
        <div style="position:relative; display:inline-block; margin-left:10px; margin-bottom:10px;">
          <img src="${escapeHtml(img)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line-strong);">
          <button type="button" onclick="removeExtraImage(${idx})" title="حذف الصورة" style="position:absolute; top:-6px; right:-6px; background:var(--danger); color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
        </div>
      `).join('');
    }

    if (Array.isArray(p.variants) && p.variants.length > 0) {
      pendingVariants = p.variants.map(v => Object.assign({}, v));
    } else if (Array.isArray(p.colors) && p.colors.length > 0) {
      pendingVariants = p.colors.map(c => ({
        name: c.name || "لون",
        image: c.image || "",
        stock: p.stock || 1
      }));
    }
    renderVariantsList();
  } else {
    title.textContent = "إضافة منتج جديد";
    if (document.getElementById("productBarcode")) document.getElementById("productBarcode").value = "";
    document.getElementById("productAvailable").checked = true;
    preview.innerHTML = iconSvg("box");
    renderVariantsList();
  }

  modal.classList.add("open");
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("open");
  editingProductId = null;
}

async function saveProductForm(e) {
  e.preventDefault();

  const _oldPriceEl = document.getElementById("productOldPrice");
  const _oldPriceVal = _oldPriceEl ? (Number(_oldPriceEl.value) || 0) : 0;
  const _newPriceVal = Number(document.getElementById("productPrice").value) || 0;
  const _offerOn = document.getElementById("productOffer") ? document.getElementById("productOffer").checked : false;
  
  if (_offerOn && _oldPriceVal && _oldPriceVal <= _newPriceVal) {
    showToast("السعر القديم يجب أن يكون أكبر من السعر الجديد", "error");
    return;
  }

  const cleanVariants = pendingVariants
    .filter(v => (v.name && v.name.trim()) || v.image)
    .map(v => ({
      name: v.name.trim(),
      image: v.image || null,
      stock: Number(v.stock) || 0
    }));

  let totalStock = Number(document.getElementById("productStock").value) || 0;
  if (cleanVariants.length > 0) {
    totalStock = cleanVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }

  const extraImagesInput = document.getElementById("productExtraImagesInput");
  let extraImagesUrls = [];

  if (editingProductId) {
    const existingProduct = Store.getProduct(editingProductId);
    if (existingProduct && existingProduct.images) {
      extraImagesUrls = existingProduct.images;
    }
  }

  if (extraImagesInput && extraImagesInput.files.length > 0) {
    showToast("جاري رفع الصور الإضافية...");
    try {
      const uploadPromises = Array.from(extraImagesInput.files).map(file => uploadToImgBB(file, false));
      const uploadedUrls = await Promise.all(uploadPromises);
      extraImagesUrls = extraImagesUrls.concat(uploadedUrls.filter(Boolean));
    } catch (err) {
      showToast(err.message || "حدث خطأ أثناء رفع الصور الإضافية", "error");
      return;
    }
  }

  if (!pendingProductImage) {
    if (extraImagesUrls.length > 0) {
      pendingProductImage = extraImagesUrls.shift();
    } else if (cleanVariants.length > 0) {
      const varWithImg = cleanVariants.find(v => v.image);
      if (varWithImg) pendingProductImage = varWithImg.image;
    }
  }

  const barcodeVal = document.getElementById("productBarcode") ? document.getElementById("productBarcode").value.trim() : "";

  const data = {
    barcode: barcodeVal,
    sku: barcodeVal,
    name: document.getElementById("productName").value.trim(),
    description: document.getElementById("productDescription").value.trim(),
    price: Number(document.getElementById("productPrice").value) || 0,
    oldPrice: _oldPriceVal,
    categoryId: document.getElementById("productCategorySelect").value,
    stock: totalStock,
    available: document.getElementById("productAvailable").checked,
    featured: document.getElementById("productFeatured").checked,
    isNew: document.getElementById("productNew").checked,
    isOffer: _offerOn,
    variants: cleanVariants,
    image: pendingProductImage,
    images: extraImagesUrls
  };

  if (!data.name || !data.categoryId) {
    showToast("يرجى تعبئة اسم المنتج واختيار القسم", "error");
    return;
  }

  if (!ensureProductsWritable()) return;

  let savedProduct = null;
  if (editingProductId) {
    data.id = editingProductId;
    Store.updateProduct(editingProductId, data);
    savedProduct = Store.getProduct(editingProductId);
  } else {
    savedProduct = Store.addProduct(data);
  }

  const persisted = await Store.whenProductsSaved();
  if (persisted === false) {
    showToast("لم يُحفظ المنتج على الخادم. تحقق من الاتصال.", "error");
    return;
  }
  showToast(editingProductId ? "تم تحديث المنتج" : "تمت إضافة المنتج", "success");

  if (savedProduct) {
    await syncProductsToAlgolia([savedProduct]);
  }

  closeProductModal();
  renderProductsTable();
  renderStats();
}

/* ---------------------------------------------------------------------- */
/* الأقسام والإعلانات والطلبات                                           */
/* ---------------------------------------------------------------------- */

function renderCategoriesTable() {
  const tbody = document.getElementById("categoriesTableBody");
  if (!tbody) return;
  const categories = Store.getCategories();
  const products = Store.getProducts();

  if (!categories.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد أقسام</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(function (c) {
    const count = products.filter(function (p) { return p.categoryId === c.id; }).length;
    const thumbUrl = (typeof window.getIkUrl === "function" && c.image) ? window.getIkUrl(c.image, 160, 70) : (c.image || "");
    const img = thumbUrl ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:50%;">' : '<div class="admin-table-icon">' + iconSvg(c.icon || "box") + "</div>";
    
    const parent = c.parentId ? categories.find(function(x) { return x.id === c.parentId; }) : null;
    const displayName = parent 
      ? escapeHtml(c.name) + '<br><small style="color:var(--ink-400);">↳ فرعي من: ' + escapeHtml(parent.name) + '</small>' 
      : '<strong>' + escapeHtml(c.name) + '</strong>';

    return (
      "<tr>" +
        "<td>" + img + "</td>" +
        "<td>" + displayName + "</td>" +
        "<td>" + count + " منتج</td>" +
        '<td class="row-actions">' +
          '<button class="btn-icon btn-sm" title="تعديل" onclick="openCategoryModal(' + jsStr(c.id) + ')">' + iconSvg("edit") + "</button>" +
          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteCategoryConfirm(' + jsStr(c.id) + ')">' + iconSvg("trash") + "</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
}

function deleteCategoryConfirm(id) {
  const category = Store.getCategories().find(function (c) { return c.id === id; });
  if (!category) return;
  const childCount = Store.getCategories().filter(function (c) { return c.parentId === id; }).length;
  if (childCount) {
    showToast('لا يمكن حذف "' + category.name + '" لأن له ' + childCount + ' قسم فرعي.', "error");
    return;
  }
  if (confirm('هل تريد حذف القسم "' + category.name + '"؟')) {
    Store.deleteCategory(id);
    bumpMetaVersion();
    renderCategoriesTable();
    populateCategorySelect();
    renderStats();
    showToast("تم حذف القسم", "success");
  }
}

function populateIconPicker() {
  const wrap = document.getElementById("categoryIconPicker");
  if (!wrap) return;
  wrap.innerHTML = CATEGORY_ICON_KEYS.map(function (key) {
    return '<label class="icon-choice" title="' + key + '"><input type="radio" name="categoryIcon" value="' + key + '">' +
      '<span>' + iconSvg(key) + "</span></label>";
  }).join("");
  wrap.querySelectorAll('input[name="categoryIcon"]').forEach(function (r) {
    r.addEventListener("change", syncIconPickerActive);
  });
}

function syncIconPickerActive() {
  document.querySelectorAll("#categoryIconPicker .icon-choice").forEach(function (label) {
    const input = label.querySelector("input");
    label.classList.toggle("active", !!(input && input.checked));
  });
}

function wireCategoryModal() {
  const addBtn = document.getElementById("addCategoryBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openCategoryModal(null); });
  const closeBtn = document.getElementById("closeCategoryModal");
  if (closeBtn) closeBtn.addEventListener("click", closeCategoryModal);
  const form = document.getElementById("categoryForm");
  if (form) form.addEventListener("submit", saveCategoryForm);

  const imageInput = document.getElementById("categoryImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع صورة القسم...");
        const imageUrl = await uploadToImgBB(file, false);
        pendingCategoryImage = imageUrl;
        const preview = document.getElementById("categoryImagePreview");
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '">';
        showToast("تم الرفع بنجاح!", "success");
      } catch (error) {
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeCategoryImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingCategoryImage = null;
      if (document.getElementById("categoryImageInput")) document.getElementById("categoryImageInput").value = "";
      document.getElementById("categoryImagePreview").innerHTML = iconSvg("box");
    });
  }
}

function populateParentCategorySelect(currentCategoryId, selectedParentId) {
  const parentSelect = document.getElementById("categoryParentSelect");
  if (!parentSelect) return;

  const allCats = Store.getCategories() || [];
  
  // تصفية الأقسام لتشمل فقط الأقسام الرئيسية وتستبعد القسم الحالي نفسه
  const mainCats = allCats.filter(function(c) {
    if (!c || !c.id) return false;
    if (currentCategoryId && c.id === currentCategoryId) return false;
    return !c.parentId || c.parentId === "";
  });

  let optionsHtml = '<option value="">-- قسم رئيسي مستقل --</option>';
  mainCats.forEach(function(c) {
    const isSelected = selectedParentId && c.id === selectedParentId;
    optionsHtml += '<option value="' + escapeHtml(c.id) + '"' + (isSelected ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
  });

  parentSelect.innerHTML = optionsHtml;
  
  // تعطيل القائمة إذا كان القسم الحالي لديه أقسام فرعية بالفعل
  const hasSubCategories = currentCategoryId && allCats.some(function(cc) { return cc.parentId === currentCategoryId; });
  parentSelect.disabled = !!hasSubCategories;
}

function openCategoryModal(categoryId) {
  editingCategoryId = categoryId;
  pendingCategoryImage = null;
  populateIconPicker();
  
  const modal = document.getElementById("categoryModal");
  const title = document.getElementById("categoryModalTitle");
  const form = document.getElementById("categoryForm");
  form.reset();

  const preview = document.getElementById("categoryImagePreview");
  const nameInput = document.getElementById("categoryName");

  const allCats = Store.getCategories();

  if (categoryId) {
    const c = allCats.find(function (cc) { return cc.id === categoryId; });
    title.textContent = "تعديل القسم";
    if (nameInput && c) nameInput.value = c.name;
    
    populateParentCategorySelect(categoryId, c ? c.parentId : "");

    pendingCategoryImage = (c && c.image) ? c.image : null;
    if (preview) preview.innerHTML = (c && c.image) ? '<img src="' + escapeHtml(c.image) + '">' : iconSvg((c && c.icon) || "box");
    const radio = form.querySelector('input[name="categoryIcon"][value="' + CSS.escape(String((c && c.icon) || "")) + '"]');
    if (radio) radio.checked = true;
    syncIconPickerActive();
  } else {
    title.textContent = "إضافة قسم جديد";
    populateParentCategorySelect(null, "");
    if (preview) preview.innerHTML = iconSvg("box");
    const first = form.querySelector('input[name="categoryIcon"]');
    if (first) first.checked = true;
    syncIconPickerActive();
  }
  
  modal.classList.add("open");
}

function closeCategoryModal() {
  document.getElementById("categoryModal").classList.remove("open");
  editingCategoryId = null;
}

function saveCategoryForm(e) {
  e.preventDefault();
  const name = document.getElementById("categoryName").value.trim();
  const parentSelect = document.getElementById("categoryParentSelect");
  const parentId = parentSelect ? parentSelect.value : "";
  const iconInput = document.querySelector('input[name="categoryIcon"]:checked');
  const existing = editingCategoryId ? Store.getCategories().find(function (c) { return c.id === editingCategoryId; }) : null;
  const icon = iconInput ? iconInput.value : ((existing && existing.icon) || "box");

  if (!name) { showToast("يرجى إدخال اسم القسم", "error"); return; }

  if (editingCategoryId) {
    Store.updateCategory(editingCategoryId, { name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });
    showToast("تم تحديث القسم", "success");
  } else {
    Store.addCategory({ name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });
    showToast("تمت إضافة القسم", "success");
  }

  bumpMetaVersion();
  closeCategoryModal();
  renderCategoriesTable();
  populateCategorySelect();
}

function renderAdsTable() {
  const tbody = document.getElementById("adsTableBody");
  if (!tbody) return;
  const ads = Store.getAds().sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!ads.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد إعلانات حالياً</td></tr>';
    return;
  }

  tbody.innerHTML = ads.map(function (ad) {
    const thumbUrl = (typeof window.getIkUrl === "function" && ad.image) ? window.getIkUrl(ad.image, 160, 70) : (ad.image || "");
    const img = thumbUrl ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" style="width:80px;height:40px;border-radius:4px;object-fit:cover;">' : '<div class="admin-table-icon">' + iconSvg("image") + "</div>";
    const link = ad.link ? '<a href="' + escapeHtml(safeUrl(ad.link)) + '" rel="noopener noreferrer" target="_blank" style="color:var(--olive-700);text-decoration:underline;">عرض الرابط</a>' : '-';
    
    return (
      "<tr>" +
        "<td>" + img + "</td>" +
        "<td>" + link + "</td>" +
        "<td>" + (ad.order || 0) + "</td>" +
        '<td class="row-actions">' +
          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteAdConfirm(' + jsStr(ad.id) + ')">' + iconSvg("trash") + "</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
}

function deleteAdConfirm(id) {
  if (confirm('هل تريد حذف هذا الإعلان؟')) {
    Store.deleteAd(id);
    bumpMetaVersion();
    renderAdsTable();
    showToast("تم حذف الإعلان", "success");
  }
}

function wireAdModal() {
  const addBtn = document.getElementById("addAdBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openAdModal(); });
  const closeBtn = document.getElementById("closeAdModal");
  if (closeBtn) closeBtn.addEventListener("click", closeAdModal);
  const form = document.getElementById("adForm");
  if (form) form.addEventListener("submit", saveAdForm);

  const imageInput = document.getElementById("adImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع الإعلان...");
        const imageUrl = await uploadToImgBB(file, true);
        pendingAdImage = imageUrl;
        const preview = document.getElementById("adImagePreview");
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">';
        showToast("تم رفع الإعلان بنجاح!", "success");
      } catch (error) {
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeAdImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingAdImage = null;
      if (document.getElementById("adImageInput")) document.getElementById("adImageInput").value = "";
      const preview = document.getElementById("adImagePreview");
      if (preview) preview.innerHTML = "";
    });
  }
}

function openAdModal() {
  pendingAdImage = null;
  const modal = document.getElementById("adModal");
  const form = document.getElementById("adForm");
  if (form) form.reset();
  const preview = document.getElementById("adImagePreview");
  if (preview) preview.innerHTML = "";
  if (modal) modal.classList.add("open");
}

function closeAdModal() {
  const modal = document.getElementById("adModal");
  if (modal) modal.classList.remove("open");
}

function saveAdForm(e) {
  e.preventDefault();
  if (!pendingAdImage) {
    showToast("يرجى رفع صورة للإعلان", "error");
    return;
  }
  const data = {
    link: document.getElementById("adLink") ? document.getElementById("adLink").value.trim() : "",
    order: document.getElementById("adOrder") ? Number(document.getElementById("adOrder").value) : 0,
    image: pendingAdImage
  };

  Store.addAd(data);
  bumpMetaVersion();
  showToast("تمت إضافة الإعلان بنجاح", "success");
  closeAdModal();
  renderAdsTable();
}

window.changeOrderStatus = async function(orderId, selectElement) {
  const newStatus = selectElement.value;
  const order = Store.getOrders().find(o => o.id === orderId);
  if (!order) return;
  const previousStatus = order.status || "pending";

  if (newStatus === "prepared" && !order.stockDeducted) {
    if (!confirm("هل تريد تأكيد تجهيز الطلب وخصم المنتجات من المخزون تلقائياً؟")) {
      selectElement.value = previousStatus;
      return;
    }
    if (!ensureProductsWritable()) { selectElement.value = previousStatus; return; }

    showToast("جاري التحديث وخصم الكميات...");
    const products = Store.getProducts();
    const byId = new Map(products.map(p => [String(p.id), p]));
    const touched = new Map();

    (order.items || []).forEach(function (item) {
      const product = byId.get(String(item.productId));
      const qty = Math.floor(Number(item.qty)) || 0;
      if (!product || qty <= 0) return;

      if (Array.isArray(product.variants) && product.variants.length > 0 && item.variant) {
        const v = product.variants.find(x => x.name === item.variant);
        if (v && Number(v.stock) >= qty) {
          v.stock = Number(v.stock) - qty;
          product.stock = product.variants.reduce((s, x) => s + (Number(x.stock) || 0), 0);
          touched.set(product.id, product);
        }
      } else if ((Number(product.stock) || 0) >= qty) {
        product.stock = Number(product.stock) - qty;
        touched.set(product.id, product);
      }
    });

    if (touched.size > 0) {
      await Store.saveProducts(products);
      await syncProductsToAlgolia(Array.from(touched.values()));
    }

    await updateOrderInFirebase(order.id, { status: "prepared", stockDeducted: true });
    showToast("تم تجهيز الطلب بنجاح!", "success");
  } else {
    await updateOrderInFirebase(order.id, { status: newStatus });
    showToast("تم تحديث حالة الطلب.", "success");
  }

  renderOrdersTable();
};

window.updateOrderInFirebase = async function(orderId, patch) {
  if (typeof database !== "undefined" && database) {
    try {
      const snapshot = await database.ref("ws_orders").orderByChild("id").equalTo(orderId).once("value");
      if (!snapshot.exists()) return false;
      const writes = [];
      snapshot.forEach(function (child) { writes.push(child.ref.update(patch)); });
      await Promise.all(writes);
    } catch (e) {
      console.error("Error updating order in FB", e);
      return false;
    }
  }
  const list = Store.getOrders().map(o => o.id === orderId ? Object.assign({}, o, patch) : o);
  LS.set("ws_orders", JSON.stringify(list));
  return true;
};

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  const orders = Store.getOrders().slice(0, 300);
  const targets = [tbody, document.getElementById("ordersTableBody2")].filter(Boolean);

  if (!orders.length) {
    targets.forEach(function (t) {
      t.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد طلبات مسجّلة بعد</td></tr>';
    });
    return;
  }

  const rowsHtml = orders.map(function (o) {
    const date = escapeHtml(new Date(o.date).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }));
    
    const itemsList = (o.items || []).map(function (it) {
      const optHtml = it.variant ? ' <small style="color:var(--primary);">(' + escapeHtml(it.variant) + ')</small>' : '';
      const qty = Number(it.qty) || 1;
      return `
        <li class="order-item">
          <span class="order-item-qty" dir="ltr">×${qty}</span>
          <span class="order-item-name">${escapeHtml(it.name || "منتج")}${optHtml}</span>
        </li>
      `;
    }).join("");

    const summary = itemsList ? `<ul class="order-items">${itemsList}</ul>` : '<span class="order-items-empty">—</span>';
    const cust = o.customer || {};
    let customerHtml = '<span style="color:var(--ink-400);font-size:.85rem;">بدون بيانات توصيل</span>';
    if (cust.phone || cust.gov || cust.name) {
      customerHtml = 
        '<div style="font-size:.85rem;line-height:1.4;white-space:nowrap;">' +
          (cust.name ? '<strong style="color:var(--primary);display:block;margin-bottom:3px;font-size:0.92rem;">👤 ' + escapeHtml(cust.name) + '</strong>' : '') +
          (cust.phone ? '<a href="tel:' + escapeHtml(String(cust.phone).replace(/[^0-9+]/g, "")) + '" style="font-weight:700;color:var(--olive-700);text-decoration:underline;" dir="ltr">' + escapeHtml(cust.phone) + '</a><br>' : '') +
          '<span>' + escapeHtml(cust.gov || "") + (cust.area ? ' — ' + escapeHtml(cust.area) : '') + '</span>' +
        '</div>';
    }

    const status = o.status || 'pending';
    const deducted = o.stockDeducted ? true : false;
    let statusHtml = `
      <select class="order-status-select" onchange="changeOrderStatus(${jsStr(o.id)}, this)" style="padding:6px; border-radius:6px; font-size:0.85rem; border:1px solid var(--line-strong); background:#fff; cursor:pointer;">
        <option value="pending" ${status === 'pending' ? 'selected' : ''}>قيد المعالجة ⏳</option>
        <option value="prepared" ${status === 'prepared' ? 'selected' : ''}>تم التجهيز ✅</option>
        <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>ملغي ❌</option>
      </select>
    `;
    
    if (deducted) {
      statusHtml += `<div style="font-size:0.75rem; color:var(--success); margin-top:6px; font-weight:bold; white-space:nowrap;">(تم خصم المخزون)</div>`;
    }

    return (
      "<tr>" +
        "<td>" + date + "</td>" +
        "<td>" + customerHtml + "</td>" +
        '<td style="white-space:nowrap;">' + (o.type === "cart" ? "سلة كاملة" : "منتج واحد") + "</td>" +
        "<td>" + summary + "</td>" +
        '<td style="white-space:nowrap;font-weight:700;">' + formatPrice(o.total) + "</td>" +
        "<td>" + statusHtml + "</td>" + 
      "</tr>"
    );
  }).join("");

  targets.forEach(function (t) { t.innerHTML = rowsHtml; });
}

function fillSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  const s = Store.getSettings();
  form.storeName.value = s.storeName || "";
  form.storeTagline.value = s.storeTagline || "";
  form.storeDescription.value = s.storeDescription || "";
  form.whatsapp.value = s.whatsapp || "";
  form.instagram.value = s.instagram || "";
  if (form.tiktok) form.tiktok.value = s.tiktok || "";
  form.phone.value = s.phone || "";
  if (form.phone2) form.phone2.value = s.phone2 || "";
  if (form.mapUrl) form.mapUrl.value = s.mapUrl || "";
  form.address.value = s.address || "";
  form.workingHours.value = s.workingHours || "";
  form.deliveryInfo.value = s.deliveryInfo || "";
  form.currencySymbol.value = s.currencySymbol || "د.ع";
}

function wireSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const patch = {
      storeName: form.storeName.value.trim(),
      storeTagline: form.storeTagline.value.trim(),
      storeDescription: form.storeDescription.value.trim(),
      whatsapp: whatsappDigitsOnly(form.whatsapp.value),
      instagram: form.instagram.value.trim(),
      tiktok: form.tiktok ? form.tiktok.value.trim() : Store.getSettings().tiktok || "",
      phone: form.phone.value.trim(),
      phone2: form.phone2 ? form.phone2.value.trim() : (Store.getSettings().phone2 || ""),
      mapUrl: form.mapUrl ? form.mapUrl.value.trim() : "",
      address: form.address.value.trim(),
      workingHours: form.workingHours.value.trim(),
      deliveryInfo: form.deliveryInfo.value.trim(),
      currencySymbol: form.currencySymbol.value.trim() || "د.ع"
    };

    Store.saveSettings(patch);
    bumpMetaVersion();
    showToast("تم حفظ الإعدادات بنجاح", "success");
  });
}

document.addEventListener("DOMContentLoaded", initAdminPage);
