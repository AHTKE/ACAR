/* ============================================================
   patch-suppay.js — دفعة للمورد بدون توريد + تصنيف حركات المورد
   + ربط حركات الدواخل والخوارج ببروفايلات الأطراف + وضع المشاهد
   ============================================================ */
'use strict';
const fs = require('fs');

function patch(file, edits) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  edits.forEach(function (e, i) {
    if (e.op === 'insertBefore') {
      if (src.indexOf(e.anchor) === -1) throw new Error(file + ' #' + i + ': anchor not found');
      src = src.replace(e.anchor, e.text + e.anchor);
    } else if (e.op === 'insertAfter') {
      if (src.indexOf(e.anchor) === -1) throw new Error(file + ' #' + i + ': anchor not found');
      src = src.replace(e.anchor, e.anchor + e.text);
    } else {
      const n = src.split(e.old).length - 1;
      if (n !== 1) throw new Error(file + ' #' + i + ': old string found ' + n + ' times');
      src = src.replace(e.old, e.new);
    }
  });
  if (src === before) throw new Error(file + ': no change applied');
  fs.writeFileSync(file, src);
  console.log('✓ ' + file + ' — ' + edits.length + ' تعديل');
}

/* ============================================================
   1) index.html
   ============================================================ */
patch('index.html', [
  /* شريط المشاهد في وسط الشاشة */
  {
    op: 'insertBefore',
    anchor: '<!-- ===== أيقونات SVG ===== -->',
    text:
`<!-- شريط وضع المشاهد: زر ربط جوجل درايف في وسط الشاشة -->
<div id="viewerDriveBar">
  <span id="viewerDriveText">وضع المشاهد — تُطبَّق أحدث نسخة من المجلد العام تلقائياً</span>
  <button type="button" id="viewerDriveBtn">ربط حساب Google Drive</button>
</div>

`
  },
  /* شريط تصنيف حركات المورد فوق الجدول */
  {
    op: 'insertBefore',
    anchor:
`        <div class="table-wrap" style="margin-top:18px">
          <table class="table" id="supTxTable">`,
    text:
`        <div class="form__actions" id="supTxFilter" style="margin:18px 0 4px;gap:8px">
          <button type="button" class="btn btn--primary btn--sm" data-sup-filter="all">الكل</button>
          <button type="button" class="btn btn--ghost btn--sm" data-sup-filter="work">الشغل / التوريد</button>
          <button type="button" class="btn btn--ghost btn--sm" data-sup-filter="pay">الدفعات</button>
        </div>

`
  },
  /* لوحة الدفع للمورد + لوحة حركات الدواخل والخوارج — آخر بروفايل المورد */
  {
    op: 'insertBefore',
    anchor:
`        </div>
      </div>
    </section>

    <!-- الدواخل والخوارج -->`,
    text:
`        </div>
      </div>

      <!-- دفع للمورد: حركة دفع نقدية فقط بدون أي توريد -->
      <div class="panel" id="supPayPanel">
        <h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-coins"/></svg> دفع للمورد (دفعة بدون توريد)</h3>
        <p class="panel__hint">سجّل مبلغاً نقدياً دفعته للمورد بدون أي توريد — تختار التاريخ والمبلغ والملاحظة، ويُخصم تلقائياً من الباقي ويظهر في «الدواخل والخوارج» كخارج.</p>
        <form id="supPayForm" class="form" novalidate>
          <div class="form__row form__row--3">
            <label class="field"><span>التاريخ *</span><input type="date" name="date" required /></label>
            <label class="field"><span>المبلغ المدفوع *</span><input type="number" name="amount" min="0" step="any" required placeholder="0" /></label>
            <label class="field"><span>رقم الإيصال</span><input type="text" name="no" placeholder="اختياري" /></label>
          </div>
          <div class="form__row">
            <label class="field field--full"><span>الملاحظة / البيان</span><input type="text" name="note" placeholder="مثال: دفعة من حساب سابق…" /></label>
          </div>
          <div class="calc-grid">
            <div class="calc-box"><span>الباقي الحالي للمورد</span><input type="text" name="pRest" readonly tabindex="-1" value="0" /></div>
            <div class="calc-box"><span>إجمالي المدفوع بعد الدفعة</span><input type="text" name="pPaid" readonly tabindex="-1" value="0" /></div>
            <div class="calc-box calc-box--accent"><span>الباقي بعد الدفعة</span><input type="text" name="pAfter" readonly tabindex="-1" value="0" /></div>
          </div>
          <p class="form__error" id="supPayError" hidden></p>
          <div class="form__actions">
            <button type="submit" class="btn btn--primary"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-check"/></svg> حفظ الدفعة</button>
          </div>
        </form>
      </div>

      <!-- حركات «الدواخل والخوارج» المرتبطة بهذا المورد -->
      <div class="panel" id="supLedgerPanel">
        <h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-exchange"/></svg> حركات الدواخل والخوارج المرتبطة بهذا المورد</h3>
        <div id="supLedgerBody"></div>
      </div>
    </section>

    <!-- الدواخل والخوارج -->`
  }
]);

/* ============================================================
   2) app.js
   ============================================================ */
patch('app.js', [
  /* ---- 2.1 مبالغ الطرف من الدواخل والخوارج ---- */
  {
    op: 'insertBefore',
    anchor: '  function deriveSup(s) {',
    text:
`  /* ---------- مبالغ الطرف المسجّلة في «الدواخل والخوارج» ----------
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

`
  },

  /* ---- 2.2 deriveSup: احتساب حركات الدواخل والخوارج + تصنيف الشغل/الدفعات ---- */
  {
    old:
`  function deriveSup(s) {
    var tx = s.tx || [];
    var incoming = 0, paid = 0;
    tx.forEach(function (t) {
      incoming += Number(t.incoming || 0);
      paid += Number(t.paid || 0);
    });
    return { tx: tx, incoming: incoming, paid: paid, rest: incoming - paid };
  }`,
    new:
`  function deriveSup(s) {
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
  }`
  },

  /* ---- 2.3 جدول حركات المورد: تصنيف الكل / الشغل / الدفعات ---- */
  {
    old:
`    var rows = '', running = 0;
    d.tx.forEach(function (t, i) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(formatDate(t.date)) + '</td>' +
        '<td>' + esc(t.no || '—') + '</td>' +
        '<td>' + esc(t.desc || '—') + '</td>' +
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
      rows = '<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:24px">لا توجد حركات على هذا المورد — أضف أول حركة من النموذج أعلاه.</td></tr>';
    }
    $('#supTxTable tbody').innerHTML = rows;`,
    new:
`    renderSupTxTable(d);`
  },

  /* ---- 2.4 إعادة تعيين نموذج الدفع + لوحة الدواخل والخوارج ---- */
  {
    old:
`    if (f.elements.to) f.elements.to.value = '';
    fillPartyLists();
    $('#supTxError').hidden = true;
    updateSupTxCalc();
  }`,
    new:
`    if (f.elements.to) f.elements.to.value = '';
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
  }`
  },

  /* ---- 2.5 نموذج الدفع + أزرار التصنيف ---- */
  {
    op: 'insertAfter',
    anchor:
`        renderSupplierProfile();
        toast('تمت إضافة الحركة — الباقي: ' + signed(deriveSup(s).rest));
      }
    });
  }`,
    text:
`

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
  }`
  },

  /* ---- 2.6 تصدير Excel/PDF: إضافة حركات الدواخل والخوارج ---- */
  {
    old:
`      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.work || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });`,
    new:
`      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.work || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });
    (d.ledList || []).forEach(function (o) {
      var amt = Number(o.amount || 0);
      running += (o.type === 'out' ? -amt : amt);
      tx.push([formatDate(o.date), '', o.desc || 'حركة من الدواخل والخوارج', '', '',
        o.type === 'in' ? amt : 0, o.type === 'out' ? amt : 0, running, 'الدواخل والخوارج']);
    });`
  },

  /* ---- 2.7 العميل: حركات الدواخل والخوارج تُحتسب في التحصيل ---- */
  {
    old:
`    var paid = later + paidPays;
    var rest = (total > 0 || down > 0) ? Math.max(due - paid, 0) : Number(c.balance || 0);`,
    new:
`    var led = partyLedger('customer', c.name);
    var paid = later + paidPays + led.in;
    var rest = (total > 0 || down > 0)
      ? Math.max(due - paid, 0)
      : Math.max(Number(c.balance || 0) - led.in, 0);`
  },
  {
    old:
`    var paidByUs = Number(c.paidByUs || 0);
    return {
      total: total, down: down, due: due, later: later,
      pays: pays, paidPays: paidPays, paid: paid, rest: rest,
      n: n, unit: unit,
      sends: sends, sendSum: sendSum, paidByUs: paidByUs,
      sendBal: Math.max(paidByUs - sendSum, 0)
    };`,
    new:
`    var paidByUs = Number(c.paidByUs || 0) + led.out;
    return {
      total: total, down: down, due: due, later: later,
      pays: pays, paidPays: paidPays, paid: paid, rest: rest,
      n: n, unit: unit,
      sends: sends, sendSum: sendSum, paidByUs: paidByUs,
      ledIn: led.in, ledOut: led.out, ledList: led.list,
      sendBal: Math.max(paidByUs - sendSum, 0)
    };`
  },

  /* ---- 2.8 جدول التحصيل داخل بروفايل العميل ---- */
  {
    old:
`    if (!rows) {
      rows = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">لا توجد عمليات تحصيل بعد — أضف أول عملية من النموذج أعلاه.</td></tr>';
    }
    tbody.innerHTML = rows;`,
    new:
`    (d.ledList || []).forEach(function (o, k) {
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
    tbody.innerHTML = rows;`
  },

  /* ---- 2.9 جدول التحصيل في شاشة التحصيل ---- */
  {
    old:
`    if (!rows) {
      rows = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">لا توجد عمليات تحصيل بعد — أضف أول دفعة من النموذج أعلاه.</td></tr>';
    }`,
    new:
`    (d.ledList || []).forEach(function (o, k) {
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
    }`
  },

  /* ---- 2.10 بروفايل الشريك: إجمالي حركات الدواخل والخوارج ---- */
  {
    old:
`      links.innerHTML = ops.length
        ? opsTable(ops)
        : '<p class="panel__hint">لا توجد حركات نقدية مرتبطة بهذا الشريك — سجّل أرباحه من النموذج أعلاه أو اختره «الطرف» في الدواخل والخوارج.</p>';`,
    new:
`      var pLed = partyLedger('partner', p.name);
      var ledNote = '<p class="panel__note">حركات «الدواخل والخوارج» المرتبطة بهذا الشريك: داخل ' +
        money(pLed.in) + ' — خارج ' + money(pLed.out) + '</p>';
      links.innerHTML = ledNote + (ops.length
        ? opsTable(ops)
        : '<p class="panel__hint">لا توجد حركات نقدية مرتبطة بهذا الشريك — سجّل أرباحه من النموذج أعلاه أو اختره «الطرف» في الدواخل والخوارج.</p>');`
  },

  /* ---- 2.11 وضع المشاهد: تحديد الدور + تطبيق أحدث نسخة إجبارياً ---- */
  {
    op: 'insertAfter',
    anchor:
`  function syncPolicy() {
    try { return localStorage.getItem('app_sync_policy') || 'ask'; } catch (e) { return 'ask'; }
  }`,
    text:
`

  /* وضع المشاهد (غير المصرح له): لا يرفع أي شيء ويطبّق أحدث نسخة دائماً */
  function isViewerMode() {
    try { return localStorage.getItem('app_user_role') === 'viewer'; } catch (e) { return false; }
  }`
  },
  {
    old: '      var policy = syncPolicy();',
    new: '      var policy = isViewerMode() ? \'auto\' : syncPolicy();'
  },
  {
    old: '    if (!syncTimerCheck) syncTimerCheck = setInterval(function () { syncCheck(true); }, SYNC_CHECK_MS);',
    new: '    if (!syncTimerCheck) syncTimerCheck = setInterval(function () { syncCheck(true); },\n      isViewerMode() ? 60 * 1000 : SYNC_CHECK_MS);'
  },
  {
    old:
`      if (meta && meta.updatedAt && remoteAt && remoteAt < meta.updatedAt) {
        syncSetState('is-warn', 'نسختك المحلية أحدث من البعيدة — ارفع نسخة لتحديثها');
        syncBusy = false;
        return pull;
      }`,
    new:
`      if (meta && meta.updatedAt && remoteAt && remoteAt < meta.updatedAt && !isViewerMode()) {
        syncSetState('is-warn', 'نسختك المحلية أحدث من البعيدة — ارفع نسخة لتحديثها');
        syncBusy = false;
        return pull;
      }`
  },
  {
    old:
`  function syncPush(auto) {
    if (syncBusy) return Promise.resolve(null);`,
    new:
`  function syncPush(auto) {
    if (syncBusy) return Promise.resolve(null);
    if (isViewerMode()) return Promise.resolve(null);   /* المشاهد لا يرفع شيئاً */`
  },
  {
    old:
`  window.syncApi = syncApi;
  window.syncApply = syncApply;`,
    new:
`  window.syncApi = syncApi;
  window.syncApply = syncApply;
  window.syncCheck = syncCheck;
  window.isViewerMode = isViewerMode;`
  }
]);

/* ============================================================
   3) auth-gate-addon.js — شريط المشاهد + سحب أحدث نسخة تلقائياً
   ============================================================ */
patch('auth-gate-addon.js', [
  {
    old: "    if (el.id === 'gateConnect' || el.id === 'driveConnect') return true;",
    new: "    if (el.id === 'gateConnect' || el.id === 'driveConnect' || el.id === 'viewerDriveBtn') return true;"
  },
  {
    old:
`  function applyViewer() {
    if (VIEWER) return;
    VIEWER = true;`,
    new:
`  /* ---------- تطبيق أحدث نسخة تلقائياً للمشاهد ---------- */
  var autoPullTimer = null;
  function startAutoPull() {
    try { localStorage.setItem('app_sync_policy', 'auto'); } catch (e) {}
    if (autoPullTimer) return;
    autoPullTimer = setInterval(function () {
      try { if (typeof window.syncCheck === 'function') window.syncCheck(true); } catch (e) {}
    }, 60 * 1000);
    setTimeout(function () {
      try { if (typeof window.syncCheck === 'function') window.syncCheck(true); } catch (e) {}
    }, 1200);
  }

  var driveConnected = false;
  function renderViewerBar() {
    var bar = document.getElementById('viewerDriveBar');
    if (bar) bar.style.display = 'flex';
    var btn = document.getElementById('viewerDriveBtn');
    if (btn) {
      btn.textContent = driveConnected ? 'تحديث البيانات الآن من جوجل درايف' : 'ربط حساب Google Drive';
      btn.onclick = function () {
        if (!driveConnected) { window.location.href = '/api/google/login'; return; }
        try { if (typeof window.syncCheck === 'function') window.syncCheck(false); } catch (e) {}
      };
    }
    var txt = document.getElementById('viewerDriveText');
    if (txt) {
      txt.textContent = driveConnected
        ? 'وضع المشاهد — أحدث نسخة تُطبَّق تلقائياً كل دقيقة'
        : 'وضع المشاهد — اربط حساب Google لعرض البيانات ومتابعة أحدث نسخة';
    }
  }

  function applyViewer(connected) {
    driveConnected = !!connected;
    if (VIEWER) { renderViewerBar(); return; }
    VIEWER = true;`
  },
  {
    old:
`    setTimeout(function () {
      toastMsg('أنت داخل بحساب مشاهد — تصفح فقط بدون إضافة أو تعديل');
    }, 900);
  }`,
    new:
`    setTimeout(function () {
      toastMsg('أنت داخل بحساب مشاهد — تصفح فقط بدون إضافة أو تعديل');
    }, 900);
    renderViewerBar();
    startAutoPull();
  }`
  },
  {
    old:
`        if (!isAdmin) applyViewer();   /* غير المصرح له أو مفصول الربط = مشاهد */
        if (connected && /[?&]g=ok/.test(location.search)) setTimeout(pullShared, 700);`,
    new:
`        if (!isAdmin) applyViewer(connected);   /* غير المصرح له أو مفصول الربط = مشاهد */
        if (connected && /[?&]g=ok/.test(location.search)) setTimeout(pullShared, 700);`
  },
  {
    old: `      .catch(function () { applyViewer(); });   /* تعذّر التأكد = مشاهد */`,
    new: `      .catch(function () { applyViewer(false); });   /* تعذّر التأكد = مشاهد */`
  },
  {
    old: `    if (d) applyViewer();`,
    new: `    if (d) applyViewer(false);`
  }
]);

console.log('done');
