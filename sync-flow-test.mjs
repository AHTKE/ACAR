/* ============================================================
   sync-flow-test.mjs — اختبار دورة المزامنة والرفع كاملة
   ------------------------------------------------------------
   بيشغّل نفس handler بتاع Vercel مع Google Drive وهمي، ويتأكد إن:
   - النسخة بتترفع وتتقرأ وبتتعمل لها أرشفة.
   - لائحة النسخ وقراءة النسخة القديمة شغالين.
   - قراءة نسخة خارج فولدر المزامنة مرفوضة.
   - رفع ملف التصدير شغال.
   - حفظ الفولدر المشترك بيثبت في كوكي الجلسة.
   التشغيل: node sync-flow-test.mjs
   ============================================================ */
import runHandler from './vercel-run.js';

process.env.GOOGLE_CLIENT_ID = '123456789012-syncflowtest.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-syncflowtest0123456789abcd';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

const FOLDER = 'folder-sync-1';
const jsonRes = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json' }
});

const drive = {
  latest: null,
  versions: [],
  nextId: 1,
  outsideVersion: 'version-outside-1',
  snapshot: null
};

function newId(prefix) {
  drive.nextId++;
  return prefix + '-' + drive.nextId;
}

async function bodyText(init) {
  if (!init || !init.body) return '';
  if (typeof init.body === 'string') return init.body;
  if (typeof init.body.text === 'function') return init.body.text();
  return String(init.body);
}

