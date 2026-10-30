'use strict';
const fs = require('fs');
const F = 'app.js';
let s = fs.readFileSync(F, 'utf8');
let n = 0;
function rep(a, b, label) {
  const i = s.indexOf(a);
  if (i < 0) throw new Error('✗ مرساة غير موجودة: ' + label);
  if (s.indexOf(a, i + 1) >= 0) throw new Error('✗ مرساة مكررة: ' + label);
  s = s.slice(0, i) + b + s.slice(i + a.length);
  n++;
}

/* أول كتابة للقسم = ليس «إصلاحاً» بل «أول تسجيل» — والفرق بين القيمة المفقودة والقيمة التالفة */
rep(`    var a = tryParse(oldRaw), b = tryParse(newRaw);
    if (Array.isArray(a) && Array.isArray(b)) {`,
`    var a = tryParse(oldRaw), b = tryParse(newRaw);
    if (oldRaw === null && Array.isArray(b)) return label + ' — أول تسجيل (' + b.length + ' سجل)';
    if (newRaw === null && Array.isArray(a)) return label + ' — مسح القسم';
    if (Array.isArray(a) && Array.isArray(b)) {`, 'summary-null');

fs.writeFileSync(F, s);
console.log('✓ ' + F + ' — ' + n + ' تعديل');
