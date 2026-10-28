/* ============================================================
   patch-theme.js — إعادة تصميم الألوان
   الخلفية السائدة محايدة داكنة + لوحات رمادية مميزة بوضوح +
   نص شبه أبيض عالي التباين + لون تمييز أزرق واحد
   (لا يوجد لونان متقاربان جنب بعض — لا خلفية زرقاء ونص أزرق)
   ============================================================ */
'use strict';
const fs = require('fs');

/* ---------------- styles.css ---------------- */
let css = fs.readFileSync('styles.css', 'utf8');
let n = 0;
function rep(from, to, label) {
  if (css.includes(from)) { css = css.split(from).join(to); n++; }
  else console.log('  ! لم يُعثر عليه: ' + (label || from.slice(0, 60)));
}

/* 1) اللوحة الأساسية — استبدال كامل */
rep(`:root{
  --bg:#0d1320;
  --bg-2:#141a28;
  --panel:rgba(13,19,32,.3);
  --panel-2:rgba(13,19,32,.4);
  --line:rgba(255,255,255,.07);
  --line-strong:rgba(255,255,255,.14);
  --text:#c8d6e8;
  --muted:#788aa0;
  --muted-2:#5a6a7a;
  --primary:#3b82f6;
  --primary-light:#60a5fa;
  --secondary:#64d5ff;
  --secondary-hover:#22cfe7;
  --radius:16px;
  --shadow:0 14px 45px rgba(0,0,0,.4);
  --font:'Tajawal','Segoe UI',Tahoma,system-ui,sans-serif;
}`, `:root{
  --bg:#0a0e15;
  --bg-2:#0e131c;
  --panel:#151b26;
  --panel-2:#1d2534;
  --line:rgba(255,255,255,.08);
  --line-strong:rgba(255,255,255,.17);
  --text:#f2f6fb;
  --muted:#9fadc2;
  --muted-2:#6d7c92;
  --primary:#4f8cff;
  --primary-light:#7aa8ff;
  --secondary:#34d399;
  --secondary-hover:#22c55e;
  --green:#34d399;
  --red:#f87171;
  --amber:#fbbf24;
  --cyan:#22d3ee;
  --violet:#a78bfa;
  --pink:#f472b6;
  --indigo:#6366f1;
  --blue:#60a5fa;
  --radius:16px;
  --shadow:0 14px 45px rgba(0,0,0,.5);
  --font:'Tajawal','Segoe UI',Tahoma,system-ui,sans-serif;
}`, ':root');

/* 2) خلفية الصفحة — تدرجات محايدة بدل الزرقاء/البنفسجية */
rep(`  background:
    radial-gradient(1200px 600px at 85% -10%, #1a2142 0%, transparent 60%),
    radial-gradient(900px 500px at 10% 110%, #1b1533 0%, transparent 60%),
    var(--bg);`,
`  background:
    radial-gradient(1200px 600px at 85% -10%, #141b29 0%, transparent 60%),
    radial-gradient(900px 500px at 10% 110%, #111726 0%, transparent 60%),
    var(--bg);`, 'body bg');

/* 3) أضواء الخلفية — أزرق + محايد + لمسة خضراء بعيدة عن الأزرق */
rep(`.glow--2{width:420px;height:420px;background:var(--primary-light);bottom:-180px;inset-inline-end:-100px;opacity:.28}
.glow--3{width:320px;height:320px;background:var(--secondary);top:40%;inset-inline-end:25%;opacity:.12}`,
`.glow--2{width:420px;height:420px;background:#26314a;bottom:-180px;inset-inline-end:-100px;opacity:.5}
.glow--3{width:320px;height:320px;background:#1f5c48;top:40%;inset-inline-end:25%;opacity:.16}`, 'glows');

/* 4) ملخصات: داخلي=أخضر، خارجي=أحمر (دلالة واضحة + لونان بعيدان) */
rep(`.summary__box--in::before{background:var(--green)}
.summary__box--out::before{background:var(--secondary)}
.summary__box--net::before{background:linear-gradient(var(--primary),var(--secondary))}`,
`.summary__box--in::before{background:var(--green)}
.summary__box--out::before{background:var(--red)}
.summary__box--net::before{background:linear-gradient(var(--primary),var(--primary-light))}`, 'summary');

/* 5) وسوم الحركة: داخلي أخضر / خارجي أحمر */
rep(`.tag--in{color:#60a5fa;background:rgba(59,130,246,.13);border-color:rgba(59,130,246,.35)}
.tag--out{color:#22cfe7;background:rgba(59,130,246,.13);border-color:rgba(59,130,246,.35)}`,
`.tag--in{color:#6ee7b7;background:rgba(52,211,153,.13);border-color:rgba(52,211,153,.38)}
.tag--out{color:#fca5a5;background:rgba(248,113,113,.13);border-color:rgba(248,113,113,.38)}`, 'tags');

/* 6) شريط التقدم: أخضر ← أزرق (لونان بعيدان) */
rep(`.progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--primary),var(--secondary));transition:width .5s ease}`,
`.progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--primary));transition:width .5s ease}`, 'progress');

