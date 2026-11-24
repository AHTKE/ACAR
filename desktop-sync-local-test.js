/* اختبار المزامنة المحلية في الديسكتوب: رفع/سحب/نسخ/تنبيه بريد
   من غير أي اتصال حقيقي بـGoogle (Drive وهمي في الذاكرة). */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47845;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-sync-test-'));
process.env.NIZAM_DATA_DIR = DATA;
process.env.NIZAM_GOOGLE_CLIENT_ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
process.env.NIZAM_GOOGLE_CLIENT_SECRET = 'GOCSPX-testsecret0123456789abcd';
process.env.NIZAM_LINK_MODE = 'local';

const AUTH_FILE = path.join(DATA, 'google-auth.json');
const EMAIL = 'owner@example.com';

/* ---------- Drive وهمي ---------- */
let seq = 0;
const files = [];
let mailSent = [];
let googleCalls = 0;

function nowIso() { return new Date().toISOString(); }
function metaOf(f) {
  return { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: String(Buffer.byteLength(f.content || '', 'utf8')) };
}
function newId(prefix) { seq++; return (prefix || 'f') + String(100000000000 + seq); }

function parseMultipart(text, boundary) {
  const parts = text.split('--' + boundary).filter(function (p) {
    return p && p !== '--\r\n' && p !== '--' && p.trim() !== '--';
  });
  const grab = function (p) {
    const i = p.indexOf('\r\n\r\n');
    return i < 0 ? '' : p.slice(i + 4).replace(/\r\n$/, '');
  };
  return { meta: JSON.parse(grab(parts[0])), content: parts[1] ? grab(parts[1]) : '' };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  const o = opts || {};
  if (u.indexOf('https://www.googleapis.com/drive/v3/files') === 0 ||
      u.indexOf('https://www.googleapis.com/upload/drive/v3/files') === 0 ||
      u.indexOf('https://gmail.googleapis.com/') === 0) {
    googleCalls++;
    const parsed = new URL(u);

    if (parsed.hostname === 'gmail.googleapis.com') {
      const raw = JSON.parse(o.body || '{}').raw || '';
      const text = Buffer.from(raw, 'base64url').toString('utf8');
      const to = (text.match(/^To: (.+)$/m) || [])[1] || '';
      const subject = Buffer.from((text.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m) || [])[1] || '', 'base64').toString('utf8');
      mailSent.push({ to: to, subject: subject, text: text });
      return new Response(JSON.stringify({ id: 'msg-' + seq++ }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* تحديث محتوى ملف موجود (PATCH upload) */
    if (parsed.pathname.indexOf('/upload/drive/v3/files/') === 0) {
      const id = parsed.pathname.split('/').pop();
      const f = files.filter(function (x) { return x.id === id; })[0];
      if (!f) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
      f.content = typeof o.body === 'string' ? o.body : Buffer.from(o.body || '').toString('utf8');
      f.modifiedTime = nowIso();
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* إنشاء (فولدر أو ملف multipart) */
    if (o.method === 'POST' && parsed.pathname.indexOf('/upload/drive/v3/files') === 0) {
      const ct = String((o.headers || {})['Content-Type'] || '');
      const boundary = (ct.split('boundary=')[1] || '').trim();
      const parsedMp = parseMultipart(Buffer.from(o.body || '').toString('utf8'), boundary);
      const f = {
        id: newId('f'), name: parsedMp.meta.name, mimeType: parsedMp.meta.mimeType,
        parents: parsedMp.meta.parents || [], content: parsedMp.content,
        modifiedTime: nowIso(), capabilities: { canEdit: true }
      };
      files.push(f);
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (o.method === 'POST') {
      const body = JSON.parse(o.body || '{}');
      const f = {
        id: newId('d'), name: body.name, mimeType: body.mimeType || 'application/octet-stream',
        parents: body.parents || [], content: '', modifiedTime: nowIso(), capabilities: { canEdit: true }
      };
      files.push(f);
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* تحميل محتوى ملف */
    if (parsed.searchParams.get('alt') === 'media') {
      const id = parsed.pathname.split('/').pop();
      const f = files.filter(function (x) { return x.id === id; })[0];
      if (!f) return new Response('not found', { status: 404 });
      return new Response(f.content, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* قراءة ملف واحد */
    const one = parsed.pathname.match(/\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (one) {
      const f = files.filter(function (x) { return x.id === one[1]; })[0];
      if (!f) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
      return new Response(JSON.stringify(metaOf(f)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* بحث/قائمة */
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

  if (u.indexOf('https://workflow-amw-code.vercel.app') === 0) {
    throw new Error('لازم المزامنة تشتغل محليًا — مفيش تحويل للموقع');
  }
  return realFetch(url, opts);
};

const server = require('./desktop/server');

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); }
};
const base = 'http://127.0.0.1:' + PORT;
const call = async (p, payload) => {
  const o = { credentials: 'same-origin' };
  if (payload !== undefined) {
    o.method = 'POST';
    o.headers = { 'Content-Type': 'application/json' };
    o.body = JSON.stringify(payload);
  }
  const r = await fetch(base + p, o);
  const j = await r.json().catch(function () { return null; });
  return { status: r.status, body: j };
};

const snap = (tag) => ({
  version: 1, device: 'PC-TEST', updatedAt: new Date().toISOString(),
  sections: { customers: [{ name: 'عميل ' + tag }], invoices: [] }
});

(async function () {
  const info = await server.start(PORT);
  ok('الخادم شغّال', info.port === PORT, info.port);

  console.log('\n[1] من غير ربط');
  let r = await call('/api/sync/pull');
  ok('pull بيرجّع 401', r.status === 401, r.status);
  ok('بيقول needsConnect', r.body && r.body.needsConnect === true, r.body);

  /* ربط وهمي — توكن صالح في الملف */
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    refresh_token: 'test-refresh', access_token: 'test-access',
    expires_at: Date.now() + 3600 * 1000, email: EMAIL
  }));

  console.log('\n[2] أول رفع');
  r = await call('/api/sync/push', { snapshot: snap('أول'), sendEmail: true, changes: ['+ عميل'] });
  ok('push ناجح', r.status === 200 && r.body && r.body.ok === true, r.body);
  const folder = files.filter(function (f) { return f.mimeType === 'application/vnd.google-apps.folder'; })[0];
  ok('اتعمل فولدر المزامنة', !!folder && folder.name === 'نظام الإدارة — المزامنة', folder && folder.name);
  const firstId = r.body && r.body.id;
  ok('اتعمل ملف النسخة', !!files.filter(function (f) { return f.id === firstId; }).length);
  ok('البريد اتبعت', r.body && r.body.emailed === true && r.body.emailedTo === EMAIL, r.body);
  ok('الموضوع صح', mailSent.length === 1 && mailSent[0].subject === 'تم تحديث بيانات التطبيق', mailSent[0] && mailSent[0].subject);
  ok('البريد للمستلم المربوط', mailSent[0] && mailSent[0].to === EMAIL, mailSent[0] && mailSent[0].to);

  console.log('\n[3] رفع تاني — نفس الملف');
  r = await call('/api/sync/push', { snapshot: snap('تاني') });
  ok('push ناجح', r.status === 200 && r.body.ok, r.body);
  ok('نفس معرّف الملف', r.body.id === firstId, { first: firstId, now: r.body.id });
  ok('مفيش ملف مزامنة مكرر', files.filter(function (f) { return f.name === 'sync-latest.json'; }).length === 1);
  ok('مفيش بريد لما sendEmail مش مطلوب', mailSent.length === 1, mailSent.length);

  console.log('\n[4] السحب');
  r = await call('/api/sync/pull');
  ok('pull ناجح', r.status === 200 && r.body.ok && r.body.exists === true, r.body && r.body.exists);
  ok('الجهاز رجع صح', r.body.device === 'PC-TEST', r.body.device);
  ok('أحدث نسخة', r.body.snapshot && r.body.snapshot.sections.customers[0].name === 'عميل تاني',
    r.body.snapshot && r.body.snapshot.sections.customers[0].name);

  console.log('\n[5] النسخ المؤرشفة');
  r = await call('/api/sync/versions');
  ok('versions ناجح', r.status === 200 && r.body.ok === true, r.body);
  ok('فيه نسختين مؤرشفتين على الأقل', r.body.versions.length >= 2, r.body.versions.length);
  const verId = r.body.versions[0] && r.body.versions[0].id;
  r = await call('/api/sync/version?id=' + encodeURIComponent(verId));
  ok('version?id بيرجّع snapshot', r.status === 200 && r.body.ok && !!r.body.snapshot, r.body && r.body.ok);

  console.log('\n[6] فولدر مخصص');
  const custom = { id: newId('c'), name: 'فولدر العميل', mimeType: 'application/vnd.google-apps.folder', parents: [], content: '', modifiedTime: nowIso(), capabilities: { canEdit: true } };
  files.push(custom);
  r = await call('/api/sync/folder', { folderId: 'https://drive.google.com/drive/folders/' + custom.id });
  ok('حفظ الفولدر', r.status === 200 && r.body.ok && r.body.folderId === custom.id, r.body);
  r = await call('/api/sync/folder');
  ok('GET بيرجّع الفولدر', r.body.ok && r.body.customFolder.indexOf(custom.id) > -1, r.body);
  r = await call('/api/sync/push', { snapshot: snap('مخصص') });
  ok('الرفع اتحول للفولدر المخصص', r.status === 200 && r.body.folderId === custom.id, r.body && r.body.folderId);

  console.log('\n[7] الحدود والأخطاء');
  r = await call('/api/sync/push', { snapshot: { sections: { huge: 'x'.repeat(9 * 1024 * 1024) } } });
  ok('الحجم الكبير مرفوض 413', r.status === 413, r.status);
  r = await call('/api/sync/push', {});
  ok('نسخة ناقصة 400', r.status === 400, r.status);
  r = await call('/api/sync/version?id=bad');
  ok('معرّف غلط 400', r.status === 400, r.status);
  r = await call('/api/sync/folder', { folderId: 'not a link' });
  ok('رابط فولدر غلط 400', r.status === 400, r.status);

  console.log('\n[8] صفر فقدان: رفض الرفع الفاضي + أرشفة الحالة السابقة');
  const beforeVersions = (await call('/api/sync/versions')).body.versions.length;
  const beforePull = await call('/api/sync/pull');
  const beforeCount = (beforePull.body.snapshot.sections.customers || []).length;
  ok('فيه بيانات على الدرايف قبل الاختبار', beforeCount >= 1, beforeCount);

  r = await call('/api/sync/push', { snapshot: { version: 1, device: 'PC-TEST', updatedAt: new Date().toISOString(), sections: { customers: [], invoices: [] } } });
  ok('رفع فاضي مرفوض 409', r.status === 409 && r.body && r.body.code === 'EMPTY_OVERWRITE', { s: r.status, b: r.body });

  const afterPull = await call('/api/sync/pull');
  ok('نسخة الدرايف ما اتمسحتش', (afterPull.body.snapshot.sections.customers || []).length === beforeCount,
    (afterPull.body.snapshot.sections.customers || []).length);

  r = await call('/api/sync/push', { snapshot: snap('بعد الحماية') });
  ok('رفع فيه بيانات ناجح', r.status === 200 && r.body.ok, r.body);
  const oldArchived = files.filter(function (f) {
    return String(f.name || '').indexOf('نسخة ') === 0 && String(f.content || '').indexOf('مخصص') > -1;
  });
  ok('الحالة السابقة اتحفظت كنسخة قبل الكتابة فوقها', oldArchived.length >= 1, oldArchived.map(function (f) { return f.name; }));
  ok('عدد النسخ ما قلّش', (await call('/api/sync/versions')).body.versions.length >= beforeVersions, { before: beforeVersions });

  r = await call('/api/sync/push', { snapshot: { version: 1, sections: { customers: [] } }, force: true });
  ok('force يسمح بالتفريغ المتعمد', r.status === 200 && r.body.ok, { s: r.status, b: r.body });

  console.log('\n[10] مفيش تحويل للموقع');
  ok('كل النداءات كانت لـGoogle المحلي', googleCalls > 0);

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('CRASH', e);
  process.exit(1);
});
