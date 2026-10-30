/* تطبيق تعديلات الملف الشخصي + المرسل على app.js (مع التحقق من المrawtypes) */
const fs = require('fs');
const F = 'app.js';
let src = fs.readFileSync(F, 'utf8');
let done = 0;

function between(startMark, endMark, replacement) {
  const a = src.indexOf(startMark);
  if (a === -1) throw new Error('start mark not found: ' + startMark);
  const b = src.indexOf(endMark, a);
  if (b === -1) throw new Error('end mark not found: ' + endMark);
  src = src.slice(0, a) + replacement + src.slice(b);
  done++;
}
function rep(oldStr, newStr) {
  const i = src.indexOf(oldStr);
  if (i === -1) throw new Error('pattern not found: ' + oldStr.slice(0, 80));
  if (src.indexOf(oldStr, i + 1) !== -1) throw new Error('pattern not unique: ' + oldStr.slice(0, 80));
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  done++;
}

/* ============ 1) نافذة التأكيد + أزرار تعديل/حذف ============ */
between(
  '  /* ---------- تعديل / حذف العميل من ملفه ---------- */',
  '  /* حذف دفعة تحصيل من ملف العميل */',
  `  /* ---------- نافذة التأكيد العامة (نعم / تراجع) ---------- */
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
    return String(n || 'عميل').replace(/[\\\\/:*?"<>|]/g, '').replace(/\\s+/g, ' ').trim().slice(0, 30) || 'عميل';
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

    return [
      { name: 'البيانات الشخصية', rows: info, widths: [34, 44] },
      { name: 'ملخص مالي', rows: moneyRows, widths: [42, 22] },
      { name: 'التحصيل', rows: pays, widths: [18, 20, 16, 10, 18, 30] },
      { name: 'المرسل من موارد', rows: sends, widths: [26, 16, 34, 10, 14, 16, 28] },
      { name: 'الملاحظات', rows: noteRows, widths: [60] }
    ];
  }

  function customerProfileReport(c) {
    var d = derive(c);
    return {
      title: 'ملف العميل: ' + (c.name || ''),
      subtitle: 'نظام الإدارة المتكامل — ' + new Date().toLocaleDateString('ar-EG'),
      columns: ['البند', 'القيمة'],
      moneyCols: [1],
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

`
);

/* ============ 2) توريدات الموردين المرتبطة + دمجها في المرسل ============ */
rep(
  `  var WORK_SUGGESTIONS = ['بلاط محارة', 'خشب', 'حديد', 'دهانات', 'سباكة', 'كهرباء', 'نقشات', 'أبواب ونوافذ', 'محارة'];`,
  `  var WORK_SUGGESTIONS = ['بلاط محارة', 'خشب', 'حديد', 'دهانات', 'سباكة', 'كهرباء', 'نقشات', 'أبواب ونوافذ', 'محارة'];

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
            work: String(t.desc || '').trim() || 'توريد مورد',
            date: t.date || '',
            desc: 'من المورد: ' + (s.name || ''),
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
  }`
);

/* ============ 3) annotateSends → يشمل الصفوف المرتبطة ============ */
rep(
  `  function annotateSends(d) {
    var cum = 0;
    return d.sends.map(function (x, i) {
      var before = Math.max(d.paidByUs - cum, 0);
      cum += Number(x.total != null ? x.total : 0);
      return { x: x, i: i, before: before, after: Math.max(d.paidByUs - cum, 0) };
    });
  }`,
  `  function annotateEntries(entries, paidByUs) {
    var cum = 0;
    return entries.map(function (e) {
      var t = e.x.total != null ? Number(e.x.total)
        : Number(e.x.qty || 0) * Number(e.x.price || 0);
      var before = Math.max(paidByUs - cum, 0);
      cum += t;
      return { x: e.x, i: e.i, linked: e.linked, before: before, after: Math.max(paidByUs - cum, 0) };
    });
  }`
);

/* ============ 4) صف الجدول: اسم المورد + صف مرتبط بدون حذف ============ */
rep(
  `  function sendRowHtml(e) {
    var x = e.x;
    return '<tr>' +
      '<td>' + esc(x.work || '—') + '</td>' +`,
  `  function sendRowHtml(e) {
    var x = e.x;
    var workCell = esc(x.work || '—') + (e.linked && x.supplier
      ? ' <span class="party-chip">مورد: ' + esc(x.supplier) + '</span>' : '');
    return '<tr>' +
      '<td>' + workCell + '</td>' +`
);

rep(
  `      '<td>' + (x.note ? esc(x.note) : '—') + '</td>' +
      '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-send="' + e.i + '">حذف</button></td>' +
      '</tr>';`,
  `      '<td>' + (x.note ? esc(x.note) : '—') + '</td>' +
      '<td class="col-cell">' + (e.linked
        ? '<span class="tag tag--warn" title="توريد مورد مرتبط بهذا العميل — يُحتسب ويُخصم تلقائياً">مرتبط</span>'
        : '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-send="' + e.i + '">حذف</button>') + '</td>' +
      '</tr>';`
);

