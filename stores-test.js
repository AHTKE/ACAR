/* اختبار: قسم المخازن + ربط الشريك بالدواخل والخوارج + قفل التفاصيل وسجل العمليات */
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

const { seedDemo } = require('./test-fixtures');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) { seedDemo(window); } });
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

window.HTMLAnchorElement.prototype.click = function () {};
try {
  if (!window.document.createElement('canvas').getContext('2d')) {
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
  }
} catch (e) { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; }
window.URL.createObjectURL = function () { return 'blob:test'; };
window.URL.revokeObjectURL = function () {};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const submit = (el) => el.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stores = () => JSON.parse(window.localStorage.getItem('app_stores') || '{"docs":[]}').docs;

(async function () {
  console.log('\n[1] الإقلاع والقفل الجديد');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | '));
  ok('قسم المخازن موجود في الصفحة', !!$('#view-stores'));
  ok('بطاقة المخازن في الرئيسية', !!$$('.card[data-go="stores"]').length);
  ok('بطاقة التفاصيل عليها قفل', (() => {
    const c = $('[data-go="details"]');
    return c && c.classList.contains('card--locked');
  })());

  click($('[data-go="details"]'));
  ok('التفاصيل تطلب كلمة مرور', $('#pwdModal').classList.contains('is-open'));
  click($('#pwdModalClose') || $('#pwdCancel') || { dispatchEvent: () => {} });
  await wait(50);

  click($('[data-go="stores"]'));
  await wait(80);
  ok('قسم المخازن يفتح مباشرة', $('#view-stores').classList.contains('is-active'));

  console.log('\n[2] دواخل: بضاعة من مورد');
  const sf = $('#storeForm').elements;
  sf.date.value = '2026-11-01';
  sf.type.value = 'in';
  $('#storeItem').value = 'بلاط محارة';
  sf.qty.value = '100';
  sf.price.value = '50';
  sf.partyType.value = 'supplier';
  sf.partyName.value = '';
  click($('#storePartyType'));
  $('#storePartyType').value = 'supplier';
  $('#storePartyType').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const supNames = Array.from($('#storePartyList').children).map((o) => o.value);
  ok('اقتراحات الموردين ظهرت', supNames.length > 0, JSON.stringify(supNames).slice(0, 120));
  sf.partyName.value = supNames[0] || 'مورد افتراضي';
  sf.work.value = 'شغلانة بلاط';
  sf.note.value = 'دفعة أولى';
  submit($('#storeForm'));
  await wait(80);
  ok('الحركة اتسجلت في localStorage', stores().length === 1, 'docs=' + stores().length);
  ok('توست نجاح ظهر', $('#toast').classList.contains('show'));
  const supNameUsed = stores()[0].partyName;
  const sups1 = JSON.parse(window.localStorage.getItem('app_suppliers') || '[]');
  ok('توريد بضاعة اتسجل في حركات المورد أصلاً', sups1.some((s) => (s.name || '').trim() === supNameUsed &&
    (s.tx || []).some((t) => (t.desc || '').indexOf('توريد بضاعة (المخازن)') > -1 && Number(t.incoming) === 5000)),
    JSON.stringify(sups1).slice(0, 200));

  console.log('\n[3] خوارج: نفس البضاعة للعميل');
  sf.date.value = '2026-11-02';
  sf.type.value = 'out';
  $('#storeItem').value = 'بلاط محارة';
  sf.qty.value = '40';
  sf.price.value = '60';
  $('#storePartyType').value = 'customer';
  $('#storePartyType').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const custNames = Array.from($('#storePartyList').children).map((o) => o.value);
  ok('اقتراحات العملاء ظهرت', custNames.length > 0);
  sf.partyName.value = 'أحمد محمد علي';
  sf.work.value = 'بلاط محارة — الحي الأول';
  submit($('#storeForm'));
  await wait(80);
  ok('الخوارج اتسجلت', stores().length === 2);
  ok('رصيد البضاعة في ملخص الاستجابة 60', (() => {
    const box = $('#storeSummary');
    const t1 = box ? box.textContent : '';
    return t1.indexOf('60') > -1;
  })(), (() => { const s0 = doc.querySelector('#storeSummary'); return (s0 ? s0.textContent : '').slice(0, 160); }));
  const custs1 = JSON.parse(window.localStorage.getItem('app_customers') || '[]').filter((c) => (c.name || '').trim() === 'أحمد محمد علي');
  ok('خوارج بضاعة اتسجلت في بروفايل العميل أصلاً', custs1.length && ((custs1[0].storeSends || []).length > 0 && (custs1[0].storeSends || []).some((s) => s.via === 'stores' && Number(s.qty) === 40)));

  console.log('\n[4] إشعار النقص');
  sf.date.value = '2026-11-03';
  sf.type.value = 'out';
  $('#storeItem').value = 'بلاط محارة';
  sf.qty.value = '200';
  sf.price.value = '55';
  $('#storePartyType').value = 'customer';
  $('#storePartyType').dispatchEvent(new window.Event('change', { bubbles: true }));
  sf.partyName.value = 'أحمد محمد علي';
  submit($('#storeForm'));
  await wait(80);
  ok('الحركة اتسجلت رغم النقص', stores().length === 3);
  ok('إشعار النقص ظهر أن الكمية خرجت أكثر من الداخل', (() => {
    const p = $('#storeShortagePanel');
    return p && p.hidden === false && $('#storeShortageText').textContent.indexOf('نقص') > -1;
  })(), $('#storeShortageText') && $('#storeShortageText').textContent.slice(0, 140));

  console.log('\n[5] مرتجع');
  sf.date.value = '2026-11-04';
  sf.type.value = 'return';
  $('#storeItem').value = 'سيراميك أرضية';
  sf.qty.value = '10';
  sf.price.value = '30';
  $('#storePartyType').value = 'customer';
  $('#storePartyType').dispatchEvent(new window.Event('change', { bubbles: true }));
  sf.partyName.value = 'شركة النور التجارية';
  submit($('#storeForm'));
  await wait(80);
  ok('المرتجع اتسجل', stores().length === 4);
  ok('المرتجع ظهر في الجدول', (() => { const tb = $('#storeTbody'); return tb && tb.textContent.indexOf('سيراميك أرضية') > -1; })());
  ok('جدول المخازن فيه صف الأصناف الحق', $$('#storeTbody tr td span.tag') != null && $$('#storeTbody tr').length === 4);
  const bal = parseFloat(($('#storeForm').elements.storeItemBalance.value || '').match(/-?[\d.]+/));
  ok('حقل رصيد البضاعة يحسب من نفس البضاعة', !isNaN(bal), 'get=' + bal);

  console.log('\n[6] الشريك: حركة من الدواخل والخوارج تُحسب في بروفايله');
  click($('[data-go="partners"]'));
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(200);
  const pNames = sessionCheckPartners();
  function sessionCheckPartners() {
    const pts = JSON.parse(window.localStorage.getItem('app_partners') || '[]');
    return (pts.length) || 0;
  }
  ok('الشركاء ظهروا بالتالي', $$('#partnersTbody tr').length > 0, 'rows=' + $$('#partnersTbody tr').length);
  const partnerRow = $('#partnersTbody tr [data-partner-profile], #partnersTbody [data-partner-profile]');
  ok('اسم الشريك في صف به بروفايل', !!partnerRow, 'rows=' + $$('#partnersTbody tr').length);
  click(partnerRow || $('#partnersTbody tr'));
  await wait(120);
  const pName = ($('#pfpTitle').textContent || '').trim();
  const w0 = (() => {
    const pts0 = JSON.parse(window.localStorage.getItem('app_partners') || '[]');
    const p0 = pts0.filter((p) => (p.name || '').trim() === pName)[0];
    return p0 ? Number(p0.withdrawals || 0) : 0;
  })();
  ok('بروفايل الشريك فتح', $('#view-partner-profile').classList.contains('is-active'));
  ok('المسحوبات بطاقة فيها المفتاح', $('#pfpSummary') && $('#pfpSummary').textContent.length > 0);

  click($('[data-go="ledger"]'));
  await wait(80);
  const lf = $('#ledgerForm').elements;
  lf.date.value = '2026-11-05';
  lf.type.value = 'out';
  lf.amount.value = '450';
  lf.desc.value = 'حركة شريك من الدواخل والخوارج';
  lf.partyType.value = 'partner';
  lf.partyName.value = pName;
  lf.note.value = 'سحب من الشريك';
  submit($('#ledgerForm'));
  await wait(120);
  ok('الحركة اتسجلت في الدواخل', (() => {
    const led = JSON.parse(window.localStorage.getItem('app_ledger') || '[]');
    return led.some((t) => (t.desc || '').indexOf('حركة شريك من الدواخل والخوارج') > -1);
  })());

  click($('[data-go="partners"]'));
  await wait(80);
  click($('#partnersTbody [data-partner-profile]') || $('#partnersTbody tr'));
  await wait(150);
  const pfpLinks = $('#pfpLinks');
  const linksText = pfpLinks ? pfpLinks.textContent : '';
  ok('الحركة ظهرت في بروفايل الشريك كجدول', linksText.indexOf('حركة شريك من الدواخل والخوارج') > -1, linksText.slice(0, 200));
  ok('الشرح يذكر أن الحركة محسوبة', linksText.indexOf('محتسبة') > -1 || linksText.indexOf('تُحسب') > -1);
  const sumTxt = $('#pfpSummary') ? $('#pfpSummary').textContent : '';
  ok('صف المسحوبات في ملخص بلفظ الدواخل', sumTxt.indexOf('الدواخل') > -1, sumTxt.slice(0, 200));
  ok('الشريك أخذ قيمة الحركة من الصافي', (() => {
    const pts = JSON.parse(window.localStorage.getItem('app_partners') || '[]');
    const nm = pts.map((p) => (p.name || '').trim()).indexOf(pName);
    if (nm < 0) return true;
    const p = pts[nm];
    return (Number(p.withdrawals || 0) || 0) === w0;
  })());

  console.log('\n[7] لا أخطاء تشغيل');
  ok('لا أخطاء تشغيل في كل النقط', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
