/* ============================================================
   نظام الإدارة المتكامل — منطق الواجهة
   ============================================================ */
(function () {
  'use strict';

  var DEFAULT_PASSWORD = '2468';
  var KEY_PASSWORD = 'app_password';
  var KEY_CUSTOMERS = 'app_customers';

  /* الأقسام المحمية بكلمة المرور */
  var PROTECTED = {
    collection: 'التحصيل',
    partners: 'الشركاء',
    associations: 'جمعيات',
    operations: 'العمليات'
  };

  var SECTION_NAMES = {
    home: 'الرئيسية',
    customers: 'العملاء',
    'add-customer': 'إضافة عميل',
    suppliers: 'الموردون',
    ledger: 'الدواخل والخوارج',
    collection: 'التحصيل',
    partners: 'الشركاء',
    associations: 'جمعيات',
    settings: 'الإعدادات',
    profile: 'ملف العميل',
    'add-supplier': 'إضافة مورد',
    'supplier-profile': 'كشف حساب مورد',
    details: 'التفاصيل',
    'partner-profile': 'بروفايل شريك',
    'member-profile': 'بروفايل عضو الجمعية',
    operations: 'العمليات'
  };

  var DEFAULT_CUSTOMERS = [
    { name: 'أحمد محمد علي', phone: '0770123456', address: 'بغداد / الكرادة', balance: 300000 },
    { name: 'شركة النور التجارية', phone: '0781234567', address: 'بغداد / المنصور', balance: 0 },
    { name: 'سالم عبدالله جاسم', phone: '0750987654', address: 'البصرة / العشار', balance: 300000 },
    { name: 'فاطمة حسن مهدي', phone: '0771456789', address: 'النجف / الحويش', balance: 75000 },
    { name: 'مؤسسة الأمل', phone: '0782345678', address: 'كربلاء / المركز', balance: 2100000 }
  ];

  /* ---------- حالة التطبيق ---------- */
  var unlocked = Object.create(null); /* الأقسام المفتوحة في هذه الجلسة */
  var pendingView = null;            /* القسم بانتظار كلمة المرور */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getPassword() {
    try { return localStorage.getItem(KEY_PASSWORD) || DEFAULT_PASSWORD; }
    catch (e) { return DEFAULT_PASSWORD; }
  }
  function setPassword(p) {
    try { localStorage.setItem(KEY_PASSWORD, p); } catch (e) {}
  }
  /* قراءة قائمة سليمة من التخزين:
     - لو المحتوى مش مصفوفة نرجع الافتراضي بدل ما يقع الرسم كله
     - ولو فيه عناصر مش كائنات نتجاهلها، عشان أي عنصر تالف
       ما يوقّع الشاشة ويسيبها فاضية. */
  /* تنفيذ آمن لأي استدعاء رسم أثناء تحميل السكربت:
     لو أي رسم فشل برمجياً يتسجّل الخطأ بدل ما يقطع بقية السكربت
     (قطع السكربت كان بيمنع الإقلاع فتظهر الشاشة فاضية). */
  function safeRun(run, label) {
    try { run(); } catch (e) {
      try { console.error('فشل «' + label + '»: ' + (e && e.message ? e.message : e)); } catch (e2) {}
    }
  }

  function safeList(v, fallback) {
    if (!Array.isArray(v)) return JSON.parse(JSON.stringify(fallback));
    var out = [];
    for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object') out.push(v[i]);
    return out;
  }

  /* تطبيع حقول مصفوفة العميل: لو التخزين اتخزن فيه نص بدل مصفوفة
     نرجّعه مصفوفة فاضية بدل ما يقطع الرسم كله */
  function normClient(c) {
    if (c && typeof c === 'object') {
      if (c.payments != null && !Array.isArray(c.payments)) c.payments = [];
      if (c.sends != null && !Array.isArray(c.sends)) c.sends = [];
      if (c.notes != null && !Array.isArray(c.notes)) c.notes = [];
    }
    return c;
  }

  function getCustomers() {
    try {
      var raw = localStorage.getItem(KEY_CUSTOMERS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_CUSTOMERS).map(normClient);
    } catch (e) {}
    return DEFAULT_CUSTOMERS.slice().map(normClient);
  }
  function saveCustomers(list) {
    try { localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(list)); } catch (e) {}
  }

  /* ---------- التنقل ---------- */
  function showView(id) {
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + id); });
    var content = $('#content');
    if (content) content.scrollTop = 0;
    var status = $('#statusSection');
    if (status) status.textContent = SECTION_NAMES[id] || '';
    document.title = (SECTION_NAMES[id] ? SECTION_NAMES[id] + ' — ' : '') + 'نظام الإدارة المتكامل';
    /* كل عملية رسم مُغلّفة بـ try: لو قسم واحد فشل لأي سبب (بيانات تالفة مثلاً)
       باقي الأقسام بتتعرض عادي وبيظهر تنبيه بدل الشاشة الفاضية. */
    var renderFailed = [];
    function step(run, label) {
      try { run(); } catch (e) {
        renderFailed.push(label);
        try { console.error('فشل رسم «' + label + '»: ' + (e && e.message ? e.message : e)); } catch (e2) {}
      }
    }
    if (id === 'customers') step(function () { renderCustomers(); }, 'العملاء');
    if (id === 'home') step(function () { renderHomeStats(); }, 'الرئيسية');
    if (id === 'collection') step(function () { renderCollection(colFilter()); renderCollectionSummary(); }, 'التحصيل');
    if (id === 'collection') step(function () { renderWaPanel(); }, 'رسائل واتساب');
    if (id === 'ledger') step(function () { renderLedger(); renderLedgerSummary(); fillPartyLists(); }, 'الدواخل والخوارج');
    if (id === 'partners') step(function () { renderPartners(); }, 'الشركاء');
    if (id === 'associations') step(function () { renderAssociations(); }, 'الجمعيات');
    if (id === 'details') step(function () { renderDetails(); }, 'التفاصيل');
    if (id === 'partner-profile') step(function () { renderPartnerProfile(); }, 'ملف الشريك');
    if (id === 'member-profile') step(function () { renderMemberProfile(); }, 'ملف العضو');
    if (id === 'operations') step(function () { renderOperations(); }, 'العمليات');
    if (id === 'settings') step(function () { renderDataSafety(); }, 'سلامة البيانات');
    if (id === 'supplier-profile') step(function () { fillPartyLists(); }, 'قوائم الأطراف');
    if (id === 'settings') step(function () { renderExportGrid(); refreshDriveStatus(); loadSyncFolder(); renderNetworkToggle(); }, 'الإعدادات');
    if (id === 'suppliers') step(function () {
      if (typeof renderSuppliers === 'function') renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
    }, 'الموردين');
    if (id === 'profile') step(function () {
      if (typeof renderProfile === 'function') renderProfile();
      if (typeof renderProfileLinks === 'function') renderProfileLinks();
    }, 'ملف العميل');
    if (id === 'add-customer') step(function () {
      if (typeof prepareCustomerView === 'function') prepareCustomerView();
      if (typeof hideAlert === 'function') hideAlert();
    }, 'إضافة عميل');
    if (id === 'add-supplier') step(function () {
      if (typeof prepareSupplierView === 'function') prepareSupplierView();
    }, 'إضافة مورد');
    if (id === 'supplier-profile') step(function () {
      if (typeof renderSupplierProfile === 'function') renderSupplierProfile();
    }, 'ملف المورد');
    if (renderFailed.length) {
      toast('تعذّر عرض جزء من «' + (SECTION_NAMES[id] || id) + '»: ' + renderFailed.join('، ') +
        ' — باقي الأقسام شغالة، أعد فتح القسم.', true);
    }
  }

  function navigate(id) {
    if (PROTECTED[id] && !unlocked[id]) { openPasswordModal(id); return; }
    showView(id);
  }

  /* ---------- نافذة كلمة المرور ---------- */
  var modal = $('#pwdModal');
  var dots = $$('#pwdDots i');
  var errorEl = $('#pwdError');
  var buffer = '';

  function renderDots() {
    dots.forEach(function (d, i) { d.classList.toggle('on', i < buffer.length); });
  }

  function openPasswordModal(view) {
    pendingView = view;
    buffer = '';
    renderDots();
    errorEl.hidden = true;
    $('#pwdSub').textContent = 'أدخل كلمة المرور لفتح «' + PROTECTED[view] + '»';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closePasswordModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    pendingView = null;
    buffer = '';
    renderDots();
  }

  function shake() {
    var box = $('.modal__box', modal);
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function checkPassword() {
    if (buffer.length < 4) return;
    if (buffer === getPassword()) {
      var target = pendingView;
      unlocked[target] = true;
      closePasswordModal();
      showView(target);
      toast('تم فتح قسم «' + PROTECTED[target] + '» بنجاح');
    } else {
      errorEl.hidden = false;
      shake();
      buffer = '';
      renderDots();
      errorEl.textContent = 'كلمة المرور غير صحيحة، حاول مجدداً';
    }
  }

  function pressKey(key) {
    errorEl.hidden = true;
    if (key === 'clr') { buffer = ''; renderDots(); return; }
    if (key === 'ok') { checkPassword(); return; }
    if (/^[0-9]$/.test(key) && buffer.length < 4) {
      buffer += key;
      renderDots();
      if (buffer.length === 4) setTimeout(checkPassword, 160);
    }
  }

  $('#keypad').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-key]');
    if (btn) pressKey(btn.getAttribute('data-key'));
  });

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closePasswordModal();
  });

  document.addEventListener('keydown', function (e) {
    if (modal.classList.contains('is-open')) {
      if (/^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pressKey('clr'); e.preventDefault(); }
      else if (e.key === 'Enter') { pressKey('ok'); e.preventDefault(); }
      else if (e.key === 'Escape') { closePasswordModal(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      navigate('customers');
      var q = $('#customerSearch');
      if (q) setTimeout(function () { q.focus(); }, 60);
      var quick = $('#quickSearch');
      if (quick && quick.value) { q.value = quick.value; renderCustomers(); }
    }
  });

  /* ---------- القوائم ---------- */
  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function renderHomeStats() {
    var count = getCustomers().length;
    var a = $('#statCustomers');
    var b = $('#cardCustomers');
    if (a) a.textContent = count;
    if (b) b.textContent = count;
  }

  function renderCustomers(filter) {
    var tbody = $('#customersTable tbody');
    if (!tbody) return;
    var list = getCustomers().map(function (c, i) { return { c: c, i: i }; });
    var q = (filter || '').trim();
    if (q) {
      list = list.filter(function (x) {
        var c = x.c;
        return (c.name || '').indexOf(q) > -1 ||
               (c.phone || '').indexOf(q) > -1 ||
               (c.address || '').indexOf(q) > -1;
      });
    }
    tbody.innerHTML = '';
    list.forEach(function (entry, i) {
      var c = entry.c;
      var tr = document.createElement('tr');
      tr.setAttribute('data-idx', entry.i);
      var bal = Number(c.balance || 0);
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(c.name) + '</td>' +
        '<td>' + escapeHtml(c.phone || '—') + '</td>' +
        '<td>' + escapeHtml(c.address || '—') + '</td>' +
        '<td class="amount ' + (bal > 0 ? 'neg' : bal < 0 ? 'pos' : '') + '">' + fmt(bal) + '</td>';
      tbody.appendChild(tr);
    });
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:26px">لا توجد نتائج مطابقة</td></tr>';
    }
    var countEl = $('#customersCount');
    if (countEl) countEl.textContent = list.length + ' عميل';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- الأحداث العامة ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-go]');
    if (el) navigate(el.getAttribute('data-go'));
  });

  /* توهج البطاقة يتبع المؤشر */
  document.addEventListener('mousemove', function (e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  });

  /* بحث العملاء */
  var customerSearch = $('#customerSearch');
  if (customerSearch) customerSearch.addEventListener('input', function () { renderCustomers(this.value); });

  var quickSearch = $('#quickSearch');
  if (quickSearch) {
    quickSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        navigate('customers');
        var q = $('#customerSearch');
        if (q) { q.value = this.value; renderCustomers(this.value); }
      }
    });
  }

  /* ---------- إضافة عميل ---------- */
  var editingCustomerIdx = -1;   /* >= 0 يعني النموذج في وضع التعديل */

  var REQUIRED_FIELDS = [
    { key: 'name', label: 'اسم العميل' },
    { key: 'phone', label: 'رقم التلفون' },
    { key: 'phone2', label: 'رقم الاحتياطي' },
    { key: 'nationalId', label: 'الرقم القومي' },
    { key: 'address', label: 'العنوان' },
    { key: 'paidByUs', label: 'المبلغ المدفوع منا نحن للعميل', num: true },
    { key: 'total', label: 'المبلغ الإجمالي قبل خصم المقدم', num: true },
    { key: 'down', label: 'المبلغ المدفوع من العميل (المقدم)', num: true },
    { key: 'durationValue', wrap: 'duration', label: 'مدة السداد (كم شهر أو سنة)', num: true },
    { key: 'status', label: 'حالة العميل: مستلم أم جاري العمل' },
    { key: 'startYear', label: 'سنة البدء' }
  ];

  var form = $('#customerForm');
  var notes = [];

  /* ---------- الحقول المخصّصة: بيانات إضافية يضيفها المستخدم بنفسه ---------- */
  var KEY_CUSTOM_FIELDS = 'app_custom_fields';
  var CUSTOM_SECTIONS = {
    customers: { box: 'customerCustomFields', nameInput: 'cfName', reqName: 'cfRequired', addBtn: 'cfAddBtn', empty: 'customerCustomEmpty', label: 'بيانات العميل' },
    ledger:    { box: 'ledgerCustomFields',  nameInput: 'lfName', reqName: 'lfRequired', addBtn: 'lfAddBtn', empty: 'ledgerCustomEmpty', label: 'حركات الدواخل والخوارج' }
  };

  function getAllCustomFields() {
    try {
      var raw = localStorage.getItem(KEY_CUSTOM_FIELDS);
      if (raw) {
        var o = JSON.parse(raw) || {};
        return { customers: o.customers || [], ledger: o.ledger || [] };
      }
    } catch (e) {}
    return { customers: [], ledger: [] };
  }
  function getCustomFields(section) { return getAllCustomFields()[section] || []; }
  function saveAllCustomFields(all) { try { localStorage.setItem(KEY_CUSTOM_FIELDS, JSON.stringify(all)); } catch (e) {} }

  function findCustomInput(scope, name) {
    if (!scope) return null;
    var els = scope.querySelectorAll('[data-cf-input]');
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-cf-input') === name) return els[i];
    return null;
  }
  function collectCustomValues(section, scope) {
    var out = {};
    if (!scope) return out;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-cf-input]'), function (el) {
      out[el.getAttribute('data-cf-input')] = String(el.value || '').trim();
    });
    return out;
  }
  function fillCustomValues(section, values, scope) {
    if (!scope) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-cf-input]'), function (el) {
      var n = el.getAttribute('data-cf-input');
      el.value = (values && values[n] != null) ? String(values[n]) : '';
    });
  }
  function missingCustom(section, scope) {
    var out = [];
    getCustomFields(section).forEach(function (cf) {
      if (!cf.required) return;
      var el = findCustomInput(scope, cf.name);
      if (!el || !String(el.value || '').trim()) {
        out.push({ key: 'cf:' + section + ':' + cf.name, label: 'الحقل المخصّص «' + cf.name + '» إجباري' });
      }
    });
    return out;
  }

  function renderCustomFields(section, values) {
    var cfg = CUSTOM_SECTIONS[section];
    if (!cfg) return;
    var box = document.getElementById(cfg.box);
    var empty = document.getElementById(cfg.empty);
    var list = getCustomFields(section);
    if (box) {
      var inputs = list.map(function (cf) {
        var v = values && values[cf.name] != null ? String(values[cf.name]) : '';
        return '<label class="field cf-input" data-field="cf:' + section + ':' + esc(cf.name) + '">' +
          '<span>' + esc(cf.name) + (cf.required ? ' <i>* إجباري</i>' : '') + '</span>' +
          '<input type="text" data-cf-input="' + esc(cf.name) + '" placeholder="اكتب ' + esc(cf.name) + '…" value="' + esc(v) + '" />' +
          '</label>';
      }).join('');
      var chips = list.length
        ? '<div class="cf-chips" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%;margin-top:6px">' +
          '<small style="color:#8b98ab">الحقول المعرّفة:</small>' +
          list.map(function (cf) {
            return '<span class="cf-chip">' + esc(cf.name) + (cf.required ? ' <i>إجباري</i>' : '') +
              '<button type="button" data-cf-del="' + esc(cf.name) + '" title="حذف الحقل">&times;</button></span>';
          }).join('') + '</div>'
        : '';
      box.innerHTML = inputs + chips;
    }
    if (empty) empty.hidden = list.length > 0;
  }

  function customInfoHtml(c) {
    var list = getCustomFields('customers');
    if (!list.length) return '';
    var vals = (c && c.custom) || {};
    return list.map(function (cf) {
      return infoItem(cf.name, vals[cf.name]);
    }).join('');
  }
  function customChipsHtml(t) {
    var list = getCustomFields('ledger');
    var vals = (t && t.custom) || {};
    var out = '';
    list.forEach(function (cf) {
      var v = vals[cf.name];
      if (v == null || v === '') return;
      out += ' <span class="party-chip">' + esc(cf.name) + ': ' + esc(v) + '</span>';
    });
    return out;
  }

  Object.keys(CUSTOM_SECTIONS).forEach(function (section) {
    var cfg = CUSTOM_SECTIONS[section];
    renderCustomFields(section, null);

    var addBtn = document.getElementById(cfg.addBtn);
    if (addBtn) addBtn.addEventListener('click', function () {
      var nameEl = document.getElementById(cfg.nameInput);
      var name = nameEl ? String(nameEl.value || '').trim() : '';
      if (!name) { toast('اكتب اسم الحقل أولاً', true); if (nameEl && nameEl.focus) nameEl.focus(); return; }
      if (name.length > 40) { toast('اسم الحقل طويل — 40 حرف كحد أقصى', true); return; }
      var all = getAllCustomFields();
      var arr = all[section] || [];
      if (arr.some(function (cf) { return cf.name === name; })) { toast('الحقل «' + name + '» موجود بالفعل', true); return; }
      var required = false;
      Array.prototype.forEach.call(document.getElementsByName(cfg.reqName), function (r) {
        if (r.checked) required = r.value === '1';
      });
      arr.push({ name: name, required: required });
      all[section] = arr;
      saveAllCustomFields(all);
      if (nameEl) nameEl.value = '';
      renderCustomFields(section, null);
      toast('اتضاف حقل «' + name + '» (' + (required ? 'إجباري' : 'اختياري') + ') إلى ' + cfg.label + ' ✓');
    });

    var box = document.getElementById(cfg.box);
    if (box) box.addEventListener('click', function (e) {
      var del = e.target && e.target.closest ? e.target.closest('[data-cf-del]') : null;
      if (!del) return;
      var nm = del.getAttribute('data-cf-del');
      var all = getAllCustomFields();
      all[section] = (all[section] || []).filter(function (cf) { return cf.name !== nm; });
      saveAllCustomFields(all);
      renderCustomFields(section, null);
      toast('اتحذف تعريف الحقل «' + nm + '» — القيم المسجلة موجودة في البيانات القديمة');
    });

    var nameEl = document.getElementById(cfg.nameInput);
    if (nameEl) nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (addBtn) addBtn.click(); }
    });
  });
  var form = $('#customerForm');
  var notes = [];

  function money(v) {
    v = Number(v || 0);
    if (!isFinite(v)) v = 0;
    return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /* --- الملاحظات المتعددة --- */
  function renderNotes() {
    var ul = $('#notesList');
    var empty = $('#notesEmpty');
    if (!ul) return;
    ul.innerHTML = '';
    notes.forEach(function (t, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + escapeHtml(t) + '</span><button type="button" data-rm="' + i + '" title="حذف الملاحظة">&times;</button>';
      ul.appendChild(li);
    });
    if (empty) empty.hidden = notes.length > 0;
  }

  function addNote() {
    var input = $('#noteInput');
    if (!input) return;
    var v = input.value.trim();
    if (!v) return;
    notes.push(v);
    input.value = '';
    renderNotes();
    input.focus();
  }

  var addNoteBtn = $('#addNoteBtn');
  if (addNoteBtn) addNoteBtn.addEventListener('click', addNote);
  var noteInput = $('#noteInput');
  if (noteInput) noteInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addNote(); }
  });
  var notesList = $('#notesList');
  if (notesList) notesList.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-rm]');
    if (!b) return;
    notes.splice(Number(b.getAttribute('data-rm')), 1);
    renderNotes();
  });

  /* --- سنوات البدء والانتهاء --- */
  function fillYears() {
    if (!form) return;
    var s = form.elements.startYear, e = form.elements.endYear;
    if (!s || !e) return;
    var now = new Date().getFullYear();
    for (var y = now - 10; y <= now + 20; y++) {
      var o1 = document.createElement('option'); o1.value = y; o1.textContent = y; s.appendChild(o1);
      var o2 = document.createElement('option'); o2.value = y; o2.textContent = y; e.appendChild(o2);
    }
    var un = document.createElement('option'); un.value = ''; un.textContent = 'لم يكتمل بعد'; e.appendChild(un);
  }

  /* --- الحساب التلقائي للمبالغ --- */
  function recalc() {
    if (!form) return;
    var f = form.elements;
    var total = parseFloat(f.total.value) || 0;
    var down = parseFloat(f.down.value) || 0;
    var later = parseFloat(f.later.value) || 0;
    var due = Math.max(total - down, 0);
    var rest = Math.max(due - later, 0);
    f.due.value = money(due);
    f.rest.value = money(rest);
    var n = parseFloat(f.durationValue.value) || 0;
    var unit = f.durationUnit.value;
    if (rest <= 0) f.installment.value = '—';
    else if (n > 0 && unit !== 'دفعة واحدة') f.installment.value = money(rest / n) + ' / ' + unit;
    else f.installment.value = 'دفعة واحدة';
  }

  function clearMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('.field.is-missing'), function (el) {
      el.classList.remove('is-missing');
    });
  }
  function hideAlert() {
    var a = $('#formAlert');
    if (a) a.hidden = true;
    clearMarks();
  }

  function collectMissing() {
    var out = [];
    if (!form) return out;
    var f = form.elements;
    REQUIRED_FIELDS.forEach(function (fld) {
      var el = f[fld.key];
      var val = el ? String(el.value == null ? '' : el.value).trim() : '';
      var bad = fld.num ? !(parseFloat(val) > 0) : !val;
      if (bad) out.push({ key: fld.wrap || fld.key, label: fld.label });
    });
    var total = parseFloat(f.total.value) || 0;
    var down = parseFloat(f.down.value) || 0;
    if (total > 0 && down > total) {
      out.push({ key: 'down', label: 'المبلغ المدفوع (المقدم) لا يمكن أن يتجاوز المبلغ الإجمالي' });
    }
    missingCustom('customers', form).forEach(function (m) { out.push(m); });
    return out;
  }

  function showMissing(list) {
    var a = $('#formAlert');
    var ul = $('#missingList');
    if (!a || !ul) return;
    clearMarks();
    ul.innerHTML = '';
    list.forEach(function (m) {
      var li = document.createElement('li');
      li.textContent = '• ' + m.label;
      ul.appendChild(li);
      var w = document.querySelector('[data-field="' + m.key + '"]');
      if (w) w.classList.add('is-missing');
    });
    a.hidden = false;
    if (a.scrollIntoView) a.scrollIntoView({ block: 'center' });
  }

  function saveCustomer(skipped) {
    var f = form.elements;
    var total = parseFloat(f.total.value) || 0;
    var down = parseFloat(f.down.value) || 0;
    var later = parseFloat(f.later.value) || 0;
    var due = Math.max(total - down, 0);
    var rest = Math.max(due - later, 0);
    var list = getCustomers();
    var entry = {
      name: String(f.name.value || '').trim(),
      phone: String(f.phone.value || '').trim(),
      phone2: String(f.phone2.value || '').trim(),
      nationalId: String(f.nationalId.value || '').trim(),
      address: String(f.address.value || '').trim(),
      notes: notes.slice(),
      total: total,
      down: down,
      later: later,
      due: due,
      rest: rest,
      duration: (String(f.durationValue.value || '').trim() + ' ' + String(f.durationUnit.value || '')).trim(),
      status: String(f.status.value || ''),
      startYear: String(f.startYear.value || ''),
      endYear: String(f.endYear.value || ''),
      startDate: String(f.startDate.value || ''),
      endDate: String(f.endDate.value || ''),
      paidByUs: parseFloat(f.paidByUs.value) || 0,
      balance: rest,
      custom: collectCustomValues('customers', form)
    };

    /* وضع التعديل: نستبدل السجل في مكانه ونحافظ على الدفعات والمرسل */
    if (editingCustomerIdx >= 0 && list[editingCustomerIdx]) {
      var old = list[editingCustomerIdx];
      entry.payments = old.payments || [];
      entry.sends = old.sends || [];
      var paidPays = 0;
      entry.payments.forEach(function (p) { paidPays += Number(p.amount || 0); });
      entry.rest = Math.max(due - later - paidPays, 0);
      entry.balance = entry.rest;
      list[editingCustomerIdx] = entry;
      var backIdx = editingCustomerIdx;
      editingCustomerIdx = -1;
      saveCustomers(list);
      form.reset();
      notes = [];
      renderNotes();
      fillCustomValues('customers', {}, form);
      hideAlert();
      recalc();
      renderHomeStats();
      setCustomerFormMode(false);
      currentIdx = backIdx;
      showView('profile');
      toast('تم حفظ تعديلات العميل ✓');
      return;
    }

    list.unshift(entry);
    saveCustomers(list);
    form.reset();
    notes = [];
    renderNotes();
    fillCustomValues('customers', {}, form);
    hideAlert();
    recalc();
    renderHomeStats();
    showView('customers');
    toast(skipped ? 'تم حفظ العميل مع تخطّي الحقول الناقصة' : 'تمت إضافة العميل بنجاح');
  }

  function setCustomerFormMode(isEdit) {
    var view = $('#view-add-customer');
    if (!view || !form) return;
    var h2 = view.querySelector('h2');
    var sub = view.querySelector('.page-head__title p');
    var submit = form.querySelector('button[type="submit"]');
    if (h2) h2.textContent = isEdit ? 'تعديل عميل' : 'إضافة عميل';
    if (sub) sub.textContent = isEdit
      ? 'عدّل البيانات ثم اضغط «حفظ التعديلات»'
      : 'أدخل بيانات العميل — الحقول المعلّمة بـ * إلزامية';
    if (submit) {
      submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> ' +
        (isEdit ? 'حفظ التعديلات' : 'حفظ العميل');
    }
  }

  /* تجهيز شاشة الإضافة/التعديل عند فتحها */
  function prepareCustomerView() {
    if (editingCustomerIdx >= 0) { setCustomerFormMode(true); return; }
    if (form) form.reset();
    notes = [];
    renderNotes();
    fillCustomValues('customers', {}, form);
    recalc();
    hideAlert();
    setCustomerFormMode(false);
  }

  /* فتح نموذج الإضافة في وضع التعديل ببيانات العميل */
  function startCustomerEdit(idx) {
    var c = getCustomers()[idx];
    if (!c || !form) { toast('العميل غير موجود', true); return; }
    var f = form.elements;
    editingCustomerIdx = idx;
    fillCustomValues('customers', c.custom || {}, form);
    f.name.value = c.name || '';
    f.phone.value = c.phone || '';
    f.phone2.value = c.phone2 || '';
    f.nationalId.value = c.nationalId || '';
    f.address.value = c.address || '';
    f.paidByUs.value = (c.paidByUs != null ? c.paidByUs : '');
    f.total.value = (c.total != null ? c.total : '');
    f.down.value = (c.down != null ? c.down : '');
    f.later.value = (c.later != null ? c.later : '');
    var dur = String(c.duration || '');
    var num = dur.match(/\d+/);
    f.durationValue.value = num ? num[0] : '';
    var unit = dur.replace(/^\d+\s*/, '').trim();
    var unitOk = false;
    for (var i = 0; i < f.durationUnit.options.length; i++) {
      if (f.durationUnit.options[i].value === unit) { unitOk = true; break; }
    }
    f.durationUnit.value = unitOk ? unit : 'شهر';
    if (c.status) f.status.value = c.status;
    var radios = form.querySelectorAll('input[name="status"]');
    for (var ri = 0; ri < radios.length; ri++) {
      radios[ri].checked = (radios[ri].value === String(c.status || ''));
    }
    f.startYear.value = c.startYear || '';
    f.endYear.value = c.endYear || '';
    f.startDate.value = c.startDate || '';
    f.endDate.value = c.endDate || '';
    notes = (c.notes || []).slice();
    renderNotes();
    recalc();
    hideAlert();
    showView('add-customer');
    setCustomerFormMode(true);
    toast('وضع التعديل — عدّل البيانات ثم احفظ');
  }

  if (form) {
    fillYears();
    renderNotes();
    recalc();

    form.addEventListener('input', function (e) {
      recalc();
      var w = e.target.closest ? e.target.closest('.field.is-missing') : null;
      if (w) w.classList.remove('is-missing');
    });
    form.addEventListener('change', function (e) {
      recalc();
      var w = e.target.closest ? e.target.closest('.field.is-missing') : null;
      if (w) w.classList.remove('is-missing');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var missing = collectMissing();
      if (missing.length) {
        showMissing(missing);
        toast('يوجد حقول ناقصة — أكملها أو اضغط «أنا أعلم»', true);
        return;
      }
      hideAlert();
      saveCustomer(false);
    });

    var btnSkip = $('#btnSkipMissing');
    if (btnSkip) btnSkip.addEventListener('click', function () {
      hideAlert();
      saveCustomer(true);
    });

    var btnBack = $('#btnBackFill');
    if (btnBack) btnBack.addEventListener('click', function () {
      hideAlert();
      var first = document.querySelector('[data-field].is-missing input, [data-field].is-missing select');
      var target = document.querySelector('[data-field].is-missing');
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
      if (first) first.focus();
    });
  }

  /* ---------- ملف العميل ---------- */
  var currentIdx = -1;

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function esc(s) { return escapeHtml(s == null ? '' : s); }

  function derive(c) {
    var total = Number(c.total || 0);
    var down = Number(c.down || 0);
    var due = c.due != null ? Number(c.due) : Math.max(total - down, 0);
    var later = Number(c.later || 0);
    var pays = Array.isArray(c.payments) ? c.payments : [];
    var paidPays = 0;
    pays.forEach(function (p) { paidPays += Number(p.amount || 0); });
    var led = partyLedger('customer', c.name);
    var paid = later + paidPays + led.in;
    var rest = (total > 0 || down > 0)
      ? Math.max(due - paid, 0)
      : Math.max(Number(c.balance || 0) - led.in, 0);
    var m = String(c.duration || '').match(/\d+/);
    var n = m ? parseFloat(m[0]) : 0;
    var u = String(c.duration || '').match(/[^\d\s]+/);
    var unit = u ? u[0] : '';
    var sends = Array.isArray(c.sends) ? c.sends : [];
    var sendSum = 0;
    sends.forEach(function (s) {
      sendSum += Number(s.total != null ? s.total : (Number(s.qty || 0) * Number(s.price || 0)));
    });
    var paidByUs = Number(c.paidByUs || 0) + led.out;
    return {
      total: total, down: down, due: due, later: later,
      pays: pays, paidPays: paidPays, paid: paid, rest: rest,
      n: n, unit: unit,
      sends: sends, sendSum: sendSum, paidByUs: paidByUs,
      ledIn: led.in, ledOut: led.out, ledList: led.list,
      sendBal: Math.max(paidByUs - sendSum, 0)
    };
  }

  function infoItem(label, value, cls) {
    return '<div class="info-item ' + (cls || '') + '"><span>' + esc(label) + '</span><b>' +
      (value ? esc(value) : '—') + '</b></div>';
  }

  function openProfile(idx) {
    currentIdx = idx;
    showView('profile');
  }

  /* ---------- نافذة التأكيد العامة (نعم / تراجع) ---------- */
  var confirmCb = null, confirmNeedPwd = false;

  function openConfirm(opts) {
    var m = $('#confirmModal');
    if (!m) { if (opts && opts.onYes) opts.onYes(); return; }
    var title = $('#confirmTitle'), msg = $('#confirmMsg');
    if (title) title.textContent = (opts && opts.title) || 'تأكيد';
    if (msg) msg.textContent = (opts && opts.message) || 'هل أنت متأكد؟';
    confirmNeedPwd = !!(opts && opts.password);
    var wrap = $('#confirmPwdWrap'), err = $('#confirmError'), inp = $('#confirmPwd');
    if (wrap) wrap.hidden = !confirmNeedPwd;
    if (err) err.hidden = true;
    if (inp) inp.value = '';
    var yes = $('#confirmYes');
    if (yes) yes.textContent = (opts && opts.yes) || 'نعم، متابعة';
    var no = $('#confirmNo');
    if (no) no.textContent = (opts && opts.no) || 'تراجع';
    confirmCb = (opts && opts.onYes) || null;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    if (confirmNeedPwd && inp) setTimeout(function () { if (inp.focus) inp.focus(); }, 80);
  }

  function closeConfirm() {
    confirmCb = null;
    confirmNeedPwd = false;
    var m = $('#confirmModal');
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }

  function shakeConfirm() {
    var m = $('#confirmModal');
    if (!m) return;
    var box = $('.modal__box', m);
    if (!box) return;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  var confirmYesBtn = $('#confirmYes');
  if (confirmYesBtn) confirmYesBtn.addEventListener('click', function () {
    if (confirmNeedPwd) {
      var inp = $('#confirmPwd'), err = $('#confirmError');
      var val = inp ? String(inp.value || '').trim() : '';
      if (val !== String(getPassword())) {
        if (err) { err.textContent = 'كلمة المرور غير صحيحة — حاول مجدداً'; err.hidden = false; }
        if (inp) inp.value = '';
        shakeConfirm();
        return;
      }
    }
    var cb = confirmCb;
    closeConfirm();
    if (cb) cb();
  });

  var confirmNoBtn = $('#confirmNo');
  if (confirmNoBtn) confirmNoBtn.addEventListener('click', closeConfirm);

  var confirmModalEl = $('#confirmModal');
  if (confirmModalEl) confirmModalEl.addEventListener('click', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-close')) closeConfirm();
  });
  document.addEventListener('keydown', function (e) {
    var m = $('#confirmModal');
    if (!m || !m.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closeConfirm(); e.preventDefault(); }
    else if (e.key === 'Enter') { var y = $('#confirmYes'); if (y) y.click(); e.preventDefault(); }
  });

  /* ---------- تعديل / حذف العميل من ملفه ---------- */
  var profileEditBtn = $('#profileEditBtn');
  if (profileEditBtn) profileEditBtn.addEventListener('click', function () {
    var c = getCustomers()[currentIdx];
    if (!c) { toast('العميل غير موجود', true); return; }
    openConfirm({
      title: 'تعديل بيانات العميل',
      message: 'هل أنت متأكد من أنك تريد تعديل بيانات العميل «' + (c.name || '') + '»؟',
      yes: 'نعم، تعديل',
      no: 'تراجع',
      onYes: function () { startCustomerEdit(currentIdx); }
    });
  });

  var profileDeleteBtn = $('#profileDeleteBtn');
  if (profileDeleteBtn) {
    profileDeleteBtn.addEventListener('click', function () {
      var c = getCustomers()[currentIdx];
      if (!c) { toast('العميل غير موجود', true); return; }
      openConfirm({
        title: 'حذف العميل',
        message: 'هل تريد حذف العميل «' + (c.name || '') + '»؟ الحذف نهائي ولن يمكن التراجع عنه — سيُطلب كلمة المرور.',
        yes: 'نعم، حذف نهائي',
        no: 'تراجع',
        password: true,
        onYes: function () {
          var list = getCustomers();
          var target = list[currentIdx];
          if (!target) { toast('العميل غير موجود', true); return; }
          var name = target.name || '';
          list.splice(currentIdx, 1);
          saveCustomers(list);
          collectionOpen = null;
          renderHomeStats();
          renderCustomers();
          renderCollection(colFilter());
          renderCollectionSummary();
          showView('customers');
          toast('تم حذف العميل «' + name + '» وكل بياناته');
        }
      });
    });
  }

  /* ---------- تحميل بيانات العميل كاملة (Excel / PDF) ---------- */
  function safeFileName(n) {
    return String(n || 'عميل').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) || 'عميل';
  }

  function customerProfileSheets(c) {
    var d = derive(c);
    var info = [
      ['البيان', 'القيمة'],
      ['اسم العميل', c.name || ''],
      ['الحالة', c.status || ''],
      ['رقم التلفون', c.phone || ''],
      ['رقم الاحتياطي', c.phone2 || ''],
      ['الرقم القومي', c.nationalId || ''],
      ['العنوان', c.address || ''],
      ['مدة السداد', c.duration || ''],
      ['سنة البدء', c.startYear || ''],
      ['سنة الانتهاء', c.endYear || '']
    ];
    getCustomFields('customers').forEach(function (cf) {
      info.push([cf.name, (c.custom && c.custom[cf.name]) || '']);
    });
    var moneyRows = [
      ['البند', 'المبلغ'],
      ['المبلغ الإجمالي قبل خصم المقدم', d.total],
      ['المدفوع من العميل (مقدم + تحصيل)', d.down + d.paid],
      ['المدفوع منا نحن للعميل', Number(c.paidByUs || 0)],
      ['المطلوب بعد خصم المقدم', d.due],
      ['إجمالي التحصيل', d.paid],
      ['المبلغ المتبقي', d.rest]
    ];
    var pays = [['التاريخ', 'المبلغ قبل الدفعة', 'المدفوع', 'المرة', 'المتبقي', 'ملاحظة']];
    var running = d.due - d.later;
    d.pays.forEach(function (p, i) {
      var before = running;
      running = Math.max(running - Number(p.amount || 0), 0);
      pays.push([formatDate(p.date), before, Number(p.amount || 0), p.no || (i + 1), running, p.note || '']);
    });
    var sends = [['الشغلانة', 'التاريخ', 'المرسل / البيان', 'الكمية', 'السعر', 'الإجمالي', 'المصدر']];
    mergedSendEntries(c, d).forEach(function (e) {
      var x = e.x;
      sends.push([x.work || '', formatDate(x.date), x.desc || '',
        x.qty === '' || x.qty == null ? '—' : x.qty,
        x.price === '' || x.price == null ? '—' : x.price,
        Number(x.total || 0),
        e.linked ? ('توريد مورد: ' + (x.supplier || '')) : 'مرسل من موارد']);
    });
    var noteRows = [['ملاحظات العميل']];
    if ((c.notes || []).length) (c.notes || []).forEach(function (t) { noteRows.push([t]); });
    else noteRows.push(['لا توجد ملاحظات لهذا العميل']);

    var who = c.name || '';
    return [
      { name: 'البيانات الشخصية', title: 'بيانات العميل', subtitle: who, rows: info, widths: [34, 44] },
      { name: 'ملخص مالي', title: 'الملخص المالي', subtitle: who, rows: moneyRows, widths: [42, 22], moneyCols: [1], totalRow: false },
      { name: 'التحصيل', title: 'سجل التحصيل', subtitle: who + ' — ' + d.pays.length + ' دفعة', rows: pays, widths: [18, 20, 16, 10, 18, 30], moneyCols: [1, 2, 4], totalRow: false },
      { name: 'المرسل من موارد', title: 'المرسل من موارد', subtitle: who, rows: sends, widths: [26, 16, 34, 10, 14, 16, 28], moneyCols: [5], totalRow: false },
      { name: 'الملاحظات', title: 'ملاحظات العميل', subtitle: who, rows: noteRows, widths: [60], totalRow: false }
    ];
  }

  function customerProfileReport(c) {
    var d = derive(c);
    return {
      title: 'ملف العميل: ' + (c.name || ''),
      subtitle: 'نظام الإدارة المتكامل — ' + new Date().toLocaleDateString('ar-EG'),
      columns: ['البند', 'القيمة'],
      moneyCols: [1],
      totalRow: false,
      rows: [
        ['اسم العميل', c.name || ''],
        ['الحالة', c.status || ''],
        ['رقم التلفون', c.phone || ''],
        ['العنوان', c.address || ''],
        ['المبلغ الإجمالي قبل خصم المقدم', d.total],
        ['المدفوع من العميل (مقدم + تحصيل)', d.down + d.paid],
        ['المدفوع منا نحن للعميل', Number(c.paidByUs || 0)],
        ['المطلوب بعد خصم المقدم', d.due],
        ['عدد دفعات التحصيل', d.pays.length],
        ['عدد عمليات المرسل', mergedSendEntries(c, d).length],
        ['المبلغ المتبقي', d.rest]
      ],
      summary: [
        { label: 'الإجمالي', value: money(d.total) },
        { label: 'المدفوع', value: money(d.down + d.paid) },
        { label: 'المتبقي', value: money(d.rest) }
      ]
    };
  }

  var profileExcelBtn = $('#profileExcelBtn');
  if (profileExcelBtn) profileExcelBtn.addEventListener('click', function () {
    var c = getCustomers()[currentIdx];
    if (!c) { toast('العميل غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      var bytes = ExportKit.buildXlsx(customerProfileSheets(c));
      openExportModal('customer-' + safeFileName(c.name) + '-' + exportStamp() + '.xlsx', MIME_XLSX, bytes);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var profilePdfBtn = $('#profilePdfBtn');
  if (profilePdfBtn) profilePdfBtn.addEventListener('click', function () {
    var c = getCustomers()[currentIdx];
    if (!c) { toast('العميل غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    if (!ExportKit.hasCanvas()) { toast('تصدير PDF يحتاج متصفحاً حقيقياً', true); return; }
    try {
      var pdf = ExportKit.reportToPdf(customerProfileReport(c));
      if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
      openExportModal('customer-' + safeFileName(c.name) + '-' + exportStamp() + '.pdf', MIME_PDF, pdf);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  /* حذف دفعة تحصيل من ملف العميل */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-del-pay]') : null;
    if (!btn) return;
    var i = Number(btn.getAttribute('data-del-pay'));
    var list = getCustomers();
    var c = list[currentIdx];
    if (!c || !c.payments || !c.payments[i]) return;
    var amt = Number(c.payments[i].amount || 0);
    c.payments.splice(i, 1);
    var d = derive(c);
    c.rest = d.rest;
    c.balance = d.rest;
    saveCustomers(list);
    renderProfile();
    renderHomeStats();
    toast('تم حذف دفعة بقيمة ' + money(amt) + ' — المتبقي: ' + money(d.rest));
  });

  /* حذف دفعة من تفاصيل التحصيل الرئيسي */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-del-colpay]') : null;
    if (!btn) return;
    var ci = Number(btn.getAttribute('data-cidx'));
    var pi = Number(btn.getAttribute('data-del-colpay'));
    var list = getCustomers();
    var c = list[ci];
    if (!c || !c.payments || !c.payments[pi]) return;
    c.payments.splice(pi, 1);
    var d = derive(c);
    c.rest = d.rest;
    c.balance = d.rest;
    saveCustomers(list);
    renderCollection(colFilter());
    renderCollectionSummary();
    renderHomeStats();
    toast('تم حذف الدفعة — المتبقي: ' + money(d.rest));
  });

  /* حذف مرسل من موارد */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-del-send]') : null;
    if (!btn) return;
    var si = Number(btn.getAttribute('data-del-send'));
    var list = getCustomers();
    var c = list[currentIdx];
    if (!c || !c.sends || !c.sends[si]) return;
    var label = c.sends[si].work || '';
    c.sends.splice(si, 1);
    saveCustomers(list);
    renderProfile();
    toast('تم حذف مرسل «' + label + '»');
  });

  function updateCollectCalc() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    var d = derive(c);
    var el = $('#collectForm').elements;
    var amt = parseFloat(el.amount.value) || 0;
    $('#collectRest').value = money(d.rest);
    $('#collectAfter').value = money(Math.max(d.rest - amt, 0));
  }

  function renderProfile() {
    var list = getCustomers();
    var c = list[currentIdx];
    if (!c) { showView('customers'); return; }
    var d = derive(c);

    $('#profileTitle').textContent = c.name || 'ملف العميل';
    $('#profileSubtitle').textContent = 'كل بيانات العميل بالتفصيل';

    var st = c.status || 'غير محدد';
    var pill = $('#profileStatus');
    pill.textContent = st;
    var palette = st === 'مستلم' ? ['rgba(16,185,129,.15)', 'rgba(16,185,129,.45)', '#6ee7b7']
      : st === 'جاري العمل' ? ['rgba(245,158,11,.15)', 'rgba(245,158,11,.45)', '#fcd34d']
      : ['rgba(147,197,253,.15)', 'rgba(147,197,253,.45)', '#bfdbfe'];
    pill.style.background = palette[0];
    pill.style.borderColor = palette[1];
    pill.style.color = palette[2];

    /* ملخص الحساب */
    var pct = d.due > 0 ? Math.min(100, Math.round((d.paid / d.due) * 100)) : (d.rest > 0 ? 0 : 100);
    $('#profileSummary').innerHTML =
      '<div class="summary-top">' +
        '<div><h3>ملخص الحساب</h3><p>' + esc(c.name || '') + ' — ' + esc(c.address || 'بدون عنوان') + '</p></div>' +
        '<div class="stat"><b>' + pct + '%</b><small>نسبة السداد</small></div>' +
      '</div>' +
      '<div class="summary">' +
        '<div class="summary__box"><small>المبلغ الإجمالي قبل خصم المقدم</small><b>' + money(d.total) + '</b></div>' +
        '<div class="summary__box summary__box--in"><small>إجمالي المدفوع (مقدم + تحصيل)</small><b>' + money(d.down + d.paid) + '</b></div>' +
        '<div class="summary__box summary__box--out"><small>المبلغ الاجمالي المتبقي</small><b>' + money(d.rest) + '</b></div>' +
      '</div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="progress-label"><span>مدفوع: ' + money(d.paid) + '</span><span>متبقي: ' + money(d.rest) + '</span></div>';

    /* البيانات الشخصية */
    $('#profileInfo').innerHTML =
      infoItem('اسم العميل', c.name) +
      infoItem('الحالة', c.status) +
      infoItem('رقم التلفون', c.phone) +
      infoItem('رقم الاحتياطي', c.phone2) +
      infoItem('الرقم القومي', c.nationalId) +
      infoItem('مدة السداد', c.duration) +
      infoItem('العنوان', c.address, 'info-item--wide') +
      infoItem('سنة البدء', c.startYear) +
      infoItem('سنة الانتهاء', c.endYear || 'لم يكتمل بعد') +
      infoItem('تاريخ البدء', c.startDate ? formatDate(c.startDate) : '') +
      infoItem('تاريخ الانتهاء', c.endDate ? formatDate(c.endDate) : 'لم يكتمل بعد') + customInfoHtml(c);

    /* الملاحظات */
    var notesUl = $('#profileNotes');
    notesUl.innerHTML = (c.notes || []).map(function (t) {
      return '<li><span>' + esc(t) + '</span></li>';
    }).join('');

    /* البيانات المالية */
    $('#profileMoney').innerHTML =
      infoItem('المبلغ الإجمالي قبل خصم المقدم', money(d.total)) +
      infoItem('المبلغ المدفوع من العميل (المقدم)', money(d.down)) +
      infoItem('المبلغ المدفوع منا نحن للعميل', money(c.paidByUs)) +
      infoItem('المطلوب سداده بعد خصم المقدم', money(d.due)) +
      infoItem('دفعات مسجّلة عند الإضافة', money(d.later)) +
      infoItem('إجمالي التحصيل من الملف', money(d.paidPays)) +
      infoItem('إجمالي المدفوعات', money(d.paid)) +
      infoItem('قيمة القسط', (d.n > 0 && d.unit) ? money(d.rest / d.n) + ' / ' + d.unit : '') +
      infoItem('المبلغ الاجمالي المتبقي', money(d.rest), 'info-item--wide info-item--warn');

    /* جدول التحصيل */
    var tbody = $('#collectTable tbody');
    var rows = '';
    var running = d.due - d.later;
    d.pays.forEach(function (p, i) {
      var before = running;
      running = Math.max(running - Number(p.amount || 0), 0);
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(p.date)) + '</td>' +
        '<td class="amount">' + money(before) + '</td>' +
        '<td class="amount pos">' + money(p.amount) + '</td>' +
        '<td>' + esc(p.no || (i + 1)) + '</td>' +
        '<td class="amount">' + money(running) + '</td>' +
        '<td>' + (p.note ? esc(p.note) : '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-pay="' + i + '">حذف</button></td>' +
        '</tr>';
    });
    (d.ledList || []).forEach(function (o, k) {
      rows += '<tr>' +
        '<td>' + (d.pays.length + k + 1) + '</td>' +
        '<td>' + esc(formatDate(o.date)) + '</td>' +
        '<td class="amount">—</td>' +
        '<td class="amount ' + (o.type === 'out' ? 'neg' : 'pos') + '">' + money(o.amount) + '</td>' +
        '<td><span class="tag ' + (o.type === 'out' ? 'tag--out' : 'tag--in') + '">دواخل/خوارج</span></td>' +
        '<td class="amount">—</td>' +
        '<td>' + esc(o.desc || 'حركة من الدواخل والخوارج') + '</td>' +
        '<td class="col-cell"><span class="cell-note">من الشاشة الأخرى</span></td>' +
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">لا توجد عمليات تحصيل بعد — أضف أول عملية من النموذج أعلاه.</td></tr>';
    }
    tbody.innerHTML = rows;

    /* ملخص وجدول المرسل من موارد (مع توريدات الموردين المرتبطة) */
    var mergedX = mergedSendEntries(c, d).map(function (e) { return e.x; });
    var pSum = profileSendSum(c, d), pBal = profileSendBal(c, d);
    $('#sendSummary').innerHTML =
      '<div class="summary__box"><small>المبلغ المدفوع منا نحن للعميل (الرصيد الأصلي)</small><b>' + money(d.paidByUs) + '</b></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المرسل (منا + توريدات الموردين)</small><b>' + money(pSum) + '</b></div>' +
      '<div class="summary__box summary__box--out"><small>المبلغ المتبقي بعد الطرح</small><b>' + money(pBal) + '</b></div>' +
      '<div class="summary__box summary__box--net"><small>عدد العمليات</small><b>' + mergedX.length + '</b><span>' + worksCount(d.sends) + '</span></div>';

    fillSendDatalists({ sends: mergedX });
    sendView.filter = '';
    sendView.grouped = false;
    var fi = $('#sendFilter');
    if (fi) fi.value = '';
    var gb = $('#groupAllBtn');
    if (gb) gb.textContent = 'فرز الكل';
    refreshSendTable();

    /* نموذج إضافة تحصيل */
    var cf = $('#collectForm');
    cf.elements.date.value = todayISO();
    cf.elements.no.value = String(d.pays.length + 1);
    cf.elements.amount.value = '';
    cf.elements.note.value = '';
    $('#collectError').hidden = true;
    updateCollectCalc();

    var sf = $('#sendForm');
    sf.elements.date.value = todayISO();
    sf.elements.work.value = '';
    sf.elements.desc.value = '';
    sf.elements.qty.value = '';
    sf.elements.price.value = '';
    sf.elements.note.value = '';
    $('#sendError').hidden = true;
    updateSendCalc();
  }

  function formatDate(v) {
    if (!v) return '';
    var parts = String(v).split('-');
    if (parts.length !== 3) return v;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  var collectForm = $('#collectForm');
  if (collectForm) {
    collectForm.addEventListener('input', updateCollectCalc);
    collectForm.addEventListener('change', updateCollectCalc);

    collectForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#collectError');
      var fail = function (msg) { errEl.textContent = msg; errEl.hidden = false; };
      var el = collectForm.elements;
      var date = el.date.value;
      var amt = parseFloat(el.amount.value);
      var no = parseInt(el.no.value, 10);
      var list = getCustomers();
      var c = list[currentIdx];
      if (!c) return;
      var d = derive(c);

      var miss = [];
      if (!date) miss.push('التاريخ');
      if (!(amt > 0)) miss.push('المبلغ المدفوع');
      if (!(no > 0)) miss.push('المرة في الدفع');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
      if (amt > d.rest) return fail('المبلغ المدفوع أكبر من المتبقي (' + money(d.rest) + ')');

      var pays = d.pays.slice();
      pays.push({ date: date, amount: amt, no: no, note: String(el.note.value || '').trim() });
      pays.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      c.payments = pays;
      c.rest = Math.max(d.rest - amt, 0);
      c.balance = c.rest;
      if (c.due == null) c.due = d.due;
      saveCustomers(list);

      renderProfile();
      renderHomeStats();
      toast('تمت إضافة تحصيل بقيمة ' + money(amt) + ' — المتبقي: ' + money(c.rest));
    });
  }

  /* ---------- المرسل من موارد ---------- */
  function worksCount(sends) {
    var kinds = {};
    var n = 0;
    sends.forEach(function (s) {
      var w = String(s.work || '').trim();
      if (w && !kinds[w]) { kinds[w] = 1; n++; }
    });
    if (n === 0) return 'لا توجد أنواع بعد';
    if (n === 1) return 'نوع واحد';
    if (n === 2) return 'نوعان';
    if (n <= 10) return n + ' أنواع';
    return n + ' نوعاً';
  }

  function opsCount(n) {
    if (n === 1) return 'عملية واحدة';
    if (n === 2) return 'عمليتان';
    if (n <= 10) return n + ' عمليات';
    return n + ' عملية';
  }

  var WORK_SUGGESTIONS = ['بلاط محارة', 'خشب', 'حديد', 'دهانات', 'سباكة', 'كهرباء', 'نقشات', 'أبواب ونوافذ', 'محارة'];

  /* ---------- توريدات الموردين المرتبطة بهذا العميل ----------
     تظهر داخل «المرسل من موارد» وتُحتسب وتُخصم من رصيد المدفوع منا،
     وتُعرض كصفوف مرتبطة (بدون زر حذف) حتى لا تُسجّل مرتين. */
  function linkedSuppliesFor(c) {
    var out = [];
    if (!c || typeof isNetworkOn !== 'function' || !isNetworkOn()) return out;
    var name = String(c.name || '').trim();
    if (!name) return out;
    getSuppliers().forEach(function (s) {
      (s.tx || []).forEach(function (t) {
        var inc = Number(t.incoming || 0);
        if (inc > 0 && String(t.to || '').trim() === name) {
          out.push({
            work: String(t.work || '').trim() || String(t.desc || '').trim() || 'توريد مورد',
            date: t.date || '',
            desc: String(t.desc || '').trim() || ('توريد من المورد: ' + (s.name || '')),
            qty: '', price: '', total: inc,
            note: t.note || '', supplier: s.name || ''
          });
        }
      });
    });
    return out;
  }

  function mergedSendEntries(c, d) {
    var own = ((d && d.sends) || []).map(function (x, i) { return { x: x, i: i, linked: false }; });
    var linked = linkedSuppliesFor(c).map(function (x) { return { x: x, i: -1, linked: true }; });
    var all = own.concat(linked);
    return all.map(function (e, k) { return { e: e, k: k }; })
      .sort(function (a, b) {
        var da = String(a.e.x.date || ''), db = String(b.e.x.date || '');
        if (da === db) return a.k - b.k;
        return da < db ? -1 : 1;
      })
      .map(function (o) { return o.e; });
  }

  /* إجمالي المرسل ورصيده: الخاص + توريدات الموردين المرتبطة */
  function profileSendSum(c, d) {
    var sum = Number((d && d.sendSum) || 0);
    linkedSuppliesFor(c).forEach(function (x) { sum += Number(x.total || 0); });
    return sum;
  }
  function profileSendBal(c, d) {
    return Math.max(Number((d && d.paidByUs) || 0) - profileSendSum(c, d), 0);
  }
  var sendView = { filter: '', grouped: false };

  function uniqueWorks(sends) {
    var out = [];
    sends.forEach(function (s) {
      var w = String(s.work || '').trim();
      if (w && out.indexOf(w) === -1) out.push(w);
    });
    return out;
  }

  function fillSendDatalists(d) {
    var types = uniqueWorks(d.sends);
    var all = types.concat(WORK_SUGGESTIONS).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var wdl = $('#workTypes');
    if (wdl) {
      wdl.innerHTML = all.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');
    }
    var fdl = $('#filterTypes');
    if (fdl) {
      fdl.innerHTML = types.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');
    }
  }

  function annotateEntries(entries, paidByUs) {
    var cum = 0;
    return entries.map(function (e) {
      var t = e.x.total != null ? Number(e.x.total)
        : Number(e.x.qty || 0) * Number(e.x.price || 0);
      var before = Math.max(paidByUs - cum, 0);
      cum += t;
      return { x: e.x, i: e.i, linked: e.linked, before: before, after: Math.max(paidByUs - cum, 0) };
    });
  }

  function sendRowHtml(e) {
    var x = e.x;
    var workCell = esc(x.work || '—') + (e.linked && x.supplier
      ? ' <span class="party-chip">مورد: ' + esc(x.supplier) + '</span>' : '');
    return '<tr>' +
      '<td>' + workCell + '</td>' +
      '<td>' + esc(formatDate(x.date)) + '</td>' +
      '<td>' + esc(x.desc) + '</td>' +
      '<td>' + esc(x.qty) + '</td>' +
      '<td class="amount">' + money(x.price) + '</td>' +
      '<td class="amount">' + money(x.total) + '</td>' +
      '<td class="amount">' + money(e.before) + '</td>' +
      '<td class="amount pos">' + money(e.after) + '</td>' +
      '<td>' + (x.note ? esc(x.note) : '—') + '</td>' +
      '<td class="col-cell">' + (e.linked
        ? '<span class="tag tag--warn" title="توريد مورد مرتبط بهذا العميل — يُحتسب ويُخصم تلقائياً">مرتبط</span>'
        : '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-send="' + e.i + '">حذف</button>') + '</td>' +
      '</tr>';
  }

  function buildSendRows(c, d) {
    var entries = annotateEntries(mergedSendEntries(c, d), Number(d.paidByUs || 0));
    if (sendView.filter) {
      entries = entries.filter(function (e) {
        return String(e.x.work || '').indexOf(sendView.filter) > -1;
      });
    }
    if (!entries.length) {
      var msg = d.sends.length === 0
        ? 'لا توجد عمليات مرسل من الموارد — أضف أول عملية من النموذج أعلاه.'
        : 'لا توجد عمليات مطابقة للشغلانة «' + esc(sendView.filter) + '».';
      return '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px">' + msg + '</td></tr>';
    }
    if (!sendView.grouped) return entries.map(sendRowHtml).join('');

    var groups = [], index = {};
    entries.forEach(function (e) {
      var w = String(e.x.work || '').trim() || '—';
      if (!index[w]) { index[w] = { name: w, items: [], total: 0 }; groups.push(index[w]); }
      index[w].items.push(e);
      index[w].total += Number(e.x.total || 0);
    });
    return groups.map(function (g) {
      var head = '<tr class="group-row"><td colspan="10"><b>' + esc(g.name) + '</b>' +
        '<span>' + opsCount(g.items.length) + '</span>' +
        '<span class="group-total">الإجمالي: ' + money(g.total) + '</span></td></tr>';
      return head + g.items.map(sendRowHtml).join('');
    }).join('');
  }

  function refreshSendTable() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    $('#sendTable tbody').innerHTML = buildSendRows(c, derive(c));
  }

  function updateSendCalc() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    var d = derive(c);
    var f = $('#sendForm').elements;
    var qty = parseFloat(f.qty.value) || 0;
    var price = parseFloat(f.price.value) || 0;
    var total = qty * price;
    var bal = profileSendBal(c, d);
    f.sendTotal.value = money(total);
    f.beforeBal.value = money(bal);
    f.afterBal.value = money(Math.max(bal - total, 0));
  }

  var sendForm = $('#sendForm');
  if (sendForm) {
    sendForm.addEventListener('input', updateSendCalc);
    sendForm.addEventListener('change', updateSendCalc);

    sendForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#sendError');
      var fail = function (msg) { errEl.textContent = msg; errEl.hidden = false; };
      var f = sendForm.elements;
      var date = f.date.value;
      var work = String(f.work.value || '').trim();
      var desc = String(f.desc.value || '').trim();
      var qty = parseFloat(f.qty.value);
      var price = parseFloat(f.price.value);
      var list = getCustomers();
      var c = list[currentIdx];
      if (!c) return;
      var d = derive(c);

      var miss = [];
      if (!work) miss.push('الشغلانة');
      if (!date) miss.push('التاريخ');
      if (!desc) miss.push('المرسل / البيان');
      if (!(qty > 0)) miss.push('الكمية');
      if (!(price > 0)) miss.push('السعر');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));

      var total = qty * price;
      var bal = profileSendBal(c, d);
      if (d.paidByUs > 0 && total > bal) {
        return fail('الرصيد غير كافٍ — المتبقي من المبلغ المدفوع منا للعميل: ' + money(bal));
      }

      var sends = d.sends.slice();
      sends.push({
        work: work, date: date, desc: desc, qty: qty, price: price, total: total,
        note: String(f.note.value || '').trim()
      });
      c.sends = sends;
      saveCustomers(list);

      renderProfile();
      toast('تمت إضافة مرسل بقيمة ' + money(total) + ' — المتبقي بعد الطرح: ' + money(Math.max(profileSendBal(c, d) - total, 0)));
    });
  }

  /* ---------- اقتراح الشغلانات أثناء الكتابة + درج الشغلانات ---------- */
  var filterEl2 = $('#sendFilter');

  function currentRecordedWorks() {
    var c = getCustomers()[currentIdx];
    if (!c) return [];
    var xs = mergedSendEntries(c, derive(c)).map(function (e) { return e.x; });
    return uniqueWorks(xs);
  }
  function currentAllWorks() {
    return currentRecordedWorks().concat(WORK_SUGGESTIONS)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function worksMatching(q, pool) {
    q = String(q || '').trim();
    var all = pool || currentAllWorks();
    if (!q) return all.slice(0, 12);
    return all.filter(function (v) { return v.indexOf(q) > -1; }).slice(0, 12);
  }
  function renderSuggest(pop, items, onPick, query) {
    if (!pop) return;
    if (!items.length) {
      pop.innerHTML = '<div class="suggest-empty">' +
        (query ? 'لا توجد شغلانة مطابقة — اكتبها واضغط Enter عشان تضيفها كجديدة' : 'لا توجد شغلانات بعد') +
        '</div>';
      return;
    }
    pop.innerHTML = items.map(function (v, i) {
      return '<button type="button" data-suggest="' + i + '">' + esc(v) + '<small>اختيار</small></button>';
    }).join('');
    Array.prototype.forEach.call(pop.querySelectorAll('button[data-suggest]'), function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        onPick(items[Number(b.getAttribute('data-suggest'))]);
      });
    });
  }

  var sendWorkEl = $('#sendWork'), workPop = $('#workSuggest');
  if (sendWorkEl && workPop) {
    var showWorkSuggest = function () {
      var q = sendWorkEl.value;
      if (!String(q).trim()) { workPop.hidden = true; return; }
      var items = worksMatching(q, null);
      renderSuggest(workPop, items, function (v) {
        sendWorkEl.value = v;
        workPop.hidden = true;
        updateSendCalc();
      }, q);
      if (!items.some(function (v) { return v === q.trim(); })) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'suggest-add';
        add.innerHTML = '＋ إضافة «' + esc(q.trim()) + '» كشغلانة جديدة';
        add.addEventListener('mousedown', function (e) { e.preventDefault(); });
        add.addEventListener('click', function () { workPop.hidden = true; sendWorkEl.focus(); });
        workPop.appendChild(add);
      }
      workPop.hidden = false;
    };
    sendWorkEl.addEventListener('input', showWorkSuggest);
    sendWorkEl.addEventListener('focus', showWorkSuggest);
    sendWorkEl.addEventListener('blur', function () {
      setTimeout(function () { workPop.hidden = true; }, 160);
    });
    sendWorkEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') workPop.hidden = true;
    });
  }

  var drawerBtn = $('#worksDrawerBtn'), drawerEl = $('#worksDrawer');
  if (drawerBtn && drawerEl) {
    drawerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!drawerEl.hidden) { drawerEl.hidden = true; return; }
      renderSuggest(drawerEl, currentAllWorks(), function (v) {
        var wi = $('#sendWork');
        if (wi) {
          wi.value = v;
          updateSendCalc();
          if (wi.focus) wi.focus();
        }
        drawerEl.hidden = true;
        toast('اتاخت الشغلانة «' + v + '»');
      }, '');
      drawerEl.hidden = false;
    });
    document.addEventListener('click', function (e) {
      if (drawerEl.hidden) return;
      if (!drawerEl.contains(e.target) && e.target !== drawerBtn) drawerEl.hidden = true;
    });
  }

  var filterSuggestEl = $('#filterSuggest');
  if (filterEl2 && filterSuggestEl) {
    filterEl2.addEventListener('focus', function () {
      renderSuggest(filterSuggestEl, worksMatching('', currentRecordedWorks()), function (v) {
        filterEl2.value = v;
        sendView.filter = v;
        if (sendView.grouped) {
          sendView.grouped = false;
          var g = $('#groupAllBtn');
          if (g) g.textContent = 'فرز الكل';
        }
        filterSuggestEl.hidden = true;
        refreshSendTable();
      }, '');
      filterSuggestEl.hidden = false;
    });
    filterEl2.addEventListener('blur', function () {
      setTimeout(function () { filterSuggestEl.hidden = true; }, 160);
    });
  }

  /* فرز وفرز العمليات حسب الشغلانة */
  var sendFilterEl = $('#sendFilter');
  if (sendFilterEl) {
    sendFilterEl.addEventListener('input', function () {
      sendView.filter = this.value.trim();
      if (sendView.filter && sendView.grouped) {
        sendView.grouped = false;
        var g = $('#groupAllBtn');
        if (g) g.textContent = 'فرز الكل';
      }
      refreshSendTable();
    });
  }

  var groupBtn = $('#groupAllBtn');
  if (groupBtn) {
    groupBtn.addEventListener('click', function () {
      sendView.grouped = !sendView.grouped;
      if (sendView.grouped) {
        sendView.filter = '';
        var f = $('#sendFilter');
        if (f) f.value = '';
      }
      this.textContent = sendView.grouped ? 'إلغاء الفرز' : 'فرز الكل';
      refreshSendTable();
    });
  }

  /* فتح ملف العميل عند الضغط على صفّه */
  var customersBody = document.querySelector('#customersTable tbody');
  if (customersBody) {
    customersBody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-idx]');
      if (tr) openProfile(Number(tr.getAttribute('data-idx')));
    });
  }

  /* ---------- الموردون ---------- */
  var KEY_SUPPLIERS = 'app_suppliers';
  var currentSupIdx = -1;

  var DEFAULT_SUPPLIERS = [
    {
      name: 'مؤسسة النور للتوريد', job: 'مواد بناء', phone: '0770111222', address: 'بغداد / الكرادة',
      tx: [
        { date: '2026-10-11', no: '1', desc: 'توريد 50 طن إسمنت', incoming: 5000000, paid: 4000000, note: 'دفعة أولى' },
        { date: '2026-10-19', no: '2', desc: 'جرد 1 — كرتونات رخصات', incoming: 250000, paid: 0, note: '' }
      ]
    },
    {
      name: 'شركة الأمل التجارية', job: 'أغذية', phone: '0781333444', address: 'بغداد / المنصور',
      tx: [
        { date: '2026-10-05', no: '1', desc: 'توريد مواد غذائية', incoming: 980000, paid: 800000, note: '' },
        { date: '2026-10-22', no: '2', desc: 'إضافة أصناف', incoming: 500000, paid: 200000, note: '' }
      ]
    },
    {
      name: 'مكتب الرافدين', job: 'قرطاسية', phone: '0750555666', address: 'البصرة / العشار',
      tx: [
        { date: '2026-10-08', no: '1', desc: 'قرطاسية ومستلزمات مكتبية', incoming: 295000, paid: 200000, note: '' }
      ]
    },
    {
      name: 'مخازن الفرات', job: 'مواد متنوعة', phone: '0770999888', address: 'كربلاء / المركز',
      tx: [
        { date: '2026-09-28', no: '1', desc: 'توريد مواد متنوعة', incoming: 4100000, paid: 3000000, note: '' },
        { date: '2026-10-15', no: '2', desc: 'جرد 1', incoming: 2000000, paid: 1000000, note: '' }
      ]
    }
  ];

  function getSuppliers() {
    try {
      var raw = localStorage.getItem(KEY_SUPPLIERS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_SUPPLIERS);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_SUPPLIERS));
  }
  function saveSuppliers(list) {
    try { localStorage.setItem(KEY_SUPPLIERS, JSON.stringify(list)); } catch (e) {}
  }

  /* ---------- مبالغ الطرف المسجّلة في «الدواخل والخوارج» ----------
     أي حركة نقدية مرتبطة بطرف (عميل / مورد / شريك) تظهر في بروفايله
     وتُضاف إلى إجمالياته — بدون تسجيل مزدوج لأن المصدر واحد. */
  function partyLedger(type, name) {
    var res = { list: [], in: 0, out: 0, count: 0 };
    var nm = String(name || '').trim();
    if (!nm || !type) return res;
    var own = type === 'customer' ? getCustomers()
      : type === 'supplier' ? getSuppliers()
        : type === 'partner' ? getPartners() : [];
    var exists = own.some(function (x) { return String(x.name || '').trim() === nm; });
    var rows = [];
    try { rows = getLedger() || []; } catch (e) { rows = []; }
    rows.forEach(function (t, i) {
      var p = t.party || {};
      var pName = String(p.name || '').trim();
      if (pName !== nm) return;
      if (p.type && p.type !== type) return;
      if (!p.type && !exists) return;
      var amt = Number(t.amount || 0);
      if (!(amt > 0)) return;
      var isOut = t.type === 'out';
      res.list.push({
        key: 'led:' + i, date: t.date || '', desc: t.desc || '',
        note: t.note || '', amount: amt, type: isOut ? 'out' : 'in'
      });
      if (isOut) res.out += amt; else res.in += amt;
      res.count++;
    });
    res.list.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    return res;
  }

  function deriveSup(s) {
    var tx = s.tx || [];
    var incoming = 0, paid = 0, workSum = 0, paySum = 0, workCount = 0, payCount = 0;
    tx.forEach(function (t) {
      var inc = Number(t.incoming || 0);
      var pd = Number(t.paid || 0);
      incoming += inc;
      paid += pd;
      if (inc > 0) { workSum += inc; workCount++; }
      if (pd > 0) { paySum += pd; payCount++; }
    });
    var led = partyLedger('supplier', s.name);
    return {
      tx: tx,
      incoming: incoming + led.in,
      paid: paid + led.out,
      rest: (incoming + led.in) - (paid + led.out),
      txIn: incoming, txPaid: paid,
      workSum: workSum, workCount: workCount,
      paySum: paySum, payCount: payCount,
      ledIn: led.in, ledOut: led.out, ledList: led.list
    };
  }

  function signed(v) {
    v = Number(v || 0);
    return v < 0 ? '-' + money(Math.abs(v)) : money(v);
  }

  function renderSuppliers(filter) {
    var tbody = $('#suppliersTable tbody');
    if (!tbody) return;
    var list = getSuppliers().map(function (s, i) { return { s: s, i: i }; });
    var q = (filter || '').trim();
    if (q) {
      list = list.filter(function (x) {
        return (x.s.name || '').indexOf(q) > -1 ||
               (x.s.job || '').indexOf(q) > -1 ||
               (x.s.phone || '').indexOf(q) > -1;
      });
    }
    tbody.innerHTML = '';
    list.forEach(function (entry, n) {
      var s = entry.s, d = deriveSup(s);
      var tr = document.createElement('tr');
      tr.setAttribute('data-sup-idx', entry.i);
      tr.innerHTML =
        '<td>' + (n + 1) + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.job || '—') + '</td>' +
        '<td>' + esc(s.phone || '—') + '</td>' +
        '<td class="amount">' + money(d.incoming) + '</td>' +
        '<td class="amount">' + money(d.paid) + '</td>' +
        '<td class="amount">' + signed(d.rest) + '</td>';
      tbody.appendChild(tr);
    });
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">لا يوجد مورد مطابق للبحث</td></tr>';
    }
    var c = $('#suppliersCount');
    if (c) c.textContent = list.length + ' مورد';
  }

  function openSupplierProfile(i) {
    currentSupIdx = i;
    showView('supplier-profile');
  }

  function startSupplierEdit(idx) {
    var s = getSuppliers()[idx];
    if (!s || !supplierForm) { toast('المورد غير موجود', true); return; }
    var f = supplierForm.elements;
    supplierEditIdx = idx;
    f.name.value = s.name || '';
    f.job.value = s.job || '';
    f.phone.value = s.phone || '';
    f.address.value = s.address || '';
    f.note.value = s.note || '';
    showView('add-supplier');
    setSupplierFormMode(true);
    toast('وضع التعديل — عدّل البيانات ثم احفظ');
  }

  var supEditBtn = $('#supEditBtn');
  if (supEditBtn) supEditBtn.addEventListener('click', function () {
    var s = getSuppliers()[currentSupIdx];
    if (!s) { toast('المورد غير موجود', true); return; }
    openConfirm({
      title: 'تعديل بيانات المورد',
      message: 'هل أنت متأكد من أنك تريد تعديل بيانات المورد «' + (s.name || '') + '»؟',
      yes: 'نعم، تعديل',
      no: 'تراجع',
      onYes: function () { startSupplierEdit(currentSupIdx); }
    });
  });

  function updateSupTxCalc() {
    var list = getSuppliers();
    var s = list[currentSupIdx];
    if (!s) return;
    var d = deriveSup(s);
    var f = $('#supTxForm').elements;
    var inc = parseFloat(f.incoming.value) || 0;
    var pd = parseFloat(f.paid.value) || 0;
    f.tIn.value = money(d.incoming + inc);
    f.tPaid.value = money(d.paid + pd);
    f.tRest.value = signed(d.rest + inc - pd);
  }

  function renderSupplierProfile() {
    var list = getSuppliers();
    var s = list[currentSupIdx];
    if (!s) { showView('suppliers'); return; }
    var d = deriveSup(s);

    $('#supProfileTitle').textContent = 'كشف حساب: ' + (s.name || '');
    $('#supProfileSub').textContent = (s.job || '—') + (s.address ? ' • ' + s.address : '');
    var pill = $('#supProfilePhone');
    pill.textContent = s.phone || '—';
    pill.style.background = 'rgba(34,211,238,.14)';
    pill.style.borderColor = 'rgba(34,211,238,.45)';
    pill.style.color = '#67e8f9';

    $('#supProfileSummary').innerHTML =
      '<div class="summary-top">' +
        '<div><h3>ملخص كشف الحساب</h3><p>' + esc(s.name || '') + ' — ' + d.tx.length + ' حركة مسجّلة</p></div>' +
        '<div class="stat"><b>' + signed(d.rest) + '</b><small>' + (d.rest >= 0 ? 'مستحق للمورد' : 'متحصل / زائد') + '</small></div>' +
      '</div>' +
      '<div class="summary">' +
        '<div class="summary__box summary__box--in"><small>إجمالي المشتريات (الوارد)</small><b>' + money(d.incoming) + '</b></div>' +
        '<div class="summary__box summary__box--out"><small>إجمالي المدفوع للمورد</small><b>' + money(d.paid) + '</b></div>' +
        '<div class="summary__box summary__box--net"><small>الباقي / المستحق</small><b>' + signed(d.rest) + '</b></div>' +
      '</div>';

    renderSupTxTable(d);

    var f = $('#supTxForm');
    f.elements.date.value = todayISO();
    f.elements.no.value = String(d.tx.length + 1);
    f.elements.desc.value = '';
    f.elements.incoming.value = '';
    f.elements.paid.value = '';
    f.elements.note.value = '';
    if (f.elements.to) f.elements.to.value = '';
    fillPartyLists();
    $('#supTxError').hidden = true;
    updateSupTxCalc();

    var pf = $('#supPayForm');
    if (pf) {
      pf.elements.date.value = todayISO();
      pf.elements.amount.value = '';
      pf.elements.no.value = '';
      pf.elements.note.value = '';
    }
    var pe = $('#supPayError');
    if (pe) pe.hidden = true;
    updateSupPayCalc();
    renderSupLedger(d);
  }

  /* ---------- جدول حركات المورد مع التصنيف ---------- */
  function renderSupTxTable(d) {
    var rows = '', running = 0;
    (d.tx || []).forEach(function (t, i) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      var isWork = Number(t.incoming || 0) > 0;
      var isPay = Number(t.paid || 0) > 0;
      if (supTxFilter === 'work' && !isWork) return;
      if (supTxFilter === 'pay' && !isPay) return;
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(t.date)) + '</td>' +
        '<td>' + esc(t.no || '—') + '</td>' +
        '<td>' + esc(t.desc || '—') +
          (isWork ? ' <span class="tag tag--in">شغل</span>' : '') +
          (isPay && !isWork ? ' <span class="tag tag--out">دفعة</span>' : '') +
        '</td>' +
        '<td>' + (t.to ? esc(t.to) : '—') + '</td>' +
        '<td>' + (t.work ? esc(t.work) : '—') + '</td>' +
        '<td class="amount">' + money(t.incoming) + '</td>' +
        '<td class="amount">' + money(t.paid) + '</td>' +
        '<td class="amount">' + signed(running) + '</td>' +
        '<td>' + (t.note ? esc(t.note) : '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-suptx="' + i + '">حذف</button></td>' +
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:24px">' +
        (supTxFilter === 'work' ? 'لا توجد حركات شغل/توريد مسجّلة على هذا المورد.'
          : supTxFilter === 'pay' ? 'لا توجد دفعات مسجّلة على هذا المورد.'
            : 'لا توجد حركات على هذا المورد — أضف أول حركة من النموذج أعلاه.') + '</td></tr>';
    }
    var tb = $('#supTxTable tbody');
    if (tb) tb.innerHTML = rows;
    $$('#supTxFilter [data-sup-filter]').forEach(function (b) {
      var on = b.getAttribute('data-sup-filter') === supTxFilter;
      b.className = 'btn btn--sm ' + (on ? 'btn--primary' : 'btn--ghost');
    });
  }

  /* ---------- حساب الدفعة قبل الحفظ ---------- */
  function updateSupPayCalc() {
    var form = $('#supPayForm');
    if (!form) return;
    var s = getSuppliers()[currentSupIdx];
    if (!s) return;
    var d = deriveSup(s);
    var amt = parseFloat(form.elements.amount.value) || 0;
    form.elements.pRest.value = signed(Math.max(d.rest, 0));
    form.elements.pPaid.value = money(d.paid + amt);
    form.elements.pAfter.value = signed(d.rest - amt);
  }

  /* ---------- حركات الدواخل والخوارج المرتبطة بالمورد ---------- */
  function renderSupLedger(d) {
    var body = $('#supLedgerBody');
    if (!body) return;
    var list = (d && d.ledList) || [];
    if (!list.length) {
      body.innerHTML = '<p class="panel__hint">لا توجد حركات مرتبطة. أي مبلغ تسجّله في «الدواخل والخوارج» وتختار الطرف «مورد» وتكتب اسمه، يظهر هنا ويُحتسب في كشف الحساب.</p>';
      return;
    }
    var ops = list.map(function (o) {
      return {
        date: o.date, desc: o.desc || 'حركة من الدواخل والخوارج',
        src: 'الدواخل والخوارج', dir: o.type === 'out' ? 'out' : 'in',
        amount: o.amount, cash: true
      };
    });
    body.innerHTML = '<p class="panel__note">إجمالي الحركات المرتبطة: دخل ' + money(d.ledIn) +
      ' — خارج ' + money(d.ledOut) + ' (' + list.length + ' حركة) — محتسبة داخل كشف الحساب أعلاه بدون تكرار.</p>' +
      opsTable(ops);
  }

  var supTxForm = $('#supTxForm');
  if (supTxForm) {
    supTxForm.addEventListener('input', updateSupTxCalc);
    supTxForm.addEventListener('change', updateSupTxCalc);
    supTxForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#supTxError');
      var fail = function (m) { errEl.textContent = m; errEl.hidden = false; };
      var f = supTxForm.elements;
      var date = f.date.value;
      var desc = String(f.desc.value || '').trim();
      var inc = parseFloat(f.incoming.value) || 0;
      var pd = parseFloat(f.paid.value) || 0;
      var toName = String((f.to && f.to.value) || '').trim();
      var workName = String((f.work && f.work.value) || '').trim();

      if (!date) fail('الرجاء إدخال التاريخ');
      else if (!desc) fail('الرجاء إدخال البيان');
      else if (!(inc > 0) && !(pd > 0)) fail('أدخل مبلغاً في الوارد أو المدفوع');
      else if (toName && !workName) fail('الشغلانة إجبارية مع العميل — اخترها من شغلاناته أو اكتبها');
      else {
        var list = getSuppliers();
        var s = list[currentSupIdx];
        if (!s) return;
        var tx = (s.tx || []).slice();
        tx.push({
          date: date,
          no: String(f.no.value || '').trim(),
          desc: desc,
          incoming: inc,
          paid: pd,
          to: toName,
          work: workName,
          note: String(f.note.value || '').trim()
        });
        tx.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
        s.tx = tx;
        saveSuppliers(list);
        renderSupplierProfile();
        toast('تمت إضافة الحركة — الباقي: ' + signed(deriveSup(s).rest));
      }
    });
  }

  /* ---------- تصنيف حركات المورد (الكل / الشغل / الدفعات) ---------- */
  var supTxFilter = 'all';

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-sup-filter]') : null;
    if (!b) return;
    supTxFilter = b.getAttribute('data-sup-filter') || 'all';
    var s = getSuppliers()[currentSupIdx];
    if (s) renderSupTxTable(deriveSup(s));
  });

  /* ---------- حفظ دفعة للمورد (بدون توريد) ---------- */
  var supPayForm = $('#supPayForm');
  if (supPayForm) {
    supPayForm.addEventListener('input', function () {
      var pe = $('#supPayError');
      if (pe) pe.hidden = true;
      updateSupPayCalc();
    });
    supPayForm.addEventListener('change', updateSupPayCalc);
    supPayForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#supPayError');
      var fail = function (m) { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
      var f = supPayForm.elements;
      var date = f.date.value;
      var amt = parseFloat(f.amount.value);
      var note = String(f.note.value || '').trim();
      if (!date) return fail('الرجاء إدخال تاريخ الدفعة');
      if (!(amt > 0)) return fail('أدخل مبلغاً صحيحاً أكبر من صفر');
      if (errEl) errEl.hidden = true;

      var list = getSuppliers();
      var s = list[currentSupIdx];
      if (!s) return;
      var tx = (s.tx || []).slice();
      tx.push({
        date: date,
        no: String(f.no.value || '').trim(),
        desc: note || 'دفعة نقدية للمورد',
        incoming: 0,
        paid: amt,
        kind: 'payment',
        to: '',
        work: '',
        note: note
      });
      tx.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      s.tx = tx;
      saveSuppliers(list);
      renderSupplierProfile();
      toast('تم تسجيل دفعة ' + money(amt) + ' للمورد — الباقي: ' + signed(deriveSup(s).rest));
    });
  }

  /* ---------- شغلانات العميل المحدّد في توريد المورد ---------- */
  function customerWorksNamed(name) {
    name = String(name || '').trim();
    if (!name) return [];
    var c = getCustomers().filter(function (x) { return String(x.name || '').trim() === name; })[0];
    if (!c) return [];
    return uniqueWorks(c.sends || []).concat(WORK_SUGGESTIONS)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  var supToEl = $('#supToInput'), supWorkEl = $('#supWorkInput'), supWorkPop = $('#supWorkSuggest');
  if (supWorkEl && supWorkPop) {
    var showSupWorkSuggest = function () {
      var to = supToEl ? supToEl.value : '';
      var q = String(supWorkEl.value || '').trim();
      var pool = customerWorksNamed(to);
      if (!pool.length) pool = WORK_SUGGESTIONS.slice();
      var items = worksMatching(q, pool);
      renderSuggest(supWorkPop, items, function (v) {
        supWorkEl.value = v;
        supWorkPop.hidden = true;
      }, q);
      if (q && !items.some(function (v) { return v === q; })) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'suggest-add';
        add.innerHTML = '＋ إضافة «' + esc(q) + '» كشغلانة جديدة';
        add.addEventListener('mousedown', function (e) { e.preventDefault(); });
        add.addEventListener('click', function () { supWorkPop.hidden = true; if (supWorkEl.focus) supWorkEl.focus(); });
        supWorkPop.appendChild(add);
      }
      supWorkPop.hidden = false;
    };
    supWorkEl.addEventListener('input', showSupWorkSuggest);
    supWorkEl.addEventListener('focus', showSupWorkSuggest);
    supWorkEl.addEventListener('blur', function () { setTimeout(function () { supWorkPop.hidden = true; }, 160); });
    if (supToEl) supToEl.addEventListener('change', function () {
      if (document.activeElement === supWorkEl) showSupWorkSuggest();
    });
  }

  /* إضافة مورد */
  var supplierEditIdx = -1;   /* >= 0 يعني النموذج في وضع التعديل */

  function setSupplierFormMode(isEdit) {
    var view = $('#view-add-supplier');
    if (!view || !supplierForm) return;
    var h2 = view.querySelector('h2');
    var sub = view.querySelector('.page-head__title p');
    var submit = supplierForm.querySelector('button[type="submit"]');
    if (h2) h2.textContent = isEdit ? 'تعديل مورد' : 'إضافة مورد';
    if (sub) sub.textContent = isEdit
      ? 'عدّل البيانات ثم اضغط «حفظ التعديلات»'
      : 'أدخل بيانات المورد — الحقول المعلّمة بـ * إلزامية';
    if (submit) {
      submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> ' +
        (isEdit ? 'حفظ التعديلات' : 'حفظ المورد');
    }
  }

  function prepareSupplierView() {
    if (supplierEditIdx >= 0) { setSupplierFormMode(true); return; }
    if (supplierForm) supplierForm.reset();
    var err = $('#supplierFormError');
    if (err) err.hidden = true;
    setSupplierFormMode(false);
  }

  var supplierForm = $('#supplierForm');
  if (supplierForm) {
    supplierForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#supplierFormError');
      var f = supplierForm.elements;
      var miss = [];
      [['name', 'sname', 'اسم المورد'], ['job', 'job', 'المهنة / التخصص'], ['phone', 'sphone', 'رقم التلفون']]
        .forEach(function (x) {
          var w = document.querySelector('[data-field="' + x[1] + '"]');
          if (!String(f[x[0]].value || '').trim()) {
            miss.push(x[2]);
            if (w) w.classList.add('is-missing');
          } else if (w) {
            w.classList.remove('is-missing');
          }
        });
      if (miss.length) {
        errEl.textContent = 'الرجاء إكمال الحقول التالية: ' + miss.join('، ');
        errEl.hidden = false;
        return;
      }
      errEl.hidden = true;
      var list = getSuppliers();
      var entry = {
        name: String(f.name.value).trim(),
        job: String(f.job.value).trim(),
        phone: String(f.phone.value).trim(),
        address: String(f.address.value || '').trim(),
        note: String(f.note.value || '').trim(),
        tx: []
      };

      /* وضع التعديل: نستبدل في مكانه مع الحفاظ على الحركات */
      if (supplierEditIdx >= 0 && list[supplierEditIdx]) {
        entry.tx = list[supplierEditIdx].tx || [];
        list[supplierEditIdx] = entry;
        var backIdx = supplierEditIdx;
        supplierEditIdx = -1;
        saveSuppliers(list);
        supplierForm.reset();
        setSupplierFormMode(false);
        currentSupIdx = backIdx;
        showView('supplier-profile');
        toast('تم حفظ تعديلات المورد ✓');
        return;
      }

      list.unshift(entry);
      saveSuppliers(list);
      supplierForm.reset();
      showView('suppliers');
      toast('تمت إضافة المورد «' + list[0].name + '» بنجاح');
    });
    supplierForm.addEventListener('input', function (e) {
      var w = e.target.closest ? e.target.closest('.field.is-missing') : null;
      if (w) w.classList.remove('is-missing');
      var err = $('#supplierFormError');
      if (err) err.hidden = true;
    });
  }

  var supDeleteBtn = $('#supDeleteBtn');
  if (supDeleteBtn) {
    supDeleteBtn.addEventListener('click', function () {
      var s = getSuppliers()[currentSupIdx];
      if (!s) { toast('المورد غير موجود', true); return; }
      openConfirm({
        title: 'حذف المورد',
        message: 'هل تريد حذف المورد «' + (s.name || '') + '»؟ الحذف نهائي وسيُحذف كشف حسابه كاملاً — سيُطلب كلمة المرور.',
        yes: 'نعم، حذف نهائي',
        no: 'تراجع',
        password: true,
        onYes: function () {
          var list = getSuppliers();
          if (!list[currentSupIdx]) { toast('المورد غير موجود', true); return; }
          var name = list[currentSupIdx].name || '';
          list.splice(currentSupIdx, 1);
          saveSuppliers(list);
          renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
          showView('suppliers');
          toast('تم حذف المورد «' + name + '» وكل حركاته');
        }
      });
    });
  }

  /* ---------- تصدير كشف حساب المورد (Excel / PDF) ---------- */
  function supplierProfileSheets(s) {
    var d = deriveSup(s);
    var info = [
      ['البيان', 'القيمة'],
      ['اسم المورد', s.name || ''],
      ['المهنة', s.job || ''],
      ['رقم التلفون', s.phone || ''],
      ['العنوان', s.address || ''],
      ['عدد الحركات', d.tx.length]
    ];
    var sum = [
      ['البند', 'المبلغ'],
      ['إجمالي المشتريات (الوارد)', d.incoming],
      ['إجمالي المدفوع للمورد', d.paid],
      ['الباقي / المستحق', d.rest]
    ];
    var tx = [['التاريخ', 'رقم الإيصال', 'البيان', 'الشغلانة', 'ورّد إلى', 'الوارد', 'المدفوع', 'الباقي', 'ملاحظات']];
    var running = 0;
    d.tx.forEach(function (t) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.work || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });
    (d.ledList || []).forEach(function (o) {
      var amt = Number(o.amount || 0);
      running += (o.type === 'out' ? -amt : amt);
      tx.push([formatDate(o.date), '', o.desc || 'حركة من الدواخل والخوارج', '', '',
        o.type === 'in' ? amt : 0, o.type === 'out' ? amt : 0, running, 'الدواخل والخوارج']);
    });
    var who = s.name || '';
    return [
      { name: 'بيانات المورد', title: 'بيانات المورد', subtitle: who, rows: info, widths: [28, 46] },
      { name: 'الملخص', title: 'الملخص المالي', subtitle: who, rows: sum, widths: [40, 22], moneyCols: [1], totalRow: false },
      { name: 'الحركات', title: 'كشف حركات المورد', subtitle: who + ' — ' + d.tx.length + ' حركة', rows: tx, widths: [16, 12, 34, 22, 24, 16, 16, 16, 30], moneyCols: [5, 6, 7], totalRow: false }
    ];
  }

  function supplierProfileReport(s) {
    var d = deriveSup(s);
    var rows = [
      ['اسم المورد', s.name || ''],
      ['المهنة', s.job || ''],
      ['الهاتف', s.phone || ''],
      ['العنوان', s.address || ''],
      ['عدد الحركات', d.tx.length],
      ['إجمالي المشتريات (الوارد)', d.incoming],
      ['إجمالي المدفوع للمورد', d.paid],
      ['الباقي / المستحق', signed(d.rest)]
    ];
    d.tx.forEach(function (t, i) {
      rows.push(['حركة ' + (i + 1) + ' — ' + (t.desc || ''), Number(t.incoming || 0), Number(t.paid || 0)]);
    });
    return {
      title: 'كشف حساب مورد: ' + (s.name || ''),
      subtitle: 'نظام الإدارة المتكامل — ' + new Date().toLocaleDateString('ar-EG'),
      columns: ['البند', 'الوارد', 'المدفوع'],
      moneyCols: [1, 2],
      totalRow: false,
      rows: rows,
      summary: [
        { label: 'الوارد', value: money(d.incoming) },
        { label: 'المدفوع', value: money(d.paid) },
        { label: 'الباقي', value: signed(d.rest) }
      ]
    };
  }

  var supExcelBtn = $('#supExcelBtn');
  if (supExcelBtn) supExcelBtn.addEventListener('click', function () {
    var s = getSuppliers()[currentSupIdx];
    if (!s) { toast('المورد غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      var bytes = ExportKit.buildXlsx(supplierProfileSheets(s));
      openExportModal('supplier-' + safeFileName(s.name) + '-' + exportStamp() + '.xlsx', MIME_XLSX, bytes);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var supPdfBtn = $('#supPdfBtn');
  if (supPdfBtn) supPdfBtn.addEventListener('click', function () {
    var s = getSuppliers()[currentSupIdx];
    if (!s) { toast('المورد غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    if (!ExportKit.hasCanvas()) { toast('تصدير PDF يحتاج متصفحاً حقيقياً', true); return; }
    try {
      var pdf = ExportKit.reportToPdf(supplierProfileReport(s));
      if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
      openExportModal('supplier-' + safeFileName(s.name) + '-' + exportStamp() + '.pdf', MIME_PDF, pdf);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  /* حذف حركة من كشف حساب المورد */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-del-suptx]') : null;
    if (!btn) return;
    var i = Number(btn.getAttribute('data-del-suptx'));
    var list = getSuppliers();
    var s = list[currentSupIdx];
    if (!s || !s.tx || !s.tx[i]) return;
    s.tx.splice(i, 1);
    saveSuppliers(list);
    renderSupplierProfile();
    toast('تم حذف الحركة — الباقي: ' + signed(deriveSup(s).rest));
  });

  /* بحث الموردين */
  var supplierSearch = $('#supplierSearch');
  if (supplierSearch) {
    supplierSearch.addEventListener('input', function () { renderSuppliers(this.value); });
  }

  /* فتح كشف حساب المورد */
  var suppliersBody = $('#suppliersTable tbody');
  if (suppliersBody) {
    suppliersBody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-sup-idx]');
      if (tr) openSupplierProfile(Number(tr.getAttribute('data-sup-idx')));
    });
  }

  /* ---------- الإعدادات: تغيير كلمة المرور ---------- */
  var pwdForm = $('#passwordForm');
  if (pwdForm) {
    pwdForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#pwdFormError');
      var data = new FormData(pwdForm);
      var current = String(data.get('current') || '');
      var next = String(data.get('next') || '');
      var confirm = String(data.get('confirm') || '');

      function fail(msg) { err.textContent = msg; err.hidden = false; }

      if (current !== getPassword()) return fail('كلمة المرور الحالية غير صحيحة');
      if (next.length < 4) return fail('كلمة المرور الجديدة يجب أن تكون 4 أرقام على الأقل');
      if (next !== confirm) return fail('كلمتا المرور الجديدتان غير متطابقتين');

      setPassword(next);
      err.hidden = true;
      pwdForm.reset();
      toast('تم تحديث كلمة المرور بنجاح');
    });

    pwdForm.addEventListener('input', function () { $('#pwdFormError').hidden = true; });
  }

  var relock = $('#relockBtn');
  if (relock) {
    relock.addEventListener('click', function () {
      Object.keys(unlocked).forEach(function (k) { delete unlocked[k]; });
      toast('تم قفل الأقسام المحمية مرة أخرى');
    });
  }

  /* ---------- تنبيهات ---------- */
  var toastTimer = null;
  function toast(msg, isError) {
    var el = $('#toast');
    el.querySelector('span').textContent = msg;
    el.style.borderColor = isError ? 'rgba(248,113,113,.5)' : 'rgba(52,211,153,.45)';
    el.style.color = isError ? '#fecaca' : '#d1fae5';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  /* ---------- الساعة والتواريخ (12 ساعة + هجري وميلادي) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function fmt12(d) {
    var h = d.getHours();
    var ap = h < 12 ? 'ص' : 'م';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + pad(d.getMinutes()) + ' ' + ap;
  }

  function fmtHijri(d) {
    var opts = { day: 'numeric', month: 'numeric', year: 'numeric' };
    var tries = ['ar-SA-u-ca-islamic-umalqura-nu-latn', 'ar-SA-u-ca-islamic-nu-latn'];
    for (var i = 0; i < tries.length; i++) {
      try {
        var t = new Intl.DateTimeFormat(tries[i], opts).format(d);
        return /هـ$/.test(t) ? t : t + ' هـ';
      } catch (e) {}
    }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' هـ';
  }

  function fmtGreg(d) {
    var opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
    var tries = ['ar-IQ-u-ca-gregory-nu-latn', 'ar-u-ca-gregory-nu-latn'];
    for (var i = 0; i < tries.length; i++) {
      try {
        var t = new Intl.DateTimeFormat(tries[i], opts).format(d);
        return /م$/.test(t) ? t : t + ' م';
      } catch (e) {}
    }
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' م';
  }

  function tick() {
    var d = new Date();
    var c = $('#clock');
    if (c) c.textContent = fmt12(d);
    var h = $('#dateHijri');
    if (h) h.textContent = fmtHijri(d);
    var g = $('#dateGreg');
    if (g) g.textContent = fmtGreg(d);
  }
  tick();
  setInterval(tick, 20000);

  /* ============================================================
     التحصيل الرئيسي — قائمة عملاء قابلة للتوسيع (أكورديون)
     الضغط على اسم العميل يفتح تفاصيل تحصيله أسفل السطر مباشرة
     ============================================================ */
  var collectionOpen = null;   /* فهرس العميل المفتوح حالياً — null يعني لا أحد */

  function colFilter() {
    var el = $('#collectionSearch');
    return el ? String(el.value || '') : '';
  }

  function colInitials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (!parts[0]) return '؟';
    return parts[0].charAt(0) + (parts[1] ? ' ' + parts[1].charAt(0) : '');
  }

  function colTotals() {
    var total = 0, paid = 0, rest = 0;
    getCustomers().forEach(function (c) {
      var d = derive(c);
      total += d.total;
      paid += d.down + d.paid;
      rest += d.rest;
    });
    return { total: total, paid: paid, rest: rest };
  }

  function renderCollectionSummary() {
    var box = $('#collectionSummary');
    if (!box) return;
    var t = colTotals();
    box.innerHTML =
      '<div class="summary__box"><small>المبلغ الإجمالي قبل خصم المقدم</small><b>' + money(t.total) + '</b></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المدفوع (مقدم + تحصيل)</small><b>' + money(t.paid) + '</b></div>' +
      '<div class="summary__box summary__box--out"><small>المبلغ الاجمالي المتبقي للتحصيل</small><b>' + money(t.rest) + '</b></div>';
  }

  function collectionDetailHTML(c, idx) {
    var d = derive(c);
    var paidTotal = d.down + d.paid;
    var pct = d.total > 0 ? Math.min(100, Math.round((paidTotal / d.total) * 100)) : (d.rest > 0 ? 0 : 100);

    var rows = '';
    var running = d.due - d.later;
    d.pays.forEach(function (p, i) {
      var before = running;
      running = Math.max(running - Number(p.amount || 0), 0);
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(p.date)) + '</td>' +
        '<td class="amount">' + money(before) + '</td>' +
        '<td class="amount pos">' + money(p.amount) + '</td>' +
        '<td>' + esc(p.no || (i + 1)) + '</td>' +
        '<td class="amount">' + money(running) + '</td>' +
        '<td>' + (p.note ? esc(p.note) : '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-colpay="' + i + '" data-cidx="' + idx + '">حذف</button></td>' +
        '</tr>';
    });
    (d.ledList || []).forEach(function (o, k) {
      rows += '<tr>' +
        '<td>' + (d.pays.length + k + 1) + '</td>' +
        '<td>' + esc(formatDate(o.date)) + '</td>' +
        '<td class="amount">—</td>' +
        '<td class="amount ' + (o.type === 'out' ? 'neg' : 'pos') + '">' + money(o.amount) + '</td>' +
        '<td><span class="tag ' + (o.type === 'out' ? 'tag--out' : 'tag--in') + '">دواخل/خوارج</span></td>' +
        '<td class="amount">—</td>' +
        '<td>' + esc(o.desc || 'حركة من الدواخل والخوارج') + '</td>' +
        '<td class="col-cell"><span class="cell-note">من الشاشة الأخرى</span></td>' +
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">لا توجد عمليات تحصيل بعد — أضف أول دفعة من النموذج أعلاه.</td></tr>';
    }

    return '<div class="col-detail">' +
      '<div class="col-detail__head">' +
        '<div class="col-detail__id">' +
          '<span class="avatar">' + esc(colInitials(c.name)) + '</span>' +
          '<div><b>' + esc(c.name || 'بدون اسم') + '</b>' +
          '<small>' + esc(c.phone || 'بدون هاتف') + (c.address ? ' · ' + esc(c.address) : '') + '</small></div>' +
        '</div>' +
        '<div class="col-detail__tools">' +
          '<span class="status-pill">' + esc(c.status || 'غير محدد') + '</span>' +
          '<button type="button" class="btn btn--ghost" data-open-profile="' + idx + '">فتح الملف الكامل</button>' +
        '</div>' +
      '</div>' +

      '<div class="summary">' +
        '<div class="summary__box"><small>المبلغ الإجمالي قبل خصم المقدم</small><b>' + money(d.total) + '</b></div>' +
        '<div class="summary__box summary__box--in"><small>إجمالي المدفوع (مقدم + تحصيل)</small><b>' + money(paidTotal) + '</b></div>' +
        '<div class="summary__box summary__box--out"><small>المبلغ الاجمالي المتبقي</small><b>' + money(d.rest) + '</b></div>' +
      '</div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="progress-label"><span>نسبة السداد: ' + pct + '%</span>' +
        '<span>قيمة القسط: ' + ((d.n > 0 && d.unit) ? money(d.rest / d.n) + ' / ' + d.unit : '—') + '</span></div>' +

      '<form class="form" id="mainCollectForm" data-idx="' + idx + '" novalidate>' +
        '<div class="form__row form__row--3">' +
          '<label class="field"><span>التاريخ *</span><input type="date" name="date" value="' + todayISO() + '" required /></label>' +
          '<label class="field"><span>المبلغ المدفوع *</span><input type="number" name="amount" min="0" step="any" required placeholder="0" /></label>' +
          '<label class="field"><span>المرة الكام في الدفع *</span><input type="number" name="no" min="1" step="1" required value="' + (d.pays.length + 1) + '" /></label>' +
        '</div>' +
        '<div class="form__row">' +
          '<label class="field field--full"><span>ملاحظة (اختياري)</span><input type="text" name="note" placeholder="ملاحظة حول هذه الدفعة…" /></label>' +
        '</div>' +
        '<div class="calc-grid">' +
          '<div class="calc-box"><span>المبلغ الاجمالي المتبقي</span><input type="text" name="restBefore" readonly tabindex="-1" value="' + money(d.rest) + '" /></div>' +
          '<div class="calc-box calc-box--accent"><span>المتبقي بعد هذه الدفعة</span><input type="text" name="restAfter" readonly tabindex="-1" value="' + money(d.rest) + '" /></div>' +
        '</div>' +
        '<p class="form__error" hidden></p>' +
        '<div class="form__actions">' +
          '<button type="submit" class="btn btn--primary"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"></use></svg> إضافة تحصيل</button>' +
        '</div>' +
      '</form>' +

      '<div class="table-wrap">' +
        '<table class="table">' +
          '<thead><tr><th>#</th><th>التاريخ</th><th>المبلغ قبل الدفعة</th><th>المبلغ المدفوع</th><th>المرة في الدفع</th><th>المتبقي بعد الدفعة</th><th>ملاحظات</th><th style="width:64px"><span class="sr-only">حذف</span></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function updateMainCalc(form) {
    var c = getCustomers()[Number(form.getAttribute('data-idx'))];
    if (!c) return;
    var d = derive(c);
    var amt = parseFloat(form.elements.amount.value) || 0;
    form.elements.restBefore.value = money(d.rest);
    form.elements.restAfter.value = money(Math.max(d.rest - amt, 0));
  }

  function renderCollection(filter) {
    var tbody = $('#collectTbody');
    if (!tbody) return;

    var q = String(filter || '').trim();
    var list = getCustomers().map(function (c, i) { return { c: c, i: i }; });
    if (q) {
      list = list.filter(function (x) {
        var c = x.c;
        return (c.name || '').indexOf(q) > -1 ||
               (c.phone || '').indexOf(q) > -1 ||
               (c.address || '').indexOf(q) > -1;
      });
    }

    /* لو العميل المفتوح اختفى من نتائج البحث نغلقه */
    if (collectionOpen != null && !list.some(function (x) { return x.i === collectionOpen; })) {
      collectionOpen = null;
    }

    var html = '';
    list.forEach(function (entry, n) {
      var c = entry.c;
      var d = derive(c);
      var open = collectionOpen === entry.i;
      html += '<tr class="collection-row' + (open ? ' is-open' : '') + '" data-idx="' + entry.i + '">' +
        '<td>' + (n + 1) + '</td>' +
        '<td class="col-name">' + esc(c.name || 'بدون اسم') + '</td>' +
        '<td>' + esc(c.phone || '—') + '</td>' +
        '<td>' + esc(c.address || '—') + '</td>' +
        '<td class="amount' + (d.rest > 0 ? ' neg' : '') + '">' + money(d.rest) + '</td>' +
        '<td class="col-arrow"><span class="chev"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-arrow"></use></svg></span></td>' +
        '</tr>';
      if (open) {
        html += '<tr class="collection-detail"><td colspan="6">' + collectionDetailHTML(c, entry.i) + '</td></tr>';
      }
    });

    if (!list.length) {
      html = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:26px">' +
        (q ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء بعد — أضف عميلاً أولاً') + '</td></tr>';
    }

    tbody.innerHTML = html;

    var countEl = $('#collectionCount');
    if (countEl) countEl.textContent = list.length + ' عميل';

    var openForm = $('#mainCollectForm');
    if (openForm) updateMainCalc(openForm);
  }

  document.addEventListener('click', function (e) {
    var openBtn = e.target && e.target.closest ? e.target.closest('[data-open-profile]') : null;
    if (openBtn) {
      openProfile(Number(openBtn.getAttribute('data-open-profile')));
      return;
    }
    var row = e.target && e.target.closest ? e.target.closest('.collection-row') : null;
    if (!row) return;
    var idx = Number(row.getAttribute('data-idx'));
    collectionOpen = (collectionOpen === idx) ? null : idx;
    renderCollection(colFilter());
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.id !== 'mainCollectForm') return;
    e.preventDefault();

    var err = form.querySelector('.form__error');
    var fail = function (msg) { if (err) { err.textContent = msg; err.hidden = false; } };

    var list = getCustomers();
    var c = list[Number(form.getAttribute('data-idx'))];
    if (!c) return;
    var d = derive(c);
    var el = form.elements;
    var date = el.date.value;
    var amt = parseFloat(el.amount.value);
    var no = parseInt(el.no.value, 10);

    var miss = [];
    if (!date) miss.push('التاريخ');
    if (!(amt > 0)) miss.push('المبلغ المدفوع');
    if (!(no > 0)) miss.push('المرة في الدفع');
    if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
    if (amt > d.rest) return fail('المبلغ المدفوع أكبر من المتبقي (' + money(d.rest) + ')');
    if (err) err.hidden = true;

    var pays = d.pays.slice();
    pays.push({ date: date, amount: amt, no: no, note: String(el.note.value || '').trim() });
    pays.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    c.payments = pays;
    c.rest = Math.max(d.rest - amt, 0);
    c.balance = c.rest;
    if (c.due == null) c.due = d.due;
    saveCustomers(list);

    renderCollection(colFilter());
    renderCollectionSummary();
    renderHomeStats();
    toast('تمت إضافة تحصيل بقيمة ' + money(amt) + ' — المتبقي: ' + money(c.rest));
  });

  function mainCollectRecalc(e) {
    var form = e.target && e.target.closest ? e.target.closest('#mainCollectForm') : null;
    if (form) updateMainCalc(form);
  }
  document.addEventListener('input', mainCollectRecalc);
  document.addEventListener('change', mainCollectRecalc);

  var collectionSearch = $('#collectionSearch');
  if (collectionSearch) {
    collectionSearch.addEventListener('input', function () {
      renderCollection(this.value);
    });
  }

  safeRun(function () { renderCollection(''); renderCollectionSummary(); }, 'التحصيل');

  /* ============================================================
     الدواخل والخوارج — حركة مالية حقيقية محفوظة في localStorage
     ============================================================ */
  var KEY_LEDGER = 'app_ledger';

  var DEFAULT_LEDGER = [
    { date: '2026-10-24', type: 'in',  desc: 'دفعة من عميل: أحمد محمد',     amount: 750000,  note: '' },
    { date: '2026-10-23', type: 'out', desc: 'إيجار المخزن',                amount: 300000,  note: '' },
    { date: '2026-10-22', type: 'in',  desc: 'بيع بضاعة – مؤسسة الأمل',     amount: 1250000, note: '' },
    { date: '2026-10-21', type: 'out', desc: 'رواتب الموظفين',              amount: 900000,  note: '' },
    { date: '2026-10-20', type: 'in',  desc: 'تحصيل من عميل: سالم عبدالله', amount: 420000,  note: '' }
  ];

  function getLedger() {
    try {
      var raw = localStorage.getItem(KEY_LEDGER);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_LEDGER);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_LEDGER));
  }
  function saveLedger(list) {
    try { localStorage.setItem(KEY_LEDGER, JSON.stringify(list)); } catch (e) {}
  }

  function ledgerTotals(includeAuto) {
    var list = getLedger().slice();
    if (includeAuto === undefined ? ledgerAutoOn() : includeAuto) list = list.concat(autoCashOps());
    var inc = 0, out = 0;
    list.forEach(function (t) {
      var a = Number(t.amount || 0);
      if (t.type === 'out') out += a; else inc += a;
    });
    return { inc: inc, out: out, net: inc - out, count: list.length };
  }

  function renderLedgerSummary() {
    var box = $('#ledgerSummary');
    if (!box) return;
    var t = ledgerTotals();
    box.innerHTML =
      '<div class="summary__box summary__box--in"><small>إجمالي الدواخل</small><b>' + money(t.inc) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--out"><small>إجمالي الخوارج</small><b>' + money(t.out) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--net"><small>الرصيد الصافي</small><b>' + money(t.net) + '</b><span>هـ.د</span></div>';
  }

  function renderLedger() {
    var tbody = $('#ledgerTbody');
    if (!tbody) return;

    var qEl = $('#ledgerSearch');
    var tfEl = $('#ledgerTypeFilter');
    var q = qEl ? String(qEl.value || '').trim() : '';
    var tf = tfEl ? tfEl.value : '';

    var showAuto = ledgerAutoOn();
    var list = getLedger().map(function (t, i) { return { t: t, i: i, auto: false }; });
    if (showAuto) autoCashOps().forEach(function (o) { list.push({ t: o, i: -1, auto: true }); });
    if (tf) list = list.filter(function (x) { return x.t.type === tf; });
    if (q) {
      list = list.filter(function (x) {
        return String(x.t.desc || '').indexOf(q) > -1 || String(x.t.note || '').indexOf(q) > -1;
      });
    }
    /* الأحدث أولاً */
    list.sort(function (a, b) {
      return String(b.t.date || '').localeCompare(String(a.t.date || '')) || (b.i - a.i);
    });

    var html = '';
    list.forEach(function (entry, n) {
      var t = entry.t;
      var isIn = t.type !== 'out';
      html += '<tr' + (entry.auto ? ' data-ledger-auto="1"' : ' data-ledger-idx="' + entry.i + '"') + '>' +
        '<td>' + (n + 1) + '</td>' +
        '<td>' + esc(formatDate(t.date)) + '</td>' +
        '<td class="cell-desc">' + esc(t.desc || '—') + partyChip(t) + customChipsHtml(t) +
          (entry.auto ? ' <span class="tag tag--warn" title="حركة تلقائية من مصدرها: تحصيل أو مدفوع فعلي">تلقائي</span>' : '') + '</td>' +
        '<td><span class="tag ' + (isIn ? 'tag--in' : 'tag--out') + '">' + (isIn ? 'دخل' : 'خرج') + '</span></td>' +
        '<td class="amount ' + (isIn ? 'pos' : 'neg') + '">' + (isIn ? '+ ' : '- ') + money(t.amount) + '</td>' +
        '<td class="cell-note">' + (t.note ? esc(t.note) : '—') + '</td>' +
        '<td class="col-cell">' + (entry.auto
          ? '<span class="cell-note">من المصدر</span>'
          : '<button type="button" class="btn btn--ghost btn--sm" data-edit-ledger="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-ledger="' + entry.i + '">حذف</button>') + '</td>' +
        '</tr>';
    });

    if (!list.length) {
      html = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:26px">' +
        ((q || tf) ? 'لا توجد حركات مطابقة' : 'لا توجد حركات مالية بعد — أضف أول حركة من النموذج أعلاه') +
        '</td></tr>';
    }

    tbody.innerHTML = html;

    var countEl = $('#ledgerCount');
    if (countEl) countEl.textContent = list.length + ' حركة';
    var at = $('#ledgerAutoToggle');
    if (at) at.checked = showAuto;
  }

  /* ---------- العمليات النقدية التلقائية ---------- */
  var KEY_LEDGER_AUTO = 'app_ledger_auto';

  function ledgerAutoOn() {
    try { var v = localStorage.getItem(KEY_LEDGER_AUTO); return v === null ? true : v === '1'; }
    catch (e) { return true; }
  }

  /* كل عملية دفع أو قبض فعلي تظهر تلقائياً هنا: تحصيل من عميل، مقدم،
     مدفوع منا للعميل، مدفوع للمورد، أرباح مستلمة للشريك — مش ديون. */
  function autoCashOps() {
    var ops = [];
    getCustomers().forEach(function (c, ci) {
      var name = String(c.name || '').trim();
      var base = { auto: true, src: 'تلقائي' };
      (c.payments || []).forEach(function (p, k) {
        var amt = Number(p.amount || 0);
        if (amt > 0) ops.push(Object.assign({}, base, {
          key: 'auto:cus:' + ci + ':' + k, type: 'in', amount: amt, date: p.date || '',
          desc: 'تحصيل من العميل: ' + name, note: p.note || '',
          party: { type: 'customer', name: name }
        }));
      });
      var down = Number(c.down || 0);
      if (down > 0) ops.push(Object.assign({}, base, {
        key: 'auto:cus:' + ci + ':down', type: 'in', amount: down, date: c.startDate || '',
        desc: 'مقدم مدفوع من العميل: ' + name, note: '',
        party: { type: 'customer', name: name }
      }));
      var adv = Number(c.paidByUs || 0);
      if (adv > 0) ops.push(Object.assign({}, base, {
        key: 'auto:cus:' + ci + ':adv', type: 'out', amount: adv, date: c.startDate || '',
        desc: 'مدفوع منا نحن للعميل: ' + name, note: '',
        party: { type: 'customer', name: name }
      }));
    });
    getSuppliers().forEach(function (s, si) {
      var name = String(s.name || '').trim();
      (s.tx || []).forEach(function (t, k) {
        var pd = Number(t.paid || 0);
        if (pd > 0) ops.push({
          auto: true, src: 'تلقائي', key: 'auto:sup:' + si + ':' + k,
          type: 'out', amount: pd, date: t.date || '',
          desc: 'مدفوع للمورد: ' + name, note: t.desc || '',
          party: { type: 'supplier', name: name }
        });
      });
    });
    getPartners().forEach(function (p, pi) {
      var name = String(p.name || '').trim();
      (p.profits || []).forEach(function (f, k) {
        var amt = Number(f.amount || 0);
        if (amt > 0) ops.push({
          auto: true, src: 'تلقائي', key: 'auto:prt:' + pi + ':' + k,
          type: 'out', amount: amt, date: f.date || '',
          desc: 'ربح مستلم للشريك: ' + name, note: f.note || '',
          party: { type: 'partner', name: name }
        });
      });
    });
    return ops;
  }

  /* اقتراح اسم الطرف حسب النوع المختار (بدل datalist اللي مش شغال على الموبايل) */
  function partyNamesFor(type) {
    var names = [];
    if (!type || type === 'customer') names = names.concat(getCustomers().map(function (c) { return c.name; }));
    if (!type || type === 'supplier') names = names.concat(getSuppliers().map(function (s) { return s.name; }));
    if (!type || type === 'partner') names = names.concat(getPartners().map(function (p) { return p.name; }));
    return names.filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  var partyInput = $('#ledgerPartyName'), partyPop = $('#partySuggest'), partyTypeSel = $('#ledgerPartyType');
  if (partyInput && partyPop) {
    var showPartySuggest = function () {
      var type = partyTypeSel ? partyTypeSel.value : '';
      var q = String(partyInput.value || '').trim();
      var items = partyNamesFor(type).filter(function (n) { return !q || n.indexOf(q) > -1; }).slice(0, 12);
      if (!items.length) {
        partyPop.innerHTML = '<div class="suggest-empty">' +
          (q ? 'مفيش اسم مسجّل مطابق — تقدر تسيب اللي كتبته وتكمل' : 'لا توجد أسماء مسجّلة لهذا النوع') + '</div>';
      } else {
        renderSuggest(partyPop, items, function (v) {
          partyInput.value = v;
          partyPop.hidden = true;
        }, q);
      }
      partyPop.hidden = false;
    };
    partyInput.addEventListener('input', showPartySuggest);
    partyInput.addEventListener('focus', showPartySuggest);
    partyInput.addEventListener('blur', function () { setTimeout(function () { partyPop.hidden = true; }, 160); });
    if (partyTypeSel) partyTypeSel.addEventListener('change', showPartySuggest);
  }

  /* مبدّل عرض العمليات التلقائية */
  var ledgerAutoToggle = $('#ledgerAutoToggle');
  if (ledgerAutoToggle) {
    ledgerAutoToggle.checked = ledgerAutoOn();
    ledgerAutoToggle.addEventListener('change', function () {
      try { localStorage.setItem(KEY_LEDGER_AUTO, this.checked ? '1' : '0'); } catch (e) {}
      renderLedger();
      renderLedgerSummary();
      toast(this.checked
        ? 'اتعرضت العمليات التلقائية (تحصيل ومدفوعات فعلية) ✓'
        : 'اتخفت العمليات التلقائية — الجدول بيعرض الحركات المنسوخة يدوياً بس');
    });
  }

  var ledgerForm = $('#ledgerForm');  var ledgerForm = $('#ledgerForm');
  if (ledgerForm) {
    ledgerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#ledgerError');
      var fail = function (m) { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
      var f = ledgerForm.elements;
      var date = f.date.value;
      var type = f.type.value === 'out' ? 'out' : 'in';
      var amount = parseFloat(f.amount.value);
      var desc = String(f.desc.value || '').trim();
      var note = String(f.note.value || '').trim();
      var party = readLedgerParty();

      var miss = [];
      if (!date) miss.push('التاريخ');
      if (!desc) miss.push('البيان');
      if (!(amount > 0)) miss.push('المبلغ');
      missingCustom('ledger', ledgerForm).forEach(function (m) { miss.push(m.label); });
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
      if (errEl) errEl.hidden = true;

      var list = getLedger();
      if (ledgerEditIdx >= 0 && list[ledgerEditIdx]) {
        list[ledgerEditIdx] = { date: date, type: type, desc: desc, amount: amount, note: note, party: party, custom: collectCustomValues('ledger', ledgerForm) };
        saveLedger(list);
        endLedgerEdit();
        ledgerForm.reset();
        f.date.value = todayISO();
        fillCustomValues('ledger', {}, ledgerForm);
        f.type.value = type;
        renderLedger();
        renderLedgerSummary();
        toast('تم حفظ تعديل الحركة ✓');
        return;
      }
      list.push({ date: date, type: type, desc: desc, amount: amount, note: note, party: party, custom: collectCustomValues('ledger', ledgerForm) });
      saveLedger(list);

      ledgerForm.reset();
      f.date.value = todayISO();
      fillCustomValues('ledger', {}, ledgerForm);
      f.type.value = type;
      renderLedger();
      renderLedgerSummary();
      toast((type === 'out' ? 'تم تسجيل خرج' : 'تم تسجيل دخل') + ' بقيمة ' + money(amount));
    });

    ledgerForm.addEventListener('input', function () {
      var er = $('#ledgerError');
      if (er) er.hidden = true;
    });
    ledgerForm.addEventListener('change', function () {
      var er = $('#ledgerError');
      if (er) er.hidden = true;
    });
  }

  var ledgerSearch = $('#ledgerSearch');
  if (ledgerSearch) ledgerSearch.addEventListener('input', function () { renderLedger(); });

  var ledgerTypeFilter = $('#ledgerTypeFilter');
  if (ledgerTypeFilter) ledgerTypeFilter.addEventListener('change', function () { renderLedger(); });

  /* تعديل حركة */
  var ledgerEditIdx = -1;
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-edit-ledger]') : null;
    if (!btn) return;
    var idx = Number(btn.getAttribute('data-edit-ledger'));
    var list = getLedger();
    var t = list[idx];
    if (!t || !ledgerForm) return;
    ledgerEditIdx = idx;
    var f = ledgerForm.elements;
    f.date.value = t.date || todayISO();
    f.type.value = t.type === 'out' ? 'out' : 'in';
    f.amount.value = t.amount != null ? t.amount : '';
    f.desc.value = t.desc || '';
    f.note.value = t.note || '';
    fillCustomValues('ledger', t.custom || {}, ledgerForm);
    var submit = ledgerForm.querySelector('button[type="submit"]');
    if (submit) submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ التعديل';
    var cancel = $('#ledgerCancelEdit');
    if (cancel) cancel.hidden = false;
    if (ledgerForm.scrollIntoView) ledgerForm.scrollIntoView({ block: 'center' });
    toast('وضع التعديل — عدّل الحركة ثم احفظ');
  });

  function endLedgerEdit() {
    ledgerEditIdx = -1;
    if (!ledgerForm) return;
    var submit = ledgerForm.querySelector('button[type="submit"]');
    if (submit) submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ';
    var cancel = $('#ledgerCancelEdit');
    if (cancel) cancel.hidden = true;
  }

  var ledgerCancelEdit = $('#ledgerCancelEdit');
  if (ledgerCancelEdit) ledgerCancelEdit.addEventListener('click', function () {
    endLedgerEdit();
    if (ledgerForm) { ledgerForm.reset(); ledgerForm.elements.date.value = todayISO(); }
    toast('أُلغي التعديل');
  });

  /* حذف حركة */
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-del-ledger]') : null;
    if (!btn) return;
    var idx = Number(btn.getAttribute('data-del-ledger'));
    var list = getLedger();
    if (!list[idx]) return;
    var label = list[idx].desc;
    list.splice(idx, 1);
    saveLedger(list);
    renderLedger();
    renderLedgerSummary();
    toast('تم حذف الحركة «' + label + '»');
  });

  if (ledgerForm) ledgerForm.elements.date.value = todayISO();

  /* ============================================================
     الشركاء — الحصص ورؤوس الأموال والأرباح والمسحوبات
     نصيب كل شريك = صافي أرباح السنة × الحصة ÷ 100  (محسوب تلقائياً)
     ============================================================ */
  var KEY_PARTNERS = 'app_partners';
  var KEY_PARTNER_PROFIT = 'app_partner_profit';

  var DEFAULT_PARTNERS = [
    { name: 'محمد علي',    role: 'شريك مؤسس', share: 40, capital: 4000000, withdrawals: 600000, note: '' },
    { name: 'عبدالله حسن', role: 'شريك',       share: 35, capital: 3500000, withdrawals: 400000, note: '' },
    { name: 'سالم كريم',   role: 'شريك',       share: 25, capital: 2500000, withdrawals: 160000, note: '' }
  ];
  var DEFAULT_PARTNER_PROFIT = 4640000;

  var AVATAR_CLASSES = ['avatar', 'avatar avatar--2', 'avatar avatar--3'];

  function getPartners() {
    try {
      var raw = localStorage.getItem(KEY_PARTNERS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_PARTNERS);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_PARTNERS));
  }
  function savePartners(list) {
    try { localStorage.setItem(KEY_PARTNERS, JSON.stringify(list)); } catch (e) {}
  }

  function getPartnerProfit() {
    try {
      var raw = localStorage.getItem(KEY_PARTNER_PROFIT);
      if (raw !== null && raw !== '') { var n = Number(raw); if (isFinite(n)) return n; }
    } catch (e) {}
    return DEFAULT_PARTNER_PROFIT;
  }
  function setPartnerProfit(v) {
    try { localStorage.setItem(KEY_PARTNER_PROFIT, String(v)); } catch (e) {}
  }

  function derivePartner(p) {
    var share = Number(p.share || 0);
    var cut = Math.round((getPartnerProfit() * share) / 100);
    var withdrawals = Number(p.withdrawals || 0);
    return {
      share: share,
      capital: Number(p.capital || 0),
      cut: cut,
      withdrawals: withdrawals,
      net: cut - withdrawals
    };
  }

  function partnerTotals() {
    var t = { capital: 0, share: 0, cut: 0, withdrawals: 0, net: 0, count: 0 };
    getPartners().forEach(function (p) {
      var d = derivePartner(p);
      t.capital += d.capital;
      t.share += d.share;
      t.cut += d.cut;
      t.withdrawals += d.withdrawals;
      t.net += d.net;
      t.count++;
    });
    return t;
  }

  function renderPartnersSummary() {
    var box = $('#partnersSummary');
    if (!box) return;
    var t = partnerTotals();
    box.innerHTML =
      '<div class="summary__box summary__box--net"><small>إجمالي رأس المال</small><b>' + money(t.capital) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي النصيب من الأرباح</small><b>' + money(t.cut) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--out"><small>إجمالي المسحوبات</small><b>' + money(t.withdrawals) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--net"><small>إجمالي الصافي المستحق</small><b>' + money(t.net) + '</b><span>هـ.د</span></div>';
  }

  function renderPartnerCards() {
    var box = $('#partnerCards');
    if (!box) return;
    var list = getPartners();
    if (!list.length) {
      box.innerHTML = '<p class="panel__hint" style="grid-column:1/-1;margin:0">لا يوجد شركاء بعد — أضف أول شريك من النموذج أعلاه.</p>';
      return;
    }
    var html = '';
    list.forEach(function (p, i) {
      var d = derivePartner(p);
      html += '<div class="mini-card">' +
        '<div class="mini-card__top"><span class="' + AVATAR_CLASSES[i % 3] + '">' + esc(colInitials(p.name)) + '</span>' +
        '<div><b>' + esc(p.name || 'بدون اسم') + '</b><small>' + esc(p.role || 'شريك') + '</small></div></div>' +
        '<div class="mini-card__row"><span>الحصة</span><b>' + money(d.share) + '%</b></div>' +
        '<div class="mini-card__row"><span>رأس المال</span><b>' + money(d.capital) + '</b></div>' +
        '<div class="mini-card__row"><span>نصيبه من الأرباح</span><b class="pos">' + money(d.cut) + '</b></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, Math.max(0, d.share)) + '%"></i></div>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  function renderPartners() {
    var qEl = $('#partnerSearch');
    var q = qEl ? String(qEl.value || '').trim() : '';
    var list = getPartners().map(function (p, i) { return { p: p, i: i }; });
    if (q) {
      list = list.filter(function (x) {
        return String(x.p.name || '').indexOf(q) > -1 || String(x.p.role || '').indexOf(q) > -1;
      });
    }

    var tbody = $('#partnersTbody');
    if (tbody) {
      var html = '';
      list.forEach(function (entry, n) {
        var p = entry.p, d = derivePartner(p);
        html += '<tr>' +
          '<td>' + (n + 1) + '</td>' +
          '<td><div class="p-name"><span class="' + AVATAR_CLASSES[entry.i % 3] + '">' + esc(colInitials(p.name)) + '</span>' +
            '<div><b>' + esc(p.name || 'بدون اسم') + '</b>' +
            '<small>' + esc(p.role || '—') + (p.note ? ' · ' + esc(p.note) : '') + '</small></div></div></td>' +
          '<td><span class="share-pill">' + money(d.share) + '%</span></td>' +
          '<td class="amount pos">' + money(d.cut) + '</td>' +
          '<td class="amount">' + money(d.withdrawals) + '</td>' +
          '<td class="amount ' + (d.net >= 0 ? 'pos' : 'neg') + '">' + money(d.net) + '</td>' +
          '<td><span class="p-actions">' +
            '<button type="button" class="btn btn--primary btn--sm" data-partner-profile="' + entry.i + '">البروفايل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-edit-partner="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-partner="' + entry.i + '">حذف</button>' +
          '</span></td>' +
          '</tr>';
      });
      if (!list.length) {
        html = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:26px">' +
          (q ? 'لا يوجد شريك مطابق' : 'لا يوجد شركاء بعد — أضف أول شريك من النموذج أعلاه') + '</td></tr>';
      }
      tbody.innerHTML = html;
    }

    var cnt = $('#partnersCount');
    if (cnt) cnt.textContent = list.length + ' شريك';

    var t = partnerTotals();
    var pill = $('#sharePill');
    if (pill) {
      var withShare = getPartners().filter(function (p) { return Number(p.share) > 0; }).length;
      var noShare = getPartners().length - withShare;
      var over = t.share > 100.0001;
      var incomplete = noShare === 0 && Math.abs(t.share - 100) >= 0.001;
      var sharesOk = !over && !incomplete;
      pill.textContent = over ? ('مجموع الحصص ' + money(t.share) + '% — تجاوز 100%')
        : (incomplete ? ('مجموع الحصص ' + money(t.share) + '% — لازم 100%')
        : (noShare ? ('مجموع الحصص المحدَّدة ' + money(t.share) + '% — الحصة اختيارية') : 'مجموع الحصص 100%'));
      pill.className = 'count-pill ' + (sharesOk ? 'count-pill--ok' : 'count-pill--warn');
    }

    var wt = $('#withdrawalsTotal');
    if (wt) wt.value = money(t.withdrawals);

    renderPartnerCards();
    renderPartnersSummary();
  }

  var profitForm = $('#profitForm');
  if (profitForm) {
    profitForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#profitError');
      var v = parseFloat(profitForm.elements.profit.value);
      if (!(v >= 0)) {
        if (errEl) { errEl.textContent = 'أدخل مبلغاً صحيحاً (صفر أو أكبر)'; errEl.hidden = false; }
        return;
      }
      if (errEl) errEl.hidden = true;
      setPartnerProfit(v);
      renderPartners();
      toast('تم تحديث صافي أرباح السنة — أُعيد توزيع النصيب على الشركاء');
    });
    profitForm.addEventListener('input', function () {
      var er = $('#profitError');
      if (er) er.hidden = true;
    });
  }

  var partnerForm = $('#partnerForm');

  function resetPartnerForm() {
    if (!partnerForm) return;
    partnerForm.reset();
    partnerForm.elements.idx.value = '-1';
    var btn = $('#partnerSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"></use></svg> إضافة شريك';
    var cancel = $('#partnerCancelBtn');
    if (cancel) cancel.hidden = true;
    var er = $('#partnerError');
    if (er) er.hidden = true;
  }

  function startEditPartner(i) {
    var p = getPartners()[i];
    if (!p || !partnerForm) return;
    var f = partnerForm.elements;
    f.idx.value = String(i);
    f.name.value = p.name || '';
    f.role.value = p.role || 'شريك';
    f.share.value = p.share != null ? p.share : '';
    f.capital.value = p.capital != null ? p.capital : '';
    f.withdrawals.value = p.withdrawals != null ? p.withdrawals : '';
    f.note.value = p.note || '';
    var btn = $('#partnerSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ التعديل';
    var cancel = $('#partnerCancelBtn');
    if (cancel) cancel.hidden = false;
    var er = $('#partnerError');
    if (er) er.hidden = true;
    if (partnerForm.scrollIntoView) partnerForm.scrollIntoView({ block: 'center' });
    if (f.name.focus) f.name.focus();
  }

  if (partnerForm) {
    partnerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#partnerError');
      var fail = function (m) { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
      var f = partnerForm.elements;
      var name = String(f.name.value || '').trim();
      var role = f.role.value || 'شريك';
      var share = parseFloat(f.share.value);
      var capital = parseFloat(f.capital.value);
      var withdrawals = parseFloat(f.withdrawals.value) || 0;
      var note = String(f.note.value || '').trim();

      var miss = [];
      if (!name) miss.push('اسم الشريك');
      /* الحصة غير إجبارية — النسب تُحسب فقط إذا حُدّدت */
      if (share > 100) return fail('الحصة لا يمكن أن تتجاوز 100%');
      if (!(capital >= 0)) miss.push('رأس المال');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
      if (errEl) errEl.hidden = true;

      var list = getPartners();
      var idx = parseInt(f.idx.value, 10);
      var editing = idx >= 0 && !!list[idx];
      var rec = {
        name: name, role: role, share: isNaN(share) ? null : share,
        capital: capital, withdrawals: withdrawals, note: note,
        /* أرباح هذا الشريك المضافة يدوياً بالتاريخ والمبلغ */
        profits: (editing && list[idx] && list[idx].profits) ? list[idx].profits : []
      };
      if (editing) list[idx] = rec; else list.push(rec);
      savePartners(list);
      resetPartnerForm();
      renderPartners();
      toast(editing ? 'تم تعديل بيانات الشريك «' + name + '»' : 'تمت إضافة الشريك «' + name + '»');
    });

    partnerForm.addEventListener('input', function () {
      var er = $('#partnerError');
      if (er) er.hidden = true;
    });
    partnerForm.addEventListener('change', function () {
      var er = $('#partnerError');
      if (er) er.hidden = true;
    });
  }

  var partnerCancelBtn = $('#partnerCancelBtn');
  if (partnerCancelBtn) partnerCancelBtn.addEventListener('click', resetPartnerForm);

  var partnerSearch = $('#partnerSearch');
  if (partnerSearch) partnerSearch.addEventListener('input', function () { renderPartners(); });

  /* تعديل / حذف شريك */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var del = t.closest('[data-del-partner]');
    if (del) {
      var di = Number(del.getAttribute('data-del-partner'));
      var dl = getPartners();
      if (!dl[di]) return;
      var dname = dl[di].name;
      dl.splice(di, 1);
      savePartners(dl);
      if (partnerForm) {
        var cur = parseInt(partnerForm.elements.idx.value, 10);
        if (cur === di) resetPartnerForm();
        else if (cur > di) partnerForm.elements.idx.value = String(cur - 1);
      }
      renderPartners();
      toast('تم حذف الشريك «' + dname + '»');
      return;
    }

    var ed = t.closest('[data-edit-partner]');
    if (ed) startEditPartner(Number(ed.getAttribute('data-edit-partner')));
  });

  if (profitForm) profitForm.elements.profit.value = getPartnerProfit();
  safeRun(renderPartners, 'الشركاء');

  /* ============================================================
     الجمعيات — الجمعيات والأعضاء والاشتراكات
     حالة العضو تُحسب تلقائياً من المدفوع مقابل المطلوب
     ============================================================ */
  var KEY_ASSOCIATIONS = 'app_associations';
  var KEY_MEMBERS = 'app_members';

  var DEFAULT_ASSOCIATIONS = [
    { name: 'جمعية الإعمار', fee: 12000 },
    { name: 'جمعية البر',    fee: 10000 },
    { name: 'جمعية الأمل',   fee: 10000 }
  ];

  var DEFAULT_MEMBERS = [
    { assoc: 'جمعية الإعمار', name: 'خالد ناصر', type: 'سنوي', fee: 12000, paid: 12000, note: '' },
    { assoc: 'جمعية الإعمار', name: 'وليد صلاح', type: 'شهري', fee: 12000, paid: 6000,  note: '' },
    { assoc: 'جمعية البر',    name: 'عمر ياسين', type: 'سنوي', fee: 10000, paid: 10000, note: '' },
    { assoc: 'جمعية الأمل',   name: 'زياد فؤاد', type: 'شهري', fee: 10000, paid: 0,     note: '' }
  ];

  var ASSOC_ICON_COLORS = ['card__icon--blue', 'card__icon--pink', 'card__icon--amber'];

  function getAssociations() {
    try {
      var raw = localStorage.getItem(KEY_ASSOCIATIONS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_ASSOCIATIONS);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_ASSOCIATIONS));
  }
  function saveAssociations(list) {
    try { localStorage.setItem(KEY_ASSOCIATIONS, JSON.stringify(list)); } catch (e) {}
  }
  /* يضمن أن مجموع الدفعات = المدفوع (المدفوع هو المصدر الصحيح) */
  function normalizeMember(m) {
    if (!m || typeof m !== 'object') return m;
    if (!Array.isArray(m.payments)) m.payments = [];
    var sum = 0;
    m.payments.forEach(function (p) { sum += Number(p.amount || 0); });
    var diff = Math.round((Number(m.paid || 0) - sum) * 100) / 100;
    if (diff > 0.004) {
      m.payments.push({ month: currentMonthKey(), amount: diff, date: todayISO(), note: 'رصيد مُرحّل' });
    } else if (diff < -0.004) {
      for (var i = m.payments.length - 1; i >= 0 && diff < -0.004; i--) {
        var a = Number(m.payments[i].amount || 0);
        if (a <= -diff) { m.payments[i].amount = Math.round((a + diff) * 100) / 100; diff = 0; }
        else { diff = Math.round((diff + a) * 100) / 100; m.payments.splice(i, 1); }
      }
      if (diff < -0.004) m.payments.push({ month: currentMonthKey(), amount: diff, date: todayISO(), note: 'تسوية' });
    }
    return m;
  }
  function getMembers() {
    var list = null;
    try {
      var raw = localStorage.getItem(KEY_MEMBERS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}
    if (!Array.isArray(list)) list = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
    list.forEach(normalizeMember);
    return list;
  }
  function saveMembers(list) {
    try { localStorage.setItem(KEY_MEMBERS, JSON.stringify(list)); } catch (e) {}
  }

  function deriveMember(m) {
    var fee = Number(m.fee || 0);
    var paid = Number(m.paid || 0);
    var status = (fee <= 0 || paid >= fee) ? 'مسدّد' : (paid > 0 ? 'معلّق' : 'متأخر');
    return { fee: fee, paid: paid, rest: Math.max(fee - paid, 0), status: status };
  }

  function assocStatusTag(status) {
    return status === 'مسدّد' ? 'tag--in' : (status === 'معلّق' ? 'tag--warn' : 'tag--out');
  }

  /* ----------------------------------------------------------
     نظام الدور: الجمعية تاخد وتبدي فلوس
     • كل عضو يدفع قيمة السهم كل شهر
     • حصيلة الشهر = قيمة السهم × عدد الأعضاء وتُقبض لصاحب الدور
     • الدور يُحدَّد من ترتيب الأعضاء وشهر بداية الدورة
     ---------------------------------------------------------- */
  var AR_MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function currentMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function monthKeyParts(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
  }

  function monthLabel(key) {
    var p = monthKeyParts(key);
    if (!p || p.m < 1 || p.m > 12) return '—';
    return AR_MONTH_NAMES[p.m - 1] + ' ' + p.y;
  }

  function monthLabelShort(key) {
    var p = monthKeyParts(key);
    if (!p || p.m < 1 || p.m > 12) return '—';
    return AR_MONTH_NAMES[p.m - 1] + ' ' + String(p.y).slice(2);
  }

  function shiftMonth(key, delta) {
    var p = monthKeyParts(key);
    if (!p) { p = monthKeyParts(currentMonthKey()); }
    var total = (p.y * 12) + (p.m - 1) + Number(delta || 0);
    if (total < 0) total = 0;
    return Math.floor(total / 12) + '-' + pad((total % 12) + 1);
  }

  function monthsBetween(fromKey, toKey) {
    var a = monthKeyParts(fromKey), b = monthKeyParts(toKey);
    if (!a || !b) return 0;
    return ((b.y * 12 + b.m) - (a.y * 12 + a.m));
  }

  function assocMonths(a) {
    var n = parseInt(a && a.months, 10);
    return (isFinite(n) && n >= 1) ? Math.min(n, 120) : 12;
  }
  function assocPayoutDay(a) {
    var n = parseInt(a && a.payoutDay, 10);
    return (isFinite(n) && n >= 1 && n <= 30) ? n : 1;
  }
  function assocStart(a) {
    return (a && monthKeyParts(a.startMonth)) ? a.startMonth : currentMonthKey();
  }
  function assocByName(name) {
    var found = null;
    getAssociations().forEach(function (a) { if (String(a.name) === String(name)) found = a; });
    return found;
  }
  /* مؤشرات الأعضاء (بالفهرس العام) تابعين لجمعية */
  function assocMemberIdxs(name) {
    var list = getMembers(), out = [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].assoc || '') === String(name)) out.push(i);
    }
    return out;
  }
  /* رقم الدور = ترتيب الإضافة داخل الجمعية (أو القيمة المحفوظة صراحة) */
  function memberOrderByIdx(globalIdx) {
    var list = getMembers();
    var m = list[globalIdx];
    if (!m) return 0;
    if (m.order != null && m.order !== '' && isFinite(Number(m.order))) return Number(m.order);
    var name = String(m.assoc || ''), pos = 0;
    for (var i = 0; i < list.length; i++) {
      if (i === globalIdx) return pos;
      if (String(list[i].assoc || '') === name) pos++;
    }
    return pos;
  }
  function nextOrderFor(assocName) {
    var idxs = assocMemberIdxs(assocName), max = -1;
    idxs.forEach(function (i) {
      var o = memberOrderByIdx(i);
      if (o > max) max = o;
    });
    return max + 1;
  }
  /* الحصيلة الشهرية = قيمة السهم × عدد الأعضاء (اللي بتقبضه الجمعية) */
  function assocPot(a) {
    if (!a) return 0;
    return Math.round(Number(a.fee || 0) * assocMemberIdxs(a.name).length);
  }
  /* مَن يقبض في رقم الدور index */
  function collectorAt(a, index) {
    var idxs = assocMemberIdxs(a.name);
    if (!idxs.length) return null;
    var M = assocMonths(a);
    var want = ((Number(index) % M) + M) % M;
    var list = getMembers();
    for (var i = 0; i < idxs.length; i++) {
      if (memberOrderByIdx(idxs[i]) === want) return list[idxs[i]];
    }
    return list[idxs[0]];
  }
  /* مَن يقبض في شهر معيّن */
  function collectorForMonth(a, monthKey) {
    if (!a) return null;
    var idx = monthsBetween(assocStart(a), monthKey);
    if (idx < 0) return null;
    return collectorAt(a, idx);
  }
  /* الشهر الذي يقع فيه دور العضو */
  function memberTurnMonth(globalIdx) {
    var m = getMembers()[globalIdx];
    if (!m) return null;
    var a = assocByName(m.assoc);
    if (!a) return null;
    return shiftMonth(assocStart(a), memberOrderByIdx(globalIdx));
  }
  /* مدة الدورة: بالأشهر والسنين */
  function cycleText(a) {
    var M = assocMonths(a);
    var y = Math.floor(M / 12), r = M % 12, parts = [];
    if (y) parts.push(y === 1 ? 'سنة' : (y === 2 ? 'سنتان' : y + ' سنوات'));
    if (r) parts.push(r === 1 ? 'شهر' : (r === 2 ? 'شهران' : r + ' أشهر'));
    return M + ' شهر (' + (parts.join(' و ') || '—') + ')';
  }
  /* دفعات العضو في شهر معيّن */
  function paidInMonth(m, monthKey) {
    var sum = 0;
    (m.payments || []).forEach(function (p) {
      if (String(p.month || '') === String(monthKey)) sum += Number(p.amount || 0);
    });
    return sum;
  }
  /* حالة العضو في شهر: مستقبلي = لم يحن، وإلّا مسدّد / معلّق / متأخر */
  function statusInMonth(m, monthKey, required) {
    if (String(monthKey) > currentMonthKey()) return 'لم يحن';
    var paid = paidInMonth(m, monthKey);
    if (required <= 0) return 'مسدّد';
    if (paid >= required) return 'مسدّد';
    if (paid > 0) return 'معلّق';
    return 'متأخر';
  }

  function assocTotals() {
    var t = { assocs: 0, members: 0, fee: 0, paid: 0, rest: 0 };
    t.assocs = getAssociations().length;
    getMembers().forEach(function (m) {
      var d = deriveMember(m);
      t.members++;
      t.fee += d.fee;
      t.paid += d.paid;
      t.rest += d.rest;
    });
    return t;
  }

  function renderAssocSummary() {
    var box = $('#assocSummary');
    if (!box) return;
    var t = assocTotals();
    box.innerHTML =
      '<div class="summary__box summary__box--net"><small>إجمالي الأعضاء</small><b>' + t.members + '</b><span>عضو</span></div>' +
      '<div class="summary__box summary__box--net"><small>إجمالي المستحق (اشتراكات)</small><b>' + money(t.fee) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المحصّل</small><b>' + money(t.paid) + '</b><span>هـ.د</span></div>' +
      '<div class="summary__box summary__box--out"><small>المتبقي للتحصيل</small><b>' + money(t.rest) + '</b><span>هـ.د</span></div>';
  }

  function renderAssocCards() {
    var box = $('#assocCards');
    if (!box) return;
    var assocs = getAssociations();
    var members = getMembers();
    if (!assocs.length) {
      box.innerHTML = '<p class="panel__hint" style="grid-column:1/-1;margin:0">لا توجد جمعيات بعد — أضف أول جمعية من النموذج أعلاه.</p>';
      return;
    }
    var html = '';
    assocs.forEach(function (a, i) {
      var mine = members.filter(function (m) { return String(m.assoc || '') === a.name; });
      var feeSum = 0, paidSum = 0;
      mine.forEach(function (m) { var d = deriveMember(m); feeSum += d.fee; paidSum += d.paid; });
      var pct = feeSum > 0 ? Math.min(100, Math.round((paidSum / feeSum) * 100)) : 0;
      html += '<div class="mini-card">' +
        '<div class="mini-card__top"><span class="card__icon ' + ASSOC_ICON_COLORS[i % 3] + ' sm">' +
        '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-group"></use></svg></span>' +
        '<div><b>' + esc(a.name) + '</b><small>' + mine.length + ' عضو</small></div></div>' +
        '<div class="mini-card__row"><span>قيمة السهم / شهر</span><b>' + money(a.fee) + '</b></div>' +
        '<div class="mini-card__row"><span>الحصيلة الشهرية</span><b class="pos">' + money(assocPot(a)) + '</b></div>' +
        '<div class="mini-card__row"><span>مدّة الدورة</span><b>' + cycleText(a) + '</b></div>' +
        '<div class="mini-card__row"><span>يوم القبض</span><b>يوم ' + assocPayoutDay(a) + ' من كل شهر</b></div>' +
        '<div class="mini-card__row"><span>أول شهر</span><b>' + monthLabel(assocStart(a)) + '</b></div>' +
        '<div class="mini-card__row"><span>دور الشهر الحالي</span><b>' +
          esc((function () { var c = collectorForMonth(a, currentMonthKey()); return c ? (c.name || '—') : '—'; })()) + '</b></div>' +
        '<div class="mini-card__row"><span>المحصّل</span><b class="pos">' + money(paidSum) + '</b></div>' +
        '<div class="mini-card__row"><span>المتبقي</span><b class="neg">' + money(Math.max(feeSum - paidSum, 0)) + '</b></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="assoc-card__actions">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-edit-assoc="' + i + '">تعديل</button>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-assoc="' + i + '">حذف</button>' +
        '</div>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  function fillAssocSelects() {
    var assocs = getAssociations();
    var opts = assocs.map(function (a) {
      return '<option value="' + esc(a.name) + '">' + esc(a.name) + '</option>';
    }).join('');

    var sel = $('#memberAssoc');
    if (sel) {
      var keep = sel.value;
      sel.innerHTML = opts || '<option value="">— لا توجد جمعيات —</option>';
      if (keep && assocs.some(function (a) { return a.name === keep; })) sel.value = keep;
    }

    var f = $('#assocFilter');
    if (f) {
      var keepF = f.value;
      f.innerHTML = '<option value="">كل الجمعيات</option>' + opts;
      if (keepF && assocs.some(function (a) { return a.name === keepF; })) f.value = keepF;
    }
  }

  function renderAssociations() {
    fillAssocSelects();

    var qEl = $('#memberSearch');
    var afEl = $('#assocFilter');
    var q = qEl ? String(qEl.value || '').trim() : '';
    var af = afEl ? afEl.value : '';

    var list = getMembers().map(function (m, i) { return { m: m, i: i }; });
    if (af) list = list.filter(function (x) { return String(x.m.assoc || '') === af; });
    if (q) {
      list = list.filter(function (x) {
        return String(x.m.name || '').indexOf(q) > -1 || String(x.m.assoc || '').indexOf(q) > -1;
      });
    }

    var tbody = $('#membersTbody');
    if (tbody) {
      var html = '';
      list.forEach(function (entry, n) {
        var m = entry.m, d = deriveMember(m);
        html += '<tr>' +
          '<td>' + (n + 1) + '</td>' +
          '<td>' + esc(m.assoc || '—') + '</td>' +
          '<td><div class="p-name"><span class="' + AVATAR_CLASSES[entry.i % 3] + '">' + esc(colInitials(m.name)) + '</span>' +
            '<div><b>' + esc(m.name || 'بدون اسم') + '</b>' +
            (m.note ? '<small class="cell-sub">' + esc(m.note) + '</small>' : '') + '</div></div></td>' +
          '<td>' + esc(m.type || '—') + '</td>' +
          '<td class="amount">' + money(d.fee) + '</td>' +
          '<td class="amount pos">' + money(d.paid) + '</td>' +
          '<td class="amount ' + (d.rest > 0 ? 'neg' : 'pos') + '">' + money(d.rest) + '</td>' +
          '<td><span class="tag ' + assocStatusTag(d.status) + '">' + d.status + '</span></td>' +
          '<td>' + esc((function () { var t = memberTurnMonth(entry.i); return t ? monthLabel(t) : '—'; })()) + '</td>' +
          '<td><span class="p-actions">' +
            '<button type="button" class="btn btn--primary btn--sm" data-member-profile="' + entry.i + '" title="فتح بروفايل العضو">البروفايل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-edit-member="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-member="' + entry.i + '">حذف</button>' +
          '</span></td>' +
          '</tr>';
      });
      if (!list.length) {
        html = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:26px">' +
          ((q || af) ? 'لا يوجد عضو مطابق' : 'لا يوجد أعضاء بعد — أضف أول عضو من النموذج أعلاه') + '</td></tr>';
      }
      tbody.innerHTML = html;
    }

    var mc = $('#membersCount');
    if (mc) mc.textContent = list.length + ' عضو';
    var ac = $('#assocsCount');
    if (ac) ac.textContent = getAssociations().length + ' جمعية';

    renderAssocCards();
    renderAssocSummary();
    renderAssocMatrix();
  }

  /* ---------- جدول الأدوار الشهرية (مين بيقبض فين) ---------- */
  function assocStatusClass(st) {
    return st === 'مسدّد' ? 'tag--in' : (st === 'معلّق' ? 'tag--warn' : (st === 'متأخر' ? 'tag--out' : ''));
  }

  function renderAssocMatrix() {
    var head = $('#matrixHead'), body = $('#matrixTbody'), wrap = $('#matrixWrap');
    var hint = $('#matrixHint'), note = $('#matrixNote');
    if (!head || !body || !wrap) return;
    var af = $('#assocFilter');
    var selName = af ? af.value : '';
    var assocs = getAssociations();
    var a = selName ? assocByName(selName) : (assocs[0] || null);
    if (!a) {
      wrap.hidden = true;
      if (note) note.hidden = true;
      if (hint) { hint.hidden = false; hint.textContent = 'لا توجد جمعيات بعد — أضف جمعية أولاً.'; }
      return;
    }
    if (hint) hint.hidden = true;

    var M = assocMonths(a), shown = Math.min(M, 14), start = assocStart(a);
    var idxs = assocMemberIdxs(a.name), list = getMembers();
    var cols = [];
    for (var c = 0; c < shown; c++) cols.push(shiftMonth(start, c));

    head.innerHTML = '<tr><th style="width:52px">#</th><th>العضو</th>' +
      cols.map(function (k) {
        var col = collectorForMonth(a, k);
        return '<th style="min-width:118px">' + monthLabelShort(k) +
          '<br><span class="cell-sub">' + esc(col ? (col.name || '—') : '—') + '</span></th>';
      }).join('') + '</tr>';

    body.innerHTML = idxs.map(function (gi, n) {
      var m = list[gi];
      var required = Number(m.fee || 0);
      var turn = memberTurnMonth(gi);
      var cells = cols.map(function (k) {
        var st = statusInMonth(m, k, required);
        return '<td><span class="tag ' + assocStatusClass(st) + '">' + st +
          (turn && k === turn ? ' ★' : '') + '</span></td>';
      }).join('');
      return '<tr><td>' + (n + 1) + '</td><td><b>' + esc(m.name || '—') + '</b></td>' + cells + '</tr>';
    }).join('') ||
      '<tr><td colspan="' + (shown + 2) + '" style="text-align:center;color:var(--muted);padding:20px">' +
      'لا يوجد أعضاء في هذه الجمعية</td></tr>';

    wrap.hidden = false;
    if (note) {
      var now = collectorForMonth(a, currentMonthKey());
      note.hidden = false;
      note.innerHTML = '<b>' + esc(a.name) + '</b> — الحصيلة الشهرية <b>' + money(assocPot(a)) +
        '</b> • يوم القبض <b>يوم ' + assocPayoutDay(a) + '</b> • الدورة <b>' + cycleText(a) +
        '</b> • أول شهر <b>' + monthLabel(start) + '</b> • دور الشهر الحالي <b>' +
        esc(now ? (now.name || '—') : '—') + '</b>' +
        (M > shown ? ' — الجدول معروض لأول ' + shown + ' شهر من ' + M + ' شهر' : '') +
        ' — ★ تعني الشهر الذي يقبض فيه العضو.';
    }
  }

  /* ---------- إضافة / تعديل جمعية ---------- */
  var assocForm = $('#assocForm');

  function resetAssocForm() {
    if (!assocForm) return;
    assocForm.reset();
    assocForm.elements.idx.value = '-1';
    var btn = $('#assocSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"></use></svg> إضافة جمعية';
    var cancel = $('#assocCancelBtn');
    if (cancel) cancel.hidden = true;
    var er = $('#assocError');
    if (er) er.hidden = true;
  }

  function startEditAssoc(i) {
    var a = getAssociations()[i];
    if (!a || !assocForm) return;
    var f = assocForm.elements;
    f.idx.value = String(i);
    f.name.value = a.name || '';
    f.fee.value = a.fee != null ? a.fee : '';
    if (f.months) f.months.value = a.months != null ? a.months : '';
    if (f.payoutDay) f.payoutDay.value = a.payoutDay != null ? a.payoutDay : '';
    if (f.startMonth) f.startMonth.value = a.startMonth || '';
    var btn = $('#assocSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ التعديل';
    var cancel = $('#assocCancelBtn');
    if (cancel) cancel.hidden = false;
    var er = $('#assocError');
    if (er) er.hidden = true;
    if (assocForm.scrollIntoView) assocForm.scrollIntoView({ block: 'center' });
    if (f.name.focus) f.name.focus();
  }

  if (assocForm) {
    assocForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#assocError');
      var fail = function (m) { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
      var f = assocForm.elements;
      var name = String(f.name.value || '').trim();
      var fee = parseFloat(f.fee.value);
      var monthsRaw = f.months ? parseInt(f.months.value, 10) : NaN;
      var dayRaw = f.payoutDay ? parseInt(f.payoutDay.value, 10) : NaN;
      var startRaw = f.startMonth ? String(f.startMonth.value || '').trim() : '';

      var miss = [];
      if (!name) miss.push('اسم الجمعية');
      if (!(fee >= 0)) miss.push('قيمة الاشتراك السنوي');
      if (f.months && f.months.value !== '' && !(monthsRaw >= 1)) miss.push('عدد شهور الدورة (1 على الأقل)');
      if (f.payoutDay && f.payoutDay.value !== '' && !(dayRaw >= 1 && dayRaw <= 30)) miss.push('يوم القبض بين 1 و30');
      if (startRaw && !monthKeyParts(startRaw)) miss.push('أول شهر بصيغة سنة-شهر مثال 2026-11');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));

      var months = isFinite(monthsRaw) && monthsRaw >= 1 ? Math.min(monthsRaw, 120) : 12;
      var payoutDay = isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 30 ? dayRaw : 1;
      var startMonth = monthKeyParts(startRaw) ? startRaw : currentMonthKey();

      var list = getAssociations();
      var idx = parseInt(f.idx.value, 10);
      var editing = idx >= 0 && !!list[idx];
      if (editing) {
        if (list.some(function (a, j) { return j !== idx && a.name === name; })) {
          return fail('فيه جمعية بنفس الاسم');
        }
        var oldName = list[idx].name;
        list[idx] = { name: name, fee: fee, months: months, payoutDay: payoutDay, startMonth: startMonth };
        saveAssociations(list);
        if (oldName !== name) {
          var mem = getMembers();
          var touched = false;
          mem.forEach(function (m) { if (m.assoc === oldName) { m.assoc = name; touched = true; } });
          if (touched) saveMembers(mem);
        }
      } else {
        if (list.some(function (a) { return a.name === name; })) return fail('فيه جمعية بنفس الاسم');
        list.push({ name: name, fee: fee, months: months, payoutDay: payoutDay, startMonth: startMonth });
        saveAssociations(list);
      }
      if (errEl) errEl.hidden = true;
      resetAssocForm();
      renderAssociations();
      toast(editing ? 'تم تعديل الجمعية «' + name + '»' : 'تمت إضافة الجمعية «' + name + '»');
    });

    assocForm.addEventListener('input', function () {
      var er = $('#assocError');
      if (er) er.hidden = true;
    });
    assocForm.addEventListener('change', function () {
      var er = $('#assocError');
      if (er) er.hidden = true;
    });
  }

  var assocCancelBtn = $('#assocCancelBtn');
  if (assocCancelBtn) assocCancelBtn.addEventListener('click', resetAssocForm);

  /* ---------- إضافة / تعديل عضو ---------- */
  var memberForm = $('#memberForm');

  function resetMemberForm() {
    if (!memberForm) return;
    memberForm.reset();
    memberForm.elements.idx.value = '-1';
    var btn = $('#memberSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"></use></svg> إضافة عضو';
    var cancel = $('#memberCancelBtn');
    if (cancel) cancel.hidden = true;
    var er = $('#memberError');
    if (er) er.hidden = true;
    /* رجّع قيمة الاشتراك لافتراضي الجمعية المختارة */
    var assocs = getAssociations();
    var a = memberForm.elements.assoc.value;
    var found = null;
    assocs.forEach(function (x) { if (x.name === a) found = x; });
    if (found) memberForm.elements.fee.value = found.fee;
  }

  function startEditMember(i) {
    var m = getMembers()[i];
    if (!m || !memberForm) return;
    var f = memberForm.elements;
    f.idx.value = String(i);
    f.assoc.value = m.assoc || '';
    f.name.value = m.name || '';
    f.type.value = m.type || 'سنوي';
    f.fee.value = m.fee != null ? m.fee : '';
    f.paid.value = m.paid != null ? m.paid : '';
    f.note.value = m.note || '';
    var btn = $('#memberSubmitBtn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ التعديل';
    var cancel = $('#memberCancelBtn');
    if (cancel) cancel.hidden = false;
    var er = $('#memberError');
    if (er) er.hidden = true;
    if (memberForm.scrollIntoView) memberForm.scrollIntoView({ block: 'center' });
    if (f.name.focus) f.name.focus();
  }

  if (memberForm) {
    memberForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('#memberError');
      var fail = function (m) { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
      var f = memberForm.elements;
      var assoc = f.assoc.value;
      var name = String(f.name.value || '').trim();
      var type = f.type.value || 'سنوي';
      var fee = parseFloat(f.fee.value);
      var paid = parseFloat(f.paid.value) || 0;
      var note = String(f.note.value || '').trim();

      var miss = [];
      if (!assoc) miss.push('الجمعية');
      if (!name) miss.push('اسم العضو');
      if (!(fee > 0)) miss.push('قيمة الاشتراك');
      if (miss.length) {
        if (!getAssociations().length) return fail('لا توجد جمعيات بعد — أضف جمعية أولاً');
        return fail('الرجاء إدخال: ' + miss.join('، '));
      }
      if (errEl) errEl.hidden = true;

      var list = getMembers();
      var idx = parseInt(f.idx.value, 10);
      var editing = idx >= 0 && !!list[idx];
      var rec = {
        assoc: assoc, name: name, type: type, fee: fee, paid: paid, note: note,
        order: (editing && list[idx].assoc === assoc) ? list[idx].order : nextOrderFor(assoc),
        payments: (editing && list[idx].payments) ? list[idx].payments : []
      };
      normalizeMember(rec);
      if (editing) list[idx] = rec; else list.push(rec);
      saveMembers(list);
      resetMemberForm();
      renderAssociations();
      toast(editing ? 'تم تعديل بيانات العضو «' + name + '»' : 'تمت إضافة العضو «' + name + '»');
    });

    memberForm.addEventListener('input', function () {
      var er = $('#memberError');
      if (er) er.hidden = true;
    });
    memberForm.addEventListener('change', function () {
      var er = $('#memberError');
      if (er) er.hidden = true;
    });
  }

  var memberCancelBtn = $('#memberCancelBtn');
  if (memberCancelBtn) memberCancelBtn.addEventListener('click', resetMemberForm);

  var memberSearch = $('#memberSearch');
  if (memberSearch) memberSearch.addEventListener('input', function () { renderAssociations(); });

  var assocFilter = $('#assocFilter');
  if (assocFilter) assocFilter.addEventListener('change', function () { renderAssociations(); });

  /* قيمة الاشتراك تتبع الجمعية المختارة */
  if (memberForm) {
    memberForm.elements.assoc.addEventListener('change', function () {
      if (String(memberForm.elements.idx.value) !== '-1') return; /* وقت التعديل لا نلمس الحقول */
      var assocs = getAssociations();
      var a = this.value;
      assocs.forEach(function (x) { if (x.name === a) memberForm.elements.fee.value = x.fee; });
    });
  }

  /* تعديل / حذف (جمعية أو عضو) */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var da = t.closest('[data-del-assoc]');
    if (da) {
      var ai = Number(da.getAttribute('data-del-assoc'));
      var alist = getAssociations();
      var a = alist[ai];
      if (!a) return;
      var linked = getMembers().filter(function (m) { return String(m.assoc || '') === a.name; }).length;
      if (linked > 0) {
        toast('لا يمكن حذف «' + a.name + '» — فيها ' + linked + ' عضو. امسحهم أولاً', true);
        return;
      }
      alist.splice(ai, 1);
      saveAssociations(alist);
      if (assocForm) {
        var ca = parseInt(assocForm.elements.idx.value, 10);
        if (ca === ai) resetAssocForm();
        else if (ca > ai) assocForm.elements.idx.value = String(ca - 1);
      }
      renderAssociations();
      toast('تم حذف الجمعية «' + a.name + '»');
      return;
    }

    var ea = t.closest('[data-edit-assoc]');
    if (ea) { startEditAssoc(Number(ea.getAttribute('data-edit-assoc'))); return; }

    var dm = t.closest('[data-del-member]');
    if (dm) {
      var mi = Number(dm.getAttribute('data-del-member'));
      var mlist = getMembers();
      if (!mlist[mi]) return;
      var mname = mlist[mi].name;
      mlist.splice(mi, 1);
      saveMembers(mlist);
      if (memberForm) {
        var cm = parseInt(memberForm.elements.idx.value, 10);
        if (cm === mi) resetMemberForm();
        else if (cm > mi) memberForm.elements.idx.value = String(cm - 1);
      }
      renderAssociations();
      toast('تم حذف العضو «' + mname + '»');
      return;
    }

    var em = t.closest('[data-edit-member]');
    if (em) startEditMember(Number(em.getAttribute('data-edit-member')));
  });

  safeRun(renderAssociations, 'الجمعيات');

  /* ============================================================
     التصدير (Excel / PDF) + ربط Google Drive
     الملفات بتتبنى محلياً في export.js — من غير أي مكتبة خارجية
     ============================================================ */
  var EXPORT_SECTIONS = [
    { key: 'customers',    label: 'العملاء',          icon: 'ic-users' },
    { key: 'suppliers',    label: 'الموردون',         icon: 'ic-truck' },
    { key: 'collection',   label: 'التحصيل',          icon: 'ic-coins' },
    { key: 'ledger',       label: 'الدواخل والخوارج', icon: 'ic-exchange' },
    { key: 'partners',     label: 'الشركاء',          icon: 'ic-link' },
    { key: 'associations', label: 'الجمعيات',         icon: 'ic-group' }
  ];

  var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var MIME_PDF = 'application/pdf';

  function exportStamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  /* ---------- بناء التقارير ---------- */
  function reportCustomers() {
    var list = getCustomers();
    var rows = [], tTotal = 0, tPaid = 0, tRest = 0;
    list.forEach(function (c, i) {
      var d = derive(c);
      var paid = d.down + d.paid;
      tTotal += d.total; tPaid += paid; tRest += d.rest;
      rows.push([i + 1, c.name || '', c.phone || '', c.address || '', c.status || '',
        d.total, d.down, d.due, paid, d.rest]);
    });
    return {
      title: 'العملاء',
      subtitle: 'عدد العملاء: ' + list.length,
      columns: ['#', 'اسم العميل', 'الهاتف', 'العنوان', 'الحالة', 'الإجمالي', 'المقدم', 'المطلوب', 'المدفوع', 'المتبقي'],
      moneyCols: [5, 6, 7, 8, 9],
      rows: rows,
      summary: [
        { label: 'عدد العملاء', value: String(list.length) },
        { label: 'الإجمالي', value: money(tTotal) },
        { label: 'المدفوع', value: money(tPaid) },
        { label: 'المتبقي', value: money(tRest) }
      ]
    };
  }

  function reportSuppliers() {
    var list = getSuppliers();
    var rows = [], ti = 0, tp = 0, tr = 0;
    list.forEach(function (s, i) {
      var d = deriveSup(s);
      ti += d.incoming; tp += d.paid; tr += d.rest;
      rows.push([i + 1, s.name || '', s.job || '', s.phone || '', s.address || '', d.incoming, d.paid, d.rest]);
    });
    return {
      title: 'الموردون',
      subtitle: 'عدد الموردين: ' + list.length,
      columns: ['#', 'المورد', 'المهنة', 'الهاتف', 'العنوان', 'الوارد', 'المدفوع', 'الباقي'],
      moneyCols: [5, 6, 7],
      rows: rows,
      summary: [
        { label: 'عدد الموردين', value: String(list.length) },
        { label: 'الوارد', value: money(ti) },
        { label: 'المدفوع', value: money(tp) },
        { label: 'الباقي', value: money(tr) }
      ]
    };
  }

  function reportCollection() {
    var list = getCustomers();
    var rows = [], count = 0, paidSum = 0, restSum = 0;
    list.forEach(function (c) {
      var d = derive(c);
      restSum += d.rest;
      var running = d.due - d.later;
      if (!d.pays.length) {
        rows.push([c.name || '', '—', running, 0, '—', running, 'لا توجد دفعات']);
      } else {
        d.pays.forEach(function (p, i) {
          var before = running;
          var amt = Number(p.amount || 0);
          running = Math.max(running - amt, 0);
          count++;
          paidSum += amt;
          rows.push([c.name || '', formatDate(p.date), before, amt, p.no || (i + 1), running, p.note || '']);
        });
      }
    });
    return {
      title: 'التحصيل',
      subtitle: 'عدد الدفعات المسجّلة: ' + count,
      columns: ['العميل', 'التاريخ', 'المبلغ قبل الدفعة', 'المدفوع', 'المرة', 'المتبقي بعد الدفعة', 'ملاحظة'],
      moneyCols: [2, 3, 5],
      totalCols: [3],
      rows: rows,
      summary: [
        { label: 'عدد الدفعات', value: String(count) },
        { label: 'إجمالي الدفعات', value: money(paidSum) },
        { label: 'المتبقي للتحصيل', value: money(restSum) }
      ]
    };
  }

  function reportLedger() {
    var list = getLedger().slice();
    if (ledgerAutoOn()) list = list.concat(autoCashOps());
    list.sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    var rows = [], inc = 0, out = 0;
    list.forEach(function (t, i) {
      var a = Number(t.amount || 0);
      if (t.type === 'out') out += a; else inc += a;
      rows.push([i + 1, formatDate(t.date), t.desc || '', t.type === 'out' ? 'خرج' : 'دخل', a, t.note || '']);
    });
    return {
      title: 'الدواخل والخوارج',
      subtitle: 'عدد الحركات: ' + list.length,
      columns: ['#', 'التاريخ', 'البيان', 'النوع', 'المبلغ', 'ملاحظة'],
      moneyCols: [4],
      totalRow: false,   /* الدخل والخرج بيتجمّعوا في بطاقات الملخص لا في صف واحد */
      rows: rows,
      summary: [
        { label: 'عدد الحركات', value: String(list.length) },
        { label: 'الداخلات', value: money(inc) },
        { label: 'الخوارج', value: money(out) },
        { label: 'الرصيد الصافي', value: money(inc - out) }
      ]
    };
  }

  function reportPartners() {
    var list = getPartners();
    var rows = [], tc = 0, tw = 0, tn = 0;
    list.forEach(function (p, i) {
      var d = derivePartner(p);
      tc += d.capital; tw += d.withdrawals; tn += d.net;
      rows.push([i + 1, p.name || '', p.role || '', d.share, d.capital, d.cut, d.withdrawals, d.net]);
    });
    return {
      title: 'الشركاء',
      subtitle: 'عدد الشركاء: ' + list.length,
      columns: ['#', 'الشريك', 'الصفة', 'الحصة %', 'رأس المال', 'نصيبه من الأرباح', 'مسحوبات', 'الصافي المستحق'],
      moneyCols: [4, 5, 6, 7],
      totalCols: [4, 5, 6, 7],
      rows: rows,
      summary: [
        { label: 'رأس المال', value: money(tc) },
        { label: 'صافي أرباح السنة', value: money(getPartnerProfit()) },
        { label: 'المسحوبات', value: money(tw) },
        { label: 'الصافي المستحق', value: money(tn) }
      ]
    };
  }

  function reportAssociations() {
    var members = getMembers();
    var rows = [], fee = 0, paid = 0, rest = 0;
    members.forEach(function (m, i) {
      var d = deriveMember(m);
      fee += d.fee; paid += d.paid; rest += d.rest;
      var turn = memberTurnMonth(i);
      var asc = assocByName(m.assoc);
      rows.push([i + 1, m.assoc || '', m.name || '', m.type || '', d.fee, d.paid, d.rest, d.status,
        turn ? monthLabel(turn) : '—',
        asc ? assocPot(asc) : 0,
        asc ? ('يوم ' + assocPayoutDay(asc) + ' من كل شهر') : '—',
        m.note || '']);
    });
    return {
      title: 'الجمعيات',
      subtitle: 'عدد الجمعيات: ' + getAssociations().length + ' — عدد الأعضاء: ' + members.length,
      columns: ['#', 'الجمعية', 'العضو', 'نوع الاشتراك', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة',
        'موعد قبضه', 'الحصيلة الشهرية', 'يوم القبض', 'ملاحظة'],
      moneyCols: [4, 5, 6, 9],
      rows: rows,
      summary: [
        { label: 'الجمعيات', value: String(getAssociations().length) },
        { label: 'الأعضاء', value: String(members.length) },
        { label: 'المستحق', value: money(fee) },
        { label: 'المحصّل', value: money(paid) },
        { label: 'المتبقي', value: money(rest) }
      ]
    };
  }

  function numOrText(v) {
    var n = Number(String(v == null ? '' : v).replace(/,/g, ''));
    return isFinite(n) ? n : (v == null ? '' : v);
  }

  function reportAll() {
    var cust = reportCustomers(), sup = reportSuppliers(), col = reportCollection();
    var led = reportLedger(), par = reportPartners(), asc = reportAssociations();
    var rows = [
      ['العملاء', getCustomers().length, cust.summary[1].value, cust.summary[3].value],
      ['الموردون', getSuppliers().length, sup.summary[1].value, sup.summary[3].value],
      ['التحصيل', Number(col.summary[0].value), col.summary[1].value, col.summary[2].value],
      ['الدواخل والخوارج', Number(led.summary[0].value), led.summary[1].value, led.summary[3].value],
      ['الشركاء', getPartners().length, par.summary[0].value, par.summary[3].value],
      ['الجمعيات', getMembers().length, asc.summary[2].value, asc.summary[4].value]
    ];
    /* قيم رقمية حقيقية عشان Excel ينسّقها بالفواصل تلقائياً */
    rows = rows.map(function (r) {
      return [r[0], r[1], numOrText(r[2]), numOrText(r[3])];
    });
    return {
      title: 'ملخّص التطبيق',
      subtitle: 'نظام الإدارة المتكامل — ' + new Date().toLocaleDateString('ar-EG'),
      columns: ['القسم', 'العدد', 'الإجمالي / المستحق', 'المتبقي / الصافي'],
      moneyCols: [2, 3],
      totalRow: false,
      rows: rows,
      summary: [
        { label: 'الأقسام', value: String(EXPORT_SECTIONS.length) },
        { label: 'العملاء', value: String(getCustomers().length) },
        { label: 'الشركاء', value: String(getPartners().length) },
        { label: 'أعضاء الجمعيات', value: String(getMembers().length) }
      ]
    };
  }

  function buildReport(key) {
    switch (key) {
      case 'customers': return reportCustomers();
      case 'suppliers': return reportSuppliers();
      case 'collection': return reportCollection();
      case 'ledger': return reportLedger();
      case 'partners': return reportPartners();
      case 'associations': return reportAssociations();
      default: return reportAll();
    }
  }

  function reportWidths(report) {
    var n = report.columns.length, out = [];
    var money = report.moneyCols || [];
    for (var i = 0; i < n; i++) {
      var max = String(report.columns[i] == null ? '' : report.columns[i]).length;
      report.rows.forEach(function (r) {
        var v = r[i];
        var str;
        if (money.indexOf(i) !== -1 && typeof v === 'number' && isFinite(v)) {
          str = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
        } else {
          str = v == null ? '' : String(v);
        }
        if (str.length > max) max = str.length;
      });
      out.push(Math.max(14, Math.round(max * 2.0) + 6));
    }
    return out;
  }

  function reportToSheet(report) {
    return {
      name: report.title,
      title: report.title,
      subtitle: report.subtitle || '',
      columns: report.columns,
      rows: report.rows,
      widths: reportWidths(report),
      moneyCols: report.moneyCols || [],
      summary: report.summary || [],
      totalRow: true
    };
  }

  /* ملف «كامل» = ورقة ملخص + ورقة لكل قسم */
  function allSheets() {
    var sheets = [reportToSheet(reportAll())];
    EXPORT_SECTIONS.forEach(function (s) { sheets.push(reportToSheet(buildReport(s.key))); });
    return sheets;
  }

  /* ---------- تنفيذ التصدير ---------- */
  var exportPending = null;   /* الملف المجهّز بانتظار اختيار الوجهة */

  function exportFolderMode() {
    try { return localStorage.getItem('app_export_dest') || 'folder'; } catch (e) { return 'folder'; }
  }

  function closeExportModal() {
    var m = $('#exportModal');
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }

  function openExportModal(fname, mime, bytes) {
    var m = $('#exportModal');
    if (!m) { /* بدون نافذة: ننزّل مباشرة كما كان */
      ExportKit.downloadBytes(bytes, fname, mime);
      return;
    }
    exportPending = { fname: fname, mime: mime, bytes: bytes };
    var el = $('#exportFileName');
    if (el) el.textContent = fname;
    var dBtn = $('#exportToDrive');
    var hint = $('#exportDriveHint');
    if (dBtn) {
      dBtn.disabled = !driveState.connected;
      dBtn.textContent = driveState.connected ? '☁️ رفع إلى Google Drive' : '☁️ الرفع يحتاج ربط حساب Google';
    }
    if (hint) {
      hint.hidden = false;
      hint.textContent = driveState.connected
        ? 'الوجهة على الدرايف: ' + (exportFolderMode() === 'folder'
          ? 'مجلد «ملفات ال PDF و EXCEL تابع تطبيق نظام الاداره»'
          : 'بدون مجلد محدّد') + ' — تغيّرها من إعدادات التصدير.'
        : 'اربط حساب Google من قسم «ربط Google Drive» عشان يظهر خيار الرفع.';
    }
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
  }

  function runExportDownload() {
    if (!exportPending) return;
    var p = exportPending;
    if (!ExportKit.downloadBytes(p.bytes, p.fname, p.mime)) {
      toast('تعذّر بدء التحميل في هذه البيئة', true);
      return;
    }
    toast('تم تجهيز ' + p.fname + ' للتحميل ✓');
    exportPending = null;
  }

  function runExportUpload() {
    if (!exportPending) return;
    var p = exportPending;
    exportPending = null;
    autoUpload(p.fname, p.mime, p.bytes);
  }

  function doExport(key, kind) {
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      if (kind === 'xlsx') {
        var sheets = key === 'all' ? allSheets() : [reportToSheet(buildReport(key))];
        var bytes = ExportKit.buildXlsx(sheets);
        var fname = 'nizam-' + (key === 'all' ? 'full' : key) + '-' + exportStamp() + '.xlsx';
        openExportModal(fname, MIME_XLSX, bytes);
      } else {
        if (!ExportKit.hasCanvas()) {
          toast('تصدير PDF يحتاج متصفحاً حقيقياً', true);
          return;
        }
        var pdf = ExportKit.reportToPdf(buildReport(key));
        if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
        var pf = 'nizam-' + (key === 'all' ? 'summary' : key) + '-' + exportStamp() + '.pdf';
        openExportModal(pf, MIME_PDF, pdf);
      }
    } catch (e) {
      toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true);
    }
  }

  function renderExportGrid() {
    var g = $('#exportGrid');
    if (!g || g.getAttribute('data-built') === '1') return;
    g.innerHTML = EXPORT_SECTIONS.map(function (s) {
      return '<div class="export-item">' +
        '<div class="export-item__top"><span class="card__icon card__icon--violet sm">' +
        '<svg viewBox="0 0 24 24" class="ico"><use href="#' + s.icon + '"></use></svg></span><b>' + s.label + '</b></div>' +
        '<div class="form__actions">' +
        '<button type="button" class="btn btn--primary btn--sm" data-export="' + s.key + '" data-kind="xlsx">Excel</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-export="' + s.key + '" data-kind="pdf">PDF</button>' +
        '</div></div>';
    }).join('');
    g.setAttribute('data-built', '1');
  }

  /* ---------- Google Drive ---------- */
  var driveState = { configured: false, connected: false };

  function setDriveStatus(cls, text) {
    var box = $('#driveStatus');
    if (box) box.className = 'drive-status' + (cls ? ' ' + cls : '');
    var t = $('#driveStatusText');
    if (t) t.textContent = text;
  }

  /* ترجمة نتيجة الفحص من الخادم إلى نص عربي واضح */
  function googleVerdictText(verdict) {
    switch (verdict) {
      case 'missing_keys': return 'الخادم لا يرى المتغيّرين أصلاً';
      case 'bad_client_id_format': return 'قيمة GOOGLE_CLIENT_ID غير صحيحة الصيغة';
      case 'bad_client_secret_format': return 'قيمة GOOGLE_CLIENT_SECRET غير صحيحة الصيغة';
      case 'client_id_not_found': return 'Google لا يعرف هذا الـClient ID';
      case 'bad_client_secret': return 'الـClient Secret لا يطابق الـClient ID';
      case 'redirect_uri_mismatch': return 'رابط الإرجاع غير مسجّل في Google Cloud';
      case 'keys_ok': return 'المفاتيح صحيحة ومطابقة لـ Google';
      default: return 'الحالة غير معروفة — شغّل الفحص';
    }
  }

  function renderGoogleDiag(j) {
    if (!j) return '<b>لا توجد نتيجة</b>';
    var ok = j.verdict === 'keys_ok';
    var cls = ok ? 'drive-diag is-ok' : (j.verdict === 'missing_keys' || j.verdict === 'bad_client_id_format' ? 'drive-diag is-bad' : 'drive-diag is-warn');
    var ip = j.idProbe || {};
    var sp = j.secretProbe || {};
    var h = '<div class="' + cls + '">';
    h += '<b>نتيجة الفحص: ' + esc(googleVerdictText(j.verdict)) + '</b>';
    if (j.advice) h += '<span class="diag-step">' + esc(j.advice) + '</span>';
    h += '<span class="diag-step">Client ID على الخادم: ' +
      (j.clientId ? '<code>' + esc(j.clientId) + '</code>' : '<b>غير موجود</b>') +
      ' — الصيغة ' + (j.clientIdValid ? '✅ صحيحة' : '❌ غير صحيحة') + '</span>';
    h += '<span class="diag-step">Client Secret: ' +
      (j.secretPresent ? 'موجود' : 'غير موجود') + ' — ' + (j.secretValid ? '✅ صيغته سليمة' : '❌ صيغته غير سليمة') + '</span>';
    h += '<span class="diag-step">رابط الإرجاع المستخدم: <code>' + esc(j.redirectUri || '') + '</code></span>';
    if (ip.status !== undefined) {
      h += '<span class="diag-step">فحص Google للـClient ID: ' +
        (ip.clientNotFound ? '❌ غير معروف' : ip.redirectUriMismatch ? '⚠️ صحيح لكن رابط الإرجاع غير مسجّل' :
          ip.redirected ? '✅ معروف' : (ip.network ? 'تعذّر الفحص (شبكة)' : 'حالة ' + ip.status)) + '</span>';
    }
    if (sp.error) {
      h += '<span class="diag-step">فحص الـSecret: ' +
        (sp.error === 'invalid_grant' ? '✅ مطابق (Google قبل المفتاحين)' :
          sp.error === 'invalid_client' ? '❌ غير مطابق' : esc(sp.error)) + '</span>';
    }
    h += '</div>';
    return h;
  }

  function applyDriveState(cfg, conn, email, backendDown, diag) {
    driveState.configured = !!cfg;
    driveState.connected = !!conn;
    driveState.backendDown = !!backendDown;
    driveState.diag = diag || {};
    var verdict = driveState.diag.verdict || (cfg ? 'keys_ready' : 'missing_keys');
    var tail = driveState.diag.clientIdTail || '';
    var setup = $('#driveSetup'), connect = $('#driveConnect'),
        disconnect = $('#driveDisconnect'), upload = $('#driveUploadLabel'), note = $('#driveNote');
    if (setup) setup.hidden = !!cfg || !!backendDown;

    /* الزر دايم ظاهر — ومعطّل بس لو السيرفر نفسه قال «المفاتيح ناقصة».
       لو السيرفر مش رادّ خالص (نشر من غير مسار /api) مبنقولش «المفاتيح
       ناقصة»: دي مشكلة في النشر مش في المفاتيح. */
    if (connect) {
      /* الزر يبقى ظاهراً دائماً حتى لو السيرفر مش رادّ — لا علاقة له بتوفر المفاتيح */
      connect.hidden = false;
      connect.disabled = backendDown ? false : !(cfg && !conn);
      connect.title = backendDown
        ? 'تعذّر الوصول لخادم الربط — اضغط للتجربة'
        : (cfg && !conn)
          ? 'اضغط لاختيار حساب Google وتفويضه'
          : verdict === 'bad_client_id_format'
            ? 'GOOGLE_CLIENT_ID غير صحيح الصيغة — لازم ينتهي بـ .apps.googleusercontent.com'
            : 'أضف المفتاحين GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Sites/Vercel ← Secrets ثم أعد النشر';
    }
    if (disconnect) disconnect.hidden = !conn;
    if (upload) upload.hidden = !conn;
    var toField = $('#driveNotifyField');
    if (toField) toField.hidden = !conn;

    /* المزامنة: تبدأ المؤقّتات أول ما يتأكد الاتصال */
    var syncBox = $('#syncState');
    if (!conn) {
      if (syncTimerPush) { clearInterval(syncTimerPush); syncTimerPush = null; }
      if (syncTimerCheck) { clearInterval(syncTimerCheck); syncTimerCheck = null; }
      if (syncBox) syncSetState(cfg ? '' : 'is-warn',
        cfg ? 'اربط حساب Google لتفعيل المزامنة' : 'المزامنة تتطلّب ربط حساب Google');
      var pend = $('#syncPending');
      if (pend) pend.hidden = true;
      pendingSync = null;
    } else if (syncBox && !syncBusy && $('#syncStateText') && $('#syncStateText').textContent.indexOf('آخر رفع') !== 0) {
      syncSetState('', 'المزامنة جاهزة — تقدر ترفع نسخة أو تفحص الدرايف');
      startSyncTimers();
      if (!driveSyncStarted) { driveSyncStarted = true; setTimeout(function () { syncCheck(true); }, 800); }
    }

    if (note) {
      if (conn) {
        note.hidden = false;
        note.textContent = 'أي ملف تصدير هيتنزّل ويترفع على Drive تلقائياً.';
      } else if (backendDown) {
        note.hidden = false;
        note.textContent = 'خادم الربط مش متاح على هذا النشر: مسار /api/google/status ما ردّش. لو التطبيق منشور على Vercel لازم مجلد api/ ومعاه vercel.json يكونوا مرفوعين، وإلا مفيش حاجة تقدر تربط Google.';
      } else if (!cfg) {
        note.hidden = false;
        note.textContent = 'الزر معطّل مؤقتاً: حطّ GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Sites ← Secrets (أو Vercel ← Environment Variables) وأعد النشر، وهيتشغّل فوراً. ' +
          'مهم على Vercel: المتغيّرات تُطبَّق على النشر الجديد فقط — اعمل Redeploy بعد إضافتها، وتأكد إنها مضافة على Production و Preview.';
      } else if (verdict === 'bad_client_id_format' || verdict === 'bad_client_secret_format') {
        note.hidden = false;
        note.textContent = 'المفاتيح موجودة لكن صيغتها غير صحيحة: ' +
          (verdict === 'bad_client_id_format'
            ? 'GOOGLE_CLIENT_ID لازم ينتهي بـ .apps.googleusercontent.com (القيمة الحالية تنتهي بـ ' + (tail || '—') + ').'
            : 'GOOGLE_CLIENT_SECRET لازم يكون بالشكل GOCSPX-... من Google Cloud ← Clients.') +
          ' انسخ القيمة كاملة من Google Cloud وأعد النشر (Redeploy) على Vercel.';
      } else {
        note.hidden = true;
        note.textContent = '';
      }
    }

    if (backendDown) setDriveStatus('is-warn', 'تعذّر الوصول لخادم الربط (/api/google/status) — مش خطأ في المفاتيح، راجع نشر مجلد api/');
    else if (!cfg) setDriveStatus('is-warn', 'ناقص مفتاحين: GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET — اضيفهم في Sites/Vercel ← Secrets ثم اعمل Redeploy');
    else if (verdict === 'bad_client_id_format' || verdict === 'bad_client_secret_format') {
      setDriveStatus('is-warn', 'المفاتيح موجودة لكن ' + googleVerdictText(verdict) +
        (tail ? ' — القيمة الحالية تنتهي بـ ' + tail + ')' : '') + ' — اضغط «فحص المفاتيح»');
    } else if (conn) setDriveStatus('is-ok', 'متصل بحساب Google Drive' + (email ? ' — ' + email : ''));
    else setDriveStatus('', 'المفاتيح مضبوطة — لم يتم ربط حساب بعد' + (tail ? ' (Client ID ينتهي بـ ' + tail + ')' : ''));
  }

  function refreshDriveStatus() {
    var redir = $('#driveRedirect');
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    if (redir) redir.textContent = origin + '/api/google/callback';
    var redirV = $('#driveRedirectVercel');
    if (redirV) redirV.textContent = 'https://<اسم-مشروعك>.vercel.app/api/google/callback';

    if (typeof fetch !== 'function') {
      applyDriveState(false, false, '');
      return;
    }
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r || typeof r.json !== 'function' || !r.ok) {
          var e = new Error('status ' + (r && r.status));
          e.backendDown = true;
          throw e;
        }
        return r.json().then(function (sc) {
          if (!sc || typeof sc.configured === 'undefined') {
            var e2 = new Error('bad payload');
            e2.backendDown = true;
            throw e2;
          }
          return sc;
        });
      })
      .then(function (sc) { applyDriveState(sc.configured, sc.connected, sc.email, false, sc); })
      .catch(function () {
        /* فشل الاتصال أو الرد مش JSON: السيرفر مش متاح — ده مش معناه إن المفاتيح ناقصة */
        applyDriveState(false, false, '', true);
      });
  }

  /* ---------- فحص المفاتيح فعلياً مع Google ---------- */
  function runGoogleCheck(btn, box) {
    if (!box) return;
    box.hidden = false;
    box.className = 'drive-diag';
    box.innerHTML = '<b>جارٍ فحص المفاتيح مع Google…</b>';
    if (btn) btn.disabled = true;
    fetch('/api/google/check', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        box.innerHTML = renderGoogleDiag(j);
        box.hidden = false;
        var reload = $('#driveReload');
        if (reload) reload.hidden = j.verdict !== 'keys_ok';
        if (j.verdict === 'keys_ok') toast('المفاتيح صحيحة ومطابقة لـ Google ✓');
        else toast('نتيجة الفحص: ' + googleVerdictText(j.verdict), true);
      })
      .catch(function () {
        box.className = 'drive-diag is-bad';
        box.innerHTML = '<b>تعذّر الوصول لمسار الفحص /api/google/check</b>' +
          '<span class="diag-step">تأكد إن مجلد api/ منشور على نفس الدومين، وإن التطبيق معمول له Redeploy بعد آخر تعديل.</span>';
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  var driveCheckBtn = $('#driveCheck');
  if (driveCheckBtn) driveCheckBtn.addEventListener('click', function () {
    runGoogleCheck(driveCheckBtn, $('#driveDiagBox'));
  });

  var driveReloadBtn = $('#driveReload');
  if (driveReloadBtn) driveReloadBtn.addEventListener('click', function () {
    try { location.reload(); } catch (e) {}
  });

  window.runGoogleCheck = runGoogleCheck;
  window.renderGoogleDiag = renderGoogleDiag;

  function uploadToDrive(name, mime, b64) {
    return fetch('/api/google/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mime: mime, b64: b64, dest: exportFolderMode() })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || 'فشل الرفع');
        return j;
      });
    });
  }

  function notifyUploaded(name, mime, b64, link) {
    if (!driveState.connected || typeof fetch !== 'function') return Promise.resolve(null);
    var el = $('#driveNotifyTo');
    var to = el ? String(el.value || '').trim() : '';
    try { localStorage.setItem('app_drive_notify_to', to); } catch (e) {}

    return fetch('/api/google/notify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mime: mime, b64: b64, to: to, link: link || '' })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || 'فشل إرسال التنبيه');
        return j;
      });
    });
  }

  function autoUpload(name, mime, bytes) {
    if (!driveState.connected || typeof ExportKit === 'undefined') {
      /* بدون اتصال: ننزّل الملف على الجهاز بدل الرفع */
      if (typeof ExportKit !== 'undefined') ExportKit.downloadBytes(bytes, name, mime);
      toast('الحساب غير مربوط — اتحمّل الملف على الجهاز', true);
      return;
    }
    var b64 = ExportKit.bytesToBase64(bytes);
    uploadToDrive(name, mime, b64)
      .then(function (r) {
        toast('تم الرفع إلى Google Drive ✓' + (exportFolderMode() === 'folder' ? ' (مجلد التصدير)' : ''));
        return notifyUploaded(name, mime, b64, r && r.link);
      })
      .then(function (r) { if (r) toast('وصل تنبيه البريد إلى ' + (r.to || 'بريدك') + ' ✓'); })
      .catch(function (e) {
        toast('فشل الرفع: ' + (e && e.message ? e.message : e), true);
      });
  }

  /* أزرار نافذة اختيار وجهة التصدير */
  var expToDeviceBtn = $('#exportToDevice');
  if (expToDeviceBtn) expToDeviceBtn.addEventListener('click', function () {
    closeExportModal();
    runExportDownload();
  });

  var expToDriveBtn = $('#exportToDrive');
  if (expToDriveBtn) expToDriveBtn.addEventListener('click', function () {
    closeExportModal();
    runExportUpload();
  });

  var expModal = $('#exportModal');
  if (expModal) {
    expModal.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-close')) {
        closeExportModal();
        exportPending = null;
      }
    });
  }

  /* إعداد وجهة الرفع على الدرايف */
  var expFolderSel = $('#exportFolderMode');
  if (expFolderSel) {
    expFolderSel.value = exportFolderMode();
    expFolderSel.addEventListener('change', function () {
      try { localStorage.setItem('app_export_dest', this.value); } catch (e) {}
      toast(this.value === 'folder'
        ? 'الملفات هترفع في مجلد «ملفات ال PDF و EXCEL تابع تطبيق نظام الاداره»'
        : 'الملفات هترفع على الدرايف بدون مجلد محدّد');
    });
  }

  /* نجرّب مسار الربط الأول — لو مش موجود (استضافة ثابتة بلا خادم) نقولها بدل صفحة 404 */
  function startGoogleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    var go = function () { if (typeof location !== 'undefined') location.href = '/api/google/login'; };
    if (typeof fetch !== 'function') { go(); return; }
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r || r.status === 404 || r.status === 501) throw new Error('NOAPI');
        if (typeof r.clone !== 'function') return null;
        return r.clone().json().catch(function () { throw new Error('NOAPI'); });
      })
      .then(function () { go(); })
      .catch(function () {
        toast('مسار ربط Google غير متاح على هذه الصفحة — شغّل المعاينة الكاملة (preview-local.mjs) أو افتح الموقع المنشور.', true);
      });
  }
  window.startGoogleLogin = startGoogleLogin;

  var driveConnectBtn = $('#driveConnect');
  if (driveConnectBtn) driveConnectBtn.addEventListener('click', function () {
    startGoogleLogin();
  });

  var driveDisconnectBtn = $('#driveDisconnect');
  if (driveDisconnectBtn) driveDisconnectBtn.addEventListener('click', function () {
    if (typeof fetch !== 'function') return;
    fetch('/api/google/disconnect', { method: 'POST', credentials: 'same-origin' })
      .then(function () { toast('تم فصل الربط'); applyDriveState(driveState.configured, false, ''); })
      .catch(function () { toast('تعذّر فصل الربط', true); });
  });

  var driveFile = $('#driveFile');
  if (driveFile) driveFile.addEventListener('change', function () {
    var input = this;
    var f = input.files && input.files[0];
    if (!f) return;
    if (typeof FileReader === 'undefined') { toast('قراءة الملف غير مدعومة هنا', true); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result).split(',')[1] || '';
      uploadToDrive(f.name, f.type || 'application/octet-stream', b64)
        .then(function (r) {
          toast('تم رفع «' + f.name + '» إلى Google Drive');
          return notifyUploaded(f.name, f.type || 'application/octet-stream', b64, r && r.link);
        })
        .then(function (r) { if (r) toast('وصل تنبيه البريد إلى ' + (r.to || 'بريدك') + ' ✓'); })
        .catch(function (e) { toast('فشل الرفع: ' + (e && e.message ? e.message : e), true); })
        .then(function () { input.value = ''; });
    };
    reader.onerror = function () { toast('تعذّر قراءة الملف', true); };
    reader.readAsDataURL(f);
  });

  /* أزرار التصدير */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest('[data-export]');
    if (b) { doExport(b.getAttribute('data-export'), b.getAttribute('data-kind')); return; }
    if (t.closest('#exportAllXlsx')) { doExport('all', 'xlsx'); return; }
    if (t.closest('#exportAllPdf')) { doExport('all', 'pdf'); return; }
  });

  /* العودة من OAuth */
  try {
    if (typeof location !== 'undefined' && location.search && typeof URLSearchParams === 'function') {
      var gq = new URLSearchParams(location.search);
      if (gq.get('g')) {
        var gState = gq.get('g');
        var gMsg = gq.get('m') || '';
        /* نحتفظ بالرسالة للمكوّنات اللي بتشتغل بعد تنظيف الرابط */
        try { window.__googleOAuth = { g: gState, m: gMsg }; } catch (e) {}
        if (gState === 'ok') toast('تم ربط حساب Google بنجاح ✓');
        else if (gState === 'err') {
          toast('تعذّر ربط Google: ' + gMsg, true);
          /* رسالة واضحة فوق شاشة الربط نفسها بدل صفحة خطأ Google */
          var gBox = document.getElementById('gateError');
          if (gBox && gMsg) { gBox.textContent = gMsg; gBox.style.display = 'block'; }
        }
        if (history && history.replaceState) history.replaceState(null, '', location.pathname);
      }
    }
  } catch (e) {}

  try {
    var notifyEl = $('#driveNotifyTo');
    if (notifyEl) notifyEl.value = localStorage.getItem('app_drive_notify_to') || '';
  } catch (e) {}

  safeRun(function () { renderExportGrid(); refreshDriveStatus(); }, 'التصدير والربط');

  /* ============================================================
     المزامنة السحابية (Google Drive)
     رفع نسخة كاملة + فحص دوري + استبدال بأمان + نسخة احتياطية
     ============================================================ */
  var SYNC_LABELS = {
    app_customers: 'العملاء',
    app_suppliers: 'الموردون',
    app_ledger: 'الدواخل والخوارج',
    app_partners: 'الشركاء',
    app_partner_profit: 'أرباح الشركاء',
    app_associations: 'الجمعيات',
    app_members: 'أعضاء الجمعيات',
    app_wa_settings: 'رسائل التحصيل (واتساب) — الإعدادات',
    app_wa_log: 'رسائل التحصيل (واتساب) — سجل الإرسال'
  };
  var SYNC_KEYS = Object.keys(SYNC_LABELS);
  var SYNC_PUSH_MS = 60 * 60 * 1000;    /* رفع تلقائي كل ساعة */
  var SYNC_CHECK_MS = 10 * 60 * 1000;   /* فحص تلقائي كل ١٠ دقائق */
  var pendingSync = null;
  var syncBusy = false;
  var driveSyncStarted = false;
  var syncTimerPush = null, syncTimerCheck = null;

  function syncPolicy() {
    try { return localStorage.getItem('app_sync_policy') || 'ask'; } catch (e) { return 'ask'; }
  }

  /* وضع المشاهد (غير المصرح له): لا يرفع أي شيء ويطبّق أحدث نسخة دائماً */
  function isViewerMode() {
    try { return localStorage.getItem('app_user_role') === 'viewer'; } catch (e) { return false; }
  }

  function setSyncPolicy(v) {
    try { localStorage.setItem('app_sync_policy', String(v || 'ask')); } catch (e) {}
  }

  function countOf(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return 0;
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v.length : (v === null || v === undefined ? 0 : 1);
    } catch (e) { return 0; }
  }

  function syncCounts() {
    var o = {};
    SYNC_KEYS.forEach(function (k) { o[k] = countOf(k); });
    return o;
  }

  function collectSnapshot() {
    var sections = {};
    SYNC_KEYS.forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw !== null) sections[k] = raw;   /* نحتفظ بالنص الخام لتجنّب أي فقد في التحويل */
    });
    return {
      schema: 1,
      updatedAt: new Date().toISOString(),
      device: (typeof navigator !== 'undefined' && navigator.platform) ? navigator.platform : 'جهاز',
      counts: syncCounts(),
      sections: sections
    };
  }

  function diffCounts(oldCounts, newCounts) {
    var out = [];
    SYNC_KEYS.forEach(function (k) {
      if (!oldCounts || oldCounts[k] == null) return;
      var d = Number(newCounts[k] || 0) - Number(oldCounts[k]);
      if (d > 0) out.push(SYNC_LABELS[k] + ': +' + d + ' سجل جديد');
      else if (d < 0) out.push(SYNC_LABELS[k] + ': ' + d + ' سجل');
    });
    return out;
  }

  function backupLocal(reason) {
    var b = { at: new Date().toISOString(), reason: reason || '', sections: {} };
    SYNC_KEYS.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) b.sections[k] = v; });
    try { localStorage.setItem('app_sync_backup', JSON.stringify(b)); } catch (e) {}
    return b;
  }

  function hasLocalBackup() {
    try { return !!localStorage.getItem('app_sync_backup'); } catch (e) { return false; }
  }

  function restoreLocalBackup() {
    try {
      var raw = localStorage.getItem('app_sync_backup');
      if (!raw) return false;
      var b = JSON.parse(raw);
      if (!b || !b.sections) return false;
      /* نحفظ نسخة من الحالة الحالية قبل التراجع عشان التراجع نفسه يرجع */
      var current = backupLocal('قبل التراجع');
      SYNC_KEYS.forEach(function (k) {
        if (typeof b.sections[k] === 'string') localStorage.setItem(k, b.sections[k]);
      });
      try { localStorage.setItem('app_sync_backup', JSON.stringify(current)); } catch (e) {}
      return true;
    } catch (e) { return false; }
  }

  /* هل القيمة الخام تمثّل بيانات فارغة؟ — لمنع استبدال بيانات ببيانات فاضية */
  function isEmptyPayload(raw) {
    if (raw == null || raw === '') return true;
    try {
      var v = JSON.parse(raw);
      if (Array.isArray(v)) return v.length === 0;
      if (v !== null && typeof v === 'object') return Object.keys(v).length === 0;
      if (v === null) return true;
      return false;
    } catch (e) { return false; }
  }
  function readRawKey(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  var lastApplySkipped = 0;

  function applySnapshot(snap) {
    backupLocal('قبل استبدال المزامنة');
    var secs = (snap && snap.sections) || {};
    var applied = 0;
    lastApplySkipped = 0;
    SYNC_KEYS.forEach(function (k) {
      if (typeof secs[k] !== 'string') return;
      /* الحماية: ما نستبدلش بيانات موجودة على الجهاز ببيانات فارغة من بُعد */
      if (isEmptyPayload(secs[k]) && !isEmptyPayload(readRawKey(k))) { lastApplySkipped++; return; }
      localStorage.setItem(k, secs[k]); applied++;
    });
    try {
      localStorage.setItem('app_sync_meta', JSON.stringify({
        at: new Date().toISOString(),
        device: (snap && snap.device) || '',
        updatedAt: (snap && snap.updatedAt) || ''
      }));
    } catch (e) {}
    return applied;
  }

  function syncSetState(cls, text) {
    var box = $('#syncState');
    if (box) box.className = 'drive-status' + (cls ? ' ' + cls : '');
    var t = $('#syncStateText');
    if (t) t.textContent = text;
  }

  function syncShowNote(text, isError) {
    var n = $('#syncNote');
    if (!n) return;
    n.hidden = !text;
    n.textContent = text || '';
    n.className = 'panel__note' + (isError ? ' is-error' : '');
  }

  function syncApi(path, payload) {
    var opts = { credentials: 'same-origin' };
    if (payload) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(payload);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) {
          var err = new Error((j && j.error) || 'فشلت عملية المزامنة');
          err.code = (j && j.code) || '';
          throw err;
        }
        return j;
      });
    });
  }

  /* ---------- رفع نسخة الآن ---------- */
  function syncPush(auto) {
    if (syncBusy) return Promise.resolve(null);
    if (isViewerMode()) return Promise.resolve(null);   /* المشاهد لا يرفع شيئاً */
    if (!driveState.connected) {
      if (!auto) toast('اربط حساب Google أولاً', true);
      return Promise.resolve(null);
    }
    syncBusy = true;
    if (!auto) syncSetState('', 'جارٍ رفع النسخة…');

    var snap = collectSnapshot();
    var prevRaw = null;
    try { prevRaw = localStorage.getItem('app_sync_meta'); } catch (e) {}
    var prev = null;
    try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch (e) {}
    var changes = diffCounts(prev && prev.counts, snap.counts);

    var el = $('#driveNotifyTo');
    var to = el ? String(el.value || '').trim() : '';

    return syncApi('/api/sync/push', {
      snapshot: snap,
      sendEmail: true,
      to: to,
      changes: changes
    }).then(function (r) {
      try {
        localStorage.setItem('app_sync_meta', JSON.stringify({
          at: new Date().toISOString(), device: snap.device,
          updatedAt: snap.updatedAt, counts: snap.counts
        }));
      } catch (e) {}
      savePushedFingerprint();
      syncSetState('is-ok', 'آخر رفع: ' + new Date().toLocaleString('ar-EG') +
        (r.emailed ? ' — وصل التنبيه إلى ' + r.emailedTo : ''));
      syncShowNote('اترفع ' + (changes.length ? changes.join(' · ') : 'بدون تغييرات مسجّلة') + '.', false);
      if (!auto) toast('تم رفع نسخة المزامنة ✓');
      return r;
    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الرفع: ' + (e && e.message ? e.message : e), true);
        toast(e && e.code === 'PERM'
          ? 'الحساب الحالي صلاحيته مشاهدة فقط على المجلد — الحل مكتوب بالأسفل'
          : 'فشل رفع المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      return null;
    }).then(function (r) { syncBusy = false; return r; });
  }

  /* ---------- فحص وتحميل ---------- */
  function syncShowPending(pull) {
    var snap = pull && pull.snapshot;
    if (!snap || !snap.sections) return;
    var box = $('#syncPending'), head = $('#syncPendingHead'),
        list = $('#syncPendingList'), meta = $('#syncPendingMeta');
    if (!box) return;

    var localCounts = syncCounts();
    var changes = diffCounts(localCounts, snap.counts || {});
    if (head) head.textContent = 'توجد نسخة أحدث على الدرايف' + (pull.device ? ' — من: ' + pull.device : '');
    if (list) {
      list.innerHTML = changes.length
        ? changes.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('')
        : '<li>لا توجد فروقات في عدد السجلات — قد يكون التعديل داخل السجلات نفسها.</li>';
    }
    if (meta) meta.textContent = 'تاريخ النسخة البعيدة: ' +
      (pull.updatedAt ? new Date(pull.updatedAt).toLocaleString('ar-EG') : 'غير معروف') +
      ' — وستُحفظ نسخة احتياطية من بياناتك الحالية قبل الاستبدال.';
    box.hidden = false;
    pendingSync = snap;
  }

  function syncCheck(auto) {
    if (syncBusy) return Promise.resolve(null);
    if (!driveState.connected) {
      if (!auto) toast('اربط حساب Google أولاً', true);
      return Promise.resolve(null);
    }
    syncBusy = true;
    if (!auto) syncSetState('', 'جارٍ فحص فولدر المزامنة…');

    return syncApi('/api/sync/pull').then(function (pull) {
      if (!pull.exists) {
        syncSetState('', 'فولدر المزامنة فاضي — اضغط «رفع نسخة الآن» لأول مرة');
        if (!auto) toast('مفيش نسخة على الدرايف بعد');
        syncBusy = false;
        return pull;
      }

      var remoteAt = pull.updatedAt || pull.modifiedTime || '';
      var metaRaw = null;
      try { metaRaw = localStorage.getItem('app_sync_meta'); } catch (e) {}
      var meta = null;
      try { meta = metaRaw ? JSON.parse(metaRaw) : null; } catch (e) {}

      /* نسخة مطابقة لآخر مزامنة → لا شيء جديد */
      if (meta && meta.updatedAt && remoteAt && meta.updatedAt === remoteAt) {
        syncSetState('is-ok', 'المزامنة محدّثة — لا توجد نسخة أحدث');
        if (!auto) toast('لا توجد نسخة أحدث');
        syncBusy = false;
        return pull;
      }

      if (meta && meta.updatedAt && remoteAt && remoteAt < meta.updatedAt && !isViewerMode()) {
        syncSetState('is-warn', 'نسختك المحلية أحدث من البعيدة — ارفع نسخة لتحديثها');
        syncBusy = false;
        return pull;
      }

      var policy = isViewerMode() ? 'auto' : syncPolicy();
      if (policy === 'manual') {
        syncSetState('is-warn', 'توجد نسخة أحدث على الدرايف — التحميل يدوي من زر «فحص وتحميل»');
        syncBusy = false;
        return pull;
      }

      if (policy === 'ask') {
        syncSetState('is-warn', 'توجد نسخة أحدث على الدرايف — راجع التفاصيل وقرر');
        syncShowPending(pull);
        if (!auto) toast('توجد نسخة أحدث — راجع التفاصيل');
        syncBusy = false;
        return pull;
      }

      /* auto */
      return syncApply(pull.snapshot).then(function () {
        syncBusy = false;
        return pull;
      });
    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الفحص: ' + (e && e.message ? e.message : e), true);
        toast(e && e.code === 'PERM'
          ? 'تعذّر الوصول للمجلد — الحساب صلاحيته مشاهدة فقط، الحل بالأسفل'
          : 'فشل فحص المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      syncBusy = false;
      return null;
    });
  }

  function syncApply(snap) {
    if (!snap || !snap.sections) { toast('النسخة البعيدة غير صالحة', true); return Promise.resolve(false); }
    var applied = applySnapshot(snap);
    var box = $('#syncPending');
    if (box) box.hidden = true;
    pendingSync = null;
    var rb = $('#syncRestore');
    if (rb) rb.hidden = false;
    syncSetState('is-ok', 'اتطبّقت نسخة ' + (snap.updatedAt ? new Date(snap.updatedAt).toLocaleString('ar-EG') : 'الدرايف') +
      ' — ' + applied + ' أقسام');
    syncShowNote('اتحفظت نسخة احتياطية من بياناتك القديمة. لو رجعت غلط، اضغط «تراجع عن آخر استبدال».' +
      (lastApplySkipped ? ' — تم تجاهل ' + lastApplySkipped + ' قسم فارغ في النسخة البعيدة عشان ما نمسحش بياناتك.' : ''), false);
    toast(lastApplySkipped
      ? 'تم تحديث البيانات ✓ (وتم حماية ' + lastApplySkipped + ' قسم من المسح)'
      : 'تم تحديث البيانات من الدرايف ✓');
    /* نعيد بناء الأقسام المعروضة */
    try {
      renderHomeStats();
      if (typeof renderCustomers === 'function') renderCustomers($('#custSearch') ? $('#custSearch').value : '');
      if (typeof renderSuppliers === 'function') renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
      renderLedger(); renderLedgerSummary();
      renderPartners(); renderAssociations();
      renderCollection(colFilter()); renderCollectionSummary();
    } catch (e) { /* إعادة البناء تكمّلي */ }
    return Promise.resolve(true);
  }

  /* ---------- أزرار ولوحة ---------- */
  var syncPushBtn = $('#syncPush');
  if (syncPushBtn) syncPushBtn.addEventListener('click', function () { syncPush(false); });

  var quickSaveBtn = $('#quickSaveBtn');
  if (quickSaveBtn) quickSaveBtn.addEventListener('click', function () { syncPush(false); });

  var syncCheckBtn = $('#syncCheck');
  if (syncCheckBtn) syncCheckBtn.addEventListener('click', function () { syncCheck(false); });

  var syncApplyBtn = $('#syncApply');
  if (syncApplyBtn) syncApplyBtn.addEventListener('click', function () {
    if (pendingSync) syncApply(pendingSync);
  });

  var syncIgnoreBtn = $('#syncIgnore');
  if (syncIgnoreBtn) syncIgnoreBtn.addEventListener('click', function () {
    var box = $('#syncPending');
    if (box) box.hidden = true;
    pendingSync = null;
    syncSetState('', 'تم تجاهل النسخة البعيدة — تقدر تحمّلها في أي وقت');
  });

  var syncRestoreBtn = $('#syncRestore');
  if (syncRestoreBtn) syncRestoreBtn.addEventListener('click', function () {
    if (!hasLocalBackup()) { toast('مفيش نسخة احتياطية للتراجع إليها', true); return; }
    restoreLocalBackup();
    syncSetState('', 'اترجّعت البيانات للحالة السابقة');
    syncShowNote('اترجّعت نسخة ما قبل الاستبدال. لو رجعت غلط تاني، اضغط تراجع مرة أخرى.', false);
    toast('تم التراجع ✓');
    try {
      renderHomeStats();
      renderLedger(); renderLedgerSummary(); renderPartners(); renderAssociations();
    } catch (e) {}
  });

  var syncPolicySel = $('#syncPolicy');
  if (syncPolicySel) {
    syncPolicySel.value = syncPolicy();
    syncPolicySel.addEventListener('change', function () {
      setSyncPolicy(this.value);
      toast('اتحفظت سياسة المزامنة');
    });
  }

  /* ---------- اختيار النسخة القديمة ---------- */
  var syncVersionsBox = $('#syncVersions');
  var syncVersionsList = $('#syncVersionsList');
  var syncVersionsHead = $('#syncVersionsHead');
  var currentVersions = [];   /* آخر لائحة نسخ تم جلبها */

  function versionLabel(name, modifiedTime) {
    var d = modifiedTime ? new Date(modifiedTime) : null;
    var when = d && !isNaN(d) ? d.toLocaleString('ar-EG') : '';
    var m = String(name).match(/نسخة (\d{4}-\d{2}-\d{2}) (\d{2}\.\d{2}\.\d{2})/);
    var pretty = m ? (m[1] + ' — ' + m[2].replace(/\./g, ':')) : name;
    return pretty + (when ? ' (' + when + ')' : '');
  }

  function renderVersionsList(j) {
    if (!syncVersionsList) return;
    currentVersions = j.versions || [];
    if (syncVersionsHead) {
      syncVersionsHead.textContent = 'النسخ المحفوظة على الدرايف — ' +
        currentVersions.length + ' من ' + (j.max || 50) + ' (الأقدم يُحذف تلقائياً)';
    }
    if (!currentVersions.length) {
      syncVersionsList.innerHTML = '<li>لا توجد نسخ مؤرشفة بعد — اضغط «رفع نسخة الآن».</li>';
    } else {
      syncVersionsList.innerHTML = currentVersions.map(function (v, i) {
        return '<li style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<span>' + escapeHtml(versionLabel(v.name, v.modifiedTime)) +
          (v.size ? ' — ' + Math.max(1, Math.round(v.size / 1024)) + ' KB' : '') + '</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-ver-idx="' + i + '">عرض وتطبيق</button>' +
          '</li>';
      }).join('');
    }
    syncVersionsBox.hidden = false;
  }

  function loadVersions() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    if (syncVersionsHead) syncVersionsHead.textContent = 'جارٍ تحميل لائحة النسخ…';
    if (syncVersionsBox) syncVersionsBox.hidden = false;
    return fetch('/api/sync/versions', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'تعذّر جلب النسخ');
        renderVersionsList(j);
        return j;
      })
      .catch(function (e) {
        if (syncVersionsList) {
          syncVersionsList.innerHTML = '<li>' + escapeHtml('فشل التحميل: ' +
            (e && e.message ? e.message : e)) + '</li>';
        }
        return null;
      });
  }

  var syncPickBtn = $('#syncPick');
  if (syncPickBtn) syncPickBtn.addEventListener('click', loadVersions);

  var syncVersionsRefresh = $('#syncVersionsRefresh');
  if (syncVersionsRefresh) syncVersionsRefresh.addEventListener('click', loadVersions);

  var syncVersionsClose = $('#syncVersionsClose');
  if (syncVersionsClose) syncVersionsClose.addEventListener('click', function () {
    if (syncVersionsBox) syncVersionsBox.hidden = true;
  });

  /* الضغط على «عرض وتطبيق» لنسخة قديمة */
  if (syncVersionsList) {
    syncVersionsList.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-ver-idx]') : null;
      if (!b) return;
      var v = currentVersions[Number(b.getAttribute('data-ver-idx'))];
      if (!v) return;
      b.disabled = true;
      b.textContent = 'جارٍ التحميل…';
      fetch('/api/sync/version?id=' + encodeURIComponent(v.id), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          b.disabled = false;
          b.textContent = 'عرض وتطبيق';
          if (!j.ok) throw new Error(j.error || 'تعذّر قراءة النسخة');
          syncApply(j.snapshot);
          syncShowNote('اتطبّقت النسخة القديمة «' + versionLabel(v.name, v.modifiedTime) +
            '». اضغط «العودة للنسخة الحالية» ترجع لأحدث نسخة.', false);
          toast('اتطبّقت النسخة القديمة ✓');
        })
        .catch(function (e) {
          b.disabled = false;
          b.textContent = 'عرض وتطبيق';
          toast('فشل: ' + (e && e.message ? e.message : e), true);
        });
    });
  }

  /* العودة للنسخة الحالية (آخر ما على الدرايف) */
  var syncVersionsBack = $('#syncVersionsBack');
  if (syncVersionsBack) syncVersionsBack.addEventListener('click', function () {
    syncVersionsBack.disabled = true;
    syncApi('/api/sync/pull').then(function (pull) {
      syncVersionsBack.disabled = false;
      if (!pull || !pull.exists || !pull.snapshot) {
        toast('لا توجد نسخة حالية على الدرايف', true);
        return;
      }
      syncApply(pull.snapshot);
      if (syncVersionsBox) syncVersionsBox.hidden = true;
      syncShowNote('رجعت للنسخة الحالية من الدرايف.', false);
      toast('رجعت للنسخة الحالية ✓');
    }).catch(function (e) {
      syncVersionsBack.disabled = false;
      toast('فشل: ' + (e && e.message ? e.message : e), true);
    });
  });

  /* ---------- الفولدر المشترك ---------- */
  var syncFolderInput = $('#syncFolderUrl');
  var syncFolderStatus = $('#syncFolderStatus');
  var syncFolderClear = $('#syncFolderClear');

  function syncFolderShow(msg, ok) {
    if (!syncFolderStatus) return;
    syncFolderStatus.textContent = msg;
    syncFolderStatus.style.color = ok ? 'var(--ok)' : 'var(--muted)';
    syncFolderStatus.hidden = false;
  }

  function localFolderUrl() {
    try { return localStorage.getItem('app_sync_custom_folder') || ''; } catch (e) { return ''; }
  }

  function showCustomFolder(url) {
    if (syncFolderInput) syncFolderInput.value = url;
    if (syncFolderClear) syncFolderClear.hidden = false;
    syncFolderShow('الفولدر المشترك مضبوط: ' + url, true);
  }

  function showAutoFolder() {
    if (syncFolderInput) syncFolderInput.value = '';
    if (syncFolderClear) syncFolderClear.hidden = true;
    syncFolderShow('الفولدر التلقائي مضبوط — «نظام الإدارة — المزامنة»', true);
  }

  function loadSyncFolder() {
    var localUrl = localFolderUrl();
    if (typeof fetch !== 'function') {
      if (localUrl) showCustomFolder(localUrl);
      return Promise.resolve();
    }
    return fetch('/api/sync/folder', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok && j.customFolder) {
          /* الرابط المحفوظ محلياً هو الأصلي اللي المستخدم لصقه */
          showCustomFolder(localUrl || j.customFolder);
          if (!localUrl) {
            try { localStorage.setItem('app_sync_custom_folder', j.customFolder); } catch (e) {}
          }
        } else if (j.ok && localUrl) {
          /* السيرفر فاقد الرابط (لو كان الحفظ فشل) — نعيد حفظه من النسخة المحلية */
          fetch('/api/sync/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: localUrl })
          }).then(function (r2) { return r2.json(); }).then(function (jj) {
            if (jj.ok) showCustomFolder(localUrl);
            else if (j.autoFolder) showAutoFolder();
          }).catch(function () { showCustomFolder(localUrl); });
        } else if (j.ok && j.autoFolder) {
          showAutoFolder();
        }
      })
      .catch(function () {
        /* فشل الاتصال — نعرض الرابط المحلي على أي حال */
        if (localUrl) showCustomFolder(localUrl);
      });
  }
  safeRun(loadSyncFolder, 'مجلد المزامنة');

  var syncFolderSave = $('#syncFolderSave');
  if (syncFolderSave) {
    syncFolderSave.addEventListener('click', function () {
      var v = syncFolderInput ? syncFolderInput.value.trim() : '';
      if (!v) { toast('الصق رابط الفولدر أولاً', true); return; }
      syncFolderSave.disabled = true;
      fetch('/api/sync/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: v })
      }).then(function (r) { return r.json(); }).then(function (j) {
        syncFolderSave.disabled = false;
        if (j.ok) {
          /* نحفظه محلياً كمان — عشان يفضل ظاهر حتى لو قراءة السيرفر فشلت */
          try { localStorage.setItem('app_sync_custom_folder', v); } catch (e) {}
          toast('اتحفظ الفولدر المشترك ✓');
          showCustomFolder(v);
        } else {
          toast(j.error || 'فشل حفظ الفولدر', true);
          syncFolderShow(j.error || 'فشل الحفظ', false);
        }
      }).catch(function (e) {
        syncFolderSave.disabled = false;
        toast('خطأ في الاتصال', true);
      });
    });
  }

  if (syncFolderClear) {
    syncFolderClear.addEventListener('click', function () {
      fetch('/api/sync/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: '' })
      }).then(function (r) { return r.json(); }).then(function (j) {
        try { localStorage.removeItem('app_sync_custom_folder'); } catch (e) {}
        if (syncFolderInput) syncFolderInput.value = '';
        syncFolderClear.hidden = true;
        syncFolderShow('اترجع للفولدر التلقائي', true);
        toast('اتحذف الفولدر المشترك');
      }).catch(function () { toast('خطأ في الاتصال', true); });
    });
  }

  function syncAutoMode() {
    try { return localStorage.getItem('app_sync_auto_mode') || 'interval'; } catch (e) { return 'interval'; }
  }
  function setSyncAutoMode(v) {
    try { localStorage.setItem('app_sync_auto_mode', String(v || 'interval')); } catch (e) {}
  }
  function syncAutoHours() {
    try {
      var h = parseInt(localStorage.getItem('app_sync_auto_hours'), 10);
      return (h >= 1 && h <= 24) ? h : 1;
    } catch (e) { return 1; }
  }
  function setSyncAutoHours(h) {
    try { localStorage.setItem('app_sync_auto_hours', String(h)); } catch (e) {}
  }

  /* بصمة بسيطة للبيانات — تتغير مع أي تعديل داخلي */
  function dataFingerprint() {
    var parts = [];
    SYNC_KEYS.forEach(function (k) {
      var v = '';
      try { v = localStorage.getItem(k) || ''; } catch (e) {}
      parts.push(k + ':' + v.length);
    });
    return parts.join('|');
  }
  function lastPushedFingerprint() {
    try { return localStorage.getItem('app_sync_fp') || ''; } catch (e) { return ''; }
  }
  function savePushedFingerprint() {
    try { localStorage.setItem('app_sync_fp', dataFingerprint()); } catch (e) {}
  }

  function startSyncTimers() {
    if (typeof setInterval !== 'function') return;
    /* فحص الدرايف يبقى كل ١٠ دقائق مهما كان النمط */
    if (!syncTimerCheck) syncTimerCheck = setInterval(function () { syncCheck(true); },
      isViewerMode() ? 60 * 1000 : SYNC_CHECK_MS);
    /* إعادة بناء مؤقت الرفع حسب النمط المختار */
    if (syncTimerPush) { clearInterval(syncTimerPush); syncTimerPush = null; }
    var mode = syncAutoMode();
    if (mode === 'off') return;
    if (mode === 'interval') {
      syncTimerPush = setInterval(function () { syncPush(true); }, Math.max(1, syncAutoHours()) * 60 * 60 * 1000);
    } else if (mode === 'change') {
      /* كل دقيقتين: لو البيانات اتغيرت عن آخر رفع — ارفع */
      syncTimerPush = setInterval(function () {
        if (dataFingerprint() !== lastPushedFingerprint()) syncPush(true);
      }, 2 * 60 * 1000);
    } else if (mode === 'daily') {
      /* كل ٥ دقائق: أول تحقق بعد منتصف الليل يرفع مرة واحدة */
      syncTimerPush = setInterval(function () {
        var today = new Date().toDateString();
        var lastDay = '';
        try { lastDay = localStorage.getItem('app_sync_lastday') || ''; } catch (e) {}
        if (today !== lastDay && dataFingerprint() !== lastPushedFingerprint()) {
          syncPush(true).then(function (r) {
            if (r) { try { localStorage.setItem('app_sync_lastday', today); } catch (e) {} }
          });
        }
      }, 5 * 60 * 1000);
    }
  }

  /* واجهة إعداد الرفع التلقائي */
  var syncAutoSel = $('#syncAutoMode');
  var syncAutoHoursField = $('#syncAutoHoursField');
  var syncAutoHoursInput = $('#syncAutoHours');
  if (syncAutoSel) {
    syncAutoSel.value = syncAutoMode();
    if (syncAutoHoursField) syncAutoHoursField.hidden = (syncAutoSel.value !== 'interval');
    if (syncAutoHoursInput) syncAutoHoursInput.value = syncAutoHours();
    syncAutoSel.addEventListener('change', function () {
      setSyncAutoMode(this.value);
      if (syncAutoHoursField) syncAutoHoursField.hidden = (this.value !== 'interval');
      startSyncTimers();
      var labels = {
        interval: 'الرفع التلقائي: كل ' + syncAutoHours() + ' ساعة',
        change: 'الرفع التلقائي: عند أي تعديل',
        daily: 'الرفع التلقائي: نهاية كل يوم',
        off: 'الرفع التلقائي: متوقف'
      };
      toast(labels[this.value] || 'تم الحفظ');
    });
  }
  if (syncAutoHoursInput) {
    syncAutoHoursInput.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!(v >= 1 && v <= 24)) { v = 1; this.value = 1; }
      setSyncAutoHours(v);
      startSyncTimers();
      toast('الرفع التلقائي كل ' + v + ' ساعة');
    });
  }