async function multipartMeta(init) {
  const text = await bodyText(init);
  const lines = text.split('\r\n');
  for (const line of lines) {
    const t = line.trim();
    if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') {
      try { return JSON.parse(t); } catch (e) { /* تجاهل */ }
    }
  }
  return {};
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const method = String((init && init.method) || 'GET').toUpperCase();

  if (u.indexOf('https://oauth2.googleapis.com/token') === 0) {
    return jsonRes({ access_token: 'AT-1', expires_in: 3600, token_type: 'Bearer' });
  }

  /* البحث: فولدر المزامنة أو ملف sync-latest */
  if (method === 'GET' && u.indexOf('https://www.googleapis.com/drive/v3/files?') === 0) {
    const q = new URL(u).searchParams.get('q') || '';
    if (q.indexOf("name='sync-latest.json'") > -1) {
      return jsonRes({ files: drive.latest ? [drive.latest] : [] });
    }
    if (q.indexOf("mimeType='application/vnd.google-apps.folder'") > -1) {
      return jsonRes({ files: [{ id: FOLDER, name: 'نظام الإدارة — المزامنة' }] });
    }
    if (q.indexOf("'" + FOLDER + "' in parents") > -1) {
      return jsonRes({ files: drive.latest ? [drive.latest].concat(drive.versions) : drive.versions.slice() });
    }
    return jsonRes({ files: [] });
  }

  /* بيانات فولدر المزامنة */
  if (method === 'GET' && u.indexOf('https://www.googleapis.com/drive/v3/files/' + FOLDER) === 0) {
    return jsonRes({
      id: FOLDER, name: 'نظام الإدارة — المزامنة',
      owners: [{ emailAddress: 'owner@gmail.com' }],
      capabilities: { canEdit: true }
    });
  }

  /* محتوى النسخة الحالية */
  if (method === 'GET' && drive.latest && u.indexOf('https://www.googleapis.com/drive/v3/files/' + drive.latest.id + '?alt=media') === 0) {
    return jsonRes(drive.snapshot);
  }

  /* بيانات نسخة مؤرشفة */
  if (method === 'GET' && u.indexOf('https://www.googleapis.com/drive/v3/files/') === 0) {
    const id = u.split('/files/')[1].split('?')[0];
    if (id === drive.outsideVersion) {
      return jsonRes({ id: id, name: 'نسخة 2026-01-01 00.00.00.json', parents: ['folder-outside'], trashed: false });
    }
    const v = drive.versions.find((x) => x.id === id);
    if (v && u.indexOf('alt=media') > -1) return jsonRes(drive.snapshot);
    if (v) return jsonRes({ id: v.id, name: v.name, parents: [FOLDER], trashed: false });
    if (u.indexOf('fields=id,name,webViewLink') > -1) {
      return jsonRes({ id: id, name: 'x.xlsx', webViewLink: 'https://drive.google.com/file/d/' + id });
    }
    return jsonRes({ error: { message: 'not found' } }, 404);
  }

  /* تحديث ملف المزامنة الموجود */
  if (method === 'PATCH' && u.indexOf('https://www.googleapis.com/upload/drive/v3/files/') === 0) {
    drive.snapshot = JSON.parse(await bodyText(init));
    const id = u.split('/files/')[1].split('?')[0];
    return jsonRes({ id: id, name: 'sync-latest.json', modifiedTime: new Date().toISOString(), size: '100' });
  }

  /* رفع multipart: إما sync-latest أو نسخة مؤرشفة أو ملف تصدير */
  if (method === 'POST' && u.indexOf('https://www.googleapis.com/upload/drive/v3/files') === 0) {
    const meta = await multipartMeta(init);
    const name = String(meta.name || 'file');
    if (name === 'sync-latest.json') {
      const raw = await bodyText(init);
      const firstJson = raw.indexOf('{');
      const metaEnd = firstJson > -1 ? raw.indexOf('\r\n--', firstJson) : -1;
      const contentStart = metaEnd > -1 ? raw.indexOf('\r\n\r\n', metaEnd) : -1;
      const contentEnd = raw.lastIndexOf('\r\n--');
      if (contentStart > -1 && contentEnd > contentStart) {
        try { drive.snapshot = JSON.parse(raw.slice(contentStart + 4, contentEnd)); } catch (e) { /* ignore */ }
      }
      const item = {
        id: drive.latest ? drive.latest.id : newId('sync'),
        name: name,
        modifiedTime: new Date().toISOString(),
        size: '100',
        capabilities: { canEdit: true }
      };
      drive.latest = item;
      return jsonRes(item);
    }
    if (name.indexOf('نسخة ') === 0) {
      const v = { id: newId('version'), name: name, modifiedTime: new Date().toISOString(), size: '100' };
      drive.versions.push(v);
      return jsonRes(v);
    }
    return jsonRes({ id: newId('export'), name: name, modifiedTime: new Date().toISOString(), size: '3' });
  }

  /* روابط الملفات */
  if (method === 'GET' && u.indexOf('https://www.googleapis.com/drive/v3/files/') === 0) {
    return jsonRes({ id: 'export-1', name: 'x.xlsx', webViewLink: 'https://drive.google.com/file/d/export-1' });
  }

  return jsonRes({ error: { message: 'unexpected ' + method + ' ' + u } }, 500);
};

function makeReq({ url, method = 'GET', cookie = '', body }) {
  const h = { host: 'site.test', 'x-forwarded-proto': 'https' };
  if (cookie) h.cookie = cookie;
  let payload = null;
  if (body != null) {
    payload = Buffer.from(JSON.stringify(body), 'utf8');
    h['content-type'] = 'application/json';
    h['content-length'] = String(payload.length);
  }
  return {
    method, headers: h, url,
    on(ev, cb) {
      if (ev === 'data' && payload) cb(payload);
      if (ev === 'end') queueMicrotask(() => cb());
      if (ev === 'error') queueMicrotask(() => cb());
    }
  };
}

function run(path, { method = 'GET', cookie = '', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = makeReq({ url: path, method, cookie, body });
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      ended: false,
      end(chunk) {
        if (this.ended) return;
        this.ended = true;
        resolve({ status: this.statusCode, headers: this.headers, body: chunk ? String(chunk) : '' });
      }
    };
    Promise.resolve(runHandler(req, res, path.split('?')[0])).then(() => {
      if (!res.ended) reject(new Error('no response'));
    }).catch(reject);
  });
}

function setCookies(r) {
  const c = r.headers['set-cookie'];
  return c ? (Array.isArray(c) ? c : [c]) : [];
}

