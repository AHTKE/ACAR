/* اختبار ربط Google عبر الموقع الرسمي:
   التطبيق يفتح ربط الموقع → الموقع يرجع رمز التجديد للـ loopback →
   التطبيق يجدّد رمز الوصول من الموقع.
   بيستخدم خادم موقع وهمي محلي (مش بيلمس Google الحقيقي). */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const PORT = 47831;
const SITE_PORT = 47832;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-site-gtest-'));

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };

/* ---------- أدوات الموقع الوهمي ---------- */
const site = {
  capable: true,
  tokenStatus: 200,
  tokenBody: { ok: true, access_token: 'site-access-token', expires_in: 3500 },
  lastTokenRequest: null,
  calls: []
};

const siteServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  site.calls.push(req.method + ' ' + u.pathname + u.search);

  if (u.pathname === '/api/google/capabilities') {
    if (site.capable) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, desktopLink: true, version: 2 }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"ok":false}');
    }
    return;
  }

  if (u.pathname === '/api/google/login') {
    const desk = u.searchParams.get('desktop') || '';
    /* الموقع بيعمل OAuth بنفسه وبعد النجاح بيرجّع للتطبيق على loopback */
    res.writeHead(302, {
      Location: 'http://127.0.0.1:' + PORT + '/api/google/site-link?refresh=site-refresh-token' +
        '&email=' + encodeURIComponent('user@example.com') + '&desk=' + desk
    });
    res.end();
    return;
  }

  if (u.pathname === '/api/google/access-token' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      site.lastTokenRequest = raw;
      res.writeHead(site.tokenStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(site.tokenBody));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"ok":false}');
});

const base = 'http://127.0.0.1:' + PORT;
let server = null;

