/* ============================================================
   sync-zero-loss-test.mjs — حماية المزامنة السحابية من المسح
   ------------------------------------------------------------
   بيشغّل نفس handler اللي Vercel بيناديه (vercel-run.js) مع
   قاعدة كوكي (vercel-db.js) وGoogle Drive وهمي في الذاكرة،
   ويتأكد إن:
   ١) الرفع الفاضي فوق نسخة فيها بيانات **مرفوض** (409).
   ٢) النسخة اللي على الدرايف ما بتتمسحش لما الرفع يترفض.
   ٣) الحالة القديمة بتتحفظ كنسخة مؤرشفة **قبل** الكتابة فوقها.
   ٤) الرفع المتعمد بـ force لسه شغّال.
   التشغيل: node sync-zero-loss-test.mjs
   ============================================================ */
/* مفاتيح Google مطلوبة قبل تحميل الـhandler (بيتقرأ وقت التحميل) */
process.env.GOOGLE_CLIENT_ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-testsecret0123456789abcd';

const { default: runHandler } = await import('./vercel-run.js');
const { createCookieDB } = await import('./vercel-db.js');

const CONNECT_TOKEN = 'tok_test_connection_123456';
const EMAIL = 'owner@example.com';
const FOLDER_ID = 'folder_sync_000000001';
const FOLDER_NAME = 'نظام الإدارة — المزامنة';

/* ---------- Google Drive وهمي ---------- */
let seq = 0;
const files = [];
let tokenCalls = 0;

function newId(prefix) { seq++; return (prefix || 'f') + String(200000 + seq); }
function nowIso() { return new Date().toISOString(); }
function metaOf(f) {
  return {
    id: f.id, name: f.name, mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: String(Buffer.byteLength(f.content || '', 'utf8')),
    parents: f.parents || [], trashed: false,
    capabilities: { canEdit: true }
  };
}

