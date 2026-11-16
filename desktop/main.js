/* ============================================================
   desktop/main.js — نقطة تشغيل النسخة المكتبية (Electron)
   يشغّل الخادم المحلي (SQLite) على 127.0.0.1 ثم يفتح النافذة.
   التشغيل: npx electron .     من داخل مجلد desktop/
   ============================================================ */
'use strict';

const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const server = require('./server');

let win = null;
let info = null;

/* ---------- فولدر نسخ البيانات على قرص الجهاز ---------- */
const BACKUP_CFG = path.join(app.getPath('userData'), 'local-backup.json');

function readBackupCfg() {
  try { return JSON.parse(fs.readFileSync(BACKUP_CFG, 'utf8')) || {}; } catch (e) { return {}; }
}
function writeBackupCfg(cfg) {
  try {
    fs.mkdirSync(path.dirname(BACKUP_CFG), { recursive: true });
    fs.writeFileSync(BACKUP_CFG, JSON.stringify(cfg || {}));
  } catch (e) { /* ما نمنعش الواجهة بسبب فشل الحفظ */ }
}
function backupInfo() {
  const c = readBackupCfg();
  let count = 0;
  try {
    if (c.folder) count = fs.readdirSync(c.folder).filter(f => /^nizam-backup-.*\.json$/.test(f)).length;
  } catch (e) { count = 0; }
  return { folder: c.folder || '', lastAt: c.lastAt || '', count: count };
}
/* نحفظ آخر 60 نسخة JSON بس — عشان الفولدر ما يتضخمش */
function pruneBackups(folder) {
  try {
    const files = fs.readdirSync(folder).filter(f => /^nizam-backup-\d{8}-\d{6}\.json$/.test(f)).sort();
    while (files.length > 60) {
      try { fs.unlinkSync(path.join(folder, files.shift())); } catch (e) { /* تخطي */ }
    }
  } catch (e) { /* تخطي */ }
}
function safeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\.\.+/g, '.').slice(0, 180);
}

ipcMain.handle('backup:info', () => backupInfo());

ipcMain.handle('backup:pick', async () => {
  const opts = {
    title: 'اختار فولدر نسخ البيانات',
    buttonLabel: 'ربط الفولدر',
    properties: ['openDirectory', 'createDirectory']
  };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (!r || r.canceled || !r.filePaths || !r.filePaths[0]) return backupInfo();
  const cfg = readBackupCfg();
  cfg.folder = r.filePaths[0];
  writeBackupCfg(cfg);
  return backupInfo();
});

ipcMain.handle('backup:clear', () => {
  const cfg = readBackupCfg();
  delete cfg.folder;
  delete cfg.lastAt;
  writeBackupCfg(cfg);
  return backupInfo();
});

ipcMain.handle('backup:save', (e, payload) => {
  const cfg = readBackupCfg();
  if (!cfg.folder) throw new Error('لم يتم اختيار فولدر');
  const name = safeName(payload && payload.name);
  if (!name) throw new Error('اسم ملف غير صالح');
  fs.mkdirSync(cfg.folder, { recursive: true });
  fs.writeFileSync(path.join(cfg.folder, name), String((payload && payload.text) || ''));
  cfg.lastAt = new Date().toISOString();
  writeBackupCfg(cfg);
  pruneBackups(cfg.folder);
  return backupInfo();
});

ipcMain.handle('backup:saveBinary', (e, payload) => {
  const cfg = readBackupCfg();
  if (!cfg.folder) throw new Error('لم يتم اختيار فولدر');
  const name = safeName(payload && payload.name);
  if (!name) throw new Error('اسم ملف غير صالح');
  const buf = Buffer.from(String((payload && payload.base64) || ''), 'base64');
  if (!buf || !buf.length) throw new Error('الملف فاضي');
  fs.mkdirSync(cfg.folder, { recursive: true });
  fs.writeFileSync(path.join(cfg.folder, name), buf);
  cfg.lastAt = new Date().toISOString();
  writeBackupCfg(cfg);
  return backupInfo();
});

/* نرجّع النافذة الموجودة للمقدمة (بعد الإخفاء أو التصغير) بدل فتح واحدة جديدة */
function focusWindow() {
  try {
    if (!win || win.isDestroyed()) return false;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    return true;
  } catch (e) { return false; }
}

/* ---------- ربط Google: منقعدش نخرج المستخدم بره التطبيق ----------
   بنفتح صفحة موافقة Google في المتصفح الافتراضي (Google بيمنع تسجيل
   الدخول جوه نوافذ التطبيقات)، ونافذة التطبيق تفضل على حالها،
   وبعدين نستنى الربط يتم على الخادم المحلي ونعمل تحديث تلقائي. */
let linkTimer = null;
let lastLinkError = '';

function localGoogleStatus() {
  return new Promise(function (resolve) {
    if (!info || !info.port) return resolve(null);
    let req;
    try {
      req = http.get({
        host: '127.0.0.1', port: info.port, path: '/api/google/status', timeout: 4000
      }, function (res) {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { body += c; });
        res.on('end', function () {
          try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
        });
      });
    } catch (e) { return resolve(null); }
    req.on('error', function () { resolve(null); });
    req.on('timeout', function () { try { req.destroy(); } catch (e) {} resolve(null); });
  });
}

function stopLinkWatch() {
  if (linkTimer) { clearInterval(linkTimer); linkTimer = null; }
}

