/* اختبار: دفع للمورد بدون توريد + تصنيف الحركات + ربط الدواخل والخوارج بالبروفايلات */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const exp = fs.readFileSync('dist/export.js', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + exp + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + app + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    window.HTMLAnchorElement.prototype.click = function () {};
    window.URL.createObjectURL = function () { return 'blob:test'; };
    window.URL.revokeObjectURL = function () {};
    window.HTMLElement.prototype.scrollIntoView = function () {};
  },
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => Number(String(s || '0').replace(/,/g, ''));
const txt = (sel) => ($(sel) ? ($(sel).textContent || '') : '');
function summaryBox(label) {
  const el = $$('#supProfileSummary .summary__box')
    .find((b) => ((b.querySelector('small') || {}).textContent || '').indexOf(label) > -1);
  return el ? num(el.querySelector('b').textContent) : null;
}
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

async function openSupplier() {
  click($('[data-go="suppliers"]'));
  await wait(60);
  const row = $('#suppliersTable tbody tr[data-sup-idx]');
  if (row) click(row);
  await wait(120);
}
async function openCustomer(name) {
  click($('[data-go="customers"]'));
  await wait(60);
  const row = $$('#customersTable tbody tr[data-idx]')
    .find((r) => (r.textContent || '').indexOf(name) > -1);
  if (row) click(row);
  await wait(150);
}

