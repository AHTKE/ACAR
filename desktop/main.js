/* ============================================================
   desktop/main.js — نقطة تشغيل النسخة المكتبية (Electron)
   يشغّل الخادم المحلي (SQLite) على 127.0.0.1 ثم يفتح النافذة.
   التشغيل: npx electron .     من داخل مجلد desktop/
   ============================================================ */
'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const server = require('./server');

let win = null;
let info = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0a0e15',
    title: 'نظام الإدارة المتكامل',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.loadURL('http://127.0.0.1:' + info.port + '/');

  /* كل رابط خارجي يفتح في المتصفح الافتراضي مش داخل التطبيق */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!/^https?:\/\/127\.0\.0\.1:/i.test(url)) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

app.whenReady().then(async () => {
  info = await server.start(0);   /* 0 = منفذ عشوائي آمن */

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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  server.stop().finally(() => app.quit());
});

app.on('before-quit', () => {
  server.stop().catch(() => {});
});
