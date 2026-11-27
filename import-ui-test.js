/* ============================================================
   import-ui-test.js — استيراد العملاء من داخل الإعدادات (واجهة كاملة)
   ملف CSV → معاينة وربط أعمدة → تأكيد → إضافة لقاعدة البيانات.
   والتأكد إن الاستيراد المكرر ما بيكررش العملاء ولا الدفعات.
   ============================================================ */
'use strict';

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlSrc = fs.readFileSync('dist/index.html', 'utf8');
const appSrc = fs.readFileSync('dist/app.js', 'utf8');
const impSrc = fs.readFileSync('dist/importer.js', 'utf8');
const expSrc = fs.readFileSync('dist/export.js', 'utf8');
const mSrc = fs.readFileSync('dist/monthly.js', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

function boot() {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  let html = htmlSrc
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + expSrc + '</script>')
    .replace(/<script[^>]*src="monthly\.js"[^>]*>\s*<\/script>/, () => '<script>' + mSrc + '</script>')
    .replace(/<script[^>]*src="importer\.js"[^>]*>\s*<\/script>/, () => '<script>' + impSrc + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + appSrc + '</script>');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.HTMLAnchorElement.prototype.click = function () {};
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      window.URL.createObjectURL = function () { return 'blob:test'; };
      window.URL.revokeObjectURL = function () {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
    }
  });
  const w = dom.window;
  return {
    w, doc: w.document, errs,
    $: (s) => w.document.querySelector(s),
    $$: (s) => Array.from(w.document.querySelectorAll(s)),
    click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    toast: () => { const t = w.document.getElementById('toast'); return t ? (t.textContent || '') : ''; }
  };
}

