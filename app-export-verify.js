/* يشغّل التطبيق نفسه في jsdom مع canvas حقيقي ويصدر Excel/PDF فعليين للتحقق */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createCanvas } = require('canvas');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.message)));

let html = fs.readFileSync('dist/index.html', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/export.js', 'utf8') + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/app.js', 'utf8') + '</script>');

const canvases = [];
let captured = null;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    const origCreate = window.document.createElement.bind(window.document);
    window.document.createElement = function (tag, opts) {
      const t = String(tag || '').toLowerCase();
      if (t === 'canvas') {
        const cv = createCanvas(1, 1);
        canvases.push(cv);
        return cv;
      }
      return origCreate(tag, opts);
    };
    window.HTMLAnchorElement.prototype.click = function () {};
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.HTMLElement.prototype.scrollIntoView = function () {};
    const RealBlob = window.Blob;
    window.Blob = function (parts, o) {
      captured = Buffer.concat((parts || []).map((p) => Buffer.from(p)));
      captured.type = (o && o.type) || '';
      return new RealBlob(parts, o);
    };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  await wait(400);
  canvases.length = 0;

  console.log('\n[1] Excel — قسم العملاء من الإعدادات');
  click($('[data-go="settings"]'));
  await wait(120);
  click($('[data-export="customers"][data-kind="xlsx"]'));
  await wait(60);
  if ($('#exportToDevice')) click($('#exportToDevice'));
  await wait(120);
  fs.writeFileSync('/tmp/app-customers.xlsx', captured);
  console.log('  bytes:', captured.length);

  console.log('\n[2] Excel — الملف الكامل');
  click($('#exportAllXlsx'));
  await wait(60);
  if ($('#exportToDevice')) click($('#exportToDevice'));
  await wait(150);
  fs.writeFileSync('/tmp/app-full.xlsx', captured);
  console.log('  bytes:', captured.length);

  console.log('\n[3] PDF — قسم العملاء (canvas حقيقي)');
  canvases.length = 0;
  captured = null;
  click($('[data-export="customers"][data-kind="pdf"]'));
  await wait(120);
  if ($('#exportToDevice') && $('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
  await wait(200);
  if (captured) {
    fs.writeFileSync('/tmp/app-customers.pdf', captured);
    console.log('  bytes:', captured.length);
  } else {
    console.log('  ✗ لم يتم توليد PDF:', $('#toast span') ? $('#toast span').textContent : '');
  }
  const big = canvases.filter((c) => c.width > 100 && c.height > 100);
  console.log('  canvases:', canvases.length, '— صفحات كبيرة:', big.length);
  big.forEach((cv, i) => {
    fs.mkdirSync('artifacts', { recursive: true });
    const p = 'artifacts/app-pdf-' + (i + 1) + '.png';
    fs.writeFileSync(p, cv.toBuffer('image/png'));
    console.log('  →', p, cv.width + 'x' + cv.height);
  });

  console.log('\n[4] PDF — كشف حساب مورد');
  click($('[data-go="suppliers"]'));
  await wait(120);
  click($('#suppliersTable tbody tr[data-sup-idx]'));
  await wait(150);
  canvases.length = 0;
  captured = null;
  click($('#supPdfBtn'));
  await wait(120);
  if ($('#exportToDevice') && $('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
  await wait(200);
  if (captured) {
    fs.writeFileSync('/tmp/app-supplier.pdf', captured);
    console.log('  bytes:', captured.length);
  }
  const supPages = canvases.filter((c) => c.width > 100 && c.height > 100);
  supPages.forEach((cv, i) => {
    fs.writeFileSync('artifacts/app-sup-' + (i + 1) + '.png', cv.toBuffer('image/png'));
  });
  console.log('  صفحات:', supPages.length);

  console.log('\n[5] Excel — كشف حساب مورد');
  captured = null;
  click($('#supExcelBtn'));
  await wait(80);
  if ($('#exportToDevice') && $('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
  await wait(150);
  if (captured) {
    fs.writeFileSync('/tmp/app-supplier.xlsx', captured);
    console.log('  bytes:', captured.length);
  }

  console.log('\n[6] PDF — الدواخل والخوارج (تقرير بأعمدة متعددة)');
  click($('[data-go="settings"]'));
  await wait(120);
  canvases.length = 0;
  captured = null;
  click($('[data-export="ledger"][data-kind="pdf"]'));
  await wait(120);
  if ($('#exportToDevice') && $('#exportModal').classList.contains('is-open')) click($('#exportToDevice'));
  await wait(200);
  if (captured) {
    fs.writeFileSync('/tmp/app-ledger.pdf', captured);
    console.log('  bytes:', captured.length);
  }
  canvases.filter((c) => c.width > 100 && c.height > 100).forEach((cv, i) => {
    fs.writeFileSync('artifacts/app-ledger-' + (i + 1) + '.png', cv.toBuffer('image/png'));
  });

  console.log('\nأخطاء JS:', errors.length, errors.slice(0, 3).join(' | '));
  window.close();
  process.exit(0);
})();
