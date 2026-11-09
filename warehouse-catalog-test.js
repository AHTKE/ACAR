/* اختبار واجهة المخازن الهرمية: مخزن ← تصنيف ← صنف ← تفاصيل وحركات */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + (e && e.stack ? e.stack : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = fs.readFileSync('dist/index.html', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const exportJs = fs.readFileSync('dist/export.js', 'utf8');
const catalog = fs.readFileSync('dist/warehouse-catalog.js', 'utf8');
html = html
  .replace(/<script[^>]*src="export\.js"[^>]*>\s*<\/script>/, () => '<script>' + exportJs + '</script>')
  .replace(/<script[^>]*src="warehouse-catalog\.js"[^>]*>\s*<\/script>/, () => '<script>' + catalog + '</script>')
  .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>/, () => '<script>' + app + '</script>');

const seedStores = {
  stores: ['مخزن الحديد', 'مخزن الأسمنت'],
  docs: [
    { id: 'm1', date: '2026-11-01', type: 'in', item: 'حديد 12 مم', qty: 10, price: 4800, total: 48000, store: 'مخزن الحديد', partyType: 'supplier', partyName: 'شركة النور', note: 'توريد أول' },
    { id: 'm2', date: '2026-11-02', type: 'out', item: 'حديد 12 مم', qty: 3, price: 6300, total: 18900, store: 'مخزن الحديد', partyType: 'customer', partyName: 'أحمد محمد', note: 'شغل الحي' },
    { id: 'm3', date: '2026-11-03', type: 'in', item: 'حديد 16 مم', qty: 5, price: 5100, total: 25500, store: 'مخزن الحديد', partyType: 'supplier', partyName: 'شركة النور', note: '' },
    { id: 'm4', date: '2026-11-04', type: 'out', item: 'حديد 16 مم', qty: 1, price: 7000, total: 7000, store: 'مخزن الحديد', partyType: 'customer', partyName: 'أحمد محمد', note: '' }
  ]
};
const seedCatalog = {
  'مخزن الحديد': {
    categories: [{
      id: 'c1', name: 'حديد تسليح',
      items: [
        { id: 'i1', name: 'حديد 12 مم', unit: 'طن', buyPrice: 5000, sellPrice: 6500, minQty: 2, notes: 'مقاس استاندر', specs: [{ key: 'القطر', value: '12 مم' }] },
        { id: 'i2', name: 'حديد 16 مم', unit: 'طن', buyPrice: 0, sellPrice: 7000, minQty: 1, notes: '', specs: [] }
      ]
    }]
  },
  'مخزن الأسمنت': { categories: [] }
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.localStorage.setItem('app_stores', JSON.stringify(seedStores));
    window.localStorage.setItem('app_store_catalog', JSON.stringify(seedCatalog));
  }
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

window.HTMLAnchorElement.prototype.click = function () {};
try {
  if (!doc.createElement('canvas').getContext('2d')) window.HTMLCanvasElement.prototype.getContext = function () { return null; };
} catch (e) {
  window.HTMLCanvasElement.prototype.getContext = function () { return null; };
}
window.URL.createObjectURL = function () { return 'blob:test'; };
window.URL.revokeObjectURL = function () {};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const submit = (el) => el.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const catalogData = () => JSON.parse(window.localStorage.getItem('app_store_catalog') || '{}');
const text = (sel) => { const el = $(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };

(async function () {
  await wait(120);
  click($('[data-go="stores"]'));
  await wait(100);

  console.log('\n[1] نظرة عامة على المخازن');
  ok('لا أخطاء وقت التحميل', errors.length === 0, errors.join(' | '));
  ok('لوحة الكتالوج اتركّبت', !!$('#storeCatalogPanel'));
  ok('بطاقات المخازن ظهرت', $$('.wh-store-card').length === 2, 'count=' + $$('.wh-store-card').length);
  ok('ملخص المخازن فيه قيمة المخزون', text('#storeCatalogPanel').indexOf('قيمة المخزون') > -1);
  ok('مخزن الأسمنت ظاهر', text('#storeCatalogPanel').indexOf('مخزن الأسمنت') > -1);

  console.log('\n[2] الدخول على مخزن ثم تصنيف');
  click($('[data-wh-store="مخزن الحديد"]'));
  ok('فتح صفحة المخزن', text('#storeCatalogPanel').indexOf('تصنيفات المخزن') > -1);
  ok('التصنيف ظاهر في المخزن', $$('.wh-cat-card').length === 1);
  ok('اسم التصنيف ظاهر', text('#storeCatalogPanel').indexOf('حديد تسليح') > -1);
  click($('[data-wh-cat="c1"]'));
  ok('فتح صفحة التصنيف', text('#storeCatalogPanel').indexOf('أصناف التصنيف') > -1);
  const tableText = text('.wh-items-table');
  ok('الصنف الأول ظاهر', tableText.indexOf('حديد 12 مم') > -1);
  ok('الرصيد محسوب 7', tableText.indexOf('7') > -1, tableText.slice(0, 220));
  ok('سعر الشراء 5,000 ظاهر', tableText.indexOf('5,000') > -1);
  ok('سعر البيع 6,500 ظاهر', tableText.indexOf('6,500') > -1);
  ok('هامش الربح 1,500 ظاهر', tableText.indexOf('1,500') > -1);
  const row2 = $('[data-wh-item="i2"]').closest('tr').textContent.replace(/\s+/g, ' ');
  ok('سعر الشراء الاحتياطي من آخر حركة 5,100', row2.indexOf('5,100') > -1, row2);
  ok('تنبيه أن السعر من آخر حركة', row2.indexOf('آخر حركة') > -1, row2);

  console.log('\n[3] تفاصيل الصنف وحركاته');
  click($('[data-wh-item="i1"]'));
  const detail = text('#catalogView');
  ok('صفحة تفاصيل الصنف فتحت', detail.indexOf('حديد 12 مم') > -1 && detail.indexOf('حركة الصنف') > -1);
  ok('المواصفة ظاهرة', detail.indexOf('القطر: 12 مم') > -1);
  ok('الملاحظة ظاهرة', detail.indexOf('مقاس استاندر') > -1);
  ok('حركتا الصنف ظاهرتان', $$('.wh-moves-table tbody tr').length === 2, 'rows=' + $$('.wh-moves-table tbody tr').length);
  ok('الطرف في الحركة ظاهر', detail.indexOf('أحمد محمد') > -1);
  ok('الرصيد بعد آخر حركة 7', detail.indexOf('7') > -1);

  console.log('\n[4] حركة مخزن جديدة تحدّث الرصيد فوراً');
  click($('[data-wh-cat-nav]'));
  const mf = $('#storeForm').elements;
  mf.date.value = '2026-11-05';
  mf.type.value = 'in';
  $('#storeItem').value = 'حديد 12 مم';
  mf.qty.value = '2';
  mf.price.value = '5000';
  mf.store.value = 'مخزن الحديد';
  mf.partyType.value = 'supplier';
  mf.partyName.value = 'شركة النور';
  submit($('#storeForm'));
  await wait(80);
  const qtyCell = $('[data-wh-item="i1"]').closest('tr').querySelector('td:nth-child(2)').textContent.replace(/\s+/g, ' ').trim();
  ok('الرصيد اتحدّث لـ 9 بعد الحركة', /^9/.test(qtyCell), qtyCell);

  console.log('\n[5] إضافة صنف بأسعار ومواصفات');
  click($('[data-wh-cat-nav]'));
  click($('[data-wh-new-item]'));
  ok('نموذج إضافة الصنف ظهر', !!$('#catalogItemForm'));
  const f = $('#catalogItemForm').elements;
  f.name.value = 'حديد 20 مم';
  f.unit.value = 'طن';
  f.buyPrice.value = '5200';
  f.sellPrice.value = '6800';
  f.minQty.value = '1';
  f.notes.value = 'صنف جديد';
  const specKey = $('#catalogSpecRows [data-spec-key]');
  const specVal = $('#catalogSpecRows [data-spec-val]');
  if (specKey) specKey.value = 'القطر';
  if (specVal) specVal.value = '20 مم';
  submit($('#catalogItemForm'));
  await wait(30);
  const saved = catalogData()['مخزن الحديد'].categories[0].items.filter((x) => x.name === 'حديد 20 مم')[0];
  ok('الصنف اتحفظ في الكتالوج', !!saved, JSON.stringify(saved));
  ok('سعر الشراء اتحفظ', saved && saved.buyPrice === 5200, saved && String(saved.buyPrice));
  ok('سعر البيع اتحفظ', saved && saved.sellPrice === 6800, saved && String(saved.sellPrice));
  ok('المواصفة اتحفظت', saved && saved.specs.some((s) => s.key === 'القطر' && s.value === '20 مم'), JSON.stringify(saved && saved.specs));
  ok('الصنف ظهر في جدول التصنيف', text('.wh-items-table').indexOf('حديد 20 مم') > -1);
  ok('itemOptions فيه الصنف الجديد', window.WarehouseCatalog.itemOptions('مخزن الحديد').indexOf('حديد 20 مم') > -1);

  console.log('\n[6] تعديل سعر البيع');
  const newId = saved.id;
  click($('[data-wh-edit="' + newId + '"]'));
  const ef = $('#catalogItemForm').elements;
  ok('نموذج التعديل مفتوح بقيم الصنف', ef.name.value === 'حديد 20 مم' && ef.sellPrice.value === '6800', ef.sellPrice.value);
  ef.sellPrice.value = '7100';
  submit($('#catalogItemForm'));
  await wait(30);
  const edited = catalogData()['مخزن الحديد'].categories[0].items.filter((x) => x.id === newId)[0];
  ok('سعر البيع الجديد اتحفظ', edited && edited.sellPrice === 7100, edited && String(edited.sellPrice));
  ok('بعد التعديل رجع لتفاصيل الصنف', text('#catalogView').indexOf('حديد 20 مم') > -1 && text('#catalogView').indexOf('حركة الصنف') > -1);

  console.log('\n[7] إضافة تصنيف ومخزن');
  click($('[data-wh-root]'));
  click($('[data-wh-store="مخزن الأسمنت"]'));
  const cf = $('#catalogCategoryForm').elements;
  cf.categoryName.value = 'أسمنت';
  submit($('#catalogCategoryForm'));
  await wait(30);
  ok('التصنيف الجديد اتحفظ وفتح', text('#catalogView').indexOf('أسمنت') > -1 && text('#catalogView').indexOf('إضافة صنف') > -1);
  click($('[data-wh-root]'));
  const sf = $('#catalogStoreForm').elements;
  sf.storeName.value = 'مخزن السيراميك';
  submit($('#catalogStoreForm'));
  await wait(30);
  ok('المخزن الجديد اتضاف في app_stores', JSON.parse(window.localStorage.getItem('app_stores')).stores.indexOf('مخزن السيراميك') > -1);
  ok('المخزن الجديد ظهر في الكتالوج', catalogData()['مخزن السيراميك'] != null);
  ok('فتح صفحة المخزن الجديد', text('#catalogView').indexOf('مخزن السيراميك') > -1);

  console.log('\n[8] لا أخطاء تشغيل');
  ok('لا أخطاء تشغيل في كل النقط', errors.length === 0, errors.join(' | '));

  console.log('\n========================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('انهار الاختبار:', e); process.exit(1); });
