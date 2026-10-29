/* فحص شامل: مسارات الـ API المستخدمة في الواجهة مقابل مسارات السيرفر + مراجع DOM */
import fs from 'fs';

const files = ['app.js', 'auth-gate-addon.js', 'export.js', 'index.html', 'worker.js'];
const src = {};
for (const f of files) src[f] = fs.readFileSync(f, 'utf8');

const used = new Set();
for (const f of ['app.js', 'auth-gate-addon.js', 'export.js', 'index.html']) {
  for (const m of src[f].matchAll(/['"`](\/api\/[a-zA-Z0-9/_-]+)['"`]/g)) used.add(m[1]);
}
const have = new Set();
for (const m of src['worker.js'].matchAll(/['"`](\/api\/[a-zA-Z0-9/_-]+)['"`]/g)) have.add(m[1]);
/* مسارات ديناميكية (بمعاملات) */
for (const m of src['worker.js'].matchAll(/startsWith\(['"`](\/api\/[a-zA-Z0-9/_-]+)/g)) have.add(m[1] + '/*');

console.log('== مسارات يستخدمها الفرونت ==');
[...used].sort().forEach((u) => {
  const ok = have.has(u) || have.has(u + '/*') ||
    [...have].some((h) => h.endsWith('/*') && u.startsWith(h.slice(0, -1)));
  console.log((ok ? '  OK    ' : '  MISS  ') + u);
});

console.log('\n== مراجع DOM ناقصة في app.js ==');
const html = src['index.html'];
const refs = new Set();
for (const m of src['app.js'].matchAll(/\$\('#([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)/g)) {
  refs.add(m[1] || m[2]);
}
const missing = [...refs].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
console.log('  الكلي:', refs.size, '| ناقصة (مُولّدة ديناميكياً أو ميتة):', missing.length);
console.log('  ', missing.join(', ') || 'لا شيء');

console.log('\n== ألوان/تباين: فحص سطوع النصوص في styles.css ==');
const css = fs.readFileSync('styles.css', 'utf8');
const pairs = [...css.matchAll(/color:\s*(#[0-9a-fA-F]{3,8}|var\([^)]+\))[^;]*;/g)].map((m) => m[1]);
console.log('  عدد قيم color:', pairs.length);

console.log('\n== اتساق dist مع المصدر ==');
for (const f of ['index.html', 'app.js', 'export.js', 'auth-gate-addon.js', 'styles.css']) {
  const same = fs.existsSync('dist/' + f) && fs.readFileSync(f, 'utf8') === fs.readFileSync('dist/' + f, 'utf8');
  console.log((same ? '  SAME  ' : '  DIFF  ') + f);
}
