/* حزمة إصلاح رسائل المزامنة في app.js */
'use strict';
const fs = require('fs');
const file = 'app.js';
let s = fs.readFileSync(file, 'utf8');
let changed = 0;

/* 1) تمرير code من الخادم داخل الخطأ */
const old1 = `    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || 'فشلت عملية المزامنة');
        return j;
      });
    });`;
const new1 = `    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) {
          var err = new Error((j && j.error) || 'فشلت عملية المزامنة');
          err.code = (j && j.code) || '';
          throw err;
        }
        return j;
      });
    });`;
if (s.includes(old1)) { s = s.replace(old1, new1); changed++; }

/* 2) رسالة Toast أقصر وأوضح لخطأ الصلاحيات في الرفع */
const old2 = `    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الرفع: ' + (e && e.message ? e.message : e), true);
        toast('فشل رفع المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      return null;
    }).then(function (r) { syncBusy = false; return r; });`;
const new2 = `    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الرفع: ' + (e && e.message ? e.message : e), true);
        toast(e && e.code === 'PERM'
          ? 'الحساب الحالي صلاحيته مشاهدة فقط على المجلد — الحل مكتوب بالأسفل'
          : 'فشل رفع المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      return null;
    }).then(function (r) { syncBusy = false; return r; });`;
if (s.includes(old2)) { s = s.replace(old2, new2); changed++; }

/* 3) نفس المعالجة لزر «فحص وتحميل» */
const old3 = `    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الفحص: ' + (e && e.message ? e.message : e), true);
        toast('فشل فحص المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      syncBusy = false;
      return null;
    });`;
const new3 = `    }).catch(function (e) {
      if (!auto) {
        syncShowNote('فشل الفحص: ' + (e && e.message ? e.message : e), true);
        toast(e && e.code === 'PERM'
          ? 'تعذّر الوصول للمجلد — الحساب صلاحيته مشاهدة فقط، الحل بالأسفل'
          : 'فشل فحص المزامنة: ' + (e && e.message ? e.message : e), true);
      }
      syncBusy = false;
      return null;
    });`;
if (s.includes(old3)) { s = s.replace(old3, new3); changed++; }

fs.writeFileSync(file, s);
console.log('تم تعديل ' + changed + ' من 3 مقطع');
if (changed < 3) process.exit(1);