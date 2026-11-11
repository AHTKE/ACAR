/* ============================================================
   app-lock.js — قفل دخول التطبيق (مستقل تمامًا عن كلمة مرور الأقسام)
   ------------------------------------------------------------
   • أول تشغيل: شاشة إنشاء حساب (اسم + كلمة مرور + تأكيد).
   • بعد كده: شاشة دخول بكلمة المرور.
   • «نسيت كلمة المرور» → إدخال مفتاح الاسترجاع 2468 → تعيين كلمة جديدة.
   • من الإعدادات: تغيير كلمة المرور (تطلب الحالية) + زر «قفل التطبيق الآن».
   • كلمة المرور تُحفظ كـ hash (SHA-256 مع salt) — لا نص صريح.
   • أي فشل في هذا الملف لا يمنع التطبيق من العمل.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'app_lock';
  var SESSION = 'app_lock_session';
  var MASTER = '2468';
  var MIN_LEN = 4;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function readRec() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (r && r.hash) return r;
    } catch (e) {}
    return null;
  }

  function saveRec(rec) {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {}
  }

  function randSalt() {
    var chars = 'abcdef0123456789';
    var s = '';
    for (var i = 0; i < 16; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  /* بديل بسيط لو Web Crypto غير متاح (بيئات file:// أو http) */
  function fallbackHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 16777619) >>> 0;
      h2 = ((h2 << 5) + h2 + c) >>> 0;
    }
    function hex(n) { return ('00000000' + n.toString(16)).slice(-8); }
    return 'fb' + hex(h1) + hex(h2);
  }

  function hashPw(pw, salt, cb) {
    var str = String(salt) + ':' + String(pw);
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
          .then(function (buf) {
            var b = new Uint8Array(buf), out = '';
            for (var i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
            cb(out);
          })
          .catch(function () { cb(fallbackHash(str)); });
        return;
      }
    } catch (e) {}
    cb(fallbackHash(str));
  }

  /* ---------- واجهة ---------- */
  function overlayEl() {
    var o = document.getElementById('appLock');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'appLock';
    o.className = 'app-lock';
    document.body.appendChild(o);
    return o;
  }

  function closeOverlay() {
    var o = document.getElementById('appLock');
    if (o && o.parentNode) o.parentNode.removeChild(o);
    try { document.documentElement.removeAttribute('data-app-locked'); } catch (e) {}
  }

  function err(box, msg) {
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function bodyHTML(mode, name) {
    var head =
      '<div class="app-lock__card">' +
        '<div class="app-lock__logo" aria-hidden="true">' +
          '<img src="icons/icon-512.png" alt="WorkFlow" width="84" height="84" ' +
          'style="width:84px;height:84px;border-radius:22px;display:block;object-fit:cover" /></div>' +
        '<h1 class="app-lock__title">' + (mode === 'create' ? 'إنشاء حساب التطبيق' : 'الدخول للتطبيق') + '</h1>' +
        '<p class="app-lock__sub">' +
          (mode === 'create'
            ? 'أول مرة تفتح التطبيق — اعمل حسابك بكلمة مرور خاصة بالدخول.'
            : (name ? 'أهلًا ' + esc(name) : 'أدخل كلمة مرور التطبيق للمتابعة')) +
        '</p>';
    var form = '';
    if (mode === 'create') {
      form =
        '<label class="app-lock__field"><span>الاسم</span><input type="text" id="alName" autocomplete="name" placeholder="اسمك" /></label>' +
        '<label class="app-lock__field"><span>كلمة المرور</span><input type="password" id="alPass" autocomplete="new-password" placeholder="4 أحرف على الأقل" /></label>' +
        '<label class="app-lock__field"><span>تأكيد كلمة المرور</span><input type="password" id="alPass2" autocomplete="new-password" placeholder="أعد كتابتها" /></label>' +
        '<p class="app-lock__err" id="alErr" hidden></p>' +
        '<button type="button" class="btn btn--primary app-lock__btn" id="alGo">إنشاء الحساب والدخول</button>';
    } else if (mode === 'login') {
      form =
        '<label class="app-lock__field"><span>كلمة المرور</span><input type="password" id="alPass" autocomplete="current-password" placeholder="كلمة مرور التطبيق" /></label>' +
        '<p class="app-lock__err" id="alErr" hidden></p>' +
        '<button type="button" class="btn btn--primary app-lock__btn" id="alGo">دخول</button>' +
        '<button type="button" class="app-lock__link" id="alForgot">نسيت كلمة المرور؟</button>';
    } else if (mode === 'reset') {
      form =
        '<label class="app-lock__field"><span>مفتاح الاسترجاع</span><input type="password" id="alMaster" inputmode="numeric" placeholder="كلمة المرور المحفوظة" /></label>' +
        '<label class="app-lock__field"><span>كلمة المرور الجديدة</span><input type="password" id="alPass" autocomplete="new-password" placeholder="4 أحرف على الأقل" /></label>' +
        '<label class="app-lock__field"><span>تأكيد كلمة المرور الجديدة</span><input type="password" id="alPass2" autocomplete="new-password" placeholder="أعد كتابتها" /></label>' +
        '<p class="app-lock__err" id="alErr" hidden></p>' +
        '<button type="button" class="btn btn--primary app-lock__btn" id="alGo">تعيين كلمة المرور الجديدة</button>' +
        '<button type="button" class="app-lock__link" id="alBack">رجوع للدخول</button>';
    }
    return head + form + '</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function show(mode) {
    var rec = readRec();
    if (mode === 'login' && !rec) mode = 'create';
    if (mode === 'create' && rec) mode = 'login';

    var o = overlayEl();
    document.documentElement.setAttribute('data-app-locked', '1');
    o.innerHTML = bodyHTML(mode, rec ? rec.name : '');
    var box = $('#alErr', o);

    if (mode === 'create') wireCreate(o, box);
    else if (mode === 'login') wireLogin(o, box);
    else wireReset(o, box);
  }

  function finish(rec, msg) {
    closeOverlay();
    try { sessionStorage.setItem(SESSION, '1'); } catch (e) {}
    if (rec) saveRec(rec);
    try { toastSafe(msg || 'تم الدخول ✓'); } catch (e) {}
  }

  function toastSafe(msg) {
    if (typeof window.toast === 'function') { window.toast(msg); return; }
    if (typeof toast === 'function') { toast(msg); }
  }

  function wireCreate(o, box) {
    var name = $('#alName', o), p1 = $('#alPass', o), p2 = $('#alPass2', o), go = $('#alGo', o);
    function submit() {
      var nm = String(name.value || '').trim();
      var a = String(p1.value || ''), b = String(p2.value || '');
      if (nm.length < 2) return err(box, 'اكتب اسمك (حرفين على الأقل)');
      if (a.length < MIN_LEN) return err(box, 'كلمة المرور قصيرة — ' + MIN_LEN + ' أحرف على الأقل');
      if (a !== b) return err(box, 'كلمة المرور والتأكيد مختلفان');
      err(box, '');
      var salt = randSalt();
      hashPw(a, salt, function (h) {
        finish({ name: nm, salt: salt, hash: h, at: new Date().toISOString() }, 'اتعمل الحساب — أهلًا ' + nm + ' ✓');
      });
    }
    go.addEventListener('click', submit);
    [name, p1, p2].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    });
    try { name.focus(); } catch (e) {}
  }

  function wireLogin(o, box) {
    var p1 = $('#alPass', o), go = $('#alGo', o), forgot = $('#alForgot', o);
    function submit() {
      var rec = readRec();
      var pw = String(p1.value || '');
      if (!rec) return show('create');
      if (!pw) return err(box, 'اكتب كلمة المرور');
      hashPw(pw, rec.salt, function (h) {
        if (h !== rec.hash) { err(box, 'كلمة المرور غير صحيحة'); try { p1.select(); } catch (e) {} return; }
        err(box, '');
        finish(null, 'أهلًا ' + (rec.name || '') + ' ✓');
      });
    }
    go.addEventListener('click', submit);
    p1.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    if (forgot) forgot.addEventListener('click', function () { show('reset'); });
    try { p1.focus(); } catch (e) {}
  }

  function wireReset(o, box) {
    var mk = $('#alMaster', o), p1 = $('#alPass', o), p2 = $('#alPass2', o), go = $('#alGo', o), back = $('#alBack', o);
    function submit() {
      var rec = readRec();
      var a = String(p1.value || ''), b = String(p2.value || '');
      if (String(mk.value || '') !== MASTER) return err(box, 'مفتاح الاسترجاع غير صحيح');
      if (a.length < MIN_LEN) return err(box, 'كلمة المرور الجديدة قصيرة — ' + MIN_LEN + ' أحرف على الأقل');
      if (a !== b) return err(box, 'كلمة المرور والتأكيد مختلفان');
      err(box, '');
      var salt = randSalt();
      hashPw(a, salt, function (h) {
        finish({ name: (rec && rec.name) || '', salt: salt, hash: h, at: new Date().toISOString() },
          'اتغيّرت كلمة المرور ✓');
      });
    }
    go.addEventListener('click', submit);
    [mk, p1, p2].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    });
    if (back) back.addEventListener('click', function () { show('login'); });
    try { mk.focus(); } catch (e) {}
  }

  /* ---------- الإعدادات: تغيير كلمة المرور + قفل الآن ---------- */
  function settingsPanel() {
    var view = document.getElementById('view-settings');
    if (!view) return;
    var rec = readRec();
    /* اللوحة بتتبني بنسختين: حساب موجود / مفيش حساب —
       فلو الحالة اتغيرت نعيد بناءها بدل ما نفضل على النسخة القديمة */
    var existing = document.getElementById('appPwdPanel');
    if (existing) {
      if (existing.getAttribute('data-acc') === (rec ? '1' : '0')) return;
      if (existing.parentNode) existing.parentNode.removeChild(existing);
    }
    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'appPwdPanel';
    panel.setAttribute('data-acc', rec ? '1' : '0');
    panel.innerHTML =
      '<h3 class="panel__title">كلمة مرور الدخول للتطبيق</h3>' +
      '<p class="panel__hint">دي كلمة مرور فتح التطبيق نفسه — مختلفة تمامًا عن كلمة مرور الأقسام المحمية.</p>' +
      (rec
        ? '<div class="form__row form__row--3">' +
            '<label class="field"><span>كلمة المرور الحالية</span><input type="password" id="appPwdOld" autocomplete="current-password" /></label>' +
            '<label class="field"><span>كلمة المرور الجديدة</span><input type="password" id="appPwdNew" autocomplete="new-password" /></label>' +
            '<label class="field"><span>تأكيد الجديدة</span><input type="password" id="appPwdNew2" autocomplete="new-password" /></label>' +
          '</div>' +
          '<p class="form__error" id="appPwdErr" hidden></p>' +
          '<div class="form__actions">' +
            '<button type="button" class="btn btn--primary" id="appPwdSave">تغيير كلمة المرور</button>' +
            '<button type="button" class="btn btn--ghost" id="appPwdLock">قفل التطبيق الآن</button>' +
          '</div>'
        : '<p class="panel__note">مافيش حساب دخول لسه — اقفل التطبيق وأنشئ حسابك من شاشة البداية.</p>' +
          '<div class="form__actions"><button type="button" class="btn btn--ghost" id="appPwdLock">قفل التطبيق الآن</button></div>');

    view.appendChild(panel);

    var errBox = $('#appPwdErr', panel);
    var saveBtn = $('#appPwdSave', panel);
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var r = readRec();
      var oldPw = String(($('#appPwdOld', panel) || {}).value || '');
      var n1 = String(($('#appPwdNew', panel) || {}).value || '');
      var n2 = String(($('#appPwdNew2', panel) || {}).value || '');
      if (!r) return err(errBox, 'مافيش حساب');
      hashPw(oldPw, r.salt, function (h) {
        if (h !== r.hash) return err(errBox, 'كلمة المرور الحالية غير صحيحة');
        if (n1.length < MIN_LEN) return err(errBox, 'كلمة المرور الجديدة قصيرة — ' + MIN_LEN + ' أحرف على الأقل');
        if (n1 !== n2) return err(errBox, 'كلمة المرور والتأكيد مختلفان');
        var salt = randSalt();
        hashPw(n1, salt, function (h2) {
          saveRec({ name: r.name, salt: salt, hash: h2, at: new Date().toISOString() });
          err(errBox, '');
          ['#appPwdOld', '#appPwdNew', '#appPwdNew2'].forEach(function (s) {
            var el = $(s, panel); if (el) el.value = '';
          });
          toastSafe('اتغيّرت كلمة مرور التطبيق ✓');
        });
      });
    });

    var lockBtn = $('#appPwdLock', panel);
    if (lockBtn) lockBtn.addEventListener('click', function () { lock(); });
  }

  function lock() {
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    show(readRec() ? 'login' : 'create');
  }

  function boot() {
    try {
      settingsPanel();
      var unlocked = false;
      try { unlocked = sessionStorage.getItem(SESSION) === '1'; } catch (e) {}
      if (unlocked) { closeOverlay(); return; }
      show(readRec() ? 'login' : 'create');
    } catch (e) {
      /* أي فشل هنا ما يقفلش التطبيق */
      try { closeOverlay(); } catch (e2) {}
    }
  }

  window.__appLock = {
    lock: lock,
    boot: boot,
    hasAccount: function () { return !!readRec(); },
    reset: function () { try { localStorage.removeItem(KEY); sessionStorage.removeItem(SESSION); } catch (e) {} }
  };

  function start() {
    boot();
    /* لو الإعدادات بتترسم بعدين، نحاول نضيف اللوحة كام مرة */
    [800, 2000, 4000].forEach(function (ms) { setTimeout(function () { try { settingsPanel(); } catch (e) {} }, ms); });
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-go="settings"]');
      if (b) setTimeout(function () { try { settingsPanel(); } catch (e2) {} }, 60);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