(async function () {
  await new Promise((r) => siteServer.listen(SITE_PORT, '127.0.0.1', r));

  process.env.NIZAM_DATA_DIR = DATA;
  /* مفاتيح وهمية للوضع المحلي — الاختبار مش بيلمس Google الحقيقي. */
  process.env.NIZAM_GOOGLE_CLIENT_ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
  process.env.NIZAM_GOOGLE_CLIENT_SECRET = 'test-only-secret-0123456789abcdef';
  process.env.NIZAM_SITE_BASE = 'http://127.0.0.1:' + SITE_PORT;
  /* الاختبار بيغطي موقع واحد: نخلي الاحتياطي هو نفسه عشان ما يلمسش
     النسخة الحقيقية وقت اختبار حالة «الموقع مش بيدعم الربط». */
  process.env.NIZAM_SITE_FALLBACK = 'http://127.0.0.1:' + SITE_PORT;
  process.env.NIZAM_STORE = 'json';
  process.env.NIZAM_SITE_CAP_TTL = '0';
  delete process.env.NIZAM_LINK_MODE;

  server = require('./desktop/server');
  const info = await server.start(PORT);
  ok('الخادم المكتبي شغّال', info.port === PORT, String(info.port));

  console.log('\n[1] الحالة الابتدائية');
  let j = await (await fetch(base + '/api/google/status')).json();
  ok('الموقع بيدعم تمرير الربط', j.siteLink === true, JSON.stringify(j));
  ok('الوضع محلي قبل الربط', j.mode === 'local', j.mode);
  ok('غير مربوط', j.connected === false);
  ok('configured يتفعّل من الموقع', j.configured === true);

  console.log('\n[2] بدء الربط من الموقع');
  let r = await fetch(base + '/api/google/login', { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  ok('تحويل 302', r.status === 302, String(r.status));
  ok('بيروح لربط الموقع', loc.indexOf('http://127.0.0.1:' + SITE_PORT + '/api/google/login') === 0, loc);
  ok('بيبلّغ الموقع بمنفذ التطبيق', /[?&]desktop=47831(&|$)/.test(loc), loc);

  console.log('\n[3] الموقع رجّع الربط الخطأ');
  r = await fetch(base + '/api/google/site-link?refresh=', { redirect: 'manual' });
  ok('تحويل لرسالة خطأ', r.status === 302 && /g=err/.test(r.headers.get('location') || ''), r.headers.get('location'));
  j = await (await fetch(base + '/api/google/status')).json();
  ok('لسه مش مربوط', j.connected === false);

  console.log('\n[4] الموقع رجّع الربط الصح');
  r = await fetch(base + '/api/google/site-link?refresh=site-refresh-token&email=' + encodeURIComponent('user@example.com'));
  const html = await r.text();
  ok('صفحة تأكيد 200', r.status === 200 && /تم ربط حساب Google/.test(html), String(r.status));
  ok('صفحة التأكيد مش بتسرّب الرمز', html.indexOf('site-refresh-token') < 0);

  j = await (await fetch(base + '/api/google/status')).json();
  ok('مربوط', j.connected === true, JSON.stringify(j));
  ok('الوضع بقى site', j.mode === 'site', j.mode);
  ok('البريد ظاهر', j.email === 'user@example.com', j.email);
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'google-auth.json'), 'utf8'));
  ok('الرمز محفوظ على الجهاز', saved.site_refresh_token === 'site-refresh-token');
  ok('مافيش رمز محلي متعارض', !saved.refresh_token);

  console.log('\n[5] تجديد رمز الوصول من الموقع');
  r = await fetch(base + '/api/google/ping');
  j = await r.json();
  ok('ping نجح', r.status === 200 && j.ok === true, JSON.stringify(j));
  ok('الموقع طُلب منه رمز وصول', String(site.lastTokenRequest || '').indexOf('site-refresh-token') >= 0, String(site.lastTokenRequest));
  const tokenCalls = () => site.calls.filter((c) => c.indexOf('/api/google/access-token') >= 0).length;
  ok('طلب واحد للتجديد (مع كاش)', tokenCalls() === 1, String(tokenCalls()));
  r = await fetch(base + '/api/google/ping');
  await r.json();
  /* ping بيجبر التحقق (force)، فكل نداء = طلب تجديد واحد بالظبط */
  ok('كل تحقق بيجدد مرة واحدة', tokenCalls() === 2, String(tokenCalls()));

  console.log('\n[6] الموقع رفض الرمز (منتهي)');
  site.tokenStatus = 401;
  site.tokenBody = { ok: false, error: 'invalid_grant', reauth: true };
  fs.writeFileSync(path.join(DATA, 'google-auth.json'), JSON.stringify({
    site_refresh_token: 'revoked', site_base: 'http://127.0.0.1:' + SITE_PORT, email: 'user@example.com'
  }));
  r = await fetch(base + '/api/google/ping');
  j = await r.json();
  ok('بيقول محتاج إعادة ربط', j.reauth === true, JSON.stringify(j));
  ok('الربط اتمسح', !fs.existsSync(path.join(DATA, 'google-auth.json')));
  site.tokenStatus = 200;
  site.tokenBody = { ok: true, access_token: 'site-access-token', expires_in: 3500 };

  console.log('\n[7] الموقع القديم (من غير مسار التجديد)');
  r = await fetch(base + '/api/google/site-link?refresh=old-deploy');
  await r.text();
  site.tokenStatus = 404;
  site.tokenBody = { ok: false, error: 'not found' };
  r = await fetch(base + '/api/google/ping');
  j = await r.json();
  ok('رسالة واضحة عن النشر', /Redeploy/i.test(j.error || ''), JSON.stringify(j));
  site.tokenStatus = 200;
  site.tokenBody = { ok: true, access_token: 'site-access-token', expires_in: 3500 };

  console.log('\n[8] الموقع مش بيدعم الربط → رجوع للوضع المحلي');
  await fetch(base + '/api/google/disconnect', { method: 'POST' });
  site.capable = false;
  j = await (await fetch(base + '/api/google/status')).json();
  ok('siteLink false', j.siteLink === false, JSON.stringify(j));
  r = await fetch(base + '/api/google/login', { redirect: 'manual' });
  const l2 = r.headers.get('location') || '';
  ok('بيرجع لربط Google المباشر', /accounts\.google\.com/.test(l2), l2);
  site.capable = true;

  console.log('\n[9] الفصل');
  await fetch(base + '/api/google/site-link?refresh=site-refresh-token&email=x');
  r = await fetch(base + '/api/google/disconnect', { method: 'POST' });
  j = await r.json();
  ok('الفصل رجع ok', j.ok === true);
  j = await (await fetch(base + '/api/google/status')).json();
  ok('غير مربوط بعد الفصل', j.connected === false && j.mode === 'local');

  await server.stop();
  await new Promise((r) => siteServer.close(r));
  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('EXC', e && e.stack || e);
  try { if (server) server.stop(); } catch (e2) {}
  try { siteServer.close(); } catch (e3) {}
  process.exit(1);
});
