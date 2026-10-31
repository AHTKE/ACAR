/* يثبت إصلاح الـ Service Worker: أول تحميل عادي (يثبّت الكاش)، بعدها كل الشبكة
   ترجع 502 — الصفحة المفروض تفضل شغالة من الكاش بدل ما تنكسر. */
const { chromium } = require('playwright');
const URL = process.env.TARGET || 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) تحميل أول عادي: الـ SW يشتغل ويخزّن الشل
  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 20000 })
    .catch(() => console.log('  (مفيش controller في أول تحميل — بنعيد التحميل)'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const before = await page.evaluate(() => ({
    controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    active: (document.querySelector('.view.is-active') || {}).id || 'NONE',
    len: document.getElementById('view-home') ? document.getElementById('view-home').innerHTML.length : -1
  }));
  console.log('قبل العطل:', JSON.stringify(before));

  // 2) الآن كل الشبكة ترجع 502 (محاكاة عطل الاستضافة)
  const seen = [];
  page.on('response', (r) => seen.push(r.status() + ' ' + r.url().replace(URL, '').slice(0, 40)));
  await ctx.route('**/*', (route) =>
    route.fulfill({ status: 502, contentType: 'text/plain', body: 'Site unavailable' }));

  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch((e) => console.log('reload: ' + e.message));
  await page.waitForTimeout(3000);

  const after = await page.evaluate(() => ({
    active: (document.querySelector('.view.is-active') || {}).id || 'NONE',
    len: document.getElementById('view-home') ? document.getElementById('view-home').innerHTML.length : -1,
    hasContent: !!document.getElementById('content'),
    text: document.getElementById('content') ? (document.getElementById('content').innerText || '').slice(0, 80) : null
  }));
  console.log('أثناء العطل (كل شيء 502):', JSON.stringify(after, null, 2));
  console.log('استجابات المتصفح أثناء العطل:', seen.slice(0, 8));

  await page.screenshot({ path: process.env.SHOT || 'artifacts/sw-502.png' });
  await browser.close();

  const passed = after.hasContent && after.len > 500;
  console.log(passed ? 'RESULT: PASS — التطبيق فضل شغال من الكاش' : 'RESULT: FAIL — الشاشة اتكسرت وقت العطل');
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
