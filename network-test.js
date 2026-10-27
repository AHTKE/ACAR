/* اختبار مستقل للشبكة المربوطة — يشغّل بدون حزمة canvas الأصلية */
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
  /* تعطيل canvas قبل تشغيل أي سكربت حتى لا يُسجَّل خطأ بيئة */
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

/* قراءة صندوق ملخص من شاشة التفاصيل حسب اسمه */
function box(label) {
  const el = $$('#detailsBody .summary__box').find((b) => (b.querySelector('small').textContent || '').indexOf(label) > -1);
  return el ? num(el.querySelector('b').textContent) : null;
}
async function openDetails() {
  click($('[data-go="details"]'));
  await wait(60);
}
async function unlock(sel) {
  click($(sel));
  await wait(60);
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
}

(async function () {
  console.log('\n[1] تحميل + شاشة التفاصيل');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | '));
  ok('كarta التفاصيل موجودة في الرئيسية', !!$('[data-go="details"]'));
  await openDetails();
  ok('شاشة التفاصيل انفتحت', $('#view-details').classList.contains('is-active'));
  ok('الشبكة مفعّلة افتراضياً', $('#networkPill').textContent.indexOf('مفعّلة') > -1, $('#networkPill').textContent);

  const out0 = box('إجمالي المبلغ الخارج');
  const sup0 = box('إجمالي التوريدات');
  const dup0 = box('عمليات مكرّرة أُستبعدت');
  ok('الخارج محسوب', typeof out0 === 'number' && out0 > 0, out0);
  ok('التوريدات محسوبة', typeof sup0 === 'number' && sup0 > 0, sup0);
  ok('مبدئياً مفيش تكرار', dup0 === 0, dup0);
  const cust0 = box('المدفوع للعملاء منا نحن');
  const supp0 = box('المدفوع للموردين');
  ok('الأصناف الأربعة موجودة', [cust0, supp0, box('المدفوع للشركاء'), box('الخارج العام')].every((v) => typeof v === 'number'));

  console.log('\n[2] التوريد غير نقدي — لا يدخل المبلغ الخارج');
  click($('[data-go="suppliers"]'));
  await wait(60);
  click($('#suppliersTable tbody tr[data-sup-idx]'));
  await wait(120);
  const supView = $('#view-supplier-profile').classList.contains('is-active');
  ok('كشف حساب المورد فتح', supView);
  if (supView) {
    const f = $('#supTxForm').elements;
    f.date.value = '2026-10-27';
    f.desc.value = 'توريد بلاط';
    f.incoming.value = '3000';
    f.paid.value = '0';
    f.to.value = 'أحمد محمد علي';
    $('#supTxForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(120);
    ok('حقل «ورّد إلى» اتسجل في صف الجدول',
       ($('#supTxTable tbody').textContent || '').indexOf('أحمد محمد علي') > -1);

    await openDetails();
    ok('الخارج لم يزيد من التوريد (غير نقدي)', box('إجمالي المبلغ الخارج') === out0,
       out0 + ' -> ' + box('إجمالي المبلغ الخارج'));
    ok('التوريدات زادت 3000', box('إجمالي التوريدات') === sup0 + 3000,
       sup0 + ' -> ' + box('إجمالي التوريدات'));

    console.log('\n[3] الدفع الفعلي يدخل الخارج مرّة واحدة');
    click($('[data-go="suppliers"]'));
    await wait(60);
    click($('#suppliersTable tbody tr[data-sup-idx]'));
    await wait(120);
    const f2 = $('#supTxForm').elements;
    f2.date.value = '2026-10-27';
    f2.desc.value = 'دفعة للمورد';
    f2.incoming.value = '0';
    f2.paid.value = '3000';
    $('#supTxForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(120);
    await openDetails();
    ok('الخارج زاد بالضبط 3000 (مش 9000)', box('إجمالي المبلغ الخارج') === out0 + 3000,
       out0 + ' -> ' + box('إجمالي المبلغ الخارج'));
    ok('صنف الموردين زاد 3000', box('المدفوع للموردين') === supp0 + 3000,
       supp0 + ' -> ' + box('المدفوع للموردين'));

    console.log('\n[4] التوريد ظهر في بروفايل العميل كمرجع');
    click($('[data-go="customers"]'));
    await wait(60);
    const row = $$('#customersTable tbody tr[data-idx]')
      .find((r) => (r.textContent || '').indexOf('أحمد محمد علي') > -1);
    if (row) click(row);
    await wait(150);
    const onProfile = $('#view-profile').classList.contains('is-active');
    ok('ملف العميل فتح', onProfile);
    if (onProfile) {
      ok('لوحة «المرتبط بهذا العميل» ظهرت', $('#linkPanel').hidden === false);
      ok('التوريد ظهر عند العميل بنفس المبلغ',
         ($('#linkBody').textContent || '').indexOf('3,000') > -1,
         ($('#linkBody').textContent || '').slice(0, 160));
    }
  }

  console.log('\n[5] منع تكرار التوريد عند المورد والعميل معاً');
  await openDetails();
  const dupBefore = box('عمليات مكرّرة أُستبعدت');
  ok('العدد قبل الاختبار', dupBefore === 0, dupBefore);

  console.log('\n[6] حقل «الطرف» في الدواخل والخوارج');
  click($('[data-go="ledger"]'));
  await wait(60);
  const lf = $('#ledgerForm').elements;
  lf.date.value = '2026-10-27';
  lf.type.value = 'out';
  lf.amount.value = '500';
  lf.desc.value = 'دفعة تجريبية';
  lf.partyType.value = 'supplier';
  lf.partyName.value = 'مؤسسة النور للتوريد';
  $('#ledgerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(120);
  ok('شارة الطرف ظهرت في الجدول', $$('#ledgerTbody .party-chip').length > 0,
     $$('#ledgerTbody .party-chip').length);
  await openDetails();
  ok('الخارج زاد 500 في صنف الموردين', box('المدفوع للموردين') === supp0 + 3000 + 500,
     box('المدفوع للموردين'));

  console.log('\n[7] مفتاح الشبكة في الإعدادات');
  click($('[data-go="settings"]'));
  await wait(80);
  const tg = $('#networkToggle');
  ok('المفتاح موجود ومفعّل', !!tg && tg.checked === true);
  ok('النص يوضّح الحالة', ($('#networkState').textContent || '').indexOf('مفعّلة') > -1);
  tg.checked = false;
  tg.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(80);
  ok('الحالة بقت متوقفة', ($('#networkState').textContent || '').indexOf('متوقفة') > -1);
  await openDetails();
  ok('التفاصيل بيطلب تفعيل الشبكة', ($('#detailsNote').textContent || '').indexOf('متوقفة') > -1);
  click($('[data-go="settings"]'));
  await wait(60);
  const tg2 = $('#networkToggle');
  tg2.checked = true;
  tg2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(80);
  await openDetails();
  ok('الإجماليات رجعت بعد التفعيل', typeof box('إجمالي المبلغ الخارج') === 'number');

  console.log('\n[8] الشركاء: الحصة غير إجبارية + بروفيل + أرباح');
  await unlock('[data-go="partners"]');
  ok('قسم الشركاء انفتح', $('#view-partners').classList.contains('is-active'));
  ok('الحصة مش إجبارية في النموذج', !$('#partnerForm [name="share"]').hasAttribute('required'));

  const pf = $('#partnerForm');
  pf.elements.name.value = 'شريك بدون نسبة';
  pf.elements.role.value = 'مستثمر';
  pf.elements.share.value = '';
  pf.elements.capital.value = '750000';
  pf.elements.withdrawals.value = '0';
  pf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(80);
  ok('شريك بدون نسبة اتضاف', $$('#partnersTbody tr').length === 4, $$('#partnersTbody tr').length);
  ok('مفيش رسالة خطأ', $('#partnerError').hidden === true, $('#partnerError').textContent);
  ok('العدّاد بقى 4', $('#partnersCount').textContent === '4 شريك', $('#partnersCount').textContent);

  click($('#partnersTbody [data-partner-profile="0"]'));
  await wait(100);
  ok('بروفايل الشريك انفتح', $('#view-partner-profile').classList.contains('is-active'));
  const pff = $('#pfpForm').elements;
  pff.date.value = '2026-10-20';
  pff.amount.value = '123456';
  pff.note.value = 'ربح تجريبي';
  $('#pfpForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(120);
  ok('الربح اتضاف في الجدول', $$('#pfpTable tbody tr').length >= 1, $$('#pfpTable tbody tr').length);
  const pfpSum = $$('#pfpSummary .summary__box').map((b) => b.querySelector('small').textContent);
  const profitBox = $$('#pfpSummary .summary__box').find((b) => b.querySelector('small').textContent.indexOf('إجمالي الأرباح المضافة') > -1);
  ok('إجمالي أرباح الشريك 123,456', profitBox && num(profitBox.querySelector('b').textContent) === 123456,
     profitBox && profitBox.querySelector('b').textContent);
  ok('اتحفظ في localStorage',
     ((JSON.parse(window.localStorage.getItem('app_partners')) || [])[0].profits || []).length === 1);

  await openDetails();
  const recv = box('إجمالي الأرباح المستلمة من الشركاء');
  ok('التفاصيل ظهرت أرباح الشركاء', typeof recv === 'number' && recv >= 123456, recv);

  console.log('\n[9] السلامة العامة');
  ok('صفر أخطاء وقت التشغيل', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });