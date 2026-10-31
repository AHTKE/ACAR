/* اختبار التنقل الحقيقي: ندخل كل خاصية ونراقب هل الشاشة تفضل مفتوحة ولا ترجع للرئيسية */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:4173/';
const NAVS = ['customers', 'add-customer', 'suppliers', 'ledger', 'details', 'settings',
  'collection', 'partners', 'associations', 'operations'];

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const bad = [];
  for (const nav of NAVS) {
    await p.goto(BASE, { waitUntil: 'load', timeout: 45000 });
    await p.waitForTimeout(1800);
    await p.evaluate((n) => {
      const el = document.querySelector('[data-go="' + n + '"]');
      if (el) el.click();
    }, nav);
    await p.waitForTimeout(150);
    // كلمة المرور للأقسام المحمية
    await p.evaluate(() => {
      const m = document.getElementById('pwdModal');
      if (m && m.classList.contains('is-open')) {
        ['2', '4', '6', '8'].forEach((k) => {
          const btn = document.querySelector('#keypad button[data-key="' + k + '"]');
          if (btn) btn.click();
        });
      }
    });
    const samples = [];
    for (const ms of [250, 1000, 2500, 4500]) {
      await p.waitForTimeout(ms - (samples.length ? [250, 1000, 2500, 4500][samples.length - 1] : 0));
      samples.push(await p.evaluate(() => ({
        active: (document.querySelector('.view.is-active') || {}).id || 'NONE',
        boot: (document.getElementById('bootHelp') || {}).style ? document.getElementById('bootHelp').style.display : '',
        h: (document.querySelector('.view.is-active') || { offsetHeight: 0 }).offsetHeight,
        toast: (document.querySelector('#toast span') || {}).textContent || ''
      })));
    }
    const last = samples[samples.length - 1];
    const want = 'view-' + nav;
    const okNav = samples.every(s => s.active === want);
    const bounce = samples.some(s => s.active === 'view-home' && nav !== 'home');
    if (!okNav) bad.push({ nav, samples });
    console.log((okNav ? 'ok    ' : 'BAD   ') + nav.padEnd(14) +
      samples.map(s => s.active.replace('view-', '')).join(' > ') +
      '  h=' + last.h + (bounce ? '  ← رجع للرئيسية' : '') +
      (last.boot === 'flex' ? '  [bootHelp ظاهر]' : '') +
      (last.toast ? '  toast=' + last.toast.slice(0, 40) : ''));
  }
  if (errs.length) console.log('errors:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  '));
  console.log(bad.length ? 'RESULT: ' + bad.length + ' قسم بيرجع للرئيسية' : 'RESULT: كل الأقسام بتفضل مفتوحة');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(3); });
