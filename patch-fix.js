/* ============================================================
   patch-fix.js
   1) منع الشاشات الفاضية: قراءة تخزين سليمة + تغليف كل عملية رسم
   2) الإقلاع يضمن ظهور الرئيسية ولو فشل رسم قسم
   3) خاصية رسائل التحصيل عبر واتساب
   ============================================================ */
const fs = require('fs');

const APP = 'app.js';
const HTML = 'index.html';

let app = fs.readFileSync(APP, 'utf8');
let html = fs.readFileSync(HTML, 'utf8');

let changes = 0;
function rep(what, oldStr, newStr, src) {
  const hay = src === 'html' ? html : app;
  const n = hay.split(oldStr).length - 1;
  if (n !== 1) throw new Error(`[count=${n}] ${what}`);
  if (src === 'html') html = html.replace(oldStr, newStr);
  else app = app.replace(oldStr, newStr);
  changes++;
  console.log('  OK  ' + what);
}

/* ---------------------------------------------------------
   1) دالة قراءة قائمة سليمة + تقوية كل getters
   --------------------------------------------------------- */
const SAFE_LIST = `  /* قراءة قائمة سليمة من التخزين:
     - لو المحتوى مش مصفوفة نرجع الافتراضي بدل ما يقع الرسم كله
     - ولو فيه عناصر مش كائنات نتجاهلها، عشان أي عنصر تالف
       ما يوقّع الشاشة ويسيبها فاضية. */
  function safeList(v, fallback) {
    if (!Array.isArray(v)) return JSON.parse(JSON.stringify(fallback));
    var out = [];
    for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object') out.push(v[i]);
    return out;
  }

  function getCustomers() {`;

rep('safeList helper', `  function getCustomers() {`, SAFE_LIST);

const getters = [
  ['KEY_CUSTOMERS', 'DEFAULT_CUSTOMERS'],
  ['KEY_SUPPLIERS', 'DEFAULT_SUPPLIERS'],
  ['KEY_LEDGER', 'DEFAULT_LEDGER'],
  ['KEY_PARTNERS', 'DEFAULT_PARTNERS'],
  ['KEY_ASSOCIATIONS', 'DEFAULT_ASSOCIATIONS']
];
getters.forEach(([k, d]) => {
  rep(
    'safe getter ' + k,
    `      var raw = localStorage.getItem(${k});\n      if (raw) return JSON.parse(raw);`,
    `      var raw = localStorage.getItem(${k});\n      if (raw) return safeList(JSON.parse(raw), ${d});`
  );
});

/* ---------------------------------------------------------
   2) showView: كل رسم في try لوحده — فشل واحد ما يسيبش الشاشة فاضية
   --------------------------------------------------------- */
const OLD_SHOW = `    if (id === 'customers') renderCustomers();
    if (id === 'home') renderHomeStats();
    if (id === 'collection') { renderCollection(colFilter()); renderCollectionSummary(); }
    if (id === 'ledger') { renderLedger(); renderLedgerSummary(); }
    if (id === 'partners') renderPartners();
    if (id === 'associations') renderAssociations();
    if (id === 'details') renderDetails();
    if (id === 'partner-profile') renderPartnerProfile();
    if (id === 'member-profile') renderMemberProfile();
    if (id === 'operations') renderOperations();
    if (id === 'settings') renderDataSafety();
    if (id === 'ledger') fillPartyLists();
    if (id === 'supplier-profile') fillPartyLists();
    if (id === 'settings') { renderExportGrid(); refreshDriveStatus(); loadSyncFolder(); renderNetworkToggle(); }
    if (id === 'suppliers' && typeof renderSuppliers === 'function') {
      renderSuppliers($('#supplierSearch') ? $('#supplierSearch').value : '');
    }
    if (id === 'profile' && typeof renderProfile === 'function') renderProfile();
    if (id === 'profile' && typeof renderProfileLinks === 'function') renderProfileLinks();
    if (id === 'add-customer' && typeof prepareCustomerView === 'function') prepareCustomerView();
    if (id === 'add-supplier' && typeof prepareSupplierView === 'function') prepareSupplierView();
    if (id === 'supplier-profile' && typeof renderSupplierProfile === 'function') renderSupplierProfile();
    if (id === 'add-customer' && typeof hideAlert === 'function') hideAlert();
  }`;

const NEW_SHOW = `    /* كل عملية رسم مُغلّفة بـ try: لو قسم واحد فشل لأي سبب (بيانات تالفة مثلاً)
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
  }`;

rep('showView guarded rendering', OLD_SHOW, NEW_SHOW);

/* ---------------------------------------------------------
   3) الإقلاع: الخطوة النهائية showView('home') ما تبقاش متأثرة
   --------------------------------------------------------- */
const OLD_BOOT = `  /* ---------- الإقلاع ---------- */
  installOpsHook();
  repairStorage();
  /* ---------- الإقلاع ---------- */
  renderHomeStats();
  renderCustomers();
  renderLedger();
  renderLedgerSummary();
  showView('home');
`;

const NEW_BOOT = `  /* ---------- الإقلاع ---------- */
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
`;

rep('boot hardening', OLD_BOOT, NEW_BOOT);

/* ---------------------------------------------------------
   4) مفاتيح رسائل واتساب داخل المزامنة وسجل العمليات
   --------------------------------------------------------- */
rep('SYNC_LABELS wa keys',
  `    app_members: 'أعضاء الجمعيات'\n  };`,
  `    app_members: 'أعضاء الجمعيات',\n    app_wa_settings: 'رسائل التحصيل (واتساب) — الإعدادات',\n    app_wa_log: 'رسائل التحصيل (واتساب) — سجل الإرسال'\n  };`);

