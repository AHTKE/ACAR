/* اختبار callback لما Google ما يرجّعش refresh_token:
   لازم يحدّث الاتصال الحالي ويحتفظ برمز التجديد، وما يكتبش سطرًا فاضي. */
import runHandler from './vercel-run.js';

process.env.GOOGLE_CLIENT_ID = '123456789012-callbacktest.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-callbacktest0123456789ab';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.indexOf('https://oauth2.googleapis.com/token') === 0) {
    return new Response(JSON.stringify({ access_token: 'AT-NO-REFRESH', expires_in: 3600 }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
  if (u.indexOf('https://www.googleapis.com/oauth2/v3/userinfo') === 0) {
    return new Response(JSON.stringify({ email: 'new@example.com' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
  return realFetch(url);
};

function call(cookie) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      url: '/api/google/callback?code=CODE&state=STATE-1',
      headers: { host: 'site.test', 'x-forwarded-proto': 'https', cookie },
      on() {}
    };
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      ended: false,
      end() { this.ended = true; resolve(this); }
    };
    Promise.resolve(runHandler(req, res, '/api/google/callback')).then(() => {
      if (!res.ended) reject(new Error('no response'));
    }).catch(reject);
  });
}

function cookiesOf(res) {
  const c = res.headers['set-cookie'];
  return c ? (Array.isArray(c) ? c : [c]) : [];
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

async function main() {
  const existing = 'gstate=STATE-1; gconn=tok-1; vcdb=' + encodeURIComponent(JSON.stringify({
    c: [{ t: 'tok-1', r: 'rt-1', e: 'old@example.com', u: 1 }],
    s: {}
  }));
  let res = await call(existing);
  let cookies = cookiesOf(res);
  let dbCookie = cookies.find((c) => String(c).indexOf('vcdb=') === 0) || '';
  ok('الاتصال الحالي اتحفظ', res.statusCode === 302 && String(res.headers.location || '').indexOf('g=ok') > -1,
    res.statusCode + ' ' + res.headers.location);
  ok('اتحدّث الإيميل من غير refresh_token', decodeURIComponent(dbCookie).indexOf('new@example.com') > -1, dbCookie.slice(0, 160));
  ok('رمز التجديد القديم اتحفظ', decodeURIComponent(dbCookie).indexOf('rt-1') > -1, dbCookie.slice(0, 160));
  ok('ما اتعملش سطر جديد فاضي', decodeURIComponent(dbCookie).indexOf('tok-1') > -1, dbCookie.slice(0, 160));

  const noExisting = 'gstate=STATE-1';
  res = await call(noExisting);
  cookies = cookiesOf(res);
  const location = decodeURIComponent(String(res.headers.location || ''));
  ok('بدون اتصال قديم يرجع خطأ واضح', res.statusCode === 302 && location.indexOf('g=err') > -1 &&
    location.indexOf('رمز تجديد') > -1, res.statusCode + ' ' + location);
  ok('مافيش كوكي اتصال وهمي', !cookies.join(' ').includes('gconn=tok'), cookies.join('|'));

  globalThis.fetch = realFetch;
  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });
