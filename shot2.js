/* يحاكي حالة المستخدم: Google متصل (البوابة مخفية) ويشوف هل المحتوى ظاهر */
const { chromium } = require('playwright');
const URL = process.env.TARGET || 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  if (process.env.FAKE_CONNECTED) {
    await page.route('**/api/google/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true }) }));
  }
  if (process.env.STORAGE) {
    await page.addInitScript((raw) => {
      try {
        const data = JSON.parse(raw);
        Object.keys(data).forEach((k) => localStorage.setItem(k, data[k]));
      } catch (e) {}
    }, process.env.STORAGE);
  }

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const r = await page.evaluate(() => {
    const act = document.querySelector('.view.is-active');
    const gate = document.getElementById('forceAuthGate');
    const box = document.getElementById('content').getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + 40);
    const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const name = (e) => (e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '') : 'null');
    return {
      booted: !!window.__appBooted,
      bootErr: window.__bootErr,
      active: act ? act.id : 'NONE',
      activeH: act ? act.offsetHeight : 0,
      activeLen: act ? act.innerHTML.length : 0,
      gateDisplay: gate ? getComputedStyle(gate).display : 'missing',
      gateZ: gate ? getComputedStyle(gate).zIndex : null,
      elAtContentTop: name(top),
      elAtContentCenter: name(center),
      contentH: Math.round(box.height),
      contentText: (document.getElementById('content').innerText || '').slice(0, 200)
    };
  });
  console.log(JSON.stringify(r, null, 2));
  console.log('--- errors (' + errors.length + ') ---');
  errors.slice(0, 10).forEach((e) => console.log('  ' + e));
  await page.screenshot({ path: process.env.SHOT || 'artifacts/connected.png' });
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
