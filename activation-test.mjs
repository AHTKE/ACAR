/* ============================================================
   activation-test.mjs — اختبار خدمة تفعيل الأجهزة
   ------------------------------------------------------------
   بيتأكد من السلوك المطلوب:
     • بدون ACTIVATION_SECRET الخدمة «غير متاحة» والتطبيق ما بيتقفلش.
     • كلمة مرور 6 أرقام بتتغيّر كل 5 دقائق، والتحقق على الخادم.
     • كود التفعيل 6 أرقام ومربوط بكود الجهاز نفسه وصالح 3 دقائق.
     • النافذة الحالية بس + هامش ثوانٍ صغير (5 ثوانٍ) بعد بداية النافذة.
     • التوكن اللي بيرجع بيتحقق منه في /status.
     • كود جهاز تاني أو كود غلط ما بيفعّلش.
     • حد المحاولات، والأدمن محمي.
   التشغيل: node activation-test.mjs
   ============================================================ */
import worker from './worker.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

const SECRET = 'test-secret-key-0123456789abcdef';
const PASS_WINDOW = 5 * 60 * 1000;
const CODE_WINDOW = 3 * 60 * 1000;

const enc = (s) => new TextEncoder().encode(String(s));
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(msg)));
}
async function six(secret, msg) {
  const b = await hmac(secret, msg);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0);
  return String(v % 1000000).padStart(6, '0');
}
async function passcodeFor(secret, win) { return six(secret, 'pass:' + win); }
async function actCodeFor(secret, device, win) { return six(secret, 'act:' + device + ':' + win); }

function call(env, path, init) {
  return worker.fetch(new Request('https://app.test' + path, init), env);
}
function jsonReq(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}
async function read(res) {
  const t = await res.text();
  try { return JSON.parse(t); } catch (e) { return { raw: t }; }
}

const DEV = '482913';
const OTHER = '119900';
/* ساعة ثابتة في الاختبار عشان حدود النافذة والهامش تكون حتمية */
const PASS_START = Math.floor(1764000000000 / PASS_WINDOW) * PASS_WINDOW;
const CODE_START = Math.floor(1764000000000 / CODE_WINDOW) * CODE_WINDOW;
const now = PASS_START + 60000;
const pWin = Math.floor(now / PASS_WINDOW);
const cWin = Math.floor(now / CODE_WINDOW);
const setNow = (ms) => { Date.now = () => ms; };
setNow(now);

console.log('\n— بدون سر: مفيش خدمة ومفيش قفل —');
{
  const env = {};
  const res = await call(env, '/api/activation/status?device=' + DEV);
  const d = await read(res);
  ok('status يرد 200', res.status === 200, String(res.status));
  ok('available = false', d.available === false, JSON.stringify(d));
  ok('enforced = false (ما بيقفلش التطبيق)', d.enforced === false);
  ok('السبب NO_SECRET', d.reason === 'NO_SECRET', d.reason);
  const p = await read(await call(env, '/api/activation/passcode', jsonReq('POST', { device: DEV, passcode: '123456' })));
  ok('طلب كلمة المرور يرفض بوضوح', p.ok === false && p.code === 'NO_SECRET', JSON.stringify(p));
}

console.log('\n— مع السر: الخدمة شغالة والقفل مطلوب —');
const env = { ACTIVATION_SECRET: SECRET };
{
  const d = await read(await call(env, '/api/activation/status?device=' + DEV));
  ok('available = true', d.available === true, JSON.stringify(d));
  ok('enforced = true', d.enforced === true);
  ok('جهاز جديد مش مفعّل', d.activated === false);
}

console.log('\n— كلمة المرور التشغيلية —');
{
  const wrong = await call(env, '/api/activation/passcode', jsonReq('POST', { device: DEV, passcode: '000000' }));
  const wd = await read(wrong);
  ok('كلمة مرور غلط → 403', wrong.status === 403, String(wrong.status));
  ok('كود الخطأ BAD_PASSCODE', wd.code === 'BAD_PASSCODE', wd.code);

  const bad = await read(await call(env, '/api/activation/passcode', jsonReq('POST', { device: '12', passcode: '123456' })));
  ok('كود جهاز غير صالح مرفوض', bad.ok === false && bad.code === 'BAD_DEVICE', JSON.stringify(bad));

  const goodPass = await passcodeFor(SECRET, pWin);
  const good = await call(env, '/api/activation/passcode', jsonReq('POST', { device: DEV, name: 'ويندوز', passcode: goodPass }));
  const gd = await read(good);
  ok('كلمة المرور الحالية مقبولة', good.status === 200 && gd.ok === true, JSON.stringify(gd));
  ok('الرد بيرجّع كود الجهاز', gd.deviceCode === DEV, gd.deviceCode);
  ok('الرد فيه باقي الوقت', typeof gd.secondsLeft === 'number' && gd.secondsLeft > 0, String(gd.secondsLeft));
  ok('الرد ما بيرجّعش السر', JSON.stringify(gd).indexOf(SECRET) === -1);

  /* بعد الهامش (20 ثانية في النافذة الجديدة) → القديم مرفوض */
  setNow(PASS_START + 20000);
  const late = await read(await call(env, '/api/activation/passcode',
    jsonReq('POST', { device: DEV, passcode: await passcodeFor(SECRET, pWin - 1) })));
  ok('باسورد النافذة السابقة مرفوض بعد انتهاء الهامش',
    late.ok === false && late.code === 'BAD_PASSCODE', JSON.stringify(late));

  /* خلال الهامش (3 ثوانٍ في النافذة الجديدة) → القديم مقبول */
  setNow(PASS_START + 3000);
  const prev = await read(await call(env, '/api/activation/passcode',
    jsonReq('POST', { device: DEV, passcode: await passcodeFor(SECRET, pWin - 1) })));
  ok('باسورد النافذة السابقة مقبول خلال الهامش (5 ثوانٍ)', prev.ok === true, JSON.stringify(prev));

  setNow(PASS_START + 7000);
  const afterGrace = await read(await call(env, '/api/activation/passcode',
    jsonReq('POST', { device: DEV, passcode: await passcodeFor(SECRET, pWin - 1) })));
  ok('الهامش بعد 7 ثوانٍ خلص', afterGrace.ok === false && afterGrace.code === 'BAD_PASSCODE', JSON.stringify(afterGrace));

  setNow(now);
  const old = await read(await call(env, '/api/activation/passcode',
    jsonReq('POST', { device: DEV, passcode: await passcodeFor(SECRET, pWin - 2) })));
  ok('كلمة مرور منتهية مرفوضة', old.ok === false && old.code === 'BAD_PASSCODE', JSON.stringify(old));
}

