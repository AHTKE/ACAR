# حل مشكلة ربط Google: «المفاتيح ناقصة» أو `invalid_client 401`

## الخلاصة
- الخطأ **`invalid_client`** اللي بتشوفه في صفحة Google معناه: **الـClient ID اللي خادم Vercel بيبعته مختلف عن اللي في Google Cloud** — مش معنى إن المفاتيح مش مضافة.
- رسالة «المفاتيح مش موجودة» جوه التطبيق معناها إن **النسخة المنشورة على Vercel قديمة**: Vercel بياخد متغيّرات البيئة وقت البناء (Build)، فلو ضفتها بعد آخر نشر وماعملتش **Redeploy**، النسخة الشغالة لسه شايفاها فاضية.

## خطوات الحل بالترتيب
1. **Redeploy على Vercel** (أهم خطوة):
   - Vercel ← المشروع ← Deployments ← آخر Deployment ← `⋯` ← **Redeploy**.
   - شيل علامة «Use existing Build Cache» لو ظهرت.
   - تأكد إن المتغيّرين مضافين على **Production** و**Preview** (زي ما في الصورة عندك).
2. **اتأكد إن القيمة كاملة وصحيحة**:
   - `GOOGLE_CLIENT_ID` لازم يبدأ بأرقام ثم شَرطة وينتهي بـ `.apps.googleusercontent.com` (طوله حوالي 72 حرف).
   - `GOOGLE_CLIENT_SECRET` لازم يبدأ بـ `GOCSPX-`.
   - انسخهم من **Google Cloud ← APIs & Services ← Clients ← نفس الـOAuth client** (اللي اسمه مثلاً «Client ID for Web application»)، ومن غير مسافات أو أسطر زيادة — الكود بقى بينظّف المسافات والاقتباسات تلقائياً.
3. **رابط الإرجاع (Authorized redirect URI)** لازم يكون بالحرف:
   - `https://workflow-amw-code.vercel.app/api/google/callback`
   - وأي دومين تاني بتفتح منه التطبيق (مثل دومين freebuff) لازم يتضاف بنفس الشكل `…/api/google/callback`.
   - لو بتستخدم روابط Preview متغيرة على Vercel، أضف متغيّر `APP_BASE_URL=https://workflow-amw-code.vercel.app` عشان التطبيق يثبّت رابط الإرجاع على الدومين الأساسي.
4. **شاشة OAuth consent**:
   - لو المشروع في وضع **Testing**، الحساب اللي بتحاول تدخل بيه لازم يكون مضاف في **Test users**.
   - أو اضغط **Publish app** لو التطبيق جاهز.

## إزاي تعرف السبب بالظبط من غير تخمين
1. من داخل التطبيق: **الإعدادات ← ربط Google Drive ← «🔍 فحص المفاتيح والاتصال بجوجل»**.
2. أو من المتصفح مباشرةً على دومين مشروعك:
   - `…/api/google/status` يعرض: هل الخادم شايف المفاتيح، طول الـClient ID وآخر 10 حروف، وهل صيغته سليمة، ورابط الإرجاع المستخدم.
   - `…/api/google/check` يعمل فحص فعلي مع Google ويرجّع السبب:
     | النتيجة | المعنى | الحل |
     |---|---|---|
     | `missing_keys` | الخادم مش شايف المتغيّرين | أضفهم ثم **Redeploy** |
     | `bad_client_id_format` | القيمة مش بصيغة Google | انسخها كاملة من Google Cloud |
     | `client_id_not_found` | Google ما يعرفش المعرّف (محذوف/مشروع تاني) | انسخ Client ID + Secret من نفس الـclient |
     | `bad_client_secret` | المعرّف صح لكن السر لا يطابق | حدّث `GOOGLE_CLIENT_SECRET` ثم Redeploy |
     | `redirect_uri_mismatch` | رابط الإرجاع غير مسجّل | أضف نفس الرابط الظاهر في الرسالة |
     | `keys_ok` | المفاتيح سليمة ومطابقة | المشكلة في consent/Test user أو حساب Google |
3. الزر ده بقى موجود كمان على **شاشة الربط الأولى**، وأي فشل ربط بيرجع للتطبيق برسالة عربية واضحة بدل صفحة خطأ Google.

## 5) الديسكتوب: الربط المحلي و«محظور» أو `Error 400`

الوضع الافتراضي في الديسكتوب بقى **محلي فقط**: التطبيق بيعمل OAuth بنفسه على
`127.0.0.1`، ويحفظ رمز التجديد في `data/google-auth.json` على الجهاز. مفيش
تحويل تلقائي للموقع، ولو الموقع وقع أو اتغيّر، ربط Google المحلي بيفضل شغال.

رابط الإرجاع المحلي:

```
http://127.0.0.1:47820/api/google/callback
```

لو 47820 مشغول، التطبيق بيستخدم منفذ loopback آخر؛ عميل **Desktop app** بيقبل
أي منفذ على `127.0.0.1`، فمش محتاج تسجّل كل منفذ.

### إعداد Google Cloud Console
1. الأفضل يكون العميل من نوع **Desktop app**. في الحالة دي مش محتاج تضيف
   redirect URI؛ Google بيقبل أي منفذ loopback.
2. لو العميل **Web application**، أضف الرابط المحلي بالحرف في
   **Authorized redirect URIs**:
   ```
   http://127.0.0.1:47820/api/google/callback
   ```
   ولو غيّرت المنفذ أو استخدمت `localhost` بدل `127.0.0.1`، أضف نفس الرابط
   بالمنفذ والدومين اللي التطبيق بيستخدمه فعلاً.
3. شاشة OAuth consent: الحساب لازم يكون **Test user** لو التطبيق في وضع Testing،
   أو انشر التطبيق (Publish app).
4. صلاحيات Drive وGmail لازم تكون مضافة في الـOAuth consent screen.

### مفاتيح البناء
`desktop/google-client.json` مستبعد من Git. كل build للديسكتوب بيشغّل
`desktop/prepare-google-client.js`، اللي بيقرأ:
- `NIZAM_GOOGLE_CLIENT_ID` و`NIZAM_GOOGLE_CLIENT_SECRET`
- أو `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET`
- أو الملف المحلي

ولو المفاتيح ناقصة أو غلط، البناء بيفشل برسالة واضحة بدل ما تطلع نسخة مش
قادرة تربط. جرّب:

```bash
npm run desktop:keys
npm run desktop:dist
```

من داخل التطبيق، زر **فحص المفاتيح** بيعرض `redirectUri` الفعلي؛ استخدم نفس
القيمة في Google Console بدل التخمين.

## ملاحظات أمان
- الـ`Client ID` معلومة عامة (بتظهر في رابط التفويض)، لكن **الـClient Secret لا يُعرض أبداً** في أي رد من الخادم — الفحص بيقول «موجود/صيغته سليمة» فقط.
- الأسرار تتحفظ في Vercel Environment Variables أو Sites Secrets، مش في الكود ولا في المستودع.
- أي Client Secret اتكتب في محادثة أو اتشارك مع حد لازم **يتلغى ويتولّد غيره** من Google Cloud ← Clients.
