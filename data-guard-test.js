/* ============================================================
   اختبار حارس البيانات
   ------------------------------------------------------------
   بيتأكد إن:
   - قسم اتمسح (بقى []) بيرجع لوحده أول ما التطبيق يفتح.
   - قسم اتلف (نص مش JSON) بيرجع كمان.
   - مزامنة تلقائية بنسخة فيها سجلات أقل ما تنقصش بياناتك.
   - التطبيق الصريح لنسخة قديمة (force) بيمشي زي ما هو.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node data-guard-test.js
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
  { name: ' حسنء سمير', phone: '01000000002', total: 2000, paid: 500 },
  { name: 'كريم فتحي', phone: '01000000003', total: 500, paid: 0 }
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
const dump = (win) => {
  const out = {};
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    out[k] = win.localStorage.getItem(k);
  }
  return out;
};
const list = (win, k) => {
  try { const v = JSON.parse(win.localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
};

(async () => {
  console.log('\n[1] الإقلاع الأول: الحارس بيتسجل');
  const a = boot({
    app_customers: JSON.stringify(CUSTOMERS),
    app_suppliers: JSON.stringify(SUPPLIERS)
  });
  await wait(500);
  ok('العملاء ظاهرين 3', list(a.window, 'app_customers').length === 3, list(a.window, 'app_customers').length);
  const guardRaw = a.window.localStorage.getItem('app_data_guard');
  ok('الحارس اتسجل', !!guardRaw);
  let guard = {};
  try { guard = JSON.parse(guardRaw || '{}'); } catch (e) {}
  ok('الحارس فيه نسخة من العملاء', !!(guard.sections && guard.sections.app_customers));
  ok('مفيش أخطاء JS', a.errors.length === 0, a.errors.join(' | '));

  const saved = dump(a.window);

  console.log('\n[2] قسم بقى فاضي ([]) — لازم يرجع لوحده');
  const wiped = Object.assign({}, saved, { app_customers: '[]' });
  const b = boot(wiped);
  await wait(500);
  ok('العملاء رجعوا 3 بعد ما كانوا []', list(b.window, 'app_customers').length === 3,
    list(b.window, 'app_customers').length);
  ok('العداد في الرئيسية 3', (b.window.document.querySelector('#statCustomers') || {}).textContent === '3',
    (b.window.document.querySelector('#statCustomers') || {}).textContent);

  console.log('\n[3] قسم اتلف (نص مش JSON) — لازم يرجع كمان');
  const broken = Object.assign({}, saved, { app_customers: '{"نص":"مقطوع"' });
  const c = boot(broken);
  await wait(500);
  ok('العملاء رجعوا بعد التلف', list(c.window, 'app_customers').length === 3,
    list(c.window, 'app_customers').length);

  console.log('\n[3ب] المخازن وتعريفات الحقول المخصصة محميين من المسح');
  const e = boot(Object.assign({}, saved, {
    app_stores: JSON.stringify({ stores: ['المخزن الرئيسي'], docs: [{ id: 'd1', item: 'شاشة', qty: 3, type: 'in' }] }),
    app_custom_fields: JSON.stringify({ customers: [{ name: 'رقم الملف', required: false }] })
  }));
  await wait(500);
  await e.window.syncApply({
    updatedAt: new Date().toISOString(),
    sections: { app_stores: '[]', app_custom_fields: '{}' }
  });
  await wait(150);
  let stores = {}, fields = {};
  try { stores = JSON.parse(e.window.localStorage.getItem('app_stores') || '{}'); } catch (err) {}
  try { fields = JSON.parse(e.window.localStorage.getItem('app_custom_fields') || '{}'); } catch (err) {}
  ok('حركات المخازن ما اتمسحتش من نسخة فاضية', (stores.docs || []).length === 1, JSON.stringify(stores));
  ok('تعريفات الحقول المخصصة ما اتمسحت', (fields.customers || []).length === 1, JSON.stringify(fields));

  console.log('\n[4] المزامنة التلقائية ما تنقصش بياناتك');
  const d = boot(saved);
  await wait(500);
  await d.window.syncApply({
    updatedAt: new Date().toISOString(),
    sections: { app_customers: JSON.stringify([{ name: 'نسخة قديمة فيها عميل واحد' }]) }
  });
  await wait(120);
  ok('المزامنة العادية ما مسحتش العملاء', list(d.window, 'app_customers').length === 3,
    list(d.window, 'app_customers').length);

  console.log('\n[5] التطبيق الصريح لنسخة قديمة بيمشي');
  await d.window.syncApply({
    updatedAt: new Date().toISOString(),
    sections: { app_customers: JSON.stringify([{ name: 'عميل من نسخة قديمة' }]) }
  }, true);
  await wait(120);
  ok('النسخة القديمة اتطبقت لما المستخدم طلبها',
    (list(d.window, 'app_customers')[0] || {}).name === 'عميل من نسخة قديمة',
    JSON.stringify(list(d.window, 'app_customers')));

  console.log('\n[6] زر الاستعادة موجود في «سلامة البيانات»');
  const settingsBtn = d.window.document.querySelector('[data-go="settings"]');
  if (settingsBtn) settingsBtn.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true }));
  await wait(200);
  const btn = d.window.document.querySelector('[data-guard-restore]');
  ok('زر «استعادة آخر حالة سليمة» موجود', !!btn);
  if (btn) {
    btn.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('الزر رجّع العملاء 3', list(d.window, 'app_customers').length === 3,
      list(d.window, 'app_customers').length);
  }

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
