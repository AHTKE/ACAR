/* ============================================================
   wa-test.js
   1) خاصية رسائل التحصيل عبر واتساب (قالب + منع التكرار + إرسال جماعي)
   2) منع «الشاشة الفاضية»: تخزين تالف أو رسم يفشل → التطبيق يفضل شغال
   ============================================================ */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlSrc = fs.readFileSync('dist/index.html', 'utf8');
const appSrc = fs.readFileSync('dist/app.js', 'utf8');
const expSrc = fs.readFileSync('dist/export.js', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

function boot(opts) {
  opts = opts || {};
  const errs = [];
  const opened = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  let html = htmlSrc
    .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + expSrc + '</script>')
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + appSrc + '</script>');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (opts.seed) {
        for (const k in opts.seed) window.localStorage.setItem(k, opts.seed[k]);
      }
      window.open = function (url) { opened.push(String(url)); return { closed: false }; };
      window.HTMLAnchorElement.prototype.click = function () {};
      window.HTMLCanvasElement.prototype.getContext = function () { return null; };
      window.URL.createObjectURL = function () { return 'blob:test'; };
      window.URL.revokeObjectURL = function () {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });
  const window = dom.window;
  return {
    window,
    doc: window.document,
    opened,
    errs,
    $: (s) => window.document.querySelector(s),
    $$: (s) => Array.from(window.document.querySelectorAll(s)),
    click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    toast: () => {
      const t = window.document.getElementById('toast');
      return t ? (t.textContent || '') : '';
    },
  };
}

const unlock = (t) => {
  t.click(t.$('[data-go="collection"]'));
  ['2', '4', '6', '8'].forEach((k) => t.click(t.$('#keypad button[data-key="' + k + '"]')));
};

