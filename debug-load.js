const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errs.push(e.stack || String(e)));
let html = fs.readFileSync('dist/index.html', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/export.js', 'utf8') + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/app.js', 'utf8') + '</script>')
  .replace(/<script[^>]*src="auth-gate-addon\.js"[^>]*>\s*<\/script>/, () => '<script>' + fs.readFileSync('dist/auth-gate-addon.js', 'utf8') + '</script>');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ configured: true, connected: true, email: 'gstsyusudg@gmail.com' }) });
    w.addEventListener('error', (ev) => {
      console.log('WINDOW ERROR:', ev.message, '@', ev.filename, ':', ev.lineno, ':', ev.colno);
    });
    const origParse = w.JSON.parse.bind(w.JSON);
    w.JSON.parse = function (v) {
      if (v === undefined || v === null) {
        console.log('JSON.parse(' + String(v) + ') stack:\n' + new Error('trace').stack.split('\n').slice(1, 8).join('\n'));
      }
      return origParse(v);
    };
    w.HTMLAnchorElement.prototype.click = function () {};
    w.URL.createObjectURL = () => 'blob:t';
    w.URL.revokeObjectURL = () => {};
  }
});
setTimeout(() => {
  console.log('errors:', errs.length);
  errs.slice(0, 2).forEach((e) => console.log(e.split('\n').slice(0, 12).join('\n')));
  console.log('ledger rows:', dom.window.document.querySelectorAll('#ledgerTbody tr').length);
  process.exit(0);
}, 1500);
