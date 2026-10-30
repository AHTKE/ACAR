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

COUNT=$(find android/app/src/main/assets/www -type f | wc -l | tr -d ' ')
echo "  ✔ تم نسخ $COUNT ملف — جاهز للتصنيع من Android Studio"
