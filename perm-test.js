/* ============================================================
   perm-test.js — اختبار تشخيص صلاحيات المجلد على Google Drive
   يحاكي Drive API: مجلد بصلاحية مشاهدة، مجلد محذوف، رفض كتابة
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

/* ---------- محاكاة fetch لـ Google ---------- */
const realFetch = globalThis.fetch;
let folderResp = { status: 200, body: {} };   /* استجابة ملفوجة المجلد */
let uploadResp = { status: 200, body: {} };   /* استجابة رفع الملفات (أو دالة حسب عدد المحاولات) */
let queryResp = { files: [] };                 /* نتيجة البحث عن ملف المزامنة */
let fileResp = { status: 200, body: {} };       /* استجابة ملف محدد (قدرات التعديل) */
const calls = { folderGet: 0, upload: 0, query: 0, patch: 0, fileGet: 0 };

function jres(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

globalThis.fetch = function (url, opts) {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(jres({ access_token: 'AT-1', expires_in: 3600 }));
  }
  if (u.includes('/upload/drive/v3/files')) {
    calls.upload++;
    if (u.includes('/upload/drive/v3/files/OLDF1')) calls.patch++;
    const res = (typeof uploadResp === 'function') ? uploadResp(calls.upload) : uploadResp;
    return Promise.resolve(new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  if (u.includes('/drive/v3/files/OLDF1')) {
    calls.fileGet++;
    return Promise.resolve(jres(fileResp.body, fileResp.status));
  }
  if (u.includes('/drive/v3/files/FID1')) {
    calls.folderGet++;
    return Promise.resolve(new Response(JSON.stringify(folderResp.body), {
      status: folderResp.status,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  if (u.includes('/drive/v3/files?q=')) {
    calls.query++;
    return Promise.resolve(jres(queryResp));
  }
  if (u.includes('gmail.googleapis.com')) return Promise.resolve(jres({ id: 'M1' }));
  if (u.includes('www.googleapis.com')) return Promise.resolve(jres({}));
  return realFetch ? realFetch(url, opts) : Promise.resolve(jres({}, 404));
};

/* ---------- قاعدة بيانات وهمية ---------- */
const OWNER = 'owner.personal@gmail.com';
const ADMIN = 'gstsyusudg@gmail.com';
function mkDb(settings) {
  return {
    exec: async () => {},
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => {
          if (/google_connections/.test(sql)) {
            return { id: 1, client_token: 'tok-1', refresh_token: 'rt-1', email: ADMIN };
          }
          if (/google_settings/.test(sql)) {
            const k = args[0];
            return (k in settings) ? { v: settings[k] } : null;
          }
          return null;
        },
        run: async () => {}
      })
    })
  };
}

const ENV = (settings) => ({
  ASSETS: { fetch: async () => new Response('ASSET') },
  GOOGLE_CLIENT_ID: 'cid-test',
  GOOGLE_CLIENT_SECRET: 'csec-test',
  DB: mkDb(settings || { sync_custom_folder: 'FID1' })
});

function pushReq() {
  return new Request('https://site.test/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'gconn=tok-1' },
    body: JSON.stringify({ snapshot: { sections: { app_customers: '[]' } } })
  });
}

(async function () {
  /* تحميل الـ Worker كوحدة ESM */
  const tmp = os.join(process.cwd(), '.worker-perm.mjs');
  fs.copyFileSync('worker.js', tmp);
  let worker;
  try { worker = (await import('file://' + tmp)).default; }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  ok('الـ Worker اتحمّل', !!worker && typeof worker.fetch === 'function');

  console.log('\n[1] مجلد مشترك بصلاحية مشاهدة فقط → 403 برسالة عربية مفصّلة');
  folderResp = { status: 200, body: {
    id: 'FID1', name: 'مجلد النظام العام',
    owners: [{ emailAddress: OWNER }],
    capabilities: { canEdit: false }
  } };
  uploadResp = { status: 200, body: { id: 'UP1', modifiedTime: 'T1', size: '5' } };
  calls.upload = 0;
  let r = await worker.fetch(pushReq(), ENV());
  let j = await r.json();
  ok('الحالة 403', r.status === 403, 'status=' + r.status);
  ok('الرمز code=PERM', j.code === 'PERM', JSON.stringify(j));
  ok('الرسالة فيها الحساب المتصل', String(j.error).indexOf(ADMIN) > -1, j.error);
  ok('الرسالة فيها صاحب المجلد', String(j.error).indexOf(OWNER) > -1, j.error);
  ok('الرسالة فيها «محرر» كحل', String(j.error).indexOf('محرر') > -1, j.error);
  ok('الرسالة عربية (مش خطأ جوجل الإنجليزي)', String(j.error).indexOf('sufficient') === -1, j.error);
  ok('مفيش محاولة رفع لم تكن لازمة', calls.upload === 0, 'uploads=' + calls.upload);

  console.log('\n[2] رابط مجلد خاطئ/محذوف → 404 برسالة عربية');
  folderResp = { status: 404, body: { error: { message: 'File not found' } } };
  r = await worker.fetch(pushReq(), ENV());
  j = await r.json();
  ok('الحالة 404', r.status === 404, 'status=' + r.status);
  ok('الرسالة تقول إن المجلد غير موجود', String(j.error).indexOf('غير موجود') > -1, j.error);

  console.log('\n[3] صلاحية محرر + رفع ناجح → 200');
  folderResp = { status: 200, body: {
    id: 'FID1', name: 'مجلد النظام العام',
    owners: [{ emailAddress: OWNER }],
    capabilities: { canEdit: true }
  } };
  r = await worker.fetch(pushReq(), ENV());
  j = await r.json();
  ok('الحالة 200', r.status === 200, 'status=' + r.status + ' ' + JSON.stringify(j));
  ok('ok=true', j.ok === true, JSON.stringify(j));
  ok('اتسجل folderId', !!j.folderId, JSON.stringify(j));

  console.log('\n[4] المجلد مسموح لكن جوجل يرفض الكتابة أثناء الرفع → رسالة عربية');
  uploadResp = { status: 403, body: {
    error: { message: 'The user does not have sufficient permissions for this file.' }
  } };
  r = await worker.fetch(pushReq(), ENV());
  j = await r.json();
  ok('الحالة 403', r.status === 403, 'status=' + r.status);
  ok('code=PERM', j.code === 'PERM', JSON.stringify(j));
  ok('الرسالة عربية مفصّلة و فيها الحساب', String(j.error).indexOf(ADMIN) > -1 &&
     String(j.error).indexOf('صلاحية كتابة') > -1 && String(j.error).indexOf('محرر') > -1, j.error);

  console.log('\n[5] القراءة مرفوضة (فحص وتحميل) → 403 برسالة تشخيص');
  uploadResp = { status: 200, body: { id: 'UP1' } };
  folderResp = { status: 403, body: { error: { message: 'Forbidden' } } };
  r = await worker.fetch(new Request('https://site.test/api/sync/pull',
    { headers: { Cookie: 'gconn=tok-1' } }), ENV());
  j = await r.json();
  ok('pull بالحالة 403', r.status === 403, 'status=' + r.status);
  ok('الرسالة فيها «تعذّر قراءة»', String(j.error).indexOf('تعذّر قراءة') > -1, j.error);
  ok('الرسالة فيها الحساب والمالك', String(j.error).indexOf(ADMIN) > -1, j.error);

  console.log('\n[6] لائحة النسخ القديمة مع رفض الوصول → 403');
  r = await worker.fetch(new Request('https://site.test/api/sync/versions',
    { headers: { Cookie: 'gconn=tok-1' } }), ENV());
  j = await r.json();
  ok('versions بالحالة 403', r.status === 403, 'status=' + r.status);
  ok('الرسالة عربية', String(j.error).indexOf('المجلد') > -1, j.error);

  console.log('\n[7] ملف المزامنة منشأ بحساب آخر → الرفع ما يفشلش (ملف جديد بدل الرفض)');
  folderResp = { status: 200, body: {
    id: 'FID1', name: 'مجلد النظام العام',
    owners: [{ emailAddress: OWNER }],
    capabilities: { canEdit: true }
  } };
  queryResp = { files: [{
    id: 'OLDF1', name: 'sync-latest.json',
    modifiedTime: '2026-01-01T00:00:00', size: '10',
    capabilities: { canEdit: true }
  }] };
  uploadResp = function (n) {
    return n === 1
      ? { status: 403, body: { error: { message: 'The user does not have sufficient permissions for this file.' } } }
      : { status: 200, body: { id: 'UP2', modifiedTime: 'T2', size: '9' } };
  };
  calls.upload = 0; calls.patch = 0;
  r = await worker.fetch(pushReq(), ENV());
  j = await r.json();
  ok('الحالة 200 رغم رفض تعديل الملف القديم', r.status === 200 && j.ok === true,
     'status=' + r.status + ' ' + JSON.stringify(j));
  ok('جرّب تعديل الملف القديم مرة ثم رفع ملفاً جديداً', calls.patch === 1 && calls.upload >= 2,
     'patch=' + calls.patch + ' uploads=' + calls.upload);

  console.log('\n[8] الملف القديم غير قابل للتعديل من الأساس → يرفع ملفاً جديداً مباشرة');
  queryResp = { files: [{
    id: 'OLDF1', name: 'sync-latest.json',
    modifiedTime: '2026-01-01T00:00:00', size: '10',
    capabilities: { canEdit: false }
  }] };
  uploadResp = { status: 200, body: { id: 'UP3', modifiedTime: 'T3', size: '7' } };
  calls.upload = 0; calls.patch = 0;
  r = await worker.fetch(pushReq(), ENV());
  j = await r.json();
  ok('الحالة 200', r.status === 200 && j.ok === true, 'status=' + r.status + ' ' + JSON.stringify(j));
  ok('ما جربش تعديل الملف المحظور', calls.patch === 0, 'patch=' + calls.patch);

  globalThis.fetch = realFetch;
  console.log('\n=== perm-test: ' + pass + ' ناجح / ' + fail + ' فاشل ===');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });