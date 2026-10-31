/* patch-fix8.js
   1) sw.js: لو الشبكة رجّعت خطأ (502 مثلاً) نرجع النسخة المحفوظة بدل تمرير الخطأ
      → المستخدم بيشتغل من الكاش بدل شاشة فاضية/ملف JS مكسور.
   2) index.html: لو /api/google/status فشل، نعرض رسالة واضحة وزر إعادة محاولة
      بدل ما تفضل الشاشة الإلزامية ساكتة للأبد.
   ملاحظة: لازم الاستبدال يكون بـ function عشان String.replace بيحوّل $$ لـ $.
*/
const fs = require('fs');

let n = 0;
function rep(file, what, oldStr, newStr) {
  let s = fs.readFileSync(file, 'utf8');
  const c = s.split(oldStr).length - 1;
  if (c === 0) {
    if (s.indexOf(newStr) !== -1) { console.log('  =  مطبَّق مسبقًا: ' + what); return; }
    throw new Error(`[${file}] count=${c} :: ${what}`);
  }
  if (c !== 1) throw new Error(`[${file}] count=${c} :: ${what}`);
  s = s.replace(oldStr, function () { return newStr; });
  fs.writeFileSync(file, s);
  n++;
  console.log('  OK  ' + what);
}

/* ---------- 1) Service Worker ---------- */
rep('sw.js', 'navigate: network errors fall back to cache',
  `        if (res && res.ok && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./', copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match('./');
      })`,
  `        if (res && res.ok && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./', copy); }).catch(function () {});
        }
        /* لو الخادم رجّع خطأ (502/503) نعرض آخر نسخة شغالة بدل صفحة الخطأ */
        if (res && res.ok) return res;
        return caches.match('./').then(function (c) { return c || res; });
      }).catch(function () {
        return caches.match('./');
      })`);

rep('sw.js', 'assets: network errors fall back to cache',
  `    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req);
    })`,
  `    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      /* ملف رجع 502؟ نرجع نسخته المحفوظة عشان الصفحة ما تنكسرش */
      if (res && res.ok) return res;
      return caches.match(req).then(function (c) { return c || res; });
    }).catch(function () {
      return caches.match(req);
    })`);

rep('sw.js', 'cache version bump to v9',
  `var CACHE = 'nizam-idara-v8';`,
  `var CACHE = 'nizam-idara-v9';`);

/* ---------- 2) بوابة الربط: رسالة خطأ + إعادة محاولة ---------- */
rep('index.html', 'gate: surface status errors instead of silent block',
  `    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (s) { if (s && s.connected && gate) gate.style.display = 'none'; })
      .catch(function () {});`,
  `    function gateStatusError(msg) {
      var e = document.getElementById('gateError');
      if (!e) return;
      e.style.display = 'block';
      e.textContent = msg;
    }
    function checkGate() {
      var e = document.getElementById('gateError');
      if (e) e.style.display = 'none';
      fetch('/api/google/status', { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json().catch(function () { return {}; });
        })
        .then(function (s) {
          if (s && s.connected && gate) gate.style.display = 'none';
          else gateStatusError('لم يتم ربط حساب Google Drive بعد — اربط الحساب للمتابعة.');
        })
        .catch(function (err) {
          gateStatusError('تعذّر التحقق من حالة الربط (' + (err && err.message ? err.message : 'خطأ') +
            ') — البيانات محفوظة، اضغط «إعادة المحاولة».');
        });
    }
    checkGate();
    var gateRetryBtn = document.getElementById('gateRetry');
    if (gateRetryBtn) gateRetryBtn.addEventListener('click', checkGate);`);

/* زر إعادة المحاولة داخل بطاقة الربط */
rep('index.html', 'gate: retry button markup',
  `    <div id="gateError" style="display:none;margin-top:16px;padding:12px 14px;border-radius:12px;border:1px solid #f87171;background:rgba(248,113,113,.12);color:#fecaca;font-size:13px;line-height:1.9;text-align:right;"></div>`,
  `    <div id="gateError" style="display:none;margin-top:16px;padding:12px 14px;border-radius:12px;border:1px solid #f87171;background:rgba(248,113,113,.12);color:#fecaca;font-size:13px;line-height:1.9;text-align:right;"></div>
    <button type="button" id="gateRetry" style="width:100%;margin-top:12px;padding:11px;background:transparent;border:1px solid #4f8cff;color:#9fadc2;border-radius:10px;cursor:pointer;font-weight:600;">إعادة المحاولة</button>`);

console.log(`\nتم تطبيق ${n} تعديل`);
