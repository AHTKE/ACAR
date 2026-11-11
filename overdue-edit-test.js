/* اختبار جرس المتأخرين + تعديل دفعة التحصيل */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
const startKey = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0');
const today = iso(now);

const seed = [
  {
    name: 'عميل اختبار متأخر', phone: '07700000001', status: 'نشط',
    total: 90000, down: 0, duration: '3 شهر', dueDay: 1,
    scheduleStart: startKey, startDate: today,
    payments: [{ date: today, amount: 1000, no: 1, note: 'دفعة أولى' }]
  },
  {
    name: 'عميل منتظم', phone: '07700000002', status: 'نشط',
    total: 10000, down: 0, duration: '1 شهر', dueDay: 1,
    scheduleStart: startKey, startDate: today,
    payments: [{ date: today, amount: 10000, no: 1, note: 'سداد كامل' }]
  }
];

let html = fs.readFileSync('dist/index.html', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const exp = fs.readFileSync('dist/export.js', 'utf8');
const monthly = fs.readFileSync('dist/monthly.js', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + exp + '</script>')
  .replace(/<script[^>]*src="monthly\.js"[^>]*>\s*<\/script>/, () => '<script>' + monthly + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + app + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.localStorage.setItem('app_customers', JSON.stringify(seed));
    window.localStorage.setItem('app_section_locks_v1', JSON.stringify({ version: 1, locks: {} }));
    window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ configured: false, connected: false })
    });
    window.HTMLAnchorElement.prototype.click = function () {};
    try {
      if (!window.document.createElement('canvas').getContext('2d')) {
        window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      }
    } catch (e) {
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    }
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const stored = () => JSON.parse(window.localStorage.getItem('app_customers'));
const restOf = (c) => {
  const total = Number(c.total || 0), down = Number(c.down || 0);
  const due = c.due != null ? Number(c.due) : Math.max(total - down, 0);
  const paid = Number(c.later || 0) + (c.payments || []).reduce((n, p) => n + Number(p.amount || 0), 0);
  return Math.max(due - paid, 0);
};

(async function () {
  await wait(350);
  console.log('\n[1] جرس المتأخرين');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | ').slice(0, 500));
  ok('زر الجرس موجود', !!$('#notifBtn'));
  const items = window.NizamApp.overdueItems();
  ok('عميل متأخر واحد فقط', items.length === 1, JSON.stringify(items));
  ok('اسم المتأخر ظاهر في القائمة', ($('#notifList').textContent || '').indexOf('عميل اختبار متأخر') > -1,
     $('#notifList').textContent);
  ok('هاتف المتأخر ظاهر', ($('#notifList').textContent || '').indexOf('07700000001') > -1);
  ok('العداد ظاهر ويساوي 1', $('#notifBadge').hidden === false && $('#notifBadge').textContent === '1',
     'hidden=' + $('#notifBadge').hidden + ' text=' + $('#notifBadge').textContent);

  click($('#notifBtn'));
  await wait(20);
  ok('الضغط على الجرس يفتح المربع', $('#notifPop').hidden === false);
  ok('aria-expanded=true', $('#notifBtn').getAttribute('aria-expanded') === 'true');
  const item = $('[data-notif-idx]');
  ok('عنصر إشعار قابل للضغط', !!item);
  if (item) {
    click(item);
    await wait(50);
    ok('الضغط على الإشعار يفتح ملف العميل', $('#view-profile').classList.contains('is-active'));
    ok('الملف يعرض العميل الصحيح', ($('#profileTitle').textContent || '').indexOf('عميل اختبار متأخر') > -1,
       $('#profileTitle').textContent);
    ok('المربع اتقفل بعد الفتح', $('#notifPop').hidden === true);
  }

  console.log('\n[2] تعديل دفعة التحصيل');
  click($('[data-go="collection"]'));
  await wait(40);
  ok('شاشة التحصيل فتحت بدون قفل', $('#view-collection').classList.contains('is-active'));
  const row = $('#collectTbody tr.collection-row');
  ok('صف العميل موجود', !!row);
  click(row);
  await wait(30);
  const editBtn = $('[data-edit-colpay]');
  ok('زر تعديل الدفعة موجود بجانب الحذف', !!editBtn);
  ok('زر الحذف ما زال موجوداً', !!$('[data-del-colpay]'));
  const beforeAmount = Number(stored()[0].payments[0].amount);
  const beforeRest = restOf(stored()[0]);
  if (editBtn) {
    click(editBtn);
    await wait(20);
    const form = $('#mainCollectForm');
    ok('نموذج التحصيل دخل وضع التعديل', form.getAttribute('data-edit-pay') === '0');
    ok('المبلغ القديم اتعبّى تلقائياً', form.elements.amount.value === String(beforeAmount),
       form.elements.amount.value);
    ok('زر الحفظ اتغيّر لـ حفظ التعديل', /حفظ التعديل/.test(form.querySelector('button[type="submit"]').textContent));
    ok('زر إلغاء التعديل ظاهر', form.querySelector('[data-cancel-edit]').hidden === false);
    ok('معاينة المتبقي قبل التغيير صحيحة', form.elements.restAfter.value === beforeRest.toLocaleString('en-US'),
       form.elements.restAfter.value + ' expected=' + beforeRest.toLocaleString('en-US'));

    form.elements.amount.value = '2000';
    form.elements.amount.dispatchEvent(new window.Event('input', { bubbles: true }));
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(80);
    const after = stored()[0];
    ok('الدفعة اتعدّلت لنفس العنصر', after.payments.length === 1 && Number(after.payments[0].amount) === 2000,
       JSON.stringify(after.payments));
    ok('المتبقي اتخصم بالفرق فقط', after.balance === beforeRest - 1000,
       'balance=' + after.balance + ' expected=' + (beforeRest - 1000));
    ok('النموذج رجع لوضع الإضافة', !$('#mainCollectForm').getAttribute('data-edit-pay'));
    ok('لا أخطاء بعد التعديل', errors.length === 0, errors.join(' | ').slice(0, 400));
  }

  console.log('\n[3] إلغاء التعديل والتحقق من الحد');
  click($('[data-edit-colpay]'));
  await wait(20);
  click($('[data-cancel-edit]'));
  await wait(20);
  ok('إلغاء التعديل يرجّع النموذج للإضافة', !$('#mainCollectForm').getAttribute('data-edit-pay'));
  ok('إلغاء التعديل لا يغيّر المبلغ', Number(stored()[0].payments[0].amount) === 2000);

  click($('[data-edit-colpay]'));
  await wait(20);
  const form2 = $('#mainCollectForm');
  form2.elements.amount.value = '999999';
  form2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  ok('مبلغ أكبر من المتاح اترفض', !$('#mainCollectForm .form__error').hidden);
  ok('الدفعة لم تتغيّر بعد الرفض', Number(stored()[0].payments[0].amount) === 2000);

  console.log('\n=== النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ===');
  if (errors.length) console.log('أخطاء JS: ' + errors.length + ' — ' + errors.join(' | ').slice(0, 500));
  process.exit(fail ? 1 : 0);
})();
