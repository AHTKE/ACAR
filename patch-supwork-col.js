/* عمود «الشغلانة» في جدول كشف حساب المورد */
const fs = require('fs');
let s = fs.readFileSync('app.js', 'utf8');
let n = 0;

function rep(a, b) {
  if (s.indexOf(a) < 0) { console.error('NOT FOUND: ' + a.slice(0, 70)); process.exit(1); }
  s = s.split(a).join(b); n++;
}

rep(
  `        '<td>' + (t.to ? esc(t.to) : '—') + '</td>' +`,
  `        '<td>' + (t.to ? esc(t.to) : '—') + '</td>' +
        '<td>' + (t.work ? esc(t.work) : '—') + '</td>' +`
);

rep(
  `rows = '<tr><td colspan="10"`,
  `rows = '<tr><td colspan="11"`
);

fs.writeFileSync('app.js', s);
console.log('patched ' + n);
