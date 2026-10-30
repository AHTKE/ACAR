/* worker.js: رفع الملف — إنشاء/إصلاح فولدر التصدير تلقائياً قبل الرفع */
const fs = require('fs');
const F = 'worker.js';
let src = fs.readFileSync(F, 'utf8');

const startMark = "    const boundary = '-------gdrive'";
const endMark = '    if (!res.ok || !info.id) {\n      return json({ ok: false, error: (info.error && info.error.message) || ';

const a = src.indexOf(startMark);
if (a === -1) throw new Error('start mark not found');
if (src.indexOf(startMark, a + 1) !== -1) throw new Error('start mark not unique');
const b = src.indexOf(endMark, a);
if (b === -1) throw new Error('end mark not found');

const replacement = `    const boundary = '-------gdrive' + crypto.randomUUID().replace(/-/g, '');
    const headFor = (m) => '--' + boundary + '\\r\\n' +
      'Content-Type: application/json; charset=UTF-8\\r\\n\\r\\n' + m + '\\r\\n' +
      '--' + boundary + '\\r\\n' +
      'Content-Type: ' + mime + '\\r\\n\\r\\n';
    const tail = '\\r\\n--' + boundary + '--';
    const metaOf = (p) => JSON.stringify(p
      ? { name: String(name), mimeType: mime, parents: [p] }
      : { name: String(name), mimeType: mime });
    const drivePost = async (m) => {
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + at,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: new Blob([headFor(m), bytes, tail], { type: 'multipart/related; boundary=' + boundary })
      });
      const j = await r.json().catch(() => ({}));
      return { r: r, j: j };
    };

    let res;
    let info;
    let inFolder = true;
    try {
      const first = await drivePost(metaOf(parentId));
      res = first.r;
      info = first.j;
    } catch (e) {
      return json({ ok: false, error: 'تعذّر الوصول إلى Google Drive' }, 502);
    }

    /* الفولدر مش موجود أو بدون صلاحية → نمسح الكاش ونبحث/نعمله من جديد ونعيد الرفع فيه */
    if ((!res.ok || !info.id) && parentId && isFolderError(info, res.status)) {
      try {
        await settingSet(env.DB, 'export_folder_id', '');
        const fresh = await getOrCreateExportFolder(env, at, true);
        if (fresh && fresh !== parentId) {
          parentId = fresh;
          const again = await drivePost(metaOf(parentId));
          res = again.r;
          info = again.j;
          inFolder = !!(res.ok && info.id);
        }
      } catch (e) { /* نكمل الفحص تحت */ }
    }

    /* لسه مرفوض → نرفع الملف للحساب نفسه ونرجّع رابطه بدل ما نرمي خطأ */
    if ((!res.ok || !info.id) && parentId && isFolderError(info, res.status)) {
      try {
        const again = await drivePost(metaOf(''));
        res = again.r;
        info = again.j;
        inFolder = false;
      } catch (e) { /* يبقى الخطأ الأصلي تحت */ }
    }

`;

src = src.slice(0, a) + replacement + src.slice(b);
fs.writeFileSync(F, src);
console.log('upload block replaced OK');
