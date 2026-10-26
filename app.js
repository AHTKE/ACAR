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
        '<div class="summary__box summary__box--in"><small>إجمالي المدفوع (مقدم + تحصيل)</small><b>' + money(d.paid) + '</b></div>' +
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

  /* ---------- الإقلاع ---------- */
  renderHomeStats();
  renderCustomers();
  showView('home');
})();

/* ---------- التحصيل (Collection) ---------- */
function renderCollection(filter) {
  var tbody = $('#collectTbody');
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
    var d = derive(c);
    var tr = document.createElement('tr');
    tr.setAttribute('data-idx', entry.i);
    tr.classList.add('collection-row');
    var bal = Number(c.balance || 0);
    var paidByUs = Number(c.paidByUs || 0);
    var sendSum = d.sendSum || 0;
    var sendBal = d.sendBal || 0;
    var works = uniqueWorks(d.sends || []);
    var worksCountVal = worksCount(d.sends || []);
    var total = Number(c.total || 0);
    var down = Number(c.down || 0);
    var due = c.due != null ? Number(c.due) : Math.max(total - down, 0);
    var later = Number(c.later || 0);
    var rest = Math.max(due - later, 0);
    var n = parseFloat(String(c.duration || '').match(/\d+/) || [0])[0];
    var unit = String(c.duration || "").match(/\d+/) || [""];
    var sends = c.sends || [];
    var paidPays = 0;
    sends.forEach(function (p) { paidPays += Number(p.amount || 0); });
    var html = '<td>' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(c.name) + '</td>' +
      '<td>' + escapeHtml(c.phone || '—') + '</td>' +
      '<td>' + escapeHtml(c.address || '—') + '</td>' +
      '<td class="amount ' + (rest > 0 ? 'neg' : rest < 0 ? 'pos' : '') + '">' + fmt(rest) + '</td>' +
      '<td>' + (sends.length > 0 ? '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-exchange"></svg>' : '') + '</td>';
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:26px">لا توجد نتائج مطابقة</td></tr>';
  }
  var countEl = $('#collectionCount');
  if (countEl) countEl.textContent = list.length + ' عميل';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/\"/g, '"');
}

function uniqueWorks(sends) {
  var out = [];
  sends.forEach(function (s) {
    var w = String(s.work || '').trim();
    if (w && out.indexOf(w) === -1) out.push(w);
  });
  return out;
}

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

/* إضافة معالج البحث في التحصيل */
var collectionSearch = $('#collectionSearch');
if (collectionSearch) {
  collectionSearch.addEventListener('input', function () {
    renderCollection(this.value);
  });
}

/* جعل صفوف العملاء قابلة للنقر في التحصيل */
document.addEventListener('click', function (e) {
  var el = e.target.closest('.collection-row');
  if (el) {
    var idx = Number(el.getAttribute('data-idx'));
    openProfile(idx);
  }
});

// Initialize
renderCollection();
