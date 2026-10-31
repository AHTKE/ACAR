/* يثبت "حارس الشاشة": لو اتشالت كل الشاشات المفعّلة، الرئيسية ترجع لوحدها */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.TARGET || 'http://localhost:3000/', { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(1800);
  const before = await p.evaluate(() => (document.querySelector('.view.is-active') || {}).id || 'NONE');
  // نمحي كل الشاشات المفعّلة (زي ما بيحصل لو showView اتنده بـ id غلط)
  await p.evaluate(() => document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active')));
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => {
    const a = document.querySelector('.view.is-active');
    return { id: a ? a.id : 'NONE', h: a ? a.offsetHeight : 0, len: a ? a.innerHTML.length : 0 };
  });
  console.log(JSON.stringify({ before, after }, null, 2));
  const pass = after.id === 'view-home' && after.h > 200 && after.len > 1000;
  console.log(pass ? 'RESULT: PASS — الشاشة الفاضية بقت مستحيلة' : 'RESULT: FAIL');
  await b.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
