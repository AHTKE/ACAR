/* اختبار ربط Google في الديسكتوب: OAuth محلي + تخزين على الجهاز */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47821;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-gtest-'));
process.env.NIZAM_DATA_DIR = DATA;
/* الاختبار ده بيغطّي الوضع المحلي (بدون الموقع) */
process.env.NIZAM_LINK_MODE = 'local';
/* مفاتيح وهمية بصيغة صحيحة — الاختبار مبيلمسش Google الحقيقي. */
process.env.NIZAM_GOOGLE_CLIENT_ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
process.env.NIZAM_GOOGLE_CLIENT_SECRET = 'GOCSPX-testsecret0123456789abcd';

/* محاكاة Google عشان الاختبار يشتغل من غير مفاتيح حقيقية. */
const realFetch = globalThis.fetch;
globalThis.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  if (u.indexOf('https://accounts.google.com') === 0) {
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:' + PORT + '/?error=login_required' }
    });
  }
  if (u.indexOf('https://oauth2.googleapis.com/token') === 0) {
    return new Response(JSON.stringify({ error: 'invalid_grant' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  return realFetch(url, opts);
};

const server = require('./desktop/server');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };
const base = 'http://127.0.0.1:' + PORT;

(async function () {
  const info = await server.start(PORT);
  ok('الخادم شغّال على المنفذ المطلوب', info.port === PORT, String(info.port));

  console.log('\n[1] الحالة');
  let r = await fetch(base + '/api/google/status');
  let j = await r.json();
  ok('الحالة 200', r.status === 200, String(r.status));
  ok('المفاتيح مقروءة', j.configured === true);
  ok('غير مربوط في البداية', j.connected === false);
  ok('رابط الإرجاع محلي', j.redirectUri === base + '/api/google/callback', j.redirectUri);
  ok('موسوم كنسخة ديسكتوب', j.desktop === true);

  console.log('\n[2] بدء الربط');
  r = await fetch(base + '/api/google/login', { redirect: 'manual' });
  ok('بيرجع تحويل', r.status === 302, String(r.status));
  const loc = r.headers.get('location') || '';
  const u = new URL(loc);
  ok('يروح لصفحة Google', u.hostname === 'accounts.google.com', u.hostname);
  ok('رابط الإرجاع loopback', u.searchParams.get('redirect_uri') === base + '/api/google/callback', u.searchParams.get('redirect_uri'));
  ok('فيه صلاحيات Drive', /auth\/drive/.test(u.searchParams.get('scope') || ''));
  ok('فيه access_type=offline', u.searchParams.get('access_type') === 'offline');
  const state = u.searchParams.get('state') || '';
  ok('فيه state', state.length > 10);

  console.log('\n[3] رجوع بحالة غلط');
  r = await fetch(base + '/api/google/callback?code=x&state=wrong', { redirect: 'manual' });
  ok('تحويل لرسالة خطأ', r.status === 302 && /g=err/.test(r.headers.get('location') || ''), r.headers.get('location'));
  j = await (await fetch(base + '/api/google/status')).json();
  ok('لسه مش مربوط', j.connected === false);

  console.log('\n[4] رجوع بحالة صح وكود وهمي');
  r = await fetch(base + '/api/google/callback?code=fake&state=' + encodeURIComponent(state), { redirect: 'manual' });
  const cl = r.headers.get('location') || '';
  ok('تحويل للرسالة المحلية', r.status === 302 && cl.indexOf(base + '/') === 0, cl);
  ok('بيقول فشل الاستبدال', /g=err/.test(cl), cl);

  console.log('\n[5] الرفع من غير ربط');
  r = await fetch(base + '/api/google/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.xlsx', b64: 'QQ==' })
  });
  j = await r.json();
  ok('401 مطلوب ربط', r.status === 401 && j.needsConnect === true, r.status + ' ' + JSON.stringify(j));

  console.log('\n[6] فحص المفاتيح مع Google');
  r = await fetch(base + '/api/google/check');
  j = await r.json();
  ok('الفحص رد 200', r.status === 200, String(r.status));
  ok('المفاتيح سليمة', j.verdict === 'keys_ok', j.verdict + ' | ' + JSON.stringify(j.idProbe) + ' | ' + JSON.stringify(j.secretProbe));
  ok('مافيش تسريب سر', JSON.stringify(j).indexOf('GOCSPX') < 0);

  console.log('\n[7] الفصل');
  r = await fetch(base + '/api/google/disconnect', { method: 'POST' });
  j = await r.json();
  ok('الفصل نجح', j.ok === true);
  ok('ملف الربط مش موجود', !fs.existsSync(path.join(DATA, 'google-auth.json')));

  console.log('\n[8] الحالة بعد الفصل');
  j = await (await fetch(base + '/api/google/status')).json();
  ok('غير مربوط', j.connected === false);

  await server.stop();
  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXC', e && e.message); process.exit(1); });
