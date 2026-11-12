/* اختبار الوضع المحلي الافتراضي: الديسكتوب ما يروحش للموقع أبداً
   إلا لو NIZAM_LINK_MODE=site صريح. */
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const SITE_PORT = 47835;
const APP_PORT = 47836;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-glocalonly-'));
let siteCalls = 0;

const site = http.createServer((req, res) => {
  siteCalls++;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, desktopLink: true, version: 2 }));
});

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); }
};
const base = 'http://127.0.0.1:' + APP_PORT;

(async function () {
  await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r));

  process.env.NIZAM_DATA_DIR = DATA;
  process.env.NIZAM_STORE = 'json';
  process.env.NIZAM_GOOGLE_CLIENT_ID = 'bad-client-id';
  process.env.NIZAM_GOOGLE_CLIENT_SECRET = 'bad-secret';
  process.env.NIZAM_SITE_BASE = 'http://127.0.0.1:' + SITE_PORT;
  process.env.NIZAM_SITE_CAP_TTL = '0';
  delete process.env.NIZAM_LINK_MODE;

  const server = require('./desktop/server');
  const info = await server.start(APP_PORT);
  ok('الخادم شغّال', info.port === APP_PORT, String(info.port));

  console.log('\n[1] الحالة لا تسأل الموقع');
  let r = await fetch(base + '/api/google/status');
  let j = await r.json();
  ok('siteLink=false', j.siteLink === false, JSON.stringify(j));
  ok('mode=local', j.mode === 'local', j.mode);
  ok('verdict محلي', j.verdict === 'bad_client_id_format', j.verdict);
  ok('redirect محلي', j.redirectUri === base + '/api/google/callback', j.redirectUri);
  ok('مافيش نداء للموقع', siteCalls === 0, String(siteCalls));

  console.log('\n[2] تسجيل الدخول لا يحوّل للموقع');
  r = await fetch(base + '/api/google/login', { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  ok('302', r.status === 302, String(r.status));
  ok('رجوع محلي', loc.indexOf(base + '/') === 0, loc);
  ok('رسالة محلية', /g=err/.test(loc) && /Client ID|مفاتيح Google/.test(decodeURIComponent(loc)), decodeURIComponent(loc));
  ok('لسه مافيش نداء للموقع', siteCalls === 0, String(siteCalls));

  console.log('\n[3] الفحص محلي أيضاً');
  r = await fetch(base + '/api/google/check');
  j = await r.json();
  ok('mode=local', j.mode === 'local', j.mode);
  ok('verdict محلي', j.verdict === 'bad_client_id_format', j.verdict);
  ok('مافيش نداء للموقع', siteCalls === 0, String(siteCalls));

  await server.stop();
  await new Promise((r2) => site.close(r2));
  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('EXC', e && e.stack || e);
  try { site.close(); } catch (e2) {}
  process.exit(1);
});
