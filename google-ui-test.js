/* اختبار واجهة تشخيص Google: رسائل الحالة + زر «فحص المفاتيح» + رسالة شاشة البدء */
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
  clientIdTail: '2gmkg7a',
  clientIdLength: 71,
  clientIdValid: false,
  secretPresent: true,
  secretValid: true,
  redirectUri: 'https://workflow-amw-code.vercel.app/api/google/callback',
  verdict: 'bad_client_id_format'
};
const CHECK = {
  ok: true,
  verdict: 'client_id_not_found',
  clientId: '1089687675916-bad.apps.googleusercontent.com',
  clientIdValid: true,
  secretPresent: true,
  secretValid: true,
  redirectUri: 'https://workflow-amw-code.vercel.app/api/google/callback',
  idProbe: { status: 400, clientNotFound: true, redirected: false, redirectUriMismatch: false },
  secretProbe: { status: 401, error: 'invalid_client' },
  advice: 'Google لا يعرف هذا الـClient ID: إمّا اتشال أو من مشروع تاني. راجع Google Cloud ← Clients.'
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://workflow-amw-code.vercel.app/?g=err&m=' + encodeURIComponent('Google لا يعرف الـClient ID الموجود في Vercel'),
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
      if (u.indexOf('/api/google/check') > -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CHECK) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

(async function () {
  await wait(500);

  console.log('\n[1] رسالة فشل الربط على شاشة البدء');
  const gateErr = $('#gateError');
  ok('صندوق الخطأ موجود', !!gateErr);
  ok('الخطأ ظاهر', gateErr && gateErr.style.display === 'block', gateErr && gateErr.style.display);
  ok('الرسالة عربية ومفصّلة', gateErr && gateErr.textContent.indexOf('Client ID') > -1, gateErr && gateErr.textContent);
  ok('زر فحص المفاتيح على شاشة البدء موجود', !!$('#gateDiag'));

  console.log('\n[2] حالة الربط في الإعدادات');
  click($('[data-go="settings"]'));
  await wait(250);
  const status = $('#driveStatusText').textContent || '';
  ok('الحالة توضح أن الصيغة غير صحيحة', status.indexOf('غير صحيحة') > -1, status);
  ok('الحالة تعرض نهاية الـClient ID للمقارنة', status.indexOf('2gmkg7a') > -1, status);
  ok('ملاحظة الإعدادات تشرح الصيغة الصحيحة',
     ($('#driveNote').textContent || '').indexOf('apps.googleusercontent.com') > -1, $('#driveNote').textContent);
  ok('رابط الإرجاع معروض', ($('#driveRedirect').textContent || '').indexOf('/api/google/callback') > -1);

  console.log('\n[3] زر «فحص المفاتيح»');
  ok('الزر موجود', !!$('#driveCheck'));
  click($('#driveCheck'));
  await wait(200);
  const box = $('#driveDiagBox');
  ok('صندوق نتيجة الفحص ظهر', box && box.hidden === false);
  const txt = box ? (box.textContent || '') : '';
  ok('النتيجة تذكر أن Google لا يعرف المعرّف', txt.indexOf('Google لا يعرف') > -1, txt.slice(0, 120));
  ok('النتيجة تعرض رقم/نهاية الـClient ID', txt.indexOf('apps.googleusercontent.com') > -1);
  ok('النتيجة تعرض رابط الإرجاع', txt.indexOf('/api/google/callback') > -1);
  ok('النتيجة تشرح الـSecret', txt.indexOf('Secret') > -1);
  ok('الصندوق متلوّن حسب النتيجة', box.className.indexOf('drive-diag') > -1, box.className);
  ok('زر إعادة التحميل ظاهر فقط عند النجاح', $('#driveReload').hidden === true);

  console.log('\n[4] لا أخطاء تشغيل');
  ok('لا أخطاء JS', errors.length === 0, errors.join(' | ').slice(0, 200));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  window.close();
  process.exit(fail ? 1 : 0);
})();
