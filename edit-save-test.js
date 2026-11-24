'use strict';
/* اختبار شامل: حفظ التعديلات + اختيار شهر التحصيل من الواجهة
   تشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node edit-save-test.js */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
['export.js', 'monthly.js', 'customer-extra.js', 'employees.js', 'app.js'].forEach((f) => {
  if (!fs.existsSync('dist/' + f)) return;
  const src = fs.readFileSync('dist/' + f, 'utf8');
  html = html.replace(new RegExp('<script[^>]*src="' + f.replace('.', '\\.') + '"[^>]*>\\s*</script>'),
    () => '<script>' + src + '</script>');
});

const RICH = {
  name: 'عميل كامل', phone: '0770000000', phone2: '0771111111', nationalId: '12345678901234',
  address: 'بغداد', paidByUs: 5000000, total: 12000000, down: 2000000, later: 0,
  due: 10000000, rest: 8000000, duration: '10 شهر', dueDay: 19, scheduleStart: '2026-09',
  status: 'جاري العمل', startYear: '2026', endYear: '2027', startDate: '2026-09-01', endDate: '2027-07-01',
  balance: 8000000, notes: [],
  payments: [{ date: '2026-10-19', amount: 1000000, no: 1, note: '' }],
  manufacturing: [{ id: 'm1', date: '2026-10-01', kind: 'store', worker: 'عمال', amount: 250000 }],
  storeSends: [{ id: 's1', date: '2026-10-02', kind: 'send', total: 100000 }],
  custom: {}
};
const LEGACY = { name: 'عميل قديم', phone: '0770123456', address: 'بغداد / الكرادة', balance: 300000 };

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.localStorage.setItem('app_customers', JSON.stringify([LEGACY, RICH]));
    window.localStorage.setItem('app_custom_fields', JSON.stringify({ customers: [], ledger: [] }));
    window.localStorage.setItem('app_default_due_day', '19');
  }
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const readCustomers = () => JSON.parse(window.localStorage.getItem('app_customers') || '[]');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

async function openProfileOf(name) {
  const rows = $$('#customersTable tbody tr[data-idx]');
  const row = rows.find((r) => r.textContent.includes(name));
  if (!row) throw new Error('مفيش صف للعميل ' + name);
  click(row);
  await wait(120);
}

async function editAndSave(changes) {
  click($('#profileEditBtn'));
  await wait(40);
  click($('#confirmYes'));
  await wait(80);
  const form = $('#customerForm');
  Object.keys(changes).forEach((k) => { form.elements[k].value = changes[k]; });
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(150);
}

(async function () {
  await wait(300);
  ok('الصفحة اتحملت بدون أخطاء', errors.length === 0, errors.join(' | '));
  ok('العميلين ظاهرين', $$('#customersTable tbody tr[data-idx]').length === 2);

  /* ---- 1) عميل قديم ناقص حقول: التعديل لازم يتحفظ ---- */
  await openProfileOf('عميل قديم');
  ok('ملف العميل القديم اتفتح', $('#view-profile').classList.contains('is-active'));
  await editAndSave({ address: 'عنوان جديد للعميل القديم', phone2: '0779999999' });
  let saved = readCustomers();
  ok('تعديل العميل القديم اتحفظ', saved[0].address === 'عنوان جديد للعميل القديم', saved[0].address);
  ok('الحقل اللي اتضاف اتحفظ', saved[0].phone2 === '0779999999');
  ok('العميل القديم رجع لملفه', $('#view-profile').classList.contains('is-active'));
  ok('التعديل باين في الملف', $('#view-profile').textContent.includes('عنوان جديد للعميل القديم'));
  ok('مفيش تنبيه حقول ناقصة', $('#formAlert').hidden === true);

  /* ---- 2) عميل كامل: التعديل يحافظ على المصنعية وحركات المخازن ---- */
  await openProfileOf('عميل كامل');
  await editAndSave({ address: 'عنوان محدث' });
  saved = readCustomers();
  ok('تعديل العميل الكامل اتحفظ', saved[1].address === 'عنوان محدث', saved[1].address);
  ok('المصنعية محفوظة بعد التعديل', (saved[1].manufacturing || []).length === 1);
  ok('حركات المخازن محفوظة بعد التعديل', (saved[1].storeSends || []).length === 1);
  ok('الدفعات محفوظة بعد التعديل', (saved[1].payments || []).length === 1);

  /* ---- 3) تحصيل من البروفايل مع اختيار الشهر ---- */
  await openProfileOf('عميل كامل');
  const cf = $('#collectForm');
  ok('نموذج التحصيل فيه اختيار شهر', !!cf.elements.month);
  const optValues = Array.from(cf.elements.month.options).map((o) => o.value);
  ok('الشهور معروضة في القائمة', optValues.includes('2026-09') && optValues.includes('2026-11'), optValues.join(','));
  const nowKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  ok('الافتراضي في نموذج البروفايل هو الشهر الحالي',
    cf.elements.month.value === (optValues.includes(nowKey) ? nowKey : ''), cf.elements.month.value + ' / ' + nowKey);
  cf.elements.date.value = '2026-11-23';
  cf.elements.amount.value = '3000';
  cf.elements.month.value = '2026-11';
  cf.elements.no.value = '2';
  cf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(150);
  saved = readCustomers();
  const lastPay = saved[1].payments[saved[1].payments.length - 1];
  ok('الدفعة اتسجلت', !!lastPay && Number(lastPay.amount) === 3000);
  ok('الدفعة اتربطت بالشهر المختار', lastPay.month === '2026-11', JSON.stringify(lastPay));
  ok('ملف العميل فيه دفع جزئي', $('#profilePlan').textContent.includes('دفع جزئي'), $('#profilePlan').textContent.slice(0, 120));
  ok('الكارت بيوضح المتبقي', $('#profilePlan').textContent.includes('متبقي منه'));
  ok('سبتمبر لسه متأخر', $('#profilePlan').textContent.includes('متأخر'));

  /* ---- 4) تحصيل من شاشة التحصيل: القائمة موجودة وكمان اختيار الشهر ---- */
  click($('[data-go="collection"]'));
  await wait(120);
  if ($('#pwdModal') && $('#pwdModal').classList.contains('is-open')) {
    ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
    await wait(400);
  }
  ok('شاشة التحصيل اتفتحت', $('#view-collection').classList.contains('is-active'));
  const rows2 = $$('#collectTbody tr.collection-row');
  const row = rows2.find((r) => r.textContent.includes('عميل كامل')) || rows2[0];
  click(row);
  await wait(120);
  const mForm = $('#mainCollectForm');
  ok('نموذج التحصيل الرئيسي فيه اختيار شهر', !!mForm && !!mForm.elements.month);
  if (mForm && mForm.elements.month) {
    const vals = Array.from(mForm.elements.month.options).map((o) => o.value);
    ok('شهور الخطة موجودة في القائمة', vals.includes('2026-11'), vals.join(','));
    const nowK = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    ok('الافتراضي في نموذج التحصيل الرئيسي هو الشهر الحالي',
      mForm.elements.month.value === (vals.includes(nowK) ? nowK : ''), mForm.elements.month.value + ' / ' + nowK);
  }

  console.log('\n' + (fail ? '✗ فشل ' + fail + ' / ' + (pass + fail) : '✓ نجح ' + pass + ' تحقق'));
  ok('مفيش أخطاء JS أثناء الاختبار', errors.length === 0, errors.join(' | '));
  try { window.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
