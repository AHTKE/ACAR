# نسخة سطح المكتب — Desktop (Portable + Setup، 32 و 64 بت)

تطبيق مبني على **Node.js + Electron**، والحفظ في **قاعدة بيانات SQLite**
(ملف `data/nizam.db`) — يعني البيانات بتفضل محفوظة حتى لو اتمسح كاش المتصفح
أو غيّرت المتصفح، وعند أي إعادة تشغيل بتترجّع تلقائياً قبل ما التطبيق يشتغل.

---

## 1) التشغيل السريع (Portable — بدون تثبيت)
من جذر المشروع:
```bash
# ويندوز
start-desktop.bat

# لينكس / ماك
bash start-desktop.sh
```
- لو `node` مش مثبّت، الملف بيقولك ويوصلك بتنزيله (اختر **32-bit** لو جهازك ضعيف).
- الخادم بيفتح على `http://127.0.0.1:4568` محلياً (مفيش إنترنت مطلوب).
- قاعدة البيانات: `data/nizam.db` — تقدر تنسخها احتياطياً من
  `http://127.0.0.1:4568/local/nizam.db`

---

## 2) بناء ملفات التثبيت (Setup) والمحمولة (Portable)

> يتطلب إنترنت مرة واحدة لتنزيل Electron وأدوات التصنيع.

```bash
npm run desktop:install      # تثبيت تبعيات سطح المكتب مرة واحدة
npm run desktop:dist         # يبني كل نسخ ويندوز: 64 + 32، Setup + Portable
```

أو كل هدف على حدة:
```bash
npm run desktop:dist:win64      # Setup 64 بت      → release/nizam-setup-x64.exe
npm run desktop:dist:win32      # Setup 32 بت      → release/nizam-setup-ia32.exe
npm run desktop:dist:portable   # Portable 64 بت   → release/nizam-portable-x64.exe
```

كل الأوامر بتبدأ بـ `npm run build` (تجهيز `dist/`) تلقائياً.

### التشغيل أثناء التطوير
```bash
npm run desktop:serve    # الخادم + SQLite فقط، افتح المتصفح
npm --prefix desktop run start   # نافذة Electron
```

---

## 3) كيف بيشتغل الحفظ في SQLite

| الخطوة | ماذا يحدث |
|---|---|
| فتح الصفحة | الخادم يحقن ` /local/boot.js ` قبل سكربتات التطبيق |
| قبل التشغيل | `boot.js` يقرأ كل المفاتيح من SQLite ويضعها في `localStorage` |
| أي تعديل | خطّاف على `Storage.prototype.setItem` يرسل المفتاح فوراً إلى `POST /local/kv` |
| الخادم | يحفظ/يحدّث صف في جدول `kv` داخل `nizam.db` |
| إعادة التشغيل | نفس الدورة — البيانات راجعة من القاعدة |

> الويب (الموقع المنشور) ما بيتأثرش: حقن `boot.js` بيحصل من الخادم المحلي فقط،
> ملفات `dist/` الأصلية زي ما هي.

---

## 4) ربط Google Drive من نسخة سطح المكتب (اختياري)
مسارات `/api/...` مش جزء من التطبيق المحلي. لتفعيلها:
```bash
set NIZAM_API_BASE=https://workflow-amw-code.vercel.app   # ويندوز
export NIZAM_API_BASE=https://workflow-amw-code.vercel.app # لينكس/ماك
node desktop/server.js
```
وبكده كل `/api/*` بيتمرّر للخادم البعيد. من غيره، زر الربط بيعرض رسالة عربية
واضحة بدل صفحة `404`.

---

## 5) هيكل الملفات
```
desktop/
  server.js     خادم محلي + SQLite + حقن boot.js
  main.js       غلاف Electron (النافذة والقوائم)
  package.json  تبعيات التصنيع + إعدادات electron-builder
  README.md     هذا الملف
start-desktop.bat / start-desktop.sh   مشغّل المحمول
data/nizam.db                          قاعدة البيانات (لا ترفعها للمستودع)
release/                               نواتج التصنيع (لا ترفعها للمستودع)
```
