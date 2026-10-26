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
  'export.js',
  'manifest.webmanifest',
  'sw.js'
];

const DIRS = ['icons'];

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

/* فحص سريع: كل ملفات الويب المطلوبة موجودة في dist */
const REQUIRED = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png'];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(out, f)));
if (missing.length) {
  console.error('✗ ناقص في dist: ' + missing.join(', '));
  process.exit(1);
}

const bytes = written.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log('✓ تم البناء في dist/ — ' + written.length + ' ملف، ' + (bytes / 1024).toFixed(1) + ' KB');
written.forEach((f) => console.log('   • ' + f));
