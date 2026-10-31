/* يفحص ماذا يقدمه الموقع فعليًا للمتصفح */
const { chromium } = require('playwright');
const URL = process.env.TARGET || 'https://site-88abe32661714048a24e9bd63ac05f70.freebuff.page/';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => failed.push('PAGEERROR ' + e.message));
  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyLen: document.body ? document.body.innerHTML.length : -1,
    bodyTextStart: document.body ? (document.body.innerText || '').slice(0, 300) : null,
    hasContent: !!document.getElementById('content'),
    hasViewHome: !!document.getElementById('view-home'),
    viewCount: document.querySelectorAll('.view').length,
    active: (document.querySelector('.view.is-active') || {}).id || 'NONE',
    scriptCount: document.scripts.length,
    hasAppJs: Array.from(document.scripts).some((s) => (s.src || '').includes('app.js')),
    stylesheets: Array.from(document.styleSheets).length,
    gate: !!document.getElementById('forceAuthGate')
  }));
  console.log('HTTP', resp ? resp.status() : '?', resp ? resp.headers()['content-type'] : '');
  console.log(JSON.stringify(info, null, 2));
  console.log('--- failed/4xx (' + failed.length + ') ---');
  failed.slice(0, 20).forEach((f) => console.log('  ' + f));
  await page.screenshot({ path: process.env.SHOT || 'artifacts/probe.png' });
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