console.log('\n— كود التفعيل المخصّص للجهاز —');
{
  const goodCode = await actCodeFor(SECRET, DEV, cWin);

  const otherDev = await call(env, '/api/activation/verify', jsonReq('POST', { device: OTHER, code: goodCode }));
  const od = await read(otherDev);
  ok('كود جهاز على جهاز تاني مرفوض', od.ok === false && od.code === 'BAD_CODE', JSON.stringify(od));

  const wrong = await read(await call(env, '/api/activation/verify', jsonReq('POST', { device: DEV, code: '000000' })));
  ok('كود غلط مرفوض', wrong.ok === false && wrong.code === 'BAD_CODE', JSON.stringify(wrong));

  const expired = await read(await call(env, '/api/activation/verify',
    jsonReq('POST', { device: DEV, code: await actCodeFor(SECRET, DEV, cWin - 2) })));
  ok('كود منتهي الصلاحية مرفوض', expired.ok === false, JSON.stringify(expired));

  /* نافذة الكود السابقة: مرفوضة بعد الهامش، مقبولة خلاله */
  setNow(CODE_START + 20000);
  const lateCode = await read(await call(env, '/api/activation/verify',
    jsonReq('POST', { device: DEV, code: await actCodeFor(SECRET, DEV, cWin - 1) })));
  ok('كود النافذة السابقة مرفوض بعد انتهاء الهامش',
    lateCode.ok === false && lateCode.code === 'BAD_CODE', JSON.stringify(lateCode));

  setNow(CODE_START + 3000);
  const graceCode = await read(await call(env, '/api/activation/verify',
    jsonReq('POST', { device: DEV, code: await actCodeFor(SECRET, DEV, cWin - 1) })));
  ok('كود النافذة السابقة مقبول خلال الهامش', graceCode.ok === true, JSON.stringify(graceCode));

  setNow(now);

  const shortCode = await read(await call(env, '/api/activation/verify', jsonReq('POST', { device: DEV, code: '123' })));
  ok('كود أقل من 6 أرقام مرفوض', shortCode.ok === false && shortCode.code === 'BAD_CODE', JSON.stringify(shortCode));

  const good = await call(env, '/api/activation/verify', jsonReq('POST', { device: DEV, code: goodCode }));
  const gd = await read(good);
  ok('الكود الصحيح بيفعّل الجهاز', good.status === 200 && gd.activated === true, JSON.stringify(gd));
  ok('الرد فيه توكن تفعيل', typeof gd.token === 'string' && gd.token.length > 20, String(gd.token));

  const st = await read(await call(env, '/api/activation/status?device=' + DEV + '&token=' + encodeURIComponent(gd.token)));
  ok('التوكن بيثبت التفعيل في status', st.activated === true, JSON.stringify(st));

  const st2 = await read(await call(env, '/api/activation/status?device=' + OTHER + '&token=' + encodeURIComponent(gd.token)));
  ok('نفس التوكن ما بيفعّلش جهاز تاني', st2.activated === false, JSON.stringify(st2));

  const st3 = await read(await call(env, '/api/activation/status?device=' + DEV + '&token=forged-token'));
  ok('توكن مزوّر مرفوض', st3.activated === false);

  /* التوكن في الهيدر بدل الـURL (ما يتسجلش في اللوجات) */
  const stHeader = await read(await call(env, '/api/activation/status?device=' + DEV, {
    headers: { 'x-activation-token': gd.token }
  }));
  ok('التوكن بيتقبل في الهيدر من غير ما يتحط في الـURL', stHeader.activated === true, JSON.stringify(stHeader));
}

console.log('\n— حد المحاولات —');
{
  const env2 = { ACTIVATION_SECRET: SECRET };
  let last = null;
  for (let i = 0; i < 10; i++) {
    last = await read(await call(env2, '/api/activation/verify', jsonReq('POST', { device: '777777', code: '000000' })));
  }
  ok('بعد محاولات كثيرة → TOO_MANY', last && last.code === 'TOO_MANY', JSON.stringify(last));
}

console.log('\n— حد المحاولات عبر أكواد أجهزة متغيرة (نفس الـIP) —');
{
  const env3 = { ACTIVATION_SECRET: SECRET };
  let last = null;
  for (let i = 0; i < 35; i++) {
    const dev = String(100000 + i);
    last = await read(await call(env3, '/api/activation/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ device: dev, code: '000000' })
    }));
  }
  ok('تبديل كود الجهاز ما بيلفّش على حد المحاولات (نفس الـIP)',
    last && last.code === 'TOO_MANY', JSON.stringify(last));
}

console.log('\n— مسارات الأدمن محمية —');
{
  const res = await call(env, '/api/activation/devices');
  ok('قائمة الأجهزة محتاجة أدمن', res.status === 401 || res.status === 403, String(res.status));
  const rev = await call(env, '/api/activation/revoke', jsonReq('POST', { device: DEV }));
  ok('إلغاء التفعيل محتاج أدمن', rev.status === 401 || rev.status === 403, String(rev.status));
}

console.log('\n' + (fail ? '✗ فشل ' + fail + ' / ' + (pass + fail) : '✓ نجح ' + pass + ' / ' + (pass + fail)));
if (fail) process.exit(1);