function jar(cookie, r) {
  const added = setCookies(r).map((x) => String(x).split(';')[0]).join('; ');
  return added ? (cookie ? cookie + '; ' + added : added) : cookie;
}

const cookie0 = 'gconn=tok-1; vcdb=' + encodeURIComponent(JSON.stringify({
  c: [{ t: 'tok-1', r: 'rt-1', e: 'owner@gmail.com', u: 1 }],
  s: {}
}));

async function main() {
  console.log('\n[1] رفع نسخة المزامنة');
  const snap = {
    schema: 1, updatedAt: '2026-01-01T10:00:00.000Z', device: 'test-device',
    counts: { app_customers: 1 },
    sections: { app_customers: JSON.stringify([{ id: 1, name: 'عميل' }]) }
  };
  let r = await run('/api/sync/push', { method: 'POST', cookie: cookie0, body: { snapshot: snap, sendEmail: false } });
  let j = JSON.parse(r.body);
  ok('رفع النسخة نجح', r.status === 200 && j.ok === true, r.body);
  ok('الأرشفة اتعملت', j.archived === true, r.body);
  ok('الملف الحالي اتسجل', !!drive.latest, JSON.stringify(drive.latest));
  ok('النسخة المؤرشفة اتسجلت', drive.versions.length === 1, JSON.stringify(drive.versions));
  let cookie = jar(cookie0, r);

  console.log('\n[2] قراءة النسخة من الدرايف');
  r = await run('/api/sync/pull', { cookie });
  j = JSON.parse(r.body);
  ok('pull نجح', r.status === 200 && j.ok === true, r.body);
  ok('النسخة موجودة', j.exists === true, r.body);
  ok('المحتوى رجع صح', j.snapshot && j.snapshot.sections.app_customers === snap.sections.app_customers, r.body.slice(0, 160));

  console.log('\n[3] لائحة النسخ');
  r = await run('/api/sync/versions', { cookie });
  j = JSON.parse(r.body);
  ok('versions نجح', r.status === 200 && j.ok === true, r.body);
  ok('النسخة الحالية ظاهرة', j.latest && j.latest.id === drive.latest.id, r.body);
  ok('النسخة المؤرشفة ظاهرة', j.count === 1 && j.versions.length === 1, r.body);

  console.log('\n[4] قراءة نسخة مؤرشفة + حماية الفولدر');
  const v = drive.versions[0];
  r = await run('/api/sync/version?id=' + encodeURIComponent(v.id), { cookie });
  j = JSON.parse(r.body);
  ok('قراءة النسخة القديمة نجحت', r.status === 200 && j.ok === true, r.body);
  r = await run('/api/sync/version?id=' + encodeURIComponent(drive.outsideVersion), { cookie });
  j = JSON.parse(r.body);
  ok('نسخة خارج فولدر المزامنة مرفوضة', r.status === 404 && j.ok === false, r.status + ' ' + r.body);

  console.log('\n[5] رفع ملف تصدير');
  r = await run('/api/google/upload', {
    method: 'POST', cookie,
    body: { name: 'تقرير.xlsx', mime: 'application/vnd.ms-excel', b64: 'QUJD', dest: 'folder' }
  });
  j = JSON.parse(r.body);
  ok('رفع الملف نجح', r.status === 200 && j.ok === true, r.body);
  ok('رجع رابط الملف', /^https:\/\/drive\.google\.com\//.test(j.link || ''), r.body);

  console.log('\n[6] حفظ الفولدر المشترك');
  r = await run('/api/sync/folder', {
    method: 'POST', cookie,
    body: { folderId: 'https://drive.google.com/drive/folders/SharedFolder_123' }
  });
  j = JSON.parse(r.body);
  ok('حفظ الفولدر نجح', r.status === 200 && j.ok === true && j.folderId === 'SharedFolder_123', r.body);
  cookie = jar(cookie, r);
  r = await run('/api/sync/folder', { cookie });
  j = JSON.parse(r.body);
  ok('الفولدر اتقرأ بعد الحفظ', r.status === 200 && j.ok === true && j.customFolder === 'SharedFolder_123', r.body);

  globalThis.fetch = realFetch;
  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });
