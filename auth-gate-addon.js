/* ============================================================
   auth-gate-addon.js — وضع المشاهد (حساب غير مصرح له)
   ------------------------------------------------------------
   غير gstsyusudg@gmail.com  →  مشاهد فقط:
     • تُخفى أزرار الإضافة/التعديل/الحذف/الحفظ/الرفع/التصدير
     • يُمنع النقر عليها حتى لو ظهرت (منع من طبقة الأعلى)
     • تُمنع إرسال أي نموذج (Enter أو زر حفظ)
   gstsyusudg@gmail.com  →  صلاحيات كاملة (تعديل/حذف/إضافة)
   + استعادة رابط المجلد العام وسحب البيانات بعد الربط
   ============================================================ */
(function () {
  'use strict';

  var ADMIN_EMAIL = 'gstsyusudg@gmail.com';
  var VIEWER = false;

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
    '[data-export]', '[data-upload]', '.switch-row'
  ].join(',');

  var BLOCK_ATTR = ['data-add', 'data-del', 'data-edit', 'data-delete',
    'data-del-profit', 'data-save', 'data-new', 'data-push', 'data-export', 'data-upload'];

  var SEL_ALLOW_ATTR = ['data-key', 'data-close', 'data-partner-profile', 'data-profile'];

  function toastMsg(text) {
    try {
      var t = document.getElementById('toast');
      if (!t) return;
      t.querySelector('span').textContent = text;
      t.classList.add('show');
      clearTimeout(toastMsg._t);
      toastMsg._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
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
      if (sensitive(el)) continue;
      if (el.style.display !== 'none') el.style.display = 'none';
    }
    var btns = document.querySelectorAll('button, label.btn, label[for], input[type="file"]');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      if (blocked(b) && !sensitive(b) && b.style.display !== 'none') b.style.display = 'none';
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
  function applyViewer() {
    if (VIEWER) return;
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
  }

  /* ---------- رابط المجلد العام ---------- */
  var input = document.getElementById('forceFolderUrl');
  try {
    var saved = localStorage.getItem('app_shared_folder_url') || '';
    if (input && saved) input.value = saved;
  } catch (e) {}
  if (input) {
    input.addEventListener('input', function () {
      try { localStorage.setItem('app_shared_folder_url', input.value.trim()); } catch (e) {}
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

  /* ---------- تحديد الدور ----------
     القاعدة: «المُصرَّح به» = gstsyusudg@gmail.com وهو متصل فقط.
     أي حساب آخر، أو فصل الربط، أو تعذّر التأكد → وضع المشاهد. */
  if (typeof fetch === 'function') {
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (s) {
        var connected = !!(s && s.connected);
        var email = connected ? String(s.email || '').trim().toLowerCase() : '';
        var isAdmin = connected && email === ADMIN_EMAIL;
        try {
          localStorage.setItem('app_user_email', email);
          localStorage.setItem('app_user_role', isAdmin ? 'admin' : 'viewer');
        } catch (e) {}
        if (!isAdmin) applyViewer();   /* غير المصرح له أو مفصول الربط = مشاهد */
        if (connected && /[?&]g=ok/.test(location.search)) setTimeout(pullShared, 700);
      })
      .catch(function () { applyViewer(); });   /* تعذّر التأكد = مشاهد */
  }

  /* فصل الربط أثناء الجلسة → يبقى مشاهداً فوراً */
  document.addEventListener('click', function (e) {
    var d = e.target && e.target.closest && e.target.closest('#driveDisconnect');
    if (d) applyViewer();
  }, true);
})();