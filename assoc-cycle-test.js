/* اختبار نظام الجمعيات (الدور) + بروفايل العضو + بروفايل الشريك الكامل */
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
const submit = (f) => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

async function unlock(sel) {
  click($(sel));
  await wait(60);
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
}
const JKEY = (k) => JSON.parse(window.localStorage.getItem(k) || '[]');
const boxLabel = (root, label) =>
  $$(root + ' .summary__box')
    .find((b) => ((b.querySelector('small') || {}).textContent || '').indexOf(label) > -1);

(async () => {
  await wait(400);

  console.log('\n[1] فتح الجمعيات + بطاقة الدور');
  await unlock('[data-go="associations"]');
  ok('شاشة الجمعيات فتحت', $('#view-associations').classList.contains('is-active'));
  const cardTxt = $('#assocCards .mini-card').textContent;
  ok('الكارت فيه الحصيلة الشهرية', cardTxt.indexOf('الحصيلة الشهرية') > -1, cardTxt.slice(0, 200));
  ok('الكارت فيه مدّة الدورة', cardTxt.indexOf('مدّة الدورة') > -1);
  ok('الكارت فيه يوم القبض', cardTxt.indexOf('يوم القبض') > -1);
  ok('الكارت فيه دور الشهر الحالي', cardTxt.indexOf('دور الشهر الحالي') > -1);
  ok('الكارت فيه أول شهر', cardTxt.indexOf('أول شهر') > -1);
  ok('عدد الأعضاء لسه أول small', $$('#assocCards .mini-card small')[0].textContent === '2 عضو',
     $$('#assocCards .mini-card small')[0].textContent);

  const cardTxt2 = cardTxt;
  const firstMember = $$('#membersTbody tr')[0];
  ok('أول صف أعضاء ظاهر', !!firstMember);
  ok('الحصيلة الشهرية = السهم × عدد الأعضاء (12000×2=24000)',
     cardTxt2.indexOf('24,000') > -1, cardTxt2.match(/الحصيلة الشهرية[^0-9]*([0-9,]+)/));

  console.log('\n[2] حقول الدورة في نموذج الجمعية');
  ok('حقل عدد الشهور موجود', !!$('#assocForm [name="months"]'));
  ok('حقل يوم القبض موجود', !!$('#assocForm [name="payoutDay"]'));
  ok('حقل أول شهر موجود', !!$('#assocForm [name="startMonth"]'));

  const asf = $('#assocForm');
  asf.elements.name.value = 'جمعية الاختبار';
  asf.elements.fee.value = '5000';
  asf.elements.months.value = '10';
  asf.elements.payoutDay.value = '15';
  asf.elements.startMonth.value = '2026-11';
  submit(asf);
  await wait(60);
  const assocs = JKEY('app_associations');
  const newA = assocs.find((a) => a.name === 'جمعية الاختبار');
  ok('الجمعية اتضافت', !!newA);
  ok('عدد الشهور اتحفظ = 10', newA && newA.months === 10, newA && newA.months);
  ok('يوم القبض اتحفظ = 15', newA && newA.payoutDay === 15, newA && newA.payoutDay);
  ok('أول شهر اتحفظ = 2026-11', newA && newA.startMonth === '2026-11', newA && newA.startMonth);
  const newCard = $$('#assocCards .mini-card').find((c) => c.textContent.indexOf('جمعية الاختبار') > -1);
  ok('كارت الجمعية الجديدة بيعرض 10 شهر', newCard && newCard.textContent.indexOf('10 شهر') > -1,
     newCard && newCard.textContent.slice(0, 300));
  ok('بيعرض يوم 15', newCard && newCard.textContent.indexOf('يوم 15') > -1);
  ok('بيعرض نوفمبر 2026 كأول شهر', newCard && newCard.textContent.indexOf('نوفمبر 2026') > -1);

  console.log('\n[3] جدول الأدوار الشهرية');
  ok('الجدول ظهر', $('#matrixWrap').hidden === false);
  const mHead = $$('#matrixHead th').length;
  ok('رؤوس = # + عضو + 12 شهر', mHead === 14, mHead);
  ok('فيه اسم الشهر في الرأس', $('#matrixHead').textContent.indexOf('26') > -1 ||
     $('#matrixHead').textContent.indexOf('2026') > -1, $('#matrixHead').textContent.slice(0, 120));
  ok('صفوف الجدول = أعضاء الجمعية المختارة (2)', $$('#matrixTbody tr').length === 2,
     $$('#matrixTbody tr').length);
  ok('ملاحظة الجدول فيها الحصيلة', $('#matrixNote').textContent.indexOf('الحصيلة الشهرية') > -1);
  ok('ملاحظة الجدول فيها يوم القبض', $('#matrixNote').textContent.indexOf('يوم القبض') > -1);
  const cells = $$('#matrixTbody tr')[0].textContent;
  ok('الخلايا فيها حالة واحدة على الأقل', /مسدّد|معلّق|متأخر|لم يحن/.test(cells), cells.slice(0, 160));
  ok('الرأس فيه اسم صاحب الدور', $('#matrixHead').textContent.indexOf('خالد') > -1 ||
     $('#matrixHead').textContent.indexOf('وليد') > -1, $('#matrixHead').textContent.slice(0, 200));

  console.log('\n[4] عمود موعد القبض في جدول الأعضاء');
  const headCells = $$('#membersTable thead th').map((th) => th.textContent.trim());
  ok('فيه عمود «موعد قبضه»', headCells.indexOf('موعد قبضه') > -1, JSON.stringify(headCells));
  const firstRowCells = $$('#membersTbody tr')[0].querySelectorAll('td');
  ok('عدد الأعمدة بقى 10', firstRowCells.length === 10, firstRowCells.length);
  ok('موعد القبض فيه اسم شهر', /20\d\d/.test(firstRowCells[8].textContent),
     firstRowCells[8].textContent);
  ok('زر البروفايل موجود في الصف', !!$$('#membersTbody [data-member-profile]')[0]);

  console.log('\n[5] بروفايل عضو الجمعية');
  click($$('#membersTbody [data-member-profile]')[0]);
  await wait(120);
  ok('البروفايل انفتح', $('#view-member-profile').classList.contains('is-active'));
  const mName = ($('#membersTbody .p-name b') || {}).textContent || '';
  ok('العنوان = اسم العضو', txt('#mfpTitle') === mName, txt('#mfpTitle') + ' | ' + mName);
  ok('ثمانية مربعات ملخص', $$('#mfpSummary .summary__box').length === 8,
     $$('#mfpSummary .summary__box').length);
  const sumTxt = $('#mfpSummary').textContent;
  ok('فيه قيمة السهم', sumTxt.indexOf('قيمة السهم') > -1);
  ok('فيه الحصيلة اللي هيقبضها', sumTxt.indexOf('الحصيلة اللي هيقبضها') > -1);
  ok('فيه إجمالي اللي يدفعه في الدورة', sumTxt.indexOf('إجمالي اللي يدفعه في الدورة') > -1);
  ok('فيه مدّة الدورة', sumTxt.indexOf('مدّة الدورة') > -1);
  ok('أزرار البروفايل الأربعة موجودة',
     !!$('#mfpExcelBtn') && !!$('#mfpPdfBtn') && !!$('#mfpEditBtn') && !!$('#mfpDeleteBtn'));

  const paidBefore = num(boxLabel('#mfpSummary', 'المدفوع').querySelector('b').textContent);
  ok('جدول الأقساط فيه 12 شهر (افتراضي)', $$('#mfpTable tbody tr').length === 12,
     $$('#mfpTable tbody tr').length);
  ok('الجدول بيوضح المطلوب والمدفوع والمتبقي والحالة',
     /المطلوب/.test($('#mfpTable').textContent) || $$('#mfpTable thead th').length === 7);
  ok('شهر الدور مميّز في الجدول', $('#mfpTable tbody').innerHTML.indexOf('rgba(79,70,255') > -1);
  ok('تلميح الدورة موجود ومش فاضي', txt('#mfpCycleHint').length > 30, txt('#mfpCycleHint'));

  console.log('\n[6] تسجيل دفعة + حذفها');
  const pf = $('#mfpPayForm');
  ok('قائمة الشهور فيها 12 خيار', pf.elements.month.options.length === 12,
     pf.elements.month.options.length);
  pf.elements.amount.value = '500';
  submit(pf);
  await wait(80);
  const paidAfter = num(boxLabel('#mfpSummary', 'المدفوع').querySelector('b').textContent);
  ok('المدفوع زاد 500', paidAfter === paidBefore + 500, paidBefore + ' → ' + paidAfter);
  ok('الدفعة الجديدة (500) اتحفظت',
     JKEY('app_members')[0].payments.some((p) => Number(p.amount) === 500),
     JSON.stringify(JKEY('app_members')[0].payments));
  ok('المدفوع في localStorage بقى 12500', JKEY('app_members')[0].paid === 12500,
     JKEY('app_members')[0].paid);
  ok('جدول الدفعات فيه صفين (رصيد قديم + الجديد)', $$('#mfpLinks tbody tr').length === 2,
     $$('#mfpLinks tbody tr').length);

  const row500 = $$('#mfpLinks tbody tr').find((r) => r.textContent.indexOf('500') > -1);
  ok('لقينا صف الدفعة 500', !!row500, $('#mfpLinks').textContent.slice(0, 200));
  click(row500.querySelector('[data-del-mpay]'));
  await wait(60);
  ok('الدفعة اتحذفت', !JKEY('app_members')[0].payments.some((p) => Number(p.amount) === 500),
     JSON.stringify(JKEY('app_members')[0].payments));
  ok('المدفوع رجع 12000', JKEY('app_members')[0].paid === 12000, JKEY('app_members')[0].paid);

  console.log('\n[7] تصدير بروفايل العضو');
  click($('#mfpExcelBtn'));
  await wait(80);
  ok('نافذة الوجهة انفتحت', $('#exportModal').classList.contains('is-open'));
  ok('اسم الملف يبدأ بـ member-', txt('#exportFileName').indexOf('member-') === 0, txt('#exportFileName'));
  click($('#exportModal [data-close]'));
  await wait(30);

  console.log('\n[8] حذف عضو بكلمة المرور');
  click($('#mfpDeleteBtn'));
  await wait(60);
  ok('نافذة التأكيد انفتحت', $('#confirmModal').classList.contains('is-open'));
  ok('خانة كلمة المرور ظاهرة', $('#confirmPwdWrap').hidden === false);
  $('#confirmPwd').value = '1111';
  click($('#confirmYes'));
  await wait(40);
  ok('باسورد غلط اترفض', $('#confirmModal').classList.contains('is-open') &&
     $('#confirmError').hidden === false);
  $('#confirmPwd').value = '2468';
  click($('#confirmYes'));
  await wait(80);
  ok('العضو اتحذف', JKEY('app_members').length === 3, JKEY('app_members').length);
  ok('رجع لشاشة الجمعيات', $('#view-associations').classList.contains('is-active'));

  console.log('\n[9] بروفايل الشريك الكامل');
  await unlock('[data-go="partners"]');
  ok('شاشة الشركاء فتحت', $('#view-partners').classList.contains('is-active'));
  click($('#partnersTbody [data-partner-profile="0"]'));
  await wait(120);
  ok('بروفايل الشريك انفتح', $('#view-partner-profile').classList.contains('is-active'));
  ok('أزرار الأربعة موجودة',
     !!$('#pfpExcelBtn') && !!$('#pfpPdfBtn') && !!$('#pfpEditBtn') && !!$('#pfpDeleteBtn'));

  click($('#pfpExcelBtn'));
  await wait(80);
  ok('تصدير Excel للشريك فتح النافذة', $('#exportModal').classList.contains('is-open'));
  ok('اسم الملف يبدأ بـ partner-', txt('#exportFileName').indexOf('partner-') === 0, txt('#exportFileName'));
  click($('#exportModal [data-close]'));
  await wait(30);

  console.log('\n[10] حذف شريك من البروفايل');
  const before = JKEY('app_partners').length || 3;   /* الافتراضي 3 قبل أي حفظ */
  click($('#pfpDeleteBtn'));
  await wait(60);
  ok('نافذة التأكيد اتفتحت', $('#confirmModal').classList.contains('is-open'));
  ok('مطلوب كلمة مرور', $('#confirmPwdWrap').hidden === false);
  $('#confirmPwd').value = '2468';
  click($('#confirmYes'));
  await wait(80);
  ok('الشريك اتحذف', JKEY('app_partners').length === before - 1, JKEY('app_partners').length);
  ok('رجع لقائمة الشركاء', $('#view-partners').classList.contains('is-active'));

  console.log('\n[11] تعديل شريك من البروفايل');
  click($('#partnersTbody [data-partner-profile="0"]'));
  await wait(100);
  const target = JKEY('app_partners')[0].name;
  click($('#pfpEditBtn'));
  await wait(60);
  ok('نافذة التأكيد اتفتحت للتعديل', $('#confirmModal').classList.contains('is-open'));
  ok('الرسالة فيها اسم الشريك', txt('#confirmMsg').indexOf(target) > -1, txt('#confirmMsg'));
  ok('من غير كلمة مرور', $('#confirmPwdWrap').hidden === true);
  click($('#confirmYes'));
  await wait(80);
  ok('اتنقل لقائمة الشركاء', $('#view-partners').classList.contains('is-active'));
  ok('النموذج اتملى بالاسم', $('#partnerForm').elements.name.value === target,
     $('#partnerForm').elements.name.value);
  ok('الزر بقى حفظ التعديل', $('#partnerSubmitBtn').textContent.indexOf('حفظ التعديل') > -1);
  click($('#partnerCancelBtn'));

  console.log('\n[12] النسبة غير إجبارية — ما تلوّش تحذير دائمة');
  const pf2 = $('#partnerForm');
  pf2.elements.name.value = 'شريك بلا نسبة';
  pf2.elements.role.value = 'مستثمر';
  pf2.elements.share.value = '';
  pf2.elements.capital.value = '250000';
  submit(pf2);
  await wait(60);
  ok('الشريك اتضاف من غير نسبة', JKEY('app_partners').some((p) => p.name === 'شريك بلا نسبة'));
  ok('مفيش رسالة خطأ', $('#partnerError').hidden === true, txt('#partnerError'));
  ok('الشريط مش بيحذر', $('#sharePill').classList.contains('count-pill--ok'), txt('#sharePill'));
  ok('الشريط بيوضح إن الحصة اختيارية', txt('#sharePill').indexOf('الحصة اختيارية') > -1, txt('#sharePill'));

  console.log('\n[13] لا أخطاء وقت التشغيل');
  ok('صفر أخطاء', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
