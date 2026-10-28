/* ============================================================
   vercel-api-test.mjs — اختبار مسار /api/* على Vercel
   بيحاكي Node req/res ويشغّل نفس handler اللي Vercel بيناديه،
   ويتأكد إن الواجهة هتاخد JSON سليم وإن الربط بيتخزن في الكوكي.
   التشغيل: node vercel-api-test.mjs
   ============================================================ */
import runHandler from './vercel-run.js';
import { createCookieDB } from './vercel-db.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

function makeReq({ url, method = 'GET', headers = {}, body }) {
  const h = Object.assign({ host: 'app.example.com' }, headers);
  let payload = null;
  if (body != null) {
    const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    if (!h['content-type']) h['content-type'] = 'application/json';
    h['content-length'] = String(buf.length);
    payload = buf;
  }
  const req = {
    method, headers: h, url,
    on(ev, cb) {
      if (ev === 'data') { if (payload) cb(payload); }
      if (ev === 'end') queueMicrotask(() => cb());
      if (ev === 'error') queueMicrotask(() => cb());
    }
  };
  if (payload) req.body = payload;
  return req;
}

function run(req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      ended: false,
      _buf: Buffer.alloc(0),
      end(chunk) {
        if (this.ended) return;
        this.ended = true;
        if (chunk) this._buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        resolve({ status: this.statusCode, headers: this.headers, body: this._buf.toString('utf8') });
      }
    };
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    const apiPath = String(req.url || '/').split('?')[0];
    Promise.resolve(runHandler(req, res, apiPath)).then(() => {
      if (!res.ended) { clearTimeout(timer); reject(new Error('لم يستجب')); }
    }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}

const json = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };
const cookiesOf = (r) => {
  const c = r.headers['set-cookie'];
  if (!c) return [];
  return Array.isArray(c) ? c : [c];
};
const cookieJarHeader = (list) => list.map((c) => String(c).split(';')[0]).join('; ');

console.log('\n[V1] بدون متغيّرات البيئة');
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
let r = await run(makeReq({ url: '/api/google/status' }));
let j = json(r);
ok('status يرجّع 200 و JSON', r.status === 200 && !!j, r.status + ' ' + r.body.slice(0, 80));
ok('configured=false من السيرفر (مش من الواجهة)', j && j.configured === false, JSON.stringify(j));
ok('Content-Type JSON', String(r.headers['content-type']).indexOf('json') > -1, r.headers['content-type']);

console.log('\n[V2] بالمفتاحين المضبوطين');
process.env.GOOGLE_CLIENT_ID = 'cid-test';
process.env.GOOGLE_CLIENT_SECRET = 'csec-test';
r = await run(makeReq({ url: '/api/google/status' }));
j = json(r);
ok('configured=true', j && j.configured === true, JSON.stringify(j));
ok('connected=false من غير كوكي', j && j.connected === false, JSON.stringify(j));

console.log('\n[V3] مسار login → توجيه لـ Google');
r = await run(makeReq({ url: '/api/google/login' }));
ok('302 Redirect', r.status === 302, 'status=' + r.status);
const loc = r.headers.location || '';
ok('المسار لـ accounts.google.com', loc.indexOf('https://accounts.google.com/o/oauth2/v2/auth') === 0, loc.slice(0, 60));
ok('فيه client_id', loc.indexOf('client_id=cid-test') > -1, loc);
ok('redirect_uri على نفس الدومين',
   loc.indexOf(encodeURIComponent('https://app.example.com/api/google/callback')) > -1, loc);
ok('كوكي gstate اتحط', cookiesOf(r).join(' ').indexOf('gstate=') > -1, cookiesOf(r).join('|'));

console.log('\n[V4] مسار خاطئ → 404 JSON (مش صفحة HTML)');
r = await run(makeReq({ url: '/api/google/nope' }));
j = json(r);
ok('404 و JSON', r.status === 404 && !!j, r.status + ' ' + r.body.slice(0, 60));
r = await run(makeReq({ url: '/index.html' }));
ok('مسار خارج /api ما يوصلش للـAPI (Vercel بيخدم الملفات الثابتة قبل الـfunctions)', r.status === 404, String(r.status));

console.log('\n[V4ب] ملفات api/ كلها محمّلة ومسجّلة كـfunctions');
const apiFiles = fs.readdirSync('api/google').map((f) => ['api/google/' + f, '/api/google/' + f.replace(/\.js$/, '')])
  .concat(fs.readdirSync('api/sync').map((f) => ['api/sync/' + f, '/api/sync/' + f.replace(/\.js$/, '')]));
for (const [file, apiPath] of apiFiles) {
  const mod = await import('./' + file);
  ok(file + ' بيوصّل على default function', typeof mod.default === 'function', typeof mod.default);
  ok(file + ' بياخد مساره من الملف نفسه',
     fs.readFileSync(file, 'utf8').indexOf(JSON.stringify(apiPath)) > -1, apiPath);
}
/* اختبار فعلي لملف route مشترك: نفس status.js اللي Vercel بيناديه */
const statusMod = await import('./api/google/status.js');
r = await new Promise((resolve, reject) => {
  const req = makeReq({ url: '/api/google/status' });
  const res = {
    statusCode: 200, headers: {}, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    ended: false, _b: '',
    end(c) { this.ended = true; this._b = c ? String(c) : ''; resolve({ status: this.statusCode, headers: this.headers, body: this._b }); }
  };
  Promise.resolve(statusMod.default(req, res)).catch(reject);
  setTimeout(() => reject(new Error('timeout route')), 5000);
});
j = json(r);
ok('api/google/status.js يرجّع configured=true بالمفاتيح', r.status === 200 && j && j.configured === true, r.body.slice(0, 80));

