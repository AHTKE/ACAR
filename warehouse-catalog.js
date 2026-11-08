/* ============================================================
   warehouse-catalog.js — تصنيف المخازن
   ------------------------------------------------------------
   مخزن ← تصنيف/فئة ← صنف ← مواصفات (مقاس/لون/طول…) + وحدة + رصيد.
   • التصنيف شجرة منظمة فوق حركات app_stores الموجودة.
   • رصيد كل صنف يُحسب من حركات المخزن الفعلية (داخل/خارج/مرتجع).
   • أسماء الأصناف تتغذى في قائمة نموذج حركة المخزن تلقائيًا.
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

  function app() { return root.NizamApp || null; }
  function toast(msg) {
    var a = app();
    if (a && a.toast) { try { a.toast(msg); return; } catch (e) {} }
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
  function balance(item, store) {
    var a = app();
    if (a && a.storeItemBalance) {
      try { return Number(a.storeItemBalance(item, store) || 0); } catch (e) {}
    }
    return 0;
  }

  function cleanCatalog(v) {
    var out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    Object.keys(v).forEach(function (store) {
      var w = v[store];
      if (!w || typeof w !== 'object') return;
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
                notes: String(x.notes || ''),
                specs: Array.isArray(x.specs) ? x.specs.filter(function (s) { return s && typeof s === 'object'; }).map(function (s) {
                  return { key: String(s.key || '').trim(), value: String(s.value || '').trim() };
                }) : []
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

  var state = { store: '', category: '' };

  function inject() {
    if (document.getElementById('storeCatalogPanel')) return;
    var anchor = document.getElementById('storeShortagePanel');
    if (!anchor || !anchor.parentNode) return;
    var html = '' +
      '<div class="panel" id="storeCatalogPanel">' +
        '<h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-truck"/></svg> تصنيف المخازن والأصناف</h3>' +
        '<p class="panel__hint">رتّب كل مخزن: <b>مخزن ← تصنيف/فئة ← صنف ← مقاس ومواصفات</b>. مثال: مخزن الحديد ← «حديد تسليح» ← «حديد 12 مم» ← المقاس 12 مم والطول 12 م. رصيد كل صنف يتحسب من حركات المخزن الفعلية.</p>' +
        '<div class="summary summary--3" id="catalogSummary"></div>' +
        '<div class="form__row form__row--3">' +
          '<label class="field"><span>المخزن</span><select id="catalogStore"></select></label>' +
          '<label class="field"><span>مخزن جديد</span><input type="text" id="catalogNewStore" placeholder="مثال: مخزن الحديد" autocomplete="off" /></label>' +
          '<div class="form__actions" style="margin:0;align-self:flex-end"><button type="button" class="btn btn--ghost" id="catalogAddStore">＋ إضافة مخزن</button></div>' +
        '</div>' +
        '<div class="form__row form__row--3">' +
          '<label class="field"><span>التصنيف / الفئة</span><select id="catalogCategory"></select></label>' +
          '<label class="field"><span>تصنيف جديد</span><input type="text" id="catalogNewCategory" placeholder="مثال: حديد تسليح / أسمنت" autocomplete="off" /></label>' +
          '<div class="form__actions" style="margin:0;align-self:flex-end"><button type="button" class="btn btn--ghost" id="catalogAddCategory">＋ إضافة تصنيف</button></div>' +
        '</div>' +
        '<form id="catalogItemForm" class="form" novalidate>' +
          '<div class="form__row form__row--3">' +
            '<label class="field"><span>اسم الصنف *</span><input type="text" name="itemName" required placeholder="مثال: حديد 12 مم" autocomplete="off" /></label>' +
            '<label class="field"><span>الوحدة</span><input type="text" name="unit" placeholder="متر / طن / قطعة / شيكارة" autocomplete="off" /></label>' +
            '<label class="field"><span>ملاحظة</span><input type="text" name="notes" placeholder="مثال: طول 12 متر" /></label>' +
          '</div>' +
          '<div class="field field--full">' +
            '<span>المواصفات والمقاسات (اسم المواصفة والقيمة)</span>' +
            '<div id="catalogSpecRows"></div>' +
            '<div class="form__actions" style="margin:8px 0 0"><button type="button" class="btn btn--ghost btn--sm" id="catalogSpecAdd">＋ إضافة مواصفة</button></div>' +
          '</div>' +
          '<p class="form__error" id="catalogItemError" hidden></p>' +
          '<div class="form__actions"><button type="submit" class="btn btn--primary btn--sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"/></svg> إضافة الصنف للتصنيف</button></div>' +
        '</form>' +
        '<div id="catalogTree" class="catalog-tree"></div>' +
      '</div>';
    anchor.insertAdjacentHTML('afterend', html);
    addSpecRow('المقاس', '');
  }

  function addSpecRow(key, val) {
    var box = document.getElementById('catalogSpecRows');
    if (!box) return;
    var row = document.createElement('div');
    row.className = 'custom-row catalog-spec-row';
    row.innerHTML = '<input type="text" data-spec-key placeholder="اسم المواصفة (مقاس / لون / طول)" value="' + esc(key || '') + '" />' +
      '<input type="text" data-spec-val placeholder="القيمة" value="' + esc(val || '') + '" />' +
      '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-spec-del title="حذف المواصفة">×</button>';
    box.appendChild(row);
  }
  function readSpecs() {
    var out = [];
    $$('#catalogSpecRows .catalog-spec-row').forEach(function (row) {
      var k = row.querySelector('[data-spec-key]');
      var v = row.querySelector('[data-spec-val]');
      k = String(k && k.value || '').trim();
      v = String(v && v.value || '').trim();
      if (k && v) out.push({ key: k, value: v });
    });
    return out;
  }

  function selectedStore() {
    var names = getNames();
    /* الحالة أحدث من القائمة: بعد إضافة مخزن جديد لم تتحدّث قائمة الاختيار بعد،
       فلو قدّمنا قيمة القائمة القديمة يُسجَّل التصنيف في المخزن الخطأ. */
    var v = state.store;
    if (!v || names.indexOf(v) === -1) {
      var sel = document.getElementById('catalogStore');
      v = sel ? String(sel.value || '') : '';
    }
    if (!v || names.indexOf(v) === -1) v = names[0] || '';
    return v;
  }
  function selectedCategory(all, store) {
    var sel = document.getElementById('catalogCategory');
    var cats = (all[store] && all[store].categories) || [];
    var v = sel ? String(sel.value || '') : state.category;
    var found = cats.filter(function (c) { return c.id === v; })[0];
    if (!found && cats.length) found = cats[0];
    return found || null;
  }

  function render() {
    if (!document.getElementById('storeCatalogPanel')) return;
    var names = getNames();
    var store = selectedStore();
    state.store = store;
    var all = readAll();
    var w = ensureStore(all, store);
    var storeSel = document.getElementById('catalogStore');
    if (storeSel) {
      storeSel.innerHTML = names.map(function (nm) {
        return '<option value="' + esc(nm) + '">' + esc(nm) + '</option>';
      }).join('');
      storeSel.value = store;
    }

    var catSel = document.getElementById('catalogCategory');
    if (catSel) {
      catSel.innerHTML = w.categories.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('') || '<option value="">— أضف تصنيفًا أولًا —</option>';
      var keep = state.category;
      if (keep && w.categories.some(function (c) { return c.id === keep; })) catSel.value = keep;
      else if (w.categories.length) catSel.value = w.categories[0].id;
      state.category = catSel.value || '';
    }

    var totalItems = 0;
    w.categories.forEach(function (c) { totalItems += c.items.length; });
    var summary = document.getElementById('catalogSummary');
    if (summary) {
      summary.innerHTML =
        '<div class="summary__box"><small>المخزن الحالي</small><b style="font-size:16px">' + esc(store) + '</b><span>' + names.length + ' مخازن</span></div>' +
        '<div class="summary__box summary__box--in"><small>التصنيفات</small><b>' + w.categories.length + '</b><span>فئة داخل المخزن</span></div>' +
        '<div class="summary__box summary__box--net"><small>الأصناف</small><b>' + totalItems + '</b><span>صنف ومواصفات</span></div>';
    }

    var tree = document.getElementById('catalogTree');
    if (!tree) return;
    if (!w.categories.length) {
      tree.innerHTML = '<div class="catalog-empty">لا توجد تصنيفات في «' + esc(store) + '» بعد. أضف تصنيفًا (مثل: حديد تسليح) ثم أضف أصنافه ومقاساته.</div>';
      return;
    }
    tree.innerHTML = w.categories.map(function (c) {
      var itemsHtml = c.items.map(function (it) {
        var b = balance(it.name, store);
        var specs = (it.specs || []).map(function (s) {
          return '<span class="spec-chip">' + esc(s.key) + ': ' + esc(s.value) + '</span>';
        }).join('');
        return '<div class="catalog-item">' +
          '<div class="catalog-item__body">' +
            '<div class="catalog-item__title"><b>' + esc(it.name) + '</b>' +
              '<span class="tag ' + (b > 0 ? 'tag--in' : (b < 0 ? 'tag--out' : 'tag--warn')) + '">رصيد ' + b + (it.unit ? ' ' + esc(it.unit) : '') + '</span>' +
            '</div>' +
            (specs ? '<div class="catalog-item__specs">' + specs + '</div>' : '') +
            (it.notes ? '<p class="catalog-item__note">' + esc(it.notes) + '</p>' : '') +
          '</div>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-item-del="' + esc(it.id) + '">حذف</button>' +
        '</div>';
      }).join('');
      return '<div class="catalog-cat">' +
        '<div class="catalog-cat__head">' +
          '<div><b>' + esc(c.name) + '</b> <small>' + c.items.length + ' صنف</small></div>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-cat-del="' + esc(c.id) + '">حذف التصنيف</button>' +
        '</div>' +
        (itemsHtml || '<div class="catalog-cat__empty">لا توجد أصناف في هذا التصنيف — أضف الصنف من النموذج أعلاه.</div>') +
      '</div>';
    }).join('');
  }

  function saveAndRefresh(all) {
    writeAll(all);
    var a = app();
    if (a && a.fillStoreSuggests) { try { a.fillStoreSuggests(); } catch (e) {} }
    render();
  }

  function bind() {
    var panel = document.getElementById('storeCatalogPanel');
    if (!panel) return;

    panel.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#catalogAddStore')) {
        var inp = document.getElementById('catalogNewStore');
        var name = String(inp && inp.value || '').trim();
        if (!name) { toast('اكتب اسم المخزن الأول'); return; }
        var a = app();
        var added = true;
        if (a && a.addStore) { try { added = a.addStore(name); } catch (e) { added = false; } }
        var all = readAll();
        var existed = getNames().indexOf(name) > -1;
        if (!existed && !added) { toast('تعذّر إضافة المخزن'); return; }
        var w = ensureStore(all, name);
        if (!w.categories.length) w.categories.push({ id: uid(), name: 'عام', items: [] });
        writeAll(all);
        state.store = name;
        state.category = '';
        if (inp) inp.value = '';
        render();
        toast('تم تجهيز تصنيف المخزن «' + name + '» ✓');
        return;
      }
      if (t.closest('#catalogAddCategory')) {
        var nameEl = document.getElementById('catalogNewCategory');
        var cn = String(nameEl && nameEl.value || '').trim();
        if (!cn) { toast('اكتب اسم التصنيف الأول'); return; }
        var store = selectedStore();
        var all2 = readAll();
        var w2 = ensureStore(all2, store);
        if (w2.categories.some(function (c) { return c.name === cn; })) { toast('التصنيف «' + cn + '» موجود بالفعل'); return; }
        var cat = { id: uid(), name: cn, items: [] };
        w2.categories.push(cat);
        writeAll(all2);
        state.category = cat.id;
        if (nameEl) nameEl.value = '';
        render();
        toast('تمت إضافة تصنيف «' + cn + '» ✓');
        return;
      }
      if (t.closest('#catalogSpecAdd')) { addSpecRow('', ''); return; }
      var specDel = t.closest('[data-spec-del]');
      if (specDel) { var row = specDel.closest('.catalog-spec-row'); if (row) row.remove(); return; }

      var catDel = t.closest('[data-cat-del]');
      if (catDel) {
        var cid = catDel.getAttribute('data-cat-del');
        var store3 = selectedStore();
        var all3 = readAll();
        var w3 = ensureStore(all3, store3);
        var cat3 = w3.categories.filter(function (c) { return c.id === cid; })[0];
        if (!cat3) return;
        if (!root.confirm('حذف تصنيف «' + cat3.name + '» وكل أصنافه من الكتالوج؟ (حركات المخزن التاريخية تبقى كما هي)')) return;
        w3.categories = w3.categories.filter(function (c) { return c.id !== cid; });
        state.category = '';
        saveAndRefresh(all3);
        toast('تم حذف التصنيف من الكتالوج');
        return;
      }

      var itemDel = t.closest('[data-item-del]');
      if (itemDel) {
        var iid = itemDel.getAttribute('data-item-del');
        var store4 = selectedStore();
        var all4 = readAll();
        var w4 = ensureStore(all4, store4);
        var removed = '';
        w4.categories.forEach(function (c) {
          c.items = c.items.filter(function (it) {
            if (it.id === iid) { removed = it.name; return false; }
            return true;
          });
        });
        if (!removed) return;
        if (!root.confirm('حذف الصنف «' + removed + '» من الكتالوج؟ (حركات المخزن التاريخية تبقى كما هي)')) return;
        saveAndRefresh(all4);
        toast('تم حذف الصنف من الكتالوج');
      }
    });

    panel.addEventListener('change', function (ev) {
      if (!ev.target) return;
      if (ev.target.id === 'catalogStore') {
        state.store = ev.target.value;
        state.category = '';
        render();
      } else if (ev.target.id === 'catalogCategory') {
        state.category = ev.target.value;
      }
    });

    panel.addEventListener('submit', function (ev) {
      if (!ev.target || ev.target.id !== 'catalogItemForm') return;
      ev.preventDefault();
      var form = ev.target;
      var f = form.elements;
      var name = String(f.itemName.value || '').trim();
      var unit = String(f.unit.value || '').trim();
      var notes = String(f.notes.value || '').trim();
      var specs = readSpecs();
      var err = document.getElementById('catalogItemError');
      var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
      if (!name) return fail('اسم الصنف مطلوب');
      var store = selectedStore();
      var all = readAll();
      var w = ensureStore(all, store);
      var cat = selectedCategory(all, store);
      if (!cat) return fail('أضف تصنيفًا أولًا ثم أضف الصنف داخله');
      var dup = false;
      w.categories.forEach(function (c) {
        if (c.items.some(function (it) { return it.name === name; })) dup = true;
      });
      if (dup) return fail('اسم الصنف «' + name + '» موجود بالفعل في هذا المخزن — أضف المقاس/المواصفة في الاسم لتمييزه');
      cat.items.push({ id: uid(), name: name, unit: unit, notes: notes, specs: specs });
      if (err) err.hidden = true;
      saveAndRefresh(all);
      form.reset();
      var specBox = document.getElementById('catalogSpecRows');
      if (specBox) specBox.innerHTML = '';
      addSpecRow('المقاس', '');
      if (f.itemName && f.itemName.focus) f.itemName.focus();
      toast('تمت إضافة الصنف «' + name + '» إلى تصنيف «' + cat.name + '» ✓');
    });

    var storePick = document.getElementById('storePick');
    if (storePick) storePick.addEventListener('change', function () {
      state.store = this.value;
      state.category = '';
      render();
    });
    var storeFilter = document.getElementById('storeFilter');
    if (storeFilter) storeFilter.addEventListener('change', function () {
      if (this.value && this.value !== 'all') { state.store = this.value; state.category = ''; render(); }
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var pick = t.closest('[data-store-pick]');
      if (pick) {
        state.store = pick.getAttribute('data-store-pick') || '';
        state.category = '';
        setTimeout(render, 60);
        return;
      }
      var del = t.closest('[data-store-del]');
      if (del) {
        var deleted = del.getAttribute('data-store-del') || '';
        setTimeout(function () {
          var names = getNames();
          if (names.indexOf(deleted) === -1) {
            var all = readAll();
            if (all[deleted]) { delete all[deleted]; writeAll(all); }
            if (state.store === deleted) state.store = '';
          }
          render();
        }, 100);
        return;
      }
      if (t.closest('#addStoreBtn')) {
        var newNameEl = document.getElementById('newStoreName');
        var newName = String(newNameEl && newNameEl.value || '').trim();
        if (newName) state.store = newName;
        setTimeout(render, 100);
      }
    });
  }

  function itemOptions(store) {
    store = String(store || '').trim();
    var all = readAll();
    var w = all[store];
    if (!w) return '';
    var names = [];
    w.categories.forEach(function (c) {
      c.items.forEach(function (it) {
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
