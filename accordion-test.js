/* ============================================================
   accordion-test.js — إعادة الهيكلة: سهم لكل خاصية ودمج العملاء
   1) التحصيل: لوحة بحث/تاريخ قابلة للطي بمحتوى واحد بدون تكرار عملاء
   2) ملف العميل: البيانات الشخصية/المالية/المرسل قابلة للطي
   3) حالة الطي بتتحفظ على الجهاز وبتفضل بعد إعادة التشغيل
   ============================================================ */
'use strict';

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlSrc = fs.readFileSync('dist/index.html', 'utf8');
const appSrc = fs.readFileSync('dist/app.js', 'utf8');
const impSrc = fs.readFileSync('dist/importer.js', 'utf8');
const expSrc = fs.readFileSync('dist/export.js', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const CUSTOMERS = [
  { name: 'عميل أول', phone: '01000000001', total: 10000, down: 0, due: 10000, payments: [{ date: '2026-10-01', amount: 1000, no: 1 }] },
  { name: 'عميل تاني', phone: '01000000002', total: 5000, down: 0, due: 5000, payments: [] }
];

function boot(seed, extra) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  const html = htmlSrc
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + expSrc + '</script>')
    .replace(/<script[^>]*src="importer\.js"[^>]*>\s*<\/script>/, () => '<script>' + impSrc + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + appSrc + '</script>');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('app_customers', JSON.stringify(seed || CUSTOMERS));
      if (extra) Object.keys(extra).forEach((k) => window.localStorage.setItem(k, extra[k]));
      window.HTMLAnchorElement.prototype.click = function () {};
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      window.URL.createObjectURL = function () { return 'blob:test'; };
      window.URL.revokeObjectURL = function () {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
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
  console.log('\n[1] التحصيل — سهم للبحث والتاريخ، وقائمة واحدة للعملاء');
  const t = boot();
  await t.wait(80);
  ok('لا أخطاء وقت الإقلاع', t.errs.length === 0, t.errs.join(' | '));

  const filterPanel = t.$('[data-collapse-key="collection-filters"]');
  ok('لوحة البحث والتصفية بقت قسم بسهم', !!filterPanel && !!filterPanel.querySelector('.acc__head'));
  ok('حقل «من تاريخ» موجود', !!t.$('#collectionFrom'));
  ok('حقل «إلى تاريخ» موجود', !!t.$('#collectionTo'));
  ok('القسم مفتوح افتراضياً (البحث متاح فوراً)', !!filterPanel && filterPanel.classList.contains('is-open'));

  const waPanel = t.$('[data-collapse-key="collection-wa"]');
  ok('لوحة رسائل الواتساب بقت قسم بسهم', !!waPanel && !!waPanel.querySelector('.acc__head'));
  ok('لوحة الواتساب مقفولة افتراضياً (شاشة أهدى)', !!waPanel && !waPanel.classList.contains('is-open'));
  ok('مفيش جدول عملاء مكرر للواتساب', !t.$('#waTbody'));

  t.click(filterPanel.querySelector('.acc__head'));
  await t.wait(60);
  ok('الضغط على السهم يقفل القسم', !filterPanel.classList.contains('is-open'));
  ok('الحالة اتحفظت على الجهاز',
    JSON.parse(t.w.localStorage.getItem('app_accordion_state') || '{}')['collection-filters'] === false);

  console.log('\n[2] ملف العميل — كل خاصية بسهمها');
  unlock(t);
  await t.wait(350);
  ok('شاشة التحصيل انفتحت', t.$('#view-collection').classList.contains('is-active'));

  t.click(t.$('.collection-row[data-idx="0"]'));
  await t.wait(120);
  ok('تفاصيل العميل اتفتحت في نفس القائمة', !!t.$('.collection-detail'));
  t.click(t.$('[data-open-profile="0"]'));
  await t.wait(150);

  [['profile-info', 'البيانات الشخصية'], ['profile-money', 'البيانات المالية'], ['profile-send', 'المرسل من موارد']].forEach(([key, label]) => {
    const p = t.$('[data-collapse-key="' + key + '"]');
    ok('قسم «' + label + '» بسهم', !!p && !!p.querySelector('.acc__head'));
    ok('قسم «' + label + '» مقفول افتراضياً', !!p && !p.classList.contains('is-open'));
  });
  const info = t.$('[data-collapse-key="profile-info"]');
  t.click(info.querySelector('.acc__head'));
  await t.wait(60);
  ok('فتح بيانات العميل بالضغط على السهم', info.classList.contains('is-open'));
  ok('البيانات موجودة جوّه القسم', (t.$('#profileInfo').textContent || '').indexOf('عميل أول') > -1);

  const collect = t.$('[data-collapse-key="profile-collect"]');
  ok('قسم التحصيل مفتوح افتراضياً (الإجراء الأساسي)', !!collect && collect.classList.contains('is-open'));

  console.log('\n[3] نطاق التاريخ بيفلتر العملاء');
  t.click(t.$('[data-go="collection"]'));
  await t.wait(150);
  const rowsAll = t.$$('#collectTbody tr.collection-row').length;
  const from = t.$('#collectionFrom');
  from.value = '2026-10-01';
  from.dispatchEvent(new t.w.Event('change', { bubbles: true }));
  await t.wait(80);
  const rowsFiltered = t.$$('#collectTbody tr.collection-row').length;
  ok('بدون تاريخ: عميلين', rowsAll === 2, 'rows=' + rowsAll);
  ok('بعد «من تاريخ»: عميل واحد بس (اللي دفع في أكتوبر)', rowsFiltered === 1, 'rows=' + rowsFiltered);
  t.click(t.$('#collectionClearDates'));
  await t.wait(80);
  ok('مسح التاريخ بيرجّع الكل', t.$$('#collectTbody tr.collection-row').length === 2);

  console.log('\n[4] الحالة بتفضل بعد إعادة التشغيل');
  const t2 = boot(CUSTOMERS, {
    app_accordion_state: t.w.localStorage.getItem('app_accordion_state') || '{}'
  });
  await t2.wait(80);
  const p2 = t2.$('[data-collapse-key="collection-filters"]');
  ok('قسم البحث فضل مقفول زي ما المستخدم سيبه', !!p2 && !p2.classList.contains('is-open'));

  console.log('\n==================================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL — استثناء غير متوقع: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