/* ======================= المرحلة أ: خاصية واتساب ======================= */
(async function phaseA() {
  console.log('\n[أ] رسائل التحصيل عبر واتساب');

  const CUSTOMERS = [
    { name: 'عميل له تحصيل', phone: '01013318895', phone2: '01112223333',
      total: 10000, down: 0, due: 10000, later: 0,
      payments: [{ date: '2026-10-01', amount: 1500, no: 1 }] },
    { name: 'عميل بدون تحصيل', phone: '01234567890', total: 5000, down: 0, due: 5000, payments: [] },
    { name: 'عميل بدون رقم أساسي', phone: '', phone2: '01555666777',
      total: 8000, down: 0, due: 8000, later: 0,
      payments: [{ date: '2026-10-05', amount: 800, no: 1 }] }
  ];

  const t = boot({ seed: { app_customers: JSON.stringify(CUSTOMERS) } });
  await t.wait(60);
  ok('لا أخطاء وقت التشغيل', t.errs.length === 0, t.errs.join(' | '));

  unlock(t);
  await t.wait(400);
  ok('شاشة التحصيل انفتحت', t.$('#view-collection').classList.contains('is-active'));
  ok('لا أخطاء بعد كلمة المرور', t.errs.length === 0, t.errs.join(' | '));

  ok('لوحة رسائل واتساب موجودة', !!t.$('#waPanel'));
  ok('حقل القالب ممتلئ بالقالب الافتراضي',
    (t.$('#waTemplate') ? t.$('#waTemplate').value : '').indexOf('{الاسم}') > -1,
    t.$('#waTemplate') ? t.$('#waTemplate').value.slice(0, 40) : 'غير موجود');
  ok('القالب بيتضمن المطلوب: تاريخ/قبل/مدفوع/متبقي',
    ['{التاريخ}', '{قبل}', '{المدفوع}', '{المتبقي}'].every((k) => t.$('#waTemplate').value.indexOf(k) > -1));

  const rows = t.$$('#waTbody tr');
  ok('الصفوف = العملاء اللي عندهم تحصيل فقط (2 من 3)', rows.length === 2, 'rows=' + rows.length);
  ok('العميل بدون تحصيل مش ظاهر',
    t.$('#waTbody').textContent.indexOf('عميل بدون تحصيل') === -1);
  ok('العدّاد محدَّث', /2 عميل/.test(t.$('#waCount').textContent), t.$('#waCount').textContent);
  ok('المعاينة مليانة وفيها اسم العميل وبلا قيم متبقية',
    t.$('#waPreview').value.indexOf('عميل له تحصيل') > -1 && t.$('#waPreview').value.indexOf('{') === -1,
    t.$('#waPreview').value);

  /* --- إرسال لعميل واحد --- */
  const send0 = t.$('[data-wa-send="0"]');
  ok('زر الإرسال متاح', !!send0 && !send0.disabled);
  t.click(send0);
  await t.wait(60);
  ok('اتفتح wa.me بالرقم الدولي الصحيح (كود 20)',
    t.opened.length === 1 && t.opened[0].indexOf('https://wa.me/201013318895?text=') === 0,
    t.opened[0]);
  const text = decodeURIComponent((t.opened[0] || '').split('text=')[1] || '');
  ok('الرسالة فيها اسم العميل', text.indexOf('عميل له تحصيل') > -1, text.slice(0, 80));
  ok('الرسالة ما فيهاش قيمات استبدال متبقية', text.indexOf('{') === -1, text);
  ok('الحالة بقت «تم الإرسال»', t.$('#waTbody').textContent.indexOf('تم الإرسال') > -1);
  ok('الزر بقى معطّل بعد الإرسال', t.$('[data-wa-send="0"]').disabled === true);

  /* --- منع التكرار --- */
  t.click(t.$('#waTbody button[data-wa-send="0"]'));
  await t.wait(60);
  ok('مفيش إرسال تاني لنفس التحصيل', t.opened.length === 1, 'opened=' + t.opened.length);
  ok('الرسالة بتوضح إنه اتبعت', t.toast().indexOf('من قبل') > -1, t.toast());

  /* --- الإرسال الجماعي مع ما فيش طلبات جديدة --- */
  t.click(t.$('#waSendAllBtn'));
  await t.wait(700);
  ok('الإرسال الجماعي ما فتحش حاجة لأن الكل اتبعت/بدون رقم', t.opened.length === 1, 'opened=' + t.opened.length);
  ok('رسالة «مفيش رسائل جديدة»', t.toast().indexOf('مفيش رسائل جديدة') > -1, t.toast());

  /* --- تغيير الرقم الاحتياطي يفعّل العميل التاني --- */
  const sel = t.$('#waPhonePref');
  sel.value = 'both';
  sel.dispatchEvent(new t.window.Event('change', { bubbles: true }));
  await t.wait(60);
  ok('العميل اللي مالوش رقم أساسي بقى عليه رقم احتياطي',
    t.$('#waTbody').textContent.indexOf('01555666777') > -1);
  const send2 = t.$('[data-wa-send="2"]');
  ok('زر إرسال العميل التاني اتفعّل', !!send2 && !send2.disabled);

  t.click(t.$('#waSendAllBtn'));
  await t.wait(900);
  ok('الإرسال الجماعي بعت للعميل المتبقي', t.opened.length === 2, 'opened=' + t.opened.length);
  ok('الإرسال الجماعي بيأكد العدد', /تم إرسال 1 رسالة من 1/.test(t.toast()), t.toast());

  t.click(t.$('#waSendAllBtn'));
  await t.wait(600);
  ok('تاني ضغطة جماعية مابتبعتش تاني', t.opened.length === 2, 'opened=' + t.opened.length);

  /* --- تحصيل جديد يسمح بإرسال جديد لنفس العميل --- */
  const changed = JSON.parse(t.window.localStorage.getItem('app_customers'));
  changed[0].payments.push({ date: '2026-10-20', amount: 500, no: 2 });
  t.window.localStorage.setItem('app_customers', JSON.stringify(changed));
  t.click(t.$('[data-go="collection"]'));   /* إعادة رسم اللوحة */
  await t.wait(120);
  const send0b = t.$('[data-wa-send="0"]');
  ok('بعد تحصيل جديد الزر رجع متاح', !!send0b && !send0b.disabled);
  t.click(send0b);
  await t.wait(80);
  ok('اتبعتت رسالة جديدة بعد التحصيل الجديد', t.opened.length === 3, 'opened=' + t.opened.length);

  /* --- حفظ القالب + تسجيل العملية --- */
  const tpl = t.$('#waTemplate');
  tpl.value = 'إشعار جديد للعميل {الاسم} — المتبقي {المتبقي}';
  t.click(t.$('#waSaveBtn'));
  await t.wait(80);
  const saved = JSON.parse(t.window.localStorage.getItem('app_wa_settings') || '{}');
  ok('القالب اتحفظ في التخزين', saved.template === tpl.value, JSON.stringify(saved));
  ok('كود الدولة اتحفظ', saved.country === '20', JSON.stringify(saved));
  const ops = t.window.localStorage.getItem('app_ops') || '';
  ok('التغيير اتسجّل في سجل العمليات', ops.indexOf('app_wa_settings') > -1);
  ok('القالب الجديد ظهر في المعاينة',
    t.$('#waPreview').value.indexOf('إشعار جديد للعميل') > -1, t.$('#waPreview').value);

  ok('لا أخطاء في نهاية المرحلة الأولى', t.errs.length === 0, t.errs.join(' | '));
})();