/* multipart: الجزء الأول ميتا والثاني محتوى (نفس صيغة Google) */
function multipartJson(text, boundary) {
  const parts = text.split('--' + boundary);
  const bodies = parts.map(function (p) {
    const i = p.indexOf('\r\n\r\n');
    return i < 0 ? '' : p.slice(i + 4).replace(/\r\n$/, '');
  }).filter(function (b) { return b && b !== '--'; });
  let meta = null;
  try { meta = JSON.parse(bodies[0]); } catch (e) { meta = null; }
  return { meta: meta, content: bodies.length > 1 ? bodies[1] : '' };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function (url, init) {
  const u = String(url && url.url ? url.url : url);
  const o = init || {};

  if (u.indexOf('oauth2.googleapis.com') > -1) {
    tokenCalls++;
    return new Response(JSON.stringify({ access_token: 'access-' + tokenCalls, expires_in: 3600 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (u.indexOf('googleapis.com') > -1) {
    const parsed = new URL(u);

    /* تحديث محتوى الملف */
    if (parsed.pathname.indexOf('/upload/drive/v3/files/') === 0 && o.method === 'PATCH') {
      const id = parsed.pathname.split('/').pop();
      const f = files.filter(function (x) { return x.id === id; })[0];
      if (!f) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
      f.content = typeof o.body === 'string' ? o.body : await new Response(o.body).text();
      f.modifiedTime = nowIso();
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* إنشاء (ملف/مجلد) */
    if (parsed.pathname.indexOf('/upload/drive/v3/files') === 0 && o.method === 'POST') {
      const ct = String((o.headers || {})['Content-Type'] || '');
      const boundary = (ct.split('boundary=')[1] || '').trim();
      const text = typeof o.body === 'string' ? o.body : await new Response(o.body).text();
      const parsedMp = multipartJson(text, boundary);
      const meta = parsedMp.meta || {};
      const f = {
        id: newId('f'), name: meta.name || '', mimeType: meta.mimeType || '',
        parents: meta.parents || [], content: parsedMp.content || '', modifiedTime: nowIso()
      };
      files.push(f);
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (parsed.pathname === '/drive/v3/files' && o.method === 'POST') {
      const body = JSON.parse(o.body || '{}');
      const f = {
        id: newId('d'), name: body.name || '', mimeType: body.mimeType || '',
        parents: body.parents || [], content: '', modifiedTime: nowIso()
      };
      files.push(f);
      return new Response(JSON.stringify({ id: f.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* تحميل محتوى */
    if (parsed.searchParams.get('alt') === 'media') {
      const id = parsed.pathname.split('/').pop();
      const f = files.filter(function (x) { return x.id === id; })[0];
      if (!f) return new Response('not found', { status: 404 });
      return new Response(f.content, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* ملف واحد */
    const one = parsed.pathname.match(/\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (one && (!o.method || o.method === 'GET')) {
      const f = files.filter(function (x) { return x.id === one[1]; })[0];
      if (!f) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* بحث */
    const q = parsed.searchParams.get('q') || '';
    const parent = (q.match(/'([A-Za-z0-9_-]{10,})' in parents/) || [])[1] || '';
    const name = (q.match(/name='([^']+)'/) || [])[1] || '';
    const mime = (q.match(/mimeType='([^']+)'/) || [])[1] || '';
    const out = files.filter(function (f) {
      if (parent && (f.parents || []).indexOf(parent) < 0) return false;
      if (name && f.name !== name) return false;
      if (mime && f.mimeType !== mime) return false;
      return true;
    }).map(metaOf);
    return new Response(JSON.stringify({ files: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return realFetch(url, init);
};

/* ---------- محاكاة req/res زي Vercel ---------- */
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

const db = createCookieDB('');
/* سطر اتصال Google موجود مسبقًا (زي مستخدم ربط حسابه) */
const seed = db.db;
await seed.prepare('INSERT INTO google_connections (client_token, refresh_token, email) VALUES (?, ?, ?)')
  .bind(CONNECT_TOKEN, 'refresh-test', EMAIL).run();
const cookieState = db.pendingCookie();
const cookie = 'gconn=' + CONNECT_TOKEN + '; ' + cookieState.split(';')[0];

function makeReq({ url, method = 'GET', body }) {
  const h = { host: 'app.example.com', cookie: cookie, 'content-type': 'application/json' };
  let payload = null;
  if (body != null) {
    const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    h['content-length'] = String(buf.length);
    payload = buf;
  }
  const req = {
    method: method, headers: h, url: url,
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
      statusCode: 200, headers: {}, ended: false, _buf: Buffer.alloc(0),
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      end(chunk) {
        if (this.ended) return;
        this.ended = true;
        if (chunk) this._buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        resolve({ status: this.statusCode, body: this._buf.toString('utf8') });
      }
    };
    const timer = setTimeout(() => reject(new Error('timeout')), 9000);
    const apiPath = String(req.url || '/').split('?')[0];
    Promise.resolve(runHandler(req, res, apiPath))
      .then(() => { if (!res.ended) { clearTimeout(timer); reject(new Error('لم يستجب')); } })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

const json = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };
const push = (snapshot, extra) => run(makeReq({
  url: '/api/sync/push', method: 'POST',
  body: Object.assign({ snapshot: snapshot }, extra || {})
}));

const snapWith = (names) => ({
  version: 1, device: 'WEB-TEST', updatedAt: new Date().toISOString(),
  sections: { app_customers: JSON.stringify(names.map(function (n) { return { name: n }; })) }
});

(async function main() {
  console.log('\n[1] أول رفع فيه بيانات');
  let r = await push(snapWith(['أحمد', 'حسن']));
  ok('push ناجح 200', r.status === 200 && json(r).ok === true, { s: r.status, b: json(r) });
  const latest = files.filter(function (f) { return f.name === 'sync-latest.json'; })[0];
  ok('ملف المزامنة اتعمل', !!latest);
  ok('الملف جوه فولدر المزامنة', latest && (latest.parents || []).length === 1, latest && latest.parents);
  ok('اسم الفولدر صح', files.some(function (f) { return f.name === FOLDER_NAME; }));

  console.log('\n[2] رفع فاضي فوق نسخة فيها بيانات');
  r = await push(snapWith([]));
  const j = json(r);
  ok('مرفوض 409', r.status === 409, { s: r.status, b: j });
  ok('الرمز EMPTY_OVERWRITE', j && j.code === 'EMPTY_OVERWRITE', j);
  ok('رسالة عربية واضحة', j && /فاضية/.test(j.error || ''), j && j.error);

  console.log('\n[3] النسخة السحابية ما اتمسحتش');
  r = await run(makeReq({ url: '/api/sync/pull' }));
  const pull = json(r);
  ok('pull ناجح', r.status === 200 && pull.ok && pull.exists === true, pull && pull.exists);
  const custs = JSON.parse((pull.snapshot.sections || {}).app_customers || '[]');
  ok('العملاء لسه موجودين (٢)', custs.length === 2, custs.length);

  console.log('\n[4] رفع جديد — الحالة القديمة تتأرشف');
  r = await push(snapWith(['أحمد', 'حسن', 'محمود']));
  ok('push ناجح', r.status === 200 && json(r).ok, json(r));
  const versions = files.filter(function (f) { return String(f.name || '').indexOf('نسخة ') === 0; });
  const oldCopy = versions.filter(function (f) { return String(f.content || '').indexOf('حسن') > -1 && String(f.content || '').indexOf('محمود') < 0; });
  ok('نسخة قديمة محفوظة قبل الكتابة فوقها', oldCopy.length >= 1, versions.map(function (f) { return f.name; }));
  const now = JSON.parse(files.filter(function (f) { return f.name === 'sync-latest.json'; })[0].content);
  ok('الملف الحالي فيه الإضافة الجديدة', JSON.parse(now.sections.app_customers).length === 3);

  console.log('\n[5] force للتفريغ المتعمد');
  r = await push(snapWith([]), { force: true });
  ok('force يسمح 200', r.status === 200 && json(r).ok, { s: r.status, b: json(r) });

  console.log('\n[6] لائحة النسخ والقراءة');
  r = await run(makeReq({ url: '/api/sync/versions' }));
  const vj = json(r);
  ok('versions ناجح', r.status === 200 && vj.ok === true, vj && vj.ok);
  ok('فيه نسخ مؤرشفة', (vj.versions || []).length >= 1, (vj.versions || []).length);
  const vid = vj.versions[0].id;
  r = await run(makeReq({ url: '/api/sync/version?id=' + encodeURIComponent(vid) }));
  const one = json(r);
  ok('قراءة نسخة محددة', r.status === 200 && one.ok && !!one.snapshot, one && one.ok);

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('CRASH', e && e.stack ? e.stack : e);
  process.exit(1);
});
