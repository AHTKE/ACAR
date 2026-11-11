/* ============================================================
   نظام الإدارة المتكامل — Service Worker (عمل بدون إنترنت)
   ============================================================ */
var CACHE = 'nizam-idara-v22';

var SHELL = [
  './',
  './styles.css',
  './export.js',
  './app.js',
  './monthly.js',
  './employees.js',
  './customer-extra.js',
  './warehouse-catalog.js',
  './app-lock.js',
  './splash.js',
  './period.js',
  './auth-gate-addon.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon.png',
  './icons/logo-amw.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* مسارات API (ومنها بدء OAuth) لازم تروح للشبكة مباشرة.
     اعتراضها هنا كان بيمنع تحويل Google ويخلّي المتصفح يعرض
     نسخة الكاش تحت رابط /api/google/login. */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* الصفحات: الشبكة أولاً مع الرجوع لنسخة محفوظة عند فقد الإنترنت */
  if (req.mode === 'navigate') {
    /* أي مسار غير الجذر مش صفحة من التطبيق — سيبه للشبكة */
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith(
      fetch(req).then(function (res) {
        /* لا نخزّن استجابة مُعاد توجيهها تحت رابط الجذر حتى لا تُرفض عند التشغيل دون إنترنت */
        if (res && res.ok && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./', copy); }).catch(function () {});
        }
        /* لو الخادم رجّع خطأ (502/503) نعرض آخر نسخة شغالة بدل صفحة الخطأ */
        if (res && res.ok) return res;
        return caches.match('./').then(function (c) { return c || res; });
      }).catch(function () {
        return caches.match('./');
      })
    );
    return;
  }

  /* الملفات الثابتة: الشبكة أولاً ليصل التحديث فوراً، ثم الكاش احتياطاً عند فقد الإنترنت */
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      /* ملف رجع 502؟ نرجع نسخته المحفوظة عشان الصفحة ما تنكسرش */
      if (res && res.ok) return res;
      return caches.match(req).then(function (c) { return c || res; });
    }).catch(function () {
      return caches.match(req);
    })
  );
});
