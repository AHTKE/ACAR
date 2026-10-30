/* ============================================================
   patch-assoc-core.js — تعديلات نظام الجمعيات (الدور) + بروفايل الشريك
   يشغّل: node patch-assoc-core.js
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

/* 1) تسجيل الشاشة الجديدة */
rep(`    'partner-profile': 'بروفايل شريك'
  };`,
`    'partner-profile': 'بروفايل شريك',
    'member-profile': 'بروفايل عضو الجمعية'
  };`, 'SECTION_NAMES');

rep(`    if (id === 'partner-profile') renderPartnerProfile();`,
`    if (id === 'partner-profile') renderPartnerProfile();
    if (id === 'member-profile') renderMemberProfile();`, 'showView');

/* 2) أدوات الدور والمدد */
rep(`  function assocTotals() {`,
`  /* ----------------------------------------------------------
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
    var m = /^(\\d{4})-(\\d{2})$/.exec(String(key || ''));
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

  function assocTotals() {`, 'helpers');

/* 3) تطبيع بيانات الأعضاء + ترصيد المدفوع القديم في دفعة */
rep(`  function getMembers() {
    try {
      var raw = localStorage.getItem(KEY_MEMBERS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
  }`,
`  /* يضمن أن مجموع الدفعات = المدفوع (المدفوع هو المصدر الصحيح) */
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
  }`, 'getMembers');

/* 4) كارت الجمعية: الحصيلة والمدة ويوم القبض وصاحب الدور */
rep(`        '<div class="mini-card__row"><span>اشتراك سنوي</span><b>' + money(a.fee) + '</b></div>' +
        '<div class="mini-card__row"><span>المحصّل</span><b class="pos">' + money(paidSum) + '</b></div>' +
        '<div class="mini-card__row"><span>المتبقي</span><b class="neg">' + money(Math.max(feeSum - paidSum, 0)) + '</b></div>' +`,
`        '<div class="mini-card__row"><span>قيمة السهم / شهر</span><b>' + money(a.fee) + '</b></div>' +
        '<div class="mini-card__row"><span>الحصيلة الشهرية</span><b class="pos">' + money(assocPot(a)) + '</b></div>' +
        '<div class="mini-card__row"><span>مدّة الدورة</span><b>' + cycleText(a) + '</b></div>' +
        '<div class="mini-card__row"><span>يوم القبض</span><b>يوم ' + assocPayoutDay(a) + ' من كل شهر</b></div>' +
        '<div class="mini-card__row"><span>أول شهر</span><b>' + monthLabel(assocStart(a)) + '</b></div>' +
        '<div class="mini-card__row"><span>دور الشهر الحالي</span><b>' +
          esc((function () { var c = collectorForMonth(a, currentMonthKey()); return c ? (c.name || '—') : '—'; })()) + '</b></div>' +
        '<div class="mini-card__row"><span>المحصّل</span><b class="pos">' + money(paidSum) + '</b></div>' +
        '<div class="mini-card__row"><span>المتبقي</span><b class="neg">' + money(Math.max(feeSum - paidSum, 0)) + '</b></div>' +`, 'assocCard');

/* 5) صف العضو: عمود موعد القبض + زر البروفايل */
rep(`          '<td><span class="tag ' + assocStatusTag(d.status) + '">' + d.status + '</span></td>' +
          '<td><span class="p-actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-edit-member="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-member="' + entry.i + '">حذف</button>' +
          '</span></td>' +`,
`          '<td><span class="tag ' + assocStatusTag(d.status) + '">' + d.status + '</span></td>' +
          '<td>' + esc((function () { var t = memberTurnMonth(entry.i); return t ? monthLabel(t) : '—'; })()) + '</td>' +
          '<td><span class="p-actions">' +
            '<button type="button" class="btn btn--primary btn--sm" data-member-profile="' + entry.i + '" title="فتح بروفايل العضو">البروفايل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-edit-member="' + entry.i + '">تعديل</button>' +
            '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-del-member="' + entry.i + '">حذف</button>' +
          '</span></td>' +`, 'memberRow');

rep(`        html = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:26px">' +`,
`        html = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:26px">' +`, 'colspan');

fs.writeFileSync(FILE, src);
console.log('✓ ' + FILE + ' — ' + count + ' تعديل');
