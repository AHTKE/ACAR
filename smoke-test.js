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
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

/* ---- بيئة الاختبار: منع التنقل الحقيقي واعتراض ملفات التحميل ---- */
window.HTMLAnchorElement.prototype.click = function () {};
/* لو مفيش حزمة canvas نحاكي «لا يوجد canvas» بدل ما يسجّل خطأ not-implemented */
try {
  if (!window.document.createElement('canvas').getContext('2d')) {
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
  }
} catch (e) {
  window.HTMLCanvasElement.prototype.getContext = function () { return null; };
}
window.URL.createObjectURL = function () { return 'blob:test'; };
window.URL.revokeObjectURL = function () {};
let capturedBlob = null;
const RealBlob = window.Blob;
window.Blob = function (parts, opts) {
  capturedBlob = { type: (opts && opts.type) || '', parts: Array.prototype.slice.call(parts || []) };
  return new RealBlob(parts, opts);
};
const capBytes = () => Buffer.concat((capturedBlob ? capturedBlob.parts : []).map((p) => Buffer.from(p)));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  console.log('\n[1] تحميل الصفحة');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | '));
  ok('جدول التحصيل موجود', !!$('#collectTbody'));
  ok('جدول التحصيل الرئيسي اتخترق بـ id صحيح', !!$('#collectionList'));
  ok('ملخص التحصيل اتبنى', $$('#collectionSummary .summary__box').length === 3);
  ok('صف العملاء ظهر (5 عملاء افتراضيون)', $$('#collectTbody tr.collection-row').length === 5,
     'found=' + $$('#collectTbody tr.collection-row').length);
  ok('عدّاد العملاء محدَّث', $('#collectionCount').textContent === '5 عميل', $('#collectionCount').textContent);
  ok('لا تفاصيل مفتوحة في البداية', $$('#collectTbody .collection-detail').length === 0);

  console.log('\n[2] فتح قسم التحصيل بكلمة المرور');
  click($('[data-go="collection"]'));
  ok('نافذة كلمة المرور انفتحت', $('#pwdModal').classList.contains('is-open'));
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
  ok('شاشة التحصيل صارت نشطة', $('#view-collection').classList.contains('is-active'));
  ok('لا خطأ بعد كلمة المرور', errors.length === 0, errors.join(' | '));

  console.log('\n[3] الضغط على اسم العميل (أكورديون)');
  const row = $('#collectTbody tr.collection-row');
  click(row);
  ok('ظهرت القائمة المنبثقة أسفل السطر', $$('#collectTbody .collection-detail').length === 1);
  ok('الصف عليه فئة is-open', row.classList.contains('is-open') || $('#collectTbody tr.collection-row').classList.contains('is-open'));
  ok('نموذج إضافة تحصيل موجود', !!$('#mainCollectForm'));
  ok('جدول تفاصيل التحصيل موجود', !!$('#mainCollectForm ~ .table-wrap, .collection-detail .table'));
  ok('مفتاح فتح الملف الكامل موجود', !!$('[data-open-profile]'));
  ok('السهم بان مقلوب (is-open)', !!$('#collectTbody .collection-row.is-open .chev'));
  ok('لا خطأ بعد فتح الأكورديون', errors.length === 0, errors.join(' | '));

  console.log('\n[4] إضافة تحصيل جديد');
  const form = $('#mainCollectForm');
  const idx = Number(form.getAttribute('data-idx'));
  const defaultsM = app.match(/var DEFAULT_CUSTOMERS = (\[[\s\S]*?\n  \]);/);
  const DEFAULTS = window.eval('(' + defaultsM[1] + ')');
  const storedList = () => {
    const raw = window.localStorage.getItem('app_customers');
    return raw ? JSON.parse(raw) : DEFAULTS;
  };
  const deriveRest = (c) => {
    const total = Number(c.total || 0), down = Number(c.down || 0);
    const due = c.due != null ? Number(c.due) : Math.max(total - down, 0);
    let p = 0; (c.payments || []).forEach((x) => (p += Number(x.amount || 0)));
    const paid = Number(c.later || 0) + p;
    return (total > 0 || down > 0) ? Math.max(due - paid, 0) : Number(c.balance || 0);
  };
  const before = storedList()[idx];
  const beforeRest = deriveRest(before);
  ok('هذا العميل عنده متبقي > 0', beforeRest > 0, 'rest=' + beforeRest);

  form.elements.amount.value = '1000';
  form.elements.amount.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('حقل "المبلغ الاجمالي المتبقي" مظبوط',
     form.elements.restBefore.value === beforeRest.toLocaleString('en-US'),
     'before=' + form.elements.restBefore.value);
  ok('حساب "المتبقي بعد الدفعة" اتحدث لحظياً',
     form.elements.restAfter.value === (beforeRest - 1000).toLocaleString('en-US'),
     'after=' + form.elements.restAfter.value + ' expected=' + (beforeRest - 1000).toLocaleString('en-US'));

  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(50);

  const after = storedList()[idx];
  ok('الدفعة اتحفظت في localStorage', (after.payments || []).length === ((before.payments || []).length + 1),
     'payments=' + (after.payments || []).length);
  ok('المتبقي قل بـ 1000', after.balance === beforeRest - 1000, 'balance=' + after.balance + ' expected=' + (beforeRest - 1000));
  ok('ظهر توست نجاح', $('#toast').classList.contains('show'));
  ok('صفوف التفاصيل اتحدثت', $$('.collection-detail tbody tr').length >= 1);
  ok('لا خطأ بعد إضافة التحصيل', errors.length === 0, errors.join(' | '));

  console.log('\n[5] رفض دفعة أكبر من المتبقي');
  const form2 = $('#mainCollectForm');
  form2.elements.amount.value = String(beforeRest + 99999);
  form2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  const after2 = storedList()[idx];
  ok('اترفضت ولم تنحفظ', (after2.payments || []).length === (after.payments || []).length);
  ok('رسالة خطأ ظهرت', !$('#mainCollectForm .form__error').hidden);

  console.log('\n[6] البحث');
  const search = $('#collectionSearch');
  search.value = 'شركة';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(20);
  const shown = $$('#collectTbody tr.collection-row').length;
  ok('البحث قلّل النتائج', shown > 0 && shown < 5, 'shown=' + shown);
  search.value = 'ززززز';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(20);
  ok('رسالة لا نتائج', $('#collectTbody').textContent.includes('لا توجد نتائج'));
  ok('اتقفل الأكورديون لما العميل اختفى من البحث', $$('#collectTbody .collection-detail').length === 0);
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(20);
  ok('رجعت كل الصفوف', $$('#collectTbody tr.collection-row').length === 5);

  console.log('\n[7] إغلاق الأكورديون بالضغط مرة ثانية');
  click($('#collectTbody tr.collection-row'));
  ok('انفتح', $$('#collectTbody .collection-detail').length === 1);
  click($('#collectTbody tr.collection-row'));
  ok('انقفل', $$('#collectTbody .collection-detail').length === 0);

  console.log('\n[8] زر "فتح الملف الكامل"');
  click($('#collectTbody tr.collection-row'));
  click($('[data-open-profile]'));
  ok('راح لملف العميل', $('#view-profile').classList.contains('is-active'));
  ok('ملف العميل اتبنى من غير خطأ', !!$('#profileTitle').textContent && errors.length === 0, errors.join(' | '));

  console.log('\n[9] إجماليات الملخص');
  const boxes = $$('#collectionSummary b').map((b) => b.textContent);
  ok('تلات مبالغ في الملخص', boxes.length === 3, JSON.stringify(boxes));

  console.log('\n[10] الدواخل والخوارج');
  click($('[data-go="ledger"]'));
  ok('شاشة الدواخل والخوارج فتحت', $('#view-ledger').classList.contains('is-active'));
  ok('لا خطأ عند فتحها', errors.length === 0, errors.join(' | '));

  const ledTotals = () => $$('#ledgerSummary b').map((b) => b.textContent);
  ok('إجمالي الدواخل محسوب من الحركات', ledTotals()[0] === '2,420,000', ledTotals()[0]);
  ok('إجمالي الخوارج محسوب من الحركات', ledTotals()[1] === '1,200,000', ledTotals()[1]);
  ok('الرصيد الصافي محسوب', ledTotals()[2] === '1,220,000', ledTotals()[2]);
  ok('خمس حركات في الجدول', $$('#ledgerTbody tr').length === 5, 'rows=' + $$('#ledgerTbody tr').length);
  ok('العدّاد محدَّث', $('#ledgerCount').textContent === '5 حركة', $('#ledgerCount').textContent);
  ok('الأحدث في الأعلى', $$('#ledgerTbody tr td.cell-desc')[0].textContent.indexOf('أحمد محمد') > -1,
     $$('#ledgerTbody tr td.cell-desc')[0] && $$('#ledgerTbody tr td.cell-desc')[0].textContent);
  ok('مش ثابت HTML — الأرقام الوهمية القديمة اتشالت', !$('#view-ledger').innerHTML.includes('8,450,000'));

  console.log('\n[11] إضافة حركة جديدة');
  const lf = $('#ledgerForm');
  lf.elements.date.value = '2026-10-25';
  lf.elements.type.value = 'out';
  lf.elements.amount.value = '50000';
  lf.elements.desc.value = 'مصروف نقل';
  lf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('الحركة اتضافت للجدول', $$('#ledgerTbody tr').length === 6, 'rows=' + $$('#ledgerTbody tr').length);
  ok('اتحفظت في localStorage', (JSON.parse(window.localStorage.getItem('app_ledger')) || []).length === 6);
  ok('العدّاد بقى 6', $('#ledgerCount').textContent === '6 حركة', $('#ledgerCount').textContent);
  ok('الخوارج بقت 1,250,000', ledTotals()[1] === '1,250,000', ledTotals()[1]);
  ok('الصافي اتراجع لـ 1,170,000', ledTotals()[2] === '1,170,000', ledTotals()[2]);
  ok('الحقول اتفرّغت والتاريخ رجع النهارده', lf.elements.amount.value === '' && lf.elements.date.value.length === 10);
  ok('النوع فضل على ما اختاره المستخدم', lf.elements.type.value === 'out', lf.elements.type.value);
  ok('توست نجاح ظهر', $('#toast').classList.contains('show'));

  console.log('\n[12] تحقق من الإدخال الناقص');
  $('#ledgerForm').elements.desc.value = '';
  $('#ledgerForm').elements.amount.value = '';
  $('#ledgerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(20);
  ok('اترفضت وظهرت رسالة الخطأ', !$('#ledgerError').hidden);
  ok('مفيش حركة اتضافت بالغلط', $$('#ledgerTbody tr').length === 6);

  console.log('\n[13] الفلترة والبحث والحذف');
  const tf = $('#ledgerTypeFilter');
  tf.value = 'out';
  tf.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('فلتر «خرج فقط» طلع 3 حركات', $$('#ledgerTbody tr').length === 3, 'rows=' + $$('#ledgerTbody tr').length);
  tf.value = '';
  tf.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('رجعت كل الحركات', $$('#ledgerTbody tr').length === 6);

  const ls = $('#ledgerSearch');
  ls.value = 'إيجار';
  ls.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('البحث لقى حركة إيجار المخزن', $$('#ledgerTbody tr').length === 1);
  ls.value = 'ززززز';
  ls.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رسالة لا نتائج', $('#ledgerTbody').textContent.includes('لا توجد حركات مطابقة'));
  ls.value = '';
  ls.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رجعت 6 بعد مسح البحث', $$('#ledgerTbody tr').length === 6);

  click($('#ledgerTbody [data-del-ledger]'));
  await wait(20);
  ok('الحذف شال حركة', $$('#ledgerTbody tr').length === 5, 'rows=' + $$('#ledgerTbody tr').length);
  ok('المجموعات اتحدّثت بعد الحذف', ledTotals()[1] === '1,200,000', ledTotals()[1]);
  ok('العدّاد رجع 5', $('#ledgerCount').textContent === '5 حركة', $('#ledgerCount').textContent);
  ok('اتحفظ في localStorage بعد الحذف', JSON.parse(window.localStorage.getItem('app_ledger')).length === 5);
  ok('لا أخطاء في كل قسم الدواخل والخوارج', errors.length === 0, errors.join(' | '));

  console.log('\n[14] الشركاء');
  click($('[data-go="partners"]'));
  ok('قسم الشركاء محمي بكلمة المرور', $('#pwdModal').classList.contains('is-open'));
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
  ok('شاشة الشركاء فتحت', $('#view-partners').classList.contains('is-active'));
  ok('لا خطأ بعد كلمة مرور الشركاء', errors.length === 0, errors.join(' | '));

  const pt = () => $$('#partnersSummary b').map((b) => b.textContent);
  ok('أربعة ملخصات', pt().length === 4, JSON.stringify(pt()));
  ok('إجمالي رأس المال 10,000,000', pt()[0] === '10,000,000', pt()[0]);
  ok('إجمالي النصيب = صافي الأرباح', pt()[1] === '4,640,000', pt()[1]);
  ok('إجمالي المسحوبات 1,160,000', pt()[2] === '1,160,000', pt()[2]);
  ok('إجمالي الصافي المستحق 3,480,000', pt()[3] === '3,480,000', pt()[3]);
  ok('تلات كروت شركاء', $$('#partnerCards .mini-card').length === 3, 'cards=' + $$('#partnerCards .mini-card').length);
  ok('تلات صفوف في الجدول', $$('#partnersTbody tr').length === 3);
  ok('الكروت اتبنت من JS مش من HTML ثابت', !html.includes('<small>شريك مؤسس</small>'));
  ok('مجموع الحصص 100% بعلامة خضراء',
     $('#sharePill').textContent === 'مجموع الحصص 100%' && $('#sharePill').classList.contains('count-pill--ok'),
     $('#sharePill').textContent);
  ok('العدّاد 3 شركاء', $('#partnersCount').textContent === '3 شريك', $('#partnersCount').textContent);

  const cuts = $$('#partnersTbody tr').map((tr) => tr.querySelectorAll('td.amount.pos')[0].textContent);
  ok('نصيب محمد علي = 40% من 4,640,000', cuts[0] === '1,856,000', cuts[0]);
  ok('نصيب عبدالله حسن = 35%', cuts[1] === '1,624,000', cuts[1]);
  ok('نصيب سالم كريم = 25%', cuts[2] === '1,160,000', cuts[2]);

  console.log('\n[15] إضافة شريك + تحقق من الحصة');
  const pf = $('#partnerForm');
  pf.elements.name.value = 'خالد جاسم';
  pf.elements.role.value = 'مستثمر';
  pf.elements.share.value = '10';
  pf.elements.capital.value = '1000000';
  pf.elements.withdrawals.value = '50000';
  pf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('الشريك الرابع اتضاف', $$('#partnersTbody tr').length === 4, 'rows=' + $$('#partnersTbody tr').length);
  ok('اتحفظ في localStorage', (JSON.parse(window.localStorage.getItem('app_partners')) || []).length === 4);
  ok('العدّاد بقى 4 شركاء', $('#partnersCount').textContent === '4 شريك', $('#partnersCount').textContent);
  ok('مجموع الحصص بقى 110% بعلامة صفراء',
     $('#sharePill').textContent.indexOf('110%') > -1 && $('#sharePill').classList.contains('count-pill--warn'),
     $('#sharePill').textContent);
  ok('رأس المال بقى 11,000,000', pt()[0] === '11,000,000', pt()[0]);
  ok('المسحوبات بقت 1,210,000', pt()[2] === '1,210,000', pt()[2]);
  ok('إجمالي النصيب بقى 5,104,000', pt()[1] === '5,104,000', pt()[1]);
  ok('إجمالي الصافي بقى 3,894,000', pt()[3] === '3,894,000', pt()[3]);
  ok('الحقول اتفرّغت', pf.elements.name.value === '');

  pf.elements.name.value = 'شريك زائد';
  pf.elements.share.value = '150';
  pf.elements.capital.value = '100';
  pf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(20);
  ok('حصة أكبر من 100% اترفضت', !$('#partnerError').hidden && $$('#partnersTbody tr').length === 4,
     $('#partnerError').textContent);
  ok('الرسالة توضح الحد', $('#partnerError').textContent.indexOf('100%') > -1, $('#partnerError').textContent);

  console.log('\n[16] تعديل شريك');
  click($('#partnersTbody [data-edit-partner="0"]'));
  ok('النموذج اتملا ببيانات محمد علي', pf.elements.name.value === 'محمد علي', pf.elements.name.value);
  ok('الصفة اتملت', pf.elements.role.value === 'شريك مؤسس', pf.elements.role.value);
  ok('الحصة اتملت', pf.elements.share.value == 40, pf.elements.share.value);
  ok('الزر بقى «حفظ التعديل»', $('#partnerSubmitBtn').textContent.indexOf('حفظ التعديل') > -1);
  ok('زر «إلغاء التعديل» ظهر', $('#partnerCancelBtn').hidden === false);
  pf.elements.withdrawals.value = '700000';
  pf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('التعديل اتحفظ من غير زيادة صف', $$('#partnersTbody tr').length === 4, 'rows=' + $$('#partnersTbody tr').length);
  const m0 = $$('#partnersTbody tr')[0].querySelectorAll('td.amount');
  ok('المسحوبات بقت 700,000', m0[1].textContent === '700,000', m0[1].textContent);
  ok('الصافي بقى 1,156,000', m0[2].textContent === '1,156,000', m0[2].textContent);
  ok('الزر رجع «إضافة شريك»', $('#partnerSubmitBtn').textContent.indexOf('إضافة شريك') > -1);
  ok('زر الإلغاء اتخفى', $('#partnerCancelBtn').hidden === true);
  ok('التعديل اتسجل في localStorage', JSON.parse(window.localStorage.getItem('app_partners'))[0].withdrawals === 700000);

  console.log('\n[17] إلغاء التعديل + تغيير أرباح السنة');
  click($('#partnersTbody [data-edit-partner="1"]'));
  click($('#partnerCancelBtn'));
  ok('النموذج اترجع فاضي', pf.elements.name.value === '');
  ok('الزر رجع «إضافة شريك» بعد الإلغاء', $('#partnerSubmitBtn').textContent.indexOf('إضافة شريك') > -1);

  const prof = $('#profitForm');
  prof.elements.profit.value = '5000000';
  prof.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('اتحفظ صافي الأرباح في localStorage', window.localStorage.getItem('app_partner_profit') === '5000000');
  const cuts2 = $$('#partnersTbody tr').map((tr) => tr.querySelectorAll('td.amount.pos')[0].textContent);
  ok('نصيب محمد علي اتحدّث لـ 2,000,000', cuts2[0] === '2,000,000', cuts2[0]);
  ok('نصيب خالد جاسم (10%) = 500,000', cuts2[3] === '500,000', cuts2[3]);
  ok('إجمالي النصيب بقى 5,500,000', pt()[1] === '5,500,000', pt()[1]);

  prof.elements.profit.value = 'abc';
  prof.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(20);
  ok('أرباح غير رقمية اترفضت', !$('#profitError').hidden);
  ok('الأرباح القديمة محفوظة بعد الرفض', window.localStorage.getItem('app_partner_profit') === '5000000');

  console.log('\n[18] حذف شريك + بحث');
  click($('#partnersTbody [data-del-partner="3"]'));
  await wait(20);
  ok('الشريك الرابع اتحذف', $$('#partnersTbody tr').length === 3, 'rows=' + $$('#partnersTbody tr').length);
  ok('localStorage اتحدّث بعد الحذف', JSON.parse(window.localStorage.getItem('app_partners')).length === 3);
  ok('مجموع الحصص رجع 100% أخضر', $('#sharePill').classList.contains('count-pill--ok'), $('#sharePill').textContent);
  ok('إجمالي رأس المال رجع 10,000,000', pt()[0] === '10,000,000', pt()[0]);

  const psearch = $('#partnerSearch');
  psearch.value = 'عبدالله';
  psearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('البحث لقى شريك واحد', $$('#partnersTbody tr').length === 1);
  psearch.value = 'زززز';
  psearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رسالة لا يوجد شريك مطابق', $('#partnersTbody').textContent.indexOf('لا يوجد شريك مطابق') > -1);
  psearch.value = '';
  psearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رجعت 3 بعد مسح البحث', $$('#partnersTbody tr').length === 3);
  ok('لا أخطاء في قسم الشركاء كله', errors.length === 0, errors.join(' | '));

  console.log('\n[19] الجمعيات');
  click($('[data-go="associations"]'));
  ok('قسم الجمعيات محمي بكلمة المرور', $('#pwdModal').classList.contains('is-open'));
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
  ok('شاشة الجمعيات فتحت', $('#view-associations').classList.contains('is-active'));
  ok('لا خطأ بعد كلمة مرور الجمعيات', errors.length === 0, errors.join(' | '));

  const at = () => $$('#assocSummary b').map((b) => b.textContent);
  ok('أربعة ملخصات', at().length === 4, JSON.stringify(at()));
  ok('إجمالي الأعضاء 4', at()[0] === '4', at()[0]);
  ok('إجمالي المستحق 44,000', at()[1] === '44,000', at()[1]);
  ok('إجمالي المحصّل 28,000', at()[2] === '28,000', at()[2]);
  ok('المتبقي للتحصيل 16,000', at()[3] === '16,000', at()[3]);
  ok('تلات كروت جمعيات', $$('#assocCards .mini-card').length === 3, 'cards=' + $$('#assocCards .mini-card').length);
  ok('الكروت اتبنت من JS مش من HTML ثابت', !html.includes('<small>120 عضو</small>'));
  ok('أربعة صفوف أعضاء', $$('#membersTbody tr').length === 4);
  ok('قرص 3 جمعيات', $('#assocsCount').textContent === '3 جمعية', $('#assocsCount').textContent);
  ok('قرص 4 عضو', $('#membersCount').textContent === '4 عضو', $('#membersCount').textContent);
  ok('كارت جمعية الإعمار فيه 2 عضو', $$('#assocCards .mini-card small')[0].textContent === '2 عضو',
     $$('#assocCards .mini-card small')[0].textContent);

  const statuses = $$('#membersTbody tr').map((tr) => tr.querySelector('.tag').textContent);
  ok('الحالات اتحسبت تلقائياً من المدفوع',
     statuses.join('|') === 'مسدّد|معلّق|مسدّد|متأخر', statuses.join('|'));

  console.log('\n[20] فلترة الجمعيات + إضافة جمعية');
  const af = $('#assocFilter');
  af.value = 'جمعية الإعمار';
  af.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('فلتر الجمعية طلع 2 عضو', $$('#membersTbody tr').length === 2, 'rows=' + $$('#membersTbody tr').length);
  ok('العدّاد اتبع الفلتر', $('#membersCount').textContent === '2 عضو', $('#membersCount').textContent);
  af.value = '';
  af.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('رجعت 4 بعد رفع الفلتر', $$('#membersTbody tr').length === 4);

  const asf = $('#assocForm');
  asf.elements.name.value = 'جمعية النور';
  asf.elements.fee.value = '8000';
  asf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('الجمعية الرابعة اتضافت', $$('#assocCards .mini-card').length === 4, 'cards=' + $$('#assocCards .mini-card').length);
  ok('اتحفظت في localStorage', (JSON.parse(window.localStorage.getItem('app_associations')) || []).length === 4);
  ok('قرص الجمعيات بقى 4', $('#assocsCount').textContent === '4 جمعية', $('#assocsCount').textContent);

  asf.elements.name.value = 'جمعية البر';
  asf.elements.fee.value = '5000';
  asf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(20);
  ok('اسم مكرر اترفض', !$('#assocError').hidden && $$('#assocCards .mini-card').length === 4,
     $('#assocError').textContent);
  ok('الرسالة توضح السبب', $('#assocError').textContent.indexOf('نفس الاسم') > -1, $('#assocError').textContent);

  console.log('\n[21] إضافة عضو + تتبع قيمة الاشتراك');
  const mf = $('#memberForm');
  mf.elements.assoc.value = 'جمعية النور';
  mf.elements.assoc.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('قيمة الاشتراك اتبعتت لـ 8000', mf.elements.fee.value == 8000, mf.elements.fee.value);
  mf.elements.name.value = 'سعد فاضل';
  mf.elements.paid.value = '4000';
  mf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('العضو الخامس اتضاف', $$('#membersTbody tr').length === 5, 'rows=' + $$('#membersTbody tr').length);
  ok('اتحفظ في localStorage', (JSON.parse(window.localStorage.getItem('app_members')) || []).length === 5);
  ok('الحالة بتاعته معلّق (دفع نص)', $$('#membersTbody tr')[4].querySelector('.tag').textContent === 'معلّق',
     $$('#membersTbody tr')[4].querySelector('.tag').textContent);
  ok('إجمالي الأعضاء بقى 5', at()[0] === '5', at()[0]);
  ok('إجمالي المستحق بقى 52,000', at()[1] === '52,000', at()[1]);
  ok('إجمالي المحصّل بقى 32,000', at()[2] === '32,000', at()[2]);

  mf.elements.name.value = 'عضو بدون اشتراك';
  mf.elements.fee.value = '0';
  mf.elements.paid.value = '';
  mf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(20);
  ok('اشتراك صفر اترفض', !$('#memberError').hidden && $$('#membersTbody tr').length === 5,
     $('#memberError').textContent);

  console.log('\n[22] تعديل عضو + إعادة حساب الحالة');
  click($$('#membersTbody [data-edit-member]')[4]);
  ok('النموذج اتملا باسم سعد فاضل', mf.elements.name.value === 'سعد فاضل', mf.elements.name.value);
  ok('الحقل المدفوع اتملى', mf.elements.paid.value == 4000, mf.elements.paid.value);
  ok('الزر بقى «حفظ التعديل»', $('#memberSubmitBtn').textContent.indexOf('حفظ التعديل') > -1);
  ok('زر الإلغاء ظهر', $('#memberCancelBtn').hidden === false);
  mf.elements.paid.value = '8000';
  mf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('التعديل من غير زيادة صف', $$('#membersTbody tr').length === 5, 'rows=' + $$('#membersTbody tr').length);
  ok('الحالة بقت مسدّد بعد الدفع الكامل', $$('#membersTbody tr')[4].querySelector('.tag').textContent === 'مسدّد',
     $$('#membersTbody tr')[4].querySelector('.tag').textContent);
  ok('المتبقي بتاعه صفر', $$('#membersTbody tr')[4].querySelectorAll('td.amount')[2].textContent === '0',
     $$('#membersTbody tr')[4].querySelectorAll('td.amount')[2].textContent);
  ok('الزر رجع «إضافة عضو»', $('#memberSubmitBtn').textContent.indexOf('إضافة عضو') > -1);
  ok('التعديل اتسجل في localStorage', JSON.parse(window.localStorage.getItem('app_members'))[4].paid === 8000);

  click($$('#membersTbody [data-edit-member]')[0]);
  click($('#memberCancelBtn'));
  ok('الإلغاء رجّع النموذج فاضي', mf.elements.name.value === '');
  ok('الزر رجع بعد الإلغاء', $('#memberSubmitBtn').textContent.indexOf('إضافة عضو') > -1);

  console.log('\n[23] تعديل اسم جمعية يحدّث أعضاءها + منع حذف جمعية فيها أعضاء');
  click($$('#assocCards [data-edit-assoc]')[0]);
  ok('نموذج الجمعية اتملا', asf.elements.name.value === 'جمعية الإعمار', asf.elements.name.value);
  asf.elements.name.value = 'جمعية الإعمار الجديدة';
  asf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('اسم الكارت اتحدّث', $$('#assocCards .mini-card b')[0].textContent === 'جمعية الإعمار الجديدة',
     $$('#assocCards .mini-card b')[0].textContent);
  ok('أعضاء الجمعية اتحدّثوا تلقائياً', $('#membersTbody').textContent.indexOf('جمعية الإعمار الجديدة') > -1);
  ok('الفلتر فيه الاسم الجديد', $('#assocFilter').innerHTML.indexOf('جمعية الإعمار الجديدة') > -1);
  ok('عدد الجمعيات ما تغيّرش', $('#assocsCount').textContent === '4 جمعية', $('#assocsCount').textContent);

  click($$('#assocCards [data-del-assoc]')[0]);
  await wait(20);
  ok('حذف جمعية فيها أعضاء اترفض', $$('#assocCards .mini-card').length === 4, 'cards=' + $$('#assocCards .mini-card').length);
  ok('رسالة الخطأ اتعرضت', $('#toast').textContent.indexOf('لا يمكن حذف') > -1, $('#toast').textContent);
  ok('الجمعية لسه محفوظة', (JSON.parse(window.localStorage.getItem('app_associations')) || []).length === 4);

  console.log('\n[24] حذف أعضاء ثم حذف الجمعية + بحث');
  click($$('#membersTbody [data-del-member]')[0]);
  await wait(20);
  click($$('#membersTbody [data-del-member]')[0]);
  await wait(20);
  ok('اتحذف عضوين', $$('#membersTbody tr').length === 3, 'rows=' + $$('#membersTbody tr').length);
  ok('localStorage اتحدّث', JSON.parse(window.localStorage.getItem('app_members')).length === 3);
  ok('إجمالي الأعضاء بقى 3', at()[0] === '3', at()[0]);
  ok('إجمالي المستحق 28,000', at()[1] === '28,000', at()[1]);
  ok('إجمالي المحصّل 18,000', at()[2] === '18,000', at()[2]);
  ok('المتبقي 10,000', at()[3] === '10,000', at()[3]);

  click($$('#assocCards [data-del-assoc]')[0]);
  await wait(20);
  ok('حذف الجمعية نجح بعد خلوّها', $$('#assocCards .mini-card').length === 3, 'cards=' + $$('#assocCards .mini-card').length);
  ok('قرص الجمعيات بقى 3', $('#assocsCount').textContent === '3 جمعية', $('#assocsCount').textContent);

  const ms = $('#memberSearch');
  ms.value = 'عمر';
  ms.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('البحث لقى عضو واحد', $$('#membersTbody tr').length === 1);
  ms.value = 'زززز';
  ms.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رسالة لا يوجد عضو مطابق', $('#membersTbody').textContent.indexOf('لا يوجد عضو مطابق') > -1);
  ms.value = '';
  ms.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('رجعت 3 بعد مسح البحث', $$('#membersTbody tr').length === 3);
  ok('لا أخطاء في قسم الجمعيات كله', errors.length === 0, errors.join(' | '));

  console.log('\n[25] التصدير — Excel لكل خاصية');
  click($('[data-go="settings"]'));
  ok('شاشة الإعدادات فتحت', $('#view-settings').classList.contains('is-active'));
  ok('محرك ExportKit محمّل', typeof window.ExportKit === 'object' && typeof window.ExportKit.buildXlsx === 'function');
  ok('شبكة التصدير فيها 6 خانات', $$('#exportGrid .export-item').length === 6,
     'n=' + $$('#exportGrid .export-item').length);
  ok('كل خانة فيها Excel و PDF',
     $$('#exportGrid [data-kind="xlsx"]').length === 6 && $$('#exportGrid [data-kind="pdf"]').length === 6);
  ok('زرار «التطبيق كاملاً Excel» موجود', !!$('#exportAllXlsx'));
  ok('زرار «ملخّص PDF» موجود', !!$('#exportAllPdf'));
  ok('عنوان إعادة التوجيه مكتوب في التعليمات',
     $('#driveRedirect').textContent.indexOf('/api/google/callback') > -1, $('#driveRedirect').textContent);

  capturedBlob = null;
  click($('[data-export="customers"][data-kind="xlsx"]'));
  await wait(30);
  ok('نافذة اختيار الوجهة انفتحت', $('#exportModal').classList.contains('is-open'));
  ok('اسم الملف ظاهر في النافذة', $('#exportFileName').textContent.indexOf('nizam-customers') > -1,
     $('#exportFileName').textContent);
  ok('زر التحميل على الجهاز موجود', !!$('#exportToDevice'));
  ok('زر الرفع موجود', !!$('#exportToDrive'));
  ok('زر الرفع معطّل بدون ربط', $('#exportToDrive').disabled === true);
  ok('ملاحظة توضح شرط الرفع', $('#exportDriveHint').textContent.indexOf('اربط حساب') > -1,
     $('#exportDriveHint').textContent);
  click($('#exportToDevice'));
  await wait(30);
  ok('النافذة اتقفلت بعد الاختيار', !$('#exportModal').classList.contains('is-open'));
  ok('التوست بيقول تم التجهيز', $('#toast').textContent.indexOf('تم تجهيز') > -1, $('#toast').textContent);
  ok('اتمسك ملف Blob', !!capturedBlob);
  const xlsxBuf = capBytes();
  ok('الملف يبدأ بتوقيع ZIP', xlsxBuf[0] === 0x50 && xlsxBuf[1] === 0x4B,
     'first=' + xlsxBuf.slice(0, 2).toString('hex'));
  ok('حجم الملف معقول', xlsxBuf.length > 800, 'len=' + xlsxBuf.length);
  ok('نوع MIME لملف xlsx', capturedBlob.type.indexOf('sheetml') > -1, capturedBlob.type);
  fs.writeFileSync('/tmp/ui-export.xlsx', xlsxBuf);

  capturedBlob = null;
  click($('#exportAllXlsx'));
  await wait(40);
  click($('#exportToDevice'));
  await wait(40);
  const allBuf = capBytes();
  ok('ملف التطبيق كاملاً أكبر من ملف القسم', allBuf.length > xlsxBuf.length,
     'all=' + allBuf.length + ' vs ' + xlsxBuf.length);
  fs.writeFileSync('/tmp/ui-export-all.xlsx', allBuf);

  capturedBlob = null;
  click($('[data-export="ledger"][data-kind="xlsx"]'));
  await wait(30);
  click($('#exportToDevice'));
  await wait(30);
  fs.writeFileSync('/tmp/ui-export-ledger.xlsx', capBytes());
  ok('تصدير قسم الدواخل والخوارج نجح', $('#toast').textContent.indexOf('تم تجهيز') > -1, $('#toast').textContent);

  capturedBlob = null;
  click($('[data-export="customers"][data-kind="pdf"]'));
  await wait(80);
  if ($('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
  await wait(80);
  if (capturedBlob) {
    ok('تصدير PDF اشتغل مباشرة', $('#toast').textContent.indexOf('تم تجهيز') > -1, $('#toast').textContent);
    capturedBlob = null;
  } else {
    ok('PDF بيقول إنه يحتاج متصفحاً حقيقياً', $('#toast').textContent.indexOf('متصفحاً') > -1, $('#toast').textContent);
  }
  ok('لا أخطاء أثناء التصدير', errors.length === 0, errors.join(' | '));

  console.log('\n[25ب] تصدير PDF حقيقي (canvas)');
  const canPdf = typeof window.ExportKit === 'object' && window.ExportKit.hasCanvas();
  if (canPdf) {
    capturedBlob = null;
    click($('[data-export="customers"][data-kind="pdf"]'));
    await wait(150);
    if ($('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
    await wait(150);
    ok('اتمسك ملف PDF من التصدير', !!capturedBlob);
    const pdfBuf = capBytes();
    ok('الملف يبدأ بـ %PDF', pdfBuf.slice(0, 5).toString() === '%PDF-', pdfBuf.slice(0, 8).toString());
    ok('نوع MIME هو pdf', capturedBlob.type === 'application/pdf', capturedBlob.type);
    ok('حجم PDF معقول', pdfBuf.length > 5000, 'len=' + pdfBuf.length);
    ok('التوست بيقول تم التجهيز', $('#toast').textContent.indexOf('تم تجهيز') > -1, $('#toast').textContent);
    fs.writeFileSync('/tmp/ui-export.pdf', pdfBuf);

    capturedBlob = null;
    click($('#exportAllPdf'));
    await wait(150);
    if ($('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
    await wait(150);
    fs.writeFileSync('/tmp/ui-export-summary.pdf', capBytes());
    ok('ملف ملخّص التطبيق PDF اتبنى', capBytes().slice(0, 5).toString() === '%PDF-', 'n=' + capBytes().length);

    /* PDF متعدد الصفحات مباشرة من المحرّك */
    const probe = window.document.createElement('canvas');
    probe.width = 300; probe.height = 200;
    const pctx = probe.getContext('2d');
    pctx.fillStyle = '#4f46e5'; pctx.fillRect(0, 0, 300, 200);
    const jpg = new Uint8Array(Buffer.from(probe.toDataURL('image/jpeg', 0.8).split(',')[1], 'base64'));
    const multi = window.ExportKit.buildPdf([
      { jpeg: jpg, width: 300, height: 200 },
      { jpeg: jpg, width: 300, height: 200 },
      { jpeg: jpg, width: 300, height: 200 }
    ]);
    fs.writeFileSync('/tmp/ui-multi.pdf', Buffer.from(multi));
    ok('PDF متعدد الصفحات اتبنى', !!multi && multi.length > 0, 'len=' + (multi && multi.length));
    ok('مفيش أخطاء في توليد PDF', errors.length === 0, errors.join(' | '));
  } else {
    ok('canvas غير متاح — تخطّينا تجربة PDF', true);
  }

  console.log('\n[26] لوحة ربط Google Drive');
  const jsonResponse = (obj) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  const goSettings = async () => {
    click($('[data-go="home"]'));
    click($('[data-go="settings"]'));
    await wait(40);
  };

  window.fetch = () => jsonResponse({ configured: true, connected: false });
  await goSettings();
  ok('المفاتيح مضبوطة ولم يتم الربط → زر الربط ظاهر', $('#driveConnect').hidden === false);
  ok('الزر مفعّل وشغّال في هذه الحالة', $('#driveConnect').disabled === false,
     'disabled=' + $('#driveConnect').disabled);
  ok('زرار فصل الربط مخفي', $('#driveDisconnect').hidden === true);
  ok('زرار رفع الملف مخفي', $('#driveUploadLabel').hidden === true);
  ok('تعليمات التفعيل مخفية لأن المفاتيح مضبوطة', $('#driveSetup').hidden === true, 'hidden=' + $('#driveSetup').hidden);
  ok('نص الحالة مناسب', $('#driveStatusText').textContent.indexOf('لم يتم ربط') > -1, $('#driveStatusText').textContent);

  window.fetch = () => jsonResponse({ configured: true, connected: true, email: 'owner@example.com' });
  await goSettings();
  ok('الحالة اتحولت لـ متصل', $('#driveStatus').classList.contains('is-ok'), $('#driveStatus').className);
  ok('الإيميل ظاهر في الحالة', $('#driveStatusText').textContent.indexOf('owner@example.com') > -1,
     $('#driveStatusText').textContent);
  ok('زرار فصل الربط ظهر', $('#driveDisconnect').hidden === false);
  ok('زرار الربط ظهر ومعطّل وهو متصل', $('#driveConnect').hidden === false && $('#driveConnect').disabled === true,
     'hidden=' + $('#driveConnect').hidden + ' disabled=' + $('#driveConnect').disabled);
  ok('زرار رفع الملف ظهر', $('#driveUploadLabel').hidden === false);
  ok('ملاحظة الرفع التلقائي ظهرت', $('#driveNote').hidden === false);
  ok('حقل بريد التنبيه ظهر وهو متصل', $('#driveNotifyField').hidden === false);
  ok('البريد المحفوظ اترجّع', $('#driveNotifyTo').value === '', JSON.stringify($('#driveNotifyTo').value));

  let lastCall = null;
  window.fetch = (url, init) => { lastCall = { url: url, init: init }; return jsonResponse({ ok: true }); };
  click($('#driveDisconnect'));
  await wait(40);
  ok('فصل الربط بينادي المسار الصحيح', !!lastCall && String(lastCall.url).indexOf('/api/google/disconnect') > -1,
     lastCall && String(lastCall.url));
  ok('فصل الربط POST', !!lastCall && lastCall.init && lastCall.init.method === 'POST');

  window.fetch = () => jsonResponse({ configured: false, connected: false });
  await goSettings();
  ok('بدون مفاتيح → تنبيه تحذيري', $('#driveStatus').classList.contains('is-warn'), $('#driveStatus').className);
  ok('تعليمات التفعيل ظهرت', $('#driveSetup').hidden === false);
  ok('زرار الربط ظاهر حتى بدون مفاتيح (ما ينخفيش)', $('#driveConnect').hidden === false,
     'hidden=' + $('#driveConnect').hidden);
  ok('الزر معطّل بدون مفاتيح', $('#driveConnect').disabled === true, 'disabled=' + $('#driveConnect').disabled);
  ok('ملاحظة تشرح ناقص إيه وين', $('#driveNote').hidden === false &&
     $('#driveNote').textContent.indexOf('Sites') > -1 && $('#driveNote').textContent.indexOf('Secrets') > -1,
     $('#driveNote').textContent);
  ok('نص الحالة يذكر اسمَي المفتاحين', $('#driveStatusText').textContent.indexOf('GOOGLE_CLIENT_ID') > -1 &&
     $('#driveStatusText').textContent.indexOf('GOOGLE_CLIENT_SECRET') > -1, $('#driveStatusText').textContent);
  ok('عنوان الزر يوضح المطلوب', ($('#driveConnect').title || '').indexOf('Secrets') > -1,
     $('#driveConnect').title);
  delete window.fetch;
  ok('لا أخطاء في لوحة الربط', errors.length === 0, errors.join(' | '));

  console.log('\n[27] مسارات الـ Worker (Google Drive)');
  const osPath = require('path');
  const tmpWorker = osPath.join(process.cwd(), '.worker-under-test.mjs');
  fs.copyFileSync('worker.js', tmpWorker);
  let worker = null;
  try {
    const mod = await import('file://' + tmpWorker);
    worker = mod.default;
  } finally {
    try { fs.unlinkSync(tmpWorker); } catch (e) {}
  }
  ok('الـ Worker اتحمّل كوحدة ESM', !!worker && typeof worker.fetch === 'function');

  const ASSETS = { fetch: async (r) => new Response('ASSET_OK:' + new URL(r.url).pathname) };
  const mkEnv = (extra) => Object.assign({ ASSETS: ASSETS }, extra || {});
  const SEC = { GOOGLE_CLIENT_ID: 'cid-test', GOOGLE_CLIENT_SECRET: 'csec-test' };

  let r = await worker.fetch(new Request('https://site.test/index.html'), mkEnv());
  let txt = await r.text();
  ok('الملفات الثابتة بتتقدّم من ASSETS', txt.indexOf('ASSET_OK:/index.html') === 0, txt);

  r = await worker.fetch(new Request('https://site.test/api/google/status'), mkEnv());
  let j = await r.json();
  ok('status بدون مفاتيح → configured=false', j.configured === false && j.connected === false, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/google/status'), mkEnv(SEC));
  j = await r.json();
  ok('status بالمفاتيح بدون كوكي → connected=false', j.configured === true && j.connected === false, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/google/login'), mkEnv(SEC));
  const loc = r.headers.get('location') || '';
  ok('login بيرجّع 302', r.status === 302, 'status=' + r.status);
  ok('login رايح لـ Google OAuth', loc.indexOf('https://accounts.google.com/o/oauth2/v2/auth') === 0, loc.slice(0, 70));
  ok('login فيه client_id', loc.indexOf('client_id=cid-test') > -1);
  ok('login فيه redirect_uri متوقّع',
     loc.indexOf(encodeURIComponent('https://site.test/api/google/callback')) > -1, loc);
  ok('login فيه drive scope', loc.indexOf('auth%2Fdrive') > -1 || loc.indexOf('auth/drive') > -1);
  ok('login فيه gmail.send scope عشان تنبيهات البريد', loc.indexOf('gmail.send') > -1, loc.slice(0, 400));
  ok('login فيه access_type=offline', loc.indexOf('access_type=offline') > -1);
  ok('login فيه prompt=consent', loc.indexOf('prompt=consent') > -1);
  ok('login بيحط كوكي الحالة', (r.headers.get('set-cookie') || '').indexOf('gstate=') > -1,
     r.headers.get('set-cookie') || '');

  r = await worker.fetch(new Request('https://site.test/api/google/login'), mkEnv());
  ok('login بدون مفاتيح → 503', r.status === 503, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/google/callback?code=abc&state=xyz'), mkEnv(SEC));
  ok('callback بدون كوكي الحالة → رجوع بخطأ',
     r.status === 302 && (r.headers.get('location') || '').indexOf('/?g=err') > -1,
     r.headers.get('location'));

  r = await worker.fetch(new Request('https://site.test/api/google/callback?error=access_denied'), mkEnv(SEC));
  ok('callback برفض المستخدم → رجوع بالسبب',
     (r.headers.get('location') || '').indexOf('access_denied') > -1, r.headers.get('location'));

  r = await worker.fetch(new Request('https://site.test/api/google/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.xlsx', mime: 'application/octet-stream', b64: 'QUJD' })
  }), mkEnv(SEC));
  j = await r.json();
  ok('upload بدون ربط → 401', r.status === 401, 'status=' + r.status);
  ok('رسالة الرفع عربية وواضحة', String(j.error).indexOf('لم يتم ربط') > -1, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/google/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'gconn=tok-1' },
    body: JSON.stringify({ name: 'a.xlsx', b64: 'QUJD' })
  }), mkEnv(SEC));
  j = await r.json();
  ok('upload بكوكي بدون قاعدة بيانات → 503', r.status === 503, 'status=' + r.status);
  ok('الرسالة توضح أن القاعدة غير جاهزة', String(j.error).indexOf('قاعدة البيانات') > -1, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/google/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json'
  }), mkEnv(SEC));
  ok('body تالف → 400', r.status === 400, 'status=' + r.status);

  /* ---- مسار التنبيه بالبريد ---- */
  r = await worker.fetch(new Request('https://site.test/api/google/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.xlsx', mime: 'application/octet-stream', b64: 'QUJD' })
  }), mkEnv(SEC));
  j = await r.json();
  ok('notify بدون ربط → 401', r.status === 401, 'status=' + r.status);
  ok('رسالة التنبيه عربية وواضحة', String(j.error).indexOf('لم يتم ربط') > -1, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/google/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'gconn=tok-1' },
    body: JSON.stringify({ name: 'a.xlsx', b64: 'QUJD' })
  }), mkEnv(SEC));
  j = await r.json();
  ok('notify بكوكي بدون قاعدة بيانات → 503', r.status === 503, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/google/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ b64: 'QUJD' })
  }), mkEnv(SEC));
  ok('notify بدون اسم ملف → 400', r.status === 400, 'status=' + r.status);

  /* مرّر DB فارغ: الربط يوصل لـ «غير صالح» فيتأكد إن المسار بيقرأ الـ DB */
  const emptyDb = {
    exec: async () => {},
    prepare: () => ({ bind: () => ({ first: async () => null }) })
  };
  r = await worker.fetch(new Request('https://site.test/api/google/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'gconn=tok-1' },
    body: JSON.stringify({ name: 'a.xlsx', b64: 'QUJD' })
  }), mkEnv(Object.assign({ DB: emptyDb }, SEC)));
  j = await r.json();
  ok('notify بكوكي غير مسجّل → 401 «الربط غير صالح»', r.status === 401 &&
     String(j.error).indexOf('الربط غير صالح') > -1, 'status=' + r.status + ' ' + JSON.stringify(j));

  /* ---- مسارات المزامنة ---- */
  r = await worker.fetch(new Request('https://site.test/api/sync/pull'), mkEnv(SEC));
  j = await r.json();
  ok('sync/pull بدون ربط → 401', r.status === 401, 'status=' + r.status);
  ok('رسالة المزامنة عربية', String(j.error).indexOf('لم يتم ربط') > -1, JSON.stringify(j));

  r = await worker.fetch(new Request('https://site.test/api/sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: { sections: { app_customers: '[]' } } })
  }), mkEnv(SEC));
  ok('sync/push بدون ربط → 401', r.status === 401, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foo: 1 })
  }), mkEnv(SEC));
  ok('sync/push بدون نسخة → 400', r.status === 400, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'gconn=tok-1' },
    body: JSON.stringify({ snapshot: { sections: { app_customers: '[]' } } })
  }), mkEnv(SEC));
  j = await r.json();
  ok('sync/push بكوكي بدون قاعدة بيانات → 503', r.status === 503, 'status=' + r.status);
  ok('الرسالة توضح أن القاعدة غير جاهزة', String(j.error).indexOf('قاعدة البيانات') > -1, JSON.stringify(j));

  /* ---- لائحة النسخ وقراءة نسخة ---- */
  r = await worker.fetch(new Request('https://site.test/api/sync/versions'), mkEnv(SEC));
  j = await r.json();
  ok('sync/versions بدون ربط → 401', r.status === 401, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/sync/version?id=abc123'), mkEnv(SEC));
  j = await r.json();
  ok('sync/version بدون ربط → 401', r.status === 401, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/sync/version', {
    method: 'GET', headers: { Cookie: 'gconn=tok-1' }
  }), mkEnv(Object.assign({ DB: emptyDb }, SEC)));
  j = await r.json();
  ok('sync/version بدون id → 400', r.status === 400, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/sync/version?id=%3Cscript%3E', {
    method: 'GET', headers: { Cookie: 'gconn=tok-1' }
  }), mkEnv(Object.assign({ DB: emptyDb }, SEC)));
  j = await r.json();
  ok('sync/version بمعرّف غير صالح → 400', r.status === 400, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/google/whatever'), mkEnv(SEC));
  ok('مسار google غير معروف → 404', r.status === 404, 'status=' + r.status);

  r = await worker.fetch(new Request('https://site.test/api/other'), mkEnv(SEC));
  ok('أي مسار api آخر → 404', r.status === 404, 'status=' + r.status);

  ok('لا أخطاء في مسارات الـ Worker', errors.length === 0, errors.join(' | '));

  console.log('\n[28] المزامنة السحابية — منطق التطبيق');
  click($('[data-go="home"]'));
  click($('[data-go="settings"]'));
  await wait(30);
  ok('لوحة المزامنة موجودة', !!$('#syncPush') && !!$('#syncCheck') && !!$('#syncPolicy'));
  ok('الوضع الافتراضي «اسألني»', $('#syncPolicy').value === 'ask', $('#syncPolicy').value);
  $('#syncPolicy').value = 'auto';
  $('#syncPolicy').dispatchEvent(new window.Event('change'));
  ok('الوضع اتغيّر واتحفظ', window.localStorage.getItem('app_sync_policy') === 'auto',
     window.localStorage.getItem('app_sync_policy'));

  /* لقطة البيانات وحساب الفروقات */
  const custN = (JSON.parse(window.localStorage.getItem('app_customers')) || []).length;
  ok('عدد العملاء منطقي', custN > 0, 'n=' + custN);

  /* نسخة احتياطية ثم استبدال ثم تراجع */
  const beforeLedger = window.localStorage.getItem('app_ledger');
  window.localStorage.setItem('app_ledger', JSON.stringify([{ type: 'in', amount: 1, desc: 'مؤقت', date: '2026-01-01' }]));
  ok('استبدال محلي اتنفّذ', JSON.parse(window.localStorage.getItem('app_ledger')).length === 1);

  const restoreBtn = $('#syncRestore');
  ok('زرار التراجع موجود', !!restoreBtn);
  ok('لا أخطاء في لوحة المزامنة', errors.length === 0, errors.join(' | '));
  window.localStorage.setItem('app_ledger', beforeLedger);

  console.log('\n[29] اختيار الوجهة + إعداد مجلد التصدير');
  ok('نافذة اختيار الوجهة موجودة في HTML', !!$('#exportModal'));
  ok('إعداد وجهة الرفع موجود', !!$('#exportFolderMode'));
  ok('الوضع الافتراضي مجلد مخصص', $('#exportFolderMode').value === 'folder', $('#exportFolderMode').value);
  $('#exportFolderMode').value = 'root';
  $('#exportFolderMode').dispatchEvent(new window.Event('change'));
  ok('الوضع اتغيّر واتحفظ', window.localStorage.getItem('app_export_dest') === 'root',
     window.localStorage.getItem('app_export_dest'));
  $('#exportFolderMode').value = 'folder';
  $('#exportFolderMode').dispatchEvent(new window.Event('change'));

  /* الرفع من النافذة يرسل dest صحيحة */
  let uploadBody = null;
  window.fetch = (url, init) => {
    const u = String(url);
    if (u.indexOf('/api/google/upload') > -1) {
      uploadBody = JSON.parse(init.body);
      return jsonResponse({ ok: true, id: 'x1', name: 'n', link: '' });
    }
    if (u.indexOf('/api/google/notify') > -1) return jsonResponse({ ok: true, to: 'x@y.z' });
    return jsonResponse({ configured: true, connected: true, email: 'owner@example.com' });
  };
  click($('[data-go="settings"]'));   /* يعيد قراءة حالة الربط فيتفعّل الاتصال */
  await wait(60);
  click($('[data-export="customers"][data-kind="xlsx"]'));
  await wait(30);
  ok('النافذة انفتحت قبل الرفع', $('#exportModal').classList.contains('is-open'));
  ok('زر الرفع مفعّل وهو متصل', $('#exportToDrive').disabled === false,
     'disabled=' + $('#exportToDrive').disabled);
  ok('الملاحظة توضّح وجهة المجلد', $('#exportDriveHint').textContent.indexOf('ملفات ال PDF و EXCEL') > -1,
     $('#exportDriveHint').textContent);
  click($('#exportToDrive'));
  await wait(80);
  ok('الرفع اتصل بـ /api/google/upload', !!uploadBody, JSON.stringify(uploadBody && uploadBody.name));
  ok('الوجهة اتبعتت (folder)', uploadBody && uploadBody.dest === 'folder',
     uploadBody && String(uploadBody.dest));
  delete window.fetch;

  console.log('\n[30] لائحة النسخ + اختيار نسخة قديمة');
  ok('زرار «اختر النسخة القديمة» موجود', !!$('#syncPick'));
  ok('صندوق اللائحة موجود', !!$('#syncVersions'));
  ok('زرار العودة للنسخة الحالية موجود', !!$('#syncVersionsBack'));

  /* لائحة نسخ وهمية */
  const fakeVersions = {
    ok: true, max: 50, count: 2,
    latest: { id: 'lat1', name: 'sync-latest.json', modifiedTime: '2026-10-26T10:00:00Z', size: 500 },
    versions: [
      { id: 'v2', name: 'نسخة 2026-10-26 15.30.00.json', modifiedTime: '2026-10-26T15:30:00Z', size: 900 },
      { id: 'v1', name: 'نسخة 2026-10-25 20.00.00.json', modifiedTime: '2026-10-25T20:00:00Z', size: 800 }
    ]
  };
  window.fetch = () => jsonResponse(fakeVersions);
  click($('#syncPick'));
  await wait(60);
  ok('الصندوق انفتح', $('#syncVersions').hidden === false);
  ok('العنوان يذكر العدد والحد', $('#syncVersionsHead').textContent.indexOf('2 من 50') > -1,
     $('#syncVersionsHead').textContent);
  ok('نسختين في اللائحة', $$('#syncVersionsList [data-ver-idx]').length === 2,
     'n=' + $$('#syncVersionsList [data-ver-idx]').length);
  ok('التاريخ ظاهر في العنوان', $('#syncVersionsList').textContent.indexOf('2026-10-26') > -1);

  /* تطبيق نسخة قديمة */
  const custBefore = window.localStorage.getItem('app_customers');
  const remoteSnap = {
    schema: 1, updatedAt: '2026-10-25T20:00:00Z', device: 'نسخة قديمة',
    counts: { app_customers: 1 },
    sections: { app_customers: JSON.stringify([{ name: 'عميل من نسخة قديمة', phone: '0770000000', balance: 5 }]) }
  };
  window.fetch = (url) => {
    if (String(url).indexOf('/api/sync/version?id=v1') > -1) {
      return jsonResponse({ ok: true, snapshot: remoteSnap });
    }
    return jsonResponse(fakeVersions);
  };
  click($$('#syncVersionsList [data-ver-idx]')[1]);
  await wait(80);
  ok('النسخة القديمة اتطبّقت',
     JSON.parse(window.localStorage.getItem('app_customers'))[0].name === 'عميل من نسخة قديمة',
     JSON.parse(window.localStorage.getItem('app_customers'))[0].name);
  ok('نسخة احتياطية اتسجّلت قبل الاستبدال', !!window.localStorage.getItem('app_sync_backup'));
  ok('ملاحظة توضح إنها نسخة قديمة', $('#syncNote').textContent.indexOf('نسخة قديمة') > -1 ||
     $('#syncNote').textContent.indexOf('النسخة القديمة') > -1, $('#syncNote').textContent);

  /* العودة للنسخة الحالية */
  const latestSnap = {
    schema: 1, updatedAt: '2026-10-26T10:00:00Z', device: 'جهاز حالي',
    counts: { app_customers: custN },
    sections: { app_customers: custBefore }
  };
  window.fetch = (url) => jsonResponse({
    ok: true, exists: true, snapshot: latestSnap,
    updatedAt: latestSnap.updatedAt, modifiedTime: '2026-10-26T10:00:00Z'
  });
  click($('#syncVersionsBack'));
  await wait(80);
  ok('رجع للنسخة الحالية', window.localStorage.getItem('app_customers') === custBefore);
  delete window.fetch;
  ok('لا أخطاء في لائحة النسخ', errors.length === 0, errors.join(' | '));

  console.log('\n[31] استمرارية الفولدر المشترك + التعديل والحذف + الرفع التلقائي');

  /* الفولدر المشترك يُحفظ محلياً حتى لو قراءة السيرفر فشلت */
  window.localStorage.setItem('app_sync_custom_folder', 'https://drive.google.com/drive/folders/ABC123XYZ');
  click($('[data-go="settings"]'));
  await wait(60);
  ok('رابط الفولدر المشترك باقي بعد فتح الإعدادات', $('#syncFolderUrl').value.indexOf('ABC123XYZ') > -1,
     $('#syncFolderUrl').value);
  ok('زر الحذف ظاهر مع فولدر مخصص', $('#syncFolderClear').hidden === false);
  ok('زر الحفظ موجود', !!$('#syncFolderSave'));
  window.localStorage.removeItem('app_sync_custom_folder');

  /* زر الحفظ السريع في الشريط العلوي */
  ok('زر الحفظ السريع موجود في الهيدر', !!$('#quickSaveBtn'));
  ok('أيقونة الحفظ مضبوطة', $('#quickSaveBtn').innerHTML.indexOf('ic-save') > -1);

  /* نمط الرفع التلقائي */
  ok('خانة نمط الرفع التلقائي موجودة', !!$('#syncAutoMode'));
  ok('أربع أنماط (ساعات/تعديل/يومي/إيقاف)', $$('#syncAutoMode option').length === 4,
     'n=' + $$('#syncAutoMode option').length);
  ok('خانة عدد الساعات موجودة', !!$('#syncAutoHours'));
  $('#syncAutoMode').value = 'change';
  $('#syncAutoMode').dispatchEvent(new window.Event('change'));
  ok('النمط اتسجل', window.localStorage.getItem('app_sync_auto_mode') === 'change',
     window.localStorage.getItem('app_sync_auto_mode'));
  ok('خانة الساعات اتخفت في نمط التعديل', $('#syncAutoHoursField').hidden === true);
  $('#syncAutoMode').value = 'interval';
  $('#syncAutoMode').dispatchEvent(new window.Event('change'));
  ok('خانة الساعات رجعت في نمط الساعات', $('#syncAutoHoursField').hidden === false);

  /* تعديل عميل من ملفه */
  click($('[data-go="home"]'));
  click($('[data-go="customers"]'));
  await wait(40);
  click($('#customersTable tbody tr[data-idx]'));
  await wait(40);
  ok('ملف العميل فتح', $('#view-profile').classList.contains('is-active'));
  ok('زر تعديل العميل موجود', !!$('#profileEditBtn'));
  ok('زر حذف العميل موجود', !!$('#profileDeleteBtn'));
  click($('#profileEditBtn'));
  await wait(40);
  ok('راح لشاشة الإضافة', $('#view-add-customer').classList.contains('is-active'));
  ok('العنوان اتغيّر لـ تعديل عميل', $('#view-add-customer h2').textContent.indexOf('تعديل') > -1,
     $('#view-add-customer h2').textContent);
  ok('النموذج اتملى بالبيانات', $('#customerForm').elements.name.value.length > 0,
     $('#customerForm').elements.name.value);
  $('#customerForm').elements.name.value = 'عميل بعد التعديل';
  /* العميل الافتراضي ناقص حقول إلزامية — نكملها عشان الحفظ يمر */
  var cff = $('#customerForm').elements;
  cff.phone2.value = '0770000001';
  cff.nationalId.value = '12345678901';
  cff.paidByUs.value = '1000';
  cff.total.value = '5000';
  cff.down.value = '500';
  cff.durationValue.value = '5';
  $$('#customerForm input[name="status"]').forEach(function (r) { r.checked = (r.value === 'جاري العمل'); });
  var sySel = $('#customerForm').elements.startYear;
  if (!sySel.value) sySel.value = sySel.options[1] ? sySel.options[1].value : '';
  $('#customerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(60);
  ok('رجع لملف العميل بعد الحفظ', $('#view-profile').classList.contains('is-active'));
  ok('الاسم اتحدّث في الملف', $('#profileTitle').textContent === 'عميل بعد التعديل',
     $('#profileTitle').textContent);
  ok('العنوان رجع لـ إضافة عميل', $('#view-add-customer h2').textContent.indexOf('إضافة') > -1,
     $('#view-add-customer h2').textContent);

  /* حذف حركات الدواخل — زر التعديل موجود */
  click($('[data-go="home"]'));
  click($('[data-go="ledger"]'));
  await wait(40);
  ok('زر تعديل في جدول الدواخل', $$('#ledgerTbody [data-edit-ledger]').length > 0);
  const ledRowsBefore = $$('#ledgerTbody tr').length;
  click($$('#ledgerTbody [data-edit-ledger]')[0]);
  await wait(40);
  ok('نموذج الدواخل اتملى للتعديل', $('#ledgerForm').elements.desc.value.length > 0,
     $('#ledgerForm').elements.desc.value);
  ok('زر إلغاء التعديل ظهر', $('#ledgerCancelEdit').hidden === false);
  $('#ledgerForm').elements.amount.value = '77777';
  $('#ledgerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(40);
  ok('التعديل اتحفظ بدون زيادة صف', $$('#ledgerTbody tr').length === ledRowsBefore,
     $$('#ledgerTbody tr').length + ' vs ' + ledRowsBefore);
  ok('المبلغ اتحدّث', $('#ledgerTbody').textContent.indexOf('77,777') > -1);
  ok('زر إلغاء التعديل اتخفى', $('#ledgerCancelEdit').hidden === true);

  /* أزرار الحذف في جداول ملف العميل */
  ok('زر حذف في جدول تحصيل الملف', $$('#collectTable [data-del-pay]').length > 0,
     'n=' + $$('#collectTable [data-del-pay]').length);

  ok('لا أخطاء في الإضافات الجديدة', errors.length === 0, errors.join(' | '));

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('  أخطاء وقت التنفيذ: ' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  console.log('==================================================\n');
  window.close();
  process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})();
