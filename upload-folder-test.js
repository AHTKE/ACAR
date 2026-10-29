/* اختبار رفع Excel/PDF إلى فولدر التصدير:
   ١) الفولدر مش موجود ← يتعمل ويُرفع فيه
   ٢) معرّف محفوظ قديم/محذوف ← يتعمل جديد ويُعاد الرفع
   ٣) الفولدر موجود بدون صلاحية كتابة ← يُرفع للحساب ويُبلَّغ بدون رفض */
const fs = require('fs');
const os = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

const EXPORT_FOLDER = 'ملفات ال PDF و EXCEL تابع تطبيق نظام الاداره';

async function main() {
  /* تحميل الـ Worker كوحدة ESM */
  const tmp = os.join(process.cwd(), '.worker-folder-test.mjs');
  fs.copyFileSync('worker.js', tmp);
  let worker;
  try {
    worker = (await import('file://' + tmp)).default;
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  if (!worker || typeof worker.fetch !== 'function') {
    console.error('فشل تحميل worker.js'); process.exit(1);
  }

  const SEC = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' };
  const ASSETS = { fetch: async () => new Response('ASSET') };
  const calls = { list: 0, create: 0, upload: 0 };
  let st = null;   /* حالة كل سيناريو */

  /* قاعدة بيانات وهمية بسيطة */
  function mkDb(settings) {
    return {
      exec: async () => {},
      prepare(sql) {
        return {
          bind(...args) {
            return {
              first: async () => {
                if (sql.indexOf('google_connections') > -1) {
                  if (args[0] !== 'tok-1') return null;
                  return { client_token: 'tok-1', refresh_token: 'rt-1', email: 'owner@gmail.com' };
                }
                if (sql.indexOf('google_settings') > -1) {
                  const k = args[0];
                  return Object.prototype.hasOwnProperty.call(settings, k) ? { v: settings[k] } : null;
                }
                return null;
              },
              run: async () => {
                if (sql.indexOf('google_settings') > -1 && args.length >= 2) settings[args[0]] = args[1];
                return {};
              },
              all: async () => ({ results: [] })
            };
          }
        };
      }
    };
  }

  function jsonRes(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /* استخراج الـ metadata (name/parents) من جسم multipart */
  async function uploadMeta(body) {
    try {
      const text = typeof body.text === 'function' ? await body.text() : String(body);
      const lines = text.split('\r\n');
      for (const line of lines) {
        const t = line.trim();
        if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') return JSON.parse(t);
      }
    } catch (e) { /* ما نرميش الخطأ */ }
    return {};
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';

    if (u.indexOf('https://oauth2.googleapis.com/token') === 0) {
      return jsonRes({ access_token: 'AT-1', expires_in: 3600, token_type: 'Bearer' });
    }

    /* إنشاء فولدر */
    if (method === 'POST' && u.indexOf('https://www.googleapis.com/drive/v3/files?') === 0) {
      calls.create++;
      if (st.createFails) {
        return jsonRes({ error: { message: 'The user does not have sufficient permissions for this file.' } }, 403);
      }
      if (st.newId) st.knownFolders.add(st.newId);
      return jsonRes({ id: st.newId });
    }

    /* بحث عن فولدر بالاسم */
    if (method === 'GET' && u.indexOf('https://www.googleapis.com/drive/v3/files?') === 0) {
      calls.list++;
      if (st.listFails) return jsonRes({ error: { message: 'Invalid Credentials' } }, 401);
      return jsonRes({ files: st.existingFolderId ? [{ id: st.existingFolderId, name: EXPORT_FOLDER }] : [] });
    }

    /* رفع الملف */
    if (u.indexOf('https://www.googleapis.com/upload/drive/v3/files') === 0) {
      calls.upload++;
      const meta = await uploadMeta(init && init.body);
      const parent = meta.parents && meta.parents[0];
      if (parent && parent === st.badFolderId) {
        return jsonRes({ error: { message: st.badMessage } }, st.badStatus);
      }
      if (parent && !st.knownFolders.has(parent)) {
        return jsonRes({ error: { message: 'File not found: ' + parent } }, 404);
      }
      return jsonRes({ id: 'file-' + calls.upload, name: meta.name || 'x' });
    }

    /* جلب الرابط */
    if (u.indexOf('https://www.googleapis.com/drive/v3/files/') === 0) {
      const id = u.split('/').pop().split('?')[0];
      return jsonRes({ id: id, name: 'x', webViewLink: 'https://drive.google.com/file/d/' + id });
    }

    return jsonRes({}, 404);
  };

  function req(body, cookie) {
    return new Request('https://site.test/api/google/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie || 'gconn=tok-1' },
      body: JSON.stringify(body)
    });
  }

  const FILE = { name: 'تقرير-العمل.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b64: 'QUJD', dest: 'folder' };

  try {
    /* ---------- [1] الفولدر مش موجود: يتعمل ثم يُرفع ---------- */
    console.log('\n[1] فولدر التصدير غير موجود');
    calls.list = calls.create = calls.upload = 0;
    st = { knownFolders: new Set(), existingFolderId: null, newId: 'folder-new', createFails: false };
    let settings = {};
    let env = Object.assign({ ASSETS: ASSETS, DB: mkDb(settings) }, SEC);
    let r = await worker.fetch(req(FILE), env);
    let j = await r.json();
    ok('الرفع نجح', r.status === 200 && j.ok === true, JSON.stringify(j));
    ok('الملف اترفع جوه الفولدر (inFolder)', j.inFolder === true, JSON.stringify(j));
    ok('الفولدر اتلقى بالفعل', calls.create === 1, 'create=' + calls.create);
    ok('معرّف الفولدر اتحفظ للمرة الجاية', settings.export_folder_id === 'folder-new',
       JSON.stringify(settings));

    /* ---------- [2] معرّف محفوظ لفولدر محذوف ---------- */
    console.log('\n[2] معرّف فولدر قديم/محذوف في الإعدادات');
    calls.list = calls.create = calls.upload = 0;
    st = {
      knownFolders: new Set(), existingFolderId: null, newId: 'folder-fixed',
      createFails: false
    };
    settings = { export_folder_id: 'folder-gone' };
    env = Object.assign({ ASSETS: ASSETS, DB: mkDb(settings) }, SEC);
    r = await worker.fetch(req(FILE), env);
    j = await r.json();
    ok('الرفع نجح بعد الإصلاح', r.status === 200 && j.ok === true, JSON.stringify(j));
    ok('الملف اترفع في فولدر جديد (inFolder)', j.inFolder === true, JSON.stringify(j));
    ok('اتعمل فولدر بديل', calls.create >= 1, 'create=' + calls.create);
    ok('المعرّف اتحدّث للمستقبل', settings.export_folder_id === 'folder-fixed',
       JSON.stringify(settings));

    /* ---------- [3] فولدر موجود بدون صلاحية كتابة ---------- */
    console.log('\n[3] فولدر مشترك بصلاحية مشاهدة فقط');
    calls.list = calls.create = calls.upload = 0;
    st = {
      knownFolders: new Set(['folder-ro']), existingFolderId: 'folder-ro', newId: 'x',
      createFails: false, badFolderId: 'folder-ro', badStatus: 403,
      badMessage: 'The user does not have sufficient permissions for this file.'
    };
    settings = { export_folder_id: 'folder-ro' };
    env = Object.assign({ ASSETS: ASSETS, DB: mkDb(settings) }, SEC);
    r = await worker.fetch(req(FILE), env);
    j = await r.json();
    ok('ما اترفضش: الرفع نجح لحساب المستخدم', r.status === 200 && j.ok === true, JSON.stringify(j));
    ok('مُبلَّغ إنه بره الفولدر (inFolder=false)', j.inFolder === false, JSON.stringify(j));

    /* ---------- [4] بدون مجلد (dest متفعّل لكن الإنشاء مرفوض) ---------- */
    console.log('\n[4] إنشاء الفولدر مرفوض نهائياً (403)');
    calls.list = calls.create = calls.upload = 0;
    st = { knownFolders: new Set(), existingFolderId: null, newId: '', createFails: true };
    settings = {};
    env = Object.assign({ ASSETS: ASSETS, DB: mkDb(settings) }, SEC);
    r = await worker.fetch(req(FILE), env);
    j = await r.json();
    ok('الرفض مردود برسالة واضحة وعربية', j.ok === false &&
       /فولدر التصدير/.test(String(j.error || '')), JSON.stringify(j));

    /* ---------- [5] dest=device: بدون فولدر ---------- */
    console.log('\n[5] رفع بدون مجلد (تحميل على الجهاز/بدون مجلد)');
    calls.list = calls.create = calls.upload = 0;
    st = { knownFolders: new Set(), existingFolderId: null, newId: '', createFails: false };
    settings = {};
    env = Object.assign({ ASSETS: ASSETS, DB: mkDb(settings) }, SEC);
    r = await worker.fetch(req(Object.assign({}, FILE, { dest: 'device' })), env);
    j = await r.json();
    ok('الرفع للحساب نجح بدون مجلد', r.status === 200 && j.ok === true, JSON.stringify(j));
    ok('ما ابحثش عن فولدر', calls.list === 0 && calls.create === 0,
       'list=' + calls.list + ' create=' + calls.create);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
