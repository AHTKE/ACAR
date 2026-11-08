#!/usr/bin/env bash
# نسخة محمولة (Portable) — تشغيل التطبيق محلياً مع حفظ SQLite
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js غير مثبّت. حمّله من https://nodejs.org"
  exit 1
fi

[ -f dist/index.html ] || node build.js

echo "  التطبيق شغّال على http://127.0.0.1:4568"
node desktop/server.js &
SRV=$!
sleep 1.5
(xdg-open "http://127.0.0.1:4568" || open "http://127.0.0.1:4568") >/dev/null 2>&1 &
wait "$SRV"
