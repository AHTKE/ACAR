/* ============================================================
   desktop/server.js — خادم النسخة المكتبية (Portable)
   ------------------------------------------------------------
   • يقدّم ملفات dist/ على 127.0.0.1 فقط (محلي بلا إنترنت)
   • الحفظ في قاعدة بيانات SQLite (ملف data/nizam.db) بدل
     الاعتماد على localStorage وحدها — يعني البيانات بتفضل
     موجودة حتى لو اتمسح كاش المتصفح أو اتغيّر المتصفح.
   • /local/boot.js   ← يحمّل البيانات من SQLite قبل تشغيل التطبيق
                        ويعرّف خطّاف يرسل أي تعديل فوراً للقاعدة
   • /local/kv        ← حفظ/حذف مفتاح واحد
   • /local/status    ← حالة القاعدة (عدد المفاتيح + الحجم)
   • /local/nizam.db  ← نسخة من ملف القاعدة للتنزيل الاحتياطي
   • /api/*           ← يُمرَّر لخادم Vercel/الويب لو NIZAM_API_BASE مضبوط
                        (عشان ربط Google Drive والمزامنة يشتغلوا)
   التشغيل: node desktop/server.js   ثم افتح http://127.0.0.1:4568
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

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
const API_BASE = String(process.env.NIZAM_API_BASE || '').replace(/\/+$/, '');

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

function openDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('CREATE TABLE IF NOT EXISTS kv (' +
    'key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS meta (' +
    'key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('opened_at', new Date().toISOString());
  return db;
}

function loadAll() {
  const out = {};
  const rows = openDb().prepare('SELECT key, value FROM kv').all();
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function putKey(key, value) {
  const d = openDb();
  if (value === null || value === undefined) {
    d.prepare('DELETE FROM kv WHERE key = ?').run(key);
  } else {
    d.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)')
      .run(key, String(value), new Date().toISOString());
  }
}

function dbStats() {
  const d = openDb();
  const n = Number(d.prepare('SELECT COUNT(*) AS c FROM kv').get().c || 0);
  let bytes = 0;
  try { bytes = fs.statSync(DB_FILE).size; } catch (e) {}
  return { keys: n, bytes: bytes, file: DB_FILE };
}

/* جافاسكربت يُحقن قبل app.js: يزرع البيانات من SQLite ثم يعرّف خطّاف المزامنة */
function bootJs() {
  const data = JSON.stringify(loadAll());
  return '/* نسخة مكتبية — تحميل البيانات من SQLite قبل تشغيل التطبيق */\n' +
    '(function () {\n' +
    '  var DATA = ' + data + ';\n' +
    '  var ls = window.localStorage;\n' +
    '  try {\n' +
    '    for (var k in DATA) {\n' +
    '      if (Object.prototype.hasOwnProperty.call(DATA, k)) ls.setItem(k, DATA[k]);\n' +
    '    }\n' +
    '  } catch (e) {}\n' +
    '  if (window.__NIZAM_MIRROR__) return;\n' +
    '  var origSet = Storage.prototype.setItem;\n' +
    '  var origDel = Storage.prototype.removeItem;\n' +
    '  function push(key, value) {\n' +
    '    try {\n' +
    "      fetch('/local/kv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, " +
    'keepalive: true, body: JSON.stringify({ key: key, value: value }) });\n' +
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
  const u = new URL(API_BASE + targetPath);
  const opts = {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: u.host })
  };
  delete opts.headers['accept-encoding'];
  const pre = (u.protocol === 'https:' ? require('https') : http).request(opts, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  pre.on('error', () => json(res, 502, { ok: false, error: 'تعذّر الوصول لخادم الويب' }));
  if (req.method === 'GET' || req.method === 'HEAD') pre.end();
  else req.pipe(pre);
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
      const buf = fs.readFileSync(DB_FILE);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="nizam-backup.db"',
        'Content-Length': String(buf.length)
      });
      res.end(buf);
    } catch (e) { json(res, 404, { ok: false, error: 'قاعدة البيانات غير موجودة بعد' }); }
    return;
  }
  if (pathname === '/local/kv' && req.method === 'POST') {
    const raw = await readBody(req, 2 * 1024 * 1024);
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
      resolve({ server: server, port: server.address().port, db: DB_FILE });
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

module.exports = { start, stop, loadAll, putKey, dbStats, bootJs, DB_FILE, DIST };

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