/* ============ 5) buildSendRows + refreshSendTable ============ */
rep(
  `  function buildSendRows(d) {
    var entries = annotateSends(d);
    if (sendView.filter) {`,
  `  function buildSendRows(c, d) {
    var entries = annotateEntries(mergedSendEntries(c, d), Number(d.paidByUs || 0));
    if (sendView.filter) {`
);

rep(
  `  function refreshSendTable() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    $('#sendTable tbody').innerHTML = buildSendRows(derive(c));
  }`,
  `  function refreshSendTable() {
    var c = getCustomers()[currentIdx];
    if (!c) return;
    $('#sendTable tbody').innerHTML = buildSendRows(c, derive(c));
  }`
);

/* ============ 6) حاسبة الإرسال: الرصيد يشمل التوريدات المرتبطة ============ */
rep(
  `    var total = qty * price;
    f.sendTotal.value = money(total);
    f.beforeBal.value = money(d.sendBal);
    f.afterBal.value = money(Math.max(d.sendBal - total, 0));
  }`,
  `    var total = qty * price;
    var bal = profileSendBal(c, d);
    f.sendTotal.value = money(total);
    f.beforeBal.value = money(bal);
    f.afterBal.value = money(Math.max(bal - total, 0));
  }`
);

rep(
  `      var total = qty * price;
      if (d.paidByUs > 0 && total > d.sendBal) {
        return fail('الرصيد غير كافٍ — المتبقي من المبلغ المدفوع منا للعميل: ' + money(d.sendBal));
      }`,
  `      var total = qty * price;
      var bal = profileSendBal(c, d);
      if (d.paidByUs > 0 && total > bal) {
        return fail('الرصيد غير كافٍ — المتبقي من المبلغ المدفوع منا للعميل: ' + money(bal));
      }`
);

rep(
  `      renderProfile();
      toast('تمت إضافة مرسل بقيمة ' + money(total) + ' — المتبقي بعد الطرح: ' + money(Math.max(d.sendBal - total, 0)));`,
  `      renderProfile();
      toast('تمت إضافة مرسل بقيمة ' + money(total) + ' — المتبقي بعد الطرح: ' + money(Math.max(profileSendBal(c, d) - total, 0)));`
);

/* ============ 7) ملخص المرسل في الملف ============ */
rep(
  `    /* ملخص وجدول المرسل من موارد */
    $('#sendSummary').innerHTML =
      '<div class="summary__box"><small>المبلغ المدفوع منا نحن للعميل (الرصيد الأصلي)</small><b>' + money(d.paidByUs) + '</b></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المرسلات</small><b>' + money(d.sendSum) + '</b></div>' +
      '<div class="summary__box summary__box--out"><small>المبلغ المتبقي بعد الطرح</small><b>' + money(d.sendBal) + '</b></div>' +
      '<div class="summary__box summary__box--net"><small>عدد الشغلانات</small><b>' + d.sends.length + '</b><span>' + worksCount(d.sends) + '</span></div>';

    fillSendDatalists(d);`,
  `    /* ملخص وجدول المرسل من موارد (مع توريدات الموردين المرتبطة) */
    var mergedX = mergedSendEntries(c, d).map(function (e) { return e.x; });
    var pSum = profileSendSum(c, d), pBal = profileSendBal(c, d);
    $('#sendSummary').innerHTML =
      '<div class="summary__box"><small>المبلغ المدفوع منا نحن للعميل (الرصيد الأصلي)</small><b>' + money(d.paidByUs) + '</b></div>' +
      '<div class="summary__box summary__box--in"><small>إجمالي المرسل (منا + توريدات الموردين)</small><b>' + money(pSum) + '</b></div>' +
      '<div class="summary__box summary__box--out"><small>المبلغ المتبقي بعد الطرح</small><b>' + money(pBal) + '</b></div>' +
      '<div class="summary__box summary__box--net"><small>عدد العمليات</small><b>' + mergedX.length + '</b><span>' + worksCount(d.sends) + '</span></div>';

    fillSendDatalists({ sends: mergedX });`
);

/* ============ 8) اقتراحات الشغلانات + الدرج + اقتراح الفلتر ============ */
rep(
  `  /* فرز وفرز العمليات حسب الشغلانة */
  var sendFilterEl = $('#sendFilter');`,
  `  /* ---------- اقتراح الشغلانات أثناء الكتابة + درج الشغلانات ---------- */
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
  var sendFilterEl = $('#sendFilter');`
);


fs.writeFileSync(F, src);
console.log('OK — طُبّق ' + done + ' تعديل على ' + F);