/* ============ المرحلة ب: منع الشاشة الفاضية (تخزين تالف) ============ */
(async function phaseB() {
  console.log('\n[ب] منع اختفاء الأقسام — تخزين تالف');

  /* ب1: محتوى تخزين مش مصفوفة */
  const b1 = boot({ seed: { app_customers: '{"not":"array"}' } });
  await b1.wait(80);
  ok('الرئيسية ظهرت رغم تخزين تالف', b1.$('#view-home').classList.contains('is-active'));
  ok('الصفحة فاضية؟ لا — فيه محتوى في القسم الرئيسي',
    (b1.$('#view-home').innerHTML || '').length > 500);
  ok('رجعنا للعملاء الافتراضيين', b1.$$('#collectTbody tr.collection-row').length === 5,
    'rows=' + b1.$$('#collectTbody tr.collection-row').length);
  ok('مفيش خطأ غير مُتّقع (ب1)', b1.errs.length === 0, b1.errs.join(' | '));

  /* ب2: JSON سليم بس عنصر بيكسر الرسم */
  const b2 = boot({ seed: {
    app_customers: JSON.stringify([{ name: 'عميل مكسور', phone: '01000000000', total: 1000, due: 1000, payments: 'boom' }])
  } });
  await b2.wait(80);
  ok('الرئيسية ظهرت رغم عنصر مكسور', b2.$('#view-home').classList.contains('is-active'));
  ok('الرئيسية اترسمت فعلاً (مش شاشة فاضية)', (b2.$('#view-home').innerHTML || '').length > 500);

  unlock(b2);
  await b2.wait(400);
  b2.click(b2.$('[data-go="collection"]'));   /* إعادة رسم بدون نافذة كلمة المرور */
  await b2.wait(120);

  ok('شاشة التحصيل اتفتحت والجدول اترسم', b2.$$('#collectTbody tr.collection-row').length === 1,
    'rows=' + b2.$$('#collectTbody tr.collection-row').length);
  ok('لوحة واتساب اترسمت جنبه', b2.$('#waTbody') && b2.$('#waTbody').textContent.length > 0,
    b2.$('#waTbody') ? 'ok' : 'غير موجود');
  ok('مفيش فشل رسم ولا استثناء', b2.errs.length === 0, b2.errs.join(' | '));
  ok('مفيش تنبيه فشل (البيانات بقت سليمة بعد الإصلاح)', b2.toast().indexOf('تعذّر عرض') === -1, b2.toast());

  console.log('\n[ج] الحماية موجودة في الكود');
  const src = fs.readFileSync('dist/app.js', 'utf8');
  ok('showView بيغلف كل عملية رسم بـ step', /function step\(run, label\)/.test(src) &&
    src.indexOf('step(function () { renderCollection') > -1);
  ok('الإقلاع بيغلف كل خطوة بـ bootStep', src.indexOf('bootStep(function () {') > -1);
  ok('الاستدعاءات أثناء التحميل محمية بـ safeRun', src.indexOf('safeRun(function () { renderCollection') > -1);
  ok('derive() بيتوقع مصفوفة فعلية', src.indexOf('Array.isArray(c.payments) ? c.payments : []') > -1);
  ok('القراءة من التخزين بتمر على safeList', src.indexOf('return safeList(JSON.parse(raw), DEFAULT_CUSTOMERS)') > -1);

  ok('الواجهة فيها لوحة واتساب في شاشة التحصيل', htmlSrc.indexOf('id="waPanel"') > -1);

  console.log('\n==================================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})();
