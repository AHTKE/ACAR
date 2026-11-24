/* ============================================================
   desktop/sync.js — مزامنة نسخة البيانات مع Google Drive محليًا
   ------------------------------------------------------------
   قبل كده كانت مسارات /api/sync/* بتتحوّل للموقع، والموقع بيرفضها
   لأن مفيش جلسة موقع جوه التطبيق (401) — فالمزامنة وتنبيه البريد
   ما كانوش بيشتغلوا في نسخة الديسكتوب.

   الملف ده بينفّذ نفس مسارات الموقع لكن بتوكن Google المحلي:
     GET  /api/sync/pull      → أحدث نسخة من الدرايف
     POST /api/sync/push      → رفع النسخة + تنبيه بريدي اختياري
     GET  /api/sync/versions  → النسخ المؤرشفة
     GET  /api/sync/version   → نسخة محددة
     GET/POST /api/sync/folder → فولدر المزامنة

   بيستخدم نفس اسم الفولدر واسم الملف بتاع الموقع، فالنسختين
   (الويب والديسكتوب) بيقروا ويكتبوا في نفس المكان على الدرايف.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SYNC_FOLDER_NAME = 'نظام الإدارة — المزامنة';
const SYNC_FILE_NAME = 'sync-latest.json';
const MAX_SYNC_BYTES = 8 * 1024 * 1024;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* عدد السجلات — لحماية الرفع الفاضي فوق نسخة فيها بيانات */
function snapshotRecords(snap) {
  if (!snap || !snap.sections || typeof snap.sections !== 'object') return 0;
  let total = 0;
  Object.keys(snap.sections).forEach(function (k) {
    const v = snap.sections[k];
    try {
      const p = typeof v === 'string' ? JSON.parse(v) : v;
      if (Array.isArray(p)) total += p.length;
      else if (p && typeof p === 'object') total += 1;
    } catch (e) { /* قيمة تالفة */ }
  });
  return total;
}

/* عدد سجلات قسم واحد (مصفوفة = طولها، كائن = عدد مفاتيحه) */
function sectionRecords(v) {
  try {
    const p = typeof v === 'string' ? JSON.parse(v) : v;
    if (Array.isArray(p)) return p.length;
    if (p && typeof p === 'object') return Object.keys(p).length;
    return 0;
  } catch (e) { return 0; }
}

/* ---- صفر فقدان: أي قسم موجود على الدرايف وضاع/بقى فاضي في نسخة
   الجهاز بنحتفظ بالقديم — السحابة هي نقطة الرجوع بعد إعادة التثبيت. */
function mergeSectionsKeepExisting(existingSnap, incoming) {
  const kept = [];
  const sections = Object.assign({}, (incoming && incoming.sections) || {});
  const ex = (existingSnap && existingSnap.sections && typeof existingSnap.sections === 'object')
    ? existingSnap.sections : null;
  if (!ex) return { sections: sections, kept: kept };
  Object.keys(ex).forEach(function (k) {
    const oldRaw = ex[k];
    if (sectionRecords(oldRaw) <= 0) return;
    const newRaw = sections[k];
    if (newRaw === undefined || sectionRecords(newRaw) <= 0) {
      sections[k] = oldRaw;
      kept.push(k);
    }
  });
  return { sections: sections, kept: kept };
}

function versionName(d) {
  return 'نسخة ' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes()) + '.' + pad2(d.getSeconds()) + '.json';
}

function driveError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || '';
  return e;
}

