/* تعديلات: حقول مخصّصة + تأكيدات المورد + تصديره + اقتراح الطرف + العمليات التلقائية */
const fs = require('fs');
const F = 'app.js';
let src = fs.readFileSync(F, 'utf8');
let done = 0;

function rep(oldStr, newStr, all) {
  const first = src.indexOf(oldStr);
  if (first === -1) throw new Error('pattern not found: ' + oldStr.slice(0, 90));
  if (!all && src.indexOf(oldStr, first + 1) !== -1) throw new Error('pattern not unique: ' + oldStr.slice(0, 90));
  src = src.split(oldStr).join(newStr);
  if (!all) {
    const count = newStr === '' ? 0 : 1;
    void count;
  }
  done++;
}
function insertBefore(anchor, text) {
  const i = src.indexOf(anchor);
  if (i === -1) throw new Error('anchor not found: ' + anchor.slice(0, 90));
  if (src.indexOf(anchor, i + 1) !== -1) throw new Error('anchor not unique: ' + anchor.slice(0, 90));
  src = src.slice(0, i) + text + src.slice(i);
  done++;
}

/* ============ 1) محرك الحقول المخصّصة ============ */
insertBefore(
  `  var form = $('#customerForm');
  var notes = [];`,
  `  var form = $('#customerForm');
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
`
);

/* ============ 2) العميل: تحقق + حفظ + تعديل + البروفايل ============ */
rep(
  `    if (total > 0 && down > total) {
      out.push({ key: 'down', label: 'المبلغ المدفوع (المقدم) لا يمكن أن يتجاوز المبلغ الإجمالي' });
    }
    return out;
  }`,
  `    if (total > 0 && down > total) {
      out.push({ key: 'down', label: 'المبلغ المدفوع (المقدم) لا يمكن أن يتجاوز المبلغ الإجمالي' });
    }
    missingCustom('customers', form).forEach(function (m) { out.push(m); });
    return out;
  }`
);

rep(
  `      paidByUs: parseFloat(f.paidByUs.value) || 0,
      balance: rest
    };`,
  `      paidByUs: parseFloat(f.paidByUs.value) || 0,
      balance: rest,
      custom: collectCustomValues('customers', form)
    };`
);

rep(`      notes = [];
      renderNotes();`,
  `      notes = [];
      renderNotes();
      fillCustomValues('customers', {}, form);`);

rep(`    notes = [];
    renderNotes();`,
  `    notes = [];
    renderNotes();
    fillCustomValues('customers', {}, form);`, true);

rep(`    editingCustomerIdx = idx;`,
  `    editingCustomerIdx = idx;
    fillCustomValues('customers', c.custom || {}, form);`);

rep(
  `      infoItem('تاريخ الانتهاء', c.endDate ? formatDate(c.endDate) : 'لم يكتمل بعد');`,
  `      infoItem('تاريخ الانتهاء', c.endDate ? formatDate(c.endDate) : 'لم يكتمل بعد') + customInfoHtml(c);`
);

rep(
  `      ['سنة الانتهاء', c.endYear || '']
    ];`,
  `      ['سنة الانتهاء', c.endYear || '']
    ];
    getCustomFields('customers').forEach(function (cf) {
      info.push([cf.name, (c.custom && c.custom[cf.name]) || '']);
    });`
);

/* ============ 3) المورد: تأكيد التعديل/الحذف + Excel/PDF ============ */
rep(
  `  var supEditBtn = $('#supEditBtn');
  if (supEditBtn) supEditBtn.addEventListener('click', function () { startSupplierEdit(currentSupIdx); });`,
  `  var supEditBtn = $('#supEditBtn');
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
  });`
);

rep(
  `  var supDeleteBtn = $('#supDeleteBtn');
  var supDeleteArmed = false;
  var supDeleteTimer = null;
  if (supDeleteBtn) {
    supDeleteBtn.addEventListener('click', function () {
      var list = getSuppliers();
      var s = list[currentSupIdx];
      var btn = this;
      if (!s) { toast('المورد غير موجود', true); return; }
      if (!supDeleteArmed) {
        supDeleteArmed = true;
        btn.textContent = 'اضغط مجدداً للتأكيد';
        clearTimeout(supDeleteTimer);
        supDeleteTimer = setTimeout(function () {
          supDeleteArmed = false;
          btn.textContent = 'حذف المورد';
        }, 4000);
        toast('اضغط مرة أخرى لتأكيد حذف «' + (s.name || '') + '»', true);
        return;
      }
      supDeleteArmed = false;
      clearTimeout(supDeleteTimer);
      btn.textContent = 'حذف المورد';
      var name = s.name || '';
      list.splice(currentSupIdx, 1);
      saveSuppliers(list);
      renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
      showView('suppliers');
      toast('تم حذف المورد «' + name + '»');
    });
  }`,
  `  var supDeleteBtn = $('#supDeleteBtn');
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
    var tx = [['التاريخ', 'رقم الإيصال', 'البيان', 'ورّد إلى', 'الوارد', 'المدفوع', 'الباقي', 'ملاحظات']];
    var running = 0;
    d.tx.forEach(function (t) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });
    return [
      { name: 'بيانات المورد', rows: info, widths: [28, 46] },
      { name: 'الملخص', rows: sum, widths: [40, 22] },
      { name: 'الحركات', rows: tx, widths: [16, 12, 36, 24, 16, 16, 16, 30] }
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
  });`
);

/* ============ 4) الدواخل والخوارج: عمليات تلقائية + اقتراح الطرف + حقول مخصّصة ============ */
insertBefore(
  `  var ledgerForm = $('#ledgerForm');`,
  `  /* ---------- العمليات النقدية التلقائية ---------- */
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

  var ledgerForm = $('#ledgerForm');`
);

