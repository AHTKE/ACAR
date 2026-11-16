/* ============================================================
   desktop/build.js — حماية من تشغيل بناء الموقع من الفولدر الغلط
   ------------------------------------------------------------
   Vercel لازم يبني من جذر المشروع (فيه vercel.json وapi/ وbuild.js).
   لو إعدادات المشروع على Vercel متظبطة على Root Directory = desktop
   (أو Build Command = cd desktop && node build.js)، كان البناء بيقع
   برسالة Node مبهمة: Cannot find module .../desktop/build.js

   الملف ده بيوقّف البناء برسالة واضحة بدل الخطأ المبهم.
   ============================================================ */
'use strict';

console.error('');
console.error('✖ بناء الموقع لازم يبدأ من جذر المشروع، مش من فولدر desktop.');
console.error('');
console.error('  على Vercel: Settings ← General ← Root Directory لازم تكون فاضية (جذر المستودع)،');
console.error('  و Settings ← Build & Development Settings ← Build Command = node build.js');
console.error('  و Output Directory = dist و Install Command فاضية.');
console.error('');
console.error('  للتشغيل محليًا: من جذر المشروع نفّذ  npm run build  أو  node build.js');
console.error('');
process.exit(1);
