@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo   1/2 بناء تطبيق الويب...
call node build.js >nul
echo   2/2 نسخ الملفات إلى assets\www ...
if exist "android\app\src\main\assets\www" rmdir /s /q "android\app\src\main\assets\www"
mkdir "android\app\src\main\assets\www"
xcopy /e /i /y "dist\*" "android\app\src\main\assets\www\" >nul
echo   ✔ تم نسخ ملفات التطبيق — جاهز للتصنيع من Android Studio
pause