/* 7) إرجاع ألوان الأيقونات الثمانية اللي تستخدمها الـHTML */
rep(`.card__icon--primary{background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;box-shadow:0 10px 24px rgba(79,70,229,.35)}
.card__icon--secondary{background:linear-gradient(135deg,var(--secondary),var(--secondary-hover));color:#fff;box-shadow:0 10px 24px rgba(99,213,255,.35)}
.card__icon--muted{background:rgba(144,165,194,.2);color:var(--muted)}`,
`.card__icon--primary{background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;box-shadow:0 10px 24px rgba(79,140,255,.35)}
.card__icon--secondary{background:linear-gradient(135deg,var(--secondary),var(--secondary-hover));color:#04140e;box-shadow:0 10px 24px rgba(52,211,153,.35)}
.card__icon--muted{background:rgba(144,165,194,.2);color:var(--muted)}
.card__icon--indigo{background:linear-gradient(135deg,#4f46e5,#7c8bff);color:#fff;box-shadow:0 10px 24px rgba(79,70,229,.4)}
.card__icon--green{background:linear-gradient(135deg,#059669,#34d399);color:#04140e;box-shadow:0 10px 24px rgba(5,150,105,.35)}
.card__icon--cyan{background:linear-gradient(135deg,#0891b2,#22d3ee);color:#04151b;box-shadow:0 10px 24px rgba(8,145,178,.35)}
.card__icon--violet{background:linear-gradient(135deg,#7c3aed,#c084fc);color:#fff;box-shadow:0 10px 24px rgba(124,58,237,.38)}
.card__icon--amber{background:linear-gradient(135deg,#d97706,#fbbf24);color:#1d1204;box-shadow:0 10px 24px rgba(217,119,6,.35)}
.card__icon--pink{background:linear-gradient(135deg,#db2777,#f472b6);color:#fff;box-shadow:0 10px 24px rgba(219,39,119,.35)}
.card__icon--blue{background:linear-gradient(135deg,#2563eb,#60a5fa);color:#fff;box-shadow:0 10px 24px rgba(37,99,235,.35)}
.card__icon--slate{background:linear-gradient(135deg,#334155,#94a3b8);color:#0b1220;box-shadow:0 10px 24px rgba(51,65,85,.4)}`, 'icons');

/* 8) استبدالات جماعية للّون الأزرق القديم */
const rgbaMap = [
  ['rgba(59,130,246', 'rgba(79,140,255'],
  ['rgba(59, 130, 246', 'rgba(79,140,255'],
  ['rgba(109,124,255', 'rgba(79,140,255'],
  ['rgba(168,85,247', 'rgba(79,140,255'],
  ['rgba(99,210,255', 'rgba(79,140,255'],
  ['rgba(99,213,255', 'rgba(79,140,255'],
  ['rgba(13,19,32', 'rgba(21,27,38'],
  ['rgba(20,26,40', 'rgba(21,27,38'],
  ['rgba(8,12,20', 'rgba(6,9,14'],
  ['rgba(4,6,14', 'rgba(5,7,12']
];
rgbaMap.forEach(([a, b]) => { if (css.includes(a)) css = css.split(a).join(b); });

/* تدرجات عليها بنفس الدرجة مرتين — نفصلها */
rep('rgba(79,140,255,.35),rgba(79,140,255,.3)', 'rgba(79,140,255,.35),rgba(79,140,255,.15)', 'modal icon grad');
rep('rgba(79,140,255,.3),rgba(79,140,255,.25)', 'rgba(79,140,255,.32),rgba(79,140,255,.15)', 'segmented grad');
rep('rgba(79,140,255,.22),rgba(79,140,255,.08)', 'rgba(79,140,255,.24),rgba(79,140,255,.06)', 'group-row grad');

/* 9) استبدالات جماعية — نصوص فاتحة بلون متقارب على الخلفية → شبه بيضاء */
const hexMap = [
  ['#c8d6e8', '#f2f6fb'],
  ['#a5f3fc', '#eaf6ff'],
  ['#c7d0ff', '#eef3ff'],
  ['#c7d2fe', '#eef3ff'],
  ['#c4b5fd', '#e8eeff'],
  ['#d7dcff', '#eef3ff'],
  ['#cdd4ff', '#eaf0ff'],
  ['#c9d2ff', '#eaf1ff'],
  ['#dbe2ff', '#f2f6fb'],
  ['#e9d5ff', '#f6f2ff'],
  ['#aab4ff', '#9db4ff'],
  ['#cbd5e1', '#e6ecf5'],
  ['#d1fae5', '#e7fbf2'],
  ['#60a5fa', '#7aa8ff'],
  ['#3b82f6', '#4f8cff'],
  ['#0d1320', '#0a0e15'],
  ['#141a28', '#151b26'],
  ['#151a30', '#161d2b'],
  ['#10142a', '#10151f'],
  ['#141830', '#151b26'],
  ['#151a2e', '#151b26'],
  ['#788aa0', '#9fadc2']
];
hexMap.forEach(([a, b]) => { if (css.includes(a)) css = css.split(a).join(b); });

fs.writeFileSync('styles.css', css);
console.log('styles.css: ' + n + ' مقطع أساسي + استبدالات جماعية');

/* ---------------- index.html (شاشة الربط المضمّنة) ---------------- */
let html = fs.readFileSync('index.html', 'utf8');
let h = 0;
function repH(from, to) {
  if (html.includes(from)) { html = html.split(from).join(to); h++; }
}
[
  ['#0d1320', '#0a0e15'],
  ['#141a28', '#151b26'],
  ['#3b82f6', '#4f8cff'],
  ['#60a5fa', '#7aa8ff'],
  ['#c8d6e8', '#f2f6fb'],
  ['#788aa0', '#9fadc2']
].forEach(([a, b]) => repH(a, b));
fs.writeFileSync('index.html', html);
console.log('index.html: ' + h + ' خريطة ألوان طُبّقت');