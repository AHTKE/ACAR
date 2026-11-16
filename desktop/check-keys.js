/* ============================================================
   desktop/check-keys.js
   ------------------------------------------------------------
   فحص سريع لمفاتيح Google قبل/بعد البناء — من غير ما تفتح التطبيق:
     npm run desktop:check-keys

   بيقولك:
     • البناء هياخد المفتاح من فين (ملف ولا متغيّرات بيئة)
     • آخر جزء من الـClient ID (تقدر تقارنه بـ Google Cloud)
     • Google شايف المفتاح ده إيه: سليم / محذوف / مش مطابق

   ما بيطبعش الـClient Secret نهائيًا.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REDIRECT = 'http://127.0.0.1:47820/api/google/callback';
const ID_RE = /^\d{6,}-[a-z0-9_-]{10,}\.apps\.googleusercontent\.com$/i;
const SECRET_RE = /^GOCSPX-[A-Za-z0-9_-]{8,}$/;

function clean(v) {
  return String(v == null ? '' : v)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s"'`]+/, '')
    .replace(/[\s"'`]+$/, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

function normalize(data) {
  if (!data || typeof data !== 'object') return {};
  const inner = data.installed || data.web;
  const base = inner && typeof inner === 'object' ? Object.assign({}, data, inner) : data;
  return {
    client_id: clean(base.client_id),
    client_secret: clean(base.client_secret),
    type: data.installed ? 'Desktop app' : data.web ? 'Web application' : 'غير معروف',
    redirect_uris: Array.isArray(base.redirect_uris) ? base.redirect_uris : []
  };
}

function resolveKeys() {
  const file = process.env.NIZAM_GOOGLE_CLIENT_FILE || path.join(__dirname, 'google-client.json');
  if (fs.existsSync(file)) {
    try {
      const norm = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (norm.client_id && norm.client_secret) {
        return Object.assign({ source: 'ملف ' + path.relative(process.cwd(), file) }, norm);
      }
    } catch (e) { /* نكمل بالبيئة */ }
  }
  const id = clean(process.env.NIZAM_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
  const secret = clean(process.env.NIZAM_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);
  if (id && secret) return { source: 'متغيّرات البيئة', client_id: id, client_secret: secret, type: 'غير معروف' };
  return null;
}

const tail = (id) => { const v = String(id).split('.')[0]; return v.length > 20 ? v.slice(0, 13) + '…' + v.slice(-6) : v; };

async function google(url, init) {
  const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(15000) : undefined;
  return fetch(url, Object.assign({ signal: ctl }, init || {}));
}

(async function main() {
  const k = resolveKeys();
  if (!k) {
    console.log('✖ مفيش مفاتيح: لا desktop/google-client.json ولا NIZAM_GOOGLE_CLIENT_ID/SECRET.');
    process.exit(1);
  }
  console.log('المصدر: ' + k.source);
  console.log('نوع العميل: ' + k.type);
  console.log('Client ID: ' + tail(k.client_id));
  console.log('صيغة الـID: ' + (ID_RE.test(k.client_id) ? '✔ سليمة' : '✖ غير سليمة'));
  console.log('صيغة السر: ' + (SECRET_RE.test(k.client_secret) ? '✔ سليمة' : '✖ غير سليمة') +
    ' (الطول ' + String(k.client_secret).length + ' — القيمة مش بتتطبع)');

  let idProbe = '';
  try {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', k.client_id);
    u.searchParams.set('redirect_uri', DEFAULT_REDIRECT);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    const r = await google(u.toString(), { redirect: 'manual' });
    const loc = String(r.headers.get('location') || '');
    if (/redirect_uri_mismatch/i.test(loc)) idProbe = 'redirect_uri_mismatch';
    else if (/invalid_client|deleted_client|OAuth client was (not found|deleted)/i.test(loc)) idProbe = 'client_id_not_found';
    else idProbe = 'ok';
  } catch (e) { idProbe = 'network'; }

  let token = { error: '', description: '' };
  try {
    const body = new URLSearchParams({
      client_id: k.client_id, client_secret: k.client_secret,
      code: 'diagnostic-probe', grant_type: 'authorization_code',
      redirect_uri: DEFAULT_REDIRECT
    });
    const r = await google('https://oauth2.googleapis.com/token', {
      method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }
    });
    const j = await r.json().catch(() => ({}));
    token = { error: String(j.error || ''), description: String(j.error_description || '') };
  } catch (e) { token = { error: 'network', description: String((e && e.message) || e) }; }

  console.log('فحص Google للـClient ID: ' + (
    idProbe === 'ok' ? '✔ معروف' :
      idProbe === 'redirect_uri_mismatch' ? '⚠ رابط الإرجاع غير مسجّل (مشكلة في عميل Web application)' :
        idProbe === 'client_id_not_found' ? '✖ Google مش عارفه' : 'تعذّر (شبكة)'));

  const desc = token.description || token.error || '';
  let verdict = 'unknown';
  if (token.error === 'invalid_grant') verdict = 'keys_ok';
  else if (/deleted_client|OAuth client was deleted/i.test(desc)) verdict = 'client_deleted';
  else if (/invalid_client|unauthorized_client|client_secret/i.test(desc)) verdict = 'bad_client_secret';
  else if (idProbe === 'client_id_not_found') verdict = 'client_id_not_found';
  else if (idProbe === 'redirect_uri_mismatch') verdict = 'redirect_uri_mismatch';
  else if (token.error === 'network' || idProbe === 'network') verdict = 'network';

  const advice = {
    keys_ok: 'المفتاحين سليمين ومطابقين لـGoogle — الربط مفروض يشتغل.',
    client_deleted: 'العميل ده محذوف من Google Cloud — أنشئ OAuth client جديد من نوع Desktop app وحطّ ملفه في desktop/google-client.json.',
    bad_client_secret: 'الـClient Secret مش مطابق للـClient ID — انسخ السر الجديد كامل من Google Cloud.',
    client_id_not_found: 'Google مش عارف الـClient ID ده — راجع إنك نسخته كامل من العميل الصح.',
    redirect_uri_mismatch: 'العميل من نوع Web application ومسجّلش رابط الإرجاع — للديسكتوب استخدم عميل Desktop app.',
    network: 'تعذّر الوصول لـGoogle من الجهاز (شبكة/بروكسي) — جرّب تاني.',
    unknown: 'رد غير متوقع من Google: ' + desc
  }[verdict];

  console.log('نتيجة Google: ' + (desc || '—'));
  console.log('');
  console.log((verdict === 'keys_ok' ? '✔ ' : '✖ ') + advice);
  process.exit(verdict === 'keys_ok' ? 0 : 1);
})().catch((e) => {
  console.log('✖ فشل الفحص: ' + ((e && e.message) || e));
  process.exit(1);
});
