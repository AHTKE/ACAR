/* ============================================================
   warehouse-catalog.js — إدارة المخازن والأصناف
   ------------------------------------------------------------
   التنقّل: كل المخازن ← مخزن ← تصنيف ← صنف ← تفاصيل وحركات.
   • كل صنف له سعر شراء وسعر بيع وحد تنبيه ومواصفات وملاحظات.
   • الرصيد يُحسب من حركات app_stores الفعلية (داخل/خارج/مرتجع).
   • لو سعر الشراء/البيع غير مسجّل في الكتالوج، بنعرض آخر سعر
     من حركة شراء/بيع فعلية بدل ما يظهر صفر.
   • الكتالوج محفوظ في app_store_catalog، وحركات المخزن نفسها
     تفضل في app_stores من غير أي تغيير.
   ============================================================ */
(function (root) {
  'use strict';

  var KEY = 'app_store_catalog';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'cat' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
    return isFinite(n) ? n : 0;
  }
  function positive(v) { return Math.max(0, num(v)); }

  function app() { return root.NizamApp || null; }
  function money(v) {
    var a = app();
    if (a && a.money) { try { return a.money(v); } catch (e) {} }
    return num(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function fmtDate(v) {
    var a = app();
    if (a && a.formatDate) { try { return a.formatDate(v); } catch (e) {} }
    return String(v || '');
  }
  function fmtQty(v) {
    var n = num(v);
    return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function toast(msg, bad) {
    var a = app();
    if (a && a.toast) { try { a.toast(msg, bad); return; } catch (e) {} }
    try { console.log(msg); } catch (e) {}
  }
  function getNames() {
    var a = app();
    if (a && a.getStoreNames) {
      try {
        var names = a.getStoreNames();
        if (Array.isArray(names) && names.length) return names;
      } catch (e) {}
    }
    return ['المخزن الأساسي'];
  }
  function allDocs() {
    var a = app();
    if (a && a.getStores) {
      try {
        var v = a.getStores();
        if (v && Array.isArray(v.docs)) return v.docs;
      } catch (e) {}
    }
    return [];
  }
  function balance(item, store) {
    var a = app();
    if (a && a.storeItemBalance) {
      try { return num(a.storeItemBalance(item, store)); } catch (e) {}
    }
    return 0;
  }

  /* ---------- الكتالوج ---------- */
  function cleanCatalog(v) {
    var out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    Object.keys(v).forEach(function (store) {
      var w = v[store];
      if (!w || typeof w !== 'object' || !store) return;
      var cats = Array.isArray(w.categories) ? w.categories : [];
      out[String(store)] = {
        categories: cats.filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
          var items = Array.isArray(c.items) ? c.items : [];
          return {
            id: String(c.id || uid()),
            name: String(c.name || 'بدون تصنيف').trim(),
            items: items.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
              return {
                id: String(x.id || uid()),
                name: String(x.name || '').trim(),
                unit: String(x.unit || '').trim(),
                buyPrice: positive(x.buyPrice != null ? x.buyPrice : (x.purchasePrice != null ? x.purchasePrice : x.cost)),
                sellPrice: positive(x.sellPrice != null ? x.sellPrice : (x.salePrice != null ? x.salePrice : x.price)),
                minQty: positive(x.minQty),
                notes: String(x.notes || ''),
                specs: Array.isArray(x.specs) ? x.specs.filter(function (s) { return s && typeof s === 'object'; }).map(function (s) {
                  return { key: String(s.key || '').trim(), value: String(s.value || '').trim() };
                }).filter(function (s) { return s.key || s.value; }) : []
              };
            }).filter(function (x) { return x.name; })
          };
        }).filter(function (c) { return c.name; })
      };
    });
    return out;
  }
  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return cleanCatalog(JSON.parse(raw));
    } catch (e) {}
    return {};
  }
  function writeAll(v) {
    try { localStorage.setItem(KEY, JSON.stringify(cleanCatalog(v))); } catch (e) {}
  }
  function ensureStore(all, store) {
    if (!all[store]) all[store] = { categories: [] };
    return all[store];
  }

  /* ---------- الحركات والأسعار ---------- */
  function movementsFor(docs, store, item) {
    var nm = String(item || '').trim();
    var st = String(store || '').trim();
    var rows = [];
    (docs || []).forEach(function (d, i) {
      if (!d || String(d.item || '').trim() !== nm) return;
      if (st && String(d.store || '').trim() !== st) return;
      rows.push({ d: d, i: i });
    });
    rows.sort(function (a, b) {
      var da = String(a.d.date || ''), db = String(b.d.date || '');
      return da === db ? a.i - b.i : da.localeCompare(db);
    });
    return rows.map(function (x) { return x.d; });
  }
  function latestPrice(mv, type) {
    var found = null;
    (mv || []).forEach(function (d) { if (d.type === type) found = d; });
    return found ? positive(found.price) : 0;
  }
  function itemMetrics(it, store, docs) {
    var qty = balance(it.name, store);
    var mv = movementsFor(docs, store, it.name);
    var storedBuy = positive(it.buyPrice), storedSell = positive(it.sellPrice);
    var lastBuy = latestPrice(mv, 'in'), lastSell = latestPrice(mv, 'out');
    var buy = storedBuy > 0 ? storedBuy : lastBuy;
    var sell = storedSell > 0 ? storedSell : lastSell;
    var minQty = positive(it.minQty);
    var margin = sell - buy;
    return {
      qty: qty,
      buy: buy,
      sell: sell,
      buyAuto: !(storedBuy > 0) && lastBuy > 0,
      sellAuto: !(storedSell > 0) && lastSell > 0,
      minQty: minQty,
      low: qty <= (minQty > 0 ? minQty : 0),
      margin: margin,
      marginPct: buy > 0 ? (margin / buy) * 100 : 0,
      stockValue: qty * buy,
      saleValue: qty * sell,
      movements: mv
    };
  }
  function categoryMetrics(cat, store, docs) {
    var m = { items: 0, qty: 0, stockValue: 0, saleValue: 0, low: 0 };
    (cat.items || []).forEach(function (it) {
      var x = itemMetrics(it, store, docs);
      m.items++;
      m.qty += x.qty;
      m.stockValue += x.stockValue;
      m.saleValue += x.saleValue;
      if (x.low) m.low++;
    });
    return m;
  }
  function storeMetrics(w, store, docs) {
    var m = { categories: 0, items: 0, qty: 0, stockValue: 0, saleValue: 0, low: 0 };
    (w && w.categories || []).forEach(function (cat) {
      var x = categoryMetrics(cat, store, docs);
      m.categories++;
      m.items += x.items;
      m.qty += x.qty;
      m.stockValue += x.stockValue;
      m.saleValue += x.saleValue;
      m.low += x.low;
    });
    return m;
  }
  function statusBadge(m) {
    if (m.qty <= 0) return '<span class="tag tag--out">نافد</span>';
    if (m.low) return '<span class="tag tag--warn">تحت الحد</span>';
    return '<span class="tag tag--in">متوفر</span>';
  }
  function priceHtml(v, auto) {
    if (!(v > 0)) return '<span class="wh-muted">—</span>';
    return money(v) + (auto ? '<small class="wh-auto">آخر حركة</small>' : '');
  }
  function marginHtml(m) {
    if (!(m.buy > 0) || !(m.sell > 0)) return '<span class="wh-muted">—</span>';
    return '<span class="' + (m.margin < 0 ? 'neg' : 'pos') + '">' + money(m.margin) + '</span>' +
      '<small class="wh-auto">' + (Math.round(m.marginPct * 10) / 10) + '%</small>';
  }

  /* ---------- الحالة والواجهة ---------- */
  var state = { store: '', category: '', item: '', formOpen: false, editId: '' };
  var bound = false;

  function inject() {
    if (document.getElementById('storeCatalogPanel')) return;
    var anchor = document.getElementById('storeShortagePanel');
    if (!anchor || !anchor.parentNode) return;
    var html = '' +
      '<div class="panel" id="storeCatalogPanel">' +
        '<div class="wh-head">' +
          '<div>' +
            '<h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-truck"/></svg> إدارة المخازن والأصناف</h3>' +
            '<p class="panel__hint">ادخل على المخزن، بعدين التصنيف، وشوف كل صنف بكميته وسعر شراءه وسعر بيعه وتفاصيله. الرصيد بيتحسب من حركات المخزن الفعلية.</p>' +
          '</div>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-wh-root>كل المخازن</button>' +
        '</div>' +
        '<nav class="wh-crumbs" id="catalogCrumbs" aria-label="مسار المخزن"></nav>' +
        '<div id="catalogView"></div>' +
      '</div>';
    anchor.insertAdjacentHTML('afterend', html);
  }

  function kpi(label, value, sub, cls) {
    return '<div class="wh-kpi ' + (cls || '') + '"><small>' + esc(label) + '</small><b>' + value + '</b>' +
      (sub ? '<span>' + sub + '</span>' : '') + '</div>';
  }
  function emptyBox(title, text, action) {
    return '<div class="wh-empty"><b>' + esc(title) + '</b><p>' + esc(text) + '</p>' +
      (action || '') + '</div>';
  }

  function renderCrumbs() {
    var box = document.getElementById('catalogCrumbs');
    if (!box) return;
    var h = '<button type="button" class="wh-crumb' + (!state.store ? ' is-current' : '') + '" data-wh-root>المخازن</button>';
    if (state.store) {
      h += '<span class="wh-crumb__sep">‹</span>';
      h += '<button type="button" class="wh-crumb' + (!state.category ? ' is-current' : '') + '" data-wh-store-nav>' + esc(state.store) + '</button>';
    }
    if (state.category) {
      var all = readAll();
      var w = all[state.store];
      var cat = w && (w.categories || []).filter(function (c) { return c.id === state.category; })[0];
      if (cat) {
        h += '<span class="wh-crumb__sep">‹</span>';
        h += '<button type="button" class="wh-crumb' + (!state.item ? ' is-current' : '') + '" data-wh-cat-nav>' + esc(cat.name) + '</button>';
      }
    }
    if (state.item) {
      h += '<span class="wh-crumb__sep">‹</span><span class="wh-crumb is-current">تفاصيل الصنف</span>';
    }
    box.innerHTML = h;
  }

  function storeCard(name, w, docs) {
    var m = storeMetrics(w, name, docs);
    return '<button type="button" class="wh-store-card" data-wh-store="' + esc(name) + '">' +
      '<span class="wh-store-card__top"><span class="wh-store-card__icon">▦</span><b>' + esc(name) + '</b>' +
        (m.low ? '<span class="tag tag--warn">' + m.low + ' تحت الحد</span>' : '') + '</span>' +
      '<span class="wh-store-card__stats">' +
        '<span><small>التصنيفات</small><b>' + m.categories + '</b></span>' +
        '<span><small>الأصناف</small><b>' + m.items + '</b></span>' +
        '<span><small>الرصيد</small><b>' + fmtQty(m.qty) + '</b></span>' +
      '</span>' +
      '<span class="wh-store-card__foot"><span>شراء: <b>' + money(m.stockValue) + '</b></span>' +
        '<span>بيع متوقع: <b>' + money(m.saleValue) + '</b></span></span>' +
      '<span class="wh-store-card__open">فتح المخزن ←</span>' +
    '</button>';
  }

  function renderRoot(all, names, docs) {
    var totals = { categories: 0, items: 0, qty: 0, stockValue: 0, saleValue: 0, low: 0 };
    names.forEach(function (nm) {
      var m = storeMetrics(all[nm], nm, docs);
      totals.categories += m.categories;
      totals.items += m.items;
      totals.qty += m.qty;
      totals.stockValue += m.stockValue;
      totals.saleValue += m.saleValue;
      totals.low += m.low;
    });
    var view = document.getElementById('catalogView');
    if (!view) return;
    view.innerHTML =
      '<div class="wh-kpis">' +
        kpi('المخازن', names.length, 'مخزن مسجّل') +
        kpi('التصنيفات', totals.categories, 'داخل كل المخازن') +
        kpi('الأصناف', totals.items, 'أصناف بالكتالوج') +
        kpi('قيمة المخزون', money(totals.stockValue), 'بسعر الشراء', 'wh-kpi--in') +
        kpi('قيمة البيع المتوقعة', money(totals.saleValue), 'بسعر البيع', 'wh-kpi--ok') +
        kpi('تحت الحد', totals.low, 'أصناف محتاجة متابعة', totals.low ? 'wh-kpi--warn' : '') +
      '</div>' +
      '<div class="wh-section-head"><div><h4>المخازن</h4><p>اختار مخزن عشان تدخل على تصنيفاته وأصنافه.</p></div></div>' +
      '<div class="wh-store-grid">' + names.map(function (nm) {
        return storeCard(nm, all[nm], docs);
      }).join('') + '</div>' +
      '<form class="wh-inline-form" id="catalogStoreForm">' +
        '<input type="text" name="storeName" id="catalogNewStore" placeholder="اسم مخزن جديد — مثال: مخزن الحديد" autocomplete="off" />' +
        '<button type="submit" class="btn btn--ghost btn--sm">＋ إضافة مخزن</button>' +
      '</form>';
  }

  function categoryCard(cat, store, docs) {
    var m = categoryMetrics(cat, store, docs);
    return '<div class="wh-cat-card" data-wh-cat="' + esc(cat.id) + '" role="button" tabindex="0">' +
      '<div class="wh-cat-card__head"><div><b>' + esc(cat.name) + '</b><small>' + m.items + ' صنف</small></div>' +
        '<button type="button" class="wh-card-del" data-wh-cat-del="' + esc(cat.id) + '" title="حذف التصنيف">×</button></div>' +
      '<div class="wh-cat-card__stats">' +
        '<div><small>الرصيد</small><b>' + fmtQty(m.qty) + '</b></div>' +
        '<div><small>قيمة الشراء</small><b>' + money(m.stockValue) + '</b></div>' +
        '<div><small>قيمة البيع</small><b>' + money(m.saleValue) + '</b></div>' +
      '</div>' +
      '<div class="wh-cat-card__foot">' + (m.low ? '<span class="tag tag--warn">' + m.low + ' تحت الحد</span>' : '<span class="tag tag--in">سليم</span>') +
        '<span class="wh-open-link">فتح التصنيف ←</span></div>' +
    '</div>';
  }

  function renderStoreView(all, names, docs) {
    var store = state.store;
    var w = all[store] || { categories: [] };
    var m = storeMetrics(w, store, docs);
    var view = document.getElementById('catalogView');
    if (!view) return;
    view.innerHTML =
      '<div class="wh-view-head">' +
        '<div><button type="button" class="btn btn--ghost btn--sm" data-wh-root>← كل المخازن</button>' +
          '<h4 class="wh-view-title">' + esc(store) + '</h4><p>تصنيفات المخزن وأصنافه — اختار تصنيف عشان تشوف الكميات والأسعار.</p></div>' +
        '<button type="button" class="btn btn--primary btn--sm" data-wh-new-cat>＋ تصنيف جديد</button>' +
      '</div>' +
      '<div class="wh-kpis">' +
        kpi('التصنيفات', m.categories, 'فئة داخل المخزن') +
        kpi('الأصناف', m.items, 'صنف مسجّل') +
        kpi('إجمالي الرصيد', fmtQty(m.qty), 'كمية في المخزن') +
        kpi('قيمة الشراء', money(m.stockValue), 'بسعر الشراء', 'wh-kpi--in') +
        kpi('قيمة البيع', money(m.saleValue), 'بسعر البيع', 'wh-kpi--ok') +
        kpi('تحت الحد', m.low, 'أصناف محتاجة متابعة', m.low ? 'wh-kpi--warn' : '') +
      '</div>' +
      '<div class="wh-cat-grid">' + (w.categories.length ? w.categories.map(function (cat) {
        return categoryCard(cat, store, docs);
      }).join('') : emptyBox('لا توجد تصنيفات في «' + store + '»', 'ابدأ بإضافة تصنيف مثل «حديد تسليح» أو «أسمنت»، وبعدها أضف الأصناف والأسعار.')) + '</div>' +
      '<form class="wh-inline-form" id="catalogCategoryForm">' +
        '<input type="text" name="categoryName" id="catalogNewCategory" placeholder="اسم تصنيف جديد — مثال: حديد تسليح" autocomplete="off" />' +
        '<button type="submit" class="btn btn--ghost btn--sm">＋ إضافة تصنيف</button>' +
      '</form>';
  }

  function itemRow(it, store, docs) {
    var m = itemMetrics(it, store, docs);
    var specs = (it.specs || []).map(function (s) {
      return '<span class="spec-chip">' + esc(s.key) + ': ' + esc(s.value) + '</span>';
    }).join('');
    return '<tr>' +
      '<td><button type="button" class="link-btn wh-item-link" data-wh-item="' + esc(it.id) + '">' + esc(it.name) + '</button>' +
        (specs ? '<div class="wh-row-specs">' + specs + '</div>' : '') + '</td>' +
      '<td><b>' + fmtQty(m.qty) + '</b> ' + (it.unit ? '<small>' + esc(it.unit) + '</small>' : '') + '</td>' +
      '<td>' + priceHtml(m.buy, m.buyAuto) + '</td>' +
      '<td>' + priceHtml(m.sell, m.sellAuto) + '</td>' +
      '<td>' + marginHtml(m) + '</td>' +
      '<td class="wh-money">' + money(m.stockValue) + '</td>' +
      '<td class="wh-money">' + money(m.saleValue) + '</td>' +
      '<td>' + statusBadge(m) + '</td>' +
      '<td><div class="wh-row-actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-wh-item="' + esc(it.id) + '">تفاصيل</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-wh-edit="' + esc(it.id) + '">تعديل</button>' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-wh-del-item="' + esc(it.id) + '">حذف</button>' +
      '</div></td>' +
    '</tr>';
  }

  function specRow(key, val) {
    return '<div class="custom-row wh-spec-row">' +
      '<input type="text" data-spec-key placeholder="اسم المواصفة (مقاس / لون / طول)" value="' + esc(key || '') + '" />' +
      '<input type="text" data-spec-val placeholder="القيمة" value="' + esc(val || '') + '" />' +
      '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-wh-spec-del title="حذف المواصفة">×</button>' +
    '</div>';
  }
  function fillSpecRows(specs) {
    var box = document.getElementById('catalogSpecRows');
    if (!box) return;
    box.innerHTML = (specs && specs.length ? specs : [{ key: 'المقاس', value: '' }]).map(function (s) {
      return specRow(s.key, s.value);
    }).join('');
  }
  function readSpecs() {
    var out = [];
    $$('#catalogSpecRows .wh-spec-row').forEach(function (row) {
      var k = row.querySelector('[data-spec-key]');
      var v = row.querySelector('[data-spec-val]');
      k = String(k && k.value || '').trim();
      v = String(v && v.value || '').trim();
      if (k || v) out.push({ key: k, value: v });
    });
    return out;
  }

  function itemFormHTML(it) {
    var editing = !!it;
    return '<form id="catalogItemForm" class="wh-form" novalidate>' +
      '<input type="hidden" name="itemId" value="' + esc(it ? it.id : '') + '" />' +
      '<div class="wh-form__head"><div><h4>' + (editing ? 'تعديل الصنف' : 'إضافة صنف جديد') + '</h4>' +
        '<p>سعر الشراء وسعر البيع اختياريان، ولو سبتهما فاضي هنعرض آخر سعر من حركات المخزن.</p></div>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-wh-cancel-form>إلغاء</button></div>' +
      '<div class="form__row form__row--3">' +
        '<label class="field"><span>اسم الصنف *</span><input type="text" name="name" required value="' + esc(it ? it.name : '') + '" placeholder="مثال: حديد 12 مم" autocomplete="off" /></label>' +
        '<label class="field"><span>الوحدة</span><input type="text" name="unit" value="' + esc(it ? it.unit : '') + '" placeholder="متر / طن / قطعة / شيكارة" autocomplete="off" /></label>' +
        '<label class="field"><span>حد التنبيه</span><input type="number" name="minQty" min="0" step="any" value="' + esc(it ? (it.minQty || '') : '') + '" placeholder="مثال: 10" /></label>' +
      '</div>' +
      '<div class="form__row form__row--3">' +
        '<label class="field"><span>سعر الشراء للوحدة</span><input type="number" name="buyPrice" min="0" step="any" value="' + esc(it ? (it.buyPrice || '') : '') + '" placeholder="0" /></label>' +
        '<label class="field"><span>سعر البيع للوحدة</span><input type="number" name="sellPrice" min="0" step="any" value="' + esc(it ? (it.sellPrice || '') : '') + '" placeholder="0" /></label>' +
        '<label class="field"><span>ملاحظة</span><input type="text" name="notes" value="' + esc(it ? it.notes : '') + '" placeholder="تفاصيل إضافية عن الصنف" autocomplete="off" /></label>' +
      '</div>' +
      '<div class="field field--full"><span>المواصفات والمقاسات</span><div id="catalogSpecRows"></div>' +
        '<div class="form__actions" style="margin:8px 0 0"><button type="button" class="btn btn--ghost btn--sm" data-wh-spec-add>＋ إضافة مواصفة</button></div></div>' +
      '<p class="form__error" id="catalogItemError" hidden></p>' +
      '<div class="form__actions"><button type="submit" class="btn btn--primary btn--sm">حفظ الصنف</button></div>' +
    '</form>';
  }

  function renderCategoryView(all, names, docs) {
    var store = state.store;
    var w = all[store] || { categories: [] };
    var cat = (w.categories || []).filter(function (c) { return c.id === state.category; })[0];
    if (!cat) { state.category = ''; return render(); }
    var m = categoryMetrics(cat, store, docs);
    var editItem = state.editId ? (cat.items || []).filter(function (x) { return x.id === state.editId; })[0] : null;
    if (editItem) state.formOpen = true;
    var view = document.getElementById('catalogView');
    if (!view) return;
    view.innerHTML =
      '<div class="wh-view-head">' +
        '<div><button type="button" class="btn btn--ghost btn--sm" data-wh-store-nav>← ' + esc(store) + '</button>' +
          '<h4 class="wh-view-title">' + esc(cat.name) + '</h4><p>أصناف التصنيف بالكميات والأسعار — اضغط على اسم الصنف لعرض كل تفاصيله وحركاته.</p></div>' +
        '<button type="button" class="btn btn--primary btn--sm" data-wh-new-item>＋ إضافة صنف</button>' +
      '</div>' +
      '<div class="wh-kpis">' +
        kpi('الأصناف', m.items, 'داخل التصنيف') +
        kpi('إجمالي الرصيد', fmtQty(m.qty), 'كمية') +
        kpi('قيمة الشراء', money(m.stockValue), 'بسعر الشراء', 'wh-kpi--in') +
        kpi('قيمة البيع', money(m.saleValue), 'بسعر البيع', 'wh-kpi--ok') +
        kpi('تحت الحد', m.low, 'أصناف محتاجة متابعة', m.low ? 'wh-kpi--warn' : '') +
      '</div>' +
      (state.formOpen ? itemFormHTML(editItem) : '') +
      '<div class="table-wrap wh-table-wrap"><table class="table wh-items-table">' +
        '<thead><tr><th>الصنف / المواصفات</th><th>الرصيد</th><th>سعر الشراء</th><th>سعر البيع</th><th>هامش الربح</th>' +
          '<th>قيمة الشراء</th><th>قيمة البيع</th><th>الحالة</th><th>إجراءات</th></tr></thead>' +
        '<tbody>' + ((cat.items || []).length ? cat.items.map(function (it) {
          return itemRow(it, store, docs);
        }).join('') : '<tr><td colspan="9" class="wh-table-empty">لا توجد أصناف في هذا التصنيف — اضغط «إضافة صنف» وسجّل الكمية وسعر الشراء وسعر البيع.</td></tr>') + '</tbody>' +
      '</table></div>';
    if (state.formOpen) fillSpecRows(editItem ? editItem.specs : null);
  }

  function renderItemView(all, names, docs) {
    var store = state.store;
    var w = all[store] || { categories: [] };
    var cat = (w.categories || []).filter(function (c) { return c.id === state.category; })[0];
    if (!cat) { state.category = ''; return render(); }
    var it = (cat.items || []).filter(function (x) { return x.id === state.item; })[0];
    if (!it) { state.item = ''; return render(); }
    var m = itemMetrics(it, store, docs);
    var specs = (it.specs || []).map(function (s) {
      return '<span class="spec-chip">' + esc(s.key) + ': ' + esc(s.value) + '</span>';
    }).join('');
    var running = 0;
    var moves = m.movements.map(function (d) {
      var q = num(d.qty);
      running += d.type === 'out' ? -q : q;
      return { d: d, running: running };
    }).reverse();
    var view = document.getElementById('catalogView');
    if (!view) return;
    view.innerHTML =
      '<div class="wh-view-head">' +
        '<div><button type="button" class="btn btn--ghost btn--sm" data-wh-cat-nav>← ' + esc(cat.name) + '</button>' +
          '<h4 class="wh-view-title">' + esc(it.name) + '</h4><p>' + esc(store) + ' / ' + esc(cat.name) + ' — كل تفاصيل الصنف وحركاته.</p></div>' +
        '<div class="wh-head__actions"><button type="button" class="btn btn--ghost btn--sm" data-wh-edit="' + esc(it.id) + '">تعديل الصنف</button>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-wh-del-item="' + esc(it.id) + '">حذف</button></div>' +
      '</div>' +
      '<div class="wh-kpis">' +
        kpi('الرصيد الحالي', fmtQty(m.qty) + (it.unit ? ' ' + it.unit : ''), 'من حركات المخزن', m.qty <= 0 ? 'wh-kpi--warn' : '') +
        kpi('سعر الشراء', priceHtml(m.buy, m.buyAuto), 'للوحدة', 'wh-kpi--in') +
        kpi('سعر البيع', priceHtml(m.sell, m.sellAuto), 'للوحدة', 'wh-kpi--ok') +
        kpi('هامش الربح', m.buy > 0 && m.sell > 0 ? money(m.margin) + ' (' + (Math.round(m.marginPct * 10) / 10) + '%)' : '—', 'فرق البيع عن الشراء') +
        kpi('قيمة المخزون', money(m.stockValue), 'بسعر الشراء') +
        kpi('قيمة البيع المتوقعة', money(m.saleValue), 'بسعر البيع') +
        kpi('حد التنبيه', fmtQty(m.minQty), m.minQty > 0 ? 'ينبه عند الوصول له' : 'غير محدد') +
      '</div>' +
      '<div class="wh-detail-grid">' +
        '<div class="wh-detail-box"><h4>المواصفات</h4>' +
          (specs ? '<div class="wh-specs">' + specs + '</div>' : '<p class="wh-muted">لا توجد مواصفات مسجّلة.</p>') +
          (it.notes ? '<p class="wh-note"><b>ملاحظة:</b> ' + esc(it.notes) + '</p>' : '') +
        '</div>' +
        '<div class="wh-detail-box"><h4>ملخص الصنف</h4><div class="wh-info-list">' +
          '<div><span>الوحدة</span><b>' + (it.unit ? esc(it.unit) : '—') + '</b></div>' +
          '<div><span>عدد الحركات</span><b>' + m.movements.length + '</b></div>' +
          '<div><span>الحالة</span><b>' + statusBadge(m) + '</b></div>' +
          '<div><span>هامش الربح</span><b>' + marginHtml(m) + '</b></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="wh-section-head"><div><h4>حركة الصنف</h4><p>الأحدث أولاً — الرصيد بعد كل حركة محسوب من البداية.</p></div></div>' +
      '<div class="table-wrap wh-table-wrap"><table class="table wh-moves-table">' +
        '<thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الرصيد بعد</th><th>الطرف</th><th>ملاحظة</th></tr></thead>' +
        '<tbody>' + (moves.length ? moves.map(function (x) {
          var d = x.d;
          var lbl = d.type === 'in' ? 'دواخل' : d.type === 'out' ? 'خوارج' : 'مرتجع';
          var cls = d.type === 'out' ? 'tag--out' : 'tag--in';
          return '<tr><td>' + esc(fmtDate(d.date)) + '</td>' +
            '<td><span class="tag ' + cls + '">' + lbl + '</span></td>' +
            '<td class="' + (d.type === 'out' ? 'neg' : 'pos') + '">' + (d.type === 'out' ? '- ' : '+ ') + fmtQty(d.qty) + '</td>' +
            '<td>' + money(d.price) + '</td><td>' + money(d.total) + '</td>' +
            '<td><b>' + fmtQty(x.running) + '</b></td>' +
            '<td>' + esc(d.partyName || '—') + '</td><td class="wh-note-cell">' + esc(d.note || '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="8" class="wh-table-empty">لا توجد حركات لهذا الصنف بعد. سجّل دواخل أو خوارج من نموذج حركة المخزن وستظهر هنا.</td></tr>') + '</tbody>' +
      '</table></div>';
  }

  function render() {
    inject();
    bind();
    var panel = document.getElementById('storeCatalogPanel');
    if (!panel) return;
    var names = getNames();
    if (state.store && names.indexOf(state.store) === -1) {
      state.store = ''; state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
    }
    var all = readAll();
    names.forEach(function (nm) { ensureStore(all, nm); });
    renderCrumbs();
    var docs = allDocs();
    if (state.category) {
      var w = all[state.store];
      var cat = w && (w.categories || []).filter(function (c) { return c.id === state.category; })[0];
      if (!cat) { state.category = ''; state.item = ''; }
      else if (state.item && !(cat.items || []).some(function (x) { return x.id === state.item; })) state.item = '';
    }
    if (state.item && !state.category) state.item = '';
    if (state.item) renderItemView(all, names, docs);
    else if (state.category) renderCategoryView(all, names, docs);
    else if (state.store) renderStoreView(all, names, docs);
    else renderRoot(all, names, docs);
  }

  function saveAndRefresh(all) {
    writeAll(all);
    var a = app();
    if (a && a.fillStoreSuggests) { try { a.fillStoreSuggests(); } catch (e) {} }
    render();
  }

  /* ---------- إضافة / تعديل ---------- */
  function addStoreFromForm(form) {
    var f = form.elements;
    var name = String(f.storeName.value || '').trim();
    if (!name) { toast('اكتب اسم المخزن الأول', true); return; }
    if (name.length > 40) { toast('اسم المخزن طويل — 40 حرف كحد أقصى', true); return; }
    var names = getNames();
    var existed = names.indexOf(name) > -1;
    var a = app();
    if (!existed && a && a.addStore) {
      try { if (!a.addStore(name)) return; } catch (e) { toast('تعذّر إضافة المخزن', true); return; }
    }
    var all = readAll();
    ensureStore(all, name);
    state.store = name; state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
    saveAndRefresh(all);
    toast(existed ? 'المخزن «' + name + '» موجود بالفعل' : 'تمت إضافة المخزن «' + name + '» ✓', existed);
  }

  function addCategoryFromForm(form) {
    var f = form.elements;
    var name = String(f.categoryName.value || '').trim();
    if (!name) { toast('اكتب اسم التصنيف الأول', true); return; }
    var store = state.store;
    if (!store) return;
    var all = readAll();
    var w = ensureStore(all, store);
    if (w.categories.some(function (c) { return c.name === name; })) { toast('التصنيف «' + name + '» موجود بالفعل', true); return; }
    var cat = { id: uid(), name: name, items: [] };
    w.categories.push(cat);
    writeAll(all);
    state.category = cat.id; state.item = ''; state.formOpen = false; state.editId = '';
    render();
    toast('تمت إضافة تصنيف «' + name + '» ✓');
  }

  function saveItemForm(form) {
    var f = form.elements;
    var name = String(f.name.value || '').trim();
    var err = document.getElementById('catalogItemError');
    var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
    if (!name) return fail('اسم الصنف مطلوب');
    var store = state.store;
    var all = readAll();
    var w = ensureStore(all, store);
    var cat = w.categories.filter(function (c) { return c.id === state.category; })[0];
    if (!cat) return fail('التصنيف غير موجود — ارجع واختار تصنيفًا');
    var id = String(f.itemId.value || '');
    var item = {
      id: id || uid(),
      name: name,
      unit: String(f.unit.value || '').trim(),
      buyPrice: positive(f.buyPrice.value),
      sellPrice: positive(f.sellPrice.value),
      minQty: positive(f.minQty.value),
      notes: String(f.notes.value || '').trim(),
      specs: readSpecs()
    };
    var dup = false;
    w.categories.forEach(function (c) {
      (c.items || []).forEach(function (x) {
        if (x.name === name && x.id !== id) dup = true;
      });
    });
    if (dup) return fail('اسم الصنف «' + name + '» موجود بالفعل في هذا المخزن — أضف المقاس/المواصفة للاسم لتمييزه');
    if (id) {
      var idx = -1;
      cat.items.forEach(function (x, i) { if (x.id === id) idx = i; });
      if (idx === -1) return fail('الصنف غير موجود');
      cat.items[idx] = item;
    } else {
      cat.items.push(item);
    }
    if (err) err.hidden = true;
    writeAll(all);
    state.formOpen = false;
    state.editId = '';
    if (id) { state.item = id; toast('تم تعديل الصنف «' + name + '» ✓'); }
    else { state.item = ''; toast('تمت إضافة الصنف «' + name + '» إلى «' + cat.name + '» ✓'); }
    saveAndRefresh(all);
  }

  function deleteCategory(id) {
    var store = state.store;
    var all = readAll();
    var w = ensureStore(all, store);
    var cat = w.categories.filter(function (c) { return c.id === id; })[0];
    if (!cat) return;
    if (root.confirm && !root.confirm('حذف تصنيف «' + cat.name + '» وكل أصنافه من الكتالوج؟ حركات المخزن التاريخية تبقى كما هي.')) return;
    w.categories = w.categories.filter(function (c) { return c.id !== id; });
    if (state.category === id) { state.category = ''; state.item = ''; }
    saveAndRefresh(all);
    toast('تم حذف التصنيف من الكتالوج');
  }

  function deleteItem(id) {
    var store = state.store;
    var all = readAll();
    var w = ensureStore(all, store);
    var removed = '';
    w.categories.forEach(function (c) {
      c.items = (c.items || []).filter(function (it) {
        if (it.id === id) { removed = it.name; return false; }
        return true;
      });
    });
    if (!removed) return;
    if (root.confirm && !root.confirm('حذف الصنف «' + removed + '» من الكتالوج؟ حركات المخزن التاريخية تبقى كما هي.')) return;
    if (state.item === id) state.item = '';
    if (state.editId === id) { state.editId = ''; state.formOpen = false; }
    saveAndRefresh(all);
    toast('تم حذف الصنف من الكتالوج');
  }

  /* ---------- الأحداث ---------- */
  function bind() {
    if (bound) return;
    var panel = document.getElementById('storeCatalogPanel');
    if (!panel) return;
    bound = true;

    panel.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-wh-del-item]')) { deleteItem(t.closest('[data-wh-del-item]').getAttribute('data-wh-del-item')); return; }
      if (t.closest('[data-wh-cat-del]')) { deleteCategory(t.closest('[data-wh-cat-del]').getAttribute('data-wh-cat-del')); return; }
      if (t.closest('[data-wh-root]')) {
        state.store = ''; state.category = ''; state.item = ''; state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-store-nav]')) {
        state.category = ''; state.item = ''; state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-cat-nav]')) {
        state.item = ''; state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-store]')) {
        state.store = t.closest('[data-wh-store]').getAttribute('data-wh-store');
        state.category = ''; state.item = ''; state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-cat]')) {
        state.category = t.closest('[data-wh-cat]').getAttribute('data-wh-cat');
        state.item = ''; state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-item]')) {
        state.item = t.closest('[data-wh-item]').getAttribute('data-wh-item'); state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-edit]')) {
        state.editId = t.closest('[data-wh-edit]').getAttribute('data-wh-edit'); state.formOpen = true; state.item = ''; render(); return;
      }
      if (t.closest('[data-wh-new-item]')) {
        state.formOpen = true; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-cancel-form]')) {
        state.formOpen = false; state.editId = ''; render(); return;
      }
      if (t.closest('[data-wh-new-cat]')) {
        var ci = document.getElementById('catalogNewCategory');
        if (ci) ci.focus();
        return;
      }
      if (t.closest('[data-wh-spec-add]')) {
        var box = document.getElementById('catalogSpecRows');
        if (box) box.insertAdjacentHTML('beforeend', specRow('', ''));
        return;
      }
      if (t.closest('[data-wh-spec-del]')) {
        var row = t.closest('.wh-spec-row');
        if (row) row.remove();
        return;
      }
    });

    panel.addEventListener('submit', function (ev) {
      if (!ev.target) return;
      if (ev.target.id === 'catalogStoreForm') { ev.preventDefault(); addStoreFromForm(ev.target); }
      else if (ev.target.id === 'catalogCategoryForm') { ev.preventDefault(); addCategoryFromForm(ev.target); }
      else if (ev.target.id === 'catalogItemForm') { ev.preventDefault(); saveItemForm(ev.target); }
    });

    /* التنقّل من شريط المخازن أو فلتر العرض أو نموذج الحركة */
    function syncFromFilter(value) {
      if (!value || value === 'all') { state.store = ''; state.category = ''; state.item = ''; }
      else { state.store = value; state.category = ''; state.item = ''; }
      state.formOpen = false; state.editId = '';
      render();
    }
    var storeFilter = document.getElementById('storeFilter');
    if (storeFilter) storeFilter.addEventListener('change', function () { syncFromFilter(this.value); });
    var storePick = document.getElementById('storePick');
    if (storePick) storePick.addEventListener('change', function () {
      if (this.value) { state.store = this.value; state.category = ''; state.item = ''; state.formOpen = false; state.editId = ''; render(); }
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var pick = t.closest('[data-store-pick]');
      if (pick && !t.closest('[data-store-del]')) {
        state.store = pick.getAttribute('data-store-pick') || '';
        state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
        setTimeout(render, 60);
        return;
      }
      if (t.closest('#addStoreBtn')) {
        var inp = document.getElementById('newStoreName');
        var nm = String(inp && inp.value || '').trim();
        if (nm) {
          state.store = nm; state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
        }
        setTimeout(render, 100);
      }
    });
    document.addEventListener('nizam:store-data-changed', function () { render(); });
    document.addEventListener('nizam:stores-changed', function (ev) {
      var d = ev && ev.detail ? ev.detail : {};
      var all = readAll();
      var names = getNames();
      if (d.type === 'add' && d.name) {
        ensureStore(all, d.name);
        state.store = d.name; state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
      }
      if (d.type === 'delete' && d.name) {
        var gone = all[d.name];
        var target = String(d.target || '').trim();
        if (gone) {
          if (target && target !== d.name) {
            var tw = ensureStore(all, target);
            (gone.categories || []).forEach(function (cat) {
              var existing = tw.categories.filter(function (c) { return c.name === cat.name; })[0];
              if (!existing) {
                tw.categories.push(cat);
                return;
              }
              (cat.items || []).forEach(function (it) {
                var exists = (existing.items || []).some(function (x) { return x.name === it.name; });
                if (!exists) existing.items.push(it);
              });
            });
          }
          delete all[d.name];
        }
        if (state.store === d.name) {
          state.store = ''; state.category = ''; state.item = ''; state.formOpen = false; state.editId = '';
        }
      }
      writeAll(all);
      render();
    });
  }

  function itemOptions(store) {
    store = String(store || '').trim();
    var all = readAll();
    var w = all[store];
    if (!w) return '';
    var names = [];
    (w.categories || []).forEach(function (c) {
      (c.items || []).forEach(function (it) {
        if (it.name && names.indexOf(it.name) === -1) names.push(it.name);
      });
    });
    return names.map(function (nm) { return '<option value="' + esc(nm) + '"></option>'; }).join('');
  }

  function start() {
    inject();
    bind();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  root.WarehouseCatalog = { render: render, itemOptions: itemOptions, KEY: KEY };
})(typeof window !== 'undefined' ? window : this);
