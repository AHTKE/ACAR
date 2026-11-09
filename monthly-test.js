'use strict';

/* اختبار منطق التحصيل الشهري — تشغيل: node monthly-test.js */
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

/* 1) في 8 نوفمبر: سبتمبر وأكتوبر متأخران، ونوفمبر مستحق لم يحن */
let c = base();
let p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.active, true);
assert.strictEqual(p.monthly, 10000);
assert.strictEqual(p.months.length, 6);
assert.deepStrictEqual(p.overdueMonths.map((m) => m.key), ['2026-09', '2026-10']);
assert.strictEqual(p.requiredNow, 20000);
assert.strictEqual(p.isLate, true);
assert.strictEqual(p.hasPrev, true);
assert.strictEqual(p.current && p.current.state, 'due');
assert.strictEqual(p.settled, false);

/* 2) بعد دفع 20000: الشهران القديمان مدفوعان، والمطلوب الآن صفر */
c = base({ payments: [{ date: '2026-11-08', amount: 20000 }] });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.deepStrictEqual(p.overdueMonths, []);
assert.strictEqual(p.requiredNow, 0);
assert.strictEqual(p.isLate, false);
assert.strictEqual(p.current && p.current.state, 'due');
const sep = p.months.find((m) => m.key === '2026-09');
assert.strictEqual(sep.paid, true);
assert.strictEqual(sep.paidAt, '2026-11-08');
assert.strictEqual(sep.latePaid, true, 'سبتمبر اتدفع بعد استحقاقه');
const octLate = p.months.find((m) => m.key === '2026-10');
assert.strictEqual(octLate.latePaid, true, 'أكتوبر اتدفع بعد استحقاقه');
assert.ok(MC.monthCardHTML(sep).indexOf('غير مدفوع') > -1, 'الكارت يوضح أنه كان غير مدفوع');
assert.ok(MC.monthCardHTML(sep).indexOf('2026-11-08') > -1, 'تاريخ الدفع ظاهر');
assert.ok(MC.monthCardHTML(sep).indexOf('مدفوع بعد التأخير') > -1, 'حالة التحول ظاهرة');

/* 2ب) دفعة قبل الاستحقاق: الشهور مدفوعة في موعدها */
c = base({ payments: [{ date: '2026-09-10', amount: 20000 }] });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.months.find((m) => m.key === '2026-09').latePaid, false);
assert.strictEqual(p.months.find((m) => m.key === '2026-10').latePaid, false);

/* 3) في 20 ديسمبر بدون دفع جديد: نوفمبر وديسمبر متأخران */
p = MC.monthlyPlan(c, new Date(2026, 11, 20, 12, 0, 0));
assert.deepStrictEqual(p.overdueMonths.map((m) => m.key), ['2026-11', '2026-12']);
assert.strictEqual(p.requiredNow, 20000);
assert.strictEqual(p.hasPrev, true);

/* 4) دفع 20000 في 20 ديسمبر: يسدد نوفمبر ثم ديسمبر بالترتيب */
c = base({ payments: [
  { date: '2026-11-08', amount: 20000 },
  { date: '2026-12-20', amount: 20000 }
] });
p = MC.monthlyPlan(c, new Date(2026, 11, 20, 12, 0, 0));
assert.deepStrictEqual(p.overdueMonths, []);
assert.strictEqual(p.requiredNow, 0);
assert.strictEqual(p.months.find((m) => m.key === '2026-11').paid, true);
assert.strictEqual(p.months.find((m) => m.key === '2026-12').paid, true);
assert.strictEqual(p.months.find((m) => m.key === '2027-01').state, 'upcoming');

/* 5) دفع جزئي: شهر سبتمبر يسدد، وأكتوبر يبقى متأخراً بمتبقٍ */
c = base({ payments: [{ date: '2026-11-08', amount: 10000 }] });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.months.find((m) => m.key === '2026-09').paid, true);
assert.strictEqual(p.months.find((m) => m.key === '2026-10').paid, false);
assert.strictEqual(p.requiredNow, 10000);
assert.strictEqual(p.overdueMonths.length, 1);

/* 6) اليوم الافتراضي من الإعدادات يطبق على عميل بلا يوم */
c = base({ dueDay: 0 });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.active, true);
assert.strictEqual(p.day, 19);
assert.strictEqual(p.requiredNow, 20000);

/* 7) يوم 31 في شهر 30 يومًا => آخر يوم في الشهر */
c = base({ dueDay: 31, scheduleStart: '2026-09', total: 30000, duration: '3 شهر', payments: [] });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.months.find((m) => m.key === '2026-09').dueISO, '2026-09-30');
assert.strictEqual(p.overdueMonths.length, 2);

/* 8) السداد الكامل: مكتمل ولا متأخرات */
c = base({ payments: [{ date: '2026-11-08', amount: 60000 }] });
p = MC.monthlyPlan(c, new Date(2026, 10, 8, 12, 0, 0));
assert.strictEqual(p.settled, true);
assert.strictEqual(p.isLate, false);
assert.strictEqual(p.requiredNow, 0);

/* 9) الحفظ والقراءة لليوم الافتراضي */
assert.strictEqual(MC.getDefaultDueDay(), 19);
MC.saveDefaultDueDay(25);
assert.strictEqual(MC.getDefaultDueDay(), 25);
MC.saveDefaultDueDay(0);
assert.strictEqual(MC.getDefaultDueDay(), 0);

/* 10) تفاصيل البروفايل تعرض التحول من غير مدفوع إلى مدفوع بتاريخ الدفع */
c = base({ scheduleStart: '2020-01', payments: [{ date: '2021-01-15', amount: 60000 }] });
const detail = MC.planDetailHTML(c);
assert.ok(detail.indexOf('تغيّر حالة السداد') > -1, 'سجل تغيّر الحالة ظاهر');
assert.ok(detail.indexOf('غير مدفوع ← مدفوع') > -1, 'التحول ظاهر في تفاصيل البروفايل');
assert.ok(detail.indexOf('2021-01-15') > -1, 'تاريخ الدفع ظاهر في تفاصيل البروفايل');

console.log('✓ كل اختبارات التحصيل الشهري نجحت (10 سيناريوهات)');
