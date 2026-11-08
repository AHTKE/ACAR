/* ============================================================
   employees.js — قسم الموظفين
   ------------------------------------------------------------
   • إضافة/تعديل/حذف موظف مع رقم ووظيفة وبيانات إضافية مخصّصة.
   • مرتب شهري ويوم صرف + سلف/مكافآت/استرداد بتاريخ وملاحظة.
   • كل حركة (مرتب/سلفة/مكافأة/استرداد) تظهر تلقائيًا في
     «الدواخل والخوارج» من خلال autoCashOps في app.js.
   • لا يكتب هذا الملف في app_ledger مباشرة؛ الموظفون هم المصدر
     الوحيد لحركاتهم، وبالتالي الحذف لا يترك قيدًا مزدوجًا.
   ============================================================ */
(function (root) {
  'use strict';

  var KEY = 'app_employees';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Number(n || 0);
    if (!isFinite(n)) n = 0;
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function monthOf(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})/);
    return m ? m[1] + '-' + m[2] : '';
  }
  function currentMonth() { return monthOf(todayISO()); }
  function uid() { return 'emp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function txid() { return 'etx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function normalize(e) {
    if (!e || typeof e !== 'object') return null;
    if (!Array.isArray(e.transactions)) e.transactions = [];
    if (!e.custom || typeof e.custom !== 'object' || Array.isArray(e.custom)) e.custom = {};
    if (!e.id) e.id = uid();
    e.name = String(e.name || '').trim();
    e.phone = String(e.phone || '').trim();
    e.job = String(e.job || '').trim();
    e.address = String(e.address || '').trim();
    e.status = String(e.status || 'على رأس العمل');
    e.notes = String(e.notes || '');
    e.salary = Number(e.salary || 0);
    e.payDay = parseInt(e.payDay, 10) || 0;
    e.transactions = e.transactions.filter(function (t) { return t && typeof t === 'object'; }).map(function (t) {
      t.amount = Number(t.amount || 0);
      t.type = String(t.type || 'salary');
      t.id = String(t.id || txid());
      return t;
    });
    return e;
  }

  function getEmployees() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.map(normalize).filter(Boolean);
      }
    } catch (e) {}
    return [];
  }
  function saveEmployees(list) {
    try { localStorage.setItem(KEY, JSON.stringify((list || []).map(normalize).filter(Boolean))); } catch (e) {}
  }

  var state = { q: '', editId: '', openId: '', customSeed: 0 };

  function monthDueDate(e, base) {
    if (!(e.salary > 0) || !e.payDay) return '';
    var d = base ? new Date(base) : new Date();
    var y = d.getFullYear(), m = d.getMonth();
    var dim = new Date(y, m + 1, 0).getDate();
    return y + '-' + pad(m + 1) + '-' + pad(Math.min(e.payDay, dim));
  }
  function salaryInfo(e) {
    var mk = currentMonth();
    var paid = 0, advances = 0, bonuses = 0, refunds = 0;
    (e.transactions || []).forEach(function (t) {
      var a = Number(t.amount || 0);
      if (t.type === 'salary' && monthOf(t.date) === mk) paid += a;
      if (t.type === 'advance') advances += a;
      if (t.type === 'bonus') bonuses += a;
      if (t.type === 'refund') refunds += a;
    });
    var remaining = Math.max(Number(e.salary || 0) - paid, 0);
    var due = monthDueDate(e);
    var today = todayISO();
    var status = 'none';
    if (e.salary > 0) {
      if (remaining <= 0) status = 'paid';
      else if (due && today > due) status = 'late';
      else status = 'due';
    }
    return { paid: paid, remaining: remaining, advances: advances, bonuses: bonuses, refunds: refunds, due: due, status: status };
  }

  function statusPill(e) {
    var s = salaryInfo(e);
    if (s.status === 'paid') return '<span class="tag tag--in">مدفوع هذا الشهر</span>';
    if (s.status === 'late') return '<span class="tag tag--out">متأخر</span>';
    if (s.status === 'due') return '<span class="tag tag--warn">مستحق' + (s.due ? ' ' + s.due.slice(8, 10) + '/' + s.due.slice(5, 7) : '') + '</span>';
    return '<span class="tag">بدون مرتب</span>';
  }

  function inject() {
    if (document.getElementById('view-employees')) return;
    var host = document.getElementById('view-stores');
    if (!host || !host.parentNode) return;
    var html = '' +
      '<section class="view" id="view-employees">' +
        '<div class="page-head">' +
          '<button class="back-btn" data-go="home"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-back"/></svg> رجوع</button>' +
          '<div class="page-head__title">' +
            '<span class="card__icon card__icon--green sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-users"/></svg></span>' +
            '<div><h2>الموظفين</h2><p>بيانات الموظفين والمرتبات والسلف — مرتبطة تلقائيًا بالدواخل والخوارج</p></div>' +
          '</div>' +
          '<div class="form__actions" style="margin:0"><button type="button" class="btn btn--primary btn--sm" id="empAddBtn">＋ إضافة موظف</button></div>' +
        '</div>' +
        '<div class="summary summary--4" id="empSummary"></div>' +
        '<div class="panel">' +
          '<div class="search-bar">' +
            '<div class="field field--search"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-search"/></svg>' +
              '<input type="text" id="empSearch" placeholder="ابحث بالاسم أو الهاتف أو الوظيفة…" /></div>' +
            '<span class="count-pill" id="empCount">0 موظف</span>' +
          '</div>' +
          '<div class="table-wrap"><table class="table" id="employeesTable">' +
            '<thead><tr><th>#</th><th>الموظف</th><th>الهاتف</th><th>الوظيفة</th><th>المرتب</th><th>حالة الشهر</th><th>مدفوع هذا الشهر</th><th style="width:200px">إجراءات</th></tr></thead>' +
            '<tbody id="empTbody"></tbody>' +
          '</table></div>' +
        '</div>' +
        '<div class="panel" id="empFormPanel" hidden>' +
          '<h3 class="panel__title" id="empFormTitle">إضافة موظف</h3>' +
          '<form id="employeeForm" class="form" novalidate>' +
            '<input type="hidden" name="id" />' +
            '<div class="form__row form__row--3">' +
              '<label class="field"><span>اسم الموظف *</span><input type="text" name="name" required placeholder="مثال: محمد أحمد" /></label>' +
              '<label class="field"><span>رقم الهاتف *</span><input type="tel" name="phone" required placeholder="01xxxxxxxxx" /></label>' +
              '<label class="field"><span>الوظيفة</span><input type="text" name="job" placeholder="مثال: نجار / محاسب" /></label>' +
            '</div>' +
            '<div class="form__row form__row--3">' +
              '<label class="field"><span>المرتب الشهري</span><input type="number" name="salary" min="0" step="any" placeholder="0" /></label>' +
              '<label class="field"><span>يوم صرف المرتب</span><input type="number" name="payDay" min="1" max="31" step="1" placeholder="مثال: 5" /></label>' +
              '<label class="field"><span>تاريخ بدء العمل</span><input type="date" name="startDate" /></label>' +
            '</div>' +
            '<div class="form__row form__row--3">' +
              '<label class="field"><span>الحالة</span><select name="status"><option>على رأس العمل</option><option>موقوف</option><option>منتهي</option></select></label>' +
              '<label class="field"><span>العنوان</span><input type="text" name="address" placeholder="المدينة / المنطقة" /></label>' +
              '<label class="field"><span>ملاحظات</span><input type="text" name="notes" placeholder="أي ملاحظات عن الموظف" /></label>' +
            '</div>' +
            '<div class="field field--full">' +
              '<span>بيانات إضافية مخصّصة</span>' +
              '<div id="empCustomRows"></div>' +
              '<div class="form__actions" style="margin:8px 0 0"><button type="button" class="btn btn--ghost btn--sm" id="empCustomAdd">＋ إضافة بيان</button></div>' +
            '</div>' +
            '<p class="form__error" id="empFormError" hidden></p>' +
            '<div class="form__actions">' +
              '<button type="submit" class="btn btn--primary"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"/></svg> حفظ الموظف</button>' +
              '<button type="button" class="btn btn--ghost" id="empFormCancel">إلغاء</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
        '<div class="panel" id="empDetail" hidden></div>' +
      '</section>';
    host.insertAdjacentHTML('afterend', html);

    /* كارت في الرئيسية */
    var storesCard = document.querySelector('button.card[data-go="stores"]');
    if (storesCard && !document.querySelector('button.card[data-go="employees"]')) {
      storesCard.insertAdjacentHTML('afterend',
        '<button class="card" data-go="employees">' +
          '<span class="card__icon card__icon--green"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-users"/></svg></span>' +
          '<span class="card__body"><span class="card__title">الموظفين</span>' +
          '<span class="card__desc">بيانات الموظفين والمرتبات والسلف — مرتبطة بالدواخل والخوارج</span></span>' +
          '<span class="card__meta"><b id="cardEmployees">0</b> موظف مسجّل</span>' +
          '<span class="card__arrow"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-arrow"/></svg></span>' +
        '</button>');
    }
  }

  function addCustomRow(key, val) {
    var box = document.getElementById('empCustomRows');
    if (!box) return;
    var row = document.createElement('div');
    row.className = 'custom-row emp-custom-row';
    row.innerHTML = '<input type="text" data-custom-key placeholder="اسم البيان (مثال: رقم التأمين)" value="' + esc(key || '') + '" />' +
      '<input type="text" data-custom-val placeholder="القيمة" value="' + esc(val || '') + '" />' +
      '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-custom-remove title="حذف البيان">×</button>';
    box.appendChild(row);
  }
  function fillCustom(custom) {
    var box = document.getElementById('empCustomRows');
    if (!box) return;
    box.innerHTML = '';
    var keys = Object.keys(custom || {});
    if (!keys.length) addCustomRow('', '');
    else keys.forEach(function (k) { addCustomRow(k, custom[k]); });
  }
  function readCustom() {
    var out = {};
    $$('#empCustomRows .emp-custom-row').forEach(function (row) {
      var k = row.querySelector('[data-custom-key]');
      var v = row.querySelector('[data-custom-val]');
      k = String(k && k.value || '').trim();
      v = String(v && v.value || '').trim();
      if (k) out[k] = v;
    });
    return out;
  }

  function openForm(emp) {
    var box = document.getElementById('empFormPanel');
    var form = document.getElementById('employeeForm');
    if (!box || !form) return;
    var f = form.elements;
    f.id.value = emp && emp.id || '';
    f.name.value = emp && emp.name || '';
    f.phone.value = emp && emp.phone || '';
    f.job.value = emp && emp.job || '';
    f.salary.value = emp && emp.salary ? emp.salary : '';
    f.payDay.value = emp && emp.payDay ? emp.payDay : '';
    f.startDate.value = emp && emp.startDate || '';
    f.status.value = emp && emp.status || 'على رأس العمل';
    f.address.value = emp && emp.address || '';
    f.notes.value = emp && emp.notes || '';
    fillCustom(emp && emp.custom || {});
    document.getElementById('empFormTitle').textContent = emp ? 'تعديل بيانات الموظف' : 'إضافة موظف';
    var err = document.getElementById('empFormError');
    if (err) err.hidden = true;
    box.hidden = false;
    if (box.scrollIntoView) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function closeForm() {
    var box = document.getElementById('empFormPanel');
    if (box) box.hidden = true;
    state.editId = '';
  }

  function txLabel(type) {
    return type === 'salary' ? 'مرتب' : type === 'advance' ? 'سلفة' : type === 'bonus' ? 'مكافأة' : 'استرداد';
  }
  function txTag(type) {
    return type === 'refund' ? '<span class="tag tag--in">دخل</span>' : '<span class="tag tag--out">خرج</span>';
  }

  function renderDetail(e) {
    var box = document.getElementById('empDetail');
    if (!box) return;
    if (!e) { box.hidden = true; box.innerHTML = ''; return; }
    var s = salaryInfo(e);
    var txs = (e.transactions || []).slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || ''));
    });
    var rows = txs.map(function (t) {
      return '<tr>' +
        '<td>' + esc(t.date ? t.date.split('-').reverse().join('/') : '—') + '</td>' +
        '<td>' + esc(txLabel(t.type)) + '</td>' +
        '<td class="amount ' + (t.type === 'refund' ? 'pos' : 'neg') + '">' + money(t.amount) + '</td>' +
        '<td>' + esc(t.note || '—') + '</td>' +
        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-emp-tx-del="' + esc(t.id) + '">حذف</button></td>' +
      '</tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:22px">لا توجد حركات مرتبات أو سلف بعد.</td></tr>';
    var custom = Object.keys(e.custom || {}).map(function (k) {
      return '<div class="info-item"><span>' + esc(k) + '</span><b>' + esc(e.custom[k]) + '</b></div>';
    }).join('');
    box.innerHTML = '' +
      '<div class="page-head" style="margin:0 0 12px">' +
        '<div class="page-head__title"><span class="card__icon card__icon--green sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-users"/></svg></span>' +
          '<div><h3 style="margin:0">' + esc(e.name || 'موظف') + '</h3><p>' + esc(e.job || 'بدون وظيفة') + ' — ' + esc(e.phone || 'بدون رقم') + '</p></div></div>' +
        '<div class="form__actions" style="margin:0"><button type="button" class="btn btn--ghost btn--sm" data-emp-edit="' + esc(e.id) + '">تعديل البيانات</button>' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-emp-del="' + esc(e.id) + '">حذف الموظف</button></div>' +
      '</div>' +
      '<div class="summary summary--4" style="margin-bottom:14px">' +
        '<div class="summary__box"><small>المرتب الشهري</small><b>' + money(e.salary) + '</b><span>' + (e.payDay ? 'يوم ' + e.payDay : 'بدون يوم') + '</span></div>' +
        '<div class="summary__box summary__box--in"><small>مدفوع هذا الشهر</small><b>' + money(s.paid) + '</b><span>' + esc(statusText(s.status)) + '</span></div>' +
        '<div class="summary__box summary__box--out"><small>المتبقي من مرتب الشهر</small><b>' + money(s.remaining) + '</b><span>' + (s.due ? 'استحقاق ' + s.due.split('-').reverse().join('/') : '—') + '</span></div>' +
        '<div class="summary__box summary__box--net"><small>إجمالي السلف والمكافآت</small><b>' + money(s.advances + s.bonuses) + '</b><span>سلف ' + money(s.advances) + ' · مكافآت ' + money(s.bonuses) + '</span></div>' +
      '</div>' +
      '<div class="info-list" style="margin-bottom:14px">' +
        '<div class="info-item"><span>الحالة الوظيفية</span><b>' + esc(e.status || '—') + '</b></div>' +
        '<div class="info-item"><span>تاريخ بدء العمل</span><b>' + esc(e.startDate ? e.startDate.split('-').reverse().join('/') : '—') + '</b></div>' +
        '<div class="info-item"><span>العنوان</span><b>' + esc(e.address || '—') + '</b></div>' +
        '<div class="info-item"><span>ملاحظات</span><b>' + esc(e.notes || '—') + '</b></div>' +
        (custom || '<div class="info-item"><span>بيانات إضافية</span><b>—</b></div>') +
      '</div>' +
      '<div class="panel" style="margin:0 0 14px;padding:14px">' +
        '<h4 style="margin:0 0 10px">إضافة حركة مرتب / سلفة</h4>' +
        '<form id="employeeTxForm" class="form" novalidate>' +
          '<div class="form__row form__row--3">' +
            '<label class="field"><span>التاريخ *</span><input type="date" name="date" value="' + todayISO() + '" required /></label>' +
            '<label class="field"><span>النوع *</span><select name="type"><option value="salary">مرتب</option><option value="advance">سلفة</option><option value="bonus">مكافأة</option><option value="refund">استرداد من الموظف</option></select></label>' +
            '<label class="field"><span>المبلغ *</span><input type="number" name="amount" min="0" step="any" required placeholder="0" /></label>' +
          '</div>' +
          '<div class="form__row"><label class="field field--full"><span>ملاحظة</span><input type="text" name="note" placeholder="مثال: مرتب شهر نوفمبر / سلفة بداية الشهر" /></label></div>' +
          '<p class="form__error" id="empTxError" hidden></p>' +
          '<div class="form__actions"><button type="submit" class="btn btn--primary btn--sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"/></svg> إضافة الحركة</button></div>' +
        '</form>' +
      '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th style="width:64px"></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    box.hidden = false;
  }
  function statusText(s) {
    return s === 'paid' ? 'مدفوع' : s === 'late' ? 'متأخر' : s === 'due' ? 'مستحق' : 'بدون مرتب';
  }

  function render() {
    var list = getEmployees();
    var q = state.q.trim();
    var filtered = q ? list.filter(function (e) {
      return (e.name + ' ' + e.phone + ' ' + e.job + ' ' + e.address).indexOf(q) > -1;
    }) : list;
    var totalSalary = 0, totalPaid = 0, totalAdv = 0;
    list.forEach(function (e) {
      var s = salaryInfo(e);
      totalSalary += Number(e.salary || 0);
      totalPaid += s.paid;
      totalAdv += s.advances;
    });
    var sum = document.getElementById('empSummary');
    if (sum) {
      sum.innerHTML =
        '<div class="summary__box"><small>عدد الموظفين</small><b>' + list.length + '</b><span>' + filtered.length + ' ظاهر</span></div>' +
        '<div class="summary__box summary__box--in"><small>إجمالي المرتبات الشهرية</small><b>' + money(totalSalary) + '</b><span>التزام شهري</span></div>' +
        '<div class="summary__box summary__box--out"><small>مدفوع مرتبات هذا الشهر</small><b>' + money(totalPaid) + '</b><span>من الشهر الحالي</span></div>' +
        '<div class="summary__box summary__box--net"><small>إجمالي السلف</small><b>' + money(totalAdv) + '</b><span>مسجّلة كخوارج</span></div>';
    }
    var tb = document.getElementById('empTbody');
    if (tb) {
      tb.innerHTML = filtered.map(function (e, i) {
        var s = salaryInfo(e);
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><button type="button" class="link-btn" data-emp-open="' + esc(e.id) + '">' + esc(e.name || 'بدون اسم') + '</button></td>' +
          '<td>' + esc(e.phone || '—') + '</td>' +
          '<td>' + esc(e.job || '—') + '</td>' +
          '<td class="amount">' + money(e.salary) + '</td>' +
          '<td>' + statusPill(e) + '</td>' +
          '<td class="amount">' + money(s.paid) + '</td>' +
          '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm" data-emp-open="' + esc(e.id) + '">فتح</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-emp-edit="' + esc(e.id) + '">تعديل</button>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-emp-del="' + esc(e.id) + '">حذف</button></td>' +
        '</tr>';
      }).join('');
      if (!filtered.length) tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:26px">' +
        (q ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون بعد — اضغط «إضافة موظف» وابدأ.') + '</td></tr>';
    }
    var cnt = document.getElementById('empCount');
    if (cnt) cnt.textContent = filtered.length + ' موظف';
    var cc = document.getElementById('cardEmployees');
    if (cc) cc.textContent = list.length;
    var open = state.openId ? list.filter(function (e) { return e.id === state.openId; })[0] : null;
    if (!open) state.openId = '';
    renderDetail(open || null);
  }

  function findEmployee(id) {
    return getEmployees().filter(function (e) { return e.id === id; })[0] || null;
  }
  function updateEmployee(emp) {
    var list = getEmployees();
    var i = list.map(function (e) { return e.id; }).indexOf(emp.id);
    if (i > -1) list[i] = emp; else list.unshift(emp);
    saveEmployees(list);
    state.openId = emp.id;
    render();
    if (root.NizamApp && root.NizamApp.toast) root.NizamApp.toast('تم حفظ بيانات الموظف ✓');
  }
  function refreshLedger() {
    if (root.NizamApp && root.NizamApp.refreshLedger) {
      try { root.NizamApp.refreshLedger(); } catch (e) {}
    }
  }

  function bind() {
    var view = document.getElementById('view-employees');
    if (!view) return;
    view.addEventListener('click', function (ev) {
      var t = ev.target;
      var add = t.closest ? t.closest('#empAddBtn') : null;
      if (add) { openForm(null); return; }
      var cancel = t.closest ? t.closest('#empFormCancel') : null;
      if (cancel) { closeForm(); return; }
      var addC = t.closest ? t.closest('#empCustomAdd') : null;
      if (addC) { addCustomRow('', ''); return; }
      var remC = t.closest ? t.closest('[data-custom-remove]') : null;
      if (remC) { var row = remC.closest('.emp-custom-row'); if (row) row.remove(); return; }
      var open = t.closest ? t.closest('[data-emp-open]') : null;
      if (open) { state.openId = open.getAttribute('data-emp-open'); render(); var d = document.getElementById('empDetail'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      var edit = t.closest ? t.closest('[data-emp-edit]') : null;
      if (edit) { openForm(findEmployee(edit.getAttribute('data-emp-edit'))); return; }
      var del = t.closest ? t.closest('[data-emp-del]') : null;
      if (del) {
        var id = del.getAttribute('data-emp-del');
        var e = findEmployee(id);
        if (!e) return;
        if (!root.confirm('حذف الموظف «' + e.name + '» وكل حركاته؟')) return;
        saveEmployees(getEmployees().filter(function (x) { return x.id !== id; }));
        if (state.openId === id) state.openId = '';
        if (state.editId === id) closeForm();
        render();
        refreshLedger();
        if (root.NizamApp && root.NizamApp.toast) root.NizamApp.toast('تم حذف الموظف وحركاته من الخزنة');
        return;
      }
      var txDel = t.closest ? t.closest('[data-emp-tx-del]') : null;
      if (txDel) {
        var txId = txDel.getAttribute('data-emp-tx-del');
        var emp = findEmployee(state.openId);
        if (!emp) return;
        if (!root.confirm('حذف هذه الحركة من سجل الموظف ومن الدواخل والخوارج؟')) return;
        emp.transactions = (emp.transactions || []).filter(function (x) { return x.id !== txId; });
        saveEmployees(getEmployees().map(function (x) { return x.id === emp.id ? emp : x; }));
        render();
        refreshLedger();
        if (root.NizamApp && root.NizamApp.toast) root.NizamApp.toast('تم حذف الحركة');
      }
    });

    var search = document.getElementById('empSearch');
    if (search) search.addEventListener('input', function () { state.q = this.value; render(); });

    var form = document.getElementById('employeeForm');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var err = document.getElementById('empFormError');
      var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
      var name = String(f.name.value || '').trim();
      var phone = String(f.phone.value || '').trim();
      if (!name) return fail('اسم الموظف مطلوب');
      if (!phone) return fail('رقم الهاتف مطلوب');
      var salary = parseFloat(f.salary.value) || 0;
      var payDay = parseInt(f.payDay.value, 10) || 0;
      if (salary < 0) return fail('المرتب لا يكون سالبًا');
      if (payDay && (payDay < 1 || payDay > 31)) return fail('يوم الصرف من 1 إلى 31');
      var existing = findEmployee(String(f.id.value || ''));
      var entry = normalize({
        id: existing ? existing.id : uid(),
        name: name, phone: phone, job: String(f.job.value || '').trim(),
        salary: salary, payDay: payDay,
        startDate: String(f.startDate.value || ''),
        status: String(f.status.value || 'على رأس العمل'),
        address: String(f.address.value || '').trim(),
        notes: String(f.notes.value || '').trim(),
        custom: readCustom(),
        transactions: existing ? existing.transactions : []
      });
      if (err) err.hidden = true;
      updateEmployee(entry);
      state.editId = '';
      closeForm();
      refreshLedger();
    });

    view.addEventListener('submit', function (ev) {
      var txForm = ev.target;
      if (!txForm || txForm.id !== 'employeeTxForm') return;
      ev.preventDefault();
      var emp = findEmployee(state.openId);
      if (!emp) return;
      var e = txForm.elements;
      var amount = parseFloat(e.amount.value) || 0;
      var date = String(e.date.value || '');
      var type = String(e.type.value || 'salary');
      var err = document.getElementById('empTxError');
      var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
      if (!date) return fail('التاريخ مطلوب');
      if (!(amount > 0)) return fail('المبلغ يجب أن يكون أكبر من صفر');
      emp.transactions.push({ id: txid(), date: date, type: type, amount: amount, note: String(e.note.value || '').trim() });
      saveEmployees(getEmployees().map(function (x) { return x.id === emp.id ? emp : x; }));
      render();
      refreshLedger();
      if (root.NizamApp && root.NizamApp.toast) root.NizamApp.toast('تم تسجيل ' + txLabel(type) + ' ' + money(amount) + ' — ظهر في الدواخل والخوارج');
    });
  }

  inject();
  bind();
  root.EmployeesUI = { render: render, getEmployees: getEmployees };
  root.EmployeesData = { getEmployees: getEmployees, saveEmployees: saveEmployees, KEY: KEY };
  try { if (document.getElementById('empTbody')) render(); } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
