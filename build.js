/* ============================================================
   build.js — خطوة البناء: ينسخ كل ملفات التشغيل إلى dist/
   التشغيل: node build.js   (أو npm run build)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');

const FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'monthly.js',
  'employees.js',
  'customer-extra.js',
  'warehouse-catalog.js',
  'app-lock.js',
  'splash.js',
  'period.js',
  'export.js',
  'auth-gate-addon.js',
  'manifest.webmanifest',
  'sw.js'
];

const DIRS = ['icons'];

/* ننسخ الـAPI كمان جوه dist — علشان لو Vercel مضبوط على
   Root Directory = dist تبقى مسارات /api/google شغالة بدل 404.
   ولو الجذر هو المستودع نفسه، الدالة الأصلية api/[...path].js
   هي اللي بتشتغل والنسخة دي بتفضل ملفات ثابتة غير مؤثرة. */
const API_FILES = [
  ['api/[...path].js', 'api/[...path].js'],
  ['vercel-run.js', 'vercel-run.js'],
  ['worker.js', 'worker.js'],
  ['vercel-db.js', 'vercel-db.js']
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const written = [];

for (const f of FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error('✗ ملف مفقود: ' + f);
    process.exitCode = 1;
    continue;
  }
  fs.copyFileSync(src, path.join(out, f));
  written.push(f);
}

for (const d of DIRS) {
  const src = path.join(root, d);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(out, d), { recursive: true });
  for (const f of fs.readdirSync(src)) written.push(d + '/' + f);
}

for (const [srcRel, dstRel] of API_FILES) {
  const src = path.join(root, srcRel);
  if (!fs.existsSync(src)) {
    console.error('✗ ملف API مفقود: ' + srcRel);
    process.exitCode = 1;
    continue;
  }
  const dst = path.join(out, dstRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  written.push(dstRel);
}

/* Vercel بيقرا package.json جوه الجذر لو Root Directory = dist؛
   type=module يخلّي imports الـworker تشتغل صح. */
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n');
written.push('package.json');
/* إعداد Vercel لو الجذر مضبوط على dist: لا build إضافي، والـAPI
   والملفات الثابتة يتخدموا من نفس المجلد. */
fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
  framework: null,
  buildCommand: '',
  outputDirectory: '.'
}, null, 2) + '\n');
written.push('vercel.json');

/* فحص سريع: كل ملفات الويب المطلوبة موجودة في dist */
const REQUIRED = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'api/[...path].js', 'vercel-run.js', 'worker.js', 'vercel-db.js'];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(out, f)));
if (missing.length) {
  console.error('✗ ناقص في dist: ' + missing.join(', '));
  process.exit(1);
}

const bytes = written.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log('✓ تم البناء في dist/ — ' + written.length + ' ملف، ' + (bytes / 1024).toFixed(1) + ' KB');
written.forEach((f) => console.log('   • ' + f));
