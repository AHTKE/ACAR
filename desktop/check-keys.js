/* ============================================================
   desktop/check-keys.js
   ------------------------------------------------------------
   فحص سريع لمفاتيح Google قبل البناء — من غير ما تفتح التطبيق:
     npm run desktop:check-keys

   بيقولك نفس اللي البناء هيستخدمه بالظبط (نفس قراءة المفاتيح
   والأولوية من google-keys.js)، وبيسأل Google عن المفتاح:
   سليم / محذوف / مش مطابق. السر مش بيتطبع.
   ============================================================ */
'use strict';

const path = require('path');
const keys = require('./google-keys');

const DEFAULT_REDIRECT = keys.DEFAULT_REDIRECT;

async function google(url, init) {
  const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(15000) : undefined;
  return fetch(url, Object.assign({ signal: ctl }, init || {}));
}

(async function main() {
  let resolved;
  try {
    resolved = keys.resolveForBuild({});
  } catch (e) {
    console.log('✖ ' + ((e && e.message) || e));
    process.exit(1);
  }

  const id = resolved.keys.client_id;
  const secret = resolved.keys.client_secret;
  const source = resolved.source === 'file'
    ? 'ملف ' + path.relative(process.cwd(), resolved.file)
    : 'متغيّرات البيئة';

  console.log('المصدر: ' + source);
  console.log('نوع العميل: ' + (resolved.keys.type || 'غير معروف'));
  console.log('Client ID: ' + keys.tail(id));
  console.log('صيغة الـID: ' + (keys.validateId(id) ? '✔ سليمة' : '✖ غير سليمة'));
  console.log('صيغة السر: ' + (keys.validateSecret(secret) ? '✔ سليمة' : '✖ غير سليمة') +
    ' (الطول ' + String(secret).length + ' — القيمة مش بتتطبع)');
  resolved.warnings.forEach(function (w) { console.log('⚠ ' + w); });

  let idProbe = '';
  try {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', id);
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
      client_id: id, client_secret: secret,
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
