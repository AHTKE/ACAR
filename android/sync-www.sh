#!/usr/bin/env bash
# ينسخ آخر بناء من dist/ إلى مجلد أصول أندرويد قبل التصنيع
set -e
cd "$(dirname "$0")/.."

echo "  1/2 بناء تطبيق الويب..."
node build.js >/dev/null

echo "  2/2 نسخ الملفات إلى android/app/src/main/assets/www ..."
rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets/www
cp -R dist/. android/app/src/main/assets/www/

# نسخة محلية (بيئة موثوقة — جهاز المالك: صلاحيات كاملة فوراً بدون طلبات شبكة)
sed 's|<head>|<head>\n  <script>window.APP_TRUSTED_RUNTIME = true;</script>|' \
  dist/index.html > android/app/src/main/assets/www/index_local.html

COUNT=$(find android/app/src/main/assets/www -type f | wc -l | tr -d ' ')
echo "  ✔ تم نسخ $COUNT ملف — جاهز للتصنيع من Android Studio"
