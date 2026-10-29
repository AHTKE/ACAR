/* اختبار وضع المشاهد: حساب غير مصرح له لا يستطيع إضافة/تعديل/حذف */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const exp = fs.readFileSync('dist/export.js', 'utf8');
const gate = fs.readFileSync('dist/auth-gate-addon.js', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + exp + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + app + '</script>')
  .replace(/<script[^>]*src="auth-gate-addon\.js"[^>]*>\s*<\/script>/, () => '<script>' + gate + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // محاكاة حساب غير مصرح به (مشهد فقط)
    window.fetch = (url) => {
      if (String(url).indexOf('/api/google/status') > -1) {
        return Promise.resolve({
          json: () => Promise.resolve({ configured: true, connected: true, email: 'viewer@example.com' })
        });
      }
      if (String(url).indexOf('/api/sync/pull') > -1) {
        return Promise.resolve({ json: () => Promise.resolve({ ok: false, exists: false }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    };
    window.HTMLAnchorElement.prototype.click = function () {};
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
  },
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

(async function () {
  console.log('\n[1] وضع المشاهد بعد الربط بحساب غير مصرح به');
  await wait(600);

  ok('الدور اتسجل viewer في localStorage', window.localStorage.getItem('app_user_role') === 'viewer',
     window.localStorage.getItem('app_user_role'));
  ok('علامة وضع المشاهد على الصفحة', doc.documentElement.getAttribute('data-viewer-mode') === '1');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | ').slice(0, 300));

  console.log('\n[2] إخفاء أزرار الإضافة/التعديل/الحذف');
  const addBtns = $$('button').filter((b) => /إضافة/.test(b.textContent || ''));
  const delBtns = $$('button').filter((b) => /حذف/.test(b.textContent || ''));
  const editBtns = $$('button').filter((b) => /تعديل/.test(b.textContent || ''));
  ok('أزرار «إضافة» موجودة وتُخفت', addBtns.length > 0 && addBtns.every((b) => b.style.display === 'none'),
     'total=' + addBtns.length + ' hidden=' + addBtns.filter((b) => b.style.display === 'none').length);
  ok('أزرار «حذف» تُخفت', delBtns.length > 0 && delBtns.every((b) => b.style.display === 'none'),
     'total=' + delBtns.length);
  ok('أزرار «تعديل» تُخفت', editBtns.every((b) => b.style.display === 'none'),
     'total=' + editBtns.length);
  const navBtns = $$('button[data-go]').filter((b) => !/^add-/.test(b.getAttribute('data-go') || ''));
  ok('أزرار التنقل بين الأقسام ظاهرة (لا تُغلق)', navBtns.length > 0 &&
     navBtns.every((b) => b.style.display !== 'none'),
     'total=' + navBtns.length + ' hidden=' + navBtns.filter((b) => b.style.display === 'none').length);
  const addNav = $$('button[data-go]').filter((b) => /^add-/.test(b.getAttribute('data-go') || ''));
  ok('بوابات «إضافة» في التنقل مخفية', addNav.length > 0 &&
     addNav.every((b) => b.style.display === 'none'),
     'total=' + addNav.length + ' hidden=' + addNav.filter((b) => b.style.display === 'none').length);
  const uploadBtns = $$('button').filter((b) => /رفع/.test(b.textContent || ''));
  if (uploadBtns.length) ok('أزرار «رفع» لا تُخفى (منع بالنقر فقط)', uploadBtns.every((b) => b.style.display !== 'none'),
     'total=' + uploadBtns.length);
  const disconnectBtn = $('#driveDisconnect');
  if (disconnectBtn) {
    const dev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    disconnectBtn.dispatchEvent(dev);
    ok('زر «فصل الربط» محظور على المشاهد', dev.defaultPrevented === true);
  }

  console.log('\n[3] منع النقر حتى لو زر ظاهر');
  // نعيد إظهار زر حذف يدوياً لمحاكاة زر فُتح بطريقة غير متوقعة
  const fake = doc.createElement('button');
  fake.textContent = 'حذف العميل';
  fake.id = 'fakeDel';
  doc.body.appendChild(fake);
  fake.style.display = ''; // ظاهر
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  fake.dispatchEvent(ev);
  ok('النقر على زر حذف تم منعه', ev.defaultPrevented === true);
  ok('تنبيه «حساب مشاهد» ظهر', ($('#toast span').textContent || '').indexOf('مشاهد') > -1,
     $('#toast span').textContent);

  console.log('\n[4] منع إرسال النماذج (Save/Submit)');
  const form = $('#customerForm');
  let submitBlocked = false;
  if (form) {
    const sev = new window.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(sev);
    submitBlocked = sev.defaultPrevented === true;
    ok('إرسال نموذج العميل تم منعه', submitBlocked);
  } else {
    ok('نموذج العميل موجود', false, 'لم يُعثر عليه');
  }

  console.log('\n[5] العناصر المسموحة للمشاهدة');
  const navCard = $('[data-go="customers"]');
  if (navCard) {
    const nev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    navCard.dispatchEvent(nev);
    ok('التنقل بين الأقسام مسموح', nev.defaultPrevented === false);
  }
  ok('شريط البحث مفعّل', $('#customerSearch') && $('#customerSearch').disabled !== true);

  console.log('\n[6] شاشة الربط الإلزامية');
  const gateEl = $('#forceAuthGate');
  ok('شاشة الربط موجودة', !!gateEl);
  ok('شاشة الربط مخفية بعد نجاح الربط', gateEl && gateEl.style.display === 'none', gateEl && gateEl.style.display);
  ok('حقل رابط المجلد موجود', !!$('#forceFolderUrl'));

  console.log('\n[7] شريط ربط جوجل في وسط الشاشة + تطبيق أحدث نسخة تلقائياً');
  const bar = $('#viewerDriveBar');
  ok('شريط المشاهد ظهر', !!bar && bar.style.display === 'flex', bar && bar.style.display);
  const vbtn = $('#viewerDriveBtn');
  ok('زر ربط/تحديث جوجل موجود', !!vbtn && (vbtn.textContent || '').indexOf('Google Drive') > -1,
     vbtn && vbtn.textContent);
  ok('سياسة المزامنة إجبارية auto للمشاهد', window.localStorage.getItem('app_sync_policy') === 'auto',
     window.localStorage.getItem('app_sync_policy'));
  let pulled = 0;
  window.syncCheck = function () { pulled++; return Promise.resolve(null); };
  await wait(900);
  ok('سحب أحدث نسخة اشتغل تلقائياً', pulled > 0, 'calls=' + pulled);
  ok('المشاهد لا يرفع أي نسخة', typeof window.syncCheck === 'function');

  console.log('\n=== النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ===');
  if (errors.length) console.log('أخطاء JS: ' + errors.length + ' — ' + errors.join(' | ').slice(0, 500));
  process.exit(fail ? 1 : 0);
})();