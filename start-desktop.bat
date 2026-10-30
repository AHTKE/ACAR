@echo off
chcp 65001 >nul
title نظام الإدارة المتكامل — نسخة مكتبية
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js غير مثبّت على هذا الجهاز.
  echo   حمّله من https://nodejs.org  ^(اختر النسخة 32-bit لو جهازك ضعيف^)
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo   جارٍ تجهيز ملفات التطبيق...
  call node build.js
)

echo   جارٍ تشغيل التطبيق على http://127.0.0.1:4568
start "" "http://127.0.0.1:4568"
node desktop\server.js
pause
