/* فحص بصري حقيقي للصفحة: يفتح Chromium ويقيس ما يراه المستخدم فعلًا */
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const report = await page.evaluate(() => {
    const views = Array.from(document.querySelectorAll('.view')).map((v) => {
      const cs = getComputedStyle(v);
      return {
        id: v.id,
        active: v.classList.contains('is-active'),
        display: cs.display,
        opacity: cs.opacity,
        h: v.offsetHeight,
        len: v.innerHTML.length
      };
    });
    const content = document.getElementById('content');
    const cr = content ? content.getBoundingClientRect() : null;
    const gate = document.getElementById('forceAuthGate');
    const gcs = gate ? getComputedStyle(gate) : null;
    const box = content ? content.getBoundingClientRect() : null;
    let hit = null;
    if (box && box.height > 0) {
      const el = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      hit = el ? (el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '')) : 'null';
    }
    const app = document.querySelector('.app');
    const bootHelp = document.getElementById('bootHelp');
    return {
      booted: !!window.__appBooted,
      bootErr: window.__bootErr || null,
      activeView: (document.querySelector('.view.is-active') || {}).id || 'NONE',
      views,
      contentBox: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
      contentScrollH: content ? content.scrollHeight : null,
      centerElementAtContent: hit,
      gate: gate ? { display: gcs.display, z: gcs.zIndex, inline: gate.getAttribute('style') } : 'missing',
      bootHelp: bootHelp ? { display: getComputedStyle(bootHelp).display } : 'missing',
      appRows: app ? getComputedStyle(app).gridTemplateRows : null,
      bodyOverflow: getComputedStyle(document.body).overflow
    };
  });

  console.log(JSON.stringify(report, null, 2));
  console.log('--- console errors (' + errors.length + ') ---');
  errors.slice(0, 15).forEach((e) => console.log('  ' + e));

  await page.screenshot({ path: process.env.SHOT || 'artifacts/shot.png', fullPage: false });
  await browser.close();
})().catch((e) => {
  console.log('FATAL', e.message);
  process.exit(1);
});
