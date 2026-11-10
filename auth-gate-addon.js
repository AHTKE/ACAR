/* ============================================================
   auth-gate-addon.js — وضع المشاهد (حساب غير مصرح له)
   ------------------------------------------------------------
   غير حسابات المسؤول (gstsyusudg@gmail.com / mahmoed181186@gmail.com) → مشاهد فقط:
     • تُخفى أزرار الإضافة/التعديل/الحذف/الحفظ/الرفع/التصدير
     • يُمنع النقر عليها حتى لو ظهرت (منع من طبقة الأعلى)
     • تُمنع إرسال أي نموذج (Enter أو زر حفظ)
   حسابات المسؤول  →  صلاحيات كاملة (تعديل/حذف/إضافة)
   + استعادة رابط المجلد العام وسحب البيانات بعد الربط
   ============================================================ */
(function () {
  'use strict';

  /* حسابات المسؤول — كلهم صلاحيات كاملة، وأي حساب تاني متصل يبقى مشاهد */
  var ADMIN_EMAILS = ['gstsyusudg@gmail.com', 'mahmoed181186@gmail.com'];
  var ADMIN_EMAIL = ADMIN_EMAILS[0];
  function isAdminEmail(e) {
    return ADMIN_EMAILS.indexOf(String(e || '').trim().toLowerCase()) > -1;
  }
  var VIEWER = false;
  /* بيئات موثوقة: نسخة سطح المكتب (Electron) أو الأندرويد المدمجة (Capacitor).
     هي جهاز المالك نفسه، فالصلاحيات كاملة فوراً بدون أي طلب شبكة — أسرع إقلاع. */
  var TRUSTED = false;
  try {
    TRUSTED = (window.APP_TRUSTED_RUNTIME === true) ||
      (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) {}

  /* نصوص الأزرار المحظورة على المشاهد (وراء دفع/تحصيل أفعال مثل «تسجيل دفع») */
  var BLOCK_RE = /إضافة|إضافه|تعديل|حذف|حذف الكل|مسح|حفظ|رفع|تصدير|تحميل|دفع|تحصيل|فصل|استرجاع|استرداد|أرباح|ارباح|إدخال|تنفيذ|إرسال|ارسال|مزامنة|استعادة|إرجاع|تغيير|إفراغ|ترحيل/;

  /* أزرار مسموح بها للمشاهد (تصفح فقط) */
  var ALLOW_RE = /البروفايل|بروفايل|عرض|كشف|رجوع|مشاهدة|فتح|التفاصيل|رجوع للرئيسية/;

  var SEL_BLOCK = [
    'button[type="submit"]',
    'input[type="file"]',
    'label.btn',
    '[data-add]', '[data-del]', '[data-edit]', '[data-delete]',
    '[data-del-profit]', '[data-save]', '[data-new]', '[data-push]',
    '[data-export]', '[data-upload]', '.switch-row',
    '#opsUndoLast', '#opsClear'
  ].join(',');

  var BLOCK_ATTR = ['data-add', 'data-del', 'data-edit', 'data-delete',
    'data-del-profit', 'data-save', 'data-new', 'data-push', 'data-export', 'data-upload', 'data-cf-del',
    'data-undo-op', 'data-clear-ops'];

  var SEL_ALLOW_ATTR = ['data-key', 'data-close', 'data-partner-profile', 'data-profile'];

  function toastMsg(text) {
    try {
      /* نستخدم إشعار التطبيق الموحّد (زر × + اختفاء بعد 15 ثانية)
         بدل نسخة تانية بتختفي بعد 2.4 ثانية بدون زر إغلاق */
      if (typeof window.toast === 'function') { window.toast(text); return; }
      var t = document.getElementById('toast');
      if (!t) return;
      t.querySelector('span').textContent = text;
      t.classList.add('show');
      clearTimeout(toastMsg._t);
      toastMsg._t = setTimeout(function () { t.classList.remove('show'); }, 15000);
    } catch (e) {}
  }

  function btnText(el) {
    if (!el) return '';
    return ((el.textContent || '') + ' ' +
      (el.getAttribute ? (el.getAttribute('title') || '') : '') + ' ' +
      (el.getAttribute ? (el.getAttribute('aria-label') || '') : ''));
  }

  /* أزرار مسموح بها للمشاهد (تصفح فقط: تنقّل، توسيع، رجوع) */
  function allowed(el) {
    if (!el) return false;
    /* أزرار الربط بجوجل (شاشة البدء ولوحة الإعدادات) تبقى ظاهرة وعملياً للجميع */
    if (el.id === 'gateConnect' || el.id === 'driveConnect' || el.id === 'viewerDriveBtn') return true;
    if (el.tagName === 'A' && String(el.getAttribute('href') || '').indexOf('/api/google/login') === 0) return true;
    if (el.classList && (el.classList.contains('chev') || el.classList.contains('back-btn'))) return true;
    for (var i = 0; i < SEL_ALLOW_ATTR.length; i++) {
      if (el.hasAttribute && el.hasAttribute(SEL_ALLOW_ATTR[i])) return true;
    }
    var txt = btnText(el);
    if (ALLOW_RE.test(txt)) return true;
    /* بطاقة تنقّل عادية (ليست إضافة/تعديل/حذف) */
    if (el.hasAttribute && el.hasAttribute('data-go') && !BLOCK_RE.test(txt)) return true;
    return false;
  }

  /* زر محظور على المشاهد؟ */
  function blocked(el) {
    if (!el) return false;
    if (allowed(el)) return false;
    var txt = btnText(el);
    /* بطاقة تنقّل بين الأقسام: تُحجب فقط لو بوابة إضافة/تعديل/حذف — لا نمنع الوصول للقسم */
    if (el.hasAttribute && el.hasAttribute('data-go')) return HARD_RE.test(txt);
    if (BLOCK_RE.test(txt)) return true;
    if (el.type === 'submit') return true;
    if (el.tagName === 'INPUT' && el.type === 'file') return true;
    if (el.classList && el.classList.contains('switch-row')) return true;
    for (var i = 0; i < BLOCK_ATTR.length; i++) {
      if (el.hasAttribute && el.hasAttribute(BLOCK_ATTR[i])) return true;
    }
    /* أي زر داخل نموذج = زر حفظ */
    if (el.tagName === 'BUTTON' && el.form) return true;
    return false;
  }

  /* الاستثناءات الحسّاسة: لا تُخفى — تبقى ظاهرة لكتمان التبويب وتُمنع بالمنع عند النقر فقط */
  var SENSITIVE_RE = /تحميل|تصدير|رفع|مزامنة|دفع|تحصيل/;
  var HARD_RE = /إضافة|إضافه|تعديل|حذف|مسح|حفظ/;
  function sensitive(el) {
    var t = btnText(el);
    if (HARD_RE.test(t)) return false;   /* «إضافة/تعديل/حذف» تُخفى مهما كان بقية نصها */
    return SENSITIVE_RE.test(t);
  }

  /* ---------- إخفاء العناصر المحظورة (مع مراقبة التغييرات) ---------- */
  function hideControls() {
    if (!VIEWER) return;
    var els = document.querySelectorAll(SEL_BLOCK);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // Keep drive connect buttons visible for all users (gate + settings)
      if (el.id && (el.id === 'driveConnect' || el.id === 'gateConnect')) continue;
      if (sensitive(el)) continue;
      if (el.style.display !== 'none') {
        el.style.display = 'none';
        try { el.setAttribute('data-viewer-hidden', '1'); } catch (e0) {}
      }
    }
    var btns = document.querySelectorAll('button, label.btn, label[for], input[type="file"]');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      if (blocked(b) && !sensitive(b) && b.style.display !== 'none') {
        b.style.display = 'none';
        try { b.setAttribute('data-viewer-hidden', '1'); } catch (e1) {}
      }
    }
  }

  /* ---------- استعادة التبويب المُغلق (وضع مشاهد مستقر — منع فقط دون إخفاء) ---------- */
  function restoreTabs() {
    if (!VIEWER) return;
    var hidden = document.querySelectorAll('[data-tab-btn]');
    for (var i = 0; i < hidden.length; i++) {
      if (hidden[i].style.display === 'none') hidden[i].style.display = '';
    }
  }

  /* ---------- المنع عند النقر (طبقة الأعلى — قبل أي معالج في التطبيق) ---------- */
  document.addEventListener('click', function (e) {
    if (!VIEWER) return;
    var t = e.target;
    if (!t || !t.closest) return;
    /* زر إغلاق الإشعار ليس إجراءً على التطبيق — لا تعيد فتح الإشعار */
    if (t.closest('#toast, #toastClose, .toast__x')) return;
    var el = t.closest('button, label, input[type="file"], .switch-row, [data-add], [data-del], [data-edit], [data-delete], [data-save], [data-push]');
    if (!el || !blocked(el)) return;
    e.preventDefault();
    e.stopPropagation();
    toastMsg('حساب مشاهد فقط — الإضافة والتعديل والحذف غير مسموحين');
  }, true);

  /* ---------- منع إرسال أي نموذج ---------- */
  document.addEventListener('submit', function (e) {
    if (!VIEWER) return;
    e.preventDefault();
    e.stopPropagation();
    toastMsg('حساب مشاهد فقط — لا يمكن الحفظ أو التعديل');
  }, true);

  /* ---------- تفعيل وضع المشاهد ---------- */
  /* ---------- تطبيق أحدث نسخة تلقائياً للمشاهد ---------- */
  var autoPullTimer = null;
  function startAutoPull() {
    try { localStorage.setItem('app_sync_policy', 'auto'); } catch (e) {}
    if (autoPullTimer) return;
    autoPullTimer = setInterval(function () {
      try { if (typeof window.syncCheck === 'function') window.syncCheck(true); } catch (e) {}
    }, 60 * 1000);
    setTimeout(function () {
      try { if (typeof window.syncCheck === 'function') window.syncCheck(true); } catch (e) {}
    }, 1200);
  }

  var driveConnected = false;
  function renderViewerBar() {
    var bar = document.getElementById('viewerDriveBar');
    if (bar) bar.style.display = 'flex';
    var btn = document.getElementById('viewerDriveBtn');
    if (btn) {
      btn.textContent = driveConnected ? 'تحديث البيانات الآن من جوجل درايف' : 'ربط حساب Google Drive';
      btn.onclick = function () {
        if (!driveConnected) {
          if (typeof window.startGoogleLogin === 'function') { window.startGoogleLogin(); return; }
          window.location.href = '/api/google/login'; return;
        }
        try { if (typeof window.syncCheck === 'function') window.syncCheck(false); } catch (e) {}
      };
    }
    var txt = document.getElementById('viewerDriveText');
    if (txt) {
      txt.textContent = driveConnected
        ? 'وضع المشاهد — أحدث نسخة تُطبَّق تلقائياً كل دقيقة'
        : 'وضع المشاهد — اربط حساب Google لعرض البيانات ومتابعة أحدث نسخة';
    }
  }

  function applyViewer(connected) {
    driveConnected = !!connected;
    if (VIEWER) { renderViewerBar(); return; }
    VIEWER = true;
    document.documentElement.setAttribute('data-viewer-mode', '1');
    try { localStorage.setItem('app_user_role', 'viewer'); } catch (e) {}
    hideControls();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { hideControls(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
    /* تطبيقات متتالية للعناصر التي تظهر لاحقاً (بدون مؤقت لا نهائي يعلّق الاختبارات) */
    [600, 1500, 3000, 6000].forEach(function (ms) { setTimeout(hideControls, ms); });
    [600, 1500, 3000, 6000].forEach(function (ms) { setTimeout(restoreTabs, ms); });
    setTimeout(function () {
      toastMsg('أنت داخل بحساب مشاهد — تصفح فقط بدون إضافة أو تعديل');
    }, 900);
    renderViewerBar();
    startAutoPull();
  }

  /* ---------- رسالة فشل الربط + فحص المفاتيح على شاشة البدء ---------- */
  (function () {
    var qs = String((typeof location !== 'undefined' && location.search) || '');
    var mm = qs.match(/[?&]m=([^&]*)/);
    var box = document.getElementById('gateError');
    var saved = (typeof window !== 'undefined' && window.__googleOAuth) ? window.__googleOAuth : null;
    var msg = mm ? mm[1] : '';
    if (msg) { try { msg = decodeURIComponent(msg.replace(/\+/g, ' ')); } catch (e) {} }
    else if (saved && saved.g === 'err' && saved.m) msg = String(saved.m);
    if (box && msg) {
      box.textContent = msg;
      box.style.display = 'block';
    }
    var diagBtn = document.getElementById('gateDiag');
    var diagBox = document.getElementById('gateDiagBox');
    if (diagBtn && diagBox) {
      diagBtn.addEventListener('click', function () {
        if (typeof window.runGoogleCheck === 'function') {
          window.runGoogleCheck(diagBtn, diagBox);
          return;
        }
        diagBox.style.display = 'block';
        diagBox.textContent = 'جارٍ الفحص…';
        fetch('/api/google/check', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            diagBox.innerHTML = typeof window.renderGoogleDiag === 'function'
              ? window.renderGoogleDiag(j)
              : ('نتيجة الفحص: ' + (j && j.verdict ? j.verdict : 'غير معروفة'));
          })
          .catch(function () {
            diagBox.textContent = 'تعذّر الوصول لمسار الفحص /api/google/check — تأكد إن مجلد api/ منشور على نفس الدومين.';
          });
      });
    }
  })();

  /* ---------- رابط المجلد العام ---------- */
  var input = document.getElementById('forceFolderUrl');
  try {
    var saved = localStorage.getItem('app_sync_custom_folder') ||
      localStorage.getItem('app_shared_folder_url') || '';
    if (input && saved) input.value = saved;
  } catch (e) {}
  if (input) {
    input.addEventListener('input', function () {
      var v = input.value.trim();
      try {
        localStorage.setItem('app_shared_folder_url', v);
        /* نفس الرابط بيظهر في إعدادات المزامنة — نحفظه في المفتاحين
           عشان المستخدم ما يضطرش يلصقه مرتين. */
        localStorage.setItem('app_sync_custom_folder', v);
      } catch (e) {}
    });
  }

  function pullShared() {
    try {
      if (typeof window.syncApi !== 'function') return;
      window.syncApi('/api/sync/pull').then(function (pull) {
        if (pull && pull.ok && pull.snapshot && typeof window.syncApply === 'function') {
          window.syncApply(pull.snapshot).then(function () {
            try {
              if (typeof renderCustomers === 'function') renderCustomers();
              if (typeof renderHomeStats === 'function') renderHomeStats();
            } catch (e) {}
            toastMsg('تم تحميل البيانات من المجلد العام ✓');
          }).catch(function () {});
        }
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- تحديد الدور (سريع: يبدأ من الكاش — بدون شاشة انتظار أو «إعادة المحاولة»)
     القاعدة: «المُصرَّح به» = gstsyusudg@gmail.com وهو متصل فقط.
     الاستضافة أحياناً ما ترجع 502 لطلبات /api — فمكان ما نعرض شاشة
     إعادة المحاولة فوراً، نعيد التحقق بهدوء 3 مرات وبنيتها سريعة، ولو
     كان في كاش «مُصرَّح له» نكمل به بدلاً من تغيّر المالك النجيب. */
  var ROLE_CACHE_KEY = 'app_role_cache';
  function roleFromCache() {
    try {
      var c = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || 'null');
      if (c && c.role === 'admin' && isAdminEmail(c.email)) return c;
    } catch (e) {}
    return null;
  }
  function applyAdminFast() {
    document.documentElement.removeAttribute('data-viewer-mode');
    var bar = document.getElementById('viewerDriveBar');
    if (bar) bar.style.display = 'none';
  }

  /* رجّع أي زر خفيناه في وضع المشاهد (لو الدور اتغيّر في نفس الجلسة) */
  function restoreAllControls() {
    try {
      var els = document.querySelectorAll('[data-viewer-hidden]');
      for (var i = 0; i < els.length; i++) {
        els[i].style.display = '';
        els[i].removeAttribute('data-viewer-hidden');
      }
    } catch (e) {}
  }

  /* وضع المالك المحلي:
     التطبيق كل بياناته على الجهاز نفسه، وعدم ربط Google Drive مش سبب
     نقفل الكتابة — القفل ده هو اللي كان بيحوّل التطبيق لقراءة فقط
     على أي جلسة جديدة (status = غير متصل). القفل يبقى فقط لو فيه
     حساب Google متصل فعلاً ومش المالك. */
  function applyAdminLocal() {
    VIEWER = false;
    document.documentElement.removeAttribute('data-viewer-mode');
    var bar = document.getElementById('viewerDriveBar');
    if (bar) bar.style.display = 'none';
    try { localStorage.setItem('app_user_role', 'admin'); } catch (e) {}
    restoreAllControls();
  }
  if (typeof fetch === 'function') {
    if (TRUSTED) {
      /* نبدأ مالكًا محليًا فورًا (الجهاز جهازك)، لكن لا نعود قبل قراءة
         حالة Google: لو الحساب المربوط مش من حسابات الإدارة لازم يظهر
         «مشاهد» ويتقفل عليه التعديل. */
      applyAdminFast();
      try { localStorage.setItem('app_user_role', 'admin'); } catch (e) {}
    }
    var cachedRole = roleFromCache();
    var checkTries = 0;
    function verifyRole() {
      fetch('/api/google/status', { credentials: 'same-origin' })
        .then(function (r) { if (r.ok === false) throw new Error('status ' + r.status); return r.json(); })
        .then(function (s) {
          var connected = !!(s && s.connected);
          var email = connected ? String(s.email || '').trim().toLowerCase() : '';
          var isAdmin = connected && isAdminEmail(email);
          try {
            localStorage.setItem('app_user_email', email);
            localStorage.setItem('app_user_role', isAdmin ? 'admin' : 'viewer');
            if (isAdmin) localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ email: email, role: 'admin', ts: Date.now() }));
            else localStorage.removeItem(ROLE_CACHE_KEY);
          } catch (e) {}
          if (isAdmin) applyAdminFast();
          else if (connected) applyViewer(true);   /* حساب تاني متصل → مشاهد */
          else applyAdminLocal();                   /* مش مربوط = مالك محلي، الكتابة مسموحة */
          try {
            window.dispatchEvent(new CustomEvent('nizam:role', {
              detail: { role: isAdmin ? 'admin' : (connected ? 'viewer' : 'local'), email: email, connected: connected }
            }));
          } catch (eR) {}
          if (connected && /[?&]g=ok/.test(location.search)) setTimeout(pullShared, 700);
        })
        .catch(function () {
          checkTries++;
          if (checkTries < 3) { setTimeout(verifyRole, checkTries === 1 ? 600 : 1200); return; }
          if (roleFromCache()) {
            applyAdminFast();
            try { localStorage.setItem('app_user_role', 'admin'); } catch (e) {}
          } else {
            applyAdminLocal();   /* تعذّر الفحص مش معناه منع الكتابة */
          }
        });
    }
    if (cachedRole) { applyAdminFast(); try { localStorage.setItem('app_user_role', 'admin'); } catch (e) {} }
    verifyRole();
  }

  /* فصل الربط أثناء الجلسة → يبقى مشاهداً فوراً */
  document.addEventListener('click', function (e) {
    var d = e.target && e.target.closest && e.target.closest('#driveDisconnect');
    /* مشاهد فاصل الربط يفضل مشاهد (مايترقّاش لمالك بالفصل)،
       والمالك المحلي يفضل مالك. */
    if (d) { if (VIEWER) applyViewer(false); else applyAdminLocal(); }
  }, true);
})();