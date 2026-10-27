/* ============================================================
   auth-gate-addon.js — بعد ربط Google: جلب البيانات من المجلد العام
   وحفظ رابط المجلد الذي يضيفه المستخدم في شاشة الربط
   ============================================================ */
(function () {
  'use strict';

  var ADMIN_EMAIL = 'gstsyusudg@gmail.com';
  var input = document.getElementById('forceFolderUrl');

  /* استعادة الرابط المحفوظ */
  try {
    var saved = localStorage.getItem('app_shared_folder_url') || '';
    if (input && saved) input.value = saved;
  } catch (e) {}

  /* حفظ الرابط عند الكتابة */
  if (input) {
    input.addEventListener('input', function () {
      try { localStorage.setItem('app_shared_folder_url', input.value.trim()); } catch (e) {}
    });
  }

  function toastMsg(text) {
    try {
      var t = document.getElementById('toast');
      if (!t) return;
      t.querySelector('span').textContent = text;
      t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); }, 2400);
    } catch (e) {}
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

  /* بعد نجاح الربط والعودة للصفحة (?g=ok) — اسحب البيانات */
  if (/[?&]g=ok/.test(location.search)) {
    setTimeout(pullShared, 800);
  }
})();