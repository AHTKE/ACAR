/* ============================================================
   startup-order-test.js — ترتيب الإقلاع وشاشة التفعيل
   ------------------------------------------------------------
   يتحقق من:
     • غطاء الإقلاع موجود من أول لحظة (مفيش وميض للقائمة الرئيسية).
     • الترتيب: ترحيب (شعار الشركة) → كلمة مرور → التطبيق.
     • شاشة التفعيل فيها شعار/اسم الشركة وواتساب + العدّاد.
     • رسالة «انتهت مدة الباسورد» عند إدخال باسورد قديم.
     • شاشة التفعيل بتظهر مرة واحدة بس للجهاز المتفعّل.
   التشغيل: NODE_PATH=/tmp/nizam-jsdom/node_modules node startup-order-test.js
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let html = fs.readFileSync('dist/index.html', 'utf8');
function inline(tag, file) {
  const code = fs.readFileSync('dist/' + file, 'utf8');
  html = html.replace(new RegExp('<script[^>]*src="' + tag + '"[^>]*>\\s*<\\/script>'), () => '<script>' + code + '</script>');
}
inline('splash\\.js', 'splash.js');
inline('app-lock\\.js', 'app-lock.js');
inline('device-activation\\.js', 'device-activation.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 80));

function boot(opts) {
  const o = opts || {};
  const errors = [];
  const calls = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && e.message ? e.message : e)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      if (o.splashShown) {
        try { win.sessionStorage.setItem('app_splash_shown', '1'); } catch (e) {}
      }
      try { win.crypto = win.crypto || {}; } catch (e) {}
      win.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('no audio')); };
      win.HTMLMediaElement.prototype.pause = function () {};
      win.HTMLCanvasElement.prototype.getContext = function () { return null; };
      win.fetch = (url, init) => {
        const u = String(url);
        calls.push(u);
        if (u.indexOf('/api/activation/') > -1) {
          const action = u.split('/api/activation/')[1].split('?')[0];
          if (o.offline) return Promise.reject(new Error('offline'));
          let payload = { ok: false, error: 'unknown' };
          if (action === 'status') payload = o.activationStatus || { ok: true, available: false, enforced: false };
          else if (action === 'passcode') payload = o.passcode || { ok: false, code: 'BAD_PASSCODE', error: 'bad' };
          else if (action === 'verify') payload = o.verify || { ok: false, error: 'bad' };
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payload)) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ connected: true, configured: true }) });
      };
    }
  });
  return { dom, win: dom.window, doc: dom.window.document, errors, calls };
}

(async function run() {
  console.log('\n[1] غطاء الإقلاع والترتيب: ترحيب → كلمة مرور');
  const act = boot({
    activationStatus: { ok: true, available: true, enforced: true, activated: true, serverNow: Date.now() }
  });
  await wait(120);
  const d = act.doc;
  ok('غطاء الإقلاع موجود في الصفحة قبل أي سكربت', html.indexOf('id="appBootCover"') > -1 &&
    html.indexOf('appBootCover') < html.indexOf('<script src="app.js"'));
  ok('مفيش وميض للقائمة: الغطاء أو الترحيب بيغطي الشاشة',
    !!d.getElementById('appBootCover') || !!d.getElementById('awmSplash'));
  ok('شاشة الترحيب ظاهرة', !!d.getElementById('awmSplash'));
  ok('الترحيب بشعار الشركة مش أيقونة التطبيق',
    (d.querySelector('#awmSplash .awm-splash__mark-img') || {}).getAttribute('src') === 'icons/logo-amw.png');
  ok('الترحيب فيه اسم الشركة AMW Code', (d.getElementById('awmSplash') || {}).textContent.indexOf('AMW Code') > -1);
  ok('شاشة كلمة المرور مش ظاهرة تحت الترحيب', !d.getElementById('appLock'));

  d.getElementById('awmSkip').dispatchEvent(new act.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(400);
  ok('بعد الترحيب ظهرت كلمة المرور', !!d.getElementById('appLock'));
  ok('غطاء الإقلاع اتشال', !d.getElementById('appBootCover'));
  ok('شاشة التفعيل مش ظاهرة لجهاز مفعّل', !d.getElementById('deviceActivation'));

  console.log('\n[2] جهاز غير مفعّل: شاشة التفعيل والهوية والعدّاد');
  const server = {
    activationStatus: { ok: true, available: true, enforced: true, activated: false, serverNow: Date.now() },
    passcode: { ok: true, passcodeValid: true, deviceCode: '482913', secondsLeft: 280 },
    verify: { ok: true, activated: true, token: 'tok_startup_order_1234567890' }
  };
  const na = boot(Object.assign({ splashShown: true }, server));
  await wait(200);
  const nd = na.doc;
  const overlay = nd.getElementById('deviceActivation');
  ok('شاشة التفعيل ظهرت', !!overlay);
  ok('غطاء الإقلاع اتشال بعد ظهور التفعيل', !nd.getElementById('appBootCover'));
  ok('فيها شعار الشركة', (nd.querySelector('.dev-act__logo') || {}).getAttribute('src') === 'icons/logo-amw.png');
  ok('فيها اسم الشركة', (nd.querySelector('.dev-act__brand') || {}).textContent.indexOf('AMW Code') > -1);
  const wa = nd.querySelector('.dev-act__company .dev-act__wa');
  ok('فيها تواصل واتساب', !!wa && /wa\.me\/201013318895/.test(wa.getAttribute('href') || ''), wa ? wa.getAttribute('href') : 'missing');
  const timerVal = (nd.getElementById('daPassTimerVal') || {}).textContent || '';
  ok('عدّاد كلمة المرور شغّال بصيغة دق:ث', /^\d{2}:\d{2}$/.test(timerVal), timerVal);
  const css = fs.readFileSync('dist/styles.css', 'utf8');
  function zOf(sel) {
    const block = css.split(sel + '{')[1] || '';
    const m = block.match(/z-index:\s*(\d+)/);
    return m ? Number(m[1]) : 0;
  }
  const splashZ = Number((fs.readFileSync('dist/splash.js', 'utf8')
    .match(/\.awm-splash\{position:fixed;inset:0;z-index:(\d+)/) || [])[1] || 0);
  ok('الترتيب البصري: تفعيل > ترحيب > كلمة مرور',
    zOf('.dev-act') > splashZ && splashZ > zOf('.app-lock'),
    zOf('.dev-act') + ' / ' + splashZ + ' / ' + zOf('.app-lock'));
  const gateZ = Number((html.match(/id="forceAuthGate"[^>]*z-index:(\d+)/) || [])[1] || 0);
  const coverZ = Number((html.match(/id="appBootCover"[^>]*z-index:(\d+)/) || [])[1] || 0);
  ok('غطاء الإقلاع فوق شاشة ربط Google (مفيش ظهور ليها قبل الترحيب)',
    coverZ > gateZ && splashZ > coverZ, 'cover=' + coverZ + ' gate=' + gateZ + ' splash=' + splashZ);

  console.log('\n[3] باسورد قديم → رسالة انتهاء المدة');
  server.passcode = { ok: false, code: 'BAD_PASSCODE', expired: true, error: 'انتهت مدة هذا الباسورد' };
  const na2 = boot(Object.assign({ splashShown: true }, server));
  await wait(200);
  const pInput = na2.doc.getElementById('daPass');
  pInput.value = '111111';
  na2.doc.getElementById('daNext').click();
  await wait(180);
  const errBox = na2.doc.getElementById('daErr');
  ok('ظهرت رسالة انتهاء مدة الباسورد',
    !!errBox && !errBox.hidden && /انتهت مدة هذا الباسورد/.test(errBox.textContent), errBox ? errBox.textContent : '');
  ok('الشاشة لسه بتطلب باسورد', !!na2.doc.getElementById('daPass'));

  /* باسورد غلط (مش منتهي): رسالة مختلفة وواضحة */
  const na2b = boot(Object.assign({ splashShown: true }, server, {
    passcode: { ok: false, code: 'BAD_PASSCODE', expired: false, error: 'كلمة المرور غير صحيحة' }
  }));
  await wait(200);
  na2b.doc.getElementById('daPass').value = '222222';
  na2b.doc.getElementById('daNext').click();
  await wait(180);
  const errBox2 = na2b.doc.getElementById('daErr');
  ok('الباسورد الغلط رسالته «غير صحيحة» مش «انتهت المدة»',
    !!errBox2 && /غير صحيحة/.test(errBox2.textContent) && !/انتهت مدة هذا الباسورد/.test(errBox2.textContent),
    errBox2 ? errBox2.textContent : '');
  ok('في لينك واتساب لطلب باسورد جديد',
    !!na2b.doc.querySelector('.dev-act__company .dev-act__wa') &&
    decodeURIComponent(na2b.doc.querySelector('.dev-act__company .dev-act__wa').getAttribute('href')).indexOf('باسورد') > -1);

  console.log('\n[4] باسورد صح → كود الجهاز + عداد + بيانات الشركة');
  const na3 = boot(Object.assign({ splashShown: true }, server, { passcode: { ok: true, secondsLeft: 280 } }));
  await wait(200);
  const p3 = na3.doc.getElementById('daPass');
  p3.value = '135790';
  na3.doc.getElementById('daNext').click();
  await wait(200);
  const idEl = na3.doc.getElementById('daDeviceId');
  ok('كود الجهاز ظاهر 6 أرقام', !!idEl && /^\d{6}$/.test(idEl.textContent), idEl ? idEl.textContent : '');
  ok('عدّاد كود التفعيل ظاهر', /^\d{2}:\d{2}$/.test((na3.doc.getElementById('daCodeTimerVal') || {}).textContent || ''));
  ok('بيانات الشركة موجودة على صفحة الكود', (na3.doc.querySelector('.dev-act__company') || {}).textContent.indexOf('AMW Code') > -1);
  ok('حقل كود التفعيل موجود', !!na3.doc.getElementById('daCode'));

  console.log('\n[5] بعد التفعيل: الشاشة ما تظهرش تاني');
  const codeInput = na3.doc.getElementById('daCode');
  codeInput.value = '654321';
  na3.doc.getElementById('daGo').click();
  await wait(200);
  ok('القفل اتشال بعد الكود الصح', !na3.doc.getElementById('deviceActivation'));
  ok('التوكن اتحفظ', na3.win.localStorage.getItem('device_activation_token') === 'tok_startup_order_1234567890');

  const again = boot({
    splashShown: true,
    activationStatus: { ok: true, available: true, enforced: true, activated: true, serverNow: Date.now() }
  });
  try {
    again.win.localStorage.setItem('device_activation_token', 'tok_startup_order_1234567890');
    again.win.localStorage.setItem('device_activation_cache', JSON.stringify({ available: true, enforced: true, activated: true, at: Date.now() }));
  } catch (e) {}
  await wait(200);
  ok('الجهاز المتفعّل: شاشة التفعيل مش بتظهر تاني', !again.doc.getElementById('deviceActivation'));
  ok('الجهاز المتفعّل: كلمة المرور بتظهر عادي', !!again.doc.getElementById('appLock'));

  console.log('\n[6] إلغاء التفعيل من الخادم لازم يرجّع الشاشة');
  const revoked = boot({
    splashShown: true,
    activationStatus: { ok: true, available: true, enforced: true, activated: false, serverNow: Date.now() }
  });
  try {
    revoked.win.localStorage.setItem('device_activation_token', 'tok_startup_order_1234567890');
    revoked.win.localStorage.setItem('device_activation_cache', JSON.stringify({ available: true, enforced: true, activated: true, at: Date.now() }));
  } catch (e) {}
  await wait(200);
  ok('الجهاز الملغي تفعيله: الشاشة رجعت', !!revoked.doc.getElementById('deviceActivation'));

  const allErrors = act.errors.concat(na.errors, na2.errors, na3.errors, again.errors, revoked.errors);
  ok('مفيش أخطاء JS في الإقلاع', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));

  console.log('\n' + (fail ? '✗ فشل ' + fail + ' / ' + (pass + fail) : '✓ نجح ' + pass + ' / ' + (pass + fail)));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('✗ خطأ غير متوقع:', e);
  process.exit(1);
});
