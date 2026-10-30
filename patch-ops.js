/* ============================================================
   patch-ops.js — حماية البيانات + سجل «العمليات» مع التراجع
                 + فحص مسار ربط Google قبل الانتقال
   يشغّل: node patch-ops.js
   ============================================================ */
'use strict';
const fs = require('fs');
const FILE = 'app.js';
let src = fs.readFileSync(FILE, 'utf8');
let count = 0;

function rep(oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error('✗ لم يُعثر على المرساة: ' + (label || oldStr.slice(0, 60)));
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error('✗ المرساة مكررة: ' + (label || oldStr.slice(0, 60)));
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  count++;
}

/* 1) تسجيل الشاشة + قفلها بكلمة المرور */
rep(`    'member-profile': 'بروفايل عضو الجمعية'
  };`,
`    'member-profile': 'بروفايل عضو الجمعية',
    operations: 'العمليات'
  };`, 'SECTION_NAMES');

rep(`  var PROTECTED = {
    collection: 'التحصيل',
    partners: 'الشركاء',
    associations: 'جمعيات'
  };`,
`  var PROTECTED = {
    collection: 'التحصيل',
    partners: 'الشركاء',
    associations: 'جمعيات',
    operations: 'العمليات'
  };`, 'PROTECTED');

rep(`    if (id === 'member-profile') renderMemberProfile();`,
`    if (id === 'member-profile') renderMemberProfile();
    if (id === 'operations') renderOperations();
    if (id === 'settings') renderDataSafety();`, 'showView');

/* 2) منع مسح بيانات موجودة من نسخة بعيّدة فارغة */
rep(`  function applySnapshot(snap) {
    backupLocal('قبل استبدال المزامنة');
    var secs = (snap && snap.sections) || {};
    var applied = 0;
    SYNC_KEYS.forEach(function (k) {
      if (typeof secs[k] === 'string') { localStorage.setItem(k, secs[k]); applied++; }
    });`,
`  /* هل القيمة الخام تمثّل بيانات فارغة؟ — لمنع استبدال بيانات ببيانات فاضية */
  function isEmptyPayload(raw) {
    if (raw == null || raw === '') return true;
    try {
      var v = JSON.parse(raw);
      if (Array.isArray(v)) return v.length === 0;
      if (v !== null && typeof v === 'object') return Object.keys(v).length === 0;
      if (v === null) return true;
      return false;
    } catch (e) { return false; }
  }
  function readRawKey(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  var lastApplySkipped = 0;

  function applySnapshot(snap) {
    backupLocal('قبل استبدال المزامنة');
    var secs = (snap && snap.sections) || {};
    var applied = 0;
    lastApplySkipped = 0;
    SYNC_KEYS.forEach(function (k) {
      if (typeof secs[k] !== 'string') return;
      /* الحماية: ما نستبدلش بيانات موجودة على الجهاز ببيانات فارغة من بُعد */
      if (isEmptyPayload(secs[k]) && !isEmptyPayload(readRawKey(k))) { lastApplySkipped++; return; }
      localStorage.setItem(k, secs[k]); applied++;
    });`, 'applySnapshot');

rep(`    syncShowNote('اتحفظت نسخة احتياطية من بياناتك القديمة. لو رجعت غلط، اضغط «تراجع عن آخر استبدال».', false);
    toast('تم تحديث البيانات من الدرايف ✓');`,
`    syncShowNote('اتحفظت نسخة احتياطية من بياناتك القديمة. لو رجعت غلط، اضغط «تراجع عن آخر استبدال».' +
      (lastApplySkipped ? ' — تم تجاهل ' + lastApplySkipped + ' قسم فارغ في النسخة البعيدة عشان ما نمسحش بياناتك.' : ''), false);
    toast(lastApplySkipped
      ? 'تم تحديث البيانات ✓ (وتم حماية ' + lastApplySkipped + ' قسم من المسح)'
      : 'تم تحديث البيانات من الدرايف ✓');`, 'syncApply-note');

/* 3) زر الربط: نتأكد إن مسار الـAPI موجود قبل الانتقال (بدل صفحة 404) */
rep(`  var driveConnectBtn = $('#driveConnect');
  if (driveConnectBtn) driveConnectBtn.addEventListener('click', function () {
    if (typeof location !== 'undefined') location.href = '/api/google/login';
  });`,
`  /* نجرّب مسار الربط الأول — لو مش موجود (استضافة ثابتة بلا خادم) نقولها بدل صفحة 404 */
  function startGoogleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    var go = function () { if (typeof location !== 'undefined') location.href = '/api/google/login'; };
    if (typeof fetch !== 'function') { go(); return; }
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r || r.status === 404 || r.status === 501) throw new Error('NOAPI');
        if (typeof r.clone !== 'function') return null;
        return r.clone().json().catch(function () { throw new Error('NOAPI'); });
      })
      .then(function () { go(); })
      .catch(function () {
        toast('مسار ربط Google غير متاح على هذه الصفحة — شغّل المعاينة الكاملة (preview-local.mjs) أو افتح الموقع المنشور.', true);
      });
  }
  window.startGoogleLogin = startGoogleLogin;

  var driveConnectBtn = $('#driveConnect');
  if (driveConnectBtn) driveConnectBtn.addEventListener('click', function () {
    startGoogleLogin();
  });`, 'driveConnect');

/* 4) الإقلاع: إصلاح التخزين ثم تفعيل سجل العمليات */
rep(`  /* ---------- الإقلاع ---------- */
  /* ---------- الإقلاع ---------- */`,
`  /* ---------- الإقلاع ---------- */
  installOpsHook();
  repairStorage();
  /* ---------- الإقلاع ---------- */`, 'boot');

fs.writeFileSync(FILE, src);
console.log('✓ ' + FILE + ' — ' + count + ' تعديل');
