/* اختبار الإشعارات: تظهر، تقفل بزر ×، وتختفي بعد 15 ثانية */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.message)));
vc.on('error', (...a) => errors.push(a.join(' ')));

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
inline('period\\.js', 'period.js');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false, connected: false }) });
    window.HTMLAnchorElement.prototype.click = function () {};
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.localStorage.setItem('app_lock_session', '1');
    window.sessionStorage.setItem('app_splash_shown', '1');
    const orig = window.setTimeout;
    window.__delays = [];
    window.__timers = [];
    window.setTimeout = function (fn, ms) {
      try { window.__delays.push(Number(ms)); } catch (e) {}
      try { window.__timers.push({ fn: fn, ms: Number(ms) }); } catch (e) {}
      return orig.apply(window, arguments);
    };
  },
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); } };

(async function () {
  await wait(700);

  console.log('\n[1] الإشعار بيظهر');
  window.toast('رسالة اختبار');
  const t = doc.querySelector('#toast');
  ok('عنصر الإشعار موجود', !!t);
  ok('الإشعار ظاهر', !!(t && t.classList.contains('show')));
  ok('المدة 15 ثانية', window.__delays.indexOf(15000) > -1, (window.__delays.slice(-6) || []).join(','));

  console.log('\n[2] زر × بيقفل فورًا');
  const x = doc.querySelector('#toastClose');
  ok('زر الإغلاق موجود', !!x);
  x.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('اتقفل بالضغط على ×', !(t && t.classList.contains('show')));

  console.log('\n[2ب] pointerup بيقفل فورًا (لمس الموبايل)');
  window.toast('رسالة اختبار 2');
  const x2 = doc.querySelector('#toastClose');
  x2.dispatchEvent(new window.Event('pointerup', { bubbles: true, cancelable: true }));
  ok('اتقفل بـ pointerup', !(t && t.classList.contains('show')));

  console.log('\n[3] إشعار جديد بيظهر تاني');
  window.toast('رسالة تانية');
  ok('ظهر تاني', !!(t && t.classList.contains('show')));
  ok('النص اتحدّث', ((t && t.textContent) || '').indexOf('رسالة تانية') > -1);

  console.log('\n[3ب] الاختفاء التلقائي بعد 15 ثانية');
  const hideTimers = (window.__timers || []).filter((x) => x.ms === 15000);
  ok('اتجدول مؤقّت الاختفاء', hideTimers.length > 0, String(hideTimers.length));
  if (hideTimers.length) hideTimers[hideTimers.length - 1].fn();
  ok('الإشعار اختفى لوحده', !(t && t.classList.contains('show')));

  console.log('\n[3ج] نفس الرسالة ما بتجدّدش العدّاد');
  window.toast('رسالة مكرّرة');
  const before = (window.__timers || []).filter((x) => x.ms === 15000).length;
  window.toast('رسالة مكرّرة');
  window.toast('رسالة مكرّرة');
  const after = (window.__timers || []).filter((x) => x.ms === 15000).length;
  ok('ما اتجدّدش مؤقّت جديد', after === before, before + ' -> ' + after);
  ok('لسه ظاهر', !!(t && t.classList.contains('show')));

  console.log('\n[4] مفيش أخطاء');
  ok('بدون أخطاء تشغيل', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n==================================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})();
