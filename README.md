# ACAR1

## النشر على Vercel — الإعدادات المطلوبة

| الإعداد | القيمة |
|---|---|
| Root Directory | **فاضي** (جذر المستودع — مش `desktop`) |
| Framework Preset | Other |
| Build Command | `node build.js` |
| Output Directory | `dist` |
| Install Command | فاضي |

> `build.js` و`api/` و`vercel.json` كلهم في **جذر المشروع**. لو Vercel اشتغل من
> داخل `desktop` هيقع بـ `Cannot find module .../desktop/build.js`، ومفيش API
> هيتنشر (يعني ربط Google وتنبيهات البريد هيقفوا). للتحقق محليًا: من الجذر نفّذ
> `node build.js` ولازم يطلع `dist/`.
> ملحوظة: `desktop/build.js` موجود بس عشان يطبع رسالة واضحة لو البناء اشتغل من
> الفولدر الغلط.

المتغيّرات المطلوبة على Vercel (Production و Preview): `GOOGLE_CLIENT_ID` و
`GOOGLE_CLIENT_SECRET`.
