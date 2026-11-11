/* اختبار شاشة الربط في الحالة الطبيعية: مفيش «إعادة المحاولة» ولا رسالة خطأ
   لمجرد أن الحساب لسه مش مربوط، والضغط على الزر يوجّه لمسار OAuth مباشرة. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const exp = fs.readFileSync('dist/export.js', 'utf8');
const gate = fs.readFileSync('dist/auth-gate-addon.js', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + exp + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + app + '</script>')
  .replace(/<script[^>]*src="auth-gate-addon\.js"[^>]*>\s*<\/script>/, () => '<script>' + gate + '</script>');

const STATUS = {
  configured: true,
  connected: false,
  email: '',
  clientIdValid: true,
  secretValid: true,
  verdict: 'keys_ready',
  redirectUri: 'https://workflow-amw-code.vercel.app/api/google/callback'
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://workflow-amw-code.vercel.app/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    window.HTMLAnchorElement.prototype.click = function () {};
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.fetch = (url) => {
      const u = String(url);
      if (u.indexOf('/api/google/status') > -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(STATUS) });
      }
      if (u.indexOf('/api/sync/pull') > -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: false, exists: false }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

(async function () {
  await wait(700);

  console.log('\n[1] الحالة الطبيعية: غير مربوط، لكن الإعدادات سليمة');
  const errBox = $('#gateError');
  const hint = $('#gateHint');
  const retry = $('#gateRetry');
  const connect = $('#gateConnect');
  ok('شاشة الربط ظاهرة', $('#forceAuthGate') && $('#forceAuthGate').style.display !== 'none');
  ok('مفيش رسالة خطأ حمراء', !errBox || errBox.style.display === 'none', errBox && errBox.textContent);
  ok('فيه تلميح عربي واضح', !!hint && hint.style.display !== 'none' && /اختيار الحساب|اختيار حساب/.test(hint.textContent), hint && hint.textContent);
  ok('زر إعادة المحاولة مخفي', !retry || retry.style.display === 'none', retry && retry.style.display);
  ok('زر الربط ظاهر ومفعّل', !!connect && !connect.disabled, connect && connect.disabled);

  console.log('\n[2] زر الربط يوجّه مباشرة لـ OAuth');
  const inline = connect ? String(connect.getAttribute('onclick') || '') : '';
  ok('مفيش onclick قديم يعمل فحص مسبق', !/startGoogleLogin|google\/status/.test(inline), inline);
  ok('المسار المباشر موجود في الصفحة', /location\.href\s*=\s*'\/api\/google\/login'/.test(html));

  console.log('\n[3] إعدادات المجلد اختيارية ومخفيّة');
  ok('رابط المجلد داخل إعدادات متقدمة', !!$('#gateAdvanced') && !!$('#gateAdvanced').querySelector('#forceFolderUrl'));
  ok('إعدادات متقدمة مقفولة افتراضياً', $('#gateAdvanced').open === false);

  console.log('\n[3ب] Service Worker ما يعترضش OAuth');
  const sw = fs.readFileSync('dist/sw.js', 'utf8');
  ok('مسارات /api مستثناة من الاعتراض', /url\.pathname\.indexOf\('\/api\/'\) === 0\) return/.test(sw));
  ok('نسخة الكاش اتغيّرت', /nizam-idara-v22/.test(sw));

  console.log('\n[4] لا أخطاء تشغيل');
  ok('لا أخطاء JS', errors.length === 0, errors.join(' | ').slice(0, 300));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  window.close();
  process.exit(fail ? 1 : 0);
})();
