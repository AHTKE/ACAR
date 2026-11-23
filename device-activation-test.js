/* ============================================================
   device-activation-test.js — اختبار واجهة قفل/تفعيل الجهاز
   ------------------------------------------------------------
   يشغّل index.html في jsdom مع device-activation.js وخادم وهمي،
   ويتأكد من: القفل عند الطلب، خطوتي كلمة المرور والكود، عدم قفل
   جهاز مفعّل عند انقطاع الاتصال، ورجوع القفل بعد إلغاء التفعيل.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node device-activation-test.js
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const src = fs.readFileSync('dist/device-activation.js', 'utf8');
let html = fs.readFileSync('dist/index.html', 'utf8');
html = html.replace(/<script[^>]*src="device-activation\.js"[^>]*>\s*<\/script>/,
  () => '<script>' + src + '</script>');
if (html.indexOf('__deviceActivation') === -1 && html.indexOf('deviceActivation') === -1) {
  console.log('✗ السكربت مش موجود في index.html');
  process.exit(1);
}

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

/* خادم وهمي متحكَّم فيه من الاختبار */
const server = {
  status: { ok: true, available: true, enforced: false, activated: false, device: { status: 'none' } },
  request: { ok: true, passcodeValid: true, device: { status: 'pending' } },
  verify: { ok: true, activated: true, device: { status: 'active' } },
  offline: false,
  calls: []
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = (url) => {
      const u = String(url);
      const action = (u.split('/api/activation/')[1] || '').split('?')[0].split('&')[0];
      server.calls.push({ action: action, url: u });
      if (server.offline) return Promise.reject(new Error('offline'));
      let payload = { ok: false, error: 'مسار غير معروف' }, status = 200;
      if (action === 'status') payload = server.status;
      else if (action === 'request') payload = server.request;
      else if (action === 'verify') payload = server.verify;
      else if (action === 'devices') { payload = { ok: true, enforced: true, devices: [] }; status = 200; }
      else if (action === 'passcode') payload = { ok: true, passcode: '123456', expiresIn: 300 };
      else if (action === 'issue') payload = { ok: true, code: '87654321' };
      else if (action === 'enforce') payload = { ok: true, enforced: true };
      else if (action === 'revoke') payload = { ok: true };
      return Promise.resolve({
        ok: status < 400, status: status,
        text: () => Promise.resolve(JSON.stringify(payload))
      });
    };
    window.confirm = () => true;
    window.HTMLAnchorElement.prototype.click = function () {};
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const tick = async (n) => { for (let i = 0; i < (n || 6); i++) await wait(5); };

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

(async function () {
  await tick(10);
  console.log('\n— قفل وتفعيل الجهاز (واجهة) —\n');

  ok('الوحدة اشتغلت', !!window.__deviceActivation, 'window.__deviceActivation');
  const id = window.__deviceActivation.deviceId();
  ok('معرّف جهاز ثابت بصيغة صحيحة', /^[A-Za-z0-9_-]{8,64}$/.test(id), id);
  ok('المعرّف محفوظ محليًا', window.localStorage.getItem('device_activation_id') === id);

  /* 1) التفعيل متوقف → مفيش قفل */
  ok('بدون طلب تفعيل: التطبيق مفتوح', !$('#deviceActivation'));

  /* 2) طلب التفعيل → شاشة قفل */
  server.status = { ok: true, available: true, enforced: true, activated: false, device: { status: 'none' } };
  await window.__deviceActivation.refresh();
  await tick(4);
  ok('التفعيل مطلوب → شاشة القفل ظهرت', !!$('#deviceActivation'));
  ok('عنوان الشاشة «تفعيل الجهاز»', /تفعيل الجهاز/.test($('.dev-act__title') ? $('.dev-act__title').textContent : ''));
  ok('معرّف الجهاز معروض', ($('#daDeviceId') || {}).textContent === id);
  ok('زر نسخ المعرّف موجود', !!$('#daCopyId'));

  /* 3) كلمة مرور غلط */
  server.request = { ok: false, code: 'BAD_PASSCODE', error: 'كلمة المرور المؤقتة غير صحيحة' };
  $('#daPass').value = '123456';
  click($('#daNext'));
  await tick(6);
  ok('كلمة مرور غلط → رسالة واضحة', /غير صحيحة/.test(($('#daErr') || {}).textContent || ''));
  ok('فضل في خطوة كلمة المرور', !!$('#daPass') && !$('#daCode'));

  /* 4) كلمة مرور صحيحة → خطوة الكود */
  server.request = { ok: true, passcodeValid: true, device: { status: 'pending' } };
  const passEl = $('#daPass');
  if (passEl) passEl.value = '654321';
  click($('#daNext'));
  await tick(6);
  ok('كلمة المرور الصح → خطوة كود التفعيل', !!$('#daCode'));
  const reqCall = server.calls.filter((c) => c.action === 'request').pop();
  ok('الطلب بعت معرّف الجهاز وكلمة المرور', !!reqCall);

  /* 5) كود غلط */
  server.verify = { ok: false, code: 'BAD_CODE', error: 'كود التفعيل غير صحيح' };
  $('#daCode').value = '11111111';
  click($('#daGo'));
  await tick(6);
  ok('كود غلط → رسالة واضحة', /غير صحيح/.test(($('#daErr') || {}).textContent || ''));
  ok('الشاشة لسه مقفولة', !!$('#deviceActivation'));

  /* 6) كود صح → التفعيل */
  server.verify = { ok: true, activated: true, device: { status: 'active' } };
  server.status = { ok: true, available: true, enforced: true, activated: true, device: { status: 'active' } };
  $('#daCode').value = '87654321';
  click($('#daGo'));
  await tick(8);
  ok('التفعيل نجح → الشاشة اتقفلت', !$('#deviceActivation'));
  ok('حالة التفعيل محفوظة محليًا', /"activated":true/.test(window.localStorage.getItem('device_activation_cache') || ''));

  /* 7) انقطاع الاتصال بعد التفعيل → ما يقفلش */
  server.offline = true;
  await window.__deviceActivation.refresh();
  await tick(4);
  ok('انقطاع الاتصال بعد التفعيل: التطبيق ما بيتقفلش', !$('#deviceActivation'));
  server.offline = false;

  /* 8) إلغاء التفعيل من الخادم → رجوع القفل */
  server.status = { ok: true, available: true, enforced: true, activated: false, device: { status: 'revoked' } };
  await window.__deviceActivation.refresh();
  await tick(4);
  ok('إلغاء التفعيل من الخادم → القفل رجع', !!$('#deviceActivation'));

  /* 9) الخدمة غير متاحة (نشر Vercel بدون سجل مركزي) */
  window.__deviceActivation.state.activated = false;
  server.status = { ok: true, available: false, enforced: false, activated: false, reason: 'NO_STORE' };
  await window.__deviceActivation.refresh();
  await tick(4);
  ok('خدمة غير متاحة → ما بتقفلش التطبيق', !$('#deviceActivation'));

  /* 10) أخطاء JS */
  ok('مفيش أخطاء JS من الوحدة', errors.filter((e) => /device-activation|dev-act/.test(e)).length === 0,
    errors.join(' | ').slice(0, 300));

  console.log('\nPASS: ' + pass + '   FAIL: ' + fail + '\n');
  if (fail) process.exit(1);
  window.close();
})();