function pick(t, text, name) {
  const input = t.$('#importDataFile');
  const file = new t.w.File([text], name || 'data.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new t.w.Event('change', { bubbles: true }));
}

const CUSTOMERS_CSV = [
  'اسم العميل,رقم التلفون,العنوان,المبلغ الإجمالي,المقدم,المبلغ الشهري,يوم التحصيل,تاريخ البدء,الحالة',
  'يوسف إبراهيم,01005550000,القاهرة,50000,5000,3000,10,2025-02-01,جاري العمل',
  'منى سعيد,01116660000,الجيزة,24000,0,2000,15,2025-04-01,جاري العمل'
].join('\n');

const PAYMENTS_CSV = [
  'التاريخ,اسم العميل,المبلغ المدفوع,ملاحظات',
  '2025-05-01,يوسف إبراهيم,3000,دفعة مايو',
  '2025-06-01,يوسف إبراهيم,3000,دفعة يونيو'
].join('\n');

(async function run() {
  console.log('\n[1] لوحة الاستيراد موجودة في الإعدادات');

  const t = boot();
  await t.wait(100);
  ok('لا أخطاء وقت الإقلاع', t.errs.length === 0, t.errs.join(' | '));
  ok('لوحة استيراد العملاء موجودة', !!t.$('#importDataPanel'));
  ok('حقل الملف من نوع xlsx/csv/pdf',
    !!t.$('#importDataFile') && /\.xlsx/.test(t.$('#importDataFile').getAttribute('accept') || ''),
    t.$('#importDataFile') ? t.$('#importDataFile').getAttribute('accept') : 'غير موجود');
  ok('اللوحة في نفس شبكة الإعدادات مع كلمة المرور والأقسام المحمية',
    !!t.$('#importDataPanel') && t.$('#importDataPanel').closest('.settings-grid') !== null);

  console.log('\n[2] قراءة ملف عملاء + معاينة قبل الحفظ');
  pick(t, CUSTOMERS_CSV, 'customers.csv');
  await t.wait(250);

  ok('الملف اتقرأ وظهرت حالة نجاح', !!t.$('#importDataStatus') && !t.$('#importDataStatus').hidden,
    t.$('#importDataStatus') ? t.$('#importDataStatus').textContent : 'مفيش حالة');
  const preview = t.$('#importDataPreview');
  ok('معاينة الأعمدة ظهرت', !!preview && t.$$('#importDataPreview [data-import-map]').length >= 6,
    'maps=' + t.$$('#importDataPreview [data-import-map]').length);
  ok('عمود الاسم اتربط تلقائياً', (() => {
    const sels = t.$$('#importDataPreview [data-import-map]');
    return sels.some((s) => s.value === 'name');
  })(), t.$$('#importDataPreview [data-import-map]').map((s) => s.value).join(','));
  ok('المعاينة بتبيّن عميلين جداد', /2 عميل جديد/.test(preview.textContent), preview.textContent.slice(0, 160));
  ok('زر الإضافة متاح', !!t.$('#importApplyBtn') && !t.$('#importApplyBtn').disabled);

  console.log('\n[3] تأكيد الإضافة لقاعدة البيانات');
  t.click(t.$('#importApplyBtn'));
  await t.wait(150);

  let list = JSON.parse(t.w.localStorage.getItem('app_customers') || '[]');
  ok('العميلين اتضافوا فعلاً', list.length === 2, 'count=' + list.length);
  const youssef = list.find((c) => c.name === 'يوسف إبراهيم');
  ok('بيانات العميل اتحولت صح', !!youssef && Number(youssef.total) === 50000 && Number(youssef.down) === 5000,
    youssef ? JSON.stringify({ total: youssef.total, down: youssef.down }) : 'مش موجود');
  ok('المتبقي محسوب = 45000', !!youssef && Math.abs(Number(youssef.rest) - 45000) < 0.005,
    youssef ? youssef.rest : '—');
  ok('يوم التحصيل والتاريخ اتنقلوا', !!youssef && Number(youssef.dueDay) === 10 && youssef.startDate === '2025-02-01',
    youssef ? JSON.stringify({ dueDay: youssef.dueDay, startDate: youssef.startDate }) : '—');
  ok('المبلغ الشهري اتحفظ', !!youssef && Number(youssef.monthlyAmount) === 3000,
    youssef ? youssef.monthlyAmount : '—');
  ok('رسالة نجاح فيها عدد العملاء', /عميل جديد/.test(t.$('#importDataStatus').textContent),
    t.$('#importDataStatus').textContent);


  console.log('\n[4] ملف دفعات — بتتضاف على العميل الموجود');
  pick(t, PAYMENTS_CSV, 'payments.csv');
  await t.wait(250);
  const payPreview = t.$('#importDataPreview');
  ok('اتعرّف كملف دفعات تلقائياً', /دفعة هتتضاف لعملاء موجودين/.test(payPreview.textContent),
    payPreview.textContent.slice(0, 200));
  t.click(t.$('#importApplyBtn'));
  await t.wait(150);

  list = JSON.parse(t.w.localStorage.getItem('app_customers') || '[]');
  const afterPay = list.find((c) => c.name === 'يوسف إبراهيم');
  ok('عدد العملاء ما اتغيرش (مفيش تكرار)', list.length === 2, 'count=' + list.length);
  ok('الدفعتين اتضافوا للعميل', !!afterPay && (afterPay.payments || []).length === 2,
    afterPay ? JSON.stringify(afterPay.payments) : '—');
  ok('المتبقي اتخصم بعد الدفعات = 39000', !!afterPay && Math.abs(Number(afterPay.rest) - 39000) < 0.005,
    afterPay ? afterPay.rest : '—');
  const guardHist = t.w.localStorage.getItem('app_data_history') || '';
  ok('نسخة رجوع اتسجلت قبل تعديل البيانات', guardHist.indexOf('استيراد') > -1, guardHist.slice(0, 100));

  console.log('\n[5] إعادة نفس الملف ما بتعملش تكرار');
  pick(t, PAYMENTS_CSV, 'payments.csv');
  await t.wait(250);
  t.click(t.$('#importApplyBtn'));
  await t.wait(150);
  list = JSON.parse(t.w.localStorage.getItem('app_customers') || '[]');
  const again = list.find((c) => c.name === 'يوسف إبراهيم');
  ok('نفس الدفعات ما اتضافتش مرتين', !!again && (again.payments || []).length === 2,
    again ? JSON.stringify(again.payments) : '—');
  ok('عدد العملاء لسه 2', list.length === 2, 'count=' + list.length);

  console.log('\n[6] المدفوع القديم بيتوزع على شهوره (مش على تاريخ واحد)');
  const DIST_CSV = [
    'اسم العميل,رقم التلفون,المبلغ الإجمالي,المدفوع,المتبقي,المبلغ الشهري,يوم التحصيل,تاريخ البدء',
    'عميل قديم موزع,01007770000,30000,20000,10000,5000,10,2025-01-10'
  ].join('\n');
  pick(t, DIST_CSV, 'old-customers.csv');
  await t.wait(250);
  const distPreview = t.$('#importDataPreview');
  ok('المعاينة بتوضح عدد الدفعات اللي هتتوزع', /4 دفعة قديمة هتتوزع/.test(distPreview.textContent),
    distPreview.textContent.slice(0, 240));
  t.click(t.$('#importApplyBtn'));
  await t.wait(200);

  list = JSON.parse(t.w.localStorage.getItem('app_customers') || '[]');
  const dist = list.find((c) => c.name === 'عميل قديم موزع');
  ok('العميل القديم اتضاف', !!dist);
  ok('المدفوع اتقسم على 4 شهور', !!dist && (dist.payments || []).length === 4,
    dist ? JSON.stringify(dist.payments) : '—');
  ok('كل دفعة مربوطة بشهرها', !!dist && dist.payments.map((p) => p.month).join(',') === '2025-01,2025-02,2025-03,2025-04',
    dist ? dist.payments.map((p) => p.month).join(',') : '—');
  ok('قيمة الدفعة = المبلغ الشهري', !!dist && dist.payments.every((p) => Math.abs(Number(p.amount) - 5000) < 0.005));
  ok('أول دفعة بتاريخ البدء', !!dist && dist.payments[0].date === '2025-01-10',
    dist ? dist.payments[0].date : '—');
  ok('المتبقي بعد المدفوع = 10000', !!dist && Math.abs(Number(dist.rest) - 10000) < 0.005,
    dist ? dist.rest : '—');
  ok('المبلغ الشهري اتحفظ', !!dist && Number(dist.monthlyAmount) === 5000);

  ok('لا أخطاء في نهاية الاختبار', t.errs.length === 0, t.errs.join(' | '));

  console.log('\n==================================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL — استثناء غير متوقع: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
