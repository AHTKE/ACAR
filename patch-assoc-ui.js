/* ============================================================
   patch-assoc-ui.js — حقول الدورة + جدول الأدوار + بروفايل العضو
                    + بروفايل الشريك (تعديل/حذف/تصدير)
   يشغّل: node patch-assoc-ui.js
   ============================================================ */
'use strict';
const fs = require('fs');
const FILE = 'app.js';
let src = fs.readFileSync(FILE, 'utf8');
let count = 0;

function rep(oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error('✗ لم يُعثر على المرساة: ' + (label || oldStr.slice(0, 60)));
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error('✗ المرساة مكررة: ' + (label || oldStr.slice(0, 60)));
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  count++;
}

/* 1) نموذج الجمعية: قراءة حقول الدورة */
rep(`      var f = assocForm.elements;
      var name = String(f.name.value || '').trim();
      var fee = parseFloat(f.fee.value);

      var miss = [];
      if (!name) miss.push('اسم الجمعية');
      if (!(fee >= 0)) miss.push('قيمة الاشتراك السنوي');
      if (miss.length) return fail('الرجاء إدخال: ' + miss.join('، '));`,
`      var f = assocForm.elements;
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
      var startMonth = monthKeyParts(startRaw) ? startRaw : currentMonthKey();`, 'assocSubmit-read');

rep(`        var oldName = list[idx].name;
        list[idx] = { name: name, fee: fee };`,
`        var oldName = list[idx].name;
        list[idx] = { name: name, fee: fee, months: months, payoutDay: payoutDay, startMonth: startMonth };`, 'assocSubmit-edit');

rep(`        if (list.some(function (a) { return a.name === name; })) return fail('فيه جمعية بنفس الاسم');
        list.push({ name: name, fee: fee });`,
`        if (list.some(function (a) { return a.name === name; })) return fail('فيه جمعية بنفس الاسم');
        list.push({ name: name, fee: fee, months: months, payoutDay: payoutDay, startMonth: startMonth });`, 'assocSubmit-add');

rep(`    f.name.value = a.name || '';
    f.fee.value = a.fee != null ? a.fee : '';`,
`    f.name.value = a.name || '';
    f.fee.value = a.fee != null ? a.fee : '';
    if (f.months) f.months.value = a.months != null ? a.months : '';
    if (f.payoutDay) f.payoutDay.value = a.payoutDay != null ? a.payoutDay : '';
    if (f.startMonth) f.startMonth.value = a.startMonth || '';`, 'startEditAssoc');

/* 2) العضو: رقم الدور + الدفعات */
rep(`      var rec = { assoc: assoc, name: name, type: type, fee: fee, paid: paid, note: note };
      if (editing) list[idx] = rec; else list.push(rec);
      saveMembers(list);`,
`      var rec = {
        assoc: assoc, name: name, type: type, fee: fee, paid: paid, note: note,
        order: (editing && list[idx].assoc === assoc) ? list[idx].order : nextOrderFor(assoc),
        payments: (editing && list[idx].payments) ? list[idx].payments : []
      };
      normalizeMember(rec);
      if (editing) list[idx] = rec; else list.push(rec);
      saveMembers(list);`, 'memberSubmit');

/* 3) رسم جدول الأدوار بعد كروت/ملخص الجمعيات */
rep(`    renderAssocCards();
    renderAssocSummary();
  }`,
`    renderAssocCards();
    renderAssocSummary();
    renderAssocMatrix();
  }`, 'renderAssociations-call');

/* 4) جدول الأدوار الشهرية */
rep(`  /* ---------- إضافة / تعديل جمعية ---------- */`,
`  /* ---------- جدول الأدوار الشهرية (مين بيقبض فين) ---------- */
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

  /* ---------- إضافة / تعديل جمعية ---------- */`, 'matrix-fn');

/* 5) بروفايل العضو */
rep(`  /* ---------- الإقلاع ---------- */
  /* ---------- الإقلاع ---------- */`,
`  /* ---------- بروفايل عضو الجمعية ---------- */
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

  /* ---------- الإقلاع ---------- */
  /* ---------- الإقلاع ---------- */`, 'member-profile');

fs.writeFileSync(FILE, src);
console.log('✓ ' + FILE + ' — ' + count + ' تعديل');
