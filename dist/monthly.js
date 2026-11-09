/* ============================================================
   monthly.js — محرك التحصيل الشهري
   ------------------------------------------------------------
   • يوم تحصيل لكل عميل (1-31) مع يوم افتراضي من الإعدادات.
   • قسط شهري = المطلوب سداده ÷ عدد شهور مدة السداد.
   • توزيع الدفعات على الشهور من الأقدم للأحدث.
   • تحديد الشهور المتأخرة والمطلوب الآن.
   يعتمد على دوال التطبيق الأساسية (derive / getCustomers / money...)
   ويُركّب من app.js عبر createMonthlyCollection.
   ============================================================ */
(function (root) {
  'use strict';

  function createMonthlyCollection(deps) {
    deps = deps || {};
    var getCustomers = deps.getCustomers;
    var derive = deps.derive;
    var money = deps.money;
    var esc = deps.esc;
    var formatDate = deps.formatDate;
    var monthLabel = deps.monthLabel;
    var pad = deps.pad || function (n) { return String(n).padStart(2, '0'); };

    var KEY_DEFAULT_DUE_DAY = 'app_default_due_day';

    function getDefaultDueDay() {
      try {
        var v = parseInt(localStorage.getItem(KEY_DEFAULT_DUE_DAY), 10);
        return (v >= 1 && v <= 31) ? v : 0;
      } catch (e) { return 0; }
    }

    function saveDefaultDueDay(v) {
      var n = parseInt(v, 10);
      try {
        if (n >= 1 && n <= 31) localStorage.setItem(KEY_DEFAULT_DUE_DAY, String(n));
        else localStorage.removeItem(KEY_DEFAULT_DUE_DAY);
      } catch (e) {}
    }

    function customerDueDay(c) {
      var v = parseInt(c && c.dueDay, 10);
      if (v >= 1 && v <= 31) return v;
      return getDefaultDueDay();
    }

    function keyParts(key) {
      var m = String(key || '').match(/^(\d{4})-(\d{2})$/);
      if (!m) return null;
      var mm = Number(m[2]);
      return (mm >= 1 && mm <= 12) ? { y: Number(m[1]), m: mm - 1 } : null;
    }

    function monthKeyOf(y, m) { return y + '-' + pad(m + 1); }

    function monthKeyFromISO(iso) {
      var m = String(iso || '').match(/^(\d{4})-(\d{2})/);
      return m ? m[1] + '-' + m[2] : '';
    }

    function addMonthKey(key, k) {
      var p = keyParts(key);
      if (!p) return '';
      var d = new Date(p.y, p.m + k, 1);
      return monthKeyOf(d.getFullYear(), d.getMonth());
    }

    function monthDueISO(key, day) {
      var p = keyParts(key);
      if (!p) return '';
      var dim = new Date(p.y, p.m + 1, 0).getDate();
      return p.y + '-' + pad(p.m + 1) + '-' + pad(Math.min(Math.max(day, 1), dim));
    }

    function monthDueEnd(key, day) {
      var p = keyParts(key);
      if (!p) return null;
      var dim = new Date(p.y, p.m + 1, 0).getDate();
      return new Date(p.y, p.m, Math.min(Math.max(day, 1), dim), 23, 59, 59, 999);
    }

    function durationMonthCount(c) {
      var raw = String((c && c.duration) || '').trim();
      var m = raw.match(/(\d+)\s*(.*)/);
      var n = m ? parseInt(m[1], 10) : 0;
      var unit = m ? String(m[2] || '').trim() : '';
      if (!(n > 0)) n = 1;
      if (unit === 'سنة') n = n * 12;
      else if (unit === 'أسبوع') n = Math.max(1, Math.round(n / 4.345));
      else if (unit === 'يوم') n = Math.max(1, Math.round(n / 30.44));
      else if (unit === 'دفعة واحدة') n = 1;
      if (n > 240) n = 240;
      return Math.max(1, n);
    }

    function monthlyPlan(c, now) {
      now = now || new Date();
      var d = derive(c);
      var day = customerDueDay(c);
      var plan = {
        active: !!day, day: day, monthly: 0, count: 0, startKey: '',
        months: [], overdueMonths: [], prevUnpaid: [], current: null,
        requiredNow: 0, overdueAmount: 0, settled: false,
        isLate: false, hasPrev: false, status: 'none'
      };
      if (!day) return plan;
      var due = Math.max(Number(d.due || 0) + Number(d.storeCharge || 0) - Number(d.storeReturn || 0), 0);
      if (!(due > 0)) {
        plan.settled = Number(d.rest || 0) <= 0;
        plan.status = plan.settled ? 'paid' : 'none';
        return plan;
      }

      var count = durationMonthCount(c);
      var monthly = due / count;
      var startKey = String(c.scheduleStart || '') || monthKeyFromISO(c.startDate) ||
        monthKeyOf(now.getFullYear(), now.getMonth());
      var sp = keyParts(startKey);
      if (!sp) {
        startKey = monthKeyOf(now.getFullYear(), now.getMonth());
        sp = keyParts(startKey);
      }
      startKey = monthKeyOf(sp.y, sp.m);

      var pays = [];
      (Array.isArray(c.payments) ? c.payments : []).forEach(function (p, i) {
        if (p && typeof p === 'object') pays.push({ p: p, i: i });
      });
      pays.sort(function (a, b) {
        return String(a.p.date || '').localeCompare(String(b.p.date || '')) || (a.i - b.i);
      });

      var seed = Number(c.later || 0) + Number(d.ledIn || 0);
      var available = seed;
      pays.forEach(function (x) { available += Math.max(Number(x.p.amount || 0), 0); });

      var amounts = [];
      var sumDue = 0;
      var ii;
      for (ii = 0; ii < count; ii++) {
        var amt = (ii === count - 1) ? Math.max(due - sumDue, 0) : monthly;
        amounts.push(amt);
        sumDue += amt;
      }

      var left = available;
      var before = 0;
      var currentKey = monthKeyOf(now.getFullYear(), now.getMonth());
      for (ii = 0; ii < count; ii++) {
        var key = addMonthKey(startKey, ii);
        var amount = amounts[ii];
        var covered = Math.min(left, amount);
        var isPaid = amount <= 0 || covered >= amount - 0.005;
        var paidAt = '';
        if (isPaid && before + amount > seed + 0.005) {
          var threshold = before + amount;
          var acc = seed;
          var pi;
          for (pi = 0; pi < pays.length; pi++) {
            acc += Math.max(Number(pays[pi].p.amount || 0), 0);
            if (acc >= threshold - 0.005) { paidAt = pays[pi].p.date || ''; break; }
          }
        }
        left = Math.max(left - covered, 0);
        var dueISO = monthDueISO(key, day);
        var dueEnd = monthDueEnd(key, day);
        var state;
        if (isPaid) state = 'paid';
        else if (dueEnd && now.getTime() > dueEnd.getTime()) state = 'overdue';
        else if (key === currentKey) state = 'due';
        else state = 'upcoming';
        var paidISO = paidAt ? String(paidAt).slice(0, 10) : '';
        var latePaid = !!(isPaid && paidISO && dueISO && paidISO > dueISO);
        var item = {
          key: key, index: ii, amount: amount, paidAmount: covered,
          remaining: Math.max(amount - covered, 0), paid: isPaid,
          paidAt: paidAt, dueISO: dueISO, state: state, latePaid: latePaid
        };
        plan.months.push(item);
        if (state === 'overdue') {
          plan.overdueMonths.push(item);
          plan.overdueAmount += item.remaining;
        }
        if (state === 'overdue' && key < currentKey) plan.prevUnpaid.push(item);
        if (key === currentKey) plan.current = item;
        before += amount;
      }

      plan.monthly = monthly;
      plan.count = count;
      plan.startKey = startKey;
      plan.requiredNow = plan.overdueAmount;
      plan.isLate = plan.overdueMonths.length > 0;
      plan.hasPrev = plan.prevUnpaid.length > 0;
      plan.settled = Number(d.rest || 0) <= 0 || available >= due - 0.005;
      plan.status = plan.settled ? 'paid' : plan.isLate ? 'late' : 'ok';
      return plan;
    }

    function planPill(plan) {
      if (!plan || !plan.active) return '<span class="tag">بدون يوم تحصيل</span>';
      if (plan.settled) return '<span class="tag tag--in">مكتمل السداد ✓</span>';
      if (plan.overdueMonths.length) {
        return '<span class="tag tag--out">متأخر · ' + plan.overdueMonths.length + ' شهر</span>';
      }
      if (plan.current && plan.current.state === 'paid') return '<span class="tag tag--in">مدفوع ✓</span>';
      if (plan.current && plan.current.state === 'due') {
        var p = keyParts(plan.current.key);
        return '<span class="tag tag--warn">مستحق ' + plan.day + '/' + (p ? p.m + 1 : '') + '</span>';
      }
      if (!plan.current) return '<span class="tag">لم يبدأ بعد</span>';
      return '<span class="tag tag--in">منتظم ✓</span>';
    }

    function monthStateText(m) {
      if (!m) return '';
      if (m.state === 'paid') return 'مدفوع';
      if (m.state === 'overdue') return 'لم يُدفع — متأخر';
      if (m.state === 'due') return 'مستحق الآن';
      return 'لم يحن بعد';
    }

    function monthCardHTML(m) {
      var cls = m.state === 'paid' ? 'is-paid'
        : m.state === 'overdue' ? 'is-overdue'
          : m.state === 'due' ? 'is-due' : 'is-upcoming';
      var stateText = monthStateText(m);
      var dateLine;
      if (m.state === 'paid' && m.latePaid) {
        stateText = 'مدفوع بعد التأخير';
        dateLine = 'غير مدفوع ← مدفوع في ' + formatDate(m.paidAt);
      } else if (m.state === 'paid') {
        dateLine = m.paidAt ? ('دُفع في ' + formatDate(m.paidAt)) : 'مدفوع ضمن الدفعات السابقة';
      } else if (m.state === 'overdue') {
        dateLine = 'غير مدفوع حتى الآن — كان مستحقاً ' + formatDate(m.dueISO);
      } else {
        dateLine = 'الاستحقاق ' + formatDate(m.dueISO);
      }
      return '<div class="month-card ' + cls + (m.latePaid ? ' is-late-paid' : '') + '">' +
        '<div class="month-card__top"><b>' + esc(monthLabel(m.key)) + '</b><span class="month-card__dot"></span></div>' +
        '<div class="month-card__amount">' + money(m.amount) + '</div>' +
        '<div class="month-card__state">' + stateText + '</div>' +
        '<small>' + esc(dateLine) + '</small>' +
        (m.state === 'overdue' && m.remaining < m.amount - 0.005
          ? '<small class="month-card__rest">متبقي منه: ' + money(m.remaining) + '</small>' : '') +
        '</div>';
    }

    function planDetailHTML(c) {
      var plan = monthlyPlan(c);
      var d = derive(c);
      if (!plan.active) {
        return '<div class="plan-box">' +
          '<div class="plan-box__head"><div><b>التحصيل الشهري</b><small>غير مفعّل لهذا العميل</small></div><span class="tag">بدون يوم تحصيل</span></div>' +
          '<p class="plan-box__hint">حدّد «يوم التحصيل في الشهر» في بيانات العميل، أو اضبط رقماً افتراضياً من الإعدادات، وستظهر الشهور والمدفوع والمتأخرات هنا تلقائياً.</p>' +
          '</div>';
      }
      var late = plan.overdueMonths.map(function (m) {
        return '<li><b>' + esc(monthLabel(m.key)) + '</b> — لم يُدفع. كان مستحقاً يوم ' +
          esc(formatDate(m.dueISO)) + ' · المطلوب ' + money(m.remaining) + '</li>';
      }).join('');
      var cards = plan.months.slice().reverse().map(monthCardHTML).join('');
      var latePaid = plan.months.filter(function (m) { return m.latePaid; });
      var history = latePaid.length
        ? '<div class="plan-history"><b>تغيّر حالة السداد</b><ul>' +
          latePaid.map(function (m) {
            return '<li><b>' + esc(monthLabel(m.key)) + '</b> — غير مدفوع ← مدفوع في ' + esc(formatDate(m.paidAt)) + '</li>';
          }).join('') + '</ul></div>'
        : '';
      return '<div class="plan-box' + (plan.overdueMonths.length ? ' plan-box--late' : '') + '">' +
        '<div class="plan-box__head">' +
          '<div><b>التحصيل الشهري</b><small>يوم ' + plan.day + ' من كل شهر · القسط ' + money(plan.monthly) + ' · بداية ' + esc(monthLabel(plan.startKey)) + '</small></div>' +
          planPill(plan) +
        '</div>' +
        '<div class="plan-kpis">' +
          '<div><small>المطلوب الآن</small><b class="amount' + (plan.requiredNow > 0 ? ' neg' : '') + '">' + money(plan.requiredNow) + '</b></div>' +
          '<div><small>شهور متأخرة</small><b>' + plan.overdueMonths.length + '</b></div>' +
          '<div><small>المتبقي الكلي</small><b>' + money(d.rest) + '</b></div>' +
        '</div>' +
        (late
          ? '<div class="plan-late"><b>ملاحظات المتأخرات</b><ul>' + late + '</ul><p>أي دفعة جديدة تُخصم من أقدم شهر غير مدفوع أولاً، ثم الشهر الذي يليه بالترتيب.</p></div>'
          : '<p class="plan-box__ok">لا توجد شهور متأخرة — العميل منتظم في السداد ✓</p>') +
        '<div class="plan-months">' + cards + '</div>' +
        history +
        '</div>';
    }

    return {
      KEY_DEFAULT_DUE_DAY: KEY_DEFAULT_DUE_DAY,
      getDefaultDueDay: getDefaultDueDay,
      saveDefaultDueDay: saveDefaultDueDay,
      customerDueDay: customerDueDay,
      monthKeyOf: monthKeyOf,
      monthKeyFromISO: monthKeyFromISO,
      monthLabel: monthLabel,
      monthlyPlan: monthlyPlan,
      planPill: planPill,
      planDetailHTML: planDetailHTML,
      monthCardHTML: monthCardHTML,
      monthStateText: monthStateText,
      durationMonthCount: durationMonthCount
    };
  }

  if (typeof module === 'object' && module && module.exports) module.exports = { createMonthlyCollection: createMonthlyCollection };
  else root.createMonthlyCollection = createMonthlyCollection;
})(typeof self !== 'undefined' ? self : this);
