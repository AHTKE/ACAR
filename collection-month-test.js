'use strict';

/* اختبار التحصيل الشهري: اختيار الشهر المدفوع + الدفع الجزئي + التحصيلات المتعددة
   تشغيل: node collection-month-test.js */
const assert = require('assert');
const { createMonthlyCollection } = require('./monthly.js');

const store = { app_default_due_day: '19' };
global.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

function derive(c) {
  const total = Number(c.total || 0);
  const down = Number(c.down || 0);
  const due = Math.max(total - down, 0);
  const pays = Array.isArray(c.payments) ? c.payments : [];
  const paidPays = pays.reduce((n, p) => n + Number(p.amount || 0), 0);
  const ledIn = Number(c.ledIn || 0);
  const storeCharge = Number(c.storeCharge || 0);
  const storeReturn = Number(c.storeReturn || 0);
  const later = Number(c.later || 0);
  const paid = later + paidPays + ledIn;
  const rest = Math.max(due - paid + storeCharge - storeReturn, 0);
  return { total, down, due, later, pays, paidPays, paid, rest, ledIn, storeCharge, storeReturn };
}

const MC = createMonthlyCollection({
  getCustomers: () => [],
  derive,
  money: (v) => String(v),
  esc: (v) => String(v == null ? '' : v),
  formatDate: (v) => String(v || ''),
  monthLabel: (k) => String(k),
  pad: (n) => String(n).padStart(2, '0')
});

function base(overrides) {
  return Object.assign({
    name: 'عميل اختبار',
    total: 60000,
    down: 0,
    later: 0,
    dueDay: 19,
    duration: '6 شهر',
    scheduleStart: '2026-09',
    payments: []
  }, overrides || {});
}

const now = new Date(2026, 10, 23, 12, 0, 0); // 23 نوفمبر 2026
let pass = 0;
function ok(name, cond, extra) {
  if (!cond) throw new Error('FAIL: ' + name + (extra ? ' -> ' + extra : ''));
  pass++;
  console.log('  PASS  ' + name);
}

/* 1) دفع جزئي على شهر محدد (نوفمبر) بدون ما يلمس المتأخر (سبتمبر/أكتوبر) */
let c = base({ payments: [{ date: '2026-11-23', amount: 3000, month: '2026-11' }] });
let p = MC.monthlyPlan(c, now);
let nov = p.months.find((m) => m.key === '2026-11');
ok('نوفمبر بقى دفع جزئي', nov.partial === true && nov.paid === false);
ok('متبقي نوفمبر 7000', nov.remaining === 7000, nov.remaining);
ok('نوفمبر لسه متأخر (استحقاقه 19)', nov.state === 'overdue');
ok('دفعة نوفمبر اتحسبت على نوفمبر', nov.payments.length === 1 && nov.payments[0].amount === 3000);
let sep = p.months.find((m) => m.key === '2026-09');
ok('سبتمبر لسه غير مدفوع خالص', sep.paid === false && sep.partial === false && sep.paidAmount === 0);
ok('كارت نوفمبر بيوضح الدفع الجزئي', MC.monthCardHTML(nov).includes('دفع جزئي'));
ok('كارت نوفمبر فيه المتبقي', MC.monthCardHTML(nov).includes('7000'));
ok('كارت نوفمبر فيه تاريخ الدفعة', MC.monthCardHTML(nov).includes('2026-11-23'));
ok('الفئة is-partial اتضافت', MC.monthCardHTML(nov).includes('is-partial'));

/* 2) دفعة تانية على نفس الشهر تكمّله → أخضر */
c = base({
  payments: [
    { date: '2026-11-23', amount: 3000, month: '2026-11' },
    { date: '2026-11-25', amount: 7000, month: '2026-11' }
  ]
});
p = MC.monthlyPlan(c, now);
nov = p.months.find((m) => m.key === '2026-11');
ok('نوفمبر اتغطى بالكامل بأكتر من دفعة', nov.paid === true && nov.remaining === 0);
ok('دفعتين مسجلين على نوفمبر', nov.payments.length === 2);
ok('الفئة بقت is-paid', MC.monthCardHTML(nov).includes('month-card is-paid'));
ok('سبتمبر لسه متأخر', p.overdueMonths.some((m) => m.key === '2026-09'));

/* 3) دفع شهر أقدم (سبتمبر) بينما أكتوبر/نوفمبر لسه — يتحسب على سبتمبر */
c = base({ payments: [{ date: '2026-11-23', amount: 10000, month: '2026-09' }] });
p = MC.monthlyPlan(c, now);
sep = p.months.find((m) => m.key === '2026-09');
let octP = p.months.find((m) => m.key === '2026-10');
ok('سبتمبر اتدفع', sep.paid === true);
ok('أكتوبر فضل غير مدفوع', octP.paid === false && octP.paidAmount === 0);

/* 4) بدون شهر محدد: الأقدم أولاً (السلوك القديم محفوظ) */
c = base({ payments: [{ date: '2026-11-23', amount: 10000 }] });
p = MC.monthlyPlan(c, now);
ok('الدفعة بدون شهر تروح لأقدم شهر', p.months.find((m) => m.key === '2026-09').paid === true);
ok('والشهر اللي بعده فاضي', p.months.find((m) => m.key === '2026-10').paid === false);

/* 5) زيادة عن الشهر بتكمّل على الشهر اللي بعده */
c = base({ payments: [{ date: '2026-11-23', amount: 15000, month: '2026-09' }] });
p = MC.monthlyPlan(c, now);
ok('سبتمبر مدفوع كامل', p.months.find((m) => m.key === '2026-09').paid === true);
let oct5 = p.months.find((m) => m.key === '2026-10');
ok('الزيادة (5000) راحت لأكتوبر', oct5.partial === true && oct5.paidAmount === 5000, oct5.paidAmount);

/* 6) مبلغ كبير على شهر داخل الخطة */
c = base({ payments: [{ date: '2026-11-23', amount: 60000 }] });
p = MC.monthlyPlan(c, now);
ok('كل الشهور مدفوعة', p.months.every((m) => m.paid === true));
ok('مكتمل السداد', p.settled === true);

/* 7) الشهر اللي مش داخل الخطة ما يضيعش الفلوس */
c = base({ payments: [{ date: '2026-11-23', amount: 10000, month: '2024-01' }] });
p = MC.monthlyPlan(c, now);
ok('دفعة شهر خارج الخطة اتحسبت على أقدم شهر ناقص', p.months.find((m) => m.key === '2026-09').paid === true);

/* 8) pill للدفع الجزئي لما يكون هو المتأخر الوحيد */
c = base({
  scheduleStart: '2026-11',
  total: 20000,
  duration: '2 شهر',
  payments: [{ date: '2026-11-23', amount: 3000, month: '2026-11' }]
});
p = MC.monthlyPlan(c, now);
ok('pill بيقول دفع جزئي', MC.planPill(p).includes('جزئي'), MC.planPill(p));
ok('partialMonths فيها نوفمبر', p.partialMonths.length === 1 && p.partialMonths[0].key === '2026-11');

/* 9) الدفعات المتعددة في نفس الشهر بتظهر بالتواريخ */
ok('الدفعات ظاهرة في الكارت', MC.monthCardHTML(p.months.find((m) => m.key === '2026-11')).includes('الدفعات:'));

console.log('\n✓ كل اختبارات اختيار الشهر والدفع الجزئي نجحت (' + pass + ' تحقق)');