/* ---------------------------------------------------------
   5) كود خاصية رسائل واتساب — قبل الإقلاع
   --------------------------------------------------------- */
const WA_CODE = `
  /* ---------- رسائل التحصيل عبر واتساب ---------- */
  var KEY_WA = 'app_wa_settings';
  var KEY_WA_LOG = 'app_wa_log';
  var WA_DEFAULT_TEMPLATE =
    'مرحبًا {الاسم}،' + '\\n' +
    'إشعار تحصيل بتاريخ {التاريخ}' + '\\n' +
    '• المبلغ قبل التحصيل: {قبل}' + '\\n' +
    '• المدفوع: {المدفوع}' + '\\n' +
    '• المتبقي: {المتبقي}' + '\\n' +
    'شكرًا لكم — نظام الإدارة';
  var waBusy = false;

  function waSettings() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY_WA) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    return {
      template: (typeof s.template === 'string' && s.template) ? s.template : WA_DEFAULT_TEMPLATE,
      phonePref: (s.phonePref === 'backup' || s.phonePref === 'both') ? s.phonePref : 'primary'
    };
  }

  function saveWaSettings(s) {
    try {
      localStorage.setItem(KEY_WA, JSON.stringify({
        template: String(s.template || WA_DEFAULT_TEMPLATE),
        phonePref: s.phonePref === 'backup' || s.phonePref === 'both' ? s.phonePref : 'primary'
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
    var p1 = String(c.phone || '').replace(/[^\\d+]/g, '');
    var p2 = String(c.phone2 || '').replace(/[^\\d+]/g, '');
    if (pref === 'backup') return p2;
    if (pref === 'both') return p1 || p2;
    return p1;
  }

  function waDigits(n) {
    var d = String(n || '').replace(/\\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.charAt(0) === '0') d = '2' + d;
    else if (d.length === 10 && d.charAt(0) !== '2') d = '20' + d;
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
      var tpl = $('#waTemplate'), pref = $('#waPhonePref');
      saveWaSettings({
        template: tpl ? tpl.value : waSettings().template,
        phonePref: pref ? pref.value : waSettings().phonePref
      });
      renderWaPanel();
      toast('تم حفظ إعدادات رسائل التحصيل');
      return;
    }
    if (t.closest('#waSendAllBtn')) { waSendAll(); return; }
  });

  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.id) return;
    if (e.target.id === 'waPhonePref') {
      var s = waSettings();
      s.phonePref = e.target.value;
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

  /* ---------- الإقلاع ---------- */`;

rep('wa feature block', `  /* ---------- الإقلاع ---------- */`, WA_CODE);

/* ---------------------------------------------------------
   6) HTML: لوحة رسائل التحصيل داخل شاشة التحصيل
   --------------------------------------------------------- */
const WA_HTML = `
      <div class="panel" id="waPanel">
        <div class="page-head" style="padding:0;border:0;background:none">
          <div class="page-head__title">
            <span class="card__icon card__icon--pink sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-link"></use></svg></span>
            <div><h2>رسائل التحصيل عبر واتساب</h2><p>رسالة واحدة لكل عميل لكل عملية تحصيل — والمُرسَل له لا يُرسَل له مرة أخرى إلا بتحصيل جديد</p></div>
          </div>
          <span class="count-pill" id="waCount">0 عميل</span>
        </div>

        <div class="form" style="margin-top:14px">
          <label class="field field--full"><span>قالب الرسالة (تقدر تعدّل النص زي ما تحب)</span>
            <textarea id="waTemplate" rows="5" spellcheck="true"></textarea>
          </label>
          <p class="panel__note" style="margin:8px 0 12px">
            المتاح للاستبدال: <b>{الاسم}</b> · <b>{التاريخ}</b> · <b>{قبل}</b> · <b>{المدفوع}</b> · <b>{المتبقي}</b>
            (وتقدر تستخدم بالإنجليزي: {name} {date} {before} {paid} {rest})
          </p>
          <div class="form__row form__row--3">
            <label class="field"><span>الرقم المستخدم في الإرسال</span>
              <select id="waPhonePref">
                <option value="primary">الرقم الأساسي فقط</option>
                <option value="backup">الرقم الاحتياطي فقط</option>
                <option value="both">الأساسي ثم الاحتياطي (احتياطي)</option>
              </select>
            </label>
            <label class="field"><span>معاينة الرسالة</span>
              <textarea id="waPreview" rows="5" readonly tabindex="-1"></textarea>
            </label>
          </div>
          <div class="form__actions">
            <button type="button" class="btn btn--ghost" id="waSaveBtn">حفظ الإعدادات</button>
            <button type="button" class="btn btn--primary" id="waSendAllBtn">إرسال للجميع</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:14px">
          <table class="table">
            <thead><tr>
              <th style="width:52px">#</th>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>آخر تحصيل</th>
              <th>الحالة</th>
              <th style="width:120px"><span class="sr-only">إرسال</span></th>
            </tr></thead>
            <tbody id="waTbody"></tbody>
          </table>
        </div>
      </div>
`;

rep('wa panel html',
  `      <div class="summary" id="collectionSummary"></div>`,
  `      <div class="summary" id="collectionSummary"></div>\n` + WA_HTML, 'html');

fs.writeFileSync(APP, app);
fs.writeFileSync(HTML, html);
console.log(`\nتم تطبيق ${changes} تعديل بنجاح`);