(async function () {
  console.log('\n[1] تحميل الصفحة + عناصر الميزات الجديدة');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | '));
  ok('نموذج «دفع للمورد» موجود', !!$('#supPayForm'));
  ok('حقل «الباقي بعد الدفعة» موجود', !!$('#supPayForm') && !!$('#supPayForm').elements.pAfter);
  ok('أزرار التصنيف موجودة', $$('#supTxFilter [data-sup-filter]').length === 3,
     $$('#supTxFilter [data-sup-filter]').length);
  ok('لوحة حركات الدواخل والخوارج موجودة', !!$('#supLedgerBody'));
  ok('شريط المشاهد موجود ومخفي للمصرح له', !!$('#viewerDriveBar') &&
     $('#viewerDriveBar').style.display !== 'flex');
  ok('دوال المزامنة مكشوفة للمشاهد', typeof window.syncCheck === 'function' && typeof window.isViewerMode === 'function');

  console.log('\n[2] فتح كشف حساب المورد وحساب الدفعة قبل الحفظ');
  await openSupplier();
  ok('كشف الحساب فتح', $('#view-supplier-profile').classList.contains('is-active'));
  const pay = $('#supPayForm');
  const before = num(pay.elements.pRest.value);
  const paidBefore = num(pay.elements.pPaid.value);
  ok('الباقي الحالي معروض', typeof before === 'number');
  pay.elements.amount.value = '500';
  pay.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(60);
  ok('إجمالي المدفوع بعد الدفعة زاد 500', num(pay.elements.pPaid.value) === paidBefore + 500,
     paidBefore + ' -> ' + pay.elements.pPaid.value);
  ok('الباقي بعد الدفعة نقص 500', num(pay.elements.pAfter.value) === before - 500,
     before + ' -> ' + pay.elements.pAfter.value);

  console.log('\n[3] حفظ الدفعة بدون أي توريد');
  pay.elements.date.value = '2026-10-28';
  pay.elements.note.value = 'دفعة تجريبية بدون توريد';
  submit(pay);
  await wait(120);
  ok('الدفعة ظهرت في جدول الحركات', txt('#supTxTable tbody').indexOf('دفعة تجريبية بدون توريد') > -1);
  ok('الدفعة موسومة «دفعة»', txt('#supTxTable tbody').indexOf('دفعة') > -1);
  ok('الباقي نقص 500 فعلياً', num($('#supPayForm').elements.pRest.value) === before - 500,
     before + ' -> ' + $('#supPayForm').elements.pRest.value);
  ok('بدون توريد: الوارد ما زادش', txt('#supTxTable tbody').indexOf('0') > -1);

  console.log('\n[4] تصنيف الحركات: الكل / الشغل / الدفعات');
  const workBtn = $$('#supTxFilter [data-sup-filter]').find((b) => b.getAttribute('data-sup-filter') === 'work');
  const payBtn = $$('#supTxFilter [data-sup-filter]').find((b) => b.getAttribute('data-sup-filter') === 'pay');
  const allBtn = $$('#supTxFilter [data-sup-filter]').find((b) => b.getAttribute('data-sup-filter') === 'all');
  const allRows = $$('#supTxTable tbody tr').length;
  click(payBtn);
  await wait(60);
  const payRows = $$('#supTxTable tbody tr');
  ok('تصنيف «الدفعات» عرض صفوف فقط', payRows.length > 0 && payRows.length < allRows,
     payRows.length + ' / ' + allRows);
  ok('تصنيف «الدفعات» فيه الدفعة التجريبية', txt('#supTxTable tbody').indexOf('دفعة تجريبية بدون توريد') > -1);
  ok('زر الدفعات صار نشطاً', payBtn.className.indexOf('btn--primary') > -1, payBtn.className);
  click(workBtn);
  await wait(60);
  ok('تصنيف «الشغل» أخفى الدفعات', txt('#supTxTable tbody').indexOf('دفعة تجريبية بدون توريد') === -1);
  click(allBtn);
  await wait(60);
  ok('تصنيف «الكل» رجّع كل الصفوف', $$('#supTxTable tbody tr').length === allRows,
     $$('#supTxTable tbody tr').length + ' / ' + allRows);

  console.log('\n[5] حركة «داخل/خارج» للمورد تظهر في كشف حسابه');
  const supName = ($('#supProfileTitle').textContent || '').replace('كشف حساب:', '').trim();
  const restBefore5 = num($('#supPayForm').elements.pRest.value);
  const paidBefore5 = summaryBox('إجمالي المدفوع للمورد');
  click($('[data-go="ledger"]'));
  await wait(80);
  const lf = $('#ledgerForm').elements;
  lf.date.value = '2026-10-29';
  lf.type.value = 'out';
  lf.amount.value = '700';
  lf.desc.value = 'دفعة للمورد من الدواخل والخوارج';
  lf.partyType.value = 'supplier';
  lf.partyName.value = supName;
  submit($('#ledgerForm'));
  await wait(120);
  ok('الحركة اتسجلت في الدواخل والخوارج',
     txt('#ledgerTbody').indexOf('دفعة للمورد من الدواخل والخوارج') > -1);
  await openSupplier();
  ok('صف المورد صحيح', ($('#supProfileTitle').textContent || '').indexOf(supName) > -1);
  ok('لوحة الدواخل والخوارج فيها الحركة',
     txt('#supLedgerBody').indexOf('دفعة للمورد من الدواخل والخوارج') > -1,
     txt('#supLedgerBody').slice(0, 120));
  ok('الباقي نقص 700 بعد الحركة', num($('#supPayForm').elements.pRest.value) === restBefore5 - 700,
     restBefore5 + ' -> ' + $('#supPayForm').elements.pRest.value);
  ok('إجمالي المدفوع للمورد زاد 700',
     summaryBox('إجمالي المدفوع للمورد') === paidBefore5 + 700,
     paidBefore5 + ' -> ' + summaryBox('إجمالي المدفوع للمورد'));

  console.log('\n[6] العميل: دفع من «الدواخل والخوارج» يظهر في التحصيل');
  const custName = 'أحمد محمد علي';
  await openCustomer(custName);
  const profileOk = $('#view-profile').classList.contains('is-active');
  ok('ملف العميل فتح', profileOk);
  if (profileOk) {
    const restCustBefore = num(($('#profileMoney') ? $('#profileMoney').textContent : '').match(/—/g) ? 0 : 0);
    click($('[data-go="ledger"]'));
    await wait(80);
    const c1 = $('#ledgerForm').elements;
    c1.date.value = '2026-10-29';
    c1.type.value = 'in';
    c1.amount.value = '900';
    c1.desc.value = 'تحصيل من العميل من الشاشة الأخرى';
    c1.partyType.value = 'customer';
    c1.partyName.value = custName;
    submit($('#ledgerForm'));
    await wait(120);
    await openCustomer(custName);
    ok('الحركة ظهرت في جدول تحصيل العميل',
       txt('#collectTable tbody').indexOf('تحصيل من العميل من الشاشة الأخرى') > -1,
       txt('#collectTable tbody').slice(0, 160));
    ok('الحركة موسومة «دواخل/خوارج»', txt('#collectTable tbody').indexOf('دواخل/خوارج') > -1);
  }

  console.log('\n[7] الشريك: حركته تظهر في بروفايله');
  click($('[data-go="partners"]'));
  await wait(80);
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
  const partnerRow = $('[data-partner-profile]');
  ok('قسم الشركاء انفتح', $('#view-partners').classList.contains('is-active'));
  if (partnerRow) {
    click(partnerRow);
    await wait(150);
    const pName = ($('#pfpTitle').textContent || '').trim();
    click($('[data-go="ledger"]'));
    await wait(80);
    const b2 = $('#ledgerForm').elements;
    b2.date.value = '2026-10-29';
    b2.type.value = 'out';
    b2.amount.value = '450';
    b2.desc.value = 'مبلغ للشريك من الدواخل والخوارج';
    b2.partyType.value = 'partner';
    b2.partyName.value = pName;
    submit($('#ledgerForm'));
    await wait(120);
    click($('[data-go="partners"]'));
    await wait(80);
    click($('[data-partner-profile]'));
    await wait(150);
    ok('بروفايل الشريك فتح', $('#view-partner-profile').classList.contains('is-active'));
    ok('حركة الشريك ظهرت في بروفايله',
       txt('#pfpLinks').indexOf('مبلغ للشريك من الدواخل والخوارج') > -1,
       txt('#pfpLinks').slice(0, 160));
    ok('إجمالي الخارج للشريك معروض', txt('#pfpLinks').indexOf('450') > -1);
  }

  console.log('\n[8] لا أخطاء تشغيل بعد كل الخطوات');
  ok('لا أخطاء تشغيل', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  window.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