/* ledgerTotals يشمل التلقائي حسب المبدّل */
rep(
  `  function ledgerTotals() {
    var list = getLedger(), inc = 0, out = 0;`,
  `  function ledgerTotals(includeAuto) {
    var list = getLedger().slice();
    if (includeAuto === undefined ? ledgerAutoOn() : includeAuto) list = list.concat(autoCashOps());
    var inc = 0, out = 0;`
);

/* renderLedger: دمج التلقائي + وسم + إخفاء أزرار التعديل/حذف */
rep(
  `    var list = getLedger().map(function (t, i) { return { t: t, i: i }; });
    if (tf) list = list.filter(function (x) { return x.t.type === tf; });`,
  `    var showAuto = ledgerAutoOn();
    var list = getLedger().map(function (t, i) { return { t: t, i: i, auto: false }; });
    if (showAuto) autoCashOps().forEach(function (o) { list.push({ t: o, i: -1, auto: true }); });
    if (tf) list = list.filter(function (x) { return x.t.type === tf; });`
);

rep(
  `      html += '<tr data-ledger-idx="' + entry.i + '">' +`,
  `      html += '<tr' + (entry.auto ? ' data-ledger-auto="1"' : ' data-ledger-idx="' + entry.i + '"') + '>' +`
);

rep(
  `        '<td class="cell-desc">' + esc(t.desc || '—') + partyChip(t) + '</td>' +`,
  `        '<td class="cell-desc">' + esc(t.desc || '—') + partyChip(t) + customChipsHtml(t) +
          (entry.auto ? ' <span class="tag tag--warn" title="حركة تلقائية من مصدرها: تحصيل أو مدفوع فعلي">تلقائي</span>' : '') + '</td>' +`
);

rep(
  `        '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm" data-edit-ledger="' + entry.i + '">تعديل</button>' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-ledger="' + entry.i + '">حذف</button></td>' +`,
  `        '<td class="col-cell">' + (entry.auto
          ? '<span class="cell-note">من المصدر</span>'
          : '<button type="button" class="btn btn--ghost btn--sm" data-edit-ledger="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-ledger="' + entry.i + '">حذف</button>') + '</td>' +`
);

rep(
  `    var countEl = $('#ledgerCount');
    if (countEl) countEl.textContent = list.length + ' حركة';`,
  `    var countEl = $('#ledgerCount');
    if (countEl) countEl.textContent = list.length + ' حركة';
    var at = $('#ledgerAutoToggle');
    if (at) at.checked = showAuto;`
);

/* حقول مخصّصة داخل نموذج الحركة: تحقق وحفظ وتعبئة */
rep(
  `      var miss = [];
      if (!date) miss.push('التاريخ');
      if (!desc) miss.push('البيان');
      if (!(amount > 0)) miss.push('المبلغ');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));`,
  `      var miss = [];
      if (!date) miss.push('التاريخ');
      if (!desc) miss.push('البيان');
      if (!(amount > 0)) miss.push('المبلغ');
      missingCustom('ledger', ledgerForm).forEach(function (m) { miss.push(m.label); });
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));`
);

rep(
  `        list[ledgerEditIdx] = { date: date, type: type, desc: desc, amount: amount, note: note, party: party };`,
  `        list[ledgerEditIdx] = { date: date, type: type, desc: desc, amount: amount, note: note, party: party, custom: collectCustomValues('ledger', ledgerForm) };`
);

rep(
  `      list.push({ date: date, type: type, desc: desc, amount: amount, note: note, party: party });`,
  `      list.push({ date: date, type: type, desc: desc, amount: amount, note: note, party: party, custom: collectCustomValues('ledger', ledgerForm) });`
);

rep(
  `        endLedgerEdit();
        ledgerForm.reset();
        f.date.value = todayISO();`,
  `        endLedgerEdit();
        ledgerForm.reset();
        f.date.value = todayISO();
        fillCustomValues('ledger', {}, ledgerForm);`
);

rep(
  `      ledgerForm.reset();
      f.date.value = todayISO();
      f.type.value = type;`,
  `      ledgerForm.reset();
      f.date.value = todayISO();
      fillCustomValues('ledger', {}, ledgerForm);
      f.type.value = type;`
);

rep(
  `    f.note.value = t.note || '';
    var submit = ledgerForm.querySelector('button[type="submit"]');`,
  `    f.note.value = t.note || '';
    fillCustomValues('ledger', t.custom || {}, ledgerForm);
    var submit = ledgerForm.querySelector('button[type="submit"]');`
);

/* زر النموذج: «إضافة حركة» ← «حفظ» + إزالة تفريغ الحقول */
rep(
  `    if (submit) submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"></use></svg> إضافة حركة';`,
  `    if (submit) submit.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"></use></svg> حفظ';`
);

rep(
  `  var ledgerClear = $('#ledgerClear');
  if (ledgerClear && ledgerForm) {
    ledgerClear.addEventListener('click', function () {
      ledgerForm.reset();
      ledgerForm.elements.date.value = todayISO();
      var er = $('#ledgerError');
      if (er) er.hidden = true;
    });
  }

`,
  ``
);

/* تقرير الدواخل والخوارج يشمل التلقائي */
rep(
  `    var list = getLedger().slice().sort(function (a, b) {`,
  `    var list = getLedger().slice();
    if (ledgerAutoOn()) list = list.concat(autoCashOps());
    list.sort(function (a, b) {`
);

fs.writeFileSync(F, src);
console.log('OK — طُبّق ' + done + ' تعديل على ' + F);
