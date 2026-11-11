/* اختبار شاشة الترحيب: تظهر، تتقدم تلقائيًا، زر التخطي، وملف صوت ناقص ما يعطّلش */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
function inline(tag, file) {
  const code = fs.readFileSync('dist/' + file, 'utf8');
  html = html.replace(new RegExp('<script[^>]*src="' + tag + '"[^>]*>\\s*<\\/script>'), () => '<script>' + code + '</script>');
}
inline('export\\.js', 'export.js');
inline('app\\.js', 'app.js');
inline('auth-gate-addon\\.js', 'auth-gate-addon.js');
inline('splash\\.js', 'splash.js');
inline('app-lock\\.js', 'app-lock.js');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false, connected: false }) });
    window.HTMLAnchorElement.prototype.click = function () {};
    window.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('audio unavailable')); };
    window.HTMLMediaElement.prototype.pause = function () {};
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
  },
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };

(async function () {
  await wait(400);
  console.log('\n[1] ظهور شاشة الترحيب');
  ok('الشاشة ظهرت', !!$('#awmSplash'));
  ok('فيها اسم التطبيق', ($('#awmSplash') || {}).textContent.indexOf('WorkFlow') > -1);
  ok('فيها WELCOME', ($('#awmSplash') || {}).textContent.indexOf('Welcome') > -1);
  ok('فيها زر تخطي وزر صوت', !!$('#awmSkip') && !!$('#awmSound'));
  ok('شاشة الدخول موجودة تحتها', !!$('#appLock'));

  console.log('\n[2] التخطي');
  $('#awmSkip').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(250);
  ok('الشاشة اتشالت بالتخطي', !$('#awmSplash'));
  ok('اتسجلت في الجلسة', window.sessionStorage.getItem('app_splash_shown') === '1');
  ok('التطبيق اقلع بعدها', !!window.__appBooted || !!$('#appLock'));

  console.log('\n[3] ملف صوت ناقص ما يعطّلش');
  ok('مفيش أخطاء تشغيل', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n[4] التقدم التلقائي لو المستخدم مالمسش');
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://example2.test/', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false, connected: false }) });
      w.HTMLAnchorElement.prototype.click = function () {};
      w.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('audio unavailable')); };
      w.HTMLMediaElement.prototype.pause = function () {};
      w.URL.createObjectURL = () => 'blob:test';
      w.URL.revokeObjectURL = () => {};
    },
  });
  await wait(600);
  const d2 = dom2.window.document;
  ok('ظهرت في الجلسة الجديدة', !!d2.querySelector('#awmSplash'));
  await wait(4200);
  ok('اتشالت تلقائيًا بعد ~4.2 ثانية', !d2.querySelector('#awmSplash'));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})();
