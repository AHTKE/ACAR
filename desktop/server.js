/* ============================================================
   desktop/server.js — خادم النسخة المكتبية (Portable)
   ------------------------------------------------------------
   • يقدّم ملفات dist/ على 127.0.0.1 فقط (محلي بلا إنترنت)
   • الحفظ في قاعدة بيانات محلية (ملف data/nizam.db، ولو Node
     اللي جوه Electron مافيهاش node:sqlite نستخدم data/nizam-store.json)
     بدل
     الاعتماد على localStorage وحدها — يعني البيانات بتفضل
     موجودة حتى لو اتمسح كاش المتصفح أو اتغيّر المتصفح.
   • /local/boot.js   ← يحمّل البيانات من SQLite قبل تشغيل التطبيق
                        ويعرّف خطّاف يرسل أي تعديل فوراً للقاعدة
   • /local/kv        ← حفظ/حذف مفتاح واحد
   • /local/status    ← حالة القاعدة (عدد المفاتيح + الحجم)
   • /local/nizam.db  ← نسخة من ملف القاعدة للتنزيل الاحتياطي
   • /api/*           ← ربط Google محلي، وباقي المسارات (المزامنة)
                        تُمرَّر لـ NIZAM_API_BASE لو مضبوط
   التشغيل: node desktop/server.js   ثم افتح http://127.0.0.1:4568
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const createGoogle = require('./google');
const createSync = require('./sync');
/* node:sqlite موجودة في Node 22.5+ (زي ما بيشتغل الخادم العادي)،
   لكن Electron 33 شايل Node 20 فمافيهاش الوحدة دي. بنتأكد من إصدار
   Node الأول قبل أي require عشان ما يطلعش خطأ ERR_UNKNOWN_BUILTIN_MODULE
   في سجل العملية الرئيسية، وبنستخدم مخزن JSON بنفس الواجهة. */
let DatabaseSync = null;
const NODE_MAJOR = Number(String(process.versions.node || '0').split('.')[0]) || 0;
if (NODE_MAJOR >= 22) {
  try { DatabaseSync = require('node:sqlite').DatabaseSync; } catch (e) { DatabaseSync = null; }
}

/* في التطوير: __dirname = desktop/ والملفات في ../dist
   في النسخة المجمّعة: __dirname = جذر التطبيق وفيه dist مباشرة */
const ROOT = fs.existsSync(path.join(__dirname, 'dist')) ? __dirname : path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function resolveDataDir() {
  if (process.env.NIZAM_DATA_DIR) return process.env.NIZAM_DATA_DIR;
  try {
    const el = require('electron');
    if (el && el.app && typeof el.app.getPath === 'function') {
      return path.join(el.app.getPath('userData'), 'data');
    }
  } catch (e) { /* نسخة عادية بلا Electron */ }
  return path.join(ROOT, 'data');
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'nizam.db');
const DEFAULT_PORT = Number(process.env.PORT || 4568);
/* خادم الويب اللي بيشغّل واجهات المزامنة. الربط بـGoogle بيتم محليًا
   في هذا الخادم، وأي NIZAM_API_BASE بيتغلّب على الافتراضي. */
