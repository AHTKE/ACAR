/* يفتح الموقع المنشور ويكرر لحد ما يوصل فعلاً (الاستضافة بترجع 502 أحياناً) */
const { chromium } = require('playwright');
const URL = process.env.TARGET || 'https://site-88abe32661714048a24e9bd63ac05f70.freebuff.page/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const codes = [];
  page.on('response', (r) => { if (r.status() >= 400) codes.push(r.status() + ' ' + r.url().replace(URL, '')); });

  let ok = false;
  for (let i = 1; i <= 8 && !ok; i++) {
    try {
      const resp = await page.goto(URL + '?try=' + i, { waitUntil: 'load', timeout: 30000 });
      const status = resp ? resp.status() : 0;
      process.stdout.write('try' + i + '=' + status + ' ');
      if (status === 200) {
        const has = await page.evaluate(() => !!document.getElementById('content'));
        if (has) ok = true;
      }
      if (!ok) await page.waitForTimeout(3000);
    } catch (e) {
      process.stdout.write('try' + i + '=ERR ');
    }
  }
  console.log('\nloaded=' + ok);
  if (!ok) { await browser.close(); process.exit(2); }

  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const act = document.querySelector('.view.is-active');
    const gate = document.getElementById('forceAuthGate');
    const ge = document.getElementById('gateError');
    const box = document.getElementById('content').getBoundingClientRect();
    const name = (e) => (e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '') : 'null');
    return {
      booted: !!window.__appBooted,
      bootErr: window.__bootErr,
      active: act ? act.id : 'NONE',
      activeH: act ? act.offsetHeight : 0,
      activeLen: act ? act.innerHTML.length : 0,
      gate: gate ? getComputedStyle(gate).display : 'missing',
      gateError: ge && getComputedStyle(ge).display !== 'none' ? (ge.textContent || '').slice(0, 120) : null,
      atCenter: name(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
      swCacheVersion: (document.querySelector('script') && location.href) ? 'n/a' : 'n/a',
      textStart: (document.getElementById('content').innerText || '').slice(0, 160)
    };
  });
  console.log(JSON.stringify(r, null, 2));
  console.log('bad responses:', codes.slice(0, 8));
  await page.screenshot({ path: process.env.SHOT || 'artifacts/live.png' });
  await browser.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
