# خدمة تفعيل الأجهزة المشتركة — دليل التكامل

المصدر الوحيد للحقيقة هو خادم هذا التطبيق (`activation.js` + `worker.js`).
مفيش أي مولّد أكواد محلي، ومفيش أسرار أو مفاتيح في أي واجهة.

## المتطلبات

- تخزين مركزي = **D1** (`env.DB`). على Vercel الحالة بتتخزن في كوكي المتصفح
  نفسه، فكل المسارات بترجّع `available:false` و`code:"NO_STORE"` بدل تفعيل وهمي.
- الأدمن = حساب Google مربوط بإيميل إدارة (`gstsyusudg@gmail.com` /
  `mahmoed181186@gmail.com`) عن طريق `gconn` cookie الموجود بالفعل.

## المسارات

| المسار | الطريقة | مين | الوصف |
|---|---|---|---|
| `/api/activation/status?device=<id>` | GET | عام | هل التفعيل مطلوب؟ وهل الجهاز مفعّل؟ |
| `/api/activation/request` | POST | عام | `{device,name,passcode}` — التحقق من كلمة المرور المؤقتة وتسجيل الجهاز |
| `/api/activation/verify` | POST | عام | `{device,passcode,code}` — التفعيل النهائي، الكود لمُرة واحدة |
| `/api/activation/passcode` | POST | أدمن | إصدار كلمة مرور تشغيلية (6 أرقام، 5 دقائق) |
| `/api/activation/issue` | POST | أدمن | `{device}` → كود تفعيل (8 أرقام، 24 ساعة) |
| `/api/activation/devices` | GET | أدمن | قائمة الأجهزة وحالتها + هل التفعيل مطلوب |
| `/api/activation/revoke` | POST | أدمن | `{device}` — إلغاء التفعيل |
| `/api/activation/enforce` | POST | أدمن | `{enabled}` — تشغيل/إيقاف طلب التفعيل |

### ردود الحالة

```json
{ "ok": true, "available": true, "enforced": true,
  "activated": false, "device": { "status": "pending", "name": "", "activatedAt": "" } }
```

`device.status`: `none` | `pending` | `active` | `revoked`.

### أكواد الأخطاء

`NO_STORE` · `BAD_DEVICE` · `BAD_PASSCODE` · `PASS_EXPIRED` · `NO_CODE` ·
`CODE_EXPIRED` · `BAD_CODE` · `UNKNOWN_DEVICE` · `REVOKED` · `TOO_MANY` ·
`NOT_ADMIN`

- `TOO_MANY`: 8 محاولات فاشلة داخل 15 دقيقة → 429.
- `REVOKED`: أي كود قديم ما بيفعّلش جهاز ملغي، حتى لو لسه في صلاحيته.

## القواعد

1. كلمة المرور المؤقتة والكود بيتخزنوا **SHA-256 فقط**، والكود مربوط بمعرّف
   الجهاز: `sha256("dev:" + deviceId + ":" + code)`.
2. معرّف الجهاز UUID محلي (عادة `crypto.randomUUID`) — بدون بصمة متصفح.
3. القفل بيظهر بس لما الخادم يقول `enforced:true && activated:false`.
   جهاز مفعّل ما بيتقفلش لمجرد انقطاع الشبكة، وأي جهاز بيتقفل فورًا لما
   الخادم يعلن إلغاءه.
4. بعد النجاح الكود بيتشال من السجل، وأي طلب تاني بيرجّع `activated:true`.

## ربط التطبيق التاني

1. خزّن معرّف الجهاز محليًا، واعرضه مع زر نسخ.
2. اطلب كلمة المرور التشغيلية → `request` → كود من المسؤول → `verify`.
3. اعتمد `status` قبل فتح التطبيق وبعد الرجوع له.
4. **مطلوب من صاحب التطبيق التاني قبل ما نclaim توافق:** عنوان الخدمة
   (دومين الخادم)، وطريقة المصادقة بين التطبيق والخدمة لو مختلفة عن كوكي
   `gconn`، وأسماء الحقول اللي عنده لو عايز صيغة مختلفة. من غير البيانات دي
   أي «توافق» هيكون تخمين.

## الاختبارات

```
node activation-test.mjs          # 35 تحقق على الخادم
NODE_PATH=/tmp/nizam-jsdom/node_modules node device-activation-test.js   # 20 تحقق على الواجهة
```
