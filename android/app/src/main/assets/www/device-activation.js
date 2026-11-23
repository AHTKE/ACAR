/* ============================================================
   device-activation.js — شاشة قفل/تفعيل الجهاز
   ------------------------------------------------------------
   • بتظهر أول ما التطبيق يفتح — قبل ربط Google وقبل أي حاجة.
   • خطوتين بس:
       1) كلمة مرور تشغيلية (6 أرقام، بتتغيّر كل 5 دقائق).
       2) كود الجهاز (6 أرقام) + كود التفعيل المخصّص له (6 أرقام،
          صالح 3 دقائق) اللي المسؤول بيطلّعه من أداة التوليد.
   • بعد التفعيل مرة واحدة التطبيق بيفتح عادي وكل حاجة شغالة.
   • مفيش أي سر هنا: كل التحقق على الخادم /api/activation/*.
   • قاعدة الأمان: مفيش قفل لو الخدمة مش متاحة أو الشبكة واقعة
     وجهاز مش معروف — عشان ما نقفلش ناس على الفاضي.
   ============================================================ */
(function () {
  'use strict';

  var CODE_KEY = 'device_activation_code';    /* كود الجهاز (6 أرقام) */
  var TOKEN_KEY = 'device_activation_token';  /* إثبات التفعيل من الخادم */
  var CACHE_KEY = 'device_activation_cache';
  var API = '/api/activation/';
  var TIMEOUT_MS = 12000;

  var BRAND = 'WorkFlow';
  var CONTACT_TEXT = '01013318895';
  var CONTACT_URL = 'https://wa.me/201013318895';

  var state = {
    checked: false,     /* عرفنا حالة الخادم */
    available: false,   /* الخدمة متاحة (السر مضبوط على الخادم) */
    enforced: false,
    activated: false,
    step: 'passcode',
    busy: false,
    err: '',
    deviceCode: '',
    secondsLeft: 0
  };

  /* ---------- أدوات ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* التخزين مش متاح */ }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  function randomDigits(n) {
    var out = '';
    try {
      var buf = new Uint8Array(n * 2);
      window.crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length && out.length < n; i++) {
        if (buf[i] < 250) out += String(buf[i] % 10);
      }
    } catch (e) { out = ''; }
    while (out.length < n) out += String(Math.floor(Math.random() * 10));
    return out.slice(0, n);
  }

  /* كود الجهاز: 6 أرقام عشوائية بيتحفظوا على الجهاز ده بس */
  function deviceCode() {
    var c = lsGet(CODE_KEY);
    if (c && /^\d{6}$/.test(c)) return c;
    c = randomDigits(6);
    lsSet(CODE_KEY, c);
    return c;
  }

  function token() {
    var t = lsGet(TOKEN_KEY);
    return (t && t.length >= 16) ? t : '';
  }

  function readCache() {
    try {
      var c = JSON.parse(lsGet(CACHE_KEY) || 'null');
      if (c && typeof c === 'object') return c;
    } catch (e) {}
    return null;
  }
  function writeCache(patch) {
    var c = readCache() || {};
    Object.keys(patch || {}).forEach(function (k) { c[k] = patch[k]; });
    c.at = Date.now();
    lsSet(CACHE_KEY, JSON.stringify(c));
  }

  function platformName() {
    var ua = String((navigator && navigator.userAgent) || '');
    if (/Android/i.test(ua)) return 'أندرويد';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'آيفون / آيباد';
    if (/Windows/i.test(ua)) return 'ويندوز';
    if (/Mac OS X/i.test(ua)) return 'ماك';
    if (/Linux/i.test(ua)) return 'لينكس';
    return 'متصفح';
  }

  function brandName() {
    try {
      var el = $('.brand__text strong');
      var t = el ? String(el.textContent || '').trim() : '';
      if (t) return t;
    } catch (e) {}
    return BRAND;
  }

  function toastSafe(msg) {
    try {
      if (typeof window.toast === 'function') { window.toast(msg); return; }
      if (typeof toast === 'function') { toast(msg); return; }
    } catch (e) {}
  }

  function copyText(text) {
    var t = String(text || '');
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        toastSafe(ok ? 'تم النسخ ✓' : 'انسخ الرقم يدويًا');
      } catch (e) { toastSafe('انسخ الرقم يدويًا'); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { toastSafe('تم النسخ ✓'); }, fallback);
        return;
      }
    } catch (e) {}
    fallback();
  }

  /* ---------- نداء الخادم ---------- */
  function callApi(action, body, method) {
    var url = API + action;
    if (method === 'GET') {
      url += '?device=' + encodeURIComponent(deviceCode()) +
        '&token=' + encodeURIComponent(token());
    }
    var ctrl = null, timer = null;
    try { ctrl = new AbortController(); timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, TIMEOUT_MS); } catch (e) {}
    var init = { method: method || 'POST', credentials: 'same-origin', cache: 'no-store' };
    if (ctrl) init.signal = ctrl.signal;
    if (init.method !== 'GET') {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body || {});
    }
    return fetch(url, init).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = JSON.parse(txt); } catch (e) { data = null; }
        if (!data) data = { ok: false, error: 'رد غير مفهوم من الخادم' };
        data.__status = res.status;
        return data;
      });
    }).then(function (d) {
      if (timer) clearTimeout(timer);
      return d;
    }, function () {
      if (timer) clearTimeout(timer);
      var e = new Error('تعذّر الاتصال بالخادم — تأكد من الإنترنت وحاول تاني');
      e.network = true;
      throw e;
    });
  }

  /* ---------- الشاشة ---------- */
  function overlayEl() {
    var o = document.getElementById('deviceActivation');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'deviceActivation';
    o.className = 'dev-act';
    o.setAttribute('dir', 'rtl');
    document.body.appendChild(o);
    return o;
  }

  function closeOverlay() {
    var o = document.getElementById('deviceActivation');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  function headHTML(title, sub) {
    return '<div class="dev-act__card">' +
      '<div class="dev-act__brand">' +
        '<div class="dev-act__mark">🔒</div>' +
        '<div><b class="dev-act__name">' + esc(brandName()) + '</b>' +
        '<small class="dev-act__tag">تفعيل الجهاز</small></div>' +
      '</div>' +
      '<h1 class="dev-act__title">' + esc(title) + '</h1>' +
      '<p class="dev-act__sub">' + sub + '</p>';
  }

  function contactHTML() {
    return '<div class="dev-act__contact">' +
      '<span>للتواصل وطلب الأكواد:</span> ' +
      '<a href="' + CONTACT_URL + '" target="_blank" rel="noopener" dir="ltr">' + esc(CONTACT_TEXT) + '</a> ' +
      '<span>(واتساب)</span>' +
      '</div>';
  }

  function deviceBoxHTML() {
    var code = deviceCode();
    return '<div class="dev-act__dev">' +
      '<div class="dev-act__dev-label">كود هذا الجهاز</div>' +
      '<div class="dev-act__dev-row">' +
        '<code id="daDeviceId" class="dev-act__id" dir="ltr">' + esc(code) + '</code>' +
        '<button type="button" class="dev-act__copy" id="daCopyId">نسخ</button>' +
      '</div>' +
      '<p class="dev-act__note">ابعت الكود ده للمسؤول عشان يطلّع لك كود التفعيل المخصّص له. ' +
      'حذف بيانات المتصفح أو إعادة التثبيت ممكن يغيّر الكود ويحتاج تفعيلاً جديداً.</p>' +
      '</div>';
  }

  function render() {
    var o = overlayEl();
    var body = '';
    if (state.step === 'passcode') {
      body = headHTML('تفعيل الجهاز',
          'الجهاز ده محتاج تفعيل قبل الاستخدام. اكتب كلمة المرور التشغيلية ' +
          '(6 أرقام، بتتغيّر كل 5 دقائق) واطلبها من المسؤول.') +
        '<label class="dev-act__field"><span>كلمة المرور التشغيلية</span>' +
          '<div class="dev-act__pw">' +
            '<input type="password" id="daPass" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" dir="ltr" />' +
            '<button type="button" class="dev-act__eye" id="daEye" aria-label="إظهار كلمة المرور">👁</button>' +
          '</div>' +
        '</label>' +
        '<p class="dev-act__err" id="daErr" ' + (state.err ? '' : 'hidden') + '>' + esc(state.err) + '</p>' +
        '<button type="button" class="btn btn--primary dev-act__btn" id="daNext">' + (state.busy ? 'جارٍ التحقق…' : 'متابعة') + '</button>' +
        '<button type="button" class="dev-act__link" id="daRetry">إعادة المحاولة</button>' +
        contactHTML();
    } else {
      body = headHTML('كود التفعيل',
          'تمام — كلمة المرور مقبولة. ابعت «كود الجهاز» ده للمسؤول، ' +
          'وهو هيطلّع لك كود تفعيل من 6 أرقام صالح 3 دقائق للجهاز ده بس.') +
        deviceBoxHTML() +
        '<label class="dev-act__field"><span>كود التفعيل (6 أرقام)</span>' +
          '<input type="text" id="daCode" class="dev-act__code-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" dir="ltr" />' +
        '</label>' +
        '<p class="dev-act__err" id="daErr" ' + (state.err ? '' : 'hidden') + '>' + esc(state.err) + '</p>' +
        '<button type="button" class="btn btn--primary dev-act__btn" id="daGo">' + (state.busy ? 'جارٍ التفعيل…' : 'تفعيل الجهاز') + '</button>' +
        '<button type="button" class="dev-act__link" id="daBack">رجوع لكلمة المرور</button>' +
        contactHTML();
    }
    o.innerHTML = body + '</div>';
    wire();
  }

  function setErr(msg) {
    state.err = msg || '';
    var box = document.getElementById('daErr');
    if (box) { box.textContent = state.err; box.hidden = !state.err; }
  }

  function wire() {
    var copy = document.getElementById('daCopyId');
    if (copy) copy.addEventListener('click', function () { copyText(deviceCode()); });

    var eye = document.getElementById('daEye');
    if (eye) eye.addEventListener('click', function () {
      var inp = document.getElementById('daPass');
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      eye.textContent = inp.type === 'password' ? '👁' : '🙈';
    });

    var next = document.getElementById('daNext');
    if (next) next.addEventListener('click', submitPasscode);

    var pass = document.getElementById('daPass');
    if (pass) {
      pass.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitPasscode(); }
      });
      try { pass.focus(); } catch (e) {}
    }

    var go = document.getElementById('daGo');
    if (go) go.addEventListener('click', submitCode);
    var code = document.getElementById('daCode');
    if (code) {
      code.addEventListener('input', function () {
        code.value = String(code.value || '').replace(/\D/g, '').slice(0, 6);
      });
      code.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
      });
      try { code.focus(); } catch (e) {}
    }
    var back = document.getElementById('daBack');
    if (back) back.addEventListener('click', function () {
      state.step = 'passcode';
      state.err = '';
      render();
    });
    var retry = document.getElementById('daRetry');
    if (retry) retry.addEventListener('click', function () { refresh(true); });
  }

  function submitPasscode() {
    if (state.busy) return;
    var inp = document.getElementById('daPass');
    var pass = String((inp && inp.value) || '').replace(/\D/g, '');
    if (pass.length !== 6) return setErr('كلمة المرور التشغيلية 6 أرقام');
    state.busy = true;
    setErr('');
    render();
    callApi('passcode', {
      device: deviceCode(),
      name: platformName(),
      passcode: pass
    }, 'POST').then(function (d) {
      state.busy = false;
      if (!d.ok) {
        state.step = 'passcode';
        render();
        return setErr(d.error || 'تعذّر التحقق');
      }
      state.step = 'code';
      state.secondsLeft = Number(d.secondsLeft || 0);
      writeCache({ available: true, enforced: true });
      render();
    }, function (e) {
      state.busy = false;
      state.step = 'passcode';
      render();
      setErr(e.message || 'تعذّر الاتصال بالخادم');
    });
  }

  function submitCode() {
    if (state.busy) return;
    var inp = document.getElementById('daCode');
    var code = String((inp && inp.value) || '').replace(/\D/g, '');
    if (code.length !== 6) return setErr('كود التفعيل 6 أرقام');
    state.busy = true;
    setErr('');
    render();
    callApi('verify', { device: deviceCode(), code: code }, 'POST').then(function (d) {
      state.busy = false;
      if (!d.ok) {
        render();
        return setErr(d.error || 'تعذّر التفعيل');
      }
      state.activated = true;
      state.available = true;
      state.checked = true;
      if (d.token) lsSet(TOKEN_KEY, d.token);
      writeCache({ activated: true, available: true, enforced: true });
      closeOverlay();
      toastSafe('تم تفعيل الجهاز ✓');
    }, function (e) {
      state.busy = false;
      render();
      setErr(e.message || 'تعذّر الاتصال بالخادم');
    });
  }

  /* ---------- التحقق من الحالة ---------- */
  function refresh(showErrors) {
    var cached = readCache() || {};
    return callApi('status', null, 'GET').then(function (d) {
      state.checked = true;
      if (d.available === false) {
        state.available = false;
        state.enforced = false;
        state.activated = false;
        writeCache({ available: false, enforced: false });
        closeOverlay();
        return state;
      }
      state.available = true;
      state.enforced = !!d.enforced;
      state.activated = !!d.activated;
      writeCache({ available: true, enforced: state.enforced, activated: state.activated });
      if (state.enforced && !state.activated) {
        if (state.step !== 'code') state.step = 'passcode';
        render();
      } else {
        closeOverlay();
      }
      return state;
    }, function () {
      /* الشبكة واقعة: مفيش بيانات من الخادم */
      state.checked = false;
      if (token()) {          /* مفعّل قبل كده → ما نقفلوش */
        state.activated = true;
        closeOverlay();
        return state;
      }
      if (cached.enforced === true) {
        state.enforced = true;
        state.activated = false;
        if (showErrors) state.err = 'تعذّر الاتصال بالخادم — تأكد من الإنترنت وحاول تاني';
        render();
      } else {
        closeOverlay();       /* جهاز جديد ومفيش اتصال → ما نقفلش التطبيق */
      }
      return state;
    });
  }

  /* ---------- التشغيل ---------- */
  function start() {
    state.deviceCode = deviceCode();
    refresh(false);
    try {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refresh(false);
      });
      setInterval(function () { if (!document.hidden) refresh(false); }, 10 * 60 * 1000);
    } catch (e) {}
  }

  window.__deviceActivation = {
    refresh: refresh,
    state: state,
    deviceCode: deviceCode,
    token: token,
    submitPasscode: submitPasscode,
    submitCode: submitCode
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
