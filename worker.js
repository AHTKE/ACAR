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

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send openid email';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/* فولدر المزامنة — يتخلق مرة واحدة على درايف المستخدم ويتخزّن معرّفه */
const SYNC_FOLDER_NAME = 'نظام الإدارة — المزامنة';
const SYNC_FILE_NAME = 'sync-latest.json';
/* حد أقصى لحجم النسخة المُصرّح به (٨ ميجا تكفي آلاف السجلات) */
const MAX_SYNC_BYTES = 8 * 1024 * 1024;

/* فولدر تصدير Excel/PDF — يتخلق مرة واحدة عند الحاجة */
const EXPORT_FOLDER_NAME = 'ملفات ال PDF و EXCEL تابع تطبيق نظام الاداره';

/* حد أقصى لعدد الملفات في فولدر المزامنة: الملف الحالي + نسخ مؤرشفة */
const MAX_SYNC_FILES = 50;

/* حد رسالة Gmail هو 25 ميجابايت — نتحقق قبل الإرسال عشان الخطأ يكون مفهوماً */
const MAX_MAIL_BYTES = 24 * 1024 * 1024;

function cleanNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    return v;
  }
  if (typeof v === 'object') {
    if (Array.isArray(v)) {
      return v.map(cleanNumber);
    }
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = cleanNumber(v[k]);
    }
    return out;
  }
  return v;
}

function cleanSnapshot(s) {
  if (!s) return s;
  // Replace NaN/Infinity with null, ensure all numbers are finite
  const cleaned = cleanNumber(s);
  // Ensure phone-like strings stay as strings (they may start with 0)
  // and convert any NaN-caused nulls back to 0 where appropriate
  return JSON.parse(JSON.stringify(cleaned));
}

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

/* تنظيف قيمة متغيّر بيئة: مسافات/أسطر/اقتباسات/محارف خفية بتفسد
   client_id وتخلّي Google يرد invalid_client رغم إن المفاتيح مضافة. */