module.exports = function createSync(deps) {
  const json = deps.json;
  const readBody = deps.readBody;
  const getToken = deps.accessToken;
  const readAuth = deps.readAuth || function () { return {}; };
  const SETTINGS = path.join(deps.dataDir, 'google-sync.json');

  function readSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) || {}; } catch (e) { return {}; }
  }
  function writeSettings(s) {
    try {
      fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
      fs.writeFileSync(SETTINGS, JSON.stringify(s || {}));
    } catch (e) { /* الإعدادات اختيارية */ }
  }

  async function drive(url, opts) {
    const at = await getToken();
    const headers = Object.assign({ Authorization: 'Bearer ' + at }, (opts && opts.headers) || {});
    const r = await fetch(url, Object.assign({}, opts, { headers: headers }));
    let j = null;
    if (opts && opts.raw) return { r: r, j: null };
    try { j = await r.json(); } catch (e) { j = null; }
    return { r: r, j: j };
  }

  function sendAuthError(res, e) {
    if (e && e.needsConnect) {
      json(res, 401, { ok: false, needsConnect: true, loginUrl: '/api/google/login', error: 'لم يتم ربط حساب Google' });
      return true;
    }
    if (e && e.reauth) {
      json(res, 401, { ok: false, reauth: true, loginUrl: '/api/google/login', error: (e.message || 'الربط غير صالح — أعد الربط') });
      return true;
    }
    return false;
  }

  /* ---------- الفولدر ---------- */
  async function folderInfo(id) {
    const { r, j } = await drive(DRIVE_FILES + '/' + encodeURIComponent(id) +
      '?fields=id,name,capabilities(canEdit)&supportsAllDrives=true');
    if (!r.ok || !j || !j.id) return { ok: false, status: r.status };
    return { ok: true, id: j.id, name: j.name || '', canEdit: !(j.capabilities && j.capabilities.canEdit === false) };
  }

  async function findFolderByName(name) {
    const q = "name='" + name.replace(/'/g, "\\'") + "' and mimeType='" + FOLDER_MIME + "' and trashed=false";
    const { r, j } = await drive(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,capabilities(canEdit))&pageSize=10&supportsAllDrives=true');
    if (!r.ok) throw driveError(502, 'تعذّر قراءة فولدر المزامنة من Google Drive');
    const files = (j && j.files) || [];
    return files.length ? files[0] : null;
  }

  async function createFolder(name) {
    const { r, j } = await drive(DRIVE_FILES + '?fields=id,name,capabilities(canEdit)&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: name, mimeType: FOLDER_MIME })
    });
    if (!r.ok || !j || !j.id) {
      const msg = (j && j.error && j.error.message) || 'تعذّر إنشاء فولدر المزامنة';
      throw driveError(502, msg);
    }
    return { id: j.id, name: j.name || name, canEdit: true };
  }

  /* بترجّع فولدر جاهز للقراءة/الكتابة، أو null لو مش موجود ومش مطلوب إنشاؤه */
  async function ensureFolder(create) {
    const s = readSettings();

    if (s.customFolder) {
      const info = await folderInfo(s.customFolder);
      if (!info.ok) {
        throw driveError(info.status === 404 ? 404 : 403,
          info.status === 404
            ? 'الفولدر المشترك غير موجود أو اتحذف — راجع الرابط في إعدادات المزامنة'
            : 'تعذّر الوصول للفولدر المشترك — تأكد إن حسابك عنده صلاحية عليه',
          'PERM');
      }
      if (!info.canEdit) {
        throw driveError(403, 'الفولدر المشترك للقراءة فقط — لازم صلاحية تعديل عشان المزامنة ترفع عليه', 'PERM');
      }
      return { id: info.id, name: info.name, custom: true };
    }

    if (s.folderId) {
      const info = await folderInfo(s.folderId);
      if (info.ok) {
        if (!info.canEdit && create) {
          throw driveError(403, 'فولدر المزامنة للقراءة فقط — لازم صلاحية تعديل', 'PERM');
        }
        return { id: info.id, name: info.name, custom: false };
      }
      /* اتحذف أو اتغيّرت الصلاحيات — ندوّر عليه بالاسم */
    }

    const found = await findFolderByName(SYNC_FOLDER_NAME);
    if (found && found.id) {
      const canEdit = !(found.capabilities && found.capabilities.canEdit === false);
      if (!canEdit && create) {
        throw driveError(403, 'فولدر «' + SYNC_FOLDER_NAME + '» للقراءة فقط — لازم صلاحية تعديل', 'PERM');
      }
      const next = readSettings();
      next.folderId = found.id;
      writeSettings(next);
      return { id: found.id, name: found.name || SYNC_FOLDER_NAME, custom: false };
    }

    if (!create) return null;

    const made = await createFolder(SYNC_FOLDER_NAME);
    const next = readSettings();
    next.folderId = made.id;
    writeSettings(next);
    return { id: made.id, name: made.name, custom: false };
  }

  /* ---------- ملف النسخة ---------- */
  async function findSyncFile(folderId) {
    const q = "name='" + SYNC_FILE_NAME + "' and '" + folderId + "' in parents and trashed=false";
    const { r, j } = await drive(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,modifiedTime,size,capabilities(canEdit))&pageSize=10&supportsAllDrives=true');
    if (!r.ok) throw driveError(502, 'تعذّر قراءة ملف المزامنة من Google Drive');
    const files = (j && j.files) || [];
    if (!files.length) return null;
    const editable = files.filter(function (f) {
      return !f.capabilities || f.capabilities.canEdit !== false;
    })[0];
    return editable || files[0];
  }

  function multipart(meta, text) {
    const boundary = '-------gsync' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const head = Buffer.from(
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n', 'utf8');
    const tail = Buffer.from('\r\n--' + boundary + '--', 'utf8');
    return {
      boundary: boundary,
      body: Buffer.concat([head, Buffer.from(text, 'utf8'), tail])
    };
  }

  async function pushFile(folderId, text) {
    const existing = await findSyncFile(folderId);
    const editable = !!existing && (!existing.capabilities || existing.capabilities.canEdit !== false);

    if (editable) {
      const { r, j } = await drive(DRIVE_UPLOAD + '/' + encodeURIComponent(existing.id) +
        '?uploadType=media&fields=id,name,modifiedTime,size&supportsAllDrives=true', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: text
      });
      if (r.ok && j && j.id) return j;
    }

    const mp = multipart({ name: SYNC_FILE_NAME, parents: [folderId], mimeType: 'application/json; charset=UTF-8' }, text);
    const { r, j } = await drive(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name,modifiedTime,size&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + mp.boundary },
      body: mp.body
    });
    if (!r.ok || !j || !j.id) {
      const msg = (j && j.error && j.error.message) || 'فشل رفع نسخة المزامنة';
      throw driveError(502, msg);
    }
    return j;
  }

  async function archive(folderId, text) {
    try {
      const mp = multipart({ name: versionName(new Date()), parents: [folderId], mimeType: 'application/json; charset=UTF-8' }, text);
      const { r } = await drive(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name&supportsAllDrives=true', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + mp.boundary },
        body: mp.body
      });
      return !!r.ok;
    } catch (e) { return false; }
  }

  async function listFiles(folderId) {
    const q = "'" + folderId + "' in parents and trashed=false";
    const { r, j } = await drive(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,modifiedTime,size)&pageSize=1000&supportsAllDrives=true');
    if (!r.ok) throw driveError(502, 'تعذّر قراءة نسخ المزامنة');
    return (j && j.files) || [];
  }

  async function download(id) {
    const at = await getToken();
    const r = await fetch(DRIVE_FILES + '/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + at } });
    if (!r.ok) throw driveError(502, 'تعذّر تحميل النسخة من Google Drive');
    return await r.text();
  }

  /* ---------- تنبيه البريد ---------- */
  async function sendMail(to, subject, text) {
    const at = await getToken();
    const body = Buffer.from(text, 'utf8').toString('base64');
    const subj = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
    const mime = [
      'To: ' + to,
      'Subject: ' + subj,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      body
    ].join('\r\n');
    const raw = Buffer.from(mime, 'utf8').toString('base64url');
    const r = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ raw: raw })
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error((j.error && j.error.message) || 'فشل إرسال البريد');
    return j.id || '';
  }

  function folderIdFrom(input) {
    const v = String(input || '').trim();
    if (!v) return '';
    let m = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    m = v.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{10,}$/.test(v)) return v;
    return '';
  }

  async function handle(req, res, pathname) {
    if (pathname.indexOf('/api/sync/') !== 0) return false;
    const method = req.method;

    try {
      if (pathname === '/api/sync/pull' && method === 'GET') {
        let folder = null;
        try { folder = await ensureFolder(false); }
        catch (e) {
          if (sendAuthError(res, e)) return true;
          json(res, e.status || 502, { ok: false, code: e.code || '', error: e.message });
          return true;
        }
        if (!folder) { json(res, 200, { ok: true, exists: false }); return true; }

        const file = await findSyncFile(folder.id);
        if (!file) { json(res, 200, { ok: true, exists: false, folderId: folder.id }); return true; }

        let snapshot = null;
        try { snapshot = JSON.parse(await download(file.id)); } catch (e) { snapshot = null; }
        json(res, 200, {
          ok: true, exists: true, folderId: folder.id,
          id: file.id, name: file.name || SYNC_FILE_NAME,
          modifiedTime: file.modifiedTime || '', size: Number(file.size || 0),
          updatedAt: (snapshot && snapshot.updatedAt) || '',
          device: (snapshot && snapshot.device) || '',
          snapshot: snapshot
        });
        return true;
      }

      if (pathname === '/api/sync/push' && method === 'POST') {
        const raw = await readBody(req, 12 * 1024 * 1024);
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
        const snapshot = body && body.snapshot;
        if (!snapshot || typeof snapshot !== 'object' || !snapshot.sections) {
          json(res, 400, { ok: false, error: 'بيانات النسخة ناقصة' });
          return true;
        }

        let text = JSON.stringify(snapshot);
        if (Buffer.byteLength(text, 'utf8') > MAX_SYNC_BYTES) {
          json(res, 413, { ok: false, error: 'حجم النسخة أكبر من الحد المسموح (٨ ميجابايت)' });
          return true;
        }

        let folder = null;
        try { folder = await ensureFolder(true); }
        catch (e) {
          if (sendAuthError(res, e)) return true;
          json(res, e.status || 502, { ok: false, code: e.code || '', error: e.message });
          return true;
        }

        /* ---- نقرا الحالة الحالية قبل الكتابة فوقها ---- */
        let existingSnap = null, existingText = '';
        try {
          const cur = await findSyncFile(folder.id);
          if (cur && cur.id && Number(cur.size || 0) > 0) {
            existingText = await download(cur.id);
            try { existingSnap = JSON.parse(existingText); } catch (e) { existingSnap = null; }
          }
        } catch (e) { existingSnap = null; existingText = ''; }

        const incomingRecords = snapshotRecords(snapshot);
        const existingRecords = snapshotRecords(existingSnap);
        if (!(body && body.force) && incomingRecords === 0 && existingRecords > 0) {
          json(res, 409, { ok: false, code: 'EMPTY_OVERWRITE',
            error: 'الرفع اتمنع: نسخة الجهاز فاضية (٠ سجل) والنسخة اللي على الدرايف فيها ' +
              existingRecords + ' سجل — ممنوع نمسح بياناتك بالغلط.' });
          return true;
        }

        /* صفر فقدان (٢): ما نمسحش قسم من السحابة لأنه ناقص على الجهاز */
        let kept = [];
        if (!(body && body.force) && existingSnap && existingSnap.sections) {
          const merged = mergeSectionsKeepExisting(existingSnap, snapshot);
          kept = merged.kept;
          if (kept.length) {
            snapshot.sections = merged.sections;
            text = JSON.stringify(snapshot);
            if (Buffer.byteLength(text, 'utf8') > MAX_SYNC_BYTES) {
              json(res, 413, { ok: false, error: 'حجم النسخة أكبر من الحد المسموح (٨ ميجابايت)' });
              return true;
            }
          }
        }

        /* النسخة القديمة تتحفظ كأرشيف قبل الكتابة فوقها */
        let archived = false;
        if (existingText && existingSnap && existingSnap.sections) {
          archived = await archive(folder.id, existingText);
        }

        let info = null;
        try { info = await pushFile(folder.id, text); }
        catch (e) {
          if (sendAuthError(res, e)) return true;
          json(res, e.status || 502, { ok: false, code: e.code || '', error: e.message });
          return true;
        }

        if (!archived) archived = await archive(folder.id, text);

        /* التنبيه اختياري — إخفاقه ما يفشلش الرفع */
        let emailed = false, emailedTo = '';
        const wantMail = !!body.sendEmail;
        const to = String((body.to || '') || (readAuth().email || '')).trim();
        if (wantMail && to) {
          const changes = Array.isArray(body.changes) ? body.changes : [];
          const txt = 'تم رفع نسخة جديدة من بيانات التطبيق إلى فولدر «' + SYNC_FOLDER_NAME + '» على Google Drive.\n\n' +
            'الوقت: ' + (info.modifiedTime || new Date().toISOString()) + '\n' +
            'الجهاز: ' + (snapshot.device || 'غير معروف') + '\n\n' +
            'التعديلات:\n' +
            (changes.length ? changes.map(function (c) { return '• ' + c; }).join('\n') : '• لا توجد تغييرات مسجّلة') +
            '\n\nلو حبيت ترجع لنسخة أقدم، افتح فولدر المزامنة على Drive واختار النسخة.';
          try { await sendMail(to, 'تم تحديث بيانات التطبيق', txt); emailed = true; emailedTo = to; }
          catch (e) { /* البريد اختياري */ }
        }

        json(res, 200, {
          ok: true, folderId: folder.id, id: info.id || '', name: info.name || SYNC_FILE_NAME,
          modifiedTime: info.modifiedTime || '', size: Number(info.size || 0),
          merged: kept.length, kept: kept,
          archived: archived, emailed: emailed, emailedTo: emailedTo
        });
        return true;
      }

      if (pathname === '/api/sync/versions' && method === 'GET') {
        let folder = null;
        try { folder = await ensureFolder(false); }
        catch (e) {
          if (sendAuthError(res, e)) return true;
          json(res, e.status || 502, { ok: false, code: e.code || '', error: e.message });
          return true;
        }
        if (!folder) { json(res, 200, { ok: true, versions: [] }); return true; }

        const files = await listFiles(folder.id);
        const versions = files
          .filter(function (f) { return f.name !== SYNC_FILE_NAME; })
          .sort(function (a, b) { return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')); })
          .slice(0, 50)
          .map(function (f) {
            return { id: f.id, name: f.name, modifiedTime: f.modifiedTime || '', size: Number(f.size || 0) };
          });
        json(res, 200, { ok: true, versions: versions, folderId: folder.id });
        return true;
      }

      if (pathname === '/api/sync/version' && method === 'GET') {
        const id = String((new URL(req.url, 'http://localhost')).searchParams.get('id') || '').trim();
        if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
          json(res, 400, { ok: false, error: 'معرّف النسخة غير صالح' });
          return true;
        }
        let snapshot = null;
        try { snapshot = JSON.parse(await download(id)); }
        catch (e) { json(res, 502, { ok: false, error: 'تعذّر قراءة النسخة المطلوبة' }); return true; }
        json(res, 200, { ok: true, id: id, snapshot: snapshot });
        return true;
      }

      if (pathname === '/api/sync/folder' && method === 'GET') {
        const s = readSettings();
        json(res, 200, {
          ok: true,
          customFolder: s.customFolderRaw || s.customFolder || '',
          autoFolder: s.folderId || ''
        });
        return true;
      }

      if (pathname === '/api/sync/folder' && method === 'POST') {
        const raw = await readBody(req, 64 * 1024);
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
        const input = String((body && body.folderId) || '').trim();
        const s = readSettings();
        if (!input) {
          delete s.customFolder;
          delete s.customFolderRaw;
          writeSettings(s);
          json(res, 200, { ok: true, folderId: '' });
          return true;
        }
        const id = folderIdFrom(input);
        if (!id) {
          json(res, 400, { ok: false, error: 'رابط الفولدر غير صالح — تأكد إنه رابط Google Drive صحيح' });
          return true;
        }
        const info = await folderInfo(id);
        if (!info.ok) {
          json(res, 400, { ok: false, error: 'الفولدر غير موجود أو الحساب مش عنده صلاحية عليه' });
          return true;
        }
        s.customFolder = id;
        s.customFolderRaw = input;
        writeSettings(s);
        json(res, 200, { ok: true, folderId: id });
        return true;
      }
    } catch (e) {
      if (sendAuthError(res, e)) return true;
      json(res, e.status || 502, { ok: false, code: e.code || '', error: (e && e.message) || 'فشلت عملية المزامنة' });
      return true;
    }

    return false;
  }

  return { handle: handle };
};