const DEFAULT_API_BASE = 'https://workflow-amw-code.vercel.app';
const API_BASE = String(process.env.NIZAM_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

/* مفاتيح عميل Google الخاص بالديسكتوب. القراءة (شكل installed/web)
   والأولوية (متغيّر البيئة الصريح ثم الملف) في google-keys.js. */
const GOOGLE_CLIENT = require('./google-keys').runtimeKeys({ env: process.env });
let currentPort = 0;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

let db = null;

/* ---------- أدوات كتابة آمنة ضد انقطاع الكهرباء/الإغلاق المفاجئ ---------- */
function stamp() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* ملف مؤقت + fsync + إعادة تسمية: الملف الأصلي ما يتكتبش عليه
   نص ناقص لو الجهاز اتقفل في نص الكتابة. */
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text, null, 'utf8');
    try { fs.fsyncSync(fd); } catch (e) { /* مش مدعوم على كل الأنظمة */ }
  } finally {
    try { fs.closeSync(fd); } catch (e) {}
  }
  /* إعادة التسمية ممكن تفشل مؤقتًا على ويندوز لو مضاد الفيروسات فاتح الملف.
     بدون إعادة المحاولة كان التعديل يضيع في صمت. */
  for (let i = 0; i < 4; i++) {
    try { fs.renameSync(tmp, file); return true; }
    catch (e) {
      if (i < 3) {
        const until = Date.now() + 40;
        while (Date.now() < until) { /* انتظار قصير قبل المحاولة التالية */ }
        continue;
      }
      /* آخر محاولة: نكتب المحتوى مباشرة بدل ما نلغي الحفظ بالكامل */
      try {
        fs.writeFileSync(file, text);
        try { fs.unlinkSync(tmp); } catch (e2) {}
        return true;
      } catch (e3) { try { fs.unlinkSync(tmp); } catch (e2) {} throw e3; }
    }
  }
  return false;
}

/* نسخة احتياطية من قاعدة SQLite مرة كل ١٢ ساعة (لو الملف موجود وسليم) */
function backupSqlite() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    if (!fs.statSync(DB_FILE).size) return;
    const bak = DB_FILE + '.bak';
    let bt = 0;
    try { bt = fs.statSync(bak).mtimeMs; } catch (e) { bt = 0; }
    if (Date.now() - bt > 12 * 3600 * 1000) fs.copyFileSync(DB_FILE, bak);
  } catch (e) { /* النسخة الاحتياطية اختيارية */ }
}

function openDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const wantsJson = String(process.env.NIZAM_STORE || '').toLowerCase() === 'json';
  if (wantsJson || !DatabaseSync) {
    db = makeJsonStore();
  } else {
    try { db = makeSqliteStore(); }
    catch (e) {
      /* قاعدة تالفة → نحتفظ بيها للتحليل ونكمّل بمخزن JSON
         بدل ما التطبيق يفتح فاضي أو ما يفتحش خالص. */
      console.error('تعذّر فتح قاعدة SQLite (' + (e && e.message) + ') — هنستخدم مخزن JSON');
      db = makeJsonStore();
    }
  }
  return db;
}

