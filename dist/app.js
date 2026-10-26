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
    associations: 'جمعيات'
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
    'supplier-profile': 'كشف حساب مورد'
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
  function getCustomers() {
    try {
      var raw = localStorage.getItem(KEY_CUSTOMERS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return DEFAULT_CUSTOMERS.slice();
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
    if (id === 'customers') renderCustomers();
    if (id === 'home') renderHomeStats();
    if (id === 'collection') { renderCollection(colFilter()); renderCollectionSummary(); }
    if (id === 'ledger') { renderLedger(); renderLedgerSummary(); }
    if (id === 'partners') renderPartners();
    if (id === 'associations') renderAssociations();
    if (id === 'settings') { renderExportGrid(); refreshDriveStatus(); }
    if (id === 'suppliers' && typeof renderSuppliers === 'function') {
      renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
    }
    if (id === 'profile' && typeof renderProfile === 'function') renderProfile();
    if (id === 'supplier-profile' && typeof renderSupplierProfile === 'function') renderSupplierProfile();
    if (id === 'add-customer' && typeof hideAlert === 'function') hideAlert();
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
    list.unshift({
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
      balance: rest
    });
    saveCustomers(list);
    form.reset();
    notes = [];
    renderNotes();
    hideAlert();
    recalc();
    renderHomeStats();
    showView('customers');
    toast(skipped ? 'تم حفظ العميل مع تخطّي الحقول الناقصة' : 'تمت إضافة العميل بنجاح');
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
    var pays = c.payments || [];
    var paidPays = 0;
    pays.forEach(function (p) { paidPays += Number(p.amount || 0); });
    var paid = later + paidPays;
    var rest = (total > 0 || down > 0) ? Math.max(due - paid, 0) : Number(c.balance || 0);
    var m = String(c.duration || '').match(/\d+/);
    var n = m ? parseFloat(m[0]) : 0;
    var u = String(c.duration || '').match(/[^\d\s]+/);
    var unit = u ? u[0] : '';
    var sends = c.sends || [];
    var sendSum = 0;
    sends.forEach(function (s) {
      sendSum += Number(s.total != null ? s.total : (Number(s.qty || 0) * Number(s.price || 0)));
    });
    var paidByUs = Number(c.paidByUs || 0);
    return {
      total: total, down: down, due: due, later: later,
      pays: pays, paidPays: paidPays, paid: paid, rest: rest,
      n: n, unit: unit,
      sends: sends, sendSum: sendSum, paidByUs: paidByUs,
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
      infoItem('تاريخ الانتهاء', c.endDate ? formatDate(c.endDate) : 'لم يكتمل بعد');

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
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">لا توجد عمليات تحصيل بعد — أضف أول عملية من النموذج أعلاه.</td></tr>';
    }
    tbody.innerHTML = rows;

    /* ملخص وجدول المرسل من موارد */
    $('#sendSummary').innerHTML =
      '<div class="summary__box"><small>المبلغ المدفوع منا نحن للعميل (الرصيد الأصلي)</small><b>' + money(d.paidByUs) + '</b></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المرسلات</small><b>' + money(d.sendSum) + '</b></div>' +
      '<div class="summary__box summary__box--out"><small>المبلغ المتبقي بعد الطرح</small><b>' + money(d.sendBal) + '</b></div>' +
      '<div class="summary__box summary__box--net"><small>عدد الشغلانات</small><b>' + d.sends.length + '</b><span>' + worksCount(d.sends) + '</span></div>';

    fillSendDatalists(d);
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

  function annotateSends(d) {
    var cum = 0;
    return d.sends.map(function (x) {
      var before = Math.max(d.paidByUs - cum, 0);
      cum += Number(x.total != null ? x.total : 0);
      return { x: x, before: before, after: Math.max(d.paidByUs - cum, 0) };
    });
  }

  function sendRowHtml(e) {
    var x = e.x;
    return '<tr>' +
      '<td>' + esc(x.work || '—') + '</td>' +
      '<td>' + esc(formatDate(x.date)) + '</td>' +
      '<td>' + esc(x.desc) + '</td>' +
      '<td>' + esc(x.qty) + '</td>' +
      '<td class="amount">' + money(x.price) + '</td>' +
      '<td class="amount">' + money(x.total) + '</td>' +
      '<td class="amount">' + money(e.before) + '</td>' +
      '<td class="amount pos">' + money(e.after) + '</td>' +
      '<td>' + (x.note ? esc(x.note) : '—') + '</td>' +
      '</tr>';
  }

  function buildSendRows(d) {
    var entries = annotateSends(d);
    if (sendView.filter) {
      entries = entries.filter(function (e) {
        return String(e.x.work || '').indexOf(sendView.filter) > -1;
      });
    }
    if (!entries.length) {
      var msg = d.sends.length === 0
        ? 'لا توجد عمليات مرسل من الموارد — أضف أول عملية من النموذج أعلاه.'
        : 'لا توجد عمليات مطابقة للشغلانة «' + esc(sendView.filter) + '».';
      return '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px">' + msg + '</td></tr>';
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
      var head = '<tr class="group-row"><td colspan="9"><b>' + esc(g.name) + '</b>' +
        '<span>' + opsCount(g.items.length) + '</span>' +
        '<span class="group-total">الإجمالي: ' + money(g.total) + '</span></td></tr>';
      return head + g.items.map(sendRowHtml).join('');
    }).join('');
  }

  function refreshSendTable() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    $('#sendTable tbody').innerHTML = buildSendRows(derive(c));
  }

  function updateSendCalc() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    var d = derive(c);
    var f = $('#sendForm').elements;
    var qty = parseFloat(f.qty.value) || 0;
    var price = parseFloat(f.price.value) || 0;
    var total = qty * price;
    f.sendTotal.value = money(total);
    f.beforeBal.value = money(d.sendBal);
    f.afterBal.value = money(Math.max(d.sendBal - total, 0));
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
      if (d.paidByUs > 0 && total > d.sendBal) {
        return fail('الرصيد غير كافٍ — المتبقي من المبلغ المدفوع منا للعميل: ' + money(d.sendBal));
      }

      var sends = d.sends.slice();
      sends.push({
        work: work, date: date, desc: desc, qty: qty, price: price, total: total,
        note: String(f.note.value || '').trim()
      });
      c.sends = sends;
      saveCustomers(list);

      renderProfile();
      toast('تمت إضافة مرسل بقيمة ' + money(total) + ' — المتبقي بعد الطرح: ' + money(Math.max(d.sendBal - total, 0)));
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
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_SUPPLIERS));
  }
  function saveSuppliers(list) {
    try { localStorage.setItem(KEY_SUPPLIERS, JSON.stringify(list)); } catch (e) {}
  }

  function deriveSup(s) {
    var tx = s.tx || [];
    var incoming = 0, paid = 0;
    tx.forEach(function (t) {
      incoming += Number(t.incoming || 0);
      paid += Number(t.paid || 0);
    });
    return { tx: tx, incoming: incoming, paid: paid, rest: incoming - paid };
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

    var rows = '', running = 0;
    d.tx.forEach(function (t, i) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(t.date)) + '</td>' +
        '<td>' + esc(t.no || '—') + '</td>' +
        '<td>' + esc(t.desc || '—') + '</td>' +
        '<td class="amount">' + money(t.incoming) + '</td>' +
        '<td class="amount">' + money(t.paid) + '</td>' +
        '<td class="amount">' + signed(running) + '</td>' +
        '<td>' + (t.note ? esc(t.note) : '—') + '</td>' +
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">لا توجد حركات على هذا المورد — أضف أول حركة من النموذج أعلاه.</td></tr>';
    }
    $('#supTxTable tbody').innerHTML = rows;

    var f = $('#supTxForm');
    f.elements.date.value = todayISO();
    f.elements.no.value = String(d.tx.length + 1);
    f.elements.desc.value = '';
    f.elements.incoming.value = '';
    f.elements.paid.value = '';
    f.elements.note.value = '';
    $('#supTxError').hidden = true;
    updateSupTxCalc();
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

      if (!date) fail('الرجاء إدخال التاريخ');
      else if (!desc) fail('الرجاء إدخال البيان');
      else if (!(inc > 0) && !(pd > 0)) fail('أدخل مبلغاً في الوارد أو المدفوع');
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

  /* إضافة مورد */
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
      list.unshift({
        name: String(f.name.value).trim(),
        job: String(f.job.value).trim(),
        phone: String(f.phone.value).trim(),
        address: String(f.address.value || '').trim(),
        note: String(f.note.value || '').trim(),
        tx: []
      });
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
        '</tr>';
    });
    if (!rows) {
      rows = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:22px">لا توجد عمليات تحصيل بعد — أضف أول دفعة من النموذج أعلاه.</td></tr>';
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
          '<thead><tr><th>#</th><th>التاريخ</th><th>المبلغ قبل الدفعة</th><th>المبلغ المدفوع</th><th>المرة في الدفع</th><th>المتبقي بعد الدفعة</th><th>ملاحظات</th></tr></thead>' +
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

  renderCollection('');
  renderCollectionSummary();

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
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_LEDGER));
  }
  function saveLedger(list) {
    try { localStorage.setItem(KEY_LEDGER, JSON.stringify(list)); } catch (e) {}
  }

  function ledgerTotals() {
    var list = getLedger(), inc = 0, out = 0;
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

    var list = getLedger().map(function (t, i) { return { t: t, i: i }; });
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
      html += '<tr data-ledger-idx="' + entry.i + '">' +
        '<td>' + (n + 1) + '</td>' +
        '<td>' + esc(formatDate(t.date)) + '</td>' +
        '<td class="cell-desc">' + esc(t.desc || '—') + '</td>' +
        '<td><span class="tag ' + (isIn ? 'tag--in' : 'tag--out') + '">' + (isIn ? 'دخل' : 'خرج') + '</span></td>' +
        '<td class="amount ' + (isIn ? 'pos' : 'neg') + '">' + (isIn ? '+ ' : '- ') + money(t.amount) + '</td>' +
        '<td class="cell-note">' + (t.note ? esc(t.note) : '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-ledger="' + entry.i + '">حذف</button></td>' +
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
  }

  var ledgerForm = $('#ledgerForm');
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

      var miss = [];
      if (!date) miss.push('التاريخ');
      if (!desc) miss.push('البيان');
      if (!(amount > 0)) miss.push('المبلغ');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
      if (errEl) errEl.hidden = true;

      var list = getLedger();
      list.push({ date: date, type: type, desc: desc, amount: amount, note: note });
      saveLedger(list);

      ledgerForm.reset();
      f.date.value = todayISO();
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

  var ledgerClear = $('#ledgerClear');
  if (ledgerClear && ledgerForm) {
    ledgerClear.addEventListener('click', function () {
      ledgerForm.reset();
      ledgerForm.elements.date.value = todayISO();
      var er = $('#ledgerError');
      if (er) er.hidden = true;
    });
  }

  var ledgerSearch = $('#ledgerSearch');
  if (ledgerSearch) ledgerSearch.addEventListener('input', function () { renderLedger(); });

  var ledgerTypeFilter = $('#ledgerTypeFilter');
  if (ledgerTypeFilter) ledgerTypeFilter.addEventListener('change', function () { renderLedger(); });

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
  renderLedger();
  renderLedgerSummary();

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
      if (raw) return JSON.parse(raw);
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
      var sharesOk = Math.abs(t.share - 100) < 0.001;
      pill.textContent = sharesOk ? 'مجموع الحصص 100%' : ('مجموع الحصص ' + money(t.share) + '% — لازم 100%');
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
      if (!(share > 0)) miss.push('الحصة');
      else if (share > 100) return fail('الحصة لا يمكن أن تتجاوز 100%');
      if (!(capital >= 0)) miss.push('رأس المال');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));
      if (errEl) errEl.hidden = true;

      var list = getPartners();
      var idx = parseInt(f.idx.value, 10);
      var editing = idx >= 0 && !!list[idx];
      var rec = { name: name, role: role, share: share, capital: capital, withdrawals: withdrawals, note: note };
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
  renderPartners();

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
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_ASSOCIATIONS));
  }
  function saveAssociations(list) {
    try { localStorage.setItem(KEY_ASSOCIATIONS, JSON.stringify(list)); } catch (e) {}
  }
  function getMembers() {
    try {
      var raw = localStorage.getItem(KEY_MEMBERS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
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
        '<div class="mini-card__row"><span>اشتراك سنوي</span><b>' + money(a.fee) + '</b></div>' +
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
          '<td><span class="p-actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-edit-member="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-member="' + entry.i + '">حذف</button>' +
          '</span></td>' +
          '</tr>';
      });
      if (!list.length) {
        html = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:26px">' +
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

      var miss = [];
      if (!name) miss.push('اسم الجمعية');
      if (!(fee >= 0)) miss.push('قيمة الاشتراك السنوي');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));

      var list = getAssociations();
      var idx = parseInt(f.idx.value, 10);
      var editing = idx >= 0 && !!list[idx];
      if (editing) {
        if (list.some(function (a, j) { return j !== idx && a.name === name; })) {
          return fail('فيه جمعية بنفس الاسم');
        }
        var oldName = list[idx].name;
        list[idx] = { name: name, fee: fee };
        saveAssociations(list);
        if (oldName !== name) {
          var mem = getMembers();
          var touched = false;
          mem.forEach(function (m) { if (m.assoc === oldName) { m.assoc = name; touched = true; } });
          if (touched) saveMembers(mem);
        }
      } else {
        if (list.some(function (a) { return a.name === name; })) return fail('فيه جمعية بنفس الاسم');
        list.push({ name: name, fee: fee });
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
      var rec = { assoc: assoc, name: name, type: type, fee: fee, paid: paid, note: note };
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

  renderAssociations();

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
      rows: rows,
      summary: [
        { label: 'عدد الدفعات', value: String(count) },
        { label: 'إجمالي الدفعات', value: money(paidSum) },
        { label: 'المتبقي للتحصيل', value: money(restSum) }
      ]
    };
  }

  function reportLedger() {
    var list = getLedger().slice().sort(function (a, b) {
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
      rows.push([i + 1, m.assoc || '', m.name || '', m.type || '', d.fee, d.paid, d.rest, d.status, m.note || '']);
    });
    return {
      title: 'الجمعيات',
      subtitle: 'عدد الجمعيات: ' + getAssociations().length + ' — عدد الأعضاء: ' + members.length,
      columns: ['#', 'الجمعية', 'العضو', 'نوع الاشتراك', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة', 'ملاحظة'],
      moneyCols: [4, 5, 6],
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
    return {
      title: 'ملخّص التطبيق',
      subtitle: 'نظام الإدارة المتكامل — ' + new Date().toLocaleDateString('ar-EG'),
      columns: ['القسم', 'العدد', 'الإجمالي / المستحق', 'المتبقي / الصافي'],
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
    for (var i = 0; i < n; i++) {
      var max = String(report.columns[i] == null ? '' : report.columns[i]).length;
      report.rows.forEach(function (r) {
        var v = r[i];
        var len = typeof v === 'number' ? String(v).length : String(v == null ? '' : v).length;
        if (len > max) max = len;
      });
      out.push(Math.min(46, Math.max(10, Math.round(max * 1.7) + 4)));
    }
    return out;
  }

  function reportToSheet(report) {
    return {
      name: report.title,
      rows: [report.columns].concat(report.rows),
      widths: reportWidths(report)
    };
  }

  function allSheets() {
    return EXPORT_SECTIONS.map(function (s) { return reportToSheet(buildReport(s.key)); });
  }

  /* ---------- تنفيذ التصدير ---------- */
  function doExport(key, kind) {
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      if (kind === 'xlsx') {
        var sheets = key === 'all' ? allSheets() : [reportToSheet(buildReport(key))];
        var bytes = ExportKit.buildXlsx(sheets);
        var fname = 'nizam-' + (key === 'all' ? 'full' : key) + '-' + exportStamp() + '.xlsx';
        if (!ExportKit.downloadBytes(bytes, fname, MIME_XLSX)) {
          toast('تعذّر بدء التحميل في هذه البيئة', true);
          return;
        }
        toast('تم تجهيز ' + fname);
        autoUpload(fname, MIME_XLSX, bytes);
      } else {
        if (!ExportKit.hasCanvas()) {
          toast('تصدير PDF يحتاج متصفحاً حقيقياً', true);
          return;
        }
        var pdf = ExportKit.reportToPdf(buildReport(key));
        if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
        var pf = 'nizam-' + (key === 'all' ? 'summary' : key) + '-' + exportStamp() + '.pdf';
        if (!ExportKit.downloadBytes(pdf, pf, MIME_PDF)) {
          toast('تعذّر بدء التحميل', true);
          return;
        }
        toast('تم تجهيز ' + pf);
        autoUpload(pf, MIME_PDF, pdf);
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

  function applyDriveState(cfg, conn, email) {
    driveState.configured = !!cfg;
    driveState.connected = !!conn;
    var setup = $('#driveSetup'), connect = $('#driveConnect'),
        disconnect = $('#driveDisconnect'), upload = $('#driveUploadLabel'), note = $('#driveNote');
    if (setup) setup.hidden = !!cfg;

    /* الزر دايم ظاهر — معطّل بس لما المفاتيح ناقصة، عشان المستخدم يعرف ناقص إيه */
    if (connect) {
      connect.hidden = false;
      connect.disabled = !(cfg && !conn);
      connect.title = (cfg && !conn)
        ? 'اضغط لاختيار حساب Google وتفويضه'
        : 'أضف المفتاحين GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Sites ← Secrets أولاً';
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
      } else if (!cfg) {
        note.hidden = false;
        note.textContent = 'الزر معطّل مؤقتاً: حطّ GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Sites ← Secrets وأعد النشر، وهيتشغّل فوراً.';
      } else {
        note.hidden = true;
        note.textContent = '';
      }
    }

    if (!cfg) setDriveStatus('is-warn', 'ناقص مفتاحين: GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET — اضيفهم في Sites ← Secrets');
    else if (conn) setDriveStatus('is-ok', 'متصل بحساب Google Drive' + (email ? ' — ' + email : ''));
    else setDriveStatus('', 'المفاتيح مضبوطة — لم يتم ربط حساب بعد');
  }

  function refreshDriveStatus() {
    var redir = $('#driveRedirect');
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    if (redir) redir.textContent = origin + '/api/google/callback';

    if (typeof fetch !== 'function') {
      applyDriveState(false, false, '');
      return;
    }
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (s) { applyDriveState(s && s.configured, s && s.connected, s && s.email); })
      .catch(function () { applyDriveState(false, false, ''); });
  }

  function uploadToDrive(name, mime, b64) {
    return fetch('/api/google/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mime: mime, b64: b64 })
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
    if (!driveState.connected || typeof ExportKit === 'undefined') return;
    var b64 = ExportKit.bytesToBase64(bytes);
    uploadToDrive(name, mime, b64)
      .then(function (r) {
        toast('تم الرفع إلى Google Drive ✓');
        return notifyUploaded(name, mime, b64, r && r.link);
      })
      .then(function (r) { if (r) toast('وصل تنبيه البريد إلى ' + (r.to || 'بريدك') + ' ✓'); })
      .catch(function (e) {
        toast('اتحمّل الملف، بس صار خطأ: ' + (e && e.message ? e.message : e), true);
      });
  }

  var driveConnectBtn = $('#driveConnect');
  if (driveConnectBtn) driveConnectBtn.addEventListener('click', function () {
    if (typeof location !== 'undefined') location.href = '/api/google/login';
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
        if (gq.get('g') === 'ok') toast('تم ربط حساب Google بنجاح ✓');
        else if (gq.get('g') === 'err') toast('تعذّر ربط Google: ' + (gq.get('m') || ''), true);
        if (history && history.replaceState) history.replaceState(null, '', location.pathname);
      }
    }
  } catch (e) {}

  try {
    var notifyEl = $('#driveNotifyTo');
    if (notifyEl) notifyEl.value = localStorage.getItem('app_drive_notify_to') || '';
  } catch (e) {}

  renderExportGrid();
  refreshDriveStatus();

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
    app_members: 'أعضاء الجمعيات'
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

  function applySnapshot(snap) {
    backupLocal('قبل استبدال المزامنة');
    var secs = (snap && snap.sections) || {};
    var applied = 0;
    SYNC_KEYS.forEach(function (k) {
      if (typeof secs[k] === 'string') { localStorage.setItem(k, secs[k]); applied++; }
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
        if (!r.ok || !j.ok) throw new Error((j && j.error) || 'فشلت عملية المزامنة');
        return j;
      });
    });
  }

  /* ---------- رفع نسخة الآن ---------- */
  function syncPush(auto) {
    if (syncBusy) return Promise.resolve(null);
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
      syncSetState('is-ok', 'آخر رفع: ' + new Date().toLocaleString('ar-EG') +
        (r.emailed ? ' — وصل التنبيه إلى ' + r.emailedTo : ''));
      syncShowNote('اترفع ' + (changes.length ? changes.join(' · ') : 'بدون تغييرات مسجّلة') + '.', false);
      if (!auto) toast('تم رفع نسخة المزامنة ✓');
      return r;
    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الرفع: ' + (e && e.message ? e.message : e), true);
        toast('فشل رفع المزامنة: ' + (e && e.message ? e.message : e), true);
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

      if (meta && meta.updatedAt && remoteAt && remoteAt < meta.updatedAt) {
        syncSetState('is-warn', 'نسختك المحلية أحدث من البعيدة — ارفع نسخة لتحديثها');
        syncBusy = false;
        return pull;
      }

      var policy = syncPolicy();
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
        toast('فشل فحص المزامنة: ' + (e && e.message ? e.message : e), true);
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
    syncShowNote('اتحفظت نسخة احتياطية من بياناتك القديمة. لو رجعت غلط، اضغط «تراجع عن آخر استبدال».', false);
    toast('تم تحديث البيانات من الدرايف ✓');
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

  function loadSyncFolder() {
    if (typeof fetch !== 'function') return Promise.resolve();
    return fetch('/api/sync/folder').then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) {
        if (syncFolderInput && j.customFolder) {
          syncFolderInput.value = j.customFolder;
          if (syncFolderClear) syncFolderClear.hidden = false;
          syncFolderShow('الفولدر المشترك مضبوط: ' + j.customFolder, true);
        } else if (syncFolderInput && j.autoFolder) {
          syncFolderInput.value = '';
          if (syncFolderClear) syncFolderClear.hidden = true;
          syncFolderShow('الفولدر التلقائي مضبوط — «نظام الإدارة — المزامنة»', true);
        }
      }
    }).catch(function () {});
  }
  loadSyncFolder();

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
          toast('اتحفظ الفولدر المشترك ✓');
          syncFolderShow('الفولدر المشترك مضبوط: ' + j.folderId, true);
          if (syncFolderClear) syncFolderClear.hidden = false;
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
        if (syncFolderInput) syncFolderInput.value = '';
        syncFolderClear.hidden = true;
        syncFolderShow('اترجع للفولدر التلقائي', true);
        toast('اتحذف الفولدر المشترك');
      }).catch(function () { toast('خطأ في الاتصال', true); });
    });
  }

  function startSyncTimers() {
    if (syncTimerPush || syncTimerCheck || typeof setInterval !== 'function') return;
    syncTimerCheck = setInterval(function () { syncCheck(true); }, SYNC_CHECK_MS);
    syncTimerPush = setInterval(function () { syncPush(true); }, SYNC_PUSH_MS);
  }

  /* ---------- الإقلاع ---------- */
  renderHomeStats();
  renderCustomers();
  showView('home');
})();
