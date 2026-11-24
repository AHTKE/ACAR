/* ============================================================
   desktop-data-loss-test.js — اختبار فقدان البيانات في الديسكتوب
   ------------------------------------------------------------
   بيتأكد من طبقة الحفظ نفسها (من غير Electron):
   ١) البيانات بتفضل بعد إعادة تشغيل الخادم.
   ٢) تعديل سجل موجود (نفس العدد) على الجهاز ما بيتمسحش لو القاعدة
      أقدم منه — كانت الحالة دي بتضيع لأن الحماية كانت بالعدد بس.
   ٣) لو القاعدة أحدث، بياناتها هي اللي تتحمّل.
   ٤) لو localStorage فاضي (بروفايل جديد) البيانات تتحمّل من القاعدة.
   ٥) نسخة preopen اليومية بتتعمل قبل الفتح (نقطة رجوع).
   ٦) ترحيل تلقائي من مجلد إصدار قديم (اسم تطبيق مختلف).
   التشغيل: node desktop-data-loss-test.js
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-desk-loss-'));
const DATA_DIR = path.join(TMP, 'data');
const LEGACY = path.join(TMP, 'legacy-data');
fs.mkdirSync(LEGACY, { recursive: true });

const CUSTOMERS = [
  { name: 'أحمد محمد', phone: '01000000001', total: 1000, paid: 0 }
];
const SUPPLIERS = [{ name: 'مورد أول', tx: [] }];

/* مجلد قديم فيه بيانات فعلية — بيتحاكى تغيّر اسم التطبيق */
fs.writeFileSync(path.join(LEGACY, 'nizam-store.json'), JSON.stringify({
  version: 1,
  kv: {
    app_customers: JSON.stringify(CUSTOMERS),
    app_suppliers: JSON.stringify(SUPPLIERS)
  },
  at: { app_customers: Date.now() - 5000, app_suppliers: Date.now() - 5000 }
}));

process.env.NIZAM_DATA_DIR = DATA_DIR;
process.env.NIZAM_LEGACY_DATA_DIRS = LEGACY;
process.env.NIZAM_STORE = 'json';

const server = require('./desktop/server');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
};

function post(port, p, obj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(obj);
    const r = http.request({
      host: '127.0.0.1', port, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.write(body); r.end();
  });
}
function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}

/* تشغيل boot.js في بيئة مزيفة بنفس واجهة المتصفح */
function runBoot(js, store, seedAt) {
  const pushed = [];
  class FakeStorage {
    constructor(init) { this.map = Object.assign({}, init || {}); }
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null; }
    setItem(k, v) { this.map[k] = String(v); }
    removeItem(k) { delete this.map[k]; }
    get length() { return Object.keys(this.map).length; }
    key(i) { return Object.keys(this.map)[i]; }
  }
  const storage = new FakeStorage(store);
  const win = { localStorage: storage };
  win.window = win;
  const ctx = {
    window: win, localStorage: storage, Storage: FakeStorage, console, JSON, Object, Array, Date, Math, String, Number,
    setTimeout,
    fetch: (u, o) => { pushed.push(JSON.parse((o && o.body) || '{}')); return Promise.resolve({ ok: true, status: 200 }); }
  };
  vm.runInNewContext(js, ctx);
  return { storage: storage, pushed: pushed };
}

