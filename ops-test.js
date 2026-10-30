/* اختبار: سجل العمليات + التراجع + حماية البيانات من المسح التلقائي */
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
    window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ ok: false, exists: false }), status: 404 });
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
const txt = (sel) => ($(sel) ? ($(sel).textContent || '') : '');
const submit = (f) => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const JKEY = (k) => JSON.parse(window.localStorage.getItem(k) || '[]');
const OPS = () => JSON.parse(window.localStorage.getItem('app_operations') || '[]');
async function unlock(sel) {
  click($(sel));
  await wait(60);
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
}

(async () => {
  await wait(400);
  /* نحاكي جهاز عنده بيانات محفوظة أصلاً (عشان التغيير يكون قابلاً للتراجع) */
  window.localStorage.setItem('app_associations',
    JSON.stringify([{ name: 'جمعية قديمة', fee: 5000 }]));
  await wait(30);

  console.log('\n[1] أي عملية تغيير بتتسجّل تلقائياً');
  await unlock('[data-go="associations"]');
  const asf = $('#assocForm');
  asf.elements.name.value = 'جمعية السجل';
  asf.elements.fee.value = '7000';
  submit(asf);
  await wait(80);
  const ops1 = OPS();
  ok('فيه عمليات مسجّلة', ops1.length >= 1, ops1.length);
  ok('السجل اتحفظ في localStorage', window.localStorage.getItem('app_operations') !== null);
  ok('آخر عملية من قسم الجمعيات', ops1[0] && ops1[0].key === 'app_associations', ops1[0] && ops1[0].key);
  ok('الوصف يوضح الإضافة باسمها', ops1[0] && ops1[0].desc.indexOf('جمعية السجل') > -1, ops1[0] && ops1[0].desc);
  ok('الوصف فيه علامة الإضافة +', ops1[0] && ops1[0].desc.indexOf('+') > -1, ops1[0] && ops1[0].desc);
  ok('العملية قابلة للتراجع', ops1[0] && ops1[0].undoable === true);
  ok('فيها وقت', ops1[0] && !!ops1[0].at);

  console.log('\n[2] شاشة العمليات محمية بكلمة المرور');
  click($('[data-go="operations"]'));
  await wait(60);
  ok('بيطلب كلمة المرور أولاً', $('#pwdModal').classList.contains('is-open'));
  ['2', '4', '6', '8'].forEach((k) => click($('#keypad button[data-key="' + k + '"]')));
  await wait(400);
  ok('الشاشة فتحت بعد الباسورد', $('#view-operations').classList.contains('is-active'));
  ok('أربعة مربعات ملخص', $$('#opsSummary .summary__box').length === 4, $$('#opsSummary .summary__box').length);
  ok('العدّاد بيعرض عدد العمليات', /عملية/.test(txt('#opsCount')), txt('#opsCount'));
  ok('الجدول فيه صف على الأقل', $$('#opsTbody tr').length >= 1, $$('#opsTbody tr').length);
  ok('الصف فيه زر تراجع', !!$('#opsTbody [data-undo-op]'));
  ok('الصف بيوضح القسم', txt('#opsTbody').indexOf('الجمعيات') > -1, txt('#opsTbody').slice(0, 160));
  ok('فيه زر تراجع عن آخر عملية', !!$('#opsUndoLast'));
  ok('الزر مفعّل (آخر عملية قابلة للتراجع)', $('#opsUndoLast').disabled === false);

  console.log('\n[3] التراجع عن عملية');
  const assocsBefore = JKEY('app_associations').length;
  ok('قبل التراجع الجمعيات ' + assocsBefore, assocsBefore === 2, assocsBefore);
  const undoBtn = $('#opsTbody [data-undo-op]');
  ok('زر التراجع موجود في الصف', !!undoBtn);
  if (!undoBtn) throw new Error('لا يوجد زر تراجع');
  click(undoBtn);
  await wait(60);
  ok('نافذة التأكيد انفتحت', $('#confirmModal').classList.contains('is-open'));
  ok('الرسالة تبيّن العملية', txt('#confirmMsg').indexOf('الجمعيات') > -1, txt('#confirmMsg'));
  click($('#confirmYes'));
  await wait(150);
  ok('العملية اترجعت (الجمعية اتشالت)', JKEY('app_associations').length === assocsBefore - 1,
     JKEY('app_associations').length);
  ok('رجعت للمكشوف اللي كان موجود', (JKEY('app_associations')[0] || {}).name === 'جمعية قديمة',
     JSON.stringify(JKEY('app_associations')));
  ok('اتسجلت عملية التراجع نفسها', OPS().length >= 2, OPS().length);
  ok('لسنا في شاشة العمليات', $('#view-operations').classList.contains('is-active'));

  console.log('\n[4] زر «تراجع عن آخر عملية»');
  const par0 = [{ name: 'أول شريك', role: 'شريك', share: 10, capital: 100, withdrawals: 0, note: '' }];
  const par1 = par0.concat([{ name: 'شريك إضافي', role: 'شريك', share: 20, capital: 200, withdrawals: 0, note: '' }]);
  window.localStorage.setItem('app_partners', JSON.stringify(par0));
  await wait(30);
  window.localStorage.setItem('app_partners', JSON.stringify(par1));
  await wait(30);
  ok('آخر عملية من الشركاء', OPS()[0].key === 'app_partners', OPS()[0].key);
  ok('قابلة للتراجع', OPS()[0].undoable === true);
  ok('الزر مفعّل', $('#opsUndoLast').disabled === false);
  click($('#opsUndoLast'));
  await wait(60);
  ok('نافذة التأكيد فتحت', $('#confirmModal').classList.contains('is-open'));
  click($('#confirmYes'));
  await wait(150);
  ok('الشركاء رجعوا لحالة قبل الإضافة', JKEY('app_partners').length === 1, JKEY('app_partners').length);
  ok('الاسم رجع لأول شريك', (JKEY('app_partners')[0] || {}).name === 'أول شريك');

  console.log('\n[5] تفريغ السجل بكلمة المرور (من غير ما يمسح البيانات)');
  click($('#opsClear'));
  await wait(60);
  ok('نافذة التأكيد فتحت', $('#confirmModal').classList.contains('is-open'));
  ok('خانة كلمة المرور ظاهرة', $('#confirmPwdWrap').hidden === false);
  $('#confirmPwd').value = '1111';
  click($('#confirmYes'));
  await wait(40);
  ok('باسورد غلط اترفض', $('#confirmModal').classList.contains('is-open') && $('#confirmError').hidden === false);
  $('#confirmPwd').value = '2468';
  click($('#confirmYes'));
  await wait(80);
  ok('السجل اتفرغ', OPS().length === 0, OPS().length);
  ok('البيانات نفسها ما اتمسحتش', JKEY('app_partners').length === 1, JKEY('app_partners').length);

  console.log('\n[6] حماية: نسخة بعيّدة فارغة ما تمسحش بيانات محلية');
  window.localStorage.setItem('app_customers',
    JSON.stringify([{ name: 'عميل الاختبار', phone: '0770000000', address: '', balance: 0 }]));
  await wait(40);
  ok('العميل موجود', JKEY('app_customers').length === 1, JKEY('app_customers').length);
  await window.syncApply({ sections: { app_customers: '[]' }, updatedAt: new Date().toISOString() });
  await wait(120);
  ok('القسم الفارغ اتجاهل والعميل لسه موجود', JKEY('app_customers').length === 1,
     JSON.stringify(JKEY('app_customers')));
  await window.syncApply({
    sections: { app_customers: JSON.stringify([{ name: 'من الدرايف 1' }, { name: 'من الدرايف 2' }]) },
    updatedAt: new Date().toISOString()
  });
  await wait(120);
  ok('القسم السليم اتطبّق', JKEY('app_customers').length === 2, JKEY('app_customers').length);

  console.log('\n[7] فحص سلامة البيانات في الإعدادات');
  click($('[data-go="settings"]'));
  await wait(120);
  const body = txt('#dataSafetyBody');
  ok('الفحص اترسم', body.length > 40, body.slice(0, 120));
  ok('بيعرض أقسام سليمة', body.indexOf('سليم') > -1, body.slice(0, 200));
  ok('مفيش أقسام تالفة', body.indexOf('>تالف<') === -1, body.slice(0, 300));
  ok('فيه عدد العمليات', body.indexOf('عمليات مسجّلة') > -1);
  ok('زر فتح العمليات موجود', !!$('[data-go="operations"]'));

  console.log('\n[8] لا أخطاء وقت التشغيل');
  ok('صفر أخطاء', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
