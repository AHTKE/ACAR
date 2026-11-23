/* ============================================================
   device-activation.js — قفل الجهاز وتفعيله (المستخدم)
   ------------------------------------------------------------
   • الخادم هو المرجع الوحيد: /api/activation/*
   • معرّف ثابت للتثبيت (بدون بصمة متصفح) + زر نسخ.
   • خطوتان: كلمة مرور تشغيلية (5 دقائق) → كود تفعيل مخصّص للجهاز.
   • لوحة الأدمن في الإعدادات: تفعيل/إلغاء، كلمة مرور، أكواد، إلغاء جهاز.
   • مفيش أي سر أو مفتاح في هذا الملف — كل التحقق على الخادم.
   • قاعدة الأمان: أي خطأ هنا لا يقفل التطبيق من نفسه؛ القفل بيظهر
     فقط لما الخادم يقول صريح إن الجهاز مش مفعّل والتفعيل مطلوب.
   ============================================================ */
(function () {
  'use strict';

  var ID_KEY = 'device_activation_id';
  var CACHE_KEY = 'device_activation_cache';
  var API = '/api/activation/';
  var TIMEOUT_MS = 12000;

  var state = {
    known: false,        /* اتأكدنا من الخادم في الجلسة دي */
    available: true,     /* الخدمة المركزية متاحة */
    enforced: false,     /* الأدمن طالب تفعيل الأجهزة */
    activated: false,
    step: 'passcode',
    passcode: '',
    deviceName: '',
    lastError: '',
    busy: false
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

  function randHex(n) {
    var chars = 'abcdef0123456789', s = '';
    try {
      var buf = new Uint8Array(n);
      window.crypto.getRandomValues(buf);
      for (var i = 0; i < n; i++) s += chars.charAt(buf[i] % 16);
      return s;
    } catch (e) {
      for (var j = 0; j < n; j++) s += chars.charAt(Math.floor(Math.random() * 16));
      return s;
    }
  }

  /* معرّف التثبيت: UUID عشوائي محلي — مالوش علاقة بأي بيانات شخصية */
  function deviceId() {
    var id = lsGet(ID_KEY);
    if (id && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
    try {
      id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : '';
    } catch (e) { id = ''; }
    if (!id) id = randHex(8) + '-' + randHex(4) + '-' + randHex(4) + '-' + randHex(12);
    id = id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
    if (id.length < 8) id = 'dev-' + randHex(16);
    lsSet(ID_KEY, id);
    return id;
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
        toastSafe(ok ? 'تم النسخ ✓' : 'انسخ النص يدويًا');
      } catch (e) { toastSafe('انسخ النص يدويًا'); }
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
    var url = API + action + (method === 'GET' ? '?device=' + encodeURIComponent(deviceId()) : '');
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
    }, function (err) {
      if (timer) clearTimeout(timer);
      var e = new Error('تعذّر الاتصال بالخادم');
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
      '<div class="dev-act__icon" aria-hidden="true">🔒</div>' +
      '<h1 class="dev-act__title">' + esc(title) + '</h1>' +
      '<p class="dev-act__sub">' + sub + '</p>';
  }

  function deviceBoxHTML() {
    return '<div class="dev-act__dev">' +
      '<div class="dev-act__dev-label">معرّف هذا الجهاز</div>' +
      '<div class="dev-act__dev-row">' +
        '<code id="daDeviceId" dir="ltr">' + esc(deviceId()) + '</code>' +
        '<button type="button" class="dev-act__copy" id="daCopyId">نسخ</button>' +
      '</div>' +
      '<p class="dev-act__note">اكتب المعرّف ده للمسؤول عشان يصدر لك كود التفعيل. حذف بيانات المتصفح أو إعادة التثبيت بينشئ معرّفاً جديداً ويحتاج تفعيلاً جديداً.</p>' +
      '</div>';
  }

  function render() {
    var o = overlayEl();
    var body = '';
    if (state.step === 'passcode') {
      body = headHTML('تفعيل الجهاز',
        'الجهاز ده مش مفعّل. اطلب كلمة المرور التشغيلية من المسؤول (صلاحيتها 5 دقائق) وابدأ التفعيل.') +
        deviceBoxHTML() +
        '<label class="dev-act__field"><span>كلمة المرور التشغيلية (6 أرقام)</span>' +
          '<div class="dev-act__pw">' +
            '<input type="password" id="daPass" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" />' +
            '<button type="button" class="dev-act__eye" id="daEye" aria-label="إظهار كلمة المرور">👁</button>' +
          '</div>' +
        '</label>' +
        '<p class="dev-act__err" id="daErr" ' + (state.lastError ? '' : 'hidden') + '>' + esc(state.lastError) + '</p>' +
        '<button type="button" class="btn btn--primary dev-act__btn" id="daNext">' + (state.busy ? 'جارٍ التحقق…' : 'متابعة') + '</button>' +
        '<button type="button" class="dev-act__link" id="daRetry">إعادة المحاولة / تحديث الحالة</button>';
    } else {
      body = headHTML('كود التفعيل',
        'تمام — كلمة المرور مقبولة. اكتب كود التفعيل المخصّص للجهاز ده (8 أرقام) اللي أصدره المسؤول.') +
        deviceBoxHTML() +
        '<label class="dev-act__field"><span>كود التفعيل</span>' +
          '<input type="text" id="daCode" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="********" dir="ltr" />' +
        '</label>' +
        '<p class="dev-act__err" id="daErr" ' + (state.lastError ? '' : 'hidden') + '>' + esc(state.lastError) + '</p>' +
        '<button type="button" class="btn btn--primary dev-act__btn" id="daGo">' + (state.busy ? 'جارٍ التفعيل…' : 'تفعيل الجهاز') + '</button>' +
        '<button type="button" class="dev-act__link" id="daBack">رجوع لكلمة المرور</button>';
    }
    o.innerHTML = body + '</div>';
    wire();
  }

  function setErr(msg) {
    state.lastError = msg || '';
    var box = document.getElementById('daErr');
    if (box) { box.textContent = state.lastError; box.hidden = !state.lastError; }
  }

  function wire() {
    var copy = document.getElementById('daCopyId');
    if (copy) copy.addEventListener('click', function () { copyText(deviceId()); });

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
      code.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
      });
      try { code.focus(); } catch (e) {}
    }
    var back = document.getElementById('daBack');
    if (back) back.addEventListener('click', function () {
      state.step = 'passcode';
      state.lastError = '';
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
    state.passcode = pass;
    setErr('');
    render();
    var pass2 = pass;
    callApi('request', {
      device: deviceId(),
      name: state.deviceName || platformName(),
      passcode: pass2
    }, 'POST').then(function (d) {
      state.busy = false;
      if (!d.ok) {
        state.step = 'passcode';
        render();
        return setErr(d.error || 'تعذّر التحقق');
      }
      state.step = 'code';
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
    if (code.length !== 8) return setErr('كود التفعيل 8 أرقام');
    var pass = state.passcode;
    if (!pass) { state.step = 'passcode'; render(); return setErr('ابدأ بكلمة المرور التشغيلية'); }
    state.busy = true;
    setErr('');
    render();
    callApi('verify', { device: deviceId(), passcode: pass, code: code }, 'POST').then(function (d) {
      state.busy = false;
      if (!d.ok) {
        render();
        return setErr(d.error || 'تعذّر التفعيل');
      }
      state.activated = true;
      state.enforced = true;
      state.known = true;
      writeCache({ activated: true, enforced: true, at: Date.now(), device: deviceId() });
      closeOverlay();
      toastSafe('تم تفعيل الجهاز ✓');
      adminPanel();
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
      state.known = true;
      if (d.available === false) {
        state.available = false;
        state.enforced = false;
        state.activated = false;
        writeCache({ enforced: false, available: false });
        closeOverlay();
        return state;
      }
      state.available = true;
      state.enforced = !!d.enforced;
      state.activated = !!d.activated;
      writeCache({ enforced: state.enforced, activated: state.activated, available: true });
      if (state.enforced && !state.activated) {
        state.step = 'passcode';
        render();
      } else {
        closeOverlay();
      }
      return state;
    }, function (e) {
      /* الخادم مش متاح: ما نقفلش جهاز كان مفعّل، ومما نمنحش تفعيلاً */
      state.known = false;
      state.available = false;
      if (cached.enforced === true && cached.activated !== true) {
        state.enforced = true;
        state.activated = false;
        state.step = 'passcode';
        if (showErrors) state.lastError = 'تعذّر الاتصال بالخادم — تأكد من الإنترنت وحاول تاني';
        render();
      } else {
        closeOverlay();
      }
      return state;
    });
  }

  /* ---------- لوحة الأدمن في الإعدادات ---------- */
  function panelNote(html) {
    return '<p class="panel__note">' + html + '</p>';
  }

  function adminPanel() {
    var view = document.getElementById('view-settings');
    if (!view) return;
    var old = document.getElementById('activationAdminPanel');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'activationAdminPanel';
    panel.setAttribute('style', 'grid-column:1/-1');
    panel.innerHTML =
      '<h3 class="panel__title">🔐 تفعيل الأجهزة</h3>' +
      '<p class="panel__hint">خدمة تحقق مركزية واحدة: كل جهاز بياخد كود تفعيل مخصّص له، والمسؤول يقدر يلغيه في أي وقت. ' +
      'الكود بيتحقق منه على الخادم فقط — مفيش أي مفاتيح أو أسرار في المتصفح.</p>' +
      '<div id="activationAdminBody">' + panelNote('جارٍ تحميل حالة الخدمة…') + '</div>';
    view.appendChild(panel);
    loadAdmin();
  }

  function loadAdmin() {
    var box = document.getElementById('activationAdminBody');
    if (!box) return;
    callApi('devices', null, 'GET').then(function (d) {
      box = document.getElementById('activationAdminBody');
      if (!box) return;
      if (d.available === false) {
        box.innerHTML = panelNote('⚠️ ' + esc(d.error || 'خدمة التفعيل المشتركة غير متاحة على هذا النشر.'));
        return;
      }
      if (!d.ok) {
        box.innerHTML = panelNote('لوحة التفعيل متاحة لحسابات الإدارة المربوطة بـ Google فقط.');
        return;
      }
      renderAdmin(d);
    }, function (e) {
      box = document.getElementById('activationAdminBody');
      if (box) box.innerHTML = panelNote('⚠️ تعذّر تحميل حالة التفعيل: ' + esc(e.message || ''));
    });
  }

  function fmtDate(v) {
    var s = String(v || '');
    if (!s) return '—';
    try {
      var d = new Date(s);
      if (isNaN(d.getTime())) return s;
      var p = function (n) { return ('0' + n).slice(-2); };
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return s; }
  }

  var STATUS_LABEL = {
    active: 'مفعّل',
    pending: 'بانتظار الكود',
    revoked: 'ملغي',
    none: 'غير مسجّل'
  };

  function renderAdmin(d) {
    var box = document.getElementById('activationAdminBody');
    if (!box) return;
    var rows = (d.devices || []).map(function (dev) {
      var st = STATUS_LABEL[dev.status] || dev.status;
      return '<tr data-dev="' + esc(dev.device) + '">' +
        '<td><code dir="ltr" style="font-size:.75rem">' + esc(dev.device) + '</code>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + esc(dev.device) + '">نسخ</button></td>' +
        '<td>' + esc(dev.name || '—') + '</td>' +
        '<td>' + esc(st) + '</td>' +
        '<td>' + esc(fmtDate(dev.activatedAt || dev.lastSeen)) + '</td>' +
        '<td class="activation-actions">' +
          (dev.status === 'revoked'
            ? '<span class="panel__note" style="margin:0">أعد إصدار كود لتفعيله من جديد</span>'
            : '') +
          '<button type="button" class="btn btn--primary btn--sm" data-issue="' + esc(dev.device) + '">إصدار كود</button>' +
          (dev.status === 'active'
            ? '<button type="button" class="btn btn--ghost btn--sm" data-revoke="' + esc(dev.device) + '">إلغاء التفعيل</button>'
            : '') +
        '</td>' +
        '</tr>';
    }).join('');

    box.innerHTML =
      '<label class="switch-row">' +
        '<input type="checkbox" id="activationEnforce"' + (d.enforced ? ' checked' : '') + ' />' +
        '<span class="switch-row__box"><i></i></span>' +
        '<span class="switch-row__text"><b>طلب تفعيل الأجهزة</b>' +
        '<small>' + (d.enforced ? 'مفعّل — أي جهاز جديد يفضل مقفول لحد ما يتفعّل بكود' : 'متوقف — التطبيق بيفتح عادي على كل الأجهزة') + '</small></span>' +
      '</label>' +
      '<div class="form__actions" style="margin:14px 0">' +
        '<button type="button" class="btn btn--primary" id="activationPass">إصدار كلمة مرور تشغيلية (5 دقائق)</button>' +
        '<button type="button" class="btn btn--ghost" id="activationReload">تحديث القائمة</button>' +
      '</div>' +
      '<div id="activationPassBox" hidden></div>' +
      '<div class="table-wrap" style="margin-top:10px">' +
        '<table class="table"><thead><tr><th>الجهاز</th><th>الاسم</th><th>الحالة</th><th>آخر نشاط</th><th>إجراءات</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5">مفيش أجهزة مسجّلة لسه.</td></tr>') + '</tbody></table>' +
      '</div>' +
      panelNote('ترتيب التفعيل: المسؤول يصدر كلمة مرور تشغيلية ← المستخدم يكتبها وياخد معرّف الجهاز ← المسؤول يصدر كود للجهاز ده ← المستخدم يكتب الكود ويتفتح التطبيق.');

    var enforce = document.getElementById('activationEnforce');
    if (enforce) enforce.addEventListener('change', function () {
      var on = !!enforce.checked;
      enforce.disabled = true;
      callApi('enforce', { enabled: on }, 'POST').then(function (r) {
        enforce.disabled = false;
        if (!r.ok) { enforce.checked = !on; toastSafe(r.error || 'تعذّر الحفظ'); return; }
        toastSafe(on ? 'تم طلب تفعيل الأجهزة' : 'تم إيقاف طلب التفعيل');
        loadAdmin();
      }, function () {
        enforce.disabled = false;
        enforce.checked = !on;
        toastSafe('تعذّر الاتصال بالخادم');
      });
    });

    var passBtn = document.getElementById('activationPass');
    if (passBtn) passBtn.addEventListener('click', function () {
      passBtn.disabled = true;
      callApi('passcode', {}, 'POST').then(function (r) {
        passBtn.disabled = false;
        if (!r.ok) { toastSafe(r.error || 'تعذّر إصدار كلمة المرور'); return; }
        var pb = document.getElementById('activationPassBox');
        if (!pb) return;
        pb.hidden = false;
        pb.innerHTML = '<div class="dev-act__issued">' +
          '<div>كلمة المرور التشغيلية <b>صالحها 5 دقائق فقط</b>:</div>' +
          '<div class="dev-act__code" dir="ltr">' + esc(r.passcode) + '</div>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="activationPassCopy">نسخ</button>' +
          '<p class="panel__note" style="margin:8px 0 0">اكتبها للمستخدم اللي عايز يفعّل جهازه، وخلّيه يبدأ فورًا قبل انتهاء الخمس دقايق.</p>' +
          '</div>';
        var c = document.getElementById('activationPassCopy');
        if (c) c.addEventListener('click', function () { copyText(r.passcode); });
      }, function () {
        passBtn.disabled = false;
        toastSafe('تعذّر الاتصال بالخادم');
      });
    });

    var reload = document.getElementById('activationReload');
    if (reload) reload.addEventListener('click', function () { loadAdmin(); });

    Array.prototype.forEach.call(box.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () { copyText(b.getAttribute('data-copy')); });
    });

    Array.prototype.forEach.call(box.querySelectorAll('[data-issue]'), function (b) {
      b.addEventListener('click', function () {
        var dev = b.getAttribute('data-issue');
        b.disabled = true;
        callApi('issue', { device: dev }, 'POST').then(function (r) {
          b.disabled = false;
          if (!r.ok) { toastSafe(r.error || 'تعذّر إصدار الكود'); return; }
          var pb = document.getElementById('activationPassBox');
          if (pb) {
            pb.hidden = false;
            pb.innerHTML = '<div class="dev-act__issued">' +
              '<div>كود تفعيل الجهاز <code dir="ltr">' + esc(dev) + '</code> (صالح 24 ساعة، ولمرة واحدة):</div>' +
              '<div class="dev-act__code" dir="ltr">' + esc(r.code) + '</div>' +
              '<button type="button" class="btn btn--ghost btn--sm" id="activationCodeCopy">نسخ</button>' +
              '</div>';
            var c = document.getElementById('activationCodeCopy');
            if (c) c.addEventListener('click', function () { copyText(r.code); });
            try { pb.scrollIntoView({ block: 'nearest' }); } catch (e) {}
          }
          loadAdmin();
        }, function () {
          b.disabled = false;
          toastSafe('تعذّر الاتصال بالخادم');
        });
      });
    });

    Array.prototype.forEach.call(box.querySelectorAll('[data-revoke]'), function (b) {
      b.addEventListener('click', function () {
        var dev = b.getAttribute('data-revoke');
        if (typeof window.confirm === 'function' &&
            !window.confirm('إلغاء تفعيل الجهاز ده؟ هيتقفل عند أول تحقق من الخادم.')) return;
        b.disabled = true;
        callApi('revoke', { device: dev }, 'POST').then(function (r) {
          b.disabled = false;
          toastSafe(r.ok ? 'تم إلغاء تفعيل الجهاز' : (r.error || 'تعذّر الإلغاء'));
          if (r.ok) loadAdmin();
        }, function () {
          b.disabled = false;
          toastSafe('تعذّر الاتصال بالخادم');
        });
      });
    });
  }

  /* ---------- التشغيل ---------- */
  function start() {
    state.deviceName = platformName();
    refresh(false);
    /* إعادة التحقق عند الرجوع للتطبيق، وكل 10 دقايق وهو مفتوح */
    try {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refresh(false);
      });
      setInterval(function () { if (!document.hidden) refresh(false); }, 10 * 60 * 1000);
    } catch (e) {}

    /* لوحة الإعدادات بتتبني ديناميكيًا — نضيفها مع فتح الإعدادات */
    [1200, 3000].forEach(function (ms) { setTimeout(function () { try { adminPanel(); } catch (e) {} }, ms); });
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-go="settings"]');
      if (b) setTimeout(function () { try { adminPanel(); } catch (e2) {} }, 80);
    }, true);
  }

  window.__deviceActivation = {
    refresh: refresh,
    state: state,
    deviceId: deviceId,
    panel: adminPanel
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
