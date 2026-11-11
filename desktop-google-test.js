/* ============================================================
   desktop-google-test.js — اختبار ربط Google من النسخة المكتبية
   ------------------------------------------------------------
   • عميل Desktop: رابط الإرجاع على 127.0.0.1 مقبول من غير تسجيل.
   • الموقع بيستخدم مفاتيحه المنشورة (env) فقط، ومش بيقبل مفاتيح
     من هيدرز الطلب.
   • أي redirect_uri خارج loopback بيترفض (حماية من open redirect).

   المفاتيح هنا وهمية بصيغة صحيحة فقط — مفيش أي سر حقيقي في الملف.
   التشغيل: node desktop-google-test.js
   ============================================================ */
'use strict';

const ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
const SECRET = 'test-only-secret-0123456789abcdef';
const LOCAL = 'http://127.0.0.1:47820/api/google/callback';
const SITE = 'https://site.test';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

/* اعتراض نداءات Google: التفويض يرجّع 302 لرابط الإرجاع */
let lastAuthUrl = '';
const realFetch = global.fetch;
global.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  if (u.indexOf('accounts.google.com') === 0 || u.indexOf('https://accounts.google.com') === 0) {
    lastAuthUrl = u;
    const q = new URL(u).searchParams;
    return new Response(null, {
      status: 302,
      headers: { location: q.get('redirect_uri') + '?error=interaction_required' }
    });
  }
  return realFetch(url, opts);
};

(async () => {
  const worker = (await import('./worker.js')).default;
  const env = {
    GOOGLE_CLIENT_ID: ID,
    GOOGLE_CLIENT_SECRET: SECRET,
    ASSETS: { fetch: () => new Response('assets') }
  };
  const noKeys = Object.assign({}, env, { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });

  console.log('\n[1] الديسكتوب يمرّر رابط إرجاع loopback والموقع يستخدم مفاتيحه');
  let r = await worker.fetch(new Request(
    SITE + '/api/google/login?redirect_uri=' + encodeURIComponent(LOCAL)), env);
  ok('رد بتحويل (302)', r.status === 302, r.status);
  let loc = r.headers.get('location') || '';
  ok('التحويل على Google', loc.indexOf('accounts.google.com') > -1, loc.slice(0, 60));
  const q = new URL(loc).searchParams;
  ok('client_id = مفاتيح الموقع', q.get('client_id') === ID, q.get('client_id'));
  ok('redirect_uri = 127.0.0.1', q.get('redirect_uri') === LOCAL, q.get('redirect_uri'));
  ok('فيه scope للدرايف', String(q.get('scope')).indexOf('drive') > -1, q.get('scope'));
  ok('فيه state', !!q.get('state'));
  const stateCookie = (r.headers.get('set-cookie') || '');
  ok('كوكي الحالة اتبعتت', stateCookie.indexOf('gstate=') > -1, stateCookie.slice(0, 40));

  console.log('\n[2] نفس المسار من الموقع يستخدم مفاتيح الموقع');
  r = await worker.fetch(new Request(SITE + '/api/google/login'), noKeys);
  const noKeysLoc = String(r.headers.get('location') || '');
  ok('بدون مفاتيح الموقع → رسالة عربية بدل صفحة جوجل',
    r.status === 302 && noKeysLoc.indexOf('/?g=err') === 0 && decodeURIComponent(noKeysLoc).indexOf('مفاتيح Google') > -1,
    r.status + ' ' + noKeysLoc);

  r = await worker.fetch(new Request(SITE + '/api/google/login'), env);
  const q2 = new URL(r.headers.get('location') || 'https://x/').searchParams;
  ok('لما مفيش redirect_uri → دومين الموقع', q2.get('redirect_uri') === SITE + '/api/google/callback', q2.get('redirect_uri'));

  console.log('\n[3] redirect_uri خارج loopback مرفوض');
  r = await worker.fetch(new Request(
    SITE + '/api/google/login?redirect_uri=' + encodeURIComponent('https://evil.example/cb')), env);
  const q3 = new URL(r.headers.get('location') || 'https://x/').searchParams;
  ok('بيرجع لدومين الموقع مش للخارج', q3.get('redirect_uri') === SITE + '/api/google/callback', q3.get('redirect_uri'));

  console.log('\n[4] localhost بدون منفذ مقبول');
  r = await worker.fetch(new Request(
    SITE + '/api/google/login?redirect_uri=' + encodeURIComponent('http://localhost/api/google/callback')), env);
  const q4 = new URL(r.headers.get('location') || 'https://x/').searchParams;
  ok('localhost مقبول', q4.get('redirect_uri') === 'http://localhost/api/google/callback', q4.get('redirect_uri'));

  console.log('\n[5] capabilities ما بتدعيش دعم الموقع من غير مفاتيح');
  r = await worker.fetch(new Request(SITE + '/api/google/capabilities'), noKeys);
  let cap = await r.json();
  ok('desktopLink=false من غير مفاتيح', cap && cap.desktopLink === false, JSON.stringify(cap));
  r = await worker.fetch(new Request(SITE + '/api/google/capabilities'), env);
  cap = await r.json();
  ok('desktopLink=true بالمفاتيح', cap && cap.desktopLink === true, JSON.stringify(cap));

  console.log('\n' + '='.repeat(50));
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('='.repeat(50));
  process.exit(fail ? 1 : 0);
})();
