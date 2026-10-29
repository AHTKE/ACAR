/* اختبار تشخيص مفاتيح Google:
   تنظيف قيم المتغيّرات + صيغة المفاتيح + فحص فعلي (client_id منفصل عن secret)
   + منع توجيه المستخدم لصفحة خطأ Google عند مفاتيح غلط */
const fs = require('fs');
const os = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const GOOD_ID = '1089687675916-07b8oa53303rere6sd3tqb6fs2gmkg7a.apps.googleusercontent.com';
const GOOD_SECRET = 'GOCSPX-abcdefghijklmnop1234';

function mkDb() {
  return {
    exec: async () => {},
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => (sql.indexOf('google_connections') > -1 ? null : null),
            run: async () => ({}),
            all: async () => ({ results: [] })
          };
        }
      };
    }
  };
}

async function main() {
  const tmp = os.join(process.cwd(), '.worker-diag-test.mjs');
  fs.copyFileSync('worker.js', tmp);
  let worker;
  try { worker = (await import('file://' + tmp)).default; }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }

  const ASSETS = { fetch: async () => new Response('ASSET') };
  const ORIGIN = 'https://workflow-amw-code.vercel.app';

  /* محاكاة Google */
  let google = { auth: { status: 302, location: ORIGIN + '/api/google/callback?error=login_required' }, token: { status: 400, json: { error: 'invalid_grant' } } };
  const calls = { auth: 0, token: 0 };

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.indexOf('accounts.google.com') > -1) {
      calls.auth++;
      calls.lastAuthUrl = u;
      if (google.auth.status >= 400) {
        return new Response(google.auth.body || '', { status: google.auth.status });
      }
      return new Response(null, { status: google.auth.status, headers: { Location: google.auth.location } });
    }
    if (u.indexOf('oauth2.googleapis.com/token') > -1) {
      calls.token++;
      calls.lastTokenBody = String((init && init.body) || '');
      return new Response(JSON.stringify(google.token.json), {
        status: google.token.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('{}', { status: 200 });
  };

  const env = (extra) => Object.assign({ DB: mkDb(), ASSETS }, extra || {});
  const get = (path, e) => worker.fetch(new Request(ORIGIN + path), e);

  console.log('\n[1] بدون مفاتيح خالص');
  {
    const r = await get('/api/google/status', env());
    const j = await r.json();
    ok('configured=false', j.configured === false, JSON.stringify(j));
    ok('verdict=missing_keys', j.verdict === 'missing_keys', j.verdict);
    ok('رابط الإرجاع صحيح', j.redirectUri === ORIGIN + '/api/google/callback', j.redirectUri);
    const c = await (await get('/api/google/check', env())).json();
    ok('الفحص يقول missing_keys', c.verdict === 'missing_keys', c.verdict);
    ok('الفحص فيه نصيحة عربية', String(c.advice || '').indexOf('Vercel') > -1, c.advice);
    const lg = await get('/api/google/login', env());
    ok('الدخول بدون مفاتيح → 503 (مش صفحة جوجل)', lg.status === 503, lg.status);
  }

  console.log('\n[2] تنظيف المسافات/الاقتباسات/أسطر جديدة من المتغيّرات');
  {
    const e = env({
      GOOGLE_CLIENT_ID: '  "' + GOOD_ID + '"\n',
      GOOGLE_CLIENT_SECRET: '\t ' + GOOD_SECRET + ' \n'
    });
    const j = await (await get('/api/google/status', e)).json();
    ok('configured=true رغم المسافات', j.configured === true, JSON.stringify(j));
    ok('صيغة الـclient_id صحيحة بعد التنظيف', j.clientIdValid === true, j.clientIdValid);
    ok('طول الـclient_id مطابق', j.clientIdLength === GOOD_ID.length, j.clientIdLength);
    ok('آخر 10 حروف ظاهرة للمقارنة', j.clientIdTail === GOOD_ID.slice(-10), j.clientIdTail);
    ok('verdict=keys_ready', j.verdict === 'keys_ready', j.verdict);
  }

  console.log('\n[3] صيغة client_id غلط (مثلاً نص مكان المعرّف)');
  {
    const e = env({ GOOGLE_CLIENT_ID: 'my-client-id', GOOGLE_CLIENT_SECRET: GOOD_SECRET });
    const j = await (await get('/api/google/status', e)).json();
    ok('configured=true لكن الصيغة غلط', j.configured === true && j.clientIdValid === false, JSON.stringify(j));
    ok('verdict=bad_client_id_format', j.verdict === 'bad_client_id_format', j.verdict);
    const lg = await get('/api/google/login', e);
    ok('الدخول يرجع للتطبيق بدل صفحة خطأ جوجل', lg.status === 302 && String(lg.headers.get('location')).indexOf('/?g=err') === 0,
      lg.status + ' ' + lg.headers.get('location'));
  }

  console.log('\n[4] Google ما يعرفش الـclient_id (سبب invalid_client 401)');
  {
    google.auth = { status: 400, body: '<html><title>Error 401: invalid_client</title>The OAuth client was not found.</html>' };
    google.token = { status: 401, json: { error: 'invalid_client' } };
    const e = env({ GOOGLE_CLIENT_ID: GOOD_ID, GOOGLE_CLIENT_SECRET: GOOD_SECRET });
    const c = await (await get('/api/google/check', e)).json();
    ok('الفحص اكتشف client_id غير معروف', c.verdict === 'client_id_not_found', c.verdict);
    ok('النصيحة تذكر Google Cloud ← Clients', String(c.advice).indexOf('Google Cloud') > -1, c.advice);
    ok('idProbe سجّل السبب', c.idProbe && c.idProbe.clientNotFound === true, JSON.stringify(c.idProbe));
    ok('بدون كشف السر في الرد', JSON.stringify(c).indexOf(GOOD_SECRET) === -1);
    const lg = await get('/api/google/login', e);
    const loc = String(lg.headers.get('location') || '');
    ok('الدخول ما بيروحش لصفحة خطأ Google', loc.indexOf('/?g=err') === 0, loc.slice(0, 90));
    ok('رسالة الخطأ عربية ومفهومة', decodeURIComponent(loc.split('m=')[1] || '').indexOf('Google') > -1,
      decodeURIComponent(loc.split('m=')[1] || '').slice(0, 120));
  }

  console.log('\n[5] الـClient ID سليم لكن السر لا يطابق');
  {
    google.auth = { status: 302, location: ORIGIN + '/api/google/callback?error=login_required' };
    google.token = { status: 401, json: { error: 'invalid_client', error_description: 'Unauthorized' } };
    const e = env({ GOOGLE_CLIENT_ID: GOOD_ID, GOOGLE_CLIENT_SECRET: 'GOCSPX-wrongsecret0000' });
    const c = await (await get('/api/google/check', e)).json();
    ok('verdict=bad_client_secret', c.verdict === 'bad_client_secret', c.verdict);
    ok('النصيحة تشرح تدوير السر', String(c.advice).indexOf('Client secret') > -1, c.advice);
  }

  console.log('\n[6] رابط الإرجاع غير مسجّل');
  {
    google.auth = { status: 400, body: '<html>Error 400: redirect_uri_mismatch</html>' };
    const e = env({ GOOGLE_CLIENT_ID: GOOD_ID, GOOGLE_CLIENT_SECRET: GOOD_SECRET });
    const c = await (await get('/api/google/check', e)).json();
    ok('verdict=redirect_uri_mismatch', c.verdict === 'redirect_uri_mismatch', c.verdict);
    ok('النصيحة فيها نفس رابط الإرجاع', String(c.advice).indexOf(ORIGIN + '/api/google/callback') > -1, c.advice);
    const lg = await get('/api/google/login', e);
    ok('الدخول يرجع للتطبيق برسالة رابط الإرجاع',
      String(lg.headers.get('location')).indexOf('/?g=err') === 0);
  }

  console.log('\n[7] مفاتيح سليمة ومطابقة');
  {
    google.auth = { status: 302, location: ORIGIN + '/api/google/callback?error=login_required' };
    google.token = { status: 400, json: { error: 'invalid_grant', error_description: 'Bad Request' } };
    const e = env({ GOOGLE_CLIENT_ID: GOOD_ID, GOOGLE_CLIENT_SECRET: GOOD_SECRET });
    const c = await (await get('/api/google/check', e)).json();
    ok('verdict=keys_ok', c.verdict === 'keys_ok', c.verdict);
    const lg = await get('/api/google/login', e);
    const loc = String(lg.headers.get('location') || '');
    ok('الدخول بيوجّه لجوجل فعلاً', loc.indexOf('accounts.google.com') > -1, loc.slice(0, 80));
    ok('client_id المنظّف اتبعت في الرابط', loc.indexOf(encodeURIComponent(GOOD_ID).slice(0, 20)) > -1 ||
      decodeURIComponent(loc).indexOf(GOOD_ID) > -1);
    ok('redirect_uri المنظّم اتبعت', decodeURIComponent(loc).indexOf(ORIGIN + '/api/google/callback') > -1);
    ok('state موجود', /[?&]state=/.test(loc));
    ok('السر مش ظاهر في الرابط', loc.indexOf(GOOD_SECRET) === -1);
  }

  console.log('\n[8] تثبيت رابط الإرجاع بدومين واحد (APP_BASE_URL)');
  {
    const e = env({
      GOOGLE_CLIENT_ID: GOOD_ID,
      GOOGLE_CLIENT_SECRET: GOOD_SECRET,
      APP_BASE_URL: 'https://workflow-amw-code.vercel.app/'
    });
    const j = await (await get('/api/google/status', e)).json();
    ok('رابط الإرجاع مثبّت على الدومين', j.redirectUri === 'https://workflow-amw-code.vercel.app/api/google/callback', j.redirectUri);
    const c = await (await get('/api/google/check', e)).json();
    ok('الفحص يستخدم نفس الرابط', c.redirectUri === 'https://workflow-amw-code.vercel.app/api/google/callback', c.redirectUri);
  }

  console.log('\n[9] استجابة الخطأ من Google توصل برسالة واضحة');
  {
    const r = await worker.fetch(new Request(ORIGIN + '/api/google/callback?error=access_denied&error_description=user%20denied'),
      env({ GOOGLE_CLIENT_ID: GOOD_ID, GOOGLE_CLIENT_SECRET: GOOD_SECRET }));
    const loc = String(r.headers.get('location') || '');
    const msg = decodeURIComponent((loc.split('m=')[1] || ''));
    ok('يرجّع للتطبيق بسبب الإلغاء', loc.indexOf('/?g=err') === 0, loc.slice(0, 70));
    ok('الرسالة تشرح إلغاء الإذن', msg.indexOf('إلغاء') > -1, msg);
  }

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
