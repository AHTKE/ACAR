/* ============================================================
   worker.js — نظام الإدارة المتكامل
   1) مسارات ربط Google Drive ورفع الملفات  (/api/google/*)
   2) تقديم الملفات الثابتة من dist/        (env.ASSETS)

   المفاتيح (توضع في Sites → Secrets):
     GOOGLE_CLIENT_ID
     GOOGLE_CLIENT_SECRET
   قاعدة البيانات (D1) بتتخزن فيها ربط الحساب — binding: DB
   ============================================================ */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send openid email';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

/* فولدر المزامنة — يتخلق مرة واحدة على درايف المستخدم ويتخزّن معرّفه */
const SYNC_FOLDER_NAME = 'نظام الإدارة — المزامنة';
const SYNC_FILE_NAME = 'sync-latest.json';
/* حد أقصى لحجم النسخة المُصرّح به (٨ ميجا تكفي آلاف السجلات) */
const MAX_SYNC_BYTES = 8 * 1024 * 1024;

/* حد رسالة Gmail هو 25 ميجابايت — نتحقق قبل الإرسال عشان الخطأ يكون مفهوماً */
const MAX_MAIL_BYTES = 24 * 1024 * 1024;

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: JSON_HEADERS });
}

function redirect(location, cookies) {
  const headers = new Headers({ Location: location });
  (cookies || []).forEach((c) => headers.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers });
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq < 0) continue;
    if (parts[i].slice(0, eq).trim() === name) {
      try { return decodeURIComponent(parts[i].slice(eq + 1).trim()); } catch (e) { return null; }
    }
  }
  return null;
}

function cookie(name, value, maxAge) {
  return name + '=' + encodeURIComponent(value) +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}

function configured(env) {
  return !!(env && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function originOf(request) {
  try { return new URL(request.url).origin; } catch (e) { return ''; }
}

/* ---------- D1 ---------- */
let schemaReady = false;

async function ensureSchema(db) {
  if (!db) {
    const e = new Error('قاعدة البيانات غير جاهزة بعد');
    e.code = 'DB_NOT_READY';
    throw e;
  }
  if (schemaReady) return;
  await db.exec(
    'CREATE TABLE IF NOT EXISTS google_connections (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'client_token TEXT UNIQUE NOT NULL, ' +
    'refresh_token TEXT NOT NULL, ' +
    "email TEXT DEFAULT '', " +
    "created_at TEXT DEFAULT (datetime('now'))" +
    ')'
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS google_settings (' +
    'k TEXT PRIMARY KEY, ' +
    "v TEXT NOT NULL DEFAULT ''" +
    ')'
  );
  schemaReady = true;
}

async function settingGet(db, k) {
  try {
    const r = await db.prepare('SELECT v FROM google_settings WHERE k = ?').bind(k).first();
    return r ? r.v : null;
  } catch (e) { return null; }
}

async function settingSet(db, k, v) {
  try {
    await db.prepare('INSERT INTO google_settings (k, v) VALUES (?, ?) ' +
      'ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
  } catch (e) { /* الإخفاق ما يوقفش المزامنة */ }
}

/* اشتراط اتصال صالح — يرمي خطأ برسالة عربية ورمز حالة مناسب */
async function requireConnection(request, env) {
  const tok = readCookie(request, 'gconn');
  if (!tok) { const e = new Error('لم يتم ربط حساب Google'); e.status = 401; throw e; }
  let conn;
  try {
    await ensureSchema(env.DB);
    conn = await findConnection(env.DB, tok);
  } catch (err) {
    if (err && err.status) throw err;
    const e = new Error((err && err.message) || 'قاعدة البيانات غير جاهزة'); e.status = 503; throw e;
  }
  if (!conn) { const e = new Error('الربط غير صالح — أعد الربط من جديد'); e.status = 401; throw e; }
  return conn;
}

/* ---------- فولدر المزامنة على Drive ---------- */
function escQuery(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

async function getOrCreateSyncFolder(env, at) {
  const cached = await settingGet(env.DB, 'sync_folder_id');
  if (cached) return cached;

  const q = "mimeType='application/vnd.google-apps.folder' and name='" +
    escQuery(SYNC_FOLDER_NAME) + "' and trashed=false";
  const lr = await fetch(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
    '&fields=files(id,name)&pageSize=1', { headers: { Authorization: 'Bearer ' + at } });
  const lj = await lr.json().catch(() => ({}));
  if (lj.files && lj.files[0] && lj.files[0].id) {
    await settingSet(env.DB, 'sync_folder_id', lj.files[0].id);
    return lj.files[0].id;
  }

  const cr = await fetch(DRIVE_FILES + '?fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: SYNC_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  const cj = await cr.json().catch(() => ({}));
  if (!cj.id) throw new Error((cj.error && cj.error.message) || 'تعذّر إنشاء فولدر المزامنة');
  await settingSet(env.DB, 'sync_folder_id', cj.id);
  return cj.id;
}

async function findSyncFile(at, folderId) {
  const q = "name='" + SYNC_FILE_NAME + "' and '" + folderId + "' in parents and trashed=false";
  const r = await fetch(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
    '&fields=files(id,name,modifiedTime,size)&pageSize=1', { headers: { Authorization: 'Bearer ' + at } });
  const j = await r.json().catch(() => ({}));
  return (j.files && j.files[0]) || null;
}

/** يرفع النسخة — يعدّل الملف القديم إن وُجد (درفايف بيسجّل مراجعة لكل تعديل) */
async function pushSyncFile(at, folderId, jsonText) {
  const existing = await findSyncFile(at, folderId);
  if (existing) {
    const r = await fetch(DRIVE_FILES + '/' + existing.id +
      '?uploadType=media&fields=id,name,modifiedTime,size', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
        body: jsonText
      });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'فشل تحديث نسخة المزامنة');
    return j;
  }

  const boundary = '-------gsync' + crypto.randomUUID().replace(/-/g, '');
  const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: [folderId],
    mimeType: 'application/json; charset=UTF-8' });
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    meta + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n';
  const tail = '\r\n--' + boundary + '--';
  const payload = new Blob([head, jsonText, tail], { type: 'multipart/related; boundary=' + boundary });

  const r = await fetch(DRIVE_FILES + '?uploadType=multipart&fields=id,name,modifiedTime,size', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: payload
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error((j.error && j.error.message) || 'فشل رفع نسخة المزامنة');
  return j;
}

async function findConnection(db, token) {
  if (!db || !token) return null;
  try {
    return await db.prepare('SELECT * FROM google_connections WHERE client_token = ?')
      .bind(token).first();
  } catch (e) { return null; }
}

/* ---------- بناء رسالة بريد MIME (نص + مرفق) ---------- */
function toBase64Utf8(s) {
  const bytes = new TextEncoder().encode(String(s == null ? '' : s));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* العنوان والاسم لازم يكونوا ASCII — نرمّزهم RFC2047 عشان العربية تظهر صح */
function rfc2047(s) {
  return '=?UTF-8?B?' + toBase64Utf8(s) + '?=';
}

function base64UrlFromAscii(ascii) {
  return btoa(ascii).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function foldB64(s) {
  return String(s || '').replace(/(.{76})/g, '$1\r\n');
}

/** يبني رسالة RFC822 كاملة (ASCII) جاهزة للإرسال كـ `raw` */
function buildMailMessage(o) {
  const boundary = '-----amwcode' + crypto.randomUUID().replace(/-/g, '');
  const parts = [
    'To: ' + o.to,
    'Subject: ' + rfc2047(o.subject),
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    foldB64(toBase64Utf8(o.text)),
    ''
  ];

  if (o.b64) {
    parts.push(
      '--' + boundary,
      'Content-Type: ' + o.mime + '; name="' + rfc2047(o.fileName) + '"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="' + rfc2047(o.fileName) + '"',
      '',
      foldB64(o.b64),
      ''
    );
  }

  parts.push('--' + boundary + '--', '');
  return parts.join('\r\n');
}

/* ---------- رموز الوصول ---------- */
const tokenCache = new Map();

async function accessToken(env, conn) {
  const key = String(conn.client_token);
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60000) return hit.tok;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || 'فشل تجديد رمز الوصول');
  }
  tokenCache.set(key, { tok: j.access_token, exp: Date.now() + (Number(j.expires_in || 3500) * 1000) });
  return j.access_token;
}

async function exchangeCode(env, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || 'فشل استبدال رمز التفويض');
  }
  return j;
}

async function fetchProfile(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    const j = await res.json().catch(() => ({}));
    return j.email || '';
  } catch (e) { return ''; }
}

/* ---------- مسارات API ---------- */
async function handleApi(request, env, pathname) {
  const origin = originOf(request);

  /* الحالة */
  if (pathname === '/api/google/status') {
    if (!configured(env)) return json({ configured: false, connected: false });
    const tok = readCookie(request, 'gconn');
    const conn = await findConnection(env.DB, tok);
    return json({ configured: true, connected: !!conn, email: conn ? (conn.email || '') : '' });
  }

  if (!configured(env)) {
    return json({ ok: false, error: 'لم يتم ضبط مفاتيح Google بعد (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' }, 503);
  }

  /* بدء الربط */
  if (pathname === '/api/google/login') {
    const state = crypto.randomUUID();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', origin + '/api/google/callback');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return redirect(url.toString(), [cookie('gstate', state, 600)]);
  }

  /* رجوع من Google */
  if (pathname === '/api/google/callback') {
    const u = new URL(request.url);
    const err = u.searchParams.get('error');
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    const saved = readCookie(request, 'gstate');

    if (err) return redirect('/?g=err&m=' + encodeURIComponent(err), [cookie('gstate', '', -1)]);
    if (!code) return redirect('/?g=err&m=' + encodeURIComponent('لم يصل رمز التفويض'), [cookie('gstate', '', -1)]);
    if (!saved || !state || saved !== state) {
      return redirect('/?g=err&m=' + encodeURIComponent('تحقّق الحالة غير صالح، حاول مرة أخرى'),
        [cookie('gstate', '', -1)]);
    }

    try {
      const tok = await exchangeCode(env, code, origin + '/api/google/callback');
      const email = await fetchProfile(tok.access_token);
      const clientToken = crypto.randomUUID();

      await ensureSchema(env.DB);
      await env.DB.prepare('DELETE FROM google_connections').run();
      await env.DB.prepare('INSERT INTO google_connections (client_token, refresh_token, email) VALUES (?, ?, ?)')
        .bind(clientToken, tok.refresh_token, email).run();

      if (tok.refresh_token) tokenCache.set(clientToken, {
        tok: tok.access_token,
        exp: Date.now() + (Number(tok.expires_in || 3500) * 1000)
      });

      return redirect('/?g=ok', [
        cookie('gstate', '', -1),
        cookie('gconn', clientToken, 60 * 60 * 24 * 365)
      ]);
    } catch (e) {
      return redirect('/?g=err&m=' + encodeURIComponent(e.message || 'فشل الربط'),
        [cookie('gstate', '', -1)]);
    }
  }

  /* رفع ملف */
  if (pathname === '/api/google/upload' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { body = null; }
    const name = body && body.name;
    const mime = (body && body.mime) || 'application/octet-stream';
    const b64 = body && body.b64;
    if (!name || !b64) return json({ ok: false, error: 'بيانات الملف ناقصة' }, 400);

    const tok = readCookie(request, 'gconn');
    if (!tok) return json({ ok: false, error: 'لم يتم ربط حساب Google' }, 401);

    let conn;
    try {
      await ensureSchema(env.DB);
      conn = await findConnection(env.DB, tok);
    } catch (e) {
      return json({ ok: false, error: e.message || 'قاعدة البيانات غير جاهزة' }, 503);
    }
    if (!conn) return json({ ok: false, error: 'الربط غير صالح — أعد الربط من جديد' }, 401);

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    let bytes;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (e) {
      return json({ ok: false, error: 'تعذّر قراءة محتوى الملف' }, 400);
    }

    const boundary = '-------gdrive' + crypto.randomUUID().replace(/-/g, '');
    const meta = JSON.stringify({ name: String(name), mimeType: mime });
    const head = '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--';

    const payload = new Blob([head, bytes, tail], { type: 'multipart/related; boundary=' + boundary });

    let res;
    try {
      res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + at,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: payload
      });
    } catch (e) {
      return json({ ok: false, error: 'تعذّر الوصول إلى Google Drive' }, 502);
    }

    const info = await res.json().catch(() => ({}));
    if (!res.ok || !info.id) {
      return json({ ok: false, error: (info.error && info.error.message) || 'فشل الرفع إلى Drive' },
        res.status >= 400 && res.status < 600 ? res.status : 502);
    }

    let link = '';
    try {
      const lr = await fetch('https://www.googleapis.com/drive/v3/files/' + info.id +
        '?fields=id,name,webViewLink', { headers: { Authorization: 'Bearer ' + at } });
      const lj = await lr.json().catch(() => ({}));
      link = lj.webViewLink || '';
    } catch (e) { /* الرابط اختياري */ }

    return json({ ok: true, id: info.id, name: info.name || name, link: link });
  }

  /* إرسال تنبيه بالبريد مع المرفق */
  if (pathname === '/api/google/notify' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { body = null; }
    const name = body && body.name;
    const mime = (body && body.mime) || 'application/octet-stream';
    const b64 = body && body.b64;
    const to = String((body && body.to) || '').trim();
    if (!name) return json({ ok: false, error: 'بيانات الملف ناقصة' }, 400);

    const tok = readCookie(request, 'gconn');
    if (!tok) return json({ ok: false, error: 'لم يتم ربط حساب Google' }, 401);

    let conn;
    try {
      await ensureSchema(env.DB);
      conn = await findConnection(env.DB, tok);
    } catch (e) {
      return json({ ok: false, error: e.message || 'قاعدة البيانات غير جاهزة' }, 503);
    }
    if (!conn) return json({ ok: false, error: 'الربط غير صالح — أعد الربط من جديد' }, 401);

    /* افتراضي: بريد الحساب المربوط نفسه */
    const target = to || String(conn.email || '').trim();
    if (!target) return json({ ok: false, error: 'حدّد بريد المستلم' }, 400);

    const approxBytes = b64 ? Math.floor(b64.length * 3 / 4) : 0;
    if (approxBytes > MAX_MAIL_BYTES) {
      return json({ ok: false, error: 'المرفق أكبر من حد Gmail (24 ميجابايت) — افتحه من Google Drive بالرابط' }, 413);
    }

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    const raw = base64UrlFromAscii(buildMailMessage({
      to: target,
      subject: 'تم رفع ملف: ' + name,
      text: 'تم رفع الملف «' + name + '» بنجاح إلى Google Drive من تطبيق نظام الإدارة.\n\n' +
        (body && body.link ? 'رابط الملف على Drive: ' + body.link + '\n\n' : '') +
        'الوقت: ' + new Date().toISOString() + '\n' +
        'مرفق لك نسخة من الملف مباشرة.',
      fileName: name,
      mime: mime,
      b64: b64 || ''
    }));

    let res;
    try {
      res = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ raw: raw })
      });
    } catch (e) {
      return json({ ok: false, error: 'تعذّر الوصول إلى Gmail' }, 502);
    }

    const info = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ ok: false, error: (info.error && info.error.message) || 'فشل إرسال البريد' },
        res.status >= 400 && res.status < 600 ? res.status : 502);
    }

    return json({ ok: true, to: target, id: info.id || '' });
  }

  /* ---- المزامنة: قراءة النسخة البعيدة ---- */
  if (pathname === '/api/sync/pull' && request.method === 'GET') {
    let conn;
    try { conn = await requireConnection(request, env); }
    catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    let folderId;
    try { folderId = await getOrCreateSyncFolder(env, at); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }

    let file;
    try { file = await findSyncFile(at, folderId); }
    catch (e) { return json({ ok: false, error: 'تعذّر قراءة فولدر المزامنة' }, 502); }

    if (!file) return json({ ok: true, exists: false, folderId: folderId });

    let snapshot = null;
    try {
      const rr = await fetch(DRIVE_FILES + '/' + file.id + '?alt=media',
        { headers: { Authorization: 'Bearer ' + at } });
      if (rr.ok) snapshot = await rr.json().catch(() => null);
    } catch (e) { /* نرجّع البيانات بدون المحتوى */ }

    return json({
      ok: true, exists: true, folderId: folderId,
      id: file.id, name: file.name || SYNC_FILE_NAME,
      modifiedTime: file.modifiedTime || '', size: Number(file.size || 0),
      updatedAt: (snapshot && snapshot.updatedAt) || '',
      device: (snapshot && snapshot.device) || '',
      snapshot: snapshot
    });
  }

  /* ---- المزامنة: رفع نسخة كاملة (+ تنبيه بريدي اختياري) ---- */
  if (pathname === '/api/sync/push' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { body = null; }
    const snapshot = body && body.snapshot;
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.sections) {
      return json({ ok: false, error: 'بيانات النسخة ناقصة' }, 400);
    }

    let conn;
    try { conn = await requireConnection(request, env); }
    catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    const jsonText = JSON.stringify(snapshot);
    if (jsonText.length > MAX_SYNC_BYTES) {
      return json({ ok: false, error: 'حجم النسخة أكبر من الحد المسموح (٨ ميجابايت)' }, 413);
    }

    let folderId;
    try { folderId = await getOrCreateSyncFolder(env, at); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }

    let info;
    try { info = await pushSyncFile(at, folderId, jsonText); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }

    /* تنبيه بالبريد — اختياري، وإخفاقه ما يفشلش الرفع */
    let emailed = false, emailedTo = '';
    if (body.sendEmail) {
      const to = String((body.to || '')).trim() || String(conn.email || '').trim();
      const changes = Array.isArray(body.changes) ? body.changes : [];
      if (to) {
        try {
          const raw = base64UrlFromAscii(buildMailMessage({
            to: to,
            subject: 'تم تحديث بيانات التطبيق',
            text: 'تم رفع نسخة جديدة من بيانات التطبيق إلى فولدر «' + SYNC_FOLDER_NAME + '» على Google Drive.\n\n' +
              'الوقت: ' + (info.modifiedTime || new Date().toISOString()) + '\n' +
              'الجهاز: ' + (snapshot.device || 'غير معروف') + '\n\n' +
              'التعديلات:\n' +
              (changes.length ? changes.map(function (c) { return '• ' + c; }).join('\n') : '• لا توجد تغييرات مسجّلة') +
              '\n\nلو حبيت ترجع لنسخة أقدم، افتح فولدر المزامنة واضغط على الملف ثم «نسخ سابقة» على Drive.'
          }));
          const mr = await fetch(GMAIL_SEND_URL, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ raw: raw })
          });
          emailed = !!mr.ok;
          if (mr.ok) emailedTo = to;
        } catch (e) { /* البريد اختياري */ }
      }
    }

    return json({
      ok: true, folderId: folderId, id: info.id || '',
      modifiedTime: info.modifiedTime || '', size: Number(info.size || 0),
      emailed: emailed, emailedTo: emailedTo
    });
  }

  /* فصل الربط */
  if (pathname === '/api/google/disconnect' && request.method === 'POST') {
    const tok = readCookie(request, 'gconn');
    try {
      if (tok && env.DB) {
        await ensureSchema(env.DB);
        await env.DB.prepare('DELETE FROM google_connections WHERE client_token = ?').bind(tok).run();
      }
    } catch (e) { /* نتابع لمسح الكوكي */ }
    tokenCache.delete(String(tok || ''));
    const clearHeaders = new Headers(JSON_HEADERS);
    clearHeaders.append('Set-Cookie', cookie('gconn', '', -1));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: clearHeaders });
  }

  return json({ ok: false, error: 'مسار غير معروف' }, 404);
}

export default {
  async fetch(request, env) {
    let pathname = '';
    try { pathname = new URL(request.url).pathname; } catch (e) { pathname = ''; }

    if (pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, pathname);
      } catch (e) {
        return json({ ok: false, error: e && e.message ? e.message : 'خطأ غير متوقع' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