function cleanEnvVal(v) {
  var s = String(v == null ? '' : v);
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/^[\s"'\u0060]+/, '').replace(/[\s"'\u0060]+$/, '');
  s = s.replace(/[\r\n\t]/g, '');
  return s.trim();
}

/* المفاتيح كما هي صالحة للاستخدام فعلاً (بعد التنظيف والتحقق) */
function googleCreds(env) {
  var id = cleanEnvVal(env && env.GOOGLE_CLIENT_ID);
  var secret = cleanEnvVal(env && env.GOOGLE_CLIENT_SECRET);
  var idValid = /^\d{6,}-[a-z0-9_-]{10,}\.apps\.googleusercontent\.com$/i.test(id);
  var secretValid = /^GOCSPX-[A-Za-z0-9_-]{8,}$/.test(secret) || secret.length >= 24;
  return {
    id: id,
    secret: secret,
    hasId: !!id,
    hasSecret: !!secret,
    idValid: !!idValid,
    secretValid: !!secretValid,
    configured: !!(id && secret),
    ready: !!(id && secret && idValid && secretValid)
  };
}

function configured(env) {
  return googleCreds(env).configured;
}

function originOf(request) {
  try { return new URL(request.url).origin; } catch (e) { return ''; }
}

/* رابط الإرجاع: نقدر نثبّته على دومين واحد عبر APP_BASE_URL
   (مهم على Vercel لأن روابط الـPreview بتتغير كل نشر). */
function originFor(request, env) {
  var forced = cleanEnvVal(env && (env.APP_BASE_URL || env.PUBLIC_ORIGIN || env.APP_ORIGIN));
  if (/^https?:\/\//i.test(forced)) return forced.replace(/\/+$/, '');
  return originOf(request);
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

/* استخراج معرّف الفولدر من رابط Google Drive أو نص خام */
function extractFolderId(input) {
  if (!input) return '';
  var s = String(input).trim();
  var m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return '';
}

async function getOrCreateSyncFolder(env, at) {
  const custom = await settingGet(env.DB, 'sync_custom_folder');
  if (custom) return custom;
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

  const cr = await fetch(DRIVE_FILES + '?fields=id&supportsAllDrives=true', {
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
    '&fields=files(id,name,modifiedTime,size,capabilities(canEdit))&pageSize=10&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + at } });
  const j = await r.json().catch(() => ({}));
  const files = (j.files && Array.isArray(j.files)) ? j.files : [];
  if (!files.length) return null;
  /* نفضّل الملف اللي الحساب الحالي يقدر يعدّله — القديم ممكن يكون منشأ بحساب آخر */
  const editable = files.find(function (f) {
    return !f.capabilities || f.capabilities.canEdit !== false;
  });
  return editable || files[0];
}

/* ---------- تشخيص صلاحيات المجلد — بدل رسالة جوجل الإنجليزية الغامضة ---------- */

/* يفحص المجلد: اسمه، صاحبه، وهل الحساب الحالي يقدر يكتب فيه */
async function folderAccessInfo(at, folderId) {
  try {
    const r = await fetch(DRIVE_FILES + '/' + folderId +
      '?fields=id,name,owners(emailAddress),capabilities(canEdit)&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + at } });
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json().catch(() => ({}));
    return {
      ok: true,
      name: j.name || '',
      owners: (j.owners || []).map((o) => o.emailAddress).filter(Boolean),
      canEdit: !!(j.capabilities && j.capabilities.canEdit)
    };
  } catch (e) {
    /* الفحص تكمّلي — ما نمنعش الرفع لو Google ما استجابش */
    return { ok: true, name: '', owners: [], canEdit: true, probeFailed: true };
  }
}

function isPermError(e) {
  return /permission|sufficient|403|forbidden|insufficient/i.test(String((e && e.message) || e || ''));
}

/* رفض بسبب الفولدر نفسه: غير موجود، محذوف، أو بدون صلاحية كتابة */
function isFolderError(info, status) {
  const msg = String((info && info.error && info.error.message) || '');
  return status === 403 || status === 404 || isPermError({ message: msg }) ||
    /not found|notFound|parent|badRequest|unable to resolve/i.test(msg);
}

/* رسالة عربية واضحة: مين الحساب، مين صاحب المجلد، وإيه الحل */
function permErrorMessage(conn, access, raw) {
  const acct = String((conn && conn.email) || '').trim() || 'الحساب المربوط';
  const owner = access && access.owners && access.owners.length ? access.owners.join('، ') : 'غير معروف';
  const name = access && access.name ? '«' + access.name + '»' : 'المجلد';
  if (access && access.canEdit === false) {
    return 'المجلد ' + name + ' مشترك مع الحساب الحالي بصلاحية «مشاهدة» فقط' +
      ' — الحساب المتصل: ' + acct + ' — صاحب المجلد: ' + owner +
      '. الحل: افتح المجلد على Google Drive ← زر «مشاركة» ← أضف ' + acct +
      ' بصلاحية «محرر»، أو اربط الحساب صاحب المجلد.';
  }
  return 'الحساب ' + acct + ' ما عندهش صلاحية كتابة في ' + name + ' (صاحبه: ' + owner + ')' +
    (raw ? ' — ' + raw : '') + '. تأكد من مشاركة المجلد بصلاحية «محرر».';
}

/* رسالة قراءة مجلد مرفوضة */
function readErrorMessage(conn, access) {
  const acct = String((conn && conn.email) || '').trim() || 'الحساب المربوط';
  const owner = access && access.owners && access.owners.length ? access.owners.join('، ') : 'غير معروف';
  const name = access && access.name ? '«' + access.name + '»' : 'المجلد';
  return 'تعذّر قراءة المجلد ' + name + ' — الحساب المتصل: ' + acct +
    ' — صاحب المجلد: ' + owner +
    '. تأكد إن المجلد مشترك مع هذا الحساب (على الأقل بصلاحية «قارئ») أو اربط الحساب صاحب المجلد.';
}

/* فولدر تصدير Excel/PDF — يتكوّن مرة واحدة ويُحفظ معرّفه (force = تجاهل الكاش وإعادة التحقق) */
async function getOrCreateExportFolder(env, at, force) {
  if (!force) {
    const cached = await settingGet(env.DB, 'export_folder_id');
    if (cached) return cached;
  }

  const q = "mimeType='application/vnd.google-apps.folder' and name='" +
    escQuery(EXPORT_FOLDER_NAME) + "' and trashed=false";
  const lr = await fetch(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
    '&fields=files(id,name)&pageSize=1', { headers: { Authorization: 'Bearer ' + at } });
  const lj = await lr.json().catch(() => ({}));
  if (lj.files && lj.files[0] && lj.files[0].id) {
    await settingSet(env.DB, 'export_folder_id', lj.files[0].id);
    return lj.files[0].id;
  }

  const cr = await fetch(DRIVE_FILES + '?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: EXPORT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  const cj = await cr.json().catch(() => ({}));
  if (!cj.id) throw new Error((cj.error && cj.error.message) || 'تعذّر إنشاء فولدر التصدير');
  await settingSet(env.DB, 'export_folder_id', cj.id);
  return cj.id;
}

/* ---------- الأرشفة: نسخ مؤرشفة بحد أقصى ٥٠ ملف ---------- */
function pad2(n) { return String(n).padStart(2, '0'); }

/* اسم النسخة المؤرشفة يحمل تاريخها بالكامل — يُفرز منها لاحقاً */
function versionName(d) {
  return 'نسخة ' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + '.' + pad2(d.getSeconds()) + '.json';
}

/* كل الملفات داخل فولدر المزامنة */
async function listSyncFiles(at, folderId) {
  const q = "'" + folderId + "' in parents and trashed=false";
  const r = await fetch(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
    '&fields=files(id,name,modifiedTime,size)&pageSize=1000&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + at } });
  const j = await r.json().catch(() => ({}));
  return (j.files && Array.isArray(j.files)) ? j.files : [];
}

/* ينشئ نسخة مؤرشفة بعد كل رفع ثم ينظّف الفولدر */
async function archiveVersion(at, folderId, jsonText) {
  const name = versionName(new Date());
  const boundary = '-------garch' + crypto.randomUUID().replace(/-/g, '');
  const meta = JSON.stringify({ name: name, parents: [folderId], mimeType: 'application/json; charset=UTF-8' });
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    meta + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n';
  const tail = '\r\n--' + boundary + '--';
  const payload = new Blob([head, jsonText, tail], { type: 'multipart/related; boundary=' + boundary });
  const r = await fetch(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: payload
  });
  await r.json().catch(() => ({}));
  /* فشل الأرشفة ما يوقفش الرفع — الملف الحالي اترفع */
  await pruneSyncFiles(at, folderId);
}

/* التنظيف: كل يوم ماضٍ يبقى بنسخة نهائية واحدة، والحد الكلي ٥٠ ملف */
async function pruneSyncFiles(at, folderId) {
  try {
    const files = await listSyncFiles(at, folderId);
    const now = new Date();
    const today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    const versions = files.filter(function (f) { return f.name !== SYNC_FILE_NAME; });
    const toDelete = [];

    /* ١) الأيام الماضية: نُبقي آخر نسخة لكل يوم فقط (النسخة النهائية) */
    const byDay = {};
    versions.forEach(function (f) {
      const m = String(f.name).match(/(\d{4}-\d{2}-\d{2})/);
      const day = m ? m[1] : String(f.modifiedTime || '').slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(f);
    });
    Object.keys(byDay).forEach(function (day) {
      if (day >= today) return;   /* يوم اليوم: تبقى كل نسخه */
      const list = byDay[day].sort(function (a, b) {
        return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
      });
      list.slice(1).forEach(function (f) { toDelete.push(f); });
    });

    /* ٢) الحد الكلي: الملف الحالي + ٤٩ نسخة كحد أقصى */
    const left = versions.filter(function (f) { return toDelete.indexOf(f) === -1; })
      .sort(function (a, b) {
        return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
      });
    left.slice(MAX_SYNC_FILES - 1).forEach(function (f) { toDelete.push(f); });

    for (const f of toDelete) {
      try {
        await fetch(DRIVE_FILES + '/' + f.id + '?supportsAllDrives=true', {
          method: 'DELETE', headers: { Authorization: 'Bearer ' + at }
        });
      } catch (e) { /* حذف فاشل لا يوقف المنطق */ }
    }
  } catch (e) { /* التنظيف تكمّلي */ }
}

/** يرفع النسخة — يعدّل الملف القديم إن وُجد، وإن تعذّر عليه التعديل يرفع ملفاً جديداً بدل ما يفشل الرفع */
async function pushSyncFile(at, folderId, jsonText) {
  const existing = await findSyncFile(at, folderId);
  const existingEditable = !!existing &&
    (!existing.capabilities || existing.capabilities.canEdit !== false);
  if (existingEditable) {
    const r = await fetch(DRIVE_UPLOAD + '/' + existing.id +
      '?uploadType=media&fields=id,name,modifiedTime,size&supportsAllDrives=true', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
        body: jsonText
      });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.id) return j;
    const msg = (j.error && j.error.message) || '';
    /* رفض صلاحيات على الملف القديم (منشأ بحساب آخر مثلاً) → نكمّل برفع ملف جديد */
    if (!msg || !isPermError({ message: msg })) {
      throw new Error(msg || 'فشل تحديث نسخة المزامنة');
    }
    /* كمّل بالأسفل: إنشاء ملف جديد باسم المزامنة */
  }

  const boundary = '-------gsync' + crypto.randomUUID().replace(/-/g, '');
  const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: [folderId],
    mimeType: 'application/json; charset=UTF-8' });
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    meta + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n';
  const tail = '\r\n--' + boundary + '--';
  const payload = new Blob([head, jsonText, tail], { type: 'multipart/related; boundary=' + boundary });

  const r = await fetch(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name,modifiedTime,size&supportsAllDrives=true', {
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
      client_id: googleCreds(env).id,
      client_secret: googleCreds(env).secret,
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
      client_id: googleCreds(env).id,
      client_secret: googleCreds(env).secret,
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

  /* الحالة + تشخيص المفاتيح (بدون أي كشف للسر) */
  if (pathname === '/api/google/status') {
    const c = googleCreds(env);
    const redirectUri = originFor(request, env) + '/api/google/callback';
    const diag = {
      configured: c.configured,
      connected: false,
      email: '',
      clientIdTail: c.id ? c.id.slice(-10) : '',
      clientIdLength: c.id.length,
      clientIdValid: c.idValid,
      secretPresent: c.hasSecret,
      secretValid: c.secretValid,
      redirectUri: redirectUri,
      origin: originFor(request, env),
      verdict: !c.configured ? 'missing_keys'
        : !c.idValid ? 'bad_client_id_format'
          : !c.secretValid ? 'bad_client_secret_format'
            : 'keys_ready'
    };
    if (!c.configured) return json(diag);
    const tok = readCookie(request, 'gconn');
    const conn = await findConnection(env.DB, tok);
    diag.connected = !!conn;
    diag.email = conn ? (conn.email || '') : '';
    return json(diag);
  }

  /* فحص فعلي للمفاتيح مع Google — يفرّق بين client_id و secret */
  if (pathname === '/api/google/check') {
    const c = googleCreds(env);
    const redirectUri = originFor(request, env) + '/api/google/callback';
    const out = {
      ok: true,
      verdict: '',
      clientId: c.id,
      clientIdValid: c.idValid,
      secretPresent: c.hasSecret,
      secretValid: c.secretValid,
      redirectUri: redirectUri,
      idProbe: null,
      secretProbe: null,
      advice: ''
    };

    if (!c.configured) {
      out.verdict = 'missing_keys';
      out.advice = 'الخادم لا يرى المتغيّرين أصلاً. أضفهما في Vercel ← Settings ← Environment Variables (Production و Preview) ثم اعمل Redeploy — الإضافات لا تُطبَّق على نشر قديم.';
      return json(out, 200);
    }
    if (!c.idValid) {
      out.verdict = 'bad_client_id_format';
      out.advice = 'قيمة GOOGLE_CLIENT_ID ليست بصيغة Google الصحيحة. لازم تنتهي بـ .apps.googleusercontent.com وبتبدأ بأرقام ثم شَرطة. انسخها من Google Cloud ← Clients ← OAuth client، وتأكد إنها اتلصقت كاملة بدون مسافات.';
      return json(out, 200);
    }

    /* 1) هل Google يعرف الـclient_id؟ (طلب تفويض بدون واجهة) */
    try {
      const u = new URL(AUTH_URL);
      u.searchParams.set('client_id', c.id);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', 'openid email');
      u.searchParams.set('prompt', 'none');
      const r = await fetch(u.toString(), { redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      let body = '';
      if (loc) {
        try {
          const lj = new URL(loc);
          body = (lj.searchParams.get('error') || '') + ' ' + (lj.searchParams.get('error_description') || '');
        } catch (e) { body = loc; }
      } else if (r.status >= 400) {
        body = (await r.text().catch(() => '')).slice(0, 6000);
      }
      const redirectToApp = /^https?:/i.test(loc) && loc.indexOf('accounts.google.com') === -1;
      const mismatch = /redirect_uri_mismatch/i.test(body) || /redirect_uri_mismatch/i.test(loc);
      const unknownClient = /invalid_client/i.test(body) || /OAuth client was not found/i.test(body) ||
        /deleted_client/i.test(body) || /unauthorized_client/i.test(body);
      out.idProbe = {
        status: r.status,
        redirected: redirectToApp,
        redirectUriMismatch: mismatch,
        clientNotFound: unknownClient
      };
    } catch (e) {
      out.idProbe = { status: 0, network: true, error: String((e && e.message) || e).slice(0, 200) };
    }

    /* 2) هل السر يطابق الـclient_id؟ (طلب توكن بكود وهمي) */
    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.id,
          client_secret: c.secret,
          code: 'diagnostic-probe',
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        }).toString()
      });
      const j = await res.json().catch(() => ({}));
      out.secretProbe = { status: res.status, error: j.error || '', description: j.error_description || '' };
    } catch (e) {
      out.secretProbe = { status: 0, network: true, error: String((e && e.message) || e).slice(0, 200) };
    }

    const ip = out.idProbe || {};
    const sp = out.secretProbe || {};
    if (ip.clientNotFound) {
      out.verdict = 'client_id_not_found';
      out.advice = 'Google لا يعرف هذا الـClient ID: إمّا اتشال من Google Cloud، أو من مشروع تاني، أو القيمة في Vercel مختلفة عن اللي في Google Cloud ← Clients. انسخ الـClient ID من نفس الـOAuth client اللي معاك سرّه.';
    } else if (ip.redirectUriMismatch) {
      out.verdict = 'redirect_uri_mismatch';
      out.advice = 'المفاتيح سليمة لكن رابط الإرجاع غير مسجّل. أضف بالحرف في Google Cloud ← Clients ← Authorized redirect URIs: ' + redirectUri;
    } else if (sp.error === 'invalid_client') {
      out.verdict = 'bad_client_secret';
      out.advice = 'الـClient ID صحيح لكن الـClient Secret لا يطابق. خد السر الحالي من Google Cloud ← Clients ← Client secret (أو أنشئ سر جديد) وحدّث GOOGLE_CLIENT_SECRET واعمل Redeploy.';
    } else if (sp.error === 'invalid_grant' || sp.error === 'invalid_request' || ip.redirected) {
      out.verdict = 'keys_ok';
      out.advice = 'المفاتيح صحيحة ومطابقة لـ Google. لو الربط لسه بيفشل، المشكلة في رابط الإرجاع أو في حساب Google نفسه (Test user / consent screen).';
    } else if (sp.error) {
      out.verdict = 'google_error';
      out.advice = 'Google رد بخطأ: ' + sp.error + (sp.description ? ' — ' + sp.description : '');
    } else {
      out.verdict = 'unknown';
      out.advice = 'ما قدرناش نحدّد السبب — جرّب تعمل Redeploy وتتأكد إن المتغيّرين في Production.';
    }
    return json(out, 200);
  }

  if (!configured(env)) {
    return json({ ok: false, error: 'لم يتم ضبط مفاتيح Google بعد (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' }, 503);
  }

  /* بدء الربط */
  if (pathname === '/api/google/login') {
    const creds = googleCreds(env);
    const redirectUri = originFor(request, env) + '/api/google/callback';

    /* ما نبعتش المستخدم لصفحة خطأ جوجل: نفحص الـclient_id الأول */
    var early = '';
    if (!creds.idValid) {
      early = 'GOOGLE_CLIENT_ID في Vercel غير صالح — لازم ينتهي بـ .apps.googleusercontent.com (طوله الحالي ' +
        creds.id.length + ' حرف). انسخه كامل من Google Cloud ← Clients ثم أعد النشر.';
    } else {
      try {
        const probe = new URL(AUTH_URL);
        probe.searchParams.set('client_id', creds.id);
        probe.searchParams.set('redirect_uri', redirectUri);
        probe.searchParams.set('response_type', 'code');
        probe.searchParams.set('scope', 'openid email');
        probe.searchParams.set('prompt', 'none');
        const pr = await fetch(probe.toString(), { redirect: 'manual' });
        const ploc = pr.headers.get('location') || '';
        let pbody = '';
        if (!ploc && pr.status >= 400) pbody = (await pr.text().catch(() => '')).slice(0, 6000);
        if (/invalid_client/i.test(pbody) || /OAuth client was not found/i.test(pbody) || /deleted_client/i.test(pbody)) {
          early = 'Google لا يعرف الـClient ID الموجود في Vercel (' +
            creds.id.slice(-10) + ') — إمّا محذوف أو من مشروع تاني. راجع Google Cloud ← Clients وانسخ الـClient ID والسر من نفس العميل.';
        } else if (/redirect_uri_mismatch/i.test(ploc) || /redirect_uri_mismatch/i.test(pbody)) {
          early = 'رابط الإرجاع غير مسجّل في Google Cloud. أضف: ' + redirectUri;
        }
      } catch (e) { /* فحص الشبكة فشل — نكمل عادي */ }
    }
    if (early) return redirect('/?g=err&m=' + encodeURIComponent(early), []);

    const state = crypto.randomUUID();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', creds.id);
    url.searchParams.set('redirect_uri', redirectUri);
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

    if (err) {
      const desc = u.searchParams.get('error_description') || '';
      const errText = err === 'access_denied'
        ? 'تم إلغاء منح الإذن من حساب Google (access_denied) — جرّب تختار حسابك وتضغط «السماح».'
        : 'Google رد بخطأ: ' + err + (desc ? ' — ' + desc : '');
      return redirect('/?g=err&m=' + encodeURIComponent(errText), [cookie('gstate', '', -1)]);
    }
    if (!code) return redirect('/?g=err&m=' + encodeURIComponent('لم يصل رمز التفويض'), [cookie('gstate', '', -1)]);
    if (!saved || !state || saved !== state) {
      return redirect('/?g=err&m=' + encodeURIComponent('تحقّق الحالة غير صالح، حاول مرة أخرى'),
        [cookie('gstate', '', -1)]);
    }

    try {
      const tok = await exchangeCode(env, code, originFor(request, env) + '/api/google/callback');
      const receivedRefresh = !!tok.refresh_token;
      const email = await fetchProfile(tok.access_token);
      let clientToken = crypto.randomUUID();

      await ensureSchema(env.DB);
      /* حذف اتصال المزامنة الحالي فقط — لا نحذف جلسات الأعضاء الآخرين */
      if (receivedRefresh) {
        await env.DB.prepare('DELETE FROM google_connections WHERE refresh_token = ?')
          .bind(tok.refresh_token).run();
      } else {
        /* Google لم يُعد refresh_token: نجدّد ونحدّث اتصالنا الحالي إن وُجد */
        const existing = await env.DB.prepare('SELECT client_token FROM google_connections LIMIT 1').first();
        if (existing) {
          await env.DB.prepare('UPDATE google_connections SET email = ?, updated_at = ? WHERE client_token = ?')
            .bind(email, Date.now(), existing.client_token).run();
        }
        clientToken = existing ? existing.client_token : clientToken;
      }
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

    /* وجهة الرفع: مجلد التصدير المخصص أو بدون مجلد */
    let parentId = '';
    if (String((body && body.dest) || '') === 'folder') {
      try { parentId = await getOrCreateExportFolder(env, at); }
      catch (e) {
        return json({ ok: false, error: 'تعذّر تجهيز فولدر التصدير: ' + e.message }, 502);
      }
    }

    let bytes;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (e) {
      return json({ ok: false, error: 'تعذّر قراءة محتوى الملف' }, 400);
    }

    const boundary = '-------gdrive' + crypto.randomUUID().replace(/-/g, '');
    const headFor = (m) => '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' + m + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n';
    const tail = '\r\n--' + boundary + '--';
    const metaOf = (p) => JSON.stringify(p
      ? { name: String(name), mimeType: mime, parents: [p] }
      : { name: String(name), mimeType: mime });
    const drivePost = async (m) => {
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + at,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: new Blob([headFor(m), bytes, tail], { type: 'multipart/related; boundary=' + boundary })
      });
      const j = await r.json().catch(() => ({}));
      return { r: r, j: j };
    };

    let res;
    let info;
    let inFolder = true;
    try {
      const first = await drivePost(metaOf(parentId));
      res = first.r;
      info = first.j;
    } catch (e) {
      return json({ ok: false, error: 'تعذّر الوصول إلى Google Drive' }, 502);
    }

    /* الفولدر مش موجود أو بدون صلاحية → نمسح الكاش ونبحث/نعمله من جديد ونعيد الرفع فيه */
    if ((!res.ok || !info.id) && parentId && isFolderError(info, res.status)) {
      try {
        await settingSet(env.DB, 'export_folder_id', '');
        const fresh = await getOrCreateExportFolder(env, at, true);
        if (fresh && fresh !== parentId) {
          parentId = fresh;
          const again = await drivePost(metaOf(parentId));
          res = again.r;
          info = again.j;
          inFolder = !!(res.ok && info.id);
        }
      } catch (e) { /* نكمل الفحص تحت */ }
    }

    /* لسه مرفوض → نرفع الملف للحساب نفسه ونرجّع رابطه بدل ما نرمي خطأ */
    if ((!res.ok || !info.id) && parentId && isFolderError(info, res.status)) {
      try {
        const again = await drivePost(metaOf(''));
        res = again.r;
        info = again.j;
        inFolder = false;
      } catch (e) { /* يبقى الخطأ الأصلي تحت */ }
    }

    if (!res.ok || !info.id) {
      return json({ ok: false, error: (info.error && info.error.message) || 'فشل الرفع إلى Drive' },
        res.status >= 400 && res.status < 600 ? res.status : 502);
    }

    let link = '';
    try {
      const lr = await fetch('https://www.googleapis.com/drive/v3/files/' + info.id +
        '?fields=id,name,webViewLink&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + at } });
      const lj = await lr.json().catch(() => ({}));
      link = lj.webViewLink || '';
    } catch (e) { /* الرابط اختياري */ }

    return json({ ok: true, id: info.id, name: info.name || name, link: link, inFolder: inFolder });
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

    /* فحص الوصول للمجلد — رسالة عربية واضحة لو القراءة مرفوضة */
    const access = await folderAccessInfo(at, folderId);
    if (access.ok === false && (access.status === 403 || access.status === 404)) {
      if (access.status === 404) {
        return json({ ok: false, code: 'PERM',
          error: 'المجلد غير موجود أو حُذف — تأكد من رابط المجلد العام في الإعدادات' }, 404);
      }
      return json({ ok: false, code: 'PERM', error: readErrorMessage(conn, access) }, 403);
    }

    let file;
    try { file = await findSyncFile(at, folderId); }
    catch (e) {
      if (isPermError(e)) {
        return json({ ok: false, code: 'PERM', error: readErrorMessage(conn, access) }, 403);
      }
      return json({ ok: false, error: 'تعذّر قراءة فولدر المزامنة' }, 502);
    }

    if (!file) return json({ ok: true, exists: false, folderId: folderId });

    let snapshot = null;
    try {
      const rr = await fetch(DRIVE_FILES + '/' + file.id + '?alt=media&supportsAllDrives=true',
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

    const jsonText = JSON.stringify(cleanSnapshot(snapshot));
    if (jsonText.length > MAX_SYNC_BYTES) {
      return json({ ok: false, error: 'حجم النسخة أكبر من الحد المسموح (٨ ميجابايت)' }, 413);
    }

    let folderId;
    try { folderId = await getOrCreateSyncFolder(env, at); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }

    /* فحص الصلاحية قبل الكتابة — رسالة عربية واضحة بدل خطأ جوجل العام */
    const access = await folderAccessInfo(at, folderId);
    if (access.ok === false && (access.status === 403 || access.status === 404)) {
      if (access.status === 404) {
        return json({ ok: false, code: 'PERM',
          error: 'المجلد غير موجود أو حُذف — تأكد من رابط المجلد العام في الإعدادات' }, 404);
      }
      return json({ ok: false, code: 'PERM',
        error: permErrorMessage(conn, { canEdit: false, owners: [], name: '' }, '') }, 403);
    }
    if (access.ok && access.canEdit === false) {
      return json({ ok: false, code: 'PERM', error: permErrorMessage(conn, access, '') }, 403);
    }

    let info;
    try {
      info = await pushSyncFile(at, folderId, jsonText);
    } catch (e) {
      /* رفض صلاحيات من Google أثناء الكتابة → رسالة مفصّلة */
      if (isPermError(e)) {
        return json({ ok: false, code: 'PERM', error: permErrorMessage(conn, access, e.message) }, 403);
      }
      /* فشل آخر — لو المجلد المخصص نرجع للمجلد التلقائي للحساب */
      const custom = await settingGet(env.DB, 'sync_custom_folder');
      if (custom && folderId === custom) {
        try {
          const autoFolder = await settingGet(env.DB, 'sync_folder_id');
          if (autoFolder) {
            info = await pushSyncFile(at, autoFolder, jsonText);
            folderId = autoFolder;
          } else {
            throw e;
          }
        } catch (e2) {
          if (isPermError(e2)) {
            return json({ ok: false, code: 'PERM', error: permErrorMessage(conn, access, e2.message) }, 403);
          }
          return json({ ok: false, error: e2.message }, 502);
        }
      } else {
        return json({ ok: false, error: e.message }, 502);
      }
    }

    /* أرشفة نسخة مؤرشفة بملف تاريخي — فشلها ما يفشلش الرفع */
    let archived = false;
    try { await archiveVersion(at, folderId, jsonText); archived = true; }
    catch (e) { /* الأرشفة تكمّلي */ }

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
      archived: archived, emailed: emailed, emailedTo: emailedTo
    });
  }

  /* ---- المزامنة: إعداد الفولدر المشترك ---- */
  if (pathname === '/api/sync/folder') {
    if (request.method === 'GET') {
      let conn;
      try { conn = await requireConnection(request, env); }
      catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }
      const custom = await settingGet(env.DB, 'sync_custom_folder');
      const auto = await settingGet(env.DB, 'sync_folder_id');
      return json({ ok: true, customFolder: custom || '', autoFolder: auto || '' });
    }
    if (request.method === 'POST') {
      let conn;
      try { conn = await requireConnection(request, env); }
      catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const folderId = extractFolderId(body && body.folderId);
      if (!folderId) return json({ ok: false, error: 'رابط الفولدر غير صالح — تأكد إنه رابط Google Drive صحيح' }, 400);
      await settingSet(env.DB, 'sync_custom_folder', folderId);
      /* نتأكد إن القيمة اتحفظت فعلاً — مانرجّعش نجاح وهمي */
      const saved = await settingGet(env.DB, 'sync_custom_folder');
      if (String(saved || '') !== folderId) {
        return json({ ok: false, error: 'تعذّر حفظ الفولدر في قاعدة البيانات — حاول مرة أخرى' }, 500);
      }
      return json({ ok: true, folderId: folderId });
    }
    return json({ ok: false, error: 'طريقة غير مسموحة' }, 405);
  }

  /* ---- المزامنة: لائحة النسخ المحفوظة ---- */
  if (pathname === '/api/sync/versions' && request.method === 'GET') {
    let conn;
    try { conn = await requireConnection(request, env); }
    catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    let folderId;
    try { folderId = await getOrCreateSyncFolder(env, at); }
    catch (e) { return json({ ok: false, error: e.message }, 502); }

    /* فحص الوصول — نفس رسالة التشخيص العربية */
    const access = await folderAccessInfo(at, folderId);
    if (access.ok === false && (access.status === 403 || access.status === 404)) {
      if (access.status === 404) {
        return json({ ok: false, code: 'PERM',
          error: 'المجلد غير موجود أو حُذف — تأكد من رابط المجلد العام في الإعدادات' }, 404);
      }
      return json({ ok: false, code: 'PERM', error: readErrorMessage(conn, access) }, 403);
    }

    let files;
    try { files = await listSyncFiles(at, folderId); }
    catch (e) { return json({ ok: false, error: 'تعذّر قراءة فولدر المزامنة' }, 502); }

    const latest = files.find(function (f) { return f.name === SYNC_FILE_NAME; }) || null;
    const versions = files.filter(function (f) { return f.name !== SYNC_FILE_NAME; })
      .sort(function (a, b) {
        return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
      })
      .map(function (f) {
        return {
          id: f.id, name: f.name,
          modifiedTime: f.modifiedTime || '',
          size: Number(f.size || 0)
        };
      });

    return json({
      ok: true, folderId: folderId,
      latest: latest ? {
        id: latest.id, name: latest.name,
        modifiedTime: latest.modifiedTime || '', size: Number(latest.size || 0)
      } : null,
      versions: versions, count: versions.length, max: MAX_SYNC_FILES
    });
  }

  /* ---- المزامنة: قراءة محتوى نسخة مؤرشفة ---- */
  if (pathname === '/api/sync/version' && request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return json({ ok: false, error: 'معرّف النسخة غير صالح' }, 400);
    }

    let conn;
    try { conn = await requireConnection(request, env); }
    catch (e) { return json({ ok: false, error: e.message }, e.status || 500); }

    let at;
    try { at = await accessToken(env, conn); }
    catch (e) { return json({ ok: false, error: 'انتهت صلاحية الربط: ' + e.message }, 401); }

    /* نتأكد إن الملف فعلاً داخل فولدر المزامنة واسمه من صيغتنا */
    let meta;
    try {
      const mr = await fetch(DRIVE_FILES + '/' + id + '?fields=id,name,parents,trashed',
        { headers: { Authorization: 'Bearer ' + at } });
      meta = await mr.json().catch(() => ({}));
    } catch (e) { meta = {}; }

    const inSyncFolder = meta && !meta.trashed && meta.name &&
      (meta.name === SYNC_FILE_NAME || meta.name.indexOf('نسخة ') === 0);
    if (!inSyncFolder) return json({ ok: false, error: 'النسخة غير موجودة أو حُذفت' }, 404);

    let snapshot = null;
    try {
      const rr = await fetch(DRIVE_FILES + '/' + id + '?alt=media',
        { headers: { Authorization: 'Bearer ' + at } });
      if (rr.ok) snapshot = await rr.json().catch(() => null);
    } catch (e) { snapshot = null; }

    if (!snapshot || typeof snapshot !== 'object' || !snapshot.sections) {
      return json({ ok: false, error: 'محتوى النسخة غير صالح' }, 422);
    }

    return json({
      ok: true, id: id, name: meta.name || '',
      updatedAt: snapshot.updatedAt || '', device: snapshot.device || '',
      counts: snapshot.counts || {}, snapshot: snapshot
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
