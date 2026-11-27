/* ============================================================
   collection-pick-test.js — تحصيل سريع من شريط الشهور + قائمة إرسال واتساب
   1) كل شهر في عمود «حالة الشهور» زرار
   2) الضغط عليه يفتح العميل ويجهّز الدفعة (تاريخ اليوم + الشهر المختار + المبلغ)
   3) الحفظ بيخصم الدفعة من الشهر المحدد
   4) قائمة الإرسال بتوضح حالة كل عميل مع زر إرسال
   ============================================================ */
'use strict';

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlSrc = fs.readFileSync('dist/index.html', 'utf8');
const appSrc = fs.readFileSync('dist/app.js', 'utf8');
const expSrc = fs.readFileSync('dist/export.js', 'utf8');
const mSrc = fs.readFileSync('dist/monthly.js', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const CUSTOMERS = [
  { name: 'عميل شهري', phone: '01000000001', total: 60000, down: 0, due: 60000, later: 0,
    dueDay: 19, monthlyAmount: 10000, scheduleStart: '2026-09', payments: [] },
  { name: 'عميل متأخر', phone: '01000000002', total: 30000, down: 0, due: 30000, later: 0,
    dueDay: 5, duration: '3 شهر', scheduleStart: '2026-09',
    payments: [{ date: '2026-09-05', amount: 3000, no: 1, month: '2026-09' }] }
];

function todayISO() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function boot() {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  const html = htmlSrc
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + expSrc + '</script>')
    .replace(/<script[^>]*src="monthly\.js"[^>]*>\s*<\/script>/, () => '<script>' + mSrc + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + appSrc + '</script>');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('app_customers', JSON.stringify(CUSTOMERS));
      window.HTMLAnchorElement.prototype.click = function () {};
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      window.URL.createObjectURL = function () { return 'blob:test'; };
      window.URL.revokeObjectURL = function () {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.open = function () { return { closed: false }; };
    }
  });
  const w = dom.window;
  return {
    w, errs,
    $: (s) => w.document.querySelector(s),
    $$: (s) => Array.from(w.document.querySelectorAll(s)),
    click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    wait: (ms) => new Promise((r) => setTimeout(r, ms))
  };
}

const unlock = (t) => {
  t.click(t.$('[data-go="collection"]'));
  ['2', '4', '6', '8'].forEach((k) => t.click(t.$('#keypad button[data-key="' + k + '"]')));
};