/* ============================================================
     الشبكة المربوطة — كل الخصائص مترابطة بدون تكرار
     القاعدة: كل عملية تُسجَّل مرّة واحدة وتُنسب إلى صنف واحد فقط،
     والتوريد غير نقدي فلا يدخل «المبلغ الخارج» أبداً.
     ============================================================ */
  var KEY_NETWORK = 'app_network';

  function isNetworkOn() {
    try {
      var v = localStorage.getItem(KEY_NETWORK);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  }
  function setNetworkOn(on) { try { localStorage.setItem(KEY_NETWORK, on ? '1' : '0'); } catch (e) {} }

  var PARTY_LABELS = { customer: 'عميل', supplier: 'مورد', partner: 'شريك', general: 'عام' };

  /* تحديد نوع الطرف من اسمه مقابل قوائم العملاء والموردين والشركاء */
  function partyOfName(name) {
    name = String(name || '').trim();
    if (!name) return { type: 'general', name: '' };
    if (getCustomers().some(function (c) { return String(c.name || '').trim() === name; })) return { type: 'customer', name: name };
    if (getSuppliers().some(function (s) { return String(s.name || '').trim() === name; })) return { type: 'supplier', name: name };
    if (getPartners().some(function (p) { return String(p.name || '').trim() === name; })) return { type: 'partner', name: name };
    return { type: 'general', name: name };
  }

  function readLedgerParty() {
    var tEl = $('#ledgerPartyType'), nEl = $('#ledgerPartyName');
    var type = tEl ? tEl.value : '';
    var name = nEl ? String(nEl.value || '').trim() : '';
    if (!type && !name) return null;
    if (name && !type) type = partyOfName(name).type;
    return { type: type || 'general', name: name };
  }

  /* شارة الطرف داخل خلية البيان في جدول الدواخل والخوارج */
  function partyChip(t) {
    var p = t && t.party;
    if (!p || (!p.name && !p.type)) return '';
    var lbl;
    if (p.name && p.type && PARTY_LABELS[p.type]) lbl = PARTY_LABELS[p.type] + ': ' + p.name;
    else if (p.name) lbl = p.name;
    else lbl = PARTY_LABELS[p.type] || '';
    if (!lbl) return '';
    return ' <span class="party-chip">' + esc(lbl) + '</span>';
  }

  /* تعبئة قوائم الاقتراح بالأسماء حسب النوع المختار */
  function fillPartyLists() {
    var ld = $('#ledgerPartyNames');
    if (ld) {
      var type = $('#ledgerPartyType') ? $('#ledgerPartyType').value : '';
      var names = [];
      if (!type || type === 'customer') names = names.concat(getCustomers().map(function (c) { return c.name; }));
      if (!type || type === 'supplier') names = names.concat(getSuppliers().map(function (s) { return s.name; }));
      if (!type || type === 'partner') names = names.concat(getPartners().map(function (p) { return p.name; }));
      ld.innerHTML = names.filter(Boolean).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
    }
    var ln = $('#linkedNames');
    if (ln) {
      ln.innerHTML = getCustomers().map(function (c) { return '<option value="' + esc(c.name) + '"></option>'; }).join('');
    }
  }

  /* ---------- تجميع العمليات: كل سجل مرة واحدة فقط ---------- */
  function collectOps() {
    var ops = [];

    /* 1) الدواخل والخوارج — نقد */
    getLedger().forEach(function (t, i) {
      var out = t.type === 'out';
      var p = (t.party && (t.party.name || t.party.type)) ? t.party : null;
      ops.push({
        key: 'led:' + i, src: 'الدواخل والخوارج',
        kind: out ? 'out' : 'in', cash: true, dir: out ? 'out' : 'in',
        partyType: (p && p.type) || 'general', partyName: (p && p.name) || '',
        amount: Number(t.amount || 0), date: t.date || '', desc: t.desc || ''
      });
    });

    /* 2) الموردون — الوارد توريد (غير نقدي) والمدفوع نقد خارج */
    getSuppliers().forEach(function (s, si) {
      (s.tx || []).forEach(function (t, ti) {
        var inc = Number(t.incoming || 0);
        if (inc > 0) {
          var to = t.to ? partyOfName(t.to) : null;
          ops.push({
            key: 'sup:' + si + ':' + ti + ':in', src: 'الموردون',
            kind: 'supply', cash: false, dir: 'none',
            partyType: 'supplier', partyName: s.name || '',
            toType: to ? to.type : '', toName: to ? to.name : '',
            amount: inc, date: t.date || '', desc: t.desc || ''
          });
        }
        var pd = Number(t.paid || 0);
        if (pd > 0) {
          ops.push({
            key: 'sup:' + si + ':' + ti + ':paid', src: 'الموردون',
            kind: 'payment', cash: true, dir: 'out',
            partyType: 'supplier', partyName: s.name || '',
            amount: pd, date: t.date || '', desc: t.desc || ''
          });
        }
      });
    });

    /* 3) العملاء — المدفوع منا نقد خارج، المرسل غير نقدي، المقدم والتحصيل نقد داخل */
    getCustomers().forEach(function (c, ci) {
      var adv = Number(c.paidByUs || 0);
      if (adv > 0) {
        ops.push({ key: 'cus:' + ci + ':adv', src: 'العملاء', kind: 'advance', cash: true, dir: 'out',
          partyType: 'customer', partyName: c.name || '', amount: adv, date: '',
          desc: 'المبلغ المدفوع منا نحن للعميل' });
      }
      (c.sends || []).forEach(function (s, k) {
        var amt = Number(s.total != null ? s.total : (Number(s.qty || 0) * Number(s.price || 0)));
        if (amt > 0) {
          ops.push({ key: 'cus:' + ci + ':snd:' + k, src: 'العملاء', kind: 'supply', cash: false, dir: 'none',
            partyType: 'customer', partyName: c.name || '', amount: amt, date: s.date || '',
            desc: s.desc || 'مرسل من موارد' });
        }
      });
      var down = Number(c.down || 0);
      if (down > 0) {
        ops.push({ key: 'cus:' + ci + ':down', src: 'العملاء', kind: 'collection', cash: true, dir: 'in',
          partyType: 'customer', partyName: c.name || '', amount: down, date: '', desc: 'مقدم مدفوع من العميل' });
      }
      (c.payments || []).forEach(function (p, k) {
        var amt = Number(p.amount || 0);
        if (amt > 0) {
          ops.push({ key: 'cus:' + ci + ':pay:' + k, src: 'التحصيل', kind: 'collection', cash: true, dir: 'in',
            partyType: 'customer', partyName: c.name || '', amount: amt, date: p.date || '',
            desc: 'تحصيل من العميل' });
        }
      });
    });

    /* 4) الشركاء — الأرباح المستلمة والمسحوبات نقد خارج */
    getPartners().forEach(function (p, pi) {
      (p.profits || []).forEach(function (f, k) {
        var amt = Number(f.amount || 0);
        if (amt > 0) {
          ops.push({ key: 'prt:' + pi + ':prof:' + k, src: 'الشركاء', kind: 'profit', cash: true, dir: 'out',
            partyType: 'partner', partyName: p.name || '', amount: amt, date: f.date || '', desc: 'ربح مستلم' });
        }
      });
      var w = Number(p.withdrawals || 0);
      if (w > 0) {
        ops.push({ key: 'prt:' + pi + ':wd', src: 'الشركاء', kind: 'withdraw', cash: true, dir: 'out',
          partyType: 'partner', partyName: p.name || '', amount: w, date: '', desc: 'مسحوبات الشريك' });
      }
    });

    return ops;
  }

  /* تجنّب احتساب التوريد مرتين: وُرّد عند المورد لعميل وأُعيد تسجيله عند العميل */
  function markSupplyDuplicates(ops) {
    var seen = Object.create(null);
    ops.forEach(function (o) {
      if (o.kind === 'supply' && o.partyType === 'supplier' && o.toName) {
        seen['s|' + o.toName + '|' + o.date + '|' + o.amount] = true;
      }
    });
    var dup = 0;
    ops.forEach(function (o) {
      if (o.kind !== 'supply' || o.partyType !== 'customer') return;
      if (seen['s|' + o.partyName + '|' + o.date + '|' + o.amount]) { o.dup = true; dup++; }
    });
    return dup;
  }

  /* الصنف = مكان العملية. كل عملية تنتمي لصنف واحد حصراً فلا تتكرر */
  function bucketOf(o) {
    if (!o.cash) return null;
    if (o.dir === 'out') {
      if (o.partyType === 'customer') return 'outCustomer';
      if (o.partyType === 'supplier') return 'outSupplier';
      if (o.partyType === 'partner') return 'outPartner';
      return 'outGeneral';
    }
    if (o.dir === 'in') return o.partyType === 'customer' ? 'inCustomer' : 'inGeneral';
    return null;
  }

  function detailsTotals() {
    var ops = collectOps();
    var dupSupply = markSupplyDuplicates(ops);
    var t = {
      outCustomer: 0, outSupplier: 0, outPartner: 0, outGeneral: 0,
      nOutCustomer: 0, nOutSupplier: 0, nOutPartner: 0, nOutGeneral: 0,
      inCustomer: 0, inGeneral: 0, nInCustomer: 0, nInGeneral: 0,
      supply: 0, supplyCount: 0, dupSupply: dupSupply
    };
    ops.forEach(function (o) {
      if (o.kind === 'supply') {
        if (!o.dup) { t.supply += o.amount; t.supplyCount++; }
        return;
      }
      var b = bucketOf(o);
      if (!b) return;
      t[b] += o.amount;
      var nc = 'n' + b.charAt(0).toUpperCase() + b.slice(1);
      t[nc] = (t[nc] || 0) + 1;
    });
    t.outTotal = t.outCustomer + t.outSupplier + t.outPartner + t.outGeneral;
    t.nOut = t.nOutCustomer + t.nOutSupplier + t.nOutPartner + t.nOutGeneral;
    t.inTotal = t.inCustomer + t.inGeneral;
    t.nIn = t.nInCustomer + t.nInGeneral;

    t.capital = 0; t.profitReceived = 0;
    getPartners().forEach(function (p) {
      t.capital += Number(p.capital || 0);
      (p.profits || []).forEach(function (f) { t.profitReceived += Number(f.amount || 0); });
    });

    var paidByUs = 0, owedToUs = 0;
    getCustomers().forEach(function (c) {
      var d = derive(c);
      paidByUs += d.paidByUs;
      owedToUs += d.rest;
    });
    t.paidByUs = paidByUs;
    t.owedToUs = owedToUs;
    t.profit = paidByUs - owedToUs;
    return t;
  }

  /* ---------- عرض جدول عمليات ---------- */
  function opsTable(list) {
    if (!list.length) return '';
    var rows = list.map(function (o, i) {
      var src = o.src;
      if (o.kind === 'supply' && o.partyType === 'supplier') {
        src = 'المورد: ' + (o.partyName || '—') + (o.toName ? ' ← العميل: ' + o.toName : '');
      }
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(o.date ? formatDate(o.date) : '—') + '</td>' +
        '<td>' + esc(o.desc || '—') + '</td>' +
        '<td>' + esc(src) + '</td>' +
        '<td class="amount ' + (o.dir === 'in' ? 'pos' : (o.dir === 'out' ? 'neg' : '')) + '">' +
          (o.dir === 'in' ? '+ ' : (o.dir === 'out' ? '- ' : '')) + money(o.amount) + '</td>' +
        '<td>' + (o.cash ? 'نقدي' : 'غير نقدي') + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>#</th><th>التاريخ</th><th>البيان</th><th>المصدر</th><th>المبلغ</th><th>النوع</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function dBox(label, value, cls, raw) {
    return '<div class="summary__box ' + (cls || '') + '"><small>' + label + '</small><b>' +
      (raw ? value : money(value)) + '</b></div>';
  }

  /* ---------- شاشة التفاصيل ---------- */
  function renderDetails() {
    var on = isNetworkOn();
    var pill = $('#networkPill');
    if (pill) {
      pill.textContent = on ? 'الشبكة: مفعّلة' : 'الشبكة: متوقفة';
      pill.className = 'count-pill ' + (on ? 'count-pill--ok' : 'count-pill--warn');
    }
    var note = $('#detailsNote'), body = $('#detailsBody');
    if (!body) return;

    if (!on) {
      if (note) {
        note.hidden = false;
        note.innerHTML = '<b>الشبكة المربوطة متوقفة.</b><br />' +
          'فعّلها من الإعدادات ← «جعل التطبيق شبكة مربوطة» لعرض الإجماليات المرتبطة وربط البروفايلات ببعضها.' +
          '<div class="form__actions" style="margin-top:12px"><button type="button" class="btn btn--primary btn--sm" data-go="settings">فتح الإعدادات</button></div>';
      }
      body.innerHTML = '';
      return;
    }

    var t = detailsTotals();
    if (note) {
      note.hidden = false;
      note.innerHTML = '<b>قاعدة عدم التكرار:</b> كل عملية تُسجَّل مرّة واحدة وتُنسب إلى صنف واحد فقط ' +
        '(عملاء / موردون / شركاء / عام)، والتوريد <b>غير نقدي</b> فلا يدخل «المبلغ الخارج». ' +
        'بهذا يكون الإجمالي العام = مجموع الأصناف بالضبط.';
    }

    var h = '';

    /* النقد الخارجي */
    h += '<div class="panel"><h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-exchange"/></svg> المدفوع منا — مفصّل حسب الصنف</h3>' +
      '<div class="summary summary--4">' +
        dBox('المبلغ المستثمر (رأس المال)', t.capital, 'summary__box--net') +
        dBox('المدفوع للعملاء منا نحن', t.outCustomer, 'summary__box--out') +
        dBox('المدفوع للموردين', t.outSupplier, 'summary__box--out') +
        dBox('المدفوع للشركاء (ربح + مسحوبات)', t.outPartner, 'summary__box--out') +
      '</div>' +
      '<div class="summary">' +
        dBox('الخارج العام (إيجار، رواتب…)', t.outGeneral, 'summary__box--out') +
        dBox('إجمالي المبلغ الخارج (نقدي)', t.outTotal, 'summary__box--net') +
        dBox('إجمالي المبلغ الداخل (نقدي)', t.inTotal, 'summary__box--in') +
      '</div>' +
      '<p class="panel__note">' + t.nOut + ' عملية صادرة مرّة واحدة فقط — المجموع العام = مجموع الأصناف الأربعة.</p>' +
      '</div>';

    /* غير النقدي */
    h += '<div class="panel"><h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-truck"/></svg> التوريدات (غير نقدية) — لا تُجمع مع المبلغ الخارج</h3>' +
      '<div class="summary">' +
        dBox('إجمالي التوريدات والمرسلات', t.supply, 'summary__box--in') +
        dBox('عدد عمليات التوريد', t.supplyCount, '', true) +
        dBox('عمليات مكرّرة أُستبعدت', t.dupSupply, '', true) +
      '</div>' +
      (t.dupSupply > 0
        ? '<p class="panel__note">وجدنا ' + t.dupSupply + ' عملية وردت عند المورد وعند العميل بنفس التاريخ والمبلغ — احتُسبت مرّة واحدة فقط.</p>'
        : '<p class="panel__note">الوارد من الموردين لا يُحسب نقداً: هو التزام يظهر في البروفايلات ويُخصم من أرصدة العملاء، ولا يدخل «المبلغ الخارج» إلا عند الدفع الفعلي.</p>') +
      '</div>';

    /* الأرباح */
    h += '<div class="panel"><h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-coins"/></svg> الأرباح</h3>' +
      '<div class="summary summary--4">' +
        dBox('المبلغ المدفوع منا للعملاء', t.paidByUs, 'summary__box--out') +
        dBox('المطلوب دفعه لنا من العملاء', t.owedToUs, 'summary__box--in') +
        dBox('إجمالي الأرباح (المدفوع منا − المطلوب لينا)', t.profit, 'summary__box--net') +
        dBox('إجمالي الأرباح المستلمة من الشركاء', t.profitReceived, 'summary__box--in') +
      '</div></div>';

    /* جدول الأصناف */
    var rows = [
      ['مدفوع للعملاء منا نحن', 'العملاء + الدواخل المرتبطة', t.nOutCustomer, t.outCustomer],
      ['مدفوع للموردين', 'الموردون + الدواخل المرتبطة', t.nOutSupplier, t.outSupplier],
      ['مدفوع للشركاء', 'أرباح مستلمة + مسحوبات', t.nOutPartner, t.outPartner],
      ['خارج عام', 'الدواخل والخوارج', t.nOutGeneral, t.outGeneral],
      ['داخل من العملاء', 'مقدم + تحصيل', t.nInCustomer, t.inCustomer],
      ['داخل عام', 'الدواخل والخوارج', t.nInGeneral, t.inGeneral],
      ['توريدات (غير نقدي)', 'الموردون + المرسل من موارد', t.supplyCount, t.supply]
    ].map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td class="amount">' + money(r[3]) + '</td></tr>';
    }).join('');

    h += '<div class="panel"><h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-save"/></svg> تفصيل الأصناف ومصادرها</h3>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>الصنف</th><th>المصدر</th><th>عدد العمليات</th><th>المبلغ</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="panel__note">الصنف الأول حتى الرابع يشكّل «المبلغ الخارج»، والخامس والسادس يشكّلان «المبلغ الداخل»، والسابع خارج الحساب النقدي.</p></div>';

    body.innerHTML = h;
  }

  /* ---------- مفتاح الشبكة في الإعدادات ---------- */
  function renderNetworkToggle() {
    var el = $('#networkToggle');
    if (!el) return;
    el.checked = isNetworkOn();
    var st = $('#networkState');
    if (st) {
      st.textContent = el.checked
        ? 'مفعّلة — العمليات تُربط وتظهر عند كل الأطراف المعنية بدون تكرار'
        : 'متوقفة — كل قسم يعمل بشكل مستقل';
    }
    el.onchange = function () {
      setNetworkOn(el.checked);
      renderNetworkToggle();
      toast(el.checked ? 'تم تفعيل الشبكة المربوطة ✓' : 'تم إيقاف الشبكة المربوطة');
    };
  }

  /* ---------- ربط بروفايل العميل ---------- */
  function renderProfileLinks() {
    var panel = $('#linkPanel'), body = $('#linkBody');
    if (!panel || !body) return;
    var c = getCustomers()[currentIdx];
    var name = c ? String(c.name || '').trim() : '';
    if (!c || !name || !isNetworkOn()) { panel.hidden = true; body.innerHTML = ''; return; }
    panel.hidden = false;

    var ops = collectOps();
    var supplies = ops.filter(function (o) {
      return o.kind === 'supply' && o.partyType === 'supplier' && o.toName === name;
    });
    var led = ops.filter(function (o) {
      return o.src === 'الدواخل والخوارج' && o.partyType === 'customer' && o.partyName === name;
    });

    var h = '<h4 class="link-sub">توريدات وردت لك من الموردين</h4>';
    h += supplies.length
      ? opsTable(supplies)
      : '<p class="panel__hint">لا توجد توريدات موردين مربوطة بهذا العميل. سجّلها من كشف حساب المورد ← حقل «ورّد إلى» واكتب اسمه.</p>';
    h += '<h4 class="link-sub">حركة الدواخل والخوارج المرتبطة</h4>';
    h += led.length
      ? opsTable(led)
      : '<p class="panel__hint">لا توجد حركات مرتبطة. اختر «الطرف = عميل» واكتب اسمه من قسم الدواخل والخوارج.</p>';
    body.innerHTML = h;
  }

  /* ---------- بروفايل الشريك ---------- */
  var currentPartnerIdx = -1;

  function renderPartnerProfile() {
    var p = getPartners()[currentPartnerIdx];
    if (!p) { showView('partners'); return; }
    var d = derivePartner(p);
    var profits = p.profits || [];
    var profitSum = 0;
    profits.forEach(function (f) { profitSum += Number(f.amount || 0); });

    var title = $('#pfpTitle'); if (title) title.textContent = p.name || 'شريك';
    var sub = $('#pfpSub'); if (sub) sub.textContent = (p.role || 'شريك') + (p.note ? ' • ' + p.note : '');
    var role = $('#pfpRole');
    if (role) role.textContent = (p.share != null && p.share !== '') ? ('الحصة ' + money(p.share) + '%') : 'بدون نسبة محددة';

    var sum = $('#pfpSummary');
    if (sum) {
      sum.innerHTML =
        '<div class="summary-top">' +
          '<div><h3>ملخص حساب الشريك</h3><p>' + esc(p.name || '') + ' — ' + profits.length + ' عملية ربح مسجّلة</p></div>' +
          '<div class="stat"><b>' + money(profitSum) + '</b><small>إجمالي أرباحه المستلمة</small></div>' +
        '</div>' +
        '<div class="summary summary--4">' +
          '<div class="summary__box summary__box--net"><small>رأس المال (المستثمر)</small><b>' + money(d.capital) + '</b></div>' +
          '<div class="summary__box summary__box--in"><small>إجمالي الأرباح المضافة</small><b>' + money(profitSum) + '</b></div>' +
          '<div class="summary__box summary__box--out"><small>المسحوبات</small><b>' + money(d.withdrawals) + '</b></div>' +
          '<div class="summary__box summary__box--net"><small>الصافي المستحق (بالحصة)</small><b>' + money(d.net) + '</b></div>' +
        '</div>';
    }

    var rows = '';
    profits.forEach(function (f, i) {
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(f.date)) + '</td>' +
        '<td class="amount pos">' + money(f.amount) + '</td>' +
        '<td>' + (f.note ? esc(f.note) : '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-profit="' + i + '">حذف</button></td>' +
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">لا توجد أرباح مسجّلة لهذا الشريك بعد — أضف أول ربح من النموذج أعلاه.</td></tr>';
    }
    var tb = $('#pfpTable tbody'); if (tb) tb.innerHTML = rows;

    var links = $('#pfpLinks');
    if (links) {
      var ops = collectOps().filter(function (o) {
        return o.partyType === 'partner' && o.partyName === String(p.name || '').trim();
      });
      var pLed = partyLedger('partner', p.name);
      var ledNote = '<p class="panel__note">حركات «الدواخل والخوارج» المرتبطة بهذا الشريك: داخل ' +
        money(pLed.in) + ' — خارج ' + money(pLed.out) + '</p>';
      links.innerHTML = ledNote + (ops.length
        ? opsTable(ops)
        : '<p class="panel__hint">لا توجد حركات نقدية مرتبطة بهذا الشريك — سجّل أرباحه من النموذج أعلاه أو اختره «الطرف» في الدواخل والخوارج.</p>');
    }

    var f = $('#pfpForm');
    if (f) {
      f.elements.date.value = todayISO();
      f.elements.amount.value = '';
      f.elements.note.value = '';
      var er = $('#pfpError'); if (er) er.hidden = true;
    }
  }

  function partnerProfileReport(p) {
    var d = derivePartner(p);
    var profits = p.profits || [];
    var profitSum = 0;
    profits.forEach(function (f) { profitSum += Number(f.amount || 0); });
    var base = [
      ['اسم الشريك', p.name || ''],
      ['الصفة', p.role || ''],
      ['الحصة %', d.share],
      ['رأس المال (المستثمر)', d.capital],
      ['نصيبه من أرباح السنة', d.cut],
      ['المسحوبات', d.withdrawals],
      ['الصافي المستحق', d.net],
      ['أرباح مسجّلة يدوياً', profitSum],
      ['ملاحظات', p.note || '']
    ];
    base.push(['', '']);
    base.push(['سجل الأرباح (التاريخ — المبلغ)', '']);
    profits.forEach(function (f) { base.push([formatDate(f.date), Number(f.amount || 0)]); });
    return {
      title: 'بروفايل شريك: ' + (p.name || ''),
      subtitle: (p.role || 'شريك') + ' — صافي أرباح السنة ' + money(getPartnerProfit()),
      columns: ['البند', 'القيمة'],
      moneyCols: [1],
      totalRow: false,
      rows: base,
      summary: [
        { label: 'رأس المال', value: money(d.capital) },
        { label: 'الحصة', value: money(d.share) + '%' },
        { label: 'المسحوبات', value: money(d.withdrawals) },
        { label: 'الصافي المستحق', value: money(d.net) }
      ]
    };
  }

  function partnerProfileSheets(p) {
    var d = derivePartner(p);
    var profits = p.profits || [];
    var profitSum = 0;
    profits.forEach(function (f) { profitSum += Number(f.amount || 0); });
    var info = [
      ['البيان', 'القيمة'],
      ['اسم الشريك', p.name || ''],
      ['الصفة', p.role || ''],
      ['الحصة %', d.share],
      ['ملاحظات', p.note || '']
    ];
    var moneyRows = [
      ['البند', 'المبلغ'],
      ['رأس المال (المستثمر)', d.capital],
      ['صافي أرباح السنة (الشركة)', getPartnerProfit()],
      ['نصيبه من الأرباح', d.cut],
      ['أرباح مسجّلة يدوياً', profitSum],
      ['المسحوبات', d.withdrawals],
      ['الصافي المستحق', d.net]
    ];
    var prof = [['التاريخ', 'الربح', 'ملاحظة']];
    profits.forEach(function (f) {
      prof.push([formatDate(f.date), Number(f.amount || 0), f.note || '']);
    });
    return [
      { name: 'البيانات', title: 'بيانات الشريك', subtitle: p.name || '', rows: info, widths: [34, 46] },
      { name: 'الملخص المالي', title: 'الملخص المالي', subtitle: p.name || '', rows: moneyRows, widths: [44, 24], moneyCols: [1], totalRow: false },
      { name: 'الأرباح', title: 'سجل الأرباح', subtitle: p.name || '', rows: prof, widths: [22, 22, 40], moneyCols: [1], totalRow: false }
    ];
  }

  var pfpExcelBtn = $('#pfpExcelBtn');
  if (pfpExcelBtn) pfpExcelBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) { toast('الشريك غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      var bytes = ExportKit.buildXlsx(partnerProfileSheets(p));
      openExportModal('partner-' + safeFileName(p.name) + '-' + exportStamp() + '.xlsx', MIME_XLSX, bytes);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var pfpPdfBtn = $('#pfpPdfBtn');
  if (pfpPdfBtn) pfpPdfBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) { toast('الشريك غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    if (!ExportKit.hasCanvas()) { toast('تصدير PDF يحتاج متصفحاً حقيقياً', true); return; }
    try {
      var pdf = ExportKit.reportToPdf(partnerProfileReport(p));
      if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
      openExportModal('partner-' + safeFileName(p.name) + '-' + exportStamp() + '.pdf', MIME_PDF, pdf);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var pfpEditBtn = $('#pfpEditBtn');
  if (pfpEditBtn) pfpEditBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) return;
    openConfirm({
      title: 'تعديل بيانات الشريك',
      message: 'هل أنت متأكد من أنك تريد تعديل بيانات الشريك «' + (p.name || '') + '»؟',
      yes: 'نعم، تعديل', no: 'تراجع',
      onYes: function () {
        startEditPartner(currentPartnerIdx);
        showView('partners');
      }
    });
  });

  var pfpDeleteBtn = $('#pfpDeleteBtn');
  if (pfpDeleteBtn) pfpDeleteBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) return;
    openConfirm({
      title: 'حذف الشريك',
      message: 'هل تريد حذف الشريك «' + (p.name || '') + '»؟ الحذف نهائي — سيُطلب كلمة المرور.',
      yes: 'نعم، حذف نهائي', no: 'تراجع', password: true,
      onYes: function () {
        var list = getPartners();
        var target = list[currentPartnerIdx];
        if (!target) { toast('الشريك غير موجود', true); return; }
        var name = target.name || '';
        list.splice(currentPartnerIdx, 1);
        savePartners(list);
        renderPartners();
        showView('partners');
        toast('تم حذف الشريك «' + name + '»');
      }
    });
  });

  var pfpForm = $('#pfpForm');
  if (pfpForm) {
    pfpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#pfpError');
      var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
      var date = pfpForm.elements.date.value;
      var amt = parseFloat(pfpForm.elements.amount.value);
      var note = String(pfpForm.elements.note.value || '').trim();
      if (!date) return fail('الرجاء إدخال التاريخ');
      if (!(amt > 0)) return fail('أدخل مبلغاً صحيحاً أكبر من صفر');
      if (err) err.hidden = true;

      var list = getPartners();
      var p = list[currentPartnerIdx];
      if (!p) return;
      if (!p.profits) p.profits = [];
      p.profits.push({ date: date, amount: amt, note: note });
      p.profits.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      savePartners(list);
      renderPartnerProfile();
      toast('تمت إضافة ربح ' + money(amt) + ' للشريك «' + (p.name || '') + '» ✓');
    });
    pfpForm.addEventListener('input', function () {
      var er = $('#pfpError'); if (er) er.hidden = true;
    });
  }

  /* فتح البروفايل وحذف الأرباح */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var dp = t.closest('[data-del-profit]');
    if (dp) {
      var i = Number(dp.getAttribute('data-del-profit'));
      var list = getPartners();
      var p = list[currentPartnerIdx];
      if (!p || !p.profits || !p.profits[i]) return;
      p.profits.splice(i, 1);
      savePartners(list);
      renderPartnerProfile();
      toast('تم حذف عملية الربح');
      return;
    }

    var bp = t.closest('[data-partner-profile]');
    if (bp) {
      currentPartnerIdx = Number(bp.getAttribute('data-partner-profile'));
      navigate('partner-profile');
    }
  });

  /* ---------- بروفايل عضو الجمعية ---------- */
  var currentMemberIdx = -1;

  function memberProfileReport(m) {
    var a = assocByName(m.assoc);
    var d = deriveMember(m);
    var order = memberOrderByIdx(currentMemberIdx);
    var turn = memberTurnMonth(currentMemberIdx);
    var pot = a ? assocPot(a) : 0;
    var M = a ? assocMonths(a) : 0;
    var base = [
        ['اسم العضو', m.name || ''],
        ['الجمعية', m.assoc || ''],
        ['نوع الاشتراك', m.type || ''],
        ['رقم الدور', order + 1],
        ['موعد قبضه', turn ? monthLabel(turn) : '—'],
        ['قيمة السهم (يدفع كل شهر)', d.fee],
        ['الحصيلة اللي هيقبضها', pot],
        ['إجمالي اللي يدفعه في الدورة', d.fee * M],
        ['مدّة الدورة', a ? cycleText(a) : '—'],
        ['يوم القبض', a ? 'يوم ' + assocPayoutDay(a) + ' من كل شهر' : '—'],
        ['المدفوع', d.paid],
        ['المتبقي', d.rest],
        ['الحالة', d.status],
        ['ملاحظات', m.note || '']
    ];
    base.push(['', '']);
    base.push(['سجل الدفعات (الشهر — المبلغ — التاريخ)', '']);
    (m.payments || []).forEach(function (p) {
      base.push([monthLabel(p.month), Number(p.amount || 0)]);
    });
    return {
      title: 'بروفايل عضو الجمعية: ' + (m.name || ''),
      subtitle: (m.assoc || '') + ' — دوره رقم ' + (order + 1),
      columns: ['البند', 'القيمة'],
      moneyCols: [1],
      totalRow: false,
      rows: base,
      summary: [
        { label: 'قيمة السهم', value: money(d.fee) },
        { label: 'الحصيلة اللي يقبضها', value: money(pot) },
        { label: 'المدفوع', value: money(d.paid) },
        { label: 'المتبقي', value: money(d.rest) }
      ]
    };
  }

  function memberProfileSheets(m) {
    var a = assocByName(m.assoc);
    var d = deriveMember(m);
    var order = memberOrderByIdx(currentMemberIdx);
    var turn = memberTurnMonth(currentMemberIdx);
    var pot = a ? assocPot(a) : 0;
    var M = a ? assocMonths(a) : 0;
    var info = [
      ['البيان', 'القيمة'],
      ['اسم العضو', m.name || ''],
      ['الجمعية', m.assoc || ''],
      ['نوع الاشتراك', m.type || ''],
      ['رقم الدور', order + 1],
      ['موعد قبضه', turn ? monthLabel(turn) : '—'],
      ['يوم القبض', a ? 'يوم ' + assocPayoutDay(a) + ' من كل شهر' : '—'],
      ['أول شهر في الدورة', a ? monthLabel(assocStart(a)) : '—'],
      ['مدّة الدورة', a ? cycleText(a) : '—'],
      ['ملاحظات', m.note || '']
    ];
    var moneyRows = [
      ['البند', 'المبلغ'],
      ['قيمة السهم (يدفع كل شهر)', d.fee],
      ['الحصيلة الشهرية للجمعية (هيقبضها)', pot],
      ['إجمالي اللي يدفعه في الدورة', d.fee * M],
      ['المدفوع', d.paid],
      ['المتبقي', d.rest]
    ];
    var pays = [['الشهر', 'المبلغ', 'التاريخ', 'ملاحظة']];
    (m.payments || []).forEach(function (p) {
      pays.push([monthLabel(p.month), Number(p.amount || 0), formatDate(p.date), p.note || '']);
    });
    var sched = [['#', 'الشهر', 'القبّاض', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة']];
    if (a) {
      for (var k = 0; k < M; k++) {
        var key = shiftMonth(assocStart(a), k);
        var col = collectorAt(a, k);
        var paid = paidInMonth(m, key);
        sched.push([k + 1, monthLabel(key), col ? (col.name || '—') : '—',
          d.fee, paid, Math.max(d.fee - paid, 0), statusInMonth(m, key, d.fee)]);
      }
    }
    return [
      { name: 'البيانات', title: 'بيانات العضو', subtitle: m.name || '', rows: info, widths: [38, 46] },
      { name: 'الملخص المالي', title: 'الملخص المالي', subtitle: m.name || '', rows: moneyRows, widths: [44, 24], moneyCols: [1], totalRow: false },
      { name: 'الدفعات', title: 'سجل الدفعات', subtitle: m.name || '', rows: pays, widths: [22, 18, 20, 34], moneyCols: [1], totalRow: false },
      { name: 'جدول الأقساط', title: 'جدول الأقساط شهراً بشهر', subtitle: m.name || '', rows: sched, widths: [8, 20, 26, 16, 16, 16, 14], moneyCols: [3, 4, 5], totalRow: false }
    ];
  }

  function renderMemberProfile() {
    var list = getMembers();
    var m = list[currentMemberIdx];
    if (!m) { showView('associations'); return; }
    var a = assocByName(m.assoc);
    var d = deriveMember(m);
    var order = memberOrderByIdx(currentMemberIdx);
    var turn = memberTurnMonth(currentMemberIdx);
    var pot = a ? assocPot(a) : 0;
    var M = a ? assocMonths(a) : 0;

    var t = $('#mfpTitle'); if (t) t.textContent = m.name || 'عضو';
    var s = $('#mfpSub'); if (s) s.textContent = (m.assoc || '—') + (m.note ? ' • ' + m.note : '');
    var st = $('#mfpStatus'); if (st) st.textContent = d.status;

    var sum = $('#mfpSummary');
    if (sum) {
      sum.innerHTML =
        '<div class="summary-top">' +
          '<div><h3>ملخص حساب العضو</h3><p>' + esc(m.name || '') + ' — دوره رقم ' + (order + 1) +
          (turn ? ' • يقبض في ' + monthLabel(turn) : '') + '</p></div>' +
          '<div class="stat"><b>' + money(pot) + '</b><small>الحصيلة اللي هيقبضها</small></div>' +
        '</div>' +
        '<div class="summary summary--4">' +
          '<div class="summary__box summary__box--net"><small>قيمة السهم (يدفع كل شهر)</small><b>' + money(d.fee) + '</b></div>' +
          '<div class="summary__box summary__box--in"><small>الحصيلة اللي هيقبضها</small><b>' + money(pot) + '</b></div>' +
          '<div class="summary__box summary__box--net"><small>إجمالي اللي يدفعه في الدورة</small><b>' + money(d.fee * M) + '</b></div>' +
          '<div class="summary__box summary__box--net"><small>مدّة الدورة</small><b>' + (a ? cycleText(a) : '—') + '</b></div>' +
        '</div>' +
        '<div class="summary summary--4">' +
          '<div class="summary__box summary__box--in"><small>المدفوع</small><b>' + money(d.paid) + '</b></div>' +
          '<div class="summary__box summary__box--out"><small>المتبقي</small><b>' + money(d.rest) + '</b></div>' +
          '<div class="summary__box summary__box--net"><small>الحالة</small><b>' + d.status + '</b></div>' +
          '<div class="summary__box summary__box--net"><small>يوم القبض</small><b>' + (a ? 'يوم ' + assocPayoutDay(a) : '—') + '</b></div>' +
        '</div>';
    }

    var hint = $('#mfpCycleHint');
    if (hint) {
      hint.innerHTML = a
        ? 'العضو بيدفع <b>' + money(d.fee) + '</b> كل شهر على <b>' + cycleText(a) +
          '</b> — والجمعية بتقبض في <b>يوم ' + assocPayoutDay(a) + '</b> من كل شهر — أول شهر <b>' +
          monthLabel(assocStart(a)) + '</b> — صاحب دور الشهر الحالي <b>' +
          esc((function () { var c = collectorForMonth(a, currentMonthKey()); return c ? (c.name || '—') : '—'; })()) + '</b>.'
        : 'هذا العضو غير مرتبط بجمعية — أضفه من نموذج الأعضاء داخل الجمعية.';
    }

    var tb = $('#mfpTable tbody');
    if (tb) {
      var rows = '';
      for (var k = 0; k < M; k++) {
        var key = shiftMonth(assocStart(a), k);
        var col = collectorAt(a, k);
        var paid = paidInMonth(m, key);
        var ms = statusInMonth(m, key, d.fee);
        rows += '<tr' + (key === turn ? ' style="background:rgba(79,70,255,.10)"' : '') + '>' +
          '<td>' + (k + 1) + '</td>' +
          '<td>' + monthLabel(key) + (key === currentMonthKey() ? ' <span class="tag tag--warn">الحالي</span>' : '') + '</td>' +
          '<td>' + esc(col ? (col.name || '—') : '—') + '</td>' +
          '<td class="amount">' + money(d.fee) + '</td>' +
          '<td class="amount pos">' + money(paid) + '</td>' +
          '<td class="amount ' + (d.fee - paid > 0 ? 'neg' : 'pos') + '">' + money(Math.max(d.fee - paid, 0)) + '</td>' +
          '<td><span class="tag ' + assocStatusClass(ms) + '">' + ms + '</span></td>' +
          '</tr>';
      }
      tb.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">لا توجد جمعية مرتبطة بهذا العضو</td></tr>';
    }

    var links = $('#mfpLinks');
    if (links) {
      var pays = (m.payments || []).slice().sort(function (x, y) {
        return String(y.month || '').localeCompare(String(x.month || ''));
      });
      var pRows = pays.map(function (p, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + monthLabel(p.month) + '</td>' +
          '<td class="amount pos">' + money(p.amount) + '</td>' +
          '<td>' + esc(formatDate(p.date)) + '</td>' +
          '<td>' + (p.note ? esc(p.note) : '—') + '</td>' +
          '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-mpay="' + i + '">حذف</button></td></tr>';
      }).join('');
      links.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>#</th><th>الشهر</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظة</th><th style="width:70px"><span class="sr-only">حذف</span></th>' +
        '</tr></thead><tbody>' + (pRows ||
        '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">لا توجد دفعات مسجّلة بعد</td></tr>') +
        '</tbody></table></div>' +
        '<p class="panel__note">إجمالي المدفوع <b>' + money(d.paid) + '</b> — المتبقي <b>' + money(d.rest) + '</b>.</p>';
      /* ربط صفوف الجدول بالدفعات الأصلية (الترتيب مقلوب) */
      var order2 = pays.map(function (p) { return (m.payments || []).indexOf(p); });
      var delBtns = links.querySelectorAll('[data-del-mpay]');
      for (var q = 0; q < delBtns.length; q++) {
        delBtns[q].setAttribute('data-del-mpay', String(order2[q]));
      }
    }

    var pf = $('#mfpPayForm');
    if (pf) {
      var sel = $('#mfpMonth');
      if (sel) {
        var opts = '';
        for (var z = 0; z < M; z++) {
          var mk = shiftMonth(assocStart(a), z);
          opts += '<option value="' + mk + '">' + monthLabel(mk) + '</option>';
        }
        sel.innerHTML = opts || '<option value="' + currentMonthKey() + '">' + monthLabel(currentMonthKey()) + '</option>';
        if (turn && M) sel.value = turn;
        else if (currentMonthKey()) sel.value = currentMonthKey();
      }
      pf.elements.amount.value = '';
      var pd = $('#mfpPayDate');
      if (pd) pd.value = todayISO();
      var er = $('#mfpError'); if (er) er.hidden = true;
    }
  }

  var mfpPayForm = $('#mfpPayForm');
  if (mfpPayForm) {
    mfpPayForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#mfpError');
      var fail = function (msg) { if (err) { err.textContent = msg; err.hidden = false; } };
      var f = mfpPayForm.elements;
      var month = f.month.value;
      var amt = parseFloat(f.amount.value);
      var date = f.date.value || todayISO();
      if (!monthKeyParts(month)) return fail('اختر الشهر أولاً');
      if (!(amt > 0)) return fail('أدخل مبلغاً صحيحاً أكبر من صفر');
      if (err) err.hidden = true;

      var list = getMembers();
      var m = list[currentMemberIdx];
      if (!m) return;
      if (!Array.isArray(m.payments)) m.payments = [];
      m.payments.push({ month: month, amount: amt, date: date, note: '' });
      m.paid = Math.round(m.payments.reduce(function (s, p) { return s + Number(p.amount || 0); }, 0) * 100) / 100;
      saveMembers(list);
      renderMemberProfile();
      renderAssociations();
      toast('تم تسجيل دفعة ' + money(amt) + ' لشهر ' + monthLabel(month) + ' ✓');
    });
    mfpPayForm.addEventListener('input', function () {
      var er = $('#mfpError'); if (er) er.hidden = true;
    });
  }

  var mfpExcelBtn = $('#mfpExcelBtn');
  if (mfpExcelBtn) mfpExcelBtn.addEventListener('click', function () {
    var m = getMembers()[currentMemberIdx];
    if (!m) { toast('العضو غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      var bytes = ExportKit.buildXlsx(memberProfileSheets(m));
      openExportModal('member-' + safeFileName(m.name) + '-' + exportStamp() + '.xlsx', MIME_XLSX, bytes);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var mfpPdfBtn = $('#mfpPdfBtn');
  if (mfpPdfBtn) mfpPdfBtn.addEventListener('click', function () {
    var m = getMembers()[currentMemberIdx];
    if (!m) { toast('العضو غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    if (!ExportKit.hasCanvas()) { toast('تصدير PDF يحتاج متصفحاً حقيقياً', true); return; }
    try {
      var pdf = ExportKit.reportToPdf(memberProfileReport(m));
      if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
      openExportModal('member-' + safeFileName(m.name) + '-' + exportStamp() + '.pdf', MIME_PDF, pdf);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var mfpEditBtn = $('#mfpEditBtn');
  if (mfpEditBtn) mfpEditBtn.addEventListener('click', function () {
    var m = getMembers()[currentMemberIdx];
    if (!m) return;
    openConfirm({
      title: 'تعديل بيانات العضو',
      message: 'هل أنت متأكد من أنك تريد تعديل بيانات العضو «' + (m.name || '') + '»؟',
      yes: 'نعم، تعديل', no: 'تراجع',
      onYes: function () {
        startEditMember(currentMemberIdx);
        showView('associations');
      }
    });
  });

  var mfpDeleteBtn = $('#mfpDeleteBtn');
  if (mfpDeleteBtn) mfpDeleteBtn.addEventListener('click', function () {
    var m = getMembers()[currentMemberIdx];
    if (!m) return;
    openConfirm({
      title: 'حذف العضو',
      message: 'هل تريد حذف العضو «' + (m.name || '') + '» من الجمعية؟ الحذف نهائي — سيُطلب كلمة المرور.',
      yes: 'نعم، حذف نهائي', no: 'تراجع', password: true,
      onYes: function () {
        var list = getMembers();
        var target = list[currentMemberIdx];
        if (!target) { toast('العضو غير موجود', true); return; }
        var name = target.name || '';
        list.splice(currentMemberIdx, 1);
        saveMembers(list);
        renderAssociations();
        showView('associations');
        toast('تم حذف العضو «' + name + '»');
      }
    });
  });

  /* فتح بروفايل العضو + حذف دفعة */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var bp = t.closest('[data-member-profile]');
    if (bp) {
      currentMemberIdx = Number(bp.getAttribute('data-member-profile'));
      navigate('member-profile');
      return;
    }

    var dp = t.closest('[data-del-mpay]');
    if (dp) {
      var i = Number(dp.getAttribute('data-del-mpay'));
      var list = getMembers();
      var m = list[currentMemberIdx];
      if (!m || !m.payments || !m.payments[i]) return;
      var amt = Number(m.payments[i].amount || 0);
      m.payments.splice(i, 1);
      m.paid = Math.round(m.payments.reduce(function (s, p) { return s + Number(p.amount || 0); }, 0) * 100) / 100;
      saveMembers(list);
      renderMemberProfile();
      renderAssociations();
      toast('تم حذف دفعة بقيمة ' + money(amt) + ' — المدفوع الحالي ' + money(m.paid));
    }
  });


  /* ============================================================
     العمليات — سجل كل تغيير في البيانات + تراجع عن أي عملية
     بيراقب كل كتابة في localStorage لأقسام البيانات المعروفة،
     وينشئ سجلاً بالعملية والوقت والوصف + قيمة قبل/بعد للتراجع.
     ============================================================ */
  var KEY_OPS = 'app_operations';
  var OPS_MAX = 100;              /* أقصى عدد عمليات نحتفظ بها */
  var OPS_UNDO_MAX = 5;           /* آخر كام عملية نحتفظ بقيمهم الكاملة */
  var OPS_MAX_BYTES = 200000;     /* أقصى حجم لقيمة تُحفظ للتراجع */
  var opHooked = false;
  var opBusy = false;
  var rawSetItem = null;

  function opsWatched(key) {
    if (!key || key === KEY_OPS) return false;
    if (key === 'app_sync_backup' || key.indexOf('app_sync_') === 0) return false;
    if (typeof SYNC_LABELS === 'object' && SYNC_LABELS[key]) return true;
    return key === 'app_password';
  }

  function getOps() {
    try {
      var raw = localStorage.getItem(KEY_OPS);
      if (raw) {
        var v = JSON.parse(raw);
        if (Array.isArray(v)) return v;
      }
    } catch (e) {}
    return [];
  }

  function saveOps(list) {
    try { localStorage.setItem(KEY_OPS, JSON.stringify(list)); return true; }
    catch (e) {
      /* لو الحجم زاد عن حد التخزين: نشيل قيم التراجع من الأقدم ونحاول تاني */
      try {
        var slim = list.map(function (o, i) {
          if (i < OPS_UNDO_MAX && o.undoable) return o;
          var c = {};
          for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; }
          c.undoable = false; c.before = null; c.after = null;
          return c;
        });
        localStorage.setItem(KEY_OPS, JSON.stringify(slim));
        return true;
      } catch (e2) { return false; }
    }
  }

  function tryParse(raw) { try { return JSON.parse(raw); } catch (e) { return null; } }

  function opNameOf(v) {
    if (v && typeof v === 'object') return String(v.name || v.desc || v.title || v.label || '');
    return '';
  }

  function formatOpsTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function opSummary(key, oldRaw, newRaw) {
    if (key === 'app_password') return 'تغيير كلمة المرور';
    var label = (typeof SYNC_LABELS === 'object' && SYNC_LABELS[key]) ? SYNC_LABELS[key] : 'الإعدادات';
    var a = tryParse(oldRaw), b = tryParse(newRaw);
    if (oldRaw === null && Array.isArray(b)) return label + ' — أول تسجيل (' + b.length + ' سجل)';
    if (newRaw === null && Array.isArray(a)) return label + ' — مسح القسم';
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length === b.length) {
        var same = true;
        for (var i = 0; i < a.length; i++) {
          if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { same = false; break; }
        }
        if (same) return label + ' — بلا تغيير';
        var changed = 0;
        for (var j = 0; j < Math.min(a.length, b.length); j++) {
          if (JSON.stringify(a[j]) !== JSON.stringify(b[j])) changed++;
        }
        return label + ' — تعديل بيانات' + (changed ? ' (' + changed + ' سجل)' : '');
      }
      var head = label + ': ' + a.length + ' ← ' + b.length;
      var added = b.filter(function (x) {
        return !a.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); });
      });
      var removed = a.filter(function (x) {
        return !b.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); });
      });
      var det = [];
      added.slice(0, 2).forEach(function (x) { det.push('+ ' + (opNameOf(x) || 'سجل')); });
      removed.slice(0, 2).forEach(function (x) { det.push('− ' + (opNameOf(x) || 'سجل')); });
      return head + (det.length ? ' — ' + det.join('، ') : '');
    }
    if (key === 'app_partner_profit') {
      return 'صافي أرباح السنة: ' + (oldRaw || '—') + ' ← ' + (newRaw || '—');
    }
    if (Array.isArray(b) && a === null) return label + ' — استعادة/إصلاح من نسخة احتياطية';
    if (a !== null && b !== null && typeof a === 'object') return label + ' — تعديل البيانات';
    return label + ' — تغيير الإعداد';
  }

  function pushOp(key, oldRaw, newRaw) {
    var entry = {
      id: 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      key: key,
      label: (typeof SYNC_LABELS === 'object' && SYNC_LABELS[key]) ? SYNC_LABELS[key] : 'الإعدادات',
      desc: opSummary(key, oldRaw, newRaw),
      undoable: false,
      before: null,
      after: null
    };
    if (key !== 'app_password' &&
        typeof oldRaw === 'string' && typeof newRaw === 'string' &&
        oldRaw.length <= OPS_MAX_BYTES && newRaw.length <= OPS_MAX_BYTES) {
      entry.undoable = true;
      entry.before = oldRaw;
      entry.after = newRaw;
    }
    var list = getOps();
    list.unshift(entry);
    for (var i = OPS_UNDO_MAX; i < list.length; i++) {
      if (list[i].undoable) { list[i].undoable = false; list[i].before = null; list[i].after = null; }
    }
    if (list.length > OPS_MAX) list.length = OPS_MAX;
    saveOps(list);
    return entry;
  }

  function installOpsHook() {
    if (opHooked) return false;
    var proto = null;
    try { proto = window.Storage && window.Storage.prototype; } catch (e) {}
    if (!proto || typeof proto.setItem !== 'function') return false;
    var orig = proto.setItem;
    try {
      proto.setItem = function (k, v) {
        var isLS = false;
        try { isLS = (this === window.localStorage); } catch (e) {}
        var before = null;
        if (isLS) { try { before = this.getItem(k); } catch (e) {} }
        orig.call(this, k, v);
        if (!isLS || opBusy || !opsWatched(k)) return;
        var after = String(v);
        if (before === after) return;
        try { pushOp(k, before, after); } catch (e) {}
      };
      rawSetItem = function (k, v) { orig.call(window.localStorage, k, v); };
      opHooked = true;
      return true;
    } catch (e) { return false; }
  }

  function undoOpById(id) {
    var list = getOps(), op = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { op = list[i]; break; }
    if (!op) { toast('العملية غير موجودة', true); return false; }
    if (!op.undoable || op.before === null || op.before === undefined) {
      toast('هذه العملية خارج حد التراجع — استخدم «تراجع عن آخر استبدال» من المزامنة', true);
      return false;
    }
    var current = readRawKey(op.key);
    try { backupLocal('قبل تراجع عن عملية'); } catch (e) {}
    opBusy = true;
    try { rawSetItem(op.key, op.before); }
    finally { opBusy = false; }
    if (current !== null && current !== op.before) pushOp(op.key, current, op.before);
    refreshAllViews();
    toast('تم التراجع ✓ — ' + (op.desc || 'عملية'));
    return true;
  }

  function undoLastOp() {
    var list = getOps();
    for (var i = 0; i < list.length; i++) {
      if (list[i].undoable) return undoOpById(list[i].id);
    }
    toast('مفيش عملية قابلة للتراجع حالياً', true);
    return false;
  }

  function refreshAllViews() {
    try {
      renderHomeStats();
      if (typeof renderCustomers === 'function') renderCustomers($('#custSearch') ? $('#custSearch').value : '');
      if (typeof renderSuppliers === 'function') renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
      renderLedger(); renderLedgerSummary();
      renderPartners(); renderAssociations();
      renderCollection(colFilter()); renderCollectionSummary();
      if (typeof renderDetails === 'function') renderDetails();
      if (typeof renderOperations === 'function') renderOperations();
      if (typeof renderDataSafety === 'function') renderDataSafety();
    } catch (e) { /* إعادة البناء تكمّلي */ }
  }

  /* ---------- شاشة العمليات ---------- */
  function renderOperations() {
    var list = getOps();
    var cnt = $('#opsCount');
    if (cnt) cnt.textContent = list.length + ' عملية';

    var undoable = 0;
    list.forEach(function (o) { if (o.undoable) undoable++; });
    var last = list[0];

    var sum = $('#opsSummary');
    if (sum) {
      sum.innerHTML =
        '<div class="summary__box summary__box--net"><small>عدد العمليات المسجّلة</small><b>' + list.length + '</b></div>' +
        '<div class="summary__box summary__box--in"><small>عمليات قابلة للتراجع</small><b>' + undoable + '</b></div>' +
        '<div class="summary__box summary__box--net"><small>آخر قسم تغيّر</small><b style="font-size:14px">' +
          esc(last ? (last.label || '—') : '—') + '</b></div>' +
        '<div class="summary__box summary__box--out"><small>وقت آخر عملية</small><b style="font-size:14px">' +
          esc(last ? formatOpsTime(last.at) : '—') + '</b></div>';
    }

    var tb = $('#opsTbody');
    if (tb) {
      var rows = list.map(function (o, i) {
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(formatOpsTime(o.at)) + '</td>' +
          '<td>' + esc(o.label || o.key || '') + '</td>' +
          '<td>' + esc(o.desc || '') + '</td>' +
          '<td>' + (o.undoable
            ? '<span class="tag tag--in">قابل للتراجع</span>'
            : '<span class="tag tag--warn">سجل فقط</span>') + '</td>' +
          '<td class="col-cell">' + (o.undoable
            ? '<button type="button" class="btn btn--ghost btn--sm" data-undo-op="' + esc(o.id) + '">تراجع</button>'
            : '—') + '</td>' +
          '</tr>';
      }).join('');
      tb.innerHTML = rows ||
        '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:26px">' +
        'لا توجد عمليات بعد — كل تعديل أو إضافة أو حذف في التطبيق بيتسجّل هنا تلقائياً.</td></tr>';
    }

    var ub = $('#opsUndoLast');
    if (ub) ub.disabled = !(last && last.undoable);
  }

  /* ---------- فحص سلامة التخزين ---------- */
  function storageReport() {
    var rows = [], bad = [], missing = [];
    SYNC_KEYS.forEach(function (k) {
      var raw = readRawKey(k);
      var state = 'سليم', ok = true;
      if (raw === null) { state = 'لم يُحفظ بعد'; ok = false; missing.push(k); }
      else { try { JSON.parse(raw); } catch (e) { state = 'تالف'; ok = false; bad.push(k); } }
      rows.push({ key: k, label: SYNC_LABELS[k] || k, state: state, ok: ok, bytes: raw ? raw.length : 0 });
    });
    return { rows: rows, bad: bad, missing: missing };
  }

  /* إصلاح القيم التالفة من النسخة الاحتياطية عند الإقلاع */
  function repairStorage() {
    var fixed = [];
    var bak = tryParse(readRawKey('app_sync_backup'));
    SYNC_KEYS.forEach(function (k) {
      var raw = readRawKey(k);
      if (raw === null) return;
      try { JSON.parse(raw); return; } catch (e) {}
      var cand = (bak && bak.sections) ? bak.sections[k] : null;
      if (typeof cand !== 'string') return;
      try { JSON.parse(cand); } catch (e2) { return; }
      try { localStorage.setItem(k, cand); fixed.push(k); } catch (e3) {}
    });
    return fixed;
  }

  function renderDataSafety() {
    var box = $('#dataSafetyBody');
    if (!box) return;
    var rep = storageReport();
    var list = getOps();
    var undoable = 0;
    list.forEach(function (o) { if (o.undoable) undoable++; });

    var rows = rep.rows.map(function (r) {
      return '<tr><td>' + esc(r.label) + '</td>' +
        '<td><span class="tag ' + (r.ok ? 'tag--in' : 'tag--warn') + '">' + esc(r.state) + '</span></td>' +
        '<td class="amount">' + (r.bytes ? money(r.bytes) + ' بايت' : '—') + '</td></tr>';
    }).join('');

    box.innerHTML =
      '<div class="summary summary--4">' +
        '<div class="summary__box summary__box--in"><small>أقسام سليمة</small><b>' +
          (rep.rows.length - rep.bad.length) + ' / ' + rep.rows.length + '</b></div>' +
        '<div class="summary__box summary__box--net"><small>عمليات مسجّلة</small><b>' + list.length + '</b></div>' +
        '<div class="summary__box summary__box--in"><small>قابلة للتراجع</small><b>' + undoable + '</b></div>' +
        '<div class="summary__box summary__box--net"><small>آخر فحص</small><b style="font-size:14px">' +
          esc(formatOpsTime(new Date().toISOString())) + '</b></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>القسم</th><th>الحالة</th><th>الحجم</th></tr></thead><tbody>' + rows +
      '</tbody></table></div>' +
      '<p class="panel__note">' +
        (rep.bad.length
          ? '⚠ اتُكتشف أقسام تالفة واتصلحت تلقائياً من النسخة الاحتياطية: ' + esc(rep.bad.join('، '))
          : '✓ مفيش أقسام تالفة — البيانات محفوظة ومتطابقة.') +
        ' — مفيش أي عملية بتمسح بياناتك من تلقائها: أي استبدال من المزامنة لقسم فارغ بيتجاهل تلقائياً.' +
      '</p>';
  }

  /* ---------- أزرار العمليات ---------- */
  /* زر «تراجع عن آخر عملية» بيتعامل معاه المُوزِّع تحت عشان ما ينفّذش مرتين */

  var opsClearBtn = $('#opsClear');
  if (opsClearBtn) opsClearBtn.addEventListener('click', function () {
    openConfirm({
      title: 'تفريغ سجل العمليات',
      message: 'هل تريد مسح سجل العمليات بالكامل؟ البيانات نفسها لن تُمسح — سيُطلب كلمة المرور.',
      yes: 'نعم، تفريغ السجل', no: 'تراجع', password: true,
      onYes: function () {
        saveOps([]);
        renderOperations();
        toast('تم تفريغ سجل العمليات — بياناتك لم تتأثر');
      }
    });
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var u = t.closest('[data-undo-op]');
    if (!u) return;
    var id = u.getAttribute('data-undo-op');
    var op = null;
    if (id === '__last__') {
      var all = getOps();
      for (var i = 0; i < all.length; i++) if (all[i].undoable) { op = all[i]; break; }
      if (!op) { toast('مفيش عملية قابلة للتراجع حالياً', true); return; }
    } else {
      getOps().forEach(function (o) { if (o.id === id) op = o; });
      if (!op) { toast('العملية غير موجودة', true); return; }
    }
    openConfirm({
      title: 'تراجع عن عملية',
      message: 'هل تريد التراجع عن: «' + (op.desc || 'عملية') + '»؟ سيتم إرجاع القسم لحالته السابقة.',
      yes: 'نعم، تراجع', no: 'تراجع',
      onYes: function () { undoOpById(op.id); }
    });
  });


  /* ---------- رسائل التحصيل عبر واتساب ---------- */
  var KEY_WA = 'app_wa_settings';
  var KEY_WA_LOG = 'app_wa_log';
  var WA_DEFAULT_TEMPLATE =
    'مرحبًا {الاسم}،' + '\n' +
    'إشعار تحصيل بتاريخ {التاريخ}' + '\n' +
    '• المبلغ قبل التحصيل: {قبل}' + '\n' +
    '• المدفوع: {المدفوع}' + '\n' +
    '• المتبقي: {المتبقي}' + '\n' +
    'شكرًا لكم — نظام الإدارة';
  var waBusy = false;

  function waSettings() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY_WA) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    return {
      template: (typeof s.template === 'string' && s.template) ? s.template : WA_DEFAULT_TEMPLATE,
      phonePref: (s.phonePref === 'backup' || s.phonePref === 'both') ? s.phonePref : 'primary',
      country: /^\d{1,4}$/.test(String(s.country || '')) ? String(s.country) : '20'
    };
  }

  function saveWaSettings(s) {
    try {
      localStorage.setItem(KEY_WA, JSON.stringify({
        template: String(s.template || WA_DEFAULT_TEMPLATE),
        phonePref: s.phonePref === 'backup' || s.phonePref === 'both' ? s.phonePref : 'primary',
        country: /^\d{1,4}$/.test(String(s.country || '')) ? String(s.country) : '20'
      }));
    } catch (e) {}
  }

  function waLog() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY_WA_LOG) || '[]');
      return safeList(v, []);
    } catch (e) { return []; }
  }

  function saveWaLog(list) {
    try { localStorage.setItem(KEY_WA_LOG, JSON.stringify(list)); } catch (e) {}
  }

  function waLastPayment(c) {
    var pays = (c && Array.isArray(c.payments)) ? c.payments : [];
    for (var i = pays.length - 1; i >= 0; i--) if (pays[i] && typeof pays[i] === 'object') return pays[i];
    return null;
  }

  /* مفتاح فريد لكل عملية تحصيل: أول ما يحصل تحصيل جديد المفتاح يتغير
     فيسمح الإرسال مرة تانية — غير كده نفس التحصيل ما يترسلش تاني. */
  function waKey(c, i, last) {
    var pays = Array.isArray(c.payments) ? c.payments : [];
    return [i, c.name || '', pays.length, last.date || '', Number(last.amount || 0)].join('|');
  }

  function waPhone(c) {
    var pref = waSettings().phonePref;
    var p1 = String(c.phone || '').replace(/[^\d+]/g, '');
    var p2 = String(c.phone2 || '').replace(/[^\d+]/g, '');
    if (pref === 'backup') return p2;
    if (pref === 'both') return p1 || p2;
    return p1;
  }

  /* الرقم بصيغة واتساب الدولية: كود الدولة + الرقم بدون صفر أو علامات */
  function waDigits(n) {
    var cc = waSettings().country;
    var d = String(n || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (cc) {
      if (d.indexOf(cc) === 0 && d.length > cc.length + 6) return d;
      if (d.charAt(0) === '0') d = d.slice(1);
      if (d.indexOf(cc) !== 0) d = cc + d;
    } else if (d.charAt(0) === '0') {
      d = d.slice(1);
    }
    return d;
  }

  function waFill(tpl, c, info) {
    var d = derive(c);
    var map = {
      '{الاسم}': c.name || '', '{name}': c.name || '',
      '{التاريخ}': formatDate(info.date), '{date}': formatDate(info.date),
      '{قبل}': money(info.before), '{before}': money(info.before),
      '{المدفوع}': money(info.paid), '{paid}': money(info.paid),
      '{المتبقي}': money(d.rest), '{rest}': money(d.rest)
    };
    var out = String(tpl == null ? '' : tpl);
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) out = out.split(k).join(map[k]);
    return out;
  }

  function waRows() {
    var s = waSettings();
    var log = waLog();
    var out = [];
    getCustomers().forEach(function (c, i) {
      if (!c || typeof c !== 'object') return;
      var last = waLastPayment(c);
      if (!last) return;
      var d = derive(c);
      var paid = Number(last.amount || 0);
      var info = {
        date: last.date || todayISO(),
        paid: paid,
        before: Math.max(d.rest + paid, 0)
      };
      var key = waKey(c, i, last);
      out.push({
        i: i, c: c, info: info, key: key, phone: waPhone(c),
        sent: log.some(function (e) { return e && e.key === key; }),
        text: waFill(s.template, c, info)
      });
    });
    return out;
  }

  function renderWaPanel() {
    var tplEl = $('#waTemplate'), prefEl = $('#waPhonePref'), tb = $('#waTbody');
    if (!tplEl || !prefEl || !tb) return;
    var s = waSettings();
    if (document.activeElement !== tplEl) tplEl.value = s.template;
    if (prefEl.value !== s.phonePref) prefEl.value = s.phonePref;
    var ccEl = $('#waCountry');
    if (ccEl && document.activeElement !== ccEl) ccEl.value = s.country;

    var rows = waRows();
    var html = '';
    rows.forEach(function (r) {
      var status = r.sent
        ? '<span class="tag tag--in">تم الإرسال ✓</span>'
        : (r.phone ? '<span class="tag tag--warn">جاهز للإرسال</span>'
                   : '<span class="tag tag--out">لا يوجد رقم</span>');
      html += '<tr><td>' + (r.i + 1) + '</td>' +
        '<td>' + esc(r.c.name || 'بدون اسم') + '</td>' +
        '<td>' + esc(r.phone || '—') + '</td>' +
        '<td>' + esc(formatDate(r.info.date)) + ' · ' + money(r.info.paid) + '</td>' +
        '<td>' + status + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm" data-wa-send="' + r.i + '"' +
          ((!r.phone || r.sent) ? ' disabled' : '') + '>' + (r.sent ? 'تم الإرسال' : 'إرسال') + '</button></td>' +
        '</tr>';
    });
    if (!rows.length) {
      html = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:22px">' +
        'مفيش عملاء عندهم تحصيل مسجّل بعد — أضف أول دفعة من شاشة التحصيل.</td></tr>';
    }
    tb.innerHTML = html;

    var cnt = $('#waCount');
    if (cnt) {
      var sent = rows.filter(function (r) { return r.sent; }).length;
      var pending = rows.filter(function (r) { return !r.sent && r.phone; }).length;
      cnt.textContent = rows.length + ' عميل · تم ' + sent + ' · متبقٍ ' + pending;
    }
    var prev = $('#waPreview');
    if (prev) {
      var sample = null;
      rows.forEach(function (r) { if (!sample && !r.sent && r.phone) sample = r; });
      if (!sample && rows.length) sample = rows[0];
      var pv = sample ? sample.text : '—';
      try { prev.value = pv; } catch (e) {}
      prev.textContent = pv;
    }
  }

  function waOpen(text, phone) {
    var digits = waDigits(phone);
    if (!digits) return false;
    var url = 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text || '');
    try {
      var w = window.open(url, '_blank');
      return !!w;
    } catch (e) { return false; }
  }

  function waSendOne(i) {
    var r = null;
    waRows().forEach(function (x) { if (x.i === i) r = x; });
    if (!r) { toast('العميل غير موجود', true); return; }
    if (r.sent) { toast('تم إرسال هذا التحصيل من قبل — يُسمح بإعادة الإرسال عند حدوث تحصيل جديد', true); return; }
    if (!r.phone) { toast('لا يوجد رقم هاتف مسجّل لهذا العميل', true); return; }
    if (!waOpen(r.text, r.phone)) {
      toast('تعذّر فتح واتساب — اسمح بالنوافذ المنبثقة في المتصفح', true);
      return;
    }
    var log = waLog();
    log.push({ key: r.key, cid: r.i, name: r.c.name || '', phone: r.phone, at: new Date().toISOString(), text: r.text });
    saveWaLog(log);
    renderWaPanel();
    toast('تم فتح واتساب للعميل ' + (r.c.name || ''));
  }

  function waSendAll() {
    if (waBusy) return;
    var list = waRows().filter(function (r) { return !r.sent && r.phone; });
    if (!list.length) {
      toast('مفيش رسائل جديدة — الكل تم إرساله أو بدون رقم هاتف', true);
      return;
    }
    var btn = $('#waSendAllBtn');
    var added = [];
    var idx = 0, done = 0;
    waBusy = true;
    if (btn) btn.disabled = true;

    function finish(okMsg) {
      if (added.length) {
        var log = waLog();
        added.forEach(function (e) {
          if (!log.some(function (x) { return x && x.key === e.key; })) log.push(e);
        });
        saveWaLog(log);
      }
      waBusy = false;
      if (btn) btn.disabled = false;
      renderWaPanel();
      if (okMsg) toast(okMsg);
    }

    function next() {
      if (idx >= list.length) { finish('تم إرسال ' + done + ' رسالة من ' + list.length + ' — لن يتكرر أي منهم'); return; }
      var r = list[idx++];
      if (!waOpen(r.text, r.phone)) {
        finish('المتصفح حجب نافذة واتساب — اسمح بالنوافذ المنبثقة وأعد الإرسال (تم ' + done + ' من ' + list.length + ')', true);
        return;
      }
      added.push({ key: r.key, cid: r.i, name: r.c.name || '', phone: r.phone, at: new Date().toISOString(), text: r.text });
      done++;
      renderWaPanel();
      setTimeout(next, 450);
    }
    next();
  }

  /* أزرار لوحة رسائل التحصيل */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var s = t.closest('[data-wa-send]');
    if (s) { waSendOne(Number(s.getAttribute('data-wa-send'))); return; }
    if (t.closest('#waSaveBtn')) {
      var tpl = $('#waTemplate'), pref = $('#waPhonePref'), ccEl = $('#waCountry');
      saveWaSettings({
        template: tpl ? tpl.value : waSettings().template,
        phonePref: pref ? pref.value : waSettings().phonePref,
        country: ccEl ? ccEl.value : waSettings().country
      });
      renderWaPanel();
      toast('تم حفظ إعدادات رسائل التحصيل');
      return;
    }
    if (t.closest('#waSendAllBtn')) { waSendAll(); return; }
  });

  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.id) return;
    if (e.target.id === 'waPhonePref' || e.target.id === 'waCountry') {
      var s = waSettings();
      if (e.target.id === 'waPhonePref') s.phonePref = e.target.value;
      else s.country = e.target.value;
      saveWaSettings(s);
      renderWaPanel();
    }
  });

  document.addEventListener('focusout', function (e) {
    if (e.target && e.target.id === 'waTemplate') {
      var s = waSettings();
      var v = e.target.value;
      if (v !== s.template) { s.template = v; saveWaSettings(s); renderWaPanel(); }
    }
  });

  /* ---------- الإقلاع ---------- */
  /* كل خطوة في try: فشل أي رسم أولي ما يمنعش فتح الشاشة الرئيسية
     (دي كانت سبب «الشاشة الفاضية» — خطوة واحدة بتوقّع الباقي كله). */
  var bootFailed = [];
  function bootStep(run, label) {
    try { run(); } catch (e) {
      bootFailed.push(label);
      try { console.error('فشل الإقلاع في «' + label + '»: ' + (e && e.message ? e.message : e)); } catch (e2) {}
    }
  }
  bootStep(function () { installOpsHook(); }, 'سجل العمليات');
  bootStep(function () { repairStorage(); }, 'فحص التخزين');
  bootStep(function () {
    renderHomeStats();
    renderCustomers();
    renderLedger();
    renderLedgerSummary();
  }, 'الرسم الأولي');
  try {
    showView('home');
  } catch (e) {
    try { console.error('فشل فتح الرئيسية: ' + (e && e.message ? e.message : e)); } catch (e2) {}
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-home'); });
  }
  /* علامة للمراقب: الإقلاع وصل للنهاية */
  try { window.__appBooted = true; } catch (e) {}
  if (bootFailed.length) {
    toast('تعذّر تحميل: ' + bootFailed.join('، ') + ' — بياناتك سليمة، أعد تشغيل التطبيق.', true);
  }

  /* أي خطأ غير متوقع يظهر رسالة بدل شاشة صامتة */
  try {
    window.addEventListener('error', function (ev) {
      var m = ev && ev.message ? ev.message : 'خطأ غير معروف';
      try { toast('حدث خطأ غير متوقع: ' + m, true); } catch (e) {}
    });
  } catch (e) {}

  window.syncApi = syncApi;
  window.syncApply = syncApply;
  window.syncCheck = syncCheck;
  window.isViewerMode = isViewerMode;
})();
