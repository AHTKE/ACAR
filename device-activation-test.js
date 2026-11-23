/* ============================================================
   device-activation-test.js — اختبار واجهة قفل/تفعيل الجهاز
   ------------------------------------------------------------
   يشغّل index.html في jsdom مع device-activation.js وخادم وهمي:
     • القفل يظهر أول ما التطبيق يفتح (جهاز غير مفعّل).
     • خطوة كلمة المرور → كود الجهاز (6 أرقام) → كود التفعيل.
     • الكود الغلط بيعرض رسالة، والصحيح بيفتح التطبيق ويحفظ التوكن.
     • خدمة غير متاحة أو شبكة واقعة ما بتقفلش جهاز جديد.
     • مفيش لوحة أدمن بتتضاف في الإعدادات.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node device-activation-test.js
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const src = fs.readFileSync('dist/device-activation.js', 'utf8');
let html = fs.readFileSync('dist/index.html', 'utf8');
html = html.replace(/<script[^>]*src="device-activation\.js"[^>]*>\s*<\/script>/,
  () => '<script>' + src + '</script>');
if (html.indexOf('__deviceActivation') === -1) {
  console.log('✗ السكربت مش موصول في index.html');
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 60));

function boot(server) {
  const calls = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && e.message ? e.message : e)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (url, init) => {
        const u = String(url);
        const action = (u.split('/api/activation/')[1] || '').split('?')[0];
        calls.push({ action, url: u, body: init && init.body });
        if (server.offline) return Promise.reject(new Error('offline'));
        let payload = { ok: false, error: 'مسار غير معروف' };
        if (action === 'status') payload = server.status;
        else if (action === 'passcode') payload = server.passcode;
        else if (action === 'verify') payload = server.verify;
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify(payload))
        });
      };
    }
  });
  return { dom, win: dom.window, calls, errors };
}

const overlay = (win) => win.document.getElementById('deviceActivation');

(async function run() {
  console.log('\n— جهاز جديد: القفل بيظهر —');
  const server = {
    offline: false,
    status: { ok: true, available: true, enforced: true, activated: false },
    passcode: { ok: true, deviceCode: '482913', secondsLeft: 280 },
    verify: { ok: false, code: 'BAD_CODE', error: 'كود التفعيل غلط أو انتهت صلاحيته' }
  };
  const app = boot(server);
  await wait();

  ok('القفل ظهر أول ما التطبيق فتح', !!overlay(app.win));
  ok('فيه حقل كلمة المرور', !!app.win.document.getElementById('daPass'));
  ok('بيتحقق من الحالة على الخادم', app.calls.some((c) => c.action === 'status'));
  ok('مفيش لوحة أدمن في الإعدادات', app.win.document.getElementById('activationAdminPanel') === null);

  console.log('\n— كلمة المرور ثم كود الجهاز —');
  const passInput = app.win.document.getElementById('daPass');
  passInput.value = '135790';
  app.win.document.getElementById('daNext').click();
  await wait();

  const passCall = app.calls.filter((c) => c.action === 'passcode').pop();
  ok('بيتبعت كلمة المرور للخادم', !!passCall);
  let sent = {};
  try { sent = JSON.parse((passCall && passCall.body) || '{}'); } catch (e) {}
  ok('بيبعت كود جهاز 6 أرقام للخادم', /^\d{6}$/.test(String(sent.device || '')), JSON.stringify(sent));
  ok('بيبعت كلمة المرور', String(sent.passcode || '') === '135790', JSON.stringify(sent));
  const deviceCodeEl = app.win.document.getElementById('daDeviceId');
  ok('كود الجهاز ظاهر بعد كلمة المرور', !!deviceCodeEl);
  ok('كود الجهاز 6 أرقام', deviceCodeEl && /^\d{6}$/.test(deviceCodeEl.textContent), deviceCodeEl ? deviceCodeEl.textContent : '');
  ok('فيه حقل كود التفعيل', !!app.win.document.getElementById('daCode'));

  console.log('\n— كود غلط —');
  const codeInput = app.win.document.getElementById('daCode');
  codeInput.value = '000000';
  app.win.document.getElementById('daGo').click();
  await wait();
  const err = app.win.document.getElementById('daErr');
  ok('رسالة خطأ ظاهرة', err && !err.hidden && err.textContent.length > 5, err ? err.textContent : '');
  ok('القفل لسه شغال', !!overlay(app.win));

  console.log('\n— كود صح —');
  server.verify = { ok: true, activated: true, token: 'tok_abcdefghijklmnopqrstuvwxyz' };
  const codeInput2 = app.win.document.getElementById('daCode');
  codeInput2.value = '654321';
  app.win.document.getElementById('daGo').click();
  await wait();

  ok('التوكن اتحفظ على الجهاز', app.win.localStorage.getItem('device_activation_token') === 'tok_abcdefghijklmnopqrstuvwxyz');
  ok('القفل اتشال والتطبيق فتح', !overlay(app.win));
  ok('مفيش لوحة أدمن اتضافت', app.win.document.getElementById('activationAdminPanel') === null);

  console.log('\n— بعد التفعيل: انقطاع الشبكة ما بيقفلش —');
  server.offline = true;
  await app.win.__deviceActivation.refresh(false);
  await wait(20);
  ok('مفيش قفل بعد التفعيل وقت الانقطاع', !overlay(app.win));

  console.log('\n— خدمة غير متاحة (مفيش ACTIVATION_SECRET) —');
  const off = boot({
    offline: false,
    status: { ok: true, available: false, enforced: false, reason: 'NO_SECRET' },
    passcode: { ok: false, code: 'NO_SECRET', error: 'x' },
    verify: { ok: false, code: 'NO_SECRET', error: 'x' }
  });
  await wait();
  ok('مفيش قفل لما الخدمة غير متاحة', !overlay(off.win));

  console.log('\n— جهاز جديد + شبكة واقعة —');
  const down = boot({
    offline: true,
    status: {}, passcode: {}, verify: {}
  });
  await wait();
  ok('مفيش قفل لجهاز جديد بدون اتصال (ما نكسرش التطبيق)', !down.win.document.getElementById('deviceActivation'));

  console.log('\n— جهاز مفعّل قبل كده + شبكة واقعة —');
  const cached = boot({
    offline: false,
    status: { ok: true, available: true, enforced: true, activated: false },
    passcode: {}, verify: {}
  });
  await wait();
  ok('القفل ظهر وهو متصل', !!overlay(cached.win));
  cached.win.localStorage.removeItem('device_activation_token');
  cached.win.fetch = () => Promise.reject(new Error('offline'));
  await cached.win.__deviceActivation.refresh(false);
  await wait(20);
  ok('فضل مقفول وقت الانقطاع (كان معروف إن التفعيل مطلوب)', !!overlay(cached.win));

  const allErrors = app.errors.concat(off.errors, down.errors, cached.errors);
  ok('مفيش أخطاء JS في الشاشة', allErrors.length === 0, allErrors.join(' | '));

  console.log('\n' + (fail ? '✗ فشل ' + fail + ' / ' + (pass + fail) : '✓ نجح ' + pass + ' / ' + (pass + fail)));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('✗ خطأ غير متوقع:', e);
  process.exit(1);
});
