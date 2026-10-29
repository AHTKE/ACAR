/* فحص دمج توريدات الموردين داخل «المرسل من موارد» + ظهور اسم المورد */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errs.push(String(e.message || e).slice(0, 150)));

let html = fs.readFileSync('dist/index.html', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/export.js', 'utf8') + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/app.js', 'utf8') + '</script>')
  .replace(/<script[^>]*src="auth-gate-addon\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/auth-gate-addon.js', 'utf8') + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = (u) => {
      if (String(u).indexOf('/api/google/status') > -1) {
        return Promise.resolve({ json: () => Promise.resolve({ configured: true, connected: true, email: 'gstsyusudg@gmail.com' }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    };
    w.HTMLAnchorElement.prototype.click = function () {};
    w.URL.createObjectURL = () => 'blob:t';
    w.URL.revokeObjectURL = () => {};
    w.localStorage.setItem('app_customers', JSON.stringify([{
      name: 'عميل توريد', phone: '0770', status: 'جاري العمل', total: 10000, down: 0,
      paidByUs: 5000, payments: [],
      sends: [{ work: 'بلاط', date: '2026-10-01', desc: 'مرسل تجريبي', qty: 1, price: 1000, total: 1000 }]
    }]));
    w.localStorage.setItem('app_suppliers', JSON.stringify([{
      name: 'مؤسسة النور للتوريد', job: 'مواد بناء', phone: '0770',
      tx: [{ date: '2026-10-05', no: '1', desc: 'توريد 50 طن إسمنت', incoming: 3000, paid: 0, to: 'عميل توريد', note: '' }]
    }]));
    w.localStorage.setItem('app_network_on', '1');
  }
});

const w = dom.window, d = w.document;
const $ = (s) => d.querySelector(s);
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (extra ? '  -> ' + extra : '')); } };

(async () => {
  await wait(1400);
  console.log('[دمج توريدات الموردين في المرسل]');
  ok('لا أخطاء وقت التحميل', errs.length === 0, errs.join('|'));
  click($('[data-go="customers"]'));
  await wait(80);
  click($('#customersTable tbody tr[data-idx]'));
  await wait(150);

  const sum = $('#sendSummary').textContent.replace(/\s+/g, ' ');
  /* 5000 مدفوع منا − (1000 مرسل + 3000 توريد) = 1000 متبقي */
  ok('الملخص احتسب توريد المورد (المتبقي 1,000)', sum.indexOf('1,000') > -1, sum.slice(0, 220));
  ok('الملخص يوضّح «منا + توريدات الموردين»', sum.indexOf('توريدات الموردين') > -1);

  const rows = d.querySelectorAll('#sendTable tbody tr');
  ok('جدول المرسل فيه الصف المرتبط للتوريد', Array.prototype.some.call(rows, (r) => r.textContent.indexOf('مرتبط') > -1),
     'rows=' + rows.length);
  ok('صف التوريد يذكر اسم المورد', Array.prototype.some.call(rows, (r) => r.textContent.indexOf('مؤسسة النور') > -1));

  const before = $('#sendForm').elements.beforeBal.value;
  ok('حاسبة «الرصيد قبل الطرح» = 1,000', before.indexOf('1,000') > -1, before);

  const lb = $('#linkBody').textContent.replace(/\s+/g, ' ');
  ok('لوحة «المرتبط» تعرض اسم المورد بدل اسم العميل فقط', lb.indexOf('المورد: مؤسسة النور') > -1, lb.slice(0, 200));

  /* تحميل بيانات العميل Excel/PDF */
  click($('#profileExcelBtn'));
  await wait(200);
  ok('زر Excel فتح نافذة الوجهة (جهاز/درايف)', $('#exportModal').classList.contains('is-open'),
     $('#exportFileName').textContent);
  ok('اسم الملف يبدأ بـ customer-', /^customer-.*\.xlsx$/.test($('#exportFileName').textContent),
     $('#exportFileName').textContent);
  click($('#exportModal [data-close]'));
  await wait(60);
  click($('#profilePdfBtn'));
  await wait(300);
  const pdfOpen = $('#exportModal').classList.contains('is-open');
  const pdfName = $('#exportFileName').textContent;
  ok('زر PDF جهّز ملفاً وفتح النافذة (أو بيحتاج متصفحاً حقيقياً)',
     (pdfOpen && /^customer-.*\.pdf$/.test(pdfName)) || ($('#toast span').textContent.indexOf('متصفحاً') > -1),
     pdfOpen ? pdfName : $('#toast span').textContent);
  if (pdfOpen) click($('#exportModal [data-close]'));
  await wait(60);

  ok('لا أخطاء بعد الفتح', errs.length === 0, errs.join('|'));
  console.log('\nالنتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل');
  process.exit(fail ? 1 : 0);
})();
