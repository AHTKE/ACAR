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

rep(`  var opsUndoLastBtn = $('#opsUndoLast');
  if (opsUndoLastBtn) opsUndoLastBtn.addEventListener('click', function () {
    undoLastOp();
  });`,
`  /* زر «تراجع عن آخر عملية» بيتعامل معاه المُوزِّع تحت عشان ما ينفّذش مرتين */`, 'lastBtn');

rep(`    var id = u.getAttribute('data-undo-op');
    var op = null;`,
`    var id = u.getAttribute('data-undo-op');
    if (id === '__last__') { undoLastOp(); return; }
    var op = null;`, 'delegate');

rep(`    if (a !== null && b !== null && typeof a === 'object') return label + ' — تعديل البيانات';
    return label + ' — تغيير الإعداد';`,
`    if (Array.isArray(b) && a === null) return label + ' — استعادة/إصلاح من نسخة احتياطية';
    if (a !== null && b !== null && typeof a === 'object') return label + ' — تعديل البيانات';
    return label + ' — تغيير الإعداد';`, 'summary');

fs.writeFileSync(F, s);
console.log('✓ ' + F + ' — ' + n + ' تعديل');
