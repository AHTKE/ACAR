# قواعد R8/ProGuard — التطبيق WebView فقط
-keepattributes *Annotation*
-keep class com.amw.nizam.** { *; }
-dontwarn android.webkit.**