/* مخزن SQLite — الواجهة الوحيدة اللي بقية الملف بيستعملها */
function makeSqliteStore() {
  backupSqlite();
  const d = new DatabaseSync(DB_FILE);
  d.exec('CREATE TABLE IF NOT EXISTS kv (' +
    'key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  d.exec('CREATE TABLE IF NOT EXISTS meta (' +
    'key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  d.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('opened_at', new Date().toISOString());
  return {
    engine: 'sqlite',
    file: DB_FILE,
    loadAll: function () {
      const out = {};
      const rows = d.prepare('SELECT key, value FROM kv').all();
      for (const r of rows) out[r.key] = r.value;
      return out;
    },
    putKey: function (key, value) {
      if (value === null || value === undefined) {
        d.prepare('DELETE FROM kv WHERE key = ?').run(key);
      } else {
        d.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)')
          .run(key, String(value), new Date().toISOString());
      }
    },
    count: function () {
      return Number(d.prepare('SELECT COUNT(*) AS c FROM kv').get().c || 0);
    },
    close: function () { try { d.close(); } catch (e) {} },
    info: function () {
      return {
        engine: 'sqlite', backup: fs.existsSync(DB_FILE + '.bak'),
        recovered: '', corrupt: ''
      };
    }
  };
}

/* مخزن JSON بديل — نفس الواجهة، ملف واحد في مجلد البيانات.
   الحمايات:
   1) كتابة ذرّية (tmp + fsync + rename) فمايبقاش فيه ملف نص-نص.
   2) نسخة احتياطية دورية nizam-store.backup.json.
   3) لو الملف اتلف أو بقى فاضي (انقطاع كهرباء / إغلاق مفاجئ)
      ما نبدأش من الصفر في صمت: بنحتفظ بالملف التالف مع اسم
      واضح ونرجّع النسخة الاحتياطية — ده اللي كان بيخلي كل بيانات
      العميل تختفي مرة واحدة وتتحفظ فوقيها نسخة فاضية. */
function makeJsonStore() {
  const FILE = path.join(DATA_DIR, 'nizam-store.json');
  const BAK = path.join(DATA_DIR, 'nizam-store.backup.json');
  const state = { recovered: '', corrupt: '', backupAt: '' };
  let data = null;
  let lastBak = 0;

  function parseText(text) {
    if (!text || !String(text).trim()) return null;
    try {
      const o = JSON.parse(text);
      if (!o || typeof o !== 'object' || !o.kv || typeof o.kv !== 'object') return null;
      return o;
    } catch (e) { return null; }
  }
  function parseFile(file) {
    try { return parseText(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  }

  function read() {
    if (data) return data;
    const exists = fs.existsSync(FILE);
    data = parseFile(FILE);
    /* أول مرة نلاقي ملف سليم ومفيش نسخة احتياطية → نعمل واحدة فورًا،
       عشان يبقى فيه دايمًا نقطة رجوع لو الملف اتلف بعد كده. */
    if (data) {
      try {
        if (!fs.existsSync(BAK) && fs.statSync(FILE).size) {
          writeAtomic(BAK, fs.readFileSync(FILE, 'utf8'));
          state.backupAt = new Date().toISOString();
          lastBak = Date.now();
        }
      } catch (e) { /* اختياري */ }
    }
    if (!data) {
      if (exists) {
        let keep = FILE + '.corrupt-' + stamp() + '.json';
        for (let n = 1; fs.existsSync(keep) && n < 20; n++) {
          keep = FILE + '.corrupt-' + stamp() + '-' + n + '.json';
        }
        try { fs.renameSync(FILE, keep); state.corrupt = keep; } catch (e) { state.corrupt = ''; }
      }
      const bak = parseFile(BAK);
      if (bak) {
        data = bak;
        state.recovered = 'backup';
        try { writeAtomic(FILE, JSON.stringify(bak)); } catch (e) {}
      } else {
        data = { version: 1, kv: {} };
        if (exists) state.recovered = 'empty';
      }
    }
    return data;
  }

  function flush() {
    const d = read();
    /* نسخة احتياطية من الملف الحالي قبل ما نكتب فوقه (مرة كل دقيقة) */
    try {
      if (Date.now() - lastBak > 60 * 1000 && fs.existsSync(FILE) && fs.statSync(FILE).size) {
        const cur = fs.readFileSync(FILE, 'utf8');
        if (parseText(cur)) {
          writeAtomic(BAK, cur);
          lastBak = Date.now();
          state.backupAt = new Date().toISOString();
        }
      }
    } catch (e) { /* النسخة الاحتياطية ما تمنعش الحفظ الأساسي */ }
    const text = JSON.stringify(d);
    writeAtomic(FILE, text);
    /* أول كتابة: نعمل النسخة الاحتياطية من نفس المحتوى السليم */
    try {
      if (!fs.existsSync(BAK)) {
        writeAtomic(BAK, text);
        lastBak = Date.now();
        state.backupAt = new Date().toISOString();
      }
    } catch (e) {}
    return true;
  }

  return {
    engine: 'json',
    file: FILE,
    loadAll: function () { return Object.assign({}, read().kv); },
    putKey: function (key, value) {
      const d = read();
      if (value === null || value === undefined) delete d.kv[key];
      else d.kv[key] = String(value);
      flush();
    },
    count: function () { return Object.keys(read().kv).length; },
    close: function () {},
    info: function () {
      read();
      return {
        engine: 'json', backup: fs.existsSync(BAK), backupFile: BAK,
        recovered: state.recovered, corrupt: state.corrupt, backupAt: state.backupAt
      };
    }
  };
}

function loadAll() {
  return openDb().loadAll();
}

function putKey(key, value) {
  openDb().putKey(key, value === null || value === undefined ? null : String(value));
}

function dbStats() {
  const d = openDb();
  let bytes = 0;
  try { bytes = fs.statSync(d.file).size; } catch (e) {}
  let extra = {};
  try { if (typeof d.info === 'function') extra = d.info(); } catch (e) {}
  return Object.assign({ keys: d.count(), bytes: bytes, file: d.file, dir: DATA_DIR, engine: d.engine }, extra);
}

/* هل القيمة دي "فاضية"؟ (مفتاح مش موجود / مصفوفة فاضية / كائن فاضي) */
function isEmptyValue(v) {
  if (v === null || v === undefined || v === '') return true;
  try {
    const p = JSON.parse(v);
    if (Array.isArray(p)) return p.length === 0;
    if (p !== null && typeof p === 'object') return Object.keys(p).length === 0;
    return false;
  } catch (e) { return false; }
}

/* استرجاع غير مدمّر: بيملا الأقسام الفاضية/المفقودة من النسخ
   الاحتياطية (backup + أي ملف تالف محفوظ) وما يمسحش أي حاجة موجودة. */
function recoverFromBackups() {
  const store = openDb();
  const current = store.loadAll();
  const files = [path.join(DATA_DIR, 'nizam-store.backup.json')];
  try {
    fs.readdirSync(DATA_DIR)
      .filter(function (f) { return /\.corrupt-\d{8}-\d{6}\.json$/.test(f); })
      .sort().reverse()
      .forEach(function (f) { files.push(path.join(DATA_DIR, f)); });
  } catch (e) {}

  const restored = [];
  files.forEach(function (file) {
    let doc = null;
    try {
      const text = fs.readFileSync(file, 'utf8');
      doc = JSON.parse(text);
    } catch (e) { doc = null; }
    if (!doc || typeof doc !== 'object' || !doc.kv || typeof doc.kv !== 'object') return;
    Object.keys(doc.kv).forEach(function (k) {
      const cur = Object.prototype.hasOwnProperty.call(current, k) ? current[k] : null;
      if (!isEmptyValue(cur)) return;                 /* موجود وسليم → ما نلمسوش */
      if (isEmptyValue(doc.kv[k])) return;            /* النسخة نفسها فاضية */
      try { store.putKey(k, doc.kv[k]); current[k] = doc.kv[k]; restored.push(k); } catch (e) {}
    });
  });
  return { restored: restored.length, keys: restored };
}

/* جافاسكربت يُحقن قبل app.js: يزرع البيانات من SQLite ثم يعرّف خطّاف المزامنة */
function bootJs() {
  const data = JSON.stringify(loadAll());
  return '/* نسخة مكتبية — تحميل البيانات من قاعدة البيانات المحلية قبل تشغيل التطبيق */\n' +
    '(function () {\n' +
    '  var DATA = ' + data + ';\n' +
    '  var ls = window.localStorage;\n' +
    '  var keep = [];\n' +
    '  function count(v) {\n' +
    '    try { var p = JSON.parse(v); if (Array.isArray(p)) return p.length;\n' +
    '      if (p && typeof p === "object") return Object.keys(p).length; return 1; } catch (e) { return 0; }\n' +
    '  }\n' +
    '  try {\n' +
    '    for (var k in DATA) {\n' +
    '      if (!Object.prototype.hasOwnProperty.call(DATA, k)) continue;\n' +
    '      var cur = null;\n' +
    '      try { cur = ls.getItem(k); } catch (e) { cur = null; }\n' +
    '      /* القاعدة أقدم من اللي على الجهاز (كتابة فاتت قبل الإغلاق)؟ ما نكتبش\n' +
    '         فوقه — ده اللي كان بيرجّع بيانات ناقصة بعد كل إعادة تشغيل. */\n' +
    '      if (cur && cur !== DATA[k] && count(cur) > count(DATA[k])) { keep.push(k); continue; }\n' +
    '      ls.setItem(k, DATA[k]);\n' +
    '    }\n' +
    '  } catch (e) {}\n' +
    '  if (window.__NIZAM_MIRROR__) return;\n' +
    '  var origSet = Storage.prototype.setItem;\n' +
    '  var origDel = Storage.prototype.removeItem;\n' +
    '  function push(key, value, tries) {\n' +
    '    tries = tries || 0;\n' +
    '    try {\n' +
    "      fetch('/local/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, " +
    'keepalive: true, body: JSON.stringify({ key: key, value: value }) }).then(function (r) {\n' +
    '        if (r && r.ok) { window.__NIZAM_MIRROR_ERR__ = \'\'; return; }\n' +
    '        throw new Error(\'kv \' + (r && r.status));\n' +
    '      }).catch(function () {\n' +
    '        /* إعادة المحاولة ضرورية: من غيرها أي فشل شبكة/حجم كان بيسيب\n' +
    '           القاعدة أقدم من البيانات فتختفي آخر الإضافات بعد إعادة التشغيل. */\n' +
    '        if (tries < 4) setTimeout(function () { push(key, value, tries + 1); }, 600 * (tries + 1));\n' +
    '        else window.__NIZAM_MIRROR_ERR__ = String(key);\n' +
    '      });\n' +
    '    } catch (e) {}\n' +
    '  }\n' +
    '  Storage.prototype.setItem = function (k, v) {\n' +
    '    var r = origSet.call(this, k, v);\n' +
    '    try { if (this === window.localStorage) push(k, String(v)); } catch (e) {}\n' +
    '    return r;\n' +
    '  };\n' +
    '  Storage.prototype.removeItem = function (k) {\n' +
    '    var r = origDel.call(this, k);\n' +
    '    try { if (this === window.localStorage) push(k, null); } catch (e) {}\n' +
    '    return r;\n' +
    '  };\n' +
    '  for (var i = 0; i < keep.length; i++) { try { push(keep[i], ls.getItem(keep[i])); } catch (e) {} }\n' +
    '  window.__NIZAM_MIRROR__ = true;\n' +
    '})();\n';
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/* تمرير /api/* لخادم الويب (اختياري) */
function proxyApi(req, res, targetPath) {
  const baseUrl = API_BASE;
  const path = targetPath;

  /* بنمرّر المسار كما هو، ومبنبعتش مفاتيح Google المحلية في هيدرز.
     ربط Google في الوضع المحلي بيتعمل داخل desktop/google.js،
     والموقع (لو اخترت وضع site) بيستخدم GOOGLE_CLIENT_ID/SECRET بتوعه. */
  const u = new URL(baseUrl + path);
  const headers = Object.assign({}, req.headers, { host: u.host });
  delete headers['accept-encoding'];
  delete headers['x-nizam-gid'];
  delete headers['x-nizam-gsecret'];
  const opts = {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method: req.method,
    headers: headers
  };
  const pre = (u.protocol === 'https:' ? require('https') : http).request(opts, (r) => {
    const h = Object.assign({}, r.headers);
    /* الكوكيز بتيجي Secure من الموقع، و127.0.0.1 على http لازم تتشال منها */
    if (h['set-cookie']) {
      h['set-cookie'] = [].concat(h['set-cookie']).map((c) => String(c).replace(/;\s*secure/ig, ''));
    }
    if (h.location && baseUrl && h.location.indexOf(baseUrl) === 0) {
      h.location = h.location.slice(baseUrl.length) || '/';
    }
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  pre.on('error', () => json(res, 502, { ok: false, error: 'تعذّر الوصول لخادم الويب' }));
  if (req.method === 'GET' || req.method === 'HEAD') pre.end();
  else req.pipe(pre);
}

/* ربط Google من داخل الديسكتوب: OAuth محلي وتخزين الرمز على الجهاز
   (مش كوكي متصفح) — عشان الربط يوصل للتطبيق فعلاً. */
const google = createGoogle({
  dataDir: DATA_DIR,
  json: json,
  readBody: readBody,
  getPort: function () { return currentPort; },
  client: function () { return GOOGLE_CLIENT; },
  siteBase: String(process.env.NIZAM_SITE_BASE || API_BASE).replace(/\/+$/, '')
});

/* المزامنة بتشتغل محليًا بتوكن Google المحلي — مش بتحويل للموقع (اللي كان
   بيرفضها 401 لعدم وجود جلسة موقع جوه التطبيق). */
const localSync = createSync({
  json: json,
  readBody: readBody,
  dataDir: DATA_DIR,
  accessToken: google.accessToken,
  readAuth: google.readAuth
});


/* صفحة تأكيد الربط اللي بتظهر في المتصفح بعد موافقة Google */
function linkedPage(email) {
  const safe = String(email || '').replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<title>تم ربط Google Drive</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0a0e15;color:#e8edf5;font-family:system-ui,"Segoe UI",Tahoma,sans-serif}' +
    '.card{max-width:520px;margin:24px;padding:28px 26px;border-radius:18px;background:#121926;' +
    'border:1px solid #23303f;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.45)}' +
    '.ok{font-size:44px;line-height:1}.card h1{font-size:22px;margin:10px 0 6px}' +
    '.card p{margin:6px 0;color:#a9b6c7;font-size:15px;line-height:1.8}' +
    '.mail{direction:ltr;color:#7fd1a7;font-weight:600}.btn{margin-top:18px;padding:10px 22px;' +
    'border-radius:12px;border:0;background:#2d7ff9;color:#fff;font-size:15px;cursor:pointer}' +
    '.hint{font-size:13px;color:#7d8b9c;margin-top:14px}</style></head><body><div class="card">' +
    '<div class="ok">✅</div><h1>تم ربط Google Drive بنجاح</h1>' +
    (safe ? '<p class="mail">' + safe + '</p>' : '') +
    '<p>ارجع لنافذة التطبيق — بتتحدّث لوحدها وتبدأ المزامنة.</p>' +
    '<button class="btn" onclick="window.close()">إغلاق الصفحة</button>' +
    '<p class="hint">لو الصفحة ما اتقفلتش، اقفل التبويب وارجع للتطبيق.</p>' +
    '</div></body></html>';
}

const server = http.createServer(async (req, res) => {
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { pathname = '/'; }

  /* ---------- مسارات القاعدة المحلية ---------- */
  if (pathname === '/local/boot.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(bootJs());
    return;
  }
  if (pathname === '/local/status') {
    try { json(res, 200, Object.assign({ ok: true }, dbStats())); }
    catch (e) { json(res, 500, { ok: false, error: String(e && e.message) }); }
    return;
  }
  if (pathname === '/local/nizam.db') {
    try {
      const buf = fs.readFileSync(openDb().file);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="nizam-backup.db"',
        'Content-Length': String(buf.length)
      });
      res.end(buf);
    } catch (e) { json(res, 404, { ok: false, error: 'قاعدة البيانات غير موجودة بعد' }); }
    return;
  }
  if (pathname === '/local/linked') {
    const email = String((new URL(req.url, 'http://localhost')).searchParams.get('email') || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(linkedPage(email));
    return;
  }
  if (pathname === '/local/recover' && req.method === 'POST') {
    try { json(res, 200, Object.assign({ ok: true }, recoverFromBackups())); }
    catch (e) { json(res, 500, { ok: false, error: String(e && e.message) }); }
    return;
  }
  /* كتابة كل المفاتيح مرة واحدة — بيستخدمها الإغلاق الآمن في main.js
     عشان أي كتابة لسه في الطريق ما تضيعش عند قفل النافذة. */
  if (pathname === '/local/kv-bulk' && req.method === 'POST') {
    const raw = await readBody(req, 32 * 1024 * 1024);
    if (!raw) { json(res, 413, { ok: false, error: 'جسم الطلب فارغ أو كبير' }); return; }
    let body = null;
    try { body = JSON.parse(raw); } catch (e) { body = null; }
    if (!body || typeof body !== 'object') { json(res, 400, { ok: false, error: 'JSON غير صالح' }); return; }
    let n = 0;
    try {
      Object.keys(body).forEach(function (k) {
        if (!k || k.length > 200) return;
        const v = body[k];
        putKey(k, (v === undefined || v === null) ? null : String(v));
        n++;
      });
      json(res, 200, { ok: true, keys: n });
    } catch (e) { json(res, 500, { ok: false, error: String(e && e.message) }); }
    return;
  }

  if (pathname === '/local/kv' && req.method === 'POST') {
    const raw = await readBody(req, 32 * 1024 * 1024);
    if (!raw) { json(res, 400, { ok: false, error: 'جسم الطلب فارغ أو كبير' }); return; }
    let body;
    try { body = JSON.parse(raw); } catch (e) { json(res, 400, { ok: false, error: 'JSON غير صالح' }); return; }
    const key = String(body && body.key || '').trim();
    if (!key || key.length > 200) { json(res, 400, { ok: false, error: 'مفتاح غير صالح' }); return; }
    try {
      putKey(key, body.value === undefined || body.value === null ? null : String(body.value));
      json(res, 200, { ok: true });
    } catch (e) { json(res, 500, { ok: false, error: String(e && e.message) }); }
    return;
  }
  if (pathname === '/local/kv' && req.method === 'GET') {
    try { json(res, 200, { ok: true, data: loadAll() }); }
    catch (e) { json(res, 500, { ok: false, error: String(e && e.message) }); }
    return;
  }

  /* ---------- Google Drive محليًا (بدون الاعتماد على الموقع) ---------- */
  if (pathname.indexOf('/api/google/') === 0) {
    try {
      if (await google.handle(req, res, pathname)) return;
    } catch (e) {
      if (!res.headersSent) json(res, 500, { ok: false, error: (e && e.message) || 'خطأ داخلي في ربط Google' });
      return;
    }
  }

  /* ---------- المزامنة المحلية (Google Drive بتوكن التطبيق) ---------- */
  if (pathname.indexOf('/api/sync/') === 0) {
    try {
      if (await localSync.handle(req, res, pathname)) return;
    } catch (e) {
      if (!res.headersSent) json(res, 500, { ok: false, error: (e && e.message) || 'خطأ داخلي في المزامنة' });
      return;
    }
  }

  /* ---------- مرَّر واجهات API لخادم الويب إن وُجد ---------- */
  if (pathname.indexOf('/api/') === 0) {
    if (API_BASE) { proxyApi(req, res, req.url); return; }
    json(res, 404, {
      ok: false,
      error: 'واجهة API غير متاحة في النسخة المكتبية — حدّد NIZAM_API_BASE لربط خادم الويب'
    });
    return;
  }

  /* ---------- الملفات الثابتة من dist ---------- */
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const isIndex = path.basename(file) === 'index.html';
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    if (!isIndex) { res.end(buf); return; }
    /* نحقن تحميل SQLite قبل سكربتات التطبيق (بدون تغيير ملفات الويب) */
    let html = buf.toString('utf8');
    /* بيئة موثوقة (جهاز المالك) = صلاحيات كاملة فوراً بدون أي طلب شبكة.
       نحقنها دائمًا: الصفحة نفسها بتشير للاسم في منطق الـgate، فوجود
       الاسم في النص مش معناه إنه متعرّف وقت التشغيل. */
    html = html.replace('<head>', '<head>\n  <script>window.APP_TRUSTED_RUNTIME = true;</script>');
    if (html.indexOf('/local/boot.js') < 0) {
      html = html.replace(/<script\s+src="export\.js"/,
        '<script src="/local/boot.js"></script>\n  <script src="export.js"');
    }
    res.end(html);
  });
});

function start(port) {
  const p = port === undefined ? DEFAULT_PORT : port;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, '127.0.0.1', () => {
      currentPort = server.address().port;
      resolve({ server: server, port: currentPort, db: openDb().file });
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    try { if (db) db.close(); } catch (e) {}
    db = null;
    server.close(() => resolve());
  });
}

module.exports = { start, stop, loadAll, putKey, dbStats, bootJs, DB_FILE, DIST, recoverFromBackups };

if (require.main === module) {
  start().then((info) => {
    console.log('✔ خادم النسخة المكتبية شغّال على http://127.0.0.1:' + info.port);
    console.log('✔ قاعدة البيانات: ' + info.db);
    console.log('اضغط Ctrl+C للإيقاف.');
  }).catch((e) => {
    console.error('فشل تشغيل الخادم:', e && e.message ? e.message : e);
    process.exit(1);
  });
}