console.log('\n[V5] تخزين الربط في الكوكي (الـD1 shim)');
const cdb = createCookieDB('');
ok('exec لبناء المخطط ما يرميش خطأ', await cdb.db.exec('CREATE TABLE IF NOT EXISTS google_connections (id INTEGER)') !== undefined);
await cdb.db.prepare('INSERT INTO google_connections (client_token, refresh_token, email) VALUES (?, ?, ?)')
  .bind('tok-abc', 'rt-xyz', 'owner@gmail.com').run();
const setCookie = cdb.pendingCookie();
ok('كوكي الاتصال اتكتب بعد الكتابة', typeof setCookie === 'string' && setCookie.indexOf('vcdb=') === 0, String(setCookie).slice(0, 60));
ok('الكوكي HttpOnly و Secure', /HttpOnly/.test(setCookie) && /Secure/.test(setCookie), setCookie);
const row = await cdb.db.prepare('SELECT * FROM google_connections WHERE client_token = ?').bind('tok-abc').first();
ok('قراءة السطر نجحت', row && row.refresh_token === 'rt-xyz' && row.email === 'owner@gmail.com', JSON.stringify(row));
await cdb.db.prepare('INSERT INTO google_settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
  .bind('sync_custom_folder', 'FOLDER123').run();
const s = await cdb.db.prepare('SELECT v FROM google_settings WHERE k = ?').bind('sync_custom_folder').first();
ok('الإعدادات اتحفظت واتقرت', s && s.v === 'FOLDER123', JSON.stringify(s));
ok('مفيش كوكي جديد لو مفيش كتابة', createCookieDB('x=1').pendingCookie() === null, 'dirty check');

console.log('\n[V6] الربط بيتقرأ من الكوكي عبر الـWorker نفسه');
const connCookie = 'gconn=tok-abc; ' + 'vcdb=' + encodeURIComponent(JSON.stringify({
  c: [{ t: 'tok-abc', r: 'rt-xyz', e: 'owner@gmail.com', u: 1 }],
  s: { sync_custom_folder: 'FOLDER123' }
}));
r = await run(makeReq({ url: '/api/google/status', headers: { cookie: connCookie } }));
j = json(r);
ok('connected=true من الكوكي', j && j.connected === true, JSON.stringify(j));
ok('الإيميل رجع', j && j.email === 'owner@gmail.com', JSON.stringify(j));

console.log('\n[V7] حفظ/قراءة الفولدر المشترك بيشتغل ويersist في الكوكي');
r = await run(makeReq({
  url: '/api/sync/folder', method: 'POST', headers: { cookie: connCookie },
  body: { folderId: 'https://drive.google.com/drive/folders/AbC123xyz_9' }
}));
j = json(r);
ok('حفظ الفولدر نجح', r.status === 200 && j && j.ok === true, r.status + ' ' + r.body.slice(0, 120));
const savedCookie = cookiesOf(r).find((c) => String(c).indexOf('vcdb=') === 0);
ok('الكوكي اتحدّث بالفولدر الجديد', !!savedCookie && decodeURIComponent(savedCookie).indexOf('AbC123xyz_9') > -1, String(savedCookie).slice(0, 120));
r = await run(makeReq({ url: '/api/sync/folder', headers: { cookie: connCookie + '; ' + cookieJarHeader(cookiesOf(r)) } }));
j = json(r);
ok('القراءة لقت الفولدر المحفوظ', j && j.ok === true && j.customFolder === 'AbC123xyz_9', JSON.stringify(j));

console.log('\n[V8] فصل الربط يمسح الكوكي والمخزن');
r = await run(makeReq({ url: '/api/google/disconnect', method: 'POST', headers: { cookie: connCookie } }));
j = json(r);
ok('disconnect يرجع ok', j && j.ok === true, r.body.slice(0, 80));
ok('كوكي gconn اتمسح', cookiesOf(r).join(' ').indexOf('gconn=;') > -1, cookiesOf(r).join('|'));
const cleared = cookiesOf(r).find((c) => String(c).indexOf('vcdb=') === 0);
ok('الاتصال اتمسح من مخزن الكوكي', !!cleared && decodeURIComponent(cleared).indexOf('tok-abc') === -1, String(cleared).slice(0, 120));
r = await run(makeReq({ url: '/api/google/status', headers: { cookie: 'gconn=; ' + (cleared ? cookieJarHeader([cleared]) : '') } }));
j = json(r);
ok('بعد الفصل connected=false', j && j.connected === false, JSON.stringify(j));

console.log('\n[V9] رفع بدون اتصال → 401 JSON (مش HTML)');
r = await run(makeReq({ url: '/api/google/upload', method: 'POST', body: { name: 'a.xlsx', b64: 'QQ==' } }));
j = json(r);
ok('401 ورسالة عربية', r.status === 401 && j && /ربط/.test(j.error || ''), r.status + ' ' + r.body.slice(0, 80));

console.log('\n' + (fail === 0 ? '✓ الكل نجح' : '✗ فيه فشل') + ' — ' + pass + ' نجاح / ' + fail + ' فشل');
process.exit(fail ? 1 : 0);