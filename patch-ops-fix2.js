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

/* زر «تراجع عن آخر عملية» لازم يفتح نافذة التأكيد زي أي تراجع */
rep(`    var id = u.getAttribute('data-undo-op');
    if (id === '__last__') { undoLastOp(); return; }
    var op = null;
    getOps().forEach(function (o) { if (o.id === id) op = o; });
    if (!op) return;
    openConfirm({
      title: 'تراجع عن عملية',
      message: 'هل تريد التراجع عن: «' + (op.desc || 'عملية') + '»؟ سيتم إرجاع القسم لحالته السابقة.',
      yes: 'نعم، تراجع', no: 'تراجع',
      onYes: function () { undoOpById(id); }
    });`,
`    var id = u.getAttribute('data-undo-op');
    var op = null;
    if (id === '__last__') {
      var all = getOps();
      for (var i = 0; i < all.length; i++) if (all[i].undoable) { op = all[i]; break; }
      if (!op) { toast('مفيش عملية قابلة للتراجع حالياً', true); return; }
    } else {
      getOps().forEach(function (o) { if (o.id === id) op = o; });
      if (!op) { toast('العملية غير موجودة', true); return; }
    }
    openConfirm({
      title: 'تراجع عن عملية',
      message: 'هل تريد التراجع عن: «' + (op.desc || 'عملية') + '»؟ سيتم إرجاع القسم لحالته السابقة.',
      yes: 'نعم، تراجع', no: 'تراجع',
      onYes: function () { undoOpById(op.id); }
    });`, 'delegate');

/* عرض حجم القسم بالبايت بدل 0 KB المضلّل */
rep(`        '<td class="amount">' + (r.bytes ? money(Math.round(r.bytes / 1024 * 10) / 10) + ' KB' : '—') + '</td></tr>';`,
`        '<td class="amount">' + (r.bytes ? money(r.bytes) + ' بايت' : '—') + '</td></tr>';`, 'bytes');

fs.writeFileSync(F, s);
console.log('✓ ' + F + ' — ' + n + ' تعديل');
