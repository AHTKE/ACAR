# نسخة أندرويد — Android Studio

مشروع WebView جاهز لفتحه في **Android Studio**، وفيه **نسختان حسب الجهاز**:

| Flavor | الاسم في Android Studio | المعالج/الهندسة | minSdk | الملف الناتج |
|---|---|---|---|---|
| `weak` | `weakDebug` / `weakRelease` | 32 بت: `armeabi-v7a` + `x86` | 21 (Android 5) | `nizam-weak-release.apk` |
| `strong` | `strongDebug` / `strongRelease` | 64 بت: `arm64-v8a` + `armeabi-v7a` | 24 (Android 7) | `nizam-strong-release.apk` |

> **الضعيف** للأجهزة القديمة/القليلة الرام (بيقلّل الكود بـ R8 + resource shrinking).
> **القوي** لأجهزة اليوم (يدعم ARM64 بالكامل).

---

## خطوات البناء

### 1) جهّز ملفات التطبيق (مرة لكل تحديث)
من جذر المشروع:
```bash
# لينكس/ماك
bash android/sync-www.sh

# ويندوز
android\sync-www.bat
```
ده بيبني `dist/` وينسخها إلى `android/app/src/main/assets/www/`.

### 2) افتح المشروع في Android Studio
`File ← Open` واختر مجلد `android/`. هيطلب تنزيل Gradle تلقائياً.

### 3) اختر النسخة وابنِ
- **Build Variant**: من لوحة `Build Variants` اختار `weakDebug` أو `strongRelease`.
- أو من الطرفية:
```bash
cd android
./gradlew assembleWeakDebug        # نسخة ضعيفة — تجريبية
./gradlew assembleStrongDebug      # نسخة قوية — تجريبية
./gradlew assembleWeakRelease      # نسخة ضعيفة — نهائية
./gradlew assembleStrongRelease    # نسخة قوية — نهائية
```

### 4) الملفات الناتجة
```
android/app/build/outputs/apk/weak/release/nizam-weak-release.apk
android/app/build/outputs/apk/strong/release/nizam-strong-release.apk
```

### 5) تثبيت على جهاز متصل (USB debugging)
```bash
adb install -r android/app/build/outputs/apk/strong/release/nizam-strong-release.apk
```

---

## ملاحظات مهمة

- **الحفظ**: البيانات بتتخزّن في `localStorage` داخل WebView (`setDomStorageEnabled(true)`)
  — نفس آلية تطبيق الويب بالظبط، يعني كل المزامنة وسجل العمليات والتراجع شغّالة.
- **ربط Google Drive**: مسارات `/api/...` مش موجودة جوه APK، فزر الربط هيبان له رسالة
  واضحة بدل صفحة خطأ. لو عايزه تشتغل، لازم التطبيق ياخد بيانات من خادم ويب حي
  (شغّل `NIZAM_API_BASE` في نسخة سطح المكتب، أو اربط WebView برابط الموقع المنشور).
- **أذونات**: محتاج `INTERNET` فقط.
- **التوقيع**: `release` موقّع بمفتاح debug عشان يتبني من غير إعدادات توقيع — قبل النشر
  على المتاجر ضع توقيعك الحقيقي في `android/app/build.gradle` → `signingConfigs`.
- المشروع **بلا مكتبات خارجية** (WebView فقط) → بناء سريع وحجم صغير.