(async function run() {
  console.log('\n[1] شريط الشهور أصبح أزرار تحصيل');
  const t = boot();
  await t.wait(80);
  ok('لا أخطاء وقت الإقلاع', t.errs.length === 0, t.errs.join(' | '));

  unlock(t);
  await t.wait(400);
  ok('شاشة التحصيل انفتحت', t.$('#view-collection').classList.contains('is-active'));

  const chips = t.$$('#collectTbody [data-month-pay]');
  ok('فيه زرار لكل شهر في الخطة', chips.length === 9, 'chips=' + chips.length);
  ok('الزرار مرسوم كخلية شهر', chips.length > 0 && chips[0].classList.contains('mcell') && chips[0].classList.contains('is-pick'));
  ok('زر الإرسال الجماعي ظاهر فوق قائمة التحصيل', !!t.$('#waSendAllTop'));

  console.log('\n[2] الضغط على شهر يجهّز دفعة بتاريخ اليوم');
  const chip = t.$('[data-midx="0"][data-month-pay="2026-10"]');
  ok('شهر أكتوبر موجود للعميل الأول', !!chip);
  t.click(chip);
  await t.wait(120);

  const form = t.$('#mainCollectForm');
  ok('تفاصيل العميل اتفتحت', !!t.$('.collection-detail') && !!form);
  ok('التاريخ الافتراضي = تاريخ اليوم', !!form && form.elements.date.value === todayISO(),
    form ? form.elements.date.value : '—');
  ok('الشهر المختار = الشهر اللي اتداس عليه', !!form && form.elements.month.value === '2026-10',
    form ? form.elements.month.value : '—');
  ok('المبلغ اتجهّز بقيمة الشهر', !!form && Number(form.elements.amount.value) === 10000,
    form ? form.elements.amount.value : '—');
  const note = t.$('[data-pick-month-note]');
  ok('رسالة «تحصيل سريع» ظاهرة وبتذكر الشهر', !!note && !note.hidden && note.textContent.indexOf('أكتوبر 2026') > -1,
    note ? note.textContent : '—');

  console.log('\n[3] الحفظ يخصم الدفعة من الشهر المختار');
  form.dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true }));
  await t.wait(150);

  const stored = JSON.parse(t.w.localStorage.getItem('app_customers') || '[]');
  const first = stored.find((c) => c.name === 'عميل شهري');
  ok('الدفعة اتسجلت على العميل', !!first && (first.payments || []).length === 1,
    first ? JSON.stringify(first.payments) : '—');
  ok('الدفعة مربوطة بشهر أكتوبر', !!first && first.payments[0].month === '2026-10',
    first ? JSON.stringify(first.payments[0]) : '—');
  ok('المتبقي اتخصم صح', !!first && Math.abs(Number(first.rest) - 50000) < 0.005,
    first ? first.rest : '—');
  ok('النموذج رجع افتراضي بعد الحفظ (تاريخ اليوم)', !!t.$('#mainCollectForm') &&
    t.$('#mainCollectForm').elements.date.value === todayISO());

  console.log('\n[4] قائمة إرسال الواتساب وحالة كل عميل');
  const queue = t.$('#waQueue');
  ok('قائمة الإرسال موجودة', !!queue);
  ok('كل العملاء ظاهرين في القائمة مرة واحدة', !!queue && queue.querySelectorAll('.wa-queue__row').length === 2,
    queue ? String(queue.querySelectorAll('.wa-queue__row').length) : '—');
  ok('حالة العميل واضحة قبل فتح تفاصيله', !!queue && /جاهز للإرسال/.test(queue.textContent),
    queue ? queue.textContent.slice(0, 120) : '—');
  ok('زر إرسال لكل عميل', !!queue && queue.querySelectorAll('[data-wa-send]').length === 2);
  ok('شارة واتساب ظاهرة في سطر العميل', /واتساب/.test(t.$('#collectTbody').textContent));
  ok('زر الإرسال الجماعي بيعرض عدد المتبقي', /\(2\)/.test(t.$('#waSendAllTop').textContent),
    t.$('#waSendAllTop').textContent);

  console.log('\n[5] الضغط على شهر جوه ملف العميل يجهّز تحصيله');
  if (!t.$('[data-open-profile="0"]')) {
    t.click(t.$('.collection-row[data-idx="0"]'));
    await t.wait(80);
  }
  const openBtn = t.$('[data-open-profile="0"]');
  ok('زر فتح ملف العميل موجود', !!openBtn);
  t.click(openBtn);
  await t.wait(150);
  ok('ملف العميل انفتح', t.$('#view-profile').classList.contains('is-active'));
  const cards = t.$$('#profilePlan [data-month-pay]');
  ok('كروت الشهور في الملف بقت أزرار', cards.length === 6, 'cards=' + cards.length);
  ok('الكارت بيقول إنه قابل للضغط', !!cards[0] && cards[0].classList.contains('is-pick'));
  const card = t.$('#profilePlan [data-month-pay="2026-10"]');
  ok('كارت أكتوبر 2026 موجود', !!card);
  t.click(card);
  await t.wait(150);
  const pf = t.$('#collectForm');
  ok('نموذج تحصيل الملف اتجهّز بالشهر المختار', !!pf && pf.elements.month.value === '2026-10',
    pf ? pf.elements.month.value : '—');
  ok('تاريخ اليوم اتحدد في نموذج الملف', !!pf && pf.elements.date.value === todayISO(),
    pf ? pf.elements.date.value : '—');
  ok('المبلغ اتجهّز بقيمة الشهر', !!pf && Number(pf.elements.amount.value) === 10000,
    pf ? pf.elements.amount.value : '—');
  ok('ملاحظة التحصيل السريع ظاهرة جوه الملف', (function () {
    const n = pf && pf.querySelector('[data-pick-month-note]');
    return !!n && !n.hidden && n.textContent.indexOf('أكتوبر 2026') > -1;
  })());

  ok('لا أخطاء في نهاية الاختبار', t.errs.length === 0, t.errs.join(' | '));

  console.log('\n==================================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL — استثناء غير متوقع: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
