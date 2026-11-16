/* اختبار بث تنبيهات البريد (أدمن): القائمة، حفظ الإيميلات، الإرسال، والصلاحيات. */
'use strict';

const fs = require('fs');
const os = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const ADMIN = 'gstsyusudg@gmail.com';
const USER = 'user.one@example.com';

/* ---------- محاكاة Google ---------- */
const realFetch = globalThis.fetch;
let mailSends = [];
let mailFail = false;

globalThis.fetch = function (url, opts) {
  const u = String(url);
  if (u.indexOf('oauth2.googleapis.com/token') > -1) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'AT-1', expires_in: 3600 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.indexOf('gmail.googleapis.com') > -1) {
    if (mailFail) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: 'quota exceeded' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }));
    }
    mailSends.push(u);
    return Promise.resolve(new Response(JSON.stringify({ id: 'm' + mailSends.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return realFetch ? realFetch(url, opts) : Promise.resolve(new Response('{}', { status: 200 }));
};

/* ---------- قاعدة بيانات وهمية ---------- */
function mkDb(state) {
  const run = async (sql, args) => {
    if (/google_settings/.test(sql) && /INSERT/.test(sql)) state.settings[args[0]] = String(args[1]);
  };
  const first = async (sql, args) => {
    if (/google_connections/.test(sql) && /WHERE client_token/.test(sql)) {
      return state.connections[args[0]] || null;
    }
    if (/google_settings/.test(sql)) {
      const k = args[0];
      return (k in state.settings) ? { v: state.settings[k] } : null;
    }
    return null;
  };
  return {
    exec: async () => {},
    prepare: (sql) => {
      const stmt = {
        bind: (...args) => ({
          first: () => first(sql, args),
          run: () => run(sql, args),
          all: () => all(sql, args)
        }),
        first: () => first(sql, []),
        run: async () => {},
        all: () => all(sql, [])
      };
      const all = async () => ({
        results: Object.keys(state.connections).map(function (k) {
          return { email: state.connections[k].email };
        })
      });
      return stmt;
    }
  };
}

function mkEnv(state) {
  return {
    ASSETS: { fetch: async () => new Response('ASSET') },
    GOOGLE_CLIENT_ID: 'cid-test',
    GOOGLE_CLIENT_SECRET: 'csec-test',
    DB: mkDb(state)
  };
}

function state() {
  return {
    connections: {
      'tok-admin': { id: 1, client_token: 'tok-admin', refresh_token: 'rt-1', email: ADMIN },
      'tok-user': { id: 2, client_token: 'tok-user', refresh_token: 'rt-2', email: USER }
    },
    settings: {}
  };
}

function req(path, opts) {
  const o = opts || {};
  return new Request('https://site.test' + path, {
    method: o.method || 'GET',
    headers: Object.assign({ Cookie: 'gconn=' + (o.token || 'tok-admin') },
      o.body ? { 'Content-Type': 'application/json' } : {}),
    body: o.body ? JSON.stringify(o.body) : undefined
  });
}

(async function () {
  const tmp = os.join(process.cwd(), '.worker-notify.mjs');
  fs.copyFileSync('worker.js', tmp);
  let worker;
  try { worker = (await import('file://' + tmp)).default; }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  ok('الـ Worker اتحمّل', !!worker && typeof worker.fetch === 'function');

  const st = state();
  const env = mkEnv(st);

  console.log('\n[1] قائمة المستخدمين المرتبطين');
  let r = await worker.fetch(req('/api/notify-list'), env);
  let j = await r.json();
  ok('200', r.status === 200, r.status);
  ok('بيرجّع المرتبطين', j.linked && j.linked.length === 2, JSON.stringify(j.linked));
  ok('فيه حساب الأدمن', j.linked.indexOf(ADMIN) > -1, j.linked);
  ok('مفيش إضافيين في الأول', Array.isArray(j.extras) && j.extras.length === 0);
  ok('المجموع ٢', j.recipients.length === 2, j.recipients);

  console.log('\n[2] حفظ إيميلات إضافية');
  r = await worker.fetch(req('/api/notify-emails', {
    method: 'POST',
    body: { emails: 'extra@example.com, bad-email\nSECOND@Example.com\n' + USER }
  }), env);
  j = await r.json();
  ok('200', r.status === 200, r.status);
  ok('اتنضّفت الإيميلات', JSON.stringify(j.extras) === JSON.stringify(['extra@example.com', 'second@example.com']), JSON.stringify(j.extras));
  ok('مكرر المرتبط مش مضاف', j.extras.indexOf(USER) < 0, j.extras);
  ok('اتخزنت في الإعدادات', String(st.settings.notify_extra_emails).indexOf('extra@example.com') > -1, st.settings.notify_extra_emails);

  console.log('\n[3] القائمة بعد الحفظ');
  r = await worker.fetch(req('/api/notify-list'), env);
  j = await r.json();
  ok('المجموع بقى ٤ بدون تكرار', j.recipients.length === 4, j.recipients);
  ok('المرتبطين زي ما هم', j.linked.length === 2, j.linked);

  console.log('\n[4] الإرسال');
  mailSends = [];
  r = await worker.fetch(req('/api/notify-send', { method: 'POST', body: { message: '' } }), env);
  j = await r.json();
  ok('رسالة فاضية → 400', r.status === 400, r.status);
  ok('مفيش إرسال', mailSends.length === 0, mailSends.length);

  r = await worker.fetch(req('/api/notify-send', {
    method: 'POST',
    body: { subject: 'تحديث', message: 'تم إضافة تقارير جديدة', extraEmails: 'third@example.com third@example.com' }
  }), env);
  j = await r.json();
  ok('200', r.status === 200, r.status);
  ok('اتبعت للكل', j.sent === 5, JSON.stringify({ sent: j.sent, total: j.total, results: j.results }));
  ok('مفيش فشل', j.failed === 0, j.failed);
  ok('Gmail اتنادى ٥ مرات', mailSends.length === 5, mailSends.length);
  ok('مفيش اتخطي', j.skipped === 0, j.skipped);

  console.log('\n[5] فشل الإرسال');
  mailFail = true;
  r = await worker.fetch(req('/api/notify-send', { method: 'POST', body: { message: 'تجربة' } }), env);
  j = await r.json();
  ok('200 مع فشل', r.status === 200, r.status);
  ok('sent = 0', j.sent === 0, j.sent);
  ok('failed = الكل', j.failed === j.total, JSON.stringify({ failed: j.failed, total: j.total }));
  ok('الخطأ ظاهر في النتائج', String(j.results[0].error).length > 0, j.results[0]);
  mailFail = false;

  console.log('\n[6] الصلاحيات');
  r = await worker.fetch(req('/api/notify-list', { token: 'tok-user' }), env);
  j = await r.json();
  ok('مستخدم عادي → 403', r.status === 403, r.status);
  ok('رسالة عربية', String(j.error).indexOf('الإدارة') > -1, j.error);

  r = await worker.fetch(new Request('https://site.test/api/notify-list'), env);
  ok('من غير ربط → 401', r.status === 401, r.status);

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('CRASH', e);
  process.exit(1);
});
