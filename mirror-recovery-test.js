/* ============================================================
   mirror-recovery-test.js — النسخة الداخلية (IndexedDB)
   ------------------------------------------------------------
   بيتأكد إن بيانات localStorage لو ضاعت أو بقت فاضية، التطبيق
   بيرجّعها من النسخة الداخلية تلقائيًا عند الإقلاع (من غير ما
   يلمس الأقسام السليمة) — وده اللي بيحمي الويب والأندرويد من
   مسح التخزين المفاجئ.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node mirror-recovery-test.js
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : '')); }
};

const HTML = fs.readFileSync('dist/index.html', 'utf8');
const APP = fs.readFileSync('dist/app.js', 'utf8');
const EXP = fs.readFileSync('dist/export.js', 'utf8');

function buildHtml() {
  return HTML
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + EXP + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + APP + '</script>');
}

/* نفس المصنع لكل النوافذ = نفس قاعدة IndexedDB بين التشغيلتين */
const idbFactory = new IDBFactory();

const CUSTOMERS = [
  { name: 'أحمد محمد', phone: '01000000001', total: 1000, paid: 0 },
  { name: 'حسن سمير', phone: '01000000002', total: 2000, paid: 500 }
];
const SUPPLIERS = [{ name: 'مورد أول', tx: [] }];

function boot(seed, opts) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(String(e && e.message))) errors.push(String(e && e.message)); });
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (!(opts && opts.noIDB)) window.indexedDB = idbFactory;
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      window.HTMLAnchorElement.prototype.click = function () {};
      window.URL.createObjectURL = function () { return 'blob:test'; };
      window.URL.revokeObjectURL = function () {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ ok: false, exists: false }), status: 404 });
      /* نطلب تخزين دائم — نتأكد إن النداء مش بيكسر حاجة */
      if (window.navigator && !window.navigator.storage) {
        try {
          Object.defineProperty(window.navigator, 'storage', {
            value: {
              persisted: () => Promise.resolve(false),
              persist: () => { window.__persistAsked = true; return Promise.resolve(true); }
            },
            configurable: true
          });
        } catch (e) {}
      }
      Object.keys(seed || {}).forEach((k) => window.localStorage.setItem(k, seed[k]));
    }
  });
  return { dom, window: dom.window, errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (win, k) => { try { return JSON.parse(win.localStorage.getItem(k)); } catch (e) { return null; } };

(async function main() {
  console.log('\n[1] تشغيل أول — البيانات بتتحفظ في النسخة الداخلية');
  const first = boot({
    app_customers: JSON.stringify(CUSTOMERS),
    app_suppliers: JSON.stringify(SUPPLIERS),
    app_password: '2468'
  });
  await wait(600);
  ok('طلب التخزين الدائم اتنادى', first.window.__persistAsked === true);
  ok('النسخة الداخلية اتعملت من غير أخطاء', first.errors.length === 0, first.errors);
  const mirror = await new Promise((resolve) => {
    const r = first.window.indexedDB.open('nizam_data_mirror', 1);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction('snapshots', 'readonly');
      const q = tx.objectStore('snapshots').get('latest');
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    };
    r.onerror = () => resolve(null);
  });
  ok('فيه نسخة داخلية محفوظة', !!mirror && !!mirror.sections, mirror && Object.keys(mirror.sections || {}));
  ok('النسخة فيها العملاء (٢)', mirror && JSON.parse(mirror.sections.app_customers || '[]').length === 2);
  first.window.close();
  await wait(100);

  console.log('\n[2] تشغيل تاني بعد ما localStorage ضاع/بقى فاضي');
  const second = boot({ app_customers: '[]', app_password: '2468' });
  await wait(700);
  const healed = parse(second.window, 'app_customers') || [];
  ok('العملاء اترجعوا تلقائيًا من النسخة الداخلية', healed.length === 2, healed.length);
  ok('اسم أول عميل صح', healed[0] && healed[0].name === CUSTOMERS[0].name);
  ok('قسم تاني اترجع كمان', (parse(second.window, 'app_suppliers') || []).length === 1);
  ok('مفيش أخطاء JS في الاسترجاع', second.errors.length === 0, second.errors);
  second.window.close();
  await wait(100);

  console.log('\n[3] زر «استرجاع من النسخة الداخلية»');
  const third = boot({ app_customers: '[]', app_suppliers: '[]', app_password: '2468' }, {});
  await wait(700);
  const settingsBtn = third.window.document.querySelector('[data-go="settings"]');
  if (settingsBtn) settingsBtn.click();
  await wait(200);
  const btn = third.window.document.querySelector('[data-mirror-restore]');
  ok('زر الاسترجاع موجود في «سلامة البيانات»', !!btn);
  ok('نص حالة النسخة الداخلية ظاهر', String(third.window.document.getElementById('mirrorState').textContent || '').indexOf('IndexedDB') > -1,
    third.window.document.getElementById('mirrorState').textContent);
  if (btn) {
    btn.click();
    await wait(400);
    ok('الضغط بيرجّع العملاء', (parse(third.window, 'app_customers') || []).length === 2);
  }
  ok('مفيش أخطاء JS في اللوحة', third.errors.length === 0, third.errors);
  third.window.close();

  console.log('\n[4] متصفح بدون IndexedDB — ما بيكسرش التطبيق');
  const fourth = boot({ app_customers: JSON.stringify(CUSTOMERS) }, { noIDB: true });
  await wait(400);
  ok('البيانات ظاهرة عادي', (parse(fourth.window, 'app_customers') || []).length === 2);
  ok('مفيش أخطاء JS', fourth.errors.length === 0, fourth.errors);
  fourth.window.close();

  console.log('\nالنتيجة: ' + pass + ' ناجح، ' + fail + ' فاشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('انهيار الاختبار:', e && e.stack ? e.stack : e);
  process.exit(1);
});
