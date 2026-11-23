/* ============================================================
   اختبار «استبدال البيانات من فولدر/ملف JSON» + الرجوع للنسخة السابقة
   ------------------------------------------------------------
   بيتأكد إن:
   ١) اختيار فولدر فيه أكتر من ملف بيختار أغنى ملف بالبيانات.
   ٢) الاستبدال مش بيحصل قبل كلمة المرور.
   ٣) بعد كلمة المرور الأقسام اللي في الملف بس هي اللي بتتغير.
   ٤) نسخة «قبل الاستبدال» بتتحفظ وتقدر ترجعها (رجوع كامل).
   ٥) الحارس ما بيرجّعش القسم القديم بعد ما الملف يستبدله ببيانات أقل/فاضية.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node import-json-test.js
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const HTML = fs.readFileSync('dist/index.html', 'utf8');
const APP = fs.readFileSync('dist/app.js', 'utf8');
const EXP = fs.readFileSync('dist/export.js', 'utf8');

function buildHtml() {
  return HTML
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + EXP + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + APP + '</script>');
}

const CUSTOMERS = [
  { name: 'أحمد محمد علي', phone: '01000000001', total: 1000, paid: 200 },
  { name: 'حسن سمير', phone: '01000000002', total: 2000, paid: 500 }
];
const NEW_CUSTOMERS = [
  { name: 'عميل مستورد ١', phone: '01111111111', total: 5000, paid: 0 },
  { name: 'عميل مستورد ٢', phone: '01111111112', total: 6000, paid: 1000 },
  { name: 'عميل مستورد ٣', phone: '01111111113', total: 7000, paid: 2000 },
  { name: 'عميل مستورد ٤', phone: '01111111114', total: 8000, paid: 3000 }
];
const SUPPLIERS = [{ name: 'مورد أول', tx: [] }];

function boot(seed) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.message)));
  const dom = new JSDOM(buildHtml(), {
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
      Object.keys(seed || {}).forEach((k) => window.localStorage.setItem(k, seed[k]));
    }
  });
  return { dom, window: dom.window, errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (win, raw) => { try { return JSON.parse(win.localStorage.getItem(raw)); } catch (e) { return null; } };

function chooseFiles(win, input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

async function confirmPassword(win, pwd) {
  const inp = win.document.querySelector('#confirmPwd');
  const yes = win.document.querySelector('#confirmYes');
  if (inp) inp.value = String(pwd);
  if (yes) yes.click();
  await wait(120);
}

(async function main() {
  const seed = {
    app_customers: JSON.stringify(CUSTOMERS),
    app_suppliers: JSON.stringify(SUPPLIERS),
    app_password: '2468'
  };
  const { window: win, errors } = boot(seed);
  const doc = win.document;
  await wait(150);

  console.log('\n[1] فتح الإعدادات ولوحة الاستبدال');
  const settingsLink = doc.querySelector('[data-go="settings"]');
  ok('زر الإعدادات موجود', !!settingsLink);
  if (settingsLink) settingsLink.click();
  await wait(120);
  const body = doc.querySelector('#importBody');
  ok('لوحة الاستبدال ظاهرة', !!body);
  ok('رابط «رفع فولدر» موجود', !!doc.querySelector('#importFolderInput'));
  ok('رابط «ملف JSON واحد» موجود', !!doc.querySelector('#importFileInput'));
  ok('زر الرجوع مخفي قبل أي استبدال', !!doc.querySelector('#importUndoBtn') && doc.querySelector('#importUndoBtn').hidden);

  console.log('\n[2] فولدر فيه ملفين — اختيار الأغنى');
  const snapSmall = JSON.stringify({ sections: { app_customers: JSON.stringify([{ name: 'واحد' }]) } });
  const snapBig = JSON.stringify({
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: {
      app_customers: JSON.stringify(NEW_CUSTOMERS),
      app_suppliers: JSON.stringify([])
    }
  });
  const files = [
    new win.File([snapSmall], 'small.json', { type: 'application/json' }),
    new win.File([snapBig], 'full-backup.json', { type: 'application/json' }),
    new win.File(['<html>not json</html>'], 'notes.txt', { type: 'text/plain' })
  ];
  chooseFiles(win, doc.querySelector('#importFolderInput'), files);
  await wait(400);
  const applyBtn = doc.querySelector('[data-import-apply]');
  ok('ظهرت معاينة الملف الأغنى', !!applyBtn);
  ok('المعاينة بتقول ٤ سجل', body.textContent.indexOf('4 سجل') > -1 || body.textContent.indexOf('٤') > -1, body.textContent.slice(0, 400));
  ok('الملف اللي اتختار هو full-backup.json', body.textContent.indexOf('full-backup.json') > -1, body.textContent.slice(0, 300));
  ok('الاستبدال ما اتنفذش قبل التأكيد', parse(win, 'app_customers').length === CUSTOMERS.length);

  console.log('\n[3] كلمة مرور غلط ما بتغيّرش حاجة');
  applyBtn.click();
  await wait(60);
  await confirmPassword(win, '0000');
  ok('البيانات لسه زي ما هي بعد كلمة مرور غلط', parse(win, 'app_customers').length === CUSTOMERS.length);
  ok('رسالة الخطأ ظاهرة', !doc.querySelector('#confirmError').hidden);

  console.log('\n[4] الاستبدال بكلمة المرور الصحيحة');
  await confirmPassword(win, '2468');
  await wait(200);
  const afterImport = parse(win, 'app_customers') || [];
  ok('العملاء بقوا ٤ من الملف', afterImport.length === NEW_CUSTOMERS.length, afterImport.length);
  ok('اسم أول عميل من الملف', afterImport[0] && afterImport[0].name === NEW_CUSTOMERS[0].name);
  ok('قسم فاضي في الملف اتنفذ (الموردون)', parse(win, 'app_suppliers').length === 0);
  const pre = parse(win, 'app_pre_replace_backup');
  ok('نسخة ما قبل الاستبدال اتحفظت', !!pre && !!pre.sections);
  ok('النسخة فيها العملاء القدام (٢)', pre && pre.sections && JSON.parse(pre.sections.app_customers).length === 2);
  ok('زر الرجوع بقى ظاهر', doc.querySelector('#importUndoBtn').hidden === false);
  const guard = parse(win, 'app_data_guard');
  ok('الحارس ما بيعتبرش قسم الموردين القديم سليم', !!guard && guard.sections && !guard.sections.app_suppliers);

  console.log('\n[5] الرجوع للنسخة قبل الاستبدال');
  doc.querySelector('#importUndoBtn').click();
  await wait(60);
  await confirmPassword(win, '2468');
  await wait(200);
  const restored = parse(win, 'app_customers') || [];
  ok('العملاء رجعوا ٢ تاني', restored.length === 2, restored.length);
  ok('الموردون رجعوا', (parse(win, 'app_suppliers') || []).length === 1);
  const swapped = parse(win, 'app_pre_replace_backup');
  ok('الحالة اللي قبل الرجوع اتحفظت (تقدر ترجع لها)', !!swapped && !!swapped.sections && JSON.parse(swapped.sections.app_customers).length === 4, swapped && swapped.sections && JSON.parse(swapped.sections.app_customers).length);
  ok('مفيش أخطاء JS', errors.length === 0, errors.join(' | '));

  console.log('\nالنتيجة: ' + pass + ' ناجح، ' + fail + ' فاشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('انهيار الاختبار:', e && e.stack ? e.stack : e);
  process.exit(1);
});
