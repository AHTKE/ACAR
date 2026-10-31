/* يتحقق: لو حالة الربط فشلت تظهر رسالة واضحة وزر إعادة محاولة (بدل شاشة ساكتة) */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(process.env.TARGET || 'http://localhost:3000/', { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const e = document.getElementById('gateError');
    return {
      gateDisplay: document.getElementById('forceAuthGate') ? getComputedStyle(document.getElementById('forceAuthGate')).display : 'missing',
      errorVisible: e ? getComputedStyle(e).display : 'missing',
      errorText: e ? (e.textContent || '').slice(0, 160) : null,
      retryExists: !!document.getElementById('gateRetry'),
      activeView: (document.querySelector('.view.is-active') || {}).id || 'NONE',
      homeLen: document.getElementById('view-home') ? document.getElementById('view-home').innerHTML.length : -1
    };
  });
  console.log(JSON.stringify(r, null, 2));
  if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
  await p.screenshot({ path: process.env.SHOT || 'artifacts/gate.png' });
  await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
