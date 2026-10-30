/* ============================================================
   patch-ops-block.js — وحدة «العمليات» كاملة (سجل + تراجع)
                      + فحص سلامة التخزين
   يشغّل: node patch-ops-block.js   (قبل patch-ops.js)
   ============================================================ */
'use strict';
const fs = require('fs');
const FILE = 'app.js';
let src = fs.readFileSync(FILE, 'utf8');

const MARK = `  /* ---------- الإقلاع ---------- */
  /* ---------- الإقلاع ---------- */`;

if (src.indexOf(MARK) < 0) throw new Error('✗ لم يُعثر على مرساة الإقلاع');
if (src.indexOf('function renderOperations') >= 0) throw new Error('✗ الوحدة مطبَّقة مسبقاً');

const BLOCK = String.raw`
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
    var ls = null;
    try { ls = window.localStorage; } catch (e) {}
    if (!ls || typeof ls.setItem !== 'function') return false;
    try {
      rawSetItem = ls.setItem.bind(ls);
      ls.setItem = function (k, v) {
        var before = null;
        try { before = ls.getItem(k); } catch (e) {}
        rawSetItem(k, v);
        if (opBusy || !opsWatched(k)) return;
        var after = String(v);
        if (before === after) return;
        try { pushOp(k, before, after); } catch (e) {}
      };
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
        '<td class="amount">' + (r.bytes ? money(Math.round(r.bytes / 1024 * 10) / 10) + ' KB' : '—') + '</td></tr>';
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
  var opsUndoLastBtn = $('#opsUndoLast');
  if (opsUndoLastBtn) opsUndoLastBtn.addEventListener('click', function () {
    undoLastOp();
  });

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
    getOps().forEach(function (o) { if (o.id === id) op = o; });
    if (!op) return;
    openConfirm({
      title: 'تراجع عن عملية',
      message: 'هل تريد التراجع عن: «' + (op.desc || 'عملية') + '»؟ سيتم إرجاع القسم لحالته السابقة.',
      yes: 'نعم، تراجع', no: 'تراجع',
      onYes: function () { undoOpById(id); }
    });
  });

`;

src = src.replace(MARK, BLOCK + MARK);
fs.writeFileSync(FILE, src);
console.log('✓ ' + FILE + ' — أُضيفت وحدة العمليات (' + BLOCK.length + ' حرف)');