(async function main() {
  console.log('\n[1] ترحيل بيانات من مجلد إصدار قديم');
  ok('المجلد الجديد اتعمل', fs.existsSync(DATA_DIR));
  ok('ملف البيانات اترحّل', fs.existsSync(path.join(DATA_DIR, 'nizam-store.json')));
  const migrated = server.loadAll();
  ok('العملاء موجودين بعد الترحيل', JSON.parse(migrated.app_customers || '[]').length === 1);
  ok('الموردون موجودين بعد الترحيل', JSON.parse(migrated.app_suppliers || '[]').length === 1);

  console.log('\n[2] نسخة preopen عند الفتح');
  const preopen = fs.readdirSync(DATA_DIR).filter((f) => /^nizam-store\.json\.preopen-\d{4}-\d{2}-\d{2}$/.test(f));
  ok('نسخة preopen اتعملت', preopen.length === 1, preopen);
  ok('/local/status بيوريها', server.dbStats().preopen === 1, server.dbStats().preopen);
  ok('المصدر مذكور في الحالة', String(server.dbStats().migratedFrom || '').indexOf('legacy-data') > -1, server.dbStats().migratedFrom);

  console.log('\n[3] تعديل سجل موجود (نفس العدد) — القاعدة أقدم');
  const info = await server.start(0);
  const port = info.port;

  /* القاعدة فيها عميل واحد قديم */
  let r = await post(port, '/local/kv', { key: 'app_customers', value: JSON.stringify(CUSTOMERS) });
  ok('كتابة القاعدة نجحت', r.status === 200);

  const dbTimes = server.loadAllWithTimes().at;
  const edited = [{ name: 'أحمد محمد (اسم معدّل)', phone: '01000000001', total: 5000, paid: 900 }];
  const localNewer = {
    app_customers: JSON.stringify(edited),
    app_kv_at: JSON.stringify({ app_customers: Number(dbTimes.app_customers || Date.now()) + 60 * 1000 })
  };
  const boot = await get(port, '/local/boot.js');
  ok('boot.js بيرجّع سكريبت', boot.status === 200 && boot.body.length > 100);
  ok('boot.js فيه مقارنة بالوقت', boot.body.indexOf('localAt > dbAt') > -1);

  const run1 = runBoot(boot.body, localNewer);
  const afterBoot = JSON.parse(run1.storage.getItem('app_customers') || '[]');
  ok('التعديل الأحدث ما اتمسحش', afterBoot[0] && afterBoot[0].name === edited[0].name, afterBoot);
  ok('التعديل اترجع للقاعدة (push)', run1.pushed.some((p) => p.key === 'app_customers' && p.value.indexOf('اسم معدّل') > -1), run1.pushed);

  console.log('\n[4] القاعدة أحدث → بياناتها هي اللي تتحمّل');
  await post(port, '/local/kv', { key: 'app_customers', value: JSON.stringify([{ name: 'عميل من القاعدة' }]) });
  const boot2 = await get(port, '/local/boot.js');
  const run2 = runBoot(boot2.body, {
    app_customers: JSON.stringify([{ name: 'نسخة قديمة على الجهاز' }]),
    app_kv_at: JSON.stringify({ app_customers: 1000 })
  });
  const seeded = JSON.parse(run2.storage.getItem('app_customers') || '[]');
  ok('اتحمّلت نسخة القاعدة', seeded[0] && seeded[0].name === 'عميل من القاعدة', seeded);

  console.log('\n[5] localStorage فاضي (بروفايل جديد)');
  const boot3 = await get(port, '/local/boot.js');
  const run3 = runBoot(boot3.body, {});
  const fresh = JSON.parse(run3.storage.getItem('app_customers') || '[]');
  ok('البيانات اتحمّلت من القاعدة', fresh[0] && fresh[0].name === 'عميل من القاعدة', fresh);
  ok('الموردون اتحمّلوا', (JSON.parse(run3.storage.getItem('app_suppliers') || '[]')).length === 1);

  console.log('\n[6] البيانات بتفضل بعد إعادة تشغيل الخادم');
  await server.stop();
  const again = await server.start(0);
  r = await get(again.port, '/local/kv');
  const persisted = JSON.parse(r.body || '{}').data || {};
  ok('القاعدة رجعت بنفس البيانات', JSON.parse(persisted.app_customers || '[]')[0].name === 'عميل من القاعدة', persisted.app_customers);
  ok('ملف البيانات لسه موجود', fs.existsSync(path.join(DATA_DIR, 'nizam-store.json')));

  console.log('\n[7] نسخة احتياطية سليمة موجودة');
  ok('nizam-store.backup.json موجود', fs.existsSync(path.join(DATA_DIR, 'nizam-store.backup.json')));

  await server.stop();

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('CRASH', e && e.stack ? e.stack : e);
  process.exit(1);
});