function toastInApp(text) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.executeJavaScript(
      'try{window.NizamApp&&window.NizamApp.toast&&window.NizamApp.toast(' +
      JSON.stringify(String(text)) + ')}catch(e){}'
    ).catch(function () {});
  } catch (e) { /* اختياري */ }
}

function watchLink() {
  if (linkTimer) return;
  const startedAt = Date.now();
  toastInApp('اتفتح المتصفح — كمّل الموافقة على حساب Google والتطبيق هيتحدّث لوحده.');
  linkTimer = setInterval(async function () {
    if (!win || win.isDestroyed() || Date.now() - startedAt > 6 * 60 * 1000) { stopLinkWatch(); return; }
    const st = await localGoogleStatus();
    if (!st) return;
    if (st.connected) {
      stopLinkWatch();
      try { win.reload(); } catch (e) {}
      return;
    }
    const err = String(st.lastError || '');
    if (err && err !== lastLinkError) {
      lastLinkError = err;
      stopLinkWatch();
      try {
        dialog.showMessageBox(win, {
          type: 'error',
          title: 'تعذّر ربط Google Drive',
          message: err,
          detail: 'نفس الرسالة ظاهرة في «إعدادات ← ربط Google Drive». جرّب الربط مرة أخرى.',
          buttons: ['حسنًا']
        });
      } catch (e) { /* لو مش قادر يعرض الرسالة ما نكسرش التطبيق */ }
    }
  }, 1500);
}

function createWindow() {
  /* لو فيه نافذة شغالة بالفعل نكتفي بتركيزها */
  if (focusWindow()) return win;

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0a0e15',
    title: 'WorkFlow — نظام الإدارة المتكامل',
    icon: fs.existsSync(path.join(__dirname, 'icons', 'icon-512.png'))
      ? path.join(__dirname, 'icons', 'icon-512.png')
      : path.join(__dirname, '..', 'icons', 'icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  });

  win.loadURL('http://127.0.0.1:' + info.port + '/');

  win.on('closed', function () { win = null; });

  /* أي رابط خارجي (زي صفحة موافقة Google) يفتح في المتصفح الافتراضي،
     ونافذة التطبيق تفضل مكانها. لازم نلتقط كمان الـredirects من الخادم
     (will-redirect) لأن will-navigate مش بيشتغل مع ردود 302. */
  win.webContents.setWindowOpenHandler((o) => {
    const u = String((o && o.url) || '');
    if (/^https?:\/\//i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost):/i.test(u)) {
      shell.openExternal(u);
      if (/accounts\.google\.com/i.test(u)) watchLink();
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (/^https?:\/\/(127\.0\.0\.1|localhost):/i.test(String(url || ''))) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(String(url || ''))) {
      shell.openExternal(url);
      if (/accounts\.google\.com/i.test(String(url || ''))) watchLink();
    }
  });
  win.webContents.on('will-redirect', (e, url) => {
    if (/^https?:\/\/(127\.0\.0\.1|localhost):/i.test(String(url || ''))) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(String(url || ''))) {
      shell.openExternal(url);
      if (/accounts\.google\.com/i.test(String(url || ''))) watchLink();
    }
  });
}

/* منفذ ثابت لخادم الربط المحلي — عشان رابط إرجاع Google يبقى معروف
   لو الحساب مسجّل كعميل ويب (عميل Desktop بيقبل أي منفذ على loopback). */
const DEFAULT_APP_PORT = 47820;

/* قفل النسخة الواحدة: أي تشغيل تاني لنفس التطبيق (ضغط أيقونة الديسكتوب
   أو تشغيل الـ exe مرة ثانية) بيرجّع النافذة الأصلية للمقدمة بدل فتح نافذة جديدة. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!focusWindow()) {
      try { if (info) createWindow(); } catch (e) {}
    }
  });
}

app.whenReady().then(async () => {
  /* تجميع التطبيق في شريط المهام تحت أيقونته الصح */
  try { app.setAppUserModelId('com.amw.nizam-idara'); } catch (e) {}
  try {
    info = await server.start(DEFAULT_APP_PORT);
  } catch (e) {
    info = await server.start(0);   /* المنفذ مشغول؟ منفذ عشوائي آمن */
  }

  /* اسم وقائمة بسيطة بالعربية */
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'التطبيق',
      submenu: [
        { label: 'إعادة التحميل', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
        { label: 'تكبير', accelerator: 'CmdOrCtrl+=', click: () => win && win.webContents.setZoomLevel((win.webContents.getZoomLevel() || 0) + 0.5) },
        { label: 'تصغير', accelerator: 'CmdOrCtrl+-', click: () => win && win.webContents.setZoomLevel((win.webContents.getZoomLevel() || 0) - 0.5) },
        { type: 'separator' },
        { label: 'خروج', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { role: 'zoomIn', label: 'تكبير' },
        { role: 'zoomOut', label: 'تصغير' },
        { role: 'resetZoom', label: 'حجم عادي' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'ملء الشاشة' }
      ]
    }
  ]));

  createWindow();

  app.on('activate', () => {
    /* نافذة واحدة بس — نرجّع الموجود بدل إنشاء واحدة جديدة */
    if (!focusWindow() && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopLinkWatch();
  server.stop().finally(() => app.quit());
});

app.on('before-quit', () => {
  server.stop().catch(() => {});
});
