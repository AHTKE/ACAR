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

## 5) الديسكتوب: «محظور» أو `Error 400`

الوضع الافتراضي في الديسكتوب **مش** بيعمل OAuth على `127.0.0.1`؛ بيفتح صفحة
الموقع، وGoogle بيرجع للموقع، وبعدها الموقع يمرّر رمز الربط للديسكتوب. معنى
كده إن رابط الإرجاع اللي لازم يكون مسجَّل في Google Console هو:

```
https://<دومين-الموقع>/api/google/callback
```

مش `http://127.0.0.1:...`. لو ضفت عنوان التشغيل المحلي فقط، Google هيرفض بخطأ
`redirect_uri_mismatch` أو صفحة «محظور».

### تأكد من الآتي في Google Cloud Console
1. العميل المستخدم في Vercel من نوع **Web application**، ومضاف فيه رابط الموقع
   بالحرف أعلاه (نفس الدومين اللي التطبيق بيستخدمه فعلاً).
2. `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` في Vercel من **نفس** عميل الويب،
   وبعد تغييرهما اعمل **Redeploy**.
3. لو بتستخدم دومين مخصص أو رابط Preview متغيّر، ضع `APP_BASE_URL` في Vercel
   واضبط فيه الدومين الثابت، أو أضف رابط كل دومين في Google Console.
4. شاشة OAuth consent: الحساب لازم يكون **Test user** لو التطبيق في وضع Testing،
   أو انشر التطبيق (Publish app).
5. للوضع المحلي فقط (`NIZAM_LINK_MODE=local`): استخدم عميل **Desktop app**
   (Google بيقبل أي منفذ loopback)، أو لو هتستخدم Web client سجّل
   `http://127.0.0.1:47820/api/google/callback` بالحرف.

من داخل التطبيق، زر **فحص المفاتيح** بيعرض `redirectUri` الفعلي من الموقع؛
انسخ نفس القيمة في Google Console بدل التخمين.

## ملاحظات أمان
- الـ`Client ID` معلومة عامة (بتظهر في رابط التفويض)، لكن **الـClient Secret لا يُعرض أبداً** في أي رد من الخادم — الفحص بيقول «موجود/صيغته سليمة» فقط.
- الأسرار تتحفظ في Vercel Environment Variables أو Sites Secrets، مش في الكود ولا في المستودع.
- أي Client Secret اتكتب في محادثة أو اتشارك مع حد لازم **يتلغى ويتولّد غيره** من Google Cloud ← Clients.
